# Guide de déploiement — Tango & Vous

Ce fichier documente toutes les étapes manuelles nécessaires pour mettre
l'application en production. Il est maintenu dans le dépôt pour survivre
aux compressions de contexte.

---

## Vue d'ensemble de l'architecture

```
Navigateur (index.html / admin.html)
       │  fetch()
       ▼
Google Apps Script (Code.gs) — déployé comme « Web App »
       │  read / write
       ▼
Google Sheets (classeur associé)
```

L'authentification élèves est gérée par **Firebase Authentication**
(magic link par email). Les admins s'authentifient via leur adresse Gmail
vérifiée côté serveur (`ADMIN_EMAILS` dans Code.gs).

---

## Étape 1 — GitHub Pages (hébergement frontend)

1. Dans le dépôt GitHub `tangoetvous/tango-et-vous-app`
   → Settings → Pages → Source : branche `main`, dossier `/` (root)
   → Enregistrer
2. L'URL publique sera : `https://tangoetvous.github.io/tango-et-vous-app`
3. Cette URL est déjà renseignée dans :
   - `admin.html` : `var URL_PWA = 'https://tangoetvous.github.io/tango-et-vous-app';`
   - `Code.gs` : `const URL_PWA = 'https://USERNAME.github.io/tango-et-vous-app';`
     → **À corriger dans Code.gs** : remplacer `USERNAME` par `tangoetvous`

---

## Étape 2 — Google Sheets (classeur de données)

1. Créer un nouveau Google Sheets (ou utiliser un existant) :
   titre suggéré : « Tango & Vous — Données »
2. Créer manuellement les onglets suivants (noms exacts, respecter les
   accents) :

| Nom de l'onglet       | Usage                                      |
|-----------------------|--------------------------------------------|
| `Élèves`              | Fiches élèves actifs/inactifs              |
| `Présences`           | Historique des pointages                   |
| `Cours Particuliers`  | Demandes de cours particuliers             |
| `Stages`              | Inscriptions aux stages                    |
| `Inscriptions`        | Essais et demandes d'inscription           |
| `Publications`        | Articles/annonces publiés dans l'app élève |
| `Agenda`              | Événements agenda                          |
| `Agenda Modifs`       | Annulations / modifications d'occurrences  |

> Les onglets **`Cours Tango`**, **`Discussions`** et **`Discussion_Messages`**
> sont créés automatiquement par Code.gs au premier appel qui en a besoin.
> Pas besoin de les créer à la main.

3. La structure des colonnes est définie dans Code.gs (constantes
   `*_START_ROW` et lectures par index). Ne pas réorganiser les colonnes
   sans adapter Code.gs.

---

## Étape 3 — Google Apps Script

### 3a. Créer le projet

1. Ouvrir le Google Sheets créé à l'étape 2
2. Extensions → Apps Script → un éditeur s'ouvre, lié au classeur
3. Supprimer le contenu par défaut du fichier `Code.gs`
4. Copier-coller intégralement le contenu du fichier `Code.gs` du dépôt
5. Enregistrer (Ctrl+S)

### 3b. Adapter les constantes dans Code.gs

Lignes à vérifier / modifier en haut du fichier :

```javascript
const URL_PWA       = 'https://tangoetvous.github.io/tango-et-vous-app';
const EMAIL_CONTACT = 'tangoetvous@gmail.com';   // déjà correct
const NOM_ECOLE     = 'Tango & Vous';            // déjà correct

const ADMIN_EMAILS = [
  'tangoetvous@gmail.com',
  'florencia@tangoetvous.com',
  'jeremy@tangoetvous.com',
];
```

### 3c. Déployer comme Web App

1. Cliquer sur « Déployer » → « Nouveau déploiement »
2. Type : **Application Web**
3. Paramètres :
   - Exécuter en tant que : **Moi** (compte Google propriétaire du Sheets)
   - Qui a accès : **Tout le monde** (permet les appels fetch depuis le
     navigateur sans authentification Google)
