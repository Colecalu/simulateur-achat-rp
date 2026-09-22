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
- **Le capital initial et l'enveloppe mensuelle ne changent pas l'écart**, seulement les niveaux :
  un euro de plus alimente les deux portefeuilles à l'identique et subit la même fiscalité, donc
  il s'annule dans la différence (tant qu'aucun surplus n'est plafonné à zéro, ce qui n'arrive que
  hors du domaine finançable). Un test verrouille cette propriété. Conséquence produit : le profil
  détermine la **faisabilité** et les niveaux, pas la réponse.
- Le **salaire net est facultatif** et n'entre dans aucun calcul patrimonial. Il ne sert qu'aux
  indicateurs `tauxEndettement` (mensualité assurance comprise / salaire, plafond usuel 35 %) et
  `partEnveloppe`. Non renseigné, les deux valent `null` — jamais un ratio inventé.

## Design (branche design-v2)

**Le thème de référence est Perron.** C'est le seul sur lequel on travaille. `theme-foret.css`
est **gelé** : conservé tel quel comme point de comparaison, jamais mis à jour, jamais à vérifier.
Ne pas y passer de temps. Voir [docs/design/README.md](docs/design/README.md) pour les sources et
les écarts assumés.

- **`frontend/css/style.css` ne contient que de la structure.** Aucun `#hex`, aucun nom de pas
  de rampe (`--clay-500`, `--green-700`), aucune police, aucun rayon, aucune ombre : uniquement
  des noms sémantiques français (`--plan`, `--encre`, `--accent`, `--achat`, `--rayon-large`…).
- **`frontend/css/theme-perron.css` (défaut) et `theme-foret.css` ne contiennent que des
  valeurs** : les rampes du design recopiées, ses polices importées, puis les noms sémantiques
  qui pointent dessus. Aucune règle de mise en page.
- Si un rôle manque, l'ajouter à **`theme-perron.css`** plutôt que d'écrire une couleur dans
  `style.css`. Forêt étant gelé, il peut manquer le rôle et retomber en valeur par défaut : c'est
  accepté, on ne le rattrape pas.
- C'est cette indirection qui permet au JavaScript, qui lit `--achat` et `--location` pour
  colorer les courbes, de rester inchangé quel que soit le thème.
- **Thème clair uniquement** : aucun des deux designs ne fournit de palette sombre, et les
  verts y sont trop désaturés pour qu'on en dérive deux séries distinguables sous daltonisme.
- Le sélecteur en bas de page (`.bascule`, `initialiserBascule()`) est un **outil de
  comparaison, pas une fonctionnalité** : il remplace le `href` de `<link id="theme">` puis
  appelle `rafraichir()` sur l'événement `load` de la nouvelle feuille — sinon les graphiques
  gardent l'ancienne palette. À retirer une fois le design arrêté.
- Écart corrigé dans Perron : le design impose terre cuite contre olive, mais `clay-500` contre
  `olive-500` mesure ΔE 10,5 en vision normale et 3,8 en deutéranopie — deux courbes confondues.
  L'olive des séries est descendu à `--olive-700`, **un pas de sa propre rampe** (ΔE 20,7 / 13,9).
  Ne pas le remonter sans refaire la mesure.

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
- L'encadré de verdict est réduit au strict nécessaire : le curseur d'horizon, le chiffre, et une
  seule ligne qui dit ce que ce chiffre mesure. Ne pas y réintroduire de commentaire.
- **Aucun résultat n'est affiché tant que le profil et les quatre bulles ne sont pas validés.** Tous les champs
  ont une valeur par défaut, donc le moteur sait toujours calculer — mais afficher ce calcul
  donnerait à une hypothèse l'allure d'une réponse à une question que l'utilisateur n'a pas encore
  posée. `majAttente()` bascule `#visu` entre `data-etat="attente"` (carte d'attente + jauge de
  progression) et `data-etat="pret"`. Les graphiques sont **créés seulement une fois la zone
  visible**, et `resize()` est rappelé au passage attente → prêt : un canevas dimensionné dans un
  conteneur masqué reste à zéro.
- **Le profil est un bandeau, pas une bulle.** Il décrit l'utilisateur (patrimoine financier,
  effort mensuel, salaire net facultatif), pas le projet : saisi une fois, il ne varie pas d'une
  simulation à l'autre. Il vit hors du parcours numéroté, se replie sur une ligne une fois validé
  et reste modifiable en un clic. Tant qu'il n'est pas validé, le plateau est grisé et inerte
  (`.plateau--bloque`). Le jour où les comptes utilisateurs arrivent, c'est ce bandeau qui se
  sauvegarde dans le profil tandis que les bulles deviennent des simulations enregistrables.
- **Les champs du profil vivent hors de `#formulaire`** : `#profil` a donc son propre écouteur
  `input`, sans quoi les éditer ne recalculerait rien avant le clic sur « Valider mon profil ».
