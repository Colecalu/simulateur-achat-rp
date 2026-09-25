# CLAUDE.md

Document de référence du projet. Court par nature : le détail vit dans `docs/`.

| Sujet | Où |
|---|---|
| Modèle de calcul, formules, écarts assumés | [docs/modele-de-calcul.md](docs/modele-de-calcul.md) |
| Interface, design, visualisation | [docs/conventions-ui.md](docs/conventions-ui.md) |
| Backend : comptes, sauvegarde, sécurité, RGPD | [docs/backend-spec.md](docs/backend-spec.md) — **en pause** |
| Design system Perron | [docs/design/README.md](docs/design/README.md) |

## Commandes

```bash
node --test "tests/*.test.mjs"   # 74 tests : moteur, location, indicateurs, séries, sauvegarde
```

Le motif est entre guillemets : `node --test tests/` échoue sous Windows (Node tente de charger
le dossier comme un module), et un glob non quoté n'est pas développé par tous les shells.

Pas de build. `frontend/` est servi tel quel.

**Pour lancer le site en local : double-cliquer sur `lancer-le-site.cmd`** à la racine. Il ouvre
`http://localhost:4173`, toujours la même adresse, et prévient si la branche courante ne contient
pas la sauvegarde locale. Équivalent en ligne de commande :
`npx http-server frontend -p 4173 -c-1`.

⚠️ **Ne jamais tester en ouvrant `index.html` par double-clic.** L'adresse devient `file://`, où
le navigateur refuse une partie de ce dont le site a besoin — c'est la même raison qui interdit
les modules ES dans ce projet.

---

## 0. Plusieurs agents travaillent sur ce dépôt

| Rôle | Qui | Périmètre |
|---|---|---|
| Développement principal, continuité du produit | **Claude Code** | `main` et ses branches de feature |
| Laboratoire, contre-propositions, UI/UX alternatives | **Codex** | ses propres branches, jamais `main` |
| Réflexion produit, audit, finance, coordination | **ChatGPT** | pas de code |
| Décision finale | **Lucas** | — |

**Git est la source de vérité.** Les décisions d'architecture, de moteur financier et de structure
produit sont documentées ici et dans `docs/` — c'est ce qui permet à un autre agent de comprendre
*pourquoi* un choix a été fait avant de proposer le contraire.

Le protocole d'expérimentation est dans **[AGENTS.md](AGENTS.md)** : trois natures
d'expérimentation et leur traitement, format attendu d'un livrable, zones où la contradiction est
la plus utile. C'est le fichier que lisent les autres agents — le tenir à jour quand une décision
structurante change.

### Règles de cohabitation

- **Ne jamais supprimer, fusionner ni modifier une branche, un worktree ou un fichier
  d'expérimentation** sans demande explicite. Toute branche qui n'est pas `main` ni une branche
  de feature ouverte par Claude Code est à considérer comme une expérimentation en cours.
- **Une expérimentation ne remplace jamais l'implémentation en place automatiquement.** Elle est
  analysée sur demande, puis intégrée, adaptée ou écartée — décision de Lucas.
- **Les 76 tests sont l'arbitre.** Une proposition qui les casse est rejetée, quelle que soit son
  élégance. La fixture Excel compare 25 années × 15 grandeurs **au centime** : elle ne se
  contourne pas, elle se respecte ou se discute explicitement.

### Ce qu'une proposition ne peut pas enfreindre

Ces invariants ne sont pas des préférences de style. Les enfreindre casse le produit ou son
argument, et doit entraîner un refus même si le reste est bon :

1. **L'enveloppe mensuelle identique** (§1) — le différenciateur du projet.
2. **La fiscalité appliquée une seule fois, à la sortie** (§2) — jamais annuellement.
3. **Pas d'étape de build, pas de modules ES** (§3) — contrainte d'hébergement, pas de goût.
4. **`calc.js` reste pur** : aucune logique financière ailleurs, aucun accès au DOM dedans.
5. **`params` reste séparé de l'état d'interface** (§4) — condition du backend à venir.
6. **Aucun style en ligne, aucun `innerHTML` sur une donnée utilisateur** (§5).

