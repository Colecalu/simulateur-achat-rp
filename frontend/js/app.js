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
  const repartitionEnveloppe = window.SimuRP.repartitionEnveloppe;
  const repartitionAnnuelle = window.SimuRP.repartitionAnnuelle;
  const Sauvegarde = window.SimuRPSauvegarde;
  const SCENARIOS = window.SimuRPScenarios.SCENARIOS;
  const tauxEquivalent = window.SimuRPScenarios.tauxEquivalent;
  const scenarioParCle = window.SimuRPScenarios.parCle;
  const FAMILLES = window.SimuRPScenarios.FAMILLES;
  const scenariosParFamille = window.SimuRPScenarios.parFamille;
  const tauxAnnee = window.SimuRP.tauxAnnee;
  const fraisIrrecuperables = window.SimuRP.fraisIrrecuperables;
  const DEFAUTS_LOCATION = window.SimuRPLocation.DEFAUTS_LOCATION;
  const simulerMiseEnLocation = window.SimuRPLocation.simulerMiseEnLocation;
  const planchersEnveloppe = window.SimuRPLocation.planchersEnveloppe;

/* ------------------------------------------------------------------ Outils */

const $ = (sel) => document.querySelector(sel);

/** Champs saisis en pourcentage à l'écran, stockés en fraction dans le modèle. */
const POURCENTAGES = new Set([
  'tauxCredit', 'tauxAssurance', 'revalBien', 'revalCharges',
  'revalTaxeFonciere', 'revalLoyer', 'rendementBourse', 'fiscalitePlusValues',
]);

const CHAMPS = Object.keys(DEFAUTS).filter((c) => c !== 'horizon');

/**
 * Valeurs PRÉ-REMPLIES à l'écran, pendant le développement (choisies par
 * Lucas pour travailler ; d'autres seront choisies pour la mise en ligne).
 *
 * Elles ne remplacent PAS `DEFAUTS` du moteur : ceux-ci sont le scénario
 * « Paris » du classeur Excel de référence, et la fixture les compare au
 * centime. Seul l'écran part d'ici ; le moteur, les tests et la sauvegarde
 * (`normaliser`) gardent leurs défauts.
 *
 * Profil : patrimoine 200 000 €, loyer actuel 1 600 €, épargne 1 800 € (ceux
 * de `Sauvegarde.DEFAUTS_PROFIL`), revenus du foyer 8 000 €.
 */
const VALEURS_DE_TRAVAIL = Object.assign({}, DEFAUTS, {
  revenusFoyer: 8000,
  prixNetVendeur: 550000,
  fraisAgence: 0,
  travaux: 0,
  fraisBancaires: 2000,
  valeurEstimee: 550000,
  dureeAnnees: 25,
  chargesCopro: 2000,
});

/** Champs facultatifs : laissés vides à l'écran plutôt qu'affichés à zéro. */
const FACULTATIFS = new Set(['revenusFoyer']);

/**
 * La décomposition de l'effort, saisie dans le profil. Le moteur n'en voit que
 * la somme (`enveloppeMensuelle`) ; ces deux champs vivent donc dans le groupe
 * `profil` de la sauvegarde, pas dans celui du moteur.
 */
const CHAMPS_EFFORT = ['loyerActuel', 'epargneActuelle'];

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const eurosPrecis = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

const signe = (v) => (v >= 0 ? '+' : '−') + euros.format(Math.abs(v)).replace('-', '');

/** Lit une variable CSS pour que Chart.js suive le thème clair/sombre. */
const jeton = (nom) => getComputedStyle(document.body).getPropertyValue(nom).trim();

/**
 * La même couleur, atténuée sur le fond de page. Sert à distinguer ce qui est
 * projeté de ce qui est calculé sur données réelles, sans changer de teinte :
 * c'est la même série, pas une autre.
 */
