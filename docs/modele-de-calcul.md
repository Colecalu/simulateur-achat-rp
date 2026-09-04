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
- Les frais de revente s'appliquent au « cash net si revente », mais **pas** au
  patrimoine total comparé — reproduit du classeur ; sans effet tant que le champ
  vaut 0.
- L'horizon est plafonné à 25 ans.
