# Design « Acheter ou louer » — intégration

Source : `bundle-claude-design.html`, export Claude Design (auto-extractible,
2,5 Mo dont les binaires de police). Le système de jetons y est lisible tel quel
dans le bloc `__bundler/template`.

Le design a été appliqué **par-dessus** la structure du simulateur, pas à la
place. Le plateau de bulles, le bandeau profil, le verrouillage séquentiel, le
zoom, l'état d'attente et la distinction leviers/réglages sont inchangés. Aucune
ligne du moteur de calcul n'a bougé.

## Ce qui a été repris tel quel

**Les rampes de couleur** — ink, cream, green, terracotta, amber, red, blue —
recopiées dans `:root` sans modification. Les noms sémantiques du simulateur
(`--plan`, `--surface`, `--encre`, `--achat`…) pointent désormais vers elles :
c'est ce qui a permis de ne pas toucher au JavaScript, qui lit ces variables
pour colorer les graphiques.

**La typographie** — Newsreader pour les titres, IBM Plex Sans pour l'interface,
IBM Plex Mono tabulaire pour tous les chiffres. Chargées depuis Google Fonts
avec une pile système en repli.

**Les rayons, ombres et durées** — `--radius-sm` 6 px pour les contrôles,
`--radius-lg` 16 px pour les cartes, ombres teintées vert-encre plutôt que noir
neutre, `--ring-focus` vert au focus.

**Les conventions de composants** — bouton de 44 px (34 en variante discrète),
champ de 44 px avec bordure franche et anneau au focus, carte qui se soulève de
2 px au survol quand elle est cliquable.

## Trois écarts assumés

### 1. Pas de thème sombre

Le design ne définit aucune palette sombre. En dériver une n'est pas qu'une
affaire de goût : sur fond sombre, les deux séries du graphique doivent rester
distinguables, y compris sous daltonisme. Les verts du design sont volontairement
très désaturés (chroma 0,058 à 0,08), et toutes les combinaisons testées à partir
de ses rampes tombent sous le seuil — jusqu'à ΔE 2,9 en protanopie pour les pas
clairs, c'est-à-dire deux courbes impossibles à distinguer.

Le thème sombre a donc été **retiré** sur cette branche. Le rétablir demanderait
d'ajouter au design des pas qu'il ne prévoit pas.

### 2. Le vert des séries ne passe pas les seuils d'une palette de données

`--data-1` (green-700 `#1f4d3d`) échoue deux contrôles : il sort de la bande de
clarté (L 0,383) et passe sous le plancher de chroma (0,058 — « lit gris »).

Il a été **conservé quand même**. Les contrôles qui décident si deux courbes se
distinguent, eux, passent largement : ΔE 14,8 en protanopie, 27,6 en vision
normale. Avec deux séries seulement, une légende et des points repères sur
l'année choisie, la lecture est sans ambiguïté — et la sobriété est le parti pris
du design. Le fond crème et une grille très claire évitent que la courbe sombre
soit confondue avec l'habillage du graphique.

### 3. La composition des pages n'a pas été reprise

Le bundle contient trois pages React (accueil, méthode, guide) avec en-tête
collant, pied de page sombre, cartes d'articles. Rien de tout cela n'a été
intégré : ce sont des pages de site vitrine, pas le simulateur. Elles restent
disponibles dans le bundle comme référence pour un futur habillage éditorial.

## Extraire à nouveau le bundle

Le manifeste est un JSON `{ uuid: { mime, compressed, data (base64 gzip) } }` sur
la ligne qui suit `<script type="__bundler/manifest">`. Le gabarit HTML, qui
contient tous les jetons CSS, suit `<script type="__bundler/template">` et est
une chaîne JSON.
