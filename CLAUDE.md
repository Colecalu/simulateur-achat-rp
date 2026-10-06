# CLAUDE.md

Document de référence du projet. Court par nature : le détail vit dans `docs/`.

| Sujet | Où |
|---|---|
| Modèle de calcul, formules, écarts assumés | [docs/modele-de-calcul.md](docs/modele-de-calcul.md) |
| Interface, design, visualisation | [docs/conventions-ui.md](docs/conventions-ui.md) |
| Backend : comptes, sauvegarde, sécurité, RGPD | [docs/backend-spec.md](docs/backend-spec.md) — **en pause** |
| Design system Perron | [docs/design/README.md](docs/design/README.md) — **le thème en service est désormais « Horizon », voir §12** |

## Commandes

```bash
node --test "tests/*.test.mjs"   # 107 tests : moteur, location, indicateurs, séries, sauvegarde, scénarios
```

Le motif est entre guillemets : `node --test tests/` échoue sous Windows (Node tente de charger
le dossier comme un module), et un glob non quoté n'est pas développé par tous les shells.

Pas de build. `frontend/` est servi tel quel.

**Pour lancer le site en local : double-cliquer sur `lancer-le-site.cmd`** à la racine. Il ouvre
`http://localhost:4173`, toujours la même adresse, et prévient si la branche courante ne contient
pas la sauvegarde locale. Équivalent en ligne de commande :
`npx http-server frontend -p 4173 -c-1`.

⚠️ **Ne jamais tester en ouvrant une page `.html` par double-clic.** L'adresse devient `file://`, où
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
- **Les 107 tests sont l'arbitre.** Une proposition qui les casse est rejetée, quelle que soit son
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

**Nom : Æquo** (comme *ex aequo* : les deux trajectoires partent à égalité, même budget). Le
site compare, il ne juge pas : acheter en gagnant moins pour être chez soi est un choix légitime,
et aucun texte ne doit laisser entendre le contraire.

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

**L'enveloppe s'ajuste, elle n'est plus fixe.** L'effort déclaré (loyer actuel + épargne) est
un plancher : quand un logement coûte plus, l'enveloppe monte à ce niveau, des deux côtés, et ne
redescend jamais. L'ancien plafonnement de l'épargne à zéro laissait le dépassement payé par
personne (+454 k€ au lieu de +106 k€ pour un effort de 1 500 €). Désormais l'écart ne dépend du
profil **pour aucun effort**.

**Seule dérogation admise : l'épargne forcée** (décision de Lucas, sept. 2026). Par défaut le
locataire place ce que l'acheteur rembourse. L'utilisateur peut déclarer qu'il ne le ferait pas
(`locatairePlaceDifference`) : seul l'acheteur relève alors son effort, parce que le crédit l'y
oblige. C'est souvent ce qui décide du verdict ; l'interface la pose, la rappelle sous le verdict
et dit de combien il bouge. Détail : [docs/modele-de-calcul.md](docs/modele-de-calcul.md).

### Les trois piliers

1. **Comparaison à coût d'opportunité** — les deux trajectoires complètes. *Fait.*
2. **Scénarios de marché réels** — des séries année par année, observées et sourcées, plutôt
   qu'un taux constant. *Fait, données à consolider.*
3. **Mise en location de la RP** — et si, au lieu de revendre, vous la louiez ? *Moteur fait,
   interface refaite en octobre 2026 — voir docs/conventions-ui.md.*

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
- Les **revenus nets du foyer sont facultatifs** et n'entrent dans aucun calcul patrimonial : ils
  ne servent qu'au taux d'endettement, à la part de l'effort et au reste à vivre. Non renseignés,
  ces indicateurs valent `null` — jamais un ratio inventé. Du **foyer** : un couple qui n'en
  déclarerait qu'un verrait son taux d'endettement doubler.

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
  index.html                 page d'accueil « Carnet d'un choix » — diverge de Codex depuis le 02/10, §12
  simulateur.html            le simulateur — servi à /simulateur en production (.htaccess)
  .htaccess                  adresses propres, 301, cache des polices — Apache seulement, §13
  robots.txt, sitemap.xml    indexation — URL sur aequo.example, PROVISOIRE, §13
  favicon.svg / .ico         générés par outils/favicon.mjs
  apple-touch-icon.png       idem
  img/partage.png            aperçu de partage 1200 × 630 — outils/image-partage.mjs
  fonts/                     polices hébergées (woff2, latin) + licences OFL — plus de Google Fonts
  css/  polices.css          @font-face des polices hébergées, chargée en premier par les deux pages
        theme-codex.css      THÈME EN SERVICE — « Horizon », valeurs + habillage de Codex (§12)
        theme-perron.css     thème précédent, conservé — valeurs uniquement
        theme-foret.css      gelé, conservé comme point de comparaison
        style.css            structure du simulateur
        accueil.css          feuille AUTONOME de l'accueil (ses propres jetons), une section par bloc
  js/   calc.js              moteur PUR : window.SimuRP / module.exports
        calc-location.js     pilier 3 — CONSOMME calc.js, ne le modifie jamais
        scenarios.js         pilier 2 — données de marché, pas de logique
        sauvegarde.js        brouillon local + migration de schéma (testé)
        app.js               tout le DOM, toute l'interface
        accueil.js           bascule, apparitions, aperçu chiffré — lit calc.js, ne calcule rien
backend/                     vide aujourd'hui — voir docs/backend-spec.md
outils/                      jamais déployé — scripts de développement
  fenetres-historiques.mjs   choix des fenêtres du pilier 2 (§9)
  favicon.mjs                favicon.svg / .ico / apple-touch-icon.png
  image-partage.mjs (+ .html) img/partage.png
  package.json               fontkit, wawoff2, Playwright — devDependencies, §13
