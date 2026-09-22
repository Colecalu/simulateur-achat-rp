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
  const SCENARIOS = window.SimuRPScenarios.SCENARIOS;
  const tauxEquivalent = window.SimuRPScenarios.tauxEquivalent;
  const scenarioParCle = window.SimuRPScenarios.parCle;
  const FAMILLES = window.SimuRPScenarios.FAMILLES;
  const scenariosParFamille = window.SimuRPScenarios.parFamille;
  const tauxAnnee = window.SimuRP.tauxAnnee;
  const fraisIrrecuperables = window.SimuRP.fraisIrrecuperables;
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
   */
  const iFrontiere =
    scenarioActif && scenarioActif.reel < resultat.annees.length
      ? scenarioActif.reel - 1
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
        `<span class="legende__item"><span class="pastille" style="background:${p.couleur}"></span>` +
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
  credit: { nom: 'Intérêts et assurance', court: 'Intérêts' },
  capital: { nom: 'Capital remboursé', court: 'Capital' },
  possession: { nom: 'Taxe foncière et charges', court: 'Charges' },
  epargne: { nom: 'Épargne investie', court: 'Épargne' },
  loyers: { nom: 'Loyers', court: 'Loyer' },
  acquisition: { nom: "Frais d'acquisition", court: 'Acquisition' },
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
 * Le choix d'un scénario vit dans UNE fenêtre à deux colonnes : la liste à
 * gauche, l'aperçu du scénario regardé à droite. Empiler deux fenêtres
 * obligerait à fermer l'une pour revenir à l'autre, alors que comparer deux
 * décennies est exactement ce qu'on vient y faire.
 *
 * Regarder et appliquer restent deux gestes : on explore librement, puis on
 * valide. Tant qu'on n'a pas cliqué « Appliquer », rien ne bouge derrière.
 */

/** Scénario actuellement REGARDÉ dans la fenêtre — pas celui qui est appliqué. */
let scenarioVu = null;

const choixOuvert = () => !$('#choix').hidden;

function construireScenarios() {
  const morceaux = [
    '<p class="choix__famille">Votre hypothèse</p>',
    optionChoix({ cle: '', nom: 'Mes hypothèses', periode: null }),
  ];
  for (const famille of FAMILLES) {
    const liste = scenariosParFamille(famille.cle);
    if (!liste.length) continue;
    morceaux.push(`<p class="choix__famille">${famille.nom}</p>`);
    for (const sc of liste) morceaux.push(optionChoix(sc));
  }
  $('#choixListe').innerHTML = morceaux.join('');

  for (const b of document.querySelectorAll('.choix__option')) {
    b.addEventListener('click', () => regarderScenario(b.dataset.scenario));
  }
  $('#scenarioOuvrir').addEventListener('click', ouvrirChoix);
  $('#choixFermer').addEventListener('click', fermerChoix);
  $('#choixAnnuler').addEventListener('click', fermerChoix);
  $('#choixAppliquer').addEventListener('click', () => {
    appliquerScenario(scenarioVu ? scenarioVu.cle : '');
    fermerChoix();
  });
}

function optionChoix(sc) {
  const continu = sc.famille === 'continu' ? ' choix__option--continu' : '';
  const date = sc.periode ? `<span class="choix__periode">${sc.periode}</span>` : '';
  return (
    `<button type="button" class="choix__option${continu}" data-scenario="${sc.cle}" ` +
    'role="radio" aria-checked="false">' +
    `<span class="choix__nom-option">${sc.nom}</span>${date}</button>`
  );
}

/** Affiche un scénario dans la colonne de droite. N'applique rien. */
function regarderScenario(cle) {
  scenarioVu = cle ? scenarioParCle(cle) : null;

  for (const b of document.querySelectorAll('.choix__option')) {
    const vu = b.dataset.scenario === (cle || '');
    b.classList.toggle('choix__option--vu', vu);
    b.setAttribute('aria-checked', String(vu));
  }

  const applique = (scenarioActif ? scenarioActif.cle : '') === (cle || '');
  $('#choixEtat').textContent = applique ? 'Déjà appliqué.' : '';
  $('#choixAppliquer').disabled = applique;

  dessinerApercu(scenarioVu);
}

function ouvrirChoix() {
  $('#choix').hidden = false;
  $('#voile').hidden = false;
  regarderScenario(scenarioActif ? scenarioActif.cle : '');
  // Un canevas dimensionné dans un conteneur masqué reste à zéro.
  if (graphApercu) graphApercu.resize();
}

function fermerChoix() {
  $('#choix').hidden = true;
  if (bulleZoomee === null) $('#voile').hidden = true;
}

/* --- L'aperçu : courbes en base 100, taux annuels, sources ------------- */

let graphApercu = null;

/** « +6 », « −18 », « 0 » — un taux annuel, signe compris, sans le %. */
const tauxSigne = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

