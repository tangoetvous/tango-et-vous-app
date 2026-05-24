# Tango & Vous — Contexte projet pour Claude Code

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
- [ ] **Inscriptions Tango → Supprimés — actions manquantes** : ajouter sur chaque fiche de l'onglet Supprimés : (1) bouton 🗑 "Supprimer définitivement" → `DELETE FROM inscriptions_cours WHERE id=...` ; (2) bouton ↩ "Rétablir" → `UPDATE inscriptions_cours SET statut='demande', donnees=(donnees - 'supprimé_de')` + retirer le marqueur local `_suppriméDeInscriptions` + retirer de `_pendingSupprimes`.
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
- [ ] **Septembre 2026 — mettre en place Playwright** : tests E2E sur `admin.html` en mode démo, ciblés sur les points fragiles (couples email partagé dans Cartes 10, `calcExpiration`). Playwright démarre/arrête le serveur local automatiquement, une seule commande `npm test`. Voir session 2026-05-13 pour le contexte. Option B choisie (vs Vitest unitaire) car teste le vrai code sans duplication.
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
- [x] Tester modification cours/paiement/montant → persiste après refresh — CORRIGÉ (2026-05-13, voir session VP)
- [ ] Installer l'appli sur Mac (PWA déjà prête) : ouvrir admin dans Chrome → icône ⊕ dans la barre d'adresse → Installer
- [ ] Vérifier formulaires publics (inscription cours, stages, essai) connectés à Supabase
- [x] **Emails automatiques + notifications push** — FAIT (session 2026-05-21) : 27 handlers dans worker.js couvrent tous les emails du catalogue (essai tango E0–E15, yoga Y0–YI1, stages S0–S4, inscriptions I02–I04, cartes C1–C6/CX/CP, cours particuliers CP0/CP1, devis D0/D2, Sorano SR1/SR2, activation espace élève P1). FCM push câblé dans 8 handlers. Tables `fcm_tokens` + `notifications_eleve` créées. 7 workflows GitHub Actions créés (E4, S4, Y3, P1, C4, C5, C6). ⚠️ **SQL à exécuter avant premier run C6** : `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS derniere_relance_abs DATE;`
- [ ] **Nettoyage tokens FCM invalides** — à implémenter : FCM retourne les erreurs dans la réponse → après `sendFcmPush`, lire `result.results` → filtrer `registrationTokenNotRegistered` / `invalidRegistrationToken` → `DELETE FROM fcm_tokens WHERE token IN (...)`. Ajouter dans `sendFcmPush` directement.
- [ ] **Notifications + emails lors des modifications ✏️ essai** : quand l'admin modifie un essai tango (date/ville/niveau) ou yoga (date/cours) via ✏️, envoyer à l'élève : (1) email Brevo "Votre cours d'essai a été modifié : [détails]" + (2) notification dans `notifications_eleve`. Table `notifications_eleve` à créer (SQL dans section "SQL utiles"). L'UI côté élève (icône 🔔 header, panneau) est déjà prête dans index.html.
- [ ] Étendre icône 🔔 (badge rouge) + push aux événements suivants : essai tango, essai yoga, demande d'inscription tango, inscription stage, cours particuliers, demande de devis, RSVP milonga depuis espace élève — d'autres cas à lister par l'utilisateur
- [ ] **Push élève — pas de cours la semaine prochaine** : le lendemain d'un cours, si le prochain cours est à plus de 7 jours, envoyer une notification push à tous les élèves inscrits à ce cours (Paris ou Vincennes). Même logique que le bandeau d'alerte dans l'accueil. Déclencheur : GitHub Actions cron le lendemain de chaque jour de cours (vendredi matin Paris / mardi matin Vincennes), ou Supabase Edge Function. À implémenter en même temps que l'infrastructure FCM.
- [ ] **Compléter lien cours d'essai dans `inscription-cours.html`** : remplacer `LIEN_ESSAI_A_COMPLETER` (ligne du bandeau au-dessus de la barre de progression) par l'URL Wix du formulaire cours d'essai — l'utilisateur doit fournir cette URL.
- [ ] **⚠️ URL formulaire cours d'essai à renseigner dans les emails inscription** : dans `preview-emails-inscription-v1.html`, remplacer `#URL_FORMULAIRE_ESSAI_A_RENSEIGNER` (présent dans I01-attente option 3 et I01-complet option 3) par l'URL Wix/app du formulaire cours d'essai tango. Même URL que `LIEN_ESSAI_A_COMPLETER` ci-dessus. À faire dès que l'utilisateur fournit cette URL.
- [x] Revoir le formulaire cours particuliers — FAIT (lisibilité textes, multi-lieux étape 2, durée déplacée étape 4, cases jours Lu/Ma/Me/Je/Ve, créneau horaire début→fin, propositions de dates)
- [x] Photo de profil élève — FAIT : colonne `photo_url TEXT` ajoutée dans `eleves` (SQL exécuté). Upload depuis admin (fiche ✏️) ET depuis espace élève (section "Mes coordonnées"). Synchronisation bidirectionnelle via `tevUpdateElevePhoto()`.
- [x] Téléphone modifiable depuis espace élève — FAIT : section "📋 Mes coordonnées" dans `renderAccueil()`, bouton "Enregistrer" → `saveTel()` → `TEV.updateEleveTel()` → UPDATE `eleves`.
- [x] Onglets espace élève renommés — FAIT : "Carte" → "Forfait", "Actu" → "Publications" (dans `NAV_TABS` et `_TAB_LABELS` dans index.html)
- [x] Email admin → sync Supabase Auth — CORRIGÉ : `sauverContact()` appelle `PATCH /api/admin/update-auth-email` (non-bloquant) quand l'email change. Worker utilise `env.SUPABASE_SERVICE_KEY` (secret Cloudflare, déjà configuré) pour appeler l'Admin Auth API Supabase et mettre à jour l'email sans déconnecter l'élève.
- [ ] **Tester sync email Auth** : dans admin, changer l'email d'un élève → F12 → Network → chercher `update-auth-email` → vérifier réponse `{"ok":true,"userId":"..."}` → vérifier dans Supabase Dashboard → Authentication → Users
- [x] Téléphone et photo modifiables depuis espace élève — CORRIGÉS : `tevUpdateEleveTel` n'écrit que dans `eleves` (RLS interdit UPDATE sur `inscriptions_cours` aux non-admins). Priorité inversée dans `tevGetAdminData()` : `elv.tel || ic.tel` (au lieu de `ic.tel || elv.tel`) pour que la valeur fraîche de `eleves` prime sur l'ancienne de `inscriptions_cours`. Photo : même logique, `eleves.photo_url` mis à jour via `tevUpdateElevePhoto`. ⚠️ Règle à retenir : tout champ modifiable depuis l'espace élève doit écrire dans `eleves` et être lu en priorité depuis `eleves` dans l'admin.
- [x] **Module Trésorerie (Compta)** — UI complète implémentée dans admin.html (onglet Compta → Trésorerie). SQL exécuté dans Supabase le 2026-05-08. ✅ Testé et fonctionnel.
- [x] **`calcExpiration` — refonte complète (2026-05-13)** : suppression de `SANS_COURS_PARIS/VINCENNES` hardcodés. Les semaines sans cours sont détectées automatiquement depuis les gaps dans `tev_cours_dates` (Paramètres). Fix timezone T00→T12. Voir section "Session 2026-05-13 (suite 3)".
- [x] **`sauvegarderEditCarte` ne persistait pas** — CORRIGÉ : les dates venaient de la table `presences` (reconstruite à chaque `chargerDonnees`). Fix : DELETE des présences existantes + INSERT des nouvelles pour cet `eleve_id`. L'expiration est recalculée systématiquement (suppression de la garde `!c.expiration`). Pour les cartes reportées (`_fromCoursTango`) : l'`eleves.id` est retrouvé par email dans `adminData.cartes` (même si la saison ne correspond plus) → `Promise.all` sur `eleves` + `presences` + `inscriptions_cours.donnees`.
- [x] **Badges paiement carte10 — "✓ Payé" et modal paiement** — FAIT (2026-05-12) : cliquer "✓ Payé" ouvre désormais le même modal que "Non payé" (pré-rempli avec les données de l'isRenewal le plus récent). Modal `ouvrirModalCartePaiement` enrichi : si un isRenewal existe pour cet email → pré-remplit montant/mode/date depuis `donnees.datePremierPaiement`, `paiement`, `montant`.
- [x] **Renouvellement carte + "Payé" → ouvre modal paiement** — FAIT (2026-05-12) : dans `confirmerModalRenouveler`, si `paye=true` → appelle `renouvelerCarteAction(id, null, false, 0, callback)` puis le callback ouvre `ouvrirModalCartePaiement`. Le renouvellement lui-même reste non-payé en DB jusqu'à validation dans le modal.
- [x] **Race condition `renouvelerCarteAction` + isRenewal INSERT** — CORRIGÉ (2026-05-12) : la promesse `insertProm` était dans le premier `.then()` mais non retournée → `chargerDonnees` s'exécutait avant la fin de l'INSERT. Fix : `return insertProm` dans le premier `.then()` pour chaîner correctement.
- [x] **`idx_cours_no_double` bloquait les inserts isRenewal** — SQL À EXÉCUTER dans Supabase (2026-05-12) : l'index UNIQUE sur `(prenom, nom, ville, niveau, saison)` rejetait silencieusement les lignes `isRenewal` car même combinaison que l'original. Fix : recréer l'index avec clause `AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true')`.
- [x] **Modal "Modifier l'inscription" — scroll** — CORRIGÉ (2026-05-12) : `.modal-box` manquait `max-height:90vh;overflow-y:auto;` → ajouté globalement.
- [x] **Compta — double-comptage élève 2 cours avec carte10** — CORRIGÉ (2026-05-12) : `_markSharedCartes(liste)` identifie les entrées secondaires (même email, carte10, non-isRenewal) et les marque `montant:0, _sharedCarte:true`. `_buildADeposer` déduplique aussi (garde le montant le plus élevé par email). `_comptaBlock` affiche "carte partagée" avec "—" pour montant/mode.
- [x] **Compta tango — élèves supprimés exclus** — CORRIGÉ (2026-05-12) : `_renderComptaTango` incluait `statut='supprimé'` — seul `statut='inscrit'` est désormais conservé.
- [x] **Stages — labels statut** — CORRIGÉ (2026-05-12) : "Confirmé" → "Validé·e" (pill verte), "Confirmés" → "Validé·e·s" (stat), "✓ Confirmer" → "✓ Valider" (tous les boutons). Ajout d'un bouton "✓ Valider" directement sur les cartes en attente dans la vue "Tous".
- [x] **Inscription directe — ReferenceError `formule`** — CORRIGÉ (2026-05-12) : `formule` déclarée dans le `forEach` (scope local) utilisée après la boucle dans `postAS` (legacy, ne fonctionne plus) → suppression du champ `formule` dans l'appel `postAS`.
- [x] **Inscription directe + VP — 3 formules pour 2 cours + max 2 cours** — FAIT (2026-05-12) : 3 options radio quand 2 cours sélectionnés : (1) "1 carte de 10 + 1 forfait" — sections indépendantes par cours (formule/rôle/paiement/montant/date) ; (2) "Forfait 2 cours" — bloc paiement commun + rôle par cours ; (3) "1 carte de 10 pour les 2 cours" — bloc paiement commun + rôle par cours. Max 2 cours enforced dans l'UI (uncheck silencieux) et dans le submit (erreur). Valeurs `di-formule2` / `vp-formule2` : `'carte10forfait'`, `'forfait2'`, `'carte10unique'`. `soumettreInscriptionDirecte` et `soumettreValiderPaiement` lisent les champs partagés (`di-paie-shared`, `di-montant-shared`, `di-dateP-shared` / idem `vp-`) quand formule partagée. `vpPrefill` détecte automatiquement `carte10unique` (allCarte10 && secondMontant===0).

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
- [ ] **calcExpiration via QR code — premier cours absolu** : si la toute première utilisation d'une carte passe par QR code (jamais ouvert l'espace élève, jamais pointé par l'admin), `pointer_cours_qr` (SQL SECURITY DEFINER) ne calcule pas `carte_expiration` → reste `null` jusqu'à la prochaine interaction admin. Fix : dans `handleCartePointage` (worker.js), vérifier si `carte_date_achat` est null avant le RPC, et si oui, porter l'algorithme A+B+C en JS dans le worker (fetch `tev_cours_dates` depuis `parametres` + même logique que `_calcExpirationSb`) + UPDATE `eleves.carte_expiration` après le RPC. Estimé ~30-45 min. Cas très improbable en pratique.

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
- **Saison courante ET saison suivante** doivent être saisies dans Paramètres pour que l'été soit compté précisément en semaines sans cours (juillet-août = après `lastStored` mais avant `nextSeasonStartISO = 1er sept`).
- **Bug timezone corrigé** : `T00:00:00` → `T12:00:00` partout dans les deux fonctions (évite le glissement UTC/heure locale qui donnait -1 jour).
- ⚠️ **Les dates doivent être saisies depuis le début de la saison** : si une carte a commencé avant la première date dans Paramètres, les semaines sans cours antérieures ne seront pas comptées.
- ⚠️ **Ne jamais remettre de listes `SANS_COURS_*` hardcodées** : le système détecte les gaps automatiquement.

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
| **C4** | Cron : lendemain du dernier cours Paris de juin | Élèves avec cours restants | Bandeau bleu 📅 · "Il vous reste N cours — pré-inscrivez-vous avant le 25 août" · "Il vous suffit de régler l'adhésion à notre association pour l'instant." · lien AssoConnect pré-inscriptions · avertissement expiration fin août |
| **C5** | Cron quotidien le 25 août | Élèves avec cours restants non ré-inscrits | Bandeau orange ⚠️ Dernier rappel · "Ces cours expireront le 31 août si vous ne vous réinscrivez pas" · bouton AssoConnect |
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

## Session 2026-05-12 — Cartes 10, Compta, Stages, Formulaires inscription

### ✅ Modal paiement carte10 — "✓ Payé" et renouvellement
- **"✓ Payé"** (pill verte dans Cartes 10 → Détails) ouvre désormais le même modal de paiement que "Non payé" — pour modifier une donnée déjà saisie. `ouvrirModalCartePaiement` pré-remplit depuis l'isRenewal le plus récent (`montant`, `paiement`, `donnees.datePremierPaiement`).
- **Renouveler → Payé** : `confirmerModalRenouveler` enchaîne `renouvelerCarteAction(id, null, false, 0, callback)` → callback ouvre `ouvrirModalCartePaiement`. Le renouvellement crée la nouvelle carte (non-payée) en DB, puis le modal enregistre le paiement.

### ✅ Race condition isRenewal INSERT + index UNIQUE
- **Race condition** : `renouvelerCarteAction` n'attendait pas la fin de l'INSERT isRenewal avant d'appeler `chargerDonnees`. Fix : `return insertProm` dans le premier `.then()`.
- **`idx_cours_no_double`** bloquait silencieusement les INSERT isRenewal (même prenom/nom/ville/niveau/saison que l'original). **SQL à exécuter dans Supabase** :
```sql
DROP INDEX IF EXISTS idx_cours_no_double;
CREATE UNIQUE INDEX idx_cours_no_double
  ON inscriptions_cours (lower(trim(prenom)), lower(trim(nom)), ville, niveau, saison)
  WHERE statut != 'supprimé'
    AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true');
```

### ✅ Compta — corrections
- **Double-comptage carte10 + 2 cours** : `_markSharedCartes(liste)` — deux passes : (1) trouve le montant max par email parmi les non-isRenewal carte10 ; (2) marque les entrées secondaires `montant:0, _sharedCarte:true`. `_buildADeposer` déduplique (garde entrée à montant le plus élevé par email). `_comptaBlock` affiche badge "carte partagée" avec "—" pour montant/mode sur les entrées dupliquées.
- **Élèves supprimés exclus** : `_renderComptaTango` n'inclut plus `statut='supprimé'` — seul `statut='inscrit'` comptabilisé.
- **Renouvellements (isRenewal)** : comptés une seule fois car `renouvelerCarteAction` utilise `.find()` — une seule ligne isRenewal créée par renouvellement.

### ✅ Stages — refonte labels
- Vue Tous : pill "Confirmé" → **"Validé·e"** ; bouton "✓ Valider" ajouté directement sur les cartes `i.attente` (en plus du sous-onglet Attente)
- Vue Pointage : stat "Confirmés" → **"Validé·e·s"**, recette sous-titre adapté, bouton "✓ Confirmer" → **"✓ Valider"**
- Vue Attente + vue Slot : bouton "✓ Confirmer" → **"✓ Valider"**

### ✅ Inscription directe — bug `formule` hors portée
`formule` était déclaré dans le `coursCoches.forEach` mais référencé après la boucle dans `postAS` (legacy, non fonctionnel). ReferenceError attrapé par try/catch → affiché comme erreur bloquante. Fix : suppression du champ `formule` dans l'appel `postAS`.

### ✅ Formulaires Inscription Directe + Valider Paiement — 3 formules 2 cours
Quand 2 cours cochés, 3 options radio remplacent l'ancienne "Par cours / Forfait 2 cours" :

| Valeur `formule2` | Comportement UI | Comportement DB |
|---|---|---|
| `carte10forfait` | 2 sections indépendantes : formule/rôle/paiement/montant/date par cours | type déduit par cours (carte10 ou forfait) |
| `forfait2` | 1 bloc paiement commun + rôle par cours | type='forfait', idx>0 montant=0 |
| `carte10unique` | 1 bloc paiement commun + rôle par cours | type='carte10' pour les 2, idx>0 montant=0 |

- Max 2 cours : uncheck silencieux dans l'UI + erreur dans le submit
- Champs partagés : `di-paie-shared`, `di-montant-shared`, `di-dateP-shared` (idem `vp-`)
- `vpPrefill` détecte `carte10unique` : `allCarte10 && secondMontant===0`
- `anyMainCarte10` : `carte10UniqueChecked || insRows.some(type==='carte10')`
- Le modal scroll `.modal-box` : `max-height:90vh; overflow-y:auto` ajouté globalement

### ⚠️ SQL restant à exécuter dans Supabase
```sql
-- Fix index UNIQUE pour autoriser les isRenewal
DROP INDEX IF EXISTS idx_cours_no_double;
CREATE UNIQUE INDEX idx_cours_no_double
  ON inscriptions_cours (lower(trim(prenom)), lower(trim(nom)), ville, niveau, saison)
  WHERE statut != 'supprimé'
    AND (donnees IS NULL OR donnees->>'isRenewal' IS DISTINCT FROM 'true');
```

## Session 2026-05-13 — Liaison partenaires, formulaire Valider Paiement

### ✅ Suppression co-inscription partenaire dans DI et VP
- **Décision** : les formulaires "Inscription Directe" et "Valider Paiement" n'inscrivent plus le partenaire en même temps. Chaque personne est inscrite individuellement, puis le lien partenaire est établi via "Modifier l'inscription" (✏️) dans Élèves Tango.
- **Supprimé** : fonctions `_diPartZone`, `_vpPartZone`, `diTogglePartCours`, `diUpdateRolePartLabel`, `vpTogglePartCours`, `vpUpdateRolePartLabel`, `partenairesCartes` dict, blocs de validation partenaire dans `soumettreInscriptionDirecte`.

### ✅ Liaison partenaires dans "Modifier l'inscription" (modal ✏️)

**`validerLierPartenaire(id, selId)`** — bouton "🔗 Lier ce partenaire" :
- Corrigé : comparaison `String(x.id)===String(id)` au lieu de `x.id===id` (BIGINT vs string)
- Corrigé : mise à jour de `e.emailPartenaire` et `p.emailPartenaire` dans l'état local
- Corrigé : `email_partenaire` inclus dans les UPDATE `inscriptions_cours` ET `eleves` des deux côtés
- Corrigé : `Promise.resolve(...).catch()` au lieu de `.catch()` direct sur le builder Supabase
- Ajouté : `setTimeout(chargerDonnees, 500)` après les DB ops pour persistance post-polling

**`validerChangementCours(id)`** — bouton "✓ Valider" :
- Corrigé : lit `cc-lp` (dropdown partenaire) avant `fermerContact()`
- Ajouté : applique le lien partenaire dans l'état local + inclus dans `Promise.all(ops)` si partenaire sélectionné
- Inclut UPDATE `inscriptions_cours` du partenaire + UPDATE `eleves` des deux côtés

### ✅ Formulaire Valider Paiement — `soumettreValiderPaiement`

**Problème 1 — cours changé non persisté :**
- `existing` était cherché par `email + NEW cours` mais l'entrée DB avait l'ANCIEN cours → introuvable → aucun UPDATE
- Fix : `_vpPrefillIds = []` (global) peuplé dans `vpPrefill` avec les IDs des inscriptions pré-chargées. Dans le second `forEach` (DB), fallback sur `_vpPrefillIds[idx]` quand le cours ne matche pas.

**Problème 2 — `ville`/`niveau` manquants dans l'UPDATE :**
- Le second `forEach` (DB) ne déclarait pas `var ville` et `var niveau` → `undefined` envoyé en DB
- Fix : déclaration explicite `var ville` / `var niveau` au début du second `forEach`

**Problème 3 — `ville`/`niveau` non mis à jour dans l'état local :**
- Le premier `forEach` (local) ne mettait pas à jour `existing.ville`, `existing.niveau`, `existing.cours` quand le cours changeait
- Fix : ajout de `existing.ville=ville; existing.niveau=niveau; existing.cours=cours;` dans le bloc `if(existing)`

**Problème 4 — 2ème cours non sauvegardé (INSERT manquant) :**
- Le second `forEach` ne faisait que des UPDATE, jamais d'INSERT pour un nouveau cours
- Fix : ajout d'une branche `else { INSERT ... }` dans le second `forEach`
- `dateP` (datePremierPaiement) inclus dans les deux payloads UPDATE et INSERT

**Problème 5 — entrée locale fake bloquait l'INSERT du 2ème cours :**
- Le premier `forEach` pousse une entrée fake (`id='CT'+timestamp`) pour le 2ème cours
- Le second `forEach` retrouvait cette fake entrée par `email+cours` → tentait UPDATE avec faux ID → 0 lignes en DB
- Fix : `if(existing && isNaN(parseInt(existing.id))) existing = null;` — les IDs non-numériques (faux locaux) sont ignorés → branche INSERT utilisée à la place

**Règle mémo — IDs locaux fake vs IDs DB réels :**
`isNaN(parseInt(e.id))` = true → ID fake créé localement (ex: `'CT1234567890v1'`) → toujours faire INSERT
`isNaN(parseInt(e.id))` = false → ID réel Supabase (entier) → UPDATE safe

## Session 2026-05-13 (suite) — Compta search, suppression définitive cartes

### ✅ Compta — champ de recherche par nom
- Variable globale `comptaSearch = ''` (ligne ~1054)
- Input `#compta-search` affiché dans `renderCompta()` pour tous les sous-onglets sauf Trésorerie
- `_comptaFilterSearch(liste)` : filtre insensible aux accents via NFD + `.toLowerCase()` sur `prenom + ' ' + nom`
- Appliqué dans `_renderComptaTango()` (après `_markSharedCartes`), `_renderComptaYoga()`, `_renderComptaStages()` (par date, masque les dates sans résultat)
- Focus restauré après re-render via `requestAnimationFrame` dans `renderTab()` (si `currentTab==='compta' && comptaSearch`)

