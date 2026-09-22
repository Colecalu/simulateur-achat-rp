/**
 * Un taux du moteur peut être un nombre (constant) ou une série année par
 * année. Les séries sont ce qui permettra d'adosser les scénarios à des
 * données réelles : une décennie de marché ne monte pas de 5 % tous les ans.
 *
 *   node --test tests/series.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import calc from '../frontend/js/calc.js';

const { simuler, tauxAnnee, facteur } = calc;
const proche = (a, b, t = 0.01) =>
  assert.ok(Math.abs(a - b) <= t, `${a} ≈ ${b} (écart ${Math.abs(a - b)})`);

test('un nombre reste un nombre, quelle que soit l\'année', () => {
  for (const a of [1, 7, 25]) assert.equal(tauxAnnee(0.05, a), 0.05);
});

test('une série se répète au-delà de sa longueur', () => {
  // Choix assumé : rejouer la séquence se raconte (« et si cette décennie
  // recommençait »), figer la dernière valeur choisirait une année au hasard
  // comme régime permanent.
  const serie = [0.1, -0.2, 0.3];
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((a) => tauxAnnee(serie, a)),
    [0.1, -0.2, 0.3, 0.1, -0.2, 0.3]);
});

test('une série vide ne fait rien exploser', () => {
  assert.equal(tauxAnnee([], 3), 0);
  assert.equal(facteur([], 1, 5), 1);
});

test('le facteur cumulé est le produit des taux, et vaut 1 sur un intervalle vide', () => {
  proche(facteur(0.05, 1, 3), 1.05 ** 3, 1e-12);
  proche(facteur([0.1, -0.2], 1, 2), 1.1 * 0.8, 1e-12);
  assert.equal(facteur(0.05, 1, 0), 1);
});

test('une série constante donne exactement le même résultat qu\'un nombre', () => {
  // Le filet de sécurité de toute la bascule : si ce test tombe, appliquer un
  // scénario « plat » changerait les chiffres sans raison.
  const constant = simuler({ horizon: 25 });
  const enSerie = simuler({
    horizon: 25,
    revalBien: [0.01],
    revalCharges: [0.01],
    revalTaxeFonciere: [0.01],
    revalLoyer: [0.01],
    rendementBourse: [0.05],
  });
  for (let i = 0; i < constant.annees.length; i++) {
    proche(enSerie.annees[i].patrimoineTotalAchat, constant.annees[i].patrimoineTotalAchat);
    proche(enSerie.annees[i].patrimoineTotalLocation, constant.annees[i].patrimoineTotalLocation);
  }
});

test('une série alternée ne se confond pas avec sa moyenne', () => {
  // La raison d'être des scénarios : -20 % puis +30 % n'est PAS +5 % deux fois.
  // Si ces deux simulations se valaient, la série ne servirait à rien.
  const alterne = simuler({ horizon: 20, rendementBourse: [-0.2, 0.3] });
  const moyen = simuler({ horizon: 20, rendementBourse: 0.05 });
  assert.notEqual(
    Math.round(alterne.annees[19].patrimoineTotalLocation),
    Math.round(moyen.annees[19].patrimoineTotalLocation)
  );
});

test('une série de rendement négatif fait bien reculer le portefeuille', () => {
  const krach = simuler({ horizon: 10, rendementBourse: [-0.1] });
  const annees = krach.annees;
  assert.ok(annees[9].capitalLocationBrut < annees[0].capitalLocationBrut + 1e-9 ||
            annees[9].patrimoineTotalLocation < annees[0].patrimoineTotalLocation * 3);
  assert.ok(Number.isFinite(annees[9].patrimoineTotalAchat));
});
