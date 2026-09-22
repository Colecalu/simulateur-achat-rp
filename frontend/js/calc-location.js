/**
 * Extension « mise en location » du simulateur.
 *
 * À partir d'une année de bascule N, le bien acheté n'est plus revendu : il est
 * mis en location, l'utilisateur se loge ailleurs, et le cash-flow locatif net
 * d'impôt alimente (ou ponctionne) le portefeuille boursier.
 *
 * Ce module CONSOMME la sortie de calc.js — capital restant dû, intérêts,
 * charges, valeur du bien, mensualité — sans jamais la recalculer ni la
 * modifier. calc.js n'a aucune connaissance de ce fichier.
 *
 * Script classique, comme calc.js : window.SimuRPLocation côté navigateur,
 * module.exports côté Node.
 */
(function (global) {
  'use strict';

  // Helpers du moteur de base : un taux peut être constant ou être une série
  // année par année (scénarios historiques). Ce module ne les redéfinit pas.
  var moteur = typeof module !== 'undefined' && module.exports
    ? require('./calc.js')
    : global.SimuRP;
  var tauxAnnee = moteur.tauxAnnee;
  var facteur = moteur.facteur;

  var DEFAUTS_LOCATION = {
    // --- Palier 1 : obligatoires ---
    anneeBascule: null,
    loyerPercu: null, // €/mois, perçu du locataire
    loyerFutur: null, // €/mois, payé par l'utilisateur pour se loger

    // --- Palier 2 : avancés ---
    regime: 'meuble', // 'meuble' (LMNP réel) | 'nu' (foncier réel)
    tmi: 0.3,
    fraisAnnexes: 800, // forfait annuel : gestion, PNO, comptable
    tauxVacance: 0,
    achatMeubles: 0, // € dépensés en mobilier à la mise en location

    // --- Fiscalité ---
    tauxPrelevementsSociaux: 0.186, // 18,6 % à compter de 2026
    tauxImpotPlusValueIR: 0.19,
    plafondDeficitGlobal: 10700, // imputable sur le revenu global, par an
    dureeReportDeficit: 10, // années de report sur les revenus fonciers

    // --- Amortissement LMNP ---
    // La base est la VALEUR D'ENTRÉE DANS L'ACTIVITÉ (valeur du bien l'année
    // de la bascule), pas le prix d'achat historique. Les travaux réalisés à
    // l'acquisition sont donc déjà fondus dans cette valeur : ils ne font pas
    // l'objet d'une dotation séparée.
    quotePartBati: 0.85, // le terrain (15 %) n'est pas amortissable
    dureeAmortBati: 30,
    dureeAmortMobilier: 7,

    // Depuis la loi de finances 2025, les amortissements déduits sont
    // réintégrés dans la plus-value imposable à la revente.
    reintegrerAmortissements: true,
  };

  /**
   * Abattements pour durée de détention, comptés depuis l'achat initial.
   * IR   : 6 %/an de la 6e à la 21e année, 4 % la 22e → exonération à 22 ans.
   * PS   : 1,65 %/an de la 6e à la 21e, 1,60 % la 22e, 9 %/an ensuite
   *        → exonération à 30 ans.
   */
  function abattementPlusValue(detention) {
    var ir = 0;
    if (detention >= 22) ir = 1;
    else if (detention > 5) ir = Math.min(1, (detention - 5) * 0.06);

    var ps = 0;
    if (detention >= 30) ps = 1;
    else if (detention >= 22) ps = Math.min(1, 0.28 + (detention - 22) * 0.09);
    else if (detention > 5) ps = (detention - 5) * 0.0165;

    return { ir: ir, ps: ps };
  }

  /**
   * Dotation annuelle d'amortissement LMNP.
   * @param {number} valeurEntree - valeur du bien l'année de la mise en location
   * @param {object} o - options (quote-part bâti, durées, achat de meubles)
   */
  function dotationAmortissement(valeurEntree, o) {
    var bati =
      o.dureeAmortBati > 0 ? (valeurEntree * o.quotePartBati) / o.dureeAmortBati : 0;
    var mobilier =
      o.dureeAmortMobilier > 0 ? o.achatMeubles / o.dureeAmortMobilier : 0;
    return { bati: bati, mobilier: mobilier };
  }

  /**
   * Supprime les reports périmés. Doit tourner CHAQUE année, y compris les
   * exercices déficitaires : sinon un stock jamais consommé ne s'éteint pas.
   */
  function purgerStock(stock, anneeCourante, duree) {
    for (var i = stock.length - 1; i >= 0; i--) {
      if (anneeCourante - stock[i].annee >= duree) stock.splice(i, 1);
    }
  }

  /**
   * Consomme un stock de reports (file d'attente datée) à hauteur de `montant`.
   * Retourne ce qui a réellement pu être imputé.
   */
  function consommerStock(stock, montant) {
    var restant = montant;
    var impute = 0;
    for (var j = 0; j < stock.length && restant > 0; j++) {
      var pris = Math.min(stock[j].montant, restant);
      stock[j].montant -= pris;
      restant -= pris;
      impute += pris;
    }
    for (var k = stock.length - 1; k >= 0; k--) {
      if (stock[k].montant <= 1e-9) stock.splice(k, 1);
    }
    return impute;
  }

  function totalStock(stock) {
    return stock.reduce(function (t, l) {
      return t + l.montant;
    }, 0);
  }

  /**
   * @param {object} base    - résultat de SimuRP.simuler(), en lecture seule
   * @param {object} options - voir DEFAUTS_LOCATION
   * @returns {object} { options, annees[], dotation, prixAcquisitionFiscal }
   */
  function simulerMiseEnLocation(base, options) {
    var o = Object.assign({}, DEFAUTS_LOCATION, options || {});
    var e = base.entrees;
    var N = Math.max(1, Math.round(o.anneeBascule));
    var enveloppeAnnuelle = e.enveloppeMensuelle * 12;

    // Valeur du bien l'année où il entre dans l'activité locative : c'est elle
    // qui sert de base à l'amortissement, pas le prix payé des années plus tôt.
    var indiceEntree = Math.min(N, base.annees.length) - 1;
    var valeurEntreeActivite = base.annees.length ? base.annees[indiceEntree].valeurBien : 0;
    var dotation = dotationAmortissement(valeurEntreeActivite, o);

    // Prix d'acquisition fiscal : les frais bancaires sont des frais de prêt,
    // pas des frais d'acquisition — ils n'entrent pas dans la base.
    var prixAcquisitionFiscal =
      e.prixNetVendeur + base.fraisNotaire + e.fraisAgence + e.travaux;

    // État accumulé d'une année sur l'autre
    var capital = e.capitalInitial - e.apport; // portefeuille boursier
    var versements = e.capitalInitial - e.apport; // base fiscale du portefeuille
    var stockDeficitFoncier = []; // location nue : reports datés (10 ans)
    var stockAmortissement = 0; // LMNP : excédent reportable sans limite
    var stockDeficitBIC = 0; // LMNP : déficit hors amortissement
    var amortissementsDeduits = 0; // cumul, pour la plus-value

    var annees = [];

    for (var t = 1; t <= base.annees.length; t++) {
      var b = base.annees[t - 1];

      // ---------------------------------------------------------------
      // Avant la bascule : trajectoire strictement identique au scénario
      // d'achat classique. Le bien est encore la résidence principale,
      // donc exonéré de plus-value.
      // ---------------------------------------------------------------
      if (t < N) {
        capital = b.capitalAchatBrut;
        versements += b.surplusProprio;
        annees.push({
          annee: t,
          enLocation: false,
          valeurBien: b.valeurBien,
          crdFin: b.crdFin,
          revenusBruts: 0,
          chargesAnnuelles: 0,
          chargesDeductibles: 0,
          cashFlowAvantImpot: 0,
          baseImposable: 0,
          impotLocatif: 0,
          economieDeficit: 0,
          cashFlowNet: 0,
          amortissementUtilise: 0,
          stockAmortissement: 0,
          stockDeficitFoncier: 0,
          loyerFuturAnnuel: 0,
          reliquatEnveloppe: b.surplusProprio,
          versementPortefeuille: b.surplusProprio,
          capitalPortefeuilleBrut: b.capitalAchatBrut,
          impotPortefeuille: b.impotAchat,
          capitalPortefeuilleNet: b.capitalAchatNet,
          plusValueBrute: 0,
          plusValueImposable: 0,
          abattementIR: 0,
          abattementPS: 0,
          impotPlusValue: 0,
          patrimoineTotal: b.patrimoineTotalAchat,
        });
        continue;
      }

      // ---------------------------------------------------------------
      // À partir de la bascule
      // ---------------------------------------------------------------
      var anneesDepuisBascule = t - N;

      // Les deux loyers sont saisis en euros DU MOMENT DE LA BASCULE, puis
      // indexés à l'IRL à partir de là. C'est volontaire : ils décrivent une
      // décision future (relouer son bien, se loger ailleurs — éventuellement
      // moins cher, en province par exemple). Ils n'ont donc aucune raison de
      // suivre la trajectoire du loyer de référence, qui décrit une autre vie.
      // Indexé sur les années RÉELLEMENT écoulées depuis la bascule : avec une
      // série, ce sont ces années-là du scénario qui s'appliquent, pas les
      // premières.
      var indexation = facteur(e.revalLoyer, N + 1, t);
      var loyerPercuAnnuel = o.loyerPercu * 12 * indexation;
      var revenusBruts = loyerPercuAnnuel * (1 - o.tauxVacance);
      var loyerFuturAnnuel = o.loyerFutur * 12 * indexation;

      // Charges et mensualité viennent telles quelles du moteur de base :
      // aucune logique de prêt n'est redupliquée ici.
      var chargesAnnuelles = o.fraisAnnexes + b.charges + b.taxeFonciere;
      var mensualiteAnnuelle = b.interets + b.capitalAmorti + b.assurance;
      var cashFlowAvantImpot = revenusBruts - chargesAnnuelles - mensualiteAnnuelle;

      // Charges déductibles : le capital amorti n'en fait pas partie, seuls
      // les intérêts et l'assurance emprunteur sont déductibles.
      var chargesDeductibles =
        b.charges + b.taxeFonciere + o.fraisAnnexes + b.interets + b.assurance;

      var resultat = revenusBruts - chargesDeductibles;
      var baseImposable = 0;
      var impotLocatif = 0;
      var economieDeficit = 0;
      var amortissementUtilise = 0;

      if (o.regime === 'nu') {
        // --- Foncier réel -------------------------------------------------
        purgerStock(stockDeficitFoncier, t, o.dureeReportDeficit);
        if (resultat >= 0) {
          var impute = consommerStock(stockDeficitFoncier, resultat);
          baseImposable = resultat - impute;
          impotLocatif =
            baseImposable * (o.tmi + o.tauxPrelevementsSociaux);
        } else {
          var deficit = -resultat;
          // La fraction due aux intérêts n'est jamais imputable sur le
          // revenu global : elle part intégralement en report.
          var chargesFinancieres = b.interets + b.assurance;
          var partInterets = Math.min(deficit, chargesFinancieres);
          var partAutres = deficit - partInterets;

          var imputableGlobal = Math.min(partAutres, o.plafondDeficitGlobal);
          economieDeficit = imputableGlobal * o.tmi;

          var reporte = deficit - imputableGlobal;
          if (reporte > 0) stockDeficitFoncier.push({ annee: t, montant: reporte });
        }
      } else {
        // --- LMNP réel (BIC) ----------------------------------------------
        var avantAmort = resultat;

        // Un déficit BIC antérieur s'impute avant l'amortissement.
        if (avantAmort > 0 && stockDeficitBIC > 0) {
          var prisBIC = Math.min(stockDeficitBIC, avantAmort);
          stockDeficitBIC -= prisBIC;
          avantAmort -= prisBIC;
        }

        if (avantAmort < 0) {
          stockDeficitBIC += -avantAmort;
          avantAmort = 0;
        }

        // Dotation de l'année, chaque composant sur sa propre durée.
        var dotationAnnuelle =
          (anneesDepuisBascule < o.dureeAmortBati ? dotation.bati : 0) +
          (anneesDepuisBascule < o.dureeAmortMobilier ? dotation.mobilier : 0);

        var amortDisponible = dotationAnnuelle + stockAmortissement;
        amortissementUtilise = Math.min(avantAmort, amortDisponible);
        stockAmortissement = amortDisponible - amortissementUtilise;
        amortissementsDeduits += amortissementUtilise;

        baseImposable = avantAmort - amortissementUtilise;
        impotLocatif = baseImposable * o.tmi; // pas de PS en BIC
      }

      var cashFlowNet = cashFlowAvantImpot - impotLocatif + economieDeficit;

      // --- Portefeuille boursier ----------------------------------------
      var reliquatEnveloppe = Math.max(enveloppeAnnuelle - loyerFuturAnnuel, 0);

      // Le mobilier est acheté une seule fois, l'année de la mise en location.
      // C'est une sortie de trésorerie réelle : elle ponctionne le portefeuille.
      // Le mobilier n'est pas compté dans le patrimoine (il se déprécie à zéro).
      var achatMobilier = t === N && o.regime === 'meuble' ? o.achatMeubles : 0;

      var versement = reliquatEnveloppe + cashFlowNet - achatMobilier; // peut être négatif

      capital = capital * (1 + tauxAnnee(e.rendementBourse, t)) + versement;
      versements = Math.max(versements + versement, 0);
      var impotPortefeuille =
        Math.max(capital - versements, 0) * e.fiscalitePlusValues;

      // --- Plus-value immobilière ---------------------------------------
      // L'exonération résidence principale est perdue dès la bascule.
      var plusValueBrute = b.valeurBien - prixAcquisitionFiscal;
      var plusValueImposable = plusValueBrute;
      if (o.regime === 'meuble' && o.reintegrerAmortissements) {
        plusValueImposable += amortissementsDeduits;
      }

      var ab = abattementPlusValue(t);
      var impotPlusValue = 0;
      if (plusValueImposable > 0) {
        impotPlusValue =
          plusValueImposable * (1 - ab.ir) * o.tauxImpotPlusValueIR +
          plusValueImposable * (1 - ab.ps) * o.tauxPrelevementsSociaux;
      }

      var patrimoineTotal =
        b.valeurBien - b.crdFin - impotPlusValue + (capital - impotPortefeuille);

      annees.push({
        annee: t,
        enLocation: true,
        valeurBien: b.valeurBien,
        crdFin: b.crdFin,
        revenusBruts: revenusBruts,
        chargesAnnuelles: chargesAnnuelles,
        chargesDeductibles: chargesDeductibles,
        mensualiteAnnuelle: mensualiteAnnuelle,
        cashFlowAvantImpot: cashFlowAvantImpot,
        resultatFiscal: resultat,
        baseImposable: baseImposable,
        impotLocatif: impotLocatif,
        economieDeficit: economieDeficit,
        cashFlowNet: cashFlowNet,
        amortissementUtilise: amortissementUtilise,
        stockAmortissement: stockAmortissement,
        stockDeficitFoncier: totalStock(stockDeficitFoncier),
        loyerPercuAnnuel: loyerPercuAnnuel,
        loyerFuturAnnuel: loyerFuturAnnuel,
        reliquatEnveloppe: reliquatEnveloppe,
        achatMobilier: achatMobilier,
        versementPortefeuille: versement,
        capitalPortefeuilleBrut: capital,
        impotPortefeuille: impotPortefeuille,
        capitalPortefeuilleNet: capital - impotPortefeuille,
        plusValueBrute: plusValueBrute,
        plusValueImposable: plusValueImposable,
        abattementIR: ab.ir,
        abattementPS: ab.ps,
        impotPlusValue: impotPlusValue,
        patrimoineTotal: patrimoineTotal,
      });
    }

    return {
      options: o,
      anneeBascule: N,
      dotation: dotation,
      dotationAnnuelle: dotation.bati + dotation.mobilier,
      valeurEntreeActivite: valeurEntreeActivite,
      prixAcquisitionFiscal: prixAcquisitionFiscal,
      annees: annees,
    };
  }

  var api = {
    DEFAUTS_LOCATION: DEFAUTS_LOCATION,
    purgerStock: purgerStock,
    abattementPlusValue: abattementPlusValue,
    dotationAmortissement: dotationAmortissement,
    simulerMiseEnLocation: simulerMiseEnLocation,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SimuRPLocation = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
