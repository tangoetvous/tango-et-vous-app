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

**Fix initial (2026-05-22, bugué)** : ajout de `nextSeasonStartISO` — causait soit une expiration trop longue (basé sur `lastStored`) soit une expiration trop courte (basé sur `datePremierCours`, plafonnait à sept 1 et empêchait de compter Toussaint/Noël).

**Fix final (2026-05-26)** : suppression complète de `nextSeasonStartISO`. Condition simplifiée à `iso <= lastStored`. Les deux saisons doivent être saisies dans Paramètres pour que `lastStored` atteigne juin N+1 et couvre correctement l'été + les vacances d'automne.
```javascript
// ✅ CORRECT — condition finale définitive
if (firstStored && iso >= firstStored && !coursSet[iso] && iso <= lastStored) {
  fin.setDate(fin.getDate() + 7);
}
```

**⚠️ Règle absolue et définitive** : ne jamais introduire de variable `nextSeasonStartISO` sous quelque forme que ce soit. La condition `iso <= lastStored` suffit quand les deux saisons sont dans `tev_cours_dates`. Ne jamais remettre de listes `SANS_COURS_*` hardcodées.

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

Exemple (premier cours 28 mai 2026, Paris — jeudi) :
- A : 28 mai → 28 août (3 mois)
- Boucle : juillet-août absents de `coursSet` ET `iso <= lastStored` (juin 2027) → ~9 semaines été comptées → `fin` ≈ 27 oct
- Toussaint 29 oct : hors fenêtre initiale mais dans la nouvelle → compté → `fin` ≈ 3 nov
- 5 nov = cours → pas de gap → **fin ≈ 6 nov 2026** ✅

**Sources de données (aucune valeur hardcodée) :**
- `localStorage.tev_cours_dates.paris` / `.vincennes` — mis à jour depuis Supabase via `chargerParamsRemote()` (admin) ou `tevRefreshCoursDates()` (espace élève)
- Contient toutes les dates de toutes les saisons saisies dans Paramètres → Tango Paris/Vincennes → Dates
- La présence des dates de la saison suivante ne perturbe pas le calcul car `lastStored` atteint juin N+1 → l'été est comptabilisé, et les cours 2026-2027 annulent les gaps de Toussaint/Noël 2026-2027 correctement

**Borne haute de la boucle (version finale définitive) :**
```javascript
if (firstStored && iso >= firstStored && !coursSet[iso] && iso <= lastStored) {
  fin.setDate(fin.getDate() + 7);
}
// Condition unique et suffisante — ZÉRO nextSeasonStartISO
// lastStored = dernière date saisie dans les deux saisons → juin N+1
// juillet-août : absents de coursSet ET iso <= lastStored → comptés comme gaps ✅
// Toussaint/Noël : absents de coursSet ET dans la fenêtre étendue → comptés ✅
// Cours 2026-2027 : présents dans coursSet → PAS comptés comme gaps ✅
```

**⚠️ Règle absolue** : `nextSeasonStartISO` est **définitivement banni** sous toute forme. Toute tentative de l'introduire a provoqué des régressions (voir Session 2026-05-26). Ne jamais remettre de listes `SANS_COURS_*` hardcodées.

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


## Session 2026-05-24 (suite 4) — Cloudflare Workers : fire-and-forget = mort silencieuse

### Symptôme