function attenue(couleur, part) {
  const m = /^#([0-9a-f]{6})$/i.exec(couleur);
  if (!m) return couleur;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${part})`;
}

/* ------------------------------------------------------- Lecture du formulaire */

/**
 * Loyer actuel et épargne, tels que saisis. Un champ vidé vaut 0, pas le
 * défaut : ce sont des montants qui s'additionnent, et « rien » est une
 * réponse plausible (on n'épargne pas, on est hébergé gratuitement).
 */
function lireProfil() {
  const profil = {};
  for (const champ of CHAMPS_EFFORT) {
    const v = parseFloat(document.getElementById(champ).value);
    profil[champ] = Number.isFinite(v) ? Math.max(v, 0) : 0;
  }
  return profil;
}

function remplirProfil(profil) {
  for (const champ of CHAMPS_EFFORT) document.getElementById(champ).value = profil[champ];
}

function lireFormulaire() {
  const saisie = {};
  for (const champ of CHAMPS) {
    const el = document.getElementById(champ);
    if (!el) continue;
    if (el.type === 'checkbox') {
      saisie[champ] = el.checked;
      continue;
    }
    if (el.tagName === 'SELECT') {
      saisie[champ] = el.value;
      continue;
    }
    const brut = parseFloat(el.value);
    const valeur = Number.isFinite(brut) ? brut : DEFAUTS[champ];
    saisie[champ] = POURCENTAGES.has(champ) ? valeur / 100 : valeur;
  }
  saisie.horizon = 25; // on calcule toujours 25 ans, le curseur ne fait que lire

  // L'effort déclaré n'est pas saisi : il se compose. Addition et non calcul
  // financier, elle a sa place ici comme la conversion des pourcentages.
  const profil = lireProfil();
  saisie.enveloppeMensuelle = profil.loyerActuel + profil.epargneActuelle;

  // Un scénario actif remplace les taux du formulaire par ses SÉRIES. Les
  // champs de la bulle 4 n'affichent alors que le taux annuel équivalent :
  // c'est un résumé lisible, pas ce que le moteur calcule.
  if (scenarioActif) Object.assign(saisie, scenarioActif.taux);

  return saisie;
}

function remplirFormulaire(valeurs) {
  for (const champ of CHAMPS) {
    const el = document.getElementById(champ);
    if (!el) continue;
    const v = valeurs[champ];
    if (el.type === 'checkbox') { el.checked = v !== false; continue; }
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

  const ans = `${horizon} an${horizon > 1 ? 's' : ''}`;
  $('#horizonLabel').textContent = ans;
  // Le rappel du curseur, dans la section dépliée, affiche la même date.
  $('#horizonBis').value = horizon;
  $('#horizonBisLabel').textContent = ans;

  const chiffre = $('#verdictChiffre');
  const mesure = $('#verdictMesure');

  // Plus de refus de trancher quand l'effort ne couvre pas l'achat : le moteur
  // ne laisse plus le dépassement impayé, il fait monter l'enveloppe des deux
  // côtés. L'écart est donc juste, et le supplément se lit dans le profil.
  afficherMouvement(ecart);

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

/* --------------------------------------------------------- Épargne forcée */

/**
 * Écart affiché juste avant un clic sur la bascule, ou null. Posé par
 * l'écouteur de la case, AVANT le recalcul (la case le reçoit avant le
 * bandeau, qui l'écoute par propagation) ; consommé par le verdict qui suit.
 */
let ecartAvantBascule = null;

/**
 * « Le verdict a bougé de 88 895 € vers l'achat. »
 *
 * La bascule change le verdict de dizaines ou de centaines de milliers
 * d'euros. Sans ce rappel, le chiffre change sous les yeux sans qu'on sache
 * de combien : c'est pourtant CE montant qui dit ce que vaut la discipline.
 */
function afficherMouvement(ecart) {
  const el = $('#verdictMouvement');
  if (ecartAvantBascule === null) {
    el.hidden = true;
    return;
  }
  const delta = ecart - ecartAvantBascule;
  ecartAvantBascule = null;
  el.textContent =
    `Le verdict a bougé de ${euros.format(Math.abs(delta))} vers ` +
    (delta >= 0 ? 'l\'achat.' : 'la location.');
  el.hidden = Math.abs(delta) < 1;
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

/**
 * Matérialise le point mort sur le graphique de patrimoine : un trait vertical
 * à l'année où l'achat repasse devant la location.
 *
 * Greffon écrit à la main plutôt que chartjs-plugin-annotation : une seule
 * balise <script> de plus au CDN pour un trait de vingt lignes ne se justifie
 * pas, et chaque dépendance externe est un point de panne hors ligne.
 */
const traitPointMort = {
  id: 'traitPointMort',
  afterDatasetsDraw(chart) {
    const annee = chart.options.pointMort;
    // L'année 1 n'a pas besoin d'un trait : la courbe part déjà devant.
    if (!annee || annee <= 1) return;

    const x = chart.scales.x.getPixelForValue(annee - 1);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = jeton('--encre-3');
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = jeton('--encre-2');
    ctx.font = '600 11px ' + jeton('--police');
    ctx.textAlign = x > (chart.chartArea.left + chart.chartArea.right) / 2 ? 'right' : 'left';
    ctx.fillText('point mort', x + (ctx.textAlign === 'right' ? -6 : 6), top + 12);
    ctx.restore();
  },
};

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

  /*
   * Au-delà des années réellement observées, un scénario n'est plus une donnée
   * mais une projection au taux moyen. Elle doit se voir : trait de frontière,
   * puis courbes pointillées et atténuées. Sans quoi le graphique laisse croire
   * que vingt-cinq années sont documentées quand onze le sont.
   *
   * `iFrontiere` est l'INDICE du dernier point réel — les années vont de 1 à 25
   * sur l'indice 0 à 24, d'où le décalage d'un cran.
   *
   * Un scénario construit n'a AUCUNE année observée (`reel` à 0) : il n'y a
   * alors pas de frontière à tracer, puisqu'il n'y a rien à quitter. C'est
   * l'étiquette « Hypothèse » du groupe qui porte l'avertissement, pas un trait
   * au milieu de la courbe. D'où le plancher à 0, qui vaut « pas de frontière ».
   */
  const iFrontiere =
    scenarioActif && scenarioActif.reel < resultat.annees.length
      ? Math.max(0, scenarioActif.reel - 1)
      : 0;
  const projection = (couleur) => ({
    borderDash: (ctx) => (ctx.p0DataIndex >= iFrontiere ? [5, 4] : undefined),
    borderColor: (ctx) => (ctx.p0DataIndex >= iFrontiere ? attenue(couleur, 0.45) : undefined),
  });

  // Le point de l'horizon choisi est grossi : le curseur et le graphique
  // désignent la même date.
  const rayons = (i) => (i === horizon - 1 ? 6 : 0);

  const serie = (label, donnees, couleur) => ({
    label,
    data: donnees,
    borderColor: couleur,
    backgroundColor: couleur,
    segment: iFrontiere ? projection(couleur) : undefined,
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
  // Lus par les greffons `traitPointMort` et `traitFrontiere`.
  optionsPatrimoine.pointMort = resultat.premiereAnneeFavorable;
  optionsPatrimoine.frontiere = iFrontiere;

  if (graphPatrimoine) {
    graphPatrimoine.data = donneesLignes;
    graphPatrimoine.options = optionsPatrimoine;
    graphPatrimoine.update('none');
  } else {
    graphPatrimoine = new Chart($('#graphPatrimoine'), {
      type: 'line',
      data: donneesLignes,
      options: optionsPatrimoine,
      plugins: [traitPointMort, traitFrontiere],
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

/* ------------------------------------------- D'où vient cet écart ? */

/*
 * Section dépliable sous le graphique principal. Elle explique le chiffre
 * affiché ; elle ne le concurrence pas — d'où le repli par défaut et des
 * graphiques plus courts.
 *
 * Les trois graphiques lisent le MÊME curseur d'horizon que le gros chiffre.
 * Aucun second curseur : deux réglages de temps à l'écran, c'est la garantie
 * qu'on finit par comparer deux dates différentes sans s'en apercevoir.
 */
let graphPossession = null;
let graphEnvAchat = null;
let graphEnvLocation = null;
let graphPerdu = null;
let graphAnnuelAchat = null;
let graphAnnuelLocation = null;

const pourcentEntier = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** « 6,8 % » — un taux annuel au dixième, virgule française comprise. */
const pourcentDixieme = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const detailOuvert = () => !$('#detailPanneau').hidden;

/** « sur 20 ans » — le libellé de période des titres cumulés. */
const periode = (n) => `sur ${n} an${n > 1 ? 's' : ''}`;

/**
 * Légende : pastille et nom, jamais de montant. Les graphiques qui la portent
 * sont partagés par deux trajectoires, où les mêmes postes valent deux choses
 * différentes. Les montants vivent dans les infobulles.
 *
 * Le libellé affiché est le nom COURT (`court`, un mot) : une légende à cinq
 * entrées de trois mots mange la place du graphique qu'elle explique. Le nom
 * complet reste dans l'infobulle, qui a la place de le porter.
 */
function legendeSimple(cible, postes) {
  $(cible).innerHTML = postes
    .map(
      (p) =>
        `<span class="legende__item"><span class="pastille pastille--${p.classe}"></span>` +
        `${p.court || p.nom}</span>`
    )
    .join('');
}

/**
 * Camembert d'une répartition. Trois à cinq parts au plus : au-delà, les
 * secteurs deviennent trop fins et un histogramme reprend l'avantage.
 *
 * L'infobulle est réglée sur la part SURVOLÉE et non sur l'ensemble : lire
 * quatre postes d'un coup quand on en pointe un seul est illisible.
 */
function camembert(existant, selecteur, parts) {
  const total = parts.reduce((t, x) => t + x.valeur, 0);
  const o = optionsCommunes();
  delete o.scales;
  o.cutout = '58%';
  o.interaction = { mode: 'nearest', intersect: true };
  o.plugins.tooltip.callbacks.title = (items) => items[0].label;
  o.plugins.tooltip.callbacks.label = (ctx) =>
    ` ${euros.format(ctx.parsed)} · ${pourcentEntier.format(total ? ctx.parsed / total : 0)}`;
  delete o.plugins.tooltip.callbacks.footer;

  return poser(existant, selecteur, 'doughnut', {
    labels: parts.map((x) => x.nom),
    datasets: [
      {
        data: parts.map((x) => x.valeur),
        backgroundColor: parts.map((x) => x.couleur),
        borderColor: jeton('--surface'),
        borderWidth: 2,
      },
    ],
  }, o);
}

/** Crée le graphique s'il n'existe pas, le met à jour sinon. */
function poser(graphique, selecteur, type, data, options, greffons) {
  if (graphique) {
    graphique.data = data;
    graphique.options = options;
    graphique.update('none');
    return graphique;
  }
  return new Chart($(selecteur), {
    type: type,
    data: data,
    options: options,
    plugins: greffons || [],
  });
}

/**
 * Trait vertical à la dernière année observée d'un scénario : au-delà, la
 * courbe n'est plus une donnée mais un prolongement au rythme moyen.
 */
const traitFrontiere = {
  id: 'traitFrontiere',
  afterDatasetsDraw(chart) {
    // Un INDICE de point, pas une année : les deux graphiques qui portent ce
    // trait n'ont pas la même origine (l'aperçu commence à l'année 0).
    const i = chart.options.frontiere;
    if (!i) return;
    const x = chart.scales.x.getPixelForValue(i);
    const { top, bottom, right } = chart.chartArea;
    const ctx = chart.ctx;

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = jeton('--encre-3');
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = jeton('--encre-3');
    ctx.font = '600 10px ' + jeton('--police');
    // Le libellé se place du côté où il reste de la place.
    const aDroite = right - x > 90;
    ctx.textAlign = aDroite ? 'left' : 'right';
    ctx.fillText('prolongement', x + (aDroite ? 5 : -5), top + 11);
    ctx.restore();
  },
};

/**
 * Vocabulaire des postes : un nom complet pour les infobulles, un nom court
 * pour les légendes. Défini une fois — deux graphiques qui montrent le même
 * poste doivent le nommer pareil.
 */
const POSTES = {
  credit: { nom: 'Intérêts et assurance', court: 'Intérêts', classe: 'credit' },
  capital: { nom: 'Capital remboursé', court: 'Capital', classe: 'capital' },
  possession: { nom: 'Taxe foncière et charges', court: 'Charges', classe: 'possession' },
  epargne: { nom: 'Épargne investie', court: 'Épargne', classe: 'epargne' },
  loyers: { nom: 'Loyers', court: 'Loyer', classe: 'location' },
  acquisition: { nom: "Frais d'acquisition", court: 'Acquisition', classe: 'acquisition' },
};

/** Un poste prêt à être dessiné : vocabulaire + couleur (+ montant). */
const poste = (cle, couleur, valeur) =>
  Object.assign({}, POSTES[cle], { couleur: couleur, valeur: valeur });

function dessinerDetail(resultat, horizon) {
  if (!detailOuvert() || typeof Chart === 'undefined') return;

  // --- Les quatre chiffres ---------------------------------------------
  //
  // `premiereAnneeFavorable` est le PREMIER croisement, pas un acquis : les
  // deux courbes peuvent se recroiser quand le rendement boursier est élevé.
  // On ne commente pas le cas normal — le libellé du chiffre suffit — mais on
  // avertit quand l'avantage ne tient plus, sinon l'écran se contredit.
  //
  const pointMort = resultat.premiereAnneeFavorable;
  const tientEncore = resultat.annees[horizon - 1].ecart >= 0;

  $('#pointMort').textContent =
    pointMort === null ? 'Jamais' : pointMort === 1 ? 'Dès la 1re année' : `${pointMort} ans`;

  if (pointMort === null) {
    $('#pointMortMesure').textContent =
      `Sur ${resultat.annees.length} ans simulés, l'achat ne repasse jamais devant la location.`;
  } else if (tientEncore) {
    $('#pointMortMesure').textContent = '';
  } else {
    $('#pointMortMesure').textContent =
      `L'achat passe devant à l'année ${pointMort}, mais la location reprend l'avantage ` +
      `avant l'année ${horizon}.`;
  }

  // Le coût mensuel réel CONTIENT la mensualité : c'est voulu. On montre ce
  // que le propriétaire sort chaque mois, tout compris, face au loyer — pas
  // une décomposition dont il faudrait faire la somme.
  $('#kpiMensualite').textContent = euros.format(resultat.mensualiteTotale);
  $('#kpiCoutReel').textContent = euros.format(resultat.coutMensuelProprio);
  $('#kpiLoyer').textContent = euros.format(resultat.entrees.loyer);

  // --- Couleurs des postes ---------------------------------------------
  const cCredit = jeton('--poste-credit');
  const cCapital = jeton('--poste-capital');
  const cPossession = jeton('--poste-possession');
  const cEpargne = jeton('--poste-epargne');
  const cAcquisition = jeton('--poste-acquisition');
  const cLoyers = jeton('--location');

  // --- À quoi sert votre argent : deux camemberts cumulés ---------------
  const rep = repartitionEnveloppe(resultat, horizon);

  graphEnvAchat = camembert(graphEnvAchat, '#graphEnvAchat', [
    poste('credit', cCredit, rep.achat.credit),
    poste('capital', cCapital, rep.achat.capital),
    poste('possession', cPossession, rep.achat.possession),
    poste('epargne', cEpargne, rep.achat.epargne),
  ]);

  graphEnvLocation = camembert(graphEnvLocation, '#graphEnvLocation', [
    poste('loyers', cLoyers, rep.location.loyers),
    poste('epargne', cEpargne, rep.location.epargne),
  ]);

  $('#periodeVerse').textContent = periode(horizon);
  legendeSimple('#legendeEnveloppe', [
    poste('credit', cCredit),
    poste('capital', cCapital),
    poste('possession', cPossession),
    poste('loyers', cLoyers),
    poste('epargne', cEpargne),
  ]);

  // Les deux totaux sont égaux : c'est la prémisse du simulateur, et c'est ce
  // que la hauteur commune des barres disait avant.
  $('#totalEnvAchat').textContent = euros.format(rep.achat.total);
  $('#totalEnvLocation').textContent = euros.format(rep.location.total);

  // --- Frais irrécupérables --------------------------------------------
  const irr = fraisIrrecuperables(resultat, horizon);
  const partsPerdu = [
    poste('acquisition', cAcquisition, irr.achat.acquisition),
    poste('credit', cCredit, irr.achat.credit),
    poste('possession', cPossession, irr.achat.possession),
  ];
  graphPerdu = camembert(graphPerdu, '#graphPerdu', partsPerdu);
  $('#totalPerdu').textContent = euros.format(irr.achat.total);
  $('#periodePerdu').textContent = periode(horizon);
  legendeSimple('#legendePerdu', partsPerdu);

  // --- Année par année : deux piles par année, jamais cumulées ----------
  //
  // Ce graphique ignore volontairement le curseur : il montre toute la durée
  // simulée, comme la part possédée juste en dessous. Les deux se lisent donc
  // sur le même axe de temps.
  //
  const annuel = repartitionAnnuelle(resultat);

  const pile = (label, valeurs, couleur, arrondi) => ({
    label,
    data: valeurs,
    backgroundColor: couleur,
    borderColor: jeton('--surface'),
    borderWidth: { top: 1, right: 0, bottom: 0, left: 0 },
    borderSkipped: false,
    borderRadius: arrondi ? { topLeft: 3, topRight: 3 } : 0,
  });

  // Même plafond des deux côtés : à échelles différentes, deux histogrammes
  // côte à côte suggèrent des écarts qui n'existent pas. Le plafond est
  // l'enveloppe annuelle — sauf quand elle ne suffit pas et que l'achat la
  // dépasse, auquel cas on suit le dépassement.
  const hauteurMax = Math.max(
    ...annuel.map((l) => l.achat.credit + l.achat.capital + l.achat.possession + l.achat.epargne),
    ...annuel.map((l) => l.location.loyers + l.location.epargne)
  );

  const optionsAnnuelles = () => {
    const o = optionsCommunes();
    o.scales.x.stacked = true;
    o.scales.y.stacked = true;
    o.scales.y.beginAtZero = true;
    o.scales.y.max = Math.ceil(hauteurMax / 5000) * 5000;
    // Une part à la fois, pas toute la colonne.
    o.interaction = { mode: 'nearest', intersect: true };
    o.plugins.tooltip.callbacks.title = (items) => `Année ${items[0].label}`;
    o.plugins.tooltip.callbacks.label = (ctx) =>
      ` ${ctx.dataset.label} : ${euros.format(ctx.parsed.y)}`;
    return o;
  };

  const annees = annuel.map((l) => l.annee);

  graphAnnuelAchat = poser(graphAnnuelAchat, '#graphAnnuelAchat', 'bar', {
    labels: annees,
    datasets: [
      pile(POSTES.credit.nom, annuel.map((l) => l.achat.credit), cCredit, false),
      pile(POSTES.capital.nom, annuel.map((l) => l.achat.capital), cCapital, false),
      pile(POSTES.possession.nom, annuel.map((l) => l.achat.possession), cPossession, false),
      pile(POSTES.epargne.nom, annuel.map((l) => l.achat.epargne), cEpargne, true),
    ],
  }, optionsAnnuelles());

  graphAnnuelLocation = poser(graphAnnuelLocation, '#graphAnnuelLocation', 'bar', {
    labels: annees,
    datasets: [
      pile(POSTES.loyers.nom, annuel.map((l) => l.location.loyers), cLoyers, false),
      pile(POSTES.epargne.nom, annuel.map((l) => l.location.epargne), cEpargne, true),
    ],
  }, optionsAnnuelles());

  legendeSimple('#legendeAnnuel', [
    poste('credit', cCredit),
    poste('capital', cCapital),
    poste('possession', cPossession),
    poste('loyers', cLoyers),
    poste('epargne', cEpargne),
  ]);

  // --- Part du bien réellement possédée --------------------------------
  const cAchat = jeton('--achat');
  const optionsPossession = optionsCommunes();
  optionsPossession.scales.y.min = 0;
  optionsPossession.scales.y.max = 1;
  optionsPossession.scales.y.ticks.callback = (v) => pourcentEntier.format(v);
  optionsPossession.plugins.tooltip.callbacks.label = (ctx) =>
    ` Part possédée : ${pourcentEntier.format(ctx.parsed.y)}`;

  graphPossession = poser(graphPossession, '#graphPossession', 'line', {
    labels: resultat.annees.map((a) => a.annee),
    datasets: [
      {
        label: 'Part possédée',
        data: resultat.annees.map((a) => a.partPossedee),
        borderColor: cAchat,
        backgroundColor: `color-mix(in srgb, ${cAchat} 12%, transparent)`,
        borderWidth: 2,
        fill: true,
        tension: 0.25,
        pointRadius: (ctx) => (ctx.dataIndex === horizon - 1 ? 6 : 0),
        pointHoverRadius: 6,
        pointBackgroundColor: cAchat,
        pointBorderColor: jeton('--surface'),
        pointBorderWidth: 2,
      },
    ],
  }, optionsPossession);
}

