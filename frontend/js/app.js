/**
 * Liaison entre le formulaire, le moteur de calcul et l'affichage.
 * Aucune logique financière ici : elle vit entièrement dans calc.js.
 *
 * Script classique (pas de module ES) pour que la page fonctionne aussi
 * ouverte en file://. calc.js doit donc être chargé avant celui-ci.
 */
(function () {
  'use strict';

  const DEFAUTS = window.SimuRP.DEFAUTS;
  const simuler = window.SimuRP.simuler;
  const repartitionEnveloppe = window.SimuRP.repartitionEnveloppe;
  const repartitionAnnuelle = window.SimuRP.repartitionAnnuelle;
  const Sauvegarde = window.SimuRPSauvegarde;
  const SCENARIOS = window.SimuRPScenarios.SCENARIOS;
  const tauxEquivalent = window.SimuRPScenarios.tauxEquivalent;
  const scenarioParCle = window.SimuRPScenarios.parCle;
  const FAMILLES = window.SimuRPScenarios.FAMILLES;
  const scenariosParFamille = window.SimuRPScenarios.parFamille;
  const tauxAnnee = window.SimuRP.tauxAnnee;
  const fraisIrrecuperables = window.SimuRP.fraisIrrecuperables;
  const DEFAUTS_LOCATION = window.SimuRPLocation.DEFAUTS_LOCATION;
  const simulerMiseEnLocation = window.SimuRPLocation.simulerMiseEnLocation;
  const planchersEnveloppe = window.SimuRPLocation.planchersEnveloppe;
  // Mesure d'audience (js/mesure.js, plan dans docs/plan-de-marquage.md).
  // Repli muet : le simulateur ne dépend jamais d'elle.
  const Mesure = window.Mesure || { suivre() {}, suivreUneFois() {} };

/* ------------------------------------------------------------------ Outils */

const $ = (sel) => document.querySelector(sel);

/** Champs saisis en pourcentage à l'écran, stockés en fraction dans le modèle. */
const POURCENTAGES = new Set([
  'tauxCredit', 'tauxAssurance', 'revalBien', 'revalCharges',
  'revalTaxeFonciere', 'revalLoyer', 'rendementBourse', 'fiscalitePlusValues',
]);

const CHAMPS = Object.keys(DEFAUTS).filter((c) => c !== 'horizon');

/**
 * Valeurs PRÉ-REMPLIES à l'écran, pendant le développement (choisies par
 * Lucas pour travailler ; d'autres seront choisies pour la mise en ligne).
 *
 * Elles ne remplacent PAS `DEFAUTS` du moteur : ceux-ci sont le scénario
 * « Paris » du classeur Excel de référence, et la fixture les compare au
 * centime. Seul l'écran part d'ici ; le moteur, les tests et la sauvegarde
 * (`normaliser`) gardent leurs défauts.
 *
 * Décision de Lucas, 06/10/2026 : ce que seul l'utilisateur connaît part
 * VIDE (null) — sa situation, le prix, l'apport, le loyer. Le reste est
 * pré-rempli : bien ancien, sans frais d'agence ni travaux, 2 000 € de frais
 * bancaires, 20 ans à 3,5 % (assurance 0,15 %), taux de marché de la
 * tendance longue (DEFAUTS du moteur). Copropriété et taxe foncière partent
 * vides depuis le 08/10/2026 : l'annonce les donne, un défaut les inventait. Deux champs se proposent
 * d'eux-mêmes (voir LIAISONS) : la valeur estimée (prix + travaux) et le loyer
 * de comparaison (le loyer actuel).
 */
const VALEURS_DE_TRAVAIL = Object.assign({}, DEFAUTS, {
  capitalInitial: null,
  revenusFoyer: null, // facultatif
  prixNetVendeur: null,
  typeBien: 'ancien',
  fraisAgence: 0,
  travaux: 0,
  fraisBancaires: 2000,
  valeurEstimee: null, // suit prix + travaux
  apport: null,
  dureeAnnees: 20,
  tauxCredit: 0.035,
  tauxAssurance: 0.0015,
  // Pas de valeur supposée : ce sont des montants du bien, que l'annonce
  // indique. 0 est une vraie réponse (une maison sans copropriété).
  chargesCopro: null,
  taxeFonciere: null,
  loyer: null, // suit le loyer actuel
});

/**
 * La situation part vide, elle aussi. `Sauvegarde.DEFAUTS_PROFIL` reste celle
 * du moteur (loyer 1 600 €) : elle sert à relire les anciennes sauvegardes,
 * et les tests en dépendent.
 */
const PROFIL_DE_TRAVAIL = { loyerActuel: null, epargneActuelle: null };

/** Champs facultatifs : laissés vides à l'écran plutôt qu'affichés à zéro. */
const FACULTATIFS = new Set(['revenusFoyer']);

/**
 * La décomposition de l'effort, saisie dans le profil. Le moteur n'en voit que
 * la somme (`enveloppeMensuelle`) ; ces deux champs vivent donc dans le groupe
 * `profil` de la sauvegarde, pas dans celui du moteur.
 */
const CHAMPS_EFFORT = ['loyerActuel', 'epargneActuelle'];

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const eurosPrecis = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

const signe = (v) => (v >= 0 ? '+' : '−') + euros.format(Math.abs(v)).replace('-', '');

/** Lit une variable CSS pour que Chart.js suive le thème clair/sombre. */
const jeton = (nom) => getComputedStyle(document.body).getPropertyValue(nom).trim();

/**
 * La même couleur, atténuée sur le fond de page. Sert à distinguer ce qui est
 * projeté de ce qui est calculé sur données réelles, sans changer de teinte :
 * c'est la même série, pas une autre.
 */
function attenue(couleur, part) {
  const m = /^#([0-9a-f]{6})$/i.exec(couleur);
  if (!m) return couleur;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${part})`;
}

/* ------------------------------------------------------- Lecture du formulaire */

/**
 * Loyer actuel et épargne, tels que saisis. Un champ vidé vaut 0, pas le
 * défaut : ce sont des montants qui s'additionnent, et « rien » est une
 * réponse plausible (on n'épargne pas, on est hébergé gratuitement).
 */
function lireProfil() {
  const profil = {};
  for (const champ of CHAMPS_EFFORT) {
    const v = parseFloat(document.getElementById(champ).value);
    profil[champ] = Number.isFinite(v) ? Math.max(v, 0) : 0;
  }
  return profil;
}

function remplirProfil(profil) {
  for (const champ of CHAMPS_EFFORT) document.getElementById(champ).value = profil[champ] ?? '';
}

/* ---------------------------------------- Champs vides, champs automatiques */

/*
 * Un champ VIDE est « non renseigné » : jamais remplacé en silence par un
 * défaut du moteur. On ne valide pas une étape qui en contient, et le
 * résultat ne s'affiche pas tant qu'il en reste un, y compris vidé après
 * coup. `lireFormulaire` garde son repli sur DEFAUTS pour que le moteur
 * tourne toujours, mais rien de ce qu'il calcule alors n'est montré.
 */
const libelleDe = (el) =>
  el.closest('.champ')?.querySelector('.champ__libelle')?.textContent.trim() || el.id;

function champsVides(zone) {
  return [...zone.querySelectorAll('input[type="number"]')]
    .filter((el) => !FACULTATIFS.has(el.id) && el.value.trim() === '');
}

/** Signale les champs vides d'une étape et place le curseur sur le premier. */
function signalerVides(vides) {
  for (const el of vides) {
    el.setAttribute('aria-invalid', 'true');
    el.closest('.champ')?.classList.add('champ--manquant');
  }
  if (vides.length) {
    Mesure.suivre('sim_erreur', { type: 'champs_vides' });
    vides[0].focus();
  }
}

function oublierSignalement(el) {
  el.removeAttribute('aria-invalid');
  el.closest('.champ')?.classList.remove('champ--manquant');
}

/** Les zones du parcours : la situation, puis les quatre bulles. */
const zonesDuParcours = () => [$('#profilSaisie'), ...BULLES.map(bulle)];

/*
 * Deux champs se proposent d'eux-mêmes et restent modifiables : la valeur
 * estimée suit prix + travaux, le loyer de comparaison suit le loyer actuel.
 * Dès que l'utilisateur les touche, ils ne suivent plus — même mécanisme
 * (data-auto) que les loyers de la mise en location. Des additions et des
 * recopies, pas du calcul financier : comme l'effort (loyer + épargne).
 */
const nombreDe = (id) => parseFloat(document.getElementById(id).value);
const LIAISONS = [
  {
    cible: 'valeurEstimee',
    sources: ['prixNetVendeur', 'travaux'],
    valeur: () => {
      const prix = nombreDe('prixNetVendeur');
      const travaux = nombreDe('travaux');
      return Number.isFinite(prix) ? prix + (Number.isFinite(travaux) ? travaux : 0) : '';
    },
  },
  {
    cible: 'loyer',
    sources: ['loyerActuel'],
    valeur: () => (Number.isFinite(nombreDe('loyerActuel')) ? nombreDe('loyerActuel') : ''),
  },
];

function majLiaisons() {
  for (const l of LIAISONS) {
    const el = document.getElementById(l.cible);
    if (el.dataset.auto !== 'oui') continue;
    el.value = l.valeur();
    if (el.value !== '') oublierSignalement(el);
  }
}

/** Au départ et après relecture : un champ vide, ou égal à ce qu'il proposerait, reprend son suivi. */
function armerLiaisons() {
  for (const l of LIAISONS) {
    const el = document.getElementById(l.cible);
    if (el.value === '' || el.value === String(l.valeur())) el.dataset.auto = 'oui';
    else delete el.dataset.auto;
  }
  majLiaisons();
}

function initialiserLiaisons() {
  for (const l of LIAISONS) {
    for (const source of l.sources) {
      document.getElementById(source).addEventListener('input', majLiaisons);
    }
    document.getElementById(l.cible).addEventListener('input', (e) => {
      delete e.target.dataset.auto;
    });
  }
  // Un champ signalé vide cesse de l'être dès qu'on y tape quelque chose.
  document.addEventListener('input', (e) => {
    if (e.target.hasAttribute && e.target.hasAttribute('aria-invalid') && e.target.value !== '') {
      oublierSignalement(e.target);
    }
  });
}

function lireFormulaire() {
  const saisie = {};
  for (const champ of CHAMPS) {
    const el = document.getElementById(champ);
    if (!el) continue;
    if (el.type === 'checkbox') {
      saisie[champ] = el.checked;
      continue;
    }
    if (el.tagName === 'SELECT') {
      saisie[champ] = el.value;
      continue;
    }
    const brut = parseFloat(el.value);
    const valeur = Number.isFinite(brut) ? brut : DEFAUTS[champ];
    saisie[champ] = POURCENTAGES.has(champ) ? valeur / 100 : valeur;
  }
  saisie.horizon = 25; // on calcule toujours 25 ans, le curseur ne fait que lire

  // L'effort déclaré n'est pas saisi : il se compose. Addition et non calcul
  // financier, elle a sa place ici comme la conversion des pourcentages.
  const profil = lireProfil();
  saisie.enveloppeMensuelle = profil.loyerActuel + profil.epargneActuelle;

  // Un scénario actif remplace les taux du formulaire par ses SÉRIES. Les
  // champs de la bulle 4 n'affichent alors que le taux annuel équivalent :
  // c'est un résumé lisible, pas ce que le moteur calcule.
  if (scenarioActif) Object.assign(saisie, scenarioActif.taux);

  return saisie;
}

function remplirFormulaire(valeurs) {
  for (const champ of CHAMPS) {
    const el = document.getElementById(champ);
    if (!el) continue;
    const v = valeurs[champ];
    if (el.type === 'checkbox') { el.checked = v !== false; continue; }
    if (v === null || v === undefined) { el.value = ''; continue; } // non renseigné
    if (FACULTATIFS.has(champ) && !v) { el.value = ''; continue; }
    el.value = POURCENTAGES.has(champ) ? +(v * 100).toFixed(4) : v;
  }
}

/* ------------------------------------------- Formulaire « mise en location » */

/** Champs du palier 2 : id du champ → clé d'option, et conversion éventuelle. */
const CHAMPS_MEL_AVANCES = {
  melRegime: { cle: 'regime' },
  melTmi: { cle: 'tmi', pourcentage: true },
  melFraisAnnexes: { cle: 'fraisAnnexes' },
  melAchatMeubles: { cle: 'achatMeubles' },
  melTauxVacance: { cle: 'tauxVacance', pourcentage: true },
};

function remplirFormulaireMel() {
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    const el = document.getElementById(id);
    const v = DEFAUTS_LOCATION[def.cle];
    el.value = def.pourcentage ? +(v * 100).toFixed(4) : v;
  }
}

/**
 * Lit le module de mise en location.
 * @returns {object|null} les options, ou null tant que le palier 1 est incomplet
 */
function lireFormulaireMel() {
  const nombre = (id) => {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : null;
  };

  const anneeBascule = nombre('melAnneeBascule');
  const loyerPercu = nombre('melLoyerPercu');
  const loyerFutur = nombre('melLoyerFutur');
  if (anneeBascule === null || loyerPercu === null || loyerFutur === null) return null;

  const options = { anneeBascule, loyerPercu, loyerFutur };
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    const el = document.getElementById(id);
    if (el.tagName === 'SELECT') {
      options[def.cle] = el.value;
      continue;
    }
    const v = parseFloat(el.value);
    const valeur = Number.isFinite(v) ? v : DEFAUTS_LOCATION[def.cle] * (def.pourcentage ? 100 : 1);
    options[def.cle] = def.pourcentage ? valeur / 100 : valeur;
  }
  return options;
}

/* ------------------------------------------------------------------ Verdict */

function afficherVerdict(resultat, horizon) {
  const ligne = resultat.annees[horizon - 1];
  const ecart = ligne.ecart;

  const ans = `${horizon} an${horizon > 1 ? 's' : ''}`;
  $('#horizonLabel').textContent = ans;
  // Le rappel du curseur, dans la section dépliée, affiche la même date.
  $('#horizonBis').value = horizon;
  $('#horizonBisLabel').textContent = ans;
  $('#horizonMel').value = horizon;
  $('#horizonMelLabel').textContent = ans;

  const chiffre = $('#verdictChiffre');
  const mesure = $('#verdictMesure');

  // Plus de refus de trancher quand l'effort ne couvre pas l'achat : le moteur
  // ne laisse plus le dépassement impayé, il fait monter l'enveloppe des deux
  // côtés. L'écart est donc juste, et le supplément se lit dans le profil.
  // JAMAIS de signe négatif. Un écart négatif ne veut pas dire « moins de
  // patrimoine » dans l'absolu : il veut dire que c'est l'AUTRE trajectoire qui
  // gagne, et de ce montant-là. L'étiquette au-dessus nomme le gagnant, le
  // montant est donc toujours SON avance : « + 330 000 € ». Le signe moins,
  // lui, se lisait comme une perte.
  chiffre.className = 'verdict__chiffre ' +
    (ecart >= 0 ? 'verdict__chiffre--achat' : 'verdict__chiffre--location');

  // Sous ~1 % du patrimoine comparé, l'écart n'est pas un signal exploitable.
  const reference = Math.max(ligne.patrimoineTotalAchat, ligne.patrimoineTotalLocation);
  const gagnant = $('#verdictGagnant');
  if (Math.abs(ecart) < reference * 0.01) {
    gagnant.dataset.gagnant = 'egal';
    $('#verdictGagnantTexte').textContent = 'Les deux se valent';
    chiffre.textContent = euros.format(Math.abs(ecart));
    mesure.textContent = 'd\'écart : à cette échéance, les deux scénarios se valent.';
    mesure.hidden = false;
    return;
  }

  gagnant.dataset.gagnant = ecart >= 0 ? 'achat' : 'location';
  $('#verdictGagnantTexte').textContent = ecart >= 0
    ? 'Avantage à l\'achat'
    : 'Avantage à la location';
  chiffre.textContent = '+\u202f' + euros.format(Math.abs(ecart));
  // L'étiquette dit déjà qui gagne : la phrase « de patrimoine en plus en
  // achetant… » faisait doublon, une ligne de trop (décision de Lucas).
  mesure.hidden = true;
}

/* --------------------------------------------------------- Épargne forcée */

/* --------------------------------------------------------------- Graphiques */

let graphPatrimoine = null;
let graphMel = null;

/**
 * Bornes Y communes aux deux graphiques de patrimoine, pour que la
 * comparaison visuelle de l'un à l'autre soit honnête. On ne force pas le
 * zéro : cela écraserait les courbes sans rien apporter.
 */
function bornesCommunes(series) {
  const valeurs = series.flat().filter((v) => Number.isFinite(v));
  if (!valeurs.length) return {};
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const marge = (max - min) * 0.05 || 1000;
  const pas = 50000;
  return {
    min: Math.floor((min - marge) / pas) * pas,
    max: Math.ceil((max + marge) / pas) * pas,
  };
}

const infobulle = {
  backgroundColor: () => jeton('--surface'),
  borderColor: () => jeton('--trait'),
};

function optionsCommunes() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: infobulle.backgroundColor(),
        borderColor: jeton('--axe'),
        borderWidth: 1,
        titleColor: jeton('--encre'),
        bodyColor: jeton('--encre-2'),
        padding: 11,
        cornerRadius: 8,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
        callbacks: {
          title: (items) => `Année ${items[0].label}`,
          label: (ctx) => ` ${ctx.dataset.label} : ${euros.format(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: jeton('--axe') },
        ticks: { color: jeton('--encre-3'), maxRotation: 0, autoSkipPadding: 16 },
      },
      y: {
        grid: { color: jeton('--grille'), drawTicks: false },
        border: { display: false },
        ticks: {
          color: jeton('--encre-3'),
          padding: 8,
          callback: (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`),
        },
      },
    },
  };
}

/**
 * Matérialise le point mort sur le graphique de patrimoine : un trait vertical
 * à l'année où l'achat repasse devant la location.
 *
 * Greffon écrit à la main plutôt que chartjs-plugin-annotation : une seule
 * balise <script> de plus au CDN pour un trait de vingt lignes ne se justifie
 * pas, et chaque dépendance externe est un point de panne hors ligne.
 */
const traitPointMort = {
  id: 'traitPointMort',
  afterDatasetsDraw(chart) {
    const annee = chart.options.pointMort;
    // L'année 1 n'a pas besoin d'un trait : la courbe part déjà devant.
    if (!annee || annee <= 1) return;

    const x = chart.scales.x.getPixelForValue(annee - 1);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = jeton('--encre-3');
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = jeton('--encre-2');
    ctx.font = '600 11px ' + jeton('--police');
    ctx.textAlign = x > (chart.chartArea.left + chart.chartArea.right) / 2 ? 'right' : 'left';
    ctx.fillText('point mort', x + (ctx.textAlign === 'right' ? -6 : 6), top + 12);
    ctx.restore();
  },
};

function dessinerGraphiques(resultat, horizon, mel) {
  // Chart.js est hébergé sur le site (js/vendor/), mais son chargement peut
  // encore échouer (fichier bloqué, coupure en plein chargement). Les chiffres
  // et le tableau restent justes : on le dit au lieu de casser la page.
  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.graphique').forEach((zone) => {
      zone.innerHTML =
        '<p class="graphique__absent">Graphique indisponible : la librairie Chart.js ' +
        'n\'a pas pu être chargée. Rechargez la page pour réessayer. Les chiffres et le ' +
        'tableau ci-dessous restent exacts.</p>';
    });
    return;
  }

  const etiquettes = resultat.annees.map((a) => a.annee);
  const achat = resultat.annees.map((a) => a.patrimoineTotalAchat);
  const location = resultat.annees.map((a) => a.patrimoineTotalLocation);
  const ecart = resultat.annees.map((a) => a.ecart);

  const cAchat = jeton('--achat');
  const cLocation = jeton('--location');

  /*
   * Au-delà des années réellement observées, un scénario n'est plus une donnée
   * mais une projection au taux moyen. Elle doit se voir : trait de frontière,
   * puis courbes pointillées et atténuées. Sans quoi le graphique laisse croire
   * que vingt-cinq années sont documentées quand onze le sont.
   *
   * `iFrontiere` est l'INDICE du dernier point réel — les années vont de 1 à 25
   * sur l'indice 0 à 24, d'où le décalage d'un cran.
   *
   * Un scénario construit n'a AUCUNE année observée (`reel` à 0) : il n'y a
   * alors pas de frontière à tracer, puisqu'il n'y a rien à quitter. C'est
   * l'étiquette « Hypothèse » du groupe qui porte l'avertissement, pas un trait
   * au milieu de la courbe. D'où le plancher à 0, qui vaut « pas de frontière ».
   */
  const iFrontiere =
    scenarioActif && scenarioActif.reel < resultat.annees.length
      ? Math.max(0, scenarioActif.reel - 1)
      : 0;
  const projection = (couleur) => ({
    borderDash: (ctx) => (ctx.p0DataIndex >= iFrontiere ? [5, 4] : undefined),
    borderColor: (ctx) => (ctx.p0DataIndex >= iFrontiere ? attenue(couleur, 0.45) : undefined),
  });

  // Le point de l'horizon choisi est grossi : le curseur et le graphique
  // désignent la même date.
  const rayons = (i) => (i === horizon - 1 ? 6 : 0);

  const serie = (label, donnees, couleur) => ({
    label,
    data: donnees,
    borderColor: couleur,
    backgroundColor: couleur,
    segment: iFrontiere ? projection(couleur) : undefined,
    borderWidth: 2,
    pointRadius: (ctx) => rayons(ctx.dataIndex),
    pointHoverRadius: 6,
    pointBackgroundColor: couleur,
    pointBorderColor: jeton('--surface'),
    pointBorderWidth: 2,
    tension: 0.25,
  });

  const donneesLignes = {
    labels: etiquettes,
    datasets: [
      serie('Achat', achat, cAchat),
      serie('Location', location, cLocation),
    ],
  };

  // Échelle Y partagée entre le graphique 1 et le graphique « mise en
  // location » : sans elle, deux graphiques superposés à échelles différentes
  // suggèrent des écarts qui n'existent pas.
  const melPatrimoine = mel ? mel.annees.map((a) => a.patrimoineTotal) : null;
  const bornes = mel
    ? bornesCommunes([achat, location, melPatrimoine])
    : {};

  const optionsPatrimoine = optionsCommunes();
  Object.assign(optionsPatrimoine.scales.y, bornes);
  // Lus par les greffons `traitPointMort` et `traitFrontiere`.
  optionsPatrimoine.pointMort = resultat.premiereAnneeFavorable;
  optionsPatrimoine.frontiere = iFrontiere;

  if (graphPatrimoine) {
    graphPatrimoine.data = donneesLignes;
    graphPatrimoine.options = optionsPatrimoine;
    graphPatrimoine.update('none');
  } else {
    graphPatrimoine = new Chart($('#graphPatrimoine'), {
      type: 'line',
      data: donneesLignes,
      options: optionsPatrimoine,
      plugins: [traitPointMort, traitFrontiere],
    });
  }

  // Légende maison : l'identité des séries ne repose jamais sur la seule couleur.
  $('#legendePatrimoine').innerHTML = `
    <span class="legende__item"><span class="pastille pastille--achat"></span>Achat</span>
    <span class="legende__item"><span class="pastille pastille--location"></span>Location</span>
  `;
}

/* ------------------------------------------- D'où vient cet écart ? */

/*
 * Section dépliable sous le graphique principal. Elle explique le chiffre
 * affiché ; elle ne le concurrence pas — d'où le repli par défaut et des
 * graphiques plus courts.
 *
 * Les trois graphiques lisent le MÊME curseur d'horizon que le gros chiffre.
 * Aucun second curseur : deux réglages de temps à l'écran, c'est la garantie
 * qu'on finit par comparer deux dates différentes sans s'en apercevoir.
 */
let graphPossession = null;
let graphEnvAchat = null;
let graphEnvLocation = null;
let graphPerdu = null;
let graphAnnuelAchat = null;
let graphAnnuelLocation = null;

const pourcentEntier = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** « 6,8 % » — un taux annuel au dixième, virgule française comprise. */
const pourcentDixieme = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const detailOuvert = () => !$('#detailPanneau').hidden;

/** « sur 20 ans » — le libellé de période des titres cumulés. */
const periode = (n) => `sur ${n} an${n > 1 ? 's' : ''}`;

/**
 * Légende : pastille et nom, jamais de montant. Les graphiques qui la portent
 * sont partagés par deux trajectoires, où les mêmes postes valent deux choses
 * différentes. Les montants vivent dans les infobulles.
 *
 * Le libellé affiché est le nom COURT (`court`, un mot) : une légende à cinq
 * entrées de trois mots mange la place du graphique qu'elle explique. Le nom
 * complet reste dans l'infobulle, qui a la place de le porter.
 */
function legendeSimple(cible, postes) {
  $(cible).innerHTML = postes
    .map(
      (p) =>
        `<span class="legende__item"><span class="pastille pastille--${p.classe}"></span>` +
        `${p.court || p.nom}</span>`
    )
    .join('');
}

/**
 * Camembert d'une répartition. Trois à cinq parts au plus : au-delà, les
 * secteurs deviennent trop fins et un histogramme reprend l'avantage.
 *
 * L'infobulle est réglée sur la part SURVOLÉE et non sur l'ensemble : lire
 * quatre postes d'un coup quand on en pointe un seul est illisible.
 */
function camembert(existant, selecteur, parts) {
  const total = parts.reduce((t, x) => t + x.valeur, 0);
  const o = optionsCommunes();
  delete o.scales;
  o.cutout = '58%';
  o.interaction = { mode: 'nearest', intersect: true };
  o.plugins.tooltip.callbacks.title = (items) => items[0].label;
  o.plugins.tooltip.callbacks.label = (ctx) =>
    ` ${euros.format(ctx.parsed)} · ${pourcentEntier.format(total ? ctx.parsed / total : 0)}`;
  delete o.plugins.tooltip.callbacks.footer;

  return poser(existant, selecteur, 'doughnut', {
    labels: parts.map((x) => x.nom),
    datasets: [
      {
        data: parts.map((x) => x.valeur),
        backgroundColor: parts.map((x) => x.couleur),
        borderColor: jeton('--surface'),
        borderWidth: 2,
      },
    ],
  }, o);
}

/** Crée le graphique s'il n'existe pas, le met à jour sinon. */
function poser(graphique, selecteur, type, data, options, greffons) {
  if (graphique) {
    graphique.data = data;
    graphique.options = options;
    graphique.update('none');
    return graphique;
  }
  return new Chart($(selecteur), {
    type: type,
    data: data,
    options: options,
    plugins: greffons || [],
  });
}

/**
 * Trait vertical à la dernière année observée d'un scénario : au-delà, la
 * courbe n'est plus une donnée mais un prolongement au rythme moyen.
 */
const traitFrontiere = {
  id: 'traitFrontiere',
  afterDatasetsDraw(chart) {
    // Un INDICE de point, pas une année : les deux graphiques qui portent ce
    // trait n'ont pas la même origine (l'aperçu commence à l'année 0).
    const i = chart.options.frontiere;
    if (!i) return;
    const x = chart.scales.x.getPixelForValue(i);
    const { top, bottom, right } = chart.chartArea;
    const ctx = chart.ctx;

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = jeton('--encre-3');
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = jeton('--encre-3');
    ctx.font = '600 10px ' + jeton('--police');
    // Le libellé se place du côté où il reste de la place.
    const aDroite = right - x > 90;
    ctx.textAlign = aDroite ? 'left' : 'right';
    ctx.fillText('prolongement', x + (aDroite ? 5 : -5), top + 11);
    ctx.restore();
  },
};

/**
 * Vocabulaire des postes : un nom complet pour les infobulles, un nom court
 * pour les légendes. Défini une fois — deux graphiques qui montrent le même
 * poste doivent le nommer pareil.
 */
const POSTES = {
  credit: { nom: 'Intérêts et assurance', court: 'Intérêts', classe: 'credit' },
  capital: { nom: 'Capital remboursé', court: 'Capital', classe: 'capital' },
  possession: { nom: 'Taxe foncière et charges', court: 'Charges', classe: 'possession' },
  epargne: { nom: 'Épargne investie', court: 'Épargne', classe: 'epargne' },
  loyers: { nom: 'Loyers', court: 'Loyer', classe: 'location' },
  acquisition: { nom: "Frais d'acquisition", court: 'Acquisition', classe: 'acquisition' },
};

/** Un poste prêt à être dessiné : vocabulaire + couleur (+ montant). */
const poste = (cle, couleur, valeur) =>
  Object.assign({}, POSTES[cle], { couleur: couleur, valeur: valeur });

function dessinerDetail(resultat, horizon) {
  if (!detailOuvert() || typeof Chart === 'undefined') return;

  // --- Couleurs des postes ---------------------------------------------
  const cCredit = jeton('--poste-credit');
  const cCapital = jeton('--poste-capital');
  const cPossession = jeton('--poste-possession');
  const cEpargne = jeton('--poste-epargne');
  const cAcquisition = jeton('--poste-acquisition');
  const cLoyers = jeton('--location');

  // --- À quoi sert votre argent : deux camemberts cumulés ---------------
  const rep = repartitionEnveloppe(resultat, horizon);

  graphEnvAchat = camembert(graphEnvAchat, '#graphEnvAchat', [
    poste('credit', cCredit, rep.achat.credit),
    poste('capital', cCapital, rep.achat.capital),
    poste('possession', cPossession, rep.achat.possession),
    poste('epargne', cEpargne, rep.achat.epargne),
  ]);

  graphEnvLocation = camembert(graphEnvLocation, '#graphEnvLocation', [
    poste('loyers', cLoyers, rep.location.loyers),
    poste('epargne', cEpargne, rep.location.epargne),
  ]);

  $('#periodeVerse').textContent = periode(horizon);
  legendeSimple('#legendeEnveloppe', [
    poste('credit', cCredit),
    poste('capital', cCapital),
    poste('possession', cPossession),
    poste('loyers', cLoyers),
    poste('epargne', cEpargne),
  ]);

  // Les deux totaux sont égaux : c'est la prémisse du simulateur, et c'est ce
  // que la hauteur commune des barres disait avant.
  $('#totalEnvAchat').textContent = euros.format(rep.achat.total);
  $('#totalEnvLocation').textContent = euros.format(rep.location.total);

  // --- Frais irrécupérables --------------------------------------------
  const irr = fraisIrrecuperables(resultat, horizon);
  const partsPerdu = [
    poste('acquisition', cAcquisition, irr.achat.acquisition),
    poste('credit', cCredit, irr.achat.credit),
    poste('possession', cPossession, irr.achat.possession),
  ];
  graphPerdu = camembert(graphPerdu, '#graphPerdu', partsPerdu);
  $('#totalPerdu').textContent = euros.format(irr.achat.total);
  $('#periodePerdu').textContent = periode(horizon);
  legendeSimple('#legendePerdu', partsPerdu);

  // --- Année par année : deux piles par année, jamais cumulées ----------
  //
  // Ce graphique ignore volontairement le curseur : il montre toute la durée
  // simulée, comme la part possédée juste en dessous. Les deux se lisent donc
  // sur le même axe de temps.
  //
  const annuel = repartitionAnnuelle(resultat);

  const pile = (label, valeurs, couleur, arrondi) => ({
    label,
    data: valeurs,
    backgroundColor: couleur,
    borderColor: jeton('--surface'),
    borderWidth: { top: 1, right: 0, bottom: 0, left: 0 },
    borderSkipped: false,
    borderRadius: arrondi ? { topLeft: 3, topRight: 3 } : 0,
  });

  // Même plafond des deux côtés : à échelles différentes, deux histogrammes
  // côte à côte suggèrent des écarts qui n'existent pas. Le plafond est
  // l'enveloppe annuelle — sauf quand elle ne suffit pas et que l'achat la
  // dépasse, auquel cas on suit le dépassement.
  const hauteurMax = Math.max(
    ...annuel.map((l) => l.achat.credit + l.achat.capital + l.achat.possession + l.achat.epargne),
    ...annuel.map((l) => l.location.loyers + l.location.epargne)
  );

  const optionsAnnuelles = () => {
    const o = optionsCommunes();
    o.scales.x.stacked = true;
    o.scales.y.stacked = true;
    o.scales.y.beginAtZero = true;
    o.scales.y.max = Math.ceil(hauteurMax / 5000) * 5000;
    // Une part à la fois, pas toute la colonne.
    o.interaction = { mode: 'nearest', intersect: true };
    o.plugins.tooltip.callbacks.title = (items) => `Année ${items[0].label}`;
    o.plugins.tooltip.callbacks.label = (ctx) =>
      ` ${ctx.dataset.label} : ${euros.format(ctx.parsed.y)}`;
    return o;
  };

  const annees = annuel.map((l) => l.annee);

  graphAnnuelAchat = poser(graphAnnuelAchat, '#graphAnnuelAchat', 'bar', {
    labels: annees,
    datasets: [
      pile(POSTES.credit.nom, annuel.map((l) => l.achat.credit), cCredit, false),
      pile(POSTES.capital.nom, annuel.map((l) => l.achat.capital), cCapital, false),
      pile(POSTES.possession.nom, annuel.map((l) => l.achat.possession), cPossession, false),
      pile(POSTES.epargne.nom, annuel.map((l) => l.achat.epargne), cEpargne, true),
    ],
  }, optionsAnnuelles());

  graphAnnuelLocation = poser(graphAnnuelLocation, '#graphAnnuelLocation', 'bar', {
    labels: annees,
    datasets: [
      pile(POSTES.loyers.nom, annuel.map((l) => l.location.loyers), cLoyers, false),
      pile(POSTES.epargne.nom, annuel.map((l) => l.location.epargne), cEpargne, true),
    ],
  }, optionsAnnuelles());

  legendeSimple('#legendeAnnuel', [
    poste('credit', cCredit),
    poste('capital', cCapital),
    poste('possession', cPossession),
    poste('loyers', cLoyers),
    poste('epargne', cEpargne),
  ]);

  // --- Part du bien réellement possédée --------------------------------
  const cAchat = jeton('--achat');
  const optionsPossession = optionsCommunes();
  optionsPossession.scales.y.min = 0;
  optionsPossession.scales.y.max = 1;
  optionsPossession.scales.y.ticks.callback = (v) => pourcentEntier.format(v);
  optionsPossession.plugins.tooltip.callbacks.label = (ctx) =>
    ` Part possédée : ${pourcentEntier.format(ctx.parsed.y)}`;

  graphPossession = poser(graphPossession, '#graphPossession', 'line', {
    labels: resultat.annees.map((a) => a.annee),
    datasets: [
      {
        label: 'Part possédée',
        data: resultat.annees.map((a) => a.partPossedee),
        borderColor: cAchat,
        backgroundColor: `color-mix(in srgb, ${cAchat} 12%, transparent)`,
        borderWidth: 2,
        fill: true,
        tension: 0.25,
        pointRadius: (ctx) => (ctx.dataIndex === horizon - 1 ? 6 : 0),
        pointHoverRadius: 6,
        pointBackgroundColor: cAchat,
        pointBorderColor: jeton('--surface'),
        pointBorderWidth: 2,
      },
    ],
  }, optionsPossession);
}

function initialiserDetail() {
  const bouton = $('#detailOuvrir');
  const panneau = $('#detailPanneau');

  bouton.addEventListener('click', () => {
    const ouvrir = panneau.hidden;
    panneau.hidden = !ouvrir;
    bouton.setAttribute('aria-expanded', String(ouvrir));
    bouton.textContent = ouvrir ? 'Masquer le détail' : "D'où vient cet écart ?";
    if (!ouvrir) return;
    Mesure.suivre('sim_avance_ouvert', { bloc: 'detail_ecart' });

    // Un canevas dimensionné dans un conteneur masqué reste à zéro : on ne
    // crée les graphiques qu'une fois la zone visible, et on redimensionne
    // ceux qui existaient déjà.
    rafraichir();
    const tous = [graphPossession, graphEnvAchat, graphEnvLocation, graphPerdu,
                graphAnnuelAchat, graphAnnuelLocation];
    for (const g of tous) if (g) g.resize();
  });
}

/* ---------------------------------------------------- Scénarios de marché */

/*
 * Deuxième pilier du simulateur : appliquer des trajectoires de marché ANNÉE
 * PAR ANNÉE plutôt qu'un taux constant. Le filtre s'applique par-dessus les
 * quatre bulles — ce n'est pas une cinquième étape, il n'a donc ni numéro ni
 * place dans le parcours séquentiel.
 */

/** Les cinq taux qu'un scénario pilote. */
const TAUX_SCENARISES = [
  'rendementBourse',
  'revalBien',
  'revalLoyer',
  'revalCharges',
  'revalTaxeFonciere',
];

/** Scénario appliqué, ou null quand l'utilisateur garde ses hypothèses. */
let scenarioActif = null;
/** Les taux saisis à la main, mis de côté le temps qu'un scénario s'applique. */
let hypothesesUtilisateur = null;

/*
 * Le choix se fait en DEUX TEMPS.
 *
 * 1. La carte du rail est un simple appel. Elle ouvre une fenêtre qui explique
 *    ce qu'on cherche à faire — et rien d'autre : pas un seul nom de scénario.
 *    Sept noms de décennies ne veulent rien dire tant qu'on n'a pas dit ce
 *    qu'on en fait, ni prévenu que la seconde moitié des courbes est extrapolée.
 * 2. Une fois l'explication lue, la carte laisse place à la liste, qui reste
 *    en place. Chaque ligne porte son nom, sa période, et un bouton qui ouvre
 *    l'aperçu des courbes.
 *
 * L'explication reste accessible par le « ? » à côté du titre : on doit
 * pouvoir la relire sans réinitialiser la page.
 */

/** Petite icône de courbe, pour le bouton d'aperçu. */
const ICONE_COURBE =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M1.5 11.5 5 7l3 2.5 5.5-6"/><path d="M1.5 14.5h13"/></svg>';

/** Le nom de l'absence de scénario : les taux de la bulle 4, en ligne droite. */
const NOM_LINEAIRE = 'Scénario linéaire';

/** L'explication a-t-elle déjà été lue ? Tant que non, la liste reste cachée. */
let scenariosDecouverts = false;

const introOuverte = () => !$('#intro').hidden;
const apercuOuvert = () => !$('#apercu').hidden;

/*
 * Pictogrammes des deux familles : une flèche qui revient pour le passé, une
 * flèche pointillée qui part pour les futurs. La forme distingue avant même
 * qu'on lise l'étiquette.
 */
const PICTO = {
  historique:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6"/>' +
    '<path d="M3 2.5v2.8h2.8"/><path d="M8 5.5V8l1.8 1.2"/></svg>',
  prospectif:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h9" stroke-dasharray="2 2"/>' +
    '<path d="M10 4.5 13.5 8 10 11.5"/></svg>',
};

/** Le sous-titre d'une ligne : la période observée, ou le marché choqué. */
function sousTitreScenario(sc) {
  if (sc.periode) return sc.periode;
  if (sc.choque) return `Un choc sur ${sc.choque.nom}`;
  return sc.sousTitre || '';
}

function ligneScenario(sc) {
  const sous = sousTitreScenario(sc);
  const date = sous ? `<span class="scenario__periode">${sous}</span>` : '';
  return (
    '<div class="scenario__ligne">' +
    `<button type="button" class="scenario__option" data-scenario="${sc.cle}" ` +
      'role="radio" aria-checked="false">' +
      `<span class="scenario__nom">${sc.nom}</span>${date}</button>` +
    `<button type="button" class="scenario__apercu" data-apercu="${sc.cle}" ` +
      `aria-label="Voir les courbes — ${sc.nom}" title="Voir les courbes">${ICONE_COURBE}</button>` +
    '</div>'
  );
}

function construireScenarios() {
  // Chaque famille a son propre bloc et son pictogramme : grisé plein pour le
  // passé, violet en tirets pour les futurs. Les étiquettes « Historique » /
  // « Hypothèse » ont été retirées — le bloc le dit déjà, elles chargeaient.
  const groupe = (cle, nom, lignes) =>
    `<div class="scenario__groupe scenario__groupe--${cle}" role="group" aria-label="${nom}">` +
      `<p class="scenario__famille"><span class="scenario__picto">${PICTO[cle]}</span>${nom}</p>` +
      lignes.join('') +
    '</div>';

  // Le linéaire n'a pas de ligne : c'est l'absence de scénario, les taux de
  // la bulle 4 appliqués tels quels chaque année — ce que l'utilisateur voit
  // déjà. On y revient en recliquant sur le scénario actif.
  const morceaux = [];
  for (const famille of FAMILLES) {
    const liste = scenariosParFamille(famille.cle);
    if (!liste.length) continue;
    morceaux.push(groupe(famille.cle, famille.nom, liste.map(ligneScenario)));
  }
  $('#scenarioChoix').innerHTML = morceaux.join('');
  marquerScenarioActif(scenarioActif ? scenarioActif.cle : '');

  // Un clic applique ; un second clic sur le même retire le filtre et rend
  // le linéaire. Pas de bouton dédié : la carte garde la même hauteur.
  for (const b of document.querySelectorAll('.scenario__option')) {
    b.addEventListener('click', () => {
      const dejaActif = scenarioActif && scenarioActif.cle === b.dataset.scenario;
      appliquerScenario(dejaActif ? '' : b.dataset.scenario);
      // Ici et non dans `appliquerScenario`, que la restauration appelle aussi.
      if (!dejaActif) Mesure.suivre('scenario_choisi', { scenario: b.dataset.scenario });
    });
  }
  for (const b of document.querySelectorAll('.scenario__apercu')) {
    b.addEventListener('click', () => {
      ouvrirApercu(b.dataset.apercu);
      Mesure.suivre('sim_avance_ouvert', { bloc: 'scenario_apercu' });
    });
  }

  $('#scenarioOuvrir').addEventListener('click', ouvrirIntro);
  $('#scenarioOuvrir').addEventListener('click', () => {
    Mesure.suivre('sim_avance_ouvert', { bloc: 'scenarios' });
  });
  $('#introFermer').addEventListener('click', fermerIntro);
  $('#introValider').addEventListener('click', () => {
    scenariosDecouverts = true;
    fermerIntro();
    majScenario();
  });
  $('#apercuFermer').addEventListener('click', fermerApercu);
  $('#scenarioRetirer').addEventListener('click', () => appliquerScenario(''));
}

const fenetreMelOuverte = () => !$('#melFenetre').hidden;
const resultatMelOuvert = () => !$('#mel').hidden;

function ouvrirResultatMel() {
  $('#mel').hidden = false;
  $('#voile').hidden = false;
  // Un graphique créé dans une fenêtre cachée garde une largeur nulle, et
  // `resize()` ne replace pas ses points : on le recrée une fois visible.
  if (graphMel) { graphMel.destroy(); graphMel = null; }
  rafraichir();
  if (dernieresOptionsMel && !$('#melResultats').hidden) {
    // Une tranche, pas l'année exacte : on veut savoir à quel horizon les
    // gens envisagent de louer, pas reconstituer une simulation.
    const n = dernieresOptionsMel.anneeBascule;
    const tranche = n <= 5 ? '1-5' : n <= 10 ? '6-10' : n <= 15 ? '11-15' : '16+';
    Mesure.suivre('location_resultat_affiche', { tranche_annee_bascule: tranche });
  }
  $('#melResultatFermer').focus();
}

function fermerResultatMel() {
  $('#mel').hidden = true;
  if (bulleZoomee === null && !apercuOuvert() && !introOuverte() && !fenetreMelOuverte()) {
    $('#voile').hidden = true;
  }
}

function ouvrirFenetreMel() {
  proposerLoyers();
  majReglagesMel();
  $('#melFenetre').hidden = false;
  $('#voile').hidden = false;
  $('#melAnneeBascule').focus();
}

function fermerFenetreMel() {
  $('#melFenetre').hidden = true;
  if (bulleZoomee === null && !apercuOuvert() && !introOuverte() && !resultatMelOuvert()) {
    $('#voile').hidden = true;
  }
}

function ouvrirIntro() {
  $('#intro').hidden = false;
  $('#voile').hidden = false;
}

function fermerIntro() {
  $('#intro').hidden = true;
  if (bulleZoomee === null && !apercuOuvert()) $('#voile').hidden = true;
}

/* --- L'aperçu d'un scénario : courbes en base 100, taux, sources -------- */

let graphApercu = null;

/** « +6 », « −18 », « 0 » — un taux annuel, signe compris, sans le %. */
const tauxSigne = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/**
 * Combien d'années une série énumère vraiment avant de devenir plate.
 *
 * Toutes les séries font vingt-cinq ans, mais la fin est un prolongement à taux
 * constant. Lister les vingt-cinq valeurs donnerait à ce prolongement l'allure
 * d'une donnée ; on s'arrête donc là où la série se met à se répéter.
 */
function anneesDistinctes(serie) {
  let n = serie.length;
  while (n > 1 && serie[n - 1] === serie[n - 2]) n -= 1;
  return n === 1 ? 0 : n - 1;
}

function ouvrirApercu(cle) {
  const sc = cle ? scenarioParCle(cle) : null;
  const horizon = dernierResultat ? dernierResultat.annees.length : 25;

  // Le scénario linéaire n'a pas de série : on lit les champs, ce qui donne trois
  // droites. La comparaison avec une décennie réelle est tout l'argument.
  const lire = (champ) => {
    if (sc) return sc.taux[champ];
    const v = parseFloat(document.getElementById(champ).value);
    return (Number.isFinite(v) ? v : DEFAUTS[champ] * 100) / 100;
  };

  /*
   * Base 100 : on trace la VALEUR, pas le taux. Une suite de pourcentages est
   * une dérivée — on la lit mal, et surtout on ne voit pas où elle mène. Avec
   * une base 100, deux décennies de moyenne identique mais d'ordre différent
   * se séparent à l'œil, ce qui est précisément le propos du pilier.
   */
  const base100 = (taux) => {
    const suite = [100];
    for (let a = 1; a <= horizon; a++) suite.push(suite[a - 1] * (1 + tauxAnnee(taux, a)));
    return suite;
  };

  // `couleur` sert au canevas (Chart.js peint, pas de CSP en jeu) ; `classe`
  // sert aux pastilles HTML, qui ne peuvent pas porter de style en ligne.
  const series = [
    { champ: 'rendementBourse', nom: 'Marchés actions',
      couleur: jeton('--courbe-marches'), classe: 'marches' },
    { champ: 'revalBien', nom: "Prix de l'immobilier",
      couleur: jeton('--courbe-immo'), classe: 'immo' },
    { champ: 'revalLoyer', nom: 'Loyers (IRL)',
      couleur: jeton('--courbe-loyer'), classe: 'loyer-irl', pointille: true },
  ];
  for (const serie of series) serie.taux = lire(serie.champ);

  $('#apercuTitre').textContent = sc ? sc.nom : NOM_LINEAIRE;
  $('#apercuResume').textContent = sc
    ? sc.resume
    : "Vos taux de l'étape 4, appliqués tels quels chaque année. Aucune donnée de marché.";

  // On n'affiche que les années EXPLICITEMENT DÉFINIES, suivies du taux qui
  // prolonge. Lister vingt-cinq valeurs dont treize identiques ferait passer un
  // prolongement pour une donnée.
  //
  // `definies` et non `reel` : un scénario construit n'a aucune année observée,
  // mais ses années de choc sont ce qu'il faut montrer — ce sont elles qui le
  // définissent.
  const definies = sc ? Math.min(sc.definies, horizon) : 0;
  $('#apercuSuites').innerHTML = series
    .map((serie) => {
      let valeurs;
      if (!Array.isArray(serie.taux)) {
        valeurs = `${tauxSigne.format(serie.taux * 100)} chaque année`;
      } else {
        // Compté série par série : dans un stress test, une seule grandeur est
        // choquée. Les autres valent la tendance longue dès la première année
        // et n'ont aucune valeur distincte à énumérer.
        const n = Math.min(anneesDistinctes(serie.taux), horizon);
        valeurs = serie.taux
          .slice(0, n)
          .map((t) => tauxSigne.format(t * 100))
          .join(' · ');
        if (n < horizon) {
          valeurs += n
            ? ` <b>puis ${tauxSigne.format(serie.taux[n] * 100)} par an</b>`
            : `<b>${tauxSigne.format(serie.taux[n] * 100)} chaque année</b>`;
        }
      }
      return (
        '<div class="suite">' +
        `<span class="suite__mot"><span class="pastille pastille--${serie.classe}"></span>` +
        `${serie.nom}</span><span class="suite__valeurs">${valeurs}</span></div>`
      );
    })
    .join('');

  const arrivee = (taux) => Math.round(base100(taux)[horizon]);

  // Légende : pastille, nom, et où la courbe arrive. Construite en DOM —
  // textContent seulement.
  const legende = $('#apercuLegende');
  legende.replaceChildren();
  for (const serie of series) {
    const li = document.createElement('li');
    const pastille = document.createElement('span');
    pastille.className = `pastille pastille--${serie.classe}`;
    const nom = document.createElement('span');
    nom.textContent = serie.nom;
    const valeur = document.createElement('strong');
    valeur.textContent = arrivee(serie.taux);
    li.append(pastille, nom, valeur);
    legende.append(li);
  }
  $('#apercuDetails').open = false;
  $('#apercuNote').textContent =
    `Taux annuels en %. Les valeurs de la légende partent de 100 et se lisent après ${horizon} ans : ` +
    series.map((x) => `${arrivee(x.taux)} pour « ${x.nom} »`).join(', ') +
    '.' +
    // Le texte doit dire ce qui est observé et ce qui ne l'est pas. Un scénario
    // construit n'a rien d'observé du tout : le dire est plus important que de
    // décrire un prolongement.
    (!sc
      ? ''
      : sc.reel === 0
      ? ` Aucune de ces années n'est observée : c'est une hypothèse, où ${definies} ` +
        'années de choc sont suivies de la tendance longue.'
      : sc.reel < horizon
      ? ` Les ${sc.reel} premières années sont observées ; au-delà, le trait vertical marque ` +
        'le début du prolongement, au rythme annualisé de la période.'
      : ' Toutes les années affichées sont observées : aucun prolongement.');

  // La provenance est une exigence du pilier : un scénario historique sans
  // source n'est qu'une opinion. Les réserves passent devant — une réserve dit
  // ce qu'on sait de faux, elle ne se range pas en bas de page.
  $('#apercuSources').innerHTML = sc
    ? (sc.reserves || []).map((r) => `<li class="apercu__reserve">${r}</li>`).join('') +
      series
        .filter((x) => sc.sources && sc.sources[x.champ])
        .map((x) => `<li>${x.nom} : ${sc.sources[x.champ]}</li>`)
        .join('')
    : '';

  $('#apercu').hidden = false;
  $('#voile').hidden = false;

  if (typeof Chart === 'undefined') return;

  const o = optionsCommunes();
  o.scales.y.ticks.callback = (v) => Math.round(v);
  // Le trait des 100 est la référence : au-dessous, on a perdu de la valeur.
  o.scales.y.grid.color = (ctx) => (ctx.tick.value === 100 ? jeton('--axe') : jeton('--grille'));
  o.plugins.tooltip.callbacks.title = (items) =>
    items[0].label === '0' ? 'Départ' : `Année ${items[0].label}`;
  o.plugins.tooltip.callbacks.label = (ctx) => {
    const t = ctx.dataset.tauxAnnuels[ctx.dataIndex];
    const variation = t === null ? '' : ` (${tauxSigne.format(t * 100)} %)`;
    return ` ${ctx.dataset.label} : ${Math.round(ctx.parsed.y)}${variation}`;
  };
  // Ici l'axe commence à l'année 0 : l'indice du dernier point réel vaut donc
  // exactement le nombre d'années observées. Un scénario construit n'en a
  // aucune — pas de frontière à tracer, la courbe entière est une hypothèse.
  const observees = sc ? Math.min(sc.reel, horizon) : 0;
  o.frontiere = observees < horizon ? observees : 0;

  graphApercu = poser(graphApercu, '#graphApercu', 'line', {
    labels: Array.from({ length: horizon + 1 }, (_, i) => i),
    datasets: series.map((serie) => ({
      label: serie.nom,
      data: base100(serie.taux),
      tauxAnnuels: Array.from({ length: horizon + 1 }, (_, i) =>
        i === 0 ? null : tauxAnnee(serie.taux, i)),
      borderColor: serie.couleur,
      backgroundColor: serie.couleur,
      // Au-delà des années observées, la courbe s'atténue : c'est une
      // projection au taux moyen, pas une donnée.
      segment: o.frontiere
        ? {
            borderColor: (ctx) =>
              ctx.p0DataIndex >= o.frontiere ? attenue(serie.couleur, 0.45) : undefined,
          }
        : undefined,
      // La courbe des loyers est la plus pâle : le pointillé lui donne une
      // seconde marque, pour qu'elle ne repose pas sur la seule couleur.
      borderWidth: serie.pointille ? 2.5 : 2,
      borderDash: serie.pointille ? [5, 3] : undefined,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.2,
    })),
  }, o, [traitFrontiere]);

  // Un canevas dimensionné dans un conteneur masqué reste à zéro.
  graphApercu.resize();
}

function fermerApercu() {
  $('#apercu').hidden = true;
  if (bulleZoomee === null && !introOuverte()) $('#voile').hidden = true;
}

/**
 * Applique un scénario, ou rend la main à l'utilisateur quand `cle` est vide.
 *
 * Les champs de taux de la bulle 4 sont alors pilotés : on y écrit le taux
 * annuel ÉQUIVALENT (moyenne géométrique) et on les désactive. Les laisser
 * afficher les valeurs de l'utilisateur pendant qu'un scénario calcule autre
 * chose serait un mensonge à l'écran.
 */
/** Coche la ligne du scénario en vigueur ; sans scénario, aucune ne l'est. */
function marquerScenarioActif(cle) {
  for (const b of document.querySelectorAll('.scenario__option')) {
    const actif = b.dataset.scenario === (cle || '');
    b.classList.toggle('scenario__option--actif', actif);
    b.setAttribute('aria-checked', String(actif));
  }
  // Recliquer le scénario actif le retire aussi, mais personne ne le devine :
  // le bouton du bandeau le dit, et n'apparaît que s'il y a un filtre à retirer.
  $('#scenarioRetirer').hidden = !cle;
}

function appliquerScenario(cle) {
  const scenario = cle ? scenarioParCle(cle) : null;

  // On met les hypothèses de côté au premier scénario appliqué, pour pouvoir
  // les rendre intactes ensuite.
  if (scenario && !hypothesesUtilisateur) {
    hypothesesUtilisateur = {};
    for (const champ of TAUX_SCENARISES) {
      hypothesesUtilisateur[champ] = document.getElementById(champ).value;
    }
  }

  scenarioActif = scenario;

  for (const champ of TAUX_SCENARISES) {
    const el = document.getElementById(champ);
    if (scenario) {
      el.value = (tauxEquivalent(scenario.taux[champ]) * 100).toFixed(2).replace(/\.?0+$/, '');
    } else if (hypothesesUtilisateur) {
      el.value = hypothesesUtilisateur[champ];
    }
    el.disabled = !!scenario;
  }
  if (!scenario) hypothesesUtilisateur = null;

  marquerScenarioActif(cle);

  // Ce qui est observé et ce qui est prolongé n'est plus écrit sous la liste
  // (la carte garde la même hauteur) : l'avertissement sous le graphique et
  // l'aperçu de chaque scénario le disent.
  recalculer();
}

/**
 * Le filtre reste inerte tant que les quatre bulles ne sont pas validées : un
 * scénario n'a rien à filtrer avant qu'il y ait un résultat.
 */
function majAvertissement() {
  const commun =
    'Ni inflation générale, ni changement de situation, ni revente anticipée subie. ' +
    "Un résultat serré (moins de quelques milliers d'euros d'écart) doit se lire comme une égalité.";
  if (!scenarioActif) {
    $('#avertissement').textContent =
      'Simulation à hypothèses constantes : le rendement boursier est supposé régulier, ' +
      "ce qu'aucun marché ne fait. " + commun;
    return;
  }
  // Le texte doit dire où s'arrêtent les données, pas seulement que des taux
  // varient : c'est la frontière qui décide comment lire la fin du graphique.
  const sc = scenarioActif;
  const tendance = `${pourcentDixieme.format(sc.suiteBourse)} par an en bourse`;

  // Un stress test n'a aucune année observée : l'avertissement doit dire qu'on
  // teste UN risque, pas laisser croire à une période documentée. La phrase
  // nomme le marché après un deux-points, ce qui évite d'accorder « seul » avec
  // un libellé qui change de genre selon le scénario.
  if (sc.reel === 0) {
    $('#avertissement').textContent =
      `Scénario « ${sc.nom} » : hypothèse construite, aucune année observée. ` +
      `Un seul marché est choqué : ${sc.choque.nom}, pendant ${sc.definies} ans. ` +
      `Le reste suit la tendance longue (${sc.autre.nom} à ` +
      `${pourcentDixieme.format(sc.autre.taux)} par an). C'est ce qui permet de savoir ` +
      'ce qui est testé. ' +
      commun;
    return;
  }

  const observe = sc.periode ? `${sc.reel} années observées (${sc.periode})` : `${sc.reel} années`;
  $('#avertissement').textContent =
    `Scénario « ${sc.nom} » : ${observe}, ` +
    (sc.reel >= 25
      ? "assez pour couvrir tout l'horizon — rien n'est projeté. "
      : `puis une projection au rythme annualisé de la période (${tendance}). ` +
        "Au-delà du trait, les courbes sont pointillées : ce n'est plus une donnée. ") +
    commun;
}

/** La carte « mise en location » du rail : verrouillée, appel, ou résumé. */
function majCarteMel(pret) {
  $('#melCarte').dataset.etat = !pret ? 'bloque' : melActif ? 'ouvert' : 'ferme';
  $('#melOuvrir').disabled = !pret;
  $('#melAccroche').textContent = pret
    ? 'Gardez le bien, louez-le, et comparez avec une revente.'
    : 'Validez les quatre étapes pour débloquer.';
  const pastilles = $('#melProgression').children;
  for (let i = 0; i < pastilles.length; i++) {
    pastilles[i].classList.toggle('scenario__pas--fait', validees.has(BULLES[i]));
  }
  const loyer = parseFloat($('#melLoyerPercu').value);
  $('#melResumeAnnee').textContent = `Dès l'année ${$('#melAnneeBascule').value}`;
  $('#melResumeDetail').textContent =
    ($('#melRegime').value === 'nu' ? 'Location nue' : 'Meublé') +
    (Number.isFinite(loyer) ? ` · ${euros.format(loyer)}/mois` : '');
}

function majScenario() {
  const pret = profilValide && validees.size === BULLES.length;
  $('#scenario').dataset.etat = !pret
    ? 'bloque'
    : scenariosDecouverts
    ? 'ouvert'
    : 'ferme';
  $('#scenarioAccroche').textContent = pret
    ? 'Ajoutez un filtre de marché à votre projet et observez son effet sur les résultats.'
    : 'Validez les quatre étapes pour débloquer.';
  // Verrouillée, la carte reste lisible mais ne s'active pas — y compris au
  // clavier, ce que `pointer-events` seul ne garantissait pas.
  $('#scenarioOuvrir').disabled = !pret;
  majCarteMel(pret);

  // Quatre pastilles, une par bulle : on voit ce qui reste à faire pour
  // débloquer, au lieu d'une carte grisée qui ne dit rien.
  const pastilles = $('#scenarioProgression').children;
  for (let i = 0; i < pastilles.length; i++) {
    pastilles[i].classList.toggle('scenario__pas--fait', validees.has(BULLES[i]));
  }
}

/* ------------------------------------------------------- Brouillon local */

/*
 * La saisie en cours est écrite dans le `localStorage` à chaque modification.
 * Sans compte, sans réseau : fermer l'onglet ne fait plus rien perdre.
 *
 * Deux choses sont enregistrées, et leur séparation compte :
 *   - `params`, qui décrit un PROJET. C'est ce qui partira tel quel vers le
 *     compte le jour où il existera. Aucun état d'interface dedans.
 *   - `avancement`, qui décrit où en est CETTE session dans CE navigateur.
 *     Sans lui, rouvrir l'onglet afficherait un résultat complet alors que
 *     l'utilisateur n'a rempli qu'une bulle — exactement ce qu'on s'interdit.
 */

/** Rassemble l'état courant sous la forme attendue par la sauvegarde. */
function paramsCourants() {
  const p = Sauvegarde.vide();
  const saisie = lireFormulaire();
  for (const champ of Object.keys(p.moteur)) {
    if (champ in saisie) p.moteur[champ] = saisie[champ];
  }
  // Un champ laissé vide part en null, pas avec le défaut que `lireFormulaire`
  // a mis à sa place (voir `normaliser`, sauvegarde.js).
  for (const champ of Object.keys(p.moteur)) {
    const el = document.getElementById(champ);
    const pilote = scenarioActif && TAUX_SCENARISES.includes(champ);
    if (el && el.type === 'number' && !pilote && el.value.trim() === '') p.moteur[champ] = null;
  }
  // Un scénario est un filtre posé sur le projet, pas une partie du projet :
  // on sauvegarde les taux de l'utilisateur (mis de côté) et la clé du
  // scénario, jamais ses séries. Sinon, au rechargement, les séries étaient
  // prises pour les hypothèses de l'utilisateur, et retirer le filtre rendait
  // la première année du scénario (−5,2 % en bourse) au lieu de ses 5 %.
  if (scenarioActif && hypothesesUtilisateur) {
    for (const champ of TAUX_SCENARISES) {
      const v = parseFloat(hypothesesUtilisateur[champ]);
      p.moteur[champ] = Number.isFinite(v) ? v / 100 : DEFAUTS[champ];
    }
  }
  // La décomposition, pas la somme : l'effort se déduit, il ne se stocke pas.
  p.profil = lireProfil();
  for (const champ of CHAMPS_EFFORT) {
    if (document.getElementById(champ).value.trim() === '') p.profil[champ] = null;
  }

  // Les champs de mise en location sont lus directement : `lireFormulaireMel`
  // rend `null` tant que le palier 1 est incomplet, or on veut sauvegarder la
  // saisie partielle aussi.
  const nombre = (id) => {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : null;
  };
  // Un curseur a toujours une valeur : l'année n'est sauvegardée que module
  // ouvert, puisque c'est d'elle que se déduit sa réouverture.
  p.location.anneeBascule = melActif ? nombre('melAnneeBascule') : null;
  p.location.loyerPercu = nombre('melLoyerPercu');
  p.location.loyerFutur = nombre('melLoyerFutur');
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    const el = document.getElementById(id);
    if (el.tagName === 'SELECT') {
      p.location[def.cle] = el.value;
      continue;
    }
    const v = parseFloat(el.value);
    if (Number.isFinite(v)) p.location[def.cle] = def.pourcentage ? v / 100 : v;
  }

  p.scenario = scenarioActif ? scenarioActif.cle : null;
  p.horizon = parseInt($('#horizon').value, 10) || 20;
  return p;
}

function avancementCourant() {
  return {
    profilValide: profilValide,
    bullesValidees: [...validees],
    epargneForceeRepondue: epargneForceeRepondue,
  };
}

const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Dit où en est la sauvegarde. Vide tant qu'il n'y a rien à dire. */
function direBrouillon(texte, alerte) {
  const el = $('#brouillonEtat');
  el.textContent = texte;
  el.classList.toggle('brouillon--alerte', alerte === true);
}

/** Écrit tout de suite, et met l'indicateur à jour. */
function ecrireBrouillon() {
  if (!Sauvegarde.ecrire(paramsCourants(), avancementCourant())) {
    direBrouillon(
      'Sauvegarde impossible : votre navigateur refuse le stockage local. ' +
        'Votre saisie sera perdue en fermant l’onglet.',
      true
    );
    return;
  }
  direBrouillon('Brouillon enregistré à ' + heure.format(new Date()) + '.');
}

/**
 * Écriture différée : on ne touche au `localStorage` qu'après une demi-seconde
 * sans frappe. Écrire à chaque caractère serait inutile et coûteux.
 */
const enregistrerBrouillon = Sauvegarde.differer(ecrireBrouillon, 500);

/**
 * Restaure un brouillon au chargement. Rend `true` si quelque chose a été
 * restauré, pour que l'appelant sache s'il doit recalculer.
 *
 * Les taux sont stockés en FRACTION et s'affichent en POURCENTAGE : c'est
 * `remplirFormulaire` qui fait la conversion, comme pour les défauts. On lui
 * passe donc les paramètres tels quels, sans les traduire ici.
 */
function restaurerBrouillon() {
  const brouillon = Sauvegarde.lire();
  if (!brouillon) return false;

  remplirFormulaire(brouillon.params.moteur);
  remplirProfil(brouillon.params.profil);

  const champ = (id, v, pourcentage) => {
    const el = document.getElementById(id);
    if (!el || v === null || v === undefined) return;
    el.value = el.tagName === 'SELECT' ? v : pourcentage ? +(v * 100).toFixed(4) : v;
  };
  champ('melAnneeBascule', brouillon.params.location.anneeBascule);
  champ('melLoyerPercu', brouillon.params.location.loyerPercu);
  champ('melLoyerFutur', brouillon.params.location.loyerFutur);
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    champ(id, brouillon.params.location[def.cle], def.pourcentage);
  }

  $('#horizon').value = brouillon.params.horizon;

  // Le module de mise en location se rouvre s'il portait une saisie : son état
  // d'ouverture se DÉDUIT des paramètres, il n'a pas à être stocké.
  if (brouillon.params.location.anneeBascule !== null) melActif = true;

  // L'avancement est restauré AVANT le scénario : `appliquerScenario` appelle
  // `recalculer`, qui lit `profilValide` et `validees` pour décider ce qui
  // s'affiche.
  profilValide = brouillon.avancement.profilValide;
  epargneForceeRepondue = brouillon.avancement.epargneForceeRepondue;
  validees.clear();
  for (const n of brouillon.avancement.bullesValidees) validees.add(n);
  if (profilValide) figerProfil(true);

  if (brouillon.params.scenario && scenarioParCle(brouillon.params.scenario)) {
    scenariosDecouverts = true;
    appliquerScenario(brouillon.params.scenario);
  }

  direBrouillon('Simulation restaurée, telle que vous l’aviez laissée.');
  Mesure.suivre('brouillon_restaure');
  return true;
}

/**
 * Branche la sauvegarde locale. Appelé en fin d'initialisation.
 *
 * Trois écouteurs plutôt qu'un :
 * - `input` couvre la frappe ;
 * - `change` couvre les listes déroulantes et les modes de saisie qui
 *   n'émettent pas `input` à chaque étape ;
 * - `pagehide` force l'écriture en attente. Sans lui, fermer l'onglet dans la
 *   demi-seconde qui suit une frappe perdrait cette frappe — le différé aurait
 *   mangé exactement ce qu'il devait protéger.
 */
function initialiserBrouillon() {
  if (!Sauvegarde.disponible()) {
    direBrouillon(
      'Votre navigateur refuse le stockage local : cette simulation ne sera pas ' +
        'conservée quand vous fermerez l’onglet.',
      true
    );
    Mesure.suivre('sim_erreur', { type: 'stockage_indisponible' });
    return;
  }

  for (const zone of ['#formulaire', '#profil', '#melFormulaire']) {
    $(zone).addEventListener('input', enregistrerBrouillon);
    $(zone).addEventListener('change', enregistrerBrouillon);
  }
  for (const id of ['#horizon', '#horizonBis', '#horizonMel']) {
    $(id).addEventListener('input', enregistrerBrouillon);
  }

  // `pagehide` plutôt que `beforeunload` : c'est celui que les navigateurs
  // modernes garantissent, y compris quand l'onglet est mis en cache arrière.
  addEventListener('pagehide', ecrireBrouillon);

  restaurerBrouillon();
  armerLiaisons();
}

/* ---------------------------------------------------------------- Orchestre */

let dernierResultat = null;
/** Options de mise en location du dernier calcul, ou null si le module est fermé ou incomplet. */
let dernieresOptionsMel = null;
/**
 * La mise en location est-elle appliquée ? Elle l'est après « Voir le
 * résultat », jusqu'à « Retirer ». Se déduit au rechargement de la présence
 * d'une année de bascule dans `params` — elle n'est pas stockée à part.
 */
let melActif = false;

function recalculer() {
  const saisie = lireFormulaire();

  // La mise en location se lit AVANT le moteur de base : le loyer payé
  // ailleurs après la bascule peut dépasser l'enveloppe, et avec l'enveloppe
  // identique le locataire de la comparaison doit pouvoir placer la même
  // somme. calc-location.js fournit ces planchers ; calc.js les applique sans
  // savoir d'où ils viennent.
  dernieresOptionsMel = melActif ? lireFormulaireMel() : null;
  saisie.planchersEnveloppe = dernieresOptionsMel
    ? planchersEnveloppe(saisie, dernieresOptionsMel, saisie.horizon)
    : null;

  dernierResultat = simuler(saisie);
  rafraichir();
}

/* --------------------------------------------------- Mise en location */

/** Trait vertical à l'année de mise en location, sur le graphique du module. */
const traitBascule = {
  id: 'traitBascule',
  afterDatasetsDraw(chart) {
    const i = chart.options.bascule;
    if (i === undefined || i === null) return;
    const x = chart.scales.x.getPixelForValue(i);
    const { top, bottom, right } = chart.chartArea;
    const ctx = chart.ctx;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = jeton('--encre-3');
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = jeton('--encre-2');
    ctx.font = '600 11px ' + jeton('--police');
    const aDroite = right - x > 110;
    ctx.textAlign = aDroite ? 'left' : 'right';
    ctx.fillText('mise en location', x + (aDroite ? 6 : -6), top + 12);
    ctx.restore();
  },
};

/**
 * Loyer d'un logement équivalent l'année donnée, en €/mois arrondis à 10 € :
 * celui de la bulle 3, tel que le moteur l'a déjà indexé. Simple lecture —
 * l'indexation reste dans calc.js.
 */
function loyerEquivalent(annee) {
  if (!dernierResultat) return null;
  const ligne = dernierResultat.annees[Math.min(annee, dernierResultat.annees.length) - 1];
  return ligne ? Math.round(ligne.loyerAnnuel / 12 / 10) * 10 : null;
}

/**
 * Les loyers proposés suivent l'année choisie TANT QUE l'utilisateur ne les a
 * pas touchés. `data-auto` est un état d'interface : il ne part jamais dans
 * `params`, qui ne garde que la valeur.
 */
function proposerLoyers() {
  const annee = parseInt($('#melAnneeBascule').value, 10);
  const propose = loyerEquivalent(annee);
  for (const id of ['#melLoyerPercu', '#melLoyerFutur']) {
    const el = $(id);
    if (propose !== null && (el.value === '' || el.dataset.auto === 'oui')) {
      el.value = propose;
      el.dataset.auto = 'oui';
    }
  }
}

/** Synchronise le libellé du curseur et la bascule meublé / nu avec leurs sources. */
function majReglagesMel() {
  const annee = parseInt($('#melAnneeBascule').value, 10);
  $('#melAnneeValeur').textContent = `l'année ${annee}`;
  const propose = loyerEquivalent(annee);
  const aide = propose === null ? '' : `Logement équivalent en année ${annee} : ${euros.format(propose)}/mois`;
  $('#melLoyerPercuAide').textContent = aide;
  $('#melLoyerFuturAide').textContent = aide;

  const regime = $('#melRegime').value;
  for (const b of document.querySelectorAll('.mel__option')) {
    const actif = b.dataset.regime === regime;
    b.classList.toggle('mel__option--actif', actif);
    b.setAttribute('aria-checked', String(actif));
  }
  // Les prélèvements sociaux suivent le régime : on les montre, on ne les saisit pas.
  const ps = window.SimuRPLocation.PRELEVEMENTS_SOCIAUX;
  const pct = (t) => (t * 100).toLocaleString('fr-FR') + ' %';
  $('#melPrelevementsSociaux').textContent = regime === 'nu'
    ? `${pct(ps.nu)} sur les loyers (revenus fonciers), ${pct(ps.plusValueImmobiliere)} sur la plus-value à la revente.`
    : `${pct(ps.meuble)} sur les bénéfices (BIC), ${pct(ps.plusValueImmobiliere)} sur la plus-value à la revente.`;
}

/** €/mois signés : « +312 € » ou « −450 € ». */
const mensuelSigne = (annuel) => signe(Math.round(annuel / 12));

/** Les trois chiffres, le graphique et le détail du module. */
function afficherMel(mel, horizon) {
  const N = mel.anneeBascule;
  const base = dernierResultat.annees;
  const ligne = mel.annees[horizon - 1];
  const regime = mel.options.regime === 'nu' ? 'location nue' : 'meublé';
  $('#melTitre').textContent = `Si vous la louez dès l'année ${N}, en ${regime}`;
  const apresHorizon = N > horizon;

  // 1 et 2 : comparaisons de patrimoine, à l'horizon du curseur principal.
  const vsRevente = ligne.patrimoineTotal - base[horizon - 1].patrimoineTotalAchat;
  const vsLocataire = ligne.patrimoineTotal - base[horizon - 1].patrimoineTotalLocation;
  $('#melVsRevente').textContent = apresHorizon ? '—' : signe(vsRevente);
  $('#melVsLocataire').textContent = apresHorizon ? '—' : signe(vsLocataire);
  $('#melVsRevente').classList.toggle('mel__chiffre-valeur--negatif', !apresHorizon && vsRevente < 0);
  $('#melVsLocataire').classList.toggle('mel__chiffre-valeur--negatif', !apresHorizon && vsLocataire < 0);
  // Les deux premiers chiffres se lisent au curseur « Bilan dans » : il faut
  // dire à quelle date, et contre quoi.
  $('#melVsReventeAide').textContent = apresHorizon
    ? `La location commence après ${horizon} ans : rien à comparer à cet horizon.`
    : `à ${horizon} ans, face à une revente du bien à ${horizon} ans`;
  $('#melVsLocataireAide').textContent = apresHorizon
    ? ''
    : `à ${horizon} ans, face à la comparaison de départ`;

  // 3 : la première année de location, au mois. Le moteur la calcule déjà.
  const premiere = mel.annees[N - 1];
  const flux = premiere.cashFlowNet;
  $('#melMensuel').textContent = `${mensuelSigne(flux)}/mois`;
  $('#melMensuel').classList.toggle('mel__chiffre-valeur--negatif', flux < 0);
  $('#melMensuelAide').textContent = flux >= 0
    ? `encaissés en année ${N} : loyer − crédit − charges − impôt`
    : `à compléter de votre poche en année ${N} : loyer − crédit − charges − impôt`;

  // Le détail du mois : la même année, poste par poste. DOM et textContent.
  const postes = [
    ['Loyer perçu', premiere.revenusBruts],
    ['Crédit et assurance', -premiere.mensualiteAnnuelle],
    ['Charges, taxe foncière et frais', -premiere.chargesAnnuelles],
    ['Impôt sur les loyers', -premiere.impotLocatif + premiere.economieDeficit],
    ['Reste chaque mois', flux],
  ];
  const liste = $('#melPostes');
  liste.replaceChildren();
  for (const [nom, annuel] of postes) {
    const dt = document.createElement('dt');
    dt.textContent = nom;
    const dd = document.createElement('dd');
    dd.textContent = mensuelSigne(annuel);
    liste.append(dt, dd);
  }

  $('#melNote').textContent = apresHorizon
    ? ''
    : `Montants de l'année ${N}, indexés ensuite. Si vous revendez à ${horizon} ans, ` +
      `l'impôt de plus-value est déjà déduit : ${euros.format(ligne.impotPlusValue)} ` +
      `(abattement de ${Math.round(ligne.abattementIR * 100)} % sur l'impôt et ` +
      `${Math.round(ligne.abattementPS * 100)} % sur les prélèvements sociaux).`;

  dessinerMel(mel, horizon);
}

/** Trois courbes : revendre, louer, rester locataire — et le trait de bascule. */
function dessinerMel(mel, horizon) {
  if (typeof Chart === 'undefined') return;
  const base = dernierResultat.annees;
  const series = [
    { nom: 'Acheter puis revendre', donnees: base.map((a) => a.patrimoineTotalAchat),
      couleur: jeton('--achat'), classe: 'achat' },
    { nom: 'Acheter puis louer', donnees: mel.annees.map((a) => a.patrimoineTotal),
      couleur: jeton('--achat-location'), classe: 'achat-location' },
    { nom: 'Rester locataire', donnees: base.map((a) => a.patrimoineTotalLocation),
      couleur: jeton('--location'), classe: 'location' },
  ];

  const donnees = {
    labels: base.map((a) => a.annee),
    datasets: series.map((x) => ({
      label: x.nom,
      data: x.donnees,
      borderColor: x.couleur,
      backgroundColor: x.couleur,
      borderWidth: x.classe === 'achat-location' ? 2.5 : 2,
      pointRadius: (ctx) => (ctx.dataIndex === horizon - 1 ? 5 : 0),
      pointHoverRadius: 5,
      pointBackgroundColor: x.couleur,
      pointBorderColor: jeton('--surface'),
      pointBorderWidth: 2,
      tension: 0.25,
    })),
  };
  const options = optionsCommunes();
  options.bascule = mel.anneeBascule - 1;

  if (graphMel) {
    graphMel.data = donnees;
    graphMel.options = options;
    graphMel.update('none');
  } else {
    graphMel = new Chart($('#graphMiseEnLocation'), {
      type: 'line', data: donnees, options, plugins: [traitBascule],
    });
  }

  const legende = $('#legendeMel');
  legende.replaceChildren();
  for (const x of series) {
    const item = document.createElement('span');
    item.className = 'legende__item';
    const pastille = document.createElement('span');
    pastille.className = `pastille pastille--${x.classe}`;
    item.append(pastille, x.nom);
    legende.append(item);
  }
}

function rafraichir() {
  if (!dernierResultat) return;
  const horizon = parseInt($('#horizon').value, 10);

  const mel = dernieresOptionsMel ? simulerMiseEnLocation(dernierResultat, dernieresOptionsMel) : null;
  // La fenêtre de résultats ne s'ouvre qu'à la demande ; retirée, elle se ferme.
  if (!melActif && resultatMelOuvert()) fermerResultatMel();
  $('#melIncomplet').hidden = !!mel;
  $('#melResultats').hidden = !mel;
  majReglagesMel();

  majBulles();
  majScenario();
  majAvertissement();
  afficherProfil(dernierResultat);
  if (!majAttente()) {
    // Pas de simulation, pas de supplément à interroger.
    $('#egalChoix').hidden = true;
    delete $('#visu').dataset.question;
    if (questionOuverte()) fermerQuestion();
    return;
  }

  // Avant le verdict : la question décide s'il peut se montrer.
  afficherMensuel(dernierResultat, horizon);
  afficherVerdict(dernierResultat, horizon);
  // « Affiché » veut dire VU : tant que la question de l'épargne forcée
  // attend sa réponse, le verdict est masqué (voir `afficherQuestion`).
  if ($('#visu').dataset.question !== 'attente') {
    Mesure.suivreUneFois('resultat', 'sim_resultat_affiche', {
      verdict: $('#verdictGagnant').dataset.gagnant,
    });
  }
  dessinerGraphiques(dernierResultat, horizon, mel);
  dessinerDetail(dernierResultat, horizon);
  if (mel) afficherMel(mel, horizon);
}

/* -------------------------------------------------- Plateau de bulles */

const BULLES = [...document.querySelectorAll('.bulle')].map((b) => Number(b.dataset.bulle));
const bulle = (n) => document.querySelector(`.bulle[data-bulle="${n}"]`);

/** Bulles déjà validées : leurs champs deviennent modifiables sur place. */
const validees = new Set();
/** Bulle actuellement agrandie au centre, ou null. */
let bulleZoomee = null;

/* ------------------------------------------------------------------ Profil */

/**
 * Le profil décrit l'utilisateur, pas le projet : il est saisi une fois et ne
 * varie pas d'une simulation à l'autre. Il vit donc hors du parcours numéroté,
 * dans un bandeau qui se replie sur une ligne une fois validé.
 */
let profilValide = false;

function etatProfil(etat) {
  $('#profil').dataset.etat = etat;
}

function ouvrirProfil() {
  etatProfil('saisie');
  $('#capitalInitial').focus();
}

/**
 * @param {boolean} [discret] - au chargement d'un brouillon, on replie le
 *   bandeau sans déplacer le focus : voler le curseur à quelqu'un qui vient
 *   d'ouvrir la page, ce n'est pas une aide, c'est une surprise.
 */
function figerProfil(discret) {
  const vides = champsVides($('#profilSaisie'));
  if (vides.length) {
    // Un brouillon relu avec une situation incomplète rouvre la saisie au
    // lieu de la figer ; un clic sur « Valider » montre ce qui manque.
    profilValide = false;
    if (discret === true) etatProfil('saisie');
    else signalerVides(vides);
    return;
  }
  profilValide = true;
  etatProfil('fige');
  majBulles();
  recalculer();
  if (discret === true) return;

  const suivante = prochaineBulle();
  if (suivante !== null) bulle(suivante).querySelector('.bulle__declencheur').focus();
}

/* Petits constructeurs DOM : tout ce qui s'affiche ici passe par textContent,
   jamais par innerHTML — les montants viennent de la saisie de l'utilisateur. */
const noeud = (balise, classe, texte) => {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
};
const pourcent = (x) => `${Math.round(x * 100)} %`;
const parMois = (v) => `${euros.format(v)}/mois`;

/**
 * Le bandeau profil : résumé replié, total de l'effort, retour immédiat sur
 * les revenus, et — une fois le parcours complet — le face-à-face avec le
 * projet. Aucune règle de calcul ici : tout vient de `resultat`.
 */
function afficherProfil(resultat) {
  const e = resultat.entrees;
  const profil = lireProfil();

  // --- Résumé du bandeau replié ------------------------------------------
  const item = (mot, valeur, detail) => {
    const s = noeud('span', 'profil__item');
    s.append(noeud('span', 'profil__mot', mot), valeur);
    if (detail) s.append(noeud('span', 'profil__detail', detail));
    return s;
  };
  const resume = [
    item('Patrimoine', euros.format(e.capitalInitial)),
    item('Effort', parMois(e.enveloppeMensuelle),
      `(loyer ${euros.format(profil.loyerActuel)} + épargne ${euros.format(profil.epargneActuelle)})`),
  ];
  if (e.revenusFoyer > 0) {
    resume.push(item('Revenus', parMois(e.revenusFoyer), `· effort ${pourcent(resultat.partEffortActuel)}`));
  }
  $('#profilResume').replaceChildren(...resume);

}

/**
 * « Chaque mois », sous le graphique, hors du détail repliable. N'est appelé
 * qu'une fois le parcours complet : c'est un résultat.
 *
 * Tous les chiffres mensuels au même endroit, première année ramenée au mois :
 * le point d'équilibre, les deux projets en miroir (ce que coûte le logement,
 * ce qui est investi), le taux d'endettement. « Coût réel » = mensualité,
 * assurance, charges de copropriété et taxe foncière. La mensualité seule
 * n'est plus affichée : elle est comprise dans le coût réel.
 */
function afficherMensuel(resultat, horizon) {
  const e = resultat.entrees;
  const an1 = resultat.annees[0];

  // `premiereAnneeFavorable` est le PREMIER croisement, pas un acquis : les
  // deux courbes peuvent se recroiser quand le rendement boursier est élevé.
  // On ne commente pas le cas normal — le libellé du chiffre suffit — mais on
  // avertit quand l'avantage ne tient plus, sinon l'écran se contredit.
  const pointMort = resultat.premiereAnneeFavorable;
  const tientEncore = resultat.annees[horizon - 1].ecart >= 0;
  $('#pointMort').textContent =
    pointMort === null ? 'Jamais' : pointMort === 1 ? 'Dès la 1re année' : `${pointMort} ans`;
  // Le cas « jamais » ne se commente PAS : le KPI dit déjà « Jamais » et la
  // courbe le montre. La phrase répétait l'information une troisième fois.
  // Le recroisement, lui, reste à dire : il contredit le chiffre affiché.
  if (pointMort === null || tientEncore) {
    $('#pointMortMesure').textContent = '';
  } else {
    $('#pointMortMesure').textContent =
      `L'achat passe devant à l'année ${pointMort}, mais la location reprend l'avantage ` +
      `avant l'année ${horizon}.`;
  }

  $('#kpiCoutReel').textContent = euros.format(an1.totalDebourseAnnuel / 12);
  $('#kpiInvestiAchat').textContent = euros.format(Math.max(an1.surplusProprio / 12, 0));
  $('#kpiLoyer').textContent = euros.format(an1.loyerAnnuel / 12);
  $('#kpiInvestiLocation').textContent = euros.format(Math.max(an1.surplusLocataire / 12, 0));
  // Un chiffre, sans commentaire. Sans revenus, aucun ratio n'est inventé.
  $('#kpiEndettement').textContent = e.revenusFoyer > 0 ? pourcent(resultat.tauxEndettement) : '—';

  afficherQuestion(resultat, horizon);

  const alerte = $('#alerteApport');
  alerte.hidden = e.apport <= e.capitalInitial;
  if (!alerte.hidden) {
    alerte.textContent =
      `L'apport (${euros.format(e.apport)}) dépasse votre patrimoine financier ` +
      `(${euros.format(e.capitalInitial)}) : le portefeuille de l'acheteur partirait en ` +
      'négatif. Réduisez l\'apport, ou corrigez votre patrimoine.';
  }
}

/* ----------------------------------------------- Question de l'épargne forcée */

/**
 * L'utilisateur a-t-il déjà répondu ? État de SESSION (rangé dans
 * `avancement`), pas du projet : la réponse elle-même est un paramètre
 * (`locatairePlaceDifference`), le fait d'y avoir répondu non.
 */
let epargneForceeRepondue = false;
/** La bulle a été rouverte à la demande : elle se ferme alors librement. */
let questionLibre = false;
const questionOuverte = () => !$('#question').hidden;

/**
 * Le cas qui fait toute la différence : l'achat demande plus que l'effort
 * d'aujourd'hui. Sans supplément, pas d'épargne forcée, et la question n'a pas
 * d'objet — on ne la pose pas.
 *
 * Avec un supplément : la bulle surgit UNE fois et impose un choix ; ensuite il
 * ne reste qu'une petite ligne sous « À effort égal ».
 */
function afficherQuestion(resultat, horizon) {
  const supplement = resultat.supplementAchat;
  const aPoser = supplement >= 1;
  const place = resultat.entrees.locatairePlaceDifference;

  $('#egalChoix').hidden = !aPoser;

  if (!aPoser) {
    if (questionOuverte()) fermerQuestion();
    $('#visu').dataset.question = 'repondue';
    return;
  }

  const montant = euros.format(supplement);
  majChoix(resultat, place);

  // La bulle INTERROGE, elle n'explique pas. Le constat est dans le titre ; le
  // reste était de la répétition — l'effort actuel est déjà au profil, et le
  // mécanisme tient dans les mots « de plus ». Deux questions, dont la
  // première ne se répond pas à l'écran : elle se répond dans sa tête, et
  // c'est elle qui décide si la seconde a un sens.
  $('#questionSupplement').textContent = montant;
  // La question qui dérange, et qui fait tout le travail : si l'effort est
  // tenable, pourquoi ne le fait-il pas DÉJÀ ? La réponse honnête est presque
  // toujours « parce que rien ne m'y oblige » — et c'est exactement ce que le
  // crédit changerait. Espace INSÉCABLE avant le « ? », sinon il tombe seul à
  // la ligne dès que la bulle se resserre.
  $('#questionDemande2').textContent =
    'Si oui : pourquoi ne le faites-vous pas déjà, aujourd’hui, ' +
    'en tant que locataire ?';

  // Ce que le choix engage vraiment : deux enveloppes différentes pour toute la
  // suite. Sans ça, on répond à une question de principe sans voir qu'on
  // paramètre la simulation.
  $('#questionTexte').textContent =
    'C’est tout l’enjeu : le crédit vous FORCERA à mettre cette somme de ' +
    'côté chaque mois, alors que rien ne vous y oblige en restant locataire. ' +
    `Selon votre réponse, les deux trajectoires n’auront pas la même ` +
    `enveloppe : ${montant} par mois d’écart, pendant toute la simulation.`;

  majEnjeu(resultat, horizon);

  // Une seule fois, jamais par-dessus une bulle zoomée, et jamais pendant
  // qu'on tape : en remplaçant 25 par 20, on passe par « 2 » — une durée de
  // 2 ans fait exploser la mensualité, et la question surgirait sur une valeur
  // que personne n'a voulue. Elle attend la sortie du champ (voir
  // `saisieEnCours` et l'écouteur `focusout`), puis tout est revérifié.
  if (!epargneForceeRepondue && !questionOuverte() && bulleZoomee === null && !saisieEnCours()) {
    ouvrirQuestion(false);
  }
  // Le verdict dépend de la réponse : masqué tant que la question est posée
  // et sans réponse — pas pendant la frappe, où elle n'est pas encore posée.
  $('#visu').dataset.question = !epargneForceeRepondue && questionOuverte() ? 'attente' : 'repondue';
}

/**
 * Les deux options portent leur MONTANT, pas un intitulé abstrait.
 *
 * C'est là que se comprend l'épargne forcée : à gauche le locataire s'aligne
 * sur l'effort de l'acheteur, à droite il garde le sien. Voir les deux sommes
 * côte à côte dit ce qu'aucune phrase ne disait — les deux enveloppes ne sont
 * pas les mêmes, et l'acheteur, lui, n'a pas eu le choix.
 */
function majChoix(resultat, place) {
  $('#choixSommeAligne').textContent = euros.format(resultat.effortAchat);
  $('#choixSommeActuel').textContent = euros.format(resultat.entrees.enveloppeMensuelle);
  for (const b of document.querySelectorAll('.choix__option')) {
    b.setAttribute('aria-checked', String((b.dataset.choix === 'aligne') === place));
  }
}

/**
 * Ce que la réponse déplace, MESURÉ : le moteur tourne une seconde fois avec
 * l'autre réponse. À DIX ANS et non à l'horizon regardé : à vingt-cinq ans
 * l'écart devient énorme et invraisemblable, et un chiffre qu'on ne croit pas
 * ne fait pas réfléchir. Dix ans, c'est à mi-crédit — assez pour que l'écart
 * soit installé, assez court pour rester concret.
 */
const HORIZON_ENJEU = 10;

function majEnjeu(resultat, horizon) {
  const an = Math.min(HORIZON_ENJEU, horizon);
  let enjeu = 0;
  try {
    const autre = simuler(
      Object.assign(lireFormulaire(), {
        locatairePlaceDifference: !resultat.entrees.locatairePlaceDifference,
      })
    );
    enjeu = Math.abs(autre.annees[an - 1].ecart - resultat.annees[an - 1].ecart);
  } catch (e) {
    enjeu = 0;
  }
  $('#questionEnjeu').textContent =
    Number.isFinite(enjeu) && enjeu >= 1
      ? `À ${an} ans, votre réponse déplace le résultat de ${euros.format(enjeu)}.`
      : '';
}

/** Un champ numérique a le focus : l'utilisateur est en train de taper. */
function saisieEnCours() {
  const el = document.activeElement;
  return !!el && el.tagName === 'INPUT' && el.type === 'number';
}

/**
 * @param {boolean} libre - rouverte à la demande : voile et Échap la
 *   referment. À la première apparition, seul un choix la ferme.
 */
function ouvrirQuestion(libre) {
  questionLibre = libre;
  $('#voileQuestion').hidden = false;
  const q = $('#question');
  q.hidden = false;
  q.querySelector('.question__reponse').focus();
}

/**
 * La bulle redescend vers la petite ligne qui la remplace : l'œil suit, et
 * sait où retrouver le choix. Animation par transformation seule.
 */
function fermerQuestion() {
  const q = $('#question');
  const cible = $('#egalChoix');
  $('#voileQuestion').hidden = true;
  let fait = false;
  const fin = () => {
    if (fait) return;
    fait = true;
    q.hidden = true;
    // Le focus atterrit sur l'option retenue : c'est là que le choix vit
    // désormais, et c'est de là qu'on peut en changer.
    const choisi = cible.querySelector('.choix__option[aria-checked="true"]');
    if (choisi && !cible.hidden) choisi.focus({ preventScroll: true });
  };
  const depart = q.getBoundingClientRect();
  const arrivee = cible.hidden ? null : cible.getBoundingClientRect();
  const sansMouvement = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!arrivee || !depart.width || sansMouvement || typeof q.animate !== 'function') return fin();
  const dx = arrivee.left + arrivee.width / 2 - (depart.left + depart.width / 2);
  const dy = arrivee.top + arrivee.height / 2 - (depart.top + depart.height / 2);
  const echelle = Math.max(arrivee.width / depart.width, 0.2);
  q.animate(
    [
      // Le centrage passe par la propriété `translate` (CSS), indépendante de
      // `transform` : on n'anime ici que le déplacement vers la petite ligne.
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, opacity: 0 },
    ],
    { duration: 380, easing: 'cubic-bezier(.4, 0, .2, 1)' }
  ).onfinish = fin;
  // Filet : un onglet en arrière-plan suspend les animations, et `onfinish`
  // n'arriverait jamais — la bulle resterait affichée, déjà répondue.
  setTimeout(fin, 450);
}

