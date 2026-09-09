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
  const achatGagne = ecart >= 0;

  $('#horizonLabel').textContent = `${horizon} an${horizon > 1 ? 's' : ''}`;

  const chiffre = $('#verdictChiffre');

  // Enveloppe insuffisante : le modèle plafonne les deux épargnes à zéro et
  // ne facture nulle part le déficit du propriétaire. L'écart calculé serait
  // flatteur pour l'achat sans rien vouloir dire — on refuse de le trancher.
  if (!resultat.enveloppeSuffisante) {
    chiffre.textContent = '—';
    chiffre.className = 'verdict__chiffre verdict__chiffre--indecis';
    $('#verdictPhrase').textContent =
      'Impossible de comparer : votre enveloppe ne finance pas le scénario d\'achat.';
    $('#verdictDetail').textContent =
      `Il manque ${eurosPrecis.format(
        resultat.coutMensuelProprio - resultat.entrees.enveloppeMensuelle
      )} par mois la première année. Ajustez l'enveloppe, le prix du bien, l'apport ` +
      'ou la durée du crédit pour obtenir une comparaison valable.';
    return;
  }

  chiffre.textContent = signe(ecart);
  chiffre.className = 'verdict__chiffre ' +
    (achatGagne ? 'verdict__chiffre--achat' : 'verdict__chiffre--location');

  // Sous ~1 % du patrimoine comparé, l'écart n'est pas un signal exploitable.
  const reference = Math.max(ligne.patrimoineTotalAchat, ligne.patrimoineTotalLocation);
  const negligeable = Math.abs(ecart) < reference * 0.01;

  if (negligeable) {
    $('#verdictPhrase').textContent =
      'Les deux scénarios se valent : l\'écart est dans le bruit des hypothèses.';
  } else {
    $('#verdictPhrase').textContent = achatGagne
      ? `Acheter vous laisse ${euros.format(Math.abs(ecart))} de patrimoine en plus qu'en restant locataire.`
      : `Rester locataire vous laisse ${euros.format(Math.abs(ecart))} de patrimoine en plus qu'en achetant.`;
  }

  const bascule = resultat.premiereAnneeFavorable;
  const detail = [];
  detail.push(
    `Achat : ${euros.format(ligne.patrimoineTotalAchat)} ` +
    `(${euros.format(ligne.patrimoineNetImmo)} de bien net de dette ` +
    `+ ${euros.format(ligne.capitalAchatNet)} de portefeuille). ` +
    `Location : ${euros.format(ligne.patrimoineTotalLocation)} de portefeuille.`
  );
  if (bascule === null) {
    detail.push('Sur 25 ans, la location reste devant à chaque échéance.');
  } else if (bascule === 1) {
    detail.push('L\'achat est devant dès la première année.');
  } else {
    detail.push(`L\'achat repasse devant la location à partir de l\'année ${bascule}.`);
  }
  $('#verdictDetail').textContent = detail.join(' ');
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

  majRail();
  afficherAlerte(dernierResultat);
  afficherVerdict(dernierResultat, horizon);
  dessinerGraphiques(dernierResultat, horizon, mel);
  if (mel) afficherTexteMel(mel, horizon);
}

/* -------------------------------------------------- Parcours par étapes */

const etapes = () => [...document.querySelectorAll('.etape')];

/** Étape ouverte en haut de page ; null = parcours terminé, carte repliée. */
let etapeCourante = 1;
/** Étapes déjà parcourues : elles ont leur bulle dans le rail. */
const etapesVues = new Set();

/** Rend une valeur de champ lisible dans une bulle : « 420 000 € », « 3,5 % ». */
function valeurLisible(el) {
  if (el.tagName === 'SELECT') return el.options[el.selectedIndex].text;

  const unite = el.closest('.champ__saisie').querySelector('.champ__unite').textContent.trim();
  const v = parseFloat(el.value);
  if (!Number.isFinite(v)) return '—';

  const periode = unite.includes('/mois') ? '/mois' : unite.includes('/an') ? '/an' : '';
  if (unite.startsWith('€')) return euros.format(v) + periode;
  if (unite.startsWith('%')) {
    return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %' + periode;
  }
  return `${v} ${unite}`;
}

/** Contenu d'une bulle : le titre de l'étape et ses valeurs marquantes. */
function contenuBulle(n) {
  const section = document.querySelector(`.etape[data-etape="${n}"]`);
  const titre = section.querySelector('.etape__titre').textContent;
  const ids = (section.dataset.resume || '').split(',').filter(Boolean);

  const lignes = ids.map((id) => {
    const el = document.getElementById(id);
    const libelle = el.closest('.champ').querySelector('.champ__libelle').textContent;
    return `<span class="bulle__ligne">
        <span class="bulle__libelle" title="${libelle}">${libelle}</span>
        <span class="bulle__valeur">${valeurLisible(el)}</span>
      </span>`;
  });

  return `<span class="bulle__entete"><span class="bulle__coche" aria-hidden="true"></span>
      <span class="bulle__titre">${titre}</span></span>${lignes.join('')}`;
}