function initialiserDetail() {
  const bouton = $('#detailOuvrir');
  const panneau = $('#detailPanneau');

  bouton.addEventListener('click', () => {
    const ouvrir = panneau.hidden;
    panneau.hidden = !ouvrir;
    bouton.setAttribute('aria-expanded', String(ouvrir));
    bouton.textContent = ouvrir ? 'Masquer le détail' : "D'où vient cet écart ?";
    if (!ouvrir) return;

    // Un canevas dimensionné dans un conteneur masqué reste à zéro : on ne
    // crée les graphiques qu'une fois la zone visible, et on redimensionne
    // ceux qui existaient déjà.
    rafraichir();
    const tous = [graphPossession, graphEnvAchat, graphEnvLocation, graphPerdu,
                graphAnnuelAchat, graphAnnuelLocation];
    for (const g of tous) if (g) g.resize();
  });
}

/* ---------------------------------------------------- Scénarios de marché */

/*
 * Deuxième pilier du simulateur : appliquer des trajectoires de marché ANNÉE
 * PAR ANNÉE plutôt qu'un taux constant. Le filtre s'applique par-dessus les
 * quatre bulles — ce n'est pas une cinquième étape, il n'a donc ni numéro ni
 * place dans le parcours séquentiel.
 */

/** Les cinq taux qu'un scénario pilote. */
const TAUX_SCENARISES = [
  'rendementBourse',
  'revalBien',
  'revalLoyer',
  'revalCharges',
  'revalTaxeFonciere',
];

