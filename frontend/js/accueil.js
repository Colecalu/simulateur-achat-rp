/* =========================================================================
 * Page d'accueil — bascule des deux points de vue, apparitions au défilement
 * et aperçu chiffré.
 *
 * Aucune logique financière ici : l'aperçu appelle calc.js (window.SimuRP)
 * sur un jeu d'entrées figé, et ne fait que mettre ses sorties en forme. Les
 * chiffres affichés sont exactement ceux que donnerait le simulateur sur ces
 * entrées.
 *
 * Chargé dans <head> SANS defer, pour poser la classe `js` avant le premier
 * affichage : c'est elle qui masque les blocs en attente d'apparition. Sans
 * JavaScript, rien n'est masqué. Le reste attend DOMContentLoaded, moment où
 * calc.js (chargé en defer) est disponible.
 * ========================================================================= */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  const mouvementReduit =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', () => {
    initialiserBascule();
    initialiserApercu();
    initialiserApparitions();
  });

  /* -------------------------------------------------------------- Bascule */

  function initialiserBascule() {
    const scene = $('theatre');
    const achat = $('vueAchat');
    const location = $('vueLocation');

    function choisir(louer) {
      scene.classList.toggle('mode-location', louer);
      scene.classList.toggle('mode-achat', !louer);
      achat.setAttribute('aria-pressed', String(!louer));
      location.setAttribute('aria-pressed', String(louer));
      $('pointNumero').textContent = louer
        ? 'HISTOIRE B / LOCATAIRE'
        : 'HISTOIRE A / PROPRIÉTAIRE';
      $('pointTitre').textContent = louer
        ? 'Une clé.\nEt du capital\nà investir.'
        : 'Une clé.\nEt du capital\ndans les murs.';
      $('pointTexte').textContent = louer
        ? 'Vous payez un loyer. Votre capital et ce qui reste disponible peuvent être investis.'
        : 'Vous remboursez votre crédit. Ce qui reste disponible peut aussi être investi.';
    }

    achat.addEventListener('click', () => choisir(false));
    location.addEventListener('click', () => choisir(true));
  }

  /* ---------------------------------------------------------- Apparitions */

  /*
   * Un seul effet pour toute la page : le bloc monte de quelques pixels en
   * apparaissant, une fois. Les titres n'en ont pas — un visiteur qui ne lit
   * que les titres ne doit jamais attendre.
   */
  function initialiserApparitions() {
    const blocs = document.querySelectorAll('[data-apparait]');
    const montrer = (el) => el.classList.add('est-visible');

    if (mouvementReduit || !('IntersectionObserver' in window)) {
      blocs.forEach(montrer);
      return;
    }
    const observateur = new IntersectionObserver((entrees) => {
      entrees.forEach((entree) => {
        if (!entree.isIntersecting) return;
        observateur.unobserve(entree.target);
        montrer(entree.target);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
    blocs.forEach((el) => observateur.observe(el));
  }

  /* -------------------------------------------------------------- Aperçu */

  /*
   * Le projet de l'exemple : un appartement ancien plausible en métropole
   * (4,3 % de rendement locatif brut), crédit sur 25 ans. Les taux de crédit,
   * d'assurance et de marché sont ceux du moteur par défaut — les mêmes que
   * le simulateur, pour qu'un visiteur qui recopie ces entrées retrouve ces
   * chiffres. Choisi pour que les courbes se croisent pendant l'horizon : le
   * point mort est la réponse au « Et si vous partiez plus tôt ? ».
   * Repris de l'ancienne accueil ; à remplacer par l'exemple par défaut du
   * simulateur quand celui-ci sera fixé (décision de Lucas, 02/10/2026).
   */
  const ENTREES = {
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

  const euros = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  });
  const milliers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const kiloEuros = (v) => milliers.format(Math.round(v / 1000)) + ' k€';
  const ans = (n) => n + ' an' + (n > 1 ? 's' : '');

  function initialiserApercu() {
    let resultat;
    try {
      if (!window.SimuRP) return;
      resultat = window.SimuRP.simuler(Object.assign({}, window.SimuRP.DEFAUTS, ENTREES));
    } catch (erreur) {
      return; // la section garde son titre et son lien, rien d'autre
    }
    const annees = resultat && resultat.annees;
    if (!annees || annees.length < 2) return;
    const finies = annees.every((a) =>
      Number.isFinite(a.patrimoineTotalAchat) && Number.isFinite(a.patrimoineTotalLocation));
    if (!finies) return;

    const derniere = annees[annees.length - 1];
    const pointMort = resultat.premiereAnneeFavorable;
    // Même garde-fou que le simulateur : le premier croisement n'est pas un
    // acquis, les courbes peuvent se recroiser.
    const tientEncore = derniere.ecart >= 0;

    $('apercuDuree').textContent = ans(annees.length);
    $('apercuAchat').textContent = euros.format(derniere.patrimoineTotalAchat);
    $('apercuLocation').textContent = euros.format(derniere.patrimoineTotalLocation);
    $('apercuPointMort').textContent =
      pointMort === null ? 'Jamais' : pointMort === 1 ? 'Dès la 1re année' : ans(pointMort);
    // Le renvoi au « partir plus tôt » n'a de sens que s'il y a un avant et
    // un après le point mort.
    $('apercuRenvoi').hidden = !(pointMort > 1 && tientEncore);
    $('apercuHypotheses').textContent =
      'Exemple : bien ancien à ' + euros.format(ENTREES.prixNetVendeur) +
      ', loyer de ' + euros.format(ENTREES.loyer) + '/mois, sur ' + ans(annees.length) + '.';

    $('apercuChiffres').hidden = false;
    $('apercuVisuel').hidden = false;

    // Le dessin se fait à la largeur réelle de la feuille : une unité du
    // SVG vaut un pixel, et les textes gardent leur taille en mobile au lieu
    // d'être réduits avec le reste. On redessine quand la largeur change.
    const feuille = $('apercuGraphique');
    let largeurDessinee = 0;
    const redessiner = () => {
      const style = getComputedStyle(feuille);
      const largeur = Math.max(280, Math.round(feuille.clientWidth -
        parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
      if (Math.abs(largeur - largeurDessinee) < 24) return;
      largeurDessinee = largeur;
      feuille.replaceChildren(dessinerGraphique(annees, pointMort, tientEncore, largeur));
    };
    redessiner();
    let attente = null;
    window.addEventListener('resize', () => {
      clearTimeout(attente);
      attente = setTimeout(redessiner, 150);
    });
  }

  /* -------------------------------------------------- Graphique (SVG) */

  const NS = 'http://www.w3.org/2000/svg';

  /** Crée un élément SVG. Attributs seulement : aucun style en ligne. */
  function svg(nom, attributs, texte) {
    const el = document.createElementNS(NS, nom);
    Object.keys(attributs || {}).forEach((cle) => el.setAttribute(cle, attributs[cle]));
    if (texte !== undefined) el.textContent = texte;
    return el;
  }

  /*
   * Deux courbes de patrimoine net, dessinées au trait comme le reste de la
   * page, avec une étiquette en bout de courbe plutôt qu'une légende. Entre
   * les deux, une teinte dit qui est devant ; le trait vertical marque le
   * point mort, au même endroit et sous le même nom que dans le simulateur.
   */
  function dessinerGraphique(annees, pointMort, tientEncore, largeur) {
    const etroit = largeur < 480;
    const L = largeur;
    const H = Math.round(Math.min(380, Math.max(280, L * 0.6)));
    const marge = etroit
      ? { gauche: 44, droite: 78, haut: 54, bas: 32 }
      : { gauche: 52, droite: 104, haut: 54, bas: 34 };
    const n = annees.length;
    const achat = annees.map((a) => a.patrimoineTotalAchat);
    const location = annees.map((a) => a.patrimoineTotalLocation);

    const pas = 100000;
    const plafond = Math.max(pas, Math.ceil(Math.max(...achat, ...location) / pas) * pas);
    const x = (i) => marge.gauche + (i / (n - 1)) * (L - marge.gauche - marge.droite);
    const y = (v) => H - marge.bas - (Math.max(v, 0) / plafond) * (H - marge.haut - marge.bas);
    const trace = (valeurs) =>
      valeurs.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');

    const titreId = 'apercuGraphiqueTitre';
    const descId = 'apercuGraphiqueDesc';
    const racine = svg('svg', {
      class: 'apercu__graphique',
      viewBox: '0 0 ' + L + ' ' + H,
      role: 'img',
      'aria-labelledby': titreId + ' ' + descId,
    });
    racine.appendChild(svg('title', { id: titreId },
      'Patrimoine net des deux trajectoires, année par année, sur ' + ans(n) + '.'));
    racine.appendChild(svg('desc', { id: descId }, decrire(annees, pointMort, tientEncore)));

    // Repères horizontaux discrets, un tous les 100 000 €.
    const grille = svg('g', { class: 'apercu__grille', 'aria-hidden': 'true' });
    for (let v = pas; v <= plafond; v += pas) {
      grille.appendChild(svg('path', { d: 'M' + marge.gauche + ' ' + y(v) + 'H' + (L - marge.droite) }));
      grille.appendChild(svg('text', { x: marge.gauche - 8, y: y(v) + 3, class: 'apercu__graduation apercu__graduation--y' }, kiloEuros(v)));
    }
    grille.appendChild(svg('path', { class: 'apercu__axe', d: 'M' + marge.gauche + ' ' + y(0) + 'H' + (L - marge.droite) }));
    [1, 5, 10, 15, 20, 25].filter((a) => a <= n).forEach((a) => {
      const libelle = a === 1 ? '1 an' : a === n ? ans(a) : String(a);
      grille.appendChild(svg('text', { x: x(a - 1), y: H - marge.bas + 20, class: 'apercu__graduation' }, libelle));
    });
    racine.appendChild(grille);

    // Teintes entre les courbes, et point mort.
    const decor = svg('g', { class: 'apercu__decor', 'aria-hidden': 'true' });
    if (pointMort > 1 && tientEncore) {
      // Croisement exact, interpolé entre l'année d'avant et le point mort.
      const i = pointMort - 1;
      const e0 = achat[i - 1] - location[i - 1];
      const e1 = achat[i] - location[i];
      const t = e0 === e1 ? 0 : e0 / (e0 - e1);
      const cx = x(i - 1 + t);
      const cy = y(location[i - 1] + t * (location[i] - location[i - 1]));
      const zone = (de, a, debutCroise, finCroise) => {
        const haut = [];
        const bas = [];
        if (debutCroise) { haut.push([cx, cy]); bas.push([cx, cy]); }
        for (let k = de; k <= a; k++) {
          haut.push([x(k), y(achat[k])]);
          bas.push([x(k), y(location[k])]);
        }
        if (finCroise) { haut.push([cx, cy]); bas.push([cx, cy]); }
        const points = haut.concat(bas.reverse());
        return points.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('') + 'Z';
      };
      decor.appendChild(svg('path', { class: 'apercu__zone apercu__zone--location', d: zone(0, i - 1, false, true) }));
      decor.appendChild(svg('path', { class: 'apercu__zone apercu__zone--achat', d: zone(i, n - 1, true, false) }));

      const xp = x(i);
      decor.appendChild(svg('path', { class: 'apercu__point-mort', d: 'M' + xp + ' ' + (marge.haut - 22) + 'V' + y(0) }));
      decor.appendChild(svg('text', { x: xp, y: marge.haut - 30, class: 'apercu__point-mort-texte' }, 'point mort · ' + ans(pointMort)));
      decor.appendChild(svg('text', { x: xp - 12, y: marge.haut + 24, class: 'apercu__main apercu__main--avant' }, etroit ? '← location' : '← la location devant'));
      decor.appendChild(svg('text', { x: xp + 12, y: marge.haut + 24, class: 'apercu__main apercu__main--apres' }, etroit ? 'achat →' : 'l’achat devant →'));
      decor.appendChild(svg('circle', { class: 'apercu__croisement', cx: cx.toFixed(1), cy: cy.toFixed(1), r: 4 }));
    }
    racine.appendChild(decor);

    // Les deux courbes. pathLength=1 permet l'animation de tracé en CSS.
    racine.appendChild(svg('path', { class: 'apercu__courbe apercu__courbe--location', d: trace(location), pathLength: 1 }));
    racine.appendChild(svg('path', { class: 'apercu__courbe apercu__courbe--achat', d: trace(achat), pathLength: 1 }));

    // Étiquettes en bout de courbe, écartées si elles se chevauchent.
    let yAchat = y(achat[n - 1]);
    let yLocation = y(location[n - 1]);
    const ecartMin = 38;
    if (Math.abs(yAchat - yLocation) < ecartMin) {
      const milieu = (yAchat + yLocation) / 2;
      const signe = yAchat <= yLocation ? -1 : 1;
      yAchat = milieu + signe * ecartMin / 2;
      yLocation = milieu - signe * ecartMin / 2;
    }
    const etiquettes = svg('g', { class: 'apercu__etiquettes', 'aria-hidden': 'true' });
    const xe = L - marge.droite + 12;
    [
      ['achat', 'ACHAT', achat[n - 1], yAchat],
      ['location', 'LOCATION', location[n - 1], yLocation],
    ].forEach(([cle, nom, valeur, ye]) => {
      etiquettes.appendChild(svg('text', { x: xe, y: ye - 4, class: 'apercu__etiquette-nom apercu__etiquette-nom--' + cle }, nom));
      etiquettes.appendChild(svg('text', { x: xe, y: ye + 14, class: 'apercu__etiquette-valeur' }, kiloEuros(valeur)));
    });
    racine.appendChild(etiquettes);

    return racine;
  }

  /** La phrase que lit un lecteur d'écran à la place du dessin. */
  function decrire(annees, pointMort, tientEncore) {
    const derniere = annees[annees.length - 1];
    const fin = 'Au bout de ' + ans(annees.length) + ', ' +
      euros.format(derniere.patrimoineTotalAchat) + ' côté achat contre ' +
      euros.format(derniere.patrimoineTotalLocation) + ' côté location.';
    if (pointMort > 1 && tientEncore) {
      return 'La location est devant jusqu’à l’année ' + (pointMort - 1) +
        ' ; l’achat passe devant à partir de l’année ' + pointMort + '. ' + fin;
    }
    return fin;
  }
})();
