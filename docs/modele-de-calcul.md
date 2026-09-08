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

surplus propriétaire  = max(enveloppe×12 − déboursé annuel, 0)
surplus locataire     = max(enveloppe×12 − loyer annuel,    0)
```

Noter le `max(…, 0)` : le modèle ne descend pas en dessous de zéro d'épargne. Il
ne sait donc **pas** représenter un propriétaire en déficit — voir « Limites ».

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

### 2. Enveloppe insuffisante : refus de trancher

Quand l'enveloppe ne couvre pas le coût de propriétaire, les deux `max(…, 0)`
plafonnent les épargnes à zéro et le déficit du propriétaire n'est facturé nulle
part. Le classeur affiche un `WARNING` mais continue d'afficher des chiffres —
qui deviennent très favorables à l'achat, sans aucun sens.

Le simulateur affiche l'alerte **et** neutralise le verdict tant que le scénario
n'est pas finançable.

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

Les deux loyers (perçu et futur) sont saisis **au moment de la bascule** puis
indexés à l'IRL déjà utilisé par le scénario location.

## Fiscalité — location nue (foncier réel)

```
charges déductibles = charges copro + taxe foncière + frais annexes
                    + intérêts d'emprunt + assurance emprunteur
résultat foncier    = revenus bruts − charges déductibles
```

- **Résultat positif** : on impute d'abord le stock de déficit reporté, puis
  `impôt = base × (TMI + prélèvements sociaux)`.
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
dotation = prix × 85 % / 30 ans        (bâti, terrain non amortissable)
         + travaux / 10 ans
         + prix × 5 % / 7 ans          (mobilier)

base imposable = max(0, revenus bruts − charges déductibles − amortissement)
impôt          = base × TMI            (pas de prélèvements sociaux en BIC)
```

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
      + PV imposable × (1 − abattement PS) × prélèvements sociaux
```

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
versement au portefeuille = max(enveloppe annuelle − loyer futur, 0) + cash-flow net
patrimoine = valeur du bien − capital restant dû − impôt de plus-value
           + portefeuille net d'impôt
```

Le versement **peut être négatif** : un cash-flow locatif dégradé ponctionne le
portefeuille. Dans ce cas la base fiscale du portefeuille est réduite d'autant,
ce qui traite le retrait comme un remboursement de capital — approximation
assumée, la réalité étant un retrait au prorata des plus-values latentes.

## Paramètres non exposés dans l'interface

Ils vivent dans `DEFAUTS_LOCATION` et sont modifiables par le code :
durées d'amortissement, quote-part du bâti, part du mobilier, plafond du déficit
imputable, durée de report, taux d'IR sur plus-value (19 %), réintégration des
amortissements.

## Limites propres à ce module

- Le régime réel est supposé dans les deux cas : ni micro-foncier ni micro-BIC.
- La condition de location nue pendant 3 ans après imputation d'un déficit
  foncier n'est pas modélisée (sans objet pour une mise en location durable).
- Pas de tolérance du délai d'un an de vente après départ de la résidence
  principale : la plus-value est due dès la bascule.
- L'amortissement LMNP démarre à la bascule, sur la base du prix d'achat initial,
  sans réévaluation de la valeur d'entrée dans l'activité.
