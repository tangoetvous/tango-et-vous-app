# Tango & Vous — Contexte projet pour Claude Code

## Session 2026-07-13 — Formulaire de contact (public → admin)

Nouvelle fonctionnalité complète, calquée sur le patron **cours particuliers** (formulaire public → onglet admin → notifications). Chargement **à la demande** (pattern vidéos), **aucune modif de `tev-supabase.js`**.

- **Formulaire public `contact.html`** (intégrable iframe Wix) : champs **Prénom\***, **Nom\*** (séparés), **Email\***, **Téléphone\*** (obligatoire depuis 2026-07-13), **Message\***. Thème clair (header noir/or + accent bordeaux `#8b1a2b`). Honeypot anti-bot (`#c-website`, invisible → succès factice si rempli). INSERT direct `TEV.client.from('messages_contact').insert(...)` **SANS `.select()`** (règle RLS iframe Wix). Puis fetch `/api/notify/contact` + `TEV.ajouterNewsletter(email,'contact')` + BroadcastChannel `contactMessage` + postMessage hauteur. Pas de Turnstile (comme newsletter ; skip en iframe de toute façon).
- **Table Supabase `messages_contact`** (`supabase/messages_contact_schema.sql`, **À EXÉCUTER**) : `id, created_at, prenom, nom, email, tel, message, source, statut (nouveau|traite), lu`. RLS : **SELECT/UPDATE/DELETE = `is_admin()` uniquement** (messages privés), **INSERT public** (anon). GRANT anon+authenticated. Ajoutée à `supabase_realtime`.
- **Worker** : route `POST /api/notify/contact` (sans auth) → `handleNotifyContact` : notif panel 🔔 (`_insertNotification('contact', …, 'contact')`) + **email admin** (`tangoetvous@gmail.com`) + **email de confirmation à l'expéditeur avec récap de son message** + **push admin** (`getFcmTokensAdmin`+`sendFcmPush`). Sender Brevo `contact@tangoetvous.fr`.
- **Onglet admin « 📨 Contact »** (`renderContact`, `_contactCard`) : chargement à la demande (`_chargerContact` via `TEV.client.from('messages_contact')`, state `_contactMsgs`/`_contactLoaded`), liste triée récente d'abord, badge NOUVEAU (statut≠traite, bordure rouge), boutons ✉️ Répondre (Gmail compose), 📞 Appeler, ✓ Marquer traité / ↩ Rouvrir (`_contactToggleStatut`), 🗑 (`_contactSupprimer` + `ouvrirModalConfirm`). **XSS** : tout le contenu public échappé via `escHtml`. Câblage : `_LABELS['contact']`, dispatch `doRender()`, garde realtime (`postgres_changes` INSERT `messages_contact` → `_chargerContactForce`), dispatch BroadcastChannel `contactMessage`.
- **Menu admin réorganisé** : Contact placé juste après Devis (rangées passées de 6 à 7, 4 boutons/rangée, Vidéos seule sur la dernière). L'ordre des onglets = ordre des `<button class="tab-btn">` dans le HTML (admin.html ~549-570), pas un tableau JS.
- **Tests** : groupe Q (`tests/q-contact.spec.js`, 4 tests : champs séparés, validation, honeypot, onglet admin + menu).
- **⚠️ Restant à faire par l'admin** : (1) ✅ SQL `messages_contact_schema.sql` exécuté (2026-07-13) ; (2) **coller l'iframe `https://app.tangoetvous.fr/contact.html` sur Wix** (voir todolist). Le numéro de tél affiché dans le header (`+33 6 61 72 79 98`) vient de la capture — à corriger si besoin.

## Budget prévisionnel (onglet Compta) — EN CONSTRUCTION (specs seulement, NE RIEN CODER)

Nouvelle rubrique **dans Compta** (`admin.html`) : un **budget prévisionnel** = **recettes prévues** vs **dépenses prévues** (montants estimés, éventuellement vs réels plus tard). ⚠️ **Spécifications en cours de collecte — l'utilisateur précisera peu à peu. NE PAS commencer à coder tant qu'il ne le demande pas explicitement.**

**Recettes prévues (5 postes)** :
1. Cours de Tango
2. Cours de Yoga
3. Événements
4. Séjours Tango
5. Formations professionnelles

**Dépenses prévues (16 postes)** :
1. Cachets des spectacles (représentations **et** répétitions)
2. Salaires des Cours
3. Salles de Cours (Sorano Yoga, Sorano Tango, Espas Danse Tango)
4. Box de rangement
5. iCloud 2 To
6. Publicité
7. Assurance
8. Site Wix
9. Domaines web
10. Téléphone
11. Bunny Stream
12. Primes de Salaire
13. Thalie Santé au Travail
14. AssoConnect
15. Illicado
16. Frais de formation Pro

**Trésorerie / soldes à suivre** (l'admin doit pouvoir les renseigner) :
- Solde du **compte en banque**
- Solde du **compte AssoConnect**
- Montant **à déposer en banque** (encaissements pas encore déposés)

**À préciser plus tard avec l'utilisateur** (avant tout code) : périodicité (annuel/mensuel ?), lien avec les données existantes (remises_banque, chèques, montants d'inscriptions déjà en base ?), prévu vs réalisé, stockage (table Supabase dédiée ou clé `parametres` ?), UI (tableau éditable ? graphique ?).

## Session 2026-07-10 — Rubrique « Vidéos des cours » (Bunny Stream) — EN CONSTRUCTION

Nouvelle fonctionnalité en cours : bibliothèque vidéos par cours (récaps/technique), avec **upload direct par les élèves + modération admin** avant visibilité. Objectif stratégique : donner une vraie raison d'aller sur l'app (contenu unique introuvable sur WhatsApp) → puis pousser install PWA + push. Maquette validée (fichiers scratchpad, thèmes clair+sombre).

- **Hébergement** : **Bunny Stream** (pas Cloudinary — vidéos iPhone ~240 Mo dépassent la limite 100 Mo du Cloudinary gratuit ; Bunny = pay-as-you-go ~1-2 $/mois, upload direct, pas d'engagement). Library ID **`701214`**, CDN host **`vz-15dcd245-cc4.b-cdn.net`** (non secrets, en dur dans worker.js). Clé API = secret Cloudflare **`BUNNY_STREAM_API_KEY`** (à poser). Réplication : Frankfurt (Main) + London (1 replica Europe). Activer **« Keep original files »** pour le téléchargement admin de l'original.
- **Table Supabase** `videos_cours` (`supabase/videos_cours_schema.sql`, VERSIONNÉ, à exécuter) : métadonnées seules (titre, ville, niveau, saison, `bunny_video_id`, `statut` en_attente/approuvee/refusee, `source` eleve/admin, `soumis_par_email/nom`). RLS verrouillée : élève ne peut INSÉRER qu'**en son nom + en_attente** (pas d'auto-approbation), SELECT = approuvées + sa propre proposition + admin, UPDATE/DELETE = admin.
- **Backbone worker (FAIT ce jour, non-bloquant tant que le secret manque)** : `POST /api/videos/create` (auth élève/admin → crée l'objet Bunny + **signature TUS** pour upload direct client, clé API jamais exposée) ; `GET /api/videos/download?id=` (admin → URL de l'original) ; `POST /api/notify/video-a-valider` (élève propose → alerte admin panel 🔔 + push) ; `POST /api/notify/video-publiee` (admin publie → notif in-app + push aux élèves du cours via `_getEmailsByGroupes` + `_buildTokenMap`). Helper `_sha256hex`. Constantes `BUNNY_STREAM_LIBRARY_ID`/`BUNNY_STREAM_HOST` près de SUPABASE_URL.
- **Décisions produit** : n'importe quel élève peut proposer (modération = filet) ; crédit « proposé par [Prénom N.] » gardé ; tri par date + recherche par thème ; lecteur **lecture seule** côté élève (embed Bunny, dissuasif pas verrou 100 %), **téléchargement original réservé admin** ; **refuser supprime aussi la vidéo côté Bunny** (pas de stockage inutile). Message de valeur **universel** (pas « pointe ta présence » → caduque pour les forfaits).
- **FAIT (2026-07-10)** : socle client (`js/tev-videos.js` window.TEVVID : upload TUS, embedUrl/thumbUrl, requêtes par saison ; chargé en defer dans index+admin avec tus-js-client jsDelivr) ; **onglet admin 🎥 Vidéos** — Publier (upload direct + toggle « Notifier les élèves » décochable + notif `video-publiee`) + Bibliothèque (par cours, lecteur modal iframe lecture seule). Testé en réel : upload élève→Bunny OK, lecture OK. Groupe O Playwright (4 tests).
  - ⚠️ **PIÈGE 1 — expiration signature TUS en MILLISECONDES** : Bunny attend `AuthorizationExpire` en ms (`Date.now()`), pas en secondes. En secondes → Bunny lit ~1970 → « expirée » → 401 sans CORS → le navigateur affiche `response code: n/a`.
  - ⚠️ **PIÈGE 2 — CSP dans les 3 politiques** : Cloudflare `_headers` applique la politique globale `/*` **ET** celle spécifique (`/admin.html`, `/index.html`) ; une ressource doit être autorisée par **toutes**. Il faut donc ajouter `video.bunnycdn.com` + `vz-15dcd245-cc4.b-cdn.net` (connect-src) et `iframe.mediadelivery.net` (frame-src) aux **3** politiques, pas seulement aux spécifiques (sinon la globale bloque). Diagnostic utile : listener `securitypolicyviolation`.
