# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes

```bash
node --test tests/calc.test.mjs tests/location.test.mjs   # moteur + mise en location
```

Pas de build : `frontend/` est servi tel quel. Pour un aperçu local,
`npx http-server frontend -p 4173 -c-1` (configuration dans `.claude/launch.json`).

## Contexte

Simulateur web comparant l'achat d'une résidence principale (RP) à la location, à partir d'une
**enveloppe budgétaire globale identique** (logement + épargne) répartie différemment selon les
deux trajectoires.

## Stack technique

- **Frontend** : HTML/CSS/JavaScript vanilla — pas de framework avec build tool, pour rester
  déployable tel quel sur un hébergement mutualisé sans étape de compilation. Toute proposition
  d'outillage (bundler, TypeScript, framework) va à l'encontre de cette contrainte.
- **Graphiques** : Chart.js via CDN.
- **Backend** : PHP (comptes utilisateurs, sauvegarde/chargement de simulations).
- **Base de données** : MySQL.
- **Hébergement** : OVH mutualisé, déploiement FTP/GitHub Actions (à configurer).

Conséquence pratique : pas de `npm install`/`npm run build`. Le code servi est le code du dépôt.

## Logique de calcul

Documentée en détail dans [docs/modele-de-calcul.md](docs/modele-de-calcul.md), classeur de
référence dans `docs/`. En cas de divergence entre le code et l'Excel, l'Excel fait foi — **sauf**
les deux écarts délibérés documentés en fin de ce fichier (comparaison net/net, et refus de
trancher quand l'enveloppe est insuffisante).

Tout changement du moteur doit laisser `node --test tests/calc.test.mjs` au vert : la fixture
contient les valeurs réellement calculées par Excel sur 25 ans.

- Enveloppe globale mensuelle fixe, répartie en mensualité + charges (achat) ou loyer (location).
  Le surplus de chaque côté est investi en bourse.
- Rendement bourse saisi en **brut**, pas net d'impôt.
- Fiscalité de sortie sur plus-values : taux **éditable par l'utilisateur**, défaut 31,4 %
  (flat tax CTO 2026). Ne pas coder ce taux en dur — PEA et assurance-vie ont d'autres taux.
- Frais de notaire : formule différenciée **Ancien / Neuf**.
- Patrimoine net immobilier = valeur du bien − capital restant dû.
- La comparaison finale est toujours **nette d'impôt des deux côtés**.

## Conventions

- Interface, labels, noms de variables, de fonctions et de classes CSS **en français**.
- JS en `camelCase`, classes CSS en `bloc__element--modificateur`.
- `frontend/js/calc.js` est un module **pur** : aucune logique financière ailleurs, aucun accès
  au DOM dedans. C'est ce qui permet de le tester sous Node et de le réutiliser côté PHP plus tard.
- `frontend/js/calc-location.js` (extension « mise en location ») **consomme** la sortie de
  `calc.js` et ne la modifie jamais. Toute nouvelle variante de scénario suit ce patron :
  un module isolé qui lit le résultat de base, pas une réécriture du moteur.
- **Pas de modules ES** (`import`/`export`, `<script type="module">`). Ils sont bloqués par CORS
  en `file://`, ce qui rend la page totalement inerte quand on l'ouvre par double-clic. Les
  scripts sont donc classiques, encapsulés en IIFE ; `calc.js` s'expose en `window.SimuRP` côté
  navigateur et en `module.exports` côté Node. `calc.js` doit être chargé **avant** `app.js`.
- Les taux se saisissent en pourcentage à l'écran et se stockent en fraction dans le modèle
  (conversion dans `app.js`, jamais dans `calc.js`).
- **Une seule visualisation par défaut** : le graphique du patrimoine net d'impôt et l'encadré
  « si vous revendez dans… ». Le module de mise en location reste masqué jusqu'à un clic. Cette
  sobriété est un choix assumé — ne pas rajouter d'indicateurs ou de graphiques sans demande
  explicite.
- La saisie se fait dans un **plateau de six bulles** autour de la visualisation : deux en haut
  (leur largeur cumulée = celle de la visualisation), quatre à gauche (toutes visibles sans
  défilement sur un écran d'ordinateur). Les hauteurs sont **bornées** (`grid-auto-rows` en haut,
  `grid-template-rows: repeat(4, 1fr)` à gauche) et chaque bulle défile en interne : une bulle
  qui s'étire pousserait toute la mise en page.
- Au repos, une bulle affiche un **gros numéro centré** avec son titre dessous, et le
  déclencheur (`.bulle__declencheur`) couvre toute la bulle : elle est cliquable partout.
  Une fois validée, ce même déclencheur redevient une ligne d'en-tête et laisse la place aux
  champs.
- **Une bulle repliée AFFICHE, elle n'édite pas.** Elle montre un résumé en texte : une
  étiquette, un chiffre dominant en grand (`data-cle`), puis deux ou trois valeurs secondaires
  en discret (`data-resume`), rendus par `contenuResume()`. Toute la saisie se fait dans la vue
  zoomée, qu'un clic n'importe où sur la bulle rouvre. Faire tenir des champs éditables dans
  130 px de haut a été essayé : bordures, remplissage et largeur minimale rendent le résultat
  illisible.
- Les libellés existent en deux versions : long (`.champ__libelle`, vue zoomée) et court
  (`.champ__court`, résumés), tous deux écrits en HTML.
- Toute modification de densité se revérifie en mesurant le jeu
  `hauteur de bulle − (en-tête + contenu + padding)` : il doit rester positif, sinon
  `overflow: hidden` coupe silencieusement la dernière ligne, sans barre pour le signaler.
- **Premier passage strictement séquentiel** : seule la bulle suivante est ouvrable, les autres
  sont grisées et leurs champs `disabled`. Une fois validée, une bulle devient modifiable sur
  place, sans rejouer le zoom.
- Le zoom au centre est une animation **FLIP** (`volerVers()`) : on mesure avant, on applique la
  classe, on mesure après, on joue l'écart à l'envers. Toute animation en cours sur l'élément est
  annulée avant d'en lancer une nouvelle. Le contenu n'apparaît qu'après le voyage, sinon la mise
  à l'échelle le déformerait.
- **Pas de `<form>` imbriqué** : le plateau est un `<div>`, car il contient le `<form>` du module
  de mise en location. Deux formulaires imbriqués sont invalides et le parseur supprime
  silencieusement la balise interne.

## Workflow Git

- Développement sur branches de feature, **jamais directement sur `main`**.
- Merge sur `main` = déclenche le déploiement automatique vers OVH (à configurer).
