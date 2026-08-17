#!/usr/bin/env node
// Régénère preview-emails-cartes-v1.html À PARTIR du code de worker.js.
//
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Ce script n'écrit AUCUN gabarit à la main : il exécute réellement les handlers
// des cartes de cours via outils/_banc-emails.js, avec Supabase et Brevo simulés.
// Seuls les encadrés « notifications » en fin de page sont rédigés à la main.
//
// Usage :  node outils/generer-preview-cartes.js

const fs = require('fs');
const path = require('path');
const { executer, blocNotifs, CSS_NOTIFS } = require('./_banc-emails.js');

const RACINE = path.join(__dirname, '..');

const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const AUJ = jour(0);
const saisonDe = iso => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const SAI = saisonDe(AUJ);

const LIEN_AC = 'https://le-regard-se-pose.assoconnect.com/exemple';
const PARAMS = {
  'tev_liens_assoconnect': { [SAI]: { cours: LIEN_AC, renouv: LIEN_AC + '-renouv' } },
  // Deux jeudis consécutifs manqués, puis le prochain cours — sert à C6
  'tev_cours_dates': { paris: [jour(-14), jour(-7), jour(7)], vincennes: [jour(-10), jour(-3), jour(4)] },
  ['tev_params_paris_' + SAI]: {
    horaires: { deb: '20h30', deb_fin: '21h45', int: '21h45', int_fin: '23h00' },
    adresse: { nom: 'Espas Danse Studio', rue: '24 villa Riberolle, Paris 20e', transport: 'M° Alexandre Dumas (L2)' },
    livret: { url_deb: 'https://exemple/livret-deb-paris.pdf' },
  },
};