### ✅ Suppression définitive élève — nettoie aussi les cartes10
- **Problème** : `supprimerDefinitivementEleve(id)` ne supprimait que l'entrée ciblée par `id` → les entrées `carte10` avec `statut='supprimé'` restaient en DB et continuaient d'apparaître dans Cartes 10 → Supprimées
- **Fix** : supprime maintenant **par email** (pas par id) : `inscriptions_cours.delete().eq('email', email)` + `eleves.delete().eq('email', email)` — toutes les inscriptions de la personne et sa ligne élève sont effacées
- **Localement** : `adminData.coursTango` filtre par email (pas par id), `adminData.cartes` filtré aussi

### ✅ Cartes 10 → Supprimées — bouton 🗑 Définitif (temporaire, retiré)
- Ajouté temporairement pour permettre le nettoyage rétroactif des fiches résiduelles
- Fonction `supprimerDefinitivementCarte(email, nom)` : même logique que `supprimerDefinitivementEleve` (DELETE par email)
- **Retiré après usage** — le bouton n'est plus dans l'UI, la fonction reste dans le code

## Session 2026-05-13 (suite 2) — Lien remplaçant : fix service key + SQL

### ✅ Lien remplaçant — suppression dépendance `SUPABASE_SERVICE_KEY`
- **Problème** : worker retournait `503 'Service non configuré'` car `SUPABASE_SERVICE_KEY` n'est pas configuré comme secret Cloudflare Workers
- **Fix worker.js** : suppression des gardes `if (!env.SUPABASE_SERVICE_KEY)` dans les deux routes ; secret de signature = `env.SUPABASE_SERVICE_KEY || SUPABASE_ANON` (fallback acceptable : données peu sensibles + token protégé par date)
- **Fix données** : `handleRemplacantData` n'interroge plus les tables directement (RLS bloque anon) → appelle `get_remplacant_eleves` RPC (SECURITY DEFINER)

### ✅ Fonction SQL `get_remplacant_eleves` — version finale
Deux sources comme `_buildCartesData()` dans admin.html :
1. **`eleves`** avec `carte_statut IN ('Active', 'Nouvelle carte')` ET inscrits dans le cours (via `EXISTS inscriptions_cours`)
2. **`inscriptions_cours`** avec `type='carte10'` pour les élèves sans entrée active dans `eleves`

```sql
CREATE OR REPLACE FUNCTION get_remplacant_eleves(p_ville text, p_niveau text, p_saison text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.nom, t.prenom)
    FROM (
      SELECT e.email, e.nom, e.prenom,
        COALESCE(e.carte_utilises, 0)  AS utilises,
        COALESCE(e.carte_restants, 10) AS restants,
        e.carte_expiration             AS expiration
      FROM eleves e
      WHERE e.carte_statut IN ('Active', 'Nouvelle carte')
        AND (e.carte_utilises > 0 OR e.carte_restants > 0 OR e.carte_statut = 'Nouvelle carte')
        AND EXISTS (
          SELECT 1 FROM inscriptions_cours ic
          WHERE ic.email=e.email AND ic.statut='inscrit'
            AND ic.ville=p_ville AND ic.niveau=p_niveau AND ic.saison=p_saison
        )
      UNION
      SELECT ic.email,
        COALESCE(e2.nom, ic.nom) AS nom, COALESCE(e2.prenom, ic.prenom) AS prenom,
        0 AS utilises, 10 AS restants, NULL AS expiration
      FROM inscriptions_cours ic
      LEFT JOIN eleves e2 ON e2.email = ic.email
      WHERE ic.statut='inscrit' AND ic.type='carte10'
        AND ic.ville=p_ville AND ic.niveau=p_niveau AND ic.saison=p_saison
        AND (e2.email IS NULL OR e2.carte_statut NOT IN ('Active', 'Nouvelle carte'))
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_remplacant_eleves(text, text, text) TO anon, authenticated;
```

**Note** : éviter `DISTINCT ON ... ORDER BY` dans la fonction — Supabase SQL Editor l'interprète mal et ajoute des `<>` autour du nom de colonne → erreur de syntaxe. Utiliser `UNION` à la place.

## Session 2026-05-13 (suite 3) — calcExpiration depuis Paramètres

### ✅ calcExpiration — dates depuis Paramètres uniquement, zéro hardcodé

**Problème** : `SANS_COURS_PARIS/VINCENNES` étaient des listes hardcodées de semaines sans cours, à maintenir manuellement à chaque saison. Deux bugs constatés :
1. **Timezone** : `new Date(date + 'T00:00:00')` + `toISOString()` = -1 jour en heure Paris (CET/CEST)
2. **Donnée manquante** : `2026-02-26` absent de `SANS_COURS_PARIS` → semaine bonus non comptée pour une carte du 29/01 (résultat : 28/04 au lieu de 06/05)

**Fix** : suppression complète de `SANS_COURS_*` et `_COURS_*/_SANS_COURS_*` dans `tev-supabase.js`. Les semaines sans cours sont désormais détectées automatiquement par les gaps hebdomadaires dans `tev_cours_dates`.

**Algorithme** :
```javascript
// Dans la fenêtre [debut+7j, debut+3mois], itérer semaine par semaine
// Si la date n'est pas dans tev_cours_dates.paris (ou vincennes) → bonus++
// Contrainte : ne vérifier que les semaines dans la plage [firstStored, lastStored]
// (évite de compter les semaines avant la première date saisie comme "sans cours")
```

**Résultat** : pour une carte démarrant le 29/01/2026, Paris, avec le 26/02 absent des dates saisies :
- Base 3 mois : 29/04
- 1 gap (26/02) : +7j → **06/05/2026**

**Règles importantes** :
- Les dates Paris doivent être saisies depuis le début de la saison pour que tous les gaps soient détectés
- Ne jamais remettre de listes hardcodées `SANS_COURS_*`
- Fix identique dans `admin.html` (`calcExpiration`) et `js/tev-supabase.js` (`_calcExpirationSb`)

## Session 2026-05-14 — Doublons Élèves Tango + compteurs guideurs/guidées

### ✅ Fiche en double après renouvellement carte10
**Problème** : renouveler une carte créait une ligne `isRenewal` dans `inscriptions_cours` qui apparaissait comme une deuxième fiche dans Élèves Tango. La garde `!(e.donnees&&e.donnees.isRenewal)` ne fonctionnait pas quand `donnees` revenait en JSON string depuis Supabase.
**Fix** : marqueur explicite `_isRenewalRow: true` positionné dans `chargerDonnees()` avec parsing robuste (objet OU string JSON). `renderElevesTango` et `_buildCartesData` filtrent via `!e._isRenewalRow`.

### ✅ Doublons partenaires (Alice MÉRIAUX, Alexandre BEZIN)
**Problème** : quand un élève est inscrit "avec partenaire", une deuxième ligne est créée dans `inscriptions_cours` pour le partenaire, parfois avec un email vide. La déduplication par `email::normNom` ratait les entrées à email vide.
**Fix** : déduplication par `_normNom(prenom + ' ' + nom)` uniquement (sans email). Dans un même sous-onglet ville+niveau, même nom normalisé = même personne. Appliqué dans `_elevesResultatsHTML` (affichage), les compteurs de sous-onglets, et `nbInscritsCours`.

### ✅ Compteurs guideurs/guidées incorrects (badge "14 guideurs 17 guidées" pour 29 élèves)
**Problème** : `nbInscritsCours(ville, niveau, role)` comptait les lignes `isRenewal` + les doublons partenaires → 14 guideurs / 17 guidées au lieu de 13/16 pour Paris Débutants.
**Fix** : `nbInscritsCours` filtre `!e._isRenewalRow` ET déduplique par `_normNom(prenom + ' ' + nom)` avant de compter. Résultat confirmé ✅.

### Règle mémo — déduplication Élèves Tango
Dans `inscriptions_cours`, une personne peut avoir plusieurs lignes légitimes (inscription principale + entrée `isRenewal` + entrée partenaire). La déduplication d'affichage se fait **par nom normalisé** (`_normNom`) dans le contexte d'un même cours (ville + niveau). Ne jamais dédupliquer par email seul — les entrées partenaire peuvent avoir un email vide.

## Session 2026-05-14 (suite) — Filtres saison + Milongas espace élève

### ✅ Filtres par saison — admin.html

