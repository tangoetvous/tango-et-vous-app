#!/usr/bin/env node
// Régénère preview-emails-devis-v1.html À PARTIR du code de worker.js.
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Usage :  node outils/generer-preview-devis.js

const path = require('path');
const { construirePage } = require('./_banc-emails.js');
const RACINE = path.join(__dirname, '..');

const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const contact = {
  civilite: 'Mme', prenom: 'Agnès', nom: 'MOREAU',
  email: 'agnes@test.fr', telephone: '0612345678',
};

construirePage({
  titre: 'TANGO & VOUS',
  sousTitre: 'Preview — emails des demandes de devis',
  commande: 'node outils/generer-preview-devis.js',
  accent: '#26a69a',
  sortie: path.join(RACINE, 'preview-emails-devis-v1.html'),
  params: {},
  notifs: 'notifs-devis.html',
  cas: [
    { id: 'd0a', titre: 'D0a + D2 — Demande pour un événement',
      handler: 'handleDemandeDevis', aides: ['sendBrevoNotification', 'sbFetch', 'authHeaders'],
      note: "Le formulaire public produit deux emails d'un coup : le vôtre, avec la fiche complète et les boutons d'action, et l'accusé de réception envoyé à la personne.",
      body: { ...contact, mode: 'event', type_contact: 'particulier',
              prestations_ids: ['demo-tango', 'initiation'],
              prestations_labels: ['Démonstration de tango', 'Initiation collective'],
              type_evenement: 'Mariage', date_evenement: jour(120), date_flexible: false,
              horaire_evenement: '20h30, après le dîner', lieu: 'Domaine de la Roseraie',
              code_postal: '77000', nombre_invites: '80', duree_prestation: '1 heure',
              budget: '800 – 1200 €', message: 'Nous aimerions une démonstration puis une initiation pour les invités.',
              comment_connu: 'Bouche à oreille' } },

    { id: 'd0b', titre: 'D0b + D2 — Demande de cours privé (société)',
      handler: 'handleDemandeDevis', aides: ['sendBrevoNotification', 'sbFetch', 'authHeaders'],
      note: "En mode « cours privé », la fiche change de champs : niveau, professeur souhaité, nombre de cours, disponibilités. Le bloc de facturation apparaît quand la demande vient d'une société.",
      body: { ...contact, prenom: 'Karim', nom: 'BENALI', email: 'karim@test.fr',
              mode: 'private', type_contact: 'societe', nom_societe: 'Studio Nord SAS',
              adresse_facturation: '12 rue des Lilas, 75020 Paris',
              prestations_ids: ['cours-particulier'], prestations_labels: ['Cours particulier'],
              type_demande: 'Cours réguliers', pour_qui: 'Un couple', niveau_tango: 'Débutant',
              date_butoir: jour(45), date_butoir_flexible: true, professeur: 'Florencia & Jérémy',
              lieu_cours: 'Dans vos locaux', commune_domicile: '75020', duree_cours: '1h30',
              nombre_cours: '5', dates_periodes: 'Mardis et jeudis en soirée',
              budget: 'À définir', message: 'Formation pour notre séminaire annuel.', comment_connu: 'Google' } },
  ],
  absentsTitre: "Ce que les anciennes maquettes annonçaient et qui n'existe pas",
  absents: `<table class="tbl">
    <tr><th>Ancienne section</th><th>Réalité dans le code</th></tr>
    <tr><td><b>D1</b> — « email d'envoi du devis »</td>
        <td>Ce n'est <b>pas un email envoyé par l'application</b>. Le bouton « ✉️ Email » de la liste des devis ouvre un <b>brouillon Gmail</b> pré-rempli, que vous complétez et envoyez vous-même. Rien ne part automatiquement, et rien n'est donc reproductible ici.</td></tr>
    <tr><td><b>D0a et D0b présentés comme deux emails distincts</b></td>
        <td>C'est un seul et même gabarit : le mode (événement ou cours privé) ne change que la liste des champs affichés dans la fiche.</td></tr>
  </table>`,
  fin: `<table class="tbl">
    <tr><th>Point de vigilance</th><th>Détail</th></tr>
    <tr><td><b>Numéro de devis</b></td><td>aucun n'apparaît dans ces emails : la demande arrive avant toute création de devis. Le numéro n'est réservé qu'au moment où vous cliquez « 📋 Créer un devis ».</td></tr>
    <tr><td><b>Pas de push côté demandeur</b></td><td>les contacts occasionnels n'ont pas l'appli ; seul l'email leur parvient.</td></tr>
    <tr><td><b>Enregistrement en base</b></td><td>la demande est écrite dans <code>demandes_devis</code> avant l'envoi des emails ; un échec d'envoi ne fait donc jamais perdre la demande.</td></tr>
  </table>`,
}).catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