const base = { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN' };
const eleveRow = extra => Object.assign({
  id: 1, email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN',
  carte_restants: 4, carte_utilises: 6, carte_statut: 'Active', carte_paye: true,
  carte_expiration: null, saison: SAI, ville: 'paris', niveau: 'debutant',
}, extra || {});

const CAS = [
  { id: 'c1', titre: 'C1 — Bienvenue au premier pointage de la saison',
    handler: 'handleNotifyCarteBienvenue',
    note: "Envoyé une seule fois, quand vous pointez le tout premier cours d'une carte. Présente le suivi de la carte et l'espace élève.",
    body: { ...base, utilises: 1, restants: 9, expiration: jour(90), cours: 'Paris — Débutant' } },

  { id: 'c2b', titre: "C2b — Carte renouvelée sans payer (par l'admin)",
    handler: 'handleNotifyCarteRenouvellement',
    note: "Envoyé quand vous renouvelez une carte en la laissant « non payée » depuis Cartes → Détails.",
    body: { ...base, source: 'admin', restants: 10, liensAssoConnect: LIEN_AC + '-renouv' } },

  { id: 'c2', titre: 'C2 — Carte renouvelée sans payer (variante « élève »)',
    handler: 'handleNotifyCarteRenouvellement',
    note: "⚠️ <b>Cette variante n'est déclenchée par aucun bouton aujourd'hui</b> : le « Renouveler sans payer » de l'espace élève met bien la carte à jour, mais n'appelle pas cette route. Seule la variante admin ci-dessus part réellement. Le texte ci-dessous est celui que le code produirait.",
    body: { ...base, source: 'eleve', restants: 10, liensAssoConnect: LIEN_AC + '-renouv' } },

  { id: 'cpay', titre: 'C-pay — Paiement de la carte enregistré',
    handler: 'handleNotifyCartePaiement',
    note: "Envoyé quand vous basculez la pastille « ⚠️ Non payée » en « ✓ Payée » puis validez le montant. ⚠️ L'expiration affichée reste celle calculée depuis le <b>premier cours</b>, jamais depuis la date de paiement.",
    body: { ...base, montant: 170, modePaiement: 'Espèces', datePaiement: AUJ, utilises: 3, restants: 7, expiration: jour(60) } },

  { id: 'cepuisee', titre: 'CX-épuisée — Carte arrivée à son dernier cours',
    handler: 'handleNotifyCarteEpuisee',
    note: "Envoyé au pointage qui amène la carte à 0 cours restant, si aucun renouvellement automatique n'a eu lieu.",
    body: { ...base, utilises: 10, restants: 0 } },

  { id: 'creport', titre: 'C-report — Carte reportée sur la saison suivante',
    handler: 'handleNotifyCarteReport',
    note: "Envoyé quand vous cliquez « ↩ Reporter » en fin de saison : les cours restants sont préservés pour la rentrée.",
    body: { ...base, restants: 4, saisonSuivante: '2026-2027' } },

  { id: 'cpe', titre: 'CP-E — Récapitulatif élève, le lendemain matin',
    handler: 'handleCronCartePonteeJ1',
    note: "Cron du matin : regroupe tous les pointages de la veille pour une même personne en un seul email. Les données sont relues dans les notifications en attente, pas recalculées.",
    body: {},
    tables: [{ match: 'notifications_eleve?type=eq.carte_pointee_pending_email', rows: [
      { id: 11, email: 'camille@test.fr', message: JSON.stringify({ prenom: 'Camille', nom: 'MARTIN', date: AUJ, nbAdded: 1, utilises: 5, restants: 5, expiration: jour(45) }) },
      { id: 12, email: 'camille@test.fr', message: JSON.stringify({ prenom: 'Camille', nom: 'MARTIN', date: AUJ, nbAdded: 1, utilises: 6, restants: 4, expiration: jour(45) }) },
    ] }] },

  { id: 'cx', titre: 'CX — Carte expirée avec des cours non utilisés',
    handler: 'handleCronCarteExpiree',
    note: "Cron quotidien : cible les cartes dont la date de validité tombe aujourd'hui alors qu'il reste des cours.",
    body: {},
    tables: [{ match: 'eleves?carte_expiration=eq.', rows: [
      eleveRow({ carte_utilises: 6, carte_restants: 4, carte_expiration: AUJ }) ] }] },

  { id: 'c4', titre: 'C4 — Fin de saison : il vous reste des cours',
    handler: 'handleCronFinSaisonC4', aides: ['_emailsInscritsActifs'],
    note: "Cron du lendemain du dernier cours de juin. ⚠️ <b>Quadruple ciblage</b> : cours restants, carte non expirée, carte payée, et inscription encore active dans la saison.",
    body: { force: true },
    tables: [
      { match: 'eleves?carte_restants=gt.0', rows: [eleveRow({ carte_restants: 4 })] },
      { match: 'inscriptions_cours?saison=eq.', rows: [{ email: 'camille@test.fr' }] },
      { match: 'inscriptions_cours?statut=eq.attente_paiement', rows: [] },
    ] },

  { id: 'c5', titre: 'C5 — Dernier rappel du 25 août',
    handler: 'handleCronFinSaisonC5', aides: ['_emailsInscritsActifs'],
    note: "Même ciblage que C4, ton plus pressant : les cours restants expirent à la fin du mois.",
    body: {},
    tables: [
      { match: 'eleves?carte_restants=gt.0', rows: [eleveRow({ carte_restants: 4 })] },
      { match: 'inscriptions_cours?saison=eq.', rows: [{ email: 'camille@test.fr' }] },
    ] },

  { id: 'c6', titre: 'C6 — Deux absences consécutives',
    handler: 'handleCronRelanceAbsences',
    note: "Cron du vendredi (Paris) et du mardi (Vincennes). Ton informel, volontairement bienveillant. Part même si l'absence a été déclarée. Un marqueur en base évite de renvoyer le même message pour les deux mêmes dates.",
    body: { ville: 'paris' },
    tables: [
      { match: 'eleves?carte_statut=in.', rows: [eleveRow({ carte_restants: 6 })] },
      { match: 'inscriptions_cours?statut=eq.inscrit', rows: [{ email: 'camille@test.fr' }] },
      { match: 'presences?eleve_id=eq.', rows: [] },   // aucune présence sur les 2 dates → relance
    ] },

  { id: 'p1', titre: "P1 — Invitation à activer l'espace élève (J+7)",
    handler: 'handleCronEspaceEleveActivation',
    note: "Envoyé une semaine après la validation du paiement, pour laisser le temps de souffler avant de proposer l'installation de l'appli.",
    body: {},
    tables: [{ match: 'inscriptions_cours?statut=eq.inscrit', rows: [
      { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', ville: 'paris', niveau: 'debutant', saison: SAI } ] }] },
];

const ech = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  let sections = '', nav = '', total = 0;
  for (const c of CAS) {
    const params = c.tables ? { ...PARAMS, __tables: c.tables } : PARAMS;
    const mails = await executer(c.handler, c.body, params, c.aides || []);
    total += mails.length;
    nav += `<a href="#${c.id}">${ech(c.titre.split('—')[0].trim())}</a>`;
    sections += `<div class="pv-titre" id="${c.id}">${ech(c.titre)}</div>
<div class="pv-com">${c.note} <span class="pv-h">Handler : <code>${c.handler}</code> · ${mails.length} email(s) envoyé(s).</span></div>`;
    if (!mails.length) {
      sections += `<div class="pv-com" style="color:#b71c1c;">⚠️ Aucun email produit avec ces données d'exemple — à vérifier.</div>`;
    }
    for (const m of mails) {
      const admin = /tangoetvous@gmail\.com/.test(m.to);
      sections += `<div class="pv-dest">${admin ? '📥 Email ADMIN' : '📧 Email ÉLÈVE'} → <code>${ech(m.to)}</code></div>
<div class="pv-sujet"><strong>Objet :</strong> ${ech(m.subject)}</div>
<div class="pv-mail">${m.html}</div>`;
    }
  }

  const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview — Emails Cartes de cours</title>
<style>
body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
.pv-head { background:#111; border-bottom:3px solid #D4AF37; padding:22px 24px; text-align:center; }
.pv-head h1 { font-family:Georgia,serif; font-size:20px; font-weight:300; letter-spacing:5px; color:#D4AF37; margin:0; }
.pv-head p { font-size:12px; color:#888; margin:8px 0 0; }
.pv-gen { background:#0d2b0d; color:#a5d6a7; font-size:12px; text-align:center; padding:9px 16px; border-bottom:1px solid #1b5e20; line-height:1.6; }
.pv-gen code { color:#fff; }
.pv-nav { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; padding:12px 16px; background:#0a0a0a; position:sticky; top:0; z-index:10; }
.pv-nav a { color:#D4AF37; text-decoration:none; font-size:11px; border:1px solid #3a2f00; padding:5px 12px; border-radius:20px; }
.pv-titre { max-width:660px; margin:38px auto 0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#333; padding:10px 20px; border-left:4px solid #2e7d32; }
.pv-com { max-width:660px; margin:0 auto; font-size:13px; color:#555; padding:12px 20px; line-height:1.7; background:#fff; }
.pv-h { display:block; margin-top:6px; color:#8B6914; font-size:12px; }
.pv-dest { max-width:660px; margin:16px auto 0; font-size:12px; color:#333; background:#eceff1; padding:7px 16px; border-radius:6px 6px 0 0; font-weight:700; }
.pv-sujet { max-width:660px; margin:0 auto; font-size:13px; background:#eef7ee; border-left:4px solid #2e7d32; padding:10px 16px; color:#123; }
.pv-mail { max-width:600px; margin:10px auto 0; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.12); }
.pv-fin { max-width:660px; margin:40px auto 0; background:#fff; padding:18px 20px; font-size:13px; color:#444; line-height:1.8; border-top:3px solid #D4AF37; }
.pv-fin b { color:#8B6914; }
table.tbl { width:100%; border-collapse:collapse; font-size:13px; margin-top:10px; }
table.tbl th { text-align:left; padding:8px; background:#eee; }
table.tbl td { padding:8px; border-top:1px solid #ddd; vertical-align:top; }
${CSS_NOTIFS}
</style>
</head>
<body>

<div class="pv-head">
  <h1>TANGO &amp; VOUS</h1>
  <p>Preview — emails des cartes de cours</p>
</div>
<div class="pv-gen">✅ Page <b>générée automatiquement</b> en exécutant les handlers de <code>worker.js</code> (Supabase et Brevo simulés) —
ce que vous voyez est exactement ce que reçoivent les destinataires.<br>Régénérer avec <code>node outils/generer-preview-cartes.js</code></div>
<div class="pv-nav">${nav}<a href="#absents">Emails absents</a><a href="#notifs">🔔 Notifications</a></div>

${sections}

<div class="pv-titre" id="absents" style="border-left-color:#c62828;">Ce que les anciennes maquettes annonçaient et qui n'existe pas</div>
<div class="pv-com">
  <table class="tbl">
    <tr><th>Ancienne section</th><th>Réalité dans le code</th></tr>
    <tr><td><b>C3</b> — « renouvellement marqué payé »</td>
        <td>Renouveler une carte en cochant « Payé » <b>n'envoie aucun email</b> : la seule notification du renouvellement est C2b, réservée au cas « non payée ».</td></tr>
    <tr><td><b>C2</b> — variante « élève »</td>
        <td>Le branchement existe dans le worker mais <b>aucun bouton ne l'appelle</b> : le « Renouveler sans payer » de l'espace élève met la carte à jour sans prévenir personne.</td></tr>
    <tr><td><b>CP-A</b> — « récap admin au pointage »</td>
        <td>Ce n'est <b>pas un email</b> : au pointage, le worker pose seulement la notification in-app de l'élève, met CP-E en file pour le lendemain matin, et envoie un push. Rien n'arrive dans votre boîte.</td></tr>
  </table>
  <p style="margin-top:14px;">Ces deux points sont à trancher : soit on branche l'email manquant, soit on retire la variante morte. Rien n'est modifié pour l'instant.</p>
</div>

<div class="pv-titre" id="notifs" style="border-left-color:#5c9dc2;">Notifications — toast, panel 🔔 et push OS</div>
${blocNotifs('notifs-cartes.html')}

<div class="pv-fin">
  <p><b>Taille de la carte</b> — jamais écrite en dur : partout <code>utilisés + restants</code>, avec 10 comme filet.
     Une carte de 20 cours affiche donc « /20 » sans modification de code.</p>
  <p><b>Dates d'exemple</b> — relatives à aujourd'hui (${AUJ}), pour que les crons se comportent comme en vrai.
     ${total} emails produits pour cette page.</p>
</div>

</body>
</html>
`;
  const sortie = path.join(RACINE, 'preview-emails-cartes-v1.html');
  fs.writeFileSync(sortie, page);
  console.log(`✅ preview-emails-cartes-v1.html régénérée — ${CAS.length} cas, ${total} emails`);
})().catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
