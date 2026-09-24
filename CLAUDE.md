# CLAUDE.md

Document de référence du projet. Court par nature : le détail vit dans `docs/`.

| Sujet | Où |
|---|---|
| Modèle de calcul, formules, écarts assumés | [docs/modele-de-calcul.md](docs/modele-de-calcul.md) |
| Interface, design, visualisation | [docs/conventions-ui.md](docs/conventions-ui.md) |
| Backend : comptes, sauvegarde, sécurité, RGPD | [docs/backend-spec.md](docs/backend-spec.md) |
| Design system Perron | [docs/design/README.md](docs/design/README.md) |

## Commandes

```bash
node --test "tests/*.test.mjs"   # 56 tests : moteur, mise en location, indicateurs, séries
```

Le motif est entre guillemets : `node --test tests/` échoue sous Windows (Node tente de charger
le dossier comme un module), et un glob non quoté n'est pas développé par tous les shells.

Pas de build. `frontend/` est servi tel quel. Aperçu local : `npx http-server frontend -p 4173 -c-1`
(configuration dans `.claude/launch.json`).

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

## 5. Sécurité et RGPD — l'essentiel

Spécification complète dans [docs/backend-spec.md](docs/backend-spec.md). Les règles qui ne se
négocient pas :

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

> ⚠️ `.gitignore` ignore actuellement `*.sql` : il faut y ajouter `!migrations/*.sql`, sans quoi
> les migrations ne seront jamais commitées.

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

### 🔴 Devise des rendements MSCI World — PRIORITÉ HAUTE, BLOQUANT

**Le site ne doit pas être mis en ligne tant que ce point n'est pas tranché.**

Les séries de `frontend/js/scenarios.js` sont annoncées en **euros**, mais plusieurs années
coïncident **au centième** avec les valeurs publiées en **dollars** :

| Année | Valeur dans le code | Correspond à |
|---|---|---|
| 2019 | +27,7 % | MSCI World **USD** net |
| 2021 | +21,8 % | MSCI World **USD** net |
| 2022 | −18,1 % | MSCI World **USD** net |
| 2014 | +18,7 % | ressemble davantage à de l'**EUR** |
| 2015 | +8,3 % | ressemble davantage à de l'**EUR** |

Or 2021 et 2022 ont connu de forts mouvements de change : l'écart euro/dollar sur ces deux
années seules se chiffre en dizaines de milliers d'euros sur le verdict. **La série est donc
peut-être panachée**, ce qui serait pire qu'une erreur systématique — une erreur systématique se
corrige d'un coefficient, un panachage se corrige année par année.

**À traiter dans une session dédiée**, avec des **sources MSCI officielles en EUR**, en précisant
**net ou gross** (dividendes nets de retenue à la source, ou bruts) et en s'y tenant sur toute la
période. Refaire ensuite le contrôle croisé des recouvrements entre décennies.

La réserve est déjà affichée à l'écran dans l'aperçu de chaque scénario concerné — c'est un
palliatif, pas une solution : on ne publie pas un simulateur financier en signalant que ses
données sont peut-être fausses.

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
