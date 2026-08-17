#!/usr/bin/env node
// Régénère preview-emails-cp-v1.html À PARTIR du code de worker.js.
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Usage :  node outils/generer-preview-cp.js

const path = require('path');
const { construirePage } = require('./_banc-emails.js');
const RACINE = path.join(__dirname, '..');

const base = { email: 'sophie@test.fr', prenom: 'Sophie', nom: 'MARTIN', tel: '0612345678' };

construirePage({
  titre: 'TANGO & VOUS',
  sousTitre: 'Preview — emails des demandes de cours particuliers',
  commande: 'node outils/generer-preview-cp.js',
  accent: '#9c27b0',
  sortie: path.join(RACINE, 'preview-emails-cp-v1.html'),
  params: {},
  notifs: 'notifs-cp.html',
  cas: [
    { id: 'cp0', titre: 'CP0 + CP1 — Demande de cours particulier',
      handler: 'handleNotifyCoursParticulier',
      note: "Un seul envoi produit les deux emails : le vôtre, avec toutes les informations et les boutons d'action, et l'accusé de réception adressé à la personne. Les valeurs affichées sont celles saisies dans le formulaire public.",
      body: { ...base, prof: 'jeremy', duree: '1h30', lieu: 'Nation — Paris',
              objectifs: 'passer-cap, choregraphie', niveauEleve: '1an',
              dispoTexte: 'Jours : Lundi, Mercredi\nHoraires : 19h – 21h',
              remarque: 'Nous préparons une ouverture de bal pour juin.', urgence: 'haute' } },

    { id: 'cp0normal', titre: "CP0 — Sans urgence, à domicile, objectif unique",
      handler: 'handleNotifyCoursParticulier',
      note: "Pour comparaison : sans le drapeau d'urgence, le bandeau rouge disparaît de votre email. Le lieu « à domicile » ajoute le code postal saisi.",
      body: { ...base, prenom: 'Alex', nom: 'DUPONT', email: 'alex@test.fr',
              prof: 'les-deux', duree: '1 heure', lieu: 'À domicile (94300)',
              objectifs: 'decouverte', niveauEleve: 'debutant',
              dispoTexte: 'Dates proposées : les week-ends de mars', remarque: '', urgence: '' } },
  ],
  fin: `<table class="tbl">
    <tr><th>Point de vigilance</th><th>Détail</th></tr>
    <tr><td><b>Pas de push côté demandeur</b></td><td>Les personnes qui demandent un cours particulier ne sont pas forcément élèves et n'ont pas l'appli : elles reçoivent l'email, rien d'autre.</td></tr>
    <tr><td><b>Libellés</b></td><td>le formulaire transmet des identifiants (<code>jeremy</code>, <code>1an</code>, <code>passer-cap</code>) ; depuis le 2026-08-17 les deux emails les traduisent en clair (« Jérémy Braitbart », « 1 an — bases acquises », « 🎯 Passer un cap »). Une valeur inconnue est affichée telle quelle plutôt que perdue.</td></tr>
    <tr><td><b>Disponibilités</b></td><td>texte multiligne construit par le formulaire (Jours / Horaires / Dates proposées / Autres), repris à l'identique.</td></tr>
  </table>`,
}).catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
