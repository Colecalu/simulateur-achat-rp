/**
 * Sélection objective des fenêtres historiques — OUTIL HORS LIGNE.
 *
 * Ce script ne part JAMAIS en production. Il sert une seule fois : choisir les
 * trois périodes qui seront ensuite codées en dur dans `frontend/js/scenarios.js`.
 * Le simulateur ne recalcule rien de tout cela — les trois fenêtres sont fixes et
 * identiques pour tous les utilisateurs.
 *
 *   node outils/fenetres-historiques.mjs
 *   node outils/fenetres-historiques.mjs --robustesse
 *
 * MÉTHODE
 *   1. toutes les fenêtres glissantes de 20 ans que les données permettent ;
 *   2. le moteur tourne sur chacune avec un profil type, horizon 25 ans ;
 *   3. les années 21 à 25 sont prolongées au rendement ANNUALISÉ GÉOMÉTRIQUE de
 *      la fenêtre — pas la moyenne arithmétique, qui surestime toujours ;
 *   4. on retient la plus favorable à l'achat, la médiane, et la plus favorable
 *      à la location, au critère de l'écart de patrimoine net à 25 ans.
 */
import calc from '../frontend/js/calc.js';

const { simuler } = calc;

/* ===================================================================== DONNÉES
 *
 * Chaque série porte son année de départ, sa source et son statut. Le statut
 * `PROVISOIRE` interdit toute conclusion : le script refuse de nommer des
 * fenêtres tant qu'une série provisoire est utilisée.
 */

const DONNEES = {
  rendementBourse: {
    depart: 1991,
    source: 'MSCI World — À CONSOLIDER',
    statut: 'PROVISOIRE',
    note:
      'Les années 1991-2011 sont celles actuellement dans scenarios.js, dont le ' +
      'diagnostic a établi qu’elles sont en USD et non en EUR. Elles ne servent ' +
      'ici qu’à mesurer la STRUCTURE du problème (dispersion, robustesse), ' +
      'jamais à choisir une période.',
    valeurs: [
      // 1991-2011 — PROVISOIRE, valeurs USD à remplacer par du MSCI World EUR Net
      0.183, -0.052, 0.225, 0.051, 0.207, 0.135, 0.158, 0.243, 0.253, -0.132,
      -0.165, -0.199, 0.331, 0.147, 0.095, 0.207, 0.09, -0.403, 0.3, 0.118, -0.055,
      // 2012-2025 — MSCI World EUR Net, fiche officielle au 31/08/2026
      0.1405, 0.212, 0.195, 0.1042, 0.1073, 0.0751, -0.0411, 0.3002, 0.0633,
      0.3107, -0.1278, 0.196, 0.266, 0.0677,
    ],
  },

  revalBien: {
    depart: 1991,
    source: 'INSEE, indice Notaires-INSEE 010567059, France métropolitaine',
    statut: 'INCOMPLET',
    note: 'S’arrête en 2022 : il manque 2023, 2024 et 2025.',
    valeurs: [
      0.051, -0.023, -0.015, -0.001, -0.009, 0.008, 0.018, 0.012, 0.071, 0.087,
      0.079, 0.086, 0.119, 0.15, 0.155, 0.12, 0.065, 0.009, -0.071, 0.051, 0.059,
      -0.005, -0.021, -0.018, -0.019, 0.009, 0.03, 0.03, 0.033, 0.055, 0.067, 0.063,
    ],
  },

  revalLoyer: {
    depart: 1991,
    source: 'INSEE, IPC 04.1.1.0 « loyers effectivement payés », série 001763982',
    statut: 'INCOMPLET',
    note: 'S’arrête en 2022. Rupture de méthode en 2018 (le −0,8 % est un artefact).',
    valeurs: [
      0.054, 0.051, 0.033, 0.027, 0.026, 0.016, 0.017, 0.021, 0.014, -0.003, 0.008,
      0.03, 0.027, 0.034, 0.035, 0.032, 0.032, 0.017, 0.02, 0.013, 0.012, 0.017,
      0.013, 0.01, 0.005, 0.003, 0.002, -0.008, 0.011, 0.002, 0.008, 0.012,
    ],
  },

  revalCharges: {
    depart: 1991,
    source: 'INSEE, IPC ensemble, série 001759970, déc./déc.',
    statut: 'INCOMPLET',
    note: 'S’arrête en 2022. Sert aussi de substitut à la taxe foncière, faute de série dédiée.',
    valeurs: [
      0.03, 0.019, 0.021, 0.016, 0.021, 0.017, 0.011, 0.002, 0.013, 0.016, 0.014,
      0.023, 0.022, 0.021, 0.016, 0.015, 0.026, 0.01, 0.009, 0.018, 0.025, 0.013,
      0.007, 0.001, 0.002, 0.006, 0.012, 0.016, 0.015, -0.0002, 0.028, 0.059,
    ],
  },
};

