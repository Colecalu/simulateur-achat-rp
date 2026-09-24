# Spécification du backend — comptes et sauvegarde

Statut : **spécification validée, non implémentée.** `backend/` est vide.

## Périmètre

Le backend fait **une seule chose** : permettre à un utilisateur de retrouver ses simulations
d'un appareil à l'autre. Il ne calcule rien, ne décide rien, ne verrouille rien.

**Les trois piliers du simulateur restent accessibles sans compte.** Aucune fonctionnalité de
calcul n'est jamais conditionnée à la connexion. C'est une décision produit, pas une contrainte
technique : le moteur tourne dans le navigateur et le resterait de toute façon.

### Le serveur ne calcule jamais

`frontend/js/calc.js` est un module pur couvert par 56 tests. **Ne pas le réimplémenter en PHP.**
Deux implémentations du même modèle financier divergeraient, et les tests ne vaudraient plus
rien. Le serveur stocke des **paramètres d'entrée** et rend des **paramètres d'entrée** ; les
résultats ne sont jamais stockés — ils se recalculent en quelques millisecondes côté client.

---

## 1. Parcours utilisateur

### Sauvegarde anonyme, par défaut

La saisie en cours est écrite dans le `localStorage` à chaque modification (débounce ~500 ms).
**L'utilisateur ne perd jamais sa saisie en fermant l'onglet, même sans compte.** C'est le
comportement de base, il ne demande rien à personne.

Clé : `simurp.brouillon`. Contenu : `{ schemaVersion, params, majLe }`.

### L'invitation au compte

Elle apparaît **quand l'utilisateur a saisi un nombre significatif de paramètres** — concrètement,
une fois le profil et les quatre bulles validés, c'est-à-dire au moment où un résultat s'affiche.

- **Jamais de pop-up à l'arrivée. Jamais de mur.**
- Le message met en avant le **bénéfice**, pas l'obligation :
  « Retrouvez cette simulation sur n'importe quel appareil. »
- Discrète, refermable, et elle ne revient pas dans la même session si elle est écartée.

### La reprise de la saisie

À la création du compte **ou** à la connexion, si le `localStorage` contient un brouillon, il est
**proposé à l'enregistrement** dans le compte : « Enregistrer la simulation en cours ? »
**Aucune ressaisie, jamais.**

Pendant l'attente de validation d'email, le brouillon **reste dans le `localStorage`** et sera
proposé à la première connexion réussie.

### Une fois connecté

L'utilisateur peut avoir **plusieurs simulations nommées** : lister, ouvrir, renommer, dupliquer,
supprimer. Plafond : 50 par compte.

---

## 2. Authentification

**Email + mot de passe, avec validation d'email obligatoire.**

### Inscription

1. `POST /api/auth/register` avec email + mot de passe.
2. Compte créé avec `email_verified_at = NULL`.
3. Email de validation envoyé (jeton `verify`, 24 h).
4. L'écran post-inscription dit clairement : **« Vérifiez votre boîte mail — pensez aux spams. »**
5. **La connexion est refusée tant que l'email n'est pas validé.**

Renvoi du lien possible (`POST /api/auth/resend-verification`), avec limitation de fréquence.

### Mot de passe

- `password_hash()` / `password_verify()`, **algorithme par défaut de PHP** (pas de constante
  figée : PHP suivra l'état de l'art).
- **10 caractères minimum.** Pas de règle de complexité byzantine : la longueur fait le travail.
- `password_needs_rehash()` à chaque connexion réussie, puis réécriture silencieuse du hash.

### Réinitialisation

`POST /api/auth/password/forgot` → email avec jeton `reset` (1 h) → formulaire → 
`POST /api/auth/password/reset`.

**Après réinitialisation, toutes les sessions existantes de l'utilisateur sont invalidées.** Si
le mot de passe a été compromis, changer le mot de passe doit suffire à déloger l'intrus.

### Jetons email

