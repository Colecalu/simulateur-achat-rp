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

test('l\'enveloppe insuffisante est signalée', () => {
  assert.equal(simuler().enveloppeSuffisante, true);
  assert.equal(simuler({ enveloppeMensuelle: 1000 }).enveloppeSuffisante, false);
});

test('le surplus investi ne devient jamais négatif', () => {
  const s = simuler({ enveloppeMensuelle: 500 });
  assert.ok(s.annees.every((a) => a.surplusProprio >= 0 && a.surplusLocataire >= 0));
});
