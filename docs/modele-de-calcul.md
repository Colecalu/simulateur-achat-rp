# Modèle de calcul

Référence : `simulateur-achat-rp-Paris.xlsx` (dans ce dossier).
Implémentation : `frontend/js/calc.js`.
Vérification : `tests/calc.test.mjs` compare les 25 années × 15 grandeurs aux
valeurs réellement calculées par Excel (`tests/fixtures/excel-paris.json`).

En cas de divergence entre le code et le classeur, **le classeur fait foi** —
sauf sur les deux écarts délibérés listés en fin de document.

## Le principe

Les deux trajectoires consomment la **même enveloppe mensuelle** (logement +
épargne). Ce que le logement ne consomme pas part en bourse.

| | Achat | Location |
|---|---|---|
| Sort de l'enveloppe | mensualité + assurance + charges + taxe foncière | loyer |
| Reste investi | le surplus | le surplus |
| Capital de départ investi | capital initial − apport | capital initial (entier) |
| Patrimoine final | bien net de dette + portefeuille net d'impôt | portefeuille net d'impôt |

L'acheteur immobilise son apport dans le bien ; le locataire le garde investi.
C'est cette asymétrie de départ, plus l'écart mensuel, que le modèle arbitre.

## Frais de notaire

Assis sur le **prix net vendeur**, hors travaux et hors frais d'agence :

```
émoluments  = ( min(P, 6 500)                        × 3,870 %
              + max(min(P, 17 000) − 6 500,  0)      × 1,596 %
              + max(min(P, 60 000) − 17 000, 0)      × 1,064 %
              + max(P − 60 000, 0)                   × 0,799 % ) × 1,20   (TVA)
droits de mutation = P × 5,80665 % (ancien)  ou  0,71498 % (neuf)
sécurité immobilière = P × 0,10 %
débours forfaitaires = 1 200 €
```

C'est le poste qui explique qu'un achat revendu trop tôt perde : il est payé
comptant et jamais récupéré à la revente.

## Coût d'acquisition et emprunt

```
coût d'acquisition = prix net vendeur + notaire + agence + travaux + frais bancaires
dettes             = coût d'acquisition − apport
```

La **valeur réelle du bien en année 0** est saisie séparément (`valeurEstimee`) :
c'est ce qu'on retirerait d'une revente immédiate. Elle est généralement
inférieure au coût d'acquisition, et c'est elle — pas le coût — qui sert de base
à la revalorisation annuelle.

## Prêt

Mensualité de crédit constante (`PMT`), assurance calculée **sur le capital
restant dû** et donc décroissante :

```
mensualité       = dettes × r / (1 − (1 + r)^(−n))      avec r = taux/12, n = durée×12
intérêt du mois  = CRD début de mois × r
capital amorti   = mensualité − intérêt
assurance du mois = CRD début de mois × taux assurance / 12
```

Passé la dernière échéance, mensualité et assurance tombent à zéro : il ne reste
que les charges et la taxe foncière.

## Trajectoire annuelle

Pour chaque année `a` (base 1) :

```
valeur du bien        = valeurEstimee × (1 + reval bien)^a
charges de copro      = charges  × (1 + reval charges)^(a−1)
taxe foncière         = taxe     × (1 + reval taxe)^(a−1)
loyer annuel          = loyer×12 × (1 + reval loyer)^(a−1)

déboursé annuel (achat) = intérêts + capital amorti + assurance + charges + taxe
patrimoine immo net     = valeur du bien − capital restant dû

effort déclaré        = loyer actuel + épargne actuelle        (profil, €/mois)

enveloppe achat(a)    = max(enveloppe achat(a−1), déboursé annuel, plancher(a))
enveloppe location(a) = max(enveloppe location(a−1), loyer annuel)
  avec enveloppe(0) = effort déclaré × 12
  et, si le locataire place la différence (défaut) :
  enveloppe achat(a) = enveloppe location(a) = le plus grand des deux

surplus propriétaire  = enveloppe achat(a)    − déboursé annuel   (≥ 0 par construction)
surplus locataire     = enveloppe location(a) − loyer annuel      (≥ 0 par construction)
```

