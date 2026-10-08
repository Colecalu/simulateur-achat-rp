# Conventions d'interface et de visualisation

Ce document rassemble les décisions d'interface, de design et de visualisation du
simulateur. Chacune a été prise en réponse à un problème observé à l'écran, souvent
mesuré : la raison est indiquée à chaque fois, parce que c'est elle qui dit s'il faut
la revoir ou la respecter.

Il est séparé de [CLAUDE.md](../CLAUDE.md), qui reste un document de référence court.
Toute session qui touche à `frontend/simulateur.html`, `frontend/css/` ou `frontend/js/app.js`
doit le lire.

---

## Design (branche design-v2)

**Le thème de référence est Perron.** C'est le seul sur lequel on travaille. `theme-foret.css`
est **gelé** : conservé tel quel comme point de comparaison, jamais mis à jour, jamais à vérifier.
Ne pas y passer de temps. Voir [docs/design/README.md](docs/design/README.md) pour les sources et
les écarts assumés.

> **01/10/2026 — main est aligné octet pour octet sur l'habillage de Codex** (CLAUDE.md §12).
> `socle.css` et `horizon.css` n'existent plus ; `theme-codex.css` porte de nouveau quelques
> règles de composants, et l'accueil a sa propre feuille autonome. Les règles ci-dessous qui
> parlent du socle ou d'un thème « valeurs seulement » décrivent l'état précédent.

- **`frontend/css/style.css` ne contient que de la structure.**
  Aucun `#hex`, aucun nom de pas de rampe (`--clay-500`, `--green-700`), aucune police, aucun
  rayon, aucune ombre : uniquement des noms sémantiques français (`--plan`, `--encre`,
  `--accent`, `--achat`, `--rayon-large`…).
- **Les thèmes ne contiennent que des VALEURS** : les rampes du design recopiées, les polices
  importées, puis les noms sémantiques qui pointent dessus. Aucune règle de mise en page.
  `theme-codex.css` est **celui en service**, et désormais le seul : `theme-perron.css` et
  `theme-foret.css`, chargés par aucune page, ont été retirés le 07/10/2026 avant la mise en
  ligne. Ils restent dans l'historique git (`git show 93dcde3:frontend/css/theme-perron.css`).
- Si un rôle manque, l'ajouter au **thème en service** plutôt que d'écrire une couleur dans une
  feuille de structure. Perron et Forêt n'étant plus chargés, ils peuvent manquer le rôle et
  retomber en valeur par défaut : c'est accepté, on ne les rattrape pas.
- **Un thème qui porte des règles n'est plus un thème.** La version d'origine de `theme-codex.css`
  mêlait 176 lignes de valeurs et 19 règles visant des composants du simulateur. Posées sur notre
  mise en page — et non sur celle pour laquelle elles avaient été écrites — elles coloraient les
  quatre bulles en jaune plein écran. Les règles vivent donc dans `horizon.css` : neuf d'identité
  et trois garde-fous de largeur sont **retenus et chargés** ; les deux qui touchent la mise en
  page restent en commentaire (voir CLAUDE.md §12).
- C'est cette indirection qui permet au JavaScript, qui lit `--achat` et `--location` pour
  colorer les courbes, de rester inchangé quel que soit le thème.

### Trois feuilles de structure, un nom de classe dans une seule

Le site a deux pages, et elles avaient chacune leur feuille complète : **33 noms de classe
étaient définis dans les deux, avec des valeurs différentes**. `.bouton` était une pilule terre
cuite de 54 px sur l'accueil et un bouton blanc de 44 px sur le simulateur ; `.carte__titre` du
Geist d'un côté, de l'Instrument Serif de l'autre. Rien ne signalait le doublon, et déplacer un
bloc de HTML d'une page à l'autre en changeait l'apparence.

- **`socle.css` porte ce qui est commun**, chargé par les deux pages entre le thème et leur
  feuille propre : réinitialisation et typographie de base, `.marque`, `.bouton` et ses variantes,
  `.entete`, et le **bloc de résultat entier** (`.verdict`, `.carte`, `.legende`, `.pastille`,
  `.graphique`, `.kpis`).
- **Le bloc de résultat est partagé parce que c'est réellement le même objet.** La section
  « Un exemple » de l'accueil EST l'écran de résultat du simulateur — c'est tout son argument.
  Renommer les classes de l'une des deux pages aurait figé le doublon au lieu de le supprimer.
- **Une page ne redéfinit jamais une règle du socle**, elle en règle les jetons :
  `--contenu-largeur`, `--contenu-gouttiere`, `--entete-respiration`. C'est ce qui rend la
  séparation vérifiable — le `comm` des sélecteurs en début de ligne doit rendre le vide sur les
  trois paires de feuilles (voir CLAUDE.md §4).
- **Seule exception, `body`** : 15 px / 1,5 au simulateur contre 17 px / 1,6 à l'accueil. Le
  plateau de bulles, ses hauteurs bornées et ses champs de 38 px sont calibrés sur la première
  mesure. La divergence est de densité, pas de style, et elle porte sa raison dans `style.css`.
- **Arbitrage systématique en faveur de l'accueil**, qui est la vitrine : c'est de là que vient
  la pilule terre cuite, le titre de carte en Geist, l'anneau de focus (`--anneau` au lieu d'un
  `outline`) et la cible tactile de 44 px sur le curseur d'horizon.
- **L'en-tête du simulateur est devenu la même barre** : marque `.marque` (1,625 rem, comme
  l'accueil) et un lien de navigation. Le `<h1>` et le sous-titre, qui y vivaient, ouvrent
  maintenant le contenu (`.page__intro`) — une barre ne porte pas deux choses à la fois. Mesuré :
  la marque tombe au même pixel que le bandeau de profil, à 1440 px comme à 420 px.
- **La constante de `.rail` (`calc(100vh - 583px)`) EST la hauteur de tout ce qui précède le
  rail.** L'en-tête ayant changé, elle est passée de 560 à 583 px. La rebouger à chaque fois que
  quelque chose grandit au-dessus, sinon le plateau déborde de l'écran sans que rien ne le dise.
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

## Scénarios de marché (deuxième pilier)

Le simulateur repose sur trois piliers différenciants : **(1)** comparer deux trajectoires
complètes pour capter le coût d'opportunité — fait ; **(2)** des scénarios adossés à des séries
réelles — en cours ; **(3)** la mise en location ultérieure — moteur fait, visualisation refaite en octobre 2026 (voir
« Le module de mise en location » plus bas).

