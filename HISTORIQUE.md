# Tango & Vous — Historique

Ce fichier complète `CLAUDE.md` avec les éléments archivés pour alléger la lecture principale.
À consulter au besoin — **non chargé par défaut** comme `CLAUDE.md`.

---

## Tâches accomplies (avant 2026-05-27)

50 items déplacés depuis la section "À faire / en suspens" de `CLAUDE.md` le 2026-05-27, classés par domaine. Wording original préservé.

### Espace élève

- [x] **Flux iCalendar (ICS) — abonnement calendrier téléphone** — FAIT (2026-05-09, complété 2026-05-10). Route Cloudflare Worker `GET /calendar/e-{token}.ics` génère un ICS dynamique depuis Supabase. Token signé HMAC-SHA256 (SUPABASE_SERVICE_KEY) encodé base64url + email → URL unique par élève. `GET /api/calendar/token` (JWT requis) génère l'URL. Bouton "Ajouter à mon calendrier" dans l'espace élève → Agenda. iOS : deep link direct ; Android/desktop : copier-coller URL dans Google Agenda. `REFRESH-INTERVAL:PT6H` → synchro toutes les 6h. Contenu : cours tango de l'élève (dates depuis `tev_cours_dates`, horaires depuis `tev_params_paris/vincennes_<sai>`) + toutes les milongas + stages confirmés. ⚠️ Les dates dans ICS viennent directement de la liste `tev_cours_dates` en Supabase — pas de calcul de "sans cours", juste les dates présentes dans la liste. **8 flux publics** également disponibles : `paris-debutant`, `paris-intermediaire`, `vincennes-debutant`, `vincennes-intermediaire`, `stages`, `milongas`, `yoga-yin`, `yoga-hatha` → `GET /calendar/{slug}.ics` (sans token).
- [x] **Tester déclaration d'absence depuis espace élève** : bouton 🚫 Absent sur la carte "PROCHAIN COURS" → vérifier que l'absence apparaît bien dans admin → Essai Tango → Pointage sur la bonne date et le bon cours — CONFIRMÉ 2026-05-26, fonctionne bien ✅
- [x] Section "Ma carte de 10 cours" s'affichait pour les élèves forfait dans Accueil et Carte (espace élève) — CORRIGÉ (condition `=== 'carte10'` stricte + `showScreen` uniquement dans callback inscriptions_cours + détection binaire `hasCarte10 ? 'carte10' : 'forfait'` + fallback eleves)
- [x] Sorano espace élève — bloc "Adhésion Sorano" disparaît et remplacé par note discrète quand réglé — FAIT (`eleveData.soranoPayé` depuis callback inscriptions_cours)
- [x] Photo de profil élève — FAIT : colonne `photo_url TEXT` ajoutée dans `eleves` (SQL exécuté). Upload depuis admin (fiche ✏️) ET depuis espace élève (section "Mes coordonnées"). Synchronisation bidirectionnelle via `tevUpdateElevePhoto()`.
- [x] Téléphone modifiable depuis espace élève — FAIT : section "📋 Mes coordonnées" dans `renderAccueil()`, bouton "Enregistrer" → `saveTel()` → `TEV.updateEleveTel()` → UPDATE `eleves`.
- [x] Onglets espace élève renommés — FAIT : "Carte" → "Forfait", "Actu" → "Publications" (dans `NAV_TABS` et `_TAB_LABELS` dans index.html)
- [x] Téléphone et photo modifiables depuis espace élève — CORRIGÉS : `tevUpdateEleveTel` n'écrit que dans `eleves` (RLS interdit UPDATE sur `inscriptions_cours` aux non-admins). Priorité inversée dans `tevGetAdminData()` : `elv.tel || ic.tel` (au lieu de `ic.tel || elv.tel`) pour que la valeur fraîche de `eleves` prime sur l'ancienne de `inscriptions_cours`. Photo : même logique, `eleves.photo_url` mis à jour via `tevUpdateElevePhoto`. ⚠️ Règle à retenir : tout champ modifiable depuis l'espace élève doit écrire dans `eleves` et être lu en priorité depuis `eleves` dans l'admin.

### Cartes 10