/**
 * Une réponse, d'où qu'elle vienne (bulle ou petite ligne). La case à cocher
 * reste l'état : on la règle, puis on la laisse émettre ses événements comme
 * si on l'avait cochée — mémoire de l'écart, recalcul, sauvegarde.
 */
function repondre(place) {
  const caseEtat = $('#locatairePlaceDifference');
  const change = caseEtat.checked !== place;
  if (questionOuverte()) fermerQuestion();
  if (change) {
    caseEtat.checked = place;
    caseEtat.dispatchEvent(new Event('input', { bubbles: true }));
    caseEtat.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Marqué APRÈS le recalcul : à la première réponse, le verdict n'avait
  // jamais été montré, dire « il a bougé de… » n'aurait aucun sens.
  const premiere = !epargneForceeRepondue;
  epargneForceeRepondue = true;
  if (premiere || !change) {
    rafraichir();
    enregistrerBrouillon();
  }
}

/** Toutes les bulles sont-elles renseignées ? Sans quoi rien n'est affiché. */
function parcoursComplet() {
  return profilValide && BULLES.every((n) => validees.has(n)) && valeursManquantes().length === 0;
}

/** Champs vidés APRÈS validation : le résultat attend qu'ils soient remplis. */
function valeursManquantes() {
  return zonesDuParcours().flatMap(champsVides);
}

/**
 * Zone de résultat en attente : tant qu'une bulle manque, on n'affiche aucun
 * chiffre. Calculer sur des valeurs par défaut donnerait une réponse d'allure
 * sérieuse à une question que l'utilisateur n'a pas encore posée.
 */
function majAttente() {
  const complet = parcoursComplet();
  const visu = $('#visu');
  const etaitEnAttente = visu.dataset.etat === 'attente';
  visu.dataset.etat = complet ? 'pret' : 'attente';

  if (!complet) {
    const faites = validees.size;
    const jauge = $('#attenteJauge');
    jauge.setAttribute('aria-valuenow', String(faites));
    jauge.innerHTML = BULLES.map(
      (n) => `<span class="attente__cran${validees.has(n) ? ' attente__cran--faite' : ''}"></span>`
    ).join('');
    const manquantes = profilValide && validees.size === BULLES.length ? valeursManquantes() : [];
    $('#attenteCompte').textContent = manquantes.length
      ? `Il manque ${manquantes.length > 1 ? 'des valeurs' : 'une valeur'} : ${manquantes.map(libelleDe).join(', ')}.`
      : !profilValide
      ? 'Commencez par renseigner votre situation actuelle.'
      : faites === 0
        ? 'Aucune bulle renseignée pour le moment.'
        : `${faites} bulle${faites > 1 ? 's' : ''} sur ${BULLES.length} renseignée${faites > 1 ? 's' : ''}.`;
  } else if (etaitEnAttente) {
    // Les graphiques ont été dimensionnés alors que leur conteneur était
    // masqué : il faut les remesurer une fois la zone révélée.
    for (const graphique of [graphPatrimoine, graphMel]) {
      if (graphique) graphique.resize();
    }
  }

  return complet;
}

/** Première bulle non validée : la seule ouvrable au premier passage. */
function prochaineBulle() {
  if (!profilValide) return null;
  return BULLES.find((n) => !validees.has(n)) ?? null;
}

/**
 * Anime un élément depuis sa position précédente vers la nouvelle (FLIP).
 * On mesure avant, on applique le changement, on mesure après, puis on joue
 * l'écart à l'envers : le navigateur n'anime qu'une transformation.
 */
function volerVers(el, appliquerChangement) {
  // Un vol précédent encore en cours fausserait la mesure et les deux
  // transformations se superposeraient (clics rapides, onglet en arrière-plan
  // où les animations ne progressent pas).
  for (const anim of el.getAnimations()) anim.cancel();

  const avant = el.getBoundingClientRect();
  appliquerChangement();
  const apres = el.getBoundingClientRect();

  if (!avant.width || !apres.width) return null;

  const dx = avant.left - apres.left;
  const dy = avant.top - apres.top;
  const echelle = avant.width / apres.width;

  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, opacity: 0.75 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(.22, .8, .28, 1)' }
  );
}