- **Un taux du moteur est un nombre OU une série année par année.** `tauxAnnee(valeur, a)` et
  `facteur(valeur, de, a)` dans `calc.js` remplacent les `Math.pow(1 + r, n)`. Un test vérifie
  qu'une série constante donne exactement le même résultat qu'un nombre : c'est le filet de
  sécurité de toute la bascule.
- **C'est la raison d'être du pilier** : les simulateurs classiques proposent
  « pessimiste / médian / optimiste » sous forme de taux constants, alors qu'aucun marché ne monte
  de 5 % tous les ans. L'ORDRE des années compte — encaisser un krach la première année n'a pas le
  même effet que de l'encaisser la dixième. Un test verrouille le fait qu'une série alternée ne se
  confond pas avec sa moyenne.
- **PAS DE BOUCLE.** Une série plus courte que l'horizon n'est jamais rejouée. Sur 25 ans, une
  séquence de 11 ans tournait deux fois et demie, et les 14 années répétées pesaient **plus** que
  les 11 vraies — le portefeuille étant au plus gros à la fin. Mesuré : la boucle inversait le
  signe du verdict sur deux scénarios sur quatre, avec jusqu'à 1,2 M€ d'écart. Elle ne montrait
  donc pas « et si j'achetais juste avant 2008 » mais « et si 2008-2018 était le régime permanent
  du siècle » — l'affirmation la plus faible qu'on puisse tirer des données.
- **Le prolongement est une décision de scénario, pas du moteur.** Chaque scénario est ramené à la
  longueur de l'horizon dans `scenarios.js` : ses années réelles, puis un taux qu'il assume. Une
  décennie observée est prolongée par la **moyenne longue 1991-2022** (8,21 % marchés, 3,76 %
  immobilier) — le seul chiffre que les données autorisent pour ce qu'on ne sait pas. Un scénario
  construit est prolongé par **sa propre** moyenne : le prolonger au rythme historique
  contredirait son postulat. `reel` retient le nombre d'années observées.
- **La frontière est tracée sur les DEUX graphiques** (`traitFrontiere`, trait vertical pointillé
  + « prolongement ») : l'aperçu du scénario et le graphique de patrimoine. Au-delà, les courbes
  passent en **pointillé et en couleur atténuée** (`segment` de Chart.js, `attenue()` à 45 %) :
  même teinte, donc même série, mais visiblement plus une donnée. Sans cela le graphique laisse
  croire que vingt-cinq années sont documentées quand onze le sont.
- **`frontiere` est un INDICE de point, pas une année** : les deux graphiques n'ont pas la même
  origine (l'aperçu commence à l'année 0, le patrimoine à l'année 1). Passer une année à l'un des
  deux décale le trait d'un cran.
- Les suites sous la courbe d'aperçu ne listent que les années observées, suivies de « puis X % par
  an ». Lister vingt-cinq valeurs dont quatorze identiques ferait passer un prolongement pour une
  donnée.
- **L'avertissement de bas de page dit où s'arrêtent les données** : « 11 années observées
  (2008-2018), puis une projection au rythme moyen ». Pour « Trente ans réels », il dit au
  contraire que rien n'est projeté. Le vérifier après tout changement de la règle de prolongement —
  ce texte a déjà survécu une version de trop en parlant d'une boucle supprimée.
- **Pas d'option de fenêtre d'affichage sur le graphique de patrimoine.** L'idée de le forcer à
  10 ans quand un scénario s'applique a été mesurée et écartée : à 10 ans l'achat gagne dans
  2 scénarios sur 7, à 20 ans dans 4 sur 7, et deux scénarios changent de signe. Un réglage
  d'affichage aurait décidé de la réponse, toujours dans le même sens (contre l'achat, l'acheteur
  n'ayant à 10 ans amorti ni les frais d'acquisition ni grand-chose du capital). Le curseur
  d'horizon fait déjà ce travail, et il n'y a qu'une notion de temps à l'écran.
- **`tauxAnnee` tient la dernière valeur** au-delà de la série : c'est un filet, jamais atteint en
  pratique puisque les scénarios font déjà la longueur de l'horizon.
- **On ne peut pas tirer quatre scénarios de 25 ans distincts de 32 ans de données.** Mesuré : les
  huit fenêtres de 25 ans possibles dans 1991-2022 partagent 24 années sur 25 et donnent toutes
  entre +565 k€ et +775 k€ — le même scénario huit fois. La variété est dans les décennies
  (−770 k€ à +2 289 k€) et disparaît dès qu'on allonge la fenêtre, tous les régimes se moyennant.
  Pour deux fenêtres de 25 ans réellement disjointes, il faut environ **50 ans de record**.
- **Les scénarios vivent dans `frontend/js/scenarios.js`**, séparés du moteur : ce sont des
  données, pas de la logique. Les quatre décennies observées sont sourcées (MSCI World pour les
  marchés, INSEE Notaires-INSEE pour l'immobilier, IPC 04.1.1.0 pour les loyers, IPC ensemble pour
  l'inflation), en euros courants, sur les quatre séries.
- **Les décennies se chevauchent et concordent** : B/C partagent trois ans, C/D en partagent sept,
  et les douze valeurs communes sont identiques au chiffre près. Seule exception, deux points
  d'immobilier en 2000-2001 qui diffèrent de 0,1 pt entre A et B : c'est la jointure entre la
  reconstruction Friggit et la série INSEE. Refaire ce contrôle croisé à chaque nouvelle décennie.
- **`revalTaxeFonciere` n'a pas de série propre** : elle recopie `revalCharges` (l'inflation
  générale). C'est une **sous-estimation connue** — la taxe foncière a dérivé plus vite que
  l'inflation. À remplacer par une vraie série dès qu'on en a une.
- **Les décennies sont chaînables** : elles se chevauchent et concordent, ce sont quatre fenêtres
  sur une série continue de 1991 à 2022. Recollée (32 ans), elle donne le scénario « Trente ans
  réels », le seul qui couvre tout l'horizon sans prolonger ni rejouer quoi que ce soit. À la
  couture 2000-2001, on garde l'INSEE plutôt que la reconstruction Friggit.
- **Chaque scénario porte ses `reserves`**, affichées en tête de l'aperçu avec un pictogramme
  d'alerte : elles disent ce qu'on sait de faux ou d'incertain dans ses propres données. Une
  réserve n'est pas une source, elle doit se remarquer.
