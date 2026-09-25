# AGENTS.md — protocole de travail

Ce dépôt est travaillé par plusieurs agents en parallèle. Ce fichier est le point d'entrée commun
et le protocole d'expérimentation. Il est écrit pour être lu **avant** de produire quoi que ce
soit.

| Rôle | Qui | Périmètre |
|---|---|---|
| Développement principal, continuité du produit | **Claude Code** | `main` et ses branches de feature |
| Laboratoire, contre-propositions, UI / UX / design | **Codex** | ses propres branches, jamais `main` |
| Réflexion produit, audit financier, coordination | **ChatGPT** | pas de code |
| Décision finale | **Lucas** | — |

**Git est la source de vérité.** Une décision d'architecture, de moteur financier ou de structure
produit se documente au moment où elle est prise — dans `CLAUDE.md`, dans `docs/`, ou au minimum
dans le message de commit, avec le *pourquoi* et pas seulement le *quoi*.

---

## 1. Lire avant de proposer

| Sujet | Où |
|---|---|
| Référence générale, invariants, procédures | [CLAUDE.md](CLAUDE.md) |
| Modèle de calcul, formules, écarts assumés | [docs/modele-de-calcul.md](docs/modele-de-calcul.md) |
| **Décisions d'interface, et leurs raisons** | [docs/conventions-ui.md](docs/conventions-ui.md) |
| Backend — spécifié, **en pause** | [docs/backend-spec.md](docs/backend-spec.md) |

`docs/conventions-ui.md` mérite une mention particulière : **chaque règle qu'il contient répond à
un problème observé à l'écran, souvent mesuré.** Un choix qui paraît arbitraire y a presque
toujours une raison écrite juste à côté. La lire avant de proposer l'inverse fait gagner du temps
à tout le monde — et permet de la contredire utilement, avec la vraie raison en face.

---

## 2. Les six invariants

Une proposition qui enfreint l'un d'eux est refusée, quelle que soit sa qualité par ailleurs. Ce
ne sont pas des préférences de style : chacun tient le produit ou son argument debout.

**1. L'enveloppe mensuelle globale identique.**
Les deux trajectoires — achat et location — disposent exactement du même budget mensuel, réparti
entre logement et investissement. On ne compare jamais une mensualité à un loyer, on compare deux
trajectoires de patrimoine. *C'est le différenciateur du projet.* Tout ce qui le dilue le tue.

**2. La fiscalité s'applique une seule fois, à la sortie.**
`max(valeur − cumul des versements ; 0) × taux`, jamais annuellement. Le portefeuille capitalise
brut ; l'impôt n'est retranché que pour afficher le patrimoine net à l'année considérée. C'est un
piège classique : « corriger » ce point en imposant chaque année est faux.

**3. Pas d'étape de build, pas de modules ES.**
Contrainte d'hébergement, pas de goût. Cible : OVH mutualisé d'entrée de gamme, déploiement FTP,
pas de Node côté serveur, pas d'accès SSH garanti. Les modules ES sont bloqués par CORS en
`file://`, ce qui rendrait la page inerte à l'ouverture par double-clic.
**Proposer Vite, React, Tailwind ou un bundler est la recommandation la plus fréquente et la
moins applicable ici.** Elle sera refusée sans discussion.

**4. `frontend/js/calc.js` reste un module pur.**
Aucune logique financière ailleurs, aucun accès au DOM dedans. C'est ce qui le rend testable sous
Node et réutilisable ailleurs. `calc-location.js` montre le patron à suivre pour toute variante :
un module isolé qui **consomme** la sortie du moteur, jamais une réécriture.

**5. Les paramètres restent séparés de l'état d'interface.**
`params` décrit un projet et partira tel quel vers le compte utilisateur, le jour où il existera.
L'état de l'interface — quelle bulle est validée, quel panneau est ouvert — vit ailleurs. Mélanger
les deux compromettrait la sauvegarde serveur avant même qu'elle existe.

**6. Aucun style en ligne, aucun `innerHTML` sur une donnée utilisateur.**
Une CSP stricte est prévue, sans `unsafe-inline`. Les couleurs dynamiques passent par des classes
alimentées par les jetons de thème. Le nom d'une simulation sera saisi par l'utilisateur : c'est
le vecteur XSS évident.

---

## 3. L'arbitre

```bash
node --test "tests/*.test.mjs"
```

**76 tests.** `tests/fixtures/excel-paris.json` compare 25 années × 15 grandeurs aux valeurs
calculées par le classeur de référence, **au centime près**.

Une proposition qui casse ces tests est rejetée. Si l'écart est délibéré, il se discute et se
documente **avant**, pas après.

**Le meilleur apport possible est un test qui échoue** : c'est objectif, ça survit aux sessions,
et ça tranche sans débat d'opinion. Si vous pensez qu'une règle du modèle est fausse, écrivez le
test qui le prouve plutôt que l'argument qui le suggère.