/** Reflète l'état de chaque bulle : verrouillée, ouvrable ou validée. */
function majBulles() {
  const prochaine = prochaineBulle();
  $('#formulaire').classList.toggle('plateau--bloque', !profilValide);

  for (const n of BULLES) {
    const el = bulle(n);
    const estValidee = validees.has(n);
    const estOuvrable = n === prochaine;

    el.classList.toggle('bulle--validee', estValidee);
    el.classList.toggle('bulle--ouvrable', estOuvrable && n !== bulleZoomee);
    el.classList.toggle('bulle--verrouillee', !estValidee && !estOuvrable);

    const tete = el.querySelector('.bulle__declencheur');
    tete.disabled = !estValidee && !estOuvrable && n !== bulleZoomee;
    tete.setAttribute('aria-expanded', String(n === bulleZoomee));

    // Une fois la bulle validée, ses champs restent modifiables sur place :
    // faire varier une hypothèse ne doit pas demander de rouvrir une fenêtre.
    for (const champ of el.querySelectorAll('input, select')) {
      // Un taux piloté par un scénario reste verrouillé, même dans une bulle
      // validée : sinon `majBulles` le rouvrirait à chaque recalcul.
      const pilote = scenarioActif && TAUX_SCENARISES.includes(champ.id);
      champ.disabled = pilote || (!estValidee && n !== bulleZoomee);
    }
  }
  // La carte des scénarios suit la progression des bulles, résultat ou non.
  majScenario();
}