/* ====================================================================== PROFIL
 *
 * Le profil ne sert qu'à CLASSER les fenêtres entre elles, pas à produire un
 * chiffre à afficher. Il doit donc être plausible et neutre, pas optimisé.
 *
 * Point qui allège l'enjeu : le capital initial et l'enveloppe mensuelle ne
 * changent pas l'écart entre les deux trajectoires, seulement les niveaux — un
 * test du moteur le verrouille. Le classement des fenêtres y est donc
 * insensible. Ce qui compte vraiment : le prix, l'apport, le taux, la durée, et
 * le rapport loyer / prix.
 */
const PROFIL_TYPE = {
  // Primo-accédant, France entière — pas Paris : l'indice immobilier utilisé est
  // national, le profil doit lui correspondre.
  prixNetVendeur: 250000,
  valeurEstimee: 250000,
  travaux: 0,
  fraisAgence: 0,
  fraisBancaires: 1500,
  typeBien: 'ancien',

  apport: 25000, // 10 % — ordre de grandeur courant pour un premier achat
  dureeAnnees: 20,
  tauxCredit: 0.035,
  tauxAssurance: 0.0015,

  chargesCopro: 1200,
  taxeFonciere: 1000,

  loyer: 900, // loyer d'un bien équivalent, France entière

  capitalInitial: 25000, // l'apport, rien de plus : l'acheteur part à zéro investi
  enveloppeMensuelle: 1800,

  fiscalitePlusValues: 0.314,
  horizon: 25,
};

/** Profils de contrôle, pour vérifier que le classement ne dépend pas du profil. */
const PROFILS_CONTROLE = {
  'type': PROFIL_TYPE,
  'apport fort': { ...PROFIL_TYPE, apport: 75000, capitalInitial: 75000 },
  'sans apport': { ...PROFIL_TYPE, apport: 0, capitalInitial: 0 },
  'taux élevé': { ...PROFIL_TYPE, tauxCredit: 0.055 },
  'loyer cher': { ...PROFIL_TYPE, loyer: 1200, enveloppeMensuelle: 2100 },
  'durée 25 ans': { ...PROFIL_TYPE, dureeAnnees: 25 },
  'Paris': {
    ...PROFIL_TYPE,
    prixNetVendeur: 450000, valeurEstimee: 450000, apport: 90000,
    capitalInitial: 90000, loyer: 1500, enveloppeMensuelle: 3000,
    chargesCopro: 1800, taxeFonciere: 1200,
  },
};

/* ==================================================================== OUTILLAGE */

const CLES = ['rendementBourse', 'revalBien', 'revalLoyer', 'revalCharges'];
const LONGUEUR = 20;
const HORIZON = 25;

/** Moyenne géométrique — la seule correcte pour enchaîner des rendements. */
function annualise(serie) {
  let produit = 1;
  for (const r of serie) produit *= 1 + r;
  return Math.pow(produit, 1 / serie.length) - 1;
}

/** Les années couvertes par TOUTES les séries à la fois. */
function couvertureCommune() {
  let debut = -Infinity;
  let fin = Infinity;
  for (const cle of CLES) {
    const d = DONNEES[cle];
    debut = Math.max(debut, d.depart);
    fin = Math.min(fin, d.depart + d.valeurs.length - 1);
  }
  return { debut, fin };
}

function serieFenetre(cle, depart) {
  const d = DONNEES[cle];
  const i = depart - d.depart;
  const brut = d.valeurs.slice(i, i + LONGUEUR);
  // Années 21 à 25 : prolongées au rendement annualisé géométrique de la fenêtre.
  const suite = annualise(brut);
  return brut.concat(Array(HORIZON - LONGUEUR).fill(suite));
}

function analyser(depart, profil) {
  const taux = {};
  for (const cle of CLES) taux[cle] = serieFenetre(cle, depart);
  taux.revalTaxeFonciere = taux.revalCharges; // pas de série dédiée
  const r = simuler({ ...profil, ...taux, horizon: HORIZON });
  return {
    depart,
    fin: depart + LONGUEUR - 1,
    ecart25: r.annees[HORIZON - 1].ecart,
    ecart20: r.annees[19].ecart,
    bourse: annualise(serieFenetre('rendementBourse', depart).slice(0, LONGUEUR)),
    immo: annualise(serieFenetre('revalBien', depart).slice(0, LONGUEUR)),
    loyer: annualise(serieFenetre('revalLoyer', depart).slice(0, LONGUEUR)),
  };
}

/* ====================================================================== SORTIE */

const euros = (n) =>
  ((n >= 0 ? '+' : '−') + Math.abs(Math.round(n)).toLocaleString('fr-FR') + ' €').padStart(13);
