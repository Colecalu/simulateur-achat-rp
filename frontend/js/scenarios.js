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
 * PAS DE BOUCLE. Une série plus courte que l'horizon n'est jamais rejouée :
 * sur 25 ans, une séquence de 11 ans tournait deux fois et demie, et les
 * 14 années répétées pesaient PLUS que les 11 vraies — le portefeuille étant au
 * plus gros à la fin. Mesuré : la boucle inversait le signe du verdict sur deux
 * scénarios sur quatre, avec jusqu'à 1,2 M€ d'écart. Chaque scénario est donc
 * ramené à la longueur de l'horizon à la fin de ce fichier, en prolongeant ses
 * années réelles par un taux qu'il assume. `reel` retient combien d'années sont
 * observées, et l'aperçu trace la frontière.
 *
 * DEUX FAMILLES :
 *   - `historique` : une décennie réellement observée, datée et sourcée ;
 *   - `prospectif` : une trajectoire construite, explicitement non observée.
 * La troisième option, « Mes hypothèses », n'est pas dans ce fichier : c'est
 * l'absence de scénario, et elle lit les champs de la bulle 4.
 *
 * TROIS SÉRIES SONT TRACÉES dans l'aperçu — marchés, immobilier, loyers. Les
 * deux autres (`revalCharges`, `revalTaxeFonciere`) servent au moteur sans être
 * dessinées : elles suivent l'inflation générale et n'intéressent pas le
 * lecteur au même titre.
 *
 * COHÉRENCE VÉRIFIÉE : les décennies se chevauchent (B/C sur trois ans, C/D sur
 * sept) et les valeurs communes concordent exactement. Seule exception, deux
 * points d'immobilier en 2000-2001 qui diffèrent de 0,1 pt entre A et B : c'est
 * la jointure entre la reconstruction Friggit et la série INSEE, pas une erreur.
 *
 * RÉSERVE À LEVER : les rendements boursiers sont annoncés en EUR, mais 2019
 * (+27,7), 2021 (+21,8) et 2022 (−18,1) sont au centième les valeurs publiées
 * en USD — or ces années-là ont connu de forts mouvements de change. Les séries
 * 2014-2015, elles, ressemblent davantage à de l'EUR. À faire retrancher à la
 * source avant de considérer ces chiffres comme définitifs. Le doute est porté
 * à l'écran dans les réserves de chaque scénario concerné.
 *
 * Script classique, comme calc.js : window.SimuRPScenarios côté navigateur.
 */