/** Scénario appliqué, ou null quand l'utilisateur garde ses hypothèses. */
let scenarioActif = null;
/** Les taux saisis à la main, mis de côté le temps qu'un scénario s'applique. */
let hypothesesUtilisateur = null;

/*
 * Le choix se fait en DEUX TEMPS.
 *
 * 1. La carte du rail est un simple appel. Elle ouvre une fenêtre qui explique
 *    ce qu'on cherche à faire — et rien d'autre : pas un seul nom de scénario.
 *    Sept noms de décennies ne veulent rien dire tant qu'on n'a pas dit ce
 *    qu'on en fait, ni prévenu que la seconde moitié des courbes est extrapolée.
 * 2. Une fois l'explication lue, la carte laisse place à la liste, qui reste
 *    en place. Chaque ligne porte son nom, sa période, et un bouton qui ouvre
 *    l'aperçu des courbes.
 *
 * L'explication reste accessible par le « ? » à côté du titre : on doit
 * pouvoir la relire sans réinitialiser la page.
 */

/** Petite icône de courbe, pour le bouton d'aperçu. */
const ICONE_COURBE =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M1.5 11.5 5 7l3 2.5 5.5-6"/><path d="M1.5 14.5h13"/></svg>';

/** L'explication a-t-elle déjà été lue ? Tant que non, la liste reste cachée. */
let scenariosDecouverts = false;

const introOuverte = () => !$('#intro').hidden;
const apercuOuvert = () => !$('#apercu').hidden;

function ligneScenario(sc) {
  const date = sc.periode ? `<span class="scenario__periode">${sc.periode}</span>` : '';
  return (
    '<div class="scenario__ligne">' +
    `<button type="button" class="scenario__option" data-scenario="${sc.cle}" ` +
      'role="radio" aria-checked="false">' +
      `<span class="scenario__nom">${sc.nom}</span>${date}</button>` +
    `<button type="button" class="scenario__apercu" data-apercu="${sc.cle}" ` +
      `aria-label="Voir les courbes — ${sc.nom}" title="Voir les courbes">${ICONE_COURBE}</button>` +
    '</div>'
  );
}

function construireScenarios() {
  const morceaux = [ligneScenario({ cle: '', nom: 'Mes hypothèses', periode: null })];
  for (const famille of FAMILLES) {
    const liste = scenariosParFamille(famille.cle);
    if (!liste.length) continue;
    // L'étiquette dit l'essentiel : « Historique » = observé, « Hypothèse » =
    // construit. Sans elle, deux scénarios de nature opposée se ressemblent.
    morceaux.push(
      `<p class="scenario__famille">${famille.nom}` +
        `<span class="scenario__etiquette">${famille.etiquette}</span></p>`
    );
    for (const sc of liste) morceaux.push(ligneScenario(sc));
  }
  $('#scenarioChoix').innerHTML = morceaux.join('');

  for (const b of document.querySelectorAll('.scenario__option')) {
    b.addEventListener('click', () => appliquerScenario(b.dataset.scenario));
  }
  for (const b of document.querySelectorAll('.scenario__apercu')) {
    b.addEventListener('click', () => ouvrirApercu(b.dataset.apercu));
  }

  $('#scenarioOuvrir').addEventListener('click', ouvrirIntro);
  $('#scenarioAide').addEventListener('click', ouvrirIntro);
  $('#introFermer').addEventListener('click', fermerIntro);
  $('#introValider').addEventListener('click', () => {
    scenariosDecouverts = true;
    fermerIntro();
    majScenario();
  });
  $('#apercuFermer').addEventListener('click', fermerApercu);
}

function ouvrirIntro() {
  $('#intro').hidden = false;
  $('#voile').hidden = false;
}

function fermerIntro() {
  $('#intro').hidden = true;
  if (bulleZoomee === null && !apercuOuvert()) $('#voile').hidden = true;
}

/* --- L'aperçu d'un scénario : courbes en base 100, taux, sources -------- */

let graphApercu = null;

/** « +6 », « −18 », « 0 » — un taux annuel, signe compris, sans le %. */
const tauxSigne = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/**
 * Combien d'années une série énumère vraiment avant de devenir plate.
 *
 * Toutes les séries font vingt-cinq ans, mais la fin est un prolongement à taux
 * constant. Lister les vingt-cinq valeurs donnerait à ce prolongement l'allure
 * d'une donnée ; on s'arrête donc là où la série se met à se répéter.
 */
function anneesDistinctes(serie) {
  let n = serie.length;
  while (n > 1 && serie[n - 1] === serie[n - 2]) n -= 1;
  return n === 1 ? 0 : n - 1;
}

