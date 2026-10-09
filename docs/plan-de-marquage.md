# Plan de marquage — Google Analytics 4

**Source de vérité de la mesure d'audience.** Un événement ajouté, renommé ou retiré dans le code
l'est ici dans le même commit — et inversement. Mis en place le 08/10/2026 (branche
`feat/mesure-audience`).

| | |
|---|---|
| Propriété | GA4, ID de mesure **`G-1G05M0043V`** |
| Code | [`frontend/js/mesure.js`](../frontend/js/mesure.js) — chargé dans `<head>`, sans `defer`, sur les 5 pages |
| Point d'envoi unique | `Mesure.suivre(nom, params)` et `Mesure.suivreUneFois(cle, nom, params)` |
| Simulateur | appels dans [`frontend/js/app.js`](../frontend/js/app.js) (repli muet si `window.Mesure` manque) |
| Accueil, pieds de page, 404, `<details>` | **déclaratif** : attributs `data-mesure-*` dans le HTML, lus par `mesure.js` |

## Règles

1. **Aucun montant, aucune valeur saisie, aucune donnée personnelle** dans un paramètre. On envoie
   des *noms* (de champ, de bloc, de section), des catégories fermées, ou une tranche. Une donnée
   saisie qui partirait chez Google rendrait fausses la politique de confidentialité et la
   promesse « vos saisies ne quittent pas votre navigateur ».
2. **`suivre` ne lève jamais.** GA bloqué (bloqueur de publicité), pas encore chargé, stockage
   refusé : la page marche exactement pareil.
3. **Rien ne part hors de `aequo-immo.fr`** — sauf en mode test (`?debug_ga=1`). En local, les
   événements s'affichent dans la console (`console.debug('[mesure]', …)`) sans être envoyés.
4. **Pas de script en ligne** : la CSP l'interdit. Toute initialisation reste dans `mesure.js`.
   La CSP du `.htaccess` n'autorise que `*.googletagmanager.com` (script, image),
   `*.google-analytics.com` et `*.analytics.google.com` (connexion, image).
5. **« Une fois par page vue »** = une fois jusqu'au rechargement de la page (`suivreUneFois`).

## Paramètre commun

| Paramètre | Portée | Valeurs |
|---|---|---|
| `type_page` | `page_view` et tous les événements de la page (passé à `gtag('config')`) | `accueil` · `simulateur` · `legal` · `404` |

Il est lu sur la balise : `<script src="/js/mesure.js" data-type-page="…">`.

## Événements

### Accueil

| Événement | Question à laquelle il répond | Déclencheur exact | Paramètres |
|---|---|---|---|
| `home_section_vue` | Jusqu'où lit-on l'accueil ? Quelle section fait décrocher ? | La section est visible à 50 % (ou, si elle est plus haute que deux écrans, occupe la moitié de l'écran) — une fois par section et par page vue. Attribut `data-mesure-section`. | `section` : `hero` (couverture) · `croyances` (01, deux camps) · `apercu` (02) · `comparaison` (03, règle du jeu) · `ligne_droite` (04, l'avenir) · `piliers` (05) · `en_bref` (« Æquo en bref », depuis le 09/10/2026) · `faq` · `finale` |
| `home_cta_clic` | Quel bouton fait entrer dans le simulateur ? | Clic sur un lien vers `/simulateur` portant `data-mesure-cta`. | `emplacement` : `entete` (bouton du bandeau) · `couverture` (rond « Explorer mon projet ») · `apercu` (« Faire le calcul avec mon projet ») · `finale` (ticket « C'est parti ») |
| `faq_ouverte` | Quelles inquiétudes reviennent ? | Ouverture d'un `<details data-mesure-question>` (pas la fermeture). | `question` : `rentable` (« plus rentable d'acheter ou de louer ? ») · `duree_rentabilite` (« au bout de combien d'années… ») · `point_mort` (« qu'est-ce que le point mort… ») · `verdict` (« va me dire d'acheter ou de louer ? ») · `investir` (« pourquoi investir… ») · `calculs` (« qu'est-ce qui entre… ») · `scenarios` (« prédisent-ils… ») · `difference` (« en quoi Æquo est-il différent… ») · `donnees` (« où vont mes données ? ») · `auteur` (« qui est derrière Æquo ? »). Les cinq nouvelles depuis le 09/10/2026. |

> L'ordre réel des sections à l'écran est : hero, croyances, apercu, comparaison, ligne_droite,
> piliers, en_bref, faq, finale.

### Toutes les pages

| Événement | Question | Déclencheur | Paramètres |
|---|---|---|---|
| `lien_pied_clic` | Les pieds de page servent-ils ? Cherche-t-on le contact, les mentions ? | Clic sur n'importe quel lien d'un `<footer>` (accueil, simulateur, pages légales, 404). | `lien` : `accueil` · `mentions_legales` · `confidentialite` · `contact` |

### Simulateur

