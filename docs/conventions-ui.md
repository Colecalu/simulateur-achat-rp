# Conventions d'interface et de visualisation

Ce document rassemble les décisions d'interface, de design et de visualisation du
simulateur. Chacune a été prise en réponse à un problème observé à l'écran, souvent
mesuré : la raison est indiquée à chaque fois, parce que c'est elle qui dit s'il faut
la revoir ou la respecter.

Il est séparé de [CLAUDE.md](../CLAUDE.md), qui reste un document de référence court.
Toute session qui touche à `frontend/index.html`, `frontend/css/` ou `frontend/js/app.js`
doit le lire.

---

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

## Scénarios de marché (deuxième pilier)

Le simulateur repose sur trois piliers différenciants : **(1)** comparer deux trajectoires
complètes pour capter le coût d'opportunité — fait ; **(2)** des scénarios adossés à des séries
réelles — en cours ; **(3)** la mise en location ultérieure — moteur fait, visualisation à faire.

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
  « Mes hypothèses », qui n'est pas dans le fichier — c'est l'absence de scénario, et elle lit les
  champs de la bulle 4. Les noms désignent l'ÉVÉNEMENT de marché, jamais l'issue pour l'acheteur.
- **La découverte se fait en DEUX TEMPS**, portés par `data-etat` sur `#scenario` :
  1. `bloque` — tant que les quatre bulles ne sont pas validées. L'accroche dit pourquoi.
  2. `ferme` — un simple appel. Le clic ouvre une fenêtre qui explique **ce qu'on cherche à
     faire, et rien d'autre** : pas un seul nom de scénario. Sept noms de décennies ne veulent
     rien dire tant qu'on n'a pas dit ce qu'on en fait, ni prévenu que la seconde moitié des
     courbes est extrapolée.
  3. `ouvert` — la liste remplace l'appel dans le rail et y reste. Chaque ligne porte son nom, sa
     période, et un bouton qui ouvre l'aperçu des courbes.
- **L'explication reste relisible** par le « ? » à côté du titre. Ne pas la réduire à un affichage
  unique qu'on ne peut plus rappeler.
- **L'accueil tient en trois paragraphes** : ce que fait le module ; le fait que chaque décennie ne
  fournit qu'une dizaine d'années et que le reste est extrapolé ; et pourquoi ces décennies ne se
  reproduiront pas — l'immobilier français part d'un niveau de prix qui interdit mécaniquement de
  refaire les hausses des années 2000. Les sources et réserves restent par scénario, dans son
  aperçu : les remonter ici serait exactement la surcharge qu'on cherche à éviter.
- **Appliquer se fait d'un clic sur la ligne**, l'aperçu s'ouvre par l'icône à droite. Ouvrir un
  aperçu n'applique rien.
- **Trois groupes dans la liste** : « Décennies observées », « Sans aucune projection » (le seul
  scénario dont rien n'est projeté — d'où sa famille `continu` et sa bordure pointillée),
  « Scénarios construits ». « Mes hypothèses » est en tête, hors groupe.
- **La note sous la liste dit ce qui est observé et ce qui est extrapolé** pour le scénario
  appliqué : « 11 années observées (2008-2018), puis 8,2 % par an — extrapolé ».
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
- **« Mes hypothèses » rend les valeurs intactes** : elles sont mises de côté au premier scénario
  appliqué, jamais écrasées.
- **L'avertissement de bas de page change avec le scénario** : « hypothèses constantes » devient
  faux dès qu'une série tourne.
- **L'aperçu est une fenêtre à part**, ouverte par l'icône de courbe d'une ligne : une fenêtre qui
  trace ses trois séries (marchés, immobilier, loyers) **en base 100**, sur l'horizon complet. On trace la
  VALEUR, pas le taux : une suite de pourcentages est une dérivée, on la lit mal et on ne voit pas
  où elle mène. En base 100, deux décennies de moyenne identique mais d'ordre différent se
  séparent à l'œil — ce qui est précisément le propos du pilier. Les taux année par année sont
  rappelés sous la courbe (`.suites`) : la courbe dit où l'on arrive, la suite par quoi on y
  passe. Ces deux lignes tiennent lieu de légende, il n'y en a pas d'autre.
- La répétition de la série est **visible** sur la courbe : c'est une propriété du modèle, pas un
  détail à cacher. « Mes hypothèses » a son aperçu aussi — deux courbes lisses et « +5 chaque
  année » sous le graphique ; la comparaison avec une décennie réelle est tout l'argument.
- **Un seul axe, même quand les échelles divergent** (marchés à 1 043 contre immobilier à 313 sur
  le scénario porteur). Deux axes Y mentiraient sur l'écart réel.
- **Ouvrir un aperçu n'applique rien.** Regarder et choisir sont deux gestes distincts.
- **Les deux fenêtres vivent hors du rail de gauche**, à côté du voile. Le rail est
  `position: sticky`, donc un contexte d'empilement : une fenêtre qui y resterait passerait sous
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
- **Une seule visualisation par défaut** : le graphique du patrimoine net d'impôt et l'encadré
  « si vous revendez dans… ». Les modules « D'où vient cet écart ? » et « mise en location »
  restent masqués jusqu'à un clic. Cette sobriété est un choix assumé — ne pas rajouter
  d'indicateurs ou de graphiques sans demande explicite.
- **La section « D'où vient cet écart ? »** est repliée derrière un vrai bouton d'appel (`.cta`,
  plein, centré). Le lien texte discret du module de mise en location ne suffisait pas ici : il
  arrive après un graphique qui occupe tout l'écran et personne ne le voyait. Une fois ouvert, le
  bouton redevient discret (`.cta[aria-expanded="true"]`) — il n'a plus rien à appeler.
- **Deux contrôles d'horizon, une seule date.** Le rappel du curseur (`#horizonBis`) évite de
  remonter en haut de page pour régler l'année. Il **écrit dans** `#horizon`, qui reste la source
  de vérité, et `afficherVerdict` réécrit les deux libellés. Ne jamais leur donner deux valeurs
  indépendantes : deux dates à l'écran, c'est la garantie qu'on finit par comparer deux instants
  différents sans s'en apercevoir.
- **Quatre chiffres sur une ligne** (`.kpis`), centrés : point d'équilibre, mensualité du crédit,
  coût mensuel réel, loyer versé. Pas de carte par chiffre — un filet vertical suffit.
  Le **coût mensuel réel** (`coutMensuelProprio`, 2 634 €) **contient** la mensualité
  (`mensualiteTotale`, 2 385 €, assurance comprise mais jamais mentionnée) : c'est délibéré. On
  montre ce que le propriétaire sort chaque mois, tout compris, face au loyer — pas une
  décomposition dont il faudrait faire la somme. Un test vérifie que ce chiffre vaut bien
  mensualité + charges de possession, sans quoi son libellé mentirait (à l'euro près :
  `mensualiteTotale` porte l'assurance du premier mois, `coutMensuelProprio` la moyenne de la
  première année).
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
  l'enveloppe est insuffisante, le côté achat dépasse : c'est voulu, on le montre.
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
