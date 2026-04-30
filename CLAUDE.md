# Tango & Vous — Contexte projet pour Claude Code

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
- **`eleves`** : profils élèves (nom, prenom, email, tel, role, statut_eleve, notes, saison...)
- **`inscriptions_cours`** : inscriptions tango (email, prenom, nom, tel, role, ville, niveau, cours, type, paiement, montant, statut, partenaire, email_partenaire, saison, donnees)
  - `ville` : `'paris'` ou `'vincennes'`
  - `niveau` : `'debutant'` ou `'intermediaire'`
  - `role` : `'guideur'`, `'guidee'`, `'double'`
  - `type` : `'carte10'` ou `'forfait'`
  - `paiement` : `'cb1x'`, `'cb3x'`, `'especes'`, `'cheque'`, `'virement1x'`, `'virement3x'`
  - `statut` : `'inscrit'`, `'supprimé'`, `'valide'`, `'attente'`, `'demande'`
  - `cours` : format `'paris—debutant'` (stockée en DB, calculée depuis ville+niveau lors de l'insert)
  - ⚠️ Dans `tev-supabase.js`, `role` est prioritairement lu depuis `inscriptions_cours`, avec fallback sur `eleves.role`
- **`cours_yoga`** : inscriptions yoga (email, prenom, nom, cours, paiement, montant, statut, saison)
  - `cours` : `'hatha'`, `'yin'`, `'forfait'` (forfait = hatha + yin)
  - RLS activé avec policies `allow_select/insert/update/delete` (USING true)
- **`inscriptions_stages`** : inscriptions aux stages
- **`inscriptions_essai`** : cours d'essai tango et yoga
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
- **`admin.html`** : interface admin complète (~8000 lignes)
  - `IS_DEMO` : mode démo vs réel
  - `adminData` : état global de l'appli
  - `chargerDonnees()` : recharge depuis Supabase et merge dans adminData
  - `PAI_LBL` : `{cb1x:'CB 1×', cb3x:'CB 3×', especes:'Espèces', cheque:'Chèque', virement1x:'Virement 1×', virement3x:'Virement 3×'}`

## Décisions techniques importantes
- **`cours` non stockée** dans `inscriptions_cours` — calculée depuis ville+niveau dans `tev-supabase.js`
- **Suppression tango** = `UPDATE inscriptions_cours SET statut='supprimé'` (pas DELETE)
- **Suppression yoga** = `DELETE FROM cours_yoga` (suppression réelle)
- **Comparaison d'IDs yoga** : utiliser `String(x.id)===String(id)` car Supabase retourne des bigint (nombres) mais les onclick passent des strings
- **iOS Safari — boutons cliquables** : les `<button>` avec délégation de click ne fonctionnent pas de manière fiable dans certains contextes DOM sur iOS Safari. Toujours utiliser `<a href="javascript:void(0)" onclick="...">` pour les actions inline dans du HTML généré dynamiquement.
- **Absences élèves réguliers** (table `absences_jour`) : persistance double — localStorage immédiat + sync Supabase en arrière-plan. Dans `chargerDonnees()` (admin) et au chargement de l'espace élève, merger les entrées localStorage avec les données DB pour survivre aux rechargements automatiques même si le sync DB échoue.
- **`adminData.absencesJour`** : chargé dans `tevGetAdminData()` depuis `absences_jour`, mergé avec localStorage `tev_absences_jour` dans `chargerDonnees()`. Utilisé dans le Pointage de l'onglet Essai Tango.
- **`eleveData.absencesJour`** : chargé au login élève depuis localStorage `tev_abs_<email>`, puis sync DB en arrière-plan. Affiché dans `renderAccueil()` sur la carte "PROCHAIN COURS".

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
- [ ] **Tester déclaration d'absence depuis espace élève** : bouton 🚫 Absent sur la carte "PROCHAIN COURS" → vérifier que l'absence apparaît bien dans admin → Essai Tango → Pointage sur la bonne date et le bon cours
- [ ] Vérifier correction Sandrine Billot (hatha uniquement) / Myriam Bloch (hatha+yin) dans Supabase — SQL généré mais pas confirmé exécuté
- [ ] Tester suppression élève tango → persiste après refresh
- [ ] Tester modification cours/paiement/montant → persiste après refresh
- [ ] Installer l'appli sur Mac (PWA déjà prête) : ouvrir admin dans Chrome → icône ⊕ dans la barre d'adresse → Installer
- [ ] Vérifier formulaires publics (inscription cours, stages, essai) connectés à Supabase
- [ ] Implémenter emails automatiques via Brevo + Supabase Edge Functions (remplace Code.gs/MailApp qui est inactif)
- [ ] Implémenter notifications push via FCM + Supabase Edge Functions — IMPORTANT : inclure nettoyage automatique des tokens invalides (FCM retourne les échecs dans la réponse → DELETE FROM fcm_tokens WHERE token IN (échecs))
- [ ] Étendre icône 🔔 (badge rouge) + push aux événements suivants : essai tango, essai yoga, demande d'inscription tango, inscription stage, cours particuliers, demande de devis, RSVP milonga depuis espace élève — d'autres cas à lister par l'utilisateur
- [ ] Revoir le formulaire cours particuliers
- [ ] Rappels emails automatiques pour paiements CB en plusieurs fois (cb3x) — relances aux échéances
- [x] Rubrique Devis : formulaire public + générateur PDF + admin complet — TERMINÉ (voir section Devis)
- [ ] Devis : envoyer le PDF par email directement depuis l'appli (actuellement via Gmail ouvert manuellement)
- [ ] Devis : ajouter Turnstile sur demande-devis.html quand intégré en iframe Wix

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
- **Cloudflare Turnstile** : déjà intégré sur tous les formulaires publics (inscription-cours, cours-essai, essai-yoga, stages-pwa, cours-particuliers) — sitekey `0x4AAAAAADCDhidbX3fOzZl5`. À ajouter sur le futur formulaire de devis (Wix).

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

## Règles métier — formulaires publics

### `cours-essai.html` — Cours d'essai Tango

**Statut à l'inscription (table `inscriptions_essai`) :**
- Inscription **en couple** (avecPart='Oui') → `statut='confirme'`
- Inscription **guideur seul** → `statut='confirme'` sauf si quota guideurs atteint (QUOTA_GUI=22) **en sept/oct/nov** → `statut='attente'`
- Inscription **guidée seule** → toujours `statut='attente'` (admin valide manuellement)
- Inscription **double rôle** → même règle que guideur (confirme sauf quota dépassé en sept/oct/nov)

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

**Statut à l'inscription (table `inscriptions_cours`) :**
- **Guidée seule dans TOUS ses cours** → `statut='attente'` → écran "liste d'attente" → admin valide manuellement
- **Guideur, couple, ou double rôle** → `statut='demande'` → redirigé vers AssoConnect pour paiement

**Rôles automatiques :**
- Si l'utilisateur choisit "Avec partenaire", le rôle du partenaire est automatiquement l'inverse (guideur↔guidée)
- `getRoleAuto(r)` : `'guideur'→'guidee'`, `'guidee'→'guideur'`, `'double'→'double'`

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

### Cartes 10 cours (tango)
- Une carte 10 cours = type `'carte10'` dans `inscriptions_cours`
- Durée de validité : **3 mois** à compter du **premier cours utilisé** (pas de la date d'achat)
- **Bonus** : pour chaque semaine sans cours (vacances, jours fériés) qui tombe dans les 3 mois, la date d'expiration est repoussée d'une semaine
- Les semaines sans cours sont dans `SANS_COURS_PARIS` et `SANS_COURS_VINCENNES` dans `admin.html` — à mettre à jour chaque saison
- Formule : `expiration = datePremierCours + 3 mois + (nb semaines sans cours dans cette période × 7 jours)`
- Calcul : `calcExpiration(datePremierCours, ville)` dans `admin.html`
- La carte est valable Paris ET Vincennes

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
- **Turnstile manquant** : à ajouter sur le futur formulaire de devis

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
| **Auto-renouvelée** | Débordement sur 11ᵉ cours (carte épuisée au pointage) | Élève | "Nouvelle carte ouverte" + lien AssoConnect renouvellement |
| **E10** | Admin renouvelle manuellement | Élève | "Carte renouvelée, à bientôt !" |
| **Fin saison J+1** | Déclencheur : lendemain dernier cours Paris juin | Élèves avec cours restants | "Il vous reste N cours — pré-inscrivez-vous avant le 25 août" |
| **Fin saison 25 août** | Déclencheur quotidien le 25 août | Élèves avec cours restants non ré-inscrits | "Dernier rappel : vos cours expirent" |

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