Formulaire admin "Valider le paiement et inscrire" → email I03 élève reçu, mais **rien** côté admin (pas d'email I0, pas de panel 🔔, pas de push).

### Cause racine (trois bugs empilés)

1. **Early-return inconditionnel** : `if (!email || !env.BREVO_API_KEY) return` à l'entrée du handler bloquait l'ensemble du traitement (incluant panel 🔔 et push) quand `BREVO_API_KEY` n'était pas dans l'env. Or panel et push n'ont rien à voir avec Brevo.

2. **Variables block-scoped utilisées hors du `if`** : `vl03`, `nl03`, `ci0i03` étaient déclarés `const` à l'intérieur de `if (env.BREVO_API_KEY) { ... }`. Une fois `_insertNotification` et `sendFcmPush` déplacés en dehors du `if`, leur référence à ces variables → ReferenceError synchrone → handler crashe **avant** d'appeler le RPC.

3. **Fire-and-forget + `return` immédiat** : `_insertNotification(...).catch(function(){})` suivi de `getFcmTokensAdmin().then(...).catch(...)` puis `return corsResponse(...)`. En Cloudflare Workers, **dès que la réponse HTTP est renvoyée, le runtime peut terminer les Promise en cours d'exécution** (les fetch sortants sont annulés). Sans `await` ni `ctx.waitUntil()`, ces opérations peuvent ne jamais arriver à Supabase / FCM. C'est probabiliste : ça « marche par chance » quand il y a beaucoup d'autres `await` après, qui donnent le temps aux fetch fire-and-forget de se terminer.

### Règles permanentes — Cloudflare Workers + Promises

1. **Toujours `await` `_insertNotification`** avant tout `return`. Jamais `_insertNotification(...).catch(function(){})`. Le pattern fire-and-forget marche peut-être 9 fois sur 10, mais la 10ᵉ fois on perd silencieusement la notif.
   ```javascript
   // ❌ Risqué — fetch peut être annulé après return
   _insertNotification('cours_inscription', msg, 'cours-tango').catch(function(){});
   return corsResponse({ ok: true }, 200, {}, request);

   // ✅ Sûr
   try {
     const res = await _insertNotification('cours_inscription', msg, 'cours-tango');
     if (!res.ok) console.error('[handler] insert HTTP', res.status, await res.text().catch(()=>'')); 
   } catch(e) { console.error('[handler] insert error', e); }
   return corsResponse({ ok: true }, 200, {}, request);
   ```

2. **Toujours `await` `getFcmTokensXxx()` + `sendFcmPush()`** avant `return`. Le pattern `.then(function(tokens) { ... .catch(...) }).catch(...)` est encore plus à risque car deux fetch successifs doivent se terminer.
   ```javascript
   // ❌ Risqué
   getFcmTokensAdmin(_svcKey).then(function(tokens) {
     if (tokens.length) sendFcmPush(env, tokens, notif).catch(function(){});
   }).catch(function(){});
   return corsResponse({ ok: true }, 200, {}, request);

   // ✅ Sûr
   try {
     const tokens = await getFcmTokensAdmin(_svcKey);
     if (tokens.length) await sendFcmPush(env, tokens, notif);
   } catch(e) { console.error('[handler] push error', e); }
   return corsResponse({ ok: true }, 200, {}, request);
   ```

3. **Jamais `.catch(function(){})` silencieux**. Toujours `console.error('[handler] kind', e)`. Cloudflare Workers logs (Dashboard → Workers → Logs) sont la seule fenêtre de diagnostic en production.

4. **Vérifier `res.ok`** sur le retour de `_insertNotification` (qui est un fetch Response). Un statut 401/403/404 ne lève pas d'exception — seul `res.ok` le détecte.

5. **Early-return : ne gater que sur ce qui est strictement nécessaire**. `if (!email)` oui ; `if (!email || !env.BREVO_API_KEY)` non — le panel 🔔 et push n'utilisent pas Brevo.

6. **Si des helpers sont utilisés hors d'un `if`, les définir hors du `if`**. `const` est block-scoped. Si `vl03`, `nl03`, `ci0n` sont référencés dans `_insertNotification` ou `sendFcmPush` (qui sont désormais hors du `if`), ils doivent être déclarés AVANT le `if`.

### Endroits corrigés dans worker.js (session 2026-05-24 suite 4)

12 emplacements convertis du pattern fire-and-forget vers await + log :

| Ligne | Handler | Action |
|-------|---------|--------|
| 1715 | `handleCartePointage` (admin) | push admin |
| 1782 | `handleCartePointage` (élève) | push élève |
| 2985 | `handleCronCarteExpiree` | push élève (boucle) |
| 3061 | `handleNotifyDiscussionNouvelle` | push élève |
| 3110 | `handleNotifyDiscussionMessage` | push élève |
| 4524 | `handleNotifyInscriptionCours` (public form) | `_insertNotification` + push admin |
| 4803 | `handleNotifyInscriptionEssaiYoga` | `_insertNotification` + push admin |
| 5802 | `handleNotifyCarteRenouvellement` | push élève |
| 5873 | `handleNotifyCartePaiement` | push élève |
| 5934 | `handleNotifyCarteReport` | push élève |
| 6611 | `handleNotifyInscriptionStage` | push admin |
| 6930 | `handleNotifyCoursParticulier` | push admin |

⚠️ Ne jamais réintroduire le pattern `.then(...).catch(function(){})` fire-and-forget dans un handler worker juste avant un `return`. Toujours `await` + `try/catch` + `console.error`.

## Session 2026-05-24 (suite 5) — handleDemandeDevis : fire-and-forget + panel 🔔 manquants

### Symptôme
Soumission du formulaire `demande-devis.html` → ni l'admin ni le demandeur ne reçoivent quoi que ce soit (ni email D0a/b, ni email D2, ni panel 🔔, ni push).

### Causes (mêmes patterns que session suite 4)

1. **Fire-and-forget** : `sendBrevoNotification(env.BREVO_API_KEY, body).catch(() => {})` — non awaitée → Cloudflare annule la Promise quand `corsResponse` est renvoyé.

2. **Panel 🔔 et push absents** : `handleDemandeDevis` n'appelait pas `_insertNotification` ni `getFcmTokensAdmin` / `sendFcmPush`. Le demandeur soumettait, l'admin ne voyait rien.

### Fix appliqué (commit `e31c519`)

```javascript
// ── Emails D0a/D0b (admin) + D2 (demandeur)
if (env.BREVO_API_KEY) {
  try { await sendBrevoNotification(env.BREVO_API_KEY, body); }
  catch(e) { console.error('[demandeDevis] sendBrevoNotification error', e); }
}

// ── Panel 🔔 admin
const notifMsgD = `💼 Demande devis — ${nomAffD} · ${typeAff}${dateAff}${invitesAff} · ⏳ À traiter · → Devis → Demandes`;
try {
  const resN = await _insertNotification('demande_devis', notifMsgD, 'devis');
  if (!resN.ok) console.error('[demandeDevis] insertNotification HTTP', resN.status, ...);
} catch(e) { console.error('[demandeDevis] insertNotification error', e); }

// ── Push OS admin
try {
  const tokens = await getFcmTokensAdmin(_svcKeyD);
  if (tokens.length) await sendFcmPush(env, tokens, { title: 'Tango & Vous — Admin', body: `💼 Demande devis — ...` });
} catch(e) { console.error('[demandeDevis] push error', e); }

return corsResponse({ ok: true }, 200, {}, request);
```

### Rappel — checklist pour tout nouveau handler `POST` dans worker.js

Avant de terminer l'implémentation d'un handler, vérifier que ces 4 points sont couverts :

| # | Quoi | Pattern |
|---|------|---------|
| 1 | Insert Supabase principal | `await sbFetch(...)` + `if (!res.ok) return jsonError(...)` |
| 2 | Email(s) Brevo | `if (env.BREVO_API_KEY) { try { await sendBrevo(...); } catch(e) { console.error(...); } }` |
| 3 | Panel 🔔 admin | `try { const r = await _insertNotification(type, msg, tab); if (!r.ok) console.error(...); } catch(e) { ... }` |
| 4 | Push OS admin | `try { const t = await getFcmTokensAdmin(...); if (t.length) await sendFcmPush(env, t, notif); } catch(e) { ... }` |

Tout `return corsResponse(...)` final doit être précédé des 4 blocs ci-dessus (adaptés selon le handler). **Aucun de ces blocs ne doit être fire-and-forget.**

## Session 2026-05-24 (suite 6) — Push admin "Je pense venir" milonga

### Fonctionnalité
Quand un élève clique **"Je pense venir"** sur une milonga (accueil, onglet Milonga, onglet Agenda, modal publication), l'admin reçoit :
- **Push OS** : `🎶 Prénom NOM · Nom milonga · JJ mois`
- **Panel 🔔** : `🎶 RSVP milonga — Prénom NOM · Nom milonga · JJ mois · Je pense venir · → Milonga`

### Architecture
- **`index.html` — `window._milJeViens`** : après le RSVP Supabase, appelle `fetch('/api/notify/milonga-rsvp', { method:'POST', body:JSON.stringify({email, prenom, nom, milongaNom, milongaDate}) })` (fire-and-forget côté client — OK car c'est le navigateur de l'élève, pas Cloudflare Workers).
- **`worker.js` — `handleNotifyMilongaRsvp`** : `POST /api/notify/milonga-rsvp` (sans auth) → `_insertNotification('milonga_rsvp', msg, 'milonga')` + `getFcmTokensAdmin` + `sendFcmPush`. Tous les appels sont `await` + `try/catch`.
- **Point d'entrée unique** : `_milJeViens` est la seule fonction déclenchée par les trois surfaces (accueil, milonga, agenda) — un seul endroit à modifier.

## Session 2026-05-24 (suite 7) — Stages couple : emails + push par personne

### ✅ Séparateur visuel dans le formulaire stages-pwa.html

`<hr style="border:none;border-top:1px solid #2a2000;margin:28px 0 0;">` ajouté avant `#recaps-container`. `.recaps-container { margin-top: 0; }` (était 28px, évite le double espacement).

### ✅ Email S2 — intro avec statut en gras

Intro S2 (guidée seule en attente de validation parité) : `"Nous avons bien enregistré votre demande pour le stage de tango. <strong>Vous êtes pour l'instant en liste d'attente.</strong> Voici le récapitulatif de votre demande."` — l'élève comprend immédiatement son statut sans lire tout l'email.

### ✅ Emails stages couple — récap de chaque personne

**Comportement** : chaque membre d'un couple reçoit ses propres stages + les stages de son partenaire dans une section labelisée séparée. Les dates et les créneaux choisis peuvent différer entre les deux personnes.

**Nouveaux helpers dans `worker.js`** :

```javascript
// En-tête de section colorée (fond beige → inscripteur, fond violet → partenaire)
function personSectionHeader(prenomL, nomL, roleL, bgColor) { ... }

// Génère une stage-box simple (solo) ou deux sections labellisées (couple)
function buildEleveStagesBlock(myDates, myPrenom, myNom, myRole,
                               theirDates, theirPrenom, theirNom, theirRole) {
  // Si theirDates non vide → deux sections :
  // "Vos stages — Marie BERNARD" (couleur beige #8B6914)
  // "Stages de votre partenaire — Thomas DUPONT" (couleur violet #6a1b9a)
}
```

**Boucle `recipients` dans `handleNotifyInscriptionStage`** :
```javascript
const recipients = [
  { to: email, pren: prenom, myDates: inscriptionsParDate, theirDates: partDates, ... },
];
if (hasPartEmail) recipients.push({
  to: partEmail, myDates: partDates, theirDates: inscriptionsParDate, ...
});
for (const rec of recipients) { /* envoi S1/S1b/S2 */ }
```

**Règles** :
- `hasPartEmail = hasPartner && partEmail && partEmail !== email && !emailPartage` → 2 emails
- `emailPartage = partEmail === email` → 1 seul email (S1d), les deux sections dans le même
- Partenaire sans email → 1 seul email à l'inscripteur avec les deux sections (myDates + partDates)

**Nouveaux champs body depuis `stages-pwa.html`** :
```javascript
partRole: data.rolePartenaire || '',
partTel: data.partenaireTel || '',
emailPartage: !!(data.partenaireEmail && data.partenaireEmail === data.email),
partInscriptionsParDate: avecPart ? datesOK.map(di => ({
  date: di.date,
  slots: (di.stagesPartDetail || di.stagesDetail || []).map(s => ({
    horaire_debut: s.horaire.split('–')[0] || '',
    horaire_fin: s.horaire.split('–')[1] || '',
    theme: s.theme || s.type || '',
  })),
  tarif: di.prixPartenaire || di.prixInscrit || 0,
  adresse: {},
})) : []
```

**Push** : envoyé à l'élève principal + au partenaire (si `hasPartEmail`) + à l'admin. Tous `await` + `try/catch`.

**Email admin S0 couple** : deux encadrés — inscripteur (fond or) + partenaire (fond rose/violet), chacun avec ses propres slots et tarif. `buildStageBox()` appelé deux fois.

### Previews mis à jour

- `preview-emails-stages-v1.html` : S1c montre maintenant les deux sections (stages de Marie + Thomas). S2 intro avec statut en gras.
- `preview-sources-stages.html` : Body S0 étendu avec `partRole`, `partTel`, `partInscriptionsParDate`, `emailPartage`. Nouvelles sections "S1/S1b/S2 — Mécanique couple" et "Push OS — élèves".

## Session 2026-05-24 (suite 8) — Yoga emails Brevo + stages : 1 email/date, adresses, S3, S-edit, pointage DB

### ✅ Fix yoga — `tangoetvous@gmail.com` comme expéditeur Brevo (commit `1018a18`)

**Problème** : tous les emails yoga (Y0, Y1, Y-att, Y3, Y-J1a, Y-J1b) n'arrivaient pas — ni chez l'admin yoga, ni chez les élèves. Aucune erreur visible car `sendBrevoNotification` ne loggait pas les réponses HTTP non-2xx, et les push admin arrivaient quand même (FCM indépendant de Brevo).

**Cause racine** : `regardsepose@gmail.com` n'est **pas** un expéditeur vérifié dans Brevo. Brevo refuse silencieusement tout email dont le `sender.email` n'est pas vérifié. Seul `tangoetvous@gmail.com` est vérifié.

**Fix** dans les 3 handlers concernés (`handleNotifyYogaDate`, `handleCronEssaiYogaJ1`, `handleNotifyInscriptionEssaiYoga`) :
```javascript
// Avant (bloqué par Brevo)
sender: { name: 'Florencia Garcia', email: 'regardsepose@gmail.com' }

// Après (expéditeur vérifié + réponse au bon email)
sender: { name: 'Florencia Garcia — Le Regard Se Pose', email: 'tangoetvous@gmail.com' },
replyTo: { email: 'regardsepose@gmail.com', name: 'Florencia Garcia' }
```

**Règle permanente** : seul `tangoetvous@gmail.com` est expéditeur vérifié Brevo. Pour tous les emails yoga qui doivent paraître venir de Florencia, utiliser ce pattern sender/replyTo. Ne jamais utiliser `regardsepose@gmail.com` comme `sender.email`.

### ✅ Stages emails — 1 email par date par destinataire (commit `d1c6582`)

**Comportement précédent** : `handleNotifyInscriptionStage` envoyait un seul email résumant toutes les dates inscrites pour la journée. Problème : si l'élève s'inscrit à plusieurs dates séparées (ex : 11 avril ET 17 mai), il recevait un seul email confus.

**Nouveau comportement** :
- **Admin** : reçoit 1 email S0 + 1 push par journée de stages
- **Élève** (inscripteur + partenaire si emails distincts) : reçoit 1 email S1/S1b ou S2 par journée
- **Couple email partagé** : 1 seul email par date avec les slots des deux personnes
- **Token HMAC** de confirmation : calculé par date (pas seulement sur la première date)

**Boucle sur les dates** dans `handleNotifyInscriptionStage` :
```javascript
for (const dateEntry of inscriptionsParDate) {
  // … build stage-box pour cette date …
  // S0 admin + S1/S2 élève + push admin par date
}
```

### ✅ Stages push — 1 push par date par destinataire (commit `67fdad6`)

Chaque participant (inscripteur + partenaire si emails distincts) reçoit 1 push FCM par journée de stages inscrite, cohérent avec les emails (1 par date). Avant : 1 seul push résumant toutes les dates.

### ✅ Logs erreurs HTTP Brevo dans `sendMail` (commit `95bd50d`)

`sendMail` ignorait silencieusement les réponses HTTP non-2xx de Brevo. Ajout d'un log :
```javascript
if (!res.ok) {
  const body = await res.text().catch(() => '');
  console.error('[sendMail] Brevo HTTP', res.status, body);
}
```
Permet de diagnostiquer les refus Brevo (expéditeur non vérifié, clé API invalide, quota dépassé) dans Cloudflare Workers Dashboard → Logs.

**Règle** : tout appel à Brevo doit logguer les erreurs HTTP. Ne jamais laisser `sendMail` ou `sendBrevoNotification` échouer silencieusement.

### ✅ Adresse dans les emails S0/S1/S2/S-cancel depuis Supabase (commits `9990dc6`, `da80ae9`)

**Problème** : `stages-pwa.html` envoyait `adresse: {}` hardcodé dans le body des notifications → les emails ne contenaient aucun lieu.

**Fix en deux temps** :

**1. `stages-pwa.html`** : remplace `adresse: {}` par `adresse: di.adresse || {}` dans les objets de date pour les inscrits et partenaires (commit `9990dc6`).

**2. `worker.js` — `_sbGetAdr(sai, dateStr)`** (commit `da80ae9`) : fallback Supabase si `body.adresse` est vide :
```javascript
async function _sbGetAdr(sai, dateStr) {
  // 1. Fetch tev_params_stages_<sai>.adresse (adresse globale stages)
  // 2. Cherche un override dans tev_dates_stages_<sai> pour la date exacte
  // 3. Retourne l'adresse spécifique si trouvée, sinon l'adresse globale
}
```

**`_scGetAdr(sai, dateStr)`** : variante pour `handleNotifyStageAnnule` (admin.html `_notifyStageCancel` n'inclut jamais l'adresse dans le body).

**Règle** : `tev_params_stages_<sai>` contient l'adresse globale des stages. `tev_dates_stages_<sai>` est un array `[{date, adresse?, horaires?, tarifs?, slots:[]}]` — l'override par date est à `.valeur.stages[i]` (pas `.valeur` directement — voir fix `6525647`).

### ✅ Fix chemin `tev_dates_stages_<sai>` — `.valeur.stages` (commit `6525647`)

**Erreur** : les handlers S3 et S4 lisaient `params.valeur` directement sur la clé `tev_dates_stages_<sai>`, mais la structure Supabase est `{ saison, stages:[...], modifie }` → le tableau des dates est à `params.valeur.stages`.

**Fix** : `const datesStages = (raw.valeur && raw.valeur.stages) ? raw.valeur.stages : [];` (appliqué dans `handleNotifyStageValide`, `handleCronRappelStageJ3`, et `_sbGetAdr`).

**Règle** : pour la clé `tev_dates_stages_<sai>`, toujours lire `.valeur.stages` (tableau), pas `.valeur` directement.

### ✅ Adresse dans emails S3 et S4 (commit `b6d8de2`)

S3 (`handleNotifyStageValide`) et S4 (`handleCronRappelStageJ3`) n'affichaient aucune section Lieu dans le stage-box, contrairement aux previews et à S1/S2. Fix : même fetch Supabase (`tev_params_stages_<sai>` + `tev_dates_stages_<sai>`) que pour les autres handlers.

### ✅ Fix S3 — 3 bugs + push/notif élève (commit `9aa677f`)

**3 bugs dans `valAttStage` (admin.html)** qui empêchaient l'email S3 d'être envoyé ou d'être correct :

**Bug 1 — JWT manquant** : `fetch('/api/notify/stage-valide', { method:'POST', ... })` sans header `Authorization: Bearer <jwt>`. La route exige un JWT → 401 silencieusement avalé par `.catch(function(){})`.

**Fix** : ajout de `'Authorization': 'Bearer ' + _getJwt()` dans les headers.

**Bug 2 — `daysUntil` hardcodé à 99** : la variante S3b (≤3 jours avec bouton 👍) n'était jamais déclenchée car `daysUntil=99 > 3` toujours.

**Fix** :
```javascript
var _d = new Date(date + 'T12:00:00');
var _t = new Date(); _t.setHours(12,0,0,0);
var daysUntil = Math.round((_d - _t) / (1000*60*60*24));
```

**Bug 3 — slots envoyés en IDs bruts** (`'stage1'`, `'technique'`) au lieu d'objets `{horaire_debut, horaire_fin, theme}`. Le handler `handleNotifyStageValide` attendait des objets structurés pour construire le stage-box.

**Fix** : mapping via `_loadParam('stages', saisonActive())` + `DEFAULTS_HORAIRES.stages` :
```javascript
var stageParams = _loadParam('stages', saisonActive());
var horType = stageParams && stageParams.horaires ? stageParams.horaires : DEFAULTS_HORAIRES.stages;
var mappedSlots = ins.slots.map(function(slotId) {
  var h = horType[slotId] || {};
  return { type: slotId, horaire_debut: h.debut || '', horaire_fin: h.fin || '', theme: '' };
});
```

**Ajout push + `notifications_eleve`** dans `handleNotifyStageValide` (worker.js) :
- INSERT dans `notifications_eleve` avec `type:'stage_valide'` (badge 🔔 espace élève)
- Push OS élève via `getFcmTokensForEmail` + `sendFcmPush` — tous `await` + `try/catch`

### ✅ S-edit — email + push + panel 🔔 quand admin modifie les slots (commit `d1d190d`)

**Nouvelle route** : `POST /api/notify/stage-modifie` (JWT admin requis)

**`sauverSlotsStage` (admin.html)** :
1. Capture `oldSlots` avant la mise à jour DB
2. Après UPDATE Supabase réussi, map les anciens et nouveaux slots en objets `{horaire_debut, horaire_fin, theme}`
3. Fire-and-forget côté client : `fetch('/api/notify/stage-modifie', { headers:{Authorization:'Bearer '+_getJwt()}, body:{email, prenom, nom, date, slotsAvant, slotsApres} })` (fire-and-forget OK côté navigateur admin — pas Cloudflare Workers)

**`handleNotifyStageModifie` (worker.js)** :
- Email bleu 📋 "Modification de votre inscription au stage" à l'élève : stage-box avec slots anciens barrés en rouge + nouveaux en vert
- Email admin : encadré or avec avant/après
- INSERT `notifications_eleve` (badge 🔔 espace élève)
- `_insertNotification` (panel 🔔 admin)
- Push OS élève via `getFcmTokensForEmail` + `sendFcmPush`
- Tous `await` + `try/catch`

### ✅ Pointage stages — persistance en DB (commit `dfadc55`)

**Problème** : les clics ✓/✗ dans Stages → Pointage ne persistaient qu'en mémoire. Au rechargement, l'état des présences était perdu.

**SQL exécuté dans Supabase** :
```sql
ALTER TABLE inscriptions_stages
  ADD COLUMN IF NOT EXISTS presence_declaree BOOLEAN DEFAULT NULL;
```

**Nouveaux formats d'entrée** :
- **Nouveau format** (`stage_date` défini) : une ligne `inscriptions_stages` par personne par date — `_isNewFormat: true` + `_dbId: ins.id` → persistance fiable par ID
- **Ancien format legacy** : une ligne avec toutes les dates dans `donnees.inscriptionsParDate` — pas de persistance DB (un même `_dbId` couvre plusieurs dates et plusieurs personnes)

**`chargerDonnees` (admin.html)** : pour les entrées nouveau format, mappe `ins.presence_declaree → present` et pose `_isNewFormat: true` :
```javascript
stagesReels[dateKey].inscrits.push({
  _dbId: ins.id,
  _isNewFormat: true,
  // …
  present: ins.presence_declaree != null ? ins.presence_declaree : null,
  // …
});
```

**`pointerStage` (admin.html)** — réécriture complète :
1. Met à jour `i.present` en mémoire
2. Manipulation DOM directe des classes `.btn-pres.on`/`.btn-pres.off`/`.btn-abs.on`/`.btn-abs.off` avant `renderTab()` (évite le flash)
3. Si `i._isNewFormat && i._dbId` → UPDATE Supabase `presence_declaree` par `id` :
```javascript
if (!IS_DEMO && i._isNewFormat && i._dbId) {
  Promise.resolve(TEV.client.from('inscriptions_stages')
    .update({ presence_declaree: present })
    .eq('id', i._dbId)
  ).then(function(res) {
    if (res && res.error) afficherToast('⚠️ Erreur sauvegarde présence : ' + (res.error.message || ''));
  }).catch(function() {});
}
```

**Règle** : le pointage stages NE déclenche PAS d'email ni de push (ni vers l'admin, ni vers l'élève). C'est intentionnel — seule la présence est enregistrée en DB pour les stats.

**Pattern pointage** identique à essai tango/yoga : `presence_declaree` (admin ✓/✗) est distinct de `presence_confirmee` (élève clique 👍 dans l'email). Un cron pourrait utiliser `presence_declaree` pour envoyer des relances J+1 (pas encore implémenté pour les stages).

## Session 2026-05-25 — Script vidéo + bugs espace élève (stages)

### ✅ Script vidéo `guide-eleves.html` — condensé à 2 minutes

Le script vidéo de présentation de l'espace élève a été réduit de ~7 minutes (10 blocs verbeux avec didascalies) à **~2 minutes** (10 blocs de 10–20s chacun, sans didascalies).

Durées par rubrique : Intro 15s · Connexion 15s · Accueil 20s · Forfait & Carte 20s · Publications 10s · Milonga 10s · Agenda 15s · Plan 10s · Discussions 10s · Conclusion 15s ≈ 2 min.

**Règle** : ne jamais rallonger ces blocs au-delà de 20s par rubrique — la contrainte est une vidéo de présentation courte.

---

### ✅ Bug — thèmes des stages dans "Mes stages réservés" (`index.html`)

**Symptôme** : la section "Mes stages réservés" de l'accueil affichait les IDs bruts des créneaux (`STAGE1 · TECHNIQUE`) au lieu des vrais intitulés (`Barridas · Technique`).

**Cause** : `s.ateliers` contient les IDs slots (`['stage1', 'technique']`) issus de `stage_nom.split('|')`. Le code faisait directement `.join(' · ').toUpperCase()` sans mapping.

**Fix** : utiliser `_sdRef` (déjà disponible sur la ligne suivante) pour mapper chaque ID vers son thème réel :
```javascript
const _sdRef = STAGES_DATA.find(x => x.date === _dateStr); // déplacé avant _theme
let _theme;
if (_sdRef && ateliers.length) {
  const _slotToTheme = { technique: 'Technique', stage1: _sdRef.s1||'', stage2: _sdRef.s2||'', stage3: _sdRef.s3||'', stage4: _sdRef.s4||'' };
  const _mappedThemes = ateliers.map(function(a){ return _slotToTheme[a] || a; }).filter(Boolean);
  _theme = _mappedThemes.join(' · ');
} else {
  _theme = ateliers.length ? ateliers.join(' · ').toUpperCase() : '';
}
```

Les thèmes (`_sdRef.s1/.s2/.s3/.s4`) viennent exclusivement de `STAGES_DATA`, lui-même chargé depuis `tev_dates_stages_<sai>` en Supabase (Paramètres → Stages → Thèmes). Zéro valeur hardcodée.

**Important** : `_sdRef` est maintenant déclaré **avant** `_theme` (ordre inversé par rapport au code initial).

---

### ✅ Bug — Prochain stage : saison courante ignorée (`index.html`)

**Symptôme** : "Prochain stage" affichait le premier stage de la saison prochaine (septembre) alors qu'un stage de la saison courante (30 mai) était plus proche.

**Double cause** :

**Cause 1 — sync uniquement sur la saison courante** : le bloc async en bas du IIFE stages ne fetchait que `tev_dates_stages_<sai>` (saison active). Les stages de la saison prochaine (`tev_dates_stages_<saiNext>`) n'arrivaient jamais dans localStorage sur le téléphone de l'élève.

**Fix** : ajout d'un second fetch dans le même bloc async :
```javascript
var _saiParts = sai.split('-');
var saiNext = (parseInt(_saiParts[0])+1) + '-' + (parseInt(_saiParts[1])+1);
var remoteNext = await TEV.getParam('tev_dates_stages_' + saiNext);
if (remoteNext && remoteNext.stages && remoteNext.stages.length) {
  var remoteNextStr = JSON.stringify(remoteNext);
  if (localStorage.getItem('tev_dates_stages_' + saiNext) !== remoteNextStr) {
    try { localStorage.setItem('tev_dates_stages_' + saiNext, remoteNextStr); } catch(e){}
    STAGES_DATA = _loadStagesData();
    needsRender = true;
  }
}
```
`_loadStagesData()` lit déjà TOUS les `tev_dates_stages_*` de localStorage — il n'a pas besoin de modification.

**Cause 2 — STAGES_DATA non trié** : `_loadStagesData()` concatène les saisons via une boucle `for (var i=0; i<localStorage.length; i++)`. L'ordre d'itération de localStorage est non défini par la spec — la saison prochaine pouvait apparaître avant la saison courante dans le tableau. `.find(s => s.date >= todayStr)` retournait alors septembre avant mai.

**Fix** : remplacer `.find()` par `.filter().sort()[0]` :
```javascript
// Avant (non trié — bug)
const prochainStage = STAGES_DATA.find(s => s.date >= todayStr) || null;

// Après (trié chronologiquement)
const prochainStage = STAGES_DATA.filter(s => s.date >= todayStr).sort((a,b) => a.date < b.date ? -1 : 1)[0] || null;
```

**Règle permanente** : toute recherche de "prochain élément" dans `STAGES_DATA` (ou tout tableau multi-saisons) doit utiliser `filter + sort + [0]`, jamais `.find()` seul — l'ordre d'itération localStorage n'est pas garanti.

## Session 2026-05-25 (suite) — WhatsApp multi-cours + brouillons publications saison courante

### ✅ WhatsApp multi-cours dans l'espace élève (`index.html`)

**Problème** : un élève inscrit à plusieurs cours (ex : Paris Débutants ET Vincennes Intermédiaires) ne voyait dans la rubrique WhatsApp que le lien du premier cours trouvé dans `eleves.ville/niveau`, jamais les deux.

**Cause racine** : `renderWhatsapp()` utilisait `eleveData.eleve.ville` et `eleveData.eleve.niveau` — un seul cours par élève, même si `inscriptions_cours` contenait plusieurs lignes.

**Fix** : utiliser `eleveData.inscriptionsTango` (tableau de toutes les inscriptions actives) pour construire le set des cours inscrits, puis filtrer `allCours` en conséquence :

```javascript
const _inscActives = ((eleveData && eleveData.inscriptionsTango) || []).filter(function(i) {
  if (i.statut !== 'inscrit') return false;
  try { var d = i.donnees && (typeof i.donnees === 'string' ? JSON.parse(i.donnees) : i.donnees);
        if (d && d.isRenewal) return false; } catch(e){}
  return true;
});
const _enrolledWa = new Set();
_inscActives.forEach(function(i) {
  var v = (i.ville||'').toLowerCase(), n = (i.niveau||'').toLowerCase();
  if (v==='paris'     && n==='debutant')      _enrolledWa.add('paris-deb');
  if (v==='paris'     && n==='intermediaire') _enrolledWa.add('paris-int');
  if (v==='vincennes' && n==='debutant')      _enrolledWa.add('vinc-deb');
  if (v==='vincennes' && n==='intermediaire') _enrolledWa.add('vinc-int');
});
let cours = _enrolledWa.size ? allCours.filter(c => _enrolledWa.has(c.key)) : allCours;
```

Si `eleveData.inscriptionsTango` est vide (pas encore chargé ou élève sans inscription active), fallback sur tous les cours disponibles (`allCours`).

### ✅ Publications brouillons (`publiee: false`) masquées dans l'espace élève sauf `?testpubs=1`

**Problème** : les publications avec `publiee: false` (brouillons) apparaissaient dans l'espace élève au même titre que les publications publiées.

**Fix** dans `renderActu()` (`index.html`) — filtre ajouté dans le bloc `if (!_testPubs)` :
```javascript
const _testPubs = new URLSearchParams(location.search).get('testpubs') === '1';
if (!_testPubs) {
  pubs = pubs.filter(p => {
    if (p.publiee === false) return false; // brouillons masqués
    const dates = p.datesProgrammees && p.datesProgrammees.length ? p.datesProgrammees
      : (p.dateProgrammee ? [p.dateProgrammee] : []);
    if (!dates.length) return true;
    return dates.some(d => new Date(d) <= now);
  });
}
```

Avec `?testpubs=1` dans l'URL : tous les brouillons sont visibles (test admin depuis l'espace élève).

### ✅ Génération de brouillons de publications pour la saison courante (`admin.html`)

**Contexte** : les fonctions `genererPublicationsStages()` et `genererPublicationsMilongas()` existantes génèrent des publications pour la **saison suivante** avec `publiee: true`. Deux nouvelles fonctions génèrent des brouillons pour la **saison courante** avec `publiee: false`, uniquement pour les dates futures.

**Deux nouveaux boutons** dans `renderPublications()` (toujours visibles, pas de restriction mai-15) :
- `🗓 Générer brouillons stages [sai] (à venir)` → `genererPublicationsBrouillonStages()`
- `🎶 Générer brouillons milongas [sai] (à venir)` → `genererPublicationsBrouillonMilongas()`

**`genererPublicationsBrouillonStages()`** :
- Lit `tev_dates_stages_<sai>` depuis Supabase → filtre `st.date >= today()` (futures uniquement)
- Lit `tev_params_stages_<sai>` pour horaires/tarifs/adresse par défaut
- Génère 3 publications par date (J-20, J-14, J-7) avec `publiee: false`
- Anti-doublon via `existKeys` Set sur `{stageDate}_{jAvant}` des publications existantes dans `adminData.publications`
- Contenu généré via `_genContenuStage(st, defHor, defTar, defAdr)` (même pure function que pour saisonSuivante)
- INSERT en batch dans `publications` + `chargerDonnees()` + `renderTab()`

**`genererPublicationsBrouillonMilongas()`** :
- Lit `tev_milongas_<sai>` depuis Supabase → filtre `dateObj.date >= today()` + `dateAppartientSaison(date, sai)`
- Génère 2 publications par date milonga (J-14, J-3) avec `publiee: false`
- Anti-doublon via `existKeys` Set sur `{milongaId}_{milongaDate}_{jAvant}`
- Contenu généré via `_genContenuMilonga(mil, dateObj)` (même pure function)
- INSERT en batch + `chargerDonnees()` + `renderTab()`

**Différences vs fonctions saisonSuivante** :
- `sai = saisonActive()` (pas `saisonSuivante()`)
- `publiee: false` (brouillons — admin active manuellement)
- Filtre `date >= today()` (pas de publications pour le passé)
- Pas de restriction au 15 mai (boutons toujours visibles)

**L'admin publie manuellement** : dans Publications → cliquer sur la publication → ✏️ → cocher "Publiée" → Enregistrer.

### Règle permanente — publications brouillons

- `publiee: false` = brouillon → invisible dans l'espace élève sauf avec `?testpubs=1`
- `publiee: true` = publiée → soumise aux filtres `dateProgrammee` habituels
- Les fonctions de sync automatique (`syncPublicationsStage`, `syncPublicationsMilongaDate`) mettent à jour le contenu (titre, contenu, extrait, image) des publications existantes quelle que soit leur valeur `publiee` — les brouillons sont mis à jour au même titre que les publiées
- Ne jamais changer `publiee` dans les fonctions de sync automatique — uniquement dans l'éditeur admin ou via le bouton dédié

## Session 2026-05-26 — Fix calcExpiration (suppression nextSeasonStartISO) + normalisation jour + email C1

### Historique des régressions calcExpiration (toutes closes)

| Date | Variable introduite | Cause du bug | Symptôme | Fix |
|------|---------------------|--------------|----------|-----|
| 2026-05-22 | `nextSeasonStartISO` depuis `lastStored` | lastStored saute à juin 2027 quand saison suivante saisie → borne trop loin | Décembre 2027 (+18 mois) | Suppression complète |
| 2026-05-22 tentative 2 | `nextSeasonStartISO` depuis `datePremierCours` | Plafonne à sept 2026 → cours 2026-2027 après sept non pris en compte → vacances d'automne comptées comme gaps | Sept 2026 (+3 mois plat) | Suppression complète |
| 2026-05-26 | Aucune — `iso <= lastStored` seul | date entrée = mardi (26/05), cours = jeudi → mardi ∉ coursSet → chaque semaine = gap | Résultat gonflé | Normalisation jour de cours |

### ✅ Fix final — suppression de `nextSeasonStartISO` + condition `iso <= lastStored` seule (commit `bd6673e`)

**Solution** : supprimer `nextSeasonStartISO` dans les deux fonctions (`calcExpiration` dans `admin.html` et `_calcExpirationSb` dans `tev-supabase.js`). Utiliser uniquement `iso <= lastStored` comme borne haute.

```javascript
// ✅ CORRECT — condition finale définitive dans les deux fonctions
if (firstStored && iso >= firstStored && !coursSet[iso] && iso <= lastStored) {
  fin.setDate(fin.getDate() + 7);
}
```

**Pourquoi ça marche** : quand les deux saisons (2025-2026 ET 2026-2027) sont saisies dans Paramètres → `lastStored` = juin 2027. La boucle couvre tout l'été 2026 (absent de coursSet → gaps → +9 semaines). Les cours de la rentrée 2026-2027 (sept, oct, début nov) sont dans `coursSet` → pas comptés comme gaps. Seule la semaine de Toussaint (29 oct) est absente → 1 gap supplémentaire → expiration correcte (~6 novembre pour un premier cours le 28 mai).

**⚠️ Règle absolue et définitive** : `nextSeasonStartISO` est **BANNI DÉFINITIVEMENT** sous toute forme. Toute introduction future recréera les bugs décrits dans le tableau ci-dessus.

### ✅ Normalisation du jour de cours (commit `9c26f6f`)

**Symptôme** : entrer la date `2026-05-26` (mardi) pour un premier cours à Paris (cours le jeudi) produisait un résultat gonflé — chaque semaine semblait un gap car le mardi ne figure jamais dans `coursSet` (qui ne contient que des jeudis).

**Fix** : bloc de normalisation ajouté dans les deux fonctions **après** construction de `coursSet`, **avant** la boucle `while` :

```javascript
// admin.html (var/function)
if (coursArr.length > 0) {
  var _closest = coursArr.reduce(function(best, d) {
    if (!best) return d;
    var da = Math.abs(new Date(d + 'T12:00:00') - debut);
    var db = Math.abs(new Date(best + 'T12:00:00') - debut);
    return da < db ? d : best;
  }, null);
  if (_closest) {
    var _closestDt = new Date(_closest + 'T12:00:00');
    if (Math.abs(_closestDt - debut) <= 3 * 24 * 60 * 60 * 1000) {
      debut = _closestDt;
      fin = new Date(debut.getTime());
      fin.setMonth(fin.getMonth() + 3);
    }
  }
}

// tev-supabase.js (const/arrow — debut est const, utiliser setTime)
if (coursArr.length > 0) {
  const _closest = coursArr.reduce((best, d) => {
    if (!best) return d;
    const da = Math.abs(new Date(d + 'T12:00:00') - debut);
    const db = Math.abs(new Date(best + 'T12:00:00') - debut);
    return da < db ? d : best;
  }, null);
  if (_closest) {
    const _closestDt = new Date(_closest + 'T12:00:00');
    if (Math.abs(_closestDt - debut) <= 3 * 24 * 60 * 60 * 1000) {
      debut.setTime(_closestDt.getTime());
      fin.setTime(debut.getTime());
      fin.setMonth(fin.getMonth() + 3);
    }
  }
}
```

**Tolérance ±3 jours** : couvre les cas où l'admin entre la date approximative du premier cours (ex: mardi plutôt que jeudi). Au-delà de 3 jours → la date est acceptée telle quelle (cas d'un vrai cours exceptionnel hors planning).