- **Deux familles, huit options** : `historique` (Krach immobilier 1991-2001, Internet et
  subprimes 2000-2010, Krach de 2008 2008-2018, Taux bas puis inflation 2012-2022, Trente ans réels
  1991-2022), `prospectif` (deux trajectoires construites, explicitement non observées) et
  le « Scénario linéaire » (ex-« Mes hypothèses »), qui n'est pas dans le fichier — c'est l'absence de scénario, et elle lit les
  champs de la bulle 4. Les noms désignent l'ÉVÉNEMENT de marché, jamais l'issue pour l'acheteur.
- **La carte est une fonctionnalité à débloquer, et se présente comme telle** (01/10/2026,
  demande de Lucas : « un cadre plus visible, qui donne envie de cliquer »). Verrouillée, elle
  reste nette — fond creux, bordure en tirets, cadenas, « À débloquer » et **quatre pastilles,
  une par bulle validée** — au lieu de l'ancienne carte grisée à 45 % que personne ne voyait.
  Débloquée, elle reprend la **présentation proposée par ChatGPT** (arbitrage de Lucas) :
  question « Et si les marchés changeaient ? » (le surtitre ne reste qu'à l'état verrouillé),
  une courbe **en segments heurtés** par-dessus la droite pointillée, « Ajoutez un filtre de
  marché à votre projet et observez son effet sur les résultats », et un bouton pleine largeur
  « Explorer les scénarios », sans flèche. Couverture jaune et ombre dure ; **au survol**, la carte
  se soulève, la courbe se trace (1,4 s) et le bouton passe à l'accent. **La courbe ne s'anime
  qu'au survol** : une animation de base la faisait retracer en quittant la carte.
  L'explication reprend **exactement les mêmes points**, mis à l'échelle. Le
  bouton est `disabled` tant que c'est verrouillé : `pointer-events` seul laissait passer le
  clavier.
- **La découverte se fait en DEUX TEMPS**, portés par `data-etat` sur `#scenario` :
  1. `bloque` — tant que les quatre bulles ne sont pas validées. L'accroche dit pourquoi.
  2. `ferme` — l'appel décrit ci-dessus. Le clic ouvre une fenêtre qui explique **ce qu'on cherche à
     faire, et rien d'autre** : pas un seul nom de scénario. Sept noms de décennies ne veulent
     rien dire tant qu'on n'a pas dit ce qu'on en fait, ni prévenu que la seconde moitié des
     courbes est extrapolée.
  3. `ouvert` — la liste remplace l'appel dans le rail et y reste. Chaque ligne porte son nom, sa
     période, et un bouton qui ouvre l'aperçu des courbes.
- **L'explication ne se relit plus depuis la liste** : le « ? » a été retiré à la demande de Lucas
  (place prise pour rien). Elle reste ouverte au premier clic sur la carte jaune.
- **L'explication se lit en dix secondes** (refonte du 01/10/2026 — les quatre paragraphes
  précédents n'étaient pas lus). Un titre (« La vraie vie n'est pas une ligne droite. »), le
  dessin de la carte en grand — la droite « linéaire » et un vrai chemin qui se trace — puis
  **deux cases** : « 01 / Le passé — Rejouer l'histoire » en grisé, « 02 / Futurs possibles —
  Tester un choc » en violet à tirets, habillées comme leurs blocs dans la liste. Mise en page
  reprise d'une proposition de ChatGPT, titre et dessin de Claude — arbitrage de Lucas. Pas de
  case « Linéaire » : c'est ce que l'utilisateur a déjà sous les yeux. Pas de flèche sur « Voir
  les scénarios ». Rien d'autre : ni rappel sur le taux de crédit, ni réserves repliées —
  Lucas a voulu l'écran le plus simple possible. Les réserves vivent dans l'aperçu de chaque
  scénario et dans l'avertissement sous le graphique.
- **Appliquer se fait d'un clic sur la ligne**, l'aperçu s'ouvre par l'icône à droite. Ouvrir un
  aperçu n'applique rien.
- **Deux blocs dans la liste** : « Le passé » en **grisé plein**, « Des futurs possibles » en
  **violet à tirets** (aplat `--accent-doux`, pas une couleur de série).
  Chaque bloc a son pictogramme (flèche qui revient, flèche pointillée qui part). Un futur affiche
  « Un choc sur … » là où un historique affiche sa période.
- **Le scénario linéaire n'a pas de ligne** : c'est l'absence de scénario, les taux de l'étape 4
  appliqués chaque année. On y revient en recliquant sur le scénario actif, mais personne ne le
  devine : une petite pilule **« × Retirer »** à droite du titre, dans le bandeau, le dit. Elle
  n'apparaît qu'avec un scénario actif ; vivant dans le bandeau, elle ne change pas la hauteur de
  la carte. Essayé puis écarté : un bouton jaune sous la liste — une couleur de trop, et une
  carte trop haute.
- **La liste ouverte garde toujours la même hauteur** : un bandeau d'encre avec le seul titre,
  les deux blocs et leurs quatre scénarios, rien d'autre. Ni étiquettes « Historique » /
  « Hypothèse » (le bloc le dit déjà), ni note « années observées », ni bandeau qui change de
  couleur — tout ce qui chargeait ou faisait bouger la carte a été retiré (décision de Lucas). Même
  bordure d'encre et même ombre dure que la carte jaune : c'est le même objet, déplié.
- **Trois séries sont tracées** — marchés, immobilier, loyers (IRL). `revalCharges` et
  `revalTaxeFonciere` sont dans `taux` parce que le moteur en a besoin, mais ne sont pas dessinées :
  elles suivent l'inflation générale et n'intéressent pas le lecteur au même titre.
- **Un scénario `historique` sans `sources` n'est qu'une opinion.** L'aperçu affiche la provenance
  série par série. Remplir `periode`, `sources` et `reserves` en même temps que `taux`.
- **Réserve ouverte sur la devise des rendements boursiers** : ils sont annoncés en euros, mais
  2019 (+27,7), 2021 (+21,8) et 2022 (−18,1) sont au centième les valeurs publiées en dollars — or
  ces années-là ont connu de forts mouvements de change, et 2014-2015 ressemblent davantage à de
  l'euro. La série est donc peut-être panachée. Le doute est porté à l'écran ; le lever demande de
  retourner à la source.
- **Les trois courbes de l'aperçu** : `--courbe-marches` (clay-500), `--courbe-immo` (olive-700),
  `--courbe-loyer` (warm-200). Seul triplet de Perron qui passe les deux seuils de séparation
  (ΔE 20,7 normal, 13,9 protan) — toutes les combinaisons mêlant l'ochre à un vert échouent, les
  deux teintes étant voisines en tonalité. Le gris des loyers n'atteint pas 3:1 sur le fond : il
  est **pointillé**, ce qui lui donne une seconde marque, et ses valeurs sont rappelées sous la
  courbe. C'est la série la plus plate et la moins décisive.