function ouvrirApercu(cle) {
  const sc = cle ? scenarioParCle(cle) : null;
  const horizon = dernierResultat ? dernierResultat.annees.length : 25;

  // « Mes hypothèses » n'a pas de série : on lit les champs, ce qui donne trois
  // droites. La comparaison avec une décennie réelle est tout l'argument.
  const lire = (champ) => {
    if (sc) return sc.taux[champ];
    const v = parseFloat(document.getElementById(champ).value);
    return (Number.isFinite(v) ? v : DEFAUTS[champ] * 100) / 100;
  };

  /*
   * Base 100 : on trace la VALEUR, pas le taux. Une suite de pourcentages est
   * une dérivée — on la lit mal, et surtout on ne voit pas où elle mène. Avec
   * une base 100, deux décennies de moyenne identique mais d'ordre différent
   * se séparent à l'œil, ce qui est précisément le propos du pilier.
   */
  const base100 = (taux) => {
    const suite = [100];
    for (let a = 1; a <= horizon; a++) suite.push(suite[a - 1] * (1 + tauxAnnee(taux, a)));
    return suite;
  };

  // `couleur` sert au canevas (Chart.js peint, pas de CSP en jeu) ; `classe`
  // sert aux pastilles HTML, qui ne peuvent pas porter de style en ligne.
  const series = [
    { champ: 'rendementBourse', nom: 'Marchés actions',
      couleur: jeton('--courbe-marches'), classe: 'marches' },
    { champ: 'revalBien', nom: "Prix de l'immobilier",
      couleur: jeton('--courbe-immo'), classe: 'immo' },
    { champ: 'revalLoyer', nom: 'Loyers (IRL)',
      couleur: jeton('--courbe-loyer'), classe: 'loyer-irl', pointille: true },
  ];
  for (const serie of series) serie.taux = lire(serie.champ);

  $('#apercuTitre').textContent = sc ? sc.nom : 'Mes hypothèses';
  $('#apercuResume').textContent = sc
    ? sc.resume
    : 'Vos taux, appliqués tels quels chaque année. Aucune donnée de marché.';

  // On n'affiche que les années EXPLICITEMENT DÉFINIES, suivies du taux qui
  // prolonge. Lister vingt-cinq valeurs dont treize identiques ferait passer un
  // prolongement pour une donnée.
  //
  // `definies` et non `reel` : un scénario construit n'a aucune année observée,
  // mais ses années de choc sont ce qu'il faut montrer — ce sont elles qui le
  // définissent.
  const definies = sc ? Math.min(sc.definies, horizon) : 0;
  $('#apercuSuites').innerHTML = series
    .map((serie) => {
      let valeurs;
      if (!Array.isArray(serie.taux)) {
        valeurs = `${tauxSigne.format(serie.taux * 100)} chaque année`;
      } else {
        // Compté série par série : dans un stress test, une seule grandeur est
        // choquée. Les autres valent la tendance longue dès la première année
        // et n'ont aucune valeur distincte à énumérer.
        const n = Math.min(anneesDistinctes(serie.taux), horizon);
        valeurs = serie.taux
          .slice(0, n)
          .map((t) => tauxSigne.format(t * 100))
          .join(' · ');
        if (n < horizon) {
          valeurs += n
            ? ` <b>puis ${tauxSigne.format(serie.taux[n] * 100)} par an</b>`
            : `<b>${tauxSigne.format(serie.taux[n] * 100)} chaque année</b>`;
        }
      }
      return (
        '<div class="suite">' +
        `<span class="suite__mot"><span class="pastille pastille--${serie.classe}"></span>` +
        `${serie.nom}</span><span class="suite__valeurs">${valeurs}</span></div>`
      );
    })
    .join('');

  const arrivee = (taux) => Math.round(base100(taux)[horizon]);
  $('#apercuNote').textContent =
    `Taux annuels en %. Base 100 au départ : après ${horizon} ans, ` +
    series.map((x) => `${arrivee(x.taux)} pour « ${x.nom} »`).join(', ') +
    '.' +
    // Le texte doit dire ce qui est observé et ce qui ne l'est pas. Un scénario
    // construit n'a rien d'observé du tout : le dire est plus important que de
    // décrire un prolongement.
    (!sc
      ? ''
      : sc.reel === 0
      ? ` Aucune de ces années n'est observée : c'est une hypothèse, où ${definies} ` +
        'années de choc sont suivies de la tendance longue.'
      : sc.reel < horizon
      ? ` Les ${sc.reel} premières années sont observées ; au-delà, le trait vertical marque ` +
        'le début du prolongement, au rythme annualisé de la période.'
      : ' Toutes les années affichées sont observées : aucun prolongement.');

  // La provenance est une exigence du pilier : un scénario historique sans
  // source n'est qu'une opinion. Les réserves passent devant — une réserve dit
  // ce qu'on sait de faux, elle ne se range pas en bas de page.
  $('#apercuSources').innerHTML = sc
    ? (sc.reserves || []).map((r) => `<li class="apercu__reserve">${r}</li>`).join('') +
      series
        .filter((x) => sc.sources && sc.sources[x.champ])
        .map((x) => `<li>${x.nom} : ${sc.sources[x.champ]}</li>`)
        .join('')
    : '';

  $('#apercu').hidden = false;
  $('#voile').hidden = false;

  if (typeof Chart === 'undefined') return;

  const o = optionsCommunes();
  o.scales.y.ticks.callback = (v) => Math.round(v);
  // Le trait des 100 est la référence : au-dessous, on a perdu de la valeur.
  o.scales.y.grid.color = (ctx) => (ctx.tick.value === 100 ? jeton('--axe') : jeton('--grille'));
  o.plugins.tooltip.callbacks.title = (items) =>
    items[0].label === '0' ? 'Départ' : `Année ${items[0].label}`;
  o.plugins.tooltip.callbacks.label = (ctx) => {
    const t = ctx.dataset.tauxAnnuels[ctx.dataIndex];
    const variation = t === null ? '' : ` (${tauxSigne.format(t * 100)} %)`;
    return ` ${ctx.dataset.label} : ${Math.round(ctx.parsed.y)}${variation}`;
  };
  // Ici l'axe commence à l'année 0 : l'indice du dernier point réel vaut donc
  // exactement le nombre d'années observées. Un scénario construit n'en a
  // aucune — pas de frontière à tracer, la courbe entière est une hypothèse.
  const observees = sc ? Math.min(sc.reel, horizon) : 0;
  o.frontiere = observees < horizon ? observees : 0;

  graphApercu = poser(graphApercu, '#graphApercu', 'line', {
    labels: Array.from({ length: horizon + 1 }, (_, i) => i),
    datasets: series.map((serie) => ({
      label: serie.nom,
      data: base100(serie.taux),
      tauxAnnuels: Array.from({ length: horizon + 1 }, (_, i) =>
        i === 0 ? null : tauxAnnee(serie.taux, i)),
      borderColor: serie.couleur,
      backgroundColor: serie.couleur,
      // Au-delà des années observées, la courbe s'atténue : c'est une
      // projection au taux moyen, pas une donnée.
      segment: o.frontiere
        ? {
            borderColor: (ctx) =>
              ctx.p0DataIndex >= o.frontiere ? attenue(serie.couleur, 0.45) : undefined,
          }
        : undefined,
      // La courbe des loyers est la plus pâle : le pointillé lui donne une
      // seconde marque, pour qu'elle ne repose pas sur la seule couleur.
      borderWidth: serie.pointille ? 2.5 : 2,
      borderDash: serie.pointille ? [5, 3] : undefined,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.2,
    })),
  }, o, [traitFrontiere]);

  // Un canevas dimensionné dans un conteneur masqué reste à zéro.
  graphApercu.resize();
}

function fermerApercu() {
  $('#apercu').hidden = true;
  if (bulleZoomee === null && !introOuverte()) $('#voile').hidden = true;
}

/**
 * Applique un scénario, ou rend la main à l'utilisateur quand `cle` est vide.
 *
 * Les champs de taux de la bulle 4 sont alors pilotés : on y écrit le taux
 * annuel ÉQUIVALENT (moyenne géométrique) et on les désactive. Les laisser
 * afficher les valeurs de l'utilisateur pendant qu'un scénario calcule autre
 * chose serait un mensonge à l'écran.
 */
function appliquerScenario(cle) {
  const scenario = cle ? scenarioParCle(cle) : null;

  // On met les hypothèses de côté au premier scénario appliqué, pour pouvoir
  // les rendre intactes ensuite.
  if (scenario && !hypothesesUtilisateur) {
    hypothesesUtilisateur = {};
    for (const champ of TAUX_SCENARISES) {
      hypothesesUtilisateur[champ] = document.getElementById(champ).value;
    }
  }

  scenarioActif = scenario;

  for (const champ of TAUX_SCENARISES) {
    const el = document.getElementById(champ);
    if (scenario) {
      el.value = (tauxEquivalent(scenario.taux[champ]) * 100).toFixed(2).replace(/\.?0+$/, '');
    } else if (hypothesesUtilisateur) {
      el.value = hypothesesUtilisateur[champ];
    }
    el.disabled = !!scenario;
  }
  if (!scenario) hypothesesUtilisateur = null;

  for (const b of document.querySelectorAll('.scenario__option')) {
    const actif = b.dataset.scenario === (cle || '');
    b.classList.toggle('scenario__option--actif', actif);
    b.setAttribute('aria-checked', String(actif));
  }

  // Deux natures, deux phrases : une fenêtre du passé annonce ses années
  // observées, un stress test annonce qu'il n'en a aucune. Écrire
  // « 0 années observées » serait exact et incompréhensible.
  $('#scenarioNote').textContent = !scenario
    ? ''
    : scenario.reel === 0
    ? `Hypothèse : ${scenario.definies} années de choc sur ${scenario.choque.nom}, ` +
      `puis la tendance longue (${pourcentDixieme.format(scenario.suite[scenario.choque.cle])} par an).`
    : `${scenario.reel} années observées` +
      (scenario.periode ? ` (${scenario.periode})` : '') +
      (scenario.reel < 25
        ? `, puis ${pourcentDixieme.format(scenario.suiteBourse)} par an — extrapolé.`
        : ', soit tout l\u2019horizon. Rien n\u2019est extrapolé.');

  recalculer();
}

/**
 * Le filtre reste inerte tant que les quatre bulles ne sont pas validées : un
 * scénario n'a rien à filtrer avant qu'il y ait un résultat.
 */
function majAvertissement() {
  const commun =
    'Ni inflation générale, ni changement de situation, ni revente anticipée subie. ' +
    "Un résultat serré (moins de quelques milliers d'euros d'écart) doit se lire comme une égalité.";
  if (!scenarioActif) {
    $('#avertissement').textContent =
      'Simulation à hypothèses constantes : le rendement boursier est supposé régulier, ' +
      "ce qu'aucun marché ne fait. " + commun;
    return;
  }
  // Le texte doit dire où s'arrêtent les données, pas seulement que des taux
  // varient : c'est la frontière qui décide comment lire la fin du graphique.
  const sc = scenarioActif;
  const tendance = `${pourcentDixieme.format(sc.suiteBourse)} par an en bourse`;

  // Un stress test n'a aucune année observée : l'avertissement doit dire qu'on
  // teste UN risque, pas laisser croire à une période documentée. La phrase
  // nomme le marché après un deux-points, ce qui évite d'accorder « seul » avec
  // un libellé qui change de genre selon le scénario.
  if (sc.reel === 0) {
    $('#avertissement').textContent =
      `Scénario « ${sc.nom} » : hypothèse construite, aucune année observée. ` +
      `Un seul marché est choqué : ${sc.choque.nom}, pendant ${sc.definies} ans. ` +
      `Le reste suit la tendance longue (${sc.autre.nom} à ` +
      `${pourcentDixieme.format(sc.autre.taux)} par an). C'est ce qui permet de savoir ` +
      'ce qui est testé. ' +
      commun;
    return;
  }

  const observe = sc.periode ? `${sc.reel} années observées (${sc.periode})` : `${sc.reel} années`;
  $('#avertissement').textContent =
    `Scénario « ${sc.nom} » : ${observe}, ` +
    (sc.reel >= 25
      ? "assez pour couvrir tout l'horizon — rien n'est projeté. "
      : `puis une projection au rythme annualisé de la période (${tendance}). ` +
        "Au-delà du trait, les courbes sont pointillées : ce n'est plus une donnée. ") +
    commun;
}