/**
 * Met le rail à jour. Les bulles existantes sont rafraîchies sur place ; seules
 * les nouvelles sont animées, sinon l'animation rejouerait à chaque frappe.
 */
function majRail() {
  const rail = $('#rail');
  const rangs = [...etapesVues].sort((a, b) => a - b);

  for (const n of rangs) {
    let bulle = rail.querySelector(`[data-bulle="${n}"]`);
    const nouvelle = !bulle;

    if (nouvelle) {
      bulle = document.createElement('button');
      bulle.type = 'button';
      bulle.className = 'bulle';
      bulle.dataset.bulle = n;
      bulle.addEventListener('click', () => allerEtape(n));

      // Insertion directement à sa place : on peut sauter d'étape, et un
      // déplacement de nœud après coup annulerait l'animation en cours.
      const apres = rangs
        .filter((r) => r > n)
        .map((r) => rail.querySelector(`[data-bulle="${r}"]`))
        .find(Boolean);
      rail.insertBefore(bulle, apres || null);
    }

    bulle.innerHTML = contenuBulle(n);
    bulle.classList.toggle('bulle--active', n === etapeCourante);

    if (nouvelle) {
      bulle.classList.add('bulle--entree');
      const nettoyer = () => bulle.classList.remove('bulle--entree');
      bulle.addEventListener('animationend', nettoyer, { once: true });
      // Filet : dans un onglet en arrière-plan l'animation ne tourne pas et
      // `animationend` ne part jamais — la classe resterait collée à la bulle.
      setTimeout(nettoyer, 600);
    }
  }

  // Purge après réinitialisation. Aucune remise en ordre ici : les bulles sont
  // déjà insérées à leur place, et déplacer un nœud casserait son animation.
  for (const bulle of rail.querySelectorAll('.bulle')) {
    if (!etapesVues.has(Number(bulle.dataset.bulle))) bulle.remove();
  }
  rail.hidden = rangs.length === 0;
}

/**
 * Ouvre une étape en haut de page. `null` replie la carte : le parcours est
 * terminé, tout se consulte et se modifie depuis le rail.
 */
function allerEtape(n) {
  const total = etapes().length;
  etapeCourante = n === null ? null : Math.min(Math.max(n, 1), total);
  const termine = etapeCourante === null;

  // Une étape quittée reste acquise : sa bulle ne disparaît plus du rail.
  if (!termine) etapesVues.add(etapeCourante);

  for (const section of etapes()) {
    section.hidden = Number(section.dataset.etape) !== etapeCourante;
  }

  $('#formulaire').classList.toggle('parcours--termine', termine);
  $('#etapePrecedente').hidden = termine;
  $('#etapeSuivante').hidden = termine;
  $('#etapeRouvrir').hidden = !termine;

  for (const puce of document.querySelectorAll('.fil__puce')) {
    const rang = Number(puce.dataset.aller);
    puce.classList.toggle('fil__puce--active', rang === etapeCourante);
    puce.classList.toggle('fil__puce--vue', etapesVues.has(rang) && rang !== etapeCourante);
    puce.setAttribute('aria-current', rang === etapeCourante ? 'step' : 'false');
  }

  if (!termine) {
    $('#etapePrecedente').disabled = etapeCourante === 1;
    $('#etapeSuivante').textContent =
      etapeCourante === total ? 'Terminer ✓' : 'Suivant →';
  }

  majRail();
}

function initialiser() {
  remplirFormulaire(DEFAUTS);
  remplirFormulaireMel();
  $('#formulaire').addEventListener('input', recalculer);
  $('#horizon').addEventListener('input', rafraichir);
  $('#reinitialiser').addEventListener('click', () => {
    remplirFormulaire(DEFAUTS);
    $('#horizon').value = 20;
    etapesVues.clear();
    allerEtape(1);
    recalculer();
  });

  $('#etapePrecedente').addEventListener('click', () => allerEtape(etapeCourante - 1));
  $('#etapeSuivante').addEventListener('click', () => {
    const dernière = etapeCourante === etapes().length;
    allerEtape(dernière ? null : etapeCourante + 1);
  });
  $('#etapeRouvrir').addEventListener('click', () => allerEtape(1));
  for (const puce of document.querySelectorAll('.fil__puce')) {
    puce.addEventListener('click', () => allerEtape(Number(puce.dataset.aller)));
  }
  allerEtape(1);

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

  // Le thème peut changer sans rechargement : on redessine avec les nouveaux jetons.
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => rafraichir());

  recalculer();
}

initialiser();

})();