- **Le filtre n'est pas une cinquième étape.** Il s'applique par-dessus les quatre bulles, d'où
  l'absence de numéro et d'anneau d'invite, et il reste inerte tant que les quatre ne sont pas
  validées — un scénario n'a rien à filtrer avant qu'il y ait un résultat.
- **Un scénario actif pilote les cinq taux de la bulle 4** : les champs affichent le taux annuel
  **équivalent** (moyenne géométrique, pas arithmétique — −20 % puis +30 % font +1,98 %/an, pas
  +5 %) et sont désactivés. Les laisser montrer les valeurs de l'utilisateur pendant que le moteur
  calcule autre chose serait un mensonge à l'écran. `majBulles()` doit respecter ce verrouillage,
  sinon chaque recalcul rouvrirait les champs.
- **Le scénario linéaire rend les valeurs intactes** : elles sont mises de côté au premier scénario
  appliqué, jamais écrasées.
- **L'avertissement de bas de page change avec le scénario** : « hypothèses constantes » devient
  faux dès qu'une série tourne.
- **L'aperçu est allégé** (01/10/2026 — « c'est terrifiant de voir tout ça ») : 560 px de large,
  titre en sérif 1,75 rem, résumé en 15 px, une **légende** qui donne où chaque courbe arrive
  (base 100), une courbe de 200 px. Tout le reste — taux année par année, note de lecture,
  réserves et sources — est dans un `<details>` « Le détail année par année », **refermé à
  chaque ouverture**. Les réserves ne sont donc plus visibles d'emblée : arbitrage assumé de
  Lucas, la lisibilité d'abord.
- **L'aperçu est une fenêtre à part**, ouverte par l'icône de courbe d'une ligne : une fenêtre qui
  trace ses trois séries (marchés, immobilier, loyers) **en base 100**, sur l'horizon complet. On trace la
  VALEUR, pas le taux : une suite de pourcentages est une dérivée, on la lit mal et on ne voit pas
  où elle mène. En base 100, deux décennies de moyenne identique mais d'ordre différent se
  séparent à l'œil — ce qui est précisément le propos du pilier. Les taux année par année sont
  rappelés sous la courbe (`.suites`) : la courbe dit où l'on arrive, la suite par quoi on y
  passe. Ces deux lignes tiennent lieu de légende, il n'y en a pas d'autre.
- La répétition de la série est **visible** sur la courbe : c'est une propriété du modèle, pas un
  détail à cacher. Le scénario linéaire a son aperçu aussi — deux courbes lisses et « +5 chaque
  année » sous le graphique ; la comparaison avec une décennie réelle est tout l'argument.
- **Un seul axe, même quand les échelles divergent** (marchés à 1 043 contre immobilier à 313 sur
  le scénario porteur). Deux axes Y mentiraient sur l'écart réel.
- **Ouvrir un aperçu n'applique rien.** Regarder et choisir sont deux gestes distincts.
- **Les deux fenêtres vivent hors du rail de gauche**, à côté du voile. Le rail est
  (ou a été) `position: sticky`, donc un contexte d'empilement : une fenêtre qui y resterait passerait sous
  le voile — même piège que les bulles 3 et 4 en leur temps.
- **Le voile sert trois vues** : l'explication, l'aperçu et la bulle zoomée. L'aperçu passe
  devant l'explication dans les écouteurs de clic et d'Échap — c'est lui qui est au-dessus. Son écouteur et celui d'Échap
  traitent l'aperçu en premier, et `validerBulle` refuse désormais `n === null` — sans quoi un clic
  sur le voile sans bulle ouverte ajouterait `null` aux bulles validées et casserait.
- **Les courbes de l'aperçu ont leurs propres jetons** : ce sont des indices de marché, pas des
  trajectoires patrimoniales. Emprunter `--achat` / `--location` sèmerait la confusion.
- **Nommer les scénarios par le MARCHÉ, pas par l'issue.** Une décennie boursière difficile est
  *favorable* à l'achat : elle pénalise surtout le locataire, dont l'épargne est plus grosse. Les
  données réelles le confirment brutalement — « Bulle immobilière » donne +2 288 650 € et « Choc
  inflationniste » −770 077 €, alors que la seconde est la décennie aux meilleurs marchés (11,6 %
  par an). Un scénario baptisé « pessimiste » qui améliore le résultat serait incompréhensible.

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
- **Le détail « D'où vient cet écart ? » est DÉPLIÉ par défaut** (décision de Lucas) : ce qu'il
  explique fait partie de la réponse. Le bouton (`.cta`) le replie pour qui veut une vue courte ;
  replié, il reprend son libellé d'appel. Le module « mise en location » reste masqué jusqu'à un
  clic. Ne pas rajouter d'indicateurs ou de graphiques sans demande explicite.
- **Deux contrôles d'horizon, une seule date.** Le rappel du curseur (`#horizonBis`) évite de
  remonter en haut de page pour régler l'année. Il **écrit dans** `#horizon`, qui reste la source
  de vérité, et `afficherVerdict` réécrit les deux libellés. Ne jamais leur donner deux valeurs
  indépendantes : deux dates à l'écran, c'est la garantie qu'on finit par comparer deux instants
  différents sans s'en apercevoir.
- **« Chaque mois » : quatre KPI sous le graphique, HORS du détail repliable** (`#mensuel`,
  carte `.kpis`) : point d'équilibre · **Achat** (coût réel, investi) · **Location** (loyer,
  investi) · taux d'endettement. Première année, ramenée au mois. Tous les chiffres mensuels au
  même endroit — ils étaient en double avec un bloc du profil, retiré. Le **coût réel**
  (mensualité, assurance, charges de copropriété, taxe foncière) contient la mensualité, qui n'est
  plus affichée seule : on montre ce que le propriétaire sort chaque mois, tout compris, face au
  loyer. « Investi » en ocre des deux côtés : c'est ce que le logement ne consomme pas. Taux
  d'endettement : un chiffre sans commentaire, « — » sans revenus. Juste dessous, la **ligne de
  choix** de l'épargne forcée : hors du détail parce qu'elle change le verdict de dizaines de
  milliers d'euros et ne doit jamais être cachée.
- **Aucun commentaire sous les chiffres dans le cas normal.** `#pointMortMesure` reste vide —
  le libellé du chiffre se suffit. Il ne sert qu'à l'avertissement quand l'avantage ne tient plus
  à l'horizon choisi. Ne pas y remettre de glose.
