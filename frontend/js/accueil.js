/* Interaction éditoriale uniquement : aucun calcul ni stockage. */
(function () {
  'use strict';

  const scene = document.getElementById('theatre');
  const achat = document.getElementById('vueAchat');
  const location = document.getElementById('vueLocation');

  function choisir(louer) {
    scene.classList.toggle('mode-location', louer);
    scene.classList.toggle('mode-achat', !louer);
    achat.setAttribute('aria-pressed', String(!louer));
    location.setAttribute('aria-pressed', String(louer));
    document.getElementById('pointNumero').textContent = louer
      ? 'HISTOIRE B / LOCATAIRE'
      : 'HISTOIRE A / PROPRIÉTAIRE';
    document.getElementById('pointTitre').textContent = louer
      ? 'Une clé.\nEt du capital\nà investir.'
      : 'Une clé.\nEt du capital\ndans les murs.';
    document.getElementById('pointTexte').textContent = louer
      ? 'Vous payez un loyer. Votre capital et ce qui reste disponible peuvent être investis.'
      : 'Vous remboursez votre crédit. Ce qui reste disponible peut aussi être investi.';
  }

  achat.addEventListener('click', () => choisir(false));
  location.addEventListener('click', () => choisir(true));
})();