docs/                        modèle, conventions UI, spec backend, design, Excel
tests/                       node --test, 107 tests
migrations/                  à créer : SQL numéroté, appliqué à la main
```

### Conventions de code

- Interface, libellés, noms de variables, de fonctions et de classes CSS **en français**.
- JS en `camelCase`, classes CSS en `bloc__element--modificateur`.
- **Les deux pages ne partagent aucune feuille de structure** depuis l'alignement sur Codex
  (§12) : le simulateur charge `theme-codex.css` + `style.css`, l'accueil `accueil.css` seul.
  L'ancien `socle.css` commun a été retiré avec la page d'accueil qui le justifiait (son exemple
  chiffré reprenait le bloc de résultat du simulateur). **Exception assumée** : `accueil.css` et
  `index.html` gardent les classes et les jetons en anglais hérités de Codex (`--paper`, `.cover`,
  `.ledger`…) — on ne les renomme pas. Tout ce qui s'y ajoute suit la convention du dépôt
  (français, `bloc__element--modificateur`). Depuis le 02/10/2026, l'accueil **diverge
  volontairement** de la branche de Codex et se réécrit comme le reste du dépôt (§12).
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
- **`params.profil` porte la décomposition de l'effort** (`loyerActuel`, `epargneActuelle`) ;
  `enveloppeMensuelle` s'en **déduit** et ne se stocke pas. Schéma **v2** : la migration v1 → v2
  renomme `salaireNet` en `revenusFoyer` et range l'ancien effort tout entier en épargne (loyer à
  0) — la seule répartition qui n'invente rien, et qui redonne exactement les mêmes chiffres.
- **`avancement` décrit CETTE session dans CE navigateur** — profil validé, bulles validées,
  question de l'épargne forcée déjà répondue. Il
  vit dans l'enveloppe du brouillon, jamais dans `params`, et ne partira jamais en base. Sans
  lui, rouvrir l'onglet afficherait un résultat complet alors que l'utilisateur n'a rempli
  qu'une bulle — ce qu'on s'interdit.
- **Tout le reste se déduit** : l'ouverture du module de mise en location se lit dans la présence
  d'une année de bascule. Ne pas stocker ce qui se déduit.
- **Un champ laissé vide part en `null` et revient vide** (groupes `moteur` et `profil`). Avant le
  06/10/2026, `normaliser` remplaçait `null` par le défaut du moteur : un prix laissé vide serait
  revenu à 420 000 € au rechargement. Un test le verrouille. Les anciennes sauvegardes, qui ne
  contiennent que des nombres, se relisent à l'identique : pas d'incrément de version.
- **`SCHEMA_VERSION` ne s'incrémente que si une ancienne sauvegarde ne se relit plus à
  l'identique.** Ajouter un champ ne casse rien : `normaliser()` lui donne son défaut.
- **`migrer()` ne lève jamais.** Sauvegarde corrompue, version future, migration qui plante :
  elle rend `null` et le front repart d'un brouillon vide. Le simulateur doit marcher même quand
  la sauvegarde ne marche pas.
- **Piège vérifié** : un champ dont le défaut est `null` (`anneeBascule`) ne dit rien de son type.
  Se fier au type du défaut pour valider fait perdre la valeur au rechargement — silencieusement.
  Deux tests le verrouillent, dont un aller-retour sur tous les champs.
- **L'état de la sauvegarde est VISIBLE** (`#brouillonEtat`, dans la carte « Votre simulation ») : « Brouillon
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
http-server sert déjà les adresses propres (`/simulateur` → `simulateur.html`) : les liens
internes fonctionnent en local comme en production, sans le `.htaccess`.

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

## 8. Les hypothèses par défaut, et pourquoi elles sont sourcées

> **En cours de refonte.** Les valeurs ci-dessous marquées PROVISOIRE attendent des données.

### Pourquoi les défauts ne sont pas un détail

La plupart des utilisateurs ne toucheront pas aux hypothèses de marché. **Ce sont donc les valeurs
par défaut qui rendent le verdict**, pour la majorité des visites. Elles ne peuvent pas être des
chiffres ronds choisis au jugé : elles doivent être construites et sourcées au dixième de point.

C'est pourquoi le scénario « Retour à la normale », d'abord envisagé comme une option parmi
d'autres, a été **supprimé en tant que scénario** : il est devenu la **vue de base**. Un scénario
qu'il faut cliquer pour obtenir une réponse honnête est un scénario que personne ne clique.

### La construction

Chaque taux nominal se décompose : `nominal = (1 + réel) × (1 + inflation) − 1`, avec une
inflation de **2,0 %** — la cible de la BCE, seule référence prospective non arbitraire.

| Paramètre | Valeur | Construction et source |
|---|---|---|
| Inflation | **2,0 %** | Cible d'inflation de la BCE. |
| Loyers (IRL) | **2,0 %** | L'IRL **est** légalement la moyenne sur 12 mois de l'IPC hors tabac et loyers (loi du 8 février 2008). L'indexation des loyers est l'inflation, par construction — pas une hypothèse. Écart observé 1991-2022 : +0,21 pt. |
| Charges de copropriété | **2,0 %** | Inflation. |
| Taxe foncière | **2,5 %** | Depuis 2018 la revalorisation forfaitaire des valeurs locatives suit l'IPCH, mais les taux communaux dérivent en plus. Inflation + 0,5 pt corrige la sous-estimation connue. |
| Immobilier | **PROVISOIRE 2,5 %** | 2 % + croissance **réelle** du revenu disponible brut par ménage (INSEE). Thèse de Friggit : sur longue période, les prix suivent le revenu. **En attente de la série INSEE.** |
| Bourse | **PROVISOIRE 6,8 %** | 2 % + rendement **réel** de long terme des actions mondiales (Dimson-Marsh-Staunton, *UBS Global Investment Returns Yearbook*), **moins les frais de gestion d'un ETF monde**. **En attente du chiffre DMS de la dernière édition.** |

