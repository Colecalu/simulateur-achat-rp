/**
 * Liaison entre le formulaire, le moteur de calcul et l'affichage.
 * Aucune logique financière ici : elle vit entièrement dans calc.js.
 *
 * Script classique (pas de module ES) pour que la page fonctionne aussi
 * ouverte en file://. calc.js doit donc être chargé avant celui-ci.
 */
(function () {
  'use strict';

  const DEFAUTS = window.SimuRP.DEFAUTS;
  const simuler = window.SimuRP.simuler;
  const DEFAUTS_LOCATION = window.SimuRPLocation.DEFAUTS_LOCATION;
  const simulerMiseEnLocation = window.SimuRPLocation.simulerMiseEnLocation;

/* ------------------------------------------------------------------ Outils */

const $ = (sel) => document.querySelector(sel);

/** Champs saisis en pourcentage à l'écran, stockés en fraction dans le modèle. */
const POURCENTAGES = new Set([
  'tauxCredit', 'tauxAssurance', 'revalBien', 'revalCharges',
  'revalTaxeFonciere', 'revalLoyer', 'rendementBourse', 'fiscalitePlusValues',
]);

const CHAMPS = Object.keys(DEFAUTS).filter((c) => c !== 'horizon');

/** Champs facultatifs : laissés vides à l'écran plutôt qu'affichés à zéro. */
const FACULTATIFS = new Set(['salaireNet']);

/** Champs du profil : saisis une fois, hors du parcours numéroté. */
const CHAMPS_PROFIL = ['capitalInitial', 'enveloppeMensuelle', 'salaireNet'];

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const eurosPrecis = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

const signe = (v) => (v >= 0 ? '+' : '−') + euros.format(Math.abs(v)).replace('-', '');

/** Lit une variable CSS pour que Chart.js suive le thème clair/sombre. */
const jeton = (nom) => getComputedStyle(document.body).getPropertyValue(nom).trim();

/* ------------------------------------------------------- Lecture du formulaire */

function lireFormulaire() {
  const saisie = {};
  for (const champ of CHAMPS) {
    const el = document.getElementById(champ);
    if (!el) continue;
    if (el.tagName === 'SELECT') {
      saisie[champ] = el.value;
      continue;
    }
    const brut = parseFloat(el.value);
    const valeur = Number.isFinite(brut) ? brut : DEFAUTS[champ];
    saisie[champ] = POURCENTAGES.has(champ) ? valeur / 100 : valeur;
  }
  saisie.horizon = 25; // on calcule toujours 25 ans, le curseur ne fait que lire
  return saisie;
}

function remplirFormulaire(valeurs) {
  for (const champ of CHAMPS) {
    const el = document.getElementById(champ);
    if (!el) continue;
    const v = valeurs[champ];
    if (FACULTATIFS.has(champ) && !v) { el.value = ''; continue; }
    el.value = POURCENTAGES.has(champ) ? +(v * 100).toFixed(4) : v;
  }
}

/* ------------------------------------------- Formulaire « mise en location » */

/** Champs du palier 2 : id du champ → clé d'option, et conversion éventuelle. */
const CHAMPS_MEL_AVANCES = {
  melRegime: { cle: 'regime' },
  melTmi: { cle: 'tmi', pourcentage: true },
  melFraisAnnexes: { cle: 'fraisAnnexes' },
  melAchatMeubles: { cle: 'achatMeubles' },
  melTauxVacance: { cle: 'tauxVacance', pourcentage: true },
  melPrelevementsSociaux: { cle: 'tauxPrelevementsSociaux', pourcentage: true },
};

function remplirFormulaireMel() {
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    const el = document.getElementById(id);
    const v = DEFAUTS_LOCATION[def.cle];
    el.value = def.pourcentage ? +(v * 100).toFixed(4) : v;
  }
}

/**
 * Lit le module de mise en location.
 * @returns {object|null} les options, ou null tant que le palier 1 est incomplet
 */
function lireFormulaireMel() {
  const nombre = (id) => {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : null;
  };

  const anneeBascule = nombre('melAnneeBascule');
  const loyerPercu = nombre('melLoyerPercu');
  const loyerFutur = nombre('melLoyerFutur');
  if (anneeBascule === null || loyerPercu === null || loyerFutur === null) return null;

  const options = { anneeBascule, loyerPercu, loyerFutur };
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    const el = document.getElementById(id);
    if (el.tagName === 'SELECT') {
      options[def.cle] = el.value;
      continue;
    }
    const v = parseFloat(el.value);
    const valeur = Number.isFinite(v) ? v : DEFAUTS_LOCATION[def.cle] * (def.pourcentage ? 100 : 1);
    options[def.cle] = def.pourcentage ? valeur / 100 : valeur;
  }
  return options;
}