### L'enveloppe s'ajuste au lieu de plafonner l'épargne

L'effort déclaré est un **plancher**. Quand un logement coûte plus — l'achat dès
l'année 1, ou le loyer qui finit par dépasser l'effort —, l'enveloppe **monte** à
ce niveau, et **ne redescend jamais** (cliquet) : qui a tenu un effort pendant des
années a prouvé qu'il le pouvait, et le faire revenir d'un coup à son effort
d'origine supposerait qu'il se mette à dépenser la différence.

Pourquoi c'est nécessaire. L'ancien moteur écrivait `max(enveloppe×12 − coût, 0)` :
le côté qui dépassait l'enveloppe voyait son épargne plafonnée à zéro, et le
dépassement n'était **payé par personne**, pendant que l'autre côté restait bridé
à l'effort déclaré. Mesuré sur le profil par défaut, un effort de 1 500 €/mois
faisait calculer **+454 k€** pour l'achat au lieu de **+106 k€**. L'interface
refusait de trancher quand le dépassement arrivait dès l'année 1, mais pas quand il
arrivait plus tard (un loyer indexé qui rattrape l'effort, par exemple).

`plancher(a)` porte les besoins que calc.js ne connaît pas : le loyer payé ailleurs
après une mise en location (voir `planchersEnveloppe` dans calc-location.js).

### L'épargne forcée : `locatairePlaceDifference`

Quand l'achat coûte plus que l'effort actuel, l'acheteur **doit** relever son
effort — la banque prélève. Le locataire, lui, n'y est obligé par rien.

- **Activé (défaut)** : la même enveloppe des deux côtés. Le locataire place ce que
  l'acheteur rembourse. C'est le **verdict de référence**, et le différenciateur du
  projet : l'écart ne dépend alors plus du tout du profil.
- **Désactivé** : le locataire garde ses habitudes — son effort déclaré, relevé
  seulement si son loyer le dépasse. Seul l'acheteur se serre la ceinture. Le
  patrimoine de l'acheteur est **identique** dans les deux cas ; seul celui du
  locataire baisse, de ce qu'il n'a pas placé.

Ce choix change souvent le verdict de dizaines ou de centaines de milliers d'euros.
Ce n'est pas un réglage de marché, c'est une question sur le comportement de
l'utilisateur : l'interface la pose explicitement, la rappelle sous le verdict, et
dit de combien le verdict bouge quand on la change.

### Portefeuille

Rendement appliqué au capital de début d'année, versement ajouté ensuite :

```
capital = capital × (1 + rendement) + surplus de l'année
impôt latent = max(capital − (capital initial investi + Σ versements), 0) × taux PV
capital net  = capital − impôt latent
```

Le rendement est saisi **brut**. La fiscalité est appliquée une seule fois, à la
sortie, sur la plus-value latente — c'est le régime d'un compte-titres liquidé
d'un coup. Un PEA ou une assurance-vie seraient moins taxés : le taux est éditable
pour cette raison (défaut 31,4 %, flat tax CTO 2026).

### Comparaison

```
patrimoine achat    = patrimoine immo net + capital net (achat)
patrimoine location = capital net (location)
écart               = patrimoine achat − patrimoine location
```

## Deux grandeurs qui ne changent pas la réponse

Le **capital initial** et l'**enveloppe mensuelle** déplacent les deux patrimoines
mais jamais leur écart :

| Capital initial | Écart à 20 ans | Patrimoine achat à 20 ans |
|---|---|---|
| 150 000 € | +84 640 € | 981 823 € |
| 200 000 € | +84 640 € | 1 088 531 € |
| 300 000 € | +84 640 € | 1 301 948 € |

La raison est mécanique : un euro de plus au départ, ou un euro de plus
d'enveloppe, alimente les **deux** portefeuilles à l'identique et subit la même
fiscalité de sortie. Il s'annule donc dans la différence.

Depuis que l'enveloppe s'ajuste, c'est vrai **pour tout effort**, y compris un
effort qui ne couvre pas l'achat — à condition que le locataire place la
différence (le défaut). Sans cette hypothèse, l'effort déclaré compte : c'est
précisément ce qu'il mesure.

L'écart ne dépend que des **asymétries** : l'apport immobilisé dans le bien,
l'écart entre coût de propriétaire et loyer, la revalorisation du bien, et les
frais d'acquisition non récupérables.

## Indicateurs de faisabilité

Les **revenus nets du foyer, avant impôt** sont facultatifs et n'entrent dans
aucun calcul patrimonial. Ils ne servent qu'aux ratios :

```
taux d'endettement      = mensualité (crédit + assurance) / revenus
part de l'effort actuel = effort déclaré / revenus
part de l'effort achat  = enveloppe achat de l'année 1 / revenus
reste à vivre           = revenus − effort (actuel, ou de l'achat)
```

Le taux d'endettement est calculé assurance comprise, comme le fait le HCSF, dont
le plafond usuel est de 35 %, sur les revenus du **foyer** : un couple qui n'en
déclarerait qu'un verrait son taux doubler. Sans revenus renseignés, tous valent
`null` : aucun ratio n'est inventé.

## Écarts délibérés avec le classeur

Deux points ont été corrigés plutôt que reproduits.

### 1. La synthèse du classeur comparait du net à du brut

Dans l'onglet `Projet`, les cellules « Patrimoine 5 / 10 / 20 ans » côté location
(`J7`, `L7`, `N7`) pointent vers la colonne **`T`** de `Bilan_Revente`, qui est le
capital **avant** impôt. Côté achat, `J6`/`L6`/`N6` pointent vers `N`, qui est
**net** d'impôt. La colonne `V` (location nette) existe pourtant, et c'est bien
elle qu'utilise la colonne d'écart `W`.

La synthèse et la colonne d'écart du même classeur donnaient donc des réponses
opposées :

| Horizon | Écart avec `T` (brut) | Écart avec `V` (net) |
|---|---|---|
| 5 ans | −5 460 € | +15 424 € |
| 10 ans | −20 088 € | +36 489 € |
| 20 ans | −103 327 € | +84 640 € |

Le simulateur applique partout la comparaison nette (colonne `W`), conforme à la
règle « toujours net d'impôt des deux côtés ».

### 2. Enveloppe insuffisante : l'enveloppe monte au lieu de plafonner

Quand l'enveloppe ne couvre pas le coût de propriétaire, les `max(…, 0)` du
classeur plafonnent les épargnes à zéro et le déficit du propriétaire n'est
facturé nulle part. Le classeur affiche un `WARNING` mais continue d'afficher des
chiffres — qui deviennent très favorables à l'achat, sans aucun sens.

Le simulateur a d'abord neutralisé le verdict dans ce cas. Il fait désormais
monter l'enveloppe (voir « L'enveloppe s'ajuste »), ce qui rend le verdict juste
au lieu de le taire. Hors de ce cas, les deux modèles coïncident : la fixture
Excel passe au centime sans avoir été touchée.

## Limites du modèle

- Hypothèses constantes sur tout l'horizon : pas d'inflation générale, pas de
  changement de situation, pas de renégociation ni de remboursement anticipé.
- Rendement boursier régulier, ce qu'aucun marché ne fait. La séquence des
  rendements (ordre des bonnes et mauvaises années) est ignorée alors qu'elle
  compte réellement.
- Pas de coût de mobilité côté locataire (déménagements), pas de gros travaux
  imprévus côté propriétaire au-delà des charges saisies.
- Les frais de revente ont été retirés du modèle (arbitrage produit, septembre 2026) :
  ils étaient toujours à 0 et n'entraient pas dans le patrimoine comparé.
- L'horizon est plafonné à 25 ans.


---

# Extension « mise en location »

Implémentation : `frontend/js/calc-location.js`. Tests : `tests/location.test.mjs`.

Le module **consomme** la sortie de `calc.js` (capital restant dû, intérêts,
charges, valeur du bien) sans jamais la recalculer. `calc.js` ignore son existence.

## Principe

À partir d'une année de bascule N, le bien n'est plus revendu : il est loué,
l'utilisateur se loge ailleurs. Avant N, la trajectoire est **strictement celle du
scénario d'achat** — le bien est encore la résidence principale, donc exonéré de
plus-value. Le deuxième graphique compare cette trajectoire au scénario de
location pure, sur la **même échelle Y** que le premier graphique.

## Cash-flow locatif annuel

```
revenus bruts    = loyer perçu × 12 × (1 − taux de vacance)
charges          = frais annexes + charges de copro + taxe foncière
cash-flow avant impôt = revenus bruts − charges − (mensualité crédit + assurance)
```

Les deux loyers (perçu et futur) sont saisis **en euros du moment de la bascule**,
puis indexés à l'IRL à partir de là. C'est le seul endroit de l'application où un
montant n'est pas exprimé en euros d'aujourd'hui, et c'est délibéré : ces montants
décrivent une décision future — relouer son bien, se loger ailleurs, éventuellement
moins cher. Ils n'ont donc pas à suivre la trajectoire du loyer de référence, qui
décrit une autre vie.

Conséquence à connaître : saisir le même montant que le loyer de la barre latérale
revient à se loger **moins cher en euros constants** que le locataire de référence
à la même date. C'est une hypothèse valide, pas une erreur, mais elle doit être
consciente.

## Fiscalité — location nue (foncier réel)

```
charges déductibles = charges copro + taxe foncière + frais annexes
                    + intérêts d'emprunt + assurance emprunteur
résultat foncier    = revenus bruts − charges déductibles
```

- **Résultat positif** : on impute d'abord le stock de déficit reporté, puis
  `impôt = base × (TMI + 17,2 %)` — les revenus fonciers sont exclus de la hausse de
  CSG de la LFSS 2026.
- **Résultat négatif** : la part due aux charges financières (intérêts +
  assurance) n'est **jamais** imputable sur le revenu global et part
  intégralement en report. Le reste est imputable sur le revenu global dans la
  limite de **10 700 €/an** — l'économie d'impôt correspondante
  (`imputable × TMI`) est comptée comme un gain de trésorerie. L'excédent se
  reporte sur les revenus fonciers des **10 années suivantes**.

Les reports sont tenus dans une file datée, purgée **chaque année** — y compris
les exercices déficitaires, sinon un stock jamais consommé ne s'éteindrait jamais.

## Fiscalité — location meublée (LMNP réel, BIC)

```
valeur d'entrée dans l'activité = valeur du bien l'année de la bascule

dotation = valeur d'entrée × 85 % / 30 ans     (bâti, terrain non amortissable)
         + achat de meubles / 7 ans            (mobilier)

base imposable = max(0, revenus bruts − charges déductibles − amortissement)
impôt          = base × (TMI + 18,6 %)         (prélèvements sociaux sur les BIC LMNP, LFSS 2026)
```

Deux choix structurants :

- **La base est la valeur d'entrée dans l'activité**, pas le prix d'achat
  historique. Un bien acheté 420 000 € et mis en location dix ans plus tard alors
  qu'il en vaut 552 311 € s'amortit sur cette dernière valeur. Plus la bascule est
  tardive, plus la dotation est élevée.
- **Les travaux d'acquisition ne sont pas amortis séparément** : réalisés des
  années plus tôt, ils sont déjà fondus dans la valeur du bien à la date d'entrée.
- **Le mobilier est une saisie utilisateur**, pas un forfait. Il est débité du
  portefeuille l'année de la bascule (c'est une vraie dépense) et n'est pas compté
  dans le patrimoine, puisqu'il se déprécie à zéro. En location nue, aucun mobilier
  n'est acheté ni amorti.