(function (global) {
  'use strict';

  // Sources communes à toutes les décennies observées.
  var SRC_INSEE = {
    rendementBourse:
      'MSCI World, dividendes nets réinvestis — valeurs arrondies (±0,5 pt), non brutes',
    revalBien:
      'INSEE, indice Notaires-INSEE 010567059, France métropolitaine, maisons + appartements',
    revalLoyer:
      'INSEE, IPC 04.1.1.0 « loyers effectivement payés », série 001763982, déc./déc.',
    revalCharges: 'INSEE, IPC ensemble, série 001759970, déc./déc.',
    revalTaxeFonciere:
      "Alignée sur l'inflation générale, faute de série dédiée — minore la dérive réelle",
  };

  var SRC_CONSTRUIT = {
    rendementBourse: 'Hypothèse construite, non observée',
    revalBien: 'Hypothèse construite, non observée',
    revalLoyer: 'Hypothèse construite, non observée',
    revalCharges: 'Hypothèse construite, non observée',
    revalTaxeFonciere: 'Hypothèse construite, non observée',
  };

  // Réserve commune à toutes les séries boursières, tant qu'elle n'est pas levée.
  var DOUTE_DEVISE =
    'Rendements annoncés en euros, mais plusieurs années coïncident au centième ' +
    'avec les valeurs publiées en dollars. À vérifier avant usage sérieux.';

  var SCENARIOS = [
    {
      cle: 'krach-immobilier',
      nom: 'Krach immobilier',
      famille: 'historique',
      periode: '1991–2001',
      resume:
        "L'immobilier français sort de la bulle de 1990 et recule cinq ans durant, " +
        'pendant que les actions mondiales enchaînent une décennie haussière — ' +
        "jusqu'à l'éclatement de la bulle internet, en toute fin de période.",
      sources: SRC_INSEE,
      reserves: [
        DOUTE_DEVISE,
        'Immobilier 1991-1995 : reconstruction Friggit/IGEDD, moins fiable que la série INSEE.',
      ],
      taux: {
        rendementBourse: [0.183, -0.052, 0.225, 0.051, 0.207, 0.135, 0.158, 0.243, 0.253, -0.132, -0.165],
        revalBien: [0.051, -0.023, -0.015, -0.001, -0.009, 0.008, 0.018, 0.012, 0.071, 0.088, 0.078],
        revalLoyer: [0.054, 0.051, 0.033, 0.027, 0.026, 0.016, 0.017, 0.021, 0.014, -0.003, 0.008],
        revalCharges: [0.03, 0.019, 0.021, 0.016, 0.021, 0.017, 0.011, 0.002, 0.013, 0.016, 0.014],
        revalTaxeFonciere: [0.03, 0.019, 0.021, 0.016, 0.021, 0.017, 0.011, 0.002, 0.013, 0.016, 0.014],
      },
    },
    {
      cle: 'bulle-immobiliere',
      nom: 'Internet et subprimes',
      famille: 'historique',
      periode: '2000–2010',
      resume:
        "Deux krachs boursiers — la bulle internet puis la crise financière — " +
        "pendant que l'immobilier français fait plus que doubler.",
      sources: SRC_INSEE,
      reserves: [DOUTE_DEVISE],
      taux: {
        rendementBourse: [-0.132, -0.165, -0.199, 0.331, 0.147, 0.095, 0.207, 0.09, -0.403, 0.3, 0.118],
        revalBien: [0.087, 0.079, 0.086, 0.119, 0.15, 0.155, 0.12, 0.065, 0.009, -0.071, 0.051],
        revalLoyer: [-0.003, 0.008, 0.03, 0.027, 0.034, 0.035, 0.032, 0.032, 0.017, 0.02, 0.013],
        revalCharges: [0.016, 0.014, 0.023, 0.022, 0.021, 0.016, 0.015, 0.026, 0.01, 0.009, 0.018],
        revalTaxeFonciere: [0.016, 0.014, 0.023, 0.022, 0.021, 0.016, 0.015, 0.026, 0.01, 0.009, 0.018],
      },
    },
    {
      cle: 'decennie-perdue',
      nom: 'Krach de 2008',
      famille: 'historique',
      periode: '2008–2018',
      resume:
        "Le krach de 2008 tombe la première année — le pire moment pour qui vient " +
        "d'emprunter. Les marchés se reprennent longuement ; l'immobilier français, " +
        'lui, stagne puis recule de 2012 à 2016.',
      sources: SRC_INSEE,
      reserves: [
        DOUTE_DEVISE,
        'Loyers 2018 : le −0,8 % est une rupture de méthode de l’INSEE, pas une baisse réelle.',
      ],
      taux: {
        rendementBourse: [-0.403, 0.3, 0.118, -0.055, 0.158, 0.267, 0.187, 0.083, 0.075, 0.224, -0.087],
        revalBien: [0.009, -0.071, 0.051, 0.059, -0.005, -0.021, -0.018, -0.019, 0.009, 0.03, 0.03],
        revalLoyer: [0.017, 0.02, 0.013, 0.012, 0.017, 0.013, 0.01, 0.005, 0.003, 0.002, -0.008],
        revalCharges: [0.01, 0.009, 0.018, 0.025, 0.013, 0.007, 0.001, 0.002, 0.006, 0.012, 0.016],
        revalTaxeFonciere: [0.01, 0.009, 0.018, 0.025, 0.013, 0.007, 0.001, 0.002, 0.006, 0.012, 0.016],
      },
    },
    {
      cle: 'choc-inflationniste',
      nom: 'Taux bas puis inflation',
      famille: 'historique',
      periode: '2012–2022',
      resume:
        "Taux bas et actions bien orientées sur l'essentiel de la période, puis le " +
        "choc inflationniste de 2021-2022, qui percute les charges bien plus que les " +
        "loyers ou l'immobilier — encore en hausse en 2022.",
      sources: SRC_INSEE,
      reserves: [
        DOUTE_DEVISE,
        'Loyers 2018 : le −0,8 % est une rupture de méthode de l’INSEE, pas une baisse réelle.',
      ],
      taux: {
        rendementBourse: [0.158, 0.267, 0.187, 0.083, 0.075, 0.224, -0.087, 0.277, 0.159, 0.218, -0.181],
        revalBien: [-0.005, -0.021, -0.018, -0.019, 0.009, 0.03, 0.03, 0.033, 0.055, 0.067, 0.063],
        revalLoyer: [0.017, 0.013, 0.01, 0.005, 0.003, 0.002, -0.008, 0.011, 0.002, 0.008, 0.012],
        revalCharges: [0.013, 0.007, 0.001, 0.002, 0.006, 0.012, 0.016, 0.015, -0.0002, 0.028, 0.059],
        revalTaxeFonciere: [0.013, 0.007, 0.001, 0.002, 0.006, 0.012, 0.016, 0.015, -0.0002, 0.028, 0.059],
      },
    },
    {
      cle: 'inflation-ancree',
      nom: 'Inflation ancrée',
      famille: 'prospectif',
      periode: null,
      resume:
        "Dette publique élevée, banque centrale contrainte de garder des taux hauts " +
        'longtemps, crédit immobilier sélectif et valorisations actions tendues qui se ' +
        "dégonflent en partie. L'immobilier stagne en nominal — donc recule en réel — " +
        'pendant que loyers et charges continuent de courir.',
      sources: SRC_CONSTRUIT,
      reserves: [
        "Hypothèse construite en 2026, pas une observation. Aucune prétention de précision.",
      ],
      taux: {
        rendementBourse: [0.04, -0.08, 0.06, 0.09, 0.05, 0.07, -0.05, 0.11, 0.08, 0.06],
        revalBien: [0.0, -0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.02, 0.02],
        revalLoyer: [0.025, 0.03, 0.03, 0.025, 0.02, 0.02, 0.025, 0.02, 0.02, 0.02],
        revalCharges: [0.03, 0.035, 0.03, 0.025, 0.02, 0.02, 0.025, 0.02, 0.02, 0.02],
        revalTaxeFonciere: [0.03, 0.035, 0.03, 0.025, 0.02, 0.02, 0.025, 0.02, 0.02, 0.02],
      },
    },
    {
      cle: 'productivite-ia',
      nom: 'Productivité IA',
      famille: 'prospectif',
      periode: null,
      resume:
        "Les gains de productivité liés à l'IA se diffusent dans l'économie réelle et " +
        'gonflent les marges des entreprises cotées ; la désinflation permet une détente ' +
        "monétaire. Effet quasi nul sur le logement — l'IA ne construit pas de logements " +
        "et ne résout pas la pénurie foncière. L'écart marchés / immobilier se creuse.",
      sources: SRC_CONSTRUIT,
      reserves: [
        "Hypothèse construite en 2026, pas une observation. Aucune prétention de précision.",
      ],
      taux: {
        rendementBourse: [0.14, 0.18, 0.1, 0.22, -0.06, 0.16, 0.19, 0.09, 0.15, 0.12],
        revalBien: [0.01, 0.015, 0.02, 0.015, 0.01, 0.015, 0.02, 0.015, 0.02, 0.015],
        revalLoyer: [0.015, 0.015, 0.01, 0.015, 0.01, 0.01, 0.015, 0.01, 0.015, 0.01],
        revalCharges: [0.015, 0.01, 0.01, 0.01, 0.005, 0.01, 0.01, 0.01, 0.01, 0.01],
        revalTaxeFonciere: [0.015, 0.01, 0.01, 0.01, 0.005, 0.01, 0.01, 0.01, 0.01, 0.01],
      },
    },
  ];

  /* ------------------------------------------------------------------ *
   * Chaînage, prolongement, normalisation
   * ------------------------------------------------------------------ */

  var HORIZON = 25;
  var CLES = [
    'rendementBourse',
    'revalBien',
    'revalLoyer',
    'revalCharges',
    'revalTaxeFonciere',
  ];

  /**
   * Taux annuel équivalent d'une série : la moyenne GÉOMÉTRIQUE, pas
   * l'arithmétique. -20 % puis +30 % ne fait pas +5 % par an, il fait +1,98 %.
   */
  function tauxEquivalent(serie) {
    if (!Array.isArray(serie) || !serie.length) return serie || 0;
    var produit = 1;
    for (var i = 0; i < serie.length; i++) produit *= 1 + serie[i];
    return Math.pow(produit, 1 / serie.length) - 1;
  }

  function brut(cle) {
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].cle === cle) return SCENARIOS[i].taux;
    }
    return null;
  }

  /*
   * Les quatre décennies ne sont pas quatre séries indépendantes : elles se
   * chevauchent et concordent, ce sont quatre fenêtres sur UNE série continue
   * de 1991 à 2022. Recollée, elle fait 32 ans — assez pour couvrir l'horizon
   * sans prolonger quoi que ce soit. À la couture 2000-2001, on garde l'INSEE
   * (scénario B) plutôt que la reconstruction Friggit (scénario A).
   */
  var A9 = brut('krach-immobilier');
  var B11 = brut('bulle-immobiliere');
  var C11 = brut('decennie-perdue');
  var D11 = brut('choc-inflationniste');
  var CONTINU = {};
  for (var i = 0; i < CLES.length; i++) {
    var k = CLES[i];
    CONTINU[k] = A9[k].slice(0, 9).concat(B11[k], [C11[k][3]], D11[k]);
  }

  SCENARIOS.push({
    cle: 'histoire-continue',
    nom: 'Trente ans réels',
    famille: 'historique',
    periode: '1991–2022',
    resume:
      'Les quatre décennies bout à bout, sans coupure : trente-deux années ' +
      "réellement observées, assez pour couvrir tout l'horizon sans prolonger " +
      "ni rejouer une seule année. C'est le seul scénario sans hypothèse.",
    sources: SRC_INSEE,
    reserves: [DOUTE_DEVISE],
    taux: CONTINU,
  });

  /**
   * Le taux qui prolonge un scénario au-delà de ses années réelles.
   *
   * Une décennie observée est prolongée par la moyenne longue 1991-2022 : c'est
   * le seul chiffre que les données autorisent pour « ce qu'on ne sait pas ».
   * Un scénario construit est prolongé par SA propre moyenne — le prolonger au
   * rythme historique contredirait son postulat.
   */
  var MOYENNE_LONGUE = {};
  for (var j = 0; j < CLES.length; j++) {
    MOYENNE_LONGUE[CLES[j]] = tauxEquivalent(CONTINU[CLES[j]]);
  }

  /*
   * Chaque scénario est ramené à la longueur de l'horizon. Le moteur ne
   * prolonge donc jamais de lui-même : ce qui dépasse les données est une
   * décision de scénario, tracée par `reel` et affichée à l'écran.
   */
  for (var n = 0; n < SCENARIOS.length; n++) {
    var sc = SCENARIOS[n];
    sc.reel = sc.taux.rendementBourse.length;
    sc.prolongePar =
      sc.famille === 'historique' ? MOYENNE_LONGUE : null; // null = sa propre moyenne

    for (var m = 0; m < CLES.length; m++) {
      var c = CLES[m];
      var serie = sc.taux[c].slice(0, HORIZON);
      var suite = sc.prolongePar ? sc.prolongePar[c] : tauxEquivalent(sc.taux[c]);
      while (serie.length < HORIZON) serie.push(suite);
      sc.taux[c] = serie;
      if (c === 'rendementBourse') sc.suiteBourse = suite;
      if (c === 'revalBien') sc.suiteImmo = suite;
    }
  }

  /** Les familles, dans l'ordre d'affichage. */
  var FAMILLES = [
    { cle: 'historique', nom: 'Décennies observées' },
    { cle: 'prospectif', nom: 'Scénarios construits' },
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
