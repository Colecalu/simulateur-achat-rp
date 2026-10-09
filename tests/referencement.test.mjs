/**
 * Ce que les pages écrivent EN DUR pour les moteurs de recherche et les
 * assistants IA, qui pour la plupart n'exécutent pas le JavaScript.
 *
 * Un texte recopié diverge de sa source tôt ou tard. Ces tests font tomber la
 * CI — donc bloquent le déploiement — dès qu'un chiffre, une FAQ ou une
 * hypothèse affichés ne disent plus la même chose que le moteur ou que la
 * page visible. Le remède est presque toujours :
 *
 *   node outils/accueil-statique.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import calc from '../frontend/js/calc.js';
import {
  appliquer, calculer, entitesFaq, lireAffiche, lireDonneesStructurees, lireEntrees, lireFaq,
} from '../outils/accueil-statique.mjs';

const lire = (fichier) => readFileSync(new URL('../frontend/' + fichier, import.meta.url), 'utf8');
const accueil = lire('index.html');
const simulateur = lire('simulateur.html');

/** Le texte tel que l'affiche le navigateur : sans balises, blancs repliés. */
const texte = (html) => html
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/[ \t\r\n]+/g, ' ')
  .trim();

function jsonLd(html) {
  const blocs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocs.length, 1, 'un seul bloc JSON-LD par page');
  return JSON.parse(blocs[0][1]);
}

const meta = (html, motif) => {
  const m = new RegExp(motif).exec(html);
  return m && m[1];
};

/* ------------------------------------------------- Aperçu de l'accueil */

test("aperçu : les chiffres écrits dans l'accueil sont ceux du moteur", () => {
  assert.deepEqual(lireAffiche(accueil), calculer(lireEntrees(accueil)));
});

test("aperçu : l'exemple a un point mort, qui tient jusqu'au bout", () => {
  // Le point mort est la réponse au « Et si vous partiez plus tôt ? » de la
  // section 04 : un exemple sans croisement ne montrerait rien.
  const entrees = lireEntrees(accueil);
  const res = calc.simuler(Object.assign({}, calc.DEFAUTS, entrees));
  assert.ok(res.premiereAnneeFavorable > 1, 'la location doit être devant au début');
  assert.ok(res.annees[res.annees.length - 1].ecart > 0, "l'achat doit rester devant à la fin");
});

test("aperçu : aucun retournement jusqu'à 25 ans, au-delà de l'horizon affiché", () => {
  // L'aperçu s'arrête à 20 ans : un exemple dont la location repasserait
  // devant juste après (cas du loyer à 800 €, 21e année) montrerait une
  // avance que la suite dément.
  const entrees = Object.assign({}, lireEntrees(accueil), { horizon: 25 });
  const res = calc.simuler(Object.assign({}, calc.DEFAUTS, entrees));
  const apres = res.annees.filter((a) => a.annee >= res.premiereAnneeFavorable);
  assert.ok(apres.every((a) => a.ecart > 0), 'la location repasse devant avant 25 ans');
});

test("aperçu : les taux de marché de l'exemple sont ceux du simulateur", () => {
  // La phrase affichée dit « hypothèses de marché par défaut du simulateur ».
  const entrees = lireEntrees(accueil);
  for (const cle of Object.keys(calc.TENDANCE_LONGUE)) {
    assert.ok(!(cle in entrees), cle + ' ne doit pas être fixé par l’exemple');
  }
  assert.ok(!('fiscalitePlusValues' in entrees));
});

/* ---------------------------------------------------------------- FAQ */

