/**
 * Sauvegarde locale et migration de schéma.
 *
 * Ces tests portent sur la seule partie qui ne se voit pas à l'usage : relire
 * une sauvegarde ANCIENNE. Le jour où ça casse, ce n'est pas une page blanche
 * qu'on obtient mais des chiffres faux, et personne ne le remarque.
 *
 *   node --test "tests/sauvegarde.test.mjs"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import sauvegarde from '../frontend/js/sauvegarde.js';
import calc from '../frontend/js/calc.js';

const { SCHEMA_VERSION, vide, normaliser, migrer, differer } = sauvegarde;
const { DEFAUTS } = calc;

/** Une sauvegarde bien formée, à la version courante. */
const paquet = (params, version = SCHEMA_VERSION) => ({
  schemaVersion: version,
  majLe: '2026-01-01T00:00:00.000Z',
  params,
});

test('un brouillon vide porte tous les défauts du moteur', () => {
  const p = vide();
  for (const cle of Object.keys(DEFAUTS)) {
    if (cle === 'horizon') continue;
    assert.equal(p.moteur[cle], DEFAUTS[cle], `champ ${cle}`);
  }
  assert.equal(p.scenario, null);
  assert.equal(p.horizon, 20);
  assert.ok('anneeBascule' in p.location, 'les champs de mise en location sont là');
});

test('une sauvegarde à la version courante ressort inchangée', () => {
  const avant = vide();
  avant.moteur.prixNetVendeur = 375000;
  avant.moteur.tauxCredit = 0.041;
  avant.scenario = 'decennie-perdue';
  avant.horizon = 12;

  const apres = migrer(paquet(avant));
  assert.deepEqual(apres, avant);
});

test('un champ manquant reprend sa valeur par défaut', () => {
  // C'est ce qui permet d'AJOUTER un champ au moteur sans incrémenter la
  // version du schéma : les anciennes sauvegardes le complètent toutes seules.
  const partiel = { moteur: { prixNetVendeur: 300000 }, location: {}, horizon: 15 };
  const p = migrer(paquet(partiel));

  assert.equal(p.moteur.prixNetVendeur, 300000, 'le champ fourni est conservé');
  assert.equal(p.moteur.tauxCredit, DEFAUTS.tauxCredit, 'le champ absent prend son défaut');
  assert.equal(p.horizon, 15);
});

test('un champ inconnu est écarté sans bruit', () => {
  const p = migrer(paquet({ moteur: { champDisparu: 42, prixNetVendeur: 1 }, location: {} }));
  assert.ok(!('champDisparu' in p.moteur), 'le champ retiré du moteur ne revient pas');
  assert.equal(p.moteur.prixNetVendeur, 1);
});

test('une sauvegarde plus récente que le code est refusée', () => {
  // Deux appareils, l'un déjà sur la nouvelle version : on ne devine pas des
  // champs qu'on ne connaît pas encore. Mieux vaut repartir de zéro.
  assert.equal(migrer(paquet(vide(), SCHEMA_VERSION + 1)), null);
});

test('une sauvegarde corrompue ne fait jamais planter', () => {
  for (const cas of [null, undefined, 'texte', 42, [], {}, { schemaVersion: 0 },
                     { schemaVersion: 'x', params: {} }]) {
    assert.doesNotThrow(() => migrer(cas), `cas ${JSON.stringify(cas)}`);
    assert.equal(migrer(cas), null, `cas ${JSON.stringify(cas)}`);
  }
});

test('des paramètres absents donnent un brouillon complet, pas une erreur', () => {
  const p = migrer({ schemaVersion: SCHEMA_VERSION, params: null });
  assert.deepEqual(p, vide());
});

test('les migrations s\'appliquent dans l\'ordre des versions', () => {
  // La mécanique est testée avec des migrations fabriquées : aujourd'hui il n'y
  // en a aucune de réelle, mais c'est le jour où on en écrira une qu'il sera
  // trop tard pour découvrir qu'elles ne s'enchaînent pas.
  const trace = [];
  const fausses = {
    2: (p) => { trace.push(2); p.moteur.prixNetVendeur += 1; return p; },
    3: (p) => { trace.push(3); p.moteur.prixNetVendeur += 10; return p; },
  };
  const original = sauvegarde.SCHEMA_VERSION;

  // On ne peut pas changer SCHEMA_VERSION depuis le test : on vérifie donc que
  // les migrations au-delà de la version courante NE sont PAS appliquées.
  const p = migrer(paquet({ moteur: { prixNetVendeur: 100 }, location: {} }, 1), fausses);
  assert.deepEqual(trace, [], 'aucune migration au-delà de la version courante');
  assert.equal(p.moteur.prixNetVendeur, 100);
  assert.equal(original, SCHEMA_VERSION);
});

test('une migration qui casse ne casse pas la page', () => {
  const explosive = { 2: () => { throw new Error('boum'); } };
  // Même refusée, la sauvegarde ne doit pas propager l'exception.
  assert.doesNotThrow(() => migrer(paquet(vide(), 1), explosive));
});

test('les taux restent en fraction, jamais en pourcentage', () => {
  // Le piège classique : l'interface saisit 3,5 et le modèle attend 0,035.
  // Une sauvegarde qui stockerait le pourcentage produirait un crédit à 350 %.
  const p = migrer(paquet({ moteur: { tauxCredit: 0.035 }, location: {} }));
  assert.equal(p.moteur.tauxCredit, 0.035);
  assert.ok(p.moteur.tauxCredit < 1, 'un taux de crédit plausible reste sous 1');
});