/**
 * Alvéole d'origine de la bulle actuellement zoomée, le temps du zoom.
 *
 * Le rail de gauche a été en `position: sticky`, ce qui crée un contexte
 * d'empilement — toujours, même sans `z-index`. Une bulle qui y restait ne
 * pouvait donc pas passer au-dessus du voile : les bulles 3 et 4 s'ouvraient
 * au centre mais sous l'écran grisé, hors d'atteinte. Le rail ne colle plus,
 * mais on garde la sortie pendant le zoom : elle protège de tout contexte
 * d'empilement qu'un parent pourrait recréer (sticky, transform, filter…). Le FLIP
 * absorbe le déplacement sans qu'on ait à le lui dire : il mesure la position
 * avant et après, quel que soit le parent.
 */
let alveole = null;

function ouvrirBulle(n) {
  if (bulleZoomee !== null) return;
  const el = bulle(n);

  bulleZoomee = n;
  $('#voile').hidden = false;
  volerVers(el, () => {
    el.classList.add('bulle--zoom');
    el.classList.remove('bulle--ouvrable', 'bulle--verrouillee');
    alveole = el.parentElement;
    document.body.append(el);
  });

  majBulles();
  const premier = el.querySelector('input, select');
  if (premier) premier.focus();
}

function validerBulle(n) {
  // `n === null` arriverait si le voile était cliqué sans bulle ouverte : on
  // ajouterait `null` aux bulles validées et `bulle(null)` casserait.
  if (n === null || bulleZoomee !== n) return;
  const el = bulle(n);
  const vides = champsVides(el);
  if (vides.length) {
    signalerVides(vides);
    return;
  }

  validees.add(n);
  bulleZoomee = null;
  $('#voile').hidden = true;

  volerVers(el, () => {
    if (alveole) { alveole.append(el); alveole = null; }
    el.classList.remove('bulle--zoom');
  });
  majBulles();
  recalculer();

  // On enchaîne : la bulle suivante devient visiblement la prochaine à remplir.
  const suivante = prochaineBulle();
  if (suivante !== null) bulle(suivante).querySelector('.bulle__declencheur').focus();
}

