# Designs « Acheter ou louer » — architecture de thèmes

Deux designs Claude Design sont intégrés et **interchangeables à chaud**, pour
pouvoir les juger sur les mêmes chiffres :

| Thème | Fichier | Source | Palette | Polices |
|---|---|---|---|---|
| **Perron** (défaut) | `frontend/css/theme-perron.css` | `Perron Design System.zip` | terre cuite, olive, papier chaud | Instrument Serif + Geist |
| **Forêt** | `frontend/css/theme-foret.css` | `bundle-claude-design.html` | vert profond, terracotta, crème | Newsreader + IBM Plex |

## Comment c'est découpé

**`style.css` ne contient aucune valeur.** Ni `#hex`, ni nom de pas de rampe
(`--clay-500`, `--green-700`), ni police, ni rayon, ni ombre : uniquement de la
structure écrite en **noms sémantiques français** — `--plan`, `--surface`,
`--encre`, `--accent`, `--achat`, `--rayon-large`, `--ombre-2`…

**Chaque `theme-*.css` ne contient que des valeurs.** Il recopie les rampes de
son design telles quelles, importe ses polices, puis fait pointer les noms
sémantiques vers ces rampes. Aucune règle de mise en page.

Conséquence : changer de design, c'est changer une seule balise `<link>`.
Le JavaScript, qui lit `--achat` et `--location` pour colorer les courbes,
n'a jamais besoin de bouger.

**Règle à tenir** : si un rôle manque, on l'ajoute **aux deux thèmes** plutôt
que d'écrire une couleur dans `style.css`. Une seule fuite suffit à casser la
bascule.

## Le sélecteur

Un commutateur discret en bas à droite (`.bascule`, `initialiserBascule()` dans
`app.js`) remplace le `href` de `<link id="theme">`, mémorise le choix dans
`localStorage`, attend l'événement `load` de la nouvelle feuille puis appelle
`rafraichir()` — sans quoi les graphiques garderaient l'ancienne palette,
puisqu'ils lisent les jetons au moment du dessin.

**C'est un outil de travail, pas une fonctionnalité.** À retirer (HTML, bloc CSS
`.bascule`, `initialiserBascule()`) une fois le design arrêté ; le thème retenu
reste alors simplement chargé en dur.

## Les designs par-dessus la structure, pas à la place

Le plateau de bulles, le bandeau profil, le verrouillage séquentiel, le zoom
FLIP, l'état d'attente et la distinction leviers/réglages sont inchangés dans
les deux thèmes. Aucune ligne du moteur de calcul n'a bougé.

Ce qui est repris d'un design : rampes de couleur, typographie, rayons, ombres,
durées et courbes d'animation, conventions de contrôles (hauteur de bouton et de
champ, anneau de focus, carte qui se soulève au survol).

Ce qui n'est pas repris : la **composition des pages**. Les deux bundles
contiennent des pages de site vitrine (accueil, méthode, guide) avec en-tête
collant et pied de page sombre. Ce ne sont pas le simulateur ; elles restent
disponibles comme référence pour un futur habillage éditorial.

## Écarts assumés par rapport aux designs

### Pas de thème sombre, dans aucun des deux

Ni l'un ni l'autre ne définit de palette sombre, et en dériver une n'est pas
qu'une affaire de goût : sur fond sombre, les deux séries du graphique doivent
rester distinguables, y compris sous daltonisme. Les verts de Forêt sont
volontairement très désaturés (chroma 0,058 à 0,08) et toutes les combinaisons
tirées de ses rampes tombent sous le seuil — jusqu'à ΔE 2,9 en protanopie, deux
courbes impossibles à séparer. Le rétablir demanderait d'ajouter aux designs des
pas qu'ils ne prévoient pas.

### Forêt : le vert de série ne passe pas les seuils d'une palette de données

`green-700` `#1f4d3d` échoue deux contrôles : il sort de la bande de clarté
(L 0,383) et passe sous le plancher de chroma (0,058 — « lit gris »).

**Conservé quand même.** Les contrôles qui décident si deux courbes se
distinguent passent largement : ΔE 14,8 en protanopie, 27,6 en vision normale.
Avec deux séries, une légende et des points repères sur l'année choisie, la
lecture est sans ambiguïté — et la sobriété est le parti pris du design.

### Perron : l'olive des séries a été descendu d'un pas

C'est le seul écart où un design a dû être **corrigé**, pas seulement écarté.

Perron pose « terre cuite contre olive, partout, sans exception ». Mais
`olive-500` `#6E7F58` contre `clay-500` `#A8663F` mesure **ΔE 10,5 en vision
normale** — sous le plancher de 15, donc deux courbes déjà pénibles à séparer
sans aucun trouble de la vision — et **3,8 en deutéranopie**, c'est-à-dire
confondues.

L'arbitrage : garder la terre cuite, qui est la couleur de marque, et déplacer
l'olive vers `--olive-700` `#3F4B33`, **un pas de sa propre rampe**. On reste
donc dans la palette du design. Le couple remonte à ΔE 20,7 en vision normale et
13,9 en protanopie. L'opposition voulue par le design est préservée ; seule son
intensité change.

## Extraire à nouveau les bundles

`bundle-claude-design.html` (auto-extractible, 2,5 Mo dont les binaires de
police) : le manifeste est un JSON `{ uuid: { mime, compressed, data (base64
gzip) } }` sur la ligne qui suit `<script type="__bundler/manifest">`. Le gabarit
HTML, qui porte tous les jetons CSS, suit `<script type="__bundler/template">` et
est une chaîne JSON.

`Perron Design System.zip` (186 Ko) : archive de projet ordinaire — `tokens/*.css`
lisibles directement, plus un `readme.md` qui explique les intentions du design.
C'est le format à préférer pour les prochains : le standalone embarque 4,9 Mo de
bibliothèques pour 17 Ko de design utile, et perd le readme.