- [x] Cartes 10 — suppression carte + onglet « Cartes supprimées » — FAIT (confirmerSupprimerCarte, _fromCoursTango, carte_statut='supprimé')
- [x] Suppression élève tango — supprime aussi la carte 10 associée — CORRIGÉ
- [x] **`calcExpiration` — refonte complète (2026-05-13)** : suppression de `SANS_COURS_PARIS/VINCENNES` hardcodés. Les semaines sans cours sont détectées automatiquement depuis les gaps dans `tev_cours_dates` (Paramètres). Fix timezone T00→T12. Voir section "Session 2026-05-13 (suite 3)".
- [x] **`sauvegarderEditCarte` ne persistait pas** — CORRIGÉ : les dates venaient de la table `presences` (reconstruite à chaque `chargerDonnees`). Fix : DELETE des présences existantes + INSERT des nouvelles pour cet `eleve_id`. L'expiration est recalculée systématiquement (suppression de la garde `!c.expiration`). Pour les cartes reportées (`_fromCoursTango`) : l'`eleves.id` est retrouvé par email dans `adminData.cartes` (même si la saison ne correspond plus) → `Promise.all` sur `eleves` + `presences` + `inscriptions_cours.donnees`.
- [x] **Badges paiement carte10 — "✓ Payé" et modal paiement** — FAIT (2026-05-12) : cliquer "✓ Payé" ouvre désormais le même modal que "Non payé" (pré-rempli avec les données de l'isRenewal le plus récent). Modal `ouvrirModalCartePaiement` enrichi : si un isRenewal existe pour cet email → pré-remplit montant/mode/date depuis `donnees.datePremierPaiement`, `paiement`, `montant`.
- [x] **Renouvellement carte + "Payé" → ouvre modal paiement** — FAIT (2026-05-12) : dans `confirmerModalRenouveler`, si `paye=true` → appelle `renouvelerCarteAction(id, null, false, 0, callback)` puis le callback ouvre `ouvrirModalCartePaiement`. Le renouvellement lui-même reste non-payé en DB jusqu'à validation dans le modal.
- [x] **Race condition `renouvelerCarteAction` + isRenewal INSERT** — CORRIGÉ (2026-05-12) : la promesse `insertProm` était dans le premier `.then()` mais non retournée → `chargerDonnees` s'exécutait avant la fin de l'INSERT. Fix : `return insertProm` dans le premier `.then()` pour chaîner correctement.
- [x] **`idx_cours_no_double` bloquait les inserts isRenewal** — SQL À EXÉCUTER dans Supabase (2026-05-12) : l'index UNIQUE sur `(prenom, nom, ville, niveau, saison)` rejetait silencieusement les lignes `isRenewal` car même combinaison que l'original. Fix : recréer l'index avec clause `AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true')`.

### Essai Tango

- [x] Tester suppression élève tango → persiste après refresh — CORRIGÉ (approche `_pendingSupprimes`)
- [x] Transfert essai → inscriptions tango (boutons Validé·e / Demande en att. / Inscrit·e) — CORRIGÉ (saison `saisonActive()`, INSERT au lieu de `upsert`, `_pendingCoursInserts`, partenaire sans email)
- [x] Pointage Essai Tango : scroll to top toutes les 15s — CORRIGÉ (garde `_renderTabSiPasFormulaire` + `requestAnimationFrame`)
- [x] Liste d'attente dans Pointage Essai Tango avec bouton ✓ Valider — FAIT

### Essai Yoga

- [x] Essai yoga (essai-yoga.html) — dropdown dates vide : `await` dans fonction non-`async` → SyntaxError → script entier muet — CORRIGÉ (`async function soumettre()`)
- [x] Essai yoga admin — téléphone absent dans fiche : `nomCliquable` appelé avec `''` au lieu de `e.tel||''` — CORRIGÉ
- [x] Essai yoga admin — bouton "Inscrire" ouvre désormais le formulaire "Inscrire Élève" pré-rempli (navigate + setTimeout pre-fill) au lieu d'un modal
- [x] Essai yoga admin — accordéons fermés toutes les 15s : garde `if (currentTab === 'yoga' && sousOngletYoga === 'essai') return;` dans `_renderTabSiPasFormulaire()` — CORRIGÉ
- [x] Essai yoga (essai-yoga.html) — après soumission : compte à rebours 8s + bouton retour manuel — FAIT

### Yoga régulier

- [x] Yoga — inscription directe élève ne persistait pas : `soumettreInscriptionDirecteYoga` n'appelait pas Supabase, saisonPourNouvelleEntree→saisonActive — CORRIGÉ

### Inscriptions Tango

- [x] Tester modification cours/paiement/montant → persiste après refresh — CORRIGÉ (2026-05-13, voir session VP)
- [x] **Modal "Modifier l'inscription" — scroll** — CORRIGÉ (2026-05-12) : `.modal-box` manquait `max-height:90vh;overflow-y:auto;` → ajouté globalement.
- [x] **Inscription directe — ReferenceError `formule`** — CORRIGÉ (2026-05-12) : `formule` déclarée dans le `forEach` (scope local) utilisée après la boucle dans `postAS` (legacy, ne fonctionne plus) → suppression du champ `formule` dans l'appel `postAS`.
- [x] **Inscription directe + VP — 3 formules pour 2 cours + max 2 cours** — FAIT (2026-05-12) : 3 options radio quand 2 cours sélectionnés : (1) "1 carte de 10 + 1 forfait" — sections indépendantes par cours (formule/rôle/paiement/montant/date) ; (2) "Forfait 2 cours" — bloc paiement commun + rôle par cours ; (3) "1 carte de 10 pour les 2 cours" — bloc paiement commun + rôle par cours. Max 2 cours enforced dans l'UI (uncheck silencieux) et dans le submit (erreur). Valeurs `di-formule2` / `vp-formule2` : `'carte10forfait'`, `'forfait2'`, `'carte10unique'`. `soumettreInscriptionDirecte` et `soumettreValiderPaiement` lisent les champs partagés (`di-paie-shared`, `di-montant-shared`, `di-dateP-shared` / idem `vp-`) quand formule partagée. `vpPrefill` détecte automatiquement `carte10unique` (allCarte10 && secondMontant===0).

### Stages

- [x] **Stages — labels statut** — CORRIGÉ (2026-05-12) : "Confirmé" → "Validé·e" (pill verte), "Confirmés" → "Validé·e·s" (stat), "✓ Confirmer" → "✓ Valider" (tous les boutons). Ajout d'un bouton "✓ Valider" directement sur les cartes en attente dans la vue "Tous".

### Sorano

- [x] Sorano admin — bouton "Marquer réglé" revertait après 15s — CORRIGÉ (pattern `_pendingSoranoPayé` anti-polling, re-appliqué dans `chargerDonnees()` sur coursTango + coursYoga, jamais supprimé sur erreur DB) + colonnes `paiement_sorano BOOLEAN DEFAULT false` à créer via SQL

### Compta

- [x] **Module Trésorerie (Compta)** — UI complète implémentée dans admin.html (onglet Compta → Trésorerie). SQL exécuté dans Supabase le 2026-05-08. ✅ Testé et fonctionnel.
- [x] **Compta — double-comptage élève 2 cours avec carte10** — CORRIGÉ (2026-05-12) : `_markSharedCartes(liste)` identifie les entrées secondaires (même email, carte10, non-isRenewal) et les marque `montant:0, _sharedCarte:true`. `_buildADeposer` déduplique aussi (garde le montant le plus élevé par email). `_comptaBlock` affiche "carte partagée" avec "—" pour montant/mode.
- [x] **Compta tango — élèves supprimés exclus** — CORRIGÉ (2026-05-12) : `_renderComptaTango` incluait `statut='supprimé'` — seul `statut='inscrit'` est désormais conservé.

### Publications

- [x] Publications : double création, photo non sauvegardée, champs perdus — CORRIGÉ (listener redondant, colonne donnees JSONB, propagation erreurs Supabase)

### Devis

- [x] Rubrique Devis : formulaire public + générateur PDF + admin complet — TERMINÉ (voir section Devis)
- [x] Devis : Turnstile ajouté sur demande-devis.html (widget retiré en iframe Wix, vérifié hors iframe)

### Emails / Notifications

- [x] **Emails automatiques + notifications push** — FAIT (session 2026-05-21) : 27 handlers dans worker.js couvrent tous les emails du catalogue (essai tango E0–E15, yoga Y0–YI1, stages S0–S4, inscriptions I02–I04, cartes C1–C6/CX/CP, cours particuliers CP0/CP1, devis D0/D2, Sorano SR1/SR2, activation espace élève P1). FCM push câblé dans 8 handlers. Tables `fcm_tokens` + `notifications_eleve` créées. 7 workflows GitHub Actions créés (E4, S4, Y3, P1, C4, C5, C6). ⚠️ **SQL à exécuter avant premier run C6** : `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS derniere_relance_abs DATE;`
- [x] **Compléter lien cours d'essai dans `inscription-cours.html`** — FAIT 2026-05-26 : `LIEN_ESSAI_A_COMPLETER` → `https://app.tangoetvous.fr/cours-essai`
- [x] **⚠️ URL formulaire cours d'essai dans les emails inscription** — FAIT 2026-05-26 : `#URL_FORMULAIRE_ESSAI_A_RENSEIGNER` → `https://app.tangoetvous.fr/cours-essai` dans `preview-emails-inscription-v1.html` (4 occurrences) et `preview-emails-essai-v2.html` (1 occurrence)
- [x] **Nettoyage tokens FCM invalides** — FAIT (vérifié 2026-05-27) : `sendFcmPush` dans worker.js gère le nettoyage automatique sur les deux chemins. **Web Push (iPhone)** : si `r.status === 410 || r.status === 404` → DELETE le token de `fcm_tokens` (worker.js ligne 3917). **FCM v1 (Android)** : si `result.error?.status === 'NOT_FOUND' || 'UNREGISTERED'` → DELETE le token (worker.js ligne 3995).

