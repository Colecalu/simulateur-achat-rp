/**
 * Sauvegarde locale et migration de schéma.
 *
 * Deux rôles, volontairement dans le même fichier parce qu'ils partagent une
 * règle :
 *
 *   1. écrire la saisie en cours dans le `localStorage`, pour qu'on ne perde
 *      jamais son travail en fermant l'onglet — sans compte, sans réseau ;
 *   2. relire une sauvegarde ANCIENNE sans planter.
 *
 * Le second point est le vrai sujet. Le modèle de calcul a déjà changé
 * plusieurs fois et continuera : une sauvegarde n'a de sens qu'avec la version
 * qui l'a produite. `SCHEMA_VERSION` et `migrer()` sont ce qui permet à une
 * sauvegarde d'hier de se relire demain plutôt que de casser la page.
 *
 * LA MÊME LOGIQUE SERVIRA AU SERVEUR. La colonne `simulations.schema_version`
 * porte la même version, et le front migre au chargement, qu'il lise le
 * `localStorage` ou l'API. Un seul chemin de migration pour les deux sources —
 * sinon ils divergeront, et c'est le genre de divergence qu'on ne découvre
 * qu'une fois des données réelles en base.
 *
 * Script classique, comme calc.js : `window.SimuRPSauvegarde` côté navigateur,
 * `module.exports` côté Node (les migrations sont testées).
 */