/* ------------------------------------------------------------------ Verdict */

function afficherVerdict(resultat, horizon) {
  const ligne = resultat.annees[horizon - 1];
  const ecart = ligne.ecart;

  $('#horizonLabel').textContent = `${horizon} an${horizon > 1 ? 's' : ''}`;

  const chiffre = $('#verdictChiffre');
  const mesure = $('#verdictMesure');

  // Enveloppe insuffisante : le modèle plafonne les deux épargnes à zéro et
  // ne facture nulle part le déficit du propriétaire. L'écart calculé serait
  // flatteur pour l'achat sans rien vouloir dire — on refuse de le trancher.
  if (!resultat.enveloppeSuffisante) {
    chiffre.textContent = '—';
    chiffre.className = 'verdict__chiffre verdict__chiffre--indecis';
    mesure.textContent =
      `Votre enveloppe ne finance pas l'achat : il manque ${eurosPrecis.format(
        resultat.coutMensuelProprio - resultat.entrees.enveloppeMensuelle
      )} par mois la première année.`;
    return;
  }

  chiffre.textContent = signe(ecart);
  chiffre.className = 'verdict__chiffre ' +
    (ecart >= 0 ? 'verdict__chiffre--achat' : 'verdict__chiffre--location');

  // Sous ~1 % du patrimoine comparé, l'écart n'est pas un signal exploitable.
  const reference = Math.max(ligne.patrimoineTotalAchat, ligne.patrimoineTotalLocation);
  if (Math.abs(ecart) < reference * 0.01) {
    mesure.textContent = 'd\'écart : à cette échéance, les deux scénarios se valent.';
    return;
  }

  mesure.textContent = ecart >= 0
    ? 'de patrimoine en plus en achetant qu\'en restant locataire.'
    : 'de patrimoine en plus en restant locataire qu\'en achetant.';
}

/* ------------------------------------------------------------------ Alerte */

/** Prévient quand l'enveloppe ne finance pas le scénario d'achat. */
function afficherAlerte(resultat) {
  const alerte = $('#alerteEnveloppe');
  alerte.hidden = resultat.enveloppeSuffisante;
  if (!resultat.enveloppeSuffisante) {
    $('#alerteCout').textContent =
      `${eurosPrecis.format(resultat.coutMensuelProprio)} par mois la première année`;
  }
}

/* --------------------------------------------------------------- Graphiques */

let graphPatrimoine = null;
let graphMel = null;

/**
 * Bornes Y communes aux deux graphiques de patrimoine, pour que la
 * comparaison visuelle de l'un à l'autre soit honnête. On ne force pas le
 * zéro : cela écraserait les courbes sans rien apporter.
 */
function bornesCommunes(series) {
  const valeurs = series.flat().filter((v) => Number.isFinite(v));
  if (!valeurs.length) return {};
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const marge = (max - min) * 0.05 || 1000;
  const pas = 50000;
  return {
    min: Math.floor((min - marge) / pas) * pas,
    max: Math.ceil((max + marge) / pas) * pas,
  };
}

const infobulle = {
  backgroundColor: () => jeton('--surface'),
  borderColor: () => jeton('--trait'),
};