### Auth

- [x] Email admin → sync Supabase Auth — CORRIGÉ : `sauverContact()` appelle `PATCH /api/admin/update-auth-email` (non-bloquant) quand l'email change. Worker utilise `env.SUPABASE_SERVICE_KEY` (secret Cloudflare, déjà configuré) pour appeler l'Admin Auth API Supabase et mettre à jour l'email sans déconnecter l'élève.
- [x] **Tester sync email Auth** — CONFIRMÉ 2026-05-26 : `SUPABASE_SERVICE_KEY` ajouté dans Cloudflare Workers (était manquant → 503). Route `/api/admin/update-auth-email` opérationnelle. QR code jsDelivr 404 supprimé (script retiré, fallback `api.qrserver.com` utilisé exclusivement).

### Formulaires publics

- [x] Revoir le formulaire cours particuliers — FAIT (lisibilité textes, multi-lieux étape 2, durée déplacée étape 4, cases jours Lu/Ma/Me/Je/Ve, créneau horaire début→fin, propositions de dates)
- [x] **Remplacer les iframes Wix par des liens directs** — FAIT (vérifié 2026-05-27) : chaque formulaire public a l'écran de succès avec bouton principal "← Retour au site Tango & Vous" (`target="_top"` → `https://www.tangoetvous.com`) + bouton secondaire "Faire une nouvelle inscription/demande" (`restart()`). Présent dans `essai-yoga.html`, `cours-particuliers.html`, `stages-pwa.html`, `inscription-cours.html`, `cours-essai.html`, `demande-devis.html`.

