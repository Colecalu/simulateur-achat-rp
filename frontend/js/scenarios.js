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
 * consommer : voir `tauxAnnee` et `facteur` dans calc.js. Une série plus courte
 * que l'horizon se répète.
 *
 * DEUX FAMILLES :
 *   - `historique` : une décennie réellement observée, datée et sourcée ;
 *   - `prospectif` : une trajectoire plausible pour les années à venir.
 * La troisième option, « Mes hypothèses », n'est pas dans ce fichier : c'est
 * l'absence de scénario, et elle lit les champs de la bulle 4.
 *
 * TROIS SÉRIES SONT TRACÉES dans l'aperçu — marchés, immobilier, loyers. Les
 * deux autres (`revalCharges`, `revalTaxeFonciere`) servent au moteur sans être
 * dessinées : elles suivent l'inflation générale et n'intéressent pas le
 * lecteur au même titre.
 *
 * ┌─ ATTENTION ─────────────────────────────────────────────────────────────┐
 * │ Les valeurs ci-dessous sont des PLACEHOLDERS (`provisoire: true`). Elles │
 * │ éprouvent la mécanique, elles ne décrivent aucun marché réel. Elles      │
 * │ seront remplacées par des séries datées et sourcées :                    │
 * │   - marchés    : MSCI World, dividendes réinvestis, en euros             │
 * │   - immobilier : INSEE, prix des logements anciens                       │
 * │   - loyers     : INSEE, indice de référence des loyers (IRL)             │
 * │ Remplir alors `periode` et `sources` en même temps que `taux`, et        │
 * │ retirer `provisoire`.                                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Script classique, comme calc.js : window.SimuRPScenarios côté navigateur.
 */