- **FAIT (2026-07-10, suite)** : (1) **rubrique élève** (index.html, onglet 🎥 Vidéos) : `renderVideosEleve` — liste des vidéos approuvées de SES cours (saison courante via `_tevCoursActifs`), groupée par cours si 2 cours, recherche par thème (filtre la liste seule = pas de perte de focus), lecteur modal iframe lecture seule, bannière « en attente » pour ses propres propositions ; bouton **« Proposer une vidéo »** (modale titre+cours+fichier → `TEVVID.uploadVideo` source=eleve/statut=en_attente en son nom → notif `video-a-valider`). Tests groupe P. (2) **Modération admin** : 3ᵉ sous-onglet **📋 À valider** (badge rouge du nb) — chaque proposition : preview (lecteur), soumissionnaire/cours/date, boutons **⬇ Original / ✓ Approuver / ✗ Refuser**. Approuver → `TEVVID.approuver` + notif `video-publiee`. Refuser + bouton 🗑 Biblio → `TEVVID.supprimer` (efface Bunny via `POST /api/videos/delete` PUIS la ligne Supabase) avec `ouvrirModalConfirm`. (3) **Route worker** `POST /api/videos/delete` (`handleVideoDelete`, admin, `DELETE video.bunnycdn.com/library/701214/videos/{id}` — 404 toléré). `tev-videos.js` bumpé **?v=2** (helpers approuver/supprimer). Tests groupe O (5).
- **RUBRIQUE COMPLÈTE ET VALIDÉE EN RÉEL (2026-07-10)** : upload élève+admin, lecture, téléchargement admin (avec % de progression, récupéré dans Photos), proposition→À valider→approuver (toggle notif décochable)→visible élève+biblio, refuser→supprimé partout (Bunny inclus, sans push). Approuver ET Publier ont un **toggle « Notifier les élèves »** décochable (tests / publication discrète).
  - ⚠️ **PIÈGE 3 — service worker** : `sw.js` enveloppait TOUS les same-origin dans `e.respondWith(fetch())`, y compris `/api/videos/download` → « FetchEvent.respondWith received an error: Load failed » au téléchargement. Fix (sw.js, CACHE v18) : ignorer les requêtes **non-GET** ET toute URL **`/api/`** (règle générale utile pour tout POST/streaming). Sur iPhone le SW se met à jour paresseusement → fermer/rouvrir l'app pour l'activer.
  - ⚠️ **PIÈGE 4 — téléchargement Bunny** : `/original` n'est pas toujours servi en direct. Le worker (`handleVideoDownload`) interroge l'API Bunny (statut d'encodage + `availableResolutions`), envoie un **Referer** `app.tangoetvous.fr` sur le fetch CDN, et essaie `/original` puis `play_{res}.mp4` (MP4 fallback, activé sur la lib) de la meilleure à la plus basse ; relaie le flux avec `Content-Disposition: attachment` + `Content-Length` (pour le %). Client : lecture du ReadableStream → bandeau `⬇ Téléchargement… X%` → `✓ Téléchargé`. Auth du download via header JWT (fetch, pas navigation).
- **Date du cours (2026-07-10)** : colonne `videos_cours.date_cours DATE` (SQL `ALTER TABLE videos_cours ADD COLUMN IF NOT EXISTS date_cours DATE;` exécuté). Champ « Date du cours » (facultatif) dans les 2 formulaires (Publier admin `vid-date`, Proposer élève `vidp-date`) → `TEVVID.uploadVideo({dateCours})` → `date_cours`. **Affichée à la place de la date d'envoi** sur toutes les cartes (repli sur `created_at` si vide). `tev-videos.js` bumpé **?v=3**.
- **Nudge install/push (2026-07-10)** : bandeau additif en tête de `renderAccueil` (`_installNudgeHtml`), entonnoir pas-installé→guide device-aware / installé-sans-push→bouton activer (réutilise `activerPushEleve`) / les deux→rien. Fermable (`_nudgePlusTard`, masqué 2 j via `tev_nudge_dismiss`). Message universel centré vidéos. Tests P4.
- **Récap accueil (2026-07-10)** : carte **« Récap de la semaine »** épinglée en tête de `renderAccueil` (sous le hero, placeholder `#acc-recap-video`) — met en avant la **dernière vidéo approuvée** du/des cours actifs (miniature cliquable → `_vidPlayE`, titre, date `date_cours||created_at`, crédit, bouton « Voir toutes les vidéos → » = `switchTab('videos')`). Titre « 🎥 Récap de la semaine » + badge NOUVEAU si ≤ 10 j, sinon « 🎥 La dernière vidéo de ton cours ». Injection **asynchrone** (`_renderAccRecapVideo()` appelée après `pane.innerHTML` dans un `try/catch`, pattern `_renderAccMilList`). Cache dédié `_vidRecapCache` (réutilise `_vidEleveCache` si présent → pas de double-fetch) ; **placeholder vidé si 0 vidéo** (pas de carte fantôme). But : donner une raison de revenir → habitude → push. Tests P5 (mise en avant + boutons) + P6 (état vide).
- **Badge encodage (2026-07-10)** : vidéo fraîchement uploadée → Bunny l'encode (miniature figée, lecture KO qq minutes). Badge **« ⏳ Encodage en cours… »** posé sur la miniature, retiré dès que prêt. Route worker **`GET /api/videos/status?ids=…`** (`handleVideoStatus`, auth élève/admin, capé 12 ids, clé API serveur) → statut Bunny (4=prêt, <4=en cours, 5/6=erreur). `tev-videos.js` **?v=4** : `TEVVID.isRecent(v)` (créée <24 h), `statuses(ids)`, `watchEncoding()` — balaie le DOM pour `[data-tev-encoding]`, pose/retire le badge (overlay + `pointer-events:none`), se relance toutes les 8 s tant qu'une vidéo encode (max ~4 min), **fail-open** si l'API muette (pas de badge, cliquable). Miniatures marquées `data-tev-encoding` si récentes : élève (`_vidCardE`, propositions en attente, récap accueil), admin (`_vidAValider`, `_vidBibliotheque`). Watcher lancé après chaque rendu (`_vidRenderShellE`/`_vidFilterE`/`_renderAccRecapVideo` côté élève, `setTimeout(0)` dans `renderVideos` côté admin). Same-origin → pas de modif CSP. Test P7.
- **Téléchargement natif iOS (2026-07-10)** : le téléchargement admin d'un original se faisait en blob + `<a download>` → sur iOS le fichier atterrissait à un endroit confus. Désormais, sur **iOS/iPadOS + Web Share niveau 2** (`navigator.canShare({files})`), après le téléchargement (avec %) on affiche un bandeau avec bouton **« 📥 Enregistrer la vidéo »** → `navigator.share({files:[File]})` → **feuille de partage iOS native** (Enregistrer dans Fichiers / Photos). ⚠️ 2 temps obligatoires : `navigator.share` exige un **geste frais**, or le fetch de 240 Mo a « consommé » le geste du 1er clic → d'où le bouton à taper. `AbortError` (annulation) = silencieux ; autre erreur = repli `_vidDlDirect`. Desktop / vieux iOS → `_vidDlDirect` (téléchargement direct classique, inchangé). Helpers `admin.html` : `_vidDlDirect`, `_vidDlShowSaveBtn`, `window._vidDlSave`, `window._vidDlHide`, vars `_vidDlFile`/`_vidDlFileName`. Test O6.
- **Polish éventuel restant** : couverture Playwright élève plus profonde (eleveData mocké).

## Session 2026-07-08 — Cartes 10 : date d'expiration forcée manuellement

Nouvelle possibilité pour l'admin : **saisir/forcer la date d'expiration** d'une carte directement dans la modale « ✏️ Modifier les cours » (Cartes 10 → Détails).

- ⚠️ **SQL à exécuter dans Supabase AVANT le déploiement** (sinon la sauvegarde de la modale échoue avec « column carte_exp_manuelle does not exist ») : `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS carte_exp_manuelle BOOLEAN DEFAULT false;` (versionné dans `supabase/carte_exp_manuelle.sql`).
- **Champ ajouté** : `modal-ec-expiration` (input date) + hint « Laisser vide = calcul automatique (JJ/MM/AAAA) ». Vide = calcul auto (`calcExpiration`) ; date saisie = **forcée collante**.
- **Collant (sticky)** : une date forcée persiste à la ré-édition (le champ est reprérempli). Le flag est stocké dans `eleves.carte_exp_manuelle` (cartes eleves) OU `donnees.expManuelle`+`donnees.expiration` (cartes reconstruites `_fromCoursTango`, ex. email partagé).
- **Reset auto au renouvellement** (décision admin) : `tevRenouvelerCarte` (élève + admin), le renouvellement auto overflow (`tevPointerCours`) et `renouvelerCarteAction` (local DEMO + réel) remettent `carte_exp_manuelle=false` → retour au calcul automatique.
- **⚠️ Le POINTAGE ne réécrase PAS une date forcée** (fix 2026-07-08 après test réel gloubi boulga) : le pointage du 1er cours d'une carte fixait `carte_date_achat` ET recalculait `carte_expiration` (écrasant la date forcée → carte affichée « à renouveler » + points rouges car la date auto retombait dans le passé). Corrigé : `tevPointerCours` (tev-supabase.js) et `pointerCoursAction` (admin.html DEMO) ne recalculent l'expiration au 1er cours QUE si `!carte_exp_manuelle` / `!c.expManuelle`. Le renouvellement (carte pleine → overflow) continue de remettre en auto (voulu).
- **Respect du flag** : `_buildCartesData` (admin) lit `donnees.expManuelle` pour les cartes `_fromCoursTango` (sinon recalcul auto) ; `sauvegarderEditCarte` ne recalcule QUE si le champ est vide ; les cartes eleves affichent `c.expiration` (forcée) via `c.expiration || calcExpiration(...)`.
- `tev-supabase.js` : `expManuelle: e.carte_exp_manuelle` mappé dans les cartes admin ; `tevPointerCours` lit `eleve.carte_exp_manuelle` (via `select('*')`). ⚠️ Fichier partagé modifié → **cache bumpé `?v=13`** dans les 9 HTML. Helpers admin ajoutés : `_carteExpManuelle(c)`, `_isoDateInput(d)`, `_fmtJJMM(d)`.
- **Tests** : Playwright groupe N (`tests/n-carte-expiration-manuelle.spec.js`, 4 tests : forçage collant + prérempli, vidage→auto, renouvellement→reset, **pointage 1er cours ne réécrase pas la date forcée**).

## Session 2026-07-08 — Newsletter (collecte d'emails)

Nouvelle fonctionnalité complète, testée (Playwright groupes K+L), **ajout automatique sans consentement** (choix admin — noter le point RGPD).

- **Table Supabase `newsletter_emails`** (`supabase/newsletter_schema.sql`, VERSIONNÉ) : `id, created_at, email, source`. **RLS RGPD** : INSERT public (anon), **SELECT/DELETE réservés `is_admin()`** → les emails ne sont PAS lisibles avec la clé publique. Pas de contrainte UNIQUE (dédup à l'affichage) → aucun insert ne peut échouer. ⚠️ SQL à exécuter dans Supabase (non exécuté automatiquement).
- **Helper central** `TEV.ajouterNewsletter(email, source)` (`tev-supabase.js`) : INSERT sans `.select()` (règle anon), garde email vide/invalide. Exposé dans `window.TEV`.
- **Formulaire public** `newsletter.html` : un seul champ email, intégrable iframe Wix (postMessage hauteur, BroadcastChannel `newsletterInscription`, écran succès). URL : `https://app.tangoetvous.fr/newsletter.html`.
- **Route worker** `POST /api/notify/newsletter` (sans auth, `handleNotifyNewsletter`) : ne fait QUE notifier l'admin (panel 🔔 + **push OS** via `getFcmTokensAdmin`+`sendFcmPush`). L'INSERT est côté client.
- **Onglet admin `emails-newsletter`** (« 📧 Newsletter ») : `renderEmailsNewsletter()` — liste dédoublonnée par email (garde la + récente), source + date, bouton « 📋 Copier toutes les adresses » (`newsletterCopierEmails` → `_copierEmailsFiches`, BCC-ready). Chargé via `tevGetAdminData` (`newsletter`) + merge `chargerDonnees`.
- **Branchement des 6 formulaires publics** : chacun ajoute l'email du soumissionnaire à la newsletter. 5 côté client (`TEV.ajouterNewsletter` juste après la construction du message d'inscription : cours-essai `cours-essai`, essai-yoga `essai-yoga`, inscription-cours `inscription-cours`, stages-pwa `stages`, cours-particuliers `cours-particuliers`) ; devis côté worker (`handleDemandeDevis` → `sbFetch('newsletter_emails'…)`, source `demande-devis`). Tous fire-and-forget, `source` distingue l'origine.
  - ⚠️ **Fix 2026-07-08** : dans `stages-pwa.html` le call était par erreur DANS la branche `if(IS_DEMO)` uniquement → aucune vraie inscription stage n'alimentait la newsletter. Déplacé dans le chemin réel après l'INSERT. Règle : toujours placer `ajouterNewsletter` APRÈS l'INSERT réussi du chemin réel, jamais dans une branche démo.
  - ⚠️ **Fix 2026-07-08 (couples)** : les formulaires n'ajoutaient QUE l'email du soumissionnaire, pas du partenaire. Corrigé sur les 3 formulaires couple : `inscription-cours` (dédup de tous les emails de `rows` — capture partenaire cours1 ET cours2), `cours-essai` (`d.partenaireEmail`), `stages-pwa` (`data.partenaireEmail`, gardé par `avecPart`). essai-yoga/cours-particuliers = pas de partenaire. Devis worker = 1 seul contact.
- **Branchement des 3 modales admin** (2026-07-08) : Inscription directe tango (`soumettreInscriptionDirecte` → source `inscription-directe`), Valider le paiement (`soumettreValiderPaiement` → `valider-paiement`), Inscription directe yoga (`soumettreInscriptionDirecteYoga` → `inscription-directe-yoga`). Chacun appelle `TEV.ajouterNewsletter(email, …)` **uniquement dans `!IS_DEMO` et seulement en cas de succès DB** (dans le `.then()` après le check d'erreur, à côté de l'envoi I03/yoga-validee). Email du soumissionnaire seul (pas le partenaire), cohérent avec les formulaires publics.
- **Cache** : `tev-supabase.js` bumpé **?v=11** (fichier partagé modifié) dans les 8 HTML + newsletter.html.
- ⚠️ **RGPD** : ajout automatique sans case de consentement (choix admin 2026-07-08). Si un jour opt-in requis → ajouter une case sur les formulaires et ne brancher `ajouterNewsletter` que si cochée.


## Session 2026-07-07 — Cartes N cours : cas mixte forfait+carte, fixes VP/suppression, complément forfait

Tests utilisateur des phases 2+3 (cartes paramétrables) terminés et validés. Corrections apportées :

### Cas mixte forfait+carte (élève 2 cours dont 1 seul en formule carte)
- **Carte rattachée au bon cours** : dans `soumettreInscriptionDirecte` ET `soumettreValiderPaiement`, la ville/niveau de la carte (push local `adminData.cartes` + `eleves.ville/niveau` en DB) viennent du **1er cours en formule carte** (`_carteRowDI` / `_carteCrsVP`), plus jamais de `coursCoches[0]`. Fallback cours0 si aucune carte (ou carte10unique).
- **Limite pointage journalière = nb de cours SUR CARTE** : les cours `type='forfait'` sont exclus du compteur dans `_maxParJour` (admin.html), `eleveData.nbCoursInscrits` (index.html) et `pointer_cours_qr` SQL (`AND type IS DISTINCT FROM 'forfait'` — ✅ exécuté). Un type vide/null compte comme carte (legacy).
- **Labels boutons pointage admin** (Cartes 10 → Pointage + Détails) : « + Pointer ×2 » / pastilles « ✓ Pointé » respectent `_maxParJour(c.email)` au lieu d'un « max 2 » supposé.

### Valider Paiement — bug fiche fantôme (emails partis, rien en base)
- **`_vpPrefillIds` jamais reset** : le global gardait les IDs d'une sélection précédente du dropdown → la soumission faisait UPDATE la fiche d'une AUTRE personne au lieu d'INSERT. Fix : reset dans `renderValiderPaiement()` et quand la sélection est vidée, + garde `_vpRowMatches(row)` (email identique, ou nom normalisé si fiche sans email) avant d'utiliser un ID prérempli.
- **Erreurs DB visibles** : chaque insert/update `inscriptions_cours` + upsert `eleves` affiche un toast en cas d'`error` ; **l'email I03 n'est envoyé que si toutes les écritures ont réussi**.

### Suppression élève inscrit à 2 cours
- `confirmerSupprimerEleve` : n'archive QUE le cours cliqué. La cascade (lignes carte10 du même email + `eleves.carte_statut='supprimé'`) ne s'applique que si l'élève n'a **plus aucun autre cours actif** de la saison (`_resteActif`). Garde email vide (fiches partenaires : cascade désactivée). Modale : « Seul ce cours (…) sera supprimé ».
- `retablirEleve` : réactive aussi la carte (`carte_statut` → 'Active' si `utilises>0`, sinon 'Nouvelle carte') si elle avait été archivée par la cascade et que la fiche rétablie n'est pas un forfait.

### Passer en complément forfait annuel (modal Renouveler)
- **`passerEnForfait(email, nom, complement)`** : champ `modal-ren-complement` (« Complément réglé (€) ») dans la modal Renouveler, reset à l'ouverture. Le montant est **ajouté au `montant` de la 1ère inscription active non-isRenewal** (comptabilité) + trace `donnees.complementForfait` / `complementForfaitDate`. Ciblage DB par `.eq('id', …)` uniquement si id réel (pas `CT<timestamp>` local).
- **⚠️ Règle : `carte_statut='Forfait'`** après conversion (local + DB) — jamais 'Active'/'Nouvelle carte', sinon l'espace élève continue d'afficher le suivi de carte (`isCarteActive` dans index.html). 'Forfait' est invisible dans `_buildCartesData` (admin) ET donne `carte.type='forfait'` côté élève.
- Le bouton « 🔄 Forfait » des fiches Cartes 10 → Détails convertit toujours SANS montant (correction rapide) — le champ montant n'existe que dans la modal Renouveler.

## Session 2026-06-15 — « Mon niveau » : curriculum éditable + niveau Avancé 2

### ✅ Curriculum data-driven, commun à toutes les saisons

La rubrique « Mon niveau » (espace élève, `index.html`) et le gestionnaire de vidéos pédagogiques (admin → Paramètres → Fonctionnalités) lisent désormais le vocabulaire/notions depuis une **source unique éditable**, stockée dans Supabase `parametres` clé **`tev_niv_curriculum`** (⚠️ **sans suffixe de saison** — commune à toutes les saisons).

**4 niveaux cumulatifs** (au lieu de 3) : `deb` (Débutant), `int` (Intermédiaire), `adv` (Avancé 1), `adv2` (Avancé 2). 8 groupes (Vocabulaire + Notions × 4 niveaux), 108 items par défaut.

**Format stocké** :
```json
{ "groups": [ { "id":"vd", "lvl":"deb", "label":"🌱 Vocabulaire Débutant",
               "items":[ {"id":1,"n":"Marche face à face","ab":"F"}, … ] }, … ] }
```
`ab` (abrazo) : `null` | `"O"` (ouvert) | `"F"` (fermé) | `"OF"` (les deux).

**Édition admin** : Paramètres → Fonctionnalités → **📚 Vocabulaire & notions** (accordéon `_nivCurrExpanded`). Ajout / modif / suppression d'items par groupe + sélecteur abrazo. Sauvegarde → `TEV.setParam('tev_niv_curriculum', …)`. Les **labels de groupe et les niveaux ne sont pas éditables** (structure stable) — seuls les items le sont.

**Réutilisation des ids** : les réponses élève (`tev_niv_a_<email>`) et les vidéos (`tev_niv_videos`) sont **indexées par `item.id`**. Un nouvel item ajouté reçoit `id = max(ids)+1` (`_nivCurrNextId`). Ne jamais réutiliser un id supprimé.

### ⚠️ Règle permanente — garder les deux défauts synchronisés

Le curriculum par défaut est **dupliqué** dans trois fichiers (apps séparées, pas de JS partagé) :
- `index.html` → `const _NIV_GROUPS_DEFAULT` (+ `_NIV_LEVELS` + `_NIV_ST`)
- `admin.html` → `var _NIV_CURRICULUM_DEFAULT` (+ même structure)
- `mon-niveau.html` → `const _NIV_GROUPS_DEFAULT` (+ `_NIV_LEVELS` + `_NIV_ST`) — page publique Wix (voir ci-dessous)

Toute modification du défaut doit être appliquée **aux trois** à l'identique (mêmes ids, mêmes noms, mêmes abrazos). Le défaut sert de fallback quand `tev_niv_curriculum` est absent en DB.

### Page publique `mon-niveau.html` — intégrable Wix (créée 2026-06-15)

Version **autonome et publique** de la rubrique « Mon niveau », destinée à être intégrée en iframe sur le site Wix (`www.tangoetvous.com`). Permet à n'importe quel visiteur de faire l'auto-évaluation **sans connexion**.

- **URL** : `https://app.tangoetvous.fr/mon-niveau.html`
- **Headers / CSP** : le fichier n'est PAS dans la liste DENY de `_headers` (seuls `admin.html` et `index.html` y sont) → il hérite de la règle `/*` qui autorise les domaines Wix en `frame-ancestors`. Aucun header spécifique à ajouter.
- **Données** : lit `tev_niv_curriculum` et `tev_niv_videos` depuis Supabase via `TEV.client` (clé anon, lecture publique) — **exactement** comme `index.html`. Donc le curriculum reste piloté depuis Paramètres → Fonctionnalités → Vocabulaire & notions, et la page Wix se met à jour automatiquement.
- **Réponses élève** : stockées en `localStorage` aux clés **`tev_niv_a`** et **`tev_niv_l`** (sans suffixe d'email, contrairement à index.html qui utilise `tev_niv_a_<email>`). Aucune écriture en base, aucune auth.
- **Bouton CTA résultats** : `const _NIV_CTA_URL = 'https://app.tangoetvous.fr/cours-particuliers.html'` → `window.open(_NIV_CTA_URL, '_blank')`. À remplacer par l'URL de la page Wix « cours particuliers » si souhaité.
- **Hauteur iframe** : `postMessage({type:'tevHeight',height:h},'*')` (load + resize + MutationObserver), même mécanisme que les formulaires publics.
- **Thème** : sombre (variables `:root` copiées de l'espace élève), header noir « TANGO & VOUS / Mon niveau ».
- **Limites connues** : (1) cloisonnement du `localStorage` en iframe Wix (Safari/Chrome) → les réponses peuvent ne pas persister d'une visite à l'autre ; (2) pas de synchro avec le compte élève (version anonyme).
- **⚠️ Règle de sync** : `mon-niveau.html` duplique tout le JS de la rubrique (`_NIV_ST`, `_NIV_LEVELS`, `_NIV_GROUPS_DEFAULT`, `_nivRenderS1/2/3`, etc.). Toute modification de « Mon niveau » dans `index.html` (logique de rendu, échelle de maîtrise, estimation) doit être répercutée ici aussi.

### Mécanique

- **index.html** : `_NIV_GROUPS`/`_NIV_ALL` sont des `let` reconstruits par `_nivRebuildAll()`. `renderNiveau()` charge `tev_niv_curriculum` (async, une fois via `_nivCurriculumLoaded`) et appelle `_nivApplyCurriculum()` (validation défensive) puis re-render. `_nivVisLvls()` est générique sur l'ordre de `_NIV_LEVELS`. Labels via `_nivLvlName()` / `_nivLvlLabel()`. Estimation de niveau (`est`) généralisée : on monte d'un cran tant que les niveaux précédents sont ≥55 %.
- **admin.html** : `_NIV_CURRICULUM` (cache mémoire) chargé via `_nivCurrLoad()` (localStorage → fallback défaut). `chargerParamsRemote` mirrore `tev_niv_curriculum` en localStorage (via `getAllParams`) et invalide le cache (`_NIV_CURRICULUM = null`). `_nivFetchRemote()` recharge vidéos + curriculum à l'ouverture d'un éditeur. Le gestionnaire de vidéos itère sur `_nivCurrGroups()` (plus de `_NIV_VID_REF` hardcodé).
- **Polling 15s** : garde ajoutée dans `_renderTabSiPasFormulaire` — `if (currentTab==='parametres' && (_nivCurrExpanded || _nivVidExpanded)) return;` pour ne pas écraser les saisies en cours.

---

## Session 2026-06-09 — Thème clair Inscriptions Tango + tri guideurs/guidées

### ✅ Thème clair sur l'onglet Inscriptions Tango (`admin.html`)

Appliqué sur les sous-onglets `tous`, `attente_validation`, `attente_paiement` uniquement (pas sur les formulaires `inscrire` / `valider_paiement`).

#### Mécanisme : deux classes CSS scoped

**`body.ct-light-page`** — activée/désactivée dans `renderTab()` :
```javascript
var _ctLightPage = currentTab==='cours-tango'
  && ['tous','attente_validation','attente_paiement'].indexOf(sousOngletCoursTango)>=0;
document.body.classList.toggle('ct-light-page', _ctLightPage);
```
Effets : fond de page `#f0f0f5`, textes `#111`, labels stats `#000 font-weight:700`, titres de section en doré `#7c5c00` à 13px.

**`.ci-light`** — div wrapper autour du pipeline de chaque cours dans `renderCoursTango()` :
```javascript
h += '<div class="section-hdr">'+lbl+'</div>'
   + '<div class="ci-light">'
   + ciInscritsHtml   // accordéon "Déjà inscrits"
   + note             // "— en attente de paiement ou validation —"
   // + pipeline _gcGroups.forEach (inside ci-light, closed after)
   + '</div>';
```
Effets : fond blanc pour les `.point-row`, noms en `#111 !important`, sous-textes (partenaire ♥) en `#111`, flèche toggle en `#111 !important`, pills en couleurs claires.

#### Règles CSS à réutiliser sur d'autres rubriques

Pour appliquer le même thème clair à un autre onglet `monOnglet` :

1. **Ajouter la garde dans `renderTab()`** :
```javascript
var _ctLightPage = (currentTab==='cours-tango' && [...])
  || (currentTab==='monOnglet' && [...]);
document.body.classList.toggle('ct-light-page', _ctLightPage);
```

2. **Envelopper le listing dans `.ci-light`** (si `.point-row` sont utilisés).

3. **CSS déjà en place et réutilisable** (ne pas dupliquer, il s'applique à tout `.ci-light`) :
```css
.ci-light .point-row   { background:#fff; border:1px solid #222; }
.ci-light .point-nom   { color:#111 !important; }
.ci-light .point-sub   { color:#111; }
.ci-light .ci-note     { color:#111; }
.ci-light [data-action="toggle-accord-ct"] { color:#111 !important; }
/* pills en couleurs claires */
.ci-light .pill-guideur { background:#bfdbfe; color:#1e3a8a; border-color:#3b82f6; }
.ci-light .pill-guidee  { background:#fce7f3; color:#831843; border-color:#ec4899; }
.ci-light .pill-ok      { background:#bbf7d0; color:#14532d; }
.ci-light .pill-warn    { background:#fed7aa; color:#7c2d12; }
.ci-light .pill-gold    { background:#fef08a; color:#713f12; }
```

4. **CSS `body.ct-light-page` déjà en place** :
```css
body.ct-light-page { background:#f0f0f5; }
body.ct-light-page #tab-content { color:#111; }
body.ct-light-page #tab-content .section-hdr { color:#7c5c00; font-size:13px; }
body.ct-light-page #tab-content .stat  { background:#fff; border-color:#888; }
body.ct-light-page #tab-content .stat-n { color:#111 !important; }
body.ct-light-page #tab-content .stat-l { color:#000; font-weight:700; }
body.ct-light-page #tab-content .sub-tab { background:#fff; color:#333; }
body.ct-light-page #tab-content .sub-tab.active { background:#fef08a; color:#713f12; }
body.ct-light-page #tab-content .btn-ghost { background:#fff; color:#333; }
body.ct-light-page #tab-content input[type="search"] { background:#fff !important; color:#111 !important; }
body.ct-light-page #tab-content .empty-state { color:#555; }
```

#### Tri guideurs / guidées

**Accordéon "Déjà inscrits"** (`inscritsT`) : guideurs en premier (triés alpha) puis guidées (triées alpha), intercalés (guideur[0], guidée[0], guideur[1], guidée[1]…).

**Pipeline des demandes** (`_gcGroups`) : couples en haut, puis alternance guideur/guidée intercalée. Exception : si `_sortInscByExp` est actif (Att. Validation triée par expérience), l'alternance est désactivée.

```javascript
// Couples en premier, puis alternance guideur/guidée pour les solos
// — sauf si le tri par expérience est actif (Att. validation)
if(!(sousOngletCoursTango==='attente_validation' && _sortInscByExp)){
  var _gcCpl = _gcGroups.filter(function(g){ return g.type==='couple'; });
  var _gcGui = _gcGroups.filter(function(g){ return g.type!=='couple' && g.person.role==='guideur'; });
  var _gcGde = _gcGroups.filter(function(g){ return g.type!=='couple' && g.person.role!=='guideur'; });
  _gcGroups = _gcCpl.slice();
  for(var gi=0; gi<Math.max(_gcGui.length,_gcGde.length); gi++){
    if(_gcGui[gi]) _gcGroups.push(_gcGui[gi]);
    if(_gcGde[gi]) _gcGroups.push(_gcGde[gi]);
  }
}
```

#### Accordéon "Déjà inscrits (Élèves Tango)"

Affiché au-dessus du pipeline, replié par défaut, état persisté dans `_ciDejaInscritsOpen[cKey]` (survit au polling 15s). `data-action="toggle-ci-inscrit"` géré dans `handleAction()`. Contient les élèves `statut='inscrit'` du cours (distincts des demandes en attente dans le pipeline).

---

## Session 2026-06-09 — Crons service key + filtre saison espace élève

### ✅ Crons : service key obligatoire pour les SELECT Supabase

7 handlers cron utilisaient `SUPABASE_ANON` dans le header `Authorization` pour leurs requêtes SELECT. La RLS bloque silencieusement les SELECT anon sur `inscriptions_essai`, `inscriptions_essai_yoga`, `inscriptions_cours`, `inscriptions_stages`, `notifications_eleve` → les crons retournaient `{"checked":0,"sent":0}` sans erreur.

**Fix appliqué dans `worker.js`** : `const _svcKeyXxx = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;` + `Authorization: Bearer ${_svcKeyXxx}` dans les handlers suivants :
- `handleCronEssaiRappelJ7` (rappel J-7 essai tango — E4)
- `handleCronEssaiJ1` (lendemain essai tango — E-J1a/J1b)
- `handleCronEssaiYogaJ1` (lendemain essai yoga — Y-J1a/J1b)
- `handleCronCartePonteeJ1` (récap carte pointée — CP-E)
- `handleCronEssaiYogaRappelJ3` (rappel J-3 essai yoga — Y3)
- `handleCronEspaceEleveActivation` (invitation espace élève — P1)
- `handleCronRappelStageJ3` (rappel J-3 stage — S4)

**Règle permanente** : tout nouveau handler cron qui fait un SELECT sur une table protégée par RLS doit utiliser `env.SUPABASE_SERVICE_KEY || SUPABASE_ANON` (jamais `SUPABASE_ANON` seul). Les 6 autres handlers (`handleCronCarteExpiree`, `handleCronRelanceCb3x`, `handleCronFinSaisonC4`, `handleCronFinSaisonC5`, `handleCronRelanceAbsences`, `handleCronPasDeCours`) utilisaient déjà le service key correctement.

### ✅ Filtre saison dans l'espace élève (index.html)

**Problème** : un élève pré-inscrit pour la saison suivante (ex : Stéphane, 1 cours 2025-2026 + 2 cours 2026-2027) voyait toutes ses inscriptions actives simultanément dans l'espace élève — 3 badges "Forfait annuel actif", "Tes cours" avec 3 lignes, discussions des 2 saisons, Sorano basé sur un cours futur.

**Fix** : ajout de `_saisonCourante()` (helper qui retourne `AAAA-(AAAA+1)` selon si le mois courant ≥ 9 ou non) et filtrage systématique par saison aux 4 endroits concernés dans `index.html` :

```javascript
function _saisonCourante() {
  var _n = new Date(); var _m = _n.getMonth() + 1; var _y = _n.getFullYear();
  return _m >= 9 ? (_y + '-' + (_y + 1)) : ((_y - 1) + '-' + _y);
}
```

| Endroit | Variable | Effet |
|---------|----------|-------|
| Callback `inscriptions_cours` | `hasCarte10` | Type carte détecté sur la saison courante uniquement |
| Callback `inscriptions_cours` | `eleveData.hasVincennes` | Sorano affiché uniquement si Vincennes CETTE saison |
| Callback `inscriptions_cours` | `eleveData.soranoPayé` | Statut Sorano de la saison courante uniquement |
| Callback `inscriptions_cours` | `eleveData.nbCoursInscrits` | Max pointages/jour basé sur la saison courante |
| `renderAccueil()` | `_inscrActives` | "Tes cours" + badges Forfait = saison courante uniquement |
| Onglet Discussions | `_inscActives` | Groupes de discussions = cours de la saison courante |

**Comportement attendu** : avant le 1/9 → `_saisonCourante()` = `2025-2026`. À partir du 1/9 → `2026-2027` automatiquement. Aucune intervention manuelle à la rentrée.

**Si quelque chose casse** : `eleveData.inscriptionsTango` lui-même contient toujours TOUTES les inscriptions non supprimées (non filtré par saison) — c'est voulu pour l'historique carte (lignes `isRenewal`). Seuls les 4 usages listés ci-dessus filtrent par saison. Si un autre endroit du code doit afficher les cours multi-saisons, lire `eleveData.inscriptionsTango` directement sans appliquer le filtre `_saisonCourante()`.

---

## Configuration emails — état actuel (2026-06-06)

### Expéditeur Brevo : `contact@tangoetvous.fr` ✅
- Domaine `tangoetvous.fr` authentifié dans Brevo (SPF + DKIM via Cloudflare, configuration automatique)
- Redirection `contact@tangoetvous.fr` → `tangoetvous@gmail.com` configurée dans Cloudflare Email Routing
- Tous les emails sortants partent depuis `contact@tangoetvous.fr` (tango + yoga)
- Les réponses arrivent dans `tangoetvous@gmail.com` via la redirection Cloudflare
- Les replyTo yoga (`regardsepose@gmail.com`) sont inchangés

### Règle permanente — expéditeur Brevo
**Ne jamais utiliser `tangoetvous@gmail.com` comme `sender.email`** dans `worker.js`. Gmail applique DMARC strict — les emails envoyés via Brevo avec une adresse `@gmail.com` en expéditeur risquent d'aller en spam ou d'être rejetés.

Toujours utiliser `contact@tangoetvous.fr` comme `sender.email` pour tous les emails (tango et yoga). C'est le seul expéditeur vérifié avec SPF+DKIM valides.

### À faire sur tout nouveau projet similaire (en priorité, avant tout envoi d'email)
1. Authentifier le domaine dans Brevo → Paramètres → Expéditeurs & IP → Domaines → méthode automatique via Cloudflare
2. Configurer Cloudflare Email Routing : `contact@mondomaine.fr` → adresse Gmail de l'admin
3. Changer l'expéditeur dans le code : `sender.email = 'contact@mondomaine.fr'`

---

## Annuaire des élèves (index.html — onglet `repertoire`)

### Fonctionnalité
Onglet permettant aux élèves de se retrouver entre eux et de s'envoyer des **messages privés 1-à-1** via l'appli. Ces messages sont **exclusivement accessibles depuis l'onglet Annuaire** — ils ne transitent pas par l'onglet Discussions.

### Distinction Annuaire ↔ Discussions

| | Annuaire (`repertoire`) | Discussions (`discussions`) |
|---|---|---|
| **Participants** | Élève ↔ Élève | Élève ↔ Admin (l'admin peut s'adresser à 1 ou plusieurs groupes) |
| **Initiateur** | Soit l'élève (depuis une fiche), soit le destinataire | Soit l'élève, soit l'admin |
| **Table DB** | `messages_eleves` | `discussions` + `disc_messages` |
| **Visible dans** | Onglet Annuaire uniquement | Onglet Discussions uniquement |
| **Push/notif** | `notifications_eleve` + push OS via `/api/eleve/message-prive` | `notifications_eleve` + push OS via handlers dédiés |

**Règle permanente : ne jamais mélanger les deux systèmes.** Les messages envoyés depuis l'Annuaire n'apparaissent pas dans Discussions, et vice versa.

### Table `messages_eleves`
Colonnes réelles (créées lors de la session 2026-06-01) :
```
id, created_at, from_email, to_email, contenu, lu
```
⚠️ Les colonnes s'appellent `from_email` et `to_email` (pas `expediteur_email` / `destinataire_email`). Ne pas changer ces noms.

```sql
CREATE TABLE messages_eleves (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  contenu TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false
);
-- RLS : les deux participants peuvent SELECT ; seul l'expéditeur peut INSERT ; seul le destinataire peut UPDATE (marquer lu)
ALTER TABLE messages_eleves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_eleves_select" ON messages_eleves FOR SELECT USING (
  from_email = auth.email() OR to_email = auth.email()
);
CREATE POLICY "msg_eleves_insert" ON messages_eleves FOR INSERT WITH CHECK (
  from_email = auth.email()
);
CREATE POLICY "msg_eleves_update" ON messages_eleves FOR UPDATE USING (
  to_email = auth.email()
);
GRANT SELECT, INSERT, UPDATE ON messages_eleves TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE messages_eleves_id_seq TO authenticated;
```

### Architecture messagerie Annuaire (index.html)

**États** :
- `_repPeer = null` → vue liste (tous les élèves visibles groupés par cours)
- `_repPeer = { email, nom, photo_url }` → vue conversation avec cet élève

**Fonctions** :
- `renderRepertoire()` — dispatch vers `_repRenderList()` ou `_repRenderConv()` selon `_repPeer`
- `_repRenderList()` — charge via RPC `get_eleves_repertoire`, charge les unread depuis `messages_eleves`, affiche les cartes
- `_repRenderConv()` — charge l'historique avec le peer, marque lu, affiche bulles, poll toutes les 5s
- `window._repOuvrirConv(targetEmail)` — positionne `_repPeer` et bascule en vue conversation
- `window._repRetour()` — reset `_repPeer`, retour à la liste
- `window._repEnvoyer()` — INSERT dans `messages_eleves` + notif push via `/api/eleve/message-prive`
- `_repEsc(s)` — escape HTML pour sécuriser le contenu des messages

**Route worker** : `POST /api/eleve/message-prive` → `handleEleveMessagePrive` → INSERT `notifications_eleve` + push OS (FCM) au destinataire. Pas d'auth requise (fire & forget).

**Cache** : `_repCache` — liste des élèves visibles, chargée une fois par session onglet. Reset : non (invalidation manuelle si nécessaire). `_repUnread` — compteurs non lus par expéditeur, rechargé à chaque affichage liste.

**Polling** : `_repPollTO` — toutes les 5s quand une conversation est ouverte. Stoppé au changement d'onglet (`switchTab`).

### RLS bypass — get_eleves_repertoire()
Les deux tables `eleves` (USING `email = auth.email()`) et `inscriptions_cours` (USING `is_admin() OR email = auth.email()`) bloquent le SELECT cross-user. Solution : fonction SQL SECURITY DEFINER qui bypasse les deux et retourne `(email, prenom, nom, photo_url, cours text[])` directement. Appelée via `TEV.client.rpc('get_eleves_repertoire')`.

### Colonne DB
`eleves.visible_repertoire BOOLEAN DEFAULT false` — l'élève choisit d'apparaître ou non dans l'annuaire.

### Visibilité
- Onglet accessible à tous les élèves connectés
- Seuls les élèves avec `visible_repertoire=true` apparaissent dans les listes
- **Aucun email ni numéro de téléphone n'est affiché** — uniquement le prénom/nom et la photo
- L'élève courant s'affiche dans sa propre liste (pour voir qu'il est bien dedans) mais **sans le bouton 💬** (on ne peut pas démarrer une discussion avec soi-même)

### Toggle dans Accueil
Section "Annuaire des élèves" dans `renderAccueil()` → `toggleRepertoire(val)` :
- Met à jour `eleves.visible_repertoire` en DB
- Met à jour l'état local `eleveData.eleve.visible_repertoire`
- Met à jour visuellement le DOM du toggle (inline styles sur les deux `<span>`) sans re-render complet
- Sous-titre toggle : "Apparaître dans l'onglet Annuaire des élèves (votre email et numéro de téléphone ne sont pas visibles)" en blanc (`color:#fff`)

### `renderRepertoire()` — vue liste
- Groupé par cours (Paris Débutants / Paris Intermédiaires / Vincennes Débutants / Vincennes Intermédiaires)
- Données via RPC `get_eleves_repertoire` (bypass RLS)
- Exclut les lignes `isRenewal` de `inscriptions_cours` pour le comptage des cours
- Texte noms : `font-size:16px;color:#fff;font-weight:600`
- Clic sur une carte (hors soi-même) → `_repOuvrirConv(email)` — pas de bouton séparé, toute la carte est cliquable
- Badge rouge avec compteur non lus affiché sur les cartes avec messages non lus
- Si non inscrit à aucun cours → non listé (filtre `!courses.size`)

### Tab labels
- `_TAB_LABELS.repertoire` = `'Annuaire des élèves'`
- `_NAV_DEFS.repertoire.label` = `'Annuaire des élèves'`

---

## Playwright — infrastructure en place (2026-07-08) ✅

### État : 21 tests verts (`npm test`)
- **Fichiers** : `playwright.config.js` (webServer auto sur port 8788), `tests/server.js` (serveur statique zéro dépendance), `tests/helpers.js` (calendrier contrôlé 2 saisons + `bootDemo`/`bootPage`), `tests/{a-calc-expiration,b-cartes-dedup,d-transfert-essai,f-polling-guards,g-inscription-vp}.spec.js`
- **Principe** : `admin.html` chargé via serveur local → `demarrerDemoApp()` (mode démo, DEMO_DATA en mémoire, **zéro écriture Supabase**) → tests des fonctions réelles via `page.evaluate` + formulaires DOM réels (DI/VP)
- **Calendrier contrôlé** (`tests/helpers.js`) : jeudis Paris / lundis Vincennes sur 2 saisons continues avec vacances retirées — les attentes des tests A sont calculées à la main ; toute modification de `calcExpiration` qui change ces résultats fera échouer les tests
- **A6 = test de parité** `calcExpiration` (admin.html) ↔ `_calcExpirationSb` (tev-supabase.js) sur 10 cas — protège la règle « modifier les deux à l'identique »
- **G1/G2 = régressions des bugs du 2026-07-07** (carte rattachée au mauvais cours, fiche fantôme _vpPrefillIds)
- **⚠️ Piège email** : la validation DI/VP exige un TLD — utiliser `x@test.fr`, jamais `x@test`
- **Déploiement** : `.assetsignore` exclut tests/, package*.json, playwright.config.js des assets Cloudflare (vérifier au 1er déploiement que ces URLs renvoient bien 404 sur app.tangoetvous.fr)
- **Exécution** : `npm install` (une fois) puis `npm test` — local ou par Claude directement

### Contexte d'origine
- Framework : [Playwright](https://playwright.dev/) — gratuit, open source, maintenu par Microsoft
- Exécution : **local uniquement** (`npm test`) — pas de CI GitHub Actions
- Fichiers cibles : `admin.html` en **mode démo** (`IS_DEMO = true`) — pas de vraies données Supabase

### Scénarios prioritaires (demandés par l'utilisateur)
1. `calcExpiration` — cartes 10
2. Cartes 10 — couples email partagé
3. Transfert essai → inscription tango

### Catalogue complet des tests proposés

#### Groupe A — `calcExpiration` (algorithme le plus fragile)
| # | Scénario | Pourquoi c'est fragile |
|---|----------|----------------------|
| A1 | Carte Paris débutant, premier cours un **jeudi** → vérifier expiration = ~3 mois + semaines vacances | Algorithme itératif A+B+C, timezone, lastStored |
| A2 | Carte Paris débutant, premier cours saisi un **mardi** (pas le bon jour) → vérifier normalisation vers le jeudi le plus proche | Bug réel corrigé 2026-05-26 : chaque semaine comptée comme gap sinon |
| A3 | Carte Vincennes intermédiaire → vérifier expiration distincte de Paris (jour de cours différent) | Deux sets `coursArr` distincts selon ville |
| A4 | Modifier `datePremierCours` dans modal Cartes 10 → vérifier que l'expiration se recalcule (pas mise en cache) | Garde `!c.expiration` supprimée 2026-05-08 |

#### Groupe B — Cartes 10 couples email partagé
| # | Scénario | Pourquoi c'est fragile |
|---|----------|----------------------|
| B1 | Élève inscrit à 2 cours (ex : VORMS × Paris + Vincennes) → vérifier qu'il apparaît **une seule fois** dans Cartes 10 | `_buildCartesData` déduplication par email::normNom |
| B2 | Couple BUTASH/NACAK (email partagé) → vérifier que **les deux noms** apparaissent dans Détails, pas en doublon | Cas réel saison 2025-2026 |
| B3 | Élève avec renouvellement (`isRenewal`) → vérifier que la fiche n'apparaît **pas en double** dans Élèves Tango | Bug corrigé 2026-05-14 : marqueur `_isRenewalRow` |
| B4 | Pointer 1 cours pour un élève inscrit à **1 seul cours** → vérifier que le bouton "2 cours" est masqué | Limite journalière dynamique selon `_maxParJour` |

#### Groupe C — Suppression et onglets Supprimés
| # | Scénario | Pourquoi c'est fragile |
|---|----------|----------------------|
| C1 | Supprimer un élève depuis **Élèves Tango** → vérifier qu'il apparaît dans Élèves Tango → Supprimés, et **pas** dans Inscriptions Tango → Supprimés | Séparation stricte via `donnees.supprimé_de` |
| C2 | Supprimer depuis **Inscriptions Tango** (statut `demande`) → vérifier qu'il apparaît dans Inscriptions Tango → Supprimés, et **pas** dans Élèves Tango → Supprimés | Idem — marqueur `supprimé_de='inscriptions_tango'` |
| C3 | Rétablir un essai tango supprimé (bouton 🔄 dans Essai → Supprimés) → vérifier réapparition dans Pointage avec le bon statut | `statut_avant_suppression` doit être restauré |
| C4 | Supprimer un élève tango → vérifier que sa carte 10 passe aussi dans Cartes 10 → Supprimées | `confirmerSupprimerEleve` doit supprimer aussi `carte_statut` |

#### Groupe D — Transfert essai → inscription
| # | Scénario | Pourquoi c'est fragile |
|---|----------|----------------------|
| D1 | Cliquer **"Validé·e"** sur un essai guideur → vérifier apparition dans Inscriptions Tango → Att. Paiement | `saisonActive()` vs `saisonPourNouvelleEntree()`, `_pendingCoursInserts` |
| D2 | Cliquer **"Demande en att."** sur un essai guidée → vérifier apparition dans Inscriptions Tango → Att. Validation | Même logique, statut différent |
| D3 | Transfert d'un essai avec partenaire (sans email) → vérifier que **deux fiches** sont créées dans Inscriptions Tango | Condition `if(ess.partenaire)` pas `if(partEmail)` — bug corrigé |

#### Groupe E — Quotas guideurs/guidées
| # | Scénario | Pourquoi c'est fragile |
|---|----------|----------------------|
| E1 | Badge "👨 X/22 👩 X/23" dans Élèves Tango → vérifier qu'il correspond **exactement** au nombre d'élèves visibles dans la liste | Bug corrigé 2026-05-18 : comptait `inscrit + attente_paiement` au lieu de `inscrit` seul |
| E2 | Lignes `isRenewal` présentes en DB → vérifier qu'elles ne sont **pas comptées** dans le quota | `!e._isRenewalRow` dans `nbInscritsCours` |

#### Groupe F — Polling 15s — formulaires non interrompus
| # | Scénario | Pourquoi c'est fragile |
|---|----------|----------------------|
| F1 | Ouvrir l'éditeur d'une publication → attendre 20s → vérifier que le formulaire est **toujours ouvert** | Guard `if (currentTab === 'publications') return` dans `_renderTabSiPasFormulaire` |
| F2 | Être dans Essai Tango → Pointage, scroller → attendre 20s → vérifier que la **position de scroll est préservée** | Guard `if (currentTab === 'essai' && filtreEssai === 'pointage') return` |
| F3 | Marquer un élève **Sorano réglé** → attendre 20s → vérifier que le statut est toujours "réglé" | `_pendingSoranoPayé` anti-polling — bug réel corrigé |

#### Groupe G — Inscription directe et Valider Paiement
| # | Scénario | Pourquoi c'est fragile |
|---|----------|----------------------|
| G1 | Inscrire un élève à **2 cours** (formule `carte10forfait`) → vérifier que **2 entrées distinctes** apparaissent dans Élèves Tango | `soumettreInscriptionDirecte` 130+ lignes, ID fake local vs ID DB réel |
| G2 | Valider le paiement d'un élève avec **cours changé** → vérifier que le **nouveau cours** s'affiche (pas l'ancien) | Bug corrigé 2026-05-13 : lookup par email+newCours ratait l'ancienne entrée |

---

## Session 2026-05-28 — Y-mod yoga câblage + Push "pas de cours cette semaine"

### ✅ Y-mod — câblage `validerEditEssaiYoga` → `/api/notify/essai-yoga-modifie`

Le handler `handleNotifyEssaiYogaModifie` existait dans `worker.js` mais n'était **jamais appelé** — `validerEditEssaiYoga` dans `admin.html` sauvegardait en DB sans envoyer aucune notification.

**Fix `admin.html`** : ajout d'un appel `fetch('/api/notify/essai-yoga-modifie', ...)` dans le `.then()` de `validerEditEssaiYoga`, après la mise à jour DB, avec les champs `email, prenom, nom, dateAvant, dateApres, coursAvant, coursApres`.

**Fix `worker.js` — `handleNotifyEssaiYogaModifie`** : le sender Brevo utilisait `regardsepose@gmail.com` comme `sender.email` (expéditeur non vérifié dans Brevo → emails silencieusement rejetés). Corrigé avec le pattern standard yoga :
```javascript
sender: { name: 'Florencia Garcia — Le Regard Se Pose', email: 'tangoetvous@gmail.com' },
replyTo: { email: 'regardsepose@gmail.com', name: 'Florencia Garcia' }
```

**Règle permanente** : seul `tangoetvous@gmail.com` est un expéditeur vérifié dans Brevo. Pour tous les emails yoga qui doivent paraître venir de Florencia, toujours utiliser ce pattern `sender` + `replyTo`. Ne jamais utiliser `regardsepose@gmail.com` comme `sender.email`.

---

### ✅ Push élève "Pas de cours cette semaine" — nouvelle route cron + workflow

Quand le prochain cours prévu est à plus de 7 jours après le dernier cours, tous les élèves inscrits (`statut='inscrit'`) de la ville concernée reçoivent :
- **Push OS** via FCM : `📅 Pas de cours Paris/Vincennes cette semaine · Prochain cours le Jeudi X mois`
- **Notification in-app** (`notifications_eleve`) : même message

**Déclencheur** :
- Vendredi 9h Paris → vérification pour Paris (lendemain = jeudi = jour de cours Paris)
- Mardi 9h Paris → vérification pour Vincennes (lendemain = lundi = jour de cours Vincennes)

**Logique du handler `handleCronPasDeCours` (worker.js)** :
1. Calcule la date d'hier (heure Paris CEST/CET)
2. Vérifie que hier figure dans `tev_cours_dates.paris` (ou `.vincennes`) — si non → skip `yesterday_not_a_cours_date`
3. Trouve le prochain cours futur dans le tableau trié
4. Calcule le gap en jours — si ≤ 7 → skip `next_cours_within_7_days`
5. Charge tous les élèves `statut='inscrit'` de la ville/saison depuis `inscriptions_cours`
6. Pour chaque email unique : INSERT `notifications_eleve` + `getFcmTokensForEmail` + `sendFcmPush`

**Deux jobs séparés dans `pas-de-cours.yml`** :
- `pas-de-cours-paris` : cron `0 7 * * 5` + `workflow_dispatch` (ville=paris)
- `pas-de-cours-vincennes` : cron `0 7 * * 2` + `workflow_dispatch` (ville=vincennes)

**Fichiers modifiés** :
- `worker.js` — nouvelle route + `handleCronPasDeCours`
- `.github/workflows/pas-de-cours.yml` — nouveau workflow

**Test validé (run #1, 2026-05-28)** : skip correct `yesterday_not_a_cours_date` car hier (mardi 27/05) n'est pas un jour de cours Paris (=jeudi) — comportement attendu pour un test manuel un mercredi.

---

## Session 2026-05-27/28 — E0 couple, inscription-cours, navigation stages admin

### ✅ Email E0 — variante couple (deux encadrés avec bannière violette)

Quand `enCouple === true && partPrenom` dans le body de `handleNotifyInscriptionEssai` (worker.js), l'email admin affiche désormais **un seul encadré à 4 zones** au lieu d'un encadré + ligne texte "Partenaire :".

**Structure** :
1. Bannière violette `background:#6a1b9a` "👫 En couple" — **toujours affichée**, peu importe `isWaitlist`
2. Header inscripteur — couleur normale (`#D4AF37` confirmé / `#e65100` attente)
3. Séparateur 1px `rgba(0,0,0,.15)`
4. Header partenaire — couleur dérivée : `isWaitlist ? '#9a2a00' : '#b8960e'`
5. `_coursInnerBlock` — partagé (extrait comme `const` avant la branche `if/else`)

**Contrainte** : `partTel` n'est pas dans le body (non envoyé par `inscription-cours.html`) — ne jamais l'afficher.

**Font-size** : les deux noms en couple → `16px` (inscripteur solo = `18px`).

**Couleur email partenaire** : `isWaitlist ? '#ffccaa' : '#f5e4a0'`

**Fichiers modifiés** :
- `worker.js` — commit `5800916`
- `preview-emails-essai-v2.html` — variante confirmée (or) + variante attente (orange), nav link "E0 Couple"
- `preview-sources-essai.html` — sous-section E0 couple ajoutée après le bloc E0 solo

### ✅ `inscription-cours.html` — 3 changements UI

1. **Bouton "💶 Évaluer mon tarif" retiré** — voir section "Bouton Évaluer mon tarif retiré temporairement" ci-dessous
2. **Bouton "ENVOYER MA DEMANDE" déplacé** juste au-dessus du scroll hint (était en dessous)
3. **Scroll hint mis à jour** : "↑ Après avoir cliqué, remontez si nécessaire en haut de la page pour visualiser votre confirmation"
4. **Étape 3** label : "Vous venez…" → "Vous êtes…"

### ✅ `admin.html` — navigation automatique vers le prochain stage

Quand l'admin clique sur **Stages** dans le menu :
- `switchTab('stages')` cherche la prochaine date de stage active via `Object.keys(adminData.stages||{}).sort().filter(d => dateAppartientSaison(d, saisonActive()) && d >= todayISO())`
- Définit `filtreStage = _nextStage` (première date trouvée) et `filtreStageSlot = 'tous'`
- L'admin arrive directement sur le sous-onglet "Tous" du prochain stage, sans devoir naviguer manuellement

---

## Bouton "Évaluer mon tarif" retiré temporairement — 2026-05-27

Dans `inscription-cours.html`, le bouton `💶 Évaluer mon tarif` (qui appelait `goTarif()`) a été **retiré temporairement** à la demande de l'admin. Il pourra être remis plus tard.

**Ce qui a changé** :
- Le bouton `goTarif()` a disparu de l'étape `sInfos()` (step rôle / partenaire)
- L'étape tarif (`sTarif()`) reste présente dans le code mais n'est plus accessible depuis ce bouton
- `S.wantTarif` reste `false` → l'étape tarif n'est jamais ajoutée au nav
- Pour remettre le bouton : réinsérer `<button class="btn-next" ... onclick="goTarif()">💶 Évaluer mon tarif</button>` avant le Turnstile dans la branche `role` de `sInfos()`

---

## Politique anti-doublon formulaires publics — décision 2026-05-27

### Règle permanente : AUCUN filtre anti-doublon sur les formulaires publics

**Décision de l'admin** : toute personne peut soumettre plusieurs fois n'importe quel formulaire public sans blocage. L'admin gère manuellement les doublons éventuels.

**Raison** : une personne seule (guideur ou guidée) peut d'abord s'inscrire seule puis soumettre à nouveau avec un partenaire pour le même cours. Bloquer cette deuxième soumission empêcherait une vraie inscription valide.

**État au 2026-05-27** :

| Formulaire | Côté client | Côté DB (index UNIQUE) |
|------------|------------|------------------------|
| `inscription-cours.html` | ✅ Aucun filtre | ✅ `idx_cours_no_double` supprimé |
| `cours-essai.html` | ✅ Aucun filtre | ✅ `idx_essai_no_double` supprimé |
| `essai-yoga.html` | ✅ Aucun filtre | ✅ `idx_essai_yoga_no_double` supprimé |
| `stages-pwa.html` | ✅ Aucun filtre | ✅ `idx_stages_no_double` supprimé |
| `demande-devis.html` | ✅ Aucun filtre (jamais eu) | — |
| `cours-particuliers.html` | ✅ Aucun filtre (jamais eu) | — |

**Ce qui reste intact** : la déduplication par `_normNom()` dans l'affichage des listes de l'admin (`_elevesResultatsHTML`, `nbInscritsCours`) — elle ne bloque rien, elle évite juste l'affichage en double dans les vues Élèves Tango. Ne jamais supprimer cette déduplication d'affichage.

**Ne jamais réintroduire** de bloc anti-doublon dans les formulaires publics, ni de `CREATE UNIQUE INDEX` sur les tables `inscriptions_cours`, `inscriptions_essai`, `inscriptions_essai_yoga`, `inscriptions_stages`.

---

## ⚠️ Règle technique — éviter le context overflow / autocompact thrashing

`admin.html` (~15 000 lignes / ~930 KB) et `worker.js` (~8 500 lignes / ~580 KB) sont des fichiers monolithiques trop gros pour être lus entiers sans saturer le contexte. Idem pour `index.html` (~6 400 lignes / ~340 KB).

**Pattern obligatoire** pour ces 3 fichiers :
1. Toujours `grep` (via Bash) ou l'agent `Explore` d'abord pour repérer la zone concernée (numéros de ligne)
2. Puis `Read` avec `offset` + `limit` (typiquement 50-200 lignes ciblées)
3. **Ne jamais** faire `Read("admin.html")`, `Read("worker.js")` ou `Read("index.html")` sans bornes
4. Pour des modifications, préférer `Edit` (qui ne renvoie que le diff appliqué) plutôt qu'un Read complet suivi d'un Write

Les fichiers `preview-emails-*.html` (~70-130 KB chacun) suivent la même règle : `grep` + `Read` ciblé.

**Quand la tâche nécessite plusieurs zones différentes d'un gros fichier dans la même session** : ne pas accumuler les Reads dans le contexte principal — déléguer à un sous-agent qui s'exécute dans son propre contexte isolé.

| Sous-agent | Quand l'utiliser |
|------------|------------------|
| `Explore` | Recherche read-only sur plusieurs zones (ex: "où sont définies ces 5 fonctions ?", "trouve tous les endroits qui appellent X") |
| `general-purpose` | Tâche multi-fichiers ou nécessitant des modifications ciblées sur plusieurs zones |

Seul le **résultat résumé** du sous-agent revient dans le contexte principal (typiquement 200-1000 tokens), pas les fichiers lus. Exemple :
- ❌ Mauvais : 5 × `Read("admin.html", offset=X, limit=200)` répartis dans la session → cumul ~5000-10 000 tokens
- ✅ Bon : 1 × `Agent(subagent_type="Explore", prompt="Trouve dans admin.html les fonctions X/Y/Z, résume leur signature + lignes")` → ~500 tokens dans le contexte principal

Règle d'or : **dès qu'une tâche demande de regarder 3+ zones d'un même gros fichier, déléguer à un sous-agent.**

Si l'utilisateur signale "autocompact thrashing" ou un blocage de session, vérifier en priorité si des Reads massifs ont eu lieu — c'est généralement la cause, pas CLAUDE.md.

## Push notifications — VAPID + déduplication tokens

### Clés VAPID — configuration actuelle (2026-05-26)

| Emplacement | Clé publique correcte |
|-------------|----------------------|
| `index.html` — `TEV_VAPID_KEY` | `BDHGZkHsqA39hwEftF9jPloQjGWT_HwoWFmOhfWsLVG8RUuhoWc3bPmq9PWUO_751WQLBgR_GX12ONQn85u-NuM` |
| `worker.js` — `VAPID_PUB` dans `sendWebPush` | Idem |
| `admin.html` — `TEV_VAPID_KEY` | Idem |
| Cloudflare Workers secret | `VAPID_PRIVATE_KEY` (clé privée correspondante P-256) |

**⚠️ Règle absolue** : les trois occurrences de la clé publique DOIVENT être identiques. Si on change la clé (nouvelle paire VAPID), il faut :
1. Mettre à jour `TEV_VAPID_KEY` dans `index.html` ET `admin.html`
2. Mettre à jour `VAPID_PUB` dans `sendWebPush` (`worker.js`)
3. Mettre à jour `VAPID_PRIVATE_KEY` dans Cloudflare Workers secrets
4. Incrémenter le flag de migration (`tev_push_vapid_v3` → `v4`, etc.) dans `_registerFcmToken` (`index.html`) pour forcer le re-abonnement de tous les appareils

### Historique des migrations VAPID

| Flag | Date | Raison |
|------|------|--------|
| `tev_push_vapid_v2` | avant 2026-05-26 | Première migration (clé incorrecte dans index.html) |
| `tev_push_vapid_v3` | 2026-05-26, commit `7389e85` | **Fix** : `index.html` utilisait `BD_EhhtlJW...` au lieu de `BDHGZkHsq...` → pushes silencieusement rejetés 401 par Apple/Google car la clé de signature (serveur) ne correspondait pas à la clé enregistrée lors de l'abonnement (navigateur) |

### Symptôme d'une mauvaise clé VAPID

Push OS absent (aucune notification reçue sur le téléphone) même si :
- `notifications_eleve` reçoit bien les notifs in-app (panel 🔔)
- `fcm_tokens` contient un token pour l'email de l'élève
- `sendWebPush` est appelé sans erreur côté serveur

**Cause** : le push service (Apple APN / Google FCM) rejette silencieusement les requêtes dont la clé publique dans l'en-tête `Authorization: vapid k=<pubkey>` ne correspond pas à la clé enregistrée lors de la création de l'abonnement.

**Fix** : l'élève doit ouvrir l'app (`index.html`) une fois — le code de migration détecte que le flag `tev_push_vapid_v3` est absent, force un `unsubscribe()` + `subscribe()` avec la bonne clé, et enregistre le nouveau token en DB.

### Debug tokens FCM

**Endpoint** : `GET /api/debug/fcm-count?email=xxx@yyy.com` (JWT admin requis)
**Obtenir le JWT admin** : ouvrir la console dans `admin.html` et taper `_getJwt()`

Réponse : `{ email, tokens_count, tokens: [{ prefix, created_at }] }`
- `prefix` commence par `{"endpoint"` → abonnement Web Push (iOS/Safari)
- `prefix` est une chaîne alphanumérique → token FCM Android/Chrome

Si `tokens_count = 0` : l'élève n'a jamais activé les notifications (ou son token a été nettoyé après un 410).
Si `tokens_count > 0` et push absent : le token date d'avant la migration v3 → demander à l'élève d'ouvrir l'app.

### Déduplication tokens dans `sendFcmPush`

**Ajout 2026-05-26** : `sendFcmPush` déduplique maintenant les tokens avant envoi :
```javascript
const uniqueTokens = [...new Set(tokens.filter(Boolean))];
tokens = uniqueTokens;
```

**Pourquoi** : dans les envois batch multi-emails (publications, discussions), le même token pourrait apparaître si une personne est inscrite à 2 cours et que deux requêtes retournent le même token. La déduplication garantit qu'un appareil reçoit au maximum 1 push par événement.

**Nota bene** : `_getEmailsByGroupes` déduplique déjà les EMAILS via `Set` → un élève inscrit à 2 cours = 1 email dans la liste → `getFcmTokensForEmail` appelé une seule fois → pas de doublon. La déduplication dans `sendFcmPush` est une couche de défense supplémentaire.

### Nettoyage automatique des tokens expirés

`sendWebPush` supprime automatiquement les tokens expirés (status 410/404 de Apple/Google) :
```javascript
if (r.status === 410 || r.status === 404) {
  // DELETE FROM fcm_tokens WHERE token = ...
}
```
`sendFcmPush` (FCM v1) supprime les tokens `NOT_FOUND` / `UNREGISTERED`. Aucun nettoyage manuel nécessaire.

---

## Publications et Discussions — pas d'emails, uniquement notifications in-app + push

### Règle permanente — confirmée 2026-05-26

**Il n'y a PAS d'emails liés aux publications ni aux discussions.**

| Fonctionnalité | Email Brevo | Notif panel 🔔 élève (`notifications_eleve`) | Push OS élève |
|----------------|-------------|----------------------------------------------|---------------|
| Nouvelle publication publiée | ❌ Jamais | ✅ Oui | ✅ Oui |
| Nouveau message dans une discussion | ❌ Jamais | ✅ Oui | ✅ Oui |
| Nouvelle discussion créée | ❌ Jamais | ✅ Oui | ✅ Oui |

**Règle** : ne jamais ajouter d'appel `sendBrevoNotification` / `sendMail` dans `handleNotifyPublicationPubliee`, `handleNotifyDiscussionNouvelle`, ou `handleNotifyDiscussionMessage`. Ces handlers n'envoient que des notifs in-app + push OS.

### Architecture notifications publications/discussions (worker.js)

- **`handleNotifyPublicationPubliee`** (POST `/api/notify/publication-publiee`, JWT admin) :
  - Récupère les emails via `_getEmailsByGroupes(groupes, saison, svcKey)` — service key pour bypass RLS
  - INSERT dans `notifications_eleve` pour chaque email (panel 🔔 élève)
  - `getFcmTokensForEmail` + `sendFcmPush` pour chaque email (push OS)

- **`handleNotifyDiscussionNouvelle`** (POST `/api/notify/discussion-nouvelle`, JWT admin) :
  - `_getEmailsByGroupes` avec `env.SUPABASE_SERVICE_KEY || SUPABASE_ANON`
  - INSERT `notifications_eleve` + `_insertNotification` panel admin
  - `getFcmTokensForEmail` + `sendFcmPush`

- **`handleNotifyDiscussionMessage`** (POST `/api/notify/discussion-message`, JWT admin) :
  - Même architecture que `handleNotifyDiscussionNouvelle`

### `_getEmailsByGroupes(groupes, saison, jwt)` — règle RLS

**Clé de groupes** : les discussions et publications utilisent les groupes `'paris-debutants'`, `'paris-intermediaires'`, `'vincennes-debutants'`, `'vincennes-intermediaires'` (avec 's' final) — mappés vers `ville+niveau` dans `GROUP_MAP`.

**Toujours passer `env.SUPABASE_SERVICE_KEY || SUPABASE_ANON`** comme troisième argument. Ne jamais passer `SUPABASE_ANON` directement — la RLS SELECT sur `inscriptions_cours` bloque anon et retourne 0 lignes sans erreur HTTP (HTTP 200, tableau vide silencieux).

```javascript
// ✅ Correct
const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
const emails = await _getEmailsByGroupes(groupes, saison, svcKey);

// ❌ Bug silencieux — retourne toujours [] car RLS bloque anon
const emails = await _getEmailsByGroupes(groupes, saison, SUPABASE_ANON);
```

### Outil de debug FCM

**`GET /api/debug/fcm-count?email=xxx`** (JWT admin requis) :
- Sans `email` : stats globales (nb total tokens, nb emails distincts, count par email)
- Avec `email=xxx@yyy.com` : tokens enregistrés pour cet email (count + préfixes)

Complémentaire de `POST /api/debug/push-test` (envoie un push test à l'admin lui-même).

### Push "broadcast" — architecture et cas limites (2026-05-26)

#### Problème découvert : `_getEmailsByGroupes` ne voit pas les élèves sans inscription active

`_getEmailsByGroupes(groupes, saison, jwt)` interroge **uniquement `inscriptions_cours WHERE statut=eq.inscrit`**. Un élève qui a :
- Une fiche dans `eleves` ✅
- Un token dans `fcm_tokens` ✅
- Mais **aucune ligne dans `inscriptions_cours`** (ex : élève avec seulement une carte 10 sans inscription de cours régulier dans la saison) ❌

…est **invisible** à cette fonction → ne reçoit aucun push pour les publications ni les discussions.

**Symptôme** : push push "carte pointée" arrive bien (utilise `getFcmTokensForEmail(email)` directement), mais push "publication publiée" n'arrive jamais.

#### Solution : approche hybride pour les publications

**`handleNotifyPublicationPubliee`** (worker.js) :
- **Sans filtre de groupe** (`coursArr.length === 0`, publication "Tous les élèves") → `getAllFcmTokens(svcKey)` : lit **TOUS** les tokens de `fcm_tokens` directement → touche tout appareil ayant activé les notifs, quelle que soit son inscription
- **Avec filtre de groupe** (`coursArr.length > 0`, publication pour groupes spécifiques) → approach email-based via `getFcmTokensForEmail(email, svcKey)` pour chaque email issu de `_getEmailsByGroupes` → respecte le ciblage par groupe

```javascript
// Dans handleNotifyPublicationPubliee :
if (coursArr.length === 0) {
  tokenList = [...new Set((await getAllFcmTokens(svcKey)).filter(Boolean))];
} else {
  const tokenArrays = await Promise.all(emails.map(e => getFcmTokensForEmail(e, svcKey)));
  tokenList = [...new Set(tokenArrays.flat().filter(Boolean))];
}
```

#### Discussions : toujours email-based (groupes obligatoires)

Les discussions sont **toujours** adressées à des groupes spécifiques. Les 4 handlers discussion utilisent tous l'approche email-based via `getFcmTokensForEmail()` :

| Handler | Route | Approche push |
|---------|-------|---------------|
| `handleNotifyDiscussionNouvelle` | `POST /api/notify/discussion-nouvelle` | `getFcmTokensForEmail` par email (groupes) |
| `handleNotifyDiscussionMessage` | `POST /api/notify/discussion-message` | `getFcmTokensForEmail` par email (groupes) |
| `handleNotifyDiscussionNouvelleEleve` | `POST /api/notify/discussion-nouvelle-eleve` | `getFcmTokensForEmail` par email (groupes) |
| `handleNotifyDiscussionMessageEleve` | `POST /api/notify/discussion-message-eleve` | `getFcmTokensForEmail` par email (groupes) |

Un élève visible uniquement dans `eleves`+`fcm_tokens` (sans `inscriptions_cours`) ne reçoit **pas** les push de discussion — comportement correct (les discussions ne lui sont pas adressées).

#### `getAllFcmTokens(svcKey)` — helper global (worker.js)

```javascript
async function getAllFcmTokens(svcKey) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/fcm_tokens?select=token`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (r.ok) {
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(row => row.token).filter(Boolean) : [];
    }
    console.error('[getAllFcmTokens] HTTP', r.status, await r.text().catch(() => ''));
    return [];
  } catch(e) {
    console.error('[getAllFcmTokens] error', e);
    return [];
  }
}
```

Utilisé **uniquement** pour les publications sans filtre de groupe. Ne jamais l'utiliser pour les discussions (briserait le ciblage par groupe).

#### Tableau récapitulatif — stratégie push des 5 handlers broadcast

| Handler | Condition | Stratégie push |
|---------|-----------|----------------|
| `handleNotifyPublicationPubliee` | `coursArr.length === 0` (tous) | `getAllFcmTokens()` — tous les appareils |
| `handleNotifyPublicationPubliee` | `coursArr.length > 0` (groupes) | `getFcmTokensForEmail` par email |
| `handleNotifyDiscussionNouvelle` | Toujours groupes | `getFcmTokensForEmail` par email |
| `handleNotifyDiscussionMessage` | Toujours groupes | `getFcmTokensForEmail` par email |
| `handleNotifyDiscussionNouvelleEleve` | Toujours groupes | `getFcmTokensForEmail` par email |
| `handleNotifyDiscussionMessageEleve` | Toujours groupes | `getFcmTokensForEmail` par email |

**Règle** : ne jamais utiliser `getAllFcmTokens()` dans les handlers discussion. Ne jamais utiliser `_getEmailsByGroupes` pour récupérer les tokens push des publications "tous les élèves".

---

## Horaires tango dans les emails — clés plates, pas d'objets imbriqués

### Symptôme
Les emails tango (E1, E2, E5, E6, E4, E15, E-admin-cancel, I01, I02, I03) n'affichaient pas l'horaire du cours dans la cours-box, alors que l'horaire est visible dans les previews.

### Cause racine
Dans `admin.html`, `sauverHorairesType` sauvegarde les horaires tango comme des **chaînes plates** dans Supabase :
```javascript
data.deb     = '20h30';  // heure de début débutant
data.deb_fin = '22h';    // heure de fin débutant
data.int     = '21h';
data.int_fin = '22h30';
_saveParam('paris', sai, 'horaires', data);
// → tev_params_paris_<sai>.horaires = { deb:'20h30', deb_fin:'22h', int:'21h', int_fin:'22h30' }
// → même structure pour 'vincennes'
```

Mais plusieurs handlers dans `worker.js` lisaient ces données comme des **objets imbriqués** avec les clés `'debutant'`/`'intermediaire'` :
```javascript
// ❌ Lecture incorrecte
const h = horaires[niveau] || horaires.debutant || {};  // niveau='debutant' → undefined
const debut = h.debut || '';  // toujours ''
```

Résultat : `horaire = ''` → la ligne "🕐 Heure" n'apparaissait pas dans la cours-box.

### Règle permanente — lire les horaires tango comme chaînes plates

```javascript
// ✅ Pattern correct dans worker.js
const horaires = villeParams.horaires || {};
const nk = niveau === 'intermediaire' ? 'int' : 'deb';
const debut = typeof horaires[nk] === 'string' ? horaires[nk] : '';
const fin   = horaires[nk + '_fin'] || '';
const horaire = debut && fin ? `${debut}–${fin}` : debut;
```

### Référence — les handlers ICS étaient déjà corrects

Les handlers `handlePublicICS` / `handleEleveICS` (worker.js) lisaient déjà `hor.deb`, `hor.deb_fin`, `hor.int`, `hor.int_fin` comme chaînes plates — c'est le pattern à reproduire dans les handlers emails.

### Handlers corrigés (2026-05-25)

| Handler | Email(s) |
|---------|---------|
| `handleNotifyInscriptionEssai` — `getHoraire()` | E0/E1/E2/E5/E6 |
| `handleNotifyInscriptionCours` — `getHoraire(ville, niveau)` | I01 |
| `handleCronEssaiRappelJ7` | E4 |
| `handleNotifyEssaiAnnuleAdmin` | E-admin-cancel |
| `handleNotifyEssaiValide` | E15 |
| `handleNotifyInscriptionCoursValidee` | I02 |
| `handleNotifyInscriptionCoursPaye` — dans `coursBoxes.map` | I03 |

### Règle de validation — toute future modification de handler tango

1. Ne **jamais** écrire `horaires['debutant']` ou `horaires['intermediaire']` — ces clés n'existent pas
2. Toujours utiliser `const nk = niveau === 'intermediaire' ? 'int' : 'deb'` puis `horaires[nk]` et `horaires[nk + '_fin']`
3. Pour la fonction `getHoraire(ville, niveau)` qui prend les params de ville en argument : `const h = villeParams.horaires || {}; const nk = niveau === 'intermediaire' ? 'int' : 'deb'; ...`

---

## Livrets yoga dans les emails — bouton(s) selon le cours (yin/hatha/forfait)

### Symptôme
Les emails yoga ne contenaient pas de bouton "Télécharger le livret" alors que les URLs des livrets yin et hatha sont saisies dans Paramètres → Yoga → Livret d'information (champs `url_yin` et `url_hatha`). Seul `YI1` avait un bouton, et il ne gérait que la cas mono-cours (pas le forfait avec 2 livrets distincts).

### Source des URLs
```
tev_params_yoga_<sai>.livret = { url_yin: 'https://drive.google.com/...', url_hatha: 'https://drive.google.com/...' }
```
Saisi par l'admin dans Paramètres → Yoga → section "Livret d'information" (Yin et Hatha sont deux champs séparés).

### Règle d'affichage — 1 ou 2 boutons selon le cours

| `cours` (DB) | Boutons affichés |
|--------------|------------------|
| `'yin'` | 1 bouton : "📖 Télécharger le livret Yin Yoga" |
| `'hatha'` | 1 bouton : "📖 Télécharger le livret Hatha Yoga" |
| `'forfait'` | 2 boutons côte à côte : "📖 Livret Yin Yoga" + "📖 Livret Hatha Yoga" |

Si l'URL correspondante est vide dans Paramètres → le bouton n'est pas affiché (pas de bouton avec URL manquante).

### Pattern à utiliser dans tous les handlers yoga email

```javascript
const _yLiv = yogaParams.livret || {};
const _ybtnSty = 'display:inline-block;background:#fff;color:#2e7d32;border:2px solid #2e7d32;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;margin:4px 6px;';
let _livBtns = '';
if (cours === 'forfait') {
  if (_yLiv.url_yin)   _livBtns += `<a href="${_esc(_yLiv.url_yin)}"   style="${_ybtnSty}">📖 Livret Yin Yoga</a>`;
  if (_yLiv.url_hatha) _livBtns += `<a href="${_esc(_yLiv.url_hatha)}" style="${_ybtnSty}">📖 Livret Hatha Yoga</a>`;
} else if (cours === 'yin' && _yLiv.url_yin) {
  _livBtns = `<a href="${_esc(_yLiv.url_yin)}"   style="${_ybtnSty}">📖 Télécharger le livret Yin Yoga</a>`;
} else if (cours === 'hatha' && _yLiv.url_hatha) {
  _livBtns = `<a href="${_esc(_yLiv.url_hatha)}" style="${_ybtnSty}">📖 Télécharger le livret Hatha Yoga</a>`;
}
const livretYogaBlock = _livBtns ? `<div style="text-align:center;margin:0 0 22px;">${_livBtns}</div>` : '';
```

### Emails concernés

**Avec bouton(s) livret** (tous sauf attente/complet) :
- **Y1** — essai yoga confirmé (`handleNotifyInscriptionEssaiYoga`) — inséré après `yogaBoxY1`
- **Y3** — rappel J-3 (`handleCronEssaiYogaRappelJ3`) — inséré après yogaBox, avant le bouton 👍
- **Y-J1a** — lendemain présent (`handleCronEssaiYogaJ1`) — inséré après `rejoindreBox`
- **Y-J1b** — lendemain absent (`handleCronEssaiYogaJ1`) — inséré après le bouton "Choisir une nouvelle date"
- **Y-mod** — modification d'essai (`handleNotifyEssaiYogaModifie`) — inséré après yogaBox
- **YI1** — inscription régulière validée (`handleNotifyYogaInscriptionValidee`) — déjà présent, harmonisé avec gestion forfait (2 boutons)

**Sans bouton livret** (intentionnel) :
- **Y-att** — liste d'attente (cours régulier complet) : pas pertinent tant que la place n'est pas confirmée
- **Y-full** — date complète (14/14 sur cette date) : redirige vers une nouvelle date, le livret viendra dans Y1
- Emails admin (Y0, YI0) : l'admin n'a pas besoin du livret

### Style retenu
Bouton vert outline (`color:#2e7d32; border:2px solid #2e7d32; background:#fff`) — cohérent avec la charte yoga (vert). Différent des boutons livret tango (or `#D4AF37`). Pour le forfait, les deux boutons sont centrés côte à côte, avec wrap automatique sur mobile.

### Fix appliqué le 2026-05-25
6 handlers modifiés dans `worker.js` pour ajouter le bouton livret avec le bon pattern. YI1 a été refactorisé pour gérer le forfait avec 2 boutons (au lieu d'un seul fallback `url_hatha || url_yin`).

---

## Horaires yoga dans les emails — chaînes plates, pas d'objets imbriqués

### Symptôme
Les emails yoga (Y-J1a, Y-J1b, Y0, Y1, Y-att, Y3, Y-mod, YI1) affichaient le lieu et la date, mais **pas l'horaire du cours**. Section "Horaire" absente du yoga-box ou vide.

### Cause racine
Dans `admin.html`, `sauverHorairesType` sauvegarde les horaires yoga comme des **chaînes plates** dans Supabase :
```javascript
data.yin       = '10h30';     // chaîne — heure de début
data.yin_fin   = '11h30';     // chaîne — heure de fin
data.hatha     = '11h45';
data.hatha_fin = '12h30';
_saveParam('yoga', sai, 'horaires', data);
// → tev_params_yoga_<sai>.horaires = { yin:'10h30', yin_fin:'11h30', hatha:'11h45', hatha_fin:'12h30' }
```

Mais plusieurs handlers dans `worker.js` lisaient cette donnée comme un **objet imbriqué** :
```javascript
// ❌ Lecture incorrecte (interprète une string comme un objet)
const d = yogaHoraires.yin || {};
return d.debut && d.fin ? `${d.debut}–${d.fin}` : '';  // toujours '' (d.debut/d.fin undefined sur une string)
```

Résultat : `horHtml = ''` → la section "Horaire" du yoga-box n'apparaissait pas dans l'email.

### Règle permanente — lire les horaires yoga comme chaînes plates

```javascript
// ✅ Pattern correct dans worker.js
const yogaHoraires = yogaParams.horaires || {};
// Pour un cours unique (yin OU hatha) :
const key   = cours === 'hatha' ? 'hatha' : 'yin';
const debut = typeof yogaHoraires[key] === 'string' ? yogaHoraires[key] : '';
const fin   = yogaHoraires[key + '_fin'] || '';
const horaire = debut && fin ? `${debut}–${fin}` : debut || '';

// Pour le forfait (yin + hatha sur deux lignes) :
const parts = [];
if (yogaHoraires.yin)   parts.push(`Yin Yoga : ${yogaHoraires.yin}–${yogaHoraires.yin_fin||''}`);
if (yogaHoraires.hatha) parts.push(`Hatha Yoga : ${yogaHoraires.hatha}–${yogaHoraires.hatha_fin||''}`);
const horHtml = parts.join('<br/>');
```

### Référence — le handler ICS était déjà correct

Les handlers `handlePublicICS` / `handleEleveICS` (worker.js lignes 2815-2827) lisaient déjà `hor.yin` et `hor.yin_fin` comme chaînes plates depuis le début — c'est le pattern à reproduire. Les bugs étaient dans les handlers emails uniquement.

### Handlers corrigés (2026-05-24 et 2026-05-25)

| Handler | Email | Statut |
|---------|-------|--------|
| `handleCronEssaiYogaJ1` | Y-J1a, Y-J1b | ✅ 2026-05-24 |
| `handleNotifyYogaDate` | Y0, YI0, YI1 (variante essai) | ✅ 2026-05-24 |
| `handleNotifyInscriptionEssaiYoga` | Y0, Y1, Y-att | ✅ (était déjà correct) |
| `handleNotifyYogaInscriptionValidee` | YI1 | ✅ 2026-05-25 |
| `handleCronEssaiYogaRappelJ3` | Y3 | ✅ 2026-05-25 |
| `handleNotifyEssaiYogaModifie` | Y-mod | ✅ 2026-05-25 |

### Règle de validation — toute future modification de handler yoga

Avant de modifier un handler qui lit `yogaHoraires` :
1. Ne **jamais** écrire `yogaHoraires.yin.debut` ou `yogaHoraires.hatha.fin` — ces propriétés n'existent pas
2. Toujours utiliser le pattern `typeof yogaHoraires[key] === 'string'` + `yogaHoraires[key + '_fin']`
3. Tester en `workflow_dispatch` sur un cron yoga après chaque modif pour vérifier que l'horaire apparaît bien dans l'email
4. Les fichiers preview (`preview-emails-yoga-v1.html`) montrent le rendu attendu — l'horaire doit toujours apparaître entre le cours et le lieu dans le yoga-box

---

## Auto-zoom iOS Safari sur les champs de formulaire — règle permanente

### Symptôme
Sur iOS Safari, dès qu'un utilisateur tape dans un champ de formulaire, la page zoome automatiquement. Ce zoom persiste sur les étapes suivantes (ex : récapitulatif).

### Cause
iOS Safari zoome automatiquement sur tout champ (`input`, `select`, `textarea`) dont le `font-size` est **inférieur à 16px** au moment du focus.

### Règle permanente — `font-size: 16px` minimum sur tous les champs

**Tout formulaire public doit avoir `font-size: 16px` sur tous ses champs de saisie.** Ne jamais utiliser `font-size: 14px` ou `font-size: 15px` sur un champ interactif.

```css
/* ✅ Correct — pas de zoom iOS */
.field input[type="text"],
.field input[type="email"],
.field input[type="tel"],
.field input[type="date"],
.field input[type="number"],
.field select,
.field textarea {
  font-size: 16px;
}

/* ❌ Interdit — déclenche le zoom automatique iOS */
.field input { font-size: 14px; }
```

### ⚠️ Piège : les styles inline écrasent toujours les règles CSS

Si un champ a un `style=""` inline avec `font-size:15px`, la règle CSS `font-size: 16px` ne s'applique **pas** — le style inline gagne toujours. Il faut corriger le style inline lui-même.

```html
<!-- ❌ Ce textarea zoomera malgré la règle CSS font-size:16px -->
<textarea style="font-size:15px; ..."></textarea>

<!-- ✅ Correct -->
<textarea style="font-size:16px; ..."></textarea>
```

**Conséquence** : une correction CSS dans un media query ou dans une règle générale est inefficace si le champ incriminé a un style inline. Toujours inspecter les styles inline en priorité quand le fix ne fonctionne pas.

### Formulaires concernés (à vérifier/corriger)

| Formulaire | État |
|------------|------|
| `demande-devis.html` | ✅ Corrigé (16px, inline styles fixés) |
| `cours-essai.html` | ✅ Corrigé 2026-07-02 (règle globale 14→16px + textarea inline `rem` 14→16px) |
| `inscription-cours.html` | ✅ Corrigé 2026-07-02 (règle globale 14→16px) |
| `essai-yoga.html` | ✅ Vérifié 2026-07-02 — déjà à 16px |
| `stages-pwa.html` | ✅ Corrigé 2026-07-02 (`.champ input/textarea` 15→16px) |
| `cours-particuliers.html` | ✅ Corrigé (16px, thème clair appliqué) |

### Pourquoi un fix en media query `(max-width: 640px)` peut échouer

1. L'appareil a une largeur > 640px (iPad, certains Android en paysage) → la règle ne s'applique pas
2. Un style inline sur l'élément prend la priorité
3. Cache navigateur non vidé après déploiement

**Solution recommandée** : changer directement le `font-size` dans la règle principale (pas dans un media query), et vérifier tous les styles inline.

---

## Formulaires publics dans Wix iframe — règle `.insert().select('id')` interdite

### Symptôme
Le formulaire `cours-essai.html` (et tout formulaire public utilisant Supabase anon) **fonctionne depuis l'appli directement** mais renvoie une erreur `42501` (insufficient_privilege) quand il est soumis **depuis un iframe Wix** (`www.tangoetvous.com`).

### Cause racine
Quand supabase-js exécute `.insert(rows).select('id')`, il envoie l'en-tête HTTP `Prefer: return=representation` → PostgREST enveloppe l'INSERT dans une requête SELECT pour retourner les lignes insérées → **le SELECT déclenche les policies RLS SELECT** de la table → si la policy SELECT exige `is_admin() OR email = auth.email()`, elle retourne `false` pour les connexions anon → `42501`.

**Pourquoi ça marche hors Wix** : dans l'appli ou dans l'admin, l'utilisateur est authentifié (JWT admin ou magic link élève) → `auth.email()` = l'email de la session → la policy est satisfaite.

**Pourquoi ça échoue dans Wix** : Wix isole les iframes (storage partitioning Safari/Chrome) → supabase-js dans l'iframe n'a pas le JWT de session → connexion en tant qu'anon → `auth.email()` = null → policy SELECT échoue.

### Règle permanente — jamais `.insert().select()` sur les formulaires publics anon

```javascript
// ❌ Interdit sur toute table avec SELECT RLS restrictive (is_admin() ou auth.email())
const { data, error } = await TEV.client.from('inscriptions_essai')
  .insert(rows).select('id');

// ✅ Correct — INSERT sans RETURNING
const { error } = await TEV.client.from('inscriptions_essai').insert(rows);
if (error) throw error;
// L'ID inséré est récupéré côté worker via service_role si nécessaire
```

### Si l'ID est nécessaire après l'INSERT (ex: pour l'email de confirmation)

Dans le worker, utiliser `SUPABASE_SERVICE_KEY` (ou fallback sur `SUPABASE_ANON` pour les tables accessibles à anon) pour retrouver la ligne par filtre unique (`email + date + niveau`) plutôt que par `id` :

```javascript
// Dans le worker — récupère l'ID après l'INSERT anon (sans RETURNING)
const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
const findRes = await fetch(`${SUPABASE_URL}/rest/v1/inscriptions_essai?email=eq.${encodeURIComponent(email)}&date_essai=eq.${dateEssai}&niveau=eq.${niveau}&select=id&order=created_at.desc&limit=1`, {
  headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` }
});
const [found] = await findRes.json();
const inscId = found ? found.id : null;
```

### Tables concernées
Toutes les tables avec une policy SELECT `USING (is_admin() OR email = auth.email())` :
- `inscriptions_essai` ✅ corrigé dans `cours-essai.html`
- `inscriptions_cours`, `eleves`, `inscriptions_stages` — même règle à appliquer si INSERT+select est ajouté

### Fix appliqué le 2026-05-25
Dans `cours-essai.html` : `.insert(rowsToInsert).select('id')` → `.insert(rowsToInsert)` (sans `.select()`). L'`inscId` passé au worker est `null` ; le worker utilise un fallback par `email+date+niveau` pour retrouver l'ID si nécessaire pour les emails de confirmation.

---

## Supabase SQL Editor — quirk notation pointée PL/pgSQL

Le SQL Editor Supabase transforme automatiquement toute notation `v_record.champ` en `<v_record.champ>` (crochets angle) dans les fonctions PL/pgSQL, ce qui génère une `SyntaxError 42601`.

**Règle permanente** : ne jamais utiliser une variable de type record dans un `UPDATE ... WHERE id = v_record.id` ou une assignation `v_var := v_record.champ`. Toujours extraire les valeurs via `SELECT col1, col2 INTO v_scalar1, v_scalar2 FROM ...` avec des variables scalaires séparées dans le `DECLARE`.

```sql
-- ❌ Interdit (SQL Editor transforme en <v_partner.id>)
UPDATE t SET col = v_partner.statut WHERE id = v_partner.id;

-- ✅ Correct
DECLARE v_partner_id BIGINT; v_partner_statut TEXT;
SELECT id, statut INTO v_partner_id, v_partner_statut FROM t WHERE ...;
UPDATE t SET col = v_partner_statut WHERE id = v_partner_id;
```

## Audit sécurité — 2026-07-08 (2ᵉ passe : data-layer / autorisation)

Audit ciblé RLS Supabase + fonctions SQL + tokens worker (2 sous-agents lecture seule). **`HMAC_SECRET` confirmé DÉFINI dans Cloudflare** (+ `CRON_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `SUPABASE_SERVICE_KEY`, `VAPID_PRIVATE_KEY`) → toute la « famille forge de tokens » (liens email annuler/confirmer, ICS, remplaçant) est **non exploitable** (signés avec de vrais secrets). Aucun correctif appliqué — analyse seule.

### ⚠️ Angle mort : SQL non versionné
Les définitions RLS/GRANT de plusieurs tables (`cours_yoga`, `inscriptions_essai_yoga`, `absences_jour`, `notifications_eleve`, `fcm_tokens`) et fonctions (`pointer_cours_qr`, `confirmer_annuler_essai`, `liberer_demandes_cours`, `get_remplacant_eleves`, `get_eleves_repertoire`) ne sont dans AUCUN fichier du repo — exécutées à la main dans le SQL Editor. Les findings ci-dessous sont donc partiellement basés sur la doc, pas l'état déployé réel. **À vérifier dans Supabase avant tout correctif.**

### Findings — état réel (⚠️ correctifs NON triviaux, voir « pourquoi »)
- **C1 (CRITIQUE, vérifié) — `eleves_update USING (email=auth.email() OR is_admin())` sans restriction de colonne** (`schema.sql:75`). Un élève peut, via la console, faire `TEV.client.from('eleves').update({carte_restants:99, carte_paye:true, statut_eleve:'Actif'}).eq('email', le_sien)` → cours gratuits, carte impayée marquée payée. Sur SA fiche uniquement (les autres sont bloquées).
  - **⚠️ Pourquoi pas un fix simple** : l'espace élève ÉCRIT légitimement `carte_*` en `update()` direct (`tev-supabase.js:284` pointage, `:340` renouveler sans payer, `:356` paiement, `:332` carte_num), et l'ADMIN aussi (admin.html, JWT admin). Un GRANT colonne bloquerait les DEUX (admin inclus, car il est aussi rôle `authenticated`). Le renouvellement élève AUGMENTE légitimement `carte_restants` (0→N) → impossible de distinguer « renouveler » de « tricher » par simple policy. **Fix robuste = trigger BEFORE UPDATE qui, si `NOT is_admin()`, interdit `carte_paye` false→true et tout changement de `statut_eleve`** (les deux abus les plus clairs, sans casser pointage/renouvellement). Le cap « restants arbitrairement haut » nécessiterait de déplacer la mutation carte vers une fonction SECURITY DEFINER (refonte client+SQL, risque moyen).
- **C2 (CRITIQUE, doc) — `pointer_cours_qr(p_email, p_date, p_nb)` accepte un email arbitraire, GRANT anon, sans check `auth.email()`**. Un anonyme avec la clé publique vide la carte de n'importe quel élève (email devinable).
  - **⚠️ Pourquoi pas `p_email = auth.email()`** : le flux QR (`pointer.html`) est **entièrement ANONYME** — il lit l'email depuis l'URL et pingue la RPC sans connexion (idem `remplacant.html` via token signé). `auth.email()` serait `null` → ajouter ce check CASSE le pointage QR et remplaçant. **Fix propre = QR signé** (l'admin génère un QR portant un token HMAC email+date que la RPC vérifie), touche génération QR (admin.html) + pointer.html + la RPC. Alternative : rate-limiting Cloudflare + risque accepté.
- **C3 (MOYEN, mécanisme vérifié) — `confirmer_annuler_essai` reçoit `p_secret` en PARAMÈTRE** (`worker.js:4737` passe `p_secret`, RPC appelée avec bearer anon → anon-exécutable). Un appelant direct fournit son propre secret + token calculé → le contrôle HMAC est décoratif pour un appel direct. Exige de connaître (id essai séquentiel, email cible) ; impact = soft-delete récupérable + fuite PII de la fiche. `HMAC_SECRET` défini ne protège QUE le chemin worker, pas l'appel direct. **Fix = lire le secret côté serveur (`current_setting()`), jamais en paramètre.**
- **M1–M6 (MOYEN, doc) — RLS « always true » + GRANT anon** sur `cours_yoga` (PII tel/montants), `get_remplacant_eleves` (emails+soldes de tous), `notifications_eleve` (notifs nominatives de tous), `milonga_presences` (`schema.sql:395`, vérifié), `fcm_tokens` (couper les push de tous), `absences_jour` (fausser les quotas essai). Enjeu RGPD/PII plus que financier. Fix = SELECT/UPDATE/DELETE gated `email=auth.email() OR is_admin()`, INSERT public conservé.
- **MOYEN — routes `/api/notify/*` sans auth** (worker) : destinataire email vient du body sans vérif d'existence → relais d'emails depuis `contact@tangoetvous.fr` + flood push admin. Fix = rate-limiting + vérifier que l'email cible existe en base.

### Correctement verrouillé (confirmé, ne pas re-signaler)
`messages_eleves` (expéditeur=auth.email(), modèle exemplaire), `eleves` SELECT/INSERT/DELETE, `inscriptions_*` (SELECT/UPDATE/DELETE gated, INSERT public justifié), `is_admin()` (non contournable — email issu du JWT signé), CORS (allowlist stricte, pas de reflect), routes cron (secret vérifié partout, fail-closed), tokens email/ICS/remplaçant (signés HMAC vérifiés serveur, `HMAC_SECRET` défini), `liberer_demandes_cours` (ids `inscriptions_cours` = TEXT `'INS…'`, worker filtre `Number()` → non-exploitable). `parametres` SELECT public = justifié (config site public) SAUF si un secret y transite (à vérifier : liens AssoConnect).

### Priorité recommandée (petite école)
Traiter en priorité **C1** (intégrité financière carte) et **M1/M2/M3** (fuite PII tel/emails avec clé publique = RGPD). C2/C3/M4/M5/M6/notify = défendables en risque accepté. **Aucun de ces correctifs n'est un SQL à coller sans risque** — chacun peut casser un flux légitime (pointage élève/QR, gestion carte admin) et doit être testé. À faire AVEC l'admin, SQL relu avant exécution.

## Audit sécurité — 2026-07-08 (post-annuaire élève)

Audit en lecture seule après mise en place de Playwright. 4 corrections appliquées (#1, #2, #4, #5), 2 durcissements laissés en suspens (#3, #6). Tests de non-régression : groupe H Playwright (`tests/h-security.spec.js`, 3 tests) + suite complète 24/24 verte.

### Corrigés ✅
- **#1 — `/api/eleve/message-prive` : route non authentifiée** (`worker.js` `handleEleveMessagePrive`). La route acceptait n'importe quel en-tête `Authorization` non vide → un tiers pouvait pousser notif in-app + push OS à n'importe quel élève en usurpant l'expéditeur. Fix : validation du JWT via `/auth/v1/user` + vérification que `de` (expéditeur) == email du token (comparaison en minuscules). Le client envoie `de` = email de session Supabase (même source que le JWT) → match garanti pour les appels légitimes. Route fire-and-forget same-origin : même un rejet ne bloque pas l'envoi du message (déjà inséré en base côté client). **Non couvert par Playwright** (pas de runtime worker) — vérif manuelle : `curl -s -o /dev/null -w "%{http_code}" -X POST https://app.tangoetvous.fr/api/eleve/message-prive -H "Authorization: Bearer faux" -H "Content-Type: application/json" -d '{"de":"x@y.fr","a":"z@w.fr"}'` doit renvoyer **401** (avant le fix : 200).
- **#2 — XSS stockée espace élève** (`index.html` `renderNotificationsPane`, ligne ~4735). `n.message` (venant de `notifications_eleve`, avec champs user via #1 ou discussions) était inséré en innerHTML brut → `<img onerror>` exécuté chez la victime. Fix : échappement local `_escN()` (⚠️ `_esc` global n'existe PAS dans ce scope — il est défini 3× en `const` local dans d'autres fonctions ; ne jamais appeler `_esc` ici). Les messages sont toujours du texte (emoji + libellé), jamais du HTML volontaire → échappement 100 % sûr.
- **#4 — XSS stockée admin, liste devis** (`admin.html` `renderListeDevis`). `client_nom`, `evt_lieu`, intitulés de prestations (issus du formulaire public `demande-devis.html`) insérés bruts → `escHtml()`. Champs serveur (numero, dates, montant) laissés intacts.
- **#5 — XSS stockée admin, liste cours particuliers** (`admin.html` `_renderCPListe`/`cardCP`). `cp.email` / `cp.tel` (formulaire public) insérés bruts en contexte texte ET dans `href="tel:"`/`"sms:"` → `escHtml()` (neutralise le `"` de sortie d'attribut ; un vrai numéro ne contient jamais `"<>&`, zéro impact). `mailtoGmail()` déjà sûr (encodeURIComponent).

### Risque résiduel accepté / à faire plus tard
- **#3 — usurpation d'expéditeur discussions** (`handleNotifyDiscussion*Eleve`) : `_requireEleve(jwt)` valide que le token est un utilisateur Supabase mais **pas** que `auteurEmail`/`targetEmail` du body lui correspond. Un élève authentifié peut notifier n'importe quelle cible en usurpant `auteurNom`. Durcissement : faire retourner l'email par `_requireEleve` et comparer. Non fait (helper partagé, prudence requise).
- **#6 — `/api/eleve/repertoire` sans contrôle de rôle** : tout compte Supabase authentifié (pas forcément élève) peut lister l'annuaire (nom + photo des `visible_repertoire=true`). Données non sensibles, opt-in → accepté.

### Confirmé correctement protégé (ne pas re-signaler)
Emails Brevo (tous champs via `_esc`), chat discussions admin (`escHtml`) et élève (`nameEsc`/`msgEsc`), bulles annuaire élève (`_repEsc`), cartes publications élève (`_esc`), notifications **admin** (`escHtml`), `_dvRow` (`escHtml`), endpoints `/api/debug/*` (admin requis), `handleRegisterToken` (email dérivé du JWT, pas du body). Secrets : seule la clé anon Supabase (publique par design) dans le client, aucune service key/clé Brevo/Firebase en dur.

## Audit sécurité — 2026-05-06

### Corrigés
- **C1** ✅ Backups CSV retirés du repo git + `.gitignore backups/` + `worker.js` route `/backups/*` → 403 + workflow backup ne commit plus dans le repo (GitHub Artifacts uniquement)
- **H3** ✅ XSS Discussions admin : `auteur_nom` échappé via `escHtml()` dans `_discRenderMsgs()`
- **H4** ✅ XSS Devis admin : `_dvRow()` échappe maintenant `val` via `escHtml()` + `d.message` échappé dans le bloc message
- **M1** ✅ Erreurs DB brutes supprimées des réponses HTTP du worker → `console.error` interne + message générique `'Une erreur est survenue'`
- **M2** ✅ HTML injection email Brevo : tous les champs utilisateur échappés via `_esc()` dans `sendBrevoNotification`

### Risque résiduel accepté — clôturé le 2026-05-07
- **H1** — Élève modifie sa ligne `eleves` (carte payée, compteur) : cross-vérifié AssoConnect, aucun intérêt pratique à tricher
- **H2** — Élève insère de fausses présences : contre-productif (consomme sa propre carte)
- **H5** — Token Turnstile jamais vérifié côté serveur : spam improbable sur formulaires d'une petite école. Widget côté client + index UNIQUE en DB + validation manuelle admin = protection suffisante. ✅ Widget opérationnel (hostname `app.tangoetvous.fr` ajouté au dashboard Cloudflare Turnstile)
- **M6** — `milonga_presences` sans auth : RSVPs milonga peu critiques
- **M3** — RLS non documenté dans `schema.sql` : cosmétique, pas de risque opérationnel
- **L2** — Emails admin dans le JS client : la vraie sécurité est dans `is_admin()` Supabase

### Notes
- La clé anon Supabase est intentionnellement publique (design Supabase) — sécurité dépend du RLS
- `unsafe-inline` dans CSP inévitable tant que les scripts sont inline dans les HTML — accepté comme risque résiduel

## Audit Supabase Security Advisor — 2026-05-21

38 warnings analysés depuis Dashboard Supabase → Database → Security Advisor. SQL exécuté par l'utilisateur.

### Corrigés ✅

**Function Search Path Mutable (7 fonctions)** — Ajout de `SET search_path = public` sur les fonctions SECURITY DEFINER. Purement déclaratif, zéro impact comportemental :
```sql
ALTER FUNCTION public.reserver_numero_devis(p_annee integer) SET search_path = public;
ALTER FUNCTION public.protect_devis_numero() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.compter_inscrits_essai(p_date_essai date, p_ville text, p_niveau text) SET search_path = public;
ALTER FUNCTION public.compter_inscrits_essai(p_date_essai text, p_ville text, p_niveau text) SET search_path = public;
ALTER FUNCTION public.pointer_cours_qr(p_email text, p_date date, p_nb integer) SET search_path = public;
ALTER FUNCTION public.get_remplacant_eleves(p_ville text, p_niveau text, p_saison text) SET search_path = public;
```

⚠️ **`is_admin()` — NE PAS ajouter `SET search_path = public`** : cette fonction est utilisée dans les clauses USING de TOUTES les policies RLS de l'app. `SET search_path = public` casse `auth.email()` dans ce contexte → `is_admin()` retourne `false` pour tout le monde → toutes les données deviennent invisibles dans l'admin. Risque résiduel accepté.

**REVOKE fonctions inutilement publiques** :
```sql
REVOKE EXECUTE ON FUNCTION public.reserver_numero_devis(p_annee integer) FROM anon;
-- (le générateur de devis et le worker utilisent le JWT admin — anon n'en a jamais eu besoin)
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
-- (fonction interne Supabase, jamais appelée par l'app)
```

**Policy `devis` resserrée à `is_admin()`** :
```sql
DROP POLICY IF EXISTS "allow_all_devis_authenticated" ON public.devis;
CREATE POLICY "devis_admin" ON public.devis
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
```

**Policy UPDATE `demandes_devis` resserrée à `is_admin()`** :
```sql
DROP POLICY IF EXISTS "allow_update_demandes_devis" ON public.demandes_devis;
CREATE POLICY "demandes_update_admin" ON public.demandes_devis
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
-- (le formulaire public ne fait que des INSERT — policy INSERT reste ouverte à anon)
```

### Risque résiduel accepté — clôturé le 2026-05-21

- **RLS Policy Always True** sur `cours_yoga`, `milonga_presences`, `inscriptions_essai`, `inscriptions_essai_yoga`, `inscriptions_cours`, `absences_jour`, `fcm_tokens`, `notifications_eleve` — intentionnel : formulaires publics anon, pointage QR, notifications élève. La vraie sécurité est dans les UNIQUE indexes + validation admin + logique métier.
- **Public Can Execute SECURITY DEFINER** sur `compter_inscrits_essai`, `pointer_cours_qr`, `get_remplacant_eleves` — intentionnel : ces fonctions sont appelées par des formulaires publics (`anon`) sans JWT. Elles exposent uniquement des comptes agrégés (quotas) ou des données non sensibles.
- **Leaked Password Protection** — non applicable : l'app utilise des magic links uniquement, aucun mot de passe.
- **REVOKE `is_admin()` de anon** — **ne pas faire** : `is_admin()` est utilisée dans les clauses USING des policies RLS, qui sont évaluées avec les droits du propriétaire (SECURITY DEFINER implicite côté RLS). Révoquer l'accès anon casserait l'évaluation RLS pour les connexions anon.
- **`SET search_path = public` sur `is_admin()`** — **ne pas faire** : casse `auth.email()` dans le contexte RLS → toutes les données deviennent invisibles (incident 2026-05-21). Voir ci-dessous.

### Définition correcte de `is_admin()` — NE PAS MODIFIER la logique
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(auth.email(), '') = ANY(ARRAY[
    'tangoetvous@gmail.com',
    'jeremybraitbart@gmail.com',
    'garciabraitbart@gmail.com',
    'jeremy@tangoetvous.com'
  ]);
$$;
```
- Pas de `SET search_path` — intentionnel (voir ci-dessus)
- Pas de `LANGUAGE plpgsql` — doit rester `LANGUAGE sql`
- Pas de lookup dans `eleves.role` — la logique est une liste d'emails hardcodée
- Pour ajouter un admin : ajouter son email dans le `ARRAY[...]` et recréer la fonction

### Aucun GRANT manquant
Toutes les tables existantes ont leurs GRANTs. Les nouvelles tables créées depuis 2026-05 incluent toutes `GRANT ... TO anon, authenticated`. Deadline Supabase (30 octobre 2026) : sans risque.

## Supabase — changement GRANTs Data API (email 2026-05-14)

### Contexte
Supabase modifie son comportement par défaut : les nouvelles tables dans le schéma `public` n'auront plus de GRANTs automatiques vers `anon`/`authenticated`. Sans GRANT explicite, supabase-js retourne une erreur `42501` et la table est invisible pour l'app.

### Dates clés
- **30 mai 2026** : nouveau comportement pour tous les nouveaux projets
- **30 octobre 2026** : appliqué à tous les projets existants (y compris celui-ci)

### Impact sur ce projet
- **Tables existantes** : pas d'impact — elles gardent leurs GRANTs actuels
- **Nouvelles tables** : déjà OK — les SQL récents (notifications_eleve, remises_banque, cheques_depot…) incluent tous des `GRANT ... TO anon, authenticated`
- **⚠️ À faire avant le 30 octobre** : vérifier les tables existantes via Dashboard Supabase → Database → Security Advisor. Si des tables apparaissent sans grant, générer le SQL de correction

### Règle obligatoire — tout nouveau `CREATE TABLE` doit inclure
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ma_table TO anon, authenticated;
-- (ajuster selon la table : tables admin uniquement → TO authenticated seulement)
```

### À faire avec l'utilisateur
- [x] **Audit GRANTs existants** : ✅ fait le 2026-05-21 — Security Advisor vérifié (38 warnings analysés et corrigés). Aucune table sans GRANT — voir section "Audit Supabase Security Advisor — 2026-05-21".

## Vue d'ensemble
Application de gestion d'une école de tango et yoga (Tango & Vous).
- **Frontend** : HTML/CSS/JS vanilla (admin.html, index.html, etc.)
- **Backend** : Supabase (base de données + auth)
- **Déploiement** : Cloudflare Workers Static Assets via GitHub Actions
- **Domaines** : site Wix = `www.tangoetvous.com` / app Cloudflare = `app.tangoetvous.fr` (admin + élèves)
- **Branche de travail** : `claude/dance-school-app-RTqb5`
- **Repo** : `tangoetvous/tango-et-vous-app`

## Déploiement
- Push sur `claude/dance-school-app-RTqb5` → GitHub Actions → `npx wrangler@4 deploy`
- Secret GitHub : `CLOUDFLARE_API_TOKEN`
- Account ID Cloudflare : `7a0157f1a098478f6ef8c98ca545e914`
- Après chaque déploiement : demander à l'utilisateur de faire **Cmd+Shift+R** pour vider le cache

## Structure Supabase (tables principales)
- **`eleves`** : profils élèves (nom, prenom, email, tel, role, statut_eleve, notes, saison, **photo_url**...) — `photo_url TEXT` ajoutée via `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS photo_url TEXT;` (déjà exécuté)
- **`inscriptions_cours`** : inscriptions tango (email, prenom, nom, tel, role, ville, niveau, cours, type, paiement, montant, statut, partenaire, email_partenaire, saison, donnees, **paiement_sorano**)
  - `ville` : `'paris'` ou `'vincennes'`
  - `niveau` : `'debutant'` ou `'intermediaire'`
  - `role` : `'guideur'`, `'guidee'`, `'double'`
  - `type` : `'carte10'` ou `'forfait'`
  - `paiement` : `'cb1x'`, `'cb3x'`, `'especes'`, `'cheque'`, `'virement1x'`, `'virement3x'`
  - `statut` : `'inscrit'`, `'supprimé'`, `'valide'`, `'attente'`, `'demande'`, `'attente_paiement'`
  - `cours` : format `'paris—debutant'` (stockée en DB, calculée depuis ville+niveau lors de l'insert)
  - `paiement_sorano` : `BOOLEAN DEFAULT false` — règlement adhésion Sorano (Vincennes uniquement)
  - ⚠️ Dans `tev-supabase.js`, `role` est prioritairement lu depuis `inscriptions_cours`, avec fallback sur `eleves.role`
- **`cours_yoga`** : inscriptions yoga (email, prenom, nom, **tel**, cours, paiement, montant, statut, saison, **paiement_sorano**) — colonne `tel TEXT DEFAULT ''` à créer via SQL si absente : `ALTER TABLE cours_yoga ADD COLUMN IF NOT EXISTS tel TEXT DEFAULT '';`
  - `cours` : `'hatha'`, `'yin'`, `'forfait'` (forfait = hatha + yin)
  - `paiement_sorano` : `BOOLEAN DEFAULT false` — même champ que tango pour les élèves faisant les deux
  - RLS activé avec policies `allow_select/insert/update/delete` (USING true)
  - SQL à exécuter si colonnes absentes : `ALTER TABLE inscriptions_cours ADD COLUMN IF NOT EXISTS paiement_sorano BOOLEAN DEFAULT false; ALTER TABLE cours_yoga ADD COLUMN IF NOT EXISTS paiement_sorano BOOLEAN DEFAULT false;`
- **`inscriptions_stages`** : inscriptions aux stages — ⚠️ colonne `telephone` (pas `tel`)
- **`inscriptions_essai`** : cours d'essai tango — colonne `tel`
- **`inscriptions_essai_yoga`** : cours d'essai yoga — table séparée. Colonnes : `prenom, nom, email, tel, date_essai, cours, gratuit, statut, presence_confirmee, presence_declaree`. `statut` toujours `'confirme'` à l'inscription si une place est disponible — **pas de validation manuelle admin** (contrairement à l'essai tango). `presence_declaree BOOLEAN DEFAULT NULL` : `NULL`=non pointé, `true`=admin ✓ Présent, `false`=admin 🚫 Absent — même logique que `inscriptions_essai`. SQL : `ALTER TABLE inscriptions_essai_yoga ADD COLUMN IF NOT EXISTS presence_declaree BOOLEAN DEFAULT NULL;` ✅ Exécuté. ⚠️ Table distincte de `inscriptions_essai` — ne pas confondre.
- **`presences`** : pointage des présences
- **`cours_particuliers`** : cours particuliers
- **`publications`** : publications/annonces
- **`agenda_modifs`** : modifications d'agenda
- **`demandes_devis`** : demandes reçues via formulaire public `demande-devis.html` — voir section Devis ci-dessous
- **`devis`** : devis officiels créés par l'admin — voir section Devis ci-dessous
- **`compteurs_devis`** : numérotation annuelle des devis (accès via fonction SECURITY DEFINER uniquement)
- **`notifications`** : historique des notifications admin — colonnes : id, created_at, type, message, lu (bool), lien_tab. **Créée le 2026-05-24** (existait dans le code avant d'exister en DB — tous les inserts worker échouaient silencieusement avec 404). RLS : policy `notifications_admin` FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin()) — GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated. ⚠️ La RLS bloque les inserts avec la clé anon → le worker utilise la fonction SECURITY DEFINER `inserer_notification()` (accessible à anon) via le helper `_insertNotification()` (worker.js). Ne jamais insérer directement via REST avec SUPABASE_ANON. Lue par le panel 🔔 dans l'admin.
- **`absences_jour`** : absences déclarées sur les cours réguliers — colonnes : id, created_at, date (date), email (text), UNIQUE(date, email). GRANT SELECT/INSERT/UPDATE/DELETE accordé à anon + authenticated. Alimentée par l'admin (bouton Absent dans Pointage) ET par l'espace élève (bouton sur carte Prochain Cours).

## Architecture JS clé
- **`js/tev-supabase.js`** : toutes les requêtes Supabase, fonction `tevGetAdminData()`
  - Enrichit `coursTango` avec `tel`, `role`, `cours` (calculé) depuis la table `eleves`
  - Enrichit `coursYoga` avec `tel` depuis la table `eleves`
  - Charge `cours_yoga` et retourne comme `coursYoga`
  - `tevUpdateEleveTel(email, tel)` : met à jour `tel` dans `eleves` (appelée depuis `saveTel()` dans index.html)
  - `tevUpdateElevePhoto(email, photoUrl)` : met à jour `photo_url` dans `eleves`
- **`admin.html`** : interface admin complète (~8000 lignes)
  - `IS_DEMO` : mode démo vs réel
  - `adminData` : état global de l'appli
  - `chargerDonnees()` : recharge depuis Supabase et merge dans adminData
  - `PAI_LBL` : `{cb1x:'CB 1×', cb3x:'CB 3×', especes:'Espèces', cheque:'Chèque', virement1x:'Virement 1×', virement3x:'Virement 3×'}`
- **`index.html`** (espace élève) : onglets `carte` et `actu` renommés → labels affichés **"Forfait"** et **"Publications"** (dans `NAV_TABS` et `_TAB_LABELS`). Section "📋 Mes coordonnées" dans `renderAccueil()` : téléphone éditable + bouton "Enregistrer" (`saveTel()`) + mailto pour changement d'email.

## Onglet Plan des lieux (index.html — Plan IIFE, ligne ~4130)

### Architecture GPS
- **Problème fondamental** : admin sauvegarde les Paramètres dans son localStorage (ordinateur), mais l'espace élève tourne sur un autre appareil (téléphone) avec un localStorage différent — pas de partage possible. **Règle : toujours lire les Paramètres depuis Supabase, pas depuis localStorage.**
- **Table Supabase** : `parametres` (clé/valeur) — accessible en lecture par les clients anon sans auth (via `tevGetParam` / `TEV.client.from('parametres')`)
- **Clés des params Plan** :
  - `tev_params_paris_<sai>`, `tev_params_vincennes_<sai>`, `tev_params_yoga_<sai>`, `tev_params_stages_<sai>` → `{ adresse: { gps, metrogps, nom, rue, transport } }`
  - `tev_milongas_<sai>` → `{ milongas: [{ id, nom, lieu: { gps, metroGps, ... }, color, ... }] }`

### Fonctions clés dans le Plan IIFE
- **`_applyMilongasGps(mils)`** : applique les GPS milonga sur LIEUX + markers existants. Crée le marker si absent (GPS manquant au page-load). Appeler à chaque fois que des données milonga fraîches arrivent.
- **`_applyStatic(venueId, adresse)`** (dans `_refreshMilongasGps`) : applique GPS + metroGPS d'un lieu statique (paris/vincennes/stage/yoga) sur LIEUX + markers.
- **`_refreshMilongasGps()`** : appelée dans `initPlan()`. Lit d'abord localStorage (sync, immédiat), puis fetch Supabase (async) pour tous les lieux — milongas + statiques. Met à jour localStorage + LIEUX + markers à l'arrivée. ⚠️ Ne pas supprimer la partie Supabase sinon les GPS ne fonctionnent plus cross-device.
- **`_applyMilongasGps`** doit rester distincte de `_refreshMilongasGps` car appelée depuis les deux endroits (localStorage sync + Supabase async).

### LIEUX statiques — GPS et fallbacks
- GPS lus depuis `_lpPl('paris'|'vincennes'|'yoga'|'stages').adresse.gps` au page-load (localStorage)
- Fallbacks hardcodés en cas d'absence de GPS dans localStorage/Supabase (lignes ~4152-4160)
- **`_pg(str, fb)`** : parse une string `'lat,lng'` → retourne `{lat, lng, hasGps:true}` ou `fb` si vide
- `hasExplicitGps: _gpX.hasGps` : empêche le cache Nominatim et `affinerCoordsEnBackground` d'écraser le GPS admin

### Migration admin.html
- `chargerMilongas()` contient une migration auto : si `gps === '48.8465,2.3870'` (ancien défaut erroné pour La Dolce Vita), remplace par `48.83894517744268,2.3913407796525115` et sauvegarde immédiatement. S'exécute au chargement de l'admin.

### Cache Plan
- Clé cache : `tev_plan_coords_v13` — stocker les coords géocodées Nominatim pour les lieux sans GPS explicite. Incrémenter la version pour forcer re-géocodage si nécessaire.

## Décisions techniques importantes
- **Contrôle d'accès espace élève — basé sur l'inscription active, pas `statut_eleve`** (commit `e889abd`, 2026-05-30) : `tevGetEleve()` dans `js/tev-supabase.js` vérifie l'existence d'au moins une ligne active dans `inscriptions_cours` (statut ≠ 'supprimé') OU `cours_yoga` pour la saison courante ou la saison suivante. `statut_eleve = 'Actif'` seul **ne suffit plus** pour accéder à l'espace élève. Règles :
  - `statut_eleve === 'En attente'` → blocage explicite (message "compte en cours de validation") — indépendant de l'inscription
  - `statut_eleve === 'Inactif'` → blocage explicite (message "accès suspendu") — indépendant de l'inscription
  - Aucune des deux lignes ci-dessus + inscription active (saison courante ou suivante) → accès accordé
  - Aucune inscription active → message "Votre inscription pour cette saison est terminée. Contactez-nous pour vous réinscrire."
  - **Avantage** : à la rentrée 2026-2027, les élèves non ré-inscrits perdent automatiquement l'accès sans intervention manuelle admin. Les élèves ré-inscrits via "Valider le paiement" ou "Inscription directe" de la saison prochaine (mai–août) ont déjà accès car le check inclut `saisonSuivante`.
  - **Période de pré-inscription (mai–août)** : les élèves qui se ré-inscrivent pour la saison suivante via les formulaires admin ont accès à l'espace élève immédiatement — la saison suivante est incluse dans le check.
  - **Élèves yoga uniquement** : le check interroge `cours_yoga` en parallèle — les élèves sans inscription tango mais avec un cours yoga actif conservent leur accès.
  - **Ne jamais revenir à `statut_eleve = 'Actif'`** comme seul critère — l'admin devrait mettre à jour manuellement des centaines de fiches à chaque fin de saison.
- **`cours` non stockée** dans `inscriptions_cours` — calculée depuis ville+niveau dans `tev-supabase.js`
- **Saison dans les formulaires admin directs** : toujours utiliser `saisonActive()` (saison affichée dans l'admin), jamais `saisonPourNouvelleEntree()` qui renvoie la saison suivante en mai-août. `saisonPourNouvelleEntree()` est réservé aux formulaires publics (inscription-cours.html, etc.)
- **Supabase `.upsert()` + `.catch()`** : le builder Supabase n'expose pas `.catch()` directement. Toujours envelopper dans `Promise.resolve(...).catch(function(){})` ou utiliser `.then(null, fn)`.
- **INSERT Supabase puis navigation** : après un INSERT admin, appeler `chargerDonnees()` dans le `.then()` du INSERT (pas dans un `setTimeout` fixe) pour éviter la race condition où le rechargement arrive avant la fin de l'écriture.
- **INSERT dans un iframe + BroadcastChannel : toujours faire l'INSERT AVANT d'envoyer la notification** — Si le BroadcastChannel/postMessage est envoyé en premier, l'admin re-rend l'onglet (`renderTab()`), ce qui retire l'iframe du DOM. L'INSERT tourne alors dans un iframe détaché : Chrome bloque silencieusement les `alert()` et les `window.parent.postMessage` de ces iframes, rendant toute erreur invisible. L'entrée apparaît brièvement (état local via BroadcastChannel) puis disparaît quand `chargerDonnees` écrase avec les données DB sans l'enregistrement raté. **Ordre correct dans `finalize()` :** (1) afficher l'écran de succès, (2) `await INSERT`, (3) si erreur → `alert()` fonctionne car iframe encore dans le DOM, (4) si succès → envoyer BroadcastChannel + postMessage.
- **Suppression tango** = `UPDATE inscriptions_cours SET statut='supprimé'` (pas DELETE)
- **Onglets Supprimés — séparation stricte** : deux sources de suppression dans `inscriptions_cours`, distinguées par `donnees.supprimé_de` :
  - `supprimerCoursInscr(id)` (depuis Inscriptions Tango, statut était `demande`/`attente_paiement`) → pose `donnees.supprimé_de='inscriptions_tango'` en DB + `e._suppriméDeInscriptions=true` localement → apparaît **uniquement** dans Inscriptions Tango → Supprimés
  - `confirmerSupprimerEleve(id)` (depuis Élèves Tango, statut était `inscrit`) → pas de marqueur `supprimé_de` → apparaît **uniquement** dans Élèves Tango → Supprimés
  - `chargerDonnees()` restaure `_suppriméDeInscriptions` depuis `donnees.supprimé_de` au rechargement (survit au polling 15s)
  - **Règle** : ne jamais lire `statut==='supprimé'` sans vérifier ce marqueur quand on construit une liste d'un seul des deux onglets
- **Suppression yoga** = `DELETE FROM cours_yoga` (suppression réelle)
- **Comparaison d'IDs — règle universelle** : utiliser `String(x.id)===String(id)` partout (pas seulement pour yoga). Supabase retourne des BIGINT (nombres) mais `btn.dataset.id`, `sel.value` et les valeurs d'attributs HTML sont toujours des strings. `42 === "42"` → `false` → find/match échoue silencieusement.
- **iOS Safari — boutons cliquables** : les `<button>` avec délégation de click ne fonctionnent pas de manière fiable dans certains contextes DOM sur iOS Safari. Toujours utiliser `<a href="javascript:void(0)" onclick="...">` pour les actions inline dans du HTML généré dynamiquement.
- **Race condition suppression vs polling 15s** : `_chargerDonneesSeq++` ne protège que les appels `chargerDonnees` déjà en vol — pas les nouveaux appels démarrés après la suppression, qui fetchent la DB avant que l'UPDATE soit confirmé. Solution : `_pendingSupprimes` (Set global). Ajouter `String(id)` avant `renderTab()`, retirer après confirmation DB. Dans `chargerDonnees()`, après mise à jour de `coursTango`, ré-appliquer : `ct.map(e => _pendingSupprimes.has(String(e.id)) ? {...e, statut:'supprimé'} : e)`.
- **`sauverContact()` — mettre à jour TOUTES les tables** : la fonction doit mettre à jour en parallèle toutes les tables où la personne peut exister selon son contexte. Pattern `Promise.all([...])` sur : `inscriptions_cours` (ctx='ct', demande/attente_paiement non encore dans eleves), `eleves` (ctx='ct'/'eleve'/'carte'), `inscriptions_essai` (ctx='essai', col `tel`), `inscriptions_stages` (ctx='stage', col `telephone`), `cours_yoga` (ctx='yoga', pas de col `tel`). L'état local `adminData` doit être mis à jour immédiatement (hors IS_DEMO) pour que le prochain `chargerDonnees` ne l'écrase pas. Structure stages : itérer `Object.values(adminData.stages).forEach(jour => updLocal(jour.inscrits))`.
- **⚠️ Règle permanente — JAMAIS d'UPDATE `WHERE email=''`** (bug Karine Blum → Anna Wawrowska, 2026-07-02) : les fiches partenaires sont créées avec `email:''` ; un UPDATE filtré `.eq('email','')` touche TOUTES les fiches sans email de la table (toutes personnes, toutes saisons). Dans `sauverContact()`, quand `oldEmail` est vide : (1) match local par nom complet normalisé (`_matchOld` / `_normSC`), (2) UPDATE DB ciblé `.in('id', ids)` avec les ids réels (numériques) issus de `adminData.coursTango`/`adminData.essai`, (3) aucun UPDATE DB sur `eleves` (email UNIQUE requis, pas de fiche sans email), `inscriptions_stages` (pas d'id local fiable) ni `cours_yoga` (toujours créé avec email), (4) pas de sync Auth (`update-auth-email`) sans ancien email. Toute nouvelle fonction qui modifie des fiches par email doit appliquer la même garde. **Garde-fou central actif** (2026-07-02, `js/tev-supabase.js?v=6`) : le client Supabase est wrappé — tout `update`/`delete`/`upsert` avec `.eq('email', <vide>)` ou `.in('email', [... vide ...])` lève une exception et n'atteint jamais la DB, dans toutes les pages qui chargent `tev-supabase.js` (admin, espace élève, formulaires publics). Ne jamais retirer ce wrapper ; si un jour une mutation par email vide était légitime (aucun cas connu), cibler par `id` à la place.
- **`_renderTabSiPasFormulaire()` — protéger tous les formulaires** : la garde `activeElement INPUT/TEXTAREA/SELECT` ne suffit pas — si l'utilisateur vient de cliquer un bouton, le focus est perdu. Ajouter des gardes explicites pour chaque sous-onglet contenant un formulaire : `if (currentTab==='cours-tango' && (sousOngletCoursTango==='valider_paiement'||sousOngletCoursTango==='inscrire')) return;` — même modèle que `eleves-tango/inscrire`.
- **Absences élèves réguliers** (table `absences_jour`) : persistance double — localStorage immédiat + sync Supabase en arrière-plan. Dans `chargerDonnees()` (admin) et au chargement de l'espace élève, merger les entrées localStorage avec les données DB pour survivre aux rechargements automatiques même si le sync DB échoue.
- **`adminData.absencesJour`** : chargé dans `tevGetAdminData()` depuis `absences_jour`, mergé avec localStorage `tev_absences_jour` dans `chargerDonnees()`. Utilisé dans le Pointage de l'onglet Essai Tango.
- **`eleveData.absencesJour`** : chargé au login élève depuis localStorage `tev_abs_<email>`, puis sync DB en arrière-plan. Affiché dans `renderAccueil()` sur la carte "PROCHAIN COURS".
- **`inscriptions_cours` — pas de contrainte UNIQUE sur `email`** : `upsert({onConflict:'email'})` échoue silencieusement car il n'existe aucun index UNIQUE sur cette colonne. Toujours utiliser `insert()` pour les nouvelles entrées et `update().eq('id',...)` pour les modifications. Ne jamais utiliser `upsert({onConflict:'email'})` sur cette table.
- **Race condition INSERT admin vs polling 15s — pattern `_pendingCoursInserts`** : même problème que `_pendingSupprimes` mais pour les nouvelles entrées. Après un INSERT optimiste (local d'abord), stocker `{email → entry}` dans `_pendingCoursInserts`. Dans `chargerDonnees()`, après fusion de `coursTango`, ré-injecter les entrées pendantes si elles sont absentes des données DB. Supprimer la clé après confirmation DB (`.then()` du `Promise.all`). Quand l'email est vide (partenaire sans email), utiliser l'ID local comme clé : `_pendingCoursInserts[pers.email||newId]`.
- **Création d'entrée partenaire — ne pas conditionner sur l'email** : lors d'un transfert essai→cours, la création de la fiche partenaire était gardée par `if(partEmail)`. Or un partenaire peut être connu par son nom (`ess.partenaire`) sans avoir d'email. La garde correcte est `if(ess.partenaire)`. Dans `_creerEntreeEssai` / `_prepareLocal`, si `pers.email` est vide, sauter la recherche `existing` (impossible de matcher sans email) et toujours faire un INSERT avec `email: ''`.
- **`_renderTabSiPasFormulaire()` — garde Essai Tango Pointage** : le polling 15s provoquait un scroll-to-top en re-rendant l'onglet pendant que l'utilisateur scrollait dans le pointage. Ajouter : `if (currentTab === 'essai' && filtreEssai === 'pointage') return;`. Restauration du scroll : utiliser `requestAnimationFrame(function(){ window.scrollTo(0, savedScroll); })` après `innerHTML =` pour attendre le reflow du layout avant de repositionner.
- **`nomCliquable` dans les listes essai — toujours passer `e.tel||''`** : les appels qui passaient `''` comme troisième argument faisaient que le téléphone n'apparaissait pas dans la fiche. Passer `e.tel||''` systématiquement pour toutes les entrées essai.
- **`_renderTabSiPasFormulaire()` — protéger les formulaires inline (publications, etc.)** : pour les formulaires rendus dans un div interne (pas un sous-onglet), vérifier si le div contient du contenu : `if (currentTab === 'publications' && gel('pub-ed') && gel('pub-ed').innerHTML.trim()) return;`. Même logique applicable à tout onglet avec formulaire inline.
- **Listener click redondant — double action** : si `ouvrirPub()` (ou toute fonction d'édition inline) ajoute un listener `click` sur son conteneur, et que ce conteneur est dans `#tab-content` qui a déjà un listener via `bindTabEvents`, le click bulle et l'action s'exécute deux fois. **Règle : ne jamais ajouter de listener click dans une fonction d'édition inline** — `bindTabEvents` gère tout via délégation sur `#tab-content`. Supprimer le listener redondant dans `ouvrirPub`.
- **`.field input { width:100% }` écrase les checkboxes** : la règle CSS globale s'applique à tous les inputs dans `.field`, y compris `input[type=checkbox]`, les rendant pleine largeur et poussant le texte hors du flex container. Toujours ajouter `style="width:auto;padding:0;margin:0;flex-shrink:0;"` sur chaque checkbox dans un `.field`. Pattern utilisé dans VP, DI et discussions.
- **Publications — colonne `donnees` JSONB** : la table `publications` ne stockait que `titre, contenu, publiee`. Tous les autres champs (image, cat, extrait, vidéo, dates, cours) sont stockés dans une colonne `donnees JSONB` ajoutée via `ALTER TABLE publications ADD COLUMN IF NOT EXISTS donnees JSONB NOT NULL DEFAULT '{}';`. Dans `tevGetAdminData`, chaque publication est enrichie via `Object.assign({}, p.donnees || {}, p)` pour remonter les champs au niveau racine. `tevSauvegarderPublication` reçoit et persiste tous les champs.
- **Erreurs Supabase silencieuses dans les fonctions async** : le client Supabase JS v2 retourne `{ data, error }` sans jamais lever d'exception. Si on destructure seulement `{ data }` en ignorant `error`, un INSERT/UPDATE raté laisse croire à un succès — le `.then()` s'exécute, le formulaire se ferme, `chargerDonnees()` recharge depuis la DB vide. **Toujours** vérifier : `const { data, error } = await ...; if (error) throw new Error(error.message || error.code || JSON.stringify(error));`
- **`await` dans une fonction non-`async` = SyntaxError silencieux** : un `await` dans une fonction non déclarée `async` provoque une SyntaxError au parse-time — tout le bloc `<script>` échoue à s'exécuter silencieusement (aucune erreur visible dans la console sur certains navigateurs). Symptômes : fonctions d'initialisation (`_initCoursYoga()`, `init()`) ne s'exécutent jamais, interface vide. **Toujours** déclarer `async function soumettre()` (et toute fonction qui contient `await`) avec le mot-clé `async`.
- **Changement d'email admin → sync Supabase Auth** : `sauverContact()` met à jour toutes les tables DB PUIS appelle `PATCH /api/admin/update-auth-email` (non-bloquant, dans un `.then()` séparé). Le worker utilise `env.SUPABASE_SERVICE_KEY` (secret Cloudflare) pour : (1) `GET /auth/v1/admin/users?email=oldEmail` → trouver l'userId Auth, (2) `PUT /auth/v1/admin/users/:id` avec `{email:newEmail, email_confirm:true}`. Retourne `{ok:true,skipped:true,reason:'no_auth_account'}` si l'élève n'a jamais activé son espace (pas de compte Auth) — sans erreur. **Sans ce fix** : les DB sont mises à jour mais le magic link continue d'arriver à l'ancien email → l'élève perd l'accès.
- **`photo_url` dans `eleves`** : champ `TEXT` activé via `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS photo_url TEXT;` (exécuté le 2026-05-07). Photo uploadée depuis admin (fiche ✏️ → upload Cloudinary) ET depuis espace élève (section "Mes coordonnées" → `renderAccueil()`). Sync via `tevUpdateElevePhoto(email, url)` (tev-supabase.js). Aucun code supplémentaire requis — la colonne existait dans le code, seule la DB manquait.
- **RLS `inscriptions_cours` — UPDATE réservé aux admins** : `CREATE POLICY "ins_cours_update" ON inscriptions_cours FOR UPDATE USING (is_admin())`. Les élèves ne peuvent PAS mettre à jour leurs propres lignes — Supabase retourne succès avec 0 lignes affectées (pas d'erreur). **Conséquence** : toute mise à jour côté élève doit passer par `eleves` (UPDATE autorisé : `USING (email = auth.email() OR is_admin())`). Dans `tevGetAdminData()`, priorité `elv.tel || ic.tel` (pas `ic.tel || elv.tel`) pour que les changements élève soient visibles dans l'admin. Même logique à appliquer à tout nouveau champ modifiable depuis l'espace élève.
- **Cartes 10 — suppression** : `confirmerSupprimerCarte(email, nom)` fait UPDATE `inscriptions_cours SET statut='supprimé'` (filtre `type='carte10'` et `statut='inscrit'`) ET UPDATE `eleves SET carte_statut='supprimé'`. `_buildCartesData()` filtre `c.statut!=='supprimé'` pour exclure les cartes supprimées de la vue active. L'onglet "Supprimées" (`renderCartesSupprimees()`) affiche les cartes archivées dédupliquées par email. Le marqueur `_fromCoursTango: true/false` distingue la source de l'ID (inscriptions_cours vs eleves) dans les objets carte.
- **`confirmerSupprimerEleve()` supprime aussi les cartes** : en plus du `UPDATE inscriptions_cours SET statut='supprimé'` sur l'ID de l'inscription, la suppression d'un élève tango fait aussi UPDATE toutes ses entrées `inscriptions_cours type='carte10' statut='inscrit'` ET `eleves.carte_statut='supprimé'` en parallèle via `Promise.all`. **Important** : utiliser `String(x.id)===String(id)` pour trouver l'entrée (bigint Supabase vs string HTML).
- **Cartes 10 — élèves supprimés d'Élèves Tango** : un élève supprimé d'Élèves Tango doit disparaître de Cartes 10 → Pointage et Détails, et apparaître dans Cartes 10 → Supprimées. Implémenté via deux mécanismes : (1) `_buildCartesData()` construit `_emailsSupprimés` (emails dont toutes les `inscriptions_cours` de la saison sont `statut='supprimé'`) et les exclut des cartes actives ; (2) `renderCartesSupprimees()` parcourt `_tgStatus` pour ajouter ces mêmes emails dans la liste supprimées si la personne avait des données de carte (`utilises>0 || restants>0 || datePremierCours`).
- **`_renderTabSiPasFormulaire()` — garde Essai Yoga** : le polling 15s ferme les accordéons de la vue « essai yoga ». Ajouter : `if (currentTab === 'yoga' && sousOngletYoga === 'essai') return;`
- **Bouton "Inscrire" depuis Essai Yoga** : naviguer vers le sous-onglet `inscrire-eleve` (pas ouvrir un modal). Après `renderTab()`, pré-remplir via `setTimeout(function(){ gel('diy-prenom').value = ...; }, 0)` — le setTimeout est nécessaire car le DOM de l'onglet n'est pas encore disponible au moment de l'appel.
- **Formulaires publics — compte à rebours après succès** : après soumission réussie d'un formulaire essai, afficher un écran de succès avec un compte à rebours automatique (ex: 8s) qui appelle `restart()`. Toujours inclure un bouton "← Retour" manuel en plus du compte à rebours automatique. Pattern : `setInterval` avec compteur décrémenté, `setTimeout` final qui appelle `restart()`, bouton onclick=`restart()`.
- **`_initCoursYoga()` — garde dates futures** : localStorage `tev_cours_dates.yoga` peut contenir des dates passées. Toujours filtrer `d >= todayISO()` avant d'utiliser les dates. Fallback secondaire : `tev_dates_yoga_<saison>`. Si `localStorage.tev_cours_dates` change de clé (ex: `tev_dates_yoga_*`), détecter les deux dans le listener `storage` pour recharger le dropdown.
- **Section "Ma carte de 10 cours" — race condition forfait vs carte10 (index.html)** : `tevGetEleve()` ne retourne pas de champ `type` sur l'objet `carte` — le type ('forfait' ou 'carte10') est déterminé UNIQUEMENT de façon asynchrone depuis `inscriptions_cours`. Règles impératives :
  1. `showScreen('screen-dashboard')` doit être appelé EXCLUSIVEMENT dans le callback `inscriptions_cours` (et son `.catch()`), jamais de façon synchrone avant — sinon l'écran est visible avec `carte.type = undefined`.
  2. Condition dans `renderAccueil()` : `carte.type === 'carte10'` (stricte, pas `!== 'forfait'`) — la section ne s'affiche que si le type est explicitement connu.
  3. Détection du type dans le callback : `hasCarte10 = res.data.some(i => i.type === 'carte10')` puis `carte.type = hasCarte10 ? 'carte10' : 'forfait'` — ne jamais dépendre de `hasForfait` seul (le type en DB peut être null/vide, rendant `hasForfait` faussement false).
  4. Fallback si `res.data` est vide ou si le `.catch()` se déclenche : déduire depuis `eleves` — `coursUtilises > 0` ou `statut === 'Active'/'Nouvelle carte'` → carte10, sinon → forfait.
  5. Les callbacks secondaires (absences_jour, stages) appellent `renderAccueil()` si `currentTab === 'accueil'` — ce n'est pas un problème car ils s'exécutent toujours APRÈS `showScreen` (qui lui-même suit inscriptions_cours), donc `carte.type` est déjà positionné.
- **`renderSorano()` dans index.html — tarifs depuis Supabase** : lit `parametres` table, clé `tev_params_adhesions_<sai>`, champ `valeur.sorano` (`{ m16_vinc, m16_ext, p16_vinc, p16_ext }`). Fallback DEFAUT = `{ m16_vinc:26, m16_ext:35, p16_vinc:36, p16_ext:45 }`. ⚠️ L'admin sauvegarde ces tarifs depuis Paramètres → Adhésion Sorano → cela écrit dans le localStorage admin ET dans Supabase (table `parametres`). Si la clé Supabase est absente (admin n'a jamais sauvegardé sur cet appareil), l'espace élève affiche les valeurs par défaut.
- **Sorano admin — `renderSorano()` (admin.html)** : construit `reg[email]=bool` depuis `adminData.coursTango` (filtre `ville==='vincennes'`) ET `adminData.coursYoga` — jamais depuis `adminData.sorano` (n'existe que dans DEMO_DATA). Logique : si `paiement_sorano===true` dans tango vincennes → `reg[email]=true`; yoga ne peut qu'écraser si `reg[email]===undefined` → tango prime pour les élèves inscrits aux deux.
- **Sorano admin — `soranoAction()` + pattern `_pendingSoranoPayé`** : problème classique polling 15s. `chargerDonnees()` recharge `coursTango` et `coursYoga` depuis la DB toutes les 15s et écrase l'état optimiste. Solution identique à `_pendingSupprimes`/`_pendingCoursInserts` : `_pendingSoranoPayé[email]=bool` est positionné au clic et re-appliqué dans chaque `chargerDonnees()` sur `coursTango` (vincennes) et `coursYoga`. Le pending est levé seulement quand au moins un UPDATE DB réussit sans erreur (Supabase retourne `{error:null}`). Si les deux échouent (colonne inexistante), le pending reste actif indéfiniment → l'état persiste jusqu'au rechargement de page. **Ne jamais supprimer le pending sur erreur DB.**
- **Sorano — espace élève accueil** : dans `renderAccueil()`, si `eleveData.hasVincennes===true` et `eleveData.soranoPayé===true` → afficher une ligne discrète "🏛 Adhésion Sorano réglée ✓". Si non réglé → afficher le bloc complet avec bouton "Régler →" vers l'onglet Sorano. `eleveData.soranoPayé` est calculé dans le callback `inscriptions_cours` : `res.data.some(i => ville==='vincennes' && i.paiement_sorano===true)`. `eleveData.hasVincennes` : `res.data.some(i => ville==='vincennes')`.

## Architecture temps réel — admin.html

### Flux de connexion réel vs démo
- **Mode démo** : `demarrerDemoApp()` → `demarrerApp()` → `demarrerRealtime()` + `demarrerPollEssais()`
- **Connexion réelle** : `TEV.onAuthChange` (magic link / OTP) → `demarrerRealtime()` + `demarrerPollEssais()` appelés directement dans le callback
- ⚠️ **Ne jamais mettre `demarrerRealtime()` uniquement dans `demarrerApp()`** — `demarrerApp()` n'est appelé que pour la démo. Le vrai flux passe par `TEV.onAuthChange`.

### Polling 15s (mécanisme principal)
- `demarrerRealtime()` démarre un `setInterval(chargerDonnees, 15000)` — garantit la mise à jour toutes les 15s quelle que soit la source (autre appareil, Wix iframe, Supabase Realtime)
- `demarrerRealtime()` ne démarre qu'une fois (garde `_pollTimer` pour éviter les doublons)
- Supabase Realtime (`postgres_changes`) est un bonus en plus du polling — peut être bloqué par RLS

### Service Worker — règle importante
- Le SW (`sw.js`) ne doit intercepter **que les ressources same-origin** (`app.tangoetvous.fr`)
- Ne jamais intercepter les ressources cross-origin (Supabase, jsDelivr, Firebase, Google) — `caches.match()` retourne `undefined` pour les CDN non cachés, ce qui cause `FetchEvent.respondWith: null response`
- Pattern correct dans `sw.js` : `if (!e.request.url.startsWith(self.location.origin)) return;`

## Boutons de pointage ✓/✗ — pattern CSS et JS

### Problème initial
Les boutons `btn-pres.on` et `btn-abs.on` utilisaient `--ok-bg: #0a1200` et `--err-bg: #140000` — couleurs quasi-noires, invisibles sur fond sombre. De plus, `q.catch(function(){})` sur le builder Supabase jetait une `TypeError` (`.catch` non exposé directement) qui faisait crasher `pointerEssai` avant `renderTab()`.

### CSS corrigée (admin.html)
```css
.btn-pres.on  { background:#2e7d32; color:#fff; border-color:#2e7d32; }  /* vert vif */
.btn-pres.off { opacity:.3; pointer-events:none; }                         /* grisé si opposé actif */
.btn-abs.on   { background:#c62828; color:#fff; border-color:#c62828; }   /* rouge vif */
.btn-abs.off  { opacity:.3; pointer-events:none; }
```

### Pattern JS `pointerEssai` — règles
- Écrire **uniquement** `presence_declaree` (pas `presence_confirmee`, réservé à la confirmation email élève)
- Utiliser `Promise.resolve(q).catch(function(){})` — jamais `q.catch()` directement sur le builder Supabase
- Manipulation DOM directe avant `renderTab()` : `presBtn.classList.add('on'); absBtn.classList.add('off');`
- `renderTab()` appelé ensuite pour mettre à jour les compteurs ✓✗? dans l'en-tête de date
- Classer `.off` sur le bouton opposé + rendre `.off` dans `_mkEssaiPtCard` au re-render

### Survie au polling 15s
- `_mapEssai` dans `tev-supabase.js` mappe `presence_declaree → present`
- `chargerDonnees` preserve `e.present` depuis `presence_declaree` DB (ou depuis l'ancien objet local si colonne NULL)
- La garde `if (currentTab === 'essai' && filtreEssai === 'pointage') return;` dans `_renderTabSiPasFormulaire` protège le DOM du polling automatique — mais l'état local dans `adminData.essai` est quand même restauré au prochain `renderTab()` déclenché par l'utilisateur

### Règle universelle — Supabase builder + `.catch()`
**Ne jamais** écrire `q.catch(function(){})` directement sur un builder Supabase. Toujours : `Promise.resolve(q).catch(function(){})`. Le builder est thenable mais n'expose pas `.catch()` comme méthode directe dans toutes les versions — la TypeError fait crasher silencieusement la fonction appelante.

## Règles obligatoires — formulaires publics (à appliquer à tout nouveau formulaire)

### 1. Vérification d'erreur sur les inserts Supabase
Supabase JS v2 ne lève pas d'exception par défaut — toujours capturer et relancer :
```javascript
const { error: insErr } = await TEV.client.from('ma_table').insert({...});
if (insErr) throw new Error(insErr.message || insErr.code || JSON.stringify(insErr));
```
Sans ça, un insert raté affiche une fausse confirmation et rien n'est sauvegardé.

### 2. Notification admin en temps réel (BroadcastChannel toujours en premier)
Depuis une iframe Wix, `postMessage` vers le parent échoue (cross-origin).
`BroadcastChannel` fonctionne cross-tab sur `app.tangoetvous.fr` même depuis une iframe.
**Pattern obligatoire** (BroadcastChannel + localStorage + postMessage, sans condition isIframe) :
```javascript
const msg = { type: 'monTypeInscription', data: payload };
try { if(window.BroadcastChannel){ const bc=new BroadcastChannel('tev_inscriptions'); bc.postMessage(msg); bc.close(); } } catch(e){}
try {
  const pending = JSON.parse(localStorage.getItem('tev_pending_inscriptions')||'[]');
  pending.push(msg); localStorage.setItem('tev_pending_inscriptions', JSON.stringify(pending));
} catch(e){}
try { window.parent.postMessage(msg, window.location.origin); } catch(e){}
```

### 3. Colonnes Supabase — toujours vérifier le schéma avant d'insérer
Un insert avec des colonnes inexistantes échoue silencieusement (sans vérif d'erreur).
Consulter `supabase/schema.sql` et ajouter les colonnes manquantes via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` avant de coder l'insert.

### 4. Valeur `null` dans les colonnes NOT NULL
Si une colonne a une contrainte NOT NULL, utiliser `{}` (objet vide) plutôt que `null` pour les champs JSONB optionnels.
- **Cache JS** : `<script src="js/tev-supabase.js?v=2">` — incrémenter v= si le cache pose problème

## Données saison 2025-2026
- **153 élèves tango** importés via `supabase/import_eleves_2025_2026.sql`
- **21 élèves yoga** importés via `supabase/import_cours_yoga.sql`
- **Paiements** mis à jour via `supabase/update_paiements.sql`
- Florence CASTAGNOS : inscrite paris/debutant ET paris/intermediaire
- Vlad VASILIU : inscrit paris/intermediaire ET vincennes/intermediaire
- Myriam BLOCH : yoga forfait (hatha + yin), 505€
- Couples avec email partagé : BUTASH/NACAK, FIGUEREDO/GOSSELIN, GODEFROY/SABRIER, SCHALCHLI×2, VORMS×2, KARADJOV/KARADJOVA
- **Règle partenaire** : si le champ `partenaire` contient le nom de la personne elle-même, l'ignorer (erreur de saisie) — traiter comme solo
- **Yoga** : pas de notion de partenaire, cours individuels uniquement

## Corrections partenaires — saison 2025-2026 (session du 2026-04-30)

### Partenaires manquants ajoutés (INSERT inscriptions_cours uniquement — eleves a une contrainte UNIQUE email)
| Personne ajoutée | Email partagé | Partenaire | Cours | Type |
|---|---|---|---|---|
| Anaïs GOSSELIN | salvaje91@gmail.com | Hugo FIGUEREDO | Débutant Paris | carte10 |
| Irmak NACAK | hbutash@gmail.com | Henry BUTASH | Débutant Paris | carte10 |
| Bruno GODEFROY | p.sabrier@gmail.com | Pauline SABRIER | Débutant Paris | carte10 |
| Emmanuel PERES DE HAUTECLOCQUE | paminaetemmanuel@gmail.com | Pamina PERES DE HAUTECLCOCQUE | Débutant Paris | carte10 |
| Clothilde SCHALCHLI | locvinchau@gmail.com | Ambroise SCHALCHLI | Débutant Paris | forfait |
| Bertrand VORMS | lesvorms@noos.fr | Sandrine VORMS | Intermédiaire Paris | forfait |
| Maria KARADJOVA | maria.karadjova@dentons.com | Nikolay KARADJOV | Intermédiaire Vincennes | forfait |

### Corrections champ partenaire (UPDATE Supabase)
| Élève | Avant | Après | Motif |
|---|---|---|---|
| Pauline SABRIER | 'Pauline Sabrier' | 'Bruno GODEFROY' | Auto-référence (erreur CSV) |
| Raphaël LOUVET | 'Raphael Louvet' | '' | Auto-référence, solo |
| Alban GÉRÔME | 'Sandrine Pitarque' | '' | Partenaire inconnue, solo |
| Aline CUNIN | 'Nicolas Targa' | '' | Partenaire parti |
| Felipe DIAZ | 'Angèle Diaz' | 'Angèle LETICHE' | Mauvais nom (nom de jeune fille ?) |
| Alexandre BEZIN | '' | 'Alice MÉRIAUX' | Champ vide dans import |
| Olympe PIRO | 'gil GALLIOT' | 'Gil GALLIOT LAPOULE' | Double nom tronqué |
| Aïcha FOFANA | 'Guarino Gautier' | 'Gautier GUARINO' | Prénom/nom inversés |
| Arnaud POHIN | 'Theodora PRASIADOU' | 'Theodora PRASADOU' | Faute d'orthographe |
| Sophie VOUTEAU | prenom='Vouteau' nom='VOUTEAU SOPHIE' | prenom='Sophie' nom='VOUTEAU' | Import mal formaté |
| Vlad VASILIU (vincennes) | 'Annette Gnourdo' | 'Annette GOURDON' | Faute de frappe |

### Améliorations code `_groupCouples` (admin.html)
- **Préfixe double-nom** : 'GALLIOT' matche 'GALLIOT LAPOULE' (startsWith)
- **Normalisation accents** : `_normNom()` via NFD — 'François'='FRANCOIS', 'Frédéric'='Frederic', etc.
- Ces deux améliorations évitent de futurs encadrés rouges manquants

### Nouvelle fonctionnalité
- Bouton 🔗 sur chaque élève sans partenaire dans Élèves Tango → modal de liaison vers une autre personne sans partenaire du même cours → sauvegarde dans `inscriptions_cours` ET `eleves` dans les deux sens

## Données manquantes / à compléter manuellement
- Svetlana Castro, Alban Gérôme : paiement "Autres" → vide dans DB, à renseigner via ✏️
- Paul May, Antoine Konopka, Boris Lefebvre, Sophie Madignier, Régine Cussaguet, Violaine Chavanne, Gérard Cissey : montant=0 (non renseigné dans CSV)

## Intégration Wix — formulaires en iframe
- Formulaires publics intégrables en iframe sur `www.tangoetvous.com` (Wix)
- `admin.html` et `index.html` : jamais intégrables (`frame-ancestors 'none'`)
- Chaque formulaire envoie sa hauteur via `postMessage({type:'tevHeight',height:h},'*')` (MutationObserver + resize + load)
- Code Wix (HTML Code element) : charge `wix.js` SDK + iframe + listener qui appelle `window.Wix.setHeight(h)`
- Turnstile : `challenges.cloudflare.com` ajouté au CSP (`script-src` + `frame-src`)
- **Pages de test Wix** : créer des pages cachées (non référencées, hors menu) pour tester avant mise en production
- URLs des formulaires déployés :
  - `https://app.tangoetvous.fr/inscription-cours.html`
  - `https://app.tangoetvous.fr/cours-essai.html`
  - `https://app.tangoetvous.fr/essai-yoga.html`
  - `https://app.tangoetvous.fr/stages-pwa.html`
  - `https://app.tangoetvous.fr/cours-particuliers.html`

## RGPD
- Page `confidentialite.html` créée (responsable, données, finalités, sous-traitants, droits, CNIL)
- Lien "politique de confidentialité" ajouté sous le bouton de soumission des 5 formulaires publics
- **Sous-traitants** : Supabase (DB, région à vérifier), Brevo (emails, France), Cloudflare (hébergement + Turnstile, USA), Cloudinary (médias, USA), Firebase/Google (push, USA)
- **Région Supabase** : à vérifier dans Settings → Database → Connection string (host contient le code région)
- Droits des personnes : email `tangoetvous@gmail.com`, délai 1 mois
- Durée de conservation : durée relation + 1 an

## À faire / en suspens
> 📁 **Voir [`HISTORIQUE.md`](./HISTORIQUE.md)** pour les tâches accomplies, considérées résolues ou reportées (déplacées le 2026-05-27).

- [x] **Cartes cross-saison — inscription/suppression n'affectent qu'une saison** — ✅ FAIT ET VÉRIFIÉ EN RÉEL (2026-07-08, DI + VP + suppression + suppression définitive testés sur la vraie base avec élève test Brad Pitt). Une personne peut avoir une carte en saison N (cours pris/expirée) ET une nouvelle carte en N+1 sans que l'une n'affecte l'autre. **3 fixes** (`admin.html`, tests Playwright groupe M) : (1) **Inscription directe** `soumettreInscriptionDirecte` — garde `_elvAutreSaison` : si la personne a déjà une carte pour une AUTRE saison, ne pas écraser sa ligne `eleves` (la carte de la nouvelle saison est portée par `inscriptions_cours`, reconstruite par `_buildCartesData`). Push local scopé par saison. (2) **Suppression** `confirmerSupprimerEleve` — cascade carte filtrée par `_saiSup` (local + DB `.eq('saison')`), `eleves.carte_statut='supprimé'` seulement si carte portée par la ligne eleves (`!_fromCoursTango`). `retablirEleve` symétrique. (3) **Suppression définitive** `supprimerDefinitivementEleve` — `delete().eq('email').eq('saison')`, ligne `eleves` supprimée seulement s'il ne reste aucune autre saison (sinon champs carte vidés si c'était la saison de la ligne). **VP** (`soumettreValiderPaiement`) : pas de bug d'écrasement (upsert `ignoreDuplicates:true` ne touche pas la ligne existante) ; push local scopé par saison pour cohérence. ⚠️ Modèle sous-jacent : `eleves` = UNE carte par email → la carte "courante" est sur eleves, les autres saisons reconstruites depuis `inscriptions_cours`.

- [ ] **Intégrer le formulaire de contact sur Wix** (2026-07-13) : coller l'iframe `https://app.tangoetvous.fr/contact.html` dans une page Wix (Intégrer → HTML → Code), avec le script d'auto-hauteur (`tevHeight` → `iframe.style.height` + `Wix.setHeight`). La table `messages_contact` est déjà créée (SQL exécuté), le worker + l'onglet admin 📨 Contact sont déployés. **Test à faire par l'admin plus tard** : s'envoyer un message → doit arriver dans admin → Contact + email/push + email de confirmation à l'expéditeur. Vérifier aussi le n° de tél du header (`+33 6 61 72 79 98`, issu de la capture) et que le téléphone est bien exigé.
- [ ] **Guide visuel « Inscription AssoConnect pas à pas »** (2026-07-13) : l'utilisateur prend des photos/captures des différentes étapes de l'inscription sur AssoConnect (dont l'étape du pourboire à mettre à **0 €**). Objectif : créer une **page consultable** (guide illustré, flèches/annotations) que les élèves ouvrent pour se repérer. À décider quand les photos seront prêtes : (a) page HTML hébergée (`app.tangoetvous.fr/guide-inscription.html` ou similaire) liée depuis les emails I01/I02/T1-val (sous l'encadré pourboire), et/ou (b) intégrée dans l'espace élève / le site Wix. Images à embarquer en base64 ou dossier assets. Lié au chantier « faire baisser le paiement du pourboire ».
- [ ] **Tester le téléchargement natif iOS d'une vidéo** (2026-07-10, à faire sur iPhone/iPad) : Vidéos → À valider ou Biblio → ⬇ sur une vidéo → attendre le % → taper **« 📥 Enregistrer la vidéo »** → vérifier que la **feuille de partage iOS native** s'ouvre bien avec « Enregistrer dans Fichiers » et « Enregistrer la vidéo » (Photos). Vérifier aussi que l'annulation ferme proprement le bandeau, et que sur ordinateur le téléchargement direct reste inchangé. (Code déployé, testé Playwright O6, mais le comportement `navigator.share` réel n'est vérifiable que sur un vrai appareil iOS.)

- [ ] **Vérif manuelle du fix sécurité #1 en prod** (audit 2026-07-08) : confirmer que `/api/eleve/message-prive` rejette bien un faux token (le déploiement `4f28cd2` a réussi, correctif sûr par construction, mais non vérifiable depuis le sandbox Claude qui ne joint pas `app.tangoetvous.fr` directement). Depuis la console navigateur sur `app.tangoetvous.fr` :
  ```js
  fetch('/api/eleve/message-prive', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer faux_token'}, body: JSON.stringify({de:'a@b.fr', a:'c@d.fr'})}).then(r => console.log('code:', r.status));
  ```
  → doit afficher **`code: 401`** (avant le fix : 200). Puis vérifier que la messagerie Annuaire élève→élève fonctionne toujours normalement (le vrai client envoie un vrai token dont l'email correspond à `de`).

- [ ] **Correctif sécurité C1 — trigger anti-triche carte élève** (audit 2026-07-08 2ᵉ passe, à faire DEVANT UN ORDI avec test élève) : bloque les 2 abus financiers directs du finding C1 (`eleves_update` sans restriction de colonne, `schema.sql:75`) sans casser pointage/renouvellement élève ni admin. **Étape 1 — vérif préalable OBLIGATOIRE** : confirmer par grep dans worker.js qu'aucun flux admin n'écrit `carte_paye`/`statut_eleve` via la **service key** (`SUPABASE_SERVICE_KEY`) — si c'est le cas, `auth.email()` est null → `is_admin()=false` → le trigger le bloquerait. D'après l'analyse, l'admin agit via son JWT (pas la service key) pour les cartes, mais à confirmer avant exécution. **Étape 2 — SQL à exécuter dans Supabase SQL Editor** (relu, sûr sous réserve étape 1) :
  ```sql
  CREATE OR REPLACE FUNCTION public.protect_eleve_carte_fields()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF is_admin() THEN RETURN NEW; END IF;                    -- admin : tout permis
    IF NEW.carte_paye = true AND OLD.carte_paye IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'carte_paye : admin uniquement';        -- élève ne peut pas marquer sa carte payée
    END IF;
    IF NEW.statut_eleve IS DISTINCT FROM OLD.statut_eleve THEN
      RAISE EXCEPTION 'statut_eleve : admin uniquement';       -- élève ne peut pas réactiver son compte
    END IF;
    RETURN NEW;
  END;
  $$;
  DROP TRIGGER IF EXISTS trg_protect_eleve_carte ON public.eleves;
  CREATE TRIGGER trg_protect_eleve_carte
    BEFORE UPDATE ON public.eleves
    FOR EACH ROW EXECUTE FUNCTION public.protect_eleve_carte_fields();
  ```
  **Étape 3 — test immédiat après exécution** : avec un élève test, vérifier qu'il peut toujours (a) pointer un cours (décrémente restants), (b) « renouveler sans payer » (carte_paye reste false). Et côté admin : marquer une carte payée + activer/désactiver un élève fonctionnent toujours. **Ce que ça NE ferme PAS** : l'élève peut encore gonfler `carte_restants` (cours gratuits sans marquer payé) — blindage complet = déplacer la mutation carte vers une fonction SECURITY DEFINER (refonte client+SQL, phase 2, risque moyen). Le trigger ferme « je marque ma carte payée » + « je réactive mon compte » = les 2 abus les plus nets. Versionner ce SQL dans `supabase/` une fois validé.

- [ ] **Correctif sécurité C2 — pointer_cours_qr email arbitraire** (audit 2026-07-08 2ᵉ passe) : un anonyme avec la clé publique vide la carte de n'importe quel élève (`p_email` arbitraire, GRANT anon, pas de check). **⚠️ Pas de fix SQL simple** : le flux QR (`pointer.html`) + remplaçant (`remplacant.html`) sont ANONYMES → `p_email = auth.email()` casserait tout (`auth.email()` = null). Options : (A) **QR signé** — l'admin génère un QR portant un token HMAC(email+date), la RPC le vérifie (touche génération QR admin.html + pointer.html + la RPC `pointer_cours_qr`) ; (B) **risque accepté + rate-limiting Cloudflare** (vandalisme sans gain, exige de connaître les emails — défendable petite école). À décider à froid.

- [ ] **Correctifs sécurité M1–M6 — RLS permissives (audit 2026-07-08 2ᵉ passe)** : restreindre SELECT/UPDATE/DELETE (garder INSERT public) sur `cours_yoga` (PII tel/montants), `notifications_eleve`, `fcm_tokens`, `milonga_presences` (`schema.sql:395`), `absences_jour`, et masquer l'email dans `get_remplacant_eleves`. Pattern : `USING (email = auth.email() OR is_admin())`. Priorité RGPD : M1 (yoga), M2 (get_remplacant_eleves emails), M3 (notifications_eleve). ⚠️ Vérifier d'abord la définition RÉELLE déployée (SQL non versionné) avant de générer les correctifs. C3 (`confirmer_annuler_essai` secret en paramètre) + routes `/api/notify/*` sans auth = risque accepté ou phase ultérieure.

- [x] **Cartes N cours — plan validé le 2026-07-02, en 3 phases par risque croissant** — ✅ TERMINÉ ET VALIDÉ (2026-07-07) : les 3 phases sont en prod, testées par l'admin sur tous les cas (carte simple, mixte forfait+carte, carte commune 2 cours, renouvellement personnalisé, complément forfait avec montant, non-régression vrais élèves). Voir session 2026-07-07 en tête de fichier. Paramètres remis aux défauts 10 cours / 3 mois, élèves tests nettoyés en SQL. Détail des phases ci-dessous (historique) :
  - **✅ Phase 1 FAITE (2026-07-06)** : paramètre `tev_carte_nb_cours` (Paramètres → Fonctionnalités, défaut 10, miroir localStorage auto via chargerParamsRemote côté admin + fetch login côté élève). Taille affichée partout = `utilises + restants` (invariant, fallback 10) via `_carteTaille(c)`/`_carteNbAdmin()` (admin), `tailleCarte` (index), `_tevCarteNbCours()` (tev-supabase v=7). Renouvellements/créations lisent le paramètre ; seuil d'overflow = taille de l'ANCIENNE carte ; seuils "épuisée" basés sur `restants<=0` (plus jamais `>=10`). Emails worker : `_tailleC = utilises+restants||10` dans C1/C2/C-pay/CP-E/carte-pointée/carte-épuisée ; libellés "carte de 10 cours" → dynamiques ou génériques. Payloads admin corrigés (carte-epuisee envoie les vrais compteurs, carte-renouvellement envoie restants).
    - ⚠️ **BUG CORRIGÉ (2026-07-13)** : dans `handleCronCartePonteeJ1` (CP-E, cron « email élève pointé lendemain matin »), `_tailleC` était **utilisé dans le template email mais jamais déclaré** → `ReferenceError` → exception non gérée → Cloudflare **1101 / HTTP 500**. Le cron sort avant la boucle si `pending.length===0`, donc il n'a échoué qu'à partir du **8 juillet** (1ers pointages à notifier). Fix : ajout de `const _tailleC = ((Number(utilises)||0)+(Number(restants)||0))||10;` dans la boucle par email (après `expiration`). **Règle** : tout template email carte qui interpole `${_tailleC}` doit déclarer cette const dans son scope — les 6 autres handlers l'avaient, seul CP-E l'avait oublié.
  - **Phase 1 (risque faible)** : paramètre global `carte_nb_cours` (défaut 10) dans Paramètres + affichages dynamiques partout (taille carte = `utilises + restants`, invariant du modèle — remplacer les "10" cosmétiques en dur : espace élève, admin Cartes 10, emails C1/C2/CX/CP-E, renouvellement qui reset `restants=10` en dur à 3 endroits).
  - **✅ Phases 2+3 FAITES (2026-07-06)** : colonne `eleves.carte_duree_mois` (SQL exécuté). Fenêtre A paramétrable : `calcExpiration(date, ville, dureeMois)` (admin.html) et `_calcExpirationSb(date, ville, dureeMois)` (tev-supabase v=8) — défaut 3, validé 1-24, B et C inchangés ; les ~12 appelants admin passent `c.dureeMois` (carte courante) ou `_carteDureeAdmin()` (nouvelle carte) ; segments historiques restent à 3. Paramètres → Fonctionnalités : défauts « Cours » + « Validité (mois) » (`tev_carte_duree_mois`, miroir localStorage + fetch login élève). Champs par élève : Inscription directe (`di-carte-nb/duree`) et Valider Paiement (`vp-carte-nb/duree`) via `_carteFormVals(prefix)` → créations locales + upserts (`carte_duree_mois`). Modal Renouveler : champs Cours/Validité préremplis + bouton « 🔄 Passer en complément forfait annuel » (confirm → `passerEnForfait`, solde perdu, lien AssoConnect manuel) ; `tevRenouvelerCarte({eleveId,paye,nbCours,dureeMois})`. Renouvellements élève/auto = défauts params.
  - **Phase 2 (risque moyen)** : champ "nombre de cours" dans les modals Inscription directe + Valider Paiement, prérempli avec le paramètre. Au renouvellement : pouvoir changer le nb de cours, la durée, ou passer en complément forfait annuel (la fonction `passerEnForfait` existe déjà — l'intégrer comme option du modal Renouveler). **✅ Décision métier (2026-07-05)** : le solde de cours restants disparaît simplement — l'élève paie un complément pour passer au forfait annuel (ex : 170€ carte + 10€ adhésion déjà payés, complément 325€ pour atteindre les 495€ du forfait) et profite ensuite de tous les cours sans compter. Lien de paiement AssoConnect envoyé manuellement par l'admin..
  - **Phase 3 (risque à isoler)** : durée de validité paramétrable — ne change que la fenêtre A de l'algorithme A+B+C (`fin = datePremierCours + N mois`), B et C inchangés. ⚠️ À modifier À L'IDENTIQUE dans `calcExpiration` (admin.html) ET `_calcExpirationSb` (tev-supabase.js), tester les cas vacances/été. Idéalement après les tests Playwright (groupe A).
- [x] **Cartes — compteur `carte_num` + historique consultable** — ✅ FAIT (2026-07-06) : colonne `eleves.carte_num` (SQL : `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS carte_num INTEGER;`), incrément **non-bloquant** `_tevIncrCarteNum()` (tev-supabase) appelé par tevRenouvelerCarte (couvre renouvellement élève ET admin) et par le renouvellement auto overflow de tevPointerCours ; exposé via tevGetEleve (`carte.numero`) et mapping cartes admin (`carteNum`). Affichage : titre carte élève + mini-jauge accueil (« — 2ᵉ de la saison » si >1), fiche Détails admin (« Carte n°2 de la saison · X/N cours »). Historique : existait DÉJÀ des deux côtés (élève « Cartes précédentes », admin bouton 🕐) — points des segments admin passés de 10 fixe à Math.max(taille segment,10). Spec d'origine : (1) compteur `carte_num` (1ère/2ème/3ème… carte de la saison) incrémenté à CHAQUE chemin de renouvellement (élève "sans payer", admin modal Renouveler) — clé qui permet de découper l'historique par carte ; (2) affichage du numéro de carte dans l'accueil élève et dans Cartes 10 admin ; (3) historique des cours pointés par carte (données déjà présentes : table `presences`, jamais effacée au renouvellement ; l'élève les reçoit déjà via `tevGetEleve`) — admin : bouton "📜 Historique" sur chaque fiche de Cartes 10 → Détails ; élève : lien "Voir l'historique de mes cours" dans la section carte de l'accueil. Lecture seule → risque très faible. Pour les cartes déjà renouvelées : initialisation manuelle ou reconstruction approximative (total présences ÷ 10).
- [x] **Accueil élève — un encadré par cours de la saison** — ✅ FAIT (2026-07-07, testé et validé) : helper `_tevCoursActifs()` (index.html — saison courante, hors isRenewal, dédoublonné ville+niveau, trié Paris d'abord) partagé entre accueil et onglet Forfait/Carte. **Accueil** : hero réduit à « Bonjour X ! » (noms de cours supprimés, ligne yoga conservée) + un encadré par cours (nom, « Les Jeudis · 20h30 »). Cours forfait → badge ✅ ; UN SEUL cours en formule carte → suivi complet de la carte (`_carteTrackingHtml()` : jauge + points + expiration + pastille + boutons pointer/renouveler, logique reprise à l'identique) intégré DANS l'encadré du cours ; carte commune à 2 cours → mention dans chaque encadré + UN encadré carte séparé titré « — commune à vos N cours » (une seule jauge). **Onglet Forfait/Carte** : encadrés compacts (`#cours-encadres-dash` rempli par renderDashboard) au-dessus de la carte détaillée inchangée ; le badge forfait générique est masqué quand les encadrés existent. **Fallback** : si `inscriptionsTango` non chargé → affichage historique conservé. ⚠️ Le fichier contient des espaces insécables (U+00A0) et des échappements `\uXXXX` mélangés — edits chirurgicaux obligatoires.
- [x] **Pointer une carte expirée avec cours restants (exception admin)** — ✅ RÉSOLU AUTREMENT (2026-07-08) par la date d'expiration forçable manuellement (session en tête de fichier). Le bouton « + Pointer » (Cartes 10 → Détails ligne ~10286 ET Pointage ligne ~10171) est masqué quand `fini = nbUtil>=total || days<0`. En repoussant la date d'expiration via la modale « Modifier les cours », `days` redevient ≥ 0 → `fini` faux → le bouton réapparaît dans les deux vues jusqu'à la nouvelle date. Équivalent (et supérieur : la carte redevient « Active », visible partout, l'élève voit la nouvelle date et peut se pointer aussi) à un bouton d'exception dédié. Pas de code supplémentaire.
- [x] **Stages — créneaux entièrement paramétrables** : résolu — `technique=false` + `nStages` + thèmes personnalisables par date suffisent. Aucun code nécessaire.
- [x] **Tarif réduit dans "Valider Paiement" ET "Inscription directe"** — ✅ FAIT (2026-07-08, testé Playwright groupe J, 7 tests). (1) Toggle « 🎓 Tarif réduit » dans **DI et VP** ; (2) `donnees.tarifReduit=true` à la soumission (insert DB + push local optimiste + branche existing, via `Object.assign`) ; (3) email justificatif → **auto** à la validation si coché (en plus de I03, via `_diReduit`/`_vpReduit`) **ET relance manuelle** (bouton « 🎓 Relancer justif » dans l'accordéon fiche Élèves Tango) ; route `POST /api/notify/justificatif-tarif-reduit` (JWT admin, `handleNotifyJustificatifTarifReduit`), email depuis `contact@tangoetvous.fr`, justificatif à envoyer à `regardsepose@gmail.com` ; (4) pastille rouge **"R"** à côté du nom dans Élèves Tango (`ficheEleveInscrit`) tant que `donnees.tarifReduit && !donnees.justifRecu` — visible fiche repliée ; (5) clic pastille → `marquerJustifRecu(id)` avec **confirmation** → `donnees.justifRecu=true` (optimiste + persistance `.eq('id')`, garde id local `CT…`) → pastille disparaît ; (6) **trace permanente dans Compta** (`_comptaBlock`) : pastilles « 🎓 tarif réduit » + « justif ✓ » (verte) / « justif en attente » (orange), survit à la disparition de la pastille R. Au passage : toutes les mentions de la ligne Compta (carte partagée, renouvellement, supprimé, non payée) passées en pastilles colorées 10px (`_pillCss`).
- [ ] **Environnement staging** : créer un environnement de test (2ème Worker Cloudflare + 2ème projet Supabase) pointant sur le même repo GitHub, branche `staging`. Workflow GitHub Actions dédié : push sur `staging` → déploie sur le Worker de test. Permet de valider les nouveautés avant de les merger sur `main` (prod). Demi-journée de travail.
- [ ] **Clone pour autre école** : dupliquer le repo dans un nouveau repo GitHub indépendant, créer un nouveau projet Supabase + Worker Cloudflare + domaine, puis adapter le code (nom école, couleurs, emails admin dans `is_admin()` et `worker.js`, libellés métier). Les deux repos évoluent ensuite indépendamment. Voir section "Pistes de généralisation / revente future" pour les éléments à adapter.
- [ ] **Cours paramétrables multi-disciplines** (demandé 2026-07-02 — chantier LOURD, à cadrer avant tout code) : pouvoir ajouter des cours depuis Paramètres en précisant le type d'inscription — 1. individuel, 2. en couple, 3. les deux. Types 2 et 3 → essais/inscriptions/stages sur le modèle tango (rôles guideur·se/guidé·e, parité, quotas) ; type 1 → sur le modèle yoga (auto-confirmation, plafond de places). ⚠️ Analyse 2026-07-02 : tango et yoga sont deux implémentations parallèles codées en dur (tables séparées `inscriptions_essai`/`inscriptions_essai_yoga` + `inscriptions_cours`/`cours_yoga`, formulaires publics distincts, onglets admin distincts, ~40 templates emails avec brandings différents, crons dédiés, villes/jours hardcodés Paris=jeudi/Vincennes=lundi). En faire un moteur générique = refonte de plusieurs semaines, risque élevé sur la prod. **✅ Décision admin (2026-07-02) : à faire dans le repo cloné "revente"** (item Clone pour autre école), PAS dans la prod Tango & Vous. Si un besoin ponctuel d'une discipline précise apparaît entre-temps → cloner le modèle existant correspondant (yoga si individuel, tango si couple), quelques jours, risque maîtrisé.
- [ ] **Articles tango — Publications** : rédiger les articles tango à diffuser dans l'espace élève (onglet Publications) et les programmer. **Rythme : 1 article par semaine, TOUTE L'ANNÉE — 52 articles/an** (décision 2026-07-05 ; l'été aussi, le site SEO ne prend pas de vacances). À faire avec l'utilisateur : choix des sujets (liste de requêtes Google fournie le 2026-07-05 : débutants, vocabulaire/figures, musique/culture, codes milonga, pages locales, émotion — le lexique des 108 termes sert de réservoir infini), rédaction, dates de publication. **Saisie complète prévue avant fin août 2026** pour que la diffusion roule seule toute la saison. Lié à l'item "Site éditorial tangoetvous.fr" ci-dessous (double diffusion appli + site).
- [ ] **Site éditorial SEO sur tangoetvous.fr** (validé 2026-07-05) : contenu complémentaire au site Wix (JAMAIS de copie — duplicate content pénalisé), qui renvoie vers www.tangoetvous.com. Objectif : première page Google sur les requêtes long-tail. **3 piliers** : (1) **Magazine tango** — les 52 articles annuels publiés AUSSI en public (double canal, un seul effort de rédaction) ; (2) **Lexique du tango argentin** — réutiliser les 108 termes du curriculum "Mon niveau" (ocho, sacada, boleo…), une page/section par terme, requêtes type "sacada tango définition" ; (3) **2-3 pages locales** — "cours tango Vincennes", "tango Est parisien" (requêtes locales peu concurrentielles = 1ère page atteignable). **Saisie admin (spec 2026-07-05, précisée)** : DEUX sections dédiées dans Paramètres — **ARTICLES SITE** (52/an, publiés sur tangoetvous.fr) et **ARTICLES ÉLÈVES** (37/an, publiés dans l'espace élève) — chacune avec les champs : Titre, Sous-titre, Contenu, **Vidéos (plusieurs possibles, upload Cloudinary)**, Photo (upload Cloudinary), + date de publication programmée. Calendrier éditorial site : fenêtres de recrutement cours réguliers = début juin → mi-septembre (principale) + janvier (2e vague) ; le reste de l'année cible stages et cours particuliers. 52 brouillons rédigés le 2026-07-05 → `contenus/articles-site-2026-2027.md`. **Mise en page soignée** de chaque article (template magazine : photo d'en-tête, titre/sous-titre élégants, vidéos intégrées) — appliquée dans l'espace élève ET sur le site public. **Pipeline automatique** : case à cocher "Publier aussi sur tangoetvous.fr" sur chaque article programmé (flag dans `donnees`, ex `sitePublic:true`) ; le Worker Cloudflare sert le domaine racine tangoetvous.fr avec rendu HTML **côté serveur** depuis Supabase `publications` (lecture seule, SEO-friendly : vraies balises title/meta/h1) + sitemap.xml auto. Chaque article se termine par un lien naturel vers le site Wix (cours d'essai). Config Cloudflare : ajouter le custom domain `tangoetvous.fr` au Worker. Attentes réalistes : 3-6 mois avant les premiers résultats, 12 mois pour de vraies positions — le rythme hebdomadaire compte plus que le volume.
- [ ] **Renseigner les thèmes des stages** : compléter dans Paramètres les thèmes des stages à venir (saison courante) ET de la saison prochaine 2026-2027 — à faire avec l'utilisateur.
- [x] **Rappels emails automatiques cb3x** — ✅ FAIT (constaté 2026-07-07) : `handleCronRelanceCb3x` (worker.js, route `POST /api/cron/relance-cb3x`) + workflow `.github/workflows/relance-cb3x.yml` (cron quotidien). Rappels 2ᵉ/3ᵉ échéance CB 3×, flags anti-doublon `donnees.relance_cb3x_2_sent` / `relance_cb3x_3_sent`, service key pour les SELECT.
- [x] **Email automatique fin de saison yoga — cron 15 juin** — ✅ FAIT (workflow `yoga-fin-saison.yml`, cron 15 juin 9h Paris) : chaque 15 juin, envoyer à tous les élèves yoga de la saison courante (`cours_yoga WHERE statut='inscrit' AND saison=saisonCourante`) un email de fin de saison avec lien de ré-inscription à la saison suivante. Détails :
  - **Déclencheur** : cron GitHub Actions `0 7 15 6 *` (7h UTC = 9h Paris) → `POST /api/cron/yoga-fin-saison`
  - **Destinataires** : tous les emails distincts dans `cours_yoga` avec `statut='inscrit'` et `saison=saisonCourante()` — utiliser `SUPABASE_SERVICE_KEY` pour bypasser la RLS
  - **Lien réinscription** : lu depuis `tev_liens_assoconnect` (table `parametres`) → clé de la saison suivante → champ `yoga`. Même clé que celle configurée dans Paramètres → Yoga → Liens AssoConnect → "Cours réguliers". Fallback : chaîne vide si non configuré (ne pas envoyer l'email sans lien valide).
  - **Template** : reprend `email-yoga-fin-saison.html` — en-tête violet dégradé, encadré date dernier cours, bouton violet réinscription, bouton contour avis Google. La date du dernier cours et la saison sont calculées dynamiquement (pas hardcodées).
  - **Date dernier cours** : à récupérer depuis `tev_cours_dates.yoga` (dernière date de la saison courante dans le tableau trié) — pas hardcodée.
  - **Saisons** : calculées depuis `_saisonCourante()` et `_saisonSuivante()` (ex : 2025-2026 et 2026-2027).
  - **Branding yoga obligatoire** : sender `contact@tangoetvous.fr`, replyTo `regardsepose@gmail.com`, header "Cours de Yoga avec Florencia Garcia", signature Florencia — voir règles branding yoga dans CLAUDE.md.
  - **Workflow** : `.github/workflows/yoga-fin-saison.yml` avec `workflow_dispatch` pour test manuel + cron annuel.
- [ ] **Redirection `tangoetvous.fr` → `www.tangoetvous.com`** : à configurer dans Cloudflare (pas de code). Deux étapes : (1) DNS → ajouter enregistrement `A` `@` `192.0.2.1` en mode Proxied ☁️ ; (2) Rules → Redirect Rules → Dynamic redirect `concat("https://www.tangoetvous.com", http.request.uri.path)` status 301, condition hostname = `tangoetvous.fr`. Objectif : éviter la page blanche et concentrer l'autorité SEO sur le site Wix.
- [ ] **Mettre à jour les actions GitHub vers Node.js 24** : ✅ `backup-csv.yml` et `keep-alive.yml` déjà en `@v5` (checkout, upload-artifact, action-send-mail). **Reste uniquement** `deploy.yml` → `actions/checkout@v4` → `@v5`. Sans urgence : Node 20 encore supporté plusieurs mois ; signal = warning jaune "Node.js 20 deprecated" dans un run Actions. Risque de casse quasi nul (checkout v5 = simple bump runtime ; si échec, l'étape `wrangler deploy` ne s'exécute pas → prod intacte). Test = push → run deploy.yml vert/rouge dans GitHub Actions.
- [x] **Playwright — tests E2E** — ✅ SOCLE FAIT (2026-07-08, 21 tests verts) : infra complète + groupes A (7 tests calcExpiration dont parité admin↔tev-supabase et snap été), B (4 : dédup 2 cours, couple email partagé, isRenewal, _maxParJour mixte), D (3 : transfert essai guideur/guidée/partenaire sans email), E (1 : nbInscritsCours quotas), F (4 : gardes anti-polling), G (2 : DI mixte forfait+carte, VP _vpPrefillIds fantôme). Voir section « Playwright — infrastructure en place » ci-dessous. **Reste à couvrir si besoin** : groupe C (onglets Supprimés, UI), B4-UI (bouton 2 cours masqué dans la modale), F1-3 originaux (scénarios 20s temps réel), G2 original (changement de cours).
- [x] **Stages → Pointage — bouton email groupé Gmail** — ✅ Résolu autrement le 2026-07-02 : boutons « 📋 Copier les emails validés » par date dans Stages, Essai Tango et Essai Yoga (copie BCC-ready dédoublonnée). L'idée d'origine : dans l'onglet Stages → Pointage, ajouter un bouton "✉️ Contacter les inscrits" qui ouvre un brouillon Gmail pré-rempli avec en destinataires tous les emails des participants ayant `type_confirmation='confirme'` (inscrits confirmés uniquement, pas les personnes en liste d'attente `type_confirmation='attente'`). Tous les destinataires en BCC pour préserver la confidentialité. Sujet pré-rempli : ex. "Stage Tango & Vous — [date]". Implémentation : même mécanisme que les boutons Gmail existants (ouverture `https://mail.google.com/mail/?view=cm&...` avec `bcc=email1,email2,...`).
- [x] **Espace élève — thème clair** — ✅ FAIT (constaté 2026-07-07) : toggle 🌓 clair/sombre dans le menu de l'espace élève (`toggleTheme()`, classe `body.theme-light`, jeu complet de règles CSS `body.theme-light ...` dans index.html). Section « Thème clair / Thème obscur » ajoutée au Mode d'emploi.
- [x] **Mode d'emploi espace élève — compléments** — ✅ FAIT (constaté 2026-07-07) : les sections « 🔎 Agrandir les écritures » (réglages iPhone + Android) et « 📊 Mon niveau » existent dans la rubrique Mode d'emploi (index.html, accordéons `<details>`), plus une section « 🌓 Thème clair / Thème obscur ».
- [ ] **Budget prévisionnel — nouvelle rubrique admin** : créer un nouvel onglet "Budget" dans `admin.html` permettant de paramétrer et visualiser un budget prévisionnel de l'école (recettes et dépenses estimées vs réelles). Contenu et structure à définir avec l'utilisateur avant implémentation.
- [x] **Bandeau défilant sur l'accueil espace élève** — ✅ FAIT (2026-07-01/02) : clé `tev_bandeau_accueil`, toggle + texte dans Paramètres → Fonctionnalités, marquee pleine largeur or/noir selon thème. Spec d'origine : afficher un bandeau avec une phrase en défilement horizontal (ticker) au milieu de la page d'accueil de `index.html`. Le texte est paramétrable depuis Paramètres admin (nouvelle clé `tev_bandeau_accueil` dans la table `parametres` : `{ texte: '...', actif: true/false }`). Si `actif=false` ou clé absente → bandeau masqué. Implémentation : CSS `@keyframes` marquee ou `animation: scroll` sur un `<div>` fixe. Position : entre la carte "Prochain cours" et les onglets de navigation, ou en haut de l'accueil sous le header.


## Keep-alive automatique — mis en place, rien à faire
- **Supabase** : mise en pause après 7 jours sans requête → workflow GitHub Actions ping toutes les 5 jours
- **GitHub Actions** : crons désactivés après 60 jours sans push → le même workflow commit `.keep-alive` avec `[skip ci]` pour maintenir l'activité du repo sans déclencher de déploiement
- Fichier : `.github/workflows/keep-alive.yml`
- **Entièrement automatique** — aucune intervention manuelle nécessaire

## Stack technique retenue
- **DB + Auth** : Supabase (plan free — 500 MB, 200 connexions Realtime simultanées max)
- **Déploiement** : Cloudflare Workers Static Assets (pratiquement illimité pour du statique)
- **Emails transactionnels** : Brevo — **déjà configuré comme SMTP Supabase** (magic links passent par Brevo, confirmé par l'adresse `brevosend.com`)
  - Free : 300 emails/jour (magic links inclus — ~50/jour en phase de test)
  - Starter 7€/mois : 5 000 emails/mois sans limite journalière — **recommandé dès maintenant**
  - La limite "contacts" (500 en Starter) ne concerne que le CRM/newsletter Brevo, pas les emails transactionnels via API
- **Notifications push** : Firebase Cloud Messaging — gratuit, sans limite de volume, **ne pas remplacer par Brevo push**
  - Nettoyage automatique des tokens invalides à implémenter (voir TODO)
- **Discussions** : messages stockés dans Supabase, notifications via FCM — Brevo non impliqué
- **Code.gs (Google Apps Script)** : fichier legacy, **ne plus utiliser**, emails non envoyés depuis la migration Supabase
- **GitHub Actions** : 2 000 min/mois gratuit (~1 000 déploiements possibles)
- **Cloudflare Turnstile** : intégré sur tous les formulaires publics (inscription-cours, cours-essai, essai-yoga, stages-pwa, cours-particuliers, demande-devis) — sitekey `0x4AAAAAADCDhidbX3fOzZl5`. Widget retiré automatiquement quand chargé en iframe (Wix), vérifié côté client hors iframe.

## Notifications push — état d'avancement
- Boutons **[🔔 Activer | ⚡ Tester]** ajoutés dans le menu ligne 1
- "Activer" : demande la permission navigateur (fonctionne)
- "Tester" : envoie une vraie notification via le service worker (fonctionne déjà sans serveur)
- **Manque pour la suite** : VAPID key (Firebase Console → Project Settings → Cloud Messaging → Web Push certificates) + table `fcm_tokens` dans Supabase + Edge Function d'envoi
- Firebase config dans `sw.js` : projectId=`tango-et-vous`, messagingSenderId=`778867090916`
- Sélectionneur de saison : 2026-2027 apparaît automatiquement le 1er mai ou manuellement via Paramètres → "Ouvrir pré-inscriptions"

## Test espace élève
- Connexion élève = magic link par email uniquement (pas de mot de passe)
- Pour tester : créer des élèves de test avec des emails contrôlés
- Astuce : utiliser les alias Gmail `tonmail+eleve1@gmail.com`, `+eleve2@gmail.com` etc. — arrivent tous dans la même boîte

## PWA
- `manifest.json` : espace élèves (index.html)
- `manifest-admin.json` : espace admin (admin.html)
- `sw.js` : service worker (Firebase Messaging + cache)
- Service worker enregistré dans admin.html et index.html
- Icônes : `icon-192.png`, `icon-512.png`

## Fichiers SQL de référence
- `supabase/import_eleves_2025_2026.sql` : import initial élèves + inscriptions tango
- `supabase/import_cours_yoga.sql` : import élèves yoga dans cours_yoga
- `supabase/update_paiements.sql` : mise à jour paiement+montant depuis CSV original

## Comportement des formulaires publics selon la période

### `inscription-cours.html` (inscription tango régulier)
Détecte automatiquement le mode selon la date :
- **Septembre → avril** : mode `regulier` → saison courante
- **Mai → août** : mode `preinscription` → saison suivante
- **Mai–juin** (sans mode forcé dans l'URL) : écran de choix proposé à l'utilisateur

Override possible via URL : `?mode=preinscription` ou `?mode=regulier`

En mode préinscription, les tarifs de la prochaine saison sont lus depuis les Paramètres admin (`localStorage` clé `tev_tarifs_prochaine_saison`). Les liens AssoConnect changent aussi selon la saison détectée.

#### Section "Évaluer mon tarif" — règles de calcul
`var T = _computeT()` est calculé **une fois au chargement** selon la priorité suivante :
1. `tev_tarifs` (si `dateEffet` atteinte — tarif programmé)
2. `tev_tarifs_prochaine_saison` — si `MODE === 'preinscription'`
3. `tev_tarifs_actifs` — sinon (saison courante)
4. `tev_params_paris_<sai>.tarifs` + `tev_params_vincennes_<sai>.tarifs` + `tev_params_yoga_<sai>.tarifs` mergés — **source principale** configurée via Paramètres → Tango Paris / Vincennes / Yoga → Tarifs
5. `TARIFS_BASE` — fallback uniquement si l'admin n'a jamais rien sauvegardé

`goTarif()` est `async` et recharge tous les params Supabase au moment du clic, garantissant les valeurs fraîches même cross-device.

**Règle universelle — tous les tarifs viennent des Paramètres** : `TARIFS_BASE` est uniquement un filet de sécurité de dernier recours. Dès que l'admin sauvegarde un tarif dans Paramètres (quelle que soit la section : Tango Paris, Vincennes, Yoga, Adhésion LRS, Adhésion Sorano…), c'est cette valeur qui s'applique partout — formulaires publics ET formulaires admin. Ne jamais hardcoder un montant dans un formulaire en contournant `TARIFS`.

**`chargerTarifs()` dans `admin.html`** : applique le fallback sur `tev_params_paris_<sai>.tarifs` / `tev_params_vincennes_<sai>.tarifs` / `tev_params_yoga_<sai>.tarifs` pour pré-remplir les montants dans tous les formulaires admin : "Inscrire" (Élèves Tango), "Inscrire Élève" (Yoga), "Valider Paiement". Les clés yoga (`yoga_essai`, `yoga_forfait_1cours`, `yoga_forfait_2cours`) sont sans conflit avec les clés tango.

La saison du formulaire (`MODE`) détermine automatiquement quelle grille utiliser.

**Règles métier du calcul :**
- **Paris + forfait** → Adhésion LRS + Forfait annuel Paris
- **Paris + carte10** → Adhésion LRS + Carte 10 cours (une seule carte, valable pour 2 cours si 2 cours Paris)
- **Vincennes** → Adhésion LRS + Forfait annuel Vincennes + Adhésion Sorano (selon résidence et âge)
- **2 cours** → une seule Adhésion LRS, une seule Adhésion Sorano si au moins un cours Vincennes
  - 2 Paris + carte10 → **une seule carte** couvre les deux cours
  - 2 Paris + forfait → Forfait 2 cours
  - 2 Vincennes → Forfait 2 cours Vincennes
  - Mix Paris+Vincennes → Forfait 2 cours (ou Carte Paris + Forfait Vincennes calculés séparément)
- **Tarifs réduits** : Paris → étudiant·e / demandeur·euse d'emploi ; Vincennes → moins de 25 ans / Carte Jeune Vincennes
- **Adhésion LRS** : une seule par personne par an, quel que soit le nombre de cours
- **Adhésion Sorano** : uniquement si au moins un cours à Vincennes, une seule par personne

### `cours-essai.html` (cours d'essai tango)
- Les dates viennent de **localStorage `tev_cours_dates`** (mis à jour par l'admin via Paramètres → Dates)
- Fallback hardcodé dans le fichier si localStorage absent
- Converties via `_buildDatesFromArrays(paris, vincennes)` : ISO → DD/MM/YYYY + saison + gratuit
- Seules les dates **futures** sont affichées (filtrées dynamiquement à partir d'aujourd'hui)
- Les deux saisons coexistent dans la liste, séparées par des en-têtes de saison
- Cours **gratuits** : tous les cours de septembre pour les Débutants (marqués automatiquement)
- Système de quotas temps réel : RPC Supabase `compter_inscrits_essai()`, badge "Complet" si quota atteint (QUOTA_GUI=22, QUOTA_GDE=23)
- Pour mettre à jour les dates : Paramètres admin → section Dates (Paris ou Vincennes)
- **Règle de validation des inscriptions** :
  - En couple (avec partenaire) → `statut='confirme'` → "Pointage" et "Par date"
  - Guidée seule → toujours `statut='attente'` → "Liste d'attente" et "Par date" (admin valide manuellement)
  - Guideur seul → `statut='confirme'` sauf si quota guideurs (22) dépassé **en sept/oct/nov** → alors `statut='attente'`

### `essai-yoga.html` (cours d'essai yoga)
- Les dates viennent de **localStorage `tev_cours_dates.yoga`** (mis à jour par l'admin via Paramètres → Yoga → Dates)
- Fallback hardcodé dans le fichier si localStorage absent
- Filtre dynamique : seulement les **20 prochaines dates futures** affichées (`slice(0, 20)`)
- Cours **gratuits** : les **2 premiers cours de septembre** de chaque saison (détectés automatiquement par `estGratuit()`)
- Prix pour les dates non gratuites : lu depuis `localStorage.tev_tarifs_actifs` (clé `tev_params_yoga_<sai>.tarifs.yoga_essai`) — zéro valeur par défaut hardcodée
- Pour mettre à jour les dates : Paramètres admin → Yoga → Dates
- **Table cible** : `inscriptions_essai_yoga` (pas `inscriptions_essai`)
- **Saison** : déterminée depuis la date elle-même via `dateAppartientSaison()` — pas besoin de stocker un champ `saison`
- **Statut à l'inscription** : `'confirme'` directement (pas `'demande'`) — **pas de validation manuelle admin**
- **Après soumission** : écran de succès + compte à rebours 8s → `restart()` + bouton manuel "← Retour"
- **Ordre impératif** : INSERT Supabase **avant** BroadcastChannel (règle iframe détaché — voir CLAUDE.md)
- **Email admin** : `regardsepose@gmail.com` — toutes les notifications yoga admin vont à cette adresse

## Règles métier — formulaires publics

### `cours-essai.html` — Cours d'essai Tango

**Statut à l'inscription (table `inscriptions_essai`) :**
- Inscription **en couple** (avecPart='Oui') → `statut='confirme'`
- Inscription **guideur seul** → `statut='confirme'` sauf si quota guideurs atteint (QUOTA_GUI=22) **en sept/oct/nov** → `statut='attente'`
- Inscription **guidée seule** → toujours `statut='attente'` (admin valide manuellement)
- Inscription **double rôle** → même règle que guideur (confirme sauf quota dépassé en sept/oct/nov) — ⚠️ double rôle absent du formulaire inscription-cours.html mais peut exister en DB (données legacy)

**Quotas (affichage temps réel via RPC Supabase `compter_inscrits_essai`) :**
- QUOTA_GUI = 22 guideurs par date (total classe = essai + élèves réguliers)
- QUOTA_GDE = 23 guidées par date (total classe = essai + élèves réguliers)
- **Le quota inclut à la fois** : les inscriptions essai confirmées (statut='confirme') + les élèves réguliers inscrits à ce cours (inscriptions_cours, statut='inscrit', même ville+niveau+saison)
- Limites actives **seulement en septembre, octobre, novembre** (mois 9, 10, 11)
- Badge "Complet" si quota atteint ; cours non sélectionnable si les deux quotas sont atteints
- RPC `compter_inscrits_essai(p_date_essai date, p_ville text, p_niveau text)` → retourne `{gui: int, gde: int}`
- SQL à exécuter dans Supabase (SQL Editor) — voir section "SQL utiles" ci-dessous

**Tarifs :**
- Cours **gratuits** : tous les cours de septembre pour les Débutants (marqués `gratuit:true` dans les données de dates)
- Cours payants : 15€ seul / 30€ en couple

**Affichage dans l'admin :**
- `statut='confirme'` → onglet "Pointage" + onglet "Par date"
- `statut='attente'` → onglet "Liste d'attente" + onglet "Par date"
- Guideur et double rôle traités pareil côté admin (tous deux dans pGui)

**Valeurs des champs stockées :**
- `role` : `'guideur'`, `'guidee'`, `'double'` (normalisés avant insert, jamais `'Guideur.se'` etc.)
- `niveau` : `'debutant'` ou `'intermediaire'` (normalisés avant insert, jamais `'Débutant'` etc.)
- `type` : `'tango'`

---

### `essai-yoga.html` — Cours d'essai Yoga

**Statut à l'inscription (table `inscriptions_essai`) :**
- Toujours `statut='demande'` — l'admin valide manuellement depuis l'onglet Essai Yoga

**Tarifs :**
- Cours **gratuits** : les **2 premiers cours de septembre** de chaque saison (détectés automatiquement par `estGratuit()`)
- Prix cours payant : lu depuis `localStorage.tev_tarifs_actifs`, fallback `15€`

**Type :** `type='yoga'`

---

### `inscription-cours.html` — Inscription Tango régulier

**Rôles disponibles :** uniquement `guideur` et `guidee` — "double rôle" supprimé du formulaire (décision 2026-05)

**Statut à l'inscription (table `inscriptions_cours`) :**
- **Guidée seule dans TOUS ses cours** → `statut='demande'` → badge "non validé.e" → admin valide manuellement → `attente_paiement`
- **Guideur seul ou couple** → `statut='attente_paiement'` → badge "validé.e" + 💳

**Fiche partenaire :** créée dès qu'il y a un prénom ou nom (`S.pPrenom || S.pNom`), même sans email. L'email du partenaire est facultatif — stocké vide si non renseigné.

**Rôles automatiques :**
- Si l'utilisateur choisit "Avec partenaire", le rôle du partenaire est automatiquement l'inverse (guideur↔guidée)
- `getRoleAuto(r)` : `'guideur'→'guidee'`, `'guidee'→'guideur'`

**Détection du mode selon la date :**
- Septembre → avril : mode `regulier` → saison courante
- Mai → août : mode `preinscription` → saison suivante
- Mai–juin (sans override URL) : écran de choix affiché
- Override via URL : `?mode=preinscription` ou `?mode=regulier`

**Tarifs (calculés côté client, indicatifs) :**
- Tarifs lus depuis `localStorage.tev_tarifs_actifs` (mode régulier) ou `localStorage.tev_tarifs_prochaine_saison` (mode préinscription), fallback `TARIFS_BASE` hardcodé
- Réductions disponibles : étudiant, demandeur d'emploi, moins de 25 ans
- Cotisation Sorano (Vincennes) : à régler directement à Sorano, calculée selon âge + déjà adhérent ou non
- Les tarifs affichés sont **indicatifs** — montant définitif confirmé sur AssoConnect

**Liens AssoConnect :**
- Stockés dans `LIENS_ASSOCONNECT_DEFAUT` par saison (`2025-2026`, `2026-2027`)
- Overridables par l'admin via `localStorage.tev_liens_assoconnect`
- Deux types : `'cours'` (nouvelle inscription) et `'renouv'` (renouvellement carte 10/20 cours)

**Données envoyées à Supabase :** `prenom, nom, email, tel, role, niveau, cours (ville—niveau), ville, statut, partenaire, email_partenaire, saison, donnees (JSON complet)`

---

### `stages-pwa.html` — Inscription aux stages

**Dates affichées limitées aux 3 prochaines (2026-07-10)** : constante `MAX_DATES_STAGES = 3` dans `chargerDonnees()`. Les dates futures de la saison (déjà filtrées `>= today` + triées croissant) sont `.slice(0, MAX_DATES_STAGES)` dans les DEUX chemins d'assignation de `DATES_STAGES` (localStorage par saison ~ligne 707, et fallback `DATES_STAGES_RAW` ~ligne 724). Pour changer le nombre affiché, modifier cette seule constante.

**⚠️ Fix 2026-07-17 — synchro Supabase des dates : saison courante ET suivante.** Le formulaire affiche les stages de la saison courante ET de la saison suivante (fenêtre `_isEte` en juillet-août, `chargerDonnees` lit toutes les clés `tev_dates_stages_*` du localStorage). MAIS le `DOMContentLoaded` (~ligne 1400) ne resynchronisait depuis Supabase QUE `tev_dates_stages_<saisonCourante()>` — jamais la saison suivante. Conséquence : en été, les prochains stages (saison N+1) restaient figés sur le **cache local de chaque appareil** → dates différentes selon le device (Mac vieux cache = 1 date, téléphone = 3), et **un nouveau visiteur pouvait voir 0 stage** (le fallback `DATES_STAGES_RAW` codé en dur était périmé). Corrigé : la synchro boucle maintenant sur `[saisonCourante, saisonSuivante]` (`_saiSuiv = (year0+1)+'-'+(year1+1)`) et réécrit les deux clés localStorage depuis `TEV.getParam`. **Règle** : toute donnée stages affichée sur les deux saisons (dates, et à surveiller : params horaires/tarifs/adresse `tev_params_stages_<sai>` qui ne sont PAS encore synchro'd pour la saison suivante) doit être resynchronisée pour LES DEUX saisons, pas seulement la courante. Validé Playwright groupe K (chargement stages-pwa sans erreur JS).

**Quota de capacité : aucun** — les stages n'ont pas de limite de places dans le code. Il n'existe pas de `CAP_STAGES` ni de vérification du nombre d'inscrits avant l'inscription. Si un stage est "complet", l'admin gère manuellement (refus ou liste d'attente hors appli). Ne pas ajouter de quota sans discussion explicite.

**Statut à l'inscription (table `inscriptions_stages`, champ `type_confirmation`) :**
- **Guidée seule** (role=`'Guidé(e)'` et situation≠`'avec-partenaire'`) → `type_confirmation='attente'`
- **Tous les autres** (guideur, couple, double rôle) → `type_confirmation='confirme'`
- La mise en attente est uniquement liée à la **parité guideurs/guidées**, pas à une capacité maximale.

**Valeurs de `role` stockées :** `'Guideur(se)'` ou `'Guidé(e)'` (format avec parenthèses, différent des autres formulaires)

**Rôle partenaire automatique :** `roleInverse()` : `'Guideur(se)'↔'Guidé(e)'`

**Tarifs** (par personne, lus depuis `localStorage` ou défauts hardcodés) :
- Technique 1h : 20€
- 1 stage : 25€, 2 stages : 45€, 3 stages : 65€, 4 stages : 85€
- 2+technique : 60€, 3+technique : 75€, 4+technique : 95€
- Paiement sur place le jour du stage

---

### `cours-particuliers.html` — Cours particuliers

**Statut :** pas de `statut` côté formulaire — demande simple transmise via `TEV.reservationCP(payload)` → table `cours_particuliers`. L'admin gère manuellement.

**Champs collectés :** `prenom, nom, email, tel, niveauEleve, prof, duree, lieu, lieuDetail, objectifs, remarque, dispoTexte, urgence, source ('pwa' ou 'wix')`

**Valeurs réelles des champs — référence Edge Function :**
- `prof` : `'florencia'` | `'jeremy'` | `'les-deux'` → labels : `Florencia Garcia` / `Jérémy Braitbart` / `Florencia & Jérémy`
- `duree` : `'1 heure'` | `'1h30'` | `'2 heures'` — exactement ces 3 valeurs
- `lieu` = `lieuLabel(S.lieux)` + code postal éventuel entre parenthèses. Labels LIEUX :
  - `nation` → `Nation — Paris`
  - `gambetta` → `Gambetta — Paris`
  - `vincennes` → `Vincennes / Montreuil / Fontenay` (**jamais "Espace Sorano" — n'existe pas dans le formulaire**)
  - `domicile` → `À domicile (code postal)` — `lieuDetail` = code postal
  - `vos-locaux` → `Dans vos locaux (code postal)` — `lieuDetail` = code postal
- `objectifs` = `S.objectifs.join(', ')` — IDs joints (ex : `'passer-cap, choregraphie'`). Labels OBJECTIFS :
  - `decouverte` → `🌱 Découverte du tango`
  - `passer-cap` → `🎯 Passer un cap`
  - `accordage` → `💑 Accordage de couple`
  - `sequence` → `🔄 Travail sur une séquence`
  - `scene` → `🎭 Tango de scène`
  - `choregraphie` → `💍 Chorégraphie`
  - `autre` → `✨ Autre objectif`
- `niveauEleve` : `'debutant'` | `'quelques'` | `'1an'` | `'2ans'` | `'plus'` | `'milonga'` → labels : `Débutant(e) — jamais dansé` / `Quelques cours` / `1 an — bases acquises` / `2 ans de cours` / `Plus de 2 ans` / `Je sors régulièrement en milonga`
- `dispoTexte` = multilignes construit depuis `dispoParts.join('\n')` :
  - `'Jours : Lundi, Mercredi'` (si jours sélectionnés)
  - `'Horaires : 19h – 21h'` (si heureDebut ou heureFin saisis)
  - `'Dates proposées : ...'` (si propositionsDates saisi)
  - `'Autres : ...'` (si dispoTexte libre saisi)
- `remarque` : texte libre (textarea) — **distinct de `objectifs`**
- ⚠️ Champs **inexistants** dans le payload : `pourQui`, `nbCours`, `commentConnu`, `datesSouhaitees` — ne jamais les inventer dans une Edge Function ou un template email

---

## Règles métier — espace admin (`admin.html`)

### Workflow Inscriptions Tango (onglet `cours-tango`, admin.html)

Lifecycle des statuts dans `inscriptions_cours` pour les nouvelles inscriptions :

| Situation | Statut initial | Badge admin | Action disponible |
|-----------|---------------|-------------|-------------------|
| Guidée seule | `demande` | "non validé.e" | Bouton "✓ Valider" → passe à `attente_paiement` |
| Guideur seul | `attente_paiement` | "validé.e" + 💳 | Bouton 💳 → ouvre formulaire "Valider Paiement" |
| Couple (avec partenaire) | `attente_paiement` (les deux) | "validé.e" + 💳 | Bouton 💳 → ouvre formulaire "Valider Paiement" |

**Sous-onglets** : Tous · Att. Validation (demande/attente) · Att. Paiement (attente_paiement) · Inscrire · Valider Paiement

**Formulaire "Valider Paiement"** (`sousOngletCoursTango='valider_paiement'`) :
- Menu déroulant avec TOUTES les personnes en `demande`/`attente_paiement` de la saison active
- Préremplissage via `vpPrefill(id)` — utiliser `String(x.id)===String(id)` pour le `find` (IDs Supabase BIGINT vs strings)
- Formulaire identique à "Inscrire" dans Élèves Tango (prenom/nom/email/tel, cours, formule, rôle/paiement/montant par cours, partenaire)
- À la validation : UPDATE `inscriptions_cours` SET statut='inscrit' + upsert `eleves` + navigation vers Élèves Tango
- La navigation utilise `switchTab('eleves-tango')`, pas `renderTab()`

**Depuis `inscription-cours.html` (formulaire public)** :
- Guidée seule dans TOUS ses cours → `statut='demande'`
- Guideur seul ou couple → `statut='attente_paiement'`
- Seuls 2 rôles proposés : guideur·se et guidé·e (double rôle supprimé)
- Fiche partenaire créée dès qu'il y a un prénom/nom, email facultatif

**`vpPrefill` — préremplissage partenaire :**
- Condition `ins.partenaire` suffit (pas besoin de `emailPartenaire`)
- Lookup du tel partenaire : par email si dispo, sinon par `_normNom()` dans le même cours

### Cartes 10 cours (tango) — règles complètes

**Structure**
- Type `'carte10'` dans `inscriptions_cours` (ou données dans table `eleves` : `carte_utilises`, `carte_restants`, `carte_date_achat`, `carte_expiration`, `carte_statut`, `carte_paye`)
- Valable **Paris ET Vincennes** (pas de restriction par ville)
- `carte_statut` : `'Nouvelle carte'` | `'Active'` | `'supprimé'`
- `carte_paye` : `true` = payée, `false` = non payée (renouvellement sans payer en attente)

**Durée de validité**
- **3 mois** à compter du **premier cours utilisé** (pas de la date d'achat)
- **Algorithme itératif A+B+C** (boucle `while (cur <= fin)`, `fin` s'étend dynamiquement) :
  - A = fenêtre 3 mois depuis `datePremierCours`
  - B = gaps (semaines sans cours) dans A → `fin` += 7j par gap
  - C = gaps **nouveaux** dans A+B (ex : Toussaint qui tombe dans l'extension) → `fin` += 7j à nouveau
- **Vacances, jours fériés, été** : tous couverts automatiquement — pas de liste hardcodée
- Calcul : `calcExpiration(datePremierCours, ville)` dans `admin.html` et `_calcExpirationSb()` dans `tev-supabase.js`
- **Source des dates** : `localStorage.tev_cours_dates.paris` / `.vincennes` — synchronisé depuis Supabase via `chargerParamsRemote()` (admin) ou `tevRefreshCoursDates()` (espace élève). **Zéro hardcodé** — `SANS_COURS_*` supprimés.
- **Les deux saisons traitées comme un tout continu** : `tev_cours_dates` contient les dates de la saison courante ET de la saison suivante. Avec les deux saisons, `lastStored` atteint juin N+1 → juillet/août absents de coursSet → gaps d'été correctement comptés → Toussaint/Noël absents → également comptés → expiration correcte (~novembre pour un premier cours de mai). **Ne jamais introduire de variable `nextSeasonStartISO`** — cette approche cassait les vacances d'automne en plafonnant à septembre.
- **Bug timezone corrigé** : `T00:00:00` → `T12:00:00` partout dans les deux fonctions (évite le glissement UTC/heure locale qui donnait -1 jour).
- **Normalisation du jour de cours** : si l'admin saisit une date qui n'est pas un jour de cours exact (ex : mardi 26 mai alors que Paris est le jeudi), l'algorithme cherche la date la plus proche dans `coursArr` (dans un rayon de ±3 jours) et utilise celle-là comme point de départ. Sans ça, chaque semaine apparaissait comme un gap (le mardi ne matchait jamais contre le Set de jeudis). Implémenté dans les deux fonctions (`calcExpiration` + `_calcExpirationSb`) après construction de `coursSet`.
- ⚠️ **Les dates doivent être saisies depuis le début de la saison** : si une carte a commencé avant la première date dans Paramètres, les semaines sans cours antérieures ne seront pas comptées.
- ⚠️ **Ne jamais remettre de listes `SANS_COURS_*` hardcodées** : le système détecte les gaps automatiquement.
- ⚠️ **Ne jamais introduire de variable `nextSeasonStartISO` sous quelque forme que ce soit** — toute tentative a créé des régressions (décalage de 18 mois, ou plafonnement à septembre ignorant Toussaint). La condition `iso <= lastStored` seule suffit quand les deux saisons sont dans `tev_cours_dates`.

**Limite journalière de pointage**
- Maximum **2 cours par date** (toutes sources confondues : admin, espace élève, QR code)
- Le 3ᵉ scan ou pointage sur la même date est ignoré

**⚠️ Pas d'auto-renouvellement — jamais**
Le renouvellement est **toujours une action manuelle**. Il n'existe que deux voies :
1. **Admin** : clic sur "Renouveler" dans Cartes 10 → Détails
2. **Élève** : clic sur "Renouveler sans payer pour l'instant" dans son espace, quand sa carte est à 10/10

**Limite journalière de pointage — dynamique (implémentée le 2026-05-24)**

La limite varie selon le nombre de cours actifs de l'élève :
- **1 cours inscrit** → max **1 pointage par jour**
- **2 cours inscrits** → max **2 pointages par jour** (comportement historique)

**4 endroits où une carte de 10 cours peut être pointée :**

| Source | Implémentation |
|--------|---------------|
| Admin **Détails** (`pointer-cours`) | Modal `ouvrirModalPointer()` : bouton "2 cours" masqué si `_maxParJour(email) <= 1`. `pointerCoursAction()` bornée par `_mpj`. |
| Admin **Pointage** (`pointer-cours-1`) | Guard `dejaPointe >= _maxParJour(c.email)` avant d'appeler `pointerCoursAction()`. |
| Espace élève (`confirmerPointerSelf()`) | Guard `already >= _mpjSelf` avec `_mpjSelf = eleveData.nbCoursInscrits \|\| 1`. Bouton "2 cours" masqué dans `ouvrirModalPointerSelf()` si `maxParJour - todayCount <= 1`. `TEV.pointerCours()` reçoit `maxParJour: eleveData.nbCoursInscrits \|\| 1`. |
| **QR code** (`pointer_cours_qr` SQL) | Passe toujours `p_nb: 1`. La fonction SQL doit compter les inscriptions_cours actives et limiter à `v_nb_inscriptions` scans par jour. **SQL à exécuter** : voir ci-dessous. |

**`_maxParJour(email)` (admin.html)** : filtre `adminData.coursTango` par `email + statut='inscrit' + saison=saisonActive() + !_isRenewalRow` → retourne 1 si < 2 cours actifs, 2 sinon.

**`eleveData.nbCoursInscrits` (index.html)** : calculé dans le callback `inscriptions_cours` au login : count des lignes `statut='inscrit' + !isRenewal`. Fallback = 1.

**`tevPointerCours({ ..., maxParJour })` (tev-supabase.js)** : paramètre optionnel, défaut = 2 (backward compat). Borne `mpj = Math.min(2, maxParJour)`.

**SQL à exécuter dans Supabase — mise à jour `pointer_cours_qr`** :
```sql
CREATE OR REPLACE FUNCTION public.pointer_cours_qr(
  p_email text, p_date date, p_nb integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_saison text;
  v_eleve_id bigint;
  v_utilises integer;
  v_restants integer;
  v_statut text;
  v_nb_today integer;
  v_nb_inscriptions integer;
  v_max_jour integer;
  v_a_ajouter integer;
BEGIN
  -- Saison depuis la date
  v_saison := CASE
    WHEN EXTRACT(MONTH FROM p_date) >= 9
    THEN EXTRACT(YEAR FROM p_date)::text || '-' || (EXTRACT(YEAR FROM p_date) + 1)::text
    ELSE (EXTRACT(YEAR FROM p_date) - 1)::text || '-' || EXTRACT(YEAR FROM p_date)::text
  END;

  -- Récupérer l'élève
  SELECT id, carte_utilises, carte_restants, carte_statut
    INTO v_eleve_id, v_utilises, v_restants, v_statut
    FROM eleves WHERE email = p_email LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'eleve_introuvable'); END IF;
  IF v_statut IS NULL OR v_statut = 'supprimé' THEN
    RETURN json_build_object('ok', false, 'error', 'carte_inactive');
  END IF;

  -- Compter les inscriptions_cours actives (pour déterminer le max par jour)
  SELECT COUNT(*) INTO v_nb_inscriptions
    FROM inscriptions_cours
    WHERE email = p_email AND statut = 'inscrit' AND saison = v_saison
      AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true');
  v_max_jour := GREATEST(1, LEAST(2, v_nb_inscriptions));

  -- Compter les pointages du jour
  SELECT COUNT(*) INTO v_nb_today FROM presences WHERE eleve_id = v_eleve_id AND date = p_date;
  IF v_nb_today >= v_max_jour THEN
    RETURN json_build_object('ok', true, 'skipped', true);
  END IF;

  v_a_ajouter := LEAST(p_nb, v_max_jour - v_nb_today);
  IF v_a_ajouter <= 0 THEN RETURN json_build_object('ok', true, 'skipped', true); END IF;

  -- Insérer les présences
  FOR i IN 1..v_a_ajouter LOOP
    INSERT INTO presences (eleve_id, eleve_nom, date, niveau, note)
      SELECT v_eleve_id, nom || ' ' || prenom, p_date, niveau, 'QR code'
      FROM eleves WHERE id = v_eleve_id;
  END LOOP;

  -- Mettre à jour la carte
  v_utilises := COALESCE(v_utilises, 0) + v_a_ajouter;
  v_restants := GREATEST(0, COALESCE(v_restants, 10) - v_a_ajouter);
  UPDATE eleves SET carte_utilises = v_utilises, carte_restants = v_restants WHERE id = v_eleve_id;

  RETURN json_build_object(
    'ok', true, 'skipped', false,
    'added', v_a_ajouter, 'utilises', v_utilises, 'restants', v_restants
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.pointer_cours_qr(text, date, integer) TO anon, authenticated;
```
⚠️ Ce SQL ne réintroduit **aucune logique de renouvellement** (conformément à la règle permanente). Le renouvellement reste une action manuelle admin.

**QR code — pointage uniquement**
- Scanné **1 fois** sur une date → 1 cours ajouté
- Scanné **2 fois** sur une date → 2 cours ajoutés (seulement si élève inscrit à 2 cours)
- Si déjà `v_max_jour` cours pointés ce jour-là → scan ignoré (`skipped: true`)
- Fonction SQL `pointer_cours_qr` (RPC Supabase, SECURITY DEFINER, accessible à `anon`) — **ne jamais y réintroduire de logique de renouvellement**

**Règle à 9 cours pris (espace élève `index.html`)**
1. L'élève ne peut pointer qu'**1 seul cours** ce jour-là (limite journalière)
2. Ce pointage fait passer la carte à **10/10** → le bouton **"↻ Renouveler sans payer pour l'instant"** apparaît **au-dessus** de "✓ Je pointe ma présence"
3. Cliquer "Je pointe" sans renouveler d'abord → modal s'ouvre avec message d'erreur + bouton Valider désactivé
4. Si "Renouveler" cliqué → nouvelle carte : `utilises=0`, `restants=10`, `paye=false`, `statut='Nouvelle carte'` → badge "⚠️ Non payée" visible dans admin (Cartes 10 → Détails) ET dans l'espace élève
5. L'élève peut alors pointer **1 cours de plus** ce jour-là sur sa nouvelle carte (= 2 cours au total sur la date = maximum)

**Même logique côté admin :**
1. Admin pointe 1 cours → carte passe à 10/10
2. Admin clique "Renouveler" sur la fiche de l'élève dans Cartes 10 → Détails
3. Admin peut pointer un 2e cours ce jour-là sur la nouvelle carte
- ⚠️ **À faire** : notification push + email à l'élève quand carte renouvelée sans payer

**Carte expirée (pas épuisée)**
- Dans l'espace élève : seul le bouton "Renouveler" est affiché, "Je pointe" est masqué
- Dans l'admin : la carte reste visible dans Cartes 10 → Détails avec la date d'expiration en rouge

**`sauvegarderEditCarte()` — persistance correcte**
- `datesCours` vient de la table `presences` (`eleve_id` = `eleves.id`) — les modifier dans le modal sans toucher `presences` les fait revenir au reload
- Fix : DELETE toutes les présences de l'élève + INSERT une présence par date saisie (`note:'Correction admin'`)
- L'expiration est **toujours** recalculée depuis `datePremierCours` (plus de garde `!c.expiration`)
- Cartes reportées (`_fromCoursTango`) : `c.id` = `inscriptions_cours.id` mais l'`eleves.id` est retrouvé par email via `adminData.cartes` (la fiche existe avec l'ancienne saison) → `Promise.all` parallèle : `eleves` + `presences` + `inscriptions_cours.donnees`

**Reporter une carte en fin de saison**
- Bouton "↩ Reporter" dans Cartes 10 → Détails (visible en juillet-août)
- INSERT nouveau `inscriptions_cours` pour la saison suivante avec `donnees.isReport=true` et `donnees.reportedRestants=N`
- La ligne `eleves` reste **inchangée** (saison courante préservée)
- La carte reportée apparaît dans la vue de la saison suivante avec les cours restants préservés

### Pointage / présences
- Table `presences` : une ligne par (eleve_id, date, cours)
- Un élève peut être marqué présent/absent sur chaque date de cours
- Les présences alimentent le décompte des cours restants sur les cartes 10

### Suppression d'inscriptions
- **Tango** : `UPDATE inscriptions_cours SET statut='supprimé'` (jamais DELETE — conservation historique)
- **Yoga** : `DELETE FROM cours_yoga` (suppression réelle)
- **Essai tango/yoga** : DELETE réel sur `inscriptions_essai` (via `supprimerEssaiInscr`)

### Emails automatiques (état actuel — non implémentés)
- Tous les appels `postAS()` (héritage Google Apps Script) affichent maintenant une alerte honnête :  
  `'⚠️ Emails non encore configurés (Brevo à implémenter)'`
- **Ne pas afficher de toast "Email envoyé"** si l'email n'est pas réellement envoyé
- Emails à implémenter via Brevo + Supabase Edge Functions

## Pistes de généralisation / revente future
- L'appli est potentiellement vendable à d'autres écoles de danses de couple (salsa, bachata, west coast swing, kizomba, rock...)
- Bases déjà présentes : guideur/guidée, niveaux, cours avec/sans partenaire (tango vs yoga), stages, tarifs paramétrables
- Pour généraliser : rendre configurables les intitulés de rôles (guideur/guidée → leader/follower ou custom), nombre de niveaux, disciplines, couleurs/logo
- **Pendant le développement** : éviter de hardcoder des éléments spécifiques au tango qui pourraient être des paramètres
- **Projet futur séparé** : une fois Tango & Vous terminé, créer un repo distinct basé sur ce projet mais généralisé, en vue d'une commercialisation à d'autres écoles de danse

## Workflow des inscriptions — réalité terrain
- **Stages, cours d'essai, demandes d'inscription tango** : certains sont validés directement sans attente admin (flow automatique)
- **Cours particuliers** : formulaire public → admin reçoit la demande, gère manuellement
- **Devis** : formulaire public `demande-devis.html` → admin reçoit la fiche → crée un devis dans `generateur-devis.html` → envoie par Gmail
- **Ajout dans Élèves Tango/Yoga toujours manuel et intentionnel** : un élève n'est inscrit que s'il a payé sur AssoConnect. L'appli n'a pas accès à AssoConnect — c'est l'admin qui vérifie le paiement puis ajoute l'élève manuellement. Ne pas automatiser.
- **Turnstile** : intégré sur demande-devis.html (widget retiré en iframe)

## Saisie des données — règle importante
À partir de la saison 2026-2027, **toutes les données entrent exclusivement par** :
1. **Formulaires publics** sur www.tangoetvous.com (essai tango, demande d'inscription tango, stages, essai yoga)
2. **Formulaires dans l'appli admin** (boutons "Inscrire" dans Élèves Tango, Inscriptions Tango, Stages, Yoga, etc.)
3. **Section Paramètres** de l'appli admin

Les imports SQL en masse (comme pour 2025-2026) ne doivent plus être nécessaires.
Claude ne saisit des données directement en SQL qu'exceptionnellement, sur demande explicite.

## Emails automatiques — catalogue complet (source : Code.gs legacy)

Tous ces emails sont **à implémenter via Brevo + Supabase Edge Functions**. Code.gs ne fonctionne plus.

### Cours d'essai Tango

**Fichier de référence** : `preview-emails-essai-v2.html`

#### Catalogue emails élève

| Code | Déclencheur | Statut élève | Destinataire | Contenu clé |
|------|-------------|--------------|--------------|-------------|
| **E0** | Toute inscription | — | Admin (tangoetvous@gmail.com) | Encadré or : nom/email/tel/rôle/cours/date/lieu + badge statut + boutons 📞/✉️/SMS/admin |
| **E1** | Inscription confirmée, date **>7j** à partir d'aujourd'hui | `confirme` | Élève | Bandeau vert · boîte cours bleue · livret (selon ville+niveau) · checklist débutants uniquement · boutons annuler/reporter · mention "rappel J-7 à venir" |
| **E2** | Guidée seule inscrite (toujours attente) | `attente` | Élève | Bandeau orange · boîte cours · encadré explication parité · bouton "Nous contacter" |
| **E-mod** | Admin modifie date/ville/niveau d'un essai (✏️ → `validerEditEssai`) | tout | Élève (+ partenaire si couple) | Bandeau bleu 📋 · boîte cours avec ancienne date barrée + nouvelle date en vert · bouton "✕ Annuler" · si couple même email → un seul email avec 2 prénoms |
| **E-J1a** | Admin clique ✓ **Présent** dans le Pointage → `presence_declaree=true` en DB · **cron GitHub Actions 7h UTC le lendemain** envoie l'email aux élèves `presence_declaree=true` de la veille | `confirme` | Élève | Bandeau vert ✓ · référence explicite au cours effectué (ville, niveau, date, horaire depuis params) · process inscription (demande → validation → paiement CB 1x/3x, chèque, espèces) · bouton "Demande d'inscription →" (formulaire public) · **pas de lien vers un autre cours d'essai** (une personne ne peut faire l'essai qu'une fois) |
| **E-J1b** | Admin clique 🚫 **Absent** dans le Pointage → `presence_declaree=false` en DB · **cron GitHub Actions 7h UTC le lendemain** envoie l'email aux élèves `presence_declaree=false` de la veille · élèves non pointés (`presence_declaree=null`) → pas d'email | `confirme` | Élève | Bandeau orange 💙 "Vous nous avez manqué" · référence au cours manqué (ville, niveau, date) · bouton "↩ Choisir une nouvelle date" (formulaire cours d'essai — car pas encore venu, l'essai n'a pas eu lieu) · note pas de pénalité · ne s'applique pas aux élèves réguliers du cours |
| **E4** | Déclencheur cron quotidien, J-7 avant la date du cours | `confirme` | Élève | Bandeau bleu 🗓 · boîte cours · **bouton vert "👍 Je confirme ma présence"** (au-dessus du livret) · boutons annuler/reporter · livret · checklist débutants uniquement. Couvre les élèves ayant reçu E1, E7, E15 ou E15b. |
| **E5** | Guideur seul ou couple, quota GUI≥22, **mois sept-nov uniquement** | `attente` | Élève | Bandeau orange · boîte cours · encadré "Ce créneau est complet pour votre rôle ce jour-là" · bouton reporter · "Nous contacter" |
| **E5b** | Couple, quota plein sur **un** rôle, sept-nov | `attente` | Les deux (ou email partagé → un seul) | Bandeau orange · encadré "complet pour l'un des deux rôles, confirmés ensemble dès qu'une place se libère" |
| **E6** | Inscription confirmée, date **≤7j** à partir d'aujourd'hui | `confirme` | Élève | Même structure que E1 MAIS **bouton vert "👍 Je confirme ma présence"** présent (pas de rappel J-7 futur), sans mention "rappel à venir" |
| **E7** | Utilisé uniquement dans le preview — alias de E6 | `confirme` | — | *Ancienne désignation conservée dans le fichier de preview pour clarté. En pratique = E6 (confirmation <7j). Ne pas utiliser E7 dans le code, utiliser E6.* |
| **E15** | Admin valide une personne en `attente` → `confirme` (solo ou couple emails distincts) | `confirme` | Élève (un email par personne) | Bandeau vert · "Suite à l'évolution des disponibilités…" · boîte cours · si >7j : mention rappel J-7 · si <7j : bouton 👍 confirmer présence · livret · checklist débutants |
| **E15b** | Admin valide un couple en `attente` avec **email partagé** | `confirme` | Les deux (un seul email envoyé) | "Bonjour Marie & Thomas" · bandeau vert "vous êtes tous les deux confirmés" · boîte cours avec les deux rôles côte à côte · même contenu que E15 |
| **J+1a** | Lendemain du cours, élève présent | `confirme` | Élève présent | "À bientôt sur la piste !" + lien inscription cours réguliers |
| **J+1b** | Lendemain du cours, élève absent | `confirme` | Élève absent | "On vous attend bientôt !" + lien formulaire cours d'essai |

#### Règles de détermination de l'email à envoyer à l'inscription
- Guidée seule → toujours `statut='attente'` → **E2**
- Guideur seul, quota GUI<22 (ou hors sept-nov) → `statut='confirme'` → **E1** ou **E6** selon délai
- Guideur seul, quota GUI≥22, mois sept-nov → `statut='attente'` → **E5**
- Couple (emails distincts), pas de quota → `statut='confirme'` pour les deux → **E1** ou **E6**
- Couple (emails distincts), quota plein sur un rôle, sept-nov → les deux en `attente` → **E5b** séparé × 2
- Couple (email partagé), pas de quota → `statut='confirme'` → **E1** ou **E6** (un email avec les deux noms)
- Délai <7j : E6 (avec bouton 👍 présent) ; délai ≥7j : E1 (bouton 👍 absent, rappel J-7 annoncé)

#### Auto-validation couple dans `valGuideeEssai()` (admin.html)
Quand l'admin valide une personne en attente, la fonction cherche son partenaire via :
```javascript
_normNom(x.prenom+' '+x.nom) === _normNom(entry.partenaire)
// + filtre : même date, niveau, ville, statut='attente', id différent
```
Si partenaire trouvé → `Promise.all([UPDATE entry, UPDATE partEntry])` — les deux passent à `statut='confirme', presence_confirmee:true` en parallèle.
**Email à déclencher** : si `entry.email === partEntry.email` → **E15b** (un email) ; sinon → deux **E15** séparés.

#### Propagation des modifications de date/ville/niveau dans `validerEditEssai()` (admin.html)
Le partenaire doit être trouvé **AVANT** de modifier l'état local (les champs de recherche `date/ville/niveau` auraient changé sinon) :
```javascript
// Trouver le partenaire sur les ANCIENNES valeurs
var partEntry = essai.find(x => x.date===e.date && x.niveau===e.niveau && x.ville===e.ville
  && _normNom(x.prenom+' '+x.nom) === _normNom(e.partenaire));
fermerContact();
// PUIS modifier l'état local
e.date=newDate; e.ville=newVille; e.niveau=newNiveau;
if(partEntry){ partEntry.date=newDate; ... }
// PUIS Promise.all([UPDATE e, UPDATE partEntry]) en DB
```

#### Contenus E1/E6/E15 — règles importantes
- **Livret** : `tev_params_<ville>_<sai>.livret.url_deb` ou `url_int` selon ville + niveau — jamais hardcodé
- **Checklist** (arrivée 5min, chaussures lisses, tenue) : **débutants uniquement** — ne pas inclure pour intermédiaires
- **Bouton 👍** : présent dans E4, E6, et E15/<7j — absent dans E1 et E15/>7j
- **Ordre dans E4 et E6** : boîte cours → **👍 confirmer** → annuler/reporter → livret → checklist
- **Adresse** : depuis `tev_params_<ville>_<sai>.adresse` — jamais hardcodée

#### Actions élève via email (liens Worker API)
- **👍 Je confirme ma présence** → `PATCH /api/essai/confirmer?id=...&token=...` → `presence_confirmee=true`
- **✕ Annuler** → `GET /api/essai/annuler?id=...&token=...` → RPC SECURITY DEFINER `confirmer_annuler_essai(p_action='annuler')` → `UPDATE statut='supprimé'` (+ `statut_avant_suppression`) → **la fiche apparaît grisée en bas du cours dans Pointage/Par date + dans le nouvel onglet 🗑 Supprimés** + notification admin (panel 🔔 + email + push). Cf. session 2026-05-23 (suite 4).
- **↩ Reporter** → redirige vers le formulaire cours d'essai (`#URL_FORMULAIRE_ESSAI_A_RENSEIGNER` — à mettre à jour)

**Pas de push OS élève pour les emails essai tango** (E1, E2, E4, E5, E5b, E6, E7, E15, E15b, E-mod, E-J1a, E-J1b) — les personnes en cours d'essai ne sont pas encore élèves et n'ont pas la PWA installée.

### Stages

**Fichier de référence** : `preview-emails-stages-v1.html`

#### Règles fondamentales
- **Pas de quota de places pour les stages** — `type_confirmation='attente'` uniquement pour la parité guidées, jamais pour une capacité maximale.
- **Un email par ligne DB** = un email par date de stage par personne. Inscription à 3 dates → 3 emails S1 distincts.
- **Pas de double rôle** dans le formulaire stages (abandonné).
- **Rôles stockés** : `'Guideur(se)'` ou `'Guidé(e)'` (format avec parenthèses).
- **Couple — slots peuvent différer** : Thomas et Marie peuvent choisir des stages différents le même jour. Chaque personne ne voit dans son email **que ses propres slots**.
- **Couple email partagé** (`partenaire_email === email`) → un seul email "Bonjour Thomas & Marie" avec deux sections (chacun ses slots). Sinon → deux emails séparés.
- **Délai ≤3 jours** : l'email de confirmation (S1/S3) contient directement le bouton 👍, pas de mention "rappel à venir".
- **Délai >3 jours** : S1 et S3 mentionnent "Vous recevrez un rappel 3 jours avant le stage."
- **Objet** : `Stage Tango & Vous — [Jour JJ Mois] · [HH:MM–HH:MM]` (plage horaire globale de SES slots ce jour-là).
- **Toutes les données depuis `tev_params_stages_<sai>`** : thèmes, horaires, tarifs, adresse — zéro hardcodé. Tarifs : `st.tarifs || tev_params_stages_<sai>.tarifs`. Adresse : `st.adresse || tev_params_stages_<sai>.adresse`.
- **Horaires par date — baked à l'inscription** : dans `stages-pwa.html`, `buildSlots(st)` calcule `hor(k) = st.horaires[k] || DEFAULTS_HORAIRES_STAGES[k]` au moment de la soumission. Les horaires réels (y compris les overrides par date configurés dans Paramètres → Stages) sont stockés tels quels dans `donnees.stagesDetail[i].horaire` (ex : `'16h–18h'`). La future Edge Function d'envoi email lit ces horaires depuis la DB — **pas depuis les Paramètres courants**. Conséquence : si l'admin modifie les horaires d'une journée après que des inscriptions ont déjà été prises, les emails de rappel (S4) enverront les horaires de l'époque de l'inscription. C'est le comportement attendu ; en cas de changement tardif, envoyer un email de modification manuellement.
- **Horaires par défaut (`DEFAULTS_HORAIRES_STAGES` dans `stages-pwa.html`)** : Technique `14h–15h` · Stage 1 `15h–16h30` · Stage 2 `16h30–18h` · Stage 3 `11h30–13h` · Stage 4 `10h–11h30`. Overridables par journée via Paramètres → Stages → Horaires.
- **Paiement** : "Le règlement se fait sur place. Merci de prévoir l'appoint." — ne jamais préciser le mode de paiement.
- **`presence_confirmee`** : colonne à ajouter à `inscriptions_stages` via `ALTER TABLE inscriptions_stages ADD COLUMN IF NOT EXISTS presence_confirmee BOOLEAN NOT NULL DEFAULT FALSE;`
- **`presence_declaree` dans `inscriptions_essai`** : colonne nullable distincte de `presence_confirmee` — `NULL` = non pointé, `true` = admin cliqué ✓ Présent, `false` = admin cliqué 🚫 Absent. Permet au cron E-J1a/J1b de distinguer "absent déclaré" de "jamais pointé". SQL : `ALTER TABLE inscriptions_essai ADD COLUMN IF NOT EXISTS presence_declaree BOOLEAN DEFAULT NULL;`. ✅ Exécuté. `pointerEssai` dans admin.html écrit **uniquement** `presence_declaree` (pas `presence_confirmee` — réservé à la confirmation email élève).
- **`presence_declaree` dans `inscriptions_essai_yoga`** : même logique exacte que tango. SQL : `ALTER TABLE inscriptions_essai_yoga ADD COLUMN IF NOT EXISTS presence_declaree BOOLEAN DEFAULT NULL;`. ✅ Exécuté. `pointerYoga(date, email, present, id)` dans admin.html écrit `presence_declaree`. `_mapEssai` dans `tev-supabase.js` mappe `presence_declaree → present` — partagé entre tango et yoga.
- **Cron E-J1a/J1b** : workflow `.github/workflows/essai-j1.yml` — cron `0 7 * * *` UTC (9h Paris été) → POST `https://app.tangoetvous.fr/api/cron/essai-j1` avec header `X-Cron-Secret`. Secret `CRON_SECRET` à configurer dans : GitHub → Settings → Secrets → Actions ET Cloudflare Workers → Settings → Variables → Secret variables. Worker route : `handleCronEssaiJ1` → requête Supabase pour `date_essai=hier AND presence_declaree IS NOT NULL` → Brevo emails.
- **Cron Y-J1a/J1b** : workflow `.github/workflows/essai-yoga-j1.yml` — même cron `0 7 * * *` UTC → POST `https://app.tangoetvous.fr/api/cron/essai-yoga-j1`. Worker route : `handleCronEssaiYogaJ1` → `inscriptions_essai_yoga` filtrée sur `date_essai=hier AND presence_declaree IS NOT NULL` → Y-J1a (présent) ou Y-J1b (absent) via Brevo → `regardsepose@gmail.com`.
- **Clic bouton 👍** → `PATCH /api/stages/confirmer?id=...&token=...` → `presence_confirmee=true` → 👍 sur la fiche admin Stages.

#### Catalogue emails élève

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **S0** | Toute inscription (une notif par date) | Admin (tangoetvous@gmail.com) | Header vert foncé · encadré or : nom/email/tel/rôle/date/slots+thèmes/prix · statut (confirmé ou attente) · boutons 📞/✉️/SMS/admin |
| **S1** | `type_confirmation='confirme'`, **>3 jours** avant la date | Élève (ou couple email partagé) | Bandeau vert · stage-box avec slots + lieu + total + note paiement · "Vous recevrez un rappel 3 jours avant le stage" |
| **S-admin** | Admin inscrit directement depuis l'onglet Stages (pas le formulaire public) | Élève | **Même template que S1 ou S1b** selon le délai — pas de template distinct. Note dans l'email : "Votre inscription a été enregistrée par l'équipe Tango & Vous." au lieu de la formulation formulaire public. |
| **S-cancel** | Admin annule une inscription stage (un créneau ou toute la journée) | Élève | Bandeau orange ✕ · stage-box rouge "STAGE ANNULÉ" avec slots barrés · bouton "Voir les prochains stages →" (`stages-pwa.html`) · Push : "✕ Votre inscription au stage du [date] a été annulée" |
| **S1b** | `type_confirmation='confirme'`, **≤3 jours** avant la date | Élève | Identique S1 sans mention rappel + bouton 👍 + encadré texte parité |
| **S2** | `type_confirmation='attente'` (guidée seule) | Élève | Bandeau orange · stage-box · encadré parité : "Nous veillons à avoir autant de guideurs que de guidées. Votre inscription sera confirmée selon l'équilibre des inscrits." |
| **S3** | Admin valide depuis attente → `confirme`, **>3j** | Élève | Bandeau vert · "Bonne nouvelle !" · "Suite à l'évolution des inscriptions…" · stage-box · mention rappel J-3 |
| **S3b** | Admin valide depuis attente → `confirme`, **≤3j** | Élève | Idem S3 + bouton 👍 + encadré texte parité |
| **S4** | Cron quotidien, J-3 avant la date | Élève `confirme` | Bandeau bleu 🗓 "Rappel — votre stage a lieu dans 3 jours !" · stage-box complète avec slots · bouton vert 👍 "Je confirme ma présence" · encadré texte : "Merci de confirmer votre présence. Si vous devez annuler votre venue merci de nous prévenir, même au dernier moment car nous faisons en sorte d'avoir la parité guideurs/guidés." |

#### Structure stage-box (= récap formulaire)

Pour chaque date inscrite, l'email contient :
```
📅 [Jour JJ Mois AAAA]

[Prénom NOM — Guideur·se]            ← SES slots uniquement
  • HH:MM–HH:MM — [Thème] (Technique / Stage 1 / Stage 2 / …)
  Prix : [N]€ — [N] stage(s)

[Si couple email partagé — Prénom NOM — Guidé·e]  ← SES slots (peuvent différer)
  • HH:MM–HH:MM — [Thème]
  Prix : [N]€

Total à régler sur place [le Jour JJ Mois] : [total]€
Le règlement se fait sur place. Merci de prévoir l'appoint.

📍 [Nom lieu]
   [Rue] · [Accès transport]
```

**Sources** : slots + thèmes depuis `donnees.inscriptionsParDate[i].stagesDetail[]` (ligne principale), ou `stage_nom.split('|')` × `tev_params_stages_<sai>.dates[date].slots[j]` (ligne partenaire). Tarifs : `tev_params_stages_<sai>.dates[date].tarifs || tev_params_stages_<sai>.tarifs`. Adresse : `tev_params_stages_<sai>.dates[date].adresse || tev_params_stages_<sai>.adresse`.

#### Notifications admin temps réel (stages)

**3 canaux** — déclenché à chaque `message.type === 'stageInscription'` reçu via BroadcastChannel :

**Canal 1 — Toast** (bas d'écran, 3s) :
```
🎭 Nouvelle inscription stage : Prénom NOM
```

**Canal 2 — Panel 🔔** (onglet Notifications, table `notifications`, badge rouge si non lues) :

| Scénario | Couleur fond / bordure | Message |
|----------|----------------------|---------|
| Solo guideur, confirmé | vert `#0f1f0f` / `#4caf50` | `🎭 Inscription stage — Prénom NOM` · Jour JJ Mois · Guideur·se · Seul·e · ✓ Confirmé·e · Email S1 envoyé · → Stages |
| Couple emails distincts, confirmé | vert `#0f1f0f` / `#4caf50` | `🎭 Inscription stage — Prénom & Prénom NOM` · Jour JJ Mois · En couple · Emails distincts · ✓ Confirmés · Emails S1 ×2 |
| Couple email partagé, confirmé | vert `#0f1f0f` / `#4caf50` | `🎭 Inscription stage — Prénom & Prénom NOM` · Jour JJ Mois · En couple · Email partagé · Email S1d ×1 |
| Plusieurs dates | vert `#0f1f0f` / `#4caf50` | `🎭 Inscription stage — Prénom NOM` · N dates : JJ avr. · JJ mai… · ✓ Confirmé·e · Emails S1 ×N |
| Présence confirmée via 👍 (S4) | vert clair `#0f2a0f` / `#66bb6a` | `👍 Présence confirmée — Prénom NOM` · Stage Jour JJ Mois · badge 👍 sur la fiche → Stages |
| Guidée seule, attente | jaune `#1f1800` / `#e8c84a` | `🎭 Demande stage — Prénom NOM` · Jour JJ Mois · Guidée · ⏳ Att. validation — parité · Email S2 envoyé · → Stages → Att. Validation |

**Canal 3 — Push OS** (bulle navigateur, visible même onglet fermé — **à implémenter**) :
```
Tango & Vous — Admin
🎭 Inscription stage — Prénom NOM · Samedi JJ Mois
app.tangoetvous.fr
```
Variante attente : `🎭 Demande stage — Prénom NOM · Samedi JJ Mois · ⏳ Att. validation`

#### Notifications élève stages

**2 canaux** :

**Canal 1 — In-app** (icône 🔔 header espace élève, table `notifications_eleve`) :

| Déclencheur | Message |
|-------------|---------|
| S1 / S1b envoyé | `🎭 Votre inscription au stage du [Jour JJ Mois] est confirmée` |
| S3 / S3b envoyé | `🎭 Bonne nouvelle — votre place au stage du [Jour JJ Mois] est confirmée !` |
| S4 envoyé (cron J-3) | `📅 Rappel : votre stage a lieu dans 3 jours — [Jour JJ Mois] · [HH:MM–HH:MM]` |

**Canal 2 — Push OS** (même timing que l'email correspondant) :

| Déclencheur | Titre | Corps |
|-------------|-------|-------|
| S1 / S1b | `Tango & Vous` | `🎭 Votre stage du [Jour JJ Mois] est confirmé !` |
| S3 / S3b | `Tango & Vous` | `🎭 Bonne nouvelle — votre place au stage du [Jour JJ Mois] est confirmée !` |
| S4 (cron J-3) | `Tango & Vous` | `📅 Votre stage a lieu dans 3 jours — [Jour JJ Mois] · [HH:MM–HH:MM]` |

### Essai yoga

**Fichier de référence** : `preview-emails-yoga-v1.html`

#### Règle branding yoga — obligatoire pour tous les emails yoga envoyés aux élèves/participants
- **Header** : `COURS DE YOGA AVEC FLORENCIA GARCIA` (pas "Tango & Vous")
- **Signature** : `Florencia Garcia / Association Le Regard Se Pose / Ma Page YOGA (https://www.tangoetvous.com/cours-de-yoga) / garciabraitbart@gmail.com · 06 63 23 35 70`
- **Footer** : lien `/cours-de-yoga` + `garciabraitbart@gmail.com`
- **Objet** : `— Cours de yoga avec Florencia Garcia` (pas `— Tango & Vous`)
- **Interdit** dans les emails yoga : `tangoetvous@gmail.com`, `07 73 27 59 06`, `Tango & Vous`, `Florencia et Jérémy`, `Florencia Garcia et Jérémy Braitbart`
- **Exception** : les 3 push OS admin (`Tango & Vous — Admin`) conservent ce nom (= nom de l'appli, pas un email)

#### Règles fondamentales
- **Pas de notion de rôle ni de couple** — individuel uniquement.
- **Inscription automatique** — pas de validation manuelle admin. Si une place est disponible (max 14 / cours), `statut='confirme'` dès l'inscription. Email Y1 envoyé immédiatement.
- **Email admin yoga** : `regardsepose@gmail.com` (pas `tangoetvous@gmail.com`)
- **Table** : `inscriptions_essai_yoga` (distincte de `inscriptions_essai`).
- **Cours** : `'yin'`, `'hatha'`, ou `'forfait'` (forfait = yin + hatha les deux jours).
- **Gratuit** : les 2 premiers cours de septembre de chaque saison (`estGratuit()` dans le formulaire).
- **Tarif** : depuis `tev_params_yoga_<sai>.tarifs.yoga_essai` — zéro hardcodé, zéro valeur par défaut.
- **Horaires + lieu** : depuis `tev_params_yoga_<sai>.horaires` et `.adresse` — zéro hardcodé.
- **Livrets** : `tev_params_yoga_<sai>.livret.url_yin` / `url_hatha` — jamais hardcodés.
- **Lien AssoConnect yoga** : depuis `tev_liens_assoconnect[saison].yoga` (clé Supabase `tev_liens_assoconnect`, objet `{saison: {yoga: url}}`) — configuré dans Paramètres → AssoConnect → Yoga. ⚠️ Clé distincte de `tev_params_yoga_<sai>` — utilisé dans Y-J1a.
- **Action élève via email** : `PATCH /api/essai-yoga/confirmer?id=...&token=...` → `presence_confirmee=true` → **badge 👍 sur la fiche admin Yoga → Essai yoga**.
- **Quotas yoga — deux niveaux** :
  - **Niveau 1 — cours régulier plein** : `cours_yoga` ≥ 14 inscrits pour ce cours (yin ou hatha) sur la saison → `statut='attente'` dans `inscriptions_essai_yoga` → email **Y-att** → admin valide manuellement si une place se libère
  - **Niveau 2 — date spécifique pleine** : total ≥ 14 pour cette date (inscrits réguliers non absents + essais ce jour) → email **Y-full** → redirection vers `essai-yoga.html` pour choisir une autre date — pas d'INSERT ou INSERT avec statut spécial
- **Y2 obsolète** : Y2 n'est plus envoyé automatiquement (l'inscription est directement confirmée via Y1). Y2 peut être renvoyé manuellement depuis la fiche admin si nécessaire.
- **Pas de tarifs dans les emails élève** : les emails Y1, Y2, Y3, Y-mod, Y-J1a ne contiennent pas de tarifs. Seul Y0 (admin) indique le tarif essai. Y-J1a affiche les tarifs des cours réguliers.

#### Catalogue emails élève

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **Y0** | Toute inscription (confirmée) | Admin (regardsepose@gmail.com) | Header admin · encadré or : nom/email/tel/cours/date/tarif essai/statut · badge ✓ Confirmé·e automatiquement · note "Inscription automatique" · boutons 📞/✉️/SMS/admin |
| **YI0** | Inscription directe par l'admin | Admin (regardsepose@gmail.com) | Header admin · encadré or : nom/email/tel/cours/saison/paiement/montant · badge ✓ Inscrit·e · "Email YI1 peut être envoyé manuellement" |
| **Y1** | Inscription confirmée automatiquement (place disponible) | Élève | Bandeau vert ✓ · yoga-box (cours, date, horaire, lieu) · encadré prévenance annulation · bouton "Nous contacter" · **pas de tarifs** |
| **Y-att** | Cours régulier plein (≥14 dans `cours_yoga` pour ce cours) | Élève | Bandeau orange ⏳ · yoga-box avec badge "⏳ Liste d'attente" · encadré "Cours limités à 14 participants, des places se libèrent parfois" · bouton "Nous contacter" · `statut='attente'` en DB |
| **Y-full** | Date d'essai pleine (≥14 total ce jour-là) | Élève | Bandeau orange ⏳ · yoga-box avec date barrée (rouge) + yoga-total rouge "Complet (14/14)" · encadré explication · bouton vert "↩ Choisir une autre date" → `essai-yoga.html` |
| **Y2** | ~~Plus envoyé automatiquement~~ — renvoi manuel uniquement si nécessaire | Élève | Bandeau vert ✓ · yoga-box · si >3j : "rappel J-3 à venir" · si ≤3j : bouton 👍 + encadré prévenance |
| **Y3** | Cron quotidien, J-3 avant la date | Élève `confirme` | Bandeau bleu 🗓 · yoga-box · bouton 👍 vert · encadré orange "En cas d'empêchement, prévenez-nous même au dernier moment" · clic 👍 → badge 👍 sur fiche admin |
| **YI1** | Inscription régulière validée | Élève | Bandeau vert ✓ Bienvenue · yoga-box avec horaires hebdomadaires · encadré jaune "🏛 Adhésion à l'Espace Sorano" (texte renvoi lien ultérieur — **⚠️ TODO : ajouter le lien Sorano quand l'utilisateur le fournit**) · checklist (tenue, tapis, ponctualité) · lien livret depuis params |
| **Y-mod** | Admin modifie date/cours d'un essai yoga (✏️) | Élève | Bandeau bleu 📋 · yoga-box avec ancienne date barrée + nouvelle date en vert · bouton "Nous contacter" |
| **Y-J1a** | Cron lendemain essai yoga · élève présent | Élève | Bandeau vert ✓ · yoga-box "Rejoindre les cours réguliers" (yin/hatha/forfait avec tarifs réels 340€/500€) · bouton AssoConnect depuis `tev_liens_assoconnect[saison].yoga` |
| **Y-J1b** | Cron lendemain essai yoga · élève `confirme` non présent non annulé | Élève | Bandeau orange 💙 "Vous nous avez manqué" · bouton "↩ Choisir une nouvelle date" (`essai-yoga.html`) · note pas de pénalité |

#### Notifications admin yoga (3 canaux)

**Toast** : `🧘 Essai yoga confirmé : Marie DUPONT`

**Panel 🔔** (table `notifications`) :

| Scénario | Couleur | Message |
|----------|---------|---------|
| Nouvel essai yoga (auto-confirmé) | vert `#0f1f0f`/`#4caf50` | `🧘 Essai yoga — Marie DUPONT · Mardi 15 sept. · Yin yoga · ✓ Confirmé·e automatiquement · Email Y1 envoyé · → Yoga → Essai` |
| Liste d'attente (cours régulier plein) | jaune `#1f1800`/`#e8c84a` | `🧘 Essai yoga — Sophie MARTIN · Mardi 22 sept. · Yin yoga · ⏳ Cours complet (14/14) — Liste d'attente · Email Y-att envoyé · → Yoga → Essai yoga → Liste d'attente` |
| Présence confirmée 👍 (Y3) | vert clair | `👍 Présence confirmée — Marie DUPONT · Essai yoga Mardi 15 sept. · badge 👍 sur la fiche` |

**Push OS admin** : `🧘 Essai yoga — Marie DUPONT · Mardi 15 sept. · Yin yoga · ✓ auto`
**Push OS admin (attente)** : `🟡 Essai yoga — Sophie MARTIN · Mardi 22 sept. · Yin yoga · ⏳ Cours complet — liste d'attente`

#### Notifications élève yoga (2 canaux)

**In-app** (table `notifications_eleve`) :

| Déclencheur | Message |
|-------------|---------|
| Y1 envoyé (confirmation auto) | `🧘 Votre essai yoga du Jeudi 24 septembre est confirmé` |
| Y3 envoyé (cron J-3) | `📅 Rappel : votre essai yoga a lieu dans 3 jours — Jeudi 24 sept. · [horaire depuis params]` |

**Pas de push OS élève pour les emails essai yoga** (Y1, Y2, Y3, Y-mod, Y-J1a, Y-J1b) — les personnes en cours d'essai ne sont pas encore élèves et n'ont pas la PWA installée.

---

### Inscription cours tango régulier

**Fichier de référence** : `preview-emails-inscription-v1.html`

#### Règles métier emails — rappel
- **Quota toute l'année** (≠ essai qui limite seulement sept-nov) : CAP_GUI=22, CAP_GDE=23
- **Guidée seule** dans tous ses cours → `statut='demande'` → email I01-att
- **Guideur seul ou couple** → `statut='attente_paiement'` → email I01-val avec bouton AssoConnect
- **Couple + quota plein sur un rôle** → les DEUX en `demande` → email I01-quota-att (pas de traitement séparé)
- **2 cours** → 2 emails distincts par personne, quotas vérifiés indépendamment par cours (`_quotaFullArr[0/1]`)
- **Email différent obligatoire** : en couple, les deux partenaires doivent avoir des adresses email différentes sur AssoConnect (avertissement en rouge dans l'encadré "Quelques précisions")
- **⚠️ Avertissement pourboire (2026-07-13)** : dans TOUS les emails élève « demande validée » (I01-val/couple/vinc, I17, **I02**, **T1-val**), l'avertissement pourboire AssoConnect est un **encadré rouge dédié** (`background:#fff0f0;border:2px solid #c62828`) placé **juste sous le bouton d'inscription** — plus dans le bloc « Quelques précisions ». Texte : « ⚠️ AssoConnect propose un pourboire de façon insistante — vous n'êtes pas du tout obligé·e de le payer. Au moment du paiement, ce montant est **pré-rempli** : **remplacez-le par 0 €**. » Le bouton est nommé « 🔗 RÉGLER MON INSCRIPTION AU COURS DE TANGO sur AssoConnect » (libellé fixe, sans année — plus clair sur l'action à faire ; maj 2026-07-13) (les 3 handlers `handleNotifyInscriptionCours`/`handleNotifyInscriptionCoursValidee`/`handleNotifyEssaiAction` + previews `preview-emails-inscription-v1.html` et `preview-emails-a-valider-v1.html`, tenus synchronisés). But : trop d'élèves payaient le pourboire → rendre l'avertissement impossible à rater au moment du clic. **⚠️ Décision (2026-07-13) : NE PAS désactiver le pourboire côté AssoConnect** — si le pourboire est retiré, AssoConnect se rémunère en prélevant un pourcentage à l'association. Le pourboire (payé volontairement par certains adhérents) évite ces frais. La stratégie retenue est donc **uniquement pédagogique** : prévenir les élèves clairement (encadré rouge sous le bouton + futur guide illustré) pour qu'ils mettent 0 € en connaissance de cause. Ne jamais proposer de le désactiver.
- **Lien AssoConnect 2026-2027** : `https://le-regard-se-pose.assoconnect.com/collect/description/695654-a-inscription-aux-cours-de-tango-argentin-avec-florencia-garcia-jeremy-braitbart-septembre-2026-juin-2027`
- **Livrets** : depuis `tev_params_paris/vincennes_<sai>.livret.url_deb/url_int` — jamais hardcodés
- **Adhésion Sorano** : encadré jaune "🏛 Adhésion à l'Espace Sorano" dans les emails Vincennes. Lien `#LIEN_SORANO_A_RENSEIGNER` — à mettre à jour quand l'utilisateur fournit l'URL
- **Dates** : depuis `tev_cours_dates` en Supabase (clé `tev_params_paris/vincennes_<sai>`) — jamais hardcodées, pas de valeur par défaut

#### Catalogue emails élève

| Code | Déclencheur | Statut | Destinataire | Objet email |
|------|-------------|--------|--------------|-------------|
| **I01-att** | Guidée seule dans tous ses cours | `demande` | Élève | "Votre demande d'inscription au tango — liste d'attente" · bandeau orange · encadré explication parité · 3 options (attente / autre créneau / cours d'essai → `#URL_FORMULAIRE_ESSAI_A_RENSEIGNER`) |
| **I01-val** | Guideur seul ou couple, pas de quota | `attente_paiement` | Élève (+ partenaire si email renseigné) | "Votre inscription au tango [saison]" · bandeau vert · cours-box (cours, saison, rôle, partenaire) · bouton AssoConnect · "Quelques précisions" (modes de paiement + avertissement emails différents) · livret |
| **I01-vinc** | Idem I01-val mais cours Vincennes | `attente_paiement` | Élève | Idem + encadré jaune "🏛 Adhésion à l'Espace Sorano" avant le bouton AssoConnect |
| **I01-quota-att** | Couple, quota plein sur un rôle | `demande` | Les DEUX (élève + partenaire) | "Votre demande d'inscription au tango en couple — liste d'attente" · bandeau orange · encadré "Ce cours est actuellement complet pour les guideur·se·s. Vous serez confirmé·e·s tous les deux ensemble." |
| **I01-complet** | Couple ou solo, les deux quotas atteints | `demande` | Élève (+ partenaire) | "Votre demande d'inscription au tango — cours complet, liste d'attente" · "Ce cours affiche complet pour les guideur·se·s et les guidé·e·s." · mêmes 3 options que I01-att |
| **I01 · 2 cours** | Inscription à 2 cours | selon quota par cours | Élève (+ partenaire·s) | 2 emails distincts — un par cours — avec mention "cours 1/2" et "cours 2/2" + note verte signalant l'autre cours. Quota indépendant : C1 peut être en attente et C2 validé pour la même personne |
| **I17** | Mode pré-inscription (mai-août) | `attente_paiement` ou `demande` | Élève | "Votre pré-inscription tango [saison suivante]" · même structure que I01-val mais badge saison prochaine + mention "reprise en septembre" |
| **I02** | Admin valide guidée → `attente_paiement` | `attente_paiement` | Élève | "Votre demande d'inscription au tango est validée" · même structure que I01-val (bouton AssoConnect + Quelques précisions) |
| **I03** | Admin valide le paiement → `inscrit` | `inscrit` | Élève | "Votre inscription est confirmée, à bientôt !" · **une cours-box par cours** (titre "COURS 1 — PARIS DÉBUTANTS" si 2 cours, sinon "VOTRE INSCRIPTION CONFIRMÉE") · section PWA violet · **un bouton livret par (ville, niveau) distinct** · signature. Body : `{ email, prenom, nom, saison, coursInfos: [{ville, niveau, role}] }` (backward compat : `ville, niveau, role` au niveau racine si mono-cours). Sujet et preheader s'adaptent au singulier/pluriel. |
| **I04** | Admin modifie le cours d'un élève inscrit (✏️ → `validerChangementCours`, changement ville/niveau) | `inscrit` | Élève | Bandeau bleu 📋 · cours-box avec ancien cours barré + nouveau cours en vert · contact button · Push : "📋 Votre inscription a été modifiée : Paris Débutants → Paris Intermédiaires" |

#### Email admin (I0)

| Code | Déclencheur | Destinataire | Contenu |
|------|-------------|--------------|---------|
| **I0** | Chaque nouvelle demande/inscription | tangoetvous@gmail.com | Header vert foncé (`#0d2b0d`, `#2e7d32`) pour distinguer des emails essai (or). Encadré or : nom/email/tel/rôle/cours/statut. Boutons : 📞 Appeler · ✉️ Gmail · 💬 SMS · Ouvrir l'admin. Pour 2 cours : 2 encadrés or distincts (un par cours). |

#### Notifications admin temps réel (inscriptions tango régulier)

**3 canaux** — déclenché à chaque `message.type === 'coursInscription'` reçu via BroadcastChannel :

**Canal 1 — Toast** (bas d'écran, 3s, `afficherToast`) :
```
🔔 Nouvelle inscription (Cours régulier) : Prénom NOM
```
Pas de détail statut dans le toast — sert uniquement d'alerte visuelle immédiate.

**Canal 2 — Panel 🔔** (onglet Notifications, table `notifications`, badge rouge si non lues) :

| Scénario | Couleur fond / bordure | Message |
|----------|----------------------|---------|
| Guideur seul, att. paiement | vert `#0f1f0f` / `#4caf50` | `🎓 Nouvelle inscription tango — Prénom NOM` · Paris Débutant · Guideur·se · Seul·e · ✓ Att. paiement · Email I01 envoyé · → Inscriptions Tango → Att. Paiement |
| Couple, att. paiement | vert `#0f1f0f` / `#4caf50` | `🎓 Nouvelle inscription tango — Prénom & Prénom NOM` · En couple · ✓ Att. paiement · Emails I01 envoyés ×2 |
| Guidée seule, att. validation | jaune `#1f1800` / `#e8c84a` | `🎓 Demande inscription tango — Prénom NOM` · Guidée · Seule · ⏳ Att. validation — parité guidées · Email I01-att envoyé · → Att. Validation |
| Couple quota plein, att. validation | jaune `#1f1800` / `#e8c84a` | `🎓 Demande inscription tango — Prénom & Prénom NOM` · En couple · ⏳ Att. validation — cours complet guideurs · Emails I01-quota envoyés ×2 |
| 2 cours, les 2 ok | vert `#0f1f0f` / `#4caf50` | `🎓 Nouvelle inscription tango — Prénom NOM (2 cours)` · C1 + C2 · En couple (×2) · ✓ Att. paiement · Emails I01 envoyés ×4 |
| 2 cours, statuts mixtes | vert+jaune / `#555` (lue) | C1 att. validation (quota) · C2 att. paiement · Emails envoyés séparément |

**Canal 3 — Push OS** (bulle navigateur, visible même onglet fermé — **à implémenter**, nécessite VAPID key + `fcm_tokens` + Edge Function) :
```
Tango & Vous
🎓 Nouvelle inscription — Prénom NOM · Cours · statut
app.tangoetvous.fr
```

### Transfert essai → inscription tango

**Fichier de référence** : `preview-emails-a-valider-v1.html`

#### Déclencheur — chemin exact dans l'admin
1. Dans l'onglet **Essai Tango**, cliquer sur le **nom** d'un·e élève → fiche modale s'ouvre
2. Cliquer **"Demande en att."** (→ statut `demande`) ou **"Validé·e"** (→ statut `attente_paiement`)
3. Une fenêtre s'ouvre pour sélectionner le cours d'inscription (ville + niveau)
4. L'admin coche le cours et enregistre → la personne passe d'Essai Tango vers **Inscriptions Tango**

| Code | Statut résultant | Cas | Destinataire | Contenu clé |
|------|-----------------|-----|--------------|-------------|
| **T1-dem** | `demande` | Guidée seule → att. validation admin | Élève + Admin | Admin : encadré or (nom/email/tel/rôle/cours/statut). Élève : bandeau orange ⏳ · boîte cours (cours + statut "En attente de validation") · encadré "Nous veillons à maintenir l'équilibre guideurs/guidées, vous recevrez une confirmation dès validation" |
| **T1-val** | `attente_paiement` | Guideur ou couple → att. paiement | Élève + Admin | Admin : encadré or (nom/email/tel/rôle/cours/statut ✓). Élève : **quasi-identique à I01-val** avec mention du cours d'essai dans l'intro (voir détail ci-dessous) |

#### Email T1-val élève — contenu complet (quasi-I01-val)
- Bandeau vert ✓ "Votre inscription au tango est validée — finalisez votre inscription"
- Intro : "Suite à votre cours d'essai, nous sommes ravis de vous accueillir dans nos cours de tango pour la saison..."
- **Boîte cours** (fond bleu #e8f4fd) : cours / prochain cours (date) / heure / lieu (adresse + métro) / rôle (badge couleur) / statut ✓ Validé·e
- **Bouton AssoConnect** (or) + note "Votre place sera réservée une fois l'inscription en ligne et le premier paiement effectués."
- **Quelques précisions** (fond gris #f9f9f9) : avertissement 2 emails différents en couple (encadré rouge), étapes AssoConnect ("J'adhère"), moyens de paiement (CB 1×/3×, espèces, chèque), note pourboire 0€
- **Bouton livret** (contour bleu) : `📖 Télécharger le livret [Niveau] [Ville]` → URL depuis `tev_params_<ville>_<sai>.livret.url_deb/url_int`
- Signature + footer standard Tango & Vous

---

### Cartes 10 cours

**Fichier de référence** : `preview-emails-cartes-v1.html`

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **C1** | Premier pointage de la saison sur une carte10 | Élève | Bandeau vert ✓ Bienvenue · carte-box (cours, 1/10, date début, expiration estimée) · section PWA (installer l'app, pointer, suivre) · bouton "Accéder à mon espace élève →" |
| **C2** | Élève clique "↻ Renouveler sans payer" (carte à 10/10) | Élève | Bandeau orange ⚠️ · carte-box (0/10, ⚠️ Non payée) · encadré "Finalisez votre paiement sur AssoConnect" · bouton AssoConnect `#LIEN_ASSOCONNECT_RENOUV` |
| **C2b** | Admin clique "Non payé" dans la modal Renouveler (Cartes 10 → Détails) | Élève | Identique C2 — bandeau orange ⚠️ · carte-box (0/10, ⚠️ Non payée) · bouton AssoConnect renouv |
| **C3 (E10)** | Admin choisit "Payé" dans la modal Renouveler → valide "✓ Enregistrer le paiement" | Élève | Bandeau vert ✓ · carte-box (0/10, cours, saison) · "À très bientôt !" · bouton espace élève |
| **C4** | Cron : lendemain du dernier cours Paris de juin | Élèves avec cours restants **ET carte non expirée** | Bandeau bleu 📅 · "Il vous reste N cours — pré-inscrivez-vous avant le 25 août" · "Il vous suffit de régler l'adhésion à notre association pour l'instant." · lien AssoConnect pré-inscriptions · avertissement expiration fin août |
| **C5** | Cron quotidien le 25 août | Élèves avec cours restants **ET carte non expirée**, non ré-inscrits | Bandeau orange ⚠️ Dernier rappel · "Ces cours expireront le 31 août si vous ne vous réinscrivez pas" · bouton AssoConnect |

**⚠️ Règle permanente C4/C5 — QUADRUPLE condition de ciblage** (corrigé 2026-07-08) : les crons de proposition de report (`handleCronFinSaisonC4`/`C5`) ne doivent cibler que les cartes vérifiant **SIMULTANÉMENT** :
1. **Cours restants > 0** (`carte_restants=gt.0`)
2. **Non expirée** (`or=(carte_expiration.gte.<aujourd'hui Paris>,carte_expiration.is.null)`) — ⚠️ `carte_statut IN (Active, Nouvelle carte)` NE garantit PAS la non-expiration (date séparée `carte_expiration`). `carte_expiration=null` (carte jamais démarrée) = non expirée → incluse.
3. **Réellement dans « Cartes 10 → Pointage »** = a au moins une inscription active (`inscriptions_cours` statut=`inscrit`) dans la saison (helper `_emailsInscritsActifs`). ⚠️ Une carte supprimée peut laisser `eleves.carte_statut='Active'` désynchronisé → lire `eleves` seul inclut à tort des cartes supprimées. Le croisement reproduit `!_emailsSupprimés` de `_buildCartesData` (admin).
4. **Payée** (`carte_paye=is.true`) — exclut les cartes renouvelées sans payer. ⚠️ Strictement `true` : une carte legacy à `carte_paye=null` serait exclue (à surveiller — les cartes créées par l'app ont toujours `carte_paye=true`).

Requête SQL de vérification (miroir exact de la logique worker) :
```sql
SELECT e.email, e.prenom, e.carte_restants, e.carte_expiration, e.carte_statut, e.carte_paye
FROM eleves e
WHERE e.carte_restants > 0
  AND e.carte_statut IN ('Active','Nouvelle carte')
  AND e.carte_paye = true
  AND e.saison = '2025-2026'
  AND (e.carte_expiration >= CURRENT_DATE OR e.carte_expiration IS NULL)
  AND EXISTS (SELECT 1 FROM inscriptions_cours i
              WHERE lower(i.email)=lower(e.email) AND i.saison='2025-2026' AND i.statut='inscrit');
```
| **C6** | Vendredi matin (Paris) / mardi matin (Vincennes) — cron | Élève carte10 absent 2 cours consécutifs | Ton "tu" (informel) · "Coucou [Prénom], on ne t'a pas vu·e aux 2 derniers cours. Tout va bien ?" · "Nous sommes là pour t'accompagner dès que tu reprends pour te partager ce qui a été vu dernièrement." · rappel cours préservés (N restants) · contact tel + email · Signature "Florencia & Jérémy" |
| **C-pay** | Admin clique badge "⚠️ Non payée" ou "✓ Payée" sur une fiche dans Cartes 10 → Détails → valide "✓ Enregistrer" dans le modal paiement | Élève | Bandeau vert ✓ · carte-box (✓ Payée, montant depuis Paramètres, mode, date paiement, cours actifs, expiration depuis `datePremierCours`) · "Votre carte de 10 cours est payée. Bon cours !" · bouton espace élève · Push : "✓ Paiement enregistré · Votre carte est active" |
| **C-report** | Admin clique "↩ Reporter" en fin de saison (crée ligne `isReport=true` saison suivante) | Élève | Bandeau vert ✓ · carte-box "Votre carte 2026-2027" (N cours reportés) · message "Votre carte vous attend à la rentrée de septembre" · Push : "↩ Votre carte reportée · N cours préservés pour 2026-2027" |
| **D-msg** | Admin envoie un message dans l'onglet Discussions | Élève | **Pas d'email** — push OS uniquement + notification in-app (`notifications_eleve`) · "💬 Nouveau message — [Prénom admin] : [début message...]" → onglet Discussions |

**Règles d'implémentation emails cartes** :
- **Expiration** : toujours calculée depuis `datePremierCours` (date du 1er cours pointé sur la carte), **jamais** depuis la date de paiement. Dans C-pay, le paiement peut intervenir des semaines après le premier cours — l'expiration ne change pas.
- **Montants/tarifs** : toujours lus depuis `tev_params_paris_<sai>.tarifs` (Paramètres → Tango Paris → Tarifs). Aucune valeur hardcodée, aucune valeur par défaut dans les Edge Functions.
- **Lien renouvellement** (C2, C2b) : `tev_liens_assoconnect[saison].renouv` (Paramètres → Tango Paris → Liens AssoConnect → "Renouvellement carte (10/20 cours)").

**Règles C6** : déclenché même si l'élève a déclaré son absence via 🚫. Logique : dates cours depuis `tev_cours_dates` (Paramètres) − présences (`presences` table) = absences. Anti-doublon : colonne `derniere_relance_abs DATE` sur `eleves` (ne renvoie pas si déjà envoyé pour ces 2 mêmes dates). Handler : `handleCronRelanceAbsences` dans `worker.js` + workflow `relance-absences.yml` (deux crons : vendredi = Paris, mardi = Vincennes). ⚠️ SQL à exécuter avant premier run : `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS derniere_relance_abs DATE;`

#### Notifications admin cartes (2 canaux)

**Toast** :
- `↻ Carte renouvelée sans payer : Felipe DIAZ`

**Panel 🔔** :

| Scénario | Couleur | Message |
|----------|---------|---------|
| Renouvelée sans payer — élève (C2) | orange `#1f0e00`/`#e65100` | `↻ Carte renouvelée sans payer — Felipe DIAZ · Paris Débutants · ⚠️ Paiement en attente · → Cartes 10 → Détails` |
| Renouvelée sans payer — admin (C2b) | orange `#1f0e00`/`#e65100` | `↻ Carte renouvelée par l'admin sans payer — Felipe DIAZ · Paris Débutants · ⚠️ Paiement en attente · → Cartes 10 → Détails` |
| 2 absences détectées (cron) | gris-bleu `#0a1520`/`#5c9dc2` | `💙 2 absences consécutives — Felipe DIAZ · Paris Débutants · Email C6 envoyé · → Cartes 10 → Détails` |

#### Notifications élève cartes (push OS)

| Déclencheur | Titre | Corps |
|-------------|-------|-------|
| C2 (renouvelée sans payer) | `Tango & Vous` | `⚠️ Nouvelle carte créée — pensez à finaliser votre paiement` |
| C4 (fin saison J+1) | `Tango & Vous` | `📅 Il vous reste N cours — pré-inscrivez-vous pour 2026-2027` |
| C6 (relance absences) | `Tango & Vous` | `💙 On prend de tes nouvelles — tes cours sont préservés` |

---

### Sorano — emails élève

**Fichier de référence** : `preview-emails-a-valider-v1.html`

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **SR1** | Admin clique **✉️ Relance** dans l'onglet Sorano (élève non réglé) | Élève tango Vincennes (ou yoga si applicable) | Bandeau orange ⏳ "Rappel — Adhésion Sorano" · intro : "L'Espace Sorano demande pour toutes les activités qui y ont lieu une adhésion nécessaire pour participer aux cours. Mais sachez que cette adhésion permet de bénéficier de réductions sur tous les spectacles proposés au Théâtre Sorano ainsi que sur ceux programmés par les services culturels de la Ville de Vincennes." · encadré "Comment procéder" : "Nous vous enverrons prochainement un lien pour régler cette adhésion." ⚠️ À remplacer par le vrai lien quand disponible · "Si vous avez déjà réglé votre adhésion pour une autre activité à l'Espace Sorano merci de nous l'indiquer." · bouton "Nous contacter" |
| **SR2** | Admin clique **✓ Marquer réglé** dans l'onglet Sorano | Élève | Bandeau vert ✓ "Adhésion Sorano enregistrée" · "Votre adhésion à l'Espace Sorano est bien enregistrée pour cette saison." (sans "Vous pouvez participer à tous vos cours") · notification in-app `notifications_eleve` : "✓ Votre adhésion Sorano a été enregistrée pour cette saison" |

**⚠️ TODO** : remplacer `"Nous vous enverrons prochainement un lien pour régler cette adhésion."` par le lien réel AssoConnect/Sorano quand l'utilisateur le fournit (dans SR1 et dans `preview-emails-a-valider-v1.html`).

---

### Carte pointée — cron lendemain matin

**Fichier de référence** : `preview-emails-a-valider-v1.html`

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **CP-A** | Admin pointe la carte depuis Cartes 10 → Détails ou Pointage → notification admin immédiate | Admin (tangoetvous@gmail.com) | Encadré or : nom/email · table avec **"⬤ Cours pointés CE JOUR"** en ligne verte en évidence (1 / 2 max ou 2 / 2 max) · "Utilisés au total (carte)" · cours restants · expiration · bouton admin |
| **CP-E** | Cron lendemain matin (9h Paris) — envoyé le lendemain du cours, pas immédiatement | Élève | Bandeau vert ✓ "Présence enregistrée pour votre carte" · boîte bleue : date du cours · **"⬤ Cours pointés CE JOUR"** en ligne verte en évidence (ex: "1 cours") · utilisés au total / 10 · cours restants · validité · bouton "Accéder à mon espace élève" |

**Règles CP-E** :
- Envoi le **lendemain matin** (cron 9h Paris) — agrège tous les pointages admin de la veille
- "Cours pointés CE JOUR" = nombre de cours pointés ce jour-là uniquement (1 ou 2), **sans mentionner le maximum possible**
- Route : `POST /api/notify/carte-pointee-admin` (JWT admin) — fire and forget depuis `pointerCoursAction()`

---

### Carte expirée — cron élève

**Fichier de référence** : `preview-emails-a-valider-v1.html`

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **CX** | Cron quotidien 9h Paris — élèves dont `carte_expiration = aujourd'hui` ET `carte_restants > 0` | Élève | Bandeau orange ⏰ "Votre carte de 10 cours a expiré" · encadré avec nombre de cours non utilisés + date de fin de validité + "Si vous souhaitez continuer à danser, vous pouvez renouveler votre carte sur AssoConnect" · "Pour toute question n'hésitez pas à nous contacter." · bouton "Renouveler ma carte sur AssoConnect" + bouton "Nous contacter" |

**Note** : notification in-app `notifications_eleve` associée : `⏰ Votre carte de 10 cours a expiré — N cours non utilisés`

---

### Cours particuliers

**Fichier de référence** : `preview-emails-cp-v1.html`

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **CP0** | Formulaire `cours-particuliers.html` soumis | Admin (tangoetvous@gmail.com) | Header admin · encadré or : nom/email/tel/prof souhaité/durée/niveau/lieu/urgence (badge rouge si haute) · table détails : objectifs (labels des cases cochées joints par `, `), disponibilités (multilignes : Jours / Horaires / Dates proposées), remarques · boutons 📞/✉️/SMS/admin |
| **CP1** | Formulaire soumis (en parallèle de CP0) | Personne qui a soumis le formulaire | Bandeau bleu 📋 "Votre demande est bien enregistrée" · cp-box violet : prof, durée, lieu, objectifs, disponibilités, remarques · encadré "Nous vous contactons dans les meilleurs délais" · contact tel + email |

**Notifications admin CP (3 canaux)** :
- **Toast** : `🎯 Nouvelle demande cours particulier : Sophie MARTIN`
- **Panel 🔔** : fond `#1a0828`, bordure `#9c27b0` (violet) · `🎯 Cours particulier — Sophie MARTIN · Prof. souhaité : Jérémy BRAITBART · Urgence haute · ⏳ À traiter · → Cours particuliers`
- **Push OS admin** : `🎯 Cours particulier — Sophie MARTIN · Urgence haute`

**Pas de push OS côté client** — les demandeurs de CP ne sont pas nécessairement élèves et n'ont pas la PWA installée.

---

### Profil élève

**Fichier de référence** : `preview-emails-cartes-v1.html` (section P1)

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **P1** | **J+7 après I03** (inscription validée + payée) — envoyé automatiquement 7 jours après I03 pour encourager l'activation de l'espace élève | Élève | Bandeau vert ✓ "Votre espace élève est prêt !" · info-box bleue : étapes numérotées (ouvrir app.tangoetvous.fr → entrer email → clic lien magique → 4. installer l'appli, iPhone : Partage ↑ → "Sur l'écran d'accueil" · Android : menu ⋮ → "Ajouter") · liste fonctionnalités (pointer, carte, milongas, publications) · bouton "Accéder à mon espace élève →" · note magic link (pas de mot de passe) |

**Note** : P0 (notification admin création profil) supprimé — redondant avec E0/S0/CP0/I0 selon la source d'inscription. L'admin est déjà notifié à chaque étape.

---

### Devis

**Fichier de référence** : `preview-emails-devis-v1.html`

| Code | Déclencheur | Destinataire | Contenu clé |
|------|-------------|--------------|-------------|
| **D0a** | Soumission `demande-devis.html`, mode Événement | Admin (tangoetvous@gmail.com) | Header admin · encadré or : nom/email/tel/badge Événement · table tous champs event (type, date, horaire, lieu, invités, durée, prestations, budget, message) · boutons 📞/✉️/SMS/admin/📋 Créer un devis → |
| **D0b** | Soumission `demande-devis.html`, mode Cours Privé | Admin | Idem D0a avec badge Cours privé · table champs privé (type demande, pour qui, niveau, prof, lieu, durée, nb cours, disponibilités) |
| **D1** | Admin clique "✉️ Email" sur un devis généré | Admin (draft Gmail) | Template pré-rempli Gmail (non automatique) · corps : formule de politesse + devis-box teal (DEVIS-YYYY-NNNN, prestations, totaux, acompte) + instruction "renvoyer signé avec mention Bon pour accord" · Signature Association Le Regard Se Pose / SIRET |
| **D2** | Soumission `demande-devis.html`, en parallèle de D0 | Personne qui a soumis le formulaire | Bandeau bleu 📋 · déclencheur Worker POST `/admin/api/devis` → appel Brevo · récap demande (type, prestations, date si event) · "Nous répondons généralement sous 24-48h" · contact tel + email |

**Notifications admin devis (3 canaux)** :
- **Toast** : `💼 Nouvelle demande de devis : Agnès MOREAU (Mariage · 15 juin)`
- **Panel 🔔** : fond `#00141a`, bordure `#26a69a` (teal) · `💼 Demande devis — Agnès MOREAU · Mariage · 15 juin 2026 · 80 invités · Budget 800-1200€ · ⏳ À traiter · → Devis → Demandes`
- **Push OS admin** : `💼 Demande devis — Agnès MOREAU · Mariage · 15 juin 2026`

**Pas de push OS côté client/demandeur** — pas de PWA installée pour les contacts occasionnels devis.

---

### Récapitulatif fin de saison (déclencheurs automatiques)
- **1er septembre** : désactivation des élèves sans carte reportée → email admin récap (N élèves désactivés)
- **J+1 après dernier cours Paris** : emails fin de saison (C4) aux élèves avec cours restants
- **25 août** : relance finale (C5) aux élèves avec cours restants non ré-inscrits

## SQL utiles — à exécuter dans Supabase SQL Editor

### Table `notifications_eleve` (notifications élève)
**À créer.** Requise pour que l'icône 🔔 de l'espace élève fonctionne. L'UI est déjà en place dans index.html.
```sql
CREATE TABLE IF NOT EXISTS notifications_eleve (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  lu BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE notifications_eleve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_notif_eleve" ON notifications_eleve FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON notifications_eleve TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE notifications_eleve_id_seq TO anon, authenticated;
```

### Fonction `compter_inscrits_essai` (quota cours d'essai)
**Mise à jour 2026-05-24.** Compte guideurs+guidées confirmés = inscriptions essai + élèves réguliers du cours, avec deux corrections :
- Élèves réguliers absents ce jour (`absences_jour`) **soustraits** du total
- Lignes `isRenewal` (renouvellements carte10) **exclues** pour éviter le double-comptage
- Saison calculée depuis la date → fonctionne pour la saison courante ET la saison prochaine

⚠️ **Quirk SQL Editor** : éviter `alias.colonne` dans le WHERE externe — le SQL Editor transforme `aj.id` en `<aj.id>`. Utiliser `NOT IN (SELECT ...)` à la place de `LEFT JOIN ... IS NULL`.

```sql
CREATE OR REPLACE FUNCTION public.compter_inscrits_essai(
  p_date_essai date,
  p_ville text,
  p_niveau text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_saison text;
  v_gui_essai integer := 0;
  v_gde_essai integer := 0;
  v_gui_cours integer := 0;
  v_gde_cours integer := 0;
BEGIN
  v_saison := CASE
    WHEN EXTRACT(MONTH FROM p_date_essai) >= 9
    THEN EXTRACT(YEAR FROM p_date_essai)::text || '-' || (EXTRACT(YEAR FROM p_date_essai) + 1)::text
    ELSE (EXTRACT(YEAR FROM p_date_essai) - 1)::text || '-' || EXTRACT(YEAR FROM p_date_essai)::text
  END;

  SELECT
    COUNT(*) FILTER (WHERE role IN ('guideur', 'double') AND statut = 'confirme'),
    COUNT(*) FILTER (WHERE role = 'guidee' AND statut = 'confirme')
  INTO v_gui_essai, v_gde_essai
  FROM inscriptions_essai
  WHERE date_essai = p_date_essai
    AND ville = p_ville
    AND niveau = p_niveau
    AND type = 'tango';

  SELECT
    COUNT(*) FILTER (WHERE role = 'guideur'),
    COUNT(*) FILTER (WHERE role = 'guidee')
  INTO v_gui_cours, v_gde_cours
  FROM inscriptions_cours
  WHERE ville = p_ville
    AND niveau = p_niveau
    AND statut = 'inscrit'
    AND saison = v_saison
    AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true')
    AND email NOT IN (
      SELECT email FROM absences_jour WHERE date = p_date_essai
    );

  RETURN json_build_object(
    'gui', v_gui_essai + v_gui_cours,
    'gde', v_gde_essai + v_gde_cours
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compter_inscrits_essai(date, text, text) TO anon, authenticated;
```

### Index unique inscriptions_stages (anti-doublon)
**Déjà exécuté.** Empêche qu'une même personne soit inscrite deux fois à la même date de stage.
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_stages_no_double
  ON inscriptions_stages (lower(trim(prenom)), lower(trim(nom)), stage_date);
```
Côté formulaire (`stages-pwa.html`) : vérification préalable qui filtre les dates en doublon et insère uniquement les nouvelles, avec message d'avertissement.

### Index unique essais et cours régulier (anti-doublon)
**Déjà exécutés.**
```sql
-- Cours d'essai tango
CREATE UNIQUE INDEX IF NOT EXISTS idx_essai_no_double
  ON inscriptions_essai (lower(trim(prenom)), lower(trim(nom)), date_essai, niveau);

-- Inscriptions cours régulier (exclut les supprimés et les renouvellements carte10)
-- ⚠️ La clause isRenewal est obligatoire sinon les renouvellements carte10 sont bloqués
DROP INDEX IF EXISTS idx_cours_no_double;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cours_no_double
  ON inscriptions_cours (lower(trim(prenom)), lower(trim(nom)), ville, niveau, saison)
  WHERE statut != 'supprimé'
    AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true');

-- Cours d'essai yoga
CREATE UNIQUE INDEX IF NOT EXISTS idx_essai_yoga_no_double
  ON inscriptions_essai_yoga (lower(trim(prenom)), lower(trim(nom)), date_essai, cours);
```
Côté formulaires : vérification client-side avant INSERT (cours-essai.html, inscription-cours.html, essai-yoga.html) avec message d'erreur explicite. L'index DB est le filet de sécurité en cas de race condition.

## Rubrique Devis — architecture complète

### Fichiers

| Fichier | Rôle |
|---------|------|
| `demande-devis.html` | Formulaire public 5 étapes (intégrable en iframe Wix) |
| `generateur-devis.html` | Générateur de devis PDF — interface admin |
| `worker.js` | Cloudflare Worker : routes API devis + fallback assets |
| `supabase/devis_schema.sql` | Schéma SQL complet (tables + fonction + trigger) |

### Tables Supabase

**`demandes_devis`** — reçoit les soumissions du formulaire public
```
id, created_at, mode ('event'|'private')
prestations_ids[], prestations_labels[]
-- Mode event :
type_evenement, date_evenement, date_flexible, horaire_evenement
lieu, code_postal, nombre_invites, duree_prestation
-- Mode cours privé :
type_demande, pour_qui, niveau_tango
date_butoir, date_butoir_flexible, professeur
lieu_cours, commune_domicile, duree_cours, nombre_cours, dates_periodes
-- Commun étape 3 :
budget, message, comment_connu
-- Coordonnées :
civilite, prenom, nom, email, telephone
type_contact ('particulier'|'societe'), nom_societe, adresse_facturation
-- Pipeline admin :
statut ('reçue'|'devis_envoyé'|'signé'|'acompte_payé'|'réalisée'|'soldée'|'refusée')
```
RLS : INSERT autorisé à `anon` (formulaire public) — SELECT/UPDATE à `authenticated` seulement.

⚠️ **Colonnes ajoutées après création initiale** — à exécuter dans Supabase SQL Editor si pas encore fait :
```sql
ALTER TABLE demandes_devis
  ADD COLUMN IF NOT EXISTS horaire_evenement   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS type_contact        text DEFAULT 'particulier',
  ADD COLUMN IF NOT EXISTS nom_societe         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS adresse_facturation text DEFAULT '';
```

**`devis`** — devis officiels créés par l'admin
```
id, created_at, updated_at
numero (DEVIS-AAAA-NNNN, UNIQUE), annee, num_sequence
date_emission, date_validite
demande_id (FK → demandes_devis, ON DELETE SET NULL)
client_nom, client_adresse
evt_date, evt_horaire, evt_lieu, evt_details
prestations (jsonb) [{type, intitule, duree, hasPassages, nbPassages, prix}]
montant_ht, acompte_mode ('percent'|'amount'), acompte_value
statut (enum: brouillon|emis|signe|acompte_paye|realise|solde|annule|refuse)
```
RLS : toutes opérations autorisées à `authenticated`.

**`compteurs_devis`** — numérotation annuelle
- Accès uniquement via la fonction `reserver_numero_devis()` (SECURITY DEFINER)
- RLS bloque tout accès direct (anon + authenticated)

**Fonction `reserver_numero_devis(p_annee integer DEFAULT NULL)`**
- Atomique, anti race-condition : INSERT … ON CONFLICT DO UPDATE RETURNING
- Retourne `'DEVIS-2026-0042'`
- GRANT EXECUTE TO authenticated

**Trigger `trg_protect_devis_numero`**
- Interdit toute modification de `numero`, `annee`, `num_sequence`, `date_emission` une fois `statut != 'brouillon'`
- Obligatoire légalement (art. 242 nonies A CGI — numérotation chronologique continue)

### Worker Cloudflare (`worker.js`)

**Aucun secret requis** — clé anon Supabase hardcodée (`SUPABASE_ANON`), JWT admin passé directement.

Routes :
- `POST /admin/api/devis` → insert dans `demandes_devis` avec clé anon (RLS permissif)
- `POST /api/devis/creer` → appel RPC `reserver_numero_devis` + insert `devis` avec JWT admin
- `PATCH /api/devis/:id/emettre` → statut brouillon→emis (JWT admin)
- `PATCH /api/devis/:id/annuler` → statut→annule (JWT admin)
- `PATCH /api/demandes-devis/:id` → mise à jour statut/notes (JWT admin)
- `* fallback` → `env.ASSETS.fetch(request)` (assets statiques)

### Formulaire public `demande-devis.html`

5 étapes :
1. **Prestations** — grille de choix (démo tango, cours tango, chorégraphie, cours particulier, initiation, spectacle, atelier) — sélection multiple
2. **Événement ou besoin** — toggle Événement / Cours privé avec champs adaptés
   - Événement : type, date + flexible, horaire (libre, ex: "20h30, après le dîner"), lieu, code postal, nombre invités, durée prestation
   - Cours privé : type demande, pour qui, niveau tango, date butoir + flexible, professeur souhaité, lieu cours, commune domicile, durée cours, nombre cours, disponibilités
3. **Précisions** — budget (tranches), message libre, comment connu
4. **Coordonnées** — toggle Particulier / Société
   - Particulier : civilité, prénom, nom, email, téléphone + adresse optionnelle pour le devis
   - Société : idem + nom société (requis) + adresse facturation (requise)
5. **Récapitulatif** — lecture seule avant envoi

Validation : Turnstile à ajouter (sitekey `0x4AAAAAADCDhidbX3fOzZl5`) avant intégration Wix.
Envoi : POST vers `https://app.tangoetvous.fr/admin/api/devis`.

### Générateur de devis `generateur-devis.html`

Interface split : panneau édition (gauche) + aperçu PDF temps réel (droite).

**Émetteur** : Association Le Regard Se Pose, SIRET 522 679 752 00025, MVAC20 18 rue Ramus 75020 Paris.

**Catalogue prestations** (`PRESTATIONS_CATALOG`) : démo tango, cours tango, chorégraphie mariage, cours particulier, initiation, spectacle, atelier — chacun avec intitulé et durée suggérés.

**Persistance DB** (sauvegarde/chargement brouillon) :
- `loadDevisFromDB(numero)` : chargé au réouverture depuis `devis` table via JWT admin (localStorage `sb-qhngqzvvllktuwspojxc-auth-token`)
- `sauvegarderBrouillon()` : PATCH vers Supabase REST avec JWT admin
- Bouton "💾 Sauvegarder" dans le panneau édition
- Appelé automatiquement dans `prefillFromURL()` si `?numero=` présent

**Modes** :
- Brouillon : badge "Brouillon", filigrane sur l'aperçu, numéro libre
- Officiel (`?numero=DEVIS-YYYY-NNNN`) : numéro verrouillé, filigrane retiré

**Frais annexes** : déplacement + hébergement (optionnels, avec checkbox + montant + description).

**Acompte** : % ou montant fixe, toggle bouton, calcul automatique dans l'aperçu.

**Mentions légales** : TVA non applicable (art. 293 B CGI), médiation consommation (art. L612-1), validité 30 jours, RIB inclus.

**Impression PDF** : `window.print()` sur la zone `#devis` uniquement (CSS `@media print`).

### Admin — onglet Devis

**Deux vues** (bouton bascule) :
- **Demandes** (défaut) : liste des `demandes_devis` groupées par statut (Nouvelles / En cours / Terminées)
- **Devis générés** : liste des `devis` avec boutons Ouvrir/Retoucher + Email Gmail

**Carte demande** (collapsed) :
- Nom client + badge Société si applicable
- Prestations demandées (or)
- Résumé : date · horaire · lieu · invités (ou type cours privé)
- Boutons : ✉️ Email · 📞 · 📋 Créer un devis · ▾ Voir tout

**Carte demande** (expanded via `_demandesExpanded` Set) :
- Tous les champs selon mode (event ou privé)
- Message dans bloc fond `var(--s3)` + border (lisible sur thème sombre)
- Bloc facturation : société + adresse si type_contact='societe'
- Devis associés avec lien Ouvrir

**Pipeline statut demande** : select dropdown dans l'entête de chaque carte → PATCH immédiat via Worker.

**Créer un devis** depuis une demande :
- Pre-remplit : client_nom (nom_societe si société), client_adresse (adresse_facturation), evt_date, evt_horaire (horaire_evenement), evt_lieu, evt_details (type_evenement + invités + durée)
- Ouvre `generateur-devis.html?numero=DEVIS-YYYY-NNNN&...` dans un nouvel onglet
- Le générateur charge depuis DB au réouverture (les URL params ne sont qu'un pré-remplissage initial)

**Bouton Email Gmail** (dans vue "Devis générés") :
- Ouvre `https://mail.google.com/mail/?view=cm&fs=1&to=EMAIL&su=SUJET&body=CORPS`
- Sujet pré-rempli : `Devis DEVIS-YYYY-NNNN – Tango & Vous / Le Regard Se Pose`
- Corps pré-rempli avec formule de politesse + mention du devis en pièce jointe + coordonnées
- L'admin personnalise et envoie depuis Gmail

**Variables JS globales** (admin.html) :
- `_devisVue` : `'demandes'` | `'liste'`
- `_demandesExpanded` : `Set` des IDs de demandes dépliées
- `_dvRow(label, val)` : helper HTML pour les lignes label/valeur dans les cartes

### Cloudflare Worker — pas de secrets requis

La clé `SUPABASE_ANON` est hardcodée dans `worker.js` (identique à `TEV_SUPABASE_KEY` dans `tev-supabase.js`).
Les opérations admin utilisent le JWT de l'utilisateur connecté passé en `Authorization: Bearer`.
`BREVO_API_KEY` reste optionnel (notification non bloquante si absent).

**Ne plus jamais configurer SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans Cloudflare** — ils ne sont plus utilisés.

---