function initialiserBulles() {
  for (const n of BULLES) {
    bulle(n).querySelector(`[data-ouvrir="${n}"]`)
      .addEventListener('click', () => ouvrirBulle(n));
    bulle(n).querySelector(`[data-valider="${n}"]`)
      .addEventListener('click', () => validerBulle(n));
  }

  // Fermer par le voile ou par Échap vaut validation : tous les champs ont
  // déjà une valeur, il n'y a rien à annuler.
  // Le voile sert deux fenêtres : l'aperçu de scénario et la bulle zoomée.
  // Le voile sert trois vues : l'explication, l'aperçu et la bulle zoomée.
  $('#voile').addEventListener('click', () => {
    if (resultatMelOuvert()) return fermerResultatMel();
    if (fenetreMelOuverte()) return fermerFenetreMel();
    if (apercuOuvert()) return fermerApercu();
    if (introOuverte()) return fermerIntro();
    if (bulleZoomee !== null) validerBulle(bulleZoomee);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Choix obligatoire : Échap ne ferme la question que rouverte à la demande.
    if (questionOuverte()) { if (questionLibre) fermerQuestion(); return; }
    if (resultatMelOuvert()) return fermerResultatMel();
    if (fenetreMelOuverte()) return fermerFenetreMel();
    if (apercuOuvert()) return fermerApercu();
    if (introOuverte()) return fermerIntro();
    if (bulleZoomee !== null) validerBulle(bulleZoomee);
  });

  majBulles();
}

