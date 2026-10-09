/**
 * Ce que l'accueil écrit EN DUR pour les robots — OUTIL DE DÉVELOPPEMENT.
 *
 * Les robots des moteurs de recherche et des assistants IA n'exécutent pour
 * la plupart pas le JavaScript : ce qu'ils doivent lire doit être dans le
 * HTML servi. Mais un chiffre ou un texte recopié à la main finit par
 * diverger de sa source. Ce script fait le lien, pour deux blocs de
 * frontend/index.html :
 *
 *   1. l'aperçu chiffré (section 02) : il lit les entrées dans la page (bloc
 *      JSON #apercuEntrees), fait tourner calc.js et réécrit les chiffres et
 *      la phrase d'hypothèses ;
 *   2. le JSON-LD FAQPage du <head> : il recopie les questions et réponses de
 *      la FAQ visible, mot pour mot.
 *
 *   node outils/accueil-statique.mjs              réécrit frontend/index.html
 *   node outils/accueil-statique.mjs --verifier   sort en erreur si la page diverge
 *
 * tests/referencement.test.mjs fait la même vérification : si le moteur ou la FAQ
 * change, la CI tombe tant que ce script n'a pas été relancé.
 *
 * Les formats de l'aperçu (euros, « 6 ans ») sont ceux d'accueil.js, qui
 * recalcule au chargement : la page servie et la page hydratée doivent
 * afficher le même texte. Changer l'un oblige à changer l'autre.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import calc from '../frontend/js/calc.js';

export const CHEMIN_ACCUEIL = fileURLToPath(new URL('../frontend/index.html', import.meta.url));

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const pourcent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const ans = (n) => n + ' an' + (n > 1 ? 's' : '');

/** Les entrées de l'exemple, lues dans la page : une seule source. */
export function lireEntrees(html) {
  const m = /<script type="application\/json" id="apercuEntrees">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Bloc #apercuEntrees introuvable dans index.html');
  return JSON.parse(m[1]);
}

/** Ce que la page doit afficher, calculé par le moteur. */
export function calculer(entrees) {
  const resultat = calc.simuler(Object.assign({}, calc.DEFAUTS, entrees));
  const annees = resultat.annees;
  const derniere = annees[annees.length - 1];
  const pointMort = resultat.premiereAnneeFavorable;
  const e = Object.assign({}, calc.DEFAUTS, entrees);
  return {
    duree: ans(annees.length),
    achat: euros.format(derniere.patrimoineTotalAchat),
    location: euros.format(derniere.patrimoineTotalLocation),
    pointMort: pointMort === null ? 'Jamais' : pointMort === 1 ? 'Dès la 1re année' : ans(pointMort),
    // Une phrase, construite sur les entrées pour ne jamais les contredire.
    // « Grande ville de région » est le seul élément qui n'en vient pas :
    // c'est ce que représente ce couple prix / loyer.
    hypotheses:
      'Exemple illustratif : un logement ' + e.typeBien + ' à ' + euros.format(e.prixNetVendeur) +
      ' dans une grande ville de région, ' + euros.format(e.apport) + ' d’apport, un crédit sur ' +
      ans(e.dureeAnnees) + ' à ' + pourcent.format(e.tauxCredit * 100) + ' %, face à un loyer de ' +
      euros.format(e.loyer) + ' par mois, avec les hypothèses de marché par défaut du simulateur.',
  };
}

const CIBLES = {
  duree: /(<span id="apercuDuree">)[^<]*(<\/span>)/,
  achat: /(<dd id="apercuAchat">)[^<]*(<\/dd>)/,
  location: /(<dd id="apercuLocation">)[^<]*(<\/dd>)/,
  pointMort: /(<dd id="apercuPointMort">)[^<]*(<\/dd>)/,
  hypotheses: /(<p class="apercu__hypotheses" id="apercuHypotheses">)[^<]*(<\/p>)/,
};

/** La page avec les chiffres du moteur. */
export function appliquerApercu(html) {
  const valeurs = calculer(lireEntrees(html));
  let sortie = html;
  for (const [cle, motif] of Object.entries(CIBLES)) {
    if (!motif.test(sortie)) throw new Error('Emplacement introuvable dans index.html : ' + cle);
    sortie = sortie.replace(motif, (_, avant, apres) => avant + valeurs[cle] + apres);
  }
  return sortie;
}

