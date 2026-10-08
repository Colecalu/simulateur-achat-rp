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
    an22.plusValueImposable * (1 - an22.abattementPS) * 0.172, // plus-value immobilière : hors hausse de CSG
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

test('dotation d\'amortissement : assise sur la valeur d\'entrée dans l\'activité', () => {
  const d = dotationAmortissement(552311, {
    quotePartBati: 0.85, dureeAmortBati: 30,
    achatMeubles: 15000, dureeAmortMobilier: 7,
  });
  proche(d.bati, (552311 * 0.85) / 30, 'bâti sur la valeur d\'entrée, terrain exclu');
  proche(d.mobilier, 15000 / 7, 'mobilier réellement acheté');
  assert.equal(d.travaux, undefined, 'les travaux sont fondus dans la valeur du bâti');
});

test('la base amortissable suit l\'année de bascule, pas le prix d\'achat', () => {
  const tot5 = simulerMiseEnLocation(base, options({ anneeBascule: 5, achatMeubles: 15000 }));
  const tot15 = simulerMiseEnLocation(base, options({ anneeBascule: 15, achatMeubles: 15000 }));
  proche(
    tot5.valeurEntreeActivite, base.annees[4].valeurBien,
    'valeur d\'entrée = valeur du bien en année 5'
  );
  proche(
    tot15.valeurEntreeActivite, base.annees[14].valeurBien,
    'valeur d\'entrée = valeur du bien en année 15'
  );
  assert.ok(
    tot15.dotationAnnuelle > tot5.dotationAnnuelle,
    'plus la bascule est tardive, plus le bien vaut cher, plus la dotation est élevée'
  );
});

test('l\'achat de meubles ponctionne le portefeuille, une seule fois', () => {
  const sans = simulerMiseEnLocation(base, options({ anneeBascule: 10, achatMeubles: 0 }));
  const avec = simulerMiseEnLocation(base, options({ anneeBascule: 10, achatMeubles: 15000 }));
  proche(
    avec.annees[9].versementPortefeuille,
    sans.annees[9].versementPortefeuille - 15000,
    'année de bascule : 15 000 € de moins investis'
  );
  proche(avec.annees[10].achatMobilier, 0, 'rien l\'année suivante');
  assert.ok(
    avec.annees[10].amortissementUtilise >= 0,
    'le mobilier acheté est amortissable ensuite'
  );
});