### La friction à anticiper

`frontend/js/app.js` (1 578 lignes) et `frontend/css/style.css` (1 455 lignes) sont **deux gros
fichiers uniques**. Deux agents qui les modifient en parallèle produisent des conflits où les deux
versions sont correctes — le pire cas à résoudre.

Conséquence pratique : **une expérimentation d'interface se juge sur l'idée, pas sur le
diff.** Captures, description, prototype — puis réimplémentation dans la ligne du produit. Fusionner
le code d'une branche d'expérimentation UI est possible mais coûteux, et rarement le bon réflexe.

---

## 1. Le projet

Site public, en français, pour les **primo-accédants en France** qui hésitent entre acheter
leur résidence principale et rester locataires en investissant la différence.

Positionnement : **simple d'usage, pédagogique, mais perçu comme extrêmement complet.** Tout
est pris en compte — frais de notaire ancien/neuf, taxe foncière, copropriété, indexation IRL,
assurance emprunteur, fiscalité de sortie, scénarios de marché réels, mise en location.

### La règle absolue : l'enveloppe mensuelle globale identique

Les deux trajectoires disposent **exactement du même budget mensuel**, réparti entre coût du
logement et investissement. On ne compare jamais une mensualité à un loyer : on compare deux
**trajectoires de patrimoine**.

| | Achat | Location |
|---|---|---|
| Sort de l'enveloppe | mensualité + assurance + charges + taxe foncière | loyer |
| Reste investi en bourse | le surplus | le surplus |
| Capital de départ investi | capital initial − apport | capital initial entier |
| Patrimoine final | bien net de dette + portefeuille net d'impôt | portefeuille net d'impôt |

**C'est le différenciateur principal du projet. Toute évolution du code doit le préserver.**
Un test verrouille la propriété qui en découle : le capital initial et l'enveloppe ne changent
pas l'écart, seulement les niveaux — ils s'annulent dans la différence. Conséquence produit :
le profil détermine la **faisabilité**, pas la réponse.

### Les trois piliers

1. **Comparaison à coût d'opportunité** — les deux trajectoires complètes. *Fait.*
2. **Scénarios de marché réels** — des séries année par année, observées et sourcées, plutôt
   qu'un taux constant. *Fait, données à consolider.*
3. **Mise en location de la RP** — et si, au lieu de revendre, vous la louiez ? *Moteur fait,
   visualisation à reprendre.*

**Décision produit validée : les trois piliers sont accessibles à tous, sans compte ni
connexion.** Aucune fonctionnalité de calcul n'est jamais bloquée derrière la connexion. Le
compte sert **uniquement** à sauvegarder et retrouver ses simulations.

---

## 2. Règles de calcul

Détail et démonstrations dans [docs/modele-de-calcul.md](docs/modele-de-calcul.md). Le classeur
`docs/simulateur-achat-rp-Paris.xlsx` (onglets Projet, Amortissement_prêt,
Amortissement_annuel_prêt, Flux_Achat_RP, Bilan_Revente) **fait foi** pour les formules, sauf
les écarts délibérés documentés en fin de ce document-là.

- **Rendements boursiers saisis bruts.** La fiscalité s'applique **une seule fois, à la sortie**,
  sur la plus-value nette cumulée : `max(valeur − cumul des versements ; 0) × taux`. **Jamais
  annuellement** — le portefeuille capitalise brut, l'impôt n'est retranché que pour afficher le
  patrimoine net à l'année considérée.
- **Taux de fiscalité éditable**, 31,4 % par défaut (flat tax CTO 2026). Ne jamais le coder en
  dur : PEA et assurance-vie ont d'autres taux.
- **Données historiques : indices dividendes réinvestis (total return), jamais des indices de
  prix.** Un indice de prix sous-estime le rendement de 2 points par an et fausserait tout.