**Ne PAS utiliser la moyenne MSCI 1991-2025 comme rendement de long terme** : elle est écrasée par
la séquence haussière 2012-2025, qui vaut à elle seule +12,68 %/an. Une moyenne sur 35 ans reste
une moyenne sur une seule histoire ; DMS couvre 125 ans et plusieurs dizaines de marchés.

### Les frais d'ETF, et l'argument de symétrie

Le modèle chiffre **tous** les coûts du côté achat — notaire, agence, dossier, assurance
emprunteur, charges, taxe foncière. Il ne chiffre **aucun** coût du côté bourse. Déduire les frais
de gestion d'un ETF monde (0,20 à 0,40 %/an) rétablit la symétrie.

L'enjeu n'est pas cosmétique : **0,30 %/an déplace le verdict de 45 646 €** sur le profil par
défaut à 25 ans. Ce n'est pas de la fiscalité — notre convention « rendement brut, impôt à la
sortie » n'est pas en cause : un frais de gestion est un coût, au même titre qu'une taxe foncière.

### ⚠️ Deux constats qui commandent tout le reste

**1. Le paramétrage de la vue de base décide du verdict.** Mesuré sur le profil type :

| Rendement boursier nominal | Écart à 25 ans |
|---|---|
| +6,0 % | +133 575 € |
| +7,0 % | +71 438 € |
| **+8,0 %** | **−3 639 €** ← bascule |
| +8,5 % | −46 842 € |

Un demi-point renverse la réponse. Même sensibilité côté immobilier : de 1,5 % à 3,0 %, l'écart
passe de −32 329 € à +128 379 €. **Ce sont les hypothèses qui répondent, pas le modèle.** D'où
l'exigence de sourcer.

**2. Le vrai message du site est le rendement locatif d'équilibre.** Avec les hypothèses de long
terme, sur le profil par défaut, le basculement se situe à **3,57 % de rendement locatif brut** :

| | Rendement locatif brut | Verdict |
|---|---|---|
| Paris intra-muros | 3,0 à 3,5 % | **louer et investir l'emporte** |
| Grandes métropoles | 4 à 5 % | acheter l'emporte |
| Villes moyennes | 6 à 8 % | acheter l'emporte largement |

La formule « en temps normal, ça se joue à peu de choses » est donc **inexacte pour un profil
donné** : l'écart s'y compte en centaines de milliers d'euros. Ce qui est vrai, c'est que le
**seuil est net et que le rapport loyer/prix de la ville décide de quel côté on tombe**. C'est ce
qu'il faut dire, et c'est plus utile.

Conséquence : le **profil par défaut** (420 000 €, loyer 1 600 €, soit 4,57 % brut) n'est pas
neutre — il place l'utilisateur du côté « acheter gagne » avant toute saisie. À rediscuter.

---

## 9. Les quatre scénarios de marché

Deux groupes, appliqués **par-dessus** la vue de base. Ils n'utilisent **jamais les taux de crédit
de l'époque** : un scénario applique les évolutions de marché au projet de l'utilisateur, avec
**son** taux. Vérifié — appliquer les taux historiques déplace les écarts de 60 à 130 k€ mais ne
change pas le classement d'une seule place.

### Groupe « Le passé » — étiquette *Historique*

Deux fenêtres de **20 ans**, sélectionnées **une seule fois, hors ligne**, par
`outils/fenetres-historiques.mjs`, puis figées en dur. Identiques pour tous les utilisateurs,
jamais recalculées.

- **H1** : la fenêtre la plus favorable à l'achat.
- **H2** : la fenêtre la moins favorable à l'achat.
- Années 21 à 25 : prolongées au rendement **annualisé géométrique** de la fenêtre — jamais
  l'arithmétique, qui surestime toujours. Frontière observé/projeté tracée à l'écran.

**La médiane a été abandonnée** : testée sur sept profils, elle se déplace de 1995 à 2000 selon le
profil. Les extrêmes, eux, sont robustes — 1992 est la meilleure fenêtre pour les sept profils.

**Aucune fenêtre de 20 ans ne favorise la location** dans les données 1991-2022 : l'écart va de
+145 k€ à +557 k€, toujours pour l'achat. Toute fenêtre de 20 ans englobe le boom immobilier
français de 1998-2008. D'où l'étiquetage « la moins favorable à l'achat » et non « favorable à la
location ».

### Groupe « Des futurs possibles » — étiquette *Hypothèse*

Deux stress tests **symétriques**, chacun sur **un seul risque**, l'autre marché restant sur la
tendance longue. C'est ce qui les rend lisibles : on sait exactement ce qui est testé.