function majScenario() {
  const pret = profilValide && validees.size === BULLES.length;
  $('#scenario').dataset.etat = !pret
    ? 'bloque'
    : scenariosDecouverts
    ? 'ouvert'
    : 'ferme';
  $('#scenarioAccroche').textContent = pret
    ? 'Rejouez vingt ans qui ont vraiment eu lieu, ou testez un choc.'
    : 'Disponible une fois votre simulation complète.';
}

/* ------------------------------------------------------- Brouillon local */

/*
 * La saisie en cours est écrite dans le `localStorage` à chaque modification.
 * Sans compte, sans réseau : fermer l'onglet ne fait plus rien perdre.
 *
 * Deux choses sont enregistrées, et leur séparation compte :
 *   - `params`, qui décrit un PROJET. C'est ce qui partira tel quel vers le
 *     compte le jour où il existera. Aucun état d'interface dedans.
 *   - `avancement`, qui décrit où en est CETTE session dans CE navigateur.
 *     Sans lui, rouvrir l'onglet afficherait un résultat complet alors que
 *     l'utilisateur n'a rempli qu'une bulle — exactement ce qu'on s'interdit.
 */

/** Rassemble l'état courant sous la forme attendue par la sauvegarde. */
function paramsCourants() {
  const p = Sauvegarde.vide();
  const saisie = lireFormulaire();
  for (const champ of Object.keys(p.moteur)) {
    if (champ in saisie) p.moteur[champ] = saisie[champ];
  }
  // La décomposition, pas la somme : l'effort se déduit, il ne se stocke pas.
  p.profil = lireProfil();

  // Les champs de mise en location sont lus directement : `lireFormulaireMel`
  // rend `null` tant que le palier 1 est incomplet, or on veut sauvegarder la
  // saisie partielle aussi.
  const nombre = (id) => {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : null;
  };
  p.location.anneeBascule = nombre('melAnneeBascule');
  p.location.loyerPercu = nombre('melLoyerPercu');
  p.location.loyerFutur = nombre('melLoyerFutur');
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    const el = document.getElementById(id);
    if (el.tagName === 'SELECT') {
      p.location[def.cle] = el.value;
      continue;
    }
    const v = parseFloat(el.value);
    if (Number.isFinite(v)) p.location[def.cle] = def.pourcentage ? v / 100 : v;
  }

  p.scenario = scenarioActif ? scenarioActif.cle : null;
  p.horizon = parseInt($('#horizon').value, 10) || 20;
  return p;
}

function avancementCourant() {
  return {
    profilValide: profilValide,
    bullesValidees: [...validees],
    epargneForceeRepondue: epargneForceeRepondue,
  };
}

const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Dit où en est la sauvegarde. Vide tant qu'il n'y a rien à dire. */
function direBrouillon(texte, alerte) {
  const el = $('#brouillonEtat');
  el.textContent = texte;
  el.classList.toggle('brouillon--alerte', alerte === true);
}

/** Écrit tout de suite, et met l'indicateur à jour. */
function ecrireBrouillon() {
  if (!Sauvegarde.ecrire(paramsCourants(), avancementCourant())) {
    direBrouillon(
      'Sauvegarde impossible : votre navigateur refuse le stockage local. ' +
        'Votre saisie sera perdue en fermant l’onglet.',
      true
    );
    return;
  }
  direBrouillon('Brouillon enregistré à ' + heure.format(new Date()) + '.');
}

/**
 * Écriture différée : on ne touche au `localStorage` qu'après une demi-seconde
 * sans frappe. Écrire à chaque caractère serait inutile et coûteux.
 */
const enregistrerBrouillon = Sauvegarde.differer(ecrireBrouillon, 500);

/**
 * Restaure un brouillon au chargement. Rend `true` si quelque chose a été
 * restauré, pour que l'appelant sache s'il doit recalculer.
 *
 * Les taux sont stockés en FRACTION et s'affichent en POURCENTAGE : c'est
 * `remplirFormulaire` qui fait la conversion, comme pour les défauts. On lui
 * passe donc les paramètres tels quels, sans les traduire ici.
 */
function restaurerBrouillon() {
  const brouillon = Sauvegarde.lire();
  if (!brouillon) return false;

  remplirFormulaire(brouillon.params.moteur);
  remplirProfil(brouillon.params.profil);

  const champ = (id, v, pourcentage) => {
    const el = document.getElementById(id);
    if (!el || v === null || v === undefined) return;
    el.value = el.tagName === 'SELECT' ? v : pourcentage ? +(v * 100).toFixed(4) : v;
  };
  champ('melAnneeBascule', brouillon.params.location.anneeBascule);
  champ('melLoyerPercu', brouillon.params.location.loyerPercu);
  champ('melLoyerFutur', brouillon.params.location.loyerFutur);
  for (const [id, def] of Object.entries(CHAMPS_MEL_AVANCES)) {
    champ(id, brouillon.params.location[def.cle], def.pourcentage);
  }

  $('#horizon').value = brouillon.params.horizon;

  // Le module de mise en location se rouvre s'il portait une saisie : son état
  // d'ouverture se DÉDUIT des paramètres, il n'a pas à être stocké.
  if (brouillon.params.location.anneeBascule !== null) {
    $('#melPanneau').hidden = false;
    $('#melOuvrir').hidden = true;
    $('#melOuvrir').setAttribute('aria-expanded', 'true');
  }

  // L'avancement est restauré AVANT le scénario : `appliquerScenario` appelle
  // `recalculer`, qui lit `profilValide` et `validees` pour décider ce qui
  // s'affiche.
  profilValide = brouillon.avancement.profilValide;
  epargneForceeRepondue = brouillon.avancement.epargneForceeRepondue;
  validees.clear();
  for (const n of brouillon.avancement.bullesValidees) validees.add(n);
  if (profilValide) figerProfil(true);

  if (brouillon.params.scenario && scenarioParCle(brouillon.params.scenario)) {
    scenariosDecouverts = true;
    appliquerScenario(brouillon.params.scenario);
  }

  direBrouillon('Simulation restaurée, telle que vous l’aviez laissée.');
  return true;
}

/**
 * Branche la sauvegarde locale. Appelé en fin d'initialisation.
 *
 * Trois écouteurs plutôt qu'un :
 * - `input` couvre la frappe ;
 * - `change` couvre les listes déroulantes et les modes de saisie qui
 *   n'émettent pas `input` à chaque étape ;
 * - `pagehide` force l'écriture en attente. Sans lui, fermer l'onglet dans la
 *   demi-seconde qui suit une frappe perdrait cette frappe — le différé aurait
 *   mangé exactement ce qu'il devait protéger.
 */
function initialiserBrouillon() {
  if (!Sauvegarde.disponible()) {
    direBrouillon(
      'Votre navigateur refuse le stockage local : cette simulation ne sera pas ' +
        'conservée quand vous fermerez l’onglet.',
      true
    );
    return;
  }

  for (const zone of ['#formulaire', '#profil', '#melFormulaire']) {
    $(zone).addEventListener('input', enregistrerBrouillon);
    $(zone).addEventListener('change', enregistrerBrouillon);
  }
  for (const id of ['#horizon', '#horizonBis']) {
    $(id).addEventListener('input', enregistrerBrouillon);
  }

  // `pagehide` plutôt que `beforeunload` : c'est celui que les navigateurs
  // modernes garantissent, y compris quand l'onglet est mis en cache arrière.
  addEventListener('pagehide', ecrireBrouillon);

  restaurerBrouillon();
}

/* ---------------------------------------------------------------- Orchestre */

let dernierResultat = null;
/** Options de mise en location du dernier calcul, ou null si le module est fermé ou incomplet. */
let dernieresOptionsMel = null;