| Événement | Question | Déclencheur exact | Paramètres |
|---|---|---|---|
| `sim_demarree` | Combien de visiteurs du simulateur commencent vraiment ? | Premier `input` ou `change` sur un champ (`input`, `select`, `textarea` avec un `id`), une fois par page vue. | — |
| `sim_champ_modifie` | Quels champs sont touchés, lesquels jamais ? Où s'arrête-t-on ? | Premier `input`/`change` sur un champ donné, une fois par champ et par page vue. | `champ` : l'`id` du champ dans `simulateur.html` (`prixNetVendeur`, `apport`, `loyerActuel`, `tauxCredit`, `locatairePlaceDifference`, `melAnneeBascule`…). Les trois curseurs d'horizon (`horizon`, `horizonBis`, `horizonMel`) sont regroupés sous `horizon`. |
| `sim_resultat_affiche` | Combien vont jusqu'au verdict ? Lequel obtiennent-ils ? | Premier résultat **visible** par page vue : parcours complet ET question de l'épargne forcée répondue (ou sans objet). Un brouillon restauré complet le déclenche au chargement. | `verdict` : `achat` · `location` · `egal` (écart < 1 % du patrimoine, l'interface affiche « Les deux se valent ») |
| `sim_avance_ouvert` | Les explications et réglages avancés sont-ils consultés ? | Ouverture d'un bloc (pas la fermeture), à chaque ouverture. | `bloc` : `detail_ecart` (bouton « D'où vient cet écart ? ») · `scenarios` (carte « Et si les marchés changeaient ? », `#scenarioOuvrir`, qui ouvre l'introduction des scénarios) · `scenario_apercu` (aperçu d'un scénario) · `scenario_annees` (« Le détail année par année » de l'aperçu) · `location_fiscalite` (« Fiscalité et frais » de la mise en location) · `location_detail` (« Le détail du mois et de la revente ») · `hypotheses_sources` (« Hypothèses par défaut et sources », sous la bulle 4, depuis le 09/10/2026) |
| `scenario_choisi` | Quels scénarios de marché intéressent ? | Clic sur un scénario qui l'applique (pas le second clic qui le retire, pas la restauration du brouillon). | `scenario` : `passe-favorable-achat` (« Acheter en 1992 ») · `passe-defavorable-achat` (« Acheter en 2002 ») · `correction-immobiliere` · `decennie-perdue-bourse` — les `cle` de `scenarios.js` |
| `location_module_ouvert` | Le pilier 3 est-il découvert ? | Clic sur la carte « Et si vous la mettiez en location ? » (`#melOuvrir`), pas sur « Modifier ». | — |
| `location_resultat_affiche` | À quel horizon envisage-t-on de louer sa RP ? | Ouverture de la fenêtre de résultats de la mise en location avec un résultat calculable — après validation de la saisie (`#melValider`) ou à sa réouverture (`#melVoir`), à chaque ouverture. | `tranche_annee_bascule` : `1-5` · `6-10` · `11-15` · `16+` (année de mise en location, comptée depuis l'achat) |
| `brouillon_restaure` | Revient-on à une simulation commencée ? | Un brouillon local a été relu au chargement. | — |
| `sim_erreur` | Où le parcours bute-t-il ? | Validation refusée pour champs vides, ou stockage local refusé par le navigateur. | `type` : `champs_vides` · `stockage_indisponible` |

### 404

| Événement | Question | Déclencheur | Paramètres |
|---|---|---|---|
| `page_404` | Quels liens cassés amènent des visiteurs ? | Chargement de `404.html`. | `chemin` : `location.pathname`, 100 caractères au plus, **jamais** la chaîne de requête |

## À déclarer dans GA4

### Dimensions personnalisées (portée : événement)

Administration → Définitions personnalisées → Créer une dimension personnalisée.

| Paramètre d'événement | Nom affiché conseillé |
|---|---|
| `type_page` | Type de page |
| `section` | Section de l'accueil |
| `emplacement` | Emplacement du CTA |
| `question` | Question de la FAQ |
| `lien` | Lien du pied de page |
| `champ` | Champ modifié |
| `verdict` | Verdict |
| `bloc` | Bloc avancé |
| `scenario` | Scénario de marché |
| `tranche_annee_bascule` | Tranche d'année de mise en location |
| `type` | Type d'erreur |
| `chemin` | Chemin 404 |

### Événements clés

Administration → Événements clés : **`sim_resultat_affiche`** (la conversion principale : un
visiteur a obtenu sa réponse), **`sim_demarree`** (entrée dans le simulateur) et
**`location_resultat_affiche`** (usage du pilier 3).

### Réglages de la propriété

- **Conservation des données : 14 mois** (Administration → Collecte et conservation des données).
  Le défaut de GA4 est 2 mois ; la politique de confidentialité annonce 14.
- Signaux Google et personnalisation publicitaire : **désactivés**.

## Mode test et exclusion

| Paramètre d'URL | Effet | Mémorisé |
|---|---|---|
| `?debug_ga=1` | Active `debug_mode` (événements visibles dans **Administration → DebugView**). Envoie **même en local** et **même si `?moi=1` est actif** : sans quoi on ne pourrait jamais vérifier le marquage. | `sessionStorage` (`aequo.debug_ga`) : vaut pour tout l'onglet, pour suivre un parcours accueil → simulateur. |
| `?debug_ga=0` | Arrête le mode test dans l'onglet. | — |
| `?moi=1` | Exclut ce navigateur : gtag.js **n'est même pas chargé**. | `localStorage` (`aequo.moi`), jusqu'à `?moi=0` ou l'effacement des données du site. |
| `?moi=0` | Réintègre ce navigateur. | — |

Accès au stockage protégés : s'il est refusé, `?moi=1` ne vaut que pour la page en cours.

## Consentement — à faire avant le lancement public

Les cookies `_ga` sont déposés **sans consentement** pendant la phase de test (site en `noindex`).
Un **bandeau de consentement avec Consent Mode v2** est obligatoire avant le retrait du `noindex`
(checklist « Lancement public », CLAUDE.md §13). Il s'insérera dans `mesure.js` : `gtag('consent',
'default', {…: 'denied'})` avant le `config`, puis `'update'` au choix de l'utilisateur.