L'excédent d'amortissement se reporte **sans limite de montant ni de durée**. Un
déficit BIC hors amortissement s'impute sur les résultats positifs suivants,
avant l'amortissement.

## Plus-value immobilière

L'exonération résidence principale est perdue dès la bascule.

```
prix d'acquisition fiscal = prix net vendeur + frais de notaire + frais d'agence + travaux
plus-value brute          = valeur du bien − prix d'acquisition fiscal
```

Les **frais bancaires d'acquisition** sont exclus : ce sont des frais de prêt, pas
d'acquisition.

Abattements pour durée de détention, comptés **depuis l'achat initial** :

| Détention | Abattement IR | Abattement PS |
|---|---|---|
| < 6 ans | 0 % | 0 % |
| 6 à 21 ans | 6 %/an | 1,65 %/an |
| 22e année | 4 % → exonéré | 1,60 % |
| 23 à 30 ans | exonéré | 9 %/an → exonéré |

```
impôt = PV imposable × (1 − abattement IR) × 19 %
      + PV imposable × (1 − abattement PS) × 17,2 %
```

Les prélèvements sociaux ne sont pas un champ de saisie : ils suivent le régime
(`PRELEVEMENTS_SOCIAUX`, calc-location.js). Jusqu'au 08/10/2026, un seul taux de
18,6 % s'appliquait partout, et aucun aux BIC du meublé — deux erreurs dans des
sens opposés. La plus-value immobilière reste à 17,2 % dans les deux régimes.