- **« Correction immobilière »** — l'immobilier baisse dans les **premières années**, au moment où
  l'acheteur est le plus endetté et où le bien vaut le moins par rapport à sa dette. Calibrage
  retenu : **−3, −3, −2, 0, +1 %** puis tendance longue.

  **Ces cinq chiffres sont construits, pas observés** — et c'est un choix assumé, réexaminé le
  27/09/2026 puis confirmé. Mesuré sur nos propres séries :

  | | Cumul nominal | Cumul **réel** | Coût du choc à 25 ans |
  |---|---|---|---|
  | Épisode français observé, 1992-1997 | −2,2 % | −11,9 % | −145 521 € |
  | **Calibrage retenu** (inflation 2 %) | **−6,9 %** | **−15,6 %** | **−163 948 €** |

  ⚠️ **Le piège évité** : la justification précédente disait « plus dur que 1991-1997 sans être
  une fiction », en comparant deux cumuls **nominaux** issus de deux mondes d'inflation
  différents (11 % cumulé dans les années 90, 2 %/an aujourd'hui). En réel, le calibrage est **un
  tiers plus sévère** que l'épisode observé. Ne jamais comparer des nominaux entre deux régimes
  d'inflation.

  **Pourquoi on garde un choc construit plutôt que la séquence observée** (qui rendrait le pilier 2
  intégralement sourcé, et qui a donc été proposée) : 1992-1997 est le **seul** épisode de la série,
  et c'est un affaissement **lent**. Une correction rapide — l'Espagne 2008-2013, la France
  2023-2024 — est une autre forme de risque, qu'aucune de nos séries ne porte. Un stress test qui
  ne saurait rejouer que la correction la plus douce jamais observée ne teste pas grand-chose.
  *À recaler sur 2023-2024 quand les données seront disponibles — ce sera le deuxième épisode
  observé, et probablement une meilleure base.*

  ⚠️ Le chiffre « −0,9 % nominal / −10 % réel » qui figurait ici **ne se reproduit sur aucune
  fenêtre de nos séries** (le plus proche est 1992-1998 : −1,1 % / −11,0 %). Il venait
  probablement d'une lecture externe de Friggit. Remplaçé par les valeurs recalculées.
- **« Décennie perdue en bourse »** — les marchés stagnent une douzaine d'années puis repartent.
  La séquence 2000-2011 est reprise **telle quelle**, pas lissée : c'est le CHEMIN qui fait mal
  (−42 % cumulé au creux de la 3ᵉ année, puis −40 % en 9ᵉ) alors que la moyenne ressort à
  +0,4 %/an. Une stagnation plate au même rendement moyen serait un tout autre scénario.
  ⚠️ *En place en dollars, faute de série EUR sur ces années.* **En euros l'épisode fut PLUS
  dur** : le dollar s'est effondré de 2002 à 2008 (l'euro est passé de 0,85 à 1,60), donc les
  rebonds de 2003-2007 vus d'Europe étaient bien plus faibles que ces chiffres.

### Ce que le code porte aujourd'hui — structure définitive, données provisoires

`frontend/js/scenarios.js` a été réécrit autour de cette structure, **avant** de disposer des
données. Ce choix a une raison : la structure et les données sont deux décisions indépendantes, et
les mêler obligerait à tout refaire deux fois. Les valeurs en place sont marquées PROVISOIRE dans
le fichier, et `STATUT_DONNEES` vaut `'PROVISOIRE'` tant que rien n'est consolidé.

**Une seule série observée, pas quatre décennies.** C'est le changement de fond. L'ancienne version
portait quatre décennies qui se chevauchaient : deux scénarios pouvaient afficher deux valeurs
différentes pour la même année — deux vérités dans le même produit, et c'est précisément ce qui
rendait la correction MSCI si coûteuse (§10). Désormais `SERIES_OBSERVEES` couvre 1991-2022 d'un
seul tenant et les fenêtres y sont **découpées**. Conséquence directe : **corriger la série corrige
tous les scénarios d'un coup**, et l'incohérence entre deux fenêtres qui se recouvrent devient
impossible par construction.

**Ce qui reste à brancher** (un seul endroit chacun) :

| À remplacer | Où | Valeur en place |
|---|---|---|
| Bourse 1991-2011 en EUR | `SERIES_OBSERVEES.rendementBourse` | valeurs USD |
| Immobilier / loyers / inflation 2023-2025 | les trois autres séries | s'arrêtent en 2022 |
| Années de départ des deux fenêtres | `FENETRES[].debut` | 1992 et 2002 |
| Tendance longue bourse et immobilier | `TENDANCE_LONGUE` | 6,8 % et 2,5 % |

⚠️ **Les mêmes tableaux existent dans `outils/fenetres-historiques.mjs`**, qui ne part jamais en
production mais qui sert à choisir les fenêtres. Les deux fichiers changent **ensemble** : sans
quoi les fenêtres figées ne correspondraient plus au classement qui les a désignées.

⚠️ **`TENDANCE_LONGUE` et les défauts de `calc.js` doivent finir identiques** — la tendance longue
EST la vue de base. Ils ne le sont pas aujourd'hui : les défauts du moteur portent encore les
anciennes valeurs rondes, et on ne les bouge qu'une fois les sources reçues. Voir §11.

**Douze tests verrouillent la structure, pas les valeurs** (`tests/scenarios.test.mjs`). C'est
délibéré : un test qui figerait un rendement provisoire empêcherait exactement ce qu'on prépare.
Ils vérifient qu'une fenêtre est bien découpée dans la série, que le prolongement est géométrique
et non arithmétique, qu'un stress test ne choque **qu'un seul** marché et retombe ensuite sur la
tendance longue, qu'aucun nom ne contient le résultat, et qu'aucune série ne produit de `NaN`.

### Deux détails d'interface qui viennent de la structure

- **Étiquette de groupe** : « Le passé · *Historique* » et « Des futurs possibles · *Hypothèse* ».
  Sans elle, deux scénarios de nature opposée se ressemblent dans une liste.
- **Pas de trait de frontière sur un stress test.** Le trait marque le passage de l'observé au
  projeté ; un scénario construit n'a rien d'observé, il n'y a donc rien à quitter. C'est
  l'étiquette qui porte l'avertissement, et le texte dit explicitement « aucune année observée ».

### Ce qui ne figure JAMAIS dans une étiquette

**Le résultat.** Un scénario se nomme et se décrit par **ce qui s'est passé sur les marchés** —
jamais par « favorable à l'achat », puisque le résultat dépend du profil de l'utilisateur. Les
historiques sont nommés par leur année de départ : « Acheter en 1992 ».

---

## 10. Dette bloquante pour la mise en ligne

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
défaut**, pas sur les scénarios. Corriger les données ne demande donc **aucune mise à jour de
fixture**.

`tests/scenarios.test.mjs` référence bien `scenarios.js` depuis la refonte, mais ne vérifie **que
la structure** — jamais une valeur de rendement. Il est conçu pour rester vert quand les séries
seront remplacées ; si l'un de ces tests tombe après la correction, c'est la mécanique qui a
bougé, pas les données.