| | |
|---|---|
| Génération | `bin2hex(random_bytes(32))` |
| Stockage | **hash SHA-256 uniquement** — le jeton en clair n'existe que dans l'email |
| Usage | **unique** (`used_at` renseigné à la consommation) |
| Expiration | validation 24 h · réinitialisation 1 h |

Un vol de la base ne doit pas permettre de prendre la main sur un compte : d'où le hash.

### Purge des comptes non validés

Supprimés automatiquement **après 7 jours**. L'hébergement mutualisé n'offre pas de cron fiable,
donc la purge est **opportuniste** : déclenchée lors des inscriptions, avec un verrou de
fréquence (au plus une fois par heure) pour ne pas peser sur chaque requête.

### Deux règles qui ne se négocient pas

- **Email normalisé** : `trim()` + minuscules, avant unicité comme avant recherche.
- **Ne jamais révéler si un email existe.** Message identique à l'inscription d'un email déjà
  pris, à l'échec de connexion, et au « mot de passe oublié » :
  *« Si un compte existe pour cette adresse, un email vient d'être envoyé. »*

---

## 3. Modèle de données

MySQL, **InnoDB**, `utf8mb4_unicode_ci`.

```sql
CREATE TABLE users (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(255)     NOT NULL,
  password_hash     VARCHAR(255)     NOT NULL,
  email_verified_at DATETIME         NULL,        -- NULL = non validé
  created_at        DATETIME         NOT NULL,
  last_login_at     DATETIME         NULL,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_unverified (email_verified_at, created_at)  -- pour la purge
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_tokens (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED           NOT NULL,
  type        ENUM('verify','reset')    NOT NULL,
  token_hash  CHAR(64)                  NOT NULL,   -- SHA-256 hexadécimal
  expires_at  DATETIME                  NOT NULL,
  used_at     DATETIME                  NULL,
  created_at  DATETIME                  NOT NULL,
  UNIQUE KEY uq_tokens_hash (token_hash),
  KEY idx_tokens_user (user_id, type),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE simulations (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(120)    NOT NULL,
  params         JSON            NOT NULL,   -- PARAMÈTRES SEULS, jamais de résultats
  schema_version INT UNSIGNED    NOT NULL,
  share_token    CHAR(32)        NULL,       -- réservé, non utilisé en v1
  created_at     DATETIME        NOT NULL,
  updated_at     DATETIME        NOT NULL,
  UNIQUE KEY uq_sim_share (share_token),
  KEY idx_sim_user (user_id, updated_at DESC),
  CONSTRAINT fk_sim_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip          VARBINARY(16) NOT NULL,       -- inet_pton, IPv4 comme IPv6
  email       VARCHAR(255)  NULL,           -- normalisé ; NULL si absent
  action      VARCHAR(32)   NOT NULL,       -- login | register | resend | forgot
  attempted_at DATETIME     NOT NULL,
  KEY idx_attempts_ip (ip, action, attempted_at),
  KEY idx_attempts_email (email, action, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### `params` en JSON, et pourquoi

Le jeu de champs a bougé à chaque séance de travail depuis le début du projet. Une colonne JSON,
c'est **zéro migration à chaque nouveau champ**. On perd la requêtabilité — dont il n'y a aucun
besoin aujourd'hui. Si des statistiques deviennent nécessaires, MySQL 8 permet des colonnes
générées indexées sur du JSON.

**Contenu : uniquement les paramètres saisis.** Jamais un résultat, jamais une courbe. Le
résultat se recalcule ; le stocker créerait une seconde source de vérité qui se périmerait au
premier changement de modèle.

### `schema_version` — le point critique

**Une simulation sauvegardée n'a de sens qu'avec le modèle qui l'a produite.** Le modèle a déjà
changé plusieurs fois (règle de prolongement, ajout de champs, renommages) et continuera.

Le **front** contient une fonction de migration :

```js
function migrerParams(params, versionSource) { … }   // frontend/js/sauvegarde.js
```

Elle met à niveau une ancienne sauvegarde **au chargement** : valeurs par défaut pour les
nouveaux champs, renommages, conversions. **Elle ne plante jamais** : un champ inconnu est
ignoré, un champ manquant prend son défaut.

**La même fonction sert au `localStorage`**, qui porte aussi son `schemaVersion`. Un seul chemin
de migration pour les deux sources — sinon ils divergeront.

Règle : **on n'incrémente `SCHEMA_VERSION` que lorsqu'une ancienne sauvegarde ne se relit plus
à l'identique.** Ajouter un champ avec une valeur par défaut ne casse rien et n'exige pas
d'incrément ; renommer ou changer une unité, si.

---

## 4. API

JSON en entrée comme en sortie. **Un seul point d'entrée PHP** (`backend/public/api/index.php`)
qui route à la main. Pas de framework.

```
POST   /api/auth/register              → compte non validé + email de validation
GET    /api/auth/verify-email?token=   → valide, puis redirige vers le site avec un message
POST   /api/auth/resend-verification
POST   /api/auth/login                 → refusé tant que l'email n'est pas validé
POST   /api/auth/logout
POST   /api/auth/password/forgot
POST   /api/auth/password/reset        → jeton + nouveau mot de passe

