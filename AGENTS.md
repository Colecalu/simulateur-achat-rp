# AGENTS.md

Ce dépôt est travaillé par plusieurs agents en parallèle. Ce fichier est le point d'entrée
commun ; il ne remplace pas la documentation, il y renvoie.

## Avant toute chose

**Lisez [CLAUDE.md](CLAUDE.md).** Il contient le contexte du projet, la règle méthodologique qui
le fonde, les contraintes d'hébergement et les invariants à ne pas enfreindre. Sa section 0
décrit qui fait quoi.

| Sujet | Où |
|---|---|
| Référence générale, invariants, procédures | [CLAUDE.md](CLAUDE.md) |
| Modèle de calcul, formules, écarts assumés | [docs/modele-de-calcul.md](docs/modele-de-calcul.md) |
| Interface, design, visualisation | [docs/conventions-ui.md](docs/conventions-ui.md) |
| Backend (spécifié, **en pause**) | [docs/backend-spec.md](docs/backend-spec.md) |

## Les six invariants

Une proposition qui enfreint l'un d'eux est refusée, quelle que soit sa qualité par ailleurs.
Le détail et les raisons sont dans CLAUDE.md.

1. **L'enveloppe mensuelle identique** entre achat et location — le différenciateur du projet.
2. **La fiscalité appliquée une seule fois, à la sortie**, jamais annuellement.
3. **Pas d'étape de build, pas de modules ES** — contrainte d'hébergement mutualisé.
4. **`frontend/js/calc.js` reste un module pur** : pas de DOM dedans, pas de finance ailleurs.
5. **Les paramètres restent séparés de l'état d'interface.**
6. **Aucun style en ligne, aucun `innerHTML` sur une donnée utilisateur.**

## L'arbitre

```bash
node --test "tests/*.test.mjs"
```

76 tests. La fixture `tests/fixtures/excel-paris.json` compare 25 années × 15 grandeurs aux
valeurs calculées par le classeur de référence, **au centime près**. Une proposition qui casse
ces tests est rejetée ; si l'écart est délibéré, il se discute et se documente avant, pas après.

## Cohabitation

- `main` et ses branches de feature sont la ligne produit, tenue par Claude Code.
- Les branches d'expérimentation appartiennent à leur auteur. **Ne rien supprimer, fusionner ni
  modifier chez les autres sans demande explicite de Lucas.**
- **Git est la source de vérité.** Une décision d'architecture, de moteur financier ou de
  structure produit se documente au moment où elle est prise — dans CLAUDE.md, dans `docs/`, ou
  au minimum dans le message de commit, avec le *pourquoi* et non seulement le *quoi*.

## Un avertissement pratique

`frontend/js/app.js` et `frontend/css/style.css` sont deux gros fichiers uniques. Deux agents qui
les modifient en parallèle produisent des conflits où les deux versions sont correctes.

Une expérimentation d'interface gagne donc à se juger **sur l'idée** — captures, description,
prototype — plutôt qu'à se fusionner telle quelle.