Sur un horizon de 25 ans, l'exonération IR est atteinte (22 ans) mais jamais
celle des prélèvements sociaux (30 ans).

**Réintégration des amortissements** : depuis la loi de finances 2025, les
amortissements déduits en LMNP sont réintégrés dans la plus-value imposable. Le
module le fait par défaut en meublé (`reintegrerAmortissements`), comme le fait
le classeur `simulateur-lmnp-premium.xlsx`. La spécification initiale de ce
module ne le prévoyait pas : c'est un écart délibéré, désactivable.

## Patrimoine et portefeuille

Pour chaque année t ≥ N :

```
enveloppe(t)              = max(enveloppe(t−1), enveloppe achat du moteur de base(t), loyer futur(t))
versement au portefeuille = enveloppe(t) − loyer futur(t)
                          + cash-flow net
                          − achat de meubles       (l'année de la bascule seulement)

patrimoine = valeur du bien − capital restant dû − impôt de plus-value
           + portefeuille net d'impôt
```

L'enveloppe suit la même règle que le moteur de base : elle monte si le loyer payé
ailleurs l'exige, et ne redescend jamais. Avec l'enveloppe identique, ce loyer est
aussi transmis au moteur de base comme **plancher** (`planchersEnveloppe`), pour que
le locataire de la comparaison puisse placer la même somme. L'écart achat /
location du moteur de base n'en bouge pas : seul le niveau des enveloppes monte.

