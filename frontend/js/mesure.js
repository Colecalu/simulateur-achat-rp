/* =========================================================================
 * Mesure d'audience — Google Analytics 4.
 *
 * Source de vérité des événements : docs/plan-de-marquage.md. Un événement
 * ajouté, renommé ou retiré ici l'est aussi là-bas, dans le même commit.
 *
 * Chargé dans <head>, SANS defer, sur toutes les pages, avant tout autre
 * script : `window.Mesure.suivre` doit exister quand app.js s'exécute.
 * Le type de page est lu sur la balise elle-même :
 *   <script src="/js/mesure.js" data-type-page="accueil"></script>
 * Chemin ABSOLU partout : la 404 est servie à n'importe quelle adresse.
 *
 * Pourquoi un fichier et pas l'extrait habituel de Google : la CSP du site
 * interdit tout script en ligne (CLAUDE.md §5 et §13). L'initialisation de
 * gtag vit donc ici, et seul gtag.js vient de googletagmanager.com.
 *
 * Trois règles qui ne se négocient pas :
 * - `suivre` ne lève JAMAIS : bloqueur de publicité, réseau coupé, gtag.js
 *   pas encore chargé — le simulateur doit marcher exactement pareil.
 * - Rien ne part hors d'aequo-immo.fr : le développement local ne pollue
 *   pas les statistiques (sauf ?debug_ga=1, voulu).
 * - Aucun montant ni aucune donnée personnelle dans un paramètre : des noms
 *   de champs, de blocs, de sections, jamais des valeurs saisies.
 * ========================================================================= */
