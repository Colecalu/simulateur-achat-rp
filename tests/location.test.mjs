/**
 * Tests du module « mise en location ».
 *
 * Pas de classeur de référence pour ce module (à venir) : on vérifie donc
 * la continuité avec le moteur de base, puis chaque règle fiscale isolément
 * sur des cas construits à la main.
 *
 *   node --test tests/location.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import calc from '../frontend/js/calc.js';
import calcLocation from '../frontend/js/calc-location.js';

const { simuler } = calc;
const { simulerMiseEnLocation, abattementPlusValue, dotationAmortissement } = calcLocation;

const proche = (obtenu, cible, message) =>
  assert.ok(
    Math.abs(obtenu - cible) < 0.01,
    `${message} : obtenu ${obtenu}, attendu ${cible} (écart ${obtenu - cible})`
  );

const base = simuler();

const options = (surcharge = {}) => ({
  anneeBascule: 10,
  loyerPercu: 1800,
  loyerFutur: 1600,
  ...surcharge,
});

/* ------------------------------------------------------------- Continuité */

test('avant la bascule, la trajectoire est identique au scénario d\'achat', () => {
  const mel = simulerMiseEnLocation(base, options({ anneeBascule: 10 }));
  for (let t = 1; t < 10; t++) {
    const l = mel.annees[t - 1];
    const b = base.annees[t - 1];
    assert.equal(l.enLocation, false, `année ${t} : pas encore en location`);
    proche(l.patrimoineTotal, b.patrimoineTotalAchat, `année ${t} — patrimoine`);
    proche(l.capitalPortefeuilleBrut, b.capitalAchatBrut, `année ${t} — portefeuille`);
    proche(l.impotPlusValue, 0, `année ${t} — encore RP, donc exonéré`);
  }
  assert.equal(mel.annees[9].enLocation, true, 'année 10 : bascule effective');
});

test('le moteur de base n\'est pas modifié par l\'extension', () => {
  const avant = JSON.stringify(simuler());
  simulerMiseEnLocation(base, options());
  assert.equal(JSON.stringify(simuler()), avant);
  assert.equal(JSON.stringify(base.annees[0]), JSON.stringify(simuler().annees[0]));
});

/* -------------------------------------------- Abattements pour détention */

test('barème des abattements pour durée de détention', () => {
  proche(abattementPlusValue(5).ir, 0, 'IR à 5 ans');
  proche(abattementPlusValue(5).ps, 0, 'PS à 5 ans');

  proche(abattementPlusValue(6).ir, 0.06, 'IR à 6 ans');
  proche(abattementPlusValue(6).ps, 0.0165, 'PS à 6 ans');

  proche(abattementPlusValue(21).ir, 0.96, 'IR à 21 ans');
  proche(abattementPlusValue(21).ps, 0.264, 'PS à 21 ans');

  proche(abattementPlusValue(22).ir, 1, 'IR exonéré à 22 ans');
  proche(abattementPlusValue(22).ps, 0.28, 'PS à 22 ans');

  proche(abattementPlusValue(30).ps, 1, 'PS exonéré à 30 ans');
  assert.ok(abattementPlusValue(25).ps < 1, 'PS pas encore exonéré à 25 ans');
});

test('l\'impôt sur plus-value tombe à zéro côté IR dès 22 ans de détention', () => {
  const long = simuler({ horizon: 25 });
  const mel = simulerMiseEnLocation(long, options({ anneeBascule: 2, regime: 'nu' }));
  const an21 = mel.annees[20];
  const an22 = mel.annees[21];
  assert.equal(an21.abattementIR, 0.96);
  assert.equal(an22.abattementIR, 1);
  // À 22 ans il ne reste que les prélèvements sociaux.
  proche(
    an22.impotPlusValue,
    an22.plusValueImposable * (1 - an22.abattementPS) * 0.186,
    'PS seuls après exonération IR'
  );
});

/* ------------------------------------------------- Location nue : déficit */

test('déficit foncier : la part intérêts n\'est jamais imputable sur le revenu global', () => {
  // Loyer très faible : le déficit dépasse largement les charges financières.
  const mel = simulerMiseEnLocation(
    base,
    options({ anneeBascule: 1, regime: 'nu', loyerPercu: 100, fraisAnnexes: 30000 })
  );
  const an1 = mel.annees[0];
  const chargesFinancieres = base.annees[0].interets + base.annees[0].assurance;
  const deficit = -an1.resultatFiscal;
  const partAutres = deficit - Math.min(deficit, chargesFinancieres);

  proche(
    an1.economieDeficit,
    Math.min(partAutres, 10700) * 0.3,
    'économie plafonnée à 10 700 € × TMI'
  );
  assert.ok(an1.economieDeficit > 0, 'une partie reste imputable');
  proche(an1.impotLocatif, 0, 'aucun impôt sur un exercice déficitaire');
});

