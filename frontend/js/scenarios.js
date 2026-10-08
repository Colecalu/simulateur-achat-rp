/**
 * Scénarios de marché — deuxième pilier du simulateur.
 *
 * Les simulateurs classiques proposent « pessimiste / médian / optimiste » sous
 * la forme d'un taux constant : +1 % tous les ans, +5 % tous les ans. Aucun
 * marché ne se comporte ainsi, et c'est justement dans l'ORDRE des années que
 * se joue une bonne part du résultat — encaisser un krach la première année
 * n'a pas le même effet que de l'encaisser la dixième.
 *
 * Chaque scénario porte donc des SÉRIES année par année. Le moteur sait les
 * consommer : voir `tauxAnnee` et `facteur` dans calc.js.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ⚠️  DONNÉES PROVISOIRES — STRUCTURE DÉFINITIVE, VALEURS NON FIGÉES      │
 * │                                                                          │
 * │  Ce fichier est en place pour recevoir les données officielles. Tant que  │
 * │  `STATUT_DONNEES` n'est pas 'DEFINITIF', aucune valeur qui en sort ne     │
 * │  doit être citée ailleurs ni servir à conclure quoi que ce soit.          │
 * │  Détail de la dette : CLAUDE.md, section 10.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * QUATRE SCÉNARIOS, DEUX GROUPES
 *
 *   « Le passé » (Historique) — deux fenêtres de VINGT ans découpées dans une
 *   seule série observée continue : la plus favorable à l'achat, la moins
 *   favorable. Sélection faite UNE SEULE FOIS hors ligne par
 *   `outils/fenetres-historiques.mjs`, puis figée ici. Le simulateur ne
 *   recalcule jamais ce choix, et il est identique pour tous les utilisateurs.
 *
 *   « Des futurs possibles » (Hypothèse) — deux stress tests symétriques,
 *   chacun sur UN SEUL risque, l'autre marché restant sur la tendance longue.
 *   C'est ce qui les rend lisibles : on sait exactement ce qui est testé.
 *
 * UNE SEULE SÉRIE OBSERVÉE, PAS QUATRE DÉCENNIES
 *
 *   La version précédente portait quatre décennies qui se chevauchaient. Deux
 *   scénarios pouvaient alors afficher deux valeurs différentes pour la même
 *   année — deux vérités dans le même produit. Les fenêtres sont désormais
 *   DÉCOUPÉES dans `SERIES_OBSERVEES` : une année n'a qu'une valeur, et
 *   corriger la série corrige tous les scénarios d'un coup.
 *
 * PAS DE BOUCLE. Une série plus courte que l'horizon n'est jamais rejouée :
 * sur 25 ans, une séquence de 11 ans tournait deux fois et demie, et les
 * 14 années répétées pesaient PLUS que les 11 vraies — le portefeuille étant au
 * plus gros à la fin. Mesuré : la boucle inversait le signe du verdict sur deux
 * scénarios sur quatre, avec jusqu'à 1,2 M€ d'écart. Chaque scénario est donc
 * prolongé explicitement, et ce prolongement est tracé à l'écran.
 *
 * UN SCÉNARIO NE SE NOMME JAMAIS PAR SON RÉSULTAT. « Favorable à l'achat »
 * dépend du profil de l'utilisateur, pas du scénario. On nomme ce qui s'est
 * passé sur les marchés — les fenêtres par leur année de départ.
 *
 * Script classique, comme calc.js : window.SimuRPScenarios côté navigateur.
 */