4. Cliquer « Déployer » → autoriser les permissions demandées
5. **Copier l'URL de déploiement** — elle ressemble à :
   `https://script.google.com/macros/s/AKfycb.../exec`

### 3d. Mettre à jour l'URL dans les fichiers frontend

Remplacer `VOTRE_DEPLOYMENT_ID` dans **deux fichiers** :

**`index.html`** (ligne ~30) :
```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

**`admin.html`** (ligne ~363) :
```javascript
var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

> Après cette modification, `IS_DEMO` passera automatiquement à `false`
> et l'application se connectera au vrai backend.

### 3e. Redéployer après chaque modification de Code.gs

À chaque modification de Code.gs, il faut créer un **nouveau déploiement**
(pas « Modifier le déploiement » qui réutilise l'ancienne version compilée) :
Déployer → Nouveau déploiement → même paramètres → copier la nouvelle URL
→ mettre à jour les deux fichiers HTML → commit + push.

---

## Étape 4 — Déclencheurs automatiques (Apps Script)

Dans l'éditeur Apps Script → Déclencheurs (icône horloge) → Ajouter un déclencheur :

| Fonction                    | Type        | Fréquence              | Heure    |
|-----------------------------|-------------|------------------------|----------|
| `declencheurEmailsEssai`    | Quotidien   | Basé sur le temps      | 9h–10h   |
| `declencheurNouvelleS`      | Annuel      | 1er septembre          | 8h–9h    |
| `declencheurCartesFinSaison`| Quotidien   | Basé sur le temps      | 8h–9h    |

Ces déclencheurs gèrent :
- `declencheurEmailsEssai` : envoie les rappels email aux inscrits aux cours d'essai
- `declencheurNouvelleS` : désactive automatiquement les élèves au 1er septembre
- `declencheurCartesFinSaison` : envoie les alertes de fin de saison (fin juillet
  et 25 août) aux élèves qui n'ont pas soumis de pré-inscription

---

## Étape 5 — Firebase Authentication

La configuration Firebase est déjà renseignée dans `index.html` :

```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD-STk_VpUIe6mjOh7kX9bsaOE8OvPNEcs",
  authDomain: "tango-et-vous.firebaseapp.com",
  ...
};
```

Si le projet Firebase n'est pas encore configuré ou si la clé change :
1. Aller sur console.firebase.google.com → projet `tango-et-vous`
2. Authentication → Méthodes de connexion → activer **Lien e-mail (sans mot de passe)**
3. Authentication → Domaines autorisés → ajouter `tangoetvous.github.io`
4. Paramètres du projet → Vos applications → copier la config → mettre à jour
   `FIREBASE_CONFIG` dans `index.html`

---

## Étape 6 — Cloudinary (photos de profil) — optionnel

Si les photos de profil sont activées pour les admins :

Dans `admin.html` (ligne ~399) :
```javascript
var CLOUDINARY_NAME = 'VOTRE_CLOUD_NAME';
```

Remplacer par le nom du cloud Cloudinary de l'école. Si cette fonctionnalité
n'est pas utilisée, laisser tel quel — cela n'affecte pas le reste.

---

## Étape 7 — Notifications push (Firebase Cloud Messaging)

Les discussions envoient une notification sur le téléphone (même app fermée)
à chaque nouvelle discussion ouverte. Deux clés sont nécessaires.

### 7a. Clé VAPID (client → inscription push)

1. Firebase Console → Projet `tango-et-vous` → Project Settings → Cloud Messaging
2. Section « Web configuration » → **Generate key pair** (ou copier si déjà créée)
3. Remplacer `VOTRE_VAPID_KEY` dans **deux fichiers** :
   - `index.html` : `const VAPID_KEY = 'VOTRE_VAPID_KEY';`
   - `admin.html` : `var VAPID_KEY_ADMIN = 'VOTRE_VAPID_KEY';`

### 7b. Clé serveur FCM (Apps Script → envoi push)

1. Firebase Console → Project Settings → Cloud Messaging → **Server key** (section « Cloud Messaging API (Legacy) »)
   - Si l'API legacy n'est pas visible : Google Cloud Console → API & Services → Enable « Firebase Cloud Messaging API »
2. Dans l'éditeur Apps Script → Paramètres du projet → Variables de Script → Ajouter :
   - Nom : `FCM_SERVER_KEY`
   - Valeur : la clé serveur copiée à l'étape 1

> Sans cette clé, l'envoi de push échoue silencieusement — les discussions
> fonctionnent normalement, mais sans notification côté serveur.

### 7c. Autoriser le domaine dans Firebase

Firebase Console → Authentication → Settings → Domaines autorisés →
Ajouter `tangoetvous.github.io` (si pas déjà fait à l'étape 5).

---

## Étape 8 — Liens AssoConnect (mise à jour annuelle)

Dans `admin.html`, le dictionnaire `LIENS_ASSOCONNECT_DEFAUT` contient les
liens de paiement par saison. **Avant le 1er mai** de chaque année, ajouter
la saison suivante :

```javascript
var LIENS_ASSOCONNECT_DEFAUT = {
  '2026-2027': {
    cours:  'https://le-regard-se-pose.assoconnect.com/...',
    renouv: 'https://le-regard-se-pose.assoconnect.com/...',
    yoga:   'https://le-regard-se-pose.assoconnect.com/...'
  },
  // ajouter ici la prochaine saison
};
```

Les admins peuvent aussi modifier ces liens depuis l'interface admin
(onglet Tarifs → Liens AssoConnect) sans toucher au code.

---

## Étape 8 — Premier lancement et activation des élèves

### Connexion admin
Les admins (`ADMIN_EMAILS`) se connectent via `admin.html`.
Aucune création de compte nécessaire : l'email est vérifié côté serveur
contre la liste `ADMIN_EMAILS` dans Code.gs.

### Connexion élève
1. L'élève ouvre l'application (`index.html`) sur son téléphone
2. Il saisit son adresse email → reçoit un lien magique Firebase
3. Il clique sur le lien → est connecté
4. Son profil est créé dans la feuille `Élèves` avec statut `en_attente`
5. **L'admin doit l'activer** dans l'onglet « Élèves Tango »
   → section « En attente » → bouton Activer

### Vérification du mode démo
Après avoir renseigné `APPS_SCRIPT_URL` (étape 3d), vérifier que
`IS_DEMO === false` en ouvrant la console du navigateur sur l'application.

---

## Récapitulatif des fichiers à modifier avant mise en ligne

| Fichier       | Variable                  | Valeur à remplacer          |
|---------------|---------------------------|-----------------------------|
| `index.html`  | `APPS_SCRIPT_URL`         | URL Apps Script déployé     |
| `index.html`  | `VAPID_KEY`               | Clé VAPID Firebase          |
| `admin.html`  | `APPS_SCRIPT_URL`         | URL Apps Script déployé     |
| `admin.html`  | `VAPID_KEY_ADMIN`         | Clé VAPID Firebase          |
| `admin.html`  | `CLOUDINARY_NAME`         | Nom du cloud Cloudinary     |
| `Code.gs`     | `URL_PWA`                 | `https://tangoetvous.github.io/tango-et-vous-app` |
| Apps Script   | Script Property `FCM_SERVER_KEY` | Clé serveur FCM       |

> `FIREBASE_CONFIG` dans `index.html` et `ADMIN_EMAILS` / `EMAIL_CONTACT`
> dans Code.gs semblent déjà avoir les bonnes valeurs de production.

---

## Ordre recommandé pour le premier déploiement

1. Activer GitHub Pages (étape 1)
2. Créer le Google Sheets et ses onglets (étape 2)
3. Créer le projet Apps Script, coller Code.gs, déployer, copier l'URL (étape 3)
4. Mettre à jour `APPS_SCRIPT_URL` dans index.html et admin.html
5. Vérifier Firebase (étape 5)
6. Commit + push → GitHub Pages se met à jour automatiquement (~2 min)
7. Configurer les déclencheurs (étape 4)
8. Tester : ouvrir l'URL publique, se connecter en admin, créer un élève de test

---

*Dernière mise à jour : avril 2026*
