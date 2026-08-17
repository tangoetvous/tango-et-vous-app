#!/usr/bin/env node
// Régénère preview-emails-cb3x-v1.html À PARTIR du code de worker.js.
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Usage :  node outils/generer-preview-cb3x.js

const path = require('path');
const { construirePage } = require('./_banc-emails.js');
const RACINE = path.join(__dirname, '..');

// Dates relatives : la 2ᵉ échéance tombe 2 mois après le 1er paiement, la 3ᵉ 4 mois après.
const moisAvant = n => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };

const fiche = (donnees, prenom) => ({
  id: 900, prenom: prenom || 'Camille', nom: 'MARTIN', email: 'camille@test.fr',
  ville: 'paris', niveau: 'debutant', donnees,
});

construirePage({
  titre: 'TANGO & VOUS',
  sousTitre: 'Preview — rappels des échéances CB 3×',
  commande: 'node outils/generer-preview-cb3x.js',
  accent: '#1565c0',
  sortie: path.join(RACINE, 'preview-emails-cb3x-v1.html'),
  params: {},
  cas: [
    { id: 'echeance2', titre: 'Rappel — 2ᵉ prélèvement (2 mois après le premier)',
      handler: 'handleCronRelanceCb3x',
      note: "Cron quotidien. Prévient que le deuxième des trois prélèvements va être débité, en rappelant la date. Un marqueur en base évite tout second envoi.",
      body: {},
      tables: [{ match: 'inscriptions_cours?paiement=eq.cb3x', rows: [
        fiche({ datePremierPaiement: moisAvant(2) }) ] }] },

    { id: 'echeance3', titre: 'Rappel — 3ᵉ et dernier prélèvement (4 mois après le premier)',
      handler: 'handleCronRelanceCb3x',
      note: "Même gabarit, avec la mention qu'il s'agit du dernier prélèvement. Une fiche dont les deux échéances sont dues reçoit les deux rappels.",
      body: {},
      tables: [{ match: 'inscriptions_cours?paiement=eq.cb3x', rows: [
        fiche({ datePremierPaiement: moisAvant(4), relance_cb3x_2_sent: true }) ] }] },
  ],
  fin: `<table class="tbl">
    <tr><th>Ce qui déclenche l'envoi</th><th>Règle appliquée par le code</th></tr>
    <tr><td><b>Ciblage</b></td><td><code>inscriptions_cours</code> WHERE <code>paiement = 'cb3x'</code> ET <code>statut = 'inscrit'</code></td></tr>
    <tr><td><b>2ᵉ échéance</b></td><td>aujourd'hui ≥ premier paiement + 2 mois, et le marqueur <code>relance_cb3x_2_sent</code> est absent</td></tr>
    <tr><td><b>3ᵉ échéance</b></td><td>aujourd'hui ≥ premier paiement + 4 mois, et le marqueur <code>relance_cb3x_3_sent</code> est absent</td></tr>
    <tr><td><b>Anti-doublon</b></td><td>chaque envoi réussi pose son marqueur dans <code>donnees</code> — contrairement à la relance d'inscription du 22 août, où l'absence de marqueur est un choix assumé.</td></tr>
    <tr><td><b>Sans date de premier paiement</b></td><td>la fiche est ignorée : aucune échéance ne peut être calculée.</td></tr>
  </table>
  <p style="margin-top:14px;">Aucune notification ni push : ces rappels sont purement informatifs, le prélèvement étant automatique côté AssoConnect.</p>`,
}).catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