function optionsCommunes() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: infobulle.backgroundColor(),
        borderColor: jeton('--axe'),
        borderWidth: 1,
        titleColor: jeton('--encre'),
        bodyColor: jeton('--encre-2'),
        padding: 11,
        cornerRadius: 8,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
        callbacks: {
          title: (items) => `Année ${items[0].label}`,
          label: (ctx) => ` ${ctx.dataset.label} : ${euros.format(ctx.parsed.y)}`,
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
          callback: (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`),
        },
      },
    },
  };
}

function dessinerGraphiques(resultat, horizon, mel) {
  // Chart.js vient d'un CDN : hors ligne, il manque. Les chiffres et le tableau
  // restent justes, on se contente de le dire au lieu de casser la page.
  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.graphique').forEach((zone) => {
      zone.innerHTML =
        '<p class="graphique__absent">Graphique indisponible : la librairie Chart.js ' +
        'n\'a pas pu être chargée (connexion internet requise). Les chiffres et le ' +
        'tableau ci-dessous restent exacts.</p>';
    });
    return;
  }

  const etiquettes = resultat.annees.map((a) => a.annee);
  const achat = resultat.annees.map((a) => a.patrimoineTotalAchat);
  const location = resultat.annees.map((a) => a.patrimoineTotalLocation);
  const ecart = resultat.annees.map((a) => a.ecart);

  const cAchat = jeton('--achat');
  const cLocation = jeton('--location');

  // Le point de l'horizon choisi est grossi : le curseur et le graphique
  // désignent la même date.
  const rayons = (i) => (i === horizon - 1 ? 6 : 0);

  const serie = (label, donnees, couleur) => ({
    label,
    data: donnees,
    borderColor: couleur,
    backgroundColor: couleur,
    borderWidth: 2,
    pointRadius: (ctx) => rayons(ctx.dataIndex),
    pointHoverRadius: 6,
    pointBackgroundColor: couleur,
    pointBorderColor: jeton('--surface'),
    pointBorderWidth: 2,
    tension: 0.25,
  });

  const donneesLignes = {
    labels: etiquettes,
    datasets: [
      serie('Achat', achat, cAchat),
      serie('Location', location, cLocation),
    ],
  };

  // Échelle Y partagée entre le graphique 1 et le graphique « mise en
  // location » : sans elle, deux graphiques superposés à échelles différentes
  // suggèrent des écarts qui n'existent pas.
  const melPatrimoine = mel ? mel.annees.map((a) => a.patrimoineTotal) : null;
  const bornes = mel
    ? bornesCommunes([achat, location, melPatrimoine])
    : {};

  const optionsPatrimoine = optionsCommunes();
  Object.assign(optionsPatrimoine.scales.y, bornes);

  if (graphPatrimoine) {
    graphPatrimoine.data = donneesLignes;
    graphPatrimoine.options = optionsPatrimoine;
    graphPatrimoine.update('none');
  } else {
    graphPatrimoine = new Chart($('#graphPatrimoine'), {
      type: 'line',
      data: donneesLignes,
      options: optionsPatrimoine,
    });
  }

  // --- Graphique « achat + mise en location » vs location de référence ---
  $('#carteMel').hidden = !mel;
  if (mel) {
    const cMel = jeton('--achat-location');
    const donneesMel = {
      labels: etiquettes,
      datasets: [
        serie(`Achat + mise en location dès l'année ${mel.anneeBascule}`, melPatrimoine, cMel),
        serie('Location (référence)', location, cLocation),
      ],
    };

    const optionsMel = optionsCommunes();
    Object.assign(optionsMel.scales.y, bornes);

    if (graphMel) {
      graphMel.data = donneesMel;
      graphMel.options = optionsMel;
      graphMel.update('none');
    } else {
      graphMel = new Chart($('#graphMiseEnLocation'), {
        type: 'line',
        data: donneesMel,
        options: optionsMel,
      });
    }

    $('#legendeMel').innerHTML = `
      <span class="legende__item"><span class="pastille pastille--achat-location"></span>Achat + mise en location dès l'année ${mel.anneeBascule}</span>
      <span class="legende__item"><span class="pastille pastille--location"></span>Location (référence)</span>
    `;
  }

  // Légende maison : l'identité des séries ne repose jamais sur la seule couleur.
  $('#legendePatrimoine').innerHTML = `
    <span class="legende__item"><span class="pastille pastille--achat"></span>Achat</span>
    <span class="legende__item"><span class="pastille pastille--location"></span>Location</span>
  `;
}

/* ---------------------------------------------------------------- Orchestre */

let dernierResultat = null;

function recalculer() {
  dernierResultat = simuler(lireFormulaire());
  rafraichir();
}

/** Texte d'accompagnement du deuxième graphique. */
function afficherTexteMel(mel, horizon) {
  const ligne = mel.annees[horizon - 1];
  const reference = dernierResultat.annees[horizon - 1].patrimoineTotalLocation;
  const ecart = ligne.patrimoineTotal - reference;
  const regime = mel.options.regime === 'nu' ? 'location nue' : 'meublé (LMNP réel)';

  $('#melLegendeTexte').textContent =
    `Le bien n'est plus revendu : à partir de l'année ${mel.anneeBascule} il est loué en ` +
    `${regime}, et vous vous logez ailleurs. Jusqu'à la bascule, la courbe est celle du ` +
    'scénario d\'achat.';

  const sens = ecart >= 0 ? 'devant' : 'derrière';
  $('#melNote').textContent =
    `À ${horizon} ans : ${euros.format(ligne.patrimoineTotal)} contre ` +
    `${euros.format(reference)} en restant locataire, soit ${signe(ecart)} — ${sens}. ` +
    `Impôt de plus-value déduit : ${euros.format(ligne.impotPlusValue)} ` +
    `(abattement de ${Math.round(ligne.abattementIR * 100)} % sur l'IR et ` +
    `${Math.round(ligne.abattementPS * 100)} % sur les prélèvements sociaux, ` +
    `pour ${horizon} ans de détention).`;
}