test('en location nue, aucun achat de meubles n\'est débité', () => {
  const nu = simulerMiseEnLocation(
    base, options({ anneeBascule: 10, regime: 'nu', achatMeubles: 15000 })
  );
  proche(nu.annees[9].achatMobilier, 0, 'le nu ne meuble pas');
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

test('LMNP : prélèvements sociaux à 18,6 % sur la base BIC', () => {
  const mel = simulerMiseEnLocation(
    base,
    // Loyer énorme : la base imposable survit à l'amortissement.
    options({ anneeBascule: 1, regime: 'meuble', loyerPercu: 9000, tmi: 0.41 })
  );
  const a = mel.annees[0];
  assert.ok(a.baseImposable > 0, 'base imposable positive');
  proche(a.impotLocatif, a.baseImposable * (0.41 + 0.186), 'TMI + 18,6 % (LFSS 2026)');
});

test('location nue : prélèvements sociaux à 17,2 % sur les revenus fonciers', () => {
  const mel = simulerMiseEnLocation(
    base, options({ anneeBascule: 1, regime: 'nu', loyerPercu: 9000, tmi: 0.41 })
  );
  const a = mel.annees[0];
  assert.ok(a.baseImposable > 0, 'base imposable positive');
  proche(a.impotLocatif, a.baseImposable * (0.41 + 0.172), 'TMI + 17,2 % (exclus de la hausse de CSG)');
});

test('plus-value immobilière : 17,2 % de prélèvements sociaux, dans les deux régimes', () => {
  for (const regime of ['meuble', 'nu']) {
    const mel = simulerMiseEnLocation(
      base, options({ anneeBascule: 1, regime, loyerPercu: 1800 })
    );
    const a = mel.annees[9];
    const ab = abattementPlusValue(a.annee);
    assert.ok(a.plusValueImposable > 0, `${regime} : plus-value positive`);
    proche(
      a.impotPlusValue,
      a.plusValueImposable * (1 - ab.ir) * 0.19 + a.plusValueImposable * (1 - ab.ps) * 0.172,
      `${regime} : IR 19 % + PS 17,2 %`
    );
  }
});

test('prélèvements sociaux : le meublé reste le régime par défaut, le taux suit le régime', () => {
  assert.equal(calcLocation.DEFAUTS_LOCATION.regime, 'meuble');
  assert.ok(!('tauxPrelevementsSociaux' in calcLocation.DEFAUTS_LOCATION), 'plus un champ de saisie');
  assert.deepEqual(calcLocation.PRELEVEMENTS_SOCIAUX, { meuble: 0.186, nu: 0.172, plusValueImmobiliere: 0.172 });
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

test('les loyers sont saisis en euros du moment de la bascule, puis indexés', () => {
  const mel = simulerMiseEnLocation(base, options({ anneeBascule: 5 }));
  proche(mel.annees[4].loyerPercuAnnuel, 1800 * 12, 'année de bascule : montant saisi tel quel');
  const irl = 1 + base.entrees.revalLoyer;
  proche(mel.annees[5].loyerPercuAnnuel, 1800 * 12 * irl, 'année suivante : + IRL');
  proche(mel.annees[4].loyerFuturAnnuel, 1600 * 12, 'loyer futur à la bascule');
  proche(mel.annees[5].loyerFuturAnnuel, 1600 * 12 * irl, 'loyer futur indexé pareil');
});

test('le loyer futur est indépendant de la trajectoire du loyer de référence', () => {
  // Volontaire : le montant décrit une décision future (déménager moins cher,
  // en province par exemple). Il n'a pas à suivre le loyer du locataire de
  // référence, qui décrit une autre vie.
  const mel = simulerMiseEnLocation(
    base, options({ anneeBascule: 10, loyerFutur: base.entrees.loyer })
  );
  assert.ok(
    mel.annees[9].loyerFuturAnnuel < base.annees[9].loyerAnnuel,
    'saisir le loyer actuel à une bascule tardive = se loger moins cher en euros constants'
  );
  proche(
    mel.annees[9].loyerFuturAnnuel,
    base.annees[9].loyerAnnuel / Math.pow(1 + base.entrees.revalLoyer, 9),
    'écart = exactement les 9 années d\'indexation non appliquées'
  );
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

/* ------------------------------------------- L'enveloppe après la bascule */

test('un loyer futur au-dessus de l\'enveloppe la fait monter, sans reliquat négatif', () => {
  // L'ancien module plafonnait le reliquat à zéro : le loyer payé ailleurs
  // dépassait l'enveloppe et personne ne payait la différence.
  const o = options({ loyerFutur: 4000 });
  const mel = simulerMiseEnLocation(base, o);
  for (const l of mel.annees.filter((x) => x.enLocation)) {
    assert.ok(l.reliquatEnveloppe >= 0, `année ${l.annee} : reliquat positif ou nul`);
    proche(l.reliquatEnveloppe + l.loyerFuturAnnuel, l.enveloppe, `année ${l.annee} : tout est payé`);
  }
});

test('enveloppe identique : le loyer futur relève aussi celle du locataire', () => {
  // Sans ce plancher transmis au moteur de base, l'utilisateur qui loue son
  // bien sortirait plus que le locataire de la comparaison, qui n'aurait pas
  // le droit de placer la même somme : le biais corrigé par le cliquet.
  const o = options({ loyerFutur: 4000 });
  const e = { horizon: 25 };
  const planchers = calcLocation.planchersEnveloppe({ ...calc.DEFAUTS, ...e }, o, 25);
  const b = simuler({ ...e, planchersEnveloppe: planchers });
  const mel = simulerMiseEnLocation(b, o);
  mel.annees.forEach((l, i) => {
    proche(l.enveloppe, b.annees[i].enveloppeLocation, `année ${l.annee} : même enveloppe`);
  });
  // Et l'écart achat / location du moteur de base n'en bouge pas.
  simuler(e).annees.forEach((x, i) => proche(b.annees[i].ecart, x.ecart, `écart année ${x.annee}`));
});

test('sans enveloppe identique, aucun plancher n\'est imposé au moteur de base', () => {
  const e = { ...calc.DEFAUTS, locatairePlaceDifference: false };
  assert.equal(calcLocation.planchersEnveloppe(e, options(), 25), null);
  assert.equal(calcLocation.planchersEnveloppe(calc.DEFAUTS, { anneeBascule: null }, 25), null);
});

test('un loyer futur modeste laisse le module inchangé', () => {
  // Non-régression : quand l'effort couvre le loyer payé ailleurs, l'enveloppe
  // reste l'effort déclaré, comme avant.
  const mel = simulerMiseEnLocation(base, options({ loyerFutur: 1600 }));
  for (const l of mel.annees) proche(l.enveloppe, 3400 * 12, `année ${l.annee}`);
});
