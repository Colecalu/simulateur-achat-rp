/* =========================================================================
 * Page d'accueil — apparitions au défilement et exemple chiffré.
 *
 * Aucune logique financière ici : l'exemple appelle calc.js (window.SimuRP)
 * sur un jeu d'entrées figé. Les chiffres affichés sont exactement ceux que
 * donnerait le simulateur sur ces entrées — jamais des montants écrits à la
 * main, qui divergeraient du moteur à la première correction.
 *
 * Chargé dans <head> SANS defer, pour poser la classe `js` avant le premier
 * affichage : c'est elle qui masque les blocs en attente d'apparition. Sans
 * JavaScript, rien n'est masqué. Le reste attend DOMContentLoaded, moment où
 * Chart.js et calc.js (chargés en defer) sont disponibles.
 * ========================================================================= */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var mouvementReduit =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /*
   * Le projet de l'exemple : un appartement ancien plausible en métropole
   * (4,3 % de rendement locatif brut), crédit sur 25 ans. Les taux de crédit,
   * d'assurance et de marché sont ceux du moteur par défaut — les mêmes que
   * le simulateur, pour qu'un visiteur qui recopie ces entrées retrouve ces
   * chiffres. Choisi pour que les courbes se croisent pendant l'horizon.
   */
  var ENTREES = {
    prixNetVendeur: 280000,
    valeurEstimee: 280000,
    typeBien: 'ancien',
    travaux: 0,
    fraisAgence: 0,
    apport: 40000,
    capitalInitial: 60000,
    dureeAnnees: 25,
    chargesCopro: 1200,
    taxeFonciere: 1000,
    loyer: 1000,
    // Profil : loyer actuel 1 000 € + épargne 600 € = effort de 1 600 €/mois.
    enveloppeMensuelle: 1600,
    revenusFoyer: 4500,
    horizon: 25,
  };

  var euros = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  });
  var dixieme = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  /* Sans signe, comme le verdict du simulateur : « −42 618 € de patrimoine en
     plus » se lisait comme une perte. La couleur dit qui gagne, la phrase
     dessous l'explicite. */
  var signe = function (v) { return euros.format(Math.abs(v)); };
  var jeton = function (nom) { return getComputedStyle(document.body).getPropertyValue(nom).trim(); };
  var $ = function (id) { return document.getElementById(id); };

  document.addEventListener('DOMContentLoaded', function () {
    initialiserApparitions();
    initialiserExemple();
  });

  /* ------------------------------------------------------------ Apparitions */

  /** Appelle `rappel(el)` une seule fois, quand `el` entre dans la fenêtre. */
  function aLaVue(el, seuil, rappel) {
    if (mouvementReduit || !('IntersectionObserver' in window)) {
      rappel(el);
      return;
    }
    var observateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (entree) {
        if (!entree.isIntersecting) return;
        observateur.disconnect();
        rappel(entree.target);
      });
    }, { threshold: seuil, rootMargin: '0px 0px -8% 0px' });
    observateur.observe(el);
  }

  function initialiserApparitions() {
    var montrer = function (el) { el.classList.add('est-visible'); };
    document.querySelectorAll('.apparait, [data-echelonne]').forEach(function (el) {
      aLaVue(el, 0.15, montrer);
    });
    // L'enveloppe attend d'être bien visible : le dédoublement doit se voir.
    document.querySelectorAll('[data-enveloppe]').forEach(function (el) {
      aLaVue(el, 0.6, function (cible) {
        // Un temps de pause sur la barre unique avant qu'elle se dédouble.
        setTimeout(function () { montrer(cible); }, mouvementReduit ? 0 : 400);
      });
    });
  }

  /* ---------------------------------------------------------------- Exemple */

  var resultat = null;
  var graphique = null;
  var compteurFini = false;
  // Le trait du point d'équilibre attend la fin du tracé : il ne doit pas
  // apparaître avant que les courbes l'aient atteint.
  var traceFini = mouvementReduit;

  function initialiserExemple() {
    var bloc = document.querySelector('[data-exemple]');
    if (!bloc || !window.SimuRP) return;

    var e = Object.assign({}, window.SimuRP.DEFAUTS, ENTREES);
    resultat = window.SimuRP.simuler(e);

    $('exempleHypotheses').textContent = [
      'Bien ancien à ' + euros.format(e.prixNetVendeur),
      'apport ' + euros.format(e.apport),
      'loyer actuel ' + euros.format(e.loyer) + '/mois',
      'crédit ' + e.dureeAnnees + ' ans à ' + dixieme.format(e.tauxCredit * 100) + ' %',
      'revenus du foyer ' + euros.format(e.revenusFoyer) + '/mois',
      'bourse ' + dixieme.format(e.rendementBourse * 100) + ' %/an',
      'immobilier ' + dixieme.format(e.revalBien * 100) + ' %/an',
    ].join(' · ');

    remplirKpis();

    var curseur = $('exempleHorizon');
    curseur.addEventListener('input', function () {
      compteurFini = true; // l'utilisateur a pris la main : plus d'animation
      afficherVerdict(Number(curseur.value), true);
      if (graphique) graphique.update('none');
    });

    // Le verdict s'affiche d'emblée quand rien ne sera animé.
    if (mouvementReduit || typeof Chart === 'undefined') {
      compteurFini = true;
      afficherVerdict(horizon(), true);
    } else {
      afficherVerdict(horizon(), false);
    }

    aLaVue(bloc, 0.3, dessinerGraphique);
  }

  function horizon() { return Number($('exempleHorizon').value); }

  /** Même formulation que le verdict du simulateur (app.js, afficherVerdict). */
  function afficherVerdict(h, avecChiffre) {
    var ligne = resultat.annees[h - 1];
    var ecart = ligne.ecart;
    $('exempleHorizonLabel').textContent = h + ' an' + (h > 1 ? 's' : '');

    var chiffre = $('exempleChiffre');
    chiffre.className = 'verdict__chiffre ' +
      (ecart >= 0 ? 'verdict__chiffre--achat' : 'verdict__chiffre--location');
    if (avecChiffre) chiffre.textContent = signe(ecart);

    var reference = Math.max(ligne.patrimoineTotalAchat, ligne.patrimoineTotalLocation);
    $('exempleMesure').textContent = Math.abs(ecart) < reference * 0.01
      ? 'd’écart : à cette échéance, les deux scénarios se valent.'
      : ecart >= 0
        ? 'de patrimoine en plus en achetant qu’en restant locataire.'
        : 'de patrimoine en plus en restant locataire qu’en achetant.';

    var pointMort = resultat.premiereAnneeFavorable;
    $('exemplePointMortNote').textContent = pointMort !== null && ecart < 0 && h > pointMort
      ? 'L’achat passe devant à l’année ' + pointMort +
        ', mais la location reprend l’avantage avant l’année ' + h + '.'
      : '';
  }

  /** Le verdict monte de zéro à sa valeur, une fois les courbes tracées. */
  function compterVerdict() {
    if (compteurFini) return;
    var cible = resultat.annees[horizon() - 1].ecart;
    var el = $('exempleChiffre');
    var duree = 900;
    var debut = null;
    function pas(t) {
      if (compteurFini) return;
      if (debut === null) debut = t;
      var p = Math.min((t - debut) / duree, 1);
      var adouci = 1 - Math.pow(1 - p, 3);
      el.textContent = signe(Math.round(cible * adouci));
      if (p < 1) requestAnimationFrame(pas);
      else compteurFini = true;
    }
    requestAnimationFrame(pas);
  }

  function remplirKpis() {
    var an1 = resultat.annees[0];
    var e = resultat.entrees;
    var pointMort = resultat.premiereAnneeFavorable;
    $('exemplePointMort').textContent =
      pointMort === null ? 'Jamais' : pointMort === 1 ? 'Dès la 1re année' : pointMort + ' ans';
    $('exempleCoutReel').textContent = euros.format(an1.totalDebourseAnnuel / 12);
    $('exempleInvestiAchat').textContent = euros.format(Math.max(an1.surplusProprio / 12, 0));
    $('exempleLoyer').textContent = euros.format(an1.loyerAnnuel / 12);
    $('exempleInvestiLocation').textContent = euros.format(Math.max(an1.surplusLocataire / 12, 0));
    $('exempleEndettement').textContent =
      e.revenusFoyer > 0 ? Math.round(resultat.tauxEndettement * 100) + ' %' : '—';
  }

  /* Trait vertical au point d'équilibre, comme dans le simulateur. */
  var traitPointMort = {
    id: 'traitPointMort',
    afterDatasetsDraw: function (chart) {
      var annee = resultat.premiereAnneeFavorable;
      if (!traceFini || !annee || annee <= 1) return;
      var x = chart.scales.x.getPixelForValue(annee - 1);
      var zone = chart.chartArea;
      var ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = jeton('--encre-3');
      ctx.beginPath();
      ctx.moveTo(x, zone.top);
      ctx.lineTo(x, zone.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = jeton('--encre-2');
      ctx.font = '600 11px ' + jeton('--police');
      ctx.textAlign = x > (zone.left + zone.right) / 2 ? 'right' : 'left';
      ctx.fillText('point d’équilibre', x + (ctx.textAlign === 'right' ? -6 : 6), zone.top + 12);
      ctx.restore();
    },
  };

  /*
   * Tracé progressif, de gauche à droite : chaque point part de la position
   * du précédent (recette « progressive line » de la documentation Chart.js).
   */
  function animationProgressive(nbPoints, duree) {
    var delai = duree / nbPoints;
    var precedent = function (ctx) {
      if (ctx.index === 0) return ctx.chart.scales.y.getPixelForValue(ctx.raw);
      return ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1].getProps(['y'], true).y;
    };
    var retard = function (cle) {
      return function (ctx) {
        if (ctx.type !== 'data' || ctx[cle]) return 0;
        ctx[cle] = true;
        return ctx.index * delai;
      };
    };
    return {
      x: { type: 'number', easing: 'linear', duration: delai, from: NaN, delay: retard('xParti') },
      y: { type: 'number', easing: 'linear', duration: delai, from: precedent, delay: retard('yParti') },
    };
  }

  function dessinerGraphique() {
    if (typeof Chart === 'undefined') {
      var zone = document.querySelector('[data-exemple] .graphique');
      var p = document.createElement('p');
      p.className = 'graphique__absent';
      p.textContent = 'Graphique indisponible : la librairie Chart.js n’a pas pu être chargée.';
      zone.replaceChildren(p);
      return;
    }

    var annees = resultat.annees;
    var cAchat = jeton('--achat');
    var cLocation = jeton('--location');
    var duree = 1800;

    var serie = function (label, donnees, couleur) {
      return {
        label: label,
        data: donnees,
        borderColor: couleur,
        backgroundColor: couleur,
        borderWidth: 2,
        // Le point de l'horizon choisi est grossi, comme dans le simulateur.
        pointRadius: function (ctx) { return ctx.dataIndex === horizon() - 1 ? 6 : 0; },
        pointHoverRadius: 6,
        pointBackgroundColor: couleur,
        pointBorderColor: jeton('--surface'),
        pointBorderWidth: 2,
        tension: 0.25,
      };
    };

    graphique = new Chart($('exempleGraphique'), {
      type: 'line',
      data: {
        labels: annees.map(function (a) { return a.annee; }),
        datasets: [
          serie('Achat', annees.map(function (a) { return a.patrimoineTotalAchat; }), cAchat),
          serie('Location', annees.map(function (a) { return a.patrimoineTotalLocation; }), cLocation),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: mouvementReduit ? false : {
          onComplete: function (ev) {
            if (traceFini) return;
            traceFini = true;
            ev.chart.draw();
          },
        },
        animations: mouvementReduit ? undefined : animationProgressive(annees.length, duree),
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: jeton('--surface'),
            borderColor: jeton('--axe'),
            borderWidth: 1,
            titleColor: jeton('--encre'),
            bodyColor: jeton('--encre-2'),
            padding: 11,
            cornerRadius: 8,
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            callbacks: {
              title: function (items) { return 'Année ' + items[0].label; },
              label: function (ctx) { return ' ' + ctx.dataset.label + ' : ' + euros.format(ctx.parsed.y); },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: jeton('--axe') },
            ticks: { color: jeton('--encre-3'), maxRotation: 0, autoSkipPadding: 16 },
          },
          y: {
            grid: { color: jeton('--grille'), drawTicks: false },
            border: { display: false },
            ticks: {
              color: jeton('--encre-3'),
              padding: 8,
              callback: function (v) {
                return Math.abs(v) >= 1000 ? Math.round(v / 1000) + ' k€' : v + ' €';
              },
            },
          },
        },
      },
      plugins: [traitPointMort],
    });

    if (mouvementReduit) return;
    setTimeout(compterVerdict, duree + 150);
  }
})();
