/**
 * Vérifie les deux lectures cumulées ajoutées au moteur : la répartition de
 * l'enveloppe et les frais irrécupérables.
 *
 * Ces tests verrouillent deux décisions de périmètre qui ne se devinent pas en
 * lisant le code, et dont l'oubli ferait dire au graphique le contraire de la
 * vérité :
 *   1. les deux trajectoires dépensent la même enveloppe ;
 *   2. les travaux ne sont PAS irrécupérables, le modèle les fond dans la
 *      valeur du bien.
 *
 *   node --test tests/indicateurs.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import calc from '../frontend/js/calc.js';

const { simuler, repartitionEnveloppe, fraisIrrecuperables, DEFAUTS } = calc;
const r = simuler({ horizon: 25 });
const proche = (a, b, tolerance = 0.5) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b} (écart ${Math.abs(a - b)})`);

test("les deux trajectoires dépensent exactement la même enveloppe", () => {
  // C'est la prémisse du simulateur. Si ce test tombe, le graphique « où va
  // votre enveloppe » ment : il laisserait croire qu'un côté coûte plus cher,
  // alors que l'écart n'est pas dépensé mais investi.
  for (const annee of [1, 5, 10, 20, 25]) {
    const rep = repartitionEnveloppe(r, annee);
    proche(rep.achat.total, rep.enveloppeCumulee);
    proche(rep.location.total, rep.enveloppeCumulee);
  }
});

test("l'enveloppe insuffisante fait dépasser le côté achat, sans le masquer", () => {
  // Hors du domaine finançable, le moteur plafonne le surplus à zéro : le coût
  // de possession dépasse l'enveloppe. Le dépassement doit rester visible.
  const serre = simuler({ enveloppeMensuelle: 1200, horizon: 10 });
  const rep = repartitionEnveloppe(serre, 10);
  assert.equal(rep.achat.epargne, 0);
  assert.ok(rep.achat.total > rep.enveloppeCumulee);
});

test("la répartition somme bien ses propres postes", () => {
  const rep = repartitionEnveloppe(r, 12);
  proche(rep.achat.credit, rep.achat.detail.interets + rep.achat.detail.assurance);
  proche(rep.achat.possession, rep.achat.detail.taxeFonciere + rep.achat.detail.charges);
  proche(
    rep.achat.total,
    rep.achat.credit + rep.achat.capital + rep.achat.possession + rep.achat.epargne
  );
  proche(rep.location.total, rep.location.loyers + rep.location.epargne);
});

test("les travaux ne comptent pas dans les frais irrécupérables", () => {
  // Le modèle fond les travaux dans la valeur du bien (« valeur estimée après
  // travaux ») : ils reviennent par le prix de revente. Les y compter serait
  // les perdre deux fois.
  //
  // On finance les travaux supplémentaires par un apport équivalent, pour que
  // l'emprunt reste identique. Sans cette précaution le test mesurerait autre
  // chose : des travaux empruntés coûtent des intérêts, qui sont eux bien
  // irrécupérables — c'est correct, mais ce n'est pas la question posée ici.
  const base = fraisIrrecuperables(simuler({ travaux: 50000, apport: 100000 }), 20);
  const plus = fraisIrrecuperables(simuler({ travaux: 100000, apport: 150000 }), 20);
  proche(plus.achat.total, base.achat.total);
});

test("des travaux empruntés coûtent en revanche des intérêts, eux perdus", () => {
  // Le pendant du test précédent : à apport constant, plus de travaux, c'est
  // plus de dette, donc plus d'intérêts — et les intérêts ne reviennent jamais.
  const base = fraisIrrecuperables(simuler({ travaux: 50000 }), 20);
  const plus = fraisIrrecuperables(simuler({ travaux: 100000 }), 20);
  assert.ok(plus.achat.credit > base.achat.credit);
  proche(plus.achat.acquisition, base.achat.acquisition);
  proche(plus.achat.possession, base.achat.possession);
});

test("le capital remboursé ne compte pas dans les frais irrécupérables", () => {
  const irr = fraisIrrecuperables(r, 20);
  const rep = repartitionEnveloppe(r, 20);
  assert.ok(rep.achat.capital > 0);
  proche(irr.achat.total, irr.achat.acquisition + irr.achat.credit + irr.achat.possession);
  assert.ok(irr.achat.total < rep.achat.total - rep.achat.capital + 1);
});

test("les frais d'acquisition comptent, eux, en totalité", () => {
  const irr = fraisIrrecuperables(r, 20);
  proche(
    irr.achat.acquisition,
    r.fraisNotaire + DEFAUTS.fraisAgence + DEFAUTS.fraisBancaires
  );
  // Ils ne dépendent pas de l'année : ils sont payés une fois, à l'entrée.
  proche(fraisIrrecuperables(r, 1).achat.acquisition, irr.achat.acquisition);
});

test("la totalité du loyer est irrécupérable", () => {
  const irr = fraisIrrecuperables(r, 15);
  const rep = repartitionEnveloppe(r, 15);
  proche(irr.location.total, rep.location.loyers);
});

test("la part possédée va de l'apport à la totalité du bien", () => {
  const annees = r.annees;
  assert.ok(annees[0].partPossedee > 0 && annees[0].partPossedee < 1);
  // Elle croît : le capital se rembourse et le bien se revalorise.
  for (let i = 1; i < annees.length; i++) {
    assert.ok(annees[i].partPossedee >= annees[i - 1].partPossedee - 1e-9);
  }
  // Une fois le prêt soldé, on possède tout.
  const solde = simuler({ dureeAnnees: 10, horizon: 15 });
  proche(solde.annees[14].partPossedee, 1, 1e-9);
});

test("les cumuls sont bornés à l'horizon simulé", () => {
  const fin = repartitionEnveloppe(r, 25);
  proche(repartitionEnveloppe(r, 99).achat.total, fin.achat.total);
  proche(repartitionEnveloppe(r, 0).achat.total, repartitionEnveloppe(r, 1).achat.total);
});

test("la répartition annuelle somme l'enveloppe de chaque année", () => {
  const annuel = calc.repartitionAnnuelle(r);
  const enveloppe = DEFAUTS.enveloppeMensuelle * 12;
  assert.equal(annuel.length, r.annees.length);
  for (const ligne of annuel) {
    const a = ligne.achat;
    proche(a.credit + a.capital + a.possession + a.epargne, enveloppe);
    proche(ligne.location.loyers + ligne.location.epargne, enveloppe);
  }
});

test("le cumul des années redonne la répartition cumulée", () => {
  // Les deux lectures composent les mêmes postes : si elles divergent, deux
  // graphiques nommant « intérêts et assurance » montreraient des choses
  // différentes.
  const annuel = calc.repartitionAnnuelle(r).slice(0, 12);
  const cumule = repartitionEnveloppe(r, 12);
  for (const poste of ['credit', 'capital', 'possession', 'epargne']) {
    proche(annuel.reduce((t, l) => t + l.achat[poste], 0), cumule.achat[poste]);
  }
  proche(annuel.reduce((t, l) => t + l.location.loyers, 0), cumule.location.loyers);
});

test("les charges mensualisées et la mensualité ne se recouvrent pas", () => {
  // Les deux chiffres sont affichés côte à côte : ils doivent s'additionner.
  //
  // À l'euro près seulement : `mensualiteTotale` porte l'assurance du PREMIER
  // MOIS, calculée sur le capital entier, tandis que `coutMensuelProprio`
  // moyenne la première année, où l'assurance décroît à mesure que le capital
  // s'amortit. L'écart (0,81 € ici) est la moitié d'une année d'amortissement
  // d'assurance — c'est le comportement voulu, pas un arrondi.
  proche(r.mensualiteTotale + r.chargesMensuelles, r.coutMensuelProprio, 2);
});