function rafraichir() {
  if (!dernierResultat) return;
  const horizon = parseInt($('#horizon').value, 10);

  const optionsMel = $('#melPanneau').hidden ? null : lireFormulaireMel();
  const mel = optionsMel ? simulerMiseEnLocation(dernierResultat, optionsMel) : null;
  $('#melIncomplet').hidden = !!mel || $('#melPanneau').hidden;

  majBulles();
  afficherProfil(dernierResultat);
  if (!majAttente()) return;

  afficherAlerte(dernierResultat);
  afficherVerdict(dernierResultat, horizon);
  dessinerGraphiques(dernierResultat, horizon, mel);
  if (mel) afficherTexteMel(mel, horizon);
}

/* -------------------------------------------------- Plateau de bulles */

const BULLES = [...document.querySelectorAll('.bulle')].map((b) => Number(b.dataset.bulle));
const bulle = (n) => document.querySelector(`.bulle[data-bulle="${n}"]`);

/** Bulles déjà validées : leurs champs deviennent modifiables sur place. */
const validees = new Set();
/** Bulle actuellement agrandie au centre, ou null. */
let bulleZoomee = null;

/* ------------------------------------------------------------------ Profil */

/**
 * Le profil décrit l'utilisateur, pas le projet : il est saisi une fois et ne
 * varie pas d'une simulation à l'autre. Il vit donc hors du parcours numéroté,
 * dans un bandeau qui se replie sur une ligne une fois validé.
 */
let profilValide = false;

function ouvrirProfil() {
  $('#profil').dataset.etat = 'saisie';
  $('#capitalInitial').focus();
}

function figerProfil() {
  profilValide = true;
  $('#profil').dataset.etat = 'fige';
  majBulles();
  recalculer();

  const suivante = prochaineBulle();
  if (suivante !== null) bulle(suivante).querySelector('.bulle__declencheur').focus();
}

/** Résumé du bandeau replié, et ratios déduits du salaire s'il est renseigné. */
function afficherProfil(resultat) {
  const e = resultat.entrees;

  const morceaux = [
    `<span class="profil__item"><span class="profil__mot">Patrimoine</span> ${euros.format(e.capitalInitial)}</span>`,
    `<span class="profil__item"><span class="profil__mot">Effort</span> ${euros.format(e.enveloppeMensuelle)}/mois</span>`,
  ];
  if (e.salaireNet > 0) {
    morceaux.push(
      `<span class="profil__item"><span class="profil__mot">Salaire</span> ${euros.format(e.salaireNet)}/mois</span>`
    );
  }
  $('#profilResume').innerHTML = morceaux.join('');

  const ratios = $('#profilRatios');
  if (e.salaireNet <= 0) {
    ratios.hidden = true;
    return;
  }

  // Le taux d'endettement dépend du prêt : rien à montrer avant que
  // l'opération et le financement soient renseignés.
  if (!parcoursComplet()) {
    ratios.hidden = true;
    return;
  }

  const taux = resultat.tauxEndettement;
  ratios.innerHTML =
    `Taux d'endettement&nbsp;: <strong>${Math.round(taux * 100)} %</strong> ` +
    `(mensualité ${eurosPrecis.format(resultat.mensualiteTotale)}).` +
    (taux > 0.35 ? ' Au-delà du plafond de 35 % habituellement retenu par les banques.' : '');
  ratios.classList.toggle('profil__ratios--alerte', taux > 0.35);
  ratios.hidden = false;
}

/** Toutes les bulles sont-elles renseignées ? Sans quoi rien n'est affiché. */
function parcoursComplet() {
  return profilValide && BULLES.every((n) => validees.has(n));
}

/**
 * Zone de résultat en attente : tant qu'une bulle manque, on n'affiche aucun
 * chiffre. Calculer sur des valeurs par défaut donnerait une réponse d'allure
 * sérieuse à une question que l'utilisateur n'a pas encore posée.
 */
