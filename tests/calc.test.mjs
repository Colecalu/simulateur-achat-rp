/**
 * Vérifie que le moteur JS reproduit le classeur de référence.
 *
 * La fixture tests/fixtures/excel-paris.json contient les valeurs réellement
 * calculées par Excel pour le scénario « Paris » (défauts du moteur, sur les
 * taux de marché du classeur — voir TAUX_CLASSEUR).
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
/**
 * Le classeur tourne sur des taux de marché ronds (1 % / 5 %) ; les défauts du
 * moteur sont désormais la tendance longue. La fixture se compare donc sur les
 * taux du classeur, passés explicitement.
 */
const TAUX_CLASSEUR = {
  revalBien: 0.01, revalTaxeFonciere: 0.01, revalCharges: 0.01,
  revalLoyer: 0.01, rendementBourse: 0.05,
};
const r = simuler(TAUX_CLASSEUR);

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

test('le capital initial et l\'effort ne changent pas l\'écart — même insuffisant', () => {
  // Propriété du modèle, pas un hasard : un euro de plus au départ, ou un euro
  // de plus d'effort, alimente les DEUX portefeuilles à l'identique et subit la
  // même fiscalité. Il s'annule donc dans la différence.
  //
  // Depuis que l'enveloppe monte au lieu de plafonner l'épargne à zéro, c'est
  // vrai POUR TOUT EFFORT, y compris quand il ne couvre pas le coût de l'achat
  // (500, 1 000, 2 000 €) ou quand le loyer finit par le dépasser. L'ancien
  // moteur n'avait cette propriété que dans le domaine « finançable ».
  const reference = simuler().annees.map((x) => x.ecart);

  for (const capitalInitial of [150000, 200000, 300000]) {
    const r = simuler({ capitalInitial });
    proche(r.annees[19].ecart, reference[19], `capital ${capitalInitial}`);
  }
  for (const enveloppeMensuelle of [0, 500, 1000, 2000, 2700, 3400, 6000]) {
    const r = simuler({ enveloppeMensuelle, revalLoyer: 0.04 });
    const ref = simuler({ revalLoyer: 0.04 });
    r.annees.forEach((x, i) =>
      proche(x.ecart, ref.annees[i].ecart, `effort ${enveloppeMensuelle}, année ${x.annee}`));
  }

  // Ils déplacent en revanche les niveaux, et dans le même sens des deux côtés.
  const petit = simuler({ capitalInitial: 150000 }).annees[19];
  const grand = simuler({ capitalInitial: 300000 }).annees[19];
  assert.ok(grand.patrimoineTotalAchat > petit.patrimoineTotalAchat);
  assert.ok(grand.patrimoineTotalLocation > petit.patrimoineTotalLocation);
});

test('revenus non renseignés : aucun ratio n\'est inventé', () => {
  const r = simuler();
  assert.equal(r.entrees.revenusFoyer, 0, 'les revenus sont facultatifs');
  for (const cle of ['tauxEndettement', 'partEffortActuel', 'partEffortAchat',
                     'resteAVivreActuel', 'resteAVivreAchat']) {
    assert.equal(r[cle], null, cle);
  }
});

test('taux d\'endettement, part de l\'effort et reste à vivre', () => {
  const r = simuler({ revenusFoyer: 4500, enveloppeMensuelle: 2000 });
  proche(
    r.tauxEndettement, r.mensualiteTotale / 4500,
    'mensualité assurance comprise, comme le HCSF'
  );
  assert.ok(r.tauxEndettement > 0.5, 'ce scénario dépasse largement les 35 %');
  proche(r.partEffortActuel, 2000 / 4500, 'effort déclaré / revenus');
  proche(r.resteAVivreActuel, 2500, 'revenus − effort déclaré');
  // Côté achat, c'est ce que l'acheteur sort VRAIMENT qui compte : le coût de
  // l'achat, puisqu'il dépasse ici l'effort déclaré.
  proche(r.effortAchat, r.coutMensuelProprio, 'l\'effort de l\'acheteur est le coût de l\'achat');
  proche(r.partEffortAchat, r.coutMensuelProprio / 4500, 'coût de l\'achat / revenus');
  proche(r.resteAVivreAchat, 4500 - r.coutMensuelProprio, 'revenus − coût de l\'achat');
});