(function (global) {
  'use strict';

  /** Tant que ce n'est pas 'DEFINITIF', rien de ce fichier ne fait autorité. */
  var STATUT_DONNEES = 'PROVISOIRE';

  var HORIZON = 25;
  var CLES = [
    'rendementBourse',
    'revalBien',
    'revalLoyer',
    'revalCharges',
    'revalTaxeFonciere',
  ];

  /* ====================================================================== 1 —
   * LA TENDANCE LONGUE
   *
   * C'est la VUE DE BASE du simulateur : ce qui s'applique quand aucun scénario
   * n'est choisi, et ce sur quoi les deux stress tests retombent une fois le
   * choc passé. Chaque taux se décompose `nominal = (1 + réel) × (1 + inflation)`,
   * inflation à 2,0 % (cible BCE). Raisonnement complet : CLAUDE.md, section 8.
   *
   * ⚠️ DEUX ENDROITS, UNE SEULE DÉCISION. Ces valeurs doivent finir identiques
   * aux défauts de `calc.js` (`DEFAUTS.revalBien`, `DEFAUTS.rendementBourse`…) :
   * la tendance longue EST la vue de base. Elles ne le sont PAS aujourd'hui —
   * les défauts du moteur portent encore les anciennes valeurs rondes, et on ne
   * les bouge qu'une fois les sources reçues, d'un seul coup. Backlog :
   * CLAUDE.md, section 11.
   */
  var TENDANCE_LONGUE = {
    // PROVISOIRE — 2 % + rendement réel de long terme des actions mondiales
    // (Dimson-Marsh-Staunton), moins les frais de gestion d'un ETF monde.
    rendementBourse: 0.068,
    // PROVISOIRE — 2 % + croissance réelle du revenu disponible par ménage (INSEE).
    revalBien: 0.025,
    // VALIDÉ — l'IRL EST légalement l'inflation (loi du 8 février 2008).
    revalLoyer: 0.02,
    // VALIDÉ — inflation.
    revalCharges: 0.02,
    // VALIDÉ — inflation + 0,5 pt : les taux communaux dérivent au-delà de la
    // revalorisation forfaitaire des valeurs locatives.
    revalTaxeFonciere: 0.025,
  };

  /* ====================================================================== 2 —
   * LES SÉRIES OBSERVÉES, 1991 → 2022
   *
   * Une seule série continue par grandeur, sur la couverture commune aux
   * quatre. Les fenêtres historiques y sont découpées ; rien d'autre dans ce
   * fichier n'est observé.
   *
   * ⚠️ `rendementBourse` 1999-2011 est FAUX : ce sont des valeurs USD, pas EUR
   * (1991-1998 a été converti via le franc, voir le tableau).
   * Diagnostic confirmé (CLAUDE.md §10) : 9 années sur 11 coïncident au
   * centième avec le MSCI World USD Net, 0 sur 11 avec l'EUR. 2012-2022 vient
   * en revanche de la fiche officielle MSCI World EUR Net. La série est donc
   * PANACHÉE tant que les années 1991-2011 ne sont pas remplacées.
   *
   * ⚠️ Ces mêmes tableaux existent dans `outils/fenetres-historiques.mjs`, qui
   * ne part jamais en production mais sert à choisir les fenêtres. Les deux
   * fichiers changent ENSEMBLE, sans quoi les fenêtres figées ici ne
   * correspondraient plus au classement qui les a désignées.
   */
  var DEPART_SERIES = 1991;
  var FIN_SERIES = 2022;

  var SERIES_OBSERVEES = {
    rendementBourse: [
      // 1991-1998 — MSCI World USD Net converti en EUR via le franc (parité fixe
      // 6,55957 F/€, sans effet sur un rendement) : r€ = (1 + r$) × S(t) / S(t-1) − 1,
      // S = francs pour 1 $, moyenne mensuelle de décembre (FRED EXFRUS), prise
      // comme approximation du cours de fin d'année.
      0.2414, -0.0419, 0.3272, -0.0271, 0.1052, 0.2005, 0.3152, 0.1687,
      // 1999-2011 — ⚠️ PROVISOIRE, valeurs USD à remplacer par du MSCI World EUR Net
      0.253, -0.132,
      -0.165, -0.199, 0.331, 0.147, 0.095, 0.207, 0.09, -0.403, 0.3, 0.118, -0.055,
      // 2012-2022 — MSCI World EUR Net, fiche officielle
      0.1405, 0.212, 0.195, 0.1042, 0.1073, 0.0751, -0.0411, 0.3002, 0.0633,
      0.3107, -0.1278,
    ],
    revalBien: [
      0.051, -0.023, -0.015, -0.001, -0.009, 0.008, 0.018, 0.012, 0.071, 0.087,
      0.079, 0.086, 0.119, 0.15, 0.155, 0.12, 0.065, 0.009, -0.071, 0.051, 0.059,
      -0.005, -0.021, -0.018, -0.019, 0.009, 0.03, 0.03, 0.033, 0.055, 0.067, 0.063,
    ],
    revalLoyer: [
      0.054, 0.051, 0.033, 0.027, 0.026, 0.016, 0.017, 0.021, 0.014, -0.003, 0.008,
      0.03, 0.027, 0.034, 0.035, 0.032, 0.032, 0.017, 0.02, 0.013, 0.012, 0.017,
      0.013, 0.01, 0.005, 0.003, 0.002, -0.008, 0.011, 0.002, 0.008, 0.012,
    ],
    revalCharges: [
      0.03, 0.019, 0.021, 0.016, 0.021, 0.017, 0.011, 0.002, 0.013, 0.016, 0.014,
      0.023, 0.022, 0.021, 0.016, 0.015, 0.026, 0.01, 0.009, 0.018, 0.025, 0.013,
      0.007, 0.001, 0.002, 0.006, 0.012, 0.016, 0.015, -0.0002, 0.028, 0.059,
    ],
    // Faute de série dédiée, la taxe foncière suit l'inflation générale. C'est
    // une sous-estimation connue — les taux communaux dérivent en plus — et la
    // réserve est portée à l'écran, pas seulement ici.
    revalTaxeFonciere: null, // alias de revalCharges, posé juste en dessous
  };
  SERIES_OBSERVEES.revalTaxeFonciere = SERIES_OBSERVEES.revalCharges.slice();

  var SOURCES_OBSERVEES = {
    rendementBourse:
      '⚠️ PROVISOIRE — MSCI World : 2012-2022 en EUR dividendes nets réinvestis ' +
      '(fiche officielle), 1991-1998 USD converti en EUR via le franc, ' +
      '1999-2011 en USD, à remplacer',
    revalBien:
      'INSEE, indice Notaires-INSEE 010567059, France métropolitaine, maisons + appartements',
    revalLoyer:
      'INSEE, IPC 04.1.1.0 « loyers effectivement payés », série 001763982, déc./déc.',
    revalCharges: 'INSEE, IPC ensemble, série 001759970, déc./déc.',
    revalTaxeFonciere:
      "Alignée sur l'inflation générale, faute de série dédiée — minore la dérive réelle",
  };

  /*
   * Dans un stress test, une seule grandeur porte le choc : c'est la seule dont
   * la provenance demande une explication. Les autres SUIVENT la tendance
   * longue, et le dire est déjà la source complète.
   */
  var SOURCES_CONSTRUITES = {
    rendementBourse: 'Tendance longue (voir les hypothèses par défaut)',
    revalBien: 'Tendance longue (voir les hypothèses par défaut)',
    revalLoyer: 'Tendance longue (IRL = inflation, par construction légale)',
    revalCharges: 'Tendance longue (inflation)',
    revalTaxeFonciere: 'Tendance longue (inflation + 0,5 pt)',
  };

  /** Réserve commune tant que la série boursière n'est pas corrigée. */
  var RESERVE_DEVISE =
    'Données provisoires : les rendements boursiers 1991-2011 sont en dollars, ' +
    'pas en euros. Le chemin année par année est donc faux sur cette partie. ' +
    'Ni la période retenue ni les chiffres affichés ne sont définitifs.';

  /* ====================================================================== 3 —
   * OUTILLAGE
   */

  /**
   * Taux annuel équivalent d'une série : la moyenne GÉOMÉTRIQUE, pas
   * l'arithmétique. −20 % puis +30 % ne fait pas +5 % par an, il fait +1,98 %.
   * L'arithmétique surestime toujours — c'est elle qui prolongerait une fenêtre
   * au-delà de ce qu'elle a réellement produit.
   */
  function tauxEquivalent(serie) {
    if (!Array.isArray(serie) || !serie.length) return serie || 0;
    var produit = 1;
    for (var i = 0; i < serie.length; i++) produit *= 1 + serie[i];
    return Math.pow(produit, 1 / serie.length) - 1;
  }

  /** Découpe `longueur` années d'une série observée, à partir de `debut`. */
  function fenetre(cle, debut, longueur) {
    var i = debut - DEPART_SERIES;
    var s = SERIES_OBSERVEES[cle];
    if (i < 0 || i + longueur > s.length) {
      throw new Error('Fenêtre ' + debut + '+' + longueur + ' hors des données pour ' + cle);
    }
    return s.slice(i, i + longueur);
  }

  /** Complète une série jusqu'à l'horizon avec un taux constant assumé. */
  function prolonger(serie, taux) {
    var s = serie.slice(0, HORIZON);
    while (s.length < HORIZON) s.push(taux);
    return s;
  }

  /* ====================================================================== 4 —
   * « LE PASSÉ » — deux fenêtres de vingt ans
   *
   * ⚠️ Les deux périodes ci-dessous sont PROVISOIRES : elles sortent du
   * classement produit par `outils/fenetres-historiques.mjs` sur des données
   * boursières fausses. L'outil refuse d'ailleurs de « retenir » une période
   * tant qu'une série est marquée provisoire. Elles sont là pour que la
   * structure tourne, pas pour être montrées comme un résultat.
   *
   * Ce qui ne changera PAS avec les bonnes données :
   *   · la longueur — vingt ans, pour que huit fenêtres au moins soient
   *     distinctes dans trente-deux années de données ;
   *   · le critère — l'écart de patrimoine net à 25 ans sur un profil type ;
   *   · le prolongement des années 21 à 25 au taux annualisé GÉOMÉTRIQUE de la
   *     fenêtre, et non au rythme de long terme : une fenêtre doit finir comme
   *     elle a vécu, sinon deux récits se mélangent dans la même courbe ;
   *   · l'absence de médiane — testée sur sept profils, elle se déplace de 1995
   *     à 2000 selon le profil. Les extrêmes, eux, sont robustes.
   */
  var LONGUEUR_FENETRE = 20;

  var FENETRES = [
    {
      cle: 'passe-favorable-achat',
      debut: 1992, // PROVISOIRE
      resume:
        "L'immobilier français sort de la bulle de 1990 et recule cinq ans durant, " +
        'avant le long boom de 1998-2008. Côté marchés : une décennie 1990 ' +
        "haussière, l'éclatement de la bulle internet, puis la crise de 2008.",
    },
    {
      cle: 'passe-defavorable-achat',
      debut: 2002, // PROVISOIRE
      resume:
        'Le sommet du boom immobilier français, puis une décennie de prix presque ' +
        'plats. Côté marchés : la reprise qui suit la bulle internet, le krach de ' +
        '2008, et la longue hausse des années 2010.',
    },
  ];

  var SCENARIOS = FENETRES.map(function (f) {
    var fin = f.debut + LONGUEUR_FENETRE - 1;
    var taux = {};
    var suite = {};
    for (var i = 0; i < CLES.length; i++) {
      var c = CLES[i];
      var observe = fenetre(c, f.debut, LONGUEUR_FENETRE);
      suite[c] = tauxEquivalent(observe);
      taux[c] = prolonger(observe, suite[c]);
    }
    return {
      cle: f.cle,
      // Nommé par son année de départ : c'est un fait, pas un jugement.
      nom: 'Acheter en ' + f.debut,
      famille: 'historique',
      periode: f.debut + '–' + fin,
      resume: f.resume,
      sources: SOURCES_OBSERVEES,
      reserves: [
        RESERVE_DEVISE,
        'Période retenue à titre provisoire : le classement des fenêtres sera ' +
          'refait une fois la série boursière corrigée.',
      ],
      taux: taux,
      // Années réellement observées. Au-delà, la courbe passe en pointillé.
      reel: LONGUEUR_FENETRE,
      // Années explicitement définies avant le prolongement plat. Identique à
      // `reel` ici ; les deux diffèrent pour un scénario construit.
      definies: LONGUEUR_FENETRE,
      suite: suite,
      suiteBourse: suite.rendementBourse,
      suiteImmo: suite.revalBien,
    };
  });

  /* ====================================================================== 5 —
   * « DES FUTURS POSSIBLES » — deux stress tests symétriques
   *
   * Règle commune : UN SEUL marché est choqué, l'autre reste sur la tendance
   * longue. Un scénario qui choquerait tout en même temps ne dirait plus ce
   * qu'il teste, et il serait impossible d'en tirer une leçon.
   *
   * Aucune de ces deux trajectoires n'est observée : `reel` vaut 0, et rien
   * n'y est présenté comme une donnée.
   */

  /** Les deux marchés que le lecteur suit. Le reste accompagne l'inflation. */
  var MARCHES = {
    rendementBourse: 'la bourse',
    revalBien: "l'immobilier",
  };

  /**
   * Fabrique un scénario construit : un choc année par année sur une grandeur,
   * la tendance longue partout ailleurs et après le choc.
   *
   * Le scénario porte QUEL marché est choqué et quel est l'autre : c'est la
   * phrase que l'interface doit pouvoir écrire sans rien redécouvrir, et
   * l'écrire à l'envers (« l'autre reste sur la tendance longue en bourse »
   * alors que c'est la bourse qui est choquée) serait pire qu'un silence.
   */
  function construit(def) {
    var taux = {};
    var suite = {};
    var definies = 0;
    for (var i = 0; i < CLES.length; i++) {
      var c = CLES[i];
      var choc = def.choc[c] || [];
      suite[c] = TENDANCE_LONGUE[c];
      taux[c] = prolonger(choc, TENDANCE_LONGUE[c]);
      if (choc.length > definies) definies = choc.length;
    }

    var cleChoquee = Object.keys(def.choc)[0];
    var cleAutre = cleChoquee === 'rendementBourse' ? 'revalBien' : 'rendementBourse';

    // La grandeur choquée dit d'où vient son choc : un calibrage construit n'a
    // pas la même provenance qu'une séquence reprise d'un épisode réel.
    var sources = Object.assign({}, SOURCES_CONSTRUITES);
    sources[cleChoquee] = def.sourceChoc;

    return {
      choque: { cle: cleChoquee, nom: MARCHES[cleChoquee] },
      autre: {
        cle: cleAutre,
        nom: MARCHES[cleAutre],
        taux: TENDANCE_LONGUE[cleAutre],
      },
      cle: def.cle,
      nom: def.nom,
      famille: 'prospectif',
      periode: null,
      resume: def.resume,
      sources: sources,
      reserves: def.reserves,
      taux: taux,
      reel: 0, // aucune année observée : c'est une hypothèse d'un bout à l'autre
      definies: definies,
      suite: suite,
      suiteBourse: suite.rendementBourse,
      suiteImmo: suite.revalBien,
    };
  }

  SCENARIOS.push(
    construit({
      cle: 'correction-immobiliere',
      nom: 'Correction immobilière',
      resume:
        "Les prix de l'immobilier reculent pendant les premières années — le moment " +
        "où l'emprunteur est le plus endetté, et où le bien vaut le moins par rapport " +
        'à sa dette. Les marchés, eux, restent sur la tendance longue : un seul ' +
        'risque est testé à la fois.',
      sourceChoc:
        'Calibrage construit, non observé — choix délibérément plus sévère que ' +
        "l'épisode français de 1992-1997",
      reserves: [
        'Hypothèse construite, pas une observation. Aucune prétention de précision.',
        'Calibrage : −6,9 % nominal cumulé sur cinq ans, soit −15,6 % réel avec une ' +
          'inflation à 2 %. C’est plus sévère que le seul épisode français observé ' +
          '(1992-1997 : −2,2 % nominal, −11,9 % réel) — délibérément, parce qu’une ' +
          'correction lente n’est pas la seule forme possible.',
        'À recaler sur 2023-2024 quand les données INSEE seront disponibles.',
      ],
      choc: {
        // Calibrage VALIDE, et volontairement plus dur que l'observé. Attention au
        // piège : comparer deux cumuls NOMINAUX entre deux mondes d'inflation
        // différents ne veut rien dire. En réel, ces cinq années font −15,6 %
        // contre −11,9 % pour 1992-1997 — c'est un tiers plus sévère, assumé.
        //
        // La baisse tombe DANS LES PREMIÈRES ANNÉES : c'est là qu'elle fait mal,
        // pas en fin de parcours où la dette est éteinte.
        revalBien: [-0.03, -0.03, -0.02, 0, 0.01],
      },
    }),
    construit({
      cle: 'decennie-perdue-bourse',
      nom: 'Décennie perdue en bourse',
      resume:
        'Les actions mondiales font du surplace douze années durant — deux krachs, ' +
        'et un portefeuille revenu à son point de départ — avant de repartir sur la ' +
        "tendance longue. L'immobilier, lui, reste sur la tendance longue.",
      sourceChoc:
        '⚠️ PROVISOIRE — séquence du MSCI World 2000-2011, en dollars faute de ' +
        'série EUR sur ces années',
      // Pas de `RESERVE_DEVISE` ici : elle parle d'une « période retenue »,
      // notion qui n'a de sens que pour une fenêtre historique. La réserve
      // ci-dessous dit la même chose, en plus exact pour ce scénario.
      reserves: [
        'Séquence reprise du MSCI World 2000-2011, en dollars faute de série EUR. ' +
          "En euros l'épisode fut PLUS dur : le dollar s'est effondré de 2002 à 2008 " +
          "(l'euro est passé de 0,85 à 1,60), ce que ces chiffres ne portent pas.",
      ],
      choc: {
        // Douze années réellement enchaînées, pas une stagnation lissée : c'est
        // la SÉQUENCE qui fait mal (−42 % cumulé au creux de la 3ᵉ année), pas
        // la moyenne, qui ressort à +0,4 % par an.
        rendementBourse: fenetre('rendementBourse', 2000, 12),
      },
    })
  );

  /* ====================================================================== 6 —
   * API
   */

  /** Les deux groupes, dans l'ordre d'affichage. */
  var FAMILLES = [
    { cle: 'historique', nom: 'Le passé', etiquette: 'Historique' },
    { cle: 'prospectif', nom: 'Des futurs possibles', etiquette: 'Hypothèse' },
  ];

  function parCle(cle) {
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].cle === cle) return SCENARIOS[i];
    }
    return null;
  }

  function parFamille(cle) {
    return SCENARIOS.filter(function (s) {
      return s.famille === cle;
    });
  }

  var api = {
    STATUT_DONNEES: STATUT_DONNEES,
    HORIZON: HORIZON,
    CLES: CLES,
    TENDANCE_LONGUE: TENDANCE_LONGUE,
    SERIES_OBSERVEES: SERIES_OBSERVEES,
    DEPART_SERIES: DEPART_SERIES,
    FIN_SERIES: FIN_SERIES,
    LONGUEUR_FENETRE: LONGUEUR_FENETRE,
    SCENARIOS: SCENARIOS,
    FAMILLES: FAMILLES,
    tauxEquivalent: tauxEquivalent,
    parCle: parCle,
    parFamille: parFamille,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SimuRPScenarios = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