**Le contrôle croisé des recouvrements n'a plus lieu d'être** : depuis la refonte il n'existe
qu'une seule série observée, dans laquelle les fenêtres sont découpées. Deux fenêtres qui se
recouvrent lisent les mêmes cases du même tableau — diverger leur est devenu impossible. C'est
aussi ce qui rend la correction **locale** : un seul tableau à remplacer, dans `scenarios.js` et
dans `outils/fenetres-historiques.mjs`, et non plus quatre décennies à tenir cohérentes entre
elles.

---

## 11. Reporté, mais suivi

### Décidé pendant la refonte des scénarios, volontairement pas traité

Ces trois points sont sortis de l'analyse du pilier 2 et sont **documentés pour ne pas être
redécouverts**. Ils n'ont pas été implémentés : mélanger une refonte de scénarios avec un nouvel
indicateur et un changement de défauts aurait rendu chaque effet impossible à isoler.

| Sujet | Ce qu'on sait déjà | Pourquoi ça attend |
|---|---|---|
| **Loyer d'équilibre / rendement locatif** | Le basculement est à **3,57 % de rendement locatif brut** sur le profil courant — soit un loyer d'équilibre de 1 249 €/mois. Ce seuil sépare Paris (3,0-3,5 %) des grandes métropoles (4-5 %). C'est probablement **le vrai message du site** : ce n'est pas le marché qui répond, c'est le rapport loyer/prix de la ville. | Nouvel indicateur à part entière, avec sa visualisation. Mérite sa propre session. |
| **Frais de gestion en bourse** | Le modèle chiffre **tous** les coûts côté achat et **aucun** côté bourse. Déduire 0,20 à 0,40 %/an (ETF monde) rétablit la symétrie. **0,30 %/an déplace le verdict de 45 646 €** à 25 ans. Ce n'est pas de la fiscalité : notre convention « rendement brut, impôt à la sortie » n'est pas en cause, un frais de gestion est un coût comme une taxe foncière. | Touche le moteur et les défauts. À faire avec la mise à jour de `TENDANCE_LONGUE`. |
| **Profil d'exemple à revoir** | 420 000 € pour 1 600 € de loyer = **4,57 % brut** : l'utilisateur arrive déjà du côté « acheter gagne » avant toute saisie. Ce sont des **valeurs de test**, pas un profil choisi. | Si l'on source les taux au dixième de point, il faut être aussi rigoureux sur le profil. Décision produit, pas technique. |

### Dettes de cohérence ouvertes par la refonte

- **`TENDANCE_LONGUE` (scenarios.js) et `DEFAUTS` (calc.js) doivent devenir identiques** sur les
  cinq taux de marché. La tendance longue EST la vue de base ; aujourd'hui les défauts du moteur
  portent encore les anciennes valeurs rondes. À faire **d'un seul bloc**, à la réception des
  sources, avec l'arbitrage sur les frais d'ETF.
- **`scenarios.js` et `outils/fenetres-historiques.mjs` portent les mêmes tableaux.** Ils changent
  ensemble, sans quoi les fenêtres figées ne correspondent plus au classement qui les a choisies.

### Valeurs pré-remplies de l'écran ≠ défauts du moteur

**Décision de Lucas, 06/10/2026 : l'écran part VIDE pour ce que seul l'utilisateur connaît** — sa
situation (patrimoine, loyer actuel, épargne, revenus), le prix net vendeur, l'apport et le loyer
de comparaison. Le reste est pré-rempli par `VALEURS_DE_TRAVAIL` (`app.js`) : bien ancien, frais
d'agence et travaux à 0, frais bancaires 2 000 €, 20 ans à 3,5 % (assurance 0,15 %), copropriété et
taxe foncière 1 000 €/an, scénario de marché du moteur. **Ne pas aligner `DEFAUTS` de `calc.js`
dessus** : ce sont les valeurs du classeur Excel, que la fixture compare au centime.

- **Un champ vide est « non renseigné », jamais remplacé en silence.** On ne valide ni la
  situation ni une bulle qui en contient (champs signalés, curseur sur le premier) ; le résultat
  reste en attente tant qu'il en manque un, vidé après validation compris (« Il manque une
  valeur : Apport. »). Seuls les revenus du foyer sont facultatifs. `lireFormulaire` garde son
  repli sur `DEFAUTS` pour que le moteur tourne, mais rien de ce qu'il calcule alors n'est montré.
- **Deux champs se proposent d'eux-mêmes** (`LIAISONS`, mécanisme `data-auto`) : la valeur
  estimée suit prix + travaux, le loyer de comparaison suit le loyer actuel — jusqu'à ce que
  l'utilisateur les modifie.
- **« Ma situation actuelle »** (ex-« Mon profil ») est ouverte d'emblée, champs vides. Essayé
  puis écarté le 06/10 par Lucas : une carte repliée en jaune, à ouvrir d'un clic comme les bulles.

### Conflit des deux loyers — à traiter

Le **loyer actuel** (profil) sert à l'effort déclaré ; le **loyer du locataire** (bulle 3) est celui
de la comparaison. Deux champs pour une notion que l'utilisateur croit unique. On ne peut pas les
fusionner sans fausser le verdict quand le bien acheté est plus grand ou dans une autre ville : le
rapport loyer / prix DU BIEN est souvent ce qui décide. Essayé puis écarté : le loyer du locataire
en bulle 1, lié au loyer actuel. Détail dans [docs/conventions-ui.md](docs/conventions-ui.md).

### Fonctionnalités

| Fonctionnalité | État |
|---|---|
| Liens de partage d'une simulation | prévu dans le modèle (`share_token`), non implémenté |
| Monte Carlo | non commencé |
| Curseurs de sensibilité | non commencé |
| Export PDF | non commencé |
| Point mort | **déjà fait** — « point d'équilibre », avec garde-fou sur les recroisements |
| Scénarios historiques | **structure faite**, données provisoires — voir §9 et §10 |

---

## 12. Le thème en service — « Horizon »

