/* =========================================================================
 * Page d'accueil — l'exemple chiffré.
 *
 * Aucune logique financière ici : tout vient de calc.js (window.SimuRP),
 * appelé avec la tendance longue de scenarios.js. Les chiffres affichés sur
 * la page d'accueil sont donc exactement ceux que donnerait le simulateur
 * sur le même projet — jamais des montants illustratifs écrits à la main,
 * qui divergeraient du moteur à la première correction.
 *
 * Script classique en IIFE, comme le reste du front : pas de modules ES.
 * ========================================================================= */
(function () {
  'use strict';

  var SimuRP = window.SimuRP;
  var Scenarios = window.SimuRPScenarios;
  if (!SimuRP || !Scenarios) return; // la page reste lisible sans l'exemple

  /*
   * Le projet de l'exemple. Choisi pour que le seuil tombe AU MILIEU du
   * curseur : un exemple qui ferait gagner l'un des deux côtés à l'arrivée
   * sur la page serait lu comme la réponse du site, alors que le message est
   * précisément que la réponse dépend du rapport loyer / prix.
   *
   * L'effort mensuel et l'épargne de départ ne changent pas l'écart (les deux
   * trajectoires disposent du même argent, voir CLAUDE.md §1) : ils ne servent
   * qu'à la carte de l'accroche, qui montre comment l'enveloppe se répartit.
   */
  var PROJET = Object.assign({}, Scenarios.TENDANCE_LONGUE, {
    prixNetVendeur: 400000,
    valeurEstimee: 400000,
    typeBien: 'ancien',
    travaux: 0,
    fraisAgence: 0,
    apport: 80000,
    capitalInitial: 100000,
    enveloppeMensuelle: 2500,
    dureeAnnees: 25,
    tauxCredit: 0.035,
    chargesCopro: 1800,
    taxeFonciere: 1400,
    horizon: 25,
  });

  /* En dessous de ce montant, annoncer un gagnant serait surinterpréter : un
     dixième de point de rendement boursier déplace davantage le résultat. */
  var ECART_NEGLIGEABLE = 10000;

  var euros = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  });
  var pourcent = new Intl.NumberFormat('fr-FR', {
    style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
  });

  var curseur = document.getElementById('demoLoyer');
  var puces = Array.prototype.slice.call(document.querySelectorAll('[data-rendement]'));

  function simuler(loyer) {
    return SimuRP.simuler(Object.assign({}, PROJET, { loyer: loyer }));
  }

  function ecartFinal(loyer) {
    var res = simuler(loyer);
    return res.annees[res.annees.length - 1].ecart;
  }

  /* Loyer d'équilibre par dichotomie : l'écart final croît avec le loyer
     (seul le côté locataire en dépend), la recherche est donc sûre. */
  function loyerEquilibre() {
    var bas = 100, haut = 6000;
    for (var i = 0; i < 40; i++) {
      var milieu = (bas + haut) / 2;
      if (ecartFinal(milieu) < 0) bas = milieu; else haut = milieu;
    }
    return (bas + haut) / 2;
  }

  /*
   * Année à partir de laquelle le gagnant final ne quitte plus la tête.
   * Pas `premiereAnneeFavorable` du moteur : les courbes peuvent se croiser
   * deux fois, et annoncer « l'achat passe devant en année 10 » alors qu'il
   * repasse derrière ensuite serait faux.
   */
  function anneeDefinitive(annees, achatGagne) {
    var depuis = annees.length;
    for (var i = annees.length - 1; i >= 0; i--) {
      if ((annees[i].ecart >= 0) !== achatGagne) break;
      depuis = annees[i].annee;
    }
    return depuis;
  }

  function ecrire(cle, texte) {
    var noeuds = document.querySelectorAll('[data-demo="' + cle + '"]');
    for (var i = 0; i < noeuds.length; i++) noeuds[i].textContent = texte;
  }

  /* Proportions posées en propriétés personnalisées via le CSSOM : aucun
     attribut style dans le HTML, ce qui reste compatible avec la CSP stricte
     prévue (docs/backend-spec.md). */
  function proportion(selecteur, valeur) {
    var el = document.querySelector(selecteur);
    if (el) el.style.setProperty('--part', String(Math.max(0, Math.min(1, valeur))));
  }

  function afficher() {
    var loyer = Number(curseur.value);
    var res = simuler(loyer);
    var fin = res.annees[res.annees.length - 1];
    var enveloppe = PROJET.enveloppeMensuelle;
    var logementAchat = res.coutMensuelProprio;

    // --- Carte de l'accroche : la répartition de l'enveloppe, première année
    ecrire('enveloppe', euros.format(enveloppe));
    ecrire('logementAchat', euros.format(logementAchat));
    ecrire('investiAchat', euros.format(Math.max(enveloppe - logementAchat, 0)));
    ecrire('loyer', euros.format(loyer));
    ecrire('investiLocation', euros.format(Math.max(enveloppe - loyer, 0)));
    proportion('[data-demo-barre="achat"]', logementAchat / enveloppe);
    proportion('[data-demo-barre="location"]', loyer / enveloppe);

    // --- L'exemple
    document.getElementById('demoLoyerValeur').textContent = euros.format(loyer) + '/mois';
    curseur.setAttribute('aria-valuetext', euros.format(loyer) + ' par mois');
    ecrire('rendement', pourcent.format((loyer * 12) / PROJET.prixNetVendeur));

    var achat = fin.patrimoineTotalAchat;
    var location = fin.patrimoineTotalLocation;
    ecrire('patrimoineAchat', euros.format(achat));
    ecrire('patrimoineLocation', euros.format(location));
    var max = Math.max(achat, location, 1);
    proportion('[data-demo-part="achat"]', achat / max);
    proportion('[data-demo-part="location"]', location / max);

    var verdict = document.getElementById('demoVerdict');
    var bascule = document.getElementById('demoBascule');
    var ecart = fin.ecart;
    if (Math.abs(ecart) < ECART_NEGLIGEABLE) {
      verdict.textContent = 'Les deux se valent, à quelques milliers d’euros près.';
      verdict.removeAttribute('data-cote');
      bascule.textContent = 'C’est le seuil : un loyer un peu plus haut fait gagner l’achat, un peu plus bas la location.';
    } else {
      var achatGagne = ecart > 0;
      verdict.textContent = (achatGagne ? 'Acheter' : 'Louer et investir') +
        ' vous laisse ' + euros.format(Math.abs(ecart)) + ' de plus.';
      verdict.setAttribute('data-cote', achatGagne ? 'achat' : 'location');
      var depuis = anneeDefinitive(res.annees, achatGagne);
      bascule.textContent = depuis <= 1
        ? (achatGagne ? 'L’achat' : 'La location') + ' est devant dès la première année, et jusqu’au bout.'
        : (achatGagne ? 'L’achat' : 'La location') + ' passe définitivement devant à partir de la ' +
          depuis + 'e année.';
    }

    // Une puce n'est « enfoncée » que si le curseur est exactement sur sa valeur.
    puces.forEach(function (p) {
      p.setAttribute('aria-pressed', String(loyerPourRendement(Number(p.dataset.rendement)) === loyer));
    });
  }

  function loyerPourRendement(rendement) {
    var pas = Number(curseur.step) || 25;
    var brut = (rendement * PROJET.prixNetVendeur) / 12;
    return Math.min(Number(curseur.max), Math.max(Number(curseur.min), Math.round(brut / pas) * pas));
  }

  // --- Le seuil, calculé une fois : il ne dépend pas de la position du curseur
  var equilibre = loyerEquilibre();
  var min = Number(curseur.min), maxCurseur = Number(curseur.max);
  curseur.style.setProperty('--seuil', String((equilibre - min) / (maxCurseur - min)));
  ecrire('rendementSeuil', pourcent.format((equilibre * 12) / PROJET.prixNetVendeur) +
    ' (' + euros.format(Math.round(equilibre / 10) * 10) + ')');

  // Position de départ : au seuil, arrondi au pas. Voir le commentaire de PROJET.
  var pasCurseur = Number(curseur.step) || 25;
  curseur.value = String(Math.round(equilibre / pasCurseur) * pasCurseur);

  curseur.addEventListener('input', afficher);
  puces.forEach(function (p) {
    p.addEventListener('click', function () {
      curseur.value = String(loyerPourRendement(Number(p.dataset.rendement)));
      afficher();
    });
  });

  afficher();
})();