/* ------------------------------------------------------------ Saisie */

/**
 * Cliquer dans un champ de nombre en sélectionne le contenu : on écrit le
 * nouveau montant par-dessus, sans avoir à effacer l'ancien. C'est le geste
 * central du simulateur — on passe son temps à remplacer des valeurs, pas à
 * les corriger caractère par caractère.
 *
 * Deux subtilités :
 * - `.champ` est un `<label>` qui enveloppe son champ. Un clic n'importe où
 *   sur la case est donc déjà transmis au champ par le navigateur ; il ne
 *   reste qu'à sélectionner. C'est aussi pour cela qu'on ne sélectionne qu'au
 *   `click`, après le `mouseup` : sélectionner au `focus` seul ne tiendrait
 *   pas, le clic qui vient de donner le focus replace le curseur juste après.
 * - Une fois dans le champ, un SECOND clic doit pouvoir placer le curseur pour
 *   retoucher un chiffre. On ne sélectionne donc qu'à l'entrée dans le champ,
 *   pas à chaque clic.
 */
function initialiserSaisie() {
  let entrant = null;

  document.addEventListener('focusin', (e) => {
    if (!e.target.matches('.champ input[type="number"]')) return;
    entrant = e.target;
    e.target.select();          // suffit pour une arrivée au clavier (Tab)
  });

  // Arrivée à la souris : le clic a replacé le curseur, on resélectionne.
  document.addEventListener('click', (e) => {
    if (e.target !== entrant) return;
    e.target.select();
    entrant = null;
  });

  document.addEventListener('focusout', () => { entrant = null; });
  // Le focus a quitté un champ : si une question attendait la fin de la
  // frappe, c'est le moment. Après coup (setTimeout), une fois le focus posé
  // ailleurs — s'il passe dans un autre champ numérique, on attend encore.
  document.addEventListener('focusout', (e) => {
    if (e.target.tagName !== 'INPUT' || e.target.type !== 'number') return;
    setTimeout(() => { if (!saisieEnCours()) recalculer(); }, 0);
  });
}