---

## 4. Trois natures d'expérimentation, trois traitements

La séparation n'est pas bureaucratique : elle existe parce que le coût de réconciliation n'est pas
le même selon ce qu'on touche.

### Type A — Design pur : couleurs, typographie, espacements, rayons, ombres

**Un seul fichier : `frontend/css/theme-codex.css`.**

L'architecture s'y prête déjà, et c'est vérifié : `style.css` (1 455 lignes) ne contient **aucune
couleur en dur et aucun nom de rampe** — que de la structure en noms sémantiques français
(`--plan`, `--encre`, `--accent`, `--achat`…). `theme-perron.css` (141 lignes) ne contient **que
des valeurs**.

Copier `theme-perron.css`, changer les valeurs, garder tous les noms sémantiques. **Zéro conflit
possible**, et comparaison directe en changeant une balise `<link>`.

Si un rôle manque pour exprimer une idée, le dire : on l'ajoute aux deux thèmes plutôt que
d'écrire une couleur dans `style.css`.

⚠️ Les couleurs de séries de données sont **validées au ΔE** (séparation en vision normale et sous
daltonisme). Voir `docs/conventions-ui.md` : plusieurs combinaisons esthétiquement séduisantes ont
été écartées parce que deux courbes devenaient indiscernables. Une palette proposée doit passer le
même contrôle.

### Type B — UX et structure : parcours, disposition, composants

Là, il faut toucher `index.html`, `app.js` et `style.css`. Pas d'échappatoire.

**Branche `codex/<sujet>`, courte, et qui ne sera pas fusionnée.**

Sa sortie est une **démonstration à regarder**, pas du code à intégrer. Ce qui est retenu est
réimplémenté dans la ligne du produit — c'est plus rapide que de résoudre un conflit où les deux
versions sont correctes, et le résultat reste cohérent avec le reste.

**Règle de fraîcheur : au-delà d'une semaine, une branche a trop dérivé pour être comparable.** On
ne compare plus une idée, on compare deux états du produit à deux dates.

### Type C — Moteur financier, modèle, données

**Pas de branche.** Un test qui échoue, ou un paragraphe argumenté dans `docs/modele-de-calcul.md`.

---

## 5. Ce qu'on attend d'un livrable

Pour un type A ou B, le plus utile est un court document accompagnant la branche :

1. **Le problème visé** — ce qui ne va pas aujourd'hui, si possible constaté et non supposé.
2. **Ce qui a été changé**, et pourquoi.
3. **Des captures** — c'est ce qui sera regardé en premier.
4. **Ce qui a été volontairement laissé de côté.**
5. **Les invariants touchés, s'il y en a**, et l'argument pour.

Un livrable qui dit « j'ai refait l'interface » sans dire quel problème il résout est
inexploitable, même s'il est plus beau.

---

## 6. Où la contradiction serait la plus utile

Honnêtement, les zones faibles du produit aujourd'hui :

- **La visualisation du pilier 3 (mise en location).** Le moteur est complet — LMNP réel contre
  foncier réel, déficit foncier avec report sur dix ans, réintégration des amortissements,
  abattements de plus-value, 20 tests. Et ça se résume à l'écran à un lien discret et une courbe.
  **C'est le plus gros écart entre ce qui est calculé et ce qui est montré.**
- **Les dix premières secondes.** Un visiteur arrive sur un plateau de bulles vides. Est-ce qu'il
  comprend ce qu'on lui propose ?
- **Le parcours de découverte des scénarios.** Refait récemment, jamais confronté à un vrai
  utilisateur.
- **L'accessibilité clavier** des fenêtres modales : pas de piège de focus aujourd'hui.
- **Le mobile.** Fonctionnel, vérifié à 420 px, mais jamais pensé pour.

## 7. Ce qui n'est pas ouvert

- **Les six invariants** ci-dessus.
- **Le backend** : spécifié dans `docs/backend-spec.md`, **implémentation en pause**. Ne pas
  proposer de travail dessus.
- **La dette des données MSCI World** : déjà identifiée, documentée en section 8 de `CLAUDE.md`,
  bloquante pour la mise en ligne. Inutile de la redécouvrir — elle est traitée séparément.
- **Le classeur Excel fait foi** pour les formules, sauf deux écarts délibérés documentés.

## 8. Cohabitation

- `main` et ses branches de feature appartiennent à Claude Code. **Ne rien y modifier.**
- Les branches `codex/*` appartiennent à Codex. Claude Code n'y touche pas, ne les fusionne pas
  et ne les supprime pas.
- En cas de doute sur la propriété d'un fichier ou d'une branche : demander à Lucas, ne pas
  trancher seul.