(function () {
  'use strict';

  var ID_MESURE = 'G-1G05M0043V';
  var DOMAINE = 'aequo-immo.fr';
  var CLE_MOI = 'aequo.moi';
  var CLE_DEBUG = 'aequo.debug_ga';

  var script = document.currentScript;
  var typePage = (script && script.getAttribute('data-type-page')) || 'inconnu';

  var parametres;
  try { parametres = new URLSearchParams(location.search); } catch (e) { parametres = null; }
  var param = function (nom) { return parametres ? parametres.get(nom) : null; };

  // Le stockage peut être refusé (navigation privée, politique d'entreprise) :
  // chaque accès est protégé, et un refus vaut « indicateur absent ».
  function lire(stockage, cle) {
    try { return window[stockage].getItem(cle); } catch (e) { return null; }
  }
  function ecrire(stockage, cle, valeur) {
    try {
      if (valeur === null) window[stockage].removeItem(cle);
      else window[stockage].setItem(cle, valeur);
    } catch (e) { /* stockage refusé : l'indicateur ne tiendra que cette page */ }
  }

  // ?moi=1 exclut CE navigateur, durablement ; ?moi=0 le réintègre.
  if (param('moi') === '1') ecrire('localStorage', CLE_MOI, '1');
  if (param('moi') === '0') ecrire('localStorage', CLE_MOI, null);
  var moi = param('moi') === '1' || lire('localStorage', CLE_MOI) === '1';

  // ?debug_ga=1 vaut pour l'onglet entier (sessionStorage), pour pouvoir
  // suivre un parcours accueil → simulateur dans le DebugView sans recoller
  // le paramètre à chaque page. ?debug_ga=0 l'arrête.
  if (param('debug_ga') === '1') ecrire('sessionStorage', CLE_DEBUG, '1');
  if (param('debug_ga') === '0') ecrire('sessionStorage', CLE_DEBUG, null);
  var debug = param('debug_ga') === '1' || lire('sessionStorage', CLE_DEBUG) === '1';

  // Le mode test passe AVANT tout : il doit marcher en local et sur un
  // navigateur exclu, sinon on ne pourrait jamais vérifier le marquage.
  var actif = debug || (location.hostname === DOMAINE && !moi);
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  window.dataLayer = window.dataLayer || [];
  // `arguments` et non un tableau : gtag.js ne reconnaît que cette forme.
  function gtag() { window.dataLayer.push(arguments); }

  if (actif) {
    window.gtag = gtag;
    gtag('js', new Date());
    var config = { type_page: typePage };
    // Seulement si vrai : GA4 passe en mode debug dès que le paramètre
    // existe, même à false.
    if (debug) config.debug_mode = true;
    gtag('config', ID_MESURE, config);

    var balise = document.createElement('script');
    balise.async = true;
    balise.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID_MESURE;
    // Bloqué par un bloqueur : rien à faire, les appels restent dans
    // dataLayer et ne partent jamais.
    document.head.appendChild(balise);
  }

  /** L'unique point d'envoi. Ne lève jamais. */
  function suivre(nom, params) {
    try {
      if (actif) gtag('event', nom, params || {});
      // En local, sans ?debug_ga=1 : rien ne part, mais on voit passer les
      // événements dans la console pour vérifier le marquage.
      else if (local && window.console) console.debug('[mesure]', nom, params || {});
    } catch (e) { /* la mesure ne doit jamais casser la page */ }
  }

  var dejaEnvoyes = {};
  /** Une seule fois par page vue et par clé (nom + valeur discriminante). */
  function suivreUneFois(cle, nom, params) {
    if (dejaEnvoyes[cle]) return;
    dejaEnvoyes[cle] = true;
    suivre(nom, params);
  }

  window.Mesure = { suivre: suivre, suivreUneFois: suivreUneFois };

  /* --- Marquage déclaratif, commun à toutes les pages -------------------
   * Les pages ne portent que des attributs (data-mesure-…) : le HTML dit QUOI
   * mesurer, ce fichier dit COMMENT. */

  // Liens des pieds de page : leur cible, jamais l'adresse complète.
  function nomDuLien(a) {
    var href = a.getAttribute('href') || '';
    if (href.indexOf('mailto:') === 0) return 'contact';
    var chemin = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\.\//, '/').replace(/\.html$/, '');
    if (chemin === '/' || chemin === '') return 'accueil';
    return chemin.replace(/^\//, '').replace(/-/g, '_') || 'autre';
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var cta = a.getAttribute('data-mesure-cta');
    if (cta) suivre('home_cta_clic', { emplacement: cta });
    if (a.closest('footer')) suivre('lien_pied_clic', { lien: nomDuLien(a) });
  });

  // `toggle` ne remonte pas : on l'écoute en phase de capture.
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d.open || !d.getAttribute) return;
    var question = d.getAttribute('data-mesure-question');
    if (question) suivre('faq_ouverte', { question: question });
    var bloc = d.getAttribute('data-mesure-avance');
    if (bloc) suivre('sim_avance_ouvert', { bloc: bloc });
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    if (typePage === '404') {
      // Le chemin seul, tronqué : jamais la chaîne de requête, qui pourrait
      // porter n'importe quoi.
      suivre('page_404', { chemin: location.pathname.slice(0, 100) });
    }
    observerSections();
  });

  /*
   * Une section est « vue » quand la moitié d'elle est à l'écran — ou, si
   * elle est plus haute que deux écrans (les piliers en mobile), quand elle
   * occupe la moitié de l'écran : sinon elle ne pourrait jamais l'être.
   */
  function observerSections() {
    var sections = document.querySelectorAll('[data-mesure-section]');
    if (!sections.length || !('IntersectionObserver' in window)) return;
    var seuils = [];
    for (var i = 0; i <= 20; i++) seuils.push(i / 20);
    var observateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (entree) {
        if (!entree.isIntersecting) return;
        var ecran = entree.rootBounds ? entree.rootBounds.height : window.innerHeight;
        if (entree.intersectionRatio < 0.5 && entree.intersectionRect.height < ecran * 0.5) return;
        var nom = entree.target.getAttribute('data-mesure-section');
        suivreUneFois('section:' + nom, 'home_section_vue', { section: nom });
        observateur.unobserve(entree.target);
      });
    }, { threshold: seuils });
    sections.forEach(function (s) { observateur.observe(s); });
  }
})();