(function (global) {
  'use strict';

  var SOURCES_A_DEFINIR = {
    rendementBourse: 'MSCI World — source à renseigner',
    revalBien: 'INSEE, logements anciens — source à renseigner',
    revalLoyer: 'INSEE, IRL — source à renseigner',
  };

  var SCENARIOS = [
    {
      cle: 'difficile',
      nom: 'Décennie difficile',
      famille: 'historique',
      periode: null, // à renseigner avec les données réelles
      resume: "Marchés en dents de scie, immobilier qui recule.",
      provisoire: true,
      sources: SOURCES_A_DEFINIR,
      taux: {
        rendementBourse: [-0.18, 0.06, -0.04, 0.11, -0.09, 0.03, 0.08, -0.12, 0.05, 0.02],
        revalBien: [-0.03, -0.02, 0.0, 0.01, -0.01, 0.0, 0.01, -0.02, 0.0, 0.01],
        revalLoyer: [0.005, 0.005, 0.0, 0.01, 0.005, 0.0, 0.005, 0.01, 0.005, 0.0],
        revalCharges: [0.02, 0.025, 0.02, 0.015, 0.02, 0.025, 0.02, 0.015, 0.02, 0.02],
        revalTaxeFonciere: [0.03, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025],
      },
    },
    {
      cle: 'ordinaire',
      nom: 'Décennie ordinaire',
      famille: 'historique',
      periode: null, // à renseigner avec les données réelles
      resume: "Une croissance sans drame ni euphorie.",
      provisoire: true,
      sources: SOURCES_A_DEFINIR,
      taux: {
        rendementBourse: [0.07, -0.03, 0.12, 0.05, 0.09, -0.06, 0.11, 0.04, 0.08, 0.02],
        revalBien: [0.02, 0.01, 0.03, 0.02, 0.01, 0.0, 0.02, 0.03, 0.01, 0.02],
        revalLoyer: [0.015, 0.01, 0.02, 0.015, 0.01, 0.015, 0.02, 0.015, 0.01, 0.015],
        revalCharges: [0.02, 0.025, 0.02, 0.015, 0.02, 0.025, 0.02, 0.015, 0.02, 0.02],
        revalTaxeFonciere: [0.03, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025],
      },
    },
    {
      cle: 'porteuse',
      nom: 'Décennie porteuse',
      famille: 'historique',
      periode: null, // à renseigner avec les données réelles
      resume: "Marchés bien orientés, immobilier qui suit.",
      provisoire: true,
      sources: SOURCES_A_DEFINIR,
      taux: {
        rendementBourse: [0.14, 0.06, 0.18, -0.02, 0.12, 0.16, 0.04, 0.11, 0.09, 0.13],
        revalBien: [0.05, 0.04, 0.06, 0.03, 0.05, 0.04, 0.06, 0.05, 0.04, 0.05],
        revalLoyer: [0.03, 0.025, 0.03, 0.02, 0.03, 0.025, 0.03, 0.03, 0.025, 0.03],
        revalCharges: [0.02, 0.025, 0.02, 0.015, 0.02, 0.025, 0.02, 0.015, 0.02, 0.02],
        revalTaxeFonciere: [0.03, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025],
      },
    },
    {
      cle: 'inflationniste',
      nom: 'Décennie inflationniste',
      famille: 'historique',
      periode: null, // à renseigner avec les données réelles
      resume: "L'inflation ronge tout : loyers et charges s'envolent.",
      provisoire: true,
      sources: SOURCES_A_DEFINIR,
      taux: {
        rendementBourse: [0.04, -0.11, 0.09, 0.02, -0.07, 0.13, 0.01, 0.06, -0.04, 0.08],
        revalBien: [0.04, 0.03, 0.05, 0.02, 0.03, 0.04, 0.02, 0.03, 0.04, 0.03],
        revalLoyer: [0.035, 0.045, 0.05, 0.04, 0.03, 0.035, 0.04, 0.045, 0.03, 0.035],
        revalCharges: [0.04, 0.05, 0.055, 0.045, 0.035, 0.04, 0.045, 0.05, 0.035, 0.04],
        revalTaxeFonciere: [0.045, 0.05, 0.06, 0.05, 0.04, 0.045, 0.05, 0.055, 0.04, 0.045],
      },
    },
    {
      cle: 'desinflation',
      nom: 'Désinflation lente',
      famille: 'prospectif',
      periode: null, // à renseigner avec les données réelles
      resume: "L'inflation reflue, les marchés restent tièdes.",
      provisoire: true,
      sources: SOURCES_A_DEFINIR,
      taux: {
        rendementBourse: [0.05, 0.06, 0.04, 0.07, 0.05, 0.06, 0.05, 0.06, 0.05, 0.06],
        revalBien: [0.0, 0.01, 0.015, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
        revalLoyer: [0.03, 0.025, 0.02, 0.018, 0.015, 0.015, 0.015, 0.015, 0.015, 0.015],
        revalCharges: [0.03, 0.025, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
        revalTaxeFonciere: [0.035, 0.03, 0.025, 0.025, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
      },
    },
    {
      cle: 'choc-taux',
      nom: 'Choc de taux',
      famille: 'prospectif',
      periode: null, // à renseigner avec les données réelles
      resume: "Les taux montent, l'immobilier corrige, les marchés encaissent.",
      provisoire: true,
      sources: SOURCES_A_DEFINIR,
      taux: {
        rendementBourse: [-0.15, -0.08, 0.14, 0.09, 0.07, 0.06, 0.08, 0.05, 0.07, 0.06],
        revalBien: [-0.06, -0.05, -0.02, 0.01, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
        revalLoyer: [0.025, 0.03, 0.025, 0.02, 0.015, 0.015, 0.015, 0.015, 0.015, 0.015],
        revalCharges: [0.03, 0.035, 0.03, 0.025, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
        revalTaxeFonciere: [0.035, 0.04, 0.035, 0.03, 0.025, 0.025, 0.02, 0.02, 0.02, 0.02],
      },
    },
  ];

  /** Les familles, dans l'ordre d'affichage. */
  var FAMILLES = [
    { cle: 'historique', nom: 'Décennies observées' },
    { cle: 'prospectif', nom: 'Scénarios prospectifs' },
  ];

  /**
   * Taux annuel équivalent d'une série : la moyenne GÉOMÉTRIQUE, pas
   * l'arithmétique. -20 % puis +30 % ne fait pas +5 % par an, il fait +1,98 %.
   * C'est ce chiffre-là qu'on affiche dans les champs pilotés par un scénario.
   */
  function tauxEquivalent(serie) {
    if (!Array.isArray(serie) || !serie.length) return serie || 0;
    var produit = 1;
    for (var i = 0; i < serie.length; i++) produit *= 1 + serie[i];
    return Math.pow(produit, 1 / serie.length) - 1;
  }

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