(function (global) {
  'use strict';

  var moteur =
    typeof module !== 'undefined' && module.exports
      ? require('./calc.js')
      : global.SimuRP;
  var moteurLocation =
    typeof module !== 'undefined' && module.exports
      ? require('./calc-location.js')
      : global.SimuRPLocation;

  /**
   * Version du FORMAT des paramètres — pas du modèle de calcul.
   *
   * On ne l'incrémente que lorsqu'une ancienne sauvegarde ne se relit plus à
   * l'identique : renommage d'un champ, changement d'unité, restructuration.
   * **Ajouter un champ ne casse rien** — `normaliser()` lui donne sa valeur par
   * défaut — et n'exige donc pas d'incrément.
   */
  var SCHEMA_VERSION = 1;

  var CLE_BROUILLON = 'simurp.brouillon';

  /**
   * Migrations indexées par la version qu'elles PRODUISENT.
   *
   * Chaque fonction reçoit les paramètres dans la version précédente et rend
   * la suivante. Elles sont appliquées dans l'ordre : une sauvegarde en v1 lue
   * par un front en v3 passe par `MIGRATIONS[2]` puis `MIGRATIONS[3]`.
   *
   * Exemple, le jour où un champ est renommé :
   *
   *   2: function (p) {
   *        p.moteur.nouveauNom = p.moteur.ancienNom;
   *        delete p.moteur.ancienNom;
   *        return p;
   *      },
   */
  var MIGRATIONS = {};

  /* ------------------------------------------------------------ Structure */

  /**
   * Les champs du moteur, sans `horizon` : l'horizon n'est pas une hypothèse
   * du modèle mais une question posée au résultat (« si je revends dans… »).
   * Il est donc rangé à part, au même niveau que le scénario.
   */
  function champsMoteur() {
    return Object.keys(moteur.DEFAUTS).filter(function (c) {
      return c !== 'horizon';
    });
  }

  function champsLocation() {
    return Object.keys(moteurLocation.DEFAUTS_LOCATION);
  }

  /** La forme d'un brouillon vide, tous champs à leur valeur par défaut. */
  function vide() {
    var p = { moteur: {}, location: {}, scenario: null, horizon: 20 };
    champsMoteur().forEach(function (c) {
      p.moteur[c] = moteur.DEFAUTS[c];
    });
    champsLocation().forEach(function (c) {
      p.location[c] = moteurLocation.DEFAUTS_LOCATION[c];
    });
    return p;
  }

  /* ------------------------------------------------------------ Migration */

  /**
   * Remet des paramètres en forme : champs manquants complétés par leur
   * défaut, champs inconnus écartés, types remis d'équerre.
   *
   * C'est le filet qui rend `migrer()` incassable. Une migration peut oublier
   * un champ, une sauvegarde peut avoir été bricolée à la main dans la console,
   * une clé peut avoir disparu du moteur : rien de tout cela ne doit produire
   * autre chose qu'un brouillon exploitable.
   */
  function normaliser(params) {
    var propre = vide();
    if (!params || typeof params !== 'object') return propre;

    ['moteur', 'location'].forEach(function (groupe) {
      var source = params[groupe];
      if (!source || typeof source !== 'object') return;
      Object.keys(propre[groupe]).forEach(function (cle) {
        if (!(cle in source)) return; // absent : on garde le défaut
        var v = source[cle];
        var attendu = propre[groupe][cle];
        // Un champ facultatif vaut légitimement null tant qu'il n'est pas
        // renseigné : c'est une valeur, pas une absence.
        if (v === null) {
          propre[groupe][cle] = attendu === null ? null : attendu;
          return;
        }
        /*
         * Un défaut à `null` ne dit RIEN du type attendu — `anneeBascule` vaut
         * null tant qu'on n'a pas choisi, puis un nombre. Se fier au type du
         * défaut ferait perdre la valeur au rechargement : elle serait bien
         * écrite dans le brouillon, et remise à null à la relecture. Silencieux,
         * donc invisible jusqu'à ce qu'un utilisateur le signale.
         */
        if (attendu === null) {
          if (typeof v === 'number' && Number.isFinite(v)) propre[groupe][cle] = v;
          else if (typeof v === 'string') propre[groupe][cle] = v;
          else if (typeof v === 'boolean') propre[groupe][cle] = v;
          return;
        }
        if (typeof attendu === 'number') {
          var n = typeof v === 'number' ? v : parseFloat(v);
          propre[groupe][cle] = Number.isFinite(n) ? n : attendu;
        } else if (typeof attendu === 'string') {
          propre[groupe][cle] = typeof v === 'string' ? v : attendu;
        } else if (typeof attendu === 'boolean') {
          propre[groupe][cle] = typeof v === 'boolean' ? v : attendu;
        }
      });
    });

    if (typeof params.scenario === 'string' && params.scenario) {
      propre.scenario = params.scenario;
    }
    var h = parseInt(params.horizon, 10);
    if (Number.isFinite(h) && h >= 1 && h <= 25) propre.horizon = h;

    return propre;
  }

  /**
   * Met une sauvegarde à la version courante. Ne lève jamais.
   *
   * @returns {object|null} les paramètres migrés et normalisés, ou `null` si
   *   la sauvegarde est inexploitable — auquel cas l'appelant repart d'un
   *   brouillon vide plutôt que d'afficher des valeurs douteuses.
   */
  function migrer(sauvegarde, migrations) {
    migrations = migrations || MIGRATIONS;
    if (!sauvegarde || typeof sauvegarde !== 'object') return null;

    var version = parseInt(sauvegarde.schemaVersion, 10);
    if (!Number.isFinite(version) || version < 1) return null;

    /*
     * Une sauvegarde PLUS RÉCENTE que le code ne se devine pas. Le cas arrive
     * pour de vrai : un utilisateur ouvre le site sur deux appareils, l'un
     * ayant déjà le nouveau front. On refuse plutôt que d'interpréter des
     * champs qu'on ne connaît pas.
     */
    if (version > SCHEMA_VERSION) return null;

    var params = sauvegarde.params;
    for (var v = version + 1; v <= SCHEMA_VERSION; v++) {
      var etape = migrations[v];
      if (typeof etape !== 'function') continue; // pas de changement de forme
      try {
        params = etape(params);
      } catch (e) {
        // Une migration qui casse ne doit pas emporter la page avec elle.
        return null;
      }
    }

    return normaliser(params);
  }

  /* ------------------------------------------------- Accès au localStorage */

  /**
   * Le `localStorage` peut être indisponible — navigation privée sur certains
   * navigateurs, stockage désactivé, quota dépassé. Aucun de ces cas ne doit
   * empêcher le simulateur de fonctionner : il perd la sauvegarde, pas le
   * calcul.
   */
  function lire() {
    try {
      var brut = global.localStorage.getItem(CLE_BROUILLON);
      if (!brut) return null;
      var sauvegarde = JSON.parse(brut);
      var params = migrer(sauvegarde);
      if (!params) return null;
      return { params: params, avancement: normaliserAvancement(sauvegarde.avancement) };
    } catch (e) {
      return null;
    }
  }

  /**
   * Normalise l'avancement du parcours : profil validé, bulles validées.
   *
   * L'avancement vit dans l'ENVELOPPE du brouillon, jamais dans `params`.
   * `params` décrit un projet et part tel quel vers le compte ; l'avancement
   * décrit où en est CETTE session dans CE navigateur, et n'a rien à faire en
   * base. Mais il faut le garder localement : sans lui, rouvrir l'onglet
   * afficherait un résultat complet alors que l'utilisateur n'a rempli qu'une
   * bulle — exactement ce qu'on s'interdit.
   */
  function normaliserAvancement(a) {
    var propre = { profilValide: false, bullesValidees: [] };
    if (!a || typeof a !== 'object') return propre;
    propre.profilValide = a.profilValide === true;
    if (Array.isArray(a.bullesValidees)) {
      propre.bullesValidees = a.bullesValidees
        .map(function (n) {
          return parseInt(n, 10);
        })
        .filter(function (n) {
          return Number.isFinite(n) && n >= 1 && n <= 4;
        });
    }
    return propre;
  }

  function ecrire(params, avancement) {
    try {
      global.localStorage.setItem(
        CLE_BROUILLON,
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          majLe: new Date().toISOString(),
          params: params,
          avancement: normaliserAvancement(avancement),
        })
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function effacer() {
    try {
      global.localStorage.removeItem(CLE_BROUILLON);
    } catch (e) {
      /* rien à faire */
    }
  }

  /**
   * Le stockage est-il utilisable ?
   *
   * `localStorage` peut exister et refuser d'écrire : navigation privée sur
   * certains navigateurs, stockage désactivé par une politique d'entreprise,
   * quota plein, cookies bloqués pour le site. Le seul test fiable est
   * d'écrire pour de vrai — la présence de l'objet ne prouve rien.
   *
   * On le sait pour pouvoir le DIRE. Une sauvegarde qui échoue en silence est
   * indiscernable d'une sauvegarde qui marche, jusqu'au moment où l'utilisateur
   * perd son travail.
   */
  function disponible() {
    try {
      var temoin = CLE_BROUILLON + '.test';
      global.localStorage.setItem(temoin, '1');
      var relu = global.localStorage.getItem(temoin);
      global.localStorage.removeItem(temoin);
      return relu === '1';
    } catch (e) {
      return false;
    }
  }

  /** Enveloppe une fonction pour ne l'appeler qu'après une pause d'inactivité. */
  function differer(fn, delai) {
    var minuteur = null;
    return function () {
      var args = arguments;
      var ceci = this;
      if (minuteur) clearTimeout(minuteur);
      minuteur = setTimeout(function () {
        minuteur = null;
        fn.apply(ceci, args);
      }, delai);
    };
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    CLE_BROUILLON: CLE_BROUILLON,
    MIGRATIONS: MIGRATIONS,
    vide: vide,
    normaliser: normaliser,
    normaliserAvancement: normaliserAvancement,
    migrer: migrer,
    lire: lire,
    ecrire: ecrire,
    effacer: effacer,
    disponible: disponible,
    differer: differer,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SimuRPSauvegarde = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
