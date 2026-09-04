/**
 * Moteur de calcul du simulateur « acheter ou louer sa résidence principale ».
 *
 * Port fidèle du classeur docs/simulateur-achat-rp-Paris.xlsx.
 * Module pur : aucune dépendance, aucun accès au DOM.
 *
 * Volontairement écrit en script classique (pas de module ES) : la page doit
 * s'ouvrir aussi bien par double-clic (file://) que servie en HTTP. Les modules
 * ES sont bloqués par CORS sur file://, ce qui rendrait la page inerte en local.
 * Il s'expose donc en `window.SimuRP` dans le navigateur, et en `module.exports`
 * sous Node pour les tests.
 *
 * Principe du modèle : les deux trajectoires consomment la MÊME enveloppe
 * mensuelle (logement + épargne). Ce que le logement ne consomme pas est
 * investi en bourse. On compare les deux patrimoines nets d'impôt.
 */
(function (global) {
  'use strict';

  /** Valeurs par défaut = scénario « Paris » du classeur de référence. */
  var DEFAUTS = {
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
  function fraisDeNotaire(prixNetVendeur, typeBien) {
    var p = prixNetVendeur;
    var emoluments =
      (Math.min(p, 6500) * 0.0387 +
        Math.max(Math.min(p, 17000) - 6500, 0) * 0.01596 +
        Math.max(Math.min(p, 60000) - 17000, 0) * 0.01064 +
        Math.max(p - 60000, 0) * 0.00799) *
      1.2;
    var droitsMutation = p * (typeBien === 'neuf' ? 0.0071498 : 0.0580665);
    var securiteImmobiliere = p * 0.001;
    var debours = 1200;
    return emoluments + droitsMutation + securiteImmobiliere + debours;
  }

  /** Mensualité d'un prêt amortissable à taux fixe (équivalent de PMT). */
  function mensualiteCredit(capital, tauxAnnuel, dureeAnnees) {
    var n = Math.round(dureeAnnees * 12);
    if (n <= 0) return 0;
    var r = tauxAnnuel / 12;
    if (r === 0) return capital / n;
    return (capital * r) / (1 - Math.pow(1 + r, -n));
  }

  /**
   * Tableau d'amortissement mois par mois.
   * L'assurance emprunteur est calculée sur le capital restant dû (elle décroît),
   * pas sur le capital emprunté initial.
   */
  function tableauAmortissement(capital, tauxAnnuel, tauxAssurance, dureeAnnees, nbMois) {
    var mensualite = mensualiteCredit(capital, tauxAnnuel, dureeAnnees);
    var derniereEcheance = Math.round(dureeAnnees * 12);
    var lignes = [];
    var crd = capital;
    for (var mois = 1; mois <= nbMois; mois++) {
      var actif = mois <= derniereEcheance;
      var echeance = actif ? mensualite : 0;
      var interet = crd * (tauxAnnuel / 12);
      var capitalAmorti = Math.max(echeance - interet, 0);
      var assurance = actif ? crd * (tauxAssurance / 12) : 0;
      var crdFin = Math.max(crd - capitalAmorti, 0);
      lignes.push({
        mois: mois,
        crdDebut: crd,
        echeance: echeance,
        interet: interet,
        capitalAmorti: capitalAmorti,
        assurance: assurance,
        crdFin: crdFin,
      });
      crd = crdFin;
    }
    return { mensualite: mensualite, lignes: lignes };
  }

  /** Agrégation annuelle du tableau d'amortissement. */
  function amortissementAnnuel(lignes, nbAnnees) {
    var annees = [];
    for (var a = 1; a <= nbAnnees; a++) {
      var tranche = lignes.slice((a - 1) * 12, a * 12);
      var somme = function (cle) {
        return tranche.reduce(function (total, l) {
          return total + l[cle];
        }, 0);
      };
      var interets = somme('interet');
      var capitalAmorti = somme('capitalAmorti');
      var assurance = somme('assurance');
      annees.push({
        annee: a,
        crdFin: tranche.length ? tranche[tranche.length - 1].crdFin : 0,
        interets: interets,
        capitalAmorti: capitalAmorti,
        assurance: assurance,
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
  function simuler(saisie) {
    var e = Object.assign({}, DEFAUTS, saisie || {});
    var horizon = Math.max(1, Math.round(e.horizon));

    // --- Acquisition -----------------------------------------------------
    var notaire = fraisDeNotaire(e.prixNetVendeur, e.typeBien);
    var coutAcquisition =
      e.prixNetVendeur + notaire + e.fraisAgence + e.travaux + e.fraisBancaires;
    var dettes = Math.max(coutAcquisition - e.apport, 0);

    // --- Prêt ------------------------------------------------------------
    var nbMois = Math.max(horizon, Math.round(e.dureeAnnees)) * 12;
    var pret = tableauAmortissement(
      dettes,
      e.tauxCredit,
      e.tauxAssurance,
      e.dureeAnnees,
      nbMois
    );
    var parAnnee = amortissementAnnuel(pret.lignes, horizon);
    var mensualiteTotale = pret.lignes.length
      ? pret.lignes[0].echeance + pret.lignes[0].assurance
      : 0;

    var enveloppeAnnuelle = e.enveloppeMensuelle * 12;

    // --- Trajectoires année par année ------------------------------------
    var annees = [];
    var cumulDecaisse = 0;
    var capitalAchat = e.capitalInitial - e.apport; // ce qui reste investi côté acheteur
    var capitalLocation = e.capitalInitial; // le locataire garde tout
    var versementsAchat = 0;
    var versementsLocation = 0;

    for (var a = 1; a <= horizon; a++) {
      var pa = parAnnee[a - 1];

      // Côté achat : coût de possession de l'année
      var valeurBien = e.valeurEstimee * Math.pow(1 + e.revalBien, a);
      var charges = e.chargesCopro * Math.pow(1 + e.revalCharges, a - 1);
      var taxe = e.taxeFonciere * Math.pow(1 + e.revalTaxeFonciere, a - 1);
      var totalDebourseAnnuel = pa.totalPaye + charges + taxe;
      var patrimoineNetImmo = valeurBien - pa.crdFin;

      cumulDecaisse += a === 1 ? e.apport + totalDebourseAnnuel : totalDebourseAnnuel;
      var cashSiRevente = patrimoineNetImmo - e.fraisRevente;

      // Ce que l'enveloppe laisse disponible pour la bourse, de chaque côté
      var surplusProprio = Math.max(enveloppeAnnuelle - totalDebourseAnnuel, 0);
      var loyerAnnuel = e.loyer * 12 * Math.pow(1 + e.revalLoyer, a - 1);
      var surplusLocataire = Math.max(enveloppeAnnuelle - loyerAnnuel, 0);

      // Portefeuille : rendement sur le capital de début d'année, puis versement
      capitalAchat = capitalAchat * (1 + e.rendementBourse) + surplusProprio;
      versementsAchat += surplusProprio;
      var baseAchat = e.capitalInitial - e.apport + versementsAchat;
      var impotAchat = Math.max(capitalAchat - baseAchat, 0) * e.fiscalitePlusValues;

      capitalLocation = capitalLocation * (1 + e.rendementBourse) + surplusLocataire;
      versementsLocation += surplusLocataire;
      var baseLocation = e.capitalInitial + versementsLocation;
      var impotLocation = Math.max(capitalLocation - baseLocation, 0) * e.fiscalitePlusValues;

      var patrimoineTotalAchat = patrimoineNetImmo + (capitalAchat - impotAchat);
      var patrimoineTotalLocation = capitalLocation - impotLocation;

      annees.push({
        annee: a,
        // achat
        valeurBien: valeurBien,
        crdFin: pa.crdFin,
        interets: pa.interets,
        capitalAmorti: pa.capitalAmorti,
        assurance: pa.assurance,
        charges: charges,
        taxeFonciere: taxe,
        totalDebourseAnnuel: totalDebourseAnnuel,
        patrimoineNetImmo: patrimoineNetImmo,
        cashSiRevente: cashSiRevente,
        cumulDecaisse: cumulDecaisse,
        gainCashPur: cashSiRevente - cumulDecaisse,
        surplusProprio: surplusProprio,
        capitalAchatBrut: capitalAchat,
        impotAchat: impotAchat,
        capitalAchatNet: capitalAchat - impotAchat,
        patrimoineTotalAchat: patrimoineTotalAchat,
        // location
        loyerAnnuel: loyerAnnuel,
        surplusLocataire: surplusLocataire,
        capitalLocationBrut: capitalLocation,
        impotLocation: impotLocation,
        patrimoineTotalLocation: patrimoineTotalLocation,
        // comparatif
        ecart: patrimoineTotalAchat - patrimoineTotalLocation,
      });
    }

    var favorable = annees.find(function (x) {
      return x.ecart >= 0;
    });

    return {
      entrees: e,
      fraisNotaire: notaire,
      coutAcquisition: coutAcquisition,
      dettes: dettes,
      mensualiteCredit: pret.mensualite,
      mensualiteTotale: mensualiteTotale, // crédit + assurance, premier mois
      coutMensuelProprio: annees.length ? annees[0].totalDebourseAnnuel / 12 : 0,
      enveloppeSuffisante: annees.length
        ? annees[0].totalDebourseAnnuel <= enveloppeAnnuelle
        : true,
      premiereAnneeFavorable: favorable ? favorable.annee : null,
      annees: annees,
    };
  }

  var api = {
    DEFAUTS: DEFAUTS,
    fraisDeNotaire: fraisDeNotaire,
    mensualiteCredit: mensualiteCredit,
    tableauAmortissement: tableauAmortissement,
    simuler: simuler,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    global.SimuRP = api; // navigateur
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
