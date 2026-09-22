/**
 * Scénarios de marché — deuxième pilier du simulateur.
 *
 * Les simulateurs classiques proposent « pessimiste / médian / optimiste » sous
 * la forme d'un taux constant : +1 % tous les ans, +5 % tous les ans. Aucun
 * marché ne se comporte ainsi, et c'est justement dans l'ORDRE des années que
 * se joue une bonne part du résultat — encaisser un krach la première année
 * n'a pas le même effet que de l'encaisser la dixième.
 *
 * Chaque scénario porte donc des SÉRIES année par année, destinées à être
 * remplies avec des données réelles (une décennie datée, ses rendements
 * boursiers et sa trajectoire immobilière). Le moteur sait déjà les consommer :
 * voir `tauxAnnee` et `facteur` dans calc.js. Une série plus courte que
 * l'horizon se répète.
 *
 * ATTENTION : les valeurs ci-dessous sont des PLACEHOLDERS. Elles servent à
 * éprouver la mécanique de bout en bout, pas à décrire un marché. Elles seront
 * remplacées par des séries sourcées et datées.
 *
 * Script classique, comme calc.js : window.SimuRPScenarios côté navigateur.
 */
(function (global) {
  'use strict';

  var SCENARIOS = [
    {
      cle: 'pessimiste',
      nom: 'Décennie difficile',
      resume: 'Marchés en dents de scie, immobilier qui recule.',
      provisoire: true,
      taux: {
        rendementBourse: [-0.18, 0.06, -0.04, 0.11, -0.09, 0.03, 0.08, -0.12, 0.05, 0.02],
        revalBien: [-0.03, -0.02, 0.0, 0.01, -0.01, 0.0, 0.01, -0.02, 0.0, 0.01],
        revalLoyer: [0.005, 0.005, 0.0, 0.01, 0.005, 0.0, 0.005, 0.01, 0.005, 0.0],
        revalCharges: [0.02, 0.025, 0.02, 0.015, 0.02, 0.025, 0.02, 0.015, 0.02, 0.02],
        revalTaxeFonciere: [0.03, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025, 0.03, 0.02, 0.025],
      },
    },
    {
      cle: 'median',
      nom: 'Décennie ordinaire',
      resume: 'Une croissance sans drame ni euphorie.',
      provisoire: true,
      taux: {
        rendementBourse: [0.07, -0.03, 0.12, 0.05, 0.09, -0.06, 0.11, 0.04, 0.08, 0.02],
        revalBien: [0.02, 0.01, 0.03, 0.02, 0.01, 0.0, 0.02, 0.03, 0.01, 0.02],
        revalLoyer: [0.015, 0.01, 0.02, 0.015, 0.01, 0.015, 0.02, 0.015, 0.01, 0.015],
        revalCharges: [0.02, 0.02, 0.015, 0.02, 0.025, 0.02, 0.015, 0.02, 0.02, 0.02],
        revalTaxeFonciere: [0.02, 0.025, 0.02, 0.02, 0.03, 0.02, 0.02, 0.025, 0.02, 0.02],
      },
    },
    {
      cle: 'optimiste',
      nom: 'Décennie porteuse',
      resume: 'Marchés bien orientés, immobilier qui suit.',
      provisoire: true,
      taux: {
        rendementBourse: [0.14, 0.06, 0.18, -0.02, 0.12, 0.16, 0.04, 0.11, 0.09, 0.13],
        revalBien: [0.05, 0.04, 0.06, 0.03, 0.05, 0.04, 0.06, 0.05, 0.04, 0.05],
        revalLoyer: [0.03, 0.025, 0.03, 0.02, 0.03, 0.025, 0.03, 0.03, 0.025, 0.03],
        revalCharges: [0.02, 0.02, 0.02, 0.015, 0.02, 0.02, 0.02, 0.015, 0.02, 0.02],
        revalTaxeFonciere: [0.02, 0.02, 0.025, 0.02, 0.02, 0.025, 0.02, 0.02, 0.025, 0.02],
      },
    },
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

  var api = { SCENARIOS: SCENARIOS, tauxEquivalent: tauxEquivalent, parCle: parCle };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SimuRPScenarios = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
