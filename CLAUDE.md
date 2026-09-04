# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> État actuel : le dépôt est vide (aucun commit, aucun fichier source). Ce document décrit
> l'intention du projet. Il devra être mis à jour dès que le code, les commandes de build/test
> et le déploiement existent réellement.

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

Référence : le fichier Excel dans `/docs` (à ajouter au dépôt). En cas de divergence entre le code
et l'Excel, l'Excel fait foi.

- Enveloppe globale mensuelle fixe, répartie en mensualité + charges (achat) ou loyer (location).
  Le surplus de chaque côté est investi en bourse.
- Rendement bourse saisi en **brut**, pas net d'impôt.
- Fiscalité de sortie sur plus-values : taux **éditable par l'utilisateur**, défaut 31,4 %
  (flat tax CTO 2026). Ne pas coder ce taux en dur — PEA et assurance-vie ont d'autres taux.
- Frais de notaire : formule différenciée **Ancien / Neuf**.
- Patrimoine net immobilier = valeur du bien − capital restant dû.
- La comparaison finale est toujours **nette d'impôt des deux côtés**.

## Conventions

- Interface et labels en français.
- [à compléter : convention de nommage des variables, style de code]

## Workflow Git

- Développement sur branches de feature, **jamais directement sur `main`**.
- Merge sur `main` = déclenche le déploiement automatique vers OVH (à configurer).