**Depuis le 30/09/2026, les deux pages chargent `frontend/css/theme-codex.css`.** Perron n'est
plus chargé par aucune page ; il reste dans le dépôt, intact, comme point de comparaison.

### D'où il vient

Proposé par **Codex** sur sa branche `codex/interface-horizon`, dans le cadre du protocole
d'expérimentation de type A (`AGENTS.md`) : un thème qui reprend les noms sémantiques et ne
change que les valeurs. Il a respecté le contrat — **les 63 jetons de Perron sont présents,
aucun ne manque** — ce qui a rendu l'essai possible en changeant une seule balise `<link>`.

Papier crème, encre violette, accent violet, DM Sans à la place de Geist. Instrument Serif est
conservée pour les titres.

### Pourquoi on l'a adopté : il est objectivement meilleur sur l'accessibilité

Contrôle ΔE2000 refait le 30/09/2026, **indépendamment du script d'audit de Codex** (on voulait
des chiffres obtenus autrement, pas une confirmation par le même outil). Triplet de l'aperçu de
scénario, pire paire :

| | Perron | **Horizon** | Plancher |
|---|---|---|---|
| Vision normale | 28,2 | **28,3** | 15 |
| Protanopie | 15,5 | **19,3** | 8 |
| Deutéranopie | 22,4 | **16,8** | 8 |

Les deux passent. Ce qui tranche, c'est le **contraste sur le fond de page** :

| Série | Perron | **Horizon** |
|---|---|---|
| Marchés | 4,24:1 | **6,50:1** |
| Immobilier | 8,68:1 | **4,76:1** |
| Loyers | **1,74:1** ❌ | **10,47:1** |

Le gris des loyers de Perron est très en dessous du 3:1 — faiblesse que `theme-perron.css`
documente lui-même comme assumée, et qui obligeait à étiqueter les valeurs sous la courbe.
Horizon la corrige.

**La crainte initiale ne tenait pas.** Horizon inverse le code couleur (l'achat passe du terre
cuite au violet, la location de l'olive au rouge brique) et on pouvait redouter que violet contre
rouge brique se confonde sous daltonisme. C'est l'inverse : la paire se sépare **mieux** que
terre cuite contre olive, en protanopie comme en deutéranopie.

### 01/10/2026 — alignement complet sur la branche de Codex

**Décision de Lucas** : main reprend **l'intégralité visuelle** de `codex/interface-horizon`
(commit `bdb6c02`), accueil et simulateur, pour que les deux worktrees repartent d'une base
identique. Ont été copiés **octet pour octet** : `index.html`, `simulateur.html`,
`css/accueil.css`, `css/style.css`, `css/theme-codex.css`, `js/accueil.js`. Retirés :
`socle.css`, `horizon.css`, `img/icones/`.

- **Seule différence voulue : le nom.** « Horizon » est le nom de la maquette de Codex ; le
  produit s'appelle **Æquo** (§1). Marque, titre, FAQ, adresse de contact fictive. Vérifier :
  `diff` des fichiers ci-dessus contre le worktree de Codex ne doit montrer que ces lignes.
- **Aucun fichier de calcul touché** : `app.js`, `calc.js`, `calc-location.js`, `scenarios.js`
  et `sauvegarde.js` étaient déjà identiques des deux côtés avant l'alignement. 106 tests verts.
- **Le thème porte de nouveau des règles de composants** (en-tête jaune, bulles ouvrables en
  jaune, bordures en tirets, garde-fous de largeur). La règle « un thème = des valeurs » ci-dessous
  est donc **suspendue** pour `theme-codex.css` : on a préféré l'identité avec Codex à
  l'échangeabilité du thème.
- **L'accueil a changé de contenu, pas seulement d'habillage** : la page « Carnet d'un choix »
  remplace l'ancienne (exemple chiffré via `calc.js`, FAQ en JSON-LD, animations). Celle-ci reste
  dans l'historique git (`09f7d0c`) si l'on veut en reprendre un élément.

### 02/10/2026 — l'accueil diverge de Codex

**Décision de Lucas** : l'exception « on ne réécrit pas `index.html` ni `accueil.css` » est
**levée pour l'accueil**. Le simulateur, lui, reste aligné sur Codex. La direction artistique
« Carnet d'un choix » est conservée telle quelle (palette, Instrument Serif / DM Sans / DM Mono /
Caveat, papier, rubans adhésifs, tampons, notes manuscrites, dessins SVG au trait) ; ce sont le
déroulé, les textes et la fluidité qui ont changé. Branche `feat/accueil-trame`.

- **Les fichiers ne sont plus minifiés** (commit de dé-minification vérifié sans écart de rendu,
  élément par élément, à 1440 et 390 px). `accueil.css` regroupe chaque nouvelle section avec
  ses propres points de rupture.
- **Principe : une section = une question du visiteur**, dans l'ordre de sa réflexion. Un
  visiteur qui ne lit que les surtitres et les titres doit comprendre toute l'histoire.

| # | Section | Question du visiteur | Fond |
|---|---|---|---|
| — | Couverture | C'est quoi ? | jaune |
| 01 | Deux camps, deux certitudes | Pourquoi est-ce si dur de trancher ? | papier |
| 02 | Ce que vous obtenez — l'aperçu | À quoi ressemble la réponse ? | blanc |
| 03 | La règle du jeu — Mêmes moyens | Comment Æquo compare ? | papier |
| 04 | Votre avenir n'est pas une ligne droite | Pourquoi personne ne peut me répondre d'avance ? | lavande |
| 05 | Trois façons d'aller plus loin (les piliers) | Que fait Æquo que les autres ne font pas ? | blanc |
| — | FAQ « On vous explique le reste » | Je peux vous faire confiance ? | papier, filet |
| — | Finale « Et le vôtre ? » + contact en pied de page | Je commence comment ? | jaune |