function recalculer() {
  const saisie = lireFormulaire();

  // La mise en location se lit AVANT le moteur de base : le loyer payé
  // ailleurs après la bascule peut dépasser l'enveloppe, et avec l'enveloppe
  // identique le locataire de la comparaison doit pouvoir placer la même
  // somme. calc-location.js fournit ces planchers ; calc.js les applique sans
  // savoir d'où ils viennent.
  dernieresOptionsMel = $('#melPanneau').hidden ? null : lireFormulaireMel();
  saisie.planchersEnveloppe = dernieresOptionsMel
    ? planchersEnveloppe(saisie, dernieresOptionsMel, saisie.horizon)
    : null;

  dernierResultat = simuler(saisie);
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

  const mel = dernieresOptionsMel ? simulerMiseEnLocation(dernierResultat, dernieresOptionsMel) : null;
  $('#melIncomplet').hidden = !!mel || $('#melPanneau').hidden;

  majBulles();
  majScenario();
  majAvertissement();
  afficherProfil(dernierResultat);
  if (!majAttente()) return;

  afficherVerdict(dernierResultat, horizon);
  dessinerGraphiques(dernierResultat, horizon, mel);
  dessinerDetail(dernierResultat, horizon);
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

/**
 * @param {boolean} [discret] - au chargement d'un brouillon, on replie le
 *   bandeau sans déplacer le focus : voler le curseur à quelqu'un qui vient
 *   d'ouvrir la page, ce n'est pas une aide, c'est une surprise.
 */
function figerProfil(discret) {
  profilValide = true;
  $('#profil').dataset.etat = 'fige';
  majBulles();
  recalculer();
  if (discret === true) return;

  const suivante = prochaineBulle();
  if (suivante !== null) bulle(suivante).querySelector('.bulle__declencheur').focus();
}

/* Petits constructeurs DOM : tout ce qui s'affiche ici passe par textContent,
   jamais par innerHTML — les montants viennent de la saisie de l'utilisateur. */
const noeud = (balise, classe, texte) => {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
};
const pourcent = (x) => `${Math.round(x * 100)} %`;
const parMois = (v) => `${euros.format(v)}/mois`;

/**
 * Le bandeau profil : résumé replié, total de l'effort, retour immédiat sur
 * les revenus, et — une fois le parcours complet — le face-à-face avec le
 * projet. Aucune règle de calcul ici : tout vient de `resultat`.
 */
function afficherProfil(resultat) {
  const e = resultat.entrees;
  const profil = lireProfil();

  // --- Résumé du bandeau replié ------------------------------------------
  const item = (mot, valeur, detail) => {
    const s = noeud('span', 'profil__item');
    s.append(noeud('span', 'profil__mot', mot), valeur);
    if (detail) s.append(noeud('span', 'profil__detail', detail));
    return s;
  };
  const resume = [
    item('Patrimoine', euros.format(e.capitalInitial)),
    item('Effort', parMois(e.enveloppeMensuelle),
      `(loyer ${euros.format(profil.loyerActuel)} + épargne ${euros.format(profil.epargneActuelle)})`),
  ];
  if (e.revenusFoyer > 0) {
    resume.push(item('Revenus', parMois(e.revenusFoyer), `· effort ${pourcent(resultat.partEffortActuel)}`));
  }
  $('#profilResume').replaceChildren(...resume);

  // L'effort, projet par projet : sous la saisie, bandeau ouvert ou replié.
  afficherEgal(resultat);

}

/**
 * L'effort, projet par projet, dans le profil. Appelé à chaque rafraîchissement,
 * parcours complet ou non — c'est ce qui le distingue d'un résultat de la
 * visualisation.
 *
 * Deux temps :
 * - profil seul : la location montre ce que l'utilisateur a saisi (loyer
 *   actuel, épargne) ; l'achat attend la simulation, des traits le disent ;
 * - parcours complet : les deux projets de la COMPARAISON, première année
 *   ramenée au mois. « Logement » côté achat : mensualité, assurance, charges
 *   de copropriété et taxe foncière.
 * Aucun chiffre d'achat avant la fin du parcours : la page n'affiche pas de
 * résultat calculé sur des valeurs que l'utilisateur n'a pas posées.
 */
function afficherEgal(resultat) {
  // Rien avant la validation du profil : à la première saisie, il n'y a que
  // les trois questions et leurs quatre champs.
  $('#egal').hidden = !profilValide;
  if (!profilValide) {
    delete $('#visu').dataset.question;
    if (questionOuverte()) fermerQuestion();
    return;
  }
  const e = resultat.entrees;
  const complet = parcoursComplet();
  const an1 = resultat.annees[0];
  const profil = lireProfil();

  const location = complet
    ? { logement: an1.loyerAnnuel / 12, investi: an1.surplusLocataire / 12, total: an1.enveloppeLocation / 12 }
    : { logement: profil.loyerActuel, investi: profil.epargneActuelle, total: e.enveloppeMensuelle };
  $('#egalTotalLocation').textContent = parMois(location.total);
  $('#egalLoyer').textContent = euros.format(location.logement);
  $('#egalInvestiLocation').textContent = euros.format(Math.max(location.investi, 0));

  const blocAchat = $('#egalAchat');
  blocAchat.dataset.etat = complet ? 'pret' : 'attente';
  if (complet) {
    $('#egalTotalAchat').textContent = parMois(an1.enveloppeAchat / 12);
    $('#egalLogement').textContent = euros.format(an1.totalDebourseAnnuel / 12);
    $('#egalInvestiAchat').textContent = euros.format(Math.max(an1.surplusProprio / 12, 0));
  } else {
    $('#egalTotalAchat').textContent = '';
    $('#egalLogement').textContent = '—';
    $('#egalInvestiAchat').textContent = '—';
  }

  // Taux d'endettement : un chiffre, sans commentaire, une fois le prêt connu.
  $('#egalLigneEndettement').hidden = !(complet && e.revenusFoyer > 0);
  if (complet && e.revenusFoyer > 0) $('#egalEndettement').textContent = pourcent(resultat.tauxEndettement);

  if (complet) {
    afficherQuestion(resultat);
  } else {
    // Pas de simulation, pas de supplément à interroger.
    $('#egalChoix').hidden = true;
    delete $('#visu').dataset.question;
    if (questionOuverte()) fermerQuestion();
  }

  const alerte = $('#alerteApport');
  alerte.hidden = !complet || e.apport <= e.capitalInitial;
  if (!alerte.hidden) {
    alerte.textContent =
      `L'apport (${euros.format(e.apport)}) dépasse votre patrimoine financier ` +
      `(${euros.format(e.capitalInitial)}) : le portefeuille de l'acheteur partirait en ` +
      'négatif. Réduisez l\'apport, ou corrigez votre patrimoine.';
  }
}

/* ----------------------------------------------- Question de l'épargne forcée */

/**
 * L'utilisateur a-t-il déjà répondu ? État de SESSION (rangé dans
 * `avancement`), pas du projet : la réponse elle-même est un paramètre
 * (`locatairePlaceDifference`), le fait d'y avoir répondu non.
 */
let epargneForceeRepondue = false;
/** La bulle a été rouverte par « Pourquoi ? » : elle se ferme alors librement. */
let questionLibre = false;
const questionOuverte = () => !$('#question').hidden;

/**
 * Le cas qui fait toute la différence : l'achat demande plus que l'effort
 * d'aujourd'hui. Sans supplément, pas d'épargne forcée, et la question n'a pas
 * d'objet — on ne la pose pas.
 *
 * Avec un supplément : la bulle surgit UNE fois et impose un choix ; ensuite il
 * ne reste qu'une petite ligne sous « À effort égal ».
 */
function afficherQuestion(resultat) {
  const supplement = resultat.supplementAchat;
  const aPoser = supplement >= 1;
  const place = resultat.entrees.locatairePlaceDifference;

  $('#egalChoix').hidden = !aPoser;
  // Le verdict dépend de la réponse : tant qu'elle manque, il reste masqué.
  $('#visu').dataset.question = aPoser && !epargneForceeRepondue ? 'attente' : 'repondue';

  if (!aPoser) {
    if (questionOuverte()) fermerQuestion();
    return;
  }

  const montant = euros.format(supplement);
  $('#egalSupplement').textContent = `+${montant}`;
  for (const b of document.querySelectorAll('.egal__reponse')) {
    b.setAttribute('aria-pressed', String((b.dataset.reponse === 'oui') === place));
  }

  $('#questionSupplement').textContent = montant;
  $('#questionTexte').textContent =
    `Le crédit, les charges et la taxe foncière coûtent ${euros.format(resultat.coutMensuelProprio)} ` +
    `par mois, pour un effort d'aujourd'hui de ${euros.format(resultat.entrees.enveloppeMensuelle)}. ` +
    "En achetant, vous n'aurez pas le choix : la banque prélève. En restant locataire, rien ne vous y oblige.";
  $('#questionDemande').textContent =
    `En restant locataire, placeriez-vous aussi ces ${montant} chaque mois ?`;

  // Une seule fois, et jamais par-dessus une bulle en cours de saisie.
  if (!epargneForceeRepondue && !questionOuverte() && bulleZoomee === null) ouvrirQuestion(false);
}

/**
 * @param {boolean} libre - rouverte à la demande : voile et Échap la
 *   referment. À la première apparition, seul un choix la ferme.
 */
function ouvrirQuestion(libre) {
  questionLibre = libre;
  $('#voileQuestion').hidden = false;
  const q = $('#question');
  q.hidden = false;
  q.querySelector('.question__reponse').focus();
}

/**
 * La bulle redescend vers la petite ligne qui la remplace : l'œil suit, et
 * sait où retrouver le choix. Animation par transformation seule.
 */
function fermerQuestion() {
  const q = $('#question');
  const cible = $('#egalChoix');
  $('#voileQuestion').hidden = true;
  let fait = false;
  const fin = () => {
    if (fait) return;
    fait = true;
    q.hidden = true;
    const choisi = cible.querySelector('.egal__reponse[aria-pressed="true"]');
    if (choisi && !cible.hidden) choisi.focus({ preventScroll: true });
  };
  const depart = q.getBoundingClientRect();
  const arrivee = cible.hidden ? null : cible.getBoundingClientRect();
  const sansMouvement = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!arrivee || !depart.width || sansMouvement || typeof q.animate !== 'function') return fin();
  const dx = arrivee.left + arrivee.width / 2 - (depart.left + depart.width / 2);
  const dy = arrivee.top + arrivee.height / 2 - (depart.top + depart.height / 2);
  const echelle = Math.max(arrivee.width / depart.width, 0.2);
  q.animate(
    [
      // Le centrage passe par la propriété `translate` (CSS), indépendante de
      // `transform` : on n'anime ici que le déplacement vers la petite ligne.
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, opacity: 0 },
    ],
    { duration: 380, easing: 'cubic-bezier(.4, 0, .2, 1)' }
  ).onfinish = fin;
  // Filet : un onglet en arrière-plan suspend les animations, et `onfinish`
  // n'arriverait jamais — la bulle resterait affichée, déjà répondue.
  setTimeout(fin, 450);
}