GET    /api/me                         → utilisateur courant + jeton CSRF
GET    /api/me/export                  → toutes mes données (RGPD, portabilité)
DELETE /api/me                         → suppression définitive, compte + simulations

GET    /api/simulations
POST   /api/simulations
GET    /api/simulations/{id}
PUT    /api/simulations/{id}
DELETE /api/simulations/{id}
```

`GET /api/me` est la seule route dont le front a besoin pour savoir s'il est connecté. Elle
répond `{ connecte: false }` sans erreur quand il ne l'est pas — un 401 ferait crier la console
au chargement de chaque page.

### Conventions de réponse

| Cas | Code | Corps |
|---|---|---|
| Succès | 200 / 201 | `{ ok: true, … }` |
| Validation refusée | 422 | `{ ok: false, erreur: "…", champs: {…} }` |
| Non connecté sur route protégée | 401 | `{ ok: false, erreur: "…" }` |
| Simulation d'autrui | **404** | `{ ok: false }` — jamais 403, qui confirmerait l'existence |
| Trop de tentatives | 429 | `{ ok: false, erreur: "…", reessayer_dans: 120 }` |

---

## 5. Sécurité

### Transport et en-têtes

- **HTTPS partout**, redirection HTTP → HTTPS dans `.htaccess`.
- En-têtes via `.htaccess` :
  - `Content-Security-Policy` — `default-src 'self'`, avec `https://cdnjs.cloudflare.com` pour
    Chart.js et `https://fonts.googleapis.com` / `https://fonts.gstatic.com` pour les polices.
    ⚠️ Le code actuel utilise des styles en ligne (`style="background:…"` sur les pastilles de
    légende) : soit on les remplace par des classes, soit la CSP doit tolérer `'unsafe-inline'`
    pour les styles. **Préférer le remplacement.**
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`

### Session

`HttpOnly`, `Secure`, `SameSite=Lax`, `session_regenerate_id(true)` à la connexion. Durée de vie
raisonnable (30 jours de souvenir, ou session courte — à trancher).

### CSRF

Jeton généré à l'ouverture de session, rendu par `GET /api/me`, exigé **en en-tête**
(`X-CSRF-Token`) sur **toute requête qui modifie des données**. Comparaison par `hash_equals()`.

### Base

- **PDO exclusivement préparé**, `PDO::ATTR_EMULATE_PREPARES => false`,
  `PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION`.
- **Contrôle de propriété systématique** : `WHERE id = ? AND user_id = ?`, toujours les deux.

### Limitation de fréquence

Par **IP et par email**, sur `login`, `register`, `resend-verification`, `forgot`. Le but n'est
pas seulement d'empêcher le bourrage de mots de passe : c'est surtout d'**empêcher que le
formulaire serve à spammer des tiers** — n'importe qui pourrait sinon déclencher des centaines
d'emails vers une adresse qu'il ne possède pas.

Ordres de grandeur à retenir : 5 tentatives de connexion par email et par quart d'heure, 3 envois
d'email par adresse et par heure, 10 inscriptions par IP et par jour.

### Validation d'entrée, côté serveur

| Champ | Règle |
|---|---|
| `email` | format valide, ≤ 255 caractères, normalisé |
| `password` | ≥ 10 caractères, ≤ 200 (au-delà, `password_hash` coûte cher pour rien) |
| `name` | ≥ 1, ≤ 120 caractères, `textContent` côté front |
| `params` | **JSON valide**, ≤ **64 Ko** |
| Simulations par compte | ≤ **50** |

### Front

**Jamais d'`innerHTML` sur une donnée utilisateur** — `textContent`. Le nom d'une simulation est
saisi par l'utilisateur : c'est le vecteur XSS évident.

### Secrets et erreurs

`backend/config.php` **hors racine web, jamais commité**, avec un `config.example.php` commité.
`display_errors = Off` en production, `log_errors = On`, journal hors racine web.

---

## 6. Envoi d'emails

### Le module

Un module `mailer` unique, interface `send($to, $subject, $html, $text)`. **Le prestataire n'est
pas choisi** (Brevo envisagé) : le code ne doit pas en dépendre. SMTP authentifié, paramètres
dans `config.php` — compatible avec Brevo, Mailjet, Sendinblue, OVH et la plupart des autres.

**En développement local, les emails sont écrits dans un fichier de log** plutôt qu'envoyés, pour
pouvoir cliquer les liens de validation sans prestataire. Bascule par un drapeau de `config.php`.

### La dépendance PHPMailer, et sa justification

`mail()` de PHP ne fait pas de SMTP authentifié. Écrire un client SMTP à la main, c'est gérer
l'AUTH, le STARTTLS, l'encodage MIME, les en-têtes multipart et les retours de ligne CRLF — du
code à risque pour un problème résolu depuis vingt ans.

**PHPMailer est donc la seule dépendance acceptée.** Elle est compatible FTP : la bibliothèque
est **commitée dans `backend/lib/PHPMailer/`** (quatre fichiers, pas de dépendance transitive) et
chargée par un `require` explicite, sans autoloader Composer. Mise à jour : remplacer les
fichiers à la main, en notant la version dans un `VERSION.txt` à côté.

### Contenu

Emails **sobres, en français, HTML + texte**, portant le nom du site et **une phrase disant
pourquoi l'utilisateur les reçoit** — c'est ce qui évite le signalement en spam. Transactionnels
uniquement.

Configuration SPF / DKIM / DMARC : voir [CLAUDE.md](../CLAUDE.md#7-envoi-demails).

---

## 7. Organisation des fichiers

La spécification initiale proposait `/www/` + `/app/`. **Le dépôt utilise `frontend/` +
`backend/`, et je propose de le garder** : ces dossiers existent, `frontend/` est déjà servi tel
quel en local, et renommer casserait `.claude/launch.json`, les chemins des tests et l'historique.
La mise en correspondance se fait **au déploiement**, ce qui est de toute façon nécessaire.

```
frontend/                  → déployé à la racine web OVH (/www/)
  index.html
  css/ js/
  api/                     → alias .htaccess vers backend/public/api/index.php
  .htaccess
