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
  absentsTitre: 'Écarts constatés dans le code',
  absentsOnglet: 'Écarts',
  absents: `<table class="tbl">
    <tr><th>Constat</th><th>Détail</th></tr>
    <tr><td><b>⚠️ Codes bruts au lieu des libellés</b></td>
        <td>Dans les <b>deux</b> emails, le tableau affiche les valeurs techniques du formulaire : <code>jeremy</code> au lieu de « Jérémy BRAITBART », <code>1an</code> au lieu de « 1 an — bases acquises », <code>passer-cap, choregraphie</code> au lieu de « 🎯 Passer un cap, 💍 Chorégraphie ». La correspondance existe pourtant, écrite noir sur blanc dans la documentation du projet. Lisible pour vous qui connaissez les codes ; beaucoup moins pour la personne qui reçoit son accusé de réception. <b>À corriger si vous le souhaitez</b> — c'est un changement d'affichage seulement.</td></tr>
    <tr><td><b>Nom du professeur dans l'objet</b></td>
        <td>« Braitbart demandé » (nom de famille) face à « Florencia demandé » (prénom) : les deux ne suivent pas la même convention.</td></tr>
  </table>`,
  fin: `<table class="tbl">
    <tr><th>Point de vigilance</th><th>Détail</th></tr>
    <tr><td><b>Pas de push côté demandeur</b></td><td>Les personnes qui demandent un cours particulier ne sont pas forcément élèves et n'ont pas l'appli : elles reçoivent l'email, rien d'autre.</td></tr>
    <tr><td><b>Objectifs</b></td><td>transmis sous forme d'identifiants joints par des virgules (<code>passer-cap, choregraphie</code>) — c'est ce que le formulaire envoie, et l'email les affiche tels quels.</td></tr>
    <tr><td><b>Disponibilités</b></td><td>texte multiligne construit par le formulaire (Jours / Horaires / Dates proposées / Autres), repris à l'identique.</td></tr>
  </table>`,
}).catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