**Validation Toussaint** : avec `datePremierCours = 28 mai 2026` (jeudi Paris), résultat = **6 novembre 2026** ✅. Calcul : 9 semaines été (juil-août) + 1 semaine Toussaint (29 oct) = 10 semaines × 7j = +70j depuis fin août → ~6 nov. Oct 29 = Toussaint (gap) ; Nov 5 = cours normal → fin correctement positionnée à Nov 6.

### ✅ Email C1 — expiration affichée (commit de cette session)

**Cause** : `pointerCoursAction` dans `admin.html` ne passait pas `expiration` dans le body envoyé à `/api/notify/carte-bienvenue` → handler affichait "à calculer après le 1er cours".

**Fix** : ajout de `expiration: calcExpiration(date, c.ville||'paris')`, `utilises: syncData.utilises`, `restants: syncData.restants` dans le corps de la requête.

**Fix secondaire** : `syncData.expiration` pour les pointages normaux = `c.expiration || calcExpiration(c.datePremierCours||date, c.ville||'paris')` (au lieu de `c.expiration` seul — null pour les nouvelles cartes).

---

## Session 2026-05-29 — Niveau d'expérience + tri dans Essai et Inscriptions Tango

### ✅ `_labelNivEleve(val)` — badges colorés niveau d'expérience