function majAttente() {
  const complet = parcoursComplet();
  const visu = $('#visu');
  const etaitEnAttente = visu.dataset.etat === 'attente';
  visu.dataset.etat = complet ? 'pret' : 'attente';

  if (!complet) {
    const faites = validees.size;
    const jauge = $('#attenteJauge');
    jauge.setAttribute('aria-valuenow', String(faites));
    jauge.innerHTML = BULLES.map(
      (n) => `<span class="attente__cran${validees.has(n) ? ' attente__cran--faite' : ''}"></span>`
    ).join('');
    $('#attenteCompte').textContent = !profilValide
      ? 'Commencez par renseigner votre profil.'
      : faites === 0
        ? 'Aucune bulle renseignée pour le moment.'
        : `${faites} bulle${faites > 1 ? 's' : ''} sur ${BULLES.length} renseignée${faites > 1 ? 's' : ''}.`;
  } else if (etaitEnAttente) {
    // Les graphiques ont été dimensionnés alors que leur conteneur était
    // masqué : il faut les remesurer une fois la zone révélée.
    for (const graphique of [graphPatrimoine, graphMel]) {
      if (graphique) graphique.resize();
    }
  }

  return complet;
}

/** Première bulle non validée : la seule ouvrable au premier passage. */
function prochaineBulle() {
  if (!profilValide) return null;
  return BULLES.find((n) => !validees.has(n)) ?? null;
}

/**
 * Anime un élément depuis sa position précédente vers la nouvelle (FLIP).
 * On mesure avant, on applique le changement, on mesure après, puis on joue
 * l'écart à l'envers : le navigateur n'anime qu'une transformation.
 */
function volerVers(el, appliquerChangement) {
  // Un vol précédent encore en cours fausserait la mesure et les deux
  // transformations se superposeraient (clics rapides, onglet en arrière-plan
  // où les animations ne progressent pas).
  for (const anim of el.getAnimations()) anim.cancel();

  const avant = el.getBoundingClientRect();
  appliquerChangement();
  const apres = el.getBoundingClientRect();

  if (!avant.width || !apres.width) return null;

  const dx = avant.left - apres.left;
  const dy = avant.top - apres.top;
  const echelle = avant.width / apres.width;

  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, opacity: 0.75 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(.22, .8, .28, 1)' }
  );
}

/** Reflète l'état de chaque bulle : verrouillée, ouvrable ou validée. */
function majBulles() {
  const prochaine = prochaineBulle();
  $('#formulaire').classList.toggle('plateau--bloque', !profilValide);

  for (const n of BULLES) {
    const el = bulle(n);
    const estValidee = validees.has(n);
    const estOuvrable = n === prochaine;

    el.classList.toggle('bulle--validee', estValidee);
    el.classList.toggle('bulle--ouvrable', estOuvrable && n !== bulleZoomee);
    el.classList.toggle('bulle--verrouillee', !estValidee && !estOuvrable);

    const tete = el.querySelector('.bulle__declencheur');
    tete.disabled = !estValidee && !estOuvrable && n !== bulleZoomee;
    tete.setAttribute('aria-expanded', String(n === bulleZoomee));

    // Une fois la bulle validée, ses champs restent modifiables sur place :
    // faire varier une hypothèse ne doit pas demander de rouvrir une fenêtre.
    for (const champ of el.querySelectorAll('input, select')) {
      champ.disabled = !estValidee && n !== bulleZoomee;
    }
  }
}

/**
 * Alvéole d'origine de la bulle actuellement zoomée, le temps du zoom.
 *
 * Le rail de gauche est en `position: sticky`, ce qui crée un contexte
 * d'empilement — toujours, même sans `z-index`. Une bulle qui y reste ne peut
 * donc pas passer au-dessus du voile, quel que soit son `z-index` : les bulles
 * 3 et 4 s'ouvraient bien au centre mais sous l'écran grisé, hors d'atteinte.
 * On les sort donc du rail pendant le zoom, et on les y remet après. Le FLIP
 * absorbe le déplacement sans qu'on ait à le lui dire : il mesure la position
 * avant et après, quel que soit le parent.
 */
let alveole = null;