### Backup / Tests

- [x] Vérifier correction Sandrine Billot (hatha uniquement) / Myriam Bloch (hatha+yin) dans Supabase — CONFIRMÉ 2026-05-26 : Myriam Bloch apparaît aux 2 cours yoga (hatha+yin), Sandrine Billot à hatha uniquement ✅
- [x] **Configurer email backup CSV** — FAIT (`SMTP_USERNAME`, `SMTP_PASSWORD`, `BACKUP_EMAIL` ajoutés dans GitHub Actions secrets). Workflow tourne chaque soir à 23h heure de Paris (cron `0 21 * * *` UTC, ajusté pour CEST = UTC+2 en été), exporte 15 tables en CSV + ZIP → artifact GitHub 90 jours + email.
- [x] Vérifier formulaires publics (inscription cours, stages, essai) connectés à Supabase — CONFIRMÉ 2026-05-26 : inscription-cours.html, cours-essai.html, stages-pwa.html testés depuis Wix (iframe), connexion Supabase confirmée ✅

### Setup SQL

- [x] **Exécuter SQL colonnes paiement_sorano + tel yoga** — FAIT (exécuté dans Supabase SQL Editor)

---

## Items également retirés de la todolist active (2026-05-27)

Items déplacés depuis "À faire / en suspens" — l'utilisateur a confirmé qu'ils sont soit résolus en pratique, soit abandonnés / non prioritaires.

### Considérés comme résolus