- Frais de notaire : formule différenciée **Ancien / Neuf**.
- Patrimoine net immobilier = valeur du bien − capital restant dû.
- La comparaison finale est **nette d'impôt des deux côtés**.
- Un taux du moteur est **un nombre ou une série année par année** (`tauxAnnee`, `facteur`).
  Une série plus courte que l'horizon n'est **jamais rejouée en boucle** : le prolongement est
  une décision de scénario, explicite et tracée à l'écran.
- Le **salaire net est facultatif** et n'entre dans aucun calcul patrimonial : il ne sert qu'au
  taux d'endettement. Non renseigné, l'indicateur vaut `null` — jamais un ratio inventé.

Tout changement du moteur doit laisser `node --test "tests/*.test.mjs"` au vert : la fixture contient les
valeurs réellement calculées par Excel sur 25 ans, au centime près.

---

## 3. Stack et contraintes

| | |
|---|---|
| Front | HTML / CSS / JavaScript **vanilla** + Chart.js (CDN). Pas de framework, **pas d'étape de build**. |
| Calculs | **100 % dans le navigateur.** Le serveur ne calcule jamais rien. |
| Backend | PHP 8 + MySQL, **uniquement** pour les comptes et la sauvegarde. |
| Hébergement | OVH mutualisé d'entrée de gamme (pas encore souscrit). |
| Déploiement | GitHub Actions → FTPS, au merge sur `main`. |

**Hypothèses d'hébergement à respecter** : pas de Node côté serveur, **pas d'accès SSH garanti**,
déploiement par FTP, base gérée via phpMyAdmin. Conséquences : pas de `composer install` sur le
serveur, pas de migrations automatiques, aucune dépendance qui exige une étape de compilation.

**Pas de modules ES** (`import` / `export`, `<script type="module">`) : bloqués par CORS en
`file://`, ce qui rend la page inerte à l'ouverture par double-clic. Scripts classiques en IIFE ;
`calc.js` s'expose en `window.SimuRP` côté navigateur et en `module.exports` côté Node, et doit
être chargé **avant** `app.js`.

---

## 4. Architecture du dépôt

```
frontend/                    servi tel quel, racine web en production
  index.html
  css/  style.css            structure seule : aucune couleur, aucune police
        theme-perron.css     thème de référence — valeurs uniquement
        theme-foret.css      gelé, conservé comme point de comparaison
  js/   calc.js              moteur PUR : window.SimuRP / module.exports
        calc-location.js     pilier 3 — CONSOMME calc.js, ne le modifie jamais
        scenarios.js         pilier 2 — données de marché, pas de logique
        sauvegarde.js        brouillon local + migration de schéma (testé)
        app.js               tout le DOM, toute l'interface
backend/                     vide aujourd'hui — voir docs/backend-spec.md
docs/                        modèle, conventions UI, spec backend, design, Excel
tests/                       node --test, 56 tests
migrations/                  à créer : SQL numéroté, appliqué à la main
```

### Conventions de code

- Interface, libellés, noms de variables, de fonctions et de classes CSS **en français**.
- JS en `camelCase`, classes CSS en `bloc__element--modificateur`.
- **`calc.js` est un module pur** : aucune logique financière ailleurs, aucun accès au DOM
  dedans. C'est ce qui le rend testable sous Node.
- **Toute variante de scénario suit le patron de `calc-location.js`** : un module isolé qui lit
  le résultat de `calc.js`, jamais une réécriture du moteur.
- Les taux se saisissent en **pourcentage** à l'écran et se stockent en **fraction** dans le
  modèle. Conversion dans `app.js`, jamais dans `calc.js`.
- **Code commenté** : un commentaire dit *pourquoi*, pas *quoi*. Les décisions contre-intuitives
  (et il y en a beaucoup ici) doivent porter leur justification.
- **Aucune dépendance inutile.** Chaque ajout doit survivre à un déploiement FTP sans Composer
  ni npm côté serveur.

---

### Sauvegarde locale et versions de schéma

La saisie en cours est écrite dans le `localStorage` (`simurp.brouillon`), en différé d'une
demi-seconde. Fermer l'onglet ne fait rien perdre, sans compte ni réseau.