Après la bascule, le ménage dispose de l'enveloppe **plus** les loyers encaissés,
et il paie un loyer **et** une mensualité de crédit. La contrainte « même
enveloppe des deux côtés » du premier graphique ne s'applique donc plus ici :
c'est voulu, la double sortie étant financée par un revenu locatif réel.

Le versement **peut être négatif** : un cash-flow locatif dégradé ponctionne le
portefeuille. Dans ce cas la base fiscale du portefeuille est réduite d'autant,
ce qui traite le retrait comme un remboursement de capital — approximation
assumée, la réalité étant un retrait au prorata des plus-values latentes.

## Paramètres non exposés dans l'interface

Ils vivent dans `DEFAUTS_LOCATION` et sont modifiables par le code :
durées d'amortissement (bâti 30 ans, mobilier 7 ans), quote-part du bâti (85 %),
plafond du déficit imputable, durée de report, taux d'IR sur plus-value (19 %),
réintégration des amortissements.

## Limites propres à ce module

- Le régime réel est supposé dans les deux cas : ni micro-foncier ni micro-BIC.
- La condition de location nue pendant 3 ans après imputation d'un déficit
  foncier n'est pas modélisée (sans objet pour une mise en location durable).
- Pas de tolérance du délai d'un an de vente après départ de la résidence
  principale : la plus-value est due dès la bascule.
- Le loyer perçu est un loyer **charges comprises** : on déclare le loyer entier
  et on déduit 100 % des charges de copropriété, sans refacturation séparée des
  charges récupérables.
- Le forfait de frais annexes ne distingue pas ses composants et n'inclut pas la
  CFE ; il ne couvre pas non plus les frais de remise en location entre deux
  locataires.
- Le mobilier n'est jamais renouvelé sur l'horizon, alors qu'il est amorti sur
  7 ans.