function dessinerApercu(sc) {
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

  const series = [
    { champ: 'rendementBourse', nom: 'Marchés actions', couleur: jeton('--courbe-marches') },
    { champ: 'revalBien', nom: "Prix de l'immobilier", couleur: jeton('--courbe-immo') },
    { champ: 'revalLoyer', nom: 'Loyers (IRL)', couleur: jeton('--courbe-loyer'), pointille: true },
  ];
  for (const serie of series) serie.taux = lire(serie.champ);

  $('#apercuTitre').textContent = sc ? sc.nom : 'Mes hypothèses';
  $('#apercuResume').textContent = sc
    ? sc.resume
    : 'Vos taux, appliqués tels quels chaque année. Aucune donnée de marché.';

  // On n'affiche que les années OBSERVÉES, suivies du taux qui prolonge. Lister
  // vingt-cinq valeurs dont quatorze identiques ferait passer un prolongement
  // pour une donnée.
  const reel = sc ? Math.min(sc.reel, horizon) : 0;
  $('#apercuSuites').innerHTML = series
    .map((serie) => {
      let valeurs;
      if (!Array.isArray(serie.taux)) {
        valeurs = `${tauxSigne.format(serie.taux * 100)} chaque année`;
      } else {
        valeurs = serie.taux
          .slice(0, reel)
          .map((t) => tauxSigne.format(t * 100))
          .join(' · ');
        if (reel < horizon) {
          valeurs += ` <b>puis ${tauxSigne.format(serie.taux[reel] * 100)} par an</b>`;
        }
      }
      return (
        '<div class="suite">' +
        `<span class="suite__mot"><span class="pastille" style="background:${serie.couleur}"></span>` +
        `${serie.nom}</span><span class="suite__valeurs">${valeurs}</span></div>`
      );
    })
    .join('');

  const arrivee = (taux) => Math.round(base100(taux)[horizon]);
  $('#apercuNote').textContent =
    `Taux annuels en %. Base 100 au départ : après ${horizon} ans, ` +
    series.map((x) => `${arrivee(x.taux)} pour « ${x.nom} »`).join(', ') +
    '.' +
    (sc && reel < horizon
      ? ` Les ${reel} premières années sont observées ; au-delà, le trait vertical marque le ` +
        'début du prolongement, au rythme moyen de la période.'
      : sc
      ? ' Toutes les années affichées sont observées : aucun prolongement.'
      : '');

  // La provenance est une exigence du pilier : un scénario historique sans
  // source n'est qu'une opinion. Les réserves passent devant les sources —
  // une réserve dit ce qu'on sait de faux, elle ne se range pas en bas de page.
  $('#apercuSources').innerHTML = sc
    ? (sc.reserves || []).map((r) => `<li class="apercu__reserve">${r}</li>`).join('') +
      series
        .filter((x) => sc.sources && sc.sources[x.champ])
        .map((x) => `<li>${x.nom} : ${sc.sources[x.champ]}</li>`)
        .join('')
    : '';

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
  // exactement le nombre d'années observées.
  o.frontiere = sc && reel < horizon ? reel : 0;

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

  graphApercu.resize();
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

  // Ce qui tourne en ce moment, lisible sans ouvrir la fenêtre.
  $('#scenarioActuel').textContent = scenario
    ? scenario.nom + (scenario.periode ? ` · ${scenario.periode}` : '')
    : 'Mes hypothèses';

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
  const observe = sc.periode ? `${sc.reel} années observées (${sc.periode})` : `${sc.reel} années`;
  $('#avertissement').textContent =
    `Scénario « ${sc.nom} » : ${observe}, ` +
    (sc.reel >= 25
      ? "assez pour couvrir tout l'horizon — rien n'est projeté. "
      : `puis une projection au rythme moyen de la période (${(sc.suiteBourse * 100).toFixed(1)} % ` +
        "par an en bourse). Au-delà du trait, les courbes sont pointillées : ce n'est plus une " +
        'donnée. ') +
    commun;
}

function majScenario() {
  const pret = profilValide && validees.size === BULLES.length;
  const carte = $('#scenarioOuvrir');
  carte.classList.toggle('scenario--bloque', !pret);
  carte.disabled = !pret;
  $('#scenarioAccroche').textContent = pret
    ? 'Rejouez une décennie réelle sur votre projet.'
    : 'Disponible une fois votre simulation complète.';
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
  majScenario();
  majAvertissement();
  afficherProfil(dernierResultat);
  if (!majAttente()) return;

  afficherAlerte(dernierResultat);
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
  $('#voile').addEventListener('click', () => {
    if (choixOuvert()) return fermerChoix();
    if (bulleZoomee !== null) validerBulle(bulleZoomee);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (choixOuvert()) return fermerChoix();
    if (bulleZoomee !== null) validerBulle(bulleZoomee);
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
  remplirFormulaire(DEFAUTS);
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
    remplirFormulaire(DEFAUTS);
    $('#horizon').value = 20;
    validees.clear();
    profilValide = false;
    scenarioActif = null;
    hypothesesUtilisateur = null;
    appliquerScenario('');
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
