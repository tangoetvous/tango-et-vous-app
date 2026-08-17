#!/usr/bin/env node
// Régénère preview-emails-a-valider-v1.html À PARTIR du code de worker.js.
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Usage :  node outils/generer-preview-a-valider.js

const path = require('path');
const { construirePage } = require('./_banc-emails.js');
const RACINE = path.join(__dirname, '..');

const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const saisonDe = iso => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };

const D_ESSAI = jour(14);
const SAI = saisonDe(D_ESSAI);

const PARAMS = {
  __soranoLien: 'https://exemple/adhesion-sorano',
  'tev_liens_assoconnect': { [SAI]: { cours: 'https://le-regard-se-pose.assoconnect.com/exemple' } },
  'tev_cours_dates': { paris: [jour(20), jour(27)], vincennes: [jour(24)] },
  ['tev_params_paris_' + SAI]: {
    horaires: { deb: '20h30', deb_fin: '21h45', int: '21h45', int_fin: '23h00' },
    adresse: { nom: 'Espas Danse Studio', rue: '24 villa Riberolle, Paris 20e', transport: 'M° Alexandre Dumas (L2)' },
    livret: { url_deb: 'https://exemple/livret-deb-paris.pdf' },
  },
  ['tev_params_vincennes_' + SAI]: {
    horaires: { deb: '19h30', deb_fin: '21h00', int: '21h00', int_fin: '22h30' },
    adresse: { nom: 'Espace Sorano', rue: '16 rue Charles Pathé, 94300 Vincennes', transport: 'RER A — Vincennes' },
    livret: { url_deb: 'https://exemple/livret-deb-vincennes.pdf' },
  },
  // Résultat de la RPC appelée quand l'élève clique « annuler » ou « reporter »
  __rpc: {
    ok: true, already: false, supprime: true,
    email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN',
    date_essai: D_ESSAI, ville: 'paris', niveau: 'debutant', role: 'guideur',
  },
};

const base = { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', tel: '0612345678' };

construirePage({
  titre: 'TANGO & VOUS',
  sousTitre: 'Preview — transferts, Sorano et actions de l’élève depuis ses emails',
  commande: 'node outils/generer-preview-a-valider.js',
  accent: '#D4AF37',
  sortie: path.join(RACINE, 'preview-emails-a-valider-v1.html'),
  params: PARAMS,
  notifs: 'notifs-a-valider.html',
  cas: [
    { id: 'transfer-demande', titre: "T1-dem — Vous basculez un essai en « demande en attente »",
      handler: 'handleNotifyEssaiAction',
      note: "Depuis la fiche d'un essai, bouton « Demande en att. ». La personne passe dans Inscriptions Tango en attente de votre validation : l'email explique la parité, sans bouton de paiement. Vous recevez le récapitulatif.",
      body: { ...base, action: 'transfer-demande', role: 'guidee', ville: 'paris', niveau: 'debutant', saison: SAI } },

    { id: 'transfer-valide', titre: 'T1-val — Vous basculez un essai en « validé·e »',
      handler: 'handleNotifyEssaiAction',
      note: "Bouton « Validé·e ». Structure quasi identique à I01 : encadré du cours, bouton AssoConnect, encadré rouge du pourboire, « Quelques précisions », livret. L'introduction fait référence au cours d'essai.",
      body: { ...base, action: 'transfer-valide', role: 'guideur', ville: 'paris', niveau: 'debutant', saison: SAI } },

    { id: 'transfer-valide-vinc', titre: 'T1-val — Même bascule, à Vincennes',
      handler: 'handleNotifyEssaiAction',
      note: "À Vincennes s'ajoute l'encadré de l'adhésion à l'Espace Sorano, avec son bouton si le lien est renseigné dans les Paramètres.",
      body: { ...base, action: 'transfer-valide', role: 'guideur', ville: 'vincennes', niveau: 'debutant', saison: SAI } },

    { id: 'sorano-relance', titre: 'SR1 — Relance pour l’adhésion Sorano',
      handler: 'handleNotifySorano',
      note: "Bouton « ✉️ Relance » de l'onglet Sorano. Explique que l'adhésion est demandée par l'Espace Sorano pour toute activité qui s'y déroule, et qu'elle ouvre droit à des réductions sur les spectacles.",
      body: { ...base, type: 'relance', cours: 'Vincennes — Débutant', saison: SAI } },

    { id: 'sorano-regle', titre: 'SR2 — Adhésion Sorano enregistrée',
      handler: 'handleNotifySorano',
      note: "Bouton « ✓ Marquer réglé ». Simple confirmation, accompagnée d'une notification dans l'espace élève.",
      body: { ...base, type: 'regle', cours: 'Vincennes — Débutant', saison: SAI } },

    { id: 'essai-annule', titre: "E-annul — L'élève annule son essai depuis son email",
      handler: 'handleEssaiConfirmerAnnuler',
      args: ['request', 'url', 'annuler', 'env'],
      note: "Déclenché par le lien « ✕ Annuler » présent dans les emails d'essai. Le lien est signé : le contrôle se fait côté serveur avant toute modification. Deux emails partent — la confirmation à l'élève et l'alerte pour vous — et la fiche apparaît dans l'onglet 🗑 Supprimés.",
      body: {} },

    { id: 'essai-reporte', titre: "E-report — L'élève reporte son essai depuis son email",
      handler: 'handleEssaiConfirmerAnnuler',
      args: ['request', 'url', 'reporter', 'env'],
      note: "Même mécanique que l'annulation, avec un vocabulaire de report : la personne est ensuite redirigée vers le formulaire pour choisir une nouvelle date.",
      body: {} },
  ],
  absentsTitre: "Ce que les anciennes maquettes annonçaient et qui n'existe pas",
  absents: `<table class="tbl">
    <tr><th>Ancienne section</th><th>Réalité dans le code</th></tr>
    <tr><td><b>Changement de dates — Paris, Vincennes, Stages, La Dolce Vita, Colectivo</b> (5 sections)</td>
        <td>Aucun email n'est envoyé pour ces calendriers. Modifier ces dates pose seulement une <b>notification dans l'espace élève</b> (« 🗓 Nouvelle date… », « 🎶 Milonga annulée… »). <b>Le yoga est le seul calendrier qui envoie un email</b> — il est documenté dans la preview Yoga.</td></tr>
    <tr><td><b>CP-A, CP-E, CX</b></td>
        <td>Ces trois emails de carte sont bien réels, mais leur place naturelle est la preview <b>Cartes de cours</b>, où ils figurent désormais avec le reste de la famille.</td></tr>
  </table>`,
  fin: `<table class="tbl">
    <tr><th>Point de vigilance</th><th>Détail</th></tr>
    <tr><td><b>Liens d'action signés</b></td><td>« Annuler » et « Reporter » portent une signature vérifiée <b>côté serveur</b> avant toute action : un lien modifié à la main est refusé.</td></tr>
    <tr><td><b>Annuler ne supprime pas</b></td><td>la fiche passe en « supprimé » avec mémoire de son statut précédent — vous pouvez la rétablir depuis l'onglet 🗑 Supprimés.</td></tr>
    <tr><td><b>Lien Sorano</b></td><td>lu dans les Paramètres au moment de l'envoi ; s'il est vide, l'email annonce simplement qu'un lien suivra, sans bouton mort.</td></tr>
  </table>`,
}).catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