- **« Frais irrécupérables » ne compare rien** : trois parts (acquisition, crédit, possession),
  côté achat seulement. Au-delà de cinq parts un camembert devient illisible.
- **Trois camemberts pour les cumuls, un histogramme pour le temps.** « Total versé » est une paire de camemberts (achat, location) ; « Frais irrécupérables » en est un
  troisième. Chacun porte **son total en dessous** : c'est ce total, et non la hauteur des barres
  d'autrefois, qui montre maintenant que les deux enveloppes sont égales (816 000 € à 20 ans).
  Ne jamais opposer « charges de l'acheteur » à « loyers du locataire » sans les épargnes : on
  conclurait que l'achat coûte 210 k€ de plus, alors que cet écart n'est pas dépensé mais investi.
  `repartitionEnveloppe()` porte cette lecture et un test verrouille l'égalité des totaux. Quand
  l'effort est insuffisant, l'enveloppe monte des deux côtés : les totaux restent égaux. Ils ne
  diffèrent que si l'utilisateur déclare que le locataire ne placerait pas la différence — l'écart
  des totaux EST alors l'épargne forcée.
- **Les titres des deux cartes cumulées portent la période** (« Total versé sur 20 ans », « Frais
  irrécupérables sur 20 ans ») et suivent le curseur. Sans elle, un montant cumulé ne dit pas sur
  quelle durée il est cumulé. Dire **« versé »** et non « dépensé » : l'épargne investie est un
  des postes, et elle reste à l'utilisateur.
- **« Ce que devient votre enveloppe, année après année » ignore volontairement le curseur** : il couvre toute la durée simulée,
  comme la part possédée juste en dessous, pour que les deux se lisent sur le même axe de temps.
  **Deux histogrammes séparés**, achat au-dessus de location — un seul graphique à deux piles par
  année faisait cinquante barres et ne se lisait plus. Ils partagent le **même plafond d'axe Y**
  (`hauteurMax`) : à échelles différentes, deux histogrammes empilés l'un sur l'autre suggèrent
  des écarts qui n'existent pas. Jamais cumulés.
  `repartitionAnnuelle()` compose les mêmes postes que `repartitionEnveloppe()` — un test vérifie
  que le cumul des années redonne la version cumulée, sans quoi deux graphiques nommant
  « intérêts et assurance » montreraient des choses différentes.
- **Les infobulles portent sur une part, pas sur l'ensemble** (`mode: 'nearest', intersect: true`).
  Lire quatre postes d'un coup quand on en pointe un seul est illisible.
- **Un poste, deux noms** (`POSTES` dans `app.js`) : le nom complet va dans les infobulles, qui
  ont la place de le porter ; le nom court, d'un mot, va dans les légendes. Une légende à cinq
  entrées de trois mots mangeait la place du graphique qu'elle explique — mais sans légende du
  tout, un camembert ne veut rien dire avant qu'on le survole. Le vocabulaire est défini une
  seule fois : deux graphiques qui montrent le même poste doivent le nommer pareil.
- **Les légendes ne portent jamais de montant** (`legendeSimple`) : les graphiques qui en ont une
  sont partagés par deux trajectoires, où les mêmes postes valent deux choses différentes.
- **Les travaux ne sont pas des frais irrécupérables.** Le modèle les fond dans la valeur du bien
  (« valeur estimée du bien après travaux ») : ils reviennent par le prix de revente. Le capital
  remboursé non plus. En revanche les frais d'acquisition (notaire, agence, banque), les intérêts
  et l'assurance le sont — et côté location, la totalité du loyer. Un test verrouille chaque
  exclusion, à emprunt constant : des travaux *empruntés* coûtent des intérêts, eux bien perdus.
- **Le point mort n'est pas un acquis.** `premiereAnneeFavorable` est le PREMIER croisement ; les
  courbes peuvent se recroiser (un rendement boursier élevé fait repasser le locataire devant).
  Vérifier que l'avantage tient encore à l'horizon choisi avant d'annoncer un point mort, sinon
  l'écran se contredit : « point mort : 3 ans » au-dessus d'un verdict à −153 111 €.