test('déficit foncier : le plafond de 10 700 € est respecté', () => {
  const mel = simulerMiseEnLocation(
    base,
    options({ anneeBascule: 1, regime: 'nu', loyerPercu: 100, fraisAnnexes: 60000 })
  );
  proche(mel.annees[0].economieDeficit, 10700 * 0.3, 'plafond atteint');
});

test('déficit foncier : le report s\'impute sur les bénéfices suivants', () => {
  // Loyer calibré pour que les premières années soient déficitaires (intérêts
  // élevés) puis bénéficiaires, à mesure que les intérêts d'emprunt décroissent.
  // `fraisAnnexes` est un forfait ANNUEL récurrent : il ne peut pas servir à
  // fabriquer un déficit ponctuel.
  const mel = simulerMiseEnLocation(
    base, options({ anneeBascule: 1, regime: 'nu', loyerPercu: 1400 })
  );
  const deficitaires = mel.annees.filter((a) => a.resultatFiscal < 0);
  const beneficiaires = mel.annees.filter((a) => a.resultatFiscal > 0);
  assert.ok(deficitaires.length > 0, 'des exercices déficitaires existent');
  assert.ok(beneficiaires.length > 0, 'des exercices bénéficiaires existent');

  const pic = Math.max(...mel.annees.map((a) => a.stockDeficitFoncier));
  assert.ok(pic > 0, 'un report est constitué');

  const premierBenefice = beneficiaires[0];
  assert.ok(
    premierBenefice.baseImposable < premierBenefice.resultatFiscal,
    'le report réduit la base imposable du premier exercice bénéficiaire'
  );
  assert.ok(
    mel.annees[mel.annees.length - 1].stockDeficitFoncier < pic,
    'le stock finit par se résorber'
  );
});

test('déficit foncier : un report non consommé expire au bout de 10 ans', () => {
  const mel = simulerMiseEnLocation(
    base,
    options({
      anneeBascule: 1, regime: 'nu', loyerPercu: 100,
      fraisAnnexes: 40000, dureeReportDeficit: 3,
    })
  );
  // Rien n'est jamais bénéficiaire ici : le stock ne peut que se purger.
  const stock5 = mel.annees[4].stockDeficitFoncier;
  const stock25 = mel.annees[24].stockDeficitFoncier;
  assert.ok(
    stock25 <= stock5,
    'le stock ne croît pas indéfiniment, les lignes périmées sont purgées'
  );
});

/* ------------------------------------------------------ LMNP : amortissement */

test('dotation d\'amortissement : bâti hors terrain, travaux, mobilier', () => {
  const d = dotationAmortissement(base.entrees, {
    quotePartBati: 0.85, dureeAmortBati: 30,
    dureeAmortTravaux: 10,
    partMobilier: 0.05, dureeAmortMobilier: 7,
  });
  proche(d.bati, (420000 * 0.85) / 30, 'bâti');
  proche(d.travaux, 50000 / 10, 'travaux');
  proche(d.mobilier, (420000 * 0.05) / 7, 'mobilier');
});

test('LMNP : l\'amortissement peut annuler la base imposable, jamais la rendre négative', () => {
  const mel = simulerMiseEnLocation(
    base,
    options({ anneeBascule: 1, regime: 'meuble', loyerPercu: 1800 })
  );
  for (const a of mel.annees) {
    assert.ok(a.baseImposable >= 0, `année ${a.annee} : base imposable jamais négative`);
    assert.ok(a.impotLocatif >= 0, `année ${a.annee} : impôt jamais négatif`);
  }
  proche(mel.annees[0].baseImposable, 0, 'année 1 absorbée par l\'amortissement');
});

test('LMNP : l\'excédent d\'amortissement se reporte sans limite', () => {
  const mel = simulerMiseEnLocation(
    base,
    options({ anneeBascule: 1, regime: 'meuble', loyerPercu: 900 })
  );
  assert.ok(mel.annees[0].stockAmortissement > 0, 'un excédent est reporté');
  assert.ok(
    mel.annees[4].stockAmortissement > mel.annees[0].stockAmortissement,
    'le stock s\'accumule tant qu\'il n\'est pas consommé'
  );
});