test('les revenus n\'influencent aucun résultat patrimonial', () => {
  const sans = simuler();
  const avec = simuler({ revenusFoyer: 4500 });
  for (let i = 0; i < sans.annees.length; i++) {
    proche(avec.annees[i].ecart, sans.annees[i].ecart, `année ${i + 1}`);
  }
});

test('la faisabilité de l\'achat ne compte pas l\'épargne relevée par un loyer cher', () => {
  // Enveloppe identique + loyer plus cher que l'achat et que l'effort :
  // l'enveloppe de l'acheteur monte au niveau du loyer, mais ce surplus est
  // PLACÉ, pas imposé. Le reste à vivre de l'acheteur ne doit pas le compter.
  const r = simuler({ enveloppeMensuelle: 1000, loyer: 4000, revenusFoyer: 6000 });
  assert.ok(r.annees[0].enveloppeAchat / 12 > r.coutMensuelProprio, 'l\'enveloppe suit le loyer');
  proche(r.effortAchat, r.coutMensuelProprio, 'l\'obligation reste le coût de l\'achat');
  proche(r.resteAVivreAchat, 6000 - r.coutMensuelProprio, 'reste à vivre sur l\'obligation');
});

test('le supplément de l\'achat : ce que le projet demande en plus de l\'effort', () => {
  assert.equal(simuler().supplementAchat, 0, 'l\'effort par défaut couvre l\'achat');
  const s = simuler({ enveloppeMensuelle: 1000 });
  proche(s.supplementAchat, s.coutMensuelProprio - 1000, 'coût de l\'achat − effort');
  proche(s.effortAchat, s.coutMensuelProprio, 'l\'acheteur sort le coût de l\'achat');
});

test('le surplus investi ne devient jamais négatif', () => {
  for (const place of [true, false]) {
    const s = simuler({ enveloppeMensuelle: 500, locatairePlaceDifference: place });
    assert.ok(s.annees.every((a) => a.surplusProprio >= 0 && a.surplusLocataire >= 0));
  }
});

/* ------------------------------------------------ L'enveloppe qui s'ajuste */

test('chaque côté dépense exactement son enveloppe, chaque année', () => {
  // Plus de dépassement payé par personne : ce qui sort de l'enveloppe est
  // soit le logement, soit l'épargne, et rien d'autre.
  for (const place of [true, false]) {
    for (const enveloppeMensuelle of [800, 1800, 3400]) {
      const s = simuler({ enveloppeMensuelle, locatairePlaceDifference: place, revalLoyer: 0.03 });
      for (const x of s.annees) {
        proche(x.totalDebourseAnnuel + x.surplusProprio, x.enveloppeAchat, `achat an ${x.annee}`);
        proche(x.loyerAnnuel + x.surplusLocataire, x.enveloppeLocation, `location an ${x.annee}`);
        if (place) proche(x.enveloppeAchat, x.enveloppeLocation, `même enveloppe an ${x.annee}`);
      }
    }
  }
});

test('l\'enveloppe part de l\'effort déclaré, monte au besoin et ne redescend jamais', () => {
  const s = simuler({ enveloppeMensuelle: 1500, dureeAnnees: 15, locatairePlaceDifference: false });
  assert.ok(s.annees[0].enveloppeAchat >= 1500 * 12);
  assert.ok(s.annees[0].enveloppeLocation >= 1500 * 12);
  for (let i = 1; i < s.annees.length; i++) {
    assert.ok(s.annees[i].enveloppeAchat >= s.annees[i - 1].enveloppeAchat, `achat an ${i + 1}`);
    assert.ok(s.annees[i].enveloppeLocation >= s.annees[i - 1].enveloppeLocation, `location an ${i + 1}`);
  }
  // Prêt soldé en année 15 : le coût chute, l'enveloppe reste au niveau atteint.
  proche(s.annees[16].enveloppeAchat, s.annees[14].enveloppeAchat, 'cliquet après le prêt');
  assert.ok(s.annees[16].totalDebourseAnnuel < s.annees[14].totalDebourseAnnuel / 3);
});