- **`params` décrit un PROJET** — les champs du moteur, ceux de la mise en location, le scénario
  appliqué et l'horizon. C'est ce qui partira tel quel vers le compte. **Aucun état d'interface
  dedans.**
- **`avancement` décrit CETTE session dans CE navigateur** — profil validé, bulles validées. Il
  vit dans l'enveloppe du brouillon, jamais dans `params`, et ne partira jamais en base. Sans
  lui, rouvrir l'onglet afficherait un résultat complet alors que l'utilisateur n'a rempli
  qu'une bulle — ce qu'on s'interdit.
- **Tout le reste se déduit** : l'ouverture du module de mise en location se lit dans la présence
  d'une année de bascule. Ne pas stocker ce qui se déduit.
- **`SCHEMA_VERSION` ne s'incrémente que si une ancienne sauvegarde ne se relit plus à
  l'identique.** Ajouter un champ ne casse rien : `normaliser()` lui donne son défaut.
- **`migrer()` ne lève jamais.** Sauvegarde corrompue, version future, migration qui plante :
  elle rend `null` et le front repart d'un brouillon vide. Le simulateur doit marcher même quand
  la sauvegarde ne marche pas.
- **Piège vérifié** : un champ dont le défaut est `null` (`anneeBascule`) ne dit rien de son type.
  Se fier au type du défaut pour valider fait perdre la valeur au rechargement — silencieusement.
  Deux tests le verrouillent, dont un aller-retour sur tous les champs.
- **L'état de la sauvegarde est VISIBLE** (`#brouillonEtat`, sous « Réinitialiser ») : « Brouillon
  enregistré à 11:57 », « Simulation restaurée », ou l'avertissement franc quand le navigateur
  refuse le stockage. Une sauvegarde silencieuse qui échoue est indiscernable d'une sauvegarde qui
  marche — jusqu'au moment où l'utilisateur perd son travail. Ne pas la faire taire.
- **`Sauvegarde.disponible()` écrit pour de vrai** avant de conclure. La présence de l'objet
  `localStorage` ne prouve rien : navigation privée, politique d'entreprise, quota plein ou
  cookies bloqués le laissent en place et font échouer l'écriture.
- **Trois déclencheurs d'écriture** : `input` (la frappe), `change` (les listes déroulantes et les
  modes de saisie qui n'émettent pas `input`), et `pagehide` qui force l'écriture en attente.
  Sans ce dernier, fermer l'onglet dans la demi-seconde suivant une frappe perdrait exactement ce
  que le différé devait protéger.

---

## 5. Backend — EN PAUSE

> **Architecture spécifiée dans [docs/backend-spec.md](docs/backend-spec.md), implémentation en
> pause. Ne pas démarrer sans demande explicite.**
>
> Les étapes 0 et 2 à 10 (Docker, socle PHP, MySQL, emails, comptes, RGPD, déploiement) sont
> gelées. L'étape 1 — la sauvegarde locale — est faite et reste en service : elle ne dépend
> d'aucun serveur.

**La spécification continue de s'appliquer à ce qui se construit côté front**, parce que ce sont
ces choix-là qui coûteront cher à défaire :

- **Les paramètres restent séparés de l'état de l'interface.** `params` décrit un projet et
  partira tel quel vers le compte ; tout le reste vit ailleurs.
- **`SCHEMA_VERSION` et les migrations se mettent à jour à chaque nouveau champ.** Ajouter un
  champ ne demande rien de plus que son défaut ; le renommer ou changer son unité demande une
  migration et un incrément.
- **Aucun style en ligne** — des classes, alimentées par les jetons de thème. Une CSP stricte
  suivra.
- **Jamais d'`innerHTML` sur une donnée utilisateur** — `textContent`. Le nom d'une simulation
  sera saisi par l'utilisateur : c'est le vecteur évident.

### Sécurité et RGPD — l'essentiel, pour le jour où

Les règles qui ne se négocient pas :

