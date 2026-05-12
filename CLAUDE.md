# Tango & Vous — Contexte projet pour Claude Code

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
- **`inscriptions_essai_yoga`** : cours d'essai yoga — table séparée. Colonnes : `prenom, nom, email, tel, date_essai, cours, gratuit, statut, presence_confirmee`. `statut` toujours `'demande'` à l'inscription (admin valide manuellement). ⚠️ Table distincte de `inscriptions_essai` — ne pas confondre.
- **`presences`** : pointage des présences
- **`cours_particuliers`** : cours particuliers
- **`publications`** : publications/annonces
- **`agenda_modifs`** : modifications d'agenda
- **`demandes_devis`** : demandes reçues via formulaire public `demande-devis.html` — voir section Devis ci-dessous
- **`devis`** : devis officiels créés par l'admin — voir section Devis ci-dessous
- **`compteurs_devis`** : numérotation annuelle des devis (accès via fonction SECURITY DEFINER uniquement)
- **`notifications`** : historique des notifications admin — colonnes : id, created_at, type, message, lu (bool), lien_tab — à créer quand push implémenté
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
- **`cours` non stockée** dans `inscriptions_cours` — calculée depuis ville+niveau dans `tev-supabase.js`
- **Saison dans les formulaires admin directs** : toujours utiliser `saisonActive()` (saison affichée dans l'admin), jamais `saisonPourNouvelleEntree()` qui renvoie la saison suivante en mai-août. `saisonPourNouvelleEntree()` est réservé aux formulaires publics (inscription-cours.html, etc.)
- **Supabase `.upsert()` + `.catch()`** : le builder Supabase n'expose pas `.catch()` directement. Toujours envelopper dans `Promise.resolve(...).catch(function(){})` ou utiliser `.then(null, fn)`.
- **INSERT Supabase puis navigation** : après un INSERT admin, appeler `chargerDonnees()` dans le `.then()` du INSERT (pas dans un `setTimeout` fixe) pour éviter la race condition où le rechargement arrive avant la fin de l'écriture.
- **INSERT dans un iframe + BroadcastChannel : toujours faire l'INSERT AVANT d'envoyer la notification** — Si le BroadcastChannel/postMessage est envoyé en premier, l'admin re-rend l'onglet (`renderTab()`), ce qui retire l'iframe du DOM. L'INSERT tourne alors dans un iframe détaché : Chrome bloque silencieusement les `alert()` et les `window.parent.postMessage` de ces iframes, rendant toute erreur invisible. L'entrée apparaît brièvement (état local via BroadcastChannel) puis disparaît quand `chargerDonnees` écrase avec les données DB sans l'enregistrement raté. **Ordre correct dans `finalize()` :** (1) afficher l'écran de succès, (2) `await INSERT`, (3) si erreur → `alert()` fonctionne car iframe encore dans le DOM, (4) si succès → envoyer BroadcastChannel + postMessage.
- **Suppression tango** = `UPDATE inscriptions_cours SET statut='supprimé'` (pas DELETE)
- **Suppression yoga** = `DELETE FROM cours_yoga` (suppression réelle)
- **Comparaison d'IDs — règle universelle** : utiliser `String(x.id)===String(id)` partout (pas seulement pour yoga). Supabase retourne des BIGINT (nombres) mais `btn.dataset.id`, `sel.value` et les valeurs d'attributs HTML sont toujours des strings. `42 === "42"` → `false` → find/match échoue silencieusement.
- **iOS Safari — boutons cliquables** : les `<button>` avec délégation de click ne fonctionnent pas de manière fiable dans certains contextes DOM sur iOS Safari. Toujours utiliser `<a href="javascript:void(0)" onclick="...">` pour les actions inline dans du HTML généré dynamiquement.
- **Race condition suppression vs polling 15s** : `_chargerDonneesSeq++` ne protège que les appels `chargerDonnees` déjà en vol — pas les nouveaux appels démarrés après la suppression, qui fetchent la DB avant que l'UPDATE soit confirmé. Solution : `_pendingSupprimes` (Set global). Ajouter `String(id)` avant `renderTab()`, retirer après confirmation DB. Dans `chargerDonnees()`, après mise à jour de `coursTango`, ré-appliquer : `ct.map(e => _pendingSupprimes.has(String(e.id)) ? {...e, statut:'supprimé'} : e)`.
- **`sauverContact()` — mettre à jour TOUTES les tables** : la fonction doit mettre à jour en parallèle toutes les tables où la personne peut exister selon son contexte. Pattern `Promise.all([...])` sur : `inscriptions_cours` (ctx='ct', demande/attente_paiement non encore dans eleves), `eleves` (ctx='ct'/'eleve'/'carte'), `inscriptions_essai` (ctx='essai', col `tel`), `inscriptions_stages` (ctx='stage', col `telephone`), `cours_yoga` (ctx='yoga', pas de col `tel`). L'état local `adminData` doit être mis à jour immédiatement (hors IS_DEMO) pour que le prochain `chargerDonnees` ne l'écrase pas. Structure stages : itérer `Object.values(adminData.stages).forEach(jour => updLocal(jour.inscrits))`.
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
- [ ] **Remplacer les iframes Wix par des liens directs** : les formulaires publics ne seront plus intégrés en iframe dans Wix mais accessibles via liens directs (`app.tangoetvous.fr/...`). Après soumission réussie de chaque formulaire, remplacer le `restart()` du compte à rebours par une redirection vers `https://www.tangoetvous.com` (bouton "← Retour au site") + lien secondaire "Remplir un nouveau formulaire" → `restart()`.
- [ ] **Emails automatiques + notifications — à construire ensemble** : l'utilisateur prépare un fichier Excel listant tous les déclencheurs (formulaires + actions admin + actions espace élève) et leurs effets (email élève, email admin, notification push élève, notification push admin). Partager le fichier ici puis co-rédiger les contenus. Voir catalogue existant dans section "Emails automatiques — catalogue complet".
- [ ] **Mettre à jour les cartes de 10 des élèves actuels** : corriger manuellement via ✏️ dans Cartes 10 → Détails → Modifier le nombre de cours utilisés, les dates, et la date du premier cours. Le modal **persiste désormais correctement** (fix 2026-05-08). L'expiration est recalculée automatiquement à la sauvegarde.
- [ ] **Renseigner les thèmes des stages** : compléter dans Paramètres les thèmes des stages à venir (saison courante) ET de la saison prochaine 2026-2027 — à faire avec l'utilisateur.
- [ ] **Notifications stages + milongas — à préparer ensemble** : le gros du contenu (dates, lieux, thèmes, horaires) est dans Paramètres. Il faut parcourir Paramètres ensemble pour extraire et préparer les notifications de l'année complète. Ne pas implémenter seul — attendre que l'utilisateur soit disponible pour co-construire.
- [x] **Flux iCalendar (ICS) — abonnement calendrier téléphone** — FAIT (2026-05-09, complété 2026-05-10). Route Cloudflare Worker `GET /calendar/e-{token}.ics` génère un ICS dynamique depuis Supabase. Token signé HMAC-SHA256 (SUPABASE_SERVICE_KEY) encodé base64url + email → URL unique par élève. `GET /api/calendar/token` (JWT requis) génère l'URL. Bouton "Ajouter à mon calendrier" dans l'espace élève → Agenda. iOS : deep link direct ; Android/desktop : copier-coller URL dans Google Agenda. `REFRESH-INTERVAL:PT6H` → synchro toutes les 6h. Contenu : cours tango de l'élève (dates depuis `tev_cours_dates`, horaires depuis `tev_params_paris/vincennes_<sai>`) + toutes les milongas + stages confirmés. ⚠️ Les dates dans ICS viennent directement de la liste `tev_cours_dates` en Supabase — pas de calcul de "sans cours", juste les dates présentes dans la liste. **8 flux publics** également disponibles : `paris-debutant`, `paris-intermediaire`, `vincennes-debutant`, `vincennes-intermediaire`, `stages`, `milongas`, `yoga-yin`, `yoga-hatha` → `GET /calendar/{slug}.ics` (sans token).
- [ ] **Articles tango — Publications** : rédiger les articles tango à diffuser dans l'espace élève (onglet Publications) et les programmer. **Rythme : 1 article par semaine, début octobre → fin juin** (~39 articles par saison). À faire avec l'utilisateur : choix des sujets, rédaction, dates de publication.
- [ ] **Tester déclaration d'absence depuis espace élève** : bouton 🚫 Absent sur la carte "PROCHAIN COURS" → vérifier que l'absence apparaît bien dans admin → Essai Tango → Pointage sur la bonne date et le bon cours
- [ ] Vérifier correction Sandrine Billot (hatha uniquement) / Myriam Bloch (hatha+yin) dans Supabase — SQL généré mais pas confirmé exécuté
- [ ] **Activer sauvegardes Supabase** : Dashboard Supabase → Settings → Database → Backups → activer (7 jours rétention sur plan gratuit)
- [x] **Configurer email backup CSV** — FAIT (`SMTP_USERNAME`, `SMTP_PASSWORD`, `BACKUP_EMAIL` ajoutés dans GitHub Actions secrets). Workflow tourne chaque soir à 23h heure de Paris (cron `0 21 * * *` UTC, ajusté pour CEST = UTC+2 en été), exporte 15 tables en CSV + ZIP → artifact GitHub 90 jours + email.
- [ ] **Septembre 2026 — mettre à jour les actions GitHub** : remplacer `actions/checkout@v4`, `actions/upload-artifact@v4`, `dawidd6/action-send-mail@v3` par leurs versions Node.js 24 dans `backup-csv.yml` (et `keep-alive.yml` si concerné). Signaler à Claude à ce moment-là.
- [x] **Exécuter SQL colonnes paiement_sorano + tel yoga** — FAIT (exécuté dans Supabase SQL Editor)
- [x] Tester suppression élève tango → persiste après refresh — CORRIGÉ (approche `_pendingSupprimes`)
- [x] Transfert essai → inscriptions tango (boutons Validé·e / Demande en att. / Inscrit·e) — CORRIGÉ (saison `saisonActive()`, INSERT au lieu de `upsert`, `_pendingCoursInserts`, partenaire sans email)
- [x] Pointage Essai Tango : scroll to top toutes les 15s — CORRIGÉ (garde `_renderTabSiPasFormulaire` + `requestAnimationFrame`)
- [x] Liste d'attente dans Pointage Essai Tango avec bouton ✓ Valider — FAIT
- [x] Publications : double création, photo non sauvegardée, champs perdus — CORRIGÉ (listener redondant, colonne donnees JSONB, propagation erreurs Supabase)
- [x] Yoga — inscription directe élève ne persistait pas : `soumettreInscriptionDirecteYoga` n'appelait pas Supabase, saisonPourNouvelleEntree→saisonActive — CORRIGÉ
- [x] Essai yoga (essai-yoga.html) — dropdown dates vide : `await` dans fonction non-`async` → SyntaxError → script entier muet — CORRIGÉ (`async function soumettre()`)
- [x] Essai yoga admin — téléphone absent dans fiche : `nomCliquable` appelé avec `''` au lieu de `e.tel||''` — CORRIGÉ
- [x] Essai yoga admin — bouton "Inscrire" ouvre désormais le formulaire "Inscrire Élève" pré-rempli (navigate + setTimeout pre-fill) au lieu d'un modal
- [x] Essai yoga admin — accordéons fermés toutes les 15s : garde `if (currentTab === 'yoga' && sousOngletYoga === 'essai') return;` dans `_renderTabSiPasFormulaire()` — CORRIGÉ
- [x] Essai yoga (essai-yoga.html) — après soumission : compte à rebours 8s + bouton retour manuel — FAIT
- [x] Cartes 10 — suppression carte + onglet « Cartes supprimées » — FAIT (confirmerSupprimerCarte, _fromCoursTango, carte_statut='supprimé')
- [x] Suppression élève tango — supprime aussi la carte 10 associée — CORRIGÉ
- [x] Section "Ma carte de 10 cours" s'affichait pour les élèves forfait dans Accueil et Carte (espace élève) — CORRIGÉ (condition `=== 'carte10'` stricte + `showScreen` uniquement dans callback inscriptions_cours + détection binaire `hasCarte10 ? 'carte10' : 'forfait'` + fallback eleves)
- [x] Sorano admin — bouton "Marquer réglé" revertait après 15s — CORRIGÉ (pattern `_pendingSoranoPayé` anti-polling, re-appliqué dans `chargerDonnees()` sur coursTango + coursYoga, jamais supprimé sur erreur DB) + colonnes `paiement_sorano BOOLEAN DEFAULT false` à créer via SQL
- [x] Sorano espace élève — bloc "Adhésion Sorano" disparaît et remplacé par note discrète quand réglé — FAIT (`eleveData.soranoPayé` depuis callback inscriptions_cours)
- [ ] Tester modification cours/paiement/montant → persiste après refresh
- [ ] Installer l'appli sur Mac (PWA déjà prête) : ouvrir admin dans Chrome → icône ⊕ dans la barre d'adresse → Installer
- [ ] Vérifier formulaires publics (inscription cours, stages, essai) connectés à Supabase
- [ ] Implémenter emails automatiques via Brevo + Supabase Edge Functions (remplace Code.gs/MailApp qui est inactif) — **inclut la relance absences carte10** (voir section Emails → Cartes 10 → Relance 2 absences)
- [ ] Implémenter notifications push via FCM + Supabase Edge Functions — IMPORTANT : inclure nettoyage automatique des tokens invalides (FCM retourne les échecs dans la réponse → DELETE FROM fcm_tokens WHERE token IN (échecs))
- [ ] **Notifications + emails lors des modifications ✏️ essai** : quand l'admin modifie un essai tango (date/ville/niveau) ou yoga (date/cours) via ✏️, envoyer à l'élève : (1) email Brevo "Votre cours d'essai a été modifié : [détails]" + (2) notification dans `notifications_eleve`. Table `notifications_eleve` à créer (SQL dans section "SQL utiles"). L'UI côté élève (icône 🔔 header, panneau) est déjà prête dans index.html.
- [ ] Étendre icône 🔔 (badge rouge) + push aux événements suivants : essai tango, essai yoga, demande d'inscription tango, inscription stage, cours particuliers, demande de devis, RSVP milonga depuis espace élève — d'autres cas à lister par l'utilisateur
- [ ] **Push élève — pas de cours la semaine prochaine** : le lendemain d'un cours, si le prochain cours est à plus de 7 jours, envoyer une notification push à tous les élèves inscrits à ce cours (Paris ou Vincennes). Même logique que le bandeau d'alerte dans l'accueil. Déclencheur : GitHub Actions cron le lendemain de chaque jour de cours (vendredi matin Paris / mardi matin Vincennes), ou Supabase Edge Function. À implémenter en même temps que l'infrastructure FCM.
- [ ] **Compléter lien cours d'essai dans `inscription-cours.html`** : remplacer `LIEN_ESSAI_A_COMPLETER` (ligne du bandeau au-dessus de la barre de progression) par l'URL Wix du formulaire cours d'essai — l'utilisateur doit fournir cette URL.
- [x] Revoir le formulaire cours particuliers — FAIT (lisibilité textes, multi-lieux étape 2, durée déplacée étape 4, cases jours Lu/Ma/Me/Je/Ve, créneau horaire début→fin, propositions de dates)
- [x] Photo de profil élève — FAIT : colonne `photo_url TEXT` ajoutée dans `eleves` (SQL exécuté). Upload depuis admin (fiche ✏️) ET depuis espace élève (section "Mes coordonnées"). Synchronisation bidirectionnelle via `tevUpdateElevePhoto()`.
- [x] Téléphone modifiable depuis espace élève — FAIT : section "📋 Mes coordonnées" dans `renderAccueil()`, bouton "Enregistrer" → `saveTel()` → `TEV.updateEleveTel()` → UPDATE `eleves`.
- [x] Onglets espace élève renommés — FAIT : "Carte" → "Forfait", "Actu" → "Publications" (dans `NAV_TABS` et `_TAB_LABELS` dans index.html)
- [x] Email admin → sync Supabase Auth — CORRIGÉ : `sauverContact()` appelle `PATCH /api/admin/update-auth-email` (non-bloquant) quand l'email change. Worker utilise `env.SUPABASE_SERVICE_KEY` (secret Cloudflare, déjà configuré) pour appeler l'Admin Auth API Supabase et mettre à jour l'email sans déconnecter l'élève.
- [ ] **Tester sync email Auth** : dans admin, changer l'email d'un élève → F12 → Network → chercher `update-auth-email` → vérifier réponse `{"ok":true,"userId":"..."}` → vérifier dans Supabase Dashboard → Authentication → Users
- [x] Téléphone et photo modifiables depuis espace élève — CORRIGÉS : `tevUpdateEleveTel` n'écrit que dans `eleves` (RLS interdit UPDATE sur `inscriptions_cours` aux non-admins). Priorité inversée dans `tevGetAdminData()` : `elv.tel || ic.tel` (au lieu de `ic.tel || elv.tel`) pour que la valeur fraîche de `eleves` prime sur l'ancienne de `inscriptions_cours`. Photo : même logique, `eleves.photo_url` mis à jour via `tevUpdateElevePhoto`. ⚠️ Règle à retenir : tout champ modifiable depuis l'espace élève doit écrire dans `eleves` et être lu en priorité depuis `eleves` dans l'admin.
- [x] **Module Trésorerie (Compta)** — UI complète implémentée dans admin.html (onglet Compta → Trésorerie). SQL exécuté dans Supabase le 2026-05-08. ✅ Testé et fonctionnel.
- [x] **`calcExpiration` double-comptage été** — CORRIGÉ : les dates juillet-août étaient dans `SANS_COURS_PARIS`/`SANS_COURS_VINCENNES` ET couvertes par le bonus inter-saison (step 3), ce qui doublait leur effet. Fix : suppression des dates d'été des tableaux `SANS_COURS_*` — l'été est géré exclusivement par le step 3 (gap estival).
- [x] **`sauvegarderEditCarte` ne persistait pas** — CORRIGÉ : les dates venaient de la table `presences` (reconstruite à chaque `chargerDonnees`). Fix : DELETE des présences existantes + INSERT des nouvelles pour cet `eleve_id`. L'expiration est recalculée systématiquement (suppression de la garde `!c.expiration`). Pour les cartes reportées (`_fromCoursTango`) : l'`eleves.id` est retrouvé par email dans `adminData.cartes` (même si la saison ne correspond plus) → `Promise.all` sur `eleves` + `presences` + `inscriptions_cours.donnees`.

### SQL Trésorerie — à exécuter dans Supabase SQL Editor
```sql
CREATE TABLE IF NOT EXISTS remises_banque (
  id               BIGSERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  montant_especes  NUMERIC(10,2) NOT NULL DEFAULT 0,
  montant_cheques  NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes            TEXT NOT NULL DEFAULT '',
  statut           TEXT NOT NULL DEFAULT 'deposee' CHECK (statut IN ('brouillon','deposee'))
);
CREATE TABLE IF NOT EXISTS cheques_depot (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  remise_id    BIGINT REFERENCES remises_banque(id) ON DELETE SET NULL,
  source_table TEXT NOT NULL,
  source_id    BIGINT NOT NULL,
  emetteur     TEXT NOT NULL DEFAULT '',
  montant      NUMERIC(10,2) NOT NULL DEFAULT 0,
  numero       TEXT NOT NULL DEFAULT '',
  banque       TEXT NOT NULL DEFAULT '',
  photo_url    TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT ''
);
ALTER TABLE inscriptions_cours ADD COLUMN IF NOT EXISTS remise_id BIGINT REFERENCES remises_banque(id) ON DELETE SET NULL;
ALTER TABLE cours_yoga          ADD COLUMN IF NOT EXISTS remise_id BIGINT REFERENCES remises_banque(id) ON DELETE SET NULL;
ALTER TABLE remises_banque ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "remises_admin" ON remises_banque;
CREATE POLICY "remises_admin" ON remises_banque FOR ALL USING (is_admin()) WITH CHECK (is_admin());
ALTER TABLE cheques_depot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cheques_admin" ON cheques_depot;
CREATE POLICY "cheques_admin" ON cheques_depot FOR ALL USING (is_admin()) WITH CHECK (is_admin());
GRANT ALL ON remises_banque TO authenticated;
GRANT ALL ON cheques_depot  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE remises_banque_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE cheques_depot_id_seq  TO authenticated;
```
- [ ] Rappels emails automatiques pour paiements CB en plusieurs fois (cb3x) — relances aux échéances
- [x] Rubrique Devis : formulaire public + générateur PDF + admin complet — TERMINÉ (voir section Devis)
- [ ] Devis : envoyer le PDF par email directement depuis l'appli (actuellement via Gmail ouvert manuellement)
- [x] Devis : Turnstile ajouté sur demande-devis.html (widget retiré en iframe Wix, vérifié hors iframe)
- [ ] **Assistant vocal/texte dans l'admin** : champ texte (ou micro) qui envoie une commande en langage naturel à Claude via l'API Anthropic, avec `adminData` en contexte. Claude interprète l'intention et appelle la fonction JS correspondante. Exemples : "pointer la carte de Dupont", "inscrire Untel au cours de mercredi", "combien d'élèves ont une carte qui expire ce mois-ci ?". Étapes : définir les actions autorisées, demander confirmation avant exécution ("Pointer 1 cours pour Felipe Diaz aujourd'hui — confirmer ?"), gérer les ambiguïtés ("2 Dupont trouvés, lequel ?").

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
- Prix pour les dates non gratuites : lu depuis `localStorage.tev_tarifs_actifs`, fallback `15€`
- Pour mettre à jour les dates : Paramètres admin → Yoga → Dates
- **Table cible** : `inscriptions_essai_yoga` (pas `inscriptions_essai`)
- **Saison** : déterminée depuis la date elle-même via `dateAppartientSaison()` — pas besoin de stocker un champ `saison`
- **Après soumission** : écran de succès + compte à rebours 8s → `restart()` + bouton manuel "← Retour"
- **Ordre impératif** : INSERT Supabase **avant** BroadcastChannel (règle iframe détaché — voir CLAUDE.md)

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

**Statut à l'inscription (table `inscriptions_stages`, champ `type_confirmation`) :**
- **Guidée seule** (role=`'Guidé(e)'` et situation≠`'avec-partenaire'`) → `type_confirmation='attente'`
- **Tous les autres** (guideur, couple, double rôle) → `type_confirmation='confirme'`

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
- **Bonus coupures** : pour chaque semaine sans cours (vacances, jours fériés) dans ces 3 mois → expiration repoussée d'1 semaine
- **Bonus inter-saison** : si la carte court sur l'été (fin juin → début septembre), toutes les semaines estivales sans cours sont aussi comptées
- Formule : `expiration = datePremierCours + 3 mois + (nb semaines sans cours × 7 jours)`
- Calcul : `calcExpiration(datePremierCours, ville)` dans `admin.html` et `_calcExpirationSb()` dans `tev-supabase.js`
- Les semaines sans cours sont dans `SANS_COURS_PARIS` et `SANS_COURS_VINCENNES` dans `admin.html` — à mettre à jour chaque saison
- ⚠️ **Ne jamais mettre les dates juillet-août dans `SANS_COURS_*`** : le bonus inter-saison (step 3) couvre déjà tout l'été — les inclure causerait un double-comptage et gonflerait l'expiration de plusieurs semaines

**Limite journalière de pointage**
- Maximum **2 cours par date** (toutes sources confondues : admin, espace élève, QR code)
- Le 3ᵉ scan ou pointage sur la même date est ignoré

**⚠️ Pas d'auto-renouvellement — jamais**
Le renouvellement est **toujours une action manuelle**. Il n'existe que deux voies :
1. **Admin** : clic sur "Renouveler" dans Cartes 10 → Détails
2. **Élève** : clic sur "Renouveler sans payer pour l'instant" dans son espace, quand sa carte est à 10/10

**QR code — pointage uniquement**
- Scanné **1 fois** sur une date → 1 cours ajouté
- Scanné **2 fois** sur une date → 2 cours ajoutés
- Si déjà 2 cours pointés ce jour-là → scan ignoré (`skipped: true`)
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
| Code | Déclencheur | Destinataire | Objet |
|------|-------------|--------------|-------|
| **E1** | Inscription confirme (>7j avant le cours) | Élève | "Cours d'essai confirmé !" + rappel J-7 annoncé |
| **E2** | Inscription guidée seule (toujours attente) | Élève | "Cours d'essai : liste d'attente" |
| **E4** | 7 jours avant le cours (déclencheur quotidien) | Élève confirmé | "Rappel J-7" avec boutons ✓ Je serai là / 📅 Reporter / ✕ Annuler |
| **E5** | Inscription confirme mais quota dépassé | Élève | "Cours d'essai : liste d'attente" (créneau complet) |
| **E6** | Inscription confirme <7j avant le cours | Élève | "Cours d'essai confirmé !" (sans rappel J-7 à venir) |
| **E15** | Quand admin valide une guidée de la liste d'attente | Élève | "Cours d'essai confirmé !" avec bouton de confirmation de présence |
| **J+1a** | Lendemain du cours, si présent | Élève présent | "À bientôt sur la piste !" + lien inscription cours réguliers |
| **J+1b** | Lendemain du cours, si absent | Élève absent | "On vous attend bientôt !" + lien cours d'essai |
| **Admin** | À chaque nouvelle inscription | Admin | Récap complet avec statut (E1/E2/E5/E6) |

**Contenus clés E1/E6 :** confirmation, infobox (date, heure, lieu, tarif), livret téléchargeable, conseils (chaussures lisses, arriver 5min avant, etc.)
**Contenu E4 :** infobox + 3 boutons (confirmer/reporter/annuler) → liens vers Apps Script → à remplacer par liens Supabase Edge Function
**Livrets :** URLs par saison dans `LIVRETS` dans Code.gs — à intégrer dans les Paramètres admin

### Stages
| Code | Déclencheur | Destinataire | Objet |
|------|-------------|--------------|-------|
| **Confirmé** | Inscription type_confirmation='confirme' | Élève | "Votre stage est confirmé !" + récap dates+slots+prix + adresse Centre Kim Kan |
| **Attente** | Inscription type_confirmation='attente' | Élève | "Demande de stage reçue" + récap + explication parité |
| **Tardive** | Admin valide une inscrite en attente | Élève | "Bonne nouvelle ! Votre stage est confirmé !" |
| **Admin** | À chaque nouvelle inscription | Admin | Récap complet |

### Inscription cours tango régulier
| Code | Déclencheur | Destinataire | Objet |
|------|-------------|--------------|-------|
| **E01** | Demande reçue (formulaire inscription-cours) | Élève | "Votre demande a bien été reçue" + prochaines étapes (48-72h validation, paiement) |
| **E02** | Admin valide la demande → statut='valide' | Élève | "Votre inscription est validée" + montant (170€ par défaut) + modalités paiement |
| **E03** | Admin valide le paiement → statut='inscrit' | Élève | "Inscription confirmée, à bientôt !" + lien espace élève PWA |
| **E17** | Mode pré-inscription (mai-août) | Élève | "Pré-inscription 2026-2027 reçue" + info reprise septembre |
| **Admin** | Chaque nouvelle demande | Admin | Récap (prénom, email, cours, rôle) |

### Cartes 10 cours
| Code | Déclencheur | Destinataire | Objet |
|------|-------------|--------------|-------|
| **Bienvenue** | Premier pointage de la saison | Élève | "Bienvenue dans votre cours !" + instructions PWA |
| **Renouvelée sans payer** | Élève clique "Renouveler sans payer" dans son espace (carte à 10/10) | Élève | "Nouvelle carte ouverte, pensez à payer sur AssoConnect" + lien renouvellement |
| **E10** | Admin renouvelle manuellement depuis Cartes 10 → Détails | Élève | "Carte renouvelée, à bientôt !" |
| **Fin saison J+1** | Déclencheur : lendemain dernier cours Paris juin | Élèves avec cours restants | "Il vous reste N cours — pré-inscrivez-vous avant le 25 août" |
| **Fin saison 25 août** | Déclencheur quotidien le 25 août | Élèves avec cours restants non ré-inscrits | "Dernier rappel : vos cours expirent" |
| **Relance 2 absences** | Vendredi matin (Paris) / mardi matin (Vincennes) via GitHub Actions cron | Élève carte10 absent aux 2 derniers cours d'affilée | "On prend de tes nouvelles…" — déclenché même si l'élève a déclaré son absence via 🚫. Logique : dates cours depuis `parametres` (`tev_cours_dates`) − présences (`presences` table) = absences. Anti-doublon : colonne `derniere_relance_abs DATE` sur `eleves` (ne renvoie pas si déjà envoyé pour ces 2 mêmes dates). Script Node.js dans `.github/scripts/relance-absences.js` + workflow `relance-absences.yml`. **À implémenter en même temps que les autres emails Brevo.** |

### Cours particuliers
| Déclencheur | Destinataire | Objet |
|-------------|--------------|-------|
| Formulaire soumis | Admin (tangoetvous@gmail.com) | "Cours particulier — Prénom Nom" + récap complet (prof, durée, lieu, objectifs, urgence) |
| Formulaire soumis | Élève | "Demande de cours particulier reçue" + récap + contact (06 61 72 79 98 / tangoetvous@gmail.com) |

### Profil élève
| Code | Déclencheur | Destinataire | Objet |
|------|-------------|--------------|-------|
| **Activation** | Admin active un profil (statut='Actif') | Élève | "Votre espace élève est prêt" + lien PWA + instructions connexion magic link |
| **Nouveau profil** | Création automatique depuis formulaire | Admin | "Nouveau profil : Prénom Nom" + source (essai/inscription/stage/CP) |

### Récapitulatif fin de saison (déclencheurs automatiques)
- **1er septembre** : désactivation des élèves sans carte reportée → email admin récap (N élèves désactivés)
- **J+1 après dernier cours Paris** : emails fin de saison aux élèves avec cours restants
- **25 août** : relance finale aux élèves avec cours restants non ré-inscrits

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
**À créer/remplacer dans Supabase.** Compte guideurs+guidées confirmés = inscriptions essai + élèves réguliers du cours.

```sql
CREATE OR REPLACE FUNCTION compter_inscrits_essai(
  p_date_essai date,
  p_ville text,
  p_niveau text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saison text;
  v_gui_essai integer := 0;
  v_gde_essai integer := 0;
  v_gui_cours integer := 0;
  v_gde_cours integer := 0;
BEGIN
  -- Calcul de la saison depuis la date (sept = début de saison)
  v_saison := CASE
    WHEN EXTRACT(MONTH FROM p_date_essai) >= 9
    THEN EXTRACT(YEAR FROM p_date_essai)::text || '-' || (EXTRACT(YEAR FROM p_date_essai) + 1)::text
    ELSE (EXTRACT(YEAR FROM p_date_essai) - 1)::text || '-' || EXTRACT(YEAR FROM p_date_essai)::text
  END;

  -- Inscriptions essai confirmées pour cette date+ville+niveau
  SELECT
    COUNT(*) FILTER (WHERE role IN ('guideur', 'double') AND statut = 'confirme'),
    COUNT(*) FILTER (WHERE role = 'guidee' AND statut = 'confirme')
  INTO v_gui_essai, v_gde_essai
  FROM inscriptions_essai
  WHERE date_essai = p_date_essai
    AND ville = p_ville
    AND niveau = p_niveau
    AND type = 'tango';

  -- Élèves réguliers inscrits à ce cours (même saison)
  SELECT
    COUNT(*) FILTER (WHERE role = 'guideur'),
    COUNT(*) FILTER (WHERE role = 'guidee')
  INTO v_gui_cours, v_gde_cours
  FROM inscriptions_cours
  WHERE ville = p_ville
    AND niveau = p_niveau
    AND statut = 'inscrit'
    AND saison = v_saison;

  RETURN json_build_object(
    'gui', v_gui_essai + v_gui_cours,
    'gde', v_gde_essai + v_gde_cours
  );
END;
$$;

GRANT EXECUTE ON FUNCTION compter_inscrits_essai(date, text, text) TO anon, authenticated;
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

-- Inscriptions cours régulier (exclut les supprimés)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cours_no_double
  ON inscriptions_cours (lower(trim(prenom)), lower(trim(nom)), ville, niveau, saison)
  WHERE statut != 'supprimé';

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

## Session 2026-05-07 — Formulaires Wix + corrections inscription-cours

### ✅ Corrections inscription-cours.html (2 cours / 2 partenaires différents)
- **`buildRecapCours()`** : affiche désormais "Partenaire cours 1" et "Partenaire cours 2" séparément au lieu de n'en montrer qu'un seul
- **`sTarif()`** : deux blocs de profil distincts (tarif réduit + formule + Sorano) chacun adapté à la ville du cours concerné uniquement — partenaire 1 → ville cours 1, partenaire 2 → ville cours 2
- **`calcTarif()`** : chaque partenaire évalué sur sa seule ville ; état `S.p2Reduit`, `S.p2Formule`, `S.p2Vincennois`, `S.p2AgeVinc`, `S.p2DejaSorano` ajoutés pour profil partenaire 2
- **Insertion Supabase** : déjà correct avant cette session — 4 lignes créées (principal×2 + part1 + part2), toutes en `attente_paiement`
- **Récap live partenaire** : `_liveRecap(num)` mise à jour du récap en temps réel à la saisie des champs nom/prénom (utilisateur + partenaire). `oninput="_liveRecap(${num})"` sur `p-pre` et `p-nom`. Recap div a `id="recap-live"`. Appelée aussi sur `i-pre`/`i-nom` pour le nom de l'utilisateur.
- **Bloc ↑ répété** (scroll hint Wix) : `_scrollHint()` génère 67 répétitions de "↑ Remonter…" toutes les 3 lignes (200 lignes au total), texte doré 16px gras, flèche 32px. Injecté en bas des étapes 4 (`sCours(2)`) et 6 (`sTarif()`). **À faire pour les autres formulaires** (cours-particuliers, stages-pwa, cours-essai) — pas encore fait.

### ✅ Hint "remontez en haut" dans les formulaires publics
Ajouté juste avant chaque bouton "Continuer →" / "Suivant" qui déclenche une transition d'étape :
- `inscription-cours.html` : dans `sInfos()`, avant les boutons d'action (affiché uniquement si rôle sélectionné)
- `cours-particuliers.html` : avant les 3 boutons `nextQui()`, `nextCours()`, `nextObj()`
- `stages-pwa.html` : avant le bouton `btnContinuer` (étape 1→2)
- `cours-essai.html` : **non modifié** — étapes 1-3 auto-avancent au clic (pas de scroll problématique)
- `essai-yoga.html` : **non modifié** — formulaire une seule page, pas de transition

### ✅ Bug stages-pwa.html — niveau "Avancé" invisible sur iPhone
Cause : `.radio-group.horizontal { flex-direction: row }` + 3 items `flex:1` → trop étroit sur 375px.
Fix : ajout de `flex-wrap: wrap` → les items passent à la ligne si écran trop étroit.

### ❌ Zoom / réduction de taille des formulaires sur Wix mobile — IMPOSSIBLE

Le moteur de rendu Wix applique son propre facteur d'échelle mobile (canvas virtuel ~320px → écran réel ~390px = ×1.22) **en dehors de toute portée CSS/JS**. Aucune approche ne fonctionne :

| Approche | Résultat | Raison de l'échec |
|---|---|---|
| `html { zoom: 0.82 }` dans la form | ❌ aucun effet | Wix applique son scale après le rendu CSS de la form |
| `document.documentElement.style.zoom = '0.82'` (JS) | ❌ aucun effet | Idem |
| `transform: scale(0.82)` sur div wrapper dans parastorage | ❌ "Forbidden" | Cross-origin iframe dans container transformé = restriction sécurité navigateur |
| `zoom: 0.82` sur `body` du parastorage | ❌ "Forbidden" | Même restriction |
| `#fw { zoom: 0.6 }` (div wrapper dans la form) | ❌ aucun effet | Wix scale override côté rendu |

**Règle** : ne jamais réessayer ces approches. Le zoom Wix mobile est une limitation définitive et acceptée. Les formulaires apparaissent légèrement plus grands sur mobile Wix que sur navigateur direct — aucun correctif CSS/JS possible.

### ❌ Scroll automatique vers le haut à chaque étape — IMPOSSIBLE dans ce contexte Wix
Problème fondamental : les formulaires sont dans un **iframe dans un iframe** (form `app.tangoetvous.fr` → parastorage Wix → page Wix). Chaque tentative a échoué :

| Approche | Résultat | Raison de l'échec |
|---|---|---|
| `window.scrollTo(0,0)` dans la form | ❌ | Iframe full-height (scrolling="no") → rien à scroller dans l'iframe |
| `f.scrollIntoView()` depuis parastorage | ❌ desktop OK, ❌ iOS | iOS Safari bloque scrollIntoView cross-origin sur 2 niveaux d'iframe |
| `window.parent.postMessage` + Velo `$w('#html').onMessage()` | ❌ | `onMessage` ne reçoit que les messages via `window.Wix.postMessage()` ; `window.Wix` est undefined avec wix-code-sdk |
| `window.addEventListener('message')` dans Velo | ❌ | Velo sandbox : `ReferenceError: Can't find variable: window` |
| `location.hash = '#top'` dans parastorage | ❌ | `overflow:hidden` sur le body parastorage empêche tout scroll interne |
| `window.top.location.hash` | ❌ | Cross-origin bloqué par le navigateur |
| `window.Wix.setHeight()` | ❌ | `window.Wix` undefined avec `wix-code-sdk/dist/sdk.js` |

**Règle** : ne pas réessayer ces approches. La solution retenue est le **message texte visible** dans le formulaire avant les boutons de transition.

**SDK Wix** : seul `https://static.parastorage.com/services/wix-code-sdk/dist/sdk.js` fonctionne sans "Forbidden". Il n'expose pas `window.Wix`. L'ancien SDK (`unpkg/wix-sdk/dist/js/Wix.js`) qui exposait `window.Wix.setHeight()` cause "Forbidden" dans Wix.

### 📋 État des formulaires publics — PRÊTS (2026-05-07)
Tous testés et fonctionnels dans la PWA. Intégrés dans Wix en iframe :
- `inscription-cours.html` ✅
- `cours-essai.html` ✅
- `essai-yoga.html` ✅
- `stages-pwa.html` ✅
- `cours-particuliers.html` ✅

**Limitation connue acceptée** : pas de scroll automatique vers le haut entre étapes dans Wix (impossible techniquement). Compensé par le message texte doré "↑ Après avoir cliqué, remontez en haut de la page pour continuer".

**Code Wix HTML element (identique pour tous les formulaires)** :
```html
<script>
  var f = document.getElementById('f');
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'tevHeight') {
      f.style.height = e.data.height + 'px';
      try { window.Wix.setHeight(e.data.height); } catch(err) {}
    }
    if (e.data && e.data.type === 'tevScrollTop') {
      f.scrollIntoView({behavior:'smooth', block:'start'});
      try { window.parent.postMessage({type:'tevScrollTop'}, '*'); } catch(err) {}
    }
  });
</script>
```
Le code Velo Wix doit rester **vide** (`$w.onReady(function(){});`) — toutes les tentatives Velo ont échoué.

### 💡 Pistes de migration hors Wix (évoquées, non décidées)
Si l'utilisateur veut quitter Wix à terme, options envisagées :
- **Framer** : design moderne, bon support iframe/code custom, export vers domaine propre
- **Webflow** : plus contrôle code, hosting propre, sans sandbox iframe restrictif
- **Page HTML statique hébergée sur Cloudflare** (`app.tangoetvous.fr/accueil.html`) : contrôle total, même domaine que les formulaires → plus de cross-origin, scroll automatique fonctionnerait nativement, CSP maîtrisée — migration progressive possible
- **Avantage clé d'une page Cloudflare** : formulaires et page d'accueil sur le même domaine → `postMessage` same-origin → scroll, Turnstile, et toute communication JS fonctionnent sans restriction Wix

### 🔧 Autres corrections techniques de la session
- **`postMessage({type:'tevScrollTop'})` ajouté dans `render()`** de `inscription-cours.html` (ligne ~489) — notifie le parent à chaque changement d'étape
- **Bug `+ '5944px'`** dans le code Wix HTML des Stages corrigé → `+ 'px'`
- **Turnstile** : problème "impossible de se connecter" résolu en ajoutant `app.tangoetvous.fr` aux domaines autorisés dans le dashboard Cloudflare Turnstile

---

## Session 2026-05-08 — Trésorerie + calcExpiration + sauvegarderEditCarte

### ✅ Module Trésorerie
SQL exécuté dans Supabase (tables `remises_banque`, `cheques_depot`, colonnes `remise_id` sur `inscriptions_cours` et `cours_yoga`). UI dans admin.html onglet Compta → Trésorerie. Testé et fonctionnel.

### ✅ Backup CSV — cron CEST
Cron corrigé de `0 22 * * *` → `0 21 * * *` (23h Paris en été CEST = UTC+2). L'utilisateur recevait le backup à 1h du matin.

### ✅ Scroll hint "↑ Remonter" dans les formulaires publics
`_scrollHint()` + `_tevScrollTop()` ajoutés dans :
- `inscription-cours.html` : étapes 4 (`sCours(2)`) et 6 (`sTarif()`)
- `cours-particuliers.html` : bas des étapes 2, 3, 4
- `stages-pwa.html` : bas de l'étape 2
- `cours-essai.html` : bas de l'étape 4 (`e4`)

Style : texte doré `#f0c030`, 16px gras, flèche 32px, 67 répétitions toutes les 3 lignes (200 lignes au total). Clic sur la flèche → `_tevScrollTop()` → `window.scrollTo(top)` + `postMessage({type:'tevScrollTop'})` → `f.scrollIntoView()` dans le HTML Wix.

### ✅ Récap live partenaire (inscription-cours.html)
`_liveRecap(num)` met à jour le div `#recap-live` en temps réel sur `oninput` des champs `p-pre`, `p-nom`, `i-pre`, `i-nom`. Sans ça, le partenaire n'apparaissait dans le récap qu'en naviguant à l'étape suivante puis en revenant.

### ✅ `calcExpiration` — double-comptage été corrigé
**Cause** : les dates juillet-août 2026 étaient dans `SANS_COURS_PARIS`/`SANS_COURS_VINCENNES` (step 2 : +7j par semaine) ET couvertes par le bonus inter-saison (step 3 : gap complet). Résultat : expiration gonflée de ~8 semaines. Exemple : premier cours 3/05 Paris → expiration affichée 22/11 au lieu de ~19/10.
**Fix** : suppression de toutes les dates juillet-août des deux tableaux. L'été est géré exclusivement par le step 3.
**Règle** : ne jamais remettre des dates estivales dans `SANS_COURS_*`.

### ✅ `sauvegarderEditCarte` — persistance des dates et de l'expiration
**Cause 1** : `datesCours` est reconstruit depuis `presences` à chaque `chargerDonnees()`. La fonction ne touchait pas `presences` → les dates revenaient à l'état initial au rechargement.
**Fix** : DELETE de toutes les présences de l'élève (`eleve_id`) + INSERT une présence par date saisie (`note:'Correction admin'`).

**Cause 2** : la garde `!c.expiration` empêchait le recalcul si une expiration existait déjà → changer `datePremierCours` n'actualisait pas l'expiration.
**Fix** : suppression de la garde → l'expiration est toujours recalculée quand `datePremierCours` est renseigné.

**Cas cartes reportées (`_fromCoursTango`)** : `c.id` = `inscriptions_cours.id`, mais la personne a un vrai `eleves.id`. Il est retrouvé via `adminData.cartes.find(x => x.email === c.email)` (fiche présente avec l'ancienne saison). `Promise.all` parallèle sur : `eleves` (compteurs + dates) + `presences` (DELETE/INSERT) + `inscriptions_cours.donnees.reportedRestants`.

## Session 2026-05-10 — Flux ICS publics + agenda milongas

### ✅ Sélecteurs milonga par nom dans Agenda → Modifier/Annuler + Ajouter en lot
- `_isMilongaType(type)` : retourne `true` pour `'milonga'` ou `'milonga-<id>'`
- `_milFilter(type)` : retourne un filtre `(mil) => mil.id === milId` pour cibler une milonga précise ; `type='milonga'` = toutes (compat ascendante)
- `_milNomFromType(type)` : retourne le nom affiché (`mil.nom`) depuis l'id
- Les sélecteurs de type dans "Modifier/Annuler" et "Ajouter en lot" sont maintenant dynamiques depuis `MILONGAS` : `milonga-dolce-vita` → "LA DOLCE VITA", `milonga-colectivo` → "LE COLECTIVO"
- Migration : les anciennes entrées `agendaOverrides` avec `type='milonga'` restent compatibles

### ✅ `agendaOverrides` persistés dans Supabase
- Clé `tev_agenda_overrides` dans `parametres`
- `sauverModifAgenda` et `supprimerModifAgenda` appellent `TEV.setParam('tev_agenda_overrides', agendaOverrides)` après chaque modification
- `chargerParamsRemote()` recharge `agendaOverrides` depuis Supabase → synchronisation cross-device

### ✅ Abonnements Agenda (index.html) — UI
- Textes sous-titre et instructions passés de `var(--text-faint)` à `var(--text)` (blanc au lieu de gris)
- Instructions en bas : `font-size` passé de 11px à 13px

### ✅ Flux ICS publics — horaires depuis Supabase
**Problème** : `tev_params_paris_2025-2026` en Supabase ne contenait que `tarifs` et `adresse` — aucune section `horaires`. Worker générait 0 événement pour Paris débutant/intermédiaire.

**Fix** : `chargerParamsRemote()` dans `admin.html` auto-initialise les `DEFAULTS_HORAIRES` dans Supabase au premier chargement si absents :
```javascript
['paris','vincennes','yoga','stages'].forEach(function(type) {
  var key = 'tev_params_' + type + '_' + _saiAct;
  if (DEFAULTS_HORAIRES[type] && (!params[key] || !params[key].horaires)) {
    _saveParam(type, _saiAct, 'horaires', DEFAULTS_HORAIRES[type]);
  }
});
```
→ Dès que l'admin recharge l'appli, les horaires par défaut sont poussés dans Supabase. Les modifications via Paramètres → Horaires → Enregistrer écrasent ces défauts.

**Règle** : le worker ne hardcode plus de valeurs de fallback — tout vient de Supabase. `DEFAULTS_HORAIRES` dans admin.html fait autorité.

### ✅ Flux ICS milongas — deux corrections
**1. Format des dates `mil.dates`** : peut être `[{date, label, horaire_debut?, horaire_fin?}]` (objets) ou `['YYYY-MM-DD', ...]` (strings legacy). Le worker gère maintenant les deux :
```javascript
const dateStr = typeof de === 'string' ? de : de.date;
const hdeb = (typeof de === 'object' ? de.horaire_debut : null) || mil.horaire_debut;
```
Corrigé dans `handlePublicICS` ET `handleEleveICS`.

**2. Heure de fin qui passe minuit** : Le Colectivo finit à `'2h'` (2h du matin). `DTEND: 2026-09-27T02:00` < `DTSTART: 2026-09-27T20:30` → invalide RFC 5545 → événements rejetés silencieusement par Google Calendar/iOS.
Fix : `_calIcsDate(isoDate, timeStr, afterTime)` — si `timeStr < afterTime`, la date est avancée d'un jour :
```javascript
function _calIcsDate(isoDate, timeStr, afterTime) {
  let date = isoDate;
  if (afterTime && _calParseTime(timeStr) < _calParseTime(afterTime)) {
    const d = new Date(isoDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
  }
  return date.replace(/-/g, '') + 'T' + _calParseTime(timeStr);
}
```
Appelé avec `_calIcsDate(dateStr, hfin, hdeb)` pour le DTEND des milongas.

### Architecture ICS — résumé complet
- **Flux élève personnel** (`/calendar/e-{token}.ics`) : cours de l'élève + milongas + stages. Horaires depuis `tev_params_paris/vincennes_<sai>` avec `HOR_P`/`HOR_V` hardcodés comme filet de secours ultime.
- **Flux publics** (`/calendar/{slug}.ics`) : `handlePublicICS()` — lit TOUS les params Supabase (`?select=cle,valeur`), fusionne saison courante + saison suivante pour milongas et stages.
- **Source des horaires** : `tev_params_{type}_{sai}.horaires` — auto-initialisé depuis `DEFAULTS_HORAIRES` par `chargerParamsRemote()`, puis modifiable via Paramètres → Horaires → Enregistrer.
- **Source des dates milongas** : `tev_milongas_{sai}.milongas[].dates` — géré depuis Paramètres → Milongas. Ajout/suppression de dates = auto-sauvegarde (`sauverMilongas()` appelé sans bouton supplémentaire, toast de confirmation affiché). Modification info/horaires = bouton "Enregistrer" dans l'accordéon Info.
- **Modifications Agenda** (`agendaOverrides`) : stockées dans `tev_agenda_overrides`, utilisées pour l'affichage dans l'agenda admin ET pour l'ICS (testé fonctionnel).
- **Fusion deux saisons** : milongas et stages fusionnent `saiCur` + `saiNext` pour montrer les dates futures de la prochaine saison dans l'ICS courant.