test('un effort qui couvre tout donne exactement l\'ancien moteur', () => {
  // Garde-fou de non-régression : tant qu'aucun logement ne dépasse l'effort,
  // l'enveloppe reste l'effort déclaré, chaque année, des deux côtés — c'est le
  // cas de la fixture Excel, qui passe donc au centime sans être modifiée.
  for (const x of simuler().annees) {
    assert.equal(x.enveloppeAchat, 3400 * 12);
    assert.equal(x.enveloppeLocation, 3400 * 12);
  }
});

/* ------------------------------------------------------ L'épargne forcée */

test('la bascule ne change rien quand l\'effort couvre déjà l\'achat', () => {
  // Sans supplément à payer, il n'y a pas d'épargne forcée : se demander si le
  // locataire placerait « la différence » n'a pas d'objet.
  const oui = simuler();
  const non = simuler({ locatairePlaceDifference: false });
  oui.annees.forEach((x, i) => proche(non.annees[i].ecart, x.ecart, `année ${x.annee}`));
});

test('sans discipline, seul le locataire perd : ce qu\'il n\'a pas placé', () => {
  // L'acheteur fait le même effort dans les deux cas — le crédit l'y oblige.
  // Seul le locataire change : il garde ses habitudes, et ne place donc pas le
  // supplément. L'écart se déplace vers l'achat, et uniquement de ce fait.
  const oui = simuler({ enveloppeMensuelle: 1500 });
  const non = simuler({ enveloppeMensuelle: 1500, locatairePlaceDifference: false });
  oui.annees.forEach((x, i) => {
    proche(non.annees[i].patrimoineTotalAchat, x.patrimoineTotalAchat, `achat an ${x.annee}`);
    assert.ok(non.annees[i].patrimoineTotalLocation <= x.patrimoineTotalLocation + 0.01);
  });
  const fin = oui.annees.length - 1;
  assert.ok(non.annees[fin].ecart > oui.annees[fin].ecart + 100000,
    'l\'épargne forcée pèse des dizaines de milliers d\'euros sur 25 ans');
});

test('sans discipline, le locataire garde son effort tant que le loyer le permet', () => {
  const s = simuler({ enveloppeMensuelle: 1800, locatairePlaceDifference: false });
  assert.equal(s.annees[0].enveloppeLocation, 1800 * 12);
  assert.ok(s.annees[0].enveloppeAchat > 1800 * 12, 'l\'acheteur, lui, a dû monter');
});

/* ---------------------------------------------------- Périodes d'enveloppe */

test('les périodes disent ce qui fixe l\'enveloppe, sans trou ni recouvrement', () => {
  const s = simuler({ enveloppeMensuelle: 1500, dureeAnnees: 15, revalLoyer: 0.04 });
  const p = calc.periodesEnveloppe(s, 'achat');
  assert.equal(p[0].debut, 1);
  assert.equal(p[p.length - 1].fin, s.annees.length);
  for (let i = 1; i < p.length; i++) {
    assert.equal(p[i].debut, p[i - 1].fin + 1, 'contiguës');
    assert.notEqual(p[i].pilote, p[i - 1].pilote, 'une période par pilote');
  }
  assert.equal(p[0].pilote, 'achat', 'l\'achat coûte plus que l\'effort dès l\'année 1');
  assert.ok(p.some((x) => x.pilote === 'maintenu'), 'le prêt soldé laisse l\'enveloppe en place');
});

test('un effort qui suffit tient en une seule période', () => {
  const p = calc.periodesEnveloppe(simuler(), 'achat');
  assert.deepEqual(p.map((x) => x.pilote), ['effort']);
});
