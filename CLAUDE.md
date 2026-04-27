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
- **`inscriptions_cours`** : inscriptions tango (email, prenom, nom, ville, niveau, type, paiement, montant, statut, saison)
  - `ville` : `'paris'` ou `'vincennes'`
  - `niveau` : `'debutant'` ou `'intermediaire'`
  - `type` : `'carte10'` ou `'forfait'`
  - `paiement` : `'cb1x'`, `'cb3x'`, `'especes'`, `'cheque'`, `'virement1x'`, `'virement3x'`
  - `statut` : `'inscrit'`, `'supprimé'`, `'valide'`, `'attente'`
  - ⚠️ Pas de colonne `cours` — elle est calculée côté JS depuis ville+niveau
- **`cours_yoga`** : inscriptions yoga (email, prenom, nom, cours, paiement, montant, statut, saison)
  - `cours` : `'hatha'`, `'yin'`, `'forfait'` (forfait = hatha + yin)
  - RLS activé avec policies `allow_select/insert/update/delete` (USING true)
- **`inscriptions_stages`** : inscriptions aux stages
- **`inscriptions_essai`** : cours d'essai tango et yoga
- **`presences`** : pointage des présences
- **`cours_particuliers`** : cours particuliers
- **`publications`** : publications/annonces
- **`agenda_modifs`** : modifications d'agenda
- **`devis`** : demandes de devis (via formulaire Wix à venir) — colonnes : id, created_at, prenom, nom, email, tel, type_event, date_event, nb_personnes, lieu, message, statut ('nouveau'/'traite'/'refuse')
- **`notifications`** : historique des notifications admin — colonnes : id, created_at, type, message, lu (bool), lien_tab — à créer quand push implémenté

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
- **Cache JS** : `<script src="js/tev-supabase.js?v=2">` — incrémenter v= si le cache pose problème

## Données saison 2025-2026
- **153 élèves tango** importés via `supabase/import_eleves_2025_2026.sql`
- **21 élèves yoga** importés via `supabase/import_cours_yoga.sql`
- **Paiements** mis à jour via `supabase/update_paiements.sql`
- Florence CASTAGNOS : inscrite paris/debutant ET paris/intermediaire
- Vlad VASILIU : inscrit paris/intermediaire ET vincennes/intermediaire
- Myriam BLOCH : yoga forfait (hatha + yin), 505€
- Couples avec email partagé : BUTASH/NACAK, FIGUEREDO/GOSSELIN, GODEFROY/SABRIER, SCHALCHLI×2, VORMS×2, KARADJOV/KARADJOVA

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
- [ ] Rubrique Devis : ajouter génération de devis PDF — champs à remplir dans l'appli → PDF téléchargeable/envoyable par email. Attendre que l'utilisateur fournisse : logo, données fixes (coordonnées, mentions), structure du devis

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
- QUOTA_GUI = 22 guideurs par date
- QUOTA_GDE = 23 guidées par date
- Limites actives **seulement en septembre, octobre, novembre** (mois 9, 10, 11)
- Badge "Complet" si quota atteint ; cours non sélectionnable si les deux quotas sont atteints

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
- Durée de validité : 6 mois à compter du **premier cours utilisé** (pas de la date d'achat)
- Le calcul d'expiration se fait côté JS à partir des pointages

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
- **Devis** : formulaire Wix à venir → admin reçoit la fiche, répond par email/téléphone
- **Ajout dans Élèves Tango/Yoga toujours manuel et intentionnel** : un élève n'est inscrit que s'il a payé sur AssoConnect. L'appli n'a pas accès à AssoConnect — c'est l'admin qui vérifie le paiement puis ajoute l'élève manuellement. Ne pas automatiser.
- **Turnstile manquant** : à ajouter sur le futur formulaire de devis

## Saisie des données — règle importante
À partir de la saison 2026-2027, **toutes les données entrent exclusivement par** :
1. **Formulaires publics** sur www.tangoetvous.com (essai tango, demande d'inscription tango, stages, essai yoga)
2. **Formulaires dans l'appli admin** (boutons "Inscrire" dans Élèves Tango, Inscriptions Tango, Stages, Yoga, etc.)
3. **Section Paramètres** de l'appli admin

Les imports SQL en masse (comme pour 2025-2026) ne doivent plus être nécessaires.
Claude ne saisit des données directement en SQL qu'exceptionnellement, sur demande explicite.