- **HTTPS partout**, redirection via `.htaccess`.
- Mots de passe par `password_hash()` / `password_verify()`, 10 caractères minimum.
- **Validation d'email obligatoire** avant toute connexion.
- Jetons email : `random_bytes(32)`, **seul le hash SHA-256 est stocké**, usage unique, expiration.
- Cookie de session `HttpOnly` + `Secure` + `SameSite=Lax`, `session_regenerate_id(true)` à la
  connexion.
- **CSRF sur toute écriture**, jeton fourni par `/api/me`.
- **PDO exclusivement préparé**, `ATTR_EMULATE_PREPARES` à `false`.
- **Contrôle de propriété systématique** : toute requête sur une simulation vérifie qu'elle
  appartient à l'utilisateur connecté.
- **Ne jamais révéler si un email existe** : messages génériques à l'inscription, à la connexion
  et au « mot de passe oublié ».
- Côté front, **jamais d'`innerHTML` sur une donnée utilisateur** — `textContent`.
- Secrets dans `backend/config.php`, **hors racine web et jamais commité**.

RGPD : minimisation (email + mot de passe, rien d'autre), suppression de compte en libre-service,
export JSON en libre-service, mentions légales et politique de confidentialité liées depuis le
pied de page. **Pas de bandeau cookies** : seul le cookie de session, strictement nécessaire.

---

## 6. Procédures

### Développement local

**Aucun PHP ni MySQL n'est installé sur la machine de développement.** Docker Desktop l'est
(v29.6.2). Recommandation : un `docker-compose.yml` à la racine (PHP 8.3 + Apache, MariaDB,
phpMyAdmin) — au plus près de la cible OVH, et rien à installer sur la machine.

Tant que le backend n'existe pas, le front seul suffit : `npx http-server frontend -p 4173 -c-1`.

### Déploiement

GitHub Actions déclenché au **merge sur `main`**, FTPS vers OVH, identifiants dans les secrets
GitHub. **`backend/config.php` n'est jamais déployé par la CI** — il est créé à la main sur le
serveur, une fois.

### Migrations de base

**Jamais automatiques.** Fichiers SQL numérotés dans `migrations/` (`001_init.sql`,
`002_….sql`), appliqués **à la main via phpMyAdmin**, dans l'ordre. Chaque fichier est
idempotent quand c'est possible (`CREATE TABLE IF NOT EXISTS`). Noter la dernière migration
appliquée dans une table `schema_migrations`.

`.gitignore` ignore `*.sql` mais porte l'exception `!migrations/*.sql` — sans elle, les
migrations n'auraient jamais été commitées. Ne pas la retirer.

### Git

Développement sur branches de feature, **jamais directement sur `main`**. Le merge sur `main`
déclenche le déploiement.

---

## 7. Envoi d'emails

**Prestataire non choisi.** Brevo est envisagé (français, conforme RGPD, offre gratuite
suffisante). Le code ne doit pas en dépendre : un module `mailer` unique, interface
`send(to, subject, html, text)`, **SMTP authentifié** paramétré dans `config.php`. En
développement local, les emails sont **écrits dans un fichier de log** au lieu d'être envoyés.

Emails **transactionnels uniquement** (validation, réinitialisation). Aucun email marketing.

### SPF / DKIM — à configurer sur le nom de domaine

Sans ces enregistrements, les emails partent en spam. À poser dans la zone DNS OVH :

| Type | Nom | Valeur |
|---|---|---|
| TXT | `@` | `v=spf1 include:<domaine-du-prestataire> -all` |
| TXT | `<sélecteur>._domainkey` | clé publique DKIM fournie par le prestataire |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@<domaine>` |

Commencer DMARC en `p=none` (observation), passer à `p=quarantine` une fois SPF et DKIM
vérifiés pendant quelques semaines. L'adresse d'expédition doit être sur le domaine du site.

---

## 8. Dette bloquante pour la mise en ligne

### 🔴 Devise des rendements MSCI World — CONFIRMÉ, BLOQUANT

**Le site ne doit pas être mis en ligne tant que ce point n'est pas corrigé.**

Diagnostic **confirmé et précisé** (25/09/2026), par comparaison avec les rendements officiels
MSCI World **EUR, dividendes nets réinvestis** fournis pour 2012-2025 :

| | Résultat |
|---|---|
| Années du code identiques au MSCI World **USD net** (au centième) | **9 sur 11** |
| Années du code identiques au MSCI World **EUR net** | **0 sur 11** |
| Années ne correspondant **ni à l'un ni à l'autre** | **2** — 2014 et 2015 |

Ce n'est donc **pas** un simple étiquetage à corriger par une substitution : la série est
**panachée**, et deux années viennent d'une troisième source inconnue. Écart maximal : **14,9
points** sur 2017 (+22,4 % dans le code, +7,51 % en réalité).

**Vérification indépendante des chiffres EUR fournis** : si deux séries décrivent le même indice
en deux devises, leur écart doit s'expliquer entièrement par le change. Le rapport
`(1 + EUR) / (1 + USD) − 1` a été calculé sur les onze années : **le signe correspond au mouvement
euro/dollar réel 11 fois sur 11**, et les amplitudes concordent (2014 : +13,9 % impliqué contre
~+12 % constatés ; 2017 : −12,2 % contre ~−14 %). Cela ne prouve pas que ce sont les chiffres de
la fiche MSCI, mais prouve qu'ils se comportent comme la conversion en euros de la série dollar.

**Impact mesuré, à ne pas surestimer** : sur « Taux bas puis inflation » (2012-2022), le verdict
bouge de 9 k€ à 29 k€ selon l'horizon — soit 1 à 3 %. Les erreurs se compensent largement parce
que le rendement moyen est presque identique (11,60 % contre 11,44 %). **Ce qui change beaucoup,
c'est le CHEMIN**, et c'est précisément ce que le pilier 2 prétend montrer. La correction est une
question d'exactitude et de crédibilité, pas de renversement du verdict.

### Pourquoi la correction doit être faite d'un seul bloc

Les décennies se chevauchent, et ces recouvrements **concordent aujourd'hui 7 fois sur 7** entre
« Krach de 2008 » (2008-2018) et « Taux bas puis inflation » (2012-2022). C'est cette concordance
qui rend le chaînage possible et qui a produit « Trente ans réels ».

Corriger seulement 2012-2022 ferait **diverger les sept années communes** — 2017 passerait à
7,51 % dans un scénario et resterait à 22,40 % dans l'autre. On aurait deux vérités dans le même
produit. **Attendre la série complète 1991-2011 avant de toucher quoi que ce soit.**

### Ce qui reste à obtenir

- **1991 à 2011**, MSCI World **EUR, Net**, rendements annuels, source et date d'extraction.
  Point de méthode à trancher : **l'euro n'existe pas avant 1999.** MSCI publie une série EUR
  rétropolée (ECU puis devises héritées) — il faut savoir laquelle et le documenter.
- **2023 à 2025 pour les trois autres séries** (immobilier INSEE, loyers IRL, inflation) si l'on
  veut profiter des rendements boursiers déjà disponibles jusqu'en 2025. Les quatre séries d'un
  scénario doivent couvrir la même période et avoir la même longueur.
- **Aucune source secondaire.** Blogs et comparateurs publient massivement des chiffres USD
  présentés comme des EUR — c'est exactement l'origine de la dette actuelle.

### Ce que la correction n'affecte pas

La fixture Excel (`tests/fixtures/excel-paris.json`) est calculée sur les **taux constants par
défaut**, pas sur les scénarios : **aucun test ne référence `scenarios.js`**. Corriger les données
ne demande donc aucune mise à jour de fixture. Le contrôle croisé des recouvrements, lui, est à
refaire après correction.

---

## 9. Reporté, mais suivi

| Fonctionnalité | État |
|---|---|
| Liens de partage d'une simulation | prévu dans le modèle (`share_token`), non implémenté |
| Monte Carlo | non commencé |
| Curseurs de sensibilité | non commencé |
| Export PDF | non commencé |
| Point mort | **déjà fait** — « point d'équilibre », avec garde-fou sur les recroisements |
| Scénarios historiques | **déjà fait** — pilier 2, données à consolider |