/** Ce que la page affiche aujourd'hui, pour le comparer au moteur. */
export function lireAffiche(html) {
  const affiche = {};
  for (const [cle, motif] of Object.entries(CIBLES)) {
    const m = new RegExp(motif.source.replace('[^<]*', '([^<]*)')).exec(html);
    affiche[cle] = m ? m[2] : null;
  }
  return affiche;
}

/* ------------------------------------------------------------- FAQPage */

const ENTITES = { nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** Le texte tel que l'affiche le navigateur : sans balises, blancs repliés. */
function texte(fragment) {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, nom) => ENTITES[nom])
    // Les blancs de mise en page seulement : l'espace insécable est du texte.
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

/**
 * Les questions et réponses de la FAQ visible, dans l'ordre. Une réponse est
 * la suite de ses paragraphes et de ses éléments de liste, séparés d'une
 * espace : c'est le texte qu'un lecteur lit, sans la mise en forme.
 */
export function lireFaq(html) {
  const debut = html.indexOf('<section class="faq"');
  const fin = html.indexOf('</section>', debut);
  if (debut < 0 || fin < 0) throw new Error('Section FAQ introuvable dans index.html');
  const section = html.slice(debut, fin);
  const questions = [];
  for (const m of section.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)) {
    const question = /<summary>([\s\S]*?)<\/summary>/.exec(m[1]);
    const morceaux = [...m[1].matchAll(/<(p|li)>([\s\S]*?)<\/\1>/g)].map((x) => texte(x[2]));
    questions.push({ question: texte(question[1]), reponse: morceaux.join(' ') });
  }
  return questions;
}

// \r?\n : sous Windows, git (core.autocrlf) rend les fichiers en CRLF ; sur la
// CI, en LF. L'outil et les tests doivent donner le même verdict des deux côtés.
const MOTIF_JSONLD = /(<script type="application\/ld\+json">\r?\n)([\s\S]*?)(\r?\n  <\/script>)/;

/** Le graphe JSON-LD du <head>. */
export function lireDonneesStructurees(html) {
  const m = MOTIF_JSONLD.exec(html);
  if (!m) throw new Error('Bloc JSON-LD introuvable dans index.html');
  return JSON.parse(m[2]);
}

/** Le nœud FAQPage tel qu'il doit être : la FAQ visible, rien d'autre. */
export function entitesFaq(html) {
  return lireFaq(html).map(({ question, reponse }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: reponse },
  }));
}

/** La page avec un FAQPage recopié de la FAQ visible. */
export function appliquerFaq(html) {
  const graphe = lireDonneesStructurees(html);
  const faq = graphe['@graph'].find((n) => n['@type'] === 'FAQPage');
  if (!faq) throw new Error('Nœud FAQPage introuvable dans le JSON-LD');
  faq.mainEntity = entitesFaq(html);
  // Les fins de ligne du fichier, pas celles de JSON.stringify : sinon la page
  // réécrite diffère de l'original sur un poste Windows, et --verifier échoue.
  const fin = html.includes('\r\n') ? '\r\n' : '\n';
  return html.replace(MOTIF_JSONLD, (_, avant, __, apres) =>
    avant + JSON.stringify(graphe, null, 2).replace(/\n/g, fin) + apres);
}

/** La page complète, telle que le script l'écrit. */
export function appliquer(html) {
  return appliquerFaq(appliquerApercu(html));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = readFileSync(CHEMIN_ACCUEIL, 'utf8');
  const attendu = appliquer(html);
  if (process.argv.includes('--verifier')) {
    if (attendu !== html) {
      console.error('index.html diverge du moteur ou de sa FAQ. Relancer : node outils/accueil-statique.mjs');
      process.exit(1);
    }
    console.log('Accueil à jour : aperçu et FAQPage.');
  } else {
    writeFileSync(CHEMIN_ACCUEIL, attendu);
    console.log(calculer(lireEntrees(html)));
    console.log(lireFaq(html).length + ' questions recopiées dans le FAQPage.');
  }
}