- [x] **Inscriptions Tango → Supprimés — actions manquantes** : ajouter sur chaque fiche de l'onglet Supprimés : (1) bouton 🗑 "Supprimer définitivement" → `DELETE FROM inscriptions_cours WHERE id=...` ; (2) bouton ↩ "Rétablir" → `UPDATE inscriptions_cours SET statut='demande', donnees=(donnees - 'supprimé_de')` + retirer le marqueur local `_suppriméDeInscriptions` + retirer de `_pendingSupprimes`.
- [x] **Emails automatiques + notifications — à construire ensemble** : l'utilisateur prépare un fichier Excel listant tous les déclencheurs (formulaires + actions admin + actions espace élève) et leurs effets (email élève, email admin, notification push élève, notification push admin). Partager le fichier ici puis co-rédiger les contenus. Voir catalogue existant dans section "Emails automatiques — catalogue complet".
- [x] **Mettre à jour les cartes de 10 des élèves actuels** : corriger manuellement via ✏️ dans Cartes 10 → Détails → Modifier le nombre de cours utilisés, les dates, et la date du premier cours. Le modal **persiste désormais correctement** (fix 2026-05-08). L'expiration est recalculée automatiquement à la sauvegarde.
- [x] **Notifications stages + milongas — à préparer ensemble** : le gros du contenu (dates, lieux, thèmes, horaires) est dans Paramètres. Il faut parcourir Paramètres ensemble pour extraire et préparer les notifications de l'année complète.
- [x] **Notifications + emails lors des modifications ✏️ essai** : quand l'admin modifie un essai tango (date/ville/niveau) ou yoga (date/cours) via ✏️, envoyer à l'élève : (1) email Brevo "Votre cours d'essai a été modifié : [détails]" + (2) notification dans `notifications_eleve`. L'UI côté élève (icône 🔔 header, panneau) est déjà prête dans index.html.
- [x] Étendre icône 🔔 (badge rouge) + push aux événements suivants : essai tango, essai yoga, demande d'inscription tango, inscription stage, cours particuliers, demande de devis, RSVP milonga depuis espace élève
- [x] **Push élève — pas de cours la semaine prochaine** : le lendemain d'un cours, si le prochain cours est à plus de 7 jours, envoyer une notification push à tous les élèves inscrits à ce cours (Paris ou Vincennes). Même logique que le bandeau d'alerte dans l'accueil.
- [x] **Devis : envoyer le PDF par email directement depuis l'appli** (actuellement via Gmail ouvert manuellement)

### Reporté / Non applicable / Nice-to-have

- 📌 **Activer sauvegardes Supabase** : nécessite le plan Pro (25 $/mois) — **non fait, plan payant**. Backup CSV nocturne via GitHub Actions `backup-csv.yml` utilisé à la place (suffisant). Décidé de ne pas activer.
- 📌 **Installer l'appli sur Mac (PWA déjà prête)** : ouvrir admin dans Chrome → icône ⊕ dans la barre d'adresse → Installer. Action utilisateur, non-prioritaire.
- 📌 **Assistant vocal/texte dans l'admin** : champ texte (ou micro) qui envoie une commande en langage naturel à Claude via l'API Anthropic, avec `adminData` en contexte. Claude interprète l'intention et appelle la fonction JS correspondante. Exemples : "pointer la carte de Dupont", "inscrire Untel au cours de mercredi", "combien d'élèves ont une carte qui expire ce mois-ci ?". Étapes : définir les actions autorisées, demander confirmation avant exécution ("Pointer 1 cours pour Felipe Diaz aujourd'hui — confirmer ?"), gérer les ambiguïtés ("2 Dupont trouvés, lequel ?"). Nice-to-have, pas prévu.
- 📌 **calcExpiration via QR code — premier cours absolu** : si la toute première utilisation d'une carte passe par QR code (jamais ouvert l'espace élève, jamais pointé par l'admin), `pointer_cours_qr` (SQL SECURITY DEFINER) ne calcule pas `carte_expiration` → reste `null` jusqu'à la prochaine interaction admin. Fix : dans `handleCartePointage` (worker.js), vérifier si `carte_date_achat` est null avant le RPC, et si oui, porter l'algorithme A+B+C en JS dans le worker (fetch `tev_cours_dates` depuis `parametres` + même logique que `_calcExpirationSb`) + UPDATE `eleves.carte_expiration` après le RPC. Estimé ~30-45 min. **Cas très improbable en pratique** — reporté.