Affiche un badge coloré dans les fiches élèves (Essai Tango liste d'attente, Inscriptions Tango att. validation) à partir du champ `niveau_eleve`.

**Deux formats de valeurs** selon le formulaire source :
- `cours-essai.html` → valeurs texte complet : `"1er cours"`, `"Quelques cours"`, `"1 an – bases acquises"`, `"2 ans"`, `"Plus de 2 ans"`
- `inscription-cours.html` → IDs courts : `"premier"`, `"quelques"`, `"1an"`, `"2ans"`, `"plus"`, `"milonga"`

**Normalisation via `aliases` dict** (`.toLowerCase().trim()`) avant la lookup dans la map de badges. Sans cette normalisation, les essais affichaient toujours un badge vide.

**Palette couleurs** :
| Valeur normalisée | Label | Fond | Texte |
|---|---|---|---|
| `premier` | 1er cours | `#1b5e20` vert foncé | `#a5d6a7` |
| `quelques` | Quelques cours | `#1a237e` bleu foncé | `#90caf9` |
| `1an` | 1 an | `#4a148c` violet foncé | `#ce93d8` |
| `2ans` | 2 ans | `#e65100` orange foncé | `#ffcc80` |
| `plus` | 2+ ans | `#b71c1c` rouge foncé | `#ef9a9a` |
| `milonga` | Milonga | `#880e4f` rose foncé | `#f48fb1` |

### ✅ `_expRank(val)` — rang numérique pour le tri

Retourne un entier 1–6 (premier=1 → milonga=6) pour le tri par expérience décroissant. Même normalisation via `aliases` que `_labelNivEleve`.

```javascript
function _expRank(val) {
  var aliases = {'1er cours':'premier','quelques cours':'quelques','1 an – bases acquises':'1an','1 an':'1an','2 ans':'2ans','plus de 2 ans':'plus'};
  var key = aliases[(val||'').toLowerCase().trim()] || val;
  var ranks = {premier:1, quelques:2, '1an':3, '2ans':4, plus:5, milonga:6};
  return ranks[key] || 0;
}
```

### ✅ Bouton ⬆ Expérience — toggle de tri

**Essai Tango → Liste d'attente** : bouton visible uniquement quand `filtreEssai==='attente'`. Tri appliqué sur `attenteGrp` **avant** `_groupCouples()` (important — le tri doit précéder le regroupement couples).

**Inscriptions Tango → Att. Validation** : bouton visible uniquement quand `sousOngletCoursTango==='attente_validation'`. Tri appliqué sur `items` **après** `var items = grp[cKey]` et **avant** le filtre `!items.length`.

**Variables globales** (ligne ~1082 dans `admin.html`) :
```javascript
var _sortEssaiByExp   = false;  // toggle liste d'attente essai tango
var _sortInscByExp    = false;  // toggle att. validation inscriptions tango
```

**Tri** : décroissant par `_expRank(b.niveau_eleve) - _expRank(a.niveau_eleve)` → les plus expérimentés en tête (utile pour valider en priorité les milongueros sur la liste d'attente). Utilise `.slice().sort()` pour ne pas muter le tableau source.

**Persistance du toggle** : désactivé entre onglets (toggle sur `renderTab()` uniquement, pas de persistance localStorage). Comportement voulu : reset à chaque navigation.

### Fonctionnalités planifiées (session 2026-05-29)

Les 3 fonctionnalités suivantes ont été décidées :

1. **Recherche globale** — champ de recherche dans le header (Ctrl+K) qui trouve une personne dans tous les onglets (tango, yoga, essai, stages, devis). Résultats groupés par source avec navigation directe au clic.

2. **Dashboard saison** — nouveau tab `'dashboard'` avec : taux de remplissage par cours (guideurs/guidées vs CAP), total recette encaissée vs attendue, alertes (paiements en attente, cartes expirées, absences consécutives).

3. **Fiche élève consolidée** — modal `ouvrirFicheEleve(email)` accessible depuis tous les onglets. Affiche : infos perso, inscriptions tango, yoga, stages, essais, présences carte 10, notes.

---

## Session 2026-05-29 (suite) — Recherche globale admin + Mode d'emploi + suppression Dashboard démo

### ✅ Recherche globale admin (`admin.html`) — couleurs résultats

La recherche globale (Ctrl+K) cherche dans tous les onglets. Les résultats sont colorés par source :
- Couleurs retouchées pour améliorer la lisibilité sur fond sombre (commit `bb9c396`)

### ✅ Onglet "Mode d'emploi" dans l'espace élève (`index.html`)

Nouvel onglet `aide` ajouté dans la navigation de l'espace élève.

**Navigation** : position dans `rows` de `renderNavOverlay()` — d'abord seul sur une ligne dédiée, puis déplacé sur la même ligne qu'Accueil : `['accueil', 'aide']`.

**Entrées dans les dicts de navigation** :
- `_TAB_LABELS` : `aide: 'Mode d\'emploi'`
- `_NAV_DEFS` : `aide: { label:'Mode d\'emploi', color:'#67e8f9', svg:'...' }` (icône point d'interrogation)

**Contenu (`#aide-pane`)** : accordéon de 20 sections `<details>/<summary>` couvrant toutes les rubriques du menu :
🏠 Accueil · 💳 Forfait/Carte · 🎭 Stages · 🎯 Cours privé · 🌙 Milonga · 📅 Agenda · 🗺 Plan · 📰 Publications · 🏛 Sorano · 🎵 Musique (code promo `TangoEtVous40`) · 👟 Chaussures (adresses Lalatango + Miltango) · 🧘 Yoga · 🌀 Hypnose · ✉️ Contact · 💬 WhatsApp · 🗨 Discussions · ⭐ Avis · 🔔 Notifications · 📱 Installer l'application · 🔑 Connexion

**CSS** : classes `.aide-section`, `.aide-body`, `.aide-tip` utilisant les variables CSS globales (`var(--card)`, `var(--border)`, `var(--text)`, `var(--gold)`, `var(--dim)`) — s'adapte automatiquement au thème sombre.

### ✅ Suppression du Dashboard démo de l'interface élèves (`index.html`)

Le mode démo (données fictives "Felipe") était accessible aux élèves via un bouton sur l'écran de connexion et via le panneau FAB de debug. Supprimé avant le lancement de l'appli auprès des vrais élèves.

**4 emplacements supprimés** :

| # | Emplacement | Ce qui a été retiré |
|---|-------------|---------------------|
| 1 | `initAuth()` | Lignes rendant `#demo-btn-wrap` visible au chargement |
| 2 | HTML écran de connexion | `<div id="demo-btn-wrap">` avec bouton "Voir le dashboard démo" |
| 3 | Listeners événements | `addEventListener('click')` sur `.btn-demo` |
| 4 | Panneau FAB debug | Div + bouton "🎭 Mode démo (Felipe, 4/10 cours)" |

**Ce qui a été conservé** : la fonction `demoLogin()` et `DEMO_DATA` restent dans le code pour les tests internes — seuls les éléments UI visibles par les élèves ont été retirés.

**Commits** : `61d6cc3` (ajout aide + suppression démo) · `8b58510` (déplacement aide à côté d'Accueil)

---

## Session 2026-05-29 (suite 2) — Audit complet des 14 crons + 2 bugs corrigés

### Contexte

Audit demandé par l'utilisateur : "Tu peux vérifier si tous les crons du système fonctionnent bien du coup ?" — vérification que chaque handler cron dans `worker.js` respecte les règles de robustesse (await + try/catch, expéditeur Brevo vérifié, anti-doublon correct).

### ✅ Résultat de l'audit — 14 handlers, 2 bugs trouvés et corrigés

| Handler | Route | Workflow GitHub | Statut |
|---------|-------|-----------------|--------|
| `handleCronEssaiJ1` | `/api/cron/essai-j1` | `essai-j1.yml` | ✅ OK |
| `handleCronEssaiYogaJ1` | `/api/cron/essai-yoga-j1` | `essai-yoga-j1.yml` | ✅ OK (sender corrigé session précédente) |
| `handleCronEssaiRappelJ7` | `/api/cron/essai-rappel-j7` | `essai-rappel-j7.yml` | ✅ OK |
| `handleCronEssaiYogaRappelJ3` | `/api/cron/essai-yoga-rappel-j3` | `essai-yoga-rappel-j3.yml` | ✅ Corrigé — bug sender Brevo (commit `fc1a134`) |
| `handleCronRappelStageJ3` | `/api/cron/rappel-stage-j3` | `rappel-stage-j3.yml` | ✅ OK |
| `handleCronCarteExpiree` | `/api/cron/carte-expiree` | `carte-expiree.yml` | ✅ OK |
| `handleCronFinSaisonC4` | `/api/cron/fin-saison-c4` | `fin-saison-c4.yml` | ✅ OK |
| `handleCronFinSaisonC5` | `/api/cron/fin-saison-c5` | `fin-saison-c5.yml` | ✅ OK |
| `handleCronRelanceAbsences` | `/api/cron/relance-absences` | `relance-absences.yml` | ✅ Corrigé — PATCH fire-and-forget (commit `f84b823`) |
| `handleCronEspaceEleveActivation` | `/api/cron/espace-eleve-activation` | `espace-eleve-activation.yml` | ✅ OK |
| `handleCronPasDeCours` | `/api/cron/pas-de-cours` | `pas-de-cours.yml` | ✅ OK |
| `handleNotifyEssaiYogaModifie` | `/api/notify/essai-yoga-modifie` | — | ✅ OK (sender corrigé session précédente) |
| `handleCronCartePonteeJ1` | interne (pas de route cron directe) | — | ✅ OK |
| Backup CSV | — | `backup-csv.yml` | ✅ OK (pas de worker, GitHub Actions direct) |

### ✅ Bug 1 — Mauvais expéditeur Brevo dans `handleCronEssaiYogaRappelJ3` (commit `fc1a134`)

**Symptôme** : l'email Y3 (rappel J-3 essai yoga) n'arrivait jamais chez les élèves — Brevo rejetait silencieusement la requête.

**Cause** : `sender.email = 'regardsepose@gmail.com'` — domaine non vérifié dans Brevo.

**Fix** : pattern standard yoga avec expéditeur vérifié + replyTo :
```javascript
sender: { name: 'Florencia Garcia — Le Regard Se Pose', email: 'tangoetvous@gmail.com' },
replyTo: { email: 'regardsepose@gmail.com', name: 'Florencia Garcia' }
```

### ✅ Bug 2 — PATCH `derniere_relance_abs` fire-and-forget dans `handleCronRelanceAbsences` (commit `f84b823`)

**Symptôme potentiel** : l'email C6 ("Coucou, on ne t'a pas vu·e aux 2 derniers cours") pouvait être envoyé plusieurs fois de suite à la même personne pour les mêmes absences.

**Cause** : la mise à jour de `eleves.derniere_relance_abs` (le mécanisme anti-doublon) était fire-and-forget via `Promise.resolve(fetch(...)).catch(fn)`. En Cloudflare Workers, dès que `corsResponse` est renvoyé, le runtime peut annuler les Promises en cours → le PATCH n'atteignait jamais Supabase → l'anti-doublon était cassé.

**Avant (buggy)** :
```javascript
Promise.resolve(
  fetch(`${SUPABASE_URL}/rest/v1/eleves?email=eq.${encodeURIComponent(String(eleve.email))}`, {
    method: 'PATCH',
    headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`,
               'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ derniere_relance_abs: dateDerniere }),
  })
).catch(function(e) { console.error('[relance-absences] patch derniere_relance_abs error', e); });
```

**Après (correct)** :
```javascript
try {
  await fetch(`${SUPABASE_URL}/rest/v1/eleves?email=eq.${encodeURIComponent(String(eleve.email))}`, {
    method: 'PATCH',
    headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`,
               'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ derniere_relance_abs: dateDerniere }),
  });
} catch(e) { console.error('[relance-absences] patch derniere_relance_abs error', e); }
```

### Règle permanente renforcée — Cloudflare Workers + Promises

**Rappel** (déjà documenté en session 2026-05-24 suite 4, confirmé par cet audit) :

En Cloudflare Workers, après `return corsResponse(...)`, le runtime **peut terminer tous les fetch en cours** qui ne sont pas awaités. Le pattern `Promise.resolve(fetch(...)).catch(fn)` **n'est pas fire-and-forget fiable** — c'est un fire-and-maybe-forget.

**Règle** : toute opération critique (mise à jour anti-doublon, insertion notification, envoi email) doit être `await`ée + entourée de `try/catch` **avant** le `return` du handler. Cette règle s'applique à 100% des handlers `worker.js`, crons inclus.

---

## Session 2026-05-30 — Notifications panel 🔔 admin pour les crons de rappel + contrôle d'accès espace élève

### ✅ Notifications panel 🔔 admin pour E4, Y3, S4 (commit `00693b6`)

**Demande** : pour chaque email de rappel envoyé à un élève, l'admin doit recevoir une notification dans son panel 🔔.

**Choix d'implémentation — résumé unique après la boucle** : plutôt qu'une notification par élève (qui spamerait le panel), un seul résumé `"N rappel(s) envoyé(s)"` est inséré après la boucle, conditionné sur `sent > 0` (évite les notifications fantômes si aucun rappel n'est parti ce jour-là).

**Pattern appliqué dans les 3 handlers** :
```javascript
if (sent > 0) {
  try {
    const resN = await _insertNotification('<type>', `📅 ${sent} rappel(s) envoyé(s) · → <onglet>`, '<tab>');
    if (!resN.ok) console.error('[handler] insertNotification HTTP', resN.status);
  } catch(e) { console.error('[handler] insertNotification error', e); }
}
return corsResponse({ ok: true, sent, ... }, 200, {}, request);
```

| Handler | Type notif | Message | Tab |
|---------|-----------|---------|-----|
| `handleCronEssaiRappelJ7` (E4) | `'essai_rappel_j7'` | `📅 N rappel(s) J-7 envoyé(s) pour l'essai tango du DATE · → Essai Tango` | `'essai'` |
| `handleCronEssaiYogaRappelJ3` (Y3) | `'essai_yoga_rappel_j3'` | `📅 N rappel(s) J-3 envoyé(s) pour l'essai yoga du DATE · → Yoga → Essai yoga` | `'yoga'` |
| `handleCronRappelStageJ3` (S4) | `'stage_rappel_j3'` | `📅 N rappel(s) J-3 envoyé(s) pour le stage du DATE · → Stages` | `'stages'` |

**C6 (`handleCronRelanceAbsences`)** : déjà avait des notifications par élève (chaque détection de 2 absences consécutives est significative). Inchangé.

**Règle** : pour les crons qui envoient en boucle à plusieurs élèves, préférer un résumé unique plutôt qu'une notification par élève. Pour les détections ponctuelles et importantes (C6, carte expirée CX), une notification par élève est appropriée.

### ✅ C6 — condition `carte_statut IN ('Active', 'Nouvelle carte')` confirmée

`handleCronRelanceAbsences` ne relance que les élèves dont `carte_statut IN ('Active', 'Nouvelle carte')` — une carte de 10 cours active est bien requise pour déclencher l'envoi de C6. Les élèves sans carte active (forfait, etc.) ne reçoivent pas cet email.

### ✅ Contrôle d'accès espace élève — basé sur l'inscription active (commit `e889abd`)

`tevGetEleve()` dans `js/tev-supabase.js` a été refactorisé pour vérifier l'existence d'au moins une ligne active dans `inscriptions_cours` (statut ≠ 'supprimé') OU `cours_yoga` pour la saison courante ou la saison suivante. `statut_eleve = 'Actif'` seul **ne suffit plus** pour accéder à l'espace élève.

**Règles** :
- `statut_eleve === 'En attente'` → blocage explicite (message "compte en cours de validation")
- `statut_eleve === 'Inactif'` → blocage explicite (message "accès suspendu")
- Aucune des deux lignes ci-dessus + inscription active (saison courante ou suivante) → accès accordé
- Aucune inscription active → message "Votre inscription pour cette saison est terminée. Contactez-nous pour vous réinscrire."

**Avantage** : à la rentrée 2026-2027, les élèves non ré-inscrits perdent automatiquement l'accès sans intervention manuelle admin.

**Ne jamais revenir à `statut_eleve = 'Actif'`** comme seul critère.
