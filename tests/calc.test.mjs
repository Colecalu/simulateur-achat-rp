/**
 * Vérifie que le moteur JS reproduit le classeur de référence.
 *
 * La fixture tests/fixtures/excel-paris.json contient les valeurs réellement
 * calculées par Excel pour le scénario « Paris » (defaults du moteur).
 * Toute divergence signifie que le port a dérivé du modèle métier.
 *
 *   node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import calc from '../frontend/js/calc.js';

const { simuler, fraisDeNotaire, mensualiteCredit } = calc;

const attendu = JSON.parse(
  readFileSync(new URL('./fixtures/excel-paris.json', import.meta.url), 'utf8')
);
const r = simuler();

/** Tolérance au centime : Excel et JS font tous deux du flottant 64 bits. */
const proche = (obtenu, cible, message) =>
  assert.ok(
    Math.abs(obtenu - cible) < 0.01,
    `${message} : obtenu ${obtenu}, attendu ${cible} (écart ${obtenu - cible})`
  );

test('agrégats d\'acquisition', () => {
  proche(r.fraisNotaire, attendu.fraisNotaire, 'frais de notaire');
  proche(r.coutAcquisition, attendu.coutAcquisition, 'coût total acquisition');
  proche(r.dettes, attendu.dettes, 'capital emprunté');
});

test('prêt', () => {
  proche(r.mensualiteCredit, attendu.mensualiteCredit, 'mensualité de crédit');
  proche(r.mensualiteTotale, attendu.mensualiteTotaleM1, 'mensualité crédit + assurance');
});

const champs = [
  'valeurBien',
  'crdFin',
  'totalDebourseAnnuel',
  'patrimoineNetImmo',
  'cumulDecaisse',
  'surplusProprio',
  'capitalAchatBrut',
  'impotAchat',
  'patrimoineTotalAchat',
  'loyerAnnuel',
  'surplusLocataire',
  'capitalLocationBrut',
  'impotLocation',
  'patrimoineTotalLocation',
  'ecart',
];

test('les 25 années reproduisent le classeur, champ par champ', () => {
  assert.equal(r.annees.length, attendu.annees.length);
  for (const ligne of attendu.annees) {
    const obtenu = r.annees[ligne.annee - 1];
    assert.equal(obtenu.annee, ligne.annee);
    for (const champ of champs) {
      proche(obtenu[champ], ligne[champ], `année ${ligne.annee} — ${champ}`);
    }
  }
});

test('frais de notaire : le neuf coûte moins cher que l\'ancien', () => {
  const ancien = fraisDeNotaire(420000, 'ancien');
  const neuf = fraisDeNotaire(420000, 'neuf');
  assert.ok(neuf < ancien, 'les droits de mutation réduits doivent baisser la facture');
  proche(ancien - neuf, 420000 * (0.0580665 - 0.0071498), 'écart = droits de mutation');
});

test('cas limites du prêt', () => {
  proche(mensualiteCredit(120000, 0, 10), 1000, 'taux 0 % : capital / nombre de mois');
  assert.equal(mensualiteCredit(100000, 0.03, 0), 0, 'durée nulle');

  const sansEmprunt = simuler({ apport: 600000, horizon: 3 });
  assert.equal(sansEmprunt.dettes, 0, 'apport supérieur au coût : pas de dette');
  assert.equal(sansEmprunt.mensualiteCredit, 0, 'pas de mensualité sans dette');
  assert.ok(sansEmprunt.annees.every((a) => a.crdFin === 0));
});

test('horizon supérieur à la durée du prêt : plus de mensualité après remboursement', () => {
  const s = simuler({ dureeAnnees: 20, horizon: 25 });
  const an25 = s.annees[24];
  proche(an25.crdFin, 0, 'crédit soldé');
  proche(an25.interets, 0, 'plus d\'intérêts');
  proche(an25.assurance, 0, 'plus d\'assurance');
  proche(
    an25.totalDebourseAnnuel,
    an25.charges + an25.taxeFonciere,
    'il ne reste que charges + taxe foncière'
  );
});

test('le capital initial et l\'enveloppe ne changent pas l\'écart', () => {
  // Propriété du modèle, pas un hasard : un euro de plus au départ, ou un euro
  // de plus d'enveloppe, alimente les DEUX portefeuilles à l'identique et
  // subit la même fiscalité. Il s'annule donc dans la différence, tant qu'aucun
  // des deux surplus n'est plafonné à zéro (cas non finançable, écarté).
  const reference = simuler().annees[19].ecart;

  for (const capitalInitial of [150000, 200000, 300000]) {
    const r = simuler({ capitalInitial });
    proche(r.annees[19].ecart, reference, `capital ${capitalInitial}`);
  }
  for (const enveloppeMensuelle of [2700, 3400, 6000]) {
    const r = simuler({ enveloppeMensuelle });
    assert.ok(r.enveloppeSuffisante, `enveloppe ${enveloppeMensuelle} finançable`);
    assert.ok(r.annees[0].surplusProprio > 0, 'surplus propriétaire non plafonné');
    proche(r.annees[19].ecart, reference, `enveloppe ${enveloppeMensuelle}`);
  }

  // Ils déplacent en revanche les niveaux, et dans le même sens des deux côtés.
  const petit = simuler({ capitalInitial: 150000 }).annees[19];
  const grand = simuler({ capitalInitial: 300000 }).annees[19];
  assert.ok(grand.patrimoineTotalAchat > petit.patrimoineTotalAchat);
  assert.ok(grand.patrimoineTotalLocation > petit.patrimoineTotalLocation);
});

test('salaire non renseigné : aucun ratio n\'est inventé', () => {
  const r = simuler();
  assert.equal(r.entrees.salaireNet, 0, 'le salaire est facultatif');
  assert.equal(r.tauxEndettement, null);
  assert.equal(r.partEnveloppe, null);
});

test('taux d\'endettement et part de l\'enveloppe dans le salaire', () => {
  const r = simuler({ salaireNet: 4500 });
  proche(
    r.tauxEndettement, r.mensualiteTotale / 4500,
    'mensualité assurance comprise, comme le HCSF'
  );
  proche(r.partEnveloppe, 3400 / 4500, 'part de l\'enveloppe');
  assert.ok(r.tauxEndettement > 0.5, 'ce scénario dépasse largement les 35 %');
});

test('le salaire n\'influence aucun résultat patrimonial', () => {
  const sans = simuler();
  const avec = simuler({ salaireNet: 4500 });
  for (let i = 0; i < sans.annees.length; i++) {
    proche(avec.annees[i].ecart, sans.annees[i].ecart, `année ${i + 1}`);
  }
});

test('l\'enveloppe insuffisante est signalée', () => {
  assert.equal(simuler().enveloppeSuffisante, true);
  assert.equal(simuler({ enveloppeMensuelle: 1000 }).enveloppeSuffisante, false);
});

test('le surplus investi ne devient jamais négatif', () => {
  const s = simuler({ enveloppeMensuelle: 500 });
  assert.ok(s.annees.every((a) => a.surplusProprio >= 0 && a.surplusLocataire >= 0));
});