- **Yoga « Inscrire Élève »** : dropdown pré-remplissage depuis `adminData.essaiYoga` filtré par `dateAppartientSaison(e.date, saisonActive())` et `!estDejaEleveYoga(e.email)`. Bouton 💳 dans la liste essai yoga passe `data-id` pour pré-remplir le formulaire.
- **Stages « Inscrire »** : dropdown élèves filtré par `saisonActive()` + `statut==='inscrit'` + `!_isRenewalRow`.
- **Milonga « Présences »** : dropdown élèves filtré par `saisonActive()` + `statut==='inscrit'` + `!_isRenewalRow`.
- **Publications** : affiche saison active + saison suivante (pour visualiser/modifier les publications programmées à l'avance). Filtre : `dateAppartientSaison(date, sai) || dateAppartientSaison(date, saiNext)`. `allPubs.indexOf(p)` préserve l'index original pour les actions.
- **WhatsApp** : QR codes et liens depuis les Paramètres de la `saisonActive()`, rien de hardcodé. `imgUrlBig` conditionnel sur `fid` non-vide pour les URLs non-Drive.
- **Discussions admin** : filtré par `dateAppartientSaison(d.created_at, saisonActive())` — utilise `created_at` (pas `last_message_at`) pour que les discussions appartiennent à la saison où elles ont été créées.

### ✅ Filtres par saison — index.html (espace élève)

- **Publications** : filtre saison courante uniquement, avec borne inférieure (`>= seasonStart`) ET supérieure (`<= seasonEnd = 31 août`). Utilise calcul inline `_m >= 9 ? _y : _y - 1` pour l'année de début de saison.
- **Discussions** : `created_at` mappé dans l'objet, filtre par `_saiStart` / `_saiEnd` (strings ISO) — saison courante uniquement.

### ✅ Milongas espace élève — zéro hardcodé, tout depuis Paramètres/Supabase

**Problème** : `MILONGAS_DATA_FB` contenait 23 dates hardcodées utilisées comme fallback. Si l'admin annulait une milonga et en ajoutait une nouvelle dans Paramètres, l'espace élève continuait d'afficher les vieilles dates hardcodées.

**Fix** :
- `MILONGAS_DATA_FB = []` (tableau vide — plus aucune date de secours)
- `const MILONGAS_OBJ` → `let MILONGAS_OBJ`, `const MILONGAS_DATA` → `let MILONGAS_DATA` (mis à jour dynamiquement)
- Ajout `chargerMilongasEleve()` : fetch async `parametres` → clé `tev_milongas_<_sai()>` → met à jour localStorage + `MILONGAS_OBJ`/`MILONGAS_DATA` → re-rend accueil/milonga/agenda
- Appelée au **login** (non-bloquant, dans `loadEleveData` après `eleveData = data`) et à l'**ouverture de l'onglet Milonga** (`switchTab`)
- `window._onMilongasUpdated(mils, sai)` : callback partagé — vérifie `sai === _sai()`, met à jour les vars, re-rend
- Hookée dans le **Plan IIFE** (`_fetchAndApply 'tev_milongas_'+sai`) : l'ouverture du Plan propage aussi les milongas fraîches vers accueil/milonga
- Suppression des fallbacks hardcodés "La Dolce Vita" dans `renderAccueil` (lignes `_mn || 'La Dolce Vita'`, `_mh || '17h30–23h30'`), `getEvents()` (branche `else` avec 23 dates), `renderMilonga()` (branche `else` idem)
- Si `MILONGAS_OBJ` est null (Supabase pas encore chargé), la section milonga n'affiche rien — pas de fausses dates

**Règle** : `MILONGAS_OBJ` est la seule source de vérité pour les milongas dans index.html. Ne jamais réintroduire de dates ou de lieux hardcodés dans ce fichier pour les milongas.

### ✅ Alerte « pas de cours cette semaine » — visible tout au long du gap

**Problème** : la condition `_hierEstCours` (hier = jour de cours) ne déclenchait l'alerte orange que le lendemain du dernier cours. Dès le surlendemain, elle disparaissait — alors que les élèves avaient toujours besoin de l'information.

**Fix** : condition remplacée par un calcul de gap :
- `_dernierCours` = dernière date de cours strictement avant aujourd'hui (`coursArr.filter(d < today).pop()`)
- `_totalGap` = `prochainCours - _dernierCours` en jours
- Alerte affichée si `_totalGap > 7` (semaine sans cours) ET `<= 35` (exclut la coupure estivale > 10 semaines) ET `prochainCours > todayStr` (ne s'affiche pas le jour où les cours reprennent)
- Message corrigé : "Pas de cours **cette** semaine" (remplace "la semaine prochaine" qui était souvent inexact)

**Règle** : ne jamais remettre `_hierEstCours` comme condition — elle ne couvre qu'un seul jour sur toute la fenêtre sans cours.

## Session 2026-05-14 (suite 2) — Paramètres Milonga

### ✅ Nom de milonga et nom de salle modifiables, sans valeur par défaut

**Problème** : `chargerMilongas()` contenait une normalisation qui écrasait `mil.nom` à chaque chargement :
```javascript
if (mil.id === 'dolce-vita') { mil.nom = 'LA DOLCE VITA'; ... }
if (mil.id === 'colectivo')  { mil.nom = 'LE COLECTIVO';  ... }
```
Même si l'admin sauvegardait un nouveau nom, il était réécrasé à la prochaine lecture. `MILONGAS_DEFAULTS` contenait aussi `nom: 'LA DOLCE VITA'` et `lieu.nom: 'Centre Re-Corps'` hardcodés.

**Fix** :
- `MILONGAS_DEFAULTS` : `nom` et `lieu.nom` vidés (`''`) pour les deux milongas
- `chargerMilongas()` : suppression des lignes `mil.nom = ...` — seule la migration GPS dolce-vita est conservée
- **Règle** : ne jamais remettre de normalisation de `mil.nom` ou `mil.lieu.nom` dans `chargerMilongas()`

### ✅ Ajout et suppression de milongas supplémentaires

- Bouton **"➕ Ajouter une milonga"** en bas de la section Milongas dans Paramètres
- `ajouterNouvelleMilonga()` : crée un objet vide avec ID unique `'mil-<timestamp>'`, sauvegarde en Supabase, ouvre l'accordéon Info
- Bouton **"🗑 Supprimer cette milonga"** dans l'accordéon Info de chaque milonga (avec `confirm()`)
- `supprimerMilonga(idx)` : `MILONGAS.splice(idx, 1)` + `sauverMilongas()`
- **Propagation automatique** : toute la logique admin et espace élève itère `MILONGAS` dynamiquement — aucun code supplémentaire requis. Les nouvelles milongas apparaissent dans : onglet Milonga admin (présences), accueil élève (prochaine milonga), onglet Milonga élève (Je pense venir), Agenda, flux ICS

### ✅ Horaires début/fin modifiables sans valeur par défaut

**Problème** : `sauverMilongaInfo` utilisait `|| mil.horaire_debut` comme fallback — si l'input était vide ou si l'admin changeait la valeur, le fallback conservait l'ancienne valeur stockée, rendant les horaires impossibles à modifier.

**Fix** :
```javascript
// Avant (bloquant) :
mil.horaire_debut = (gel('mil-hdeb-'+idx)||{}).value || mil.horaire_debut;
// Après (correct) :
mil.horaire_debut = ((gel('mil-hdeb-'+idx)||{}).value||'').trim();
```
- Labels : "Horaire début (défaut)" → "Horaire début" (idem fin)
- Placeholders : `"17h30"` → `"ex : 17h30"` pour distinguer hint et donnée réelle
- **Règle** : ne jamais utiliser `|| mil.horaire_debut` ou `|| mil.horaire_fin` dans `sauverMilongaInfo` — toujours lire `.value.trim()` directement
- **Règle** : ne jamais utiliser `|| mil.horaire_xxx` dans sauverMilongaInfo — ça rend le champ non-modifiable

## Session 2026-05-15 — Publications automatiques (stages + milongas) et visuels Cloudinary

### ✅ Visuels Cloudinary par date de stage (Paramètres → Stages)

- Nouvelle section collapsible **"🖼 Visuel"** sous chaque date de stage dans `_renderSecDatesContent`
- Toggle via `stageVisuelOpen[st.date]` (nouveau dict global, ajouté après `stageAdresseOpen`)
- Prévisualisation 28×28 thumbnail (ou icône 🖼) positionnée directement après le label de date (`margin-right:auto` sur le label → pousse les boutons ✕ vers la droite, évite les clics accidentels)
- Stockage : `st.image_url` (string URL Cloudinary) sur chaque objet date dans le tableau `STAGES`
- Upload : `_uploadImageStage(date, sai, input)` → Cloudinary (`upload_preset:'tango_uploads'`, cloud `dnggqa2kw`) → `STAGES[idx].image_url = url` → `sauverStagesLocal(sai)` → `syncPublicationsStage(date, sai)` → `setTimeout(renderTab, 800)`
- Suppression : `supprimerImageStage(date, sai)` → `delete STAGES[idx].image_url` → `sauverStagesLocal(sai)` → `syncPublicationsStage(date, sai)` → `renderTab()`
- Click handlers : `case 'toggle-visuel-date'`, `case 'suppr-image-stage'`

### ✅ Visuels Cloudinary par date de milonga (Paramètres → Milongas)

- Image stockée sur **chaque date** : `mil.dates[i].image_url` (jamais sur `mil` directement)
- Dans `_renderMilongaDatesContent` : prévisualisation 28×28 (ou 🖼 opacity:0.35 si absent) juste après le label de date
- Upload : `_uploadImageMilongaDate(milIdx, dateStr, input)` → Cloudinary → `MILONGAS[milIdx].dates[di].image_url = url` → `sauverMilongas()` → `syncPublicationsMilongaDate(...)` → toast + `setTimeout(renderTab, 800)`
- Suppression : `supprimerImageMilongaDate(milIdx, dateStr)` → `delete MILONGAS[milIdx].dates[di].image_url` → `sauverMilongas()` → `syncPublicationsMilongaDate(...)` → `renderTab()`
- Click handler : `case 'suppr-image-mil-date'`
- **Règle** : `mil.image_url` n'existe plus — ne jamais lire ni écrire au niveau milonga, toujours `mil.dates[i].image_url`

### ✅ Champ Tarif par milonga (Paramètres → Milongas → Info)

- Champ texte libre `mil.tarif` (ex : `"10€ / 5€ adhérents"`) dans `_renderMilongaInfoContent`, ID `mil-tarif-<idx>`
- `sauverMilongaInfo(idx)` : lit `((gel('mil-tarif-'+idx)||{}).value||'').trim()` → `mil.tarif`
- Après `sauverMilongas()` : appelle `syncToutesPublicationsMilongas(sai)` pour re-générer le contenu de toutes les publications milonga

### ✅ Champs Démonstration + Tarif par date de milonga — bouton `[···]`

- `var milDateDetailsOpen = {}` : dict `'milIdx-dateStr' → bool` pour les collapsibles par date
- Bouton `[···]` inséré AVANT le bouton ✕ dans chaque date row (`margin-left:20px` sur le bouton ✕ pour l'espacement)
  - Couleur : `var(--text)` (blanc) par défaut, `var(--gold)` si données présentes (`detOpen || hasDemo || hasTarifD`)
- Bloc collapsible si `milDateDetailsOpen[idx+'-'+d.date]` :
  - Input Démonstration : id `mil-demo-<idx>-<dateNoHyphens>`, value `d.demonstration||''`
  - Input Tarif date : id `mil-tarif-d-<idx>-<dateNoHyphens>`, value `d.tarif||''`, placeholder `'laisse vide = tarif milonga'`
  - Bouton `💾 Enregistrer` : data-action=`sauver-mil-date-details`
- `sauverDatasMilongaDate(milIdx, dateStr)` : lit les inputs, sauvegarde `d.demonstration` et `d.tarif` (ou delete si vide) → `sauverMilongas()` → `syncPublicationsMilongaDate(milIdx, dateStr, sai)` → `renderTab()`
- Handlers click : `toggle-mil-date-details`, `sauver-mil-date-details`
- **Règle** : ne jamais utiliser `|| d.tarif` ou `|| d.demonstration` dans ces saves — toujours `.value.trim()` direct

### ✅ Génération automatique de publications stages — `genererPublicationsStages()`

- Bouton **"🗓 Générer les publications stages [saiNext]"** dans l'onglet Publications, visible à partir du **15 mai** de la saison active
- Génère **3 publications par date de stage** de la saison suivante : J-20, J-14, J-7
- Fetch Supabase : `tev_dates_stages_<saiNext>` + `tev_params_stages_<saiNext>` pour le contenu
- Anti-doublon : vérifie `adminData.publications` en mémoire via clé `stageDate + '_' + jAvant`
- `publiee: true` — publications directement visibles dans l'espace élève à leur date programmée

**Structure `donnees` des publications stages auto-générées :**
```javascript
{
  cat: 'stage',
  extrait: 'Thème 1 - Thème 2',         // thèmes joints par ' - ', sans "Technique"
  image: st.image_url || '',
  dateProgrammee: pubISO,                // J-20, J-14 ou J-7 avant la date du stage
  datesProgrammees: [pubISO],
  cours: ['paris-deb','paris-int','vincennes-deb','vincennes-int'],
  autoGenStage: true,                    // marqueur pour les sync
  stageDate: st.date,                    // YYYY-MM-DD de la journée de stages
  jAvant: 20,                            // 20, 14 ou 7
  lienInscription: 'https://app.tangoetvous.fr/stages-pwa.html'
}
```

**Format du titre :** `STAGE DU SAMEDI 11 AVRIL 14H-18H` (plage horaire = premier début → dernier fin des slots du jour)

**Format du contenu :**
```
[intro selon jAvant]

📅 [Date longue]
[Créneau 1] — [Thème 1]
[Créneau 2] — [Thème 2]
...

Pour s'inscrire, cliquez sur le bouton ci-dessous.

📍 [Lieu — nom, adresse]

💰 Tarifs
Technique (1h) : 20€
1 stage : 25€ / 2 stages : 45€ / 3 stages : 65€ / 4 stages : 85€
(Tarifs sur place le jour du stage)
```

### ✅ `_genContenuStage(st, defHor, defTar, defAdr)` — pure function

Extraite de `genererPublicationsStages()` pour être réutilisée par les fonctions de sync. Retourne `{titre, contenu, extrait, image}`. Toutes les données viennent des paramètres Supabase (zéro hardcodé) :
- Horaires : par slot (`st.slots[i].horaire_debut/fin`), fallback `defHor` (paramètres globaux stages)
- Tarifs : `st.tarifs || defTar` (override par date, fallback globaux stages)
- Adresse : `st.adresse || defAdr` (override par date, fallback adresse globale stages)
- Thèmes : `st.slots[i].theme` (saisi dans Paramètres → Stages → Thèmes)
- Image : `st.image_url || ''`

### ✅ Auto-sync contenu publications stages

Quand les paramètres d'un stage changent dans Paramètres, les publications auto-générées sont mises à jour automatiquement (titre + contenu + extrait + image) :

```javascript
async function syncPublicationsStage(date, sai) {
  // Filtre JSONB: donnees->>stageDate = date ET donnees->>autoGenStage = 'true'
  // UPDATE titre + contenu + extrait + image sur toutes les pubs trouvées
}
async function syncToutesPublicationsStages(sai) {
  // Itère toutes les dates de STAGES → appelle syncPublicationsStage pour chacune
}
```

**Auto-sync hooks stages :**
| Déclencheur | Fonction appelée |
|---|---|
| `sauverThemesStage(date, sai)` | `syncPublicationsStage(date, sai)` |
| `sauverAdresseDate(date, sai)` | `syncPublicationsStage(date, sai)` |
| `sauverHorairesDate(date, sai)` | `syncPublicationsStage(date, sai)` |
| `sauverTarifsDate(date, sai)` | `syncPublicationsStage(date, sai)` |
| `_uploadImageStage(date, sai, input)` | `syncPublicationsStage(date, sai)` |
| `supprimerImageStage(date, sai)` | `syncPublicationsStage(date, sai)` |
| `sauverHorairesType` (type=stages) | `syncToutesPublicationsStages(sai)` |
| `sauverTarifsType` (type=stages) | `syncToutesPublicationsStages(sai)` |
| `sauverAdresseType` (type=stages) | `syncToutesPublicationsStages(sai)` |

### ✅ Bouton "S'inscrire aux stages →" dans le modal publication (index.html)

- Champ `lienInscription` dans `donnees` des publications auto-générées stages
- Dans `openPub()` : si `p.lienInscription` existe → crée un `<a>` dans `#pub-modal-btn` avec `class="pub-modal-inscr-btn"`
- CSS `.pub-modal-inscr-btn` : bouton doré pleine largeur, `background:var(--gold)`, `color:#1a1208`, `font-weight:700`, `padding:13px 20px`, `border-radius:8px`
- `#pub-modal-btn` : `margin-top:20px`
- **Règle** : `p.contenu` est rendu en `textContent` (pas `innerHTML`) — tout lien cliquable doit passer par `pub-modal-btn` ou un élément DOM dédié, jamais par le texte du contenu

### ✅ Génération automatique de publications milongas — `genererPublicationsMilongas()`

- Bouton **"🎶 Générer les publications milongas [saiNext]"** dans l'onglet Publications, visible à partir du **15 mai** (même garde que stages)
- Charge les milongas de **la saison prochaine** depuis Supabase : `tev_milongas_<saiNext>` (pas le `MILONGAS` courant)
- Filtre : `dateAppartientSaison(dateObj.date, saiNext)` uniquement
- Génère **2 publications par date de milonga** : J-14 et J-3
- Anti-doublon : clé `milongaId + '_' + milongaDate + '_' + jAvant` dans `adminData.publications`
- `publiee: true` — directement visibles à leur date programmée

**Structure `donnees` des publications milonga auto-générées :**
```javascript
{
  cat: 'milonga',
  extrait: 'SAMEDI 14 MARS 17H30-23H30',
  image: 'https://res.cloudinary.com/...' || '',
  video: '',
  dateProgrammee: '2026-03-01T08:00:00.000Z',   // J-14 ou J-3
  datesProgrammees: ['2026-03-01T08:00:00.000Z'],
  cours: ['paris-deb', 'paris-int', 'vincennes-deb', 'vincennes-int'],
  autoGenMilonga: true,
  milongaId: 'dolce-vita',   // mil.id
  milongaDate: '2026-03-14', // YYYY-MM-DD de la milonga
  jAvant: 14                 // 14 ou 3
  // pas de lienInscription — les milongas n'ont pas de formulaire d'inscription
}
```

### ✅ `_genContenuMilonga(mil, dateObj)` — pure function

Retourne `{titre, extrait, contenu, image}`. Sources (zéro hardcodé) :
- `hdeb`/`hfin` : `dateObj.horaire_debut/fin || mil.horaire_debut/fin || ''`
- `tarif` : `dateObj.tarif || mil.tarif || ''` (override par date, fallback milonga)
- `demo` : `dateObj.demonstration || ''`
- `image` : `dateObj.image_url || ''`
- Titre : `'Milonga « ' + mil.nom + ' »'`
- Extrait : date longue (JOUR JJ MOIS) + horaires
- Contenu : bonjour, annonce date + horaires, ligne "Démonstration de [demo]" (seulement si non vide), adresse depuis `mil.lieu`, tarif si présent, paragraphe conseils débutants

### ✅ Auto-sync contenu publications milongas

```javascript
async function syncPublicationsMilongaDate(milIdx, dateStr, sai) {
  // Filtres JSONB: milongaDate eq dateStr, milongaId eq mil.id, autoGenMilonga eq 'true'
  // UPDATE titre + contenu + extrait + image
}
async function syncToutesPublicationsMilongas(sai) {
  // Itère MILONGAS[mi].dates[di] → _genContenuMilonga → mêmes filtres JSONB
}
```

**Auto-sync hooks milongas :**
| Déclencheur | Fonction appelée |
|---|---|
| `sauverMilongaInfo` (nom, horaires, tarif milonga) | `syncToutesPublicationsMilongas(sai)` |
| `sauverDatasMilongaDate` (démo, tarif date) | `syncPublicationsMilongaDate(milIdx, dateStr, sai)` |
| `_uploadImageMilongaDate` | `syncPublicationsMilongaDate(milIdx, dateStr, sai)` |
| `supprimerImageMilongaDate` | `syncPublicationsMilongaDate(milIdx, dateStr, sai)` |

### Visibilité dans l'admin Publications — stages et milongas

- Générées en mai 2026 (saison 2025-2026) pour la saison 2026-2027
- Visibles en admin **2025-2026** : via filtre `saiNext` dans `renderPublications()`
- Visibles en admin **2026-2027** : via filtre `sai` (saison active)
- `renderPublications()` affiche toujours `saisonActive()` ET `saisonSuivante()` → les publications de la prochaine saison apparaissent dans les deux vues

### Règle : aucune valeur hardcodée dans les fonctions de génération

Tout vient des paramètres Supabase. `_genContenuStage` et `_genContenuMilonga` sont des pure functions sans constantes hardcodées. Ne jamais réintroduire de montants, horaires ou adresses fixes dans ces fonctions.

### ✅ Fix scroll Publications — guard `_renderTabSiPasFormulaire`

**Problème** : l'onglet Publications se remettait en haut de page toutes les 15s — le polling re-rendait tout le DOM même sans édition ouverte.

**Fix** :
```javascript
// AVANT :
if (currentTab === 'publications' && gel('pub-ed') && gel('pub-ed').innerHTML.trim()) return;
// APRÈS :
if (currentTab === 'publications') return; // ne pas interrompre avec le polling 15s
```

**Règle** : l'onglet Publications ne se re-rend jamais automatiquement. L'admin navigue vers un autre onglet et revient pour voir les nouvelles données. Publications = données peu volatiles, pas de polling nécessaire.

### ✅ Heure de diffusion des publications programmées : 11h

- `genererPublicationsStages()` et `genererPublicationsMilongas()` : heure de publication `T08:00:00.000Z` → `T11:00:00.000Z`
- Publications déjà en base migrées via SQL : `REPLACE(donnees->>'dateProgrammee', 'T08:00:00', 'T11:00:00')` sur `donnees.dateProgrammee` et `donnees.datesProgrammees`, filtre `> NOW()`
- **Règle** : toute nouvelle génération de publications automatiques utilise `T11:00:00.000Z`

### ✅ Scroll automatique vers le formulaire d'édition publication

- `ouvrirPub()` : ajout de `requestAnimationFrame(function(){ el.scrollIntoView({behavior:'smooth',block:'start'}); })` après injection du formulaire dans `#pub-ed`
- **Cause** : `#pub-ed` est en haut de la liste, le formulaire apparaissait hors écran quand l'admin était scrollé vers le bas — donnait l'impression que «rien ne se passait»

## Session 2026-05-16 — Modal publications : design beige, boutons S'inscrire / Je pense venir

### ✅ Design modal publications — fond beige, image en premier, texte noir

**admin.html et index.html** :
- Fond du modal : `background:#fdf6ec` (beige clair)
- Structure : `#pv-img` / `#pub-modal-media` EN PREMIER (avant le bouton ✕ et le texte)
- Bouton ✕ : `position:absolute;top:10px;right:14px;background:rgba(0,0,0,.45)` — superposé sur l'image
- Texte body : `font-size:17px;color:#000;font-weight:600;line-height:1.75;white-space:pre-wrap`
- Fond onglet Publications : `background:#fdf6ec;min-height:100vh` (index.html `#actu-pane`) + même fond dans admin.html `renderPublications()`
- Textes boutons "Générer..." dans admin : couleur `#000` (sur fond beige)
- **Police** : Montserrat — seuls les weights 300, 400, 600, 700 sont chargés. `font-weight:500` n'a aucun effet — toujours utiliser `font-weight:600`

### ✅ Tri chronologique des publications

Dans `renderPublications()` (admin.html) et avant `window._pubs = pubs` (index.html) : sort par `dateProgrammee || date` croissant.

### ✅ Bouton "S'inscrire →" dans les publications stages

- **Espace élève** : bouton `pub-modal-inscr-btn` en bas du modal → `switchTab('stages')`
- **Admin** : bouton créé via `document.createElement('button')` (pas un `<div>`) avec `onclick = function(){ fermerPubView(); switchTab('stages'); }` — était inactif si `<div>` utilisé
- **Détection triple** : `p.cat==='stage' || p.autoGenStage===true || (p.donnees&&p.donnees.cat==='stage')` — nécessaire car localStorage peut ne pas avoir mergé `donnees`

### ✅ Bouton "Je pense venir →" dans les publications milongas (espace élève)

- Ajouté dans `openPub()` (index.html) — détecté via triple check (`cat`, `autoGenMilonga`, `donnees.cat`)
- Extrait `milongaDate` et `milongaId` depuis `p` ou `p.donnees`
- Couleur depuis `MILONGAS_OBJ.find(m => m.id === milId).color`
- Vérifie RSVP actuel via `_loadMilPresences()` → affiche "J'y vais ! [Annuler]" ou "Je pense venir →"
- Globals `window._pubMil`, `window._pubMilVenir`, `window._pubMilAnnuler`, `window._renderPubMilBtn` pour les handlers inline onclick
- `_renderPubMilBtn(coming)` re-rend uniquement le div `#pub-modal-btn` (le div `#pub-modal-tarif` est séparé, non écrasé)
- **Admin** : bouton affiché en aperçu uniquement (`cursor:default`, `opacity:.85`, `title` explicatif)

### ✅ Bouton positionné AVANT les tarifs dans le modal

**Principe** : le contenu (`p.contenu`) est splitté au marqueur de tarif. Le bouton est injecté entre les deux parties.

**Marqueurs de split** :
- Stages : `'\nTarifs :\n'`
- Milongas : `'\nTarif :\n'`
- Autres publications : pas de split, bouton en fin de contenu

**Structure HTML modifiée** (identique dans admin.html `#pv-*` et index.html `#pub-modal-*`) :
```
[body part 1 — contenu avant tarifs]
[#pv-btn / #pub-modal-btn — bouton S'inscrire ou Je pense venir]
[#pv-tarif / #pub-modal-tarif — contenu après le marqueur tarif]
```

**Règle** : `#pub-modal-tarif` est un div séparé de `#pub-modal-btn` — `_renderPubMilBtn` fait `bd.innerHTML=...` sur `pub-modal-btn` sans toucher `pub-modal-tarif`.

### ✅ Format titre et contenu milonga (`_genContenuMilonga`)

- **Titre** : `'Milonga ' + mil.nom + ' - ' + DOW_LONG[d.getDay()] + ' ' + dayNum + ' ' + MOIS_FR[d.getMonth()] + ' ' + hdeb.toUpperCase() + '-' + hfin.toUpperCase()`
  - Exemple : `Milonga La Dolce Vita - Dimanche 13 Septembre 17H30-23H30`
- **Intro contenu** : `'La prochaine Milonga ' + mil.nom.toUpperCase() + ' aura lieu le:\n'` + date (sans point à la fin de la ligne date)

### ✅ SW cache — versioning

- `sw.js CACHE` : passé de `tv-cartes-v1` → `v2` → `v3` au fil des sessions pour forcer la mise à jour
- **Règle** : incrémenter `CACHE` à chaque fois que des changements visuels dans `index.html` ne s'affichent pas malgré un Cmd+Shift+R — le SW a mis en cache l'ancienne version

## Session 2026-05-18 — Quotas tango/yoga, Inscriptions Tango Att. Paiement

### ✅ Onglet "Forfait / Carte" (espace élève)
- Onglet renommé : `'Forfait'` → `'Forfait / Carte'` dans `_TAB_LABELS` et `NAV_TABS` de `index.html`

### ✅ Espacement boutons fiches essai (admin.html)
- `gap:4px`/`gap:5px` → `gap:8px` sur les rangées de boutons dans `_attEssaiCard`, `_mkEssaiPtCard`, `_mkAttPtCard`, fiches présents/absents, vue par date, `rowYoga`

### ✅ Inscriptions Tango → Att. Paiement : badge quota + liste inscrits grisée

**Nouveau dans chaque groupe de cours du sous-onglet "Att. Paiement"** :
- Badge quota `👨 X/22 👩 X/23` (couleur verte/orange/rouge) dans l'en-tête du cours
- Section grisée "Déjà inscrits (N)" en dessous de la liste att. paiement → affiche les élèves `statut='inscrit'` du même cours avec leur rôle en pill
- Le badge compte `inscrit + attente_paiement` (quota réel) — cohérent avec ce qu'il faut surveiller pour ne pas sur-inscrire

**Groupement par `ville+niveau`** (4 groupes fixes) :
- **Problème** : l'ancienne clé `e.cours` avait plusieurs formats (`'paris—debutant'`, `'Paris — Jeudi — Débutant'`, etc.) → plusieurs listes pour le même cours
- **Fix** : grouper par `(e.ville||'')+'—'+(e.niveau||'')` → exactement 4 groupes : `paris—debutant`, `paris—intermediaire`, `vincennes—debutant`, `vincennes—intermediaire`
- Labels affichés : `COURS_LBL2` = `{'paris—debutant':'Paris — Débutants', ...}`
- Ordre fixe via `COURS_ORDRE` array → toujours Paris Débutants en premier
- **Ce fix s'applique aussi aux sous-onglets "Tous" et "Att. Validation"** — le code de groupement est partagé

### ✅ Élèves Tango : badge guideurs/guidées cohérent avec la liste affichée

**Problème** : dans `_elevesResultatsHTML`, le badge appelait `capaciteCours()` → comptait `inscrit + attente_paiement` = 19 alors que la liste ne montre que les `inscrit` = 16.
**Fix** : compter directement depuis `liste` (déjà filtrée à `inscrit` + dédupliquée) :
```javascript
var _gui = liste.filter(function(e){ return e.role==='guideur'; }).length;
var _gde = liste.filter(function(e){ return e.role!=='guideur'; }).length;
```
Le badge (ex: 👩 16/23) correspond exactement aux élèves visibles.

**Règle mémo** : le badge dans Élèves Tango = inscrits seulement. Le badge dans Att. Paiement = inscrit + attente_paiement (quota complet).

### ✅ Système de quotas tango (recap complet)

**Constantes** : `CAP_GUI=22`, `CAP_GDE=23`

**`nbInscritsCours(ville, niveau, role)`** :
- Filtre `STATUTS_QUOTA = ['inscrit','attente_paiement']` uniquement — jamais 'demande', 'valide', 'attente'
- `!e._isRenewalRow` — exclut les renouvellements
- Déduplication par `_normNom(prenom + ' ' + nom)` dans le cours
- **Règle** : 'validé' = 'attente_paiement' en DB — ne jamais les compter séparément

**`noLimitsTangoToday()`** : toujours `false` pour les inscriptions régulières (quota appliqué toute l'année).

**Formulaire public `inscription-cours.html`** :
- Quota vérifié dans `finalize()` après l'anti-doublon
- Requête Supabase : `inscriptions_cours` filtré `statut IN ['inscrit','attente_paiement']`, exclut `isRenewal=true` via parsing `donnees`
- Si quota atteint → `_quotaFull=true` → statut forcé `'demande'` + message orange `#quota-full-notice` affiché dans l'écran de succès
- `isWaitlist()` retourne `true` si guidée seule OU `_quotaFull`

**Admin formulaires** (Inscrire + Valider Paiement) : quota vérifié avec bouton ⚡ Forcer si atteint.

**Essai tango** : quota via RPC SQL `compter_inscrits_essai()` (soustrait absences, sept-nov uniquement). Admin peut toujours forcer via "✓ Valider".

### ✅ Système de quotas yoga

**Constante** : `CAP_YOGA = 14`

**`nbInscritsYoga(cours)`** :
- `cours` = `'yin'` ou `'hatha'` — les élèves en `forfait` comptent dans **les deux**
- Filtre `statut !== 'supprimé'` + `saison === saisonActive()`
- Déduplication par email (ou nom normalisé si email vide)

**`nbInscritsYogaDate(cours, date)`** :
- Pour l'essai yoga : compte les **inscrits réguliers non absents ce jour** + les **élèves essai pour cette date**
- Absences depuis `adminData.absencesJour` filtré sur `date`
- Forfait compte dans yin ET hatha

**`capBadgeYoga(cours)`** et **`capBadgeYogaDate(cours, date)`** :
- Badge coloré vert/orange/rouge + "COMPLET" si atteint
- Affichés dans Élèves Yoga (sections yin/hatha) et dans chaque sous-section par date de l'Essai Yoga

**Admin "Inscrire Élève" yoga** (`soumettreInscriptionDirecteYoga(force)`) :
- Paramètre `force` pour le forçage
- Si quota atteint et `!force` → message rouge + bouton ⚡ "Forcer l'inscription"
- Forfait vérifie yin ET hatha séparément

**Admin "💳 Inscrire" depuis essai** (case `confirmer-yoga-inscr`) :
- `confirm()` si quota atteint → admin confirme ou annule
- Forfait vérifie yin ET hatha

**Formulaire public `essai-yoga.html`** :
- Quota vérifié avant INSERT dans `soumettre()` via 3 requêtes Supabase en parallèle par cours à vérifier :
  1. `inscriptions_essai_yoga` WHERE date_essai=date AND cours IN [cours, 'forfait']
  2. `cours_yoga` WHERE statut='inscrit' AND saison=... AND cours IN [cours, 'forfait']
  3. `absences_jour` WHERE date=date
- Soustrait les absents des inscrits réguliers
- Forfait déclenche la vérification pour yin ET hatha (boucle `for...of _coursCheck`)
- Message d'erreur explicite avec le nom du cours complet

### ✅ Impression PDF — bouton 🖨️ dans 6 onglets admin

**`_tevPrint(titre, sections)`** — fonction partagée :
- Ouvre une nouvelle fenêtre avec un tableau HTML formaté, déclenche `window.print()`
- `sections` = array de `{title, headers, rows}` — une section par groupe ou sous-onglet
- Style : fond blanc, police Arial, tableau avec bordures fines, en-tête gris clair, impression optimisée (`@media print`)

**Onglets couverts :**

| Onglet | Fonction | Colonnes / contenu |
|--------|----------|--------------------|
| Élèves Tango | `imprimerElevesTango()` | Nom, Rôle, Partenaire, Tél — liste du sous-onglet actif (débutant/intermédiaire × Paris/Vincennes) |
| Essai Tango | bouton existant étendu | Visible dans toutes les vues sauf "Inscrire" (condition `filtreEssai!=='inscrire'`) |
| Inscriptions Tango | `imprimerInscriptionsTango()` | 4 groupes par cours, colonnes selon sous-onglet actif (tous/att.valid/att.paiement) |
| Stages | bouton existant | Inchangé |
| Yoga Élèves | `imprimerYogaEleves()` | Sections yin + hatha, colonnes : Nom, Cours, Tél, Paiement, Montant |
| Sorano | `imprimerSorano()` | Groupes par cours, colonnes : Nom, Statut, Tél |

**Règle** : les fonctions d'impression lisent `adminData` en mémoire (pas de requête Supabase) — l'état affiché est l'état imprimé.

## Session 2026-05-19 — Charte emails + preview cours d'essai tango

### ✅ Champ "Journée des associations" dans Paramètres Vincennes
- Nouvelle section accordéon "🏘 Journée des associations" dans `_renderSecContent(type='vincennes')`
- Stocké via `_saveParam('vincennes', sai, 'journee_asso', { date: val })`
- Lu via `_loadParam('vincennes', sai, 'journee_asso')`
- Injecté dans les emails E1 Vincennes si la date du cours d'essai est **après** la journée des associations (et inscription avant la JA)

### ✅ Livrets d'information — source Supabase
Les liens Google Drive des livrets sont stockés dans Supabase (Paramètres → Tango Paris/Vincennes → Livret d'information) :
- `tev_params_paris_<sai>.livret.url_deb` → Paris Débutant
- `tev_params_paris_<sai>.livret.url_int` → Paris Intermédiaire & Avancé
- `tev_params_vincennes_<sai>.livret.url_deb` → Vincennes Débutant
- `tev_params_vincennes_<sai>.livret.url_int` → Vincennes Intermédiaire & Avancé
- `tev_params_yoga_<sai>.livret.url_yin` → Yin Yoga
- `tev_params_yoga_<sai>.livret.url_hatha` → Hatha Yoga

**Règle** : dans toute Edge Function d'envoi email, fetch ces paramètres depuis Supabase et injecter le bon lien selon ville + niveau de la personne. Ne jamais hardcoder des URLs de livrets.

### ✅ Charte graphique emails — référence universelle

**Fichier de référence** : `preview-emails-essai-v2.html`

Cette charte s'applique à **tous** les emails et notifications automatiques du projet (essai tango, inscription régulière, stages, yoga, cours particuliers, devis…).

#### Header email élève
```html
<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;">
  <div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div>
  <div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div>
</div>
```

#### Bandeau statut (vert = confirmé, orange = attente, bleu = rappel)
```html
<!-- Confirmé -->
<div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">
  <span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ [Message]</span>
</div>
<!-- En attente -->
<div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
  <span style="font-size:14px;font-weight:700;color:#e65100;">⏳ [Message]</span>
</div>
<!-- Rappel (bleu) -->
<div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;">
  <span style="font-size:14px;font-weight:700;color:#1565c0;">🗓 [Message]</span>
</div>
```

#### Boîte info principale (fond bleu clair, bordure bleu foncé, coins arrondis)
```html
<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
  <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">TITRE DE LA BOÎTE</div>
  <!-- contenu : tableau ou texte -->
</div>
```

#### Badges rôle (inline dans les tableaux)
- Guideur·se : `background:#1565c0` (bleu)
- Guidée : `background:#c2185b` (rose/rouge)
- En couple : `background:#6a1b9a` (violet)
- Validé·e : `background:#2e7d32` (vert)
- En attente : `background:#e65100` (orange)

CSS partagé : `display:inline-block;color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;`

#### Bouton principal (or)
```html
<a href="URL" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">[Texte]</a>
```

#### Bouton confirmer présence (vert, E7)
```html
<a href="URL" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:1px;text-decoration:none;">👍 Je confirme ma présence</a>
```

#### Boutons annuler / reporter (contour seulement)
```html
<a href="URL_ANNUL" style="...;background:#fff;color:#c62828;border:2px solid #c62828;">✕ Annuler mon cours d'essai</a>
<a href="URL_FORMULAIRE" style="...;background:#fff;color:#555;border:2px solid #999;">↩ Reporter à une autre date</a>
```

#### Encadré explication (fond beige-orange, E2/E5/E6)
```html
<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
  <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">[Titre explication]</p>
  <p style="font-size:14px;color:#444;line-height:1.7;margin:0;">[Texte]</p>
</div>
```

#### Signature élève (obligatoire dans tous les emails élève)
```html
<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/>
<strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/>
<span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>
```

#### Footer email élève (obligatoire)
```html
<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;">
  <a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/>
  <a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06
</div>
```

#### Header email admin (E0)
```html
<div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;">
  <div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div>
  <div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Nouvelle inscription [type]</div>
</div>
```

#### Encadré principal email admin (bordure or)
```html
<div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:20px;">
  <div style="background:#D4AF37;padding:10px 16px;display:flex;align-items:center;gap:12px;">
    <div style="flex:1;">
      <div style="font-size:18px;font-weight:700;color:#111;">[Prénom NOM]</div>
      <div style="font-size:12px;color:#333;margin-top:2px;">[email] · [tel]</div>
    </div>
    <span class="badge-[role]">[Rôle]</span>
  </div>
  <div style="background:#fffdf8;padding:14px 16px;">
    <div style="font-size:16px;font-weight:700;color:#111;">📍 [Ville Niveau]</div>
    <div style="font-size:13px;color:#333;">[Jour date · horaire]</div>
    <div style="font-size:12px;color:#666;">[Lieu]</div>
  </div>
</div>
```

#### Notifications admin (interface)
- Fond général : `#1a1a1a`
- Nouvelle inscription validée (vert) : fond `#0f1f0f`, border-left `#4caf50`
- Liste d'attente (jaune) : fond `#1f1800`, border-left `#e8c84a`
- Annulation (rouge) : fond `#1f0808`, border-left `#ef5350`
- Couleurs rôle dans les notifs : guideur·se `#7ab4ff`, guidée `#f48fb1`, couple `#ce93d8`

#### Règles de contenu selon niveau
- **Débutant** : inclure la section checklist "Pour votre cours d'essai" (arrivée 5min, chaussures lisses, tenue)
- **Intermédiaire** : **ne pas** inclure cette section (les élèves connaissent déjà)

### ✅ Catalogue emails cours d'essai tango — VALIDÉ

| Code | Déclencheur | Destinataire | Statut élève | Contenu clé |
|------|-------------|--------------|--------------|-------------|
| **E0** | Toute inscription | Admin (tangoetvous@gmail.com) | — | Encadré or : nom/email/tel/rôle/cours/date/lieu + badge statut + table infos + boutons appel/email/SMS/admin |
| **E1** | Inscription confirmée **>7j** avant le cours | Élève | `confirme` | Bandeau vert + boîte cours (bleu) + livret + checklist (débutant seulement) + boutons annuler/reporter + rappel J-7 annoncé |
| **E6** | Inscription confirmée **<7j** avant le cours | Élève | `confirme` | Identique E1 mais sans mention du rappel J-7 |
| **E7** | Rappel J-7 | Élève | `confirme` | Bandeau bleu + boîte cours + livret + checklist (débutant) + **bouton vert "👍 Je confirme"** + boutons annuler/reporter |
| **E2** | Guidée seule inscrite | Élève | `attente` | Bandeau orange + boîte cours + encadré explication parité + bouton "Nous contacter" |
| **E5** | Guideur seul, quota GUI≥22, sept-nov | Élève | `attente` | Bandeau orange + boîte cours + encadré "Ce créneau est complet pour votre rôle ce jour-là" + bouton reporter + "Nous contacter" |
| **E5b** | Couple, un rôle quota plein, sept-nov | Élève (les deux) | `attente` | Bandeau orange + boîte cours + encadré "Ce créneau est complet pour l'un des deux rôles" + bouton reporter |
| **E15** | Admin valide une personne en attente → `confirme` | Élève | `confirme` | Même structure que E1/E6 selon délai restant |

**Actions élève via email :**
- Clic "✕ Annuler" → Worker API → RPC SECURITY DEFINER `confirmer_annuler_essai` → soft-delete `statut='supprimé'` (avec `statut_avant_suppression` pour permettre Rétablir) → **la fiche apparaît grisée en bas du cours + dans l'onglet 🗑 Supprimés** → notif admin (panel 🔔 rouge + email + push). Cf. session 2026-05-23 (suite 4) pour le détail du modèle soft-delete.
- Clic "👍 Je confirme ma présence" (E7) → Worker API → `UPDATE inscriptions_essai SET presence_confirmee=true` → badge 👍 sur fiche admin → notification admin
- Clic "↩ Reporter" → redirige vers le formulaire cours d'essai (`URL_FORMULAIRE_A_RENSEIGNER` — à mettre à jour quand l'utilisateur fournit l'URL)

**Règle livret** : lire `tev_params_<ville>_<sai>.livret.url_deb` ou `url_int` selon ville + niveau de l'élève. Ne jamais hardcoder.

## Session 2026-05-20 — Notifications Agenda, pointage yoga 3 états, cron Y-J1, notifs carte 10

### ✅ Agenda → Modifier/Annuler — notifications élèves identiques aux Paramètres

La même logique `_notifDateChange(type, dates, action, opts)` qui s'exécute dans Paramètres lors de l'ajout/suppression de dates est maintenant aussi déclenchée depuis l'onglet Agenda → Modifier/Annuler :

- **`sauverModifAgenda`** (ajout d'une annulation ou d'un report) :
  - Si `action==='annule'` ou `action==='reporte'` → `_notifDateChange` avec `'suppression'` sur la date annulée
  - Si `action==='reporte'` et `newDate` → second `_notifDateChange` avec `'ajout'` sur la nouvelle date (delay 300ms)
  - Mapping type : `'stage'` → `'stages'`, `'milonga-xxx'` → `'milonga'` + `{milNom}`, yoga → direct

- **`supprimerModifAgenda`** (restauration d'une entrée depuis l'historique) :
  - Si l'entrée restaurée était une annulation → `_notifDateChange('ajout')` sur la date
  - Si l'entrée restaurée était un report → `_notifDateChange('suppression')` sur `newDate` + `_notifDateChange('ajout')` sur la date d'origine

- **`ajouterDatesLot`** (ajout en lot depuis Agenda) :
  - Accumule `addedDates` → `_notifDateChange('ajout', addedDates, ...)` après les saves

**Règle** : chercher le partenaire sur les **anciennes** valeurs de date/ville/niveau AVANT de modifier l'état local — sinon les champs de recherche ont changé et le partenaire ne se retrouve plus.

### ✅ Essai Yoga — boutons pointage 3 états (non pointé / présent / absent)

Pattern identique aux boutons ✓/✗ de l'essai tango :
- `.btn-pres.on` + `.btn-abs.off` = présent (vert, opposé grisé)
- `.btn-pres.off` + `.btn-abs.on` = absent (rouge, opposé grisé)
- Ni `.on` ni `.off` sur les deux = non pointé

**`pointerYoga(date, email, present, id)`** — réécriture complète :
- Lookup par `id` (priorité) ou par `email+date` dans `adminData.essaiYoga`
- Pose `e.present` ET `e.presence_declaree` sur l'objet local
- Manipulation DOM directe des classes `.on`/`.off` avant `renderTab()` (évite le flash)
- UPDATE Supabase : `inscriptions_essai_yoga.presence_declaree` (pas `presence_confirmee`)
- `Promise.resolve(q).catch(...)` — jamais `q.catch()` directement sur le builder Supabase
- Boutons dans `rowYoga` portent `data-id` en plus de `data-date` et `data-email` pour lookup fiable

### ✅ Cron Y-J1a / Y-J1b — emails lendemain essai yoga

- Workflow `.github/workflows/essai-yoga-j1.yml` — cron `0 7 * * *` UTC → POST `/api/cron/essai-yoga-j1` avec `X-Cron-Secret`
- Worker `handleCronEssaiYogaJ1` : lit `inscriptions_essai_yoga` WHERE `date_essai=hier AND presence_declaree IS NOT NULL`
- Lit les params yoga depuis Supabase (`tev_params_yoga_<sai>`, `tev_liens_assoconnect`) pour horaires, lieu, lien AssoConnect
- **Y-J1a** (présent, `presence_declaree=true`) : email "À bientôt !" avec tarifs cours réguliers + bouton AssoConnect yoga
- **Y-J1b** (absent, `presence_declaree=false`) : email "Vous nous avez manqué" + bouton `essai-yoga.html`
- Envoi à l'élève + copie admin `regardsepose@gmail.com`
- `CRON_SECRET` déjà configuré (partagé avec le cron essai tango)

### ✅ Notifications pointage carte 10 — deux sens

#### Élève → Admin (élève pointe sa propre carte)

Déclenché depuis **trois sources** : `confirmerPointerSelf()` dans index.html (espace élève), `pointer.html` (QR code).

Après le pointage Supabase réussi :
1. `fetch('/api/notify/carte-pointage', {method:'POST', body:{email, prenom, nom, date, nbAdded, utilises, restants, source:'app'|'qr'}})` — fire and forget, sans auth
2. `BroadcastChannel('tev_inscriptions').postMessage({type:'cartePointage', data:{...}})` — mise à jour immédiate si l'admin est dans le même navigateur

Worker `handleNotifyCartePointage` (sans JWT) :
- INSERT dans `notifications` (panel 🔔 admin) avec `type:'carte_pointage'`, `lien_tab:'cartes'`
- Email Brevo à `tangoetvous@gmail.com` : encadré or (nom, email, date, nb cours, source), bouton "Ouvrir l'admin → Cartes 10"

**Règle BroadcastChannel** : le handler `traiterMsgInscription` dans admin.html gérait déjà `cartePointage` (existait pour la branche démo). Il est null-safe (`d.utilises != null ? d.utilises : c.utilises`) et déduplique les dates (`dejaDansAdmin`). Ajouter le BroadcastChannel en prod ne casse rien.

#### Admin → Élève (admin pointe la carte d'un élève)

Déclenché dans `pointerCoursAction()` (admin.html — Cartes 10 → Détails ou Pointage), après `_broadcastAdminSync`.

`fetch('/api/notify/carte-pointee-admin', {method:'POST', headers:{Authorization:'Bearer '+_getJwt()}, body:{email, prenom, nom, date, nbAdded, utilises, restants, expiration}})` — fire and forget, JWT admin requis.

Worker `handleNotifyCartePonteeAdmin` (JWT admin) :
- INSERT dans `notifications_eleve` avec `type:'carte_pointee'`
- Email Brevo à l'élève : bandeau vert ✓, boîte bleue (date, nb cours pointés, utilises/10, restants, expiration si dispo), bouton "Accéder à mon espace élève →", signature Florencia & Jérémy

#### Nouvelles routes worker
| Route | Auth | Handler | Direction |
|-------|------|---------|-----------|
| `POST /api/notify/carte-pointage` | Aucune | `handleNotifyCartePointage` | Élève → Admin |
| `POST /api/notify/carte-pointee-admin` | JWT admin | `handleNotifyCartePonteeAdmin` | Admin → Élève |

## Session 2026-05-21 — Complétion handlers emails worker.js + fichiers sources preview

### ✅ 9 handlers existants corrigés dans `worker.js`

Corrections appliquées sur des handlers incomplets ou bugués :

| Handler | Correction |
|---------|-----------|
| `handleCronEssaiYogaJ1` | Lecture params Supabase + envoi Y-J1a/Y-J1b complet avec branding yoga |
| `handleNotifyYogaDate` | Email Y0 (admin) + Y1/Y-att (élève) avec quota yoga |
| `handleNotifyEssaiAction` | Emails T1-dem + T1-val (transfert essai → inscription) |
| `handleDemandeDevis` | D0a/D0b (admin) + D2 (élève confirmation) via Brevo |
| `handleNotifySorano` | SR1 (relance admin) + SR2 (confirmation réglé → élève) |
| `handleNotifyCartePointage` | Email CP-A admin avec encadré or (nb cours, source) |
| `handleNotifyCartePonteeAdmin` | Email CP-E élève (bandeau vert, boîte bleue, cron lendemain) |
| `handleNotifyCarteEpuisee` | Email CE (carte épuisée 10/10) avec bouton renouvellement |
| `handleCronCarteExpiree` | Email CX (carte expirée avec cours restants) |

### ✅ 18 nouveaux handlers créés dans `worker.js`

Nouvelles routes implémentées (worker.js passe de ~3 800 à **5 358 lignes**) :

**Stages :**
- `POST /api/notify/inscription-stage` → `handleNotifyInscriptionStage` — S0 (admin) + S1/S1b/S2 (élève selon statut et délai)
- `POST /api/cron/rappel-stage-j3` → `handleCronRappelStageJ3` — S4 (rappel J-3 avec bouton 👍)
- `POST /api/notify/stage-valide` → `handleNotifyStageValide` — S3/S3b (admin valide attente → confirmé)
- `POST /api/notify/stage-annule` → `handleNotifyStageAnnule` — S-cancel (annulation par admin)

**Cours particuliers :**
- `POST /api/notify/cours-particulier` → `handleNotifyCoursParticulier` — CP0 (admin) + CP1 (élève récap demande)

**Cartes 10 :**
- `POST /api/notify/carte-bienvenue` → `handleNotifyCarteBienvenue` — C1 (premier pointage saison)
- `POST /api/notify/carte-renouvellement` → `handleNotifyCarteRenouvellement` — C2/C2b (renouvelée sans payer)
- `POST /api/notify/carte-paiement` → `handleNotifyCartePaiement` — C-pay (paiement enregistré)
- `POST /api/notify/carte-report` → `handleNotifyCarteReport` — C-report (carte reportée saison suivante)

**Inscriptions tango régulier :**
- `POST /api/notify/inscription-cours-validee` → `handleNotifyInscriptionCoursValidee` — I02 (guidée validée → att. paiement)
- `POST /api/notify/inscription-cours-payee` → `handleNotifyInscriptionCoursPaye` — I03 (paiement validé → inscrit)
- `POST /api/notify/inscription-cours-modifiee` → `handleNotifyInscriptionCoursModifiee` — I04 (changement cours)

**Essai tango :**
- `POST /api/cron/essai-rappel-j7` → `handleCronEssaiRappelJ7` — E4 (rappel J-7 avec bouton 👍 + livret)
- `POST /api/notify/essai-valide` → `handleNotifyEssaiValide` — E15/E15b (admin valide attente → confirmé, solo ou couple email partagé)

**Essai yoga :**
- `POST /api/cron/essai-yoga-rappel-j3` → `handleCronEssaiYogaRappelJ3` — Y3 (rappel J-3 yoga)
- `POST /api/notify/essai-yoga-modifie` → `handleNotifyEssaiYogaModifie` — Y-mod (modification date/cours essai yoga)
- `POST /api/notify/yoga-inscription-validee` → `handleNotifyYogaInscriptionValidee` — YI1 (inscription régulière yoga validée)

**Espace élève :**
- `POST /api/cron/espace-eleve-activation` → `handleCronEspaceEleveActivation` — P1 (J+7 après I03, encouragement activation espace élève)

### ✅ 7 fichiers `preview-sources-*.html` créés

Fichiers de référence annotant les sources de chaque variable dans les templates email — même design beige que les previews existants, variables en jaune, sources Supabase en bleu :

| Fichier | Emails couverts |
|---------|----------------|
| `preview-sources-essai.html` | E0/E1/E2/E4/E5/E6/E15/E-mod/E-J1a/E-J1b |
| `preview-sources-yoga.html` | Y0/Y1/Y-att/Y3/Y-mod/YI1/Y-J1a/Y-J1b |
| `preview-sources-stages.html` | S0/S1/S1b/S2/S3/S3b/S4/S-cancel |
| `preview-sources-inscription.html` | I0/I01/I01-att/I02/I03/I04/I17 |
| `preview-sources-cartes.html` | C1/C2/C-pay/C-report/CX/C6/CP-A/CP-E/P1 |
| `preview-sources-cp-devis.html` | CP0/CP1/D0a/D0b/D1/D2 |
| `preview-sources-sorano-misc.html` | SR1/SR2/T1-dem/T1-val/CB3x |

### Règle universelle — appel des handlers depuis admin.html / index.html

Chaque handler suit le même pattern d'appel. L'appelant n'attend pas la réponse (fire and forget) :
```javascript
fetch('/api/notify/<route>', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(jwtRequis ? {Authorization: 'Bearer ' + _getJwt()} : {}) },
  body: JSON.stringify({ email, prenom, nom, /* champs selon handler */ })
}).catch(function(){});
```
- **Sans JWT** : routes notify côté élève (carte-pointage, inscription-essai, inscription-essai-yoga, inscription-cours, inscription-stage, cours-particulier)
- **JWT admin requis** : routes notify côté admin (carte-pointee-admin, carte-bienvenue, inscription-cours-validee, inscription-cours-payee, etc.) + tous les `/api/cron/*` (header `X-Cron-Secret` pour les crons GitHub Actions)

## Session 2026-05-21 (suite) — FCM push, crons supplémentaires, C4/C5/C6, câblage admin.html

### ✅ FCM push ajouté dans 8 handlers worker.js

Tous les appels `sendFcmPush` sont fire-and-forget, conditionnés sur `env.FIREBASE_SERVICE_ACCOUNT` :

| Handler | Destinataire | Message push |
|---------|-------------|--------------|
| `handleNotifyCarteRenouvellement` | Élève | `⚠️ Nouvelle carte créée — pensez à finaliser votre paiement` |
| `handleNotifyCartePaiement` | Élève | `✓ Paiement enregistré · Votre carte est active` |
| `handleNotifyCarteReport` | Élève | `↩ Votre carte reportée · N cours préservés pour saison suivante` |
| `handleNotifyCartePonteeAdmin` | Élève | `✓ Cours pointé le [date] · N restants` |
| `handleNotifyCartePointage` | Admin | `📍 Pointage carte — NOM · DATE` |
| `handleCronCarteExpiree` | Élève (par boucle) | `⏰ Votre carte de 10 cours a expiré — N cours non utilisés` |
| `handleNotifyInscriptionStage` | Admin | `🎭 Inscription stage — NOM · DATE` |
| `handleNotifyCoursParticulier` | Admin | `🎯 Cours particulier — NOM` |

### ✅ FIREBASE_SERVICE_ACCOUNT — procédure de configuration

Firebase Console → Project Settings → Service accounts → **"Générer une nouvelle clé privée"** → télécharge un JSON → copier le contenu → Cloudflare Dashboard → Workers → tango-et-vous → Settings → Variables → **type : Secret** (pas Texte) → coller le JSON complet. Sans ça, tous les `sendFcmPush` retournent `{skipped:true}` silencieusement.

**✅ Configuré le 2026-05-24** — `FIREBASE_SERVICE_ACCOUNT` est bien présent comme secret dans Cloudflare Workers.

### ✅ Tables Supabase créées (SQL exécuté par l'utilisateur)

```sql
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT NOT NULL, token TEXT NOT NULL, UNIQUE(token)
);
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_fcm" ON fcm_tokens FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON fcm_tokens TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE fcm_tokens_id_seq TO anon, authenticated;
```

`notifications_eleve` également créée (voir SQL utiles section).

### ✅ Nouveaux handlers et routes worker.js

**C4/C5 — fin de saison :**
- `handleCronFinSaisonC4` — POST `/api/cron/fin-saison-c4` — email bleu "Il vous reste N cours — pré-inscrivez-vous" aux élèves avec `carte_restants > 0 AND carte_statut IN ('Active','Nouvelle carte')`
- `handleCronFinSaisonC5` — POST `/api/cron/fin-saison-c5` — email orange urgent "Dernier rappel — ces cours expireront le 31 août"

**C6 — relance 2 absences :**
- `handleCronRelanceAbsences` — POST `/api/cron/relance-absences` — email informel "tu" aux élèves carte10 absents aux 2 derniers cours
- Lit dates depuis `parametres.tev_cours_dates.paris/vincennes`
- Anti-doublon via `eleves.derniere_relance_abs DATE` (✅ SQL exécuté : `ALTER TABLE eleves ADD COLUMN IF NOT EXISTS derniere_relance_abs DATE;`)
- Accepte `{"ville":"paris"|"vincennes"}` dans le POST body (override du jour de semaine)

**18 autres handlers** (stages S0–S4/S-cancel, cartes C1/C2/C-pay/C-report, inscriptions I02/I03/I04, essai E4/E15, yoga Y3/YI1/Y-mod, CP0/CP1, P1) — voir session 2026-05-21 pour la liste complète.

### ✅ Nouveaux workflows GitHub Actions

| Fichier | Handler | Cron |
|---------|---------|------|
| `essai-rappel-j7.yml` | E4 | `0 7 * * *` — date = +7 jours |
| `rappel-stage-j3.yml` | S4 | `0 7 * * *` — date = +3 jours |
| `essai-yoga-rappel-j3.yml` | Y3 | `0 7 * * *` — date = +3 jours |
| `espace-eleve-activation.yml` | P1 | `0 8 * * *` |
| `fin-saison-c4.yml` | C4 | `workflow_dispatch` uniquement (admin déclenche manuellement en juin) |
| `fin-saison-c5.yml` | C5 | `0 8 25 8 *` (25 août) + `workflow_dispatch` |
| `relance-absences.yml` | C6 | `0 7 * * 5` (vendredi = Paris) + `0 7 * * 2` (mardi = Vincennes) — deux jobs séparés |

### ✅ Câblage admin.html → routes notify worker

| Action admin | Route | Code email |
|---|---|---|
| `soumettreValiderPaiement` → `Promise.all().then()` | `POST /api/notify/inscription-cours-payee` (JWT) | I03 |
| `valGuideeEssai` → `Promise.all(ops).then()` | `POST /api/notify/essai-valide` | E15/E15b |
| `renouvelerCarteAction` → dernier `.then()` si `!paye` | `POST /api/notify/carte-renouvellement` | C2b |
| `pointerCoursAction` → `.then()` si premier cours de la saison | `POST /api/notify/carte-bienvenue` (JWT) | C1 |
| `reporterCarteJs` → INSERT `.then()` | `POST /api/notify/carte-report` | C-report |
| `validerChangementCours` → `Promise.all(ops).then()` | `POST /api/notify/inscription-cours-modifiee` | I04 |
| `annulerStageInscrit` → via `_notifyStageCancel` helper | `POST /api/notify/stage-annule` | S-cancel |
| `valAttStage` → `q.then()` | `POST /api/notify/stage-valide` | S3 |

### Architecture C6 — règles

- **Cron vendredi 7h UTC** → handler Paris ; **cron mardi 7h UTC** → handler Vincennes
- Passe `{"ville":"paris"}` ou `{"ville":"vincennes"}` dans le body POST
- Handler accepte le body en priorité, fallback sur le jour de semaine si body absent
- Anti-doublon : `derniere_relance_abs` stocke la date de la dernière relance → pas de doublon si mêmes 2 dates absentes la semaine suivante
- Email en "tu" informel (seul email du catalogue avec ce ton) — signature "Florencia & Jérémy"
- Ne pas envoyer si l'élève a déclaré son absence via 🚫 (la détection est basée sur les `presences` manquantes, pas les `absences_jour`)

## Session 2026-05-21 (suite 2) — Security Advisor + Previews dynamiques

### ✅ Audit Supabase Security Advisor — 38 warnings corrigés
Voir section "Audit Supabase Security Advisor — 2026-05-21" pour le détail complet des SQL exécutés et des risques résiduels acceptés.

### ✅ SQL `derniere_relance_abs` exécuté
`ALTER TABLE eleves ADD COLUMN IF NOT EXISTS derniere_relance_abs DATE;` — exécuté par l'utilisateur. Requis pour le handler C6 (anti-doublon relance absences).

### ✅ Previews emails mis à jour — variables dynamiques (zéro hardcodé)

**Règle universelle renforcée** : aucune année, saison ou lien hardcodé dans les previews ni dans les handlers. Variables à utiliser :
- `${sai}` — saison active (ex : `2025-2026`)
- `${saiNext}` — saison suivante (ex : `2026-2027`)
- `${anneeFin}` = `parseInt(sai.split('-')[1])` — année de fin de saison courante (ex : `2026`)
- `${tev_liens_assoconnect[saiNext].cours}` — lien AssoConnect inscription saison prochaine (Supabase `parametres`)

**`preview-emails-cartes-v1.html`** — sections C4 et C5 :
- Label déclencheur C4 : "CRON DÉCLENCHÉ LE LENDEMAIN DU DERNIER COURS PARIS DE JUIN" (automatique, pas `workflow_dispatch`)
- Sujet C4 : `"Votre carte de 10 cours — il vous reste N cours pour ${saiNext}"`
- Corps C4 : "Les pré-inscriptions pour la saison ${saiNext} sont ouvertes. Réglez simplement l'adhésion à notre association avant le 25 août ${anneeFin} sur AssoConnect pour reporter les cours de votre carte à la saison prochaine."
- Corps C5 : "Réglez simplement l'adhésion à notre association avant le 25 août ${anneeFin} sur AssoConnect pour reporter les cours de votre carte à la saison prochaine."
- Bouton C4 et C5 : **"Reportez votre carte → Réglez votre adhésion de la saison prochaine"** (href : `${tev_liens_assoconnect[saiNext].cours}`)
- Push C4 : `"📅 Il vous reste ${restants} cours — reportez-les sur ${saiNext} avant le 25 août ${anneeFin}"`

**`preview-sources-cartes.html`** — sections C4 et C5 ajoutées :
- `tev_liens_assoconnect[saiNext].cours` : Supabase `parametres`, clé `tev_liens_assoconnect`, chemin `[saisonSuivante()].cours`
- `anneeFin` : calculé côté worker `parseInt(sai.split('-')[1])` — jamais hardcodé
- `eleves.carte_statut IN ('Active','Nouvelle carte') AND carte_restants > 0` : filtre DB
- Section C6 : correction route (était "GitHub Actions script" → maintenant `POST /api/cron/relance-absences (X-Cron-Secret)`)

**`preview-emails-yoga-v1.html`** — section Y-J1a :
- En-tête yoga-box : `"Saison ${sai} (dynamique)"` au lieu de `"Saison 2026-2027"` hardcodé
- Titre tarifs : `"Tarifs ${sai} (dynamique)"` au lieu de `"Tarifs 2026-2027"`

## Session 2026-05-21 (suite 3) — Corrections workflows GitHub Actions + CRON_SECRET + is_admin()

### ✅ CRON_SECRET configuré dans Cloudflare Workers
`CRON_SECRET` était présent dans GitHub Actions secrets mais manquait dans Cloudflare Workers → tous les crons retournaient 401 → exit 1 → emails d'échec GitHub. Ajouté dans Cloudflare Dashboard → Workers → tango-et-vous → Settings → Variables → Secret variables.

### ✅ Incident is_admin() — données admin vides
Après l'exécution du SQL Security Advisor, un second bloc SQL (non généré par Claude) a remplacé `is_admin()` par une implémentation plpgsql incorrecte qui cherchait `eleves.role = 'admin'`. Résultat : is_admin() retournait false pour tout le monde → toutes les données admin disparaissaient.

**Fix** : restaurer la définition correcte :
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
**Règle permanente** : ne jamais modifier `is_admin()` autrement qu'en ajoutant un email dans le `ARRAY[...]`. Pas de `SET search_path`, pas de `LANGUAGE plpgsql`, pas de lookup dans `eleves.role`.

### ✅ Corrections YAML syntax errors — 3 fichiers workflow

Apostrophe dans une chaîne YAML entre guillemets simples = erreur de parsing → workflow invalide → échecs sur chaque push.

| Fichier | Ligne | Avant | Après |
|---------|-------|-------|-------|
| `essai-rappel-j7.yml` | 10 | `'Date du cours d'essai...'` | `"Date du cours d'essai..."` |
| `essai-yoga-rappel-j3.yml` | 10 | `'Date de l'essai yoga...'` | `"Date de l'essai yoga..."` |
| `fin-saison-c4.yml` | 11 | `'Forcer l'envoi...'` | `"Forcer l'envoi..."` |

**Règle** : dans les fichiers YAML, toujours utiliser des guillemets doubles `"..."` pour les `description:` contenant des apostrophes françaises.

### ✅ Fix handler P1 — `updated_at` → `created_at`

`handleCronEspaceEleveActivation` (worker.js ligne ~4506) interrogeait `inscriptions_cours` avec `updated_at=gte.${date}` mais cette table n'a pas de colonne `updated_at` (seulement `created_at`) → Supabase retournait 400 → handler retournait 500.

**Fix** : `updated_at` → `created_at` dans la requête.

**Note** : `created_at` est la date d'insertion de la ligne, pas la date de validation du paiement. Acceptable pour P1 (l'email d'activation est informatif, un décalage de quelques jours n'a pas d'impact).

### ✅ Tests workflows GitHub Actions — tous passent en vert
- `Essai Tango — emails J+1` ✅ (testé en workflow_dispatch)
- `Essai Tango — rappel J-7` ✅ (testé en workflow_dispatch après fix YAML)
- `Essai Yoga — rappel J-3` ✅ (testé en workflow_dispatch après fix YAML)
- `Espace élève — activation J+7` ✅ (testé en workflow_dispatch après fix updated_at)
- `Stages — rappel J-3` ✅ (testé en workflow_dispatch)
- Autres workflows (`carte-expiree`, `relance-cb3x`, `relance-absences`, `essai-yoga-j1`, `fin-saison-c5`, `keep-alive`, `backup-csv`) — à tester ultérieurement

## Session 2026-05-22 — Corrections emails E15 + câblage notifications

### ✅ Fix E15 — email non envoyé lors de la validation d'une élève en attente

**Cause** : `valGuideeEssai` dans `admin.html` appelait `/api/notify/essai-valide` sans header `Authorization: Bearer`. La route exige un JWT (`if (!jwt) return jsonError(401, ...)`) → 401 silencieusement avalé par `.catch(function(){})` → aucun email.

**Fix** : ajout de `'Authorization': 'Bearer ' + _jwt15` sur les deux appels fetch dans `Promise.all(ops).then()`.

### ✅ Fix E15 — date "undefined NaN undefined NaN"

**Cause** : `admin.html` envoyait `dateIso` dans le body mais le handler destructure `dateEssai` → `undefined` → `fmtDate(undefined)` → "undefined NaN undefined NaN".

**Fix** : renommé `dateIso` → `dateEssai` dans les deux appels depuis `valGuideeEssai`.

### ✅ Réécriture complète du handler E15 (`handleNotifyEssaiValide`)

Le handler précédent était un stub minimal (cours box simple sans horaire/lieu, livret jamais fetchéé, `daysUntil` hardcodé à 99, token HMAC fake `"e15"`). Réécrit pour matcher le preview `preview-emails-essai-v2.html` :

**Nouvelles fonctionnalités** :
- Fetch `tev_params_<ville>_<sai>` depuis Supabase → horaires, adresse, GPS, livret URL
- `daysUntil` calculé depuis `dateEssai` (pas hardcodé) → détermine `proche = daysUntil <= 7`
- Saison calculée dynamiquement depuis `dateEssai`

**Cours box** complète (6 lignes) :
- 📅 Date (formatée)
- 🕐 Heure (depuis `horaires[niveau]` dans les Paramètres)
- 📍 Lieu (nom, rue, transport, lien Google Maps si GPS disponible)
- 🎓 Cours (Paris/Vincennes — Débutant/Intermédiaire)
- 🎯 Votre rôle (badge coloré : bleu guideur·se / rose guidée)
- 💶 Tarif (Gratuit si septembre+débutant, 30€ si couple, 15€ sinon)

**Bouton livret** : doré `#D4AF37` "📖 Télécharger le livret Niveau Ville" (pas bleu contour)

**Checklist** (débutants uniquement) : version longue avec 3 items détaillés (5min en avance, chaussures, tenue)

**Bloc action — deux variantes** :
- `>7j` (`proche=false`) : encadré vert "🗓 Vous recevrez un rappel 7 jours avant..." — **aucun bouton Annuler/Reporter**
- `<7j` (`proche=true`) : bouton 👍 "Je confirme ma présence" + encadré "Empêchement de dernière minute ?" avec Annuler + Reporter (remplace le rappel J-7 qui ne viendra pas)

**Tokens HMAC corrects** : `_calHmac(\`${id}:${email.toLowerCase()}\`, SUPABASE_ANON).slice(0,32)` — identiques aux liens E4/E6. Lien Annuler → `presence_confirmee=false`, Confirmer → `presence_confirmee=true`.

**`admin.html` — champs ajoutés** dans les deux appels de `valGuideeEssai` :
- `id: entry.id||''` — requis pour la génération du token HMAC
- `partenaire: entry.partenaire||''` — requis pour détecter couple → tarif 30€

### Règle — tous les handlers E/Y/S/I doivent calculer daysUntil depuis la date DB

Ne jamais hardcoder `daysUntil = 99`. Toujours calculer :
```javascript
const dateObj = new Date((dateEssai||'') + 'T12:00:00');
const todayObj = new Date(); todayObj.setHours(12,0,0,0);
const daysUntil = Math.round((dateObj - todayObj) / (1000*60*60*24));
const proche = daysUntil <= 7;
```

### Règle — tokens HMAC dans les handlers email

Pattern à réutiliser pour tous les liens d'action (confirmer/annuler) dans les emails :
```javascript
const tk = (await _calHmac(`${id}:${(email||'').toLowerCase()}`, SUPABASE_ANON)).slice(0, 32);
const confirmUrl = `${APP_URL}/api/essai/confirmer?id=${id}&token=${tk}`;
const annulerUrl = `${APP_URL}/api/essai/annuler?id=${id}&token=${tk}`;
```
Ne jamais utiliser de tokens statiques comme `"e15"`, `"j7"` etc. — ils ne sont pas validés par `handleEssaiConfirmerAnnuler`.

## Session 2026-05-22 (suite 2) — Fix Gmail "..." + preheaders sur tous les handlers

### Cause du problème Gmail

L'email E2 (élève en liste d'attente) se terminait par `"..."` dans Gmail — l'élève devait cliquer pour voir la fin. **Ce n'est pas la limite 102 Ko** (E2 fait ~5 Ko). La vraie cause : **Gmail collapse les emails dont le contenu final est identique** à d'autres emails du même expéditeur. Tous les emails partageaient exactement la même signature finale → Gmail détectait le doublon et coupait.

### Fix : preheader unique + signature différente pour les emails en attente/annulés

**1. Preheader caché** ajouté avant le `<body>` visible dans chaque email élève. Gmail l'utilise comme texte de preview dans la boîte de réception ET pour son algorithme de déduplication :

```javascript
// Pattern wrap(inner, pre) — backward-compatible (pre optionnel)
const wrap = (inner, pre) => `<!DOCTYPE html><html><body ...>${
  pre ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${pre}&nbsp;&zwnj;...&nbsp;&zwnj;&nbsp;</div>` : ''
}<div style="max-width:600px;...">${inner}</div></body></html>`;

// Appel avec preheader personnalisé par email :
wrap(`${header}${body}${footer}`, `${prenom}, votre cours d'essai du ${dateAff} est confirmé`);
```

**2. Signatures différentes** pour les emails attente/annulation (texte final différent = Gmail ne détecte plus le doublon avec les emails confirmés) :

| Variable | Texte | Utilisée dans |
|---|---|---|
| `signEleve` | "À très bientôt sur la piste !" | Tous les emails confirmés (défaut) |
| `signWait` | "Nous reviendrons vers vous très prochainement." | E2, E5, E5b (essai tango en attente) |
| `signWaitI` | "Nous vous contacterons dès que votre inscription est validée." | T1-dem (transfert essai → inscription, attente) |
| `signWaitS2` | "Nous vous contacterons dès que votre place est confirmée." | S2 (stage en attente) |
| `signCancel` | "Nous espérons vous retrouver bientôt à l'un de nos stages." | S-cancel (stage annulé) |
| `signYogaWait` | "Nous vous contacterons dès qu'une place se libère." | Y-att (yoga cours complet) — branding yoga |

### Couverture complète — tous les handlers mis à jour

Les ~30 handlers dans `worker.js` ont tous reçu :
- `wrap(inner, pre)` — signature backward-compatible (déjà présent depuis la session précédente)
- Preheader personnalisé par email sur chaque `sendBrevo`/`sendMail` côté élève
- Signature variante pour les emails attente/annulation

**Règle permanente** : toute nouvelle `sendBrevo` côté élève doit passer un preheader unique comme second argument à `wrap()`. Ne jamais laisser `wrap(inner)` sans preheader sur un email élève — cela risque le clipping Gmail si d'autres emails du même expéditeur ont un contenu final identique.

**Règle permanente** : les emails "en attente" (attente = pas encore confirmé) et "annulés" **doivent toujours** utiliser une signature différente de `signEleve`. Choisir la variable appropriée parmi `signWait`, `signWaitI`, `signWaitS2`, `signCancel`, `signYogaWait` selon le contexte.

### Fichiers de preview mis à jour

- `preview-emails-essai-v2.html` : E2, E5, E5b → `signWait`
- `preview-emails-stages-v1.html` : S2 → `signWaitS2`, S-cancel → `signCancel` ("Nous espérons vous retrouver bientôt sur la piste.")
- `preview-emails-yoga-v1.html` : Y-att → `signYogaWait`
- `preview-emails-a-valider-v1.html` : T1-dem → `signWaitI`

### Fix apostrophes dans les preheaders (session 2026-05-22 suite)

Le script Python ayant utilisé des guillemets simples comme délimiteurs JS pour les preheaders contenant des apostrophes (ex : `d'essai`, `l'application`) avait introduit des SyntaxErrors silencieuses sur 6 lignes. Corrigé en remplaçant par des guillemets doubles `"..."` :

| Ligne | Handler | Preheader corrigé |
|-------|---------|-------------------|
| 1285 | `handleCronEssaiYogaJ1` (Y-J1a) | `"Essai yoga termine - rejoindre les cours reguliers de yoga avec Florencia Garcia"` |
| 4330 | `handleCronEssaiRappelJ7` (E4) | `"Rappel essai tango dans 7 jours - confirmez votre presence en un clic"` |
| 4473 | `handleNotifyEssaiValide` (E15) | `"Essai tango confirme - nous vous attendons avec impatience sur la piste"` |
| 4556 | `handleCronEssaiYogaRappelJ3` (Y3) | `"Rappel essai yoga dans 3 jours - confirmez votre presence en un clic"` |
| 4619 | `handleNotifyEssaiYogaModifie` (Y-mod) | `"Essai yoga reprogramme - retrouvez les nouveaux details ci-dessous"` |
| 4768 | `handleCronEspaceEleveActivation` (P1) | `"Votre espace eleve est pret - connectez-vous et installez l application"` |

**Règle** : les preheaders JS doivent toujours être entre guillemets doubles `"..."` — jamais entre guillemets simples si le texte peut contenir des apostrophes françaises.

## Session 2026-05-22 (suite 3) — Mise à jour previews sources + preheader D2

### ✅ Preheader rows ajoutés dans tous les fichiers `preview-sources-*.html`

Chaque bloc email élève dans les 9 fichiers sources contient désormais une ligne "Preheader" avec la chaîne exacte utilisée dans `worker.js` (ASCII sans accents, guillemets doubles).

| Fichier | Emails documentés avec preheader |
|---------|----------------------------------|
| `preview-sources-essai.html` | E1, E2, E4, E-J1a, E-J1b, E15 |
| `preview-sources-yoga.html` | Y1, Y3, Y-mod, YI1, Y-J1a, Y-J1b |
| `preview-sources-stages.html` | S1/S1b (partagé), S2, S3/S3b (partagé), S4, S-cancel |
| `preview-sources-cartes.html` | C1, C2/C2b (partagé), C-pay, C-report, C4, C5, P1 |
| `preview-sources-inscription.html` | I01, I01-att, I02, I03, I04 |
| `preview-sources-a-valider.html` | T1-dem, T1-val, SR1, SR2, CP-E, CX |
| `preview-sources-cp.html` | CP1 |
| `preview-sources-cb3x.html` | CB3x |
| `preview-sources-devis.html` | D2 |

**Emails admin-only (pas de preheader)** : D0a, D0b, D1 (Gmail draft), S0, Y0, YI0, CP0, CP-A, I0.

### ✅ Cas particuliers — preheader hors `wrap()`

- **C6** : `wrapC6(inner)` est une fonction à **1 seul argument** — le second arg est ignoré. C6 n'a intentionnellement **pas de preheader** (email informel "tu", ton distinct). Ne pas ajouter `wrapC6(inner, pre)`.
- **D2** : utilisait un raw template literal sans `wrap()`. Preheader ajouté directement dans le template à `worker.js` ligne ~1414 : `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Votre demande de devis est bien enregistree...</div>`. Même pattern que CP-E.
- **CP-E** (`handleCronCartePonteeJ1`) : preheader embarqué directement dans le template `const html = \`...\`` (pas de `wrap()`). Ligne ~2825 dans `worker.js`.

### Règle de synthèse — preheaders dans worker.js

Pour tout nouvel email élève dans un handler :
1. Si le handler utilise `wrap()` → passer le preheader en second argument : `wrap(inner, "Texte preheader ASCII")`
2. Si le handler utilise un raw template literal → insérer le div preheader après `<body ...>` : `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Texte preheader ASCII&nbsp;&zwnj;&nbsp;</div>`
3. **Jamais de guillemets simples** si le preheader peut contenir des apostrophes
4. **Jamais d'accents** dans les preheaders (ASCII uniquement — compatibilité maximale)
5. **C6 exception** : ne pas ajouter de preheader à cet email

## Session 2026-05-22 (suite 4) — Fix calcExpiration été + CP-E mention professeur

### ✅ Fix `calcExpiration` et `_calcExpirationSb` — semaines été correctement comptées

**Problème** : la condition `iso <= lastStored` empêchait de compter juillet-août comme semaines sans cours. `lastStored` = dernière date de cours de juin → toutes les semaines de juillet-août (après `lastStored`) étaient exclues du bonus → une carte démarrant en mai expirait vers mi-septembre au lieu de mi-octobre.

**Root cause** : boucle hebdomadaire cherchait les gaps **uniquement** dans `[firstStored, lastStored]` — jamais au-delà. Or, juillet et août sont après `lastStored` (dernier cours de juin) mais avant le début de la prochaine saison (1er septembre).

**Fix** : ajout de `nextSeasonStartISO` (1er septembre de l'année qui suit `lastStored`) comme borne haute. Nouvelle condition :
```javascript
(iso <= lastStored || (nextSeasonStartISO && iso < nextSeasonStartISO))
```
Cela couvre trois cas :
- **Gaps intra-saison** (`iso <= lastStored`) : vacances scolaires, jours fériés — comptés comme avant
- **Été** (`lastStored < iso < 1er sept`) : juillet-août — **désormais comptés** (bonus ~10 semaines)
- **Saison suivante** (`iso >= 1er sept`) : **non comptés**, évite l'extension infinie

**Calcul `nextSeasonStartISO`** :
```javascript
var ls = new Date(lastStored + 'T12:00:00');
var yr = ls.getMonth() >= 8 ? ls.getFullYear() + 1 : ls.getFullYear();
nextSeasonStartISO = yr + '-09-01';
// Exemple : lastStored = 2026-06-25 → mois=5 (< 8) → yr=2026 → nextSeasonStartISO='2026-09-01'
```

**Résultat attendu** pour une carte démarrant le 22 mai :
- 3 mois de base : 22 août
- Gaps intra-saison (vacances de Pentecôte ~1 sem + autres) : +quelques semaines
- Été juillet-août (~10 semaines sans cours) : +10 semaines
- Expiration finale : ~22 octobre ✅ (au lieu de 18 septembre ❌)

**Fix appliqué dans les deux fonctions** :
- `calcExpiration(datePremierCours, ville)` dans `admin.html` (ligne ~613) — `var` syntax
- `_calcExpirationSb(dateStr, ville)` dans `js/tev-supabase.js` (ligne ~626) — `const/let` syntax

⚠️ **Règle à retenir** : ne jamais remettre `iso <= lastStored` seul comme borne haute. Toujours utiliser `nextSeasonStartISO` comme borne haute alternative.

### ✅ CP-E email — mention explicite du professeur

**Changement** : l'email "Cours pointé — Élève" (handler `handleCronCartePonteeJ1` dans worker.js) précise désormais que c'est le professeur qui a enregistré la présence :

- **Sujet** : `✓ Présence enregistrée le ${dateLabel} — Carte Tango & Vous` (inchangé — le "Tango & Vous" suffit)
- **Bandeau** : `✓ Présence enregistrée le ${dateLabel} — Carte Tango & Vous` → `✓ Votre présence a été enregistrée par votre professeur`
- **Corps** : nouveau paragraphe `Votre professeur a enregistré votre présence au cours du ${dateLabel}.` avant le récap de carte

**Motif** : sans cette mention, l'élève pouvait croire que l'email était un accusé de réception d'un pointage qu'il avait lui-même fait (via l'espace élève), alors que CP-E est envoyé uniquement après un pointage admin.

**Preview mis à jour** : `preview-emails-a-valider-v1.html` section CP-E — bandeau, corps, et date d'expiration exemple corrigés (août → octobre).

## Session 2026-05-22 (suite 5) — tevRefreshCoursDates + règles calcExpiration complètes

### ✅ Algorithme calcExpiration — description complète (A+B+C itératif)

L'algorithme est **itératif** : la boucle `while (cur <= fin)` étend `fin` dynamiquement à chaque gap trouvé, ce qui couvre automatiquement les vacances dans l'extension estivale (step C).

**Étapes conceptuelles :**
1. **A** = 3 mois depuis `datePremierCours` → définit une première fenêtre
2. **B** = semaines sans cours dans A → `fin` avancé de 7j par gap → nouvelle fenêtre A+B
3. **C** = semaines sans cours **nouvelles** dans A+B (celles hors de A) → `fin` avancé à nouveau

Exemple (premier cours 11 juin) :
- A : 11 juin → 11 sept → 0 gap en été car juillet-août = après `lastStored` mais avant `nextSeasonStartISO` → `fin` = 11 sept
- B : gaps en sept (Toussaint pas encore dans la fenêtre) → `fin` = ~13 nov
- C : Toussaint 29 oct désormais dans la fenêtre → gap → `fin` = **20 nov** ✅ (pas 13 nov)

**Sources de données (aucune valeur hardcodée) :**
- `localStorage.tev_cours_dates.paris` / `.vincennes` — mis à jour depuis Supabase via `chargerParamsRemote()` (admin) ou `tevRefreshCoursDates()` (espace élève)
- Contient toutes les dates de toutes les saisons saisies dans Paramètres → Tango Paris/Vincennes → Dates
- Saison courante **ET** saison suivante doivent être saisies pour que l'été soit correctement compté

**Borne haute de la boucle :**
```javascript
(iso <= lastStored || (nextSeasonStartISO && iso < nextSeasonStartISO))
// lastStored = dernière date de cours saisie (ex : juin 2027)
// nextSeasonStartISO = '2027-09-01' — calculé depuis lastStored
// → juillet-août = après lastStored MAIS avant nextSeasonStartISO → comptés comme gaps ✅
// → après le 1er sept = nouvelle saison → non comptés ✅
```

**⚠️ Règle absolue** : ne jamais remettre `iso <= lastStored` seul — toujours conserver la condition `nextSeasonStartISO`. Ne jamais remettre de listes `SANS_COURS_*` hardcodées.

### ✅ tevRefreshCoursDates() — fix calcExpiration sur l'espace élève

**Problème** : `_calcExpirationSb()` lit `localStorage.tev_cours_dates` qui est absent sur le téléphone de l'élève (jamais ouvert l'admin) → `coursArr` vide → expiration = 3 mois plat, sans bonus vacances ni été.

**Fix** :
- Nouvelle fonction `tevRefreshCoursDates()` dans `tev-supabase.js` : fetch Supabase `parametres` clé `tev_cours_dates` → écrit dans localStorage. Protégée par le flag `_coursDatesReady` (un seul fetch par session navigateur).
- Appel **gardé** dans `tevPointerCours()` : avant `_calcExpirationSb()`, vérifie si `tev_cours_dates` contient des dates pour la ville de l'élève — si vide → `await tevRefreshCoursDates()`.
- Appel **fire-and-forget** dans `loadEleveData()` (index.html) au login : pré-charge les dates en parallèle de `chargerMilongasEleve()`.

```javascript
// Dans tev-supabase.js (entre tevUnsubscribe et UTILITAIRES)
let _coursDatesReady = false;
async function tevRefreshCoursDates() {
  if (_coursDatesReady) return;
  _coursDatesReady = true;
  try {
    const { data } = await _tev.from('parametres').select('valeur').eq('cle','tev_cours_dates').single();
    if (data?.valeur) {
      const val = typeof data.valeur === 'string' ? JSON.parse(data.valeur) : data.valeur;
      if (val && (val.paris || val.vincennes))
        localStorage.setItem('tev_cours_dates', JSON.stringify(Object.assign({}, val, {modifie: new Date().toISOString().slice(0,10)})));
    }
  } catch(e) { _coursDatesReady = false; }
}
```

### Règle — emails automatiques et date d'expiration

Les handlers dans `worker.js` **ne recalculent pas** l'expiration. Ils utilisent soit :
1. **POST body** (valeur calculée par `calcExpiration()` dans admin.html avant l'appel fetch) : C1, C-pay, CP-A, CP-E
2. **`eleves.carte_expiration` en DB** (valeur stockée lors du dernier pointage/modification) : CX (cron carte expirée)

→ Les emails sont corrects si et seulement si la valeur en DB a été calculée avec le bon algorithme.
→ **Cartes existantes** dont l'expiration a été calculée avant les corrections : valeur fausse jusqu'à la prochaine sauvegarde manuelle depuis Cartes 10 → Détails. À corriger via ✏️ au cas par cas.
→ **Nouvelles cartes** (premier cours pointé après le 2026-05-22) : toujours calculées correctement.

## Emails — problèmes Gmail connus et leurs causes exactes

### Problème 1 — Gmail affiche "..." et l'élève doit cliquer pour voir la fin

**Ce n'est PAS la limite 102 Ko** (les emails de ce projet font 3–8 Ko). La vraie cause :

> Gmail collapse les emails dont **le contenu final est identique** à d'autres emails du même expéditeur. Tous les emails partageaient la même signature finale → Gmail détectait le doublon et tronquait.

**Fix appliqué (2026-05-22)** :
1. **Preheader caché unique** par email (texte de preview Gmail, différent d'un email à l'autre) — via `wrap(inner, "Texte preheader ASCII")`
2. **Signatures différentes** selon le statut : `signEleve` (confirmé), `signWait` (attente), `signCancel` (annulé), etc.

**Si le problème réapparaît sur un nouveau handler :** vérifier que `wrap()` est appelé avec un preheader unique **et** que la signature finale (`signEleve` etc.) est différente des autres emails du même expéditeur.

**Règle** : jamais de `wrap(inner)` sans preheader sur un email élève. Voir section "Règle de synthèse — preheaders dans worker.js".

---

### Problème 2 — Les 2 cours n'apparaissent pas dans l'email I03

**Symptôme** : l'élève inscrit à 2 cours ne reçoit un email I03 que pour 1 cours, ou les 2 cours n'apparaissent pas.

**Cause** : le body envoyé à `/api/notify/inscription-cours-payee` passait `ville`/`niveau`/`role` au niveau racine (mono-cours) au lieu de `coursInfos: [{ville, niveau, role}, ...]` (multi-cours).

**Fix appliqué (2026-05-22)** : `soumettreInscriptionDirecte` et `soumettreValiderPaiement` dans `admin.html` construisent `coursInfosDI` / `coursInfosVP` à partir de `insRows` / `coursCoches` et passent le tableau `coursInfos`.

**Si le problème réapparaît :** vérifier que le body contient bien `coursInfos: [{ville, niveau, role}]` avec **un objet par cours**. Le handler `handleNotifyInscriptionCoursPaye` dans `worker.js` accepte les deux formats (backward compat racine → mono-cours), mais pour 2 cours, `coursInfos[]` est obligatoire.

## Session 2026-05-23 — Audit sujets emails + signatures liste d'attente

### ✅ Harmonisation sujets emails — handlers calés sur les previews

**Règle établie** : les fichiers `preview-emails-*.html` sont la référence immuable. Seuls les handlers dans `worker.js` sont modifiés pour correspondre aux previews. Les previews ne sont jamais modifiés pour coller aux handlers.

**Sujets corrigés dans `worker.js`** (session 2026-05-22 nuit / 2026-05-23 matin) :

| Handler | Email | Sujet avant | Sujet corrigé |
|---------|-------|-------------|---------------|
| `handleNotifyCartePointage` | CP-A (admin) | sujet générique | `🃏 [Carte 10] ${nom} a pointé — ${nb} cours ce jour · ${10/10?'CARTE TERMINÉE ':''}${utilises}/10 total · ${source}` |
| `handleNotifyEssaiAction` | T1 admin | sujet générique | `[Inscription tango] ${nom} — ${cours} — ⏳ att. validation` ou `✓ att. paiement` |
| `handleNotifyEssaiAction` | T1-dem élève | sujet générique | `Votre demande d'inscription au tango est enregistrée — Tango & Vous` |
| `handleNotifyEssaiAction` | T1-val élève | sujet générique | `✓ Votre inscription au tango est validée — procédez à votre inscription sur AssoConnect` |
| `handleDemandeDevis` | D0a/b admin | sujet générique | `[Devis] ${nom} (${type_evenement}) — ${date_evenement} — ${nb} invités` (event) ou `[Devis] ${nom} (${type_demande}) — ${nb} cours — Niveau ${niveau}` (privé) |
| `handleDemandeDevis` | D2 élève | sujet générique | `Votre demande de devis a bien été reçue — Tango & Vous` |
| `handleNotifySorano` | SR2 | sujet générique | `✓ Votre adhésion Sorano est enregistrée — Tango & Vous` |
| `handleNotifySorano` | SR1 | sujet générique | `Rappel — Adhésion Espace Sorano · Tango & Vous` |
| `handleCronCarteExpiree` | CX | sujet générique | `⏰ Votre carte de 10 cours a expiré — ${restants} cours non utilisés · Tango & Vous` |
| `handleNotifyCarteBienvenue` | C1 | sujet générique | `Bienvenue dans votre cours de tango — Tango & Vous` |
| `handleNotifyCarteRenouvellement` | C2 (élève) | sujet générique | `Nouvelle carte ouverte — pensez à finaliser votre paiement` |
| `handleNotifyCarteRenouvellement` | C2b (admin) | sujet générique | `Votre carte de 10 cours a été renouvelée — paiement à finaliser` |
| `handleNotifyCartePaiement` | C-pay | sujet générique | `Votre paiement a bien été enregistré — Tango & Vous` |
| `handleNotifyCarteReport` | C-report | sujet générique | `Votre carte a été reportée pour la saison ${saisonSuivante} — Tango & Vous` |
| `handleNotifyCoursParticulier` | CP0 admin | sujet générique | `[Cours particulier] ${nom}${urgence haute ? ' — urgence haute' : ''} — ${profShort} demandé` |
| `handleNotifyCoursParticulier` | CP1 élève | sujet générique | `Votre demande de cours particulier a bien été reçue — Tango & Vous` |

### ✅ Variables de signature — inventaire complet

Chaque variable de signature est définie localement dans le handler qui l'utilise. Variantes utilisées dans `worker.js` :

| Variable | Première ligne | Utilisée dans |
|----------|---------------|---------------|
| `signEleve` | "À très bientôt sur la piste !" | Emails élèves confirmés (défaut) |
| `signWait` | "Nous reviendrons vers vous très prochainement." | E2, E5, E5b (essai attente), **I01-att** (inscription attente) |
| `signWaitI` | "Nous vous contacterons dès que votre inscription est validée." | T1-dem (transfert essai → inscription, attente) |
| `signWaitS2` | "Nous vous contacterons dès que votre place est confirmée." | S2 (stage attente) |
| `signCancel` | "Nous espérons vous retrouver bientôt sur la piste." | S-cancel (stage annulé) |
| `signYoga` | "À très bientôt sur le tapis !" + branding Florencia Garcia | Y1, Y3, YI1, Y-mod, Y-J1a, Y-J1b |
| Y-att inline | "Nous vous contacterons dès qu'une place se libère." + branding yoga | Y-att (yoga cours complet) |
| `signI02` | "Nous vous attendons avec impatience !" | I02 (guidée validée → att. paiement) |
| `signEleveI03` | "À très bientôt sur la piste — **[cours]** !" | I03 (paiement validé, avec mention du cours) |
| `signE4` | "À [jourCours.toLowerCase()] prochain !" | E4 (rappel J-7 essai tango) |
| `sign7` | "À [dayName] !" | E7/E6 (confirmation essai ≤7j) |
| C6 inline | "À très bientôt sur la piste !" + "Florencia & Jérémy" (informel) | C6 (relance 2 absences, ton "tu") |

**Règle** : les emails de liste d'attente ne disent **jamais** "À très bientôt sur la piste !" — la personne n'est pas encore confirmée. Toujours choisir une variante `signWait*`.

**Règle** : les emails yoga n'utilisent jamais `signEleve` — toujours `signYoga` ou la variante inline yoga. Branding séparé (Florencia Garcia / Le Regard Se Pose).

### ✅ Fix I02 — Gmail "..." clipping (session 2026-05-23 matin)

**Problème** : l'email I02 (guidée validée → liste d'attente paiement) se terminait avec `signEleve`, identique à I01-val et I03 → Gmail détectait le doublon de fin et tronquait avec "...".

**Fix** :
- Nouvelle variable `signI02` = "Nous vous attendons avec impatience !" (première ligne différente)
- Remplace `${signEleve}` par `${signI02}` dans le template I02 de `handleNotifyInscriptionCoursValidee`
- Suppression du div token invisible `<div style="display:none;color:transparent;">` précédemment tenté par erreur

**Règle permanente** : ne jamais utiliser de div token invisible pour différencier des emails. Toujours utiliser :
1. Preheader unique via `wrap(inner, "Texte ASCII unique")`
2. Variante de signature différente si la fin est identique à d'autres emails du même expéditeur

### ✅ Audit complet signatures — résultat

Tous les emails vérifiés. **Un seul problème trouvé et corrigé** :

- **I01-att** (`handleNotifyInscriptionCours`, ligne ~4046) : utilisait `signEleve` → corrigé en `signWait`

Tous les autres emails utilisent la bonne variante de signature selon leur statut (confirmé / attente / annulé / yoga).

## Session 2026-05-23 (suite) — Fix syntaxe worker.js (apostrophes françaises brisées)

### Contexte — runs GitHub Actions #800–#805 en échec

Les commits successifs sur `worker.js` (sujets emails, signI02, signWait/I01-att) ont déclenché un déploiement qui échouait systématiquement avec `npx wrangler@4 deploy` → erreur de syntaxe JS silencieuse.

**Cause racine** : le commit `3dfac8c` avait introduit des guillemets typographiques (U+2018 `'` / U+2019 `'`) comme **délimiteurs** de chaînes JS dans plusieurs handlers. Le commit correctif `e5e723f` a fait un remplacement global de TOUS les U+2019 → U+0027 (`'`), ce qui a bien corrigé les délimiteurs, mais a aussi converti les **apostrophes françaises de contenu** (ex: `d'attente`, `s'agit`, `l'Espace`) qui se trouvaient **à l'intérieur de chaînes délimitées par des guillemets simples** — créant des fins de chaîne intempestives.

### Exemples d'erreurs créées

```javascript
// Avant fix e5e723f (curly quote — invalide comme délimiteur) :
'<p>Pourquoi une liste d'attente ?</p>'   // U+2018 comme délimiteur → SyntaxError

// Après fix e5e723f (blanket replacement) :
'<p>Pourquoi une liste d'attente ?</p>'   // d'attente → d' termine la chaîne → SyntaxError

// Fix correct :
'<p>Pourquoi une liste d\'attente ?</p>'  // apostrophe de contenu échappée
```

### Stratégie de fix appliquée

1. **Partir de HEAD** (commit `e5e723f`) — contient toutes les modifications souhaitées (sujets, signatures, preheaders)
2. **Identifier les 18 emplacements problématiques** par analyse binaire (`open(..., 'rb')`) des U+2019 restants
3. **Correction chirurgicale** : pour chaque apostrophe de contenu dans une chaîne single-quoted, ajouter un backslash (`\'`)
4. **Cas spécial ligne 3145** : `' Il s'agit du <strong>dernier prélèvement</strong>...'` → changer les délimiteurs outer en `"..."` (contenu HTML avec guillemets doubles déjà présents dans les attributs)
5. **Vérification** : `npx acorn --ecma2022 --module worker.js` → PASS
6. **Commit** : `aac8ce5` — deploy run #806 → ✅

### Règles permanentes — worker.js et apostrophes françaises

- **Ne jamais faire de remplacement global U+2019 → U+0027** dans `worker.js`. Ce remplacement casse toutes les apostrophes françaises qui se trouvent à l'intérieur de chaînes single-quoted.
- **Vérification autoritaire** : `npx acorn --ecma2022 --module worker.js` (plus strict que `node --check`)
- **Pattern correct** pour les chaînes contenant des apostrophes françaises :
  - Option A : guillemets doubles outer → `"Il s'agit du..."` (préféré si le contenu n'a pas de `"`)
  - Option B : apostrophe de contenu échappée → `'Il s\'agit du...'`
  - Option C : template literal → `` `Il s'agit du...` `` (jamais de problème)
- **Les preheaders** dans `wrap(inner, "preheader")` et les sujets Brevo doivent toujours utiliser des guillemets doubles `"..."` si le texte peut contenir des apostrophes

### Changements préservés dans le commit final `aac8ce5`

Tous les changements des commits précédents sont présents :
- `signI02` (I02 — "Nous vous attendons avec impatience !") — différent de signEleve pour éviter Gmail "..."
- `signWait` pour I01-att (guidées en liste d'attente)
- 33 preheaders cachés (`display:none;max-height:0;overflow:hidden`) pour anti-clipping Gmail
- Sujets emails harmonisés avec les previews (C1, C2, C-pay, C-report, CP1, CX, D2, SR1, SR2, T1, etc.)

## Session 2026-05-23 (suite 2) — Boutons emails essai : RPC SECURITY DEFINER + Reporter + notifs admin

### Contexte du bug initial

Le bouton **👍 « Je confirme ma présence »** dans l'email E7 (essai tango rappel J-7) affichait `"Inscription introuvable"` et ne posait pas de pouce sur la fiche élève.

**Cause racine** : RLS sur `inscriptions_essai` :
- `SELECT USING (is_admin() OR email = auth.email())` → bloque SELECT pour clé anon
- `UPDATE USING (is_admin())` → bloque UPDATE pour clé anon

→ Le handler `handleEssaiConfirmerAnnuler` faisait un SELECT/UPDATE direct via REST avec la clé anon, qui retournait 0 lignes sans erreur explicite. La page d'erreur "Inscription introuvable" s'affichait.

### Fix : pattern SECURITY DEFINER RPC

**Règle universelle** : pour toute action déclenchée par un lien dans un email (boutons confirmer / annuler / reporter), passer par une **fonction SECURITY DEFINER** qui :
1. Bypass la RLS (s'exécute en tant que propriétaire de la table)
2. Vérifie le token HMAC server-side avant d'agir
3. Retourne JSON `{ok, error?, data...}`

**Pourquoi** : le PATCH/UPDATE direct via REST avec la clé anon **échoue silencieusement** (0 lignes affectées, pas d'erreur HTTP) si la RLS UPDATE exige `is_admin()`. Symptôme : le bouton "marche" en apparence mais rien ne change en DB.

### SQL — 3 fonctions SECURITY DEFINER créées

**1. `confirmer_annuler_essai(p_id, p_token, p_action, p_secret)`** — essai tango (E1/E6/E7/E15 + tous les T1/E-mod)

Actions supportées : `'confirmer'` (`UPDATE presence_confirmee=true`) ou `'annuler'` (soft-delete `UPDATE statut='supprimé' + statut_avant_suppression`).

⚠️ **Historique : UPDATE→DELETE→soft-delete UPDATE statut='supprimé'** :
- 2026-05-22 : version initiale faisait `UPDATE statut='annulé'` — la fiche restait visible (admin n'avait aucun filtre sur 'annulé')
- 2026-05-23 (suite 3) : passage à `DELETE` direct — la fiche disparaissait mais aucune traçabilité, pas de restauration possible
- 2026-05-23 (suite 4) : passage au **soft-delete** `UPDATE statut='supprimé'` + colonne `statut_avant_suppression` → la fiche apparaît grisée en bas du cours + dans un onglet dédié 🗑 Supprimés avec boutons Rétablir / Définitif. Voir session 2026-05-23 (suite 4).

**2. `confirmer_essai_yoga(p_id, p_token, p_secret)`** — essai yoga (Y3)

Action : `presence_confirmee=true` sur `inscriptions_essai_yoga`.

**3. `confirmer_stage(p_email, p_date, p_token, p_secret)`** — stages (S1b/S3b/S4)

Action : `presence_confirmee=true` sur `inscriptions_stages` filtré par `(email, stage_date)`. Token = `HMAC(email + ':' + date).slice(0,32)` (pas d'id, plusieurs lignes possibles par couple email+date).

**Définitions complètes** des 3 fonctions stockées dans les commits `8a544a2` et suivants — voir Supabase SQL Editor pour le contenu actuel.

### Règles permanentes — pgcrypto + SECURITY DEFINER

- `pgcrypto.hmac()` est dans le schéma `extensions`, pas `public` → utiliser `SET search_path = public, extensions` + appel qualifié `extensions.hmac(...)` + cast `'sha256'::text` (sinon `unknown` type → erreur 404)
- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions` — combinaison obligatoire
- `GRANT EXECUTE TO anon, authenticated` — sinon la RPC retourne 404 pour les requêtes sans JWT
- Le pattern complet est documenté en commentaire dans les 3 handlers (`handleEssaiConfirmerAnnuler`, `handleEssaiYogaConfirmer`, `handleStagesConfirmer`)
- **Ne jamais** réintroduire de SELECT/PATCH direct via REST anon sur une table avec RLS restrictive — toujours passer par une RPC SECURITY DEFINER

### Bouton « Reporter à une autre date » — nouvelle sémantique

**Décision métier (2026-05-23)** : « Reporter » = annule l'inscription actuelle + redirige vers le formulaire pour choisir une nouvelle date.

**Nouvelle route worker** : `GET /api/essai/reporter?id=<id>&token=<hmac>`
- Réutilise la RPC `confirmer_annuler_essai` avec `p_action='annuler'` (même token HMAC que `/api/essai/annuler`)
- Notifie l'admin (panel 🔔 + email + push) avec le libellé `↩ Report essai` (au lieu de `✕ Annulation essai`)
- Retourne `Response.redirect('https://app.tangoetvous.fr/cours-essai.html', 302)`

**Boutons mis à jour** dans tous les emails essai tango (E1, E6, E2, E5, E4, E15) :
- Avant : `href="#URL_FORMULAIRE_A_RENSEIGNER"` (placeholder) ou `href=".../cours-essai.html"` (simple redirect, sans annuler en DB)
- Après : `href="${reporterUrl}"` où `reporterUrl = APP_URL + '/api/essai/reporter?id=' + inscId + '&token=' + tk` quand l'id est disponible, sinon fallback simple sur `/cours-essai.html`

**Exception E-J1b** (élève absent J+1) : garde le simple redirect — le cours est déjà passé, rien à annuler.

### Notifications admin pour Annuler / Reporter (essai tango)

Quand un élève clique sur **✕ Annuler** ou **↩ Reporter** depuis son email, l'admin reçoit désormais 3 notifications :

| Canal | Annuler (✕) | Reporter (↩) |
|---|---|---|
| 🔔 Panel in-app admin (`notifications` table) | `✕ Annulation essai — Nom · Cours · Date` | `↩ Report essai — Nom · Cours · Date` |
| 📧 Email Brevo → `tangoetvous@gmail.com` | bandeau rouge `✕ Place libérée — pensez à la liste d'attente` | bandeau bleu `↩ L'élève va réserver une nouvelle date` |
| 📱 Push OS admin (si `FIREBASE_SERVICE_ACCOUNT` configuré) | `✕ Annulation essai — Nom · Date` | `↩ Report essai — Nom · Date` |

**Confirmer 👍** : aucune notification (seulement le badge 👍 sur la fiche). Logique : info à faible valeur, ne pas spammer.

**Dédoublement** : si `result.already=true` (déjà annulé), aucune notif n'est envoyée → évite le spam en cas de double-clic.

**Implémentation** : email + push inline dans `handleEssaiConfirmerAnnuler` (worker.js) — utilise le helper global `getFcmTokensAdmin(svcKey)` et `sendFcmPush(env, tokens, notif)`. Tous les appels sont fire-and-forget (`.catch(function(){})`).

### Badge 👍 dans l'admin Essai Tango — Pointage + Par date

L'ancienne pastille `✓Conf.` (ligne 7421 admin.html, sous-onglet Pointage) remplacée par un emoji 👍 simple avec `title="A confirmé sa présence par email"`. Ajout du même badge dans `_mkEssaiDateCard` (sous-onglet Par date) — auparavant absent.

```javascript
+(e.presenceConfirmee===true?' <span title="A confirmé sa présence par email">👍</span>':'')
```

Les badges Stages (lignes 9218, 9271, 9372 — vues Tous / Slot / Pointage) utilisaient déjà 👍 depuis la session 2026-05-21.

### Test post-déploiement

**Boutons sur emails existants vs nouveaux** :

| Bouton | Email envoyé AVANT commits 2026-05-23 (suite 2) | Email envoyé APRÈS |
|---|---|---|
| 👍 Confirmer | ✅ marche (URL `/api/essai/confirmer` inchangée — le fix est côté serveur via la RPC) | ✅ marche |
| ✕ Annuler | ✅ marche (idem — URL inchangée) | ✅ marche |
| ↩ Reporter | ❌ ancien lien = placeholder ou simple redirect (pas d'annulation DB) | ✅ marche (annule + redirect) |

Pour tester « Reporter » : envoyer un nouvel email essai (workflow_dispatch sur le cron J-7 ou nouvelle inscription test).

### Fichier worker.js — emplacements modifiés

- Routing : `/api/essai/reporter` ajouté entre `/api/essai/annuler` et `/api/essai-yoga/confirmer`
- `handleEssaiConfirmerAnnuler` : ajout du mapping `dbAction = action === 'reporter' ? 'annuler' : action`, branche `if (isReport)` qui redirige + bloc email/push admin inline
- `handleEssaiYogaConfirmer` : réécrit pour appeler RPC `confirmer_essai_yoga`
- `handleStagesConfirmer` : réécrit pour appeler RPC `confirmer_stage`
- `handleNotifyInscriptionEssai` + `handleCronEssaiRappelJ7` + `handleNotifyEssaiValide` : ajout d'une variable `reporterUrl` à côté de `confirmUrl`/`annulerUrl`, remplacement des 6 URLs Reporter

### SQL à exécuter dans Supabase — récap

Les 3 fonctions sont déjà exécutées par l'utilisateur (sessions 2026-05-22 et 2026-05-23). Pour rappel, les définitions sont :
- `confirmer_annuler_essai(BIGINT, TEXT, TEXT, TEXT)` — exécutée le 2026-05-22
- `confirmer_essai_yoga(BIGINT, TEXT, TEXT)` — exécutée le 2026-05-23
- `confirmer_stage(TEXT, DATE, TEXT, TEXT)` — exécutée le 2026-05-23

**Ne jamais modifier** la signature ou la logique de ces fonctions sans mettre à jour les handlers worker correspondants — la signature est versionnée par PostgreSQL et le client doit matcher.

## Session 2026-05-23 (suite 3) — Annul essai par l'élève : DELETE au lieu d'UPDATE statut

### Bug constaté

Après un clic sur "✕ Annuler" depuis l'email d'un élève test :
- ✅ Page "Inscription annulée" affichée
- ✅ Email admin reçu
- ✅ Notif panel 🔔 admin
- ❌ **La fiche restait visible dans Essai Tango** — l'objectif principal n'était pas atteint

### Cause racine

La RPC `confirmer_annuler_essai` faisait `UPDATE inscriptions_essai SET statut='annulé'` mais :
1. **Le statut `'annulé'` n'existe pas dans le workflow métier de `inscriptions_essai`** — les valeurs utilisées sont uniquement `'confirme'`, `'attente'`, `'demande'`
2. **L'admin (admin.html) n'a aucun filtre** sur `statut='annulé'` — toutes les fiches sont affichées quel que soit leur statut
3. **Le bouton ✕ admin** (`supprimerEssaiInscr`, admin.html:9432) fait un **DELETE direct**, pas un UPDATE statut

→ L'UPDATE statut='annulé' ne supprimait rien visuellement et créait des fiches "fantômes" avec un statut non géré.

### Fix : DELETE au lieu d'UPDATE statut

**SQL mis à jour** (exécuté le 2026-05-23) :

```sql
CREATE OR REPLACE FUNCTION confirmer_annuler_essai(p_id BIGINT, p_token TEXT, p_action TEXT, p_secret TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_row inscriptions_essai;
  v_expected TEXT;
BEGIN
  SELECT * INTO v_row FROM inscriptions_essai WHERE id = p_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'error', 'introuvable'); END IF;
  v_expected := substring(encode(extensions.hmac(p_id::text || ':' || lower(v_row.email), p_secret, 'sha256'::text), 'hex'), 1, 32);
  IF p_token != v_expected THEN RETURN json_build_object('ok', false, 'error', 'token'); END IF;
  IF p_action = 'confirmer' THEN
    UPDATE inscriptions_essai SET presence_confirmee = true WHERE id = p_id;
  ELSIF p_action = 'annuler' THEN
    DELETE FROM inscriptions_essai WHERE id = p_id;  -- ← change : DELETE plutôt qu'UPDATE statut
  ELSE
    RETURN json_build_object('ok', false, 'error', 'action_invalide');
  END IF;
  RETURN json_build_object('ok', true, 'already', false,
    'prenom', v_row.prenom, 'nom', v_row.nom, 'email', v_row.email, 'tel', v_row.tel,
    'date_essai', v_row.date_essai, 'ville', v_row.ville, 'niveau', v_row.niveau);
END;
$$;

-- Nettoyage : supprimer les fiches déjà marquées 'annulé' par l'ancienne version
DELETE FROM inscriptions_essai WHERE statut = 'annulé';
```

Apport en plus : ajout de `tel` dans le JSON retourné → l'email admin peut afficher le téléphone cliquable au lieu de `—`.

### Worker — gestion du 2ᵉ clic

Avec DELETE, un 2ᵉ clic sur le même lien retourne `error: 'introuvable'` (SELECT NOT FOUND). Le worker est adapté :
- **Confirmer + introuvable** → 404 (cas pathologique, ne devrait pas arriver)
- **Annuler + introuvable** → page `ℹ️ Déjà annulé` (au lieu de 404)
- **Reporter + introuvable** → redirige quand même vers `cours-essai.html` (UX préservée)

Aucune notification admin envoyée dans ces 3 cas — la première action a déjà notifié.

### Règles permanentes — `inscriptions_essai` et statuts (annulé par session suite 4)

~~Pas de soft-delete~~ → **modèle révisé en session suite 4 : soft-delete adopté**. Voir la section ci-dessous.

## Session 2026-05-23 (suite 4) — Essai Tango : soft-delete + onglet 🗑 Supprimés

### Décision métier

Demande utilisateur : les fiches d'élèves supprimées/annulées (admin ✕ ou élève clic email) doivent rester visibles, regroupées dans un onglet dédié, avec possibilité de **rétablir** (au cas où) ou de **supprimer définitivement** (DELETE réel).

→ Passage de DELETE direct à **soft-delete via `statut='supprimé'`**.

### Schéma SQL — nouvelle colonne

```sql
ALTER TABLE inscriptions_essai
  ADD COLUMN IF NOT EXISTS statut_avant_suppression TEXT DEFAULT NULL;
```

Conserve l'ancien statut (`'confirme'` / `'attente'` / `'demande'`) au moment de la suppression, pour permettre la restauration au bon état.

### RPC `confirmer_annuler_essai` — version finale (UPDATE statut='supprimé')

Logique :
1. SELECT row → si NOT FOUND → `error: 'introuvable'`
2. Vérification HMAC token
3. Si `action='confirmer'` → UPDATE `presence_confirmee=true`
4. Si `action='annuler'` :
   - Si déjà `statut='supprimé'` → idempotent, retour `already: true` (pas de UPDATE)
   - Sinon UPDATE `statut='supprimé', statut_avant_suppression=v_row.statut`

Le worker handler reste inchangé — la branche `if (!result.already)` continue à filtrer les notifications admin sur le 2ᵉ clic.

### admin.html — affichage des supprimés

**Pointage (`filtreEssai='pointage'`)** : split `grp.ins` en 3 listes :
- `supprimesGrp` = `statut='supprimé'`
- `visibles` = autres
- `conf` et `attenteGrp` calculés depuis `visibles`

Les supprimés s'affichent en bas du cours, dans un bloc encadré rouge `🗑 Supprimés (N)` puis chaque fiche avec `opacity:0.55`, nom barré, pill rouge `SUPPRIMÉ`.

**Par date (`filtreEssai='dates'`)** : même logique, supprimés en bas de chaque cours.

**Liste d'attente** : pas de changement — filtre `statut='attente'` exclut naturellement les supprimés.

**Nouveau sous-onglet `🗑 Supprimés (N)`** :
- Compteur dynamique dans le titre (filtre `statut='supprimé'` + saison active)
- Groupé par `date|niveau|ville` (DESC date)
- Bandeau d'aide : "Une fiche supprimée n'est plus comptée dans les quotas. Rétablir remet le statut initial ; Définitif efface la fiche de la DB (irréversible)."
- Pill grise affiche le `statut_avant_suppression` (ex: "confirme", "attente")
- Bouton 🔄 **Rétablir** : `retablirEssai(id)` → UPDATE `statut = statut_avant_suppression || 'confirme'` + delete column
- Bouton 🗑 **Définitif** : `supprDefEssai(id, nom)` → modal de confirmation → DELETE réel

### Fonctions admin.html

**`supprimerEssaiInscr(email, date, id)`** (réécrite — clic ✕ admin) :
- État local : marque `e.statut='supprimé', e.statut_avant_suppression=oldStatut`
- DB : SELECT id+statut d'abord, puis UPDATE en batch (préserve `statut_avant_suppression` même si plusieurs rows match)
- Plus de DELETE — UPDATE soft uniquement

**`retablirEssai(id)`** (nouvelle) :
- État local : `e.statut = e.statut_avant_suppression || 'confirme'`, `delete e.statut_avant_suppression`
- DB : UPDATE `statut + statut_avant_suppression=NULL`
- Toast `✓ Fiche rétablie`

**`supprDefEssai(id, nom)`** (nouvelle) :
- Modal de confirmation `Supprimer définitivement la fiche de NOM ? Cette action est irréversible.`
- DELETE réel en DB
- Toast `🗑 Fiche supprimée définitivement`

### Handlers click ajoutés

```javascript
case 'retablir-essai':    retablirEssai(btn.dataset.id); break;
case 'suppr-def-essai':   supprDefEssai(btn.dataset.id, btn.dataset.nom||''); break;
```

### Quotas et impact

- Les supprimés ne sont **plus comptés** dans les compteurs des cours d'essai (filtrés par `statut !== 'supprimé'` dans Pointage + Par date)
- RPC SQL `compter_inscrits_essai` continue de filtrer sur `statut='confirme'` → supprimés exclus naturellement
- L'admin peut Rétablir une fiche supprimée par erreur sans avoir besoin de la réinscrire manuellement

### Règles permanentes — `inscriptions_essai` (révisées)

- **Statuts utilisés** : `'confirme'`, `'attente'`, `'demande'`, `'supprimé'` (soft-delete)
- **Pas de `'annulé'`** — ne jamais utiliser ce statut, il n'a aucun handler associé
- **Soft-delete via `statut='supprimé'`** + `statut_avant_suppression` pour la restauration
- **DELETE réel** uniquement via le bouton 🗑 Définitif de l'onglet Supprimés (irréversible, après confirmation modale)
- **Admin ✕ et email Annuler** font tous deux le soft-delete (cohérence)
- **Pas de filtre RLS supplémentaire** : `tev-supabase.js` charge toutes les fiches (y compris supprimés) — c'est l'admin.html qui filtre/groupe selon les vues

## Session 2026-05-24 — Emails élève annul/report + fix panel 🔔 admin

### ✅ Emails élève lors d'une annulation ou d'un report

Trois nouveaux emails côté élève, documentés dans `preview-emails-a-valider-v1.html` (sections `essai-annule-eleve`, `essai-reporte-eleve`, `essai-admin-supprime-eleve`) et dans `preview-sources-essai.html`.

| Code | Déclencheur | Bandeau | Bouton |
|------|-------------|---------|--------|
| **E-cancel-eleve** | Élève clique ✕ Annuler dans son email → `handleEssaiConfirmerAnnuler(action='annuler')` → helper `_essaiAnnulEmailEleve(result, isReport=false, ...)` (fire and forget) | Rouge `#ffebee`/`#c62828` "✕ Votre cours d'essai a bien été annulé" | Bleu contour "↩ Choisir une autre date →" → cours-essai.html |
| **E-report-eleve** | Élève clique ↩ Reporter dans son email → `handleEssaiConfirmerAnnuler(action='reporter')` → même helper `isReport=true` | Bleu `#e3f2fd`/`#1565c0` "↩ Vous allez choisir une nouvelle date" | Vert `#2e7d32` "↩ Choisir une nouvelle date →" |
| **E-admin-cancel-eleve** | Admin clique ✕ sur fiche → `supprimerEssaiInscr()` → soft-delete → `POST /api/notify/essai-annule-admin` (fire and forget, sans auth) → `handleNotifyEssaiAnnuleAdmin()` | Orange/jaune `#fff8e1`/`#e65100` "📋 Votre inscription a été modifiée" | Or `#D4AF37` "↩ Choisir une autre date →" |

**Signature** : `signCancel = "À bientôt peut-être sur la piste !"` — différente de `signEleve` pour éviter Gmail "..." clipping.

**Cours box** : même structure que E1/E6/E15. Horaires depuis `tev_params_${ville}_${sai}.horaires[niveau]` (fetch Supabase dans le helper/handler). Adresse depuis `tev_params_${ville}_${sai}.adresse`.

**Règle** : capturer `{email, prenom, nom, date_essai, ville, niveau}` depuis `adminData.essai` AVANT le soft-delete dans `supprimerEssaiInscr`, car après la mise à jour locale de `e.statut`, les données de contexte sont toujours présentes mais la logique est plus claire si capturées avant.

### ✅ Fix critique — panel 🔔 admin silencieusement muet (toutes les notifications)

**Symptôme** : l'admin ne recevait aucune notification dans le panel 🔔 lors des actions élève (annulation/report essai, pointage carte, inscription stage, renouvellement carte, etc.).

**Cause racine réelle** : la table `notifications` **n'existait tout simplement pas** dans Supabase. Elle était documentée dans CLAUDE.md et référencée dans le code comme si elle existait, mais n'avait jamais été créée. Tous les inserts worker retournaient 404 attrapé par `.catch(function(){})` → silence total. Découvert via screenshot du Table Editor Supabase (2026-05-24).

**Fix en deux parties** :

**Partie 1 — SQL exécuté dans Supabase** :
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW(),
  type TEXT NOT NULL DEFAULT 'info', message TEXT NOT NULL DEFAULT '',
  lu BOOLEAN NOT NULL DEFAULT false, lien_tab TEXT NOT NULL DEFAULT ''
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_admin" ON notifications
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO authenticated;

-- Fonction SECURITY DEFINER — le worker appelle celle-ci (pas de service key requis)
CREATE OR REPLACE FUNCTION inserer_notification(
  p_type TEXT, p_message TEXT DEFAULT '', p_lu BOOLEAN DEFAULT false, p_lien_tab TEXT DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (type, message, lu, lien_tab) VALUES (p_type, p_message, p_lu, p_lien_tab);
END;
$$;
GRANT EXECUTE ON FUNCTION inserer_notification(TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;
```

**Partie 2 — worker.js** : ajout du helper `_insertNotification()` + remplacement des 10 inserts directs :

```javascript
// Helper global — bypass RLS via SECURITY DEFINER, pas besoin du service key
function _insertNotification(type, message, lien_tab) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/inserer_notification`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_type: type, p_message: message, p_lu: false, p_lien_tab: lien_tab || '' }),
  });
}
```

Les 10 inserts directs dans `notifications` remplacés par `await _insertNotification(type, msg, tab)` :
`carte_pointage`, `carte_epuisee`, `carte_expiree`, `discussion_nouvelle`, `discussion_message`, `essai_annule`, `carte_renouvelee`, `stage_inscription`, `cours_particulier`, `relance_absences`.

**Règle permanente** : tout nouvel INSERT dans la table `notifications` doit passer par `_insertNotification()`. Ne jamais faire de POST REST direct vers `/rest/v1/notifications` avec la clé anon — la RLS le bloquera silencieusement. Les inserts dans `notifications_eleve` (RLS always true) peuvent conserver `SUPABASE_ANON` directement.

**Vérification syntaxique** : `npx acorn --ecma2022 --module worker.js` → OK après le fix.

## Session 2026-05-24 (suite) — Confirmer-après-annulation + liste tables confirmée

### ✅ Fix UX "Confirmer après annulation" — page informative au lieu de "Présence confirmée !"

**Problème** : un élève ayant cliqué "✕ Annuler" ou "↩ Reporter" (soft-delete de son inscription), qui cliquait ensuite sur "👍 Je confirme ma présence" dans le même email, voyait la page verte "Présence confirmée !" — trompeur car son inscription était annulée.

**Cause** : la RPC `confirmer_annuler_essai` faisait un `UPDATE presence_confirmee=true` même si `statut='supprimé'`, et retournait `{ok:true}` sans signaler que la ligne était supprimée.

**Fix RPC** (SQL exécuté dans Supabase) :
```sql
-- Dans la branche action='confirmer' de confirmer_annuler_essai() :
IF v_row.statut = 'supprimé' THEN
  RETURN json_build_object('ok', true, 'supprime', true,
    'prenom', v_row.prenom, 'nom', v_row.nom, 'email', v_row.email,
    'date_essai', v_row.date_essai, 'ville', v_row.ville, 'niveau', v_row.niveau);
END IF;
-- ... puis UPDATE presence_confirmee=true uniquement si statut != 'supprimé'
```

**Fix worker.js** (`handleEssaiConfirmerAnnuler`, branche `action='confirmer'`) :
```javascript
if (result.supprime) {
  return new Response(
    htmlPage('ℹ️', 'Cours d\'essai annulé', '#e65100',
      `Votre inscription au cours d'essai tango du <strong>${coursDate}</strong>
       (${villeAff} — ${nivAff}) avait été annulée. Votre présence n'a pas pu être enregistrée.
       <br><br><a href="https://app.tangoetvous.fr/cours-essai.html"
       style="color:#D4AF37;font-weight:700;text-decoration:none;">↩ Choisir une nouvelle date →</a>`),
    { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
  );
}
// ... puis afficher "Présence confirmée !" normalement
```

**Résultat** : clic "Confirmer" après annulation → page orange ℹ️ "Votre inscription avait été annulée" + lien pour choisir une nouvelle date.

### Liste complète tables Supabase — confirmée 2026-05-24 (screenshots Table Editor)

Tables confirmées présentes dans Supabase (ordre alphabétique) :

| Table | Description |
|-------|-------------|
| `absences_jour` | Absences déclarées cours réguliers |
| `agenda_modifs` | Modifications d'agenda (annulations, reports) |
| `cheques_depot` | Chèques associés aux remises banque |
| `compteurs_devis` | Numérotation annuelle devis (accès RPC uniquement) |
| `cours_particuliers` | Demandes de cours particuliers |
| `cours_yoga` | Inscriptions yoga régulier |
| `demandes_devis` | Demandes reçues via formulaire public |
| `devis` | Devis officiels créés par l'admin |
| `discussion_messages` | Messages des discussions élèves-admin |
| `discussions` | Fils de discussion élèves-admin |
| `eleves` | Profils élèves |
| `fcm_tokens` | Tokens Firebase Cloud Messaging |
| `inscriptions_cours` | Inscriptions tango régulier |
| `inscriptions_essai` | Cours d'essai tango |
| `inscriptions_essai_yoga` | Cours d'essai yoga |
| `inscriptions_stages` | Inscriptions aux stages |
| `milonga_presences` | RSVPs milonga (espace élève) |
| `notifications` | Notifications admin (panel 🔔) — **créée 2026-05-24** |
| `notifications_eleve` | Notifications in-app élève (icône 🔔) |
| `parametres` | Clés/valeurs de configuration (tarifs, dates, GPS…) |
| `presences` | Pointage présences cartes 10 |
| `publications` | Articles/annonces (espace élève + admin) |
| `remises_banque` | Remises en banque (Trésorerie) |

**⚠️ Tables `discussion_messages` et `discussions`** : présentes en DB, mais non documentées dans les sections précédentes de ce CLAUDE.md. À documenter lors d'une prochaine session si leur structure change.

### Règles permanentes issues de cette session

1. **Avant tout code qui insère dans `notifications`** : vérifier que la table existe dans le Table Editor Supabase. Documenter dans CLAUDE.md dès la création.
2. **`_insertNotification(type, message, lien_tab)`** : seul point d'entrée autorisé pour les inserts admin dans `notifications` depuis worker.js. Jamais de REST direct avec SUPABASE_ANON.
3. **Détection "confirmer après annulation"** : la RPC `confirmer_annuler_essai` retourne `{supprime: true}` → le worker affiche une page informative orange au lieu de la page verte de confirmation.

## Session 2026-05-24 (suite 2) — Push notifications + sonnette 🔔 + câblage emails

### ✅ Push notifications élève (Web Push / VAPID) — opérationnel sur iPhone

Les push OS élève fonctionnent end-to-end sur iPhone PWA (confirmation utilisateur : status 201, notification reçue sur le téléphone).

**Architecture** : `sendWebPush()` dans `worker.js` gère P-256 ECDH key agreement + AES-GCM encryption — compatible Apple Push Service (APS) pour les iPhones et FCM/Web Push pour Android. Les tokens sont stockés dans la table `fcm_tokens` avec l'endpoint de chaque appareil.

**`sendFcmPush(env, tokens, notif)`** dans `worker.js` appelle `sendWebPush()` pour les tokens Apple Push Service (endpoint contient `apple.com`) et FCM pour les autres. Les deux chemins sont couverts.

**FIREBASE_SERVICE_ACCOUNT** : secret configuré dans Cloudflare Workers (Settings → Variables → Secret) le 2026-05-24. Requis pour les push FCM Android. Sans ce secret, les push Web Push (iPhone) fonctionnent quand même via `sendWebPush()`.

### ✅ Sonnette 🔔 admin — root cause et fix

**Symptôme** : le bouton 🔔 dans l'en-tête admin ne répondait pas au clic, alors que ⚙️ (Paramètres) fonctionnait correctement sur la même ligne.

**Root cause** : deux occurrences de `TEV.from('notifications')` dans `admin.html` — méthode inexistante sur l'objet TEV. Seul `TEV.client.from(...)` est valide. L'appel `TEV.from()` lançait une TypeError **synchrone** qui interrompait `switchTab()` avant que `renderTab()` soit appelé.

**Pourquoi ça ne plantait pas avant le 2026-05-24** : la table `notifications` n'existait pas encore → `adminData.notifications` était vide → condition `notifs.length` était `false` → la ligne problématique n'était jamais exécutée. Dès que la table a été créée (session 2026-05-24), des notifications ont été insérées → `notifs.length > 0` → TypeError au premier clic.

**Fix** (commit `749f6fe`) : deux remplacements dans `admin.html` :
- `switchTab()` ligne 5104 : `TEV.from('notifications')` → `TEV.client.from('notifications')`
- Handler `'tout-marquer-lu'` ligne 5994 : idem

**Règle** : `TEV.from(...)` n'existe pas. Toujours `TEV.client.from(...)`.

### Modifications inutiles pendant le debugging (à réverter si besoin)

Pendant l'investigation, deux changements avaient été appliqués à titre hypothétique et se sont révélés non nécessaires :

1. **`pointer-events:none` sur l'overlay** (`admin.html`) : le commit `cc1c25f` avait ajouté `pointer-events:none` sur `#overlay` et `pointer-events:auto` sur les éléments du header, au cas où l'overlay bloquerait les clics iOS. Dispruvé car ⚙️ Paramètres fonctionnait → l'overlay ne bloquait pas le header. Le changement CSS est inoffensif mais était inutile. **Pas réverté** — laisser en place car `pointer-events:none` sur l'overlay est une bonne pratique générale (évite les interférences futures).

2. **Aucun autre changement inutile** — les tests avec `notification` table vide avaient déjà orienté vers le bon diagnostic.

### ✅ Câblage emails et notifications (commit `3d102fe`)

**Email I0 (admin) — couple** : quand `isCouple`, les deux partenaires apparaissent désormais dans le bloc vert (bannière violette COUPLE au-dessus, ligne principale verte pour la personne, ligne vert foncé pour le partenaire avec ses données et son badge de rôle). L'ancienne petite ligne texte "Partenaire : ..." est supprimée.

**Email I01-att — liste d'attente** : le paragraphe de remerciements se termine maintenant par **"Vous êtes pour l'instant en liste d'attente."** en gras, pour que l'élève comprenne immédiatement son statut sans lire tout l'email.

**Email I01-val — acNote** : "Votre place sera réservée une fois l'inscription en ligne et le premier paiement effectués." passe de `font-size:12px;color:#888` à `font-size:14px;color:#555` — plus lisible.

**Notification panel 🔔 admin + push pour les nouvelles inscriptions tango** : `handleNotifyInscriptionCours` appelle maintenant `_insertNotification()` et `getFcmTokensAdmin()` après l'envoi de l'email admin. L'admin reçoit désormais une notification dans le panel ET un push OS dès que quelqu'un soumet le formulaire d'inscription aux cours.

**C-pay : email élève + notif in-app** : `confirmerCartePaiement()` dans `admin.html` appelle `/api/notify/carte-paiement` (JWT admin) après les updates DB. L'élève reçoit l'email C-pay et une notification in-app dès que l'admin valide son paiement.

**Cours particuliers : emails CP0+CP1 + notif panel 🔔** : `cours-particuliers.html` appelle `/api/notify/cours-particulier` juste après `TEV.reservationCP()`. L'admin reçoit l'email CP0 et la notification panel 🔔 ; l'élève reçoit l'email CP1 de confirmation.

### Règles permanentes — TEV.from() vs TEV.client.from()

`TEV.from(...)` **n'existe pas** sur l'objet TEV exporté depuis `tev-supabase.js`. La méthode correcte est toujours `TEV.client.from(...)`.

Un appel à `TEV.from(...)` :
- Lance une TypeError **synchrone** (pas une rejection de Promise)
- Interrompt immédiatement la fonction appelante, quel que soit le `try/catch` ou `.catch()` qui l'entoure
- Peut provoquer des symptômes trompeurs (bouton "inactif", action silencieusement ignorée) uniquement si la condition qui garde le code problématique était `false` auparavant

**Diagnostic** : si un bouton semble inactif sans erreur console visible, chercher les `TEV.from(` dans le code voisin avant de chercher des causes CSS/DOM.

## Session 2026-05-24 (suite 3) — Mise à jour previews + preview-sources

### Contexte

Règle appliquée : toute modification d'email dans `worker.js` doit être reportée dans les fichiers `preview-emails-*.html` (référence visuelle) ET dans les fichiers `preview-sources-*.html` (documentation des sources de données).

### Modifications apportées aux previews (session 2026-05-24 suite 2 → suite 3)

#### `preview-emails-inscription-v1.html`
- **I0-couple** : nouvelle variante de l'email admin I0 quand `isCoupleAdmin = c.venue === 'avec-part' && !!c.pPrenom`. Affiche : bandeau violet `#6a1b9a` "👫 COUPLE" → ligne principale fond vert `#2e7d32` (personne) → ligne partenaire fond vert foncé `#1b5e20`. Navigation ajoutée : "I0 Admin solo" + "I0 Admin couple".
- **I01-att** : paragraphe d'intro se termine maintenant par `<strong>Vous êtes pour l'instant en liste d'attente.</strong>` — ajouté pour que l'élève comprenne immédiatement son statut sans lire tout l'email.
- **acNote (6 occurrences)** : "Votre place sera réservée..." passe de `font-size:12px;color:#888;` à `font-size:14px;color:#555;` sur tous les emails du fichier (replace_all=true).

#### `preview-emails-yoga-v1.html`
- **Notifications admin** : label mis à jour pour refléter que `handleNotifyInscriptionEssaiYoga` appelle directement `_insertNotification()` + `getFcmTokensAdmin()` + `sendFcmPush()` — plus de mention "BroadcastChannel uniquement" obsolète.
- **Push OS admin** : label changé de "à implémenter" → "✅ opérationnel — Envoyé directement par `handleNotifyInscriptionEssaiYoga`".

#### `preview-emails-cartes-v1.html`
- **Push OS** (section introduction) : "à implémenter via FCM + Edge Function" → "✅ Opérationnel — Web Push/VAPID via `sendWebPush()` (iPhone PWA) + FCM Android · `FIREBASE_SERVICE_ACCOUNT` configuré dans Cloudflare Workers le 2026-05-24".
- **D-msg** : label mis à jour pour refléter le câblage push via `getFcmTokensForEmail()` dans `handleNotifyDiscussionMessage`.

### Modifications apportées aux preview-sources

#### `preview-sources-inscription.html`
- **I0** : section étendue — description de la variante couple (`isCoupleAdmin`, `pRoleAdmin`, fond `#6a1b9a` / `#2e7d32` / `#1b5e20`). Champs body ajoutés : `pPrenom?, pNom?, pRole?, venue?`.
- **I01-att** : ligne ajoutée — "Paragraphe intro se termine par '**Vous êtes pour l'instant en liste d'attente.**' en gras".
- **I02** : ligne ajoutée — "acNote : `font-size:14px;color:#555;` (était 12px/#888 — rendu plus lisible)".

#### `preview-sources-yoga.html`
- **Y0** : deux nouvelles lignes documentant les canaux ajoutés dans `handleNotifyInscriptionEssaiYoga` :
  - Notif panel 🔔 via `_insertNotification('essai_yoga', msg, 'yoga')` (RPC SECURITY DEFINER)
  - Push OS admin via `getFcmTokensAdmin()` + `sendFcmPush()` — messages pour "confirmé" et "liste d'attente"

#### `preview-sources-cartes.html`
- **D-msg** : nouvelle section ajoutée (avant la section "Structure carte-box") documentant :
  - Routes `POST /api/notify/discussion-nouvelle` et `POST /api/notify/discussion-message` (JWT admin)
  - Push OS élève via `getFcmTokensForEmail(email, svcKey)` + `sendFcmPush()`
  - Corps push : `💬 Nouvelle discussion : ${titre}` ou `💬 ${auteur} : ${extrait || titreLabel}`
  - Pas d'email Brevo pour D-msg — push + notif in-app uniquement

