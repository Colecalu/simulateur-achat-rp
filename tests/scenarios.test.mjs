/**
 * Scénarios de marché — la STRUCTURE, jamais les valeurs.
 *
 * Ces tests existent parce que les données sont provisoires et vont être
 * remplacées : ils doivent survivre au remplacement. Rien ici ne vérifie qu'un
 * rendement vaut tel chiffre — tout vérifie que la mécanique qui les met en
 * forme est correcte. Un test qui figerait une valeur provisoire empêcherait
 * précisément ce qu'on prépare.
 *
 *   node --test "tests/scenarios.test.mjs"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import scenarios from '../frontend/js/scenarios.js';
import calc from '../frontend/js/calc.js';

const {
  SCENARIOS, FAMILLES, CLES, HORIZON, TENDANCE_LONGUE, SERIES_OBSERVEES,
  DEPART_SERIES, FIN_SERIES, LONGUEUR_FENETRE, tauxEquivalent, parCle, parFamille,
} = scenarios;

test('quatre scénarios, deux groupes de deux', () => {
  assert.equal(SCENARIOS.length, 4);
  assert.equal(FAMILLES.length, 2);
  assert.equal(parFamille('historique').length, 2);
  assert.equal(parFamille('prospectif').length, 2);
  for (const f of FAMILLES) assert.ok(f.etiquette, `le groupe ${f.cle} porte une étiquette`);
});

test('les séries observées couvrent toutes la même période', () => {
  // Quatre séries de longueurs différentes produiraient des fenêtres décalées :
  // l'immobilier d'une année et la bourse d'une autre, sans que rien ne le dise.
  const attendu = FIN_SERIES - DEPART_SERIES + 1;
  for (const c of CLES) {
    assert.equal(SERIES_OBSERVEES[c].length, attendu, `série ${c}`);
  }
});

test('chaque scénario couvre exactement l\'horizon, sans boucle', () => {
  // La boucle inversait le signe du verdict sur deux scénarios sur quatre :
  // c'est le test qui garde la porte fermée.
  for (const sc of SCENARIOS) {
    for (const c of CLES) {
      assert.equal(sc.taux[c].length, HORIZON, `${sc.cle} / ${c}`);
      for (const t of sc.taux[c]) assert.ok(Number.isFinite(t), `${sc.cle} / ${c} : taux fini`);
    }
  }
});

test('une fenêtre historique observe vingt ans et prolonge le reste', () => {
  for (const sc of parFamille('historique')) {
    assert.equal(sc.reel, LONGUEUR_FENETRE);
    assert.equal(sc.definies, LONGUEUR_FENETRE);
    assert.ok(sc.periode, 'une fenêtre est datée');

    for (const c of CLES) {
      const serie = sc.taux[c];
      // Le prolongement est le taux annualisé GÉOMÉTRIQUE des années observées.
      const attendu = tauxEquivalent(serie.slice(0, LONGUEUR_FENETRE));
      for (let a = LONGUEUR_FENETRE; a < HORIZON; a++) {
        assert.ok(Math.abs(serie[a] - attendu) < 1e-12, `${sc.cle} / ${c} année ${a + 1}`);
      }
      // Et surtout : l'arithmétique aurait donné autre chose. Si les deux
      // coïncidaient, ce test ne prouverait rien.
      const arithmetique = serie.slice(0, LONGUEUR_FENETRE)
        .reduce((s, t) => s + t, 0) / LONGUEUR_FENETRE;
      if (c === 'rendementBourse') {
        assert.ok(attendu < arithmetique, 'la géométrique est sous l\'arithmétique');
      }
    }
  }
});

test('une fenêtre historique est bien découpée dans la série observée', () => {
  // Le point de la refonte : une année n'a qu'une valeur. Deux scénarios qui
  // se chevauchent doivent porter les mêmes chiffres sur les années communes.
  const [a, b] = parFamille('historique');
  const debut = (sc) => Number(sc.periode.slice(0, 4));
  for (const c of CLES) {
    for (const sc of [a, b]) {
      const i = debut(sc) - DEPART_SERIES;
      assert.deepEqual(
        sc.taux[c].slice(0, LONGUEUR_FENETRE),
        SERIES_OBSERVEES[c].slice(i, i + LONGUEUR_FENETRE),
        `${sc.cle} / ${c}`
      );
    }
  }
});

test('un stress test ne choque qu\'un seul marché', () => {
  // C'est ce qui les rend lisibles. Deux marchés choqués en même temps, et on
  // ne sait plus ce que le scénario mesure.
  for (const sc of parFamille('prospectif')) {
    assert.equal(sc.reel, 0, 'aucune année observée');
    assert.equal(sc.periode, null, 'une hypothèse n\'est pas datée');
    assert.ok(sc.definies > 0, 'le choc dure au moins un an');

    const choques = CLES.filter(
      (c) => sc.taux[c].some((t) => Math.abs(t - TENDANCE_LONGUE[c]) > 1e-12)
    );
    assert.equal(choques.length, 1, `${sc.cle} : un seul marché choqué (${choques})`);
  }
});

test('un stress test retombe sur la tendance longue après le choc', () => {
  for (const sc of parFamille('prospectif')) {
    for (const c of CLES) {
      for (let a = sc.definies; a < HORIZON; a++) {
        assert.equal(sc.taux[c][a], TENDANCE_LONGUE[c], `${sc.cle} / ${c} année ${a + 1}`);
      }
    }
  }
});

test('aucun scénario ne se nomme par son résultat', () => {
  // Le résultat dépend du profil de l'utilisateur : l'écrire dans une étiquette
  // serait faux pour une partie des visiteurs.
  const interdits = ['favorable', 'défavorable', 'meilleur', 'pire', 'gagnant', 'perdant'];
  for (const sc of SCENARIOS) {
    for (const mot of interdits) {
      assert.ok(!sc.nom.toLowerCase().includes(mot), `${sc.cle} : « ${sc.nom} » dit le résultat`);
    }
  }
});

test('chaque scénario porte ses sources et ses réserves', () => {
  for (const sc of SCENARIOS) {
    assert.ok(sc.resume && sc.resume.length > 40, `${sc.cle} : un résumé`);
    assert.ok(Array.isArray(sc.reserves) && sc.reserves.length, `${sc.cle} : au moins une réserve`);
    for (const c of CLES) assert.ok(sc.sources[c], `${sc.cle} : source pour ${c}`);
  }
});

test('les clés sont uniques et retrouvables', () => {
  const vues = new Set();
  for (const sc of SCENARIOS) {
    assert.ok(!vues.has(sc.cle), `clé dupliquée : ${sc.cle}`);
    vues.add(sc.cle);
    assert.equal(parCle(sc.cle), sc);
  }
  assert.equal(parCle('scenario-qui-n-existe-pas'), null);
});

test('chaque scénario alimente le moteur sans produire de NaN', () => {
  // Le test qui compte : une série mal formée ne planterait pas, elle
  // s'afficherait. C'est pire.
  for (const sc of SCENARIOS) {
    const r = calc.simuler(Object.assign({}, calc.DEFAUTS, sc.taux, { horizon: HORIZON }));
    assert.equal(r.annees.length, HORIZON, sc.cle);
    for (const annee of r.annees) {
      assert.ok(Number.isFinite(annee.ecart), `${sc.cle}, année ${annee.annee}`);
      assert.ok(Number.isFinite(annee.patrimoineTotalAchat), `${sc.cle}, année ${annee.annee}`);
      assert.ok(Number.isFinite(annee.patrimoineTotalLocation), `${sc.cle}, année ${annee.annee}`);
    }
  }
});

test('la tendance longue est complète et plausible', () => {
  // Elle ne fige pas les valeurs — provisoires — mais interdit qu'un taux
  // manque, ou qu'un pourcentage se glisse là où on attend une fraction.
  for (const c of CLES) {
    const t = TENDANCE_LONGUE[c];
    assert.ok(Number.isFinite(t), `tendance longue : ${c}`);
    assert.ok(t > 0 && t < 0.2, `${c} = ${t} : une fraction, pas un pourcentage`);
  }
});
