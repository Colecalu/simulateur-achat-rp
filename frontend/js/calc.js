/**
 * Moteur de calcul du simulateur « acheter ou louer sa résidence principale ».
 *
 * Port fidèle du classeur docs/simulateur-achat-rp-Paris.xlsx.
 * Module pur : aucune dépendance, aucun accès au DOM — il tourne aussi bien
 * dans le navigateur que sous Node (utilisé tel quel par tests/calc.test.mjs).
 *
 * Principe du modèle : les deux trajectoires consomment la MÊME enveloppe
 * mensuelle (logement + épargne). Ce que le logement ne consomme pas est
 * investi en bourse. On compare les deux patrimoines nets d'impôt.
 */

/** Valeurs par défaut = scénario « Paris » du classeur de référence. */
export const DEFAUTS = {
  capitalInitial: 200000,
  enveloppeMensuelle: 3400,

  prixNetVendeur: 420000,
  typeBien: 'ancien', // 'ancien' | 'neuf'
  fraisAgence: 0,
  travaux: 50000,
  fraisBancaires: 2000,
  valeurEstimee: 500000, // valeur réelle du bien en année 0, après travaux

  apport: 100000,
  dureeAnnees: 20,
  tauxCredit: 0.035,
  tauxAssurance: 0.0015,

  chargesCopro: 1500,
  taxeFonciere: 1500,
  revalBien: 0.01,
  revalTaxeFonciere: 0.01,
  revalCharges: 0.01,

  loyer: 1600,
  revalLoyer: 0.01,

  rendementBourse: 0.05, // BRUT, pas net d'impôt
  fiscalitePlusValues: 0.314, // flat tax CTO 2026 ; PEA/AV ont d'autres taux
  fraisRevente: 0,

  horizon: 25,
};

/**
 * Frais de notaire dans l'ancien ou le neuf, assis sur le prix net vendeur.
 * Émoluments du notaire au barème dégressif (+ TVA 20 %), droits de mutation,
 * contribution de sécurité immobilière, débours forfaitaires.
 */
export function fraisDeNotaire(prixNetVendeur, typeBien = 'ancien') {
  const p = prixNetVendeur;
  const emoluments =
    (Math.min(p, 6500) * 0.0387 +
      Math.max(Math.min(p, 17000) - 6500, 0) * 0.01596 +
      Math.max(Math.min(p, 60000) - 17000, 0) * 0.01064 +
      Math.max(p - 60000, 0) * 0.00799) *
    1.2;
  const droitsMutation = p * (typeBien === 'neuf' ? 0.0071498 : 0.0580665);
  const securiteImmobiliere = p * 0.001;
  const debours = 1200;
  return emoluments + droitsMutation + securiteImmobiliere + debours;
}