function initialiser() {
  remplirFormulaire(VALEURS_DE_TRAVAIL);
  remplirProfil(PROFIL_DE_TRAVAIL);
  remplirFormulaireMel();
  initialiserLiaisons();
  armerLiaisons();
  initialiserSaisie();
  initialiserDetail();
  construireScenarios();
  // Taper « 20 » à la place de « 25 », c'est passer par « 2 » : recalculer à
  // chaque touche ferait défiler une simulation absurde. Dans un champ
  // numérique, on attend une courte pause de frappe ; ailleurs (listes, cases,
  // réponses), on recalcule tout de suite.
  const recalculerApresFrappe = Sauvegarde.differer(recalculer, 350);
  const surSaisie = (e) => (e.target.type === 'number' ? recalculerApresFrappe() : recalculer());
  $('#formulaire').addEventListener('input', surSaisie);
  // Le profil vit hors du plateau : sans son propre écouteur, l'éditer ne
  // recalculerait rien avant le clic sur « Valider mon profil ».
  $('#profil').addEventListener('input', surSaisie);

  $('#horizon').addEventListener('input', rafraichir);
  // Deux contrôles, un seul état : le rappel écrit dans le curseur principal,
  // qui reste la source de vérité. Jamais deux dates à l'écran.
  for (const id of ['#horizonBis', '#horizonMel']) {
    $(id).addEventListener('input', () => {
      $('#horizon').value = $(id).value;
      rafraichir();
    });
  }
  // Nouvelle simulation en deux temps : effacer la saisie et le brouillon est
  // irréversible, un clic égaré ne doit pas suffire.
  const confirmerNouvelle = (oui) => {
    $('#nouvelle').dataset.etat = oui ? 'confirmer' : 'repos';
    (oui ? $('#reinitialiserNon') : $('#reinitialiser')).focus();
  };
  $('#reinitialiser').addEventListener('click', () => confirmerNouvelle(true));
  $('#reinitialiserNon').addEventListener('click', () => confirmerNouvelle(false));
  $('#nouvelle').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#nouvelle').dataset.etat === 'confirmer') confirmerNouvelle(false);
  });
  $('#reinitialiserOui').addEventListener('click', () => {
    $('#nouvelle').dataset.etat = 'repos';
    remplirFormulaire(VALEURS_DE_TRAVAIL);
    remplirProfil(PROFIL_DE_TRAVAIL);
    for (const el of document.querySelectorAll('[aria-invalid]')) oublierSignalement(el);
    armerLiaisons();
    $('#horizon').value = 20;
    validees.clear();
    profilValide = false;
    epargneForceeRepondue = false;
    if (questionOuverte()) fermerQuestion();
    scenarioActif = null;
    hypothesesUtilisateur = null;
    scenariosDecouverts = false;
    appliquerScenario('');
    // Le module de mise en location repart fermé et vide : ses loyers
    // décrivaient l'ancien projet.
    melActif = false;
    $('#melAnneeBascule').value = 10;
    for (const id of ['#melLoyerPercu', '#melLoyerFutur']) {
      $(id).value = '';
      delete $(id).dataset.auto;
    }
    remplirFormulaireMel();
    ouvrirProfil();
    majBulles();
    // Réinitialiser, c'est repartir de zéro : le brouillon part avec.
    Sauvegarde.effacer();
    direBrouillon('');
    recalculer();
  });

  $('#profilValider').addEventListener('click', figerProfil);
  $('#profilModifier').addEventListener('click', ouvrirProfil);

  // La case reçoit l'événement AVANT le bandeau qui l'écoute par propagation :
  // on mémorise ici l'écart affiché, pour dire ensuite de combien il a bougé.
  // Les réponses : dans la bulle comme dans la petite ligne.
  for (const b of document.querySelectorAll('[data-reponse]')) {
    b.addEventListener('click', () => repondre(b.dataset.reponse === 'oui'));
  }
  // « Pourquoi ? » rouvre la bulle, qui se ferme alors librement.
  $('#questionRouvrir').addEventListener('click', () => ouvrirQuestion(true));
  // Les deux choix, en toutes lettres. Cliquer celui déjà actif ne fait rien :
  // ce n'est pas une bascule, c'est une sélection.
  for (const b of document.querySelectorAll('.choix__option')) {
    b.addEventListener('click', () => repondre(b.dataset.choix === 'aligne'));
  }
  $('#voileQuestion').addEventListener('click', () => { if (questionLibre) fermerQuestion(); });

  initialiserBulles();

  // Divulgation progressive : le module n'existe qu'après un clic explicite.
  for (const id of ['#melOuvrir', '#melModifier']) {
    $(id).addEventListener('click', ouvrirFenetreMel);
  }
  // L'entrée dans le module, pas ses retouches (#melModifier).
  $('#melOuvrir').addEventListener('click', () => Mesure.suivre('location_module_ouvert'));
  // Depuis les résultats : on referme, puis on rouvre la saisie.
  $('#melModifierBis').addEventListener('click', () => {
    fermerResultatMel();
    ouvrirFenetreMel();
  });
  $('#melVoir').addEventListener('click', ouvrirResultatMel);
  $('#melResultatFermer').addEventListener('click', fermerResultatMel);
  $('#melFermer').addEventListener('click', fermerFenetreMel);
  $('#melValider').addEventListener('click', () => {
    melActif = true;
    fermerFenetreMel();
    recalculer();
    enregistrerBrouillon();
    ouvrirResultatMel();
  });
  $('#melRetirer').addEventListener('click', () => {
    melActif = false;
    recalculer();
    enregistrerBrouillon();
  });
  // Le curseur fait suivre les loyers proposés, tant qu'ils n'ont pas été touchés.
  $('#melAnneeBascule').addEventListener('input', proposerLoyers);
  for (const id of ['#melLoyerPercu', '#melLoyerFutur']) {
    $(id).addEventListener('input', () => { delete $(id).dataset.auto; });
  }
  for (const b of document.querySelectorAll('.mel__option')) {
    b.addEventListener('click', () => {
      $('#melRegime').value = b.dataset.regime;
      // Même chemin qu'une saisie : recalcul et brouillon.
      $('#melRegime').dispatchEvent(new Event('input', { bubbles: true }));
      $('#melRegime').dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  // `recalculer` et non plus `rafraichir` : le loyer payé après la bascule
  // peut relever l'enveloppe du moteur de base (voir `recalculer`).
  $('#melFormulaire').addEventListener('input', surSaisie);

  // Mesure : le NOM du champ touché, jamais sa valeur. Branché avant la
  // restauration, qui remplit les champs sans émettre d'événement.
  const suivreSaisie = (e) => {
    const el = e.target;
    if (!el.id || !el.matches('input, select, textarea')) return;
    const champ = /^horizon(Bis|Mel)$/.test(el.id) ? 'horizon' : el.id;
    Mesure.suivreUneFois('demarree', 'sim_demarree');
    Mesure.suivreUneFois('champ:' + champ, 'sim_champ_modifie', { champ });
  };
  document.addEventListener('input', suivreSaisie);
  document.addEventListener('change', suivreSaisie);

  // En dernier : la restauration écrase les défauts et l'état du parcours.
  initialiserBrouillon();

  recalculer();
}

initialiser();

})();
