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
    salaireNet: 0, // net avant impôt, €/mois. 0 = non renseigné, facultatif.

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

  /**
   * Taux applicable à l'année `a` (1 = première année).
   *
   * Un taux peut être un NOMBRE — constant, comme aujourd'hui — ou une SÉRIE
   * année par année. La série sert aux scénarios adossés à des données réelles :
   * une décennie de marché ne monte pas de 5 % tous les ans, et c'est
   * précisément ce que les simulateurs linéaires ratent.
   *
   * Au-delà de sa longueur, la série TIENT SA DERNIÈRE VALEUR. Elle ne se
   * répète pas : rejouer une décennie en boucle laissait la répétition décider
   * du résultat. Sur 25 ans, une séquence de 11 ans tourne deux fois et demie,
   * et les 14 années rejouées pèsent PLUS que les 11 vraies, le portefeuille
   * étant au plus gros à la fin. Mesuré : la boucle inversait le signe du
   * verdict sur deux scénarios sur quatre, avec jusqu'à 1,2 M€ d'écart.
   *
   * Le prolongement est donc une décision de scénario, pas du moteur : chaque
   * scénario fournit une série de la longueur de l'horizon, en prolongeant ses
   * années réelles par le taux qu'il assume (voir `scenarios.js`). Ce maintien
   * de la dernière valeur n'est qu'un filet, jamais atteint en pratique.
   */
  function tauxAnnee(valeur, a) {
    if (!Array.isArray(valeur)) return valeur;
    if (!valeur.length) return 0;
    return valeur[Math.min(a - 1, valeur.length - 1)];
  }

  /**
   * Produit des (1 + taux) sur les années `de` à `a` incluses. Rend 1 si
   * l'intervalle est vide. C'est la version « série » de `Math.pow(1+r, n)`.
   */
  function facteur(valeur, de, a) {
    var f = 1;
    for (var k = de; k <= a; k++) f *= 1 + tauxAnnee(valeur, k);
    return f;
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
      // Les revalorisations acceptent un taux constant ou une série annuelle.
      var valeurBien = e.valeurEstimee * facteur(e.revalBien, 1, a);
      var charges = e.chargesCopro * facteur(e.revalCharges, 1, a - 1);
      var taxe = e.taxeFonciere * facteur(e.revalTaxeFonciere, 1, a - 1);
      var totalDebourseAnnuel = pa.totalPaye + charges + taxe;
      var patrimoineNetImmo = valeurBien - pa.crdFin;

      cumulDecaisse += a === 1 ? e.apport + totalDebourseAnnuel : totalDebourseAnnuel;

      // Ce que l'enveloppe laisse disponible pour la bourse, de chaque côté
      var surplusProprio = Math.max(enveloppeAnnuelle - totalDebourseAnnuel, 0);
      var loyerAnnuel = e.loyer * 12 * facteur(e.revalLoyer, 1, a - 1);
      var surplusLocataire = Math.max(enveloppeAnnuelle - loyerAnnuel, 0);

      // Portefeuille : rendement sur le capital de début d'année, puis versement
      var bourse = tauxAnnee(e.rendementBourse, a);
      capitalAchat = capitalAchat * (1 + bourse) + surplusProprio;
      versementsAchat += surplusProprio;
      var baseAchat = e.capitalInitial - e.apport + versementsAchat;
      var impotAchat = Math.max(capitalAchat - baseAchat, 0) * e.fiscalitePlusValues;

      capitalLocation = capitalLocation * (1 + bourse) + surplusLocataire;
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
        // Part du bien réellement possédée : ce qui resterait si on vendait et
        // qu'on soldait le prêt, rapporté à la valeur du bien.
        partPossedee: valeurBien > 0 ? patrimoineNetImmo / valeurBien : 0,
        cumulDecaisse: cumulDecaisse,
        gainCashPur: patrimoineNetImmo - cumulDecaisse,
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
      // Taxe foncière + charges de copropriété de la première année, ramenées
      // au mois. Distinct de `coutMensuelProprio`, qui inclut la mensualité :
      // affichés côte à côte, les deux doivent s'additionner, pas se recouvrir.
      chargesMensuelles: annees.length ? (annees[0].taxeFonciere + annees[0].charges) / 12 : 0,

      // Indicateurs de faisabilité, seulement si le salaire est renseigné.
      // Le taux d'endettement se calcule sur la mensualité assurance comprise,
      // comme le fait le HCSF (plafond usuel de 35 %).
      tauxEndettement: e.salaireNet > 0 ? mensualiteTotale / e.salaireNet : null,
      partEnveloppe: e.salaireNet > 0 ? e.enveloppeMensuelle / e.salaireNet : null,
      enveloppeSuffisante: annees.length
        ? annees[0].totalDebourseAnnuel <= enveloppeAnnuelle
        : true,
      premiereAnneeFavorable: favorable ? favorable.annee : null,
      annees: annees,
    };
  }

  /** Somme d'une colonne annuelle, de l'année 1 à `annee` incluse. */
  function cumul(annees, annee, cle) {
    var n = Math.max(1, Math.min(Math.round(annee), annees.length));
    var total = 0;
    for (var i = 0; i < n; i++) total += annees[i][cle];
    return total;
  }

  /**
   * Répartition de l'enveloppe cumulée jusqu'à `annee`, des deux côtés.
   *
   * Les deux trajectoires dépensent la MÊME enveloppe : ce qui ne part pas
   * dans le logement part en bourse. Les deux totaux sont donc égaux — c'est
   * la prémisse du simulateur, et c'est ce que le graphique doit montrer.
   * Comparer « charges de l'acheteur » à « loyers du locataire » sans les
   * épargnes ferait conclure que l'achat coûte plus cher, alors que l'écart
   * n'est pas dépensé : il est investi.
   *
   * Seule exception : quand l'enveloppe ne couvre pas le coût de possession,
   * le moteur plafonne le surplus à zéro et le côté achat dépasse l'enveloppe.
   * Ce dépassement est une information, pas une anomalie — on le laisse voir.
   */
  function repartitionEnveloppe(res, annee) {
    var a = res.annees;
    var n = Math.max(1, Math.min(Math.round(annee), a.length));
    var c = function (cle) {
      return cumul(a, n, cle);
    };

    var interets = c('interets');
    var assurance = c('assurance');
    var taxeFonciere = c('taxeFonciere');
    var charges = c('charges');

    var achat = {
      credit: interets + assurance,
      capital: c('capitalAmorti'),
      possession: taxeFonciere + charges,
      epargne: c('surplusProprio'),
      detail: {
        interets: interets,
        assurance: assurance,
        taxeFonciere: taxeFonciere,
        charges: charges,
      },
    };
    achat.total = achat.credit + achat.capital + achat.possession + achat.epargne;

    var location = { loyers: c('loyerAnnuel'), epargne: c('surplusLocataire') };
    location.total = location.loyers + location.epargne;

    return {
      annee: n,
      enveloppeCumulee: res.entrees.enveloppeMensuelle * 12 * n,
      achat: achat,
      location: location,
    };
  }

  /**
   * La même répartition que `repartitionEnveloppe`, mais année par année et
   * non cumulée : une ligne par année, chacune sommant l'enveloppe annuelle.
   *
   * Les regroupements (crédit = intérêts + assurance, possession = taxe +
   * charges) vivent ici et pas dans l'interface : deux graphiques qui nomment
   * les mêmes postes doivent les composer de la même façon.
   */
  function repartitionAnnuelle(res) {
    return res.annees.map(function (x) {
      return {
        annee: x.annee,
        achat: {
          credit: x.interets + x.assurance,
          capital: x.capitalAmorti,
          possession: x.taxeFonciere + x.charges,
          epargne: x.surplusProprio,
        },
        location: { loyers: x.loyerAnnuel, epargne: x.surplusLocataire },
      };
    });
  }

  /**
   * Ce que chaque trajectoire ne récupère jamais, cumulé jusqu'à `annee`.
   *
   * Deux exclusions délibérées côté achat :
   * - le CAPITAL remboursé, qui revient dans le patrimoine à la revente ;
   * - les TRAVAUX, parce que le modèle les fond dans la valeur du bien (le
   *   champ s'appelle « valeur estimée du bien après travaux »). Ils reviennent
   *   donc par le prix de revente ; les compter ici les perdrait deux fois.
   *
   * Les frais d'acquisition, eux, sont bien perdus : notaire, agence, banque.
   * Côté location, la totalité du loyer est irrécupérable — c'est ce qui rend
   * la comparaison honnête, au lieu de n'exposer que les frais de l'acheteur.
   */
  function fraisIrrecuperables(res, annee) {
    var a = res.annees;
    var n = Math.max(1, Math.min(Math.round(annee), a.length));
    var e = res.entrees;

    var interets = cumul(a, n, 'interets');
    var assurance = cumul(a, n, 'assurance');
    var taxeFonciere = cumul(a, n, 'taxeFonciere');
    var charges = cumul(a, n, 'charges');

    var achat = {
      acquisition: res.fraisNotaire + e.fraisAgence + e.fraisBancaires,
      credit: interets + assurance,
      possession: taxeFonciere + charges,
      detail: {
        notaire: res.fraisNotaire,
        agence: e.fraisAgence,
        bancaires: e.fraisBancaires,
        interets: interets,
        assurance: assurance,
        taxeFonciere: taxeFonciere,
        charges: charges,
      },
    };
    achat.total = achat.acquisition + achat.credit + achat.possession;

    var location = { loyers: cumul(a, n, 'loyerAnnuel') };
    location.total = location.loyers;

    return { annee: n, achat: achat, location: location };
  }

  var api = {
    DEFAUTS: DEFAUTS,
    fraisDeNotaire: fraisDeNotaire,
    mensualiteCredit: mensualiteCredit,
    tableauAmortissement: tableauAmortissement,
    tauxAnnee: tauxAnnee,
    facteur: facteur,
    simuler: simuler,
    repartitionEnveloppe: repartitionEnveloppe,
    repartitionAnnuelle: repartitionAnnuelle,
    fraisIrrecuperables: fraisIrrecuperables,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    global.SimuRP = api; // navigateur
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