const pct = (n) => ((n >= 0 ? '+' : '−') + (Math.abs(n) * 100).toFixed(2) + ' %').padStart(8);

const { debut, fin } = couvertureCommune();
const departs = [];
for (let s = debut; s + LONGUEUR - 1 <= fin; s++) departs.push(s);

const provisoires = CLES.filter((c) => DONNEES[c].statut !== 'DÉFINITIF');

console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║  SÉLECTION DES FENÊTRES HISTORIQUES — OUTIL HORS LIGNE                    ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

console.log('Couverture commune aux quatre séries :', debut, '→', fin,
  `(${fin - debut + 1} ans)`);
console.log('Fenêtres de', LONGUEUR, 'ans disponibles :', departs.length,
  departs.length ? `(départs ${departs[0]} à ${departs[departs.length - 1]})` : '');
console.log();

if (provisoires.length) {
  console.log('⚠️  DONNÉES NON DÉFINITIVES — aucune période ne peut être retenue :');
  for (const c of provisoires) {
    console.log(`   · ${c} [${DONNEES[c].statut}] — ${DONNEES[c].note}`);
  }
  console.log();
  console.log('   Les chiffres ci-dessous mesurent la STRUCTURE du problème');
  console.log('   (dispersion, robustesse du classement), pas les périodes à retenir.');
  console.log();
}

if (!departs.length) {
  console.log('Aucune fenêtre complète : élargir la couverture commune.');
  process.exit(0);
}

const resultats = departs.map((d) => analyser(d, PROFIL_TYPE));

console.log('┌────────────┬───────────────┬───────────────┬──────────┬──────────┬──────────┐');
console.log('│  fenêtre   │  écart 25 ans │  écart 20 ans │ bourse/an│  immo/an │ loyer/an │');
console.log('├────────────┼───────────────┼───────────────┼──────────┼──────────┼──────────┤');
for (const r of resultats) {
  console.log(
    `│ ${r.depart}–${r.fin}  │ ${euros(r.ecart25)} │ ${euros(r.ecart20)} │ ${pct(r.bourse)} │ ${pct(r.immo)} │ ${pct(r.loyer)} │`
  );
}
console.log('└────────────┴───────────────┴───────────────┴──────────┴──────────┴──────────┘\n');

const tries = [...resultats].sort((a, b) => b.ecart25 - a.ecart25);
const mediane = tries[Math.floor(tries.length / 2)];
const etendue = tries[0].ecart25 - tries[tries.length - 1].ecart25;

console.log('Dispersion sur l’écart à 25 ans :', euros(etendue).trim(),
  `entre la plus haute et la plus basse (${resultats.length} fenêtres)`);
console.log();
console.log('Sélection au critère de l’écart à 25 ans :');
console.log('  la plus favorable à l’achat     :', tries[0].depart + '–' + tries[0].fin,
  euros(tries[0].ecart25));
console.log('  la médiane                      :', mediane.depart + '–' + mediane.fin,
  euros(mediane.ecart25));
console.log('  la plus favorable à la location :',
  tries[tries.length - 1].depart + '–' + tries[tries.length - 1].fin,
  euros(tries[tries.length - 1].ecart25));

/* ------------------------------------------------ Robustesse du classement */

if (process.argv.includes('--robustesse')) {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  LE CLASSEMENT DÉPEND-IL DU PROFIL ?                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  console.log('La sélection est faite une fois pour toutes avec UN profil, mais elle');
  console.log('s’appliquera à tous les utilisateurs. Si le classement changeait selon le');
  console.log('profil, le choix des trois périodes serait arbitraire.\n');

  const reference = [...resultats].sort((a, b) => b.ecart25 - a.ecart25).map((r) => r.depart);
  console.log('profil'.padEnd(16), '| meilleure | médiane | pire  | classement identique ?');
  console.log('-'.repeat(74));
  for (const [nom, profil] of Object.entries(PROFILS_CONTROLE)) {
    const rs = departs.map((d) => analyser(d, profil)).sort((a, b) => b.ecart25 - a.ecart25);
    const ordre = rs.map((r) => r.depart);
    const identique = JSON.stringify(ordre) === JSON.stringify(reference);
    const memeTrio =
      ordre[0] === reference[0] &&
      ordre[ordre.length - 1] === reference[reference.length - 1] &&
      ordre[Math.floor(ordre.length / 2)] === reference[Math.floor(reference.length / 2)];
    console.log(
      nom.padEnd(16), '|', String(ordre[0]).padStart(9), '|',
      String(ordre[Math.floor(ordre.length / 2)]).padStart(7), '|',
      String(ordre[ordre.length - 1]).padStart(5), '|',
      identique ? 'oui, à l’identique' : memeTrio ? 'trio identique, ordre interne différent' : 'NON'
    );
  }
}