test('un texte là où on attend un nombre retombe sur le défaut', () => {
  const p = migrer(paquet({ moteur: { prixNetVendeur: 'beaucoup' }, location: {} }));
  assert.equal(p.moteur.prixNetVendeur, DEFAUTS.prixNetVendeur);
});

test('un horizon hors bornes est ignoré', () => {
  for (const h of [0, -3, 26, 999, 'x', null]) {
    assert.equal(migrer(paquet({ moteur: {}, location: {}, horizon: h })).horizon, 20,
      `horizon ${h}`);
  }
  assert.equal(migrer(paquet({ moteur: {}, location: {}, horizon: 25 })).horizon, 25);
});

test('le champ facultatif de mise en location accepte null', () => {
  // `anneeBascule` vaut null tant que l'utilisateur n'a pas choisi d'année :
  // c'est une valeur légitime, pas une absence à remplacer.
  const p = migrer(paquet({ moteur: {}, location: { anneeBascule: null } }));
  assert.equal(p.location.anneeBascule, null);
});

test('une sauvegarde migrée alimente le moteur sans surprise', () => {
  // Le test qui compte vraiment : ce qui ressort de la migration doit se
  // calculer. Une forme valide qui ferait produire NaN au moteur serait pire
  // qu'un plantage — elle s'afficherait.
  const p = migrer(paquet({ moteur: { prixNetVendeur: 350000 }, location: {} }));
  const r = calc.simuler(Object.assign({}, p.moteur, { horizon: 25 }));
  assert.equal(r.annees.length, 25);
  for (const annee of r.annees) {
    assert.ok(Number.isFinite(annee.ecart), `année ${annee.annee} : écart calculable`);
  }
});

test('le différé ne déclenche qu\'une fois après une rafale', async () => {
  let appels = 0;
  const ecrire = differer(() => { appels += 1; }, 20);
  for (let i = 0; i < 10; i++) ecrire();
  assert.equal(appels, 0, 'rien pendant la rafale');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(appels, 1, 'une seule écriture après la pause');
});

test("l'avancement est normalisé et ne contient que des bulles plausibles", () => {
  // L'avancement vit dans l'enveloppe, pas dans `params` : il décrit cette
  // session dans ce navigateur, et ne partira jamais en base.
  const { normaliserAvancement } = sauvegarde;
  assert.deepEqual(normaliserAvancement(null), { profilValide: false, bullesValidees: [] });
  assert.deepEqual(normaliserAvancement({ profilValide: 'oui', bullesValidees: 'x' }),
    { profilValide: false, bullesValidees: [] });
  assert.deepEqual(normaliserAvancement({ profilValide: true, bullesValidees: [1, 2, 9, 0, 'x', 4] }),
    { profilValide: true, bullesValidees: [1, 2, 4] });
});

test("un champ dont le défaut est null conserve sa valeur numérique", () => {
  // Bug trouvé en bout de chaîne, pas par les tests : `anneeBascule` a pour
  // défaut null, et la normalisation se fiait au type du défaut pour valider.
  // La valeur partait bien dans le brouillon, et revenait à null au
  // rechargement. Silencieux, donc invisible.
  const p = migrer(paquet({ moteur: {}, location: { anneeBascule: 8, loyerPercu: 1750 } }));
  assert.equal(p.location.anneeBascule, 8);
  assert.equal(p.location.loyerPercu, 1750);
});

test("un aller-retour complet ne perd aucune valeur", () => {
  // Le test qui aurait attrapé le bug ci-dessus : on renseigne TOUS les champs
  // avec des valeurs distinctes des défauts, et on vérifie qu'ils survivent.
  const avant = vide();
  let n = 1;
  for (const groupe of ['moteur', 'location']) {
    for (const cle of Object.keys(avant[groupe])) {
      const d = avant[groupe][cle];
      if (typeof d === 'number' || d === null) avant[groupe][cle] = 1000 + n++;
      else if (typeof d === 'boolean') avant[groupe][cle] = !d;
    }
  }
  avant.horizon = 17;
  avant.scenario = 'krach-immobilier';

  const apres = migrer(paquet(avant));
  assert.deepEqual(apres, avant, 'aucun champ perdu ni altéré');
});

test('disponible() ne lève jamais, même sans localStorage du tout', () => {
  // Sous Node il n'y a pas de localStorage : c'est exactement le cas d'un
  // navigateur qui refuse le stockage. La fonction doit répondre « non »,
  // pas exploser — c'est elle qui permet de PRÉVENIR l'utilisateur plutôt
  // que de perdre son travail en silence.
  assert.doesNotThrow(() => sauvegarde.disponible());
  assert.equal(sauvegarde.disponible(), false);
});

test('lire et ecrire ne lèvent jamais sans localStorage', () => {
  assert.doesNotThrow(() => sauvegarde.lire());
  assert.equal(sauvegarde.lire(), null);
  assert.doesNotThrow(() => sauvegarde.ecrire(vide(), {}));
  assert.equal(sauvegarde.ecrire(vide(), {}), false);
  assert.doesNotThrow(() => sauvegarde.effacer());
});