/**
 * Une réponse, d'où qu'elle vienne (bulle ou petite ligne). La case à cocher
 * reste l'état : on la règle, puis on la laisse émettre ses événements comme
 * si on l'avait cochée — mémoire de l'écart, recalcul, sauvegarde.
 */
function repondre(place) {
  const caseEtat = $('#locatairePlaceDifference');
  const change = caseEtat.checked !== place;
  if (questionOuverte()) fermerQuestion();
  if (change) {
    caseEtat.checked = place;
    caseEtat.dispatchEvent(new Event('input', { bubbles: true }));
    caseEtat.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Marqué APRÈS le recalcul : à la première réponse, le verdict n'avait
  // jamais été montré, dire « il a bougé de… » n'aurait aucun sens.
  const premiere = !epargneForceeRepondue;
  epargneForceeRepondue = true;
  if (premiere || !change) {
    rafraichir();
    enregistrerBrouillon();
  }
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
      // Un taux piloté par un scénario reste verrouillé, même dans une bulle
      // validée : sinon `majBulles` le rouvrirait à chaque recalcul.
      const pilote = scenarioActif && TAUX_SCENARISES.includes(champ.id);
      champ.disabled = pilote || (!estValidee && n !== bulleZoomee);
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
  // `n === null` arriverait si le voile était cliqué sans bulle ouverte : on
  // ajouterait `null` aux bulles validées et `bulle(null)` casserait.
  if (n === null || bulleZoomee !== n) return;
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
  // Le voile sert deux fenêtres : l'aperçu de scénario et la bulle zoomée.
  // Le voile sert trois vues : l'explication, l'aperçu et la bulle zoomée.
  $('#voile').addEventListener('click', () => {
    if (apercuOuvert()) return fermerApercu();
    if (introOuverte()) return fermerIntro();
    if (bulleZoomee !== null) validerBulle(bulleZoomee);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Choix obligatoire : Échap ne ferme la question que rouverte à la demande.
    if (questionOuverte()) { if (questionLibre) fermerQuestion(); return; }
    if (apercuOuvert()) return fermerApercu();
    if (introOuverte()) return fermerIntro();
    if (bulleZoomee !== null) validerBulle(bulleZoomee);
  });

  majBulles();
}

/* ------------------------------------------------------------ Saisie */

/**
 * Cliquer dans un champ de nombre en sélectionne le contenu : on écrit le
 * nouveau montant par-dessus, sans avoir à effacer l'ancien. C'est le geste
 * central du simulateur — on passe son temps à remplacer des valeurs, pas à
 * les corriger caractère par caractère.
 *
 * Deux subtilités :
 * - `.champ` est un `<label>` qui enveloppe son champ. Un clic n'importe où
 *   sur la case est donc déjà transmis au champ par le navigateur ; il ne
 *   reste qu'à sélectionner. C'est aussi pour cela qu'on ne sélectionne qu'au
 *   `click`, après le `mouseup` : sélectionner au `focus` seul ne tiendrait
 *   pas, le clic qui vient de donner le focus replace le curseur juste après.
 * - Une fois dans le champ, un SECOND clic doit pouvoir placer le curseur pour
 *   retoucher un chiffre. On ne sélectionne donc qu'à l'entrée dans le champ,
 *   pas à chaque clic.
 */
function initialiserSaisie() {
  let entrant = null;

  document.addEventListener('focusin', (e) => {
    if (!e.target.matches('.champ input[type="number"]')) return;
    entrant = e.target;
    e.target.select();          // suffit pour une arrivée au clavier (Tab)
  });

  // Arrivée à la souris : le clic a replacé le curseur, on resélectionne.
  document.addEventListener('click', (e) => {
    if (e.target !== entrant) return;
    e.target.select();
    entrant = null;
  });

  document.addEventListener('focusout', () => { entrant = null; });
}

function initialiser() {
  remplirFormulaire(VALEURS_DE_TRAVAIL);
  remplirProfil(Sauvegarde.DEFAUTS_PROFIL);
  remplirFormulaireMel();
  initialiserSaisie();
  initialiserDetail();
  construireScenarios();
  $('#formulaire').addEventListener('input', recalculer);
  // Le profil vit hors du plateau : sans son propre écouteur, l'éditer ne
  // recalculerait rien avant le clic sur « Valider mon profil ».
  $('#profil').addEventListener('input', recalculer);

  $('#horizon').addEventListener('input', rafraichir);
  // Deux contrôles, un seul état : le rappel écrit dans le curseur principal,
  // qui reste la source de vérité. Jamais deux dates à l'écran.
  $('#horizonBis').addEventListener('input', () => {
    $('#horizon').value = $('#horizonBis').value;
    rafraichir();
  });
  $('#reinitialiser').addEventListener('click', () => {
    remplirFormulaire(VALEURS_DE_TRAVAIL);
    remplirProfil(Sauvegarde.DEFAUTS_PROFIL);
    $('#horizon').value = 20;
    validees.clear();
    profilValide = false;
    epargneForceeRepondue = false;
    if (questionOuverte()) fermerQuestion();
    scenarioActif = null;
    hypothesesUtilisateur = null;
    scenariosDecouverts = false;
    appliquerScenario('');
    ouvrirProfil();
    majBulles();
    // Réinitialiser, c'est repartir de zéro : le brouillon part avec.
    Sauvegarde.effacer();
    direBrouillon('');
    recalculer();
  });

  $('#profilValider').addEventListener('click', figerProfil);
  $('#profilModifier').addEventListener('click', ouvrirProfil);

  // La case reçoit l'événement AVANT le bandeau qui l'écoute par propagation :
  // on mémorise ici l'écart affiché, pour dire ensuite de combien il a bougé.
  // Les réponses : dans la bulle comme dans la petite ligne.
  for (const b of document.querySelectorAll('[data-reponse]')) {
    b.addEventListener('click', () => repondre(b.dataset.reponse === 'oui'));
  }
  // « Pourquoi ? » rouvre la bulle, qui se ferme alors librement.
  $('#questionRouvrir').addEventListener('click', () => ouvrirQuestion(true));
  $('#voileQuestion').addEventListener('click', () => { if (questionLibre) fermerQuestion(); });

  $('#locatairePlaceDifference').addEventListener('input', () => {
    const horizon = parseInt($('#horizon').value, 10);
    ecartAvantBascule = parcoursComplet() && dernierResultat && epargneForceeRepondue
      ? dernierResultat.annees[horizon - 1].ecart
      : null;
  });

  initialiserBulles();

  // Divulgation progressive : le module n'existe qu'après un clic explicite.
  $('#melOuvrir').addEventListener('click', () => {
    $('#melPanneau').hidden = false;
    $('#melOuvrir').hidden = true;
    $('#melOuvrir').setAttribute('aria-expanded', 'true');
    $('#melAnneeBascule').focus();
    recalculer();
  });
  $('#melFermer').addEventListener('click', () => {
    $('#melPanneau').hidden = true;
    $('#melOuvrir').hidden = false;
    $('#melOuvrir').setAttribute('aria-expanded', 'false');
    recalculer();
  });
  // `recalculer` et non plus `rafraichir` : le loyer payé après la bascule
  // peut relever l'enveloppe du moteur de base (voir `recalculer`).
  $('#melFormulaire').addEventListener('input', recalculer);

  // En dernier : la restauration écrase les défauts et l'état du parcours.
  initialiserBrouillon();

  recalculer();
}

initialiser();

})();