backend/                   → déployé HORS racine web
  config.php               ← NON commité, créé à la main sur le serveur
  config.example.php
  public/api/index.php     → routeur, seul fichier exposé
  db.php auth.php simulations.php mailer.php reponse.php limites.php
  lib/PHPMailer/
migrations/
  001_init.sql
frontend/mentions-legales.html
frontend/confidentialite.html
```

**Si l'offre OVH ne permet pas de placer `backend/` hors de `www/`** (certaines formules imposent
tout dans `www/`), repli : `www/backend/` protégé par un `.htaccess` `Require all denied`, et
`config.php` au-dessus de la racine web dans tous les cas. À vérifier à la souscription.

---

## 8. Déploiement

GitHub Actions, FTPS, au **merge sur `main`**. Identifiants dans les secrets GitHub.

- **`backend/config.php` n'est jamais déployé** (exclusion explicite dans l'action, pas seulement
  dans `.gitignore`).
- Les fichiers de `docs/`, `tests/`, `migrations/` ne sont pas déployés.
- **Migrations à la main** via phpMyAdmin, dans l'ordre numérique. Une table
  `schema_migrations (version INT PRIMARY KEY, applied_at DATETIME)` note ce qui est appliqué.

### Environnement de test

Prévu, pas obligatoire : sous-domaine `staging.`, **base séparée**, même pipeline déclenché sur
une branche `staging`. À mettre en place le jour où une migration risquée se profile.

---

## 9. RGPD

Le site stocke des **données personnelles** (email, hash de mot de passe) et des **données
financières personnelles saisies** (revenus, apport, budget, prix du bien). Il transmet l'adresse
email à un **sous-traitant** d'envoi d'emails.

### À produire

- **`frontend/mentions-legales.html`** : éditeur, hébergeur (OVH SAS, 2 rue Kellermann, 59100
  Roubaix), contact. Champs `[À COMPLÉTER]` pour les informations personnelles.
- **`frontend/confidentialite.html`** : voir le brouillon ci-dessous.
- **Liens dans le pied de page de toutes les pages** et **sur le formulaire d'inscription**.

### Politique de confidentialité — brouillon

> **Quelles données sont collectées**
> Si vous créez un compte : votre adresse email et votre mot de passe (stocké sous forme chiffrée
> irréversible, nous ne le connaissons pas). Si vous enregistrez une simulation : les paramètres
> que vous avez saisis (budget, apport, prix du bien, loyer…). **Aucune autre donnée d'identité
> n'est demandée.**
>
> **Sans compte, rien ne quitte votre navigateur.** Les simulations que vous faites sans être
> connecté sont conservées uniquement sur votre appareil, et nous n'y avons pas accès.
>
> **Pourquoi**
> Uniquement pour vous permettre de retrouver vos simulations d'un appareil à l'autre. Base
> légale : l'exécution du service que vous avez demandé. **Aucune publicité, aucune revente,
> aucun email marketing.**
>
> **Où et par qui**
> Hébergement en France chez **OVH SAS**. Les emails de validation et de réinitialisation sont
> envoyés par **[À COMPLÉTER — prestataire]**, qui reçoit votre adresse email à cette seule fin.
>
> **Combien de temps**
> Comptes non validés : supprimés automatiquement après **7 jours**. Comptes validés : conservés
> jusqu'à ce que vous les supprimiez. Comptes inactifs depuis **3 ans** : supprimés après un email
> d'avertissement.
>
> **Vos droits**
> Accès, rectification, suppression, portabilité. **Suppression et export sont en libre-service**
> depuis votre compte, sans nous écrire. Pour le reste : **[À COMPLÉTER — email de contact]**.
> Vous pouvez introduire une réclamation auprès de la **CNIL** (cnil.fr).
>
> **Cookies**
> Un seul, strictement nécessaire : celui qui vous maintient connecté. Aucun traceur, aucune
> mesure d'audience — donc pas de bandeau à cliquer.

### À implémenter

- **Suppression de compte en libre-service** : bouton + confirmation explicite (retaper son
  email), `DELETE /api/me`, suppression réelle en cascade. **Pas de suppression logique.**
- **Export en libre-service** : `GET /api/me/export`, JSON contenant l'email, les dates et
  toutes les simulations.
- **Minimisation** : email et mot de passe, rien d'autre. Ne jamais ajouter de champ d'identité.
- Si une mesure d'audience est ajoutée plus tard, choisir une solution **sans cookie ou exemptée
  de consentement** (Matomo configuré en exemption, Plausible). Sinon, il faudra un bandeau.

---

## 10. Ordre d'implémentation

Voir le plan présenté en session. Le principe : **chaque étape est testable seule** et laisse le
site fonctionnel. Le front continue de marcher sans backend à toutes les étapes — c'est la
propriété qu'il faut préserver.