**Ce qui tient la page, et qu'une modification ne doit pas casser :**

- **La couverture dit ce qu'est Æquo** (06/10) : sans défiler, à 1440 comme à 390 px, on lit
  « simulateur », « gratuit », « sans inscription », « résidence principale », « premier achat ».
  Seuls les textes ont changé, la composition est celle de Codex. Deux phrases ont été vérifiées
  avant d'être écrites : « en quelques minutes » (tous les champs du simulateur sont pré-remplis)
  et « Aucune donnée envoyée » (aucune requête réseau dans le code ; seuls les CDN de polices et
  de Chart.js sont appelés, sans rien de ce qui est saisi). Si un jour une requête part avec la
  saisie — sauvegarde en compte, mesure d'audience —, **cette phrase devient fausse** : la
  remplacer par « Calculs faits dans votre navigateur, sans compte. ».
- **Le tampon de couverture a sa propre brique, `#9e3a23`**, plus sombre que `--orange` : il porte
  « 100 % gratuit / 0 € / sans inscription » en 8 px sur le jaune, où `--orange` n'atteint que
  3,8:1. Décision de Lucas. La carte postale de la couverture est un `<p class="postcard__titre">`,
  pas un titre : elle ne doit pas figurer dans le plan de la page.
- **Neutralité.** En 01, les deux citations sont sur deux cartes strictement identiques ; seul le
  sens de l'inclinaison change. Un poids visuel inégal ferait pencher la page. **On conteste
  l'absolu, pas l'idée** : le mot « toujours » est entouré à la main (même ovale SVG dans les deux
  cartes), jamais barré — un barré dirait « c'est faux », alors que le titre dit « les deux ont
  raison, parfois ».
- **Ordre revu le 06/10 (Lucas)** : l'aperçu remonte juste après le face-à-face — montrer dès le
  début ce qu'on obtient — et la règle du jeu le suit immédiatement, pour la continuité : on voit
  la réponse, puis comment elle est obtenue. Viennent ensuite les imprévus et les piliers.
- **Chaque « Et si » de 04 a sa réponse** : marchés → pilier 2, déménager sans vendre → pilier 3
  (plus bas, renvois « Répond à » avec le rond numéroté `.temps__repere`) ; partir plus tôt → le
  point mort, déjà montré par l'aperçu en 02 ; **la carte 1 y renvoie** (« plus haut ↑ »).
  L'aperçu, lui, ne porte pas de renvoi : il répondrait à une question pas encore posée. La
  transition de fin de 04 ne disqualifie pas l'aperçu : « L'exemple plus haut suppose des marchés
  réguliers… ». Supprimer une question oblige à revoir sa réponse.