- La saisie se fait dans un **plateau de quatre bulles** autour de la visualisation : deux en haut
  (leur largeur cumulée = celle de la visualisation), deux à gauche (visibles sans défilement sur
  un écran d'ordinateur). Les hauteurs sont **bornées** (`grid-auto-rows` en haut,
  `grid-template-rows: repeat(2, 1fr)` à gauche) : une bulle qui s'étire pousserait toute la mise
  en page.
  1. L'opération · 2. Le financement · 3. Les dépenses annuelles (charges du propriétaire **et**
  loyer du locataire) · 4. Le scénario de marché (rendement, fiscalité et toutes les
  revalorisations).
  La bulle 4 est destinée à devenir un **filtre de scénarios** (optimiste / moyen / pessimiste,
  adossés à des séries historiques réelles) appliqué par-dessus le reste du modèle : y regrouper
  toutes les hypothèses d'évolution est délibéré.
- **Premier passage strictement séquentiel** : seule la bulle suivante est ouvrable, les autres
  sont grisées et leurs champs `disabled`. Un clic ouvre la bulle en grand au centre, avec ses
  libellés longs et ses textes d'aide.
- **Une fois validée, une bulle reste modifiable sur place.** Faire varier une hypothèse sans
  ouvrir de fenêtre est l'essence du simulateur — c'est non négociable. Les champs y sont
  dépouillés de tout habillage (bordure, fond, remplissage) pour se lire comme du texte : c'est
  ce chrome, et non la taille de police, qui les rendait illisibles à cette échelle.
- **Tous les champs ne se valent pas.** Un paramètre mérite une place à l écran en proportion de
  la fréquence à laquelle on y touche. Les champs marqués `data-role="reglage"` (frais d agence,
  frais bancaires, assurance emprunteur, revalorisation des charges et de la taxe foncière,
  fiscalité des plus-values) sont nécessaires au calcul mais fixés une fois : ils disparaissent de
  la bulle repliée et ne vivent que dans la vue zoomée. La règle CSS doit exclure `.bulle--zoom`,
  sinon une bulle validée puis rouverte les masquerait aussi.
- **Tous les champs visibles ont le même traitement** : aucun n'est mis en avant. Une ligne par champ,
  libellé à gauche, valeur à droite. Le nombre de colonnes est déclaré par bulle
  (`data-colonnes`) et les rangées se partagent toute la hauteur (`grid-auto-rows: 1fr`) : pas
  d'espace mort en bas de bulle. Les libellés courts sont calibrés pour tenir dans une cellule
  à deux colonnes (~8 caractères) ; vérifier après tout changement qu'aucun
  `.champ__court` n'a `scrollWidth > getBoundingClientRect().width`.
- **Vue zoomée : deux colonnes fixes, pas de texte d aide.** Les `.champ__aide` sont masqués
  (`display: none`, le texte reste en HTML) : des cellules de hauteurs inégales cassaient
  l alignement des rangées. Avec deux colonnes et aucune aide, six champs tombent sur trois
  rangées au pas régulier.
- Un libellé est un conteneur **flex** : l espace qui précède un `<em>` y est supprimé. Écrire
  `&nbsp;` avant la parenthèse, sinon « Frais bancaires(dossier + hypothèque) ».
- Pas d invite écrite sur la bulle à remplir : l anneau bleu et le numéro coloré suffisent.
- Les libellés existent en deux versions : long (`.champ__libelle`, vue zoomée) et court
  (`.champ__court`, bulle repliée), tous deux écrits en HTML.
- Toute modification de densité se revérifie en mesurant le jeu
  `hauteur de bulle − (en-tête + contenu + padding)` : il doit rester positif, sinon
  `overflow: hidden` coupe silencieusement la dernière ligne. Un `overflow-y: auto` sert de
  filet — sur un écran de 768 px de haut, la bulle 5 l'utilise, ce qui est le comportement voulu.
- Dans les règles de densité, **l'ordre compte** : `.champ input` et `.champ--cle input` ont la
  même spécificité, donc la règle générique doit toujours précéder celle du champ dominant.
- **La bulle zoomée sort de son alvéole et va sous `<body>`** le temps du zoom, puis y retourne.
  Le rail de gauche est en `position: sticky`, et sticky crée **toujours** un contexte
  d'empilement, même sans `z-index`. Une bulle qui y reste ne peut donc pas passer au-dessus du
  voile quel que soit son `z-index` : les bulles 3 et 4 s'ouvraient bien au centre, mais sous
  l'écran grisé, bouton « Valider » hors d'atteinte. Les bulles 1 et 2, qui vivent dans
  `.plateau__haut` (non sticky), n'étaient pas touchées — d'où un bug qui n'apparaissait qu'à
  mi-parcours. Le symptôme se reproduit en mesurant
  `document.elementFromPoint()` au centre du bouton : il doit renvoyer le bouton, pas `.voile`.
  Ne pas « corriger » cela en remontant le `z-index`, cela ne peut pas marcher.
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