/** Mensualité d'un prêt amortissable à taux fixe (équivalent de PMT). */
export function mensualiteCredit(capital, tauxAnnuel, dureeAnnees) {
  const n = Math.round(dureeAnnees * 12);
  if (n <= 0) return 0;
  const r = tauxAnnuel / 12;
  if (r === 0) return capital / n;
  return (capital * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Tableau d'amortissement mois par mois.
 * L'assurance emprunteur est calculée sur le capital restant dû (elle décroît),
 * pas sur le capital emprunté initial.
 */
export function tableauAmortissement(capital, tauxAnnuel, tauxAssurance, dureeAnnees, nbMois) {
  const mensualite = mensualiteCredit(capital, tauxAnnuel, dureeAnnees);
  const derniereEcheance = Math.round(dureeAnnees * 12);
  const lignes = [];
  let crd = capital;
  for (let mois = 1; mois <= nbMois; mois++) {
    const actif = mois <= derniereEcheance;
    const echeance = actif ? mensualite : 0;
    const interet = crd * (tauxAnnuel / 12);
    const capitalAmorti = Math.max(echeance - interet, 0);
    const assurance = actif ? crd * (tauxAssurance / 12) : 0;
    const crdFin = Math.max(crd - capitalAmorti, 0);
    lignes.push({ mois, crdDebut: crd, echeance, interet, capitalAmorti, assurance, crdFin });
    crd = crdFin;
  }
  return { mensualite, lignes };
}

/** Agrégation annuelle du tableau d'amortissement. */
function amortissementAnnuel(lignes, nbAnnees) {
  const annees = [];
  for (let a = 1; a <= nbAnnees; a++) {
    const tranche = lignes.slice((a - 1) * 12, a * 12);
    const somme = (cle) => tranche.reduce((total, l) => total + l[cle], 0);
    const interets = somme('interet');
    const capitalAmorti = somme('capitalAmorti');
    const assurance = somme('assurance');
    annees.push({
      annee: a,
      crdFin: tranche.length ? tranche[tranche.length - 1].crdFin : 0,
      interets,
      capitalAmorti,
      assurance,
      totalPaye: interets + capitalAmorti + assurance,
    });
  }
  return annees;
}

/**
 * Lance la simulation complète.
 * @param {object} saisie - surcharge partielle de DEFAUTS
 * @returns {object} coûts d'acquisition, prêt, et une ligne par année d'horizon
 */
export function simuler(saisie = {}) {
  const e = { ...DEFAUTS, ...saisie };
  const horizon = Math.max(1, Math.round(e.horizon));

  // --- Acquisition -------------------------------------------------------
  const notaire = fraisDeNotaire(e.prixNetVendeur, e.typeBien);
  const coutAcquisition =
    e.prixNetVendeur + notaire + e.fraisAgence + e.travaux + e.fraisBancaires;
  const dettes = Math.max(coutAcquisition - e.apport, 0);

  // --- Prêt --------------------------------------------------------------
  const nbMois = Math.max(horizon, Math.round(e.dureeAnnees)) * 12;
  const pret = tableauAmortissement(
    dettes,
    e.tauxCredit,
    e.tauxAssurance,
    e.dureeAnnees,
    nbMois
  );
  const parAnnee = amortissementAnnuel(pret.lignes, horizon);
  const mensualiteTotale = pret.lignes.length
    ? pret.lignes[0].echeance + pret.lignes[0].assurance
    : 0;

  const enveloppeAnnuelle = e.enveloppeMensuelle * 12;

  // --- Trajectoires année par année --------------------------------------
  const annees = [];
  let cumulDecaisse = 0;
  let capitalAchat = e.capitalInitial - e.apport; // ce qui reste investi côté acheteur
  let capitalLocation = e.capitalInitial; // le locataire garde tout
  let versementsAchat = 0;
  let versementsLocation = 0;

  for (let a = 1; a <= horizon; a++) {
    const pa = parAnnee[a - 1];

    // Côté achat : coût de possession de l'année
    const valeurBien = e.valeurEstimee * Math.pow(1 + e.revalBien, a);
    const charges = e.chargesCopro * Math.pow(1 + e.revalCharges, a - 1);
    const taxe = e.taxeFonciere * Math.pow(1 + e.revalTaxeFonciere, a - 1);
    const totalDebourseAnnuel = pa.totalPaye + charges + taxe;
    const patrimoineNetImmo = valeurBien - pa.crdFin;

    cumulDecaisse += a === 1 ? e.apport + totalDebourseAnnuel : totalDebourseAnnuel;
    const cashSiRevente = patrimoineNetImmo - e.fraisRevente;

    // Ce que l'enveloppe laisse disponible pour la bourse, de chaque côté
    const surplusProprio = Math.max(enveloppeAnnuelle - totalDebourseAnnuel, 0);
    const loyerAnnuel = e.loyer * 12 * Math.pow(1 + e.revalLoyer, a - 1);
    const surplusLocataire = Math.max(enveloppeAnnuelle - loyerAnnuel, 0);

    // Portefeuille : rendement sur le capital de début d'année, puis versement
    capitalAchat = capitalAchat * (1 + e.rendementBourse) + surplusProprio;
    versementsAchat += surplusProprio;
    const baseAchat = e.capitalInitial - e.apport + versementsAchat;
    const impotAchat = Math.max(capitalAchat - baseAchat, 0) * e.fiscalitePlusValues;

    capitalLocation = capitalLocation * (1 + e.rendementBourse) + surplusLocataire;
    versementsLocation += surplusLocataire;
    const baseLocation = e.capitalInitial + versementsLocation;
    const impotLocation = Math.max(capitalLocation - baseLocation, 0) * e.fiscalitePlusValues;

    const patrimoineTotalAchat = patrimoineNetImmo + (capitalAchat - impotAchat);
    const patrimoineTotalLocation = capitalLocation - impotLocation;

    annees.push({
      annee: a,
      // achat
      valeurBien,
      crdFin: pa.crdFin,
      interets: pa.interets,
      capitalAmorti: pa.capitalAmorti,
      assurance: pa.assurance,
      charges,
      taxeFonciere: taxe,
      totalDebourseAnnuel,
      patrimoineNetImmo,
      cashSiRevente,
      cumulDecaisse,
      gainCashPur: cashSiRevente - cumulDecaisse,
      surplusProprio,
      capitalAchatBrut: capitalAchat,
      impotAchat,
      capitalAchatNet: capitalAchat - impotAchat,
      patrimoineTotalAchat,
      // location
      loyerAnnuel,
      surplusLocataire,
      capitalLocationBrut: capitalLocation,
      impotLocation,
      patrimoineTotalLocation,
      // comparatif
      ecart: patrimoineTotalAchat - patrimoineTotalLocation,
    });
  }

  const favorable = annees.find((x) => x.ecart >= 0);

  return {
    entrees: e,
    fraisNotaire: notaire,
    coutAcquisition,
    dettes,
    mensualiteCredit: pret.mensualite,
    mensualiteTotale, // crédit + assurance, premier mois
    coutMensuelProprio: annees.length ? annees[0].totalDebourseAnnuel / 12 : 0,
    enveloppeSuffisante: annees.length
      ? annees[0].totalDebourseAnnuel <= enveloppeAnnuelle
      : true,
    premiereAnneeFavorable: favorable ? favorable.annee : null,
    annees,
  };
}