- **Pilier 1 = l'épargne forcée** (06/10) : « Placeriez-vous vraiment la différence ? ». C'est la
  suite honnête de la règle du jeu (03) : à effort égal d'abord (« c'est la référence », dit 03),
  puis ce que l'utilisateur ferait vraiment — `locatairePlaceDifference`, souvent ce qui décide.
  Ses volets reprennent les deux boutons du simulateur. Nuance connue : le simulateur ne pose la
  question que si l'achat coûte plus que l'effort actuel (sinon, pas d'épargne forcée) ; le texte
  ne le précise pas, c'est le cas le plus courant d'un premier achat.
- **Les trois cartes de piliers partagent une grille** (`subgrid`, six rangées) : les volets des
  piliers 1 et 2 et les trois renvois tombent à la même hauteur. Empilées dès 1180 px : en
  dessous, trois colonnes écrasent les volets.
- **Pilier 2 : « Le passé » et « Des futurs possibles » occupent chacun une moitié égale** de la
  carte. Aucun des deux n'est l'appendice de l'autre. Même règle pour les deux volets du pilier 1.
- **Les noms suivent le simulateur** (« Le passé », « Des futurs possibles », « point mort »…).
  Rien n'est promis que le simulateur ne fait pas ; aucune affirmation absolue sur les concurrents.
- **L'aperçu (02) est calculé par `calc.js`**, chargé sur l'accueil pour ce seul bloc.
  `accueil.js` ne fait que mettre la sortie en forme. Le graphique est un SVG construit à la
  largeur réelle de sa feuille (une unité = un pixel), pour que les textes restent lisibles en
  mobile. Si le calcul échoue, chiffres et graphique restent cachés (`hidden`) : il ne reste que
  le titre et le lien, jamais un `NaN`.
- ⚠️ **Le jeu d'exemple de l'aperçu est provisoire** : 280 000 €, loyer 1 000 €, 25 ans, repris de
  l'ancienne accueil (`09f7d0c`). Les deux jeux par défaut du simulateur n'ont pas de croisement
  (`DEFAUTS` : achat devant dès l'an 1 ; `VALEURS_DE_TRAVAIL` : jamais), le point mort n'aurait
  rien eu à montrer. Depuis le 06/10/2026, le simulateur n'a plus d'exemple par défaut (il part
  vide, §11) : l'aperçu garde donc le sien, dans `ENTREES` (`accueil.js`). S'il change, vérifier
  qu'il croise encore : le point mort est la réponse au « partir plus tôt ».
- **Une seule animation** : apparition au défilement (`[data-apparait]`), par `translate` pour ne
  pas écraser les rotations des cartes, jamais sur un titre ; plus le tracé des courbes de 05.
  Tout est coupé sous `prefers-reduced-motion`.
- **Contact** : dans le pied de page, adresse marquée « provisoire » tant qu'elle est fictive.
- Contraste : tous les textes passent AA à 1440, 1024, 768 et 390 px, tampon compris depuis le
  06/10.

Les sous-sections suivantes décrivent l'étape précédente (30/09) et restent pour mémoire.

### Ce qui a dû être séparé — et la règle qui en sort

La version d'origine mêlait **176 lignes de valeurs et 19 règles de mise en forme** visant
nommément des composants du simulateur (`.entete`, `.bulle--ouvrable`, `.profil`, `.scenario`,
`.plateau__visu`…). Codex le savait et l'écrivait : « exception au thème de valeurs ».

Posées sur notre mise en page — et non sur la sienne, pour laquelle elles ont été écrites — ces
règles **coloraient les quatre bulles en jaune plein écran**. Chez lui les bulles sont petites et
le jaune est un accent ; chez nous elles occupent la page, et le simulateur devenait un mur.

D'où la règle, valable pour toute expérimentation future :

> **Un thème qui porte des règles n'est plus échangeable.** Les valeurs dans le thème, les
> intentions de mise en forme ailleurs. C'est ce qui permet de reprendre une version suivante sans
> hériter d'une mise en page qui n'est pas la nôtre.

Les 19 règles vivent dans **`frontend/css/horizon.css`, que personne ne charge**. C'est un menu
d'intentions à reprendre une par une, trié en trois :

- **neuf règles d'identité** (marque en DM Sans serré, numéros de bulle en sérif, ombre portée
  dure des boutons, filets d'accent, bordures en tirets) — transposables telles quelles ;
- **trois garde-fous de largeur** qui corrigent de vrais défauts d'étroitesse sur petit écran ;
- **deux décisions**, laissées en commentaire parce qu'elles ne sont pas de l'habillage : la
  couverture jaune sur les bulles, et le passage du plateau de résultat en une seule colonne.

Non repris : son garde-fou `prefers-reduced-motion` global en `!important`. `style.css` et
`accueil.css` en portent déjà trois, ciblés et plus fins.

### ⚠️ Notre exemplaire est figé

`theme-codex.css` est une **copie** prise le 30/09/2026, avant le premier commit de Codex. Il ne
se resynchronise pas avec le sien, et c'est délibéré : reprendre automatiquement ses mises à jour
réintroduirait ses règles de composants à chaque fois.

Pour récupérer une version ultérieure : comparer, prendre les valeurs, **laisser les règles**.

### Deux jetons dormants

`--couverture` (le jaune) et `--papier-lilas` ne sont utilisés que par `horizon.css`, qui n'est
pas chargé. Ils restent dans le thème pour que les règles commentées fonctionnent le jour où l'on
en réactive une. Ce ne sont pas des oublis.

---

## 13. Référencement (SEO) et domaine

Socle posé le 06/10/2026 (branche `feat/seo-socle`). Rien n'a changé à l'écran, hors deux
formulations de la FAQ.

| | |
|---|---|
| `<h1>` de l'accueil | contient le surtitre « Simulateur gratuit · sans inscription » ET le slogan — le slogan seul ne disait rien du sujet. Rendu identique à avant. |
| Titres d'onglet | le mot-clé en tête : « Simulateur acheter ou louer sa résidence principale — Æquo ». Description ≤ 160 caractères. |
| Partage | balises `og:*` et `twitter:*` sur les deux pages ; une image `img/partage.png`. |
| Données structurées | accueil seulement : `WebSite` + `WebApplication` (gratuite, Web, JavaScript requis). **Pas de `FAQPage`** : Google n'en affiche plus les résultats enrichis pour ce type de site. |
| Polices | **hébergées sur le site** (`fonts/`, `css/polices.css`) : plus de requête vers Google, ni délai, ni IP envoyée. Déclarations identiques à celles de Google — DM Sans, fichier variable, reste déclaré quatre fois (400 à 700), sinon la graisse 650 du simulateur changerait. Trois préchargements au plus, sur l'accueil. |
| Adresses | `/` et `/simulateur` ; `.htaccess` réécrit et redirige ; `canonical`, `og:url` et `sitemap.xml` disent tous la même adresse. |

### Régénérer les images

```bash
cd outils && npm install          # une fois — fontkit, wawoff2, Playwright, jamais déployés
npm run favicon                   # frontend/favicon.svg, favicon.ico, apple-touch-icon.png
npm run image-partage             # frontend/img/partage.png (relire le résultat : < 300 Ko)
```

Rien n'y est dessiné à la main : le « Æ » du favicon est le tracé de DM Sans 700 lu dans
`fonts/` ; l'image de partage reprend la maison de `index.html` et les couleurs d'`accueil.css`.
Si la couverture change, relancer `npm run image-partage`.

### Le jour où le domaine est acheté

`aequo.example` est un domaine **fictif** partout où une URL absolue est obligatoire. Une seule
recherche liste tout ce qu'il faut remplacer :

```bash
git grep -n "aequo.example"
```

Aujourd'hui : balises de partage et `canonical` des deux pages, JSON-LD de l'accueil,
`robots.txt`, `sitemap.xml`, et l'adresse de contact du pied de page (qui est aussi à créer).

Puis, au premier déploiement :

1. **`.htaccess`** (il ne se teste pas en local) :
   - `/simulateur` affiche le simulateur, **sans** changer d'adresse ;
   - `/simulateur.html` → 301 vers `/simulateur`, `/index.html` → 301 vers `/`,
     `/simulateur/` → 301 vers `/simulateur` (vérifier les codes avec `curl -I`) ;
   - `/css/polices.css`, `/fonts/dm-sans-variable.woff2`, `/img/partage.png`, `/favicon.svg`,
     `/robots.txt`, `/sitemap.xml` répondent 200 ; les polices portent
     `Cache-Control: public, max-age=31536000, immutable`.
   - Ajouter alors la redirection HTTP → HTTPS prévue par docs/backend-spec.md, une fois le
     certificat actif.
2. **Google Search Console** : déclarer le domaine, soumettre `https://<domaine>/sitemap.xml`.
3. **Aperçu de partage** : tester l'accueil et le simulateur avec l'outil d'inspection de
   publication de LinkedIn (Post Inspector).
4. **Données structurées** : passer l'accueil au test des résultats enrichis de Google.
5. Mettre à jour les `lastmod` de `sitemap.xml`.