function ouvrirBulle(n) {
  if (bulleZoomee !== null) return;
  const el = bulle(n);

  bulleZoomee = n;
  $('#voile').hidden = false;
  volerVers(el, () => {
    el.classList.add('bulle--zoom');
    el.classList.remove('bulle--ouvrable', 'bulle--verrouillee');
    alveole = el.parentElement;
    document.body.append(el);
  });

  majBulles();
  const premier = el.querySelector('input, select');
  if (premier) premier.focus();
}

function validerBulle(n) {
  if (bulleZoomee !== n) return;
  const el = bulle(n);

  validees.add(n);
  bulleZoomee = null;
  $('#voile').hidden = true;

  volerVers(el, () => {
    if (alveole) { alveole.append(el); alveole = null; }
    el.classList.remove('bulle--zoom');
  });
  majBulles();
  recalculer();

  // On enchaîne : la bulle suivante devient visiblement la prochaine à remplir.
  const suivante = prochaineBulle();
  if (suivante !== null) bulle(suivante).querySelector('.bulle__declencheur').focus();
}

function initialiserBulles() {
  for (const n of BULLES) {
    bulle(n).querySelector(`[data-ouvrir="${n}"]`)
      .addEventListener('click', () => ouvrirBulle(n));
    bulle(n).querySelector(`[data-valider="${n}"]`)
      .addEventListener('click', () => validerBulle(n));
  }

  // Fermer par le voile ou par Échap vaut validation : tous les champs ont
  // déjà une valeur, il n'y a rien à annuler.
  $('#voile').addEventListener('click', () => validerBulle(bulleZoomee));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bulleZoomee !== null) validerBulle(bulleZoomee);
  });

  majBulles();
}

/* ------------------------------------------------- Comparateur de thèmes */

/**
 * Bascule entre les feuilles de thème. Outil de comparaison : il permet de
 * juger deux designs sur les mêmes chiffres, sans recharger ni changer de
 * branche. À retirer une fois le design arrêté.
 *
 * Les graphiques lisent leurs couleurs dans les variables CSS : il faut donc
 * les redessiner une fois la nouvelle feuille appliquée.
 */
function initialiserBascule() {
  const feuille = $('#theme');
  const boutons = [...document.querySelectorAll('.bascule__choix')];

  const appliquer = (nom) => {
    feuille.href = `css/theme-${nom}.css`;
    for (const b of boutons) {
      b.classList.toggle('bascule__choix--actif', b.dataset.theme === nom);
    }
    try { localStorage.setItem('theme', nom); } catch (e) { /* navigation privée */ }

    // La feuille se charge de façon asynchrone : on attend qu'elle soit prête
    // avant de relire les jetons, sinon les courbes gardent l'ancienne palette.
    feuille.addEventListener('load', rafraichir, { once: true });
  };

  for (const b of boutons) b.addEventListener('click', () => appliquer(b.dataset.theme));

  let choisi = 'perron';
  try { choisi = localStorage.getItem('theme') || choisi; } catch (e) { /* idem */ }
  appliquer(choisi);
}

function initialiser() {
  remplirFormulaire(DEFAUTS);
  remplirFormulaireMel();
  $('#formulaire').addEventListener('input', recalculer);
  // Le profil vit hors du plateau : sans son propre écouteur, l'éditer ne
  // recalculerait rien avant le clic sur « Valider mon profil ».
  $('#profil').addEventListener('input', recalculer);
  $('#horizon').addEventListener('input', rafraichir);
  $('#reinitialiser').addEventListener('click', () => {
    remplirFormulaire(DEFAUTS);
    $('#horizon').value = 20;
    validees.clear();
    profilValide = false;
    ouvrirProfil();
    majBulles();
    recalculer();
  });

  $('#profilValider').addEventListener('click', figerProfil);
  $('#profilModifier').addEventListener('click', ouvrirProfil);

  initialiserBulles();

  // Divulgation progressive : le module n'existe qu'après un clic explicite.
  $('#melOuvrir').addEventListener('click', () => {
    $('#melPanneau').hidden = false;
    $('#melOuvrir').hidden = true;
    $('#melOuvrir').setAttribute('aria-expanded', 'true');
    $('#melAnneeBascule').focus();
    rafraichir();
  });
  $('#melFermer').addEventListener('click', () => {
    $('#melPanneau').hidden = true;
    $('#melOuvrir').hidden = false;
    $('#melOuvrir').setAttribute('aria-expanded', 'false');
    rafraichir();
  });
  $('#melFormulaire').addEventListener('input', rafraichir);

  initialiserBascule();

  recalculer();
}

initialiser();

})();