- **La part du bien possédée est quasi droite, et c'est correct.** À 3,5 %, le gain annuel passe
  de 3,63 à 4,55 points sur vingt ans — un rapport de 1,25 seulement. L'intuition d'une courbe
  exponentielle vient du tableau d'amortissement, où le capital remboursé, lui, double bien
  (1,035^20 ≈ 2). Deux choses aplatissent la part possédée : l'apport, qui la fait démarrer haut
  (23 % dès l'année 1), et la revalorisation du bien, qui grossit le dénominateur. La courbure
  dépend du taux : rapport 1,85 à 6 %, et 0,84 à 1 % — c'est-à-dire légèrement concave. Ne pas
  « corriger » ce graphique, il n'a rien de cassé.
- **Les postes empilés sont cinq, pas six.** « Taxe foncière » et « charges de copropriété » sont
  fondues : à six entités, la paire voisine la plus proche tombe à ΔE 13,9 en vision normale, sous
  le plancher de 15. À cinq, la pire paire remonte à 20,8. La palette Perron, volontairement
  terreuse, n'offre pas six teintes séparables — le détail reste dans l'infobulle. Une entité garde
  sa couleur d'un graphique à l'autre. La légende **chiffrée** n'est pas décorative : clay-200 et
  ochre-500 n'atteignent pas 3:1 sur le fond, l'étiquette est ce qui les rend lisibles.
- L'encadré de verdict est réduit au strict nécessaire : le curseur d'horizon, le chiffre, et une
  seule ligne qui dit ce que ce chiffre mesure. Ne pas y réintroduire de commentaire.
- **Aucun résultat n'est affiché tant que le profil et les quatre bulles ne sont pas validés.** Tous les champs
  ont une valeur par défaut, donc le moteur sait toujours calculer — mais afficher ce calcul
  donnerait à une hypothèse l'allure d'une réponse à une question que l'utilisateur n'a pas encore
  posée. `majAttente()` bascule `#visu` entre `data-etat="attente"` (carte d'attente + jauge de
  progression) et `data-etat="pret"`. Les graphiques sont **créés seulement une fois la zone
  visible**, et `resize()` est rappelé au passage attente → prêt : un canevas dimensionné dans un
  conteneur masqué reste à zéro.
- **Le profil est un bandeau, pas une bulle.** Il décrit l'utilisateur, pas le projet : saisi une
  fois, il ne varie pas d'une simulation à l'autre. Il vit hors du parcours numéroté, se replie sur
  une ligne une fois validé et reste modifiable en un clic. Tant qu'il n'est pas validé, le plateau
  est grisé et inerte (`.plateau--bloque`). Le jour où les comptes utilisateurs arrivent, c'est ce
  bandeau qui se sauvegarde dans le profil tandis que les bulles deviennent des simulations
  enregistrables.
- **Trois questions, et l'effort n'est jamais saisi.** « Ce que vous possédez » (patrimoine
  financier), « ce que vous sortez chaque mois » (loyer actuel + épargne mensuelle), « ce que vous
  gagnez » (revenus nets du **foyer**, facultatifs). Personne ne connaît son « effort mensuel » de
  tête ; tout le monde connaît son loyer et ce qu'il met de côté. L'effort se stocke décomposé
  (groupe `profil` de la sauvegarde) et se déduit à la lecture. Son total n'est **pas affiché**
  dans le bandeau pour l'instant (décision de Lucas) : il reviendra ailleurs. Les trois groupes ont
  la même hauteur, la plus faible possible — aides d'une ligne, champs de 38 px.
- **La saisie du profil est nue** (décision de Lucas) : trois questions, quatre champs, rien
  qui s'affiche pendant qu'on tape — ni phrase d'explication sous les champs, ni part des
  revenus, ni reste à vivre. Ces ratios restent calculés par le moteur (`partEffortActuel`,
  `resteAVivreActuel`) pour de futurs indicateurs dans la visualisation.
- **Le profil est une saisie nue** : trois questions, quatre champs, rien d'autre, avant comme
  après validation. Essayés puis écartés pour montrer « le même effort, le reste est investi » :
  KPI détaillés, barres horizontales puis verticales, phrases-équations, carte « À effort égal »
  au-dessus du verdict, puis deux colonnes « Projet location / Projet achat RP » dans le profil —
  retirées parce qu'elles doublaient les KPI du détail.
- **⚠️ À traiter : les deux loyers.** Le **loyer actuel** (profil) sert à l'effort déclaré ; le
  **loyer du locataire** (bulle 3) est celui de la comparaison. Deux champs pour une notion que
  l'utilisateur croit unique. On ne peut pas simplement les fusionner : le rapport entre le loyer et le prix DU
  BIEN décide souvent du verdict, et le loyer actuel est faux dès que le bien acheté est plus
  grand ou dans une autre ville. Essayé puis écarté par Lucas : déplacer le loyer du locataire
  dans la bulle 1, pré-rempli et lié au loyer actuel. Le champ reste en bulle 3 pour l'instant.
- **Le cas qui fait toute la différence : l'achat demande plus que l'effort d'aujourd'hui.**
  Une **bulle surgit une seule fois**, au centre, sur un voile. Elle **interroge**, elle n'explique
  pas (réécrite les 28 et 29/09/2026, demandes de Lucas) :

  > **Cet achat demande 23 807 € de plus par mois que votre effort actuel.**
  > Êtes-vous vraiment prêt à faire cet effort supplémentaire ?
  > *Si oui : pourquoi ne le faites-vous pas déjà, aujourd'hui, en tant que locataire ?*
  > C'est tout l'enjeu : le crédit vous FORCERA à mettre cette somme de côté chaque mois, alors
  > que rien ne vous y oblige en restant locataire. Selon votre réponse, les deux trajectoires
  > n'auront pas la même enveloppe : 23 807 € par mois d'écart, pendant toute la simulation.
  > *Répondez franchement, même si la réponse ne vous arrange pas.*
  > [ Je place le gap ] [ Je conserve mon effort actuel ]
  > À 10 ans, votre réponse déplace le résultat de 3 362 108 €.

  - **La deuxième question est celle qui fait tout le travail**, et elle dérange exprès : si
    l'effort est tenable, pourquoi ne le fait-on pas déjà ? La réponse honnête est presque
    toujours « parce que rien ne m'y oblige » — c'est exactement ce que le crédit changerait.
    Elle est **en couleur d'alerte** : ce n'est pas une question de même rang que la première.
    Ni l'une ni l'autre n'a de bouton : elles se répondent dans sa tête.
  - **Le paragraphe dit ce que le choix ENGAGE**, pas ce qu'est l'épargne forcée : deux enveloppes
    différentes pour toute la suite, chiffrées. Sans lui, on répond à une question de principe
    sans voir qu'on paramètre la simulation.
  - **Le titre tient sur UNE ligne** (`white-space: nowrap` + `clamp()`) : c'est une phrase, pas un
    paragraphe, et coupée en deux elle perdait sa force. La taille fluide garantit qu'elle rentre
    même avec un montant à six chiffres ; sous 1040 px elle peut revenir à la ligne.
  - **La bulle se centre sur la VISUALISATION, pas sur la fenêtre.** Centrée sur la fenêtre, elle
    paraissait décalée à gauche — le rail de saisie occupe 292 px à gauche du visuel. Le décalage
    vaut exactement la moitié du rail et de sa gouttiere, **quelle que soit la largeur**, parce que
    la page est centrée et ses marges symétriques : `translate: calc(-50% + (var(--rail-largeur) +
    var(--rail-gouttiere)) / 2)`. Pur CSS — `app.js` ne pose **aucun style en ligne** (invariant 6),
    et une mesure en JS aurait été le premier.
  - **L'enjeu est mesuré à DIX ans** (`HORIZON_ENJEU`), pas à l'horizon regardé. À vingt-cinq ans
    le chiffre devient énorme et invraisemblable — un chiffre qu'on ne croit pas ne fait pas
    réfléchir. Le moteur tourne une seconde fois avec l'autre réponse ; rien n'est affirmé.
  - **Choix obligatoire** : ni croix, ni voile, ni Échap. **Le résultat reste masqué** tant qu'on
    n'a pas répondu (`#visu[data-question="attente"]`) : il dépend de la réponse.
- **Les DEUX options écrites, avec leur montant** (29/09/2026). Une fois répondu, la bulle
  redescend vers une carte sous les quatre KPI :

  > EN RESTANT LOCATAIRE, MON EFFORT MENSUEL : (?)
  > [ **Je le porte à 3 909 €** — le même effort que l'acheteur ]
  > [ **Je le conserve à 3 400 €** — l'acheteur, lui, épargne de force ]

  - **Pourquoi pas un interrupteur.** Essayé puis écarté par Lucas. Un interrupteur n'affiche que
    l'état COURANT : il faut deviner ce que vaut l'autre. Les deux options côte à côte montrent
    **les deux enveloppes en même temps** — 3 909 € contre 3 400 € — et c'est exactement ce qu'il
    faut comprendre : elles ne sont pas les mêmes. C'est là, et pas dans un paragraphe, que
    l'épargne forcée devient évidente.
  - **Le montant fait le travail, pas le vocabulaire.** « Je place le gap » demandait de retenir ce
    qu'était le gap. « Je le porte à 3 909 € » se lit sans rien retenir.
  - **La note de droite nomme l'asymétrie** : « l'acheteur, lui, épargne de force ». C'est la
    seule phrase de la carte, et elle est sur l'option où elle compte.
  - **Le relief dit lequel est actif**, pas seulement la couleur : l'option retenue est **enfoncée**
    (ombre interne), l'autre légèrement en relief.
  - **Cliquer l'option déjà active ne fait rien** : c'est une sélection, pas une bascule.
  - **Le titre de la carte rouvre l'explication** (avec un « ? » discret). Les options gardent leur
    cible propre : choisir ne rouvre pas la bulle.
- **Le verdict n'affiche JAMAIS de signe négatif** (29/09/2026). Un écart négatif ne veut pas dire
  « moins de patrimoine » : il veut dire que c'est l'AUTRE trajectoire qui gagne, et de ce
  montant-là. La couleur le dit, la phrase juste en dessous l'explicite (« de patrimoine en plus en
  restant locataire qu'en achetant ») — le signe, lui, se lisait comme une perte.
- **« Le verdict a bougé de 256 000 € vers l'achat » a été supprimé** (29/09/2026) : la ligne
  prenait trop de place sous le chiffre, juste sous le curseur d'horizon. L'enjeu du choix est déjà
  donné dans la bulle, au moment de trancher — c'est là qu'il sert.

- **Une seule pop-up, jamais deux** (28/09/2026). Une mise en garde de faisabilité — taux
  d'endettement au-delà des 35 % du HCSF — avait été ajoutée **avant** la question, puis
  **retirée par Lucas** : deux bulles modales d'affilée sont trop agressives, et l'utilisateur sait
  parfaitement qu'une mensualité supérieure à son salaire ne passera pas — le KPI « taux
  d'endettement » est déjà là pour le lui dire. **Un indicateur suffit là où on croyait devoir
  interrompre.**
- **Rien ne réagit à une valeur en cours de frappe** (demande de Lucas). Remplacer 25 ans par 20,
  c'est passer par « 2 » : une durée de 2 ans fait exploser la mensualité, et la simulation — pire,
  la question de l'épargne forcée — partait sur une valeur que personne n'a voulue. Deux gardes :
  1. dans un champ numérique, le recalcul attend **350 ms sans frappe** (`recalculerApresFrappe`) ;
     listes, cases et réponses recalculent tout de suite ;
  2. la question ne **surgit jamais tant qu'un champ numérique a le focus** (`saisieEnCours`) : elle
     attend `focusout`, puis tout est revérifié sur la valeur définitive. Le verdict n'est masqué
     que question posée, pas pendant la frappe.
- **Qui retient quoi.** La RÉPONSE est un paramètre du projet (`locatairePlaceDifference`, case à
  cocher masquée, lue par le moteur). Le FAIT d'avoir répondu est un état de session
  (`avancement.epargneForceeRepondue`), comme « profil validé » : sans lui la bulle resurgirait à
  chaque rechargement. Les boutons règlent la case puis lui font émettre `input` et `change` : mémoire
  de l'écart, recalcul et sauvegarde suivent sans rien d'autre. « Le verdict a bougé de… » ne
  s'affiche qu'à partir de la deuxième réponse : à la première, il n'avait jamais été montré. La
  fermeture animée a un filet (`setTimeout`) : un onglet en arrière-plan suspend les animations, et
  la bulle resterait affichée. Pas d'animation avec `prefers-reduced-motion`.
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
- **`.bulle--validee` décrit la carte REPLIÉE, `.bulle--zoom` la bulle OUVERTE : les deux ne
  s'appliquent jamais ensemble.** Toute règle de la section « Validée » porte donc
  `:not(.bulle--zoom)`. Sans cela, une bulle validée puis rouverte hérite d'un mélange des deux
  mises en page — champs étroits, nombres centrés, colonnes de la vue repliée — au lieu de
  retrouver exactement la vue du premier passage. Les règles repliées montent jusqu'à (0,3,0)
  (`.bulle[data-colonnes="1"].bulle--validee …`) et écrasent les règles de zoom en (0,2,0) :
  l'ordre dans le fichier ne suffit pas à les départager. Test de non-régression : photographier
  les styles calculés d'une bulle au premier passage et à la réouverture, ils doivent être
  identiques.
- **Cliquer dans un champ de nombre en sélectionne le contenu** (`initialiserSaisie`) : on écrit
  le nouveau montant par-dessus sans effacer l'ancien. C'est le geste central du simulateur. Un
  second clic dans le champ replace le curseur, pour retoucher un chiffre. La sélection se fait au
  `click`, pas au `focus` : le clic qui donne le focus replacerait le curseur juste après.
  `.champ` est un `<label>` qui enveloppe son champ — le clic sur toute la case est donc transmis
  nativement, il n'y a pas de gestionnaire à écrire pour ça.
- **Pendant la saisie, rien ne se teinte à part le nombre.** Le seul surligneur est celui de la
  sélection (`--surligneur`, `.champ input::selection`). Pas de fond sur toute la case au focus,
  pas d'anneau de 3 px autour de la boîte : deux surlignages pour une seule action. Le survol,
  lui, teinte la ligne repliée — c'est ce qui annonce qu'elle est modifiable sur place.
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
- **« Nouvelle simulation » vit dans une carte, dans le coin du plateau** (oct. 2026). Le coin
  au-dessus de la colonne de gauche était vide, avec un lien « Réinitialiser » que personne ne
  voyait. Il porte désormais la carte « Votre simulation » : titre, état de la sauvegarde, et un
  bouton à contour d'encre et ombre dure au survol, comme la carte des scénarios. **Effacer est
  irréversible, donc jamais en un clic** : le bouton fait place à « Tout effacer et repartir de
  zéro ? » avec « Effacer » (rouge brique) et « Annuler », qui reçoit le focus ; Échap annule.
  Pendant la question, l'état de la sauvegarde s'efface pour que la carte tienne dans sa case de
  158 px. Sous 1 040 px, la carte devient une barre : titre à gauche, action à droite.
- **Le module de mise en location** (refonte d'octobre 2026, aucun changement du moteur). Il pose
  la question d'un propriétaire : **« je revends, ou je loue ? »**.
  - **Le pilier 3 est à côté du pilier 2** (décision de Lucas) : une carte « Et si vous le
    mettiez en location ? » dans le rail, **juste sous celle des scénarios**, sur le même modèle —
    elle en porte les classes (`.scenario.scenario--location`) : verrouillée avec ses quatre
    pastilles, puis **lilas** (`--papier-lilas` ; deux cartes jaunes empilées se confondaient)
    avec une maison et une clé qui se tracent au survol, puis, une fois la
    location appliquée, un **résumé à hauteur fixe** (bandeau d'encre, « Dès l'année 12 »,
    « Meublé · 2 200 €/mois », « Voir le résultat », « Modifier », pilule « × Retirer »).
  - **La saisie se fait dans une fenêtre** (`#melFenetre`), comme l'explication des scénarios ;
    « Voir le résultat » applique (`melActif`), referme la saisie et ouvre les résultats.
    Fermer par ×, Échap ou le voile ne retire rien. Une fois appliquée, toute modification dans
    la fenêtre se répercute en direct.
  - **Les résultats s'ouvrent dans une grande fenêtre par-dessus l'analyse** (`#mel.mel-resultat`),
    **jamais dans le corps de la page** (décision de Lucas, oct. 2026) : la mise en location est un
    complément de fin de parcours — « et si je la louais ? » —, pas la réponse principale. Essayé
    puis écarté : le bloc sous le graphique principal, qui chargeait la visualisation. Bandeau :
    « Modifier » (retour à la saisie) et « × Fermer ». Le graphique est **recréé** à chaque
    ouverture : créé dans une fenêtre cachée, il garde une largeur nulle que `resize()` ne
    corrige pas.
    Un **rappel du curseur d'horizon** (« Bilan dans », `#horizonMel`) ouvre le bloc : les deux
    premiers chiffres se lisent à cette date, et il fallait le rendre visible. Il écrit dans
    `#horizon`, comme le rappel des cumuls — trois contrôles, une seule date.
  - **Quatre réglages, pas plus, en haut** : l'année de mise en location au **curseur** (affichée
    en grand), **Meublé / Nu en deux boutons** (sorti des paramètres avancés : c'est le choix qui
    pèse le plus sur l'impôt ; la liste `#melRegime` reste cachée et sert de source à la valeur),
    et les deux loyers. Le reste — tranche, frais, meubles, vacance, prélèvements — est replié
    dans « Fiscalité et frais ».
  - **Les loyers sont pré-remplis** avec le loyer d'un logement équivalent (bulle 3) l'année de
    la mise en location, tel que le moteur l'a indexé (`annees[N-1].loyerAnnuel`, simple lecture).
    Ils **suivent le curseur tant qu'on ne les a pas touchés** (`data-auto`, état d'interface qui
    ne part jamais dans `params`). Le repère reste affiché sous chaque champ.
  - **Trois chiffres répondent** : « Louer plutôt que revendre » (mis en avant, la vraie
    question), « Face à rester locataire », et « Chaque mois, une fois loué » — le flux net de la
    première année de location (`cashFlowNet / 12`), détaillé poste par poste dans le repli.
    Les deux premiers se lisent à l'horizon du curseur principal ; si la location commence après
    cet horizon, ils affichent « — » et le disent.
  - **Un graphique à trois courbes** : acheter puis revendre, acheter puis louer, rester
    locataire, avec un trait « mise en location ». L'ancien graphique n'avait pas la courbe de
    revente — c'était pourtant la comparaison qui compte.
  - **L'année n'est sauvegardée que location appliquée** : un curseur a toujours une valeur, or
    c'est d'elle que se déduit `melActif` au rechargement. « Nouvelle simulation » retire la
    location et vide ses loyers.
- **La bulle zoomée sort de son alvéole et va sous `<body>`** le temps du zoom, puis y retourne.
  Le rail de gauche a été en `position: sticky` (retiré en octobre 2026 : il défile désormais
  avec la page), et sticky crée **toujours** un contexte
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

## Téléphone (audit du 08/10/2026, 375 et 414 px)

Règles posées par l'audit mobile, à ne pas défaire. Elles vivent en fin de `style.css` et
d'`accueil.css` (sections « Téléphone ») et ne changent rien à la souris ni au-dessus de 560 px.

- **Saisie à 16 px sur écran tactile** (`pointer: coarse`) : en dessous, Safari iOS zoome sur le
  champ touché et laisse la page agrandie, décalée.
- **Zones de contact de 44 px** : le contrôle grandit (lignes des bulles validées, boutons) ou un
  `::after` invisible le prolonge (croix `.mel__fermer`). Le dessin ne change pas.
- **`inputmode="numeric"` sur les montants entiers** (tous `min="0"`). Pas sur les pourcentages :
  le pavé décimal d'iOS en français n'offre que la virgule, qu'un `type="number"` peut refuser.
- **Milliers dans les bulles validées** : `type="number"` n'affiche pas d'espace. Une copie mise
  en forme (`.champ__milliers`, `initialiserMilliers` dans `app.js`) se pose à la place du nombre
  hors focus ; le champ réel reste dans la page et reprend sa place au toucher.
- **Bulle agrandie en une colonne sous 560 px**, et `min-width: 0` sur `.champ__saisie` : sans
  lui, la colonne prend la largeur naturelle de l'entrée et déborde de la fenêtre.
- **Une fenêtre ouverte fige la page** (`html:has(#voile:not([hidden]))`, sous 1040 px) et garde
  son propre défilement (`overscroll-behavior: contain`).
- **Le résultat est amené à l'écran une fois**, à la validation de la dernière bulle, quand la
  page est sur une colonne (`montrerResultatUneFois`). Pas aux retouches suivantes.
- **Plancher de 11 px pour ce qui porte une information** (légendes, unités, avertissement,
  adresse de contact, mention « Calculs faits dans votre navigateur »). Le décor — surtitres,
  folios, tampons, numéros de carte — garde sa taille.
- **Sur une colonne (≤ 1040 px), le résultat suit la quatrième bulle**, et les cartes
  « Scénarios » et « Mise en location » passent dessous : ce sont des suites, débloquées par le
  résultat (décision de Lucas, 08/10/2026). `.plateau__gauche` y est en `display: contents` pour
  que le rail et les deux cartes se placent chacun dans leur zone de grille. Au bureau, rien ne
  change.
- **« Chaque mois » sur téléphone (≤ 720 px) : deux rangées fixes** — point d'équilibre et taux
  d'endettement en haut, Achat et Location côte à côte en bas (décision de Lucas, 08/10/2026).