test('LMNP : pas de prélèvements sociaux sur la base BIC', () => {
  const mel = simulerMiseEnLocation(
    base,
    // Loyer énorme : la base imposable survit à l'amortissement.
    options({ anneeBascule: 1, regime: 'meuble', loyerPercu: 9000, tmi: 0.41 })
  );
  const a = mel.annees[0];
  assert.ok(a.baseImposable > 0, 'base imposable positive');
  proche(a.impotLocatif, a.baseImposable * 0.41, 'TMI seule, sans PS');
});

test('LMNP : les amortissements déduits sont réintégrés dans la plus-value', () => {
  const avec = simulerMiseEnLocation(
    base, options({ anneeBascule: 1, regime: 'meuble', loyerPercu: 9000 })
  );
  const sans = simulerMiseEnLocation(
    base,
    options({ anneeBascule: 1, regime: 'meuble', loyerPercu: 9000, reintegrerAmortissements: false })
  );
  const a = avec.annees[9];
  const s = sans.annees[9];
  assert.ok(
    a.plusValueImposable > s.plusValueImposable,
    'la réintégration gonfle la plus-value imposable'
  );
  assert.ok(a.impotPlusValue > s.impotPlusValue, 'et donc l\'impôt');
  proche(s.plusValueImposable, s.plusValueBrute, 'sans réintégration : PV brute seule');
});

test('location nue : aucune réintégration d\'amortissement', () => {
  const mel = simulerMiseEnLocation(
    base, options({ anneeBascule: 1, regime: 'nu', loyerPercu: 1800 })
  );
  const a = mel.annees[9];
  proche(a.plusValueImposable, a.plusValueBrute, 'régime nu : pas d\'amortissement');
  proche(a.amortissementUtilise, 0, 'aucun amortissement pratiqué');
});

/* --------------------------------------------------- Cash-flow et portefeuille */

test('le cash-flow ne double-compte ni les charges ni la mensualité', () => {
  const mel = simulerMiseEnLocation(base, options({ anneeBascule: 5 }));
  const a = mel.annees[4];
  const b = base.annees[4];
  proche(
    a.cashFlowAvantImpot,
    a.revenusBruts - 800 - b.totalDebourseAnnuel,
    'revenus − frais annexes − (mensualité + charges + taxe) du moteur de base'
  );
});

test('la vacance locative réduit les revenus bruts', () => {
  const sans = simulerMiseEnLocation(base, options({ anneeBascule: 1, tauxVacance: 0 }));
  const avec = simulerMiseEnLocation(base, options({ anneeBascule: 1, tauxVacance: 0.1 }));
  proche(avec.annees[0].revenusBruts, sans.annees[0].revenusBruts * 0.9, '10 % de vacance');
});

test('les deux loyers sont indexés à l\'IRL à partir de la bascule', () => {
  const mel = simulerMiseEnLocation(base, options({ anneeBascule: 5 }));
  const a5 = mel.annees[4];
  const a6 = mel.annees[5];
  proche(a5.loyerPercuAnnuel, 1800 * 12, 'année de bascule : loyer non indexé');
  proche(a6.loyerPercuAnnuel, 1800 * 12 * 1.01, 'année suivante : +1 % IRL');
  proche(a5.loyerFuturAnnuel, 1600 * 12, 'loyer futur à la bascule');
  proche(a6.loyerFuturAnnuel, 1600 * 12 * 1.01, 'loyer futur indexé pareil');
});

test('un cash-flow négatif ponctionne le portefeuille', () => {
  const mel = simulerMiseEnLocation(
    base,
    options({ anneeBascule: 2, loyerPercu: 1, loyerFutur: 3000, fraisAnnexes: 20000 })
  );
  const a = mel.annees[2];
  assert.ok(a.versementPortefeuille < 0, 'versement négatif');
  assert.ok(a.capitalPortefeuilleNet >= 0, 'le portefeuille ne devient pas absurde');
});

test('l\'horizon et le nombre de lignes suivent le moteur de base', () => {
  const court = simuler({ horizon: 12 });
  const mel = simulerMiseEnLocation(court, options({ anneeBascule: 3 }));
  assert.equal(mel.annees.length, 12);
  assert.equal(mel.annees[11].annee, 12);
});

test('une bascule au-delà de l\'horizon laisse la trajectoire d\'achat intacte', () => {
  const mel = simulerMiseEnLocation(base, options({ anneeBascule: 99 }));
  for (let t = 0; t < base.annees.length; t++) {
    assert.equal(mel.annees[t].enLocation, false);
    proche(
      mel.annees[t].patrimoineTotal,
      base.annees[t].patrimoineTotalAchat,
      `année ${t + 1}`
    );
  }
});