test('FAQPage : questions et réponses identiques à la FAQ visible', () => {
  const graphe = lireDonneesStructurees(accueil);
  const faq = graphe['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.deepEqual(faq.mainEntity, entitesFaq(accueil));
  assert.equal(faq.mainEntity.length, lireFaq(accueil).length);
  assert.ok(faq.mainEntity.length >= 10);
});

test("accueil : relancer l'outil ne change rien (aperçu et FAQPage à jour)", () => {
  assert.equal(appliquer(accueil), accueil);
});

/* ---------------------------------------------------- Données structurées */

test('JSON-LD : chaque référence @id pointe vers une entité décrite', () => {
  const noeuds = [...jsonLd(accueil)['@graph'], ...jsonLd(simulateur)['@graph']];
  const definis = new Set(noeuds.map((n) => n['@id']));
  const references = [];
  const parcourir = (v) => {
    if (Array.isArray(v)) return v.forEach(parcourir);
    if (v && typeof v === 'object') {
      if (Object.keys(v).length === 1 && v['@id']) references.push(v['@id']);
      Object.values(v).forEach(parcourir);
    }
  };
  noeuds.forEach((n) => Object.entries(n).forEach(([cle, v]) => cle !== '@id' && parcourir(v)));
  assert.ok(references.length > 0);
  for (const id of references) assert.ok(definis.has(id), 'référence orpheline : ' + id);
});

test('JSON-LD du simulateur : la featureList reprend « Æquo en bref » mot pour mot', () => {
  const debut = accueil.indexOf('<ul class="bref__liste">');
  const fin = accueil.indexOf('</ul>', debut);
  const phrases = [...accueil.slice(debut, fin).matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => texte(m[1]));
  const appli = jsonLd(simulateur)['@graph'].find((n) => n['@type'] === 'WebApplication');
  assert.deepEqual(appli.featureList, phrases);
  assert.equal(phrases.length, 7);
});

test('JSON-LD : nom et description de chaque page identiques à ses balises', () => {
  for (const html of [accueil, simulateur]) {
    const titre = meta(html, '<title>([^<]+)</title>');
    const description = meta(html, '<meta name="description" content="([^"]+)">');
    assert.equal(meta(html, '<meta property="og:title" content="([^"]+)">'), titre);
    assert.equal(meta(html, '<meta name="twitter:title" content="([^"]+)">'), titre);
    assert.equal(meta(html, '<meta property="og:description" content="([^"]+)">'), description);
    assert.equal(meta(html, '<meta name="twitter:description" content="([^"]+)">'), description);
    const page = jsonLd(html)['@graph'].find((n) => n['@type'] === 'WebPage');
    assert.equal(page.name, titre);
    assert.equal(page.description, description);
    assert.match(page.dateModified, /^\d{4}-\d{2}-\d{2}$/);
  }
});

/* ------------------------------------------ Hypothèses et sources (simulateur) */

test('sources : les valeurs affichées sont les défauts du moteur', () => {
  const pourcent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const affiches = [...simulateur.matchAll(/<span data-hypothese="(\w+)">([^<]+)<\/span>/g)];
  assert.equal(affiches.length, 7);
  for (const [, cle, valeur] of affiches) {
    assert.ok(cle in calc.DEFAUTS, cle + ' : clé inconnue du moteur');
    const attendu = pourcent.format(calc.DEFAUTS[cle] * 100) + ' %';
    assert.ok(texte(valeur).startsWith(attendu), `${cle} : « ${texte(valeur)} » au lieu de ${attendu}`);
  }
});

/* ----------------------------------------------------------- Structure */

test('un seul <h1> par page', () => {
  for (const fichier of ['index.html', 'simulateur.html', 'mentions-legales.html', 'confidentialite.html', '404.html']) {
    const sansCommentaires = lire(fichier).replace(/<!--[\s\S]*?-->/g, '');
    assert.equal((sansCommentaires.match(/<h1[\s>]/g) || []).length, 1, fichier);
  }
});

test("accueil : le <h1> est la question, le slogan n'est plus un titre", () => {
  assert.match(accueil, /<h1 class="intro" id="titre">Acheter ou louer votre résidence principale&nbsp;\?<\/h1>/);
  assert.match(accueil, /<p class="cover__slogan">/);
});

test('robots.txt ne bloque rien', () => {
  // Un robot à qui l'on interdit une page n'y voit pas le noindex (CLAUDE.md §13).
  assert.doesNotMatch(lire('robots.txt'), /^\s*Disallow:\s*\S/m);
});

test('IndexNow : un seul fichier de clé, qui contient son propre nom', () => {
  const cles = readdirSync(new URL('../frontend/', import.meta.url)).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.equal(cles.length, 1);
  assert.equal(lire(cles[0]).trim(), cles[0].replace('.txt', ''));
});

/* ------------------------------------------------- Indexation (lancement) */

const NOINDEX = /<meta name="robots" content="[^"]*noindex/;
const sansCommentaires = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

test("lancement public : l'accueil et le simulateur sont indexables", () => {
  for (const fichier of ['index.html', 'simulateur.html']) {
    assert.doesNotMatch(sansCommentaires(lire(fichier)), NOINDEX, fichier);
  }
});

test('pages légales et 404 : noindex gardé', () => {
  for (const fichier of ['mentions-legales.html', 'confidentialite.html', '404.html']) {
    assert.match(sansCommentaires(lire(fichier)), NOINDEX, fichier);
  }
});

test('sitemap : exactement les pages indexables, aucune en noindex', () => {
  const sitemap = lire('sitemap.xml');
  const adresses = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(adresses, ['https://aequo-immo.fr/', 'https://aequo-immo.fr/simulateur']);
  const fichiers = { 'https://aequo-immo.fr/': 'index.html', 'https://aequo-immo.fr/simulateur': 'simulateur.html' };
  for (const adresse of adresses) {
    const html = lire(fichiers[adresse]);
    assert.doesNotMatch(sansCommentaires(html), NOINDEX, adresse);
    // Même adresse que la balise canonical de la page.
    assert.match(html, new RegExp('<link rel="canonical" href="' + adresse + '">'));
  }
  // lastmod au format AAAA-MM-JJ, égal au dateModified du JSON-LD de la page.
  for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) {
    const page = jsonLd(lire(fichiers[m[1]]))['@graph'].find((n) => n['@type'] === 'WebPage');
    assert.equal(m[2], page.dateModified, m[1]);
  }
});
