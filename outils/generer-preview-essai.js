#!/usr/bin/env node
// Régénère preview-emails-essai-v2.html À PARTIR du code de worker.js.
//
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Ce script n'écrit AUCUN gabarit à la main : il exécute réellement les handlers
// des cours d'essai tango via outils/_banc-emails.js, avec Supabase et Brevo simulés.
// Seuls les encadrés « notifications » en fin de page sont rédigés à la main.
//
// Usage :  node outils/generer-preview-essai.js

const fs = require('fs');
const path = require('path');
const { executer, blocNotifs, CSS_NOTIFS } = require('./_banc-emails.js');

const RACINE = path.join(__dirname, '..');

// ⚠️ Dates RELATIVES : le choix E1/E6 dépend du délai réel (isClose = J-7 ou moins).
const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const saisonDe = iso => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };

const D_LOIN   = jour(20);   // > 7 jours → E1 (rappel J-7 annoncé)
const D_PROCHE = jour(3);    // ≤ 7 jours → E6 (bouton 👍 tout de suite)
const D_J7     = jour(7);    // rappel J-7
const D_HIER   = jour(-1);   // lendemain du cours → E-J1a / E-J1b

const PARAMS = {};
for (const s of new Set([D_LOIN, D_PROCHE, D_J7, D_HIER].map(saisonDe))) {
  PARAMS['tev_params_paris_' + s] = {
    horaires: { deb: '20h30', deb_fin: '21h45', int: '21h45', int_fin: '23h00' },
    adresse: { nom: 'Espas Danse Studio', rue: '24 villa Riberolle, Paris 20e', transport: 'M° Alexandre Dumas (L2)' },
    livret: { url_deb: 'https://exemple/livret-deb-paris.pdf', url_int: 'https://exemple/livret-int-paris.pdf' },
  };
  PARAMS['tev_params_vincennes_' + s] = {
    horaires: { deb: '19h30', deb_fin: '21h00', int: '21h00', int_fin: '22h30' },
    adresse: { nom: 'Espace Sorano', rue: '16 rue Charles Pathé, 94300 Vincennes', transport: 'RER A — Vincennes' },
    livret: { url_deb: 'https://exemple/livret-deb-vincennes.pdf' },
  };
}
PARAMS['tev_cours_dates'] = { paris: [D_LOIN, D_PROCHE, D_J7], vincennes: [D_LOIN] };

const base = { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', tel: '0612345678' };
const insc = (date, extra) => Object.assign({
  ...base, role: 'guideur', ville: 'paris', niveau: 'debutant', dateIso: date, statut: 'confirme',
}, extra || {});

const CAS = [
  { id: 'e1', titre: 'E0 + E1 — Inscription confirmée (plus de 7 jours avant)',
    handler: 'handleNotifyInscriptionEssai',
    note: "Cas courant. Vous recevez E0, l'élève reçoit E1 : encadré du cours, livret de son niveau, et l'annonce du rappel J-7 — donc <b>pas</b> de bouton de confirmation à ce stade. Depuis 2026-08-28, la remarque éventuelle du formulaire apparaît dans E0 (ligne 💬 du tableau, « — » si vide).",
    body: { ...insc(D_LOIN), remarque: "Je viens avec ma sœur mais elle n'est pas sûre de pouvoir — je confirme au plus vite !" } },

  { id: 'e6', titre: 'E6 — Inscription confirmée (moins de 7 jours avant)',
    handler: 'handleNotifyInscriptionEssai',
    note: "Le rappel J-7 ne partira plus : le bouton « 👍 Je confirme ma présence » est donc placé directement dans l'email de confirmation, et l'intro annonce le jour du cours.",
    body: insc(D_PROCHE) },

  { id: 'e2', titre: "E2 — Guidée seule : mise en liste d'attente (parité)",
    handler: 'handleNotifyInscriptionEssai',
    note: "Une guidée sans partenaire part systématiquement en attente, le temps d'équilibrer les rôles. L'email explique la parité et propose des options.",
    body: insc(D_LOIN, { prenom: 'Alex', nom: 'DUPONT', email: 'alex@test.fr', role: 'guidee', statut: 'attente' }) },

  { id: 'e5', titre: 'E5 — Guideur seul : créneau complet pour son rôle',
    handler: 'handleNotifyInscriptionEssai',
    note: "Même email que E2, mais l'encadré de VOTRE notification porte un libellé différent (« cours complet guideurs ») : c'est le quota qui bloque, pas la parité. Le quota n'est actif qu'en septembre, octobre et novembre.",
    body: insc(D_LOIN, { role: 'guideur', statut: 'attente' }) },

  { id: 'e1couple', titre: 'E1 — En couple, deux adresses email',
    handler: 'handleNotifyInscriptionEssai',
    note: "Chacun reçoit son propre email, avec son rôle et le prénom de l'autre. Votre notification, elle, réunit les deux dans un seul encadré sous une bannière violette « 👫 En couple ».",
    body: insc(D_LOIN, { enCouple: true, partPrenom: 'Alex', partNom: 'MARTIN', partEmail: 'alex@test.fr', partRole: 'guidee' }) },

  { id: 'e1partage', titre: 'E1 — En couple, une seule adresse email',
    handler: 'handleNotifyInscriptionEssai',
    note: "Quand les deux partagent une adresse, un seul email part — inutile d'en envoyer deux au même destinataire.",
    body: insc(D_LOIN, { enCouple: true, partPrenom: 'Alex', partNom: 'MARTIN', partEmail: 'camille@test.fr', partRole: 'guidee' }) },

  { id: 'e1vinc', titre: 'E1 — Vincennes, niveau intermédiaire',
    handler: 'handleNotifyInscriptionEssai',
    note: "L'adresse, l'horaire et le livret suivent la ville et le niveau, tous relus dans les Paramètres au moment de l'envoi.",
    body: insc(D_LOIN, { ville: 'vincennes', niveau: 'intermediaire' }) },

  { id: 'e4', titre: 'E4 — Rappel automatique 7 jours avant',
    handler: 'handleCronEssaiRappelJ7',
    note: "Cron quotidien. Contient le bouton « 👍 Je confirme ma présence » et les liens pour annuler ou reporter.",
    body: { date: D_J7 },
    tables: [{ match: 'inscriptions_essai?date_essai=eq.', rows: [
      { id: 101, email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', ville: 'paris', niveau: 'debutant', date_essai: D_J7, role: 'guideur', statut: 'confirme' },
    ] }] },

  { id: 'e15', titre: "E15 — Vous validez une personne en attente (plus de 7 jours avant)",
    handler: 'handleNotifyEssaiValide',
    note: "Envoyé quand vous confirmez une inscription qui était en liste d'attente. Annonce le rappel J-7 à venir.",
    body: { ...base, role: 'guidee', ville: 'paris', niveau: 'debutant', dateEssai: D_LOIN, partenaire: '', id: 101 } },

  { id: 'e15b', titre: 'E15b — Vous validez une personne en attente (moins de 7 jours avant)',
    handler: 'handleNotifyEssaiValide',
    note: "Même email, mais avec le bouton « 👍 Je confirme ma présence » puisqu'aucun rappel ne partira plus.",
    body: { ...base, role: 'guidee', ville: 'paris', niveau: 'debutant', dateEssai: D_PROCHE, partenaire: '', id: 102 } },

  { id: 'ej1a', titre: 'E-J1a — Le lendemain, la personne était présente',
    handler: 'handleCronEssaiJ1',
    note: "Cron du matin, uniquement pour les personnes que vous avez pointées ✓ Présent. Explique le parcours d'inscription et renvoie vers le formulaire. Volontairement <b>aucun lien vers un autre cours d'essai</b> : l'essai n'a lieu qu'une fois.",
    body: { date: D_HIER },
    tables: [{ match: 'inscriptions_essai?date_essai=eq.', rows: [
      { id: 201, prenom: 'Camille', nom: 'MARTIN', email: 'camille@test.fr', ville: 'paris', niveau: 'debutant', presence_declaree: true },
    ] }] },

  { id: 'ej1b', titre: 'E-J1b — Le lendemain, la personne était absente',
    handler: 'handleCronEssaiJ1',
    note: "Pour les personnes pointées 🚫 Absent. Ton bienveillant, sans reproche, et bouton pour choisir une nouvelle date — l'essai n'a pas eu lieu. ⚠️ Les personnes <b>non pointées</b> ne reçoivent rien.",
    body: { date: D_HIER },
    tables: [{ match: 'inscriptions_essai?date_essai=eq.', rows: [
      { id: 202, prenom: 'Alex', nom: 'DUPONT', email: 'alex@test.fr', ville: 'paris', niveau: 'debutant', presence_declaree: false },
    ] }] },

  { id: 'emod', titre: "E-mod — Vous déplacez un essai (date, ville ou niveau)",
    handler: 'handleNotifyEssaiAction',
    note: "Envoyé quand vous changez la date, la ville ou le niveau d'un essai depuis la fiche (✏️). Vous en recevez un récapitulatif, l'élève reçoit le sien, et le partenaire aussi si son adresse est renseignée et différente. Une notification in-app est posée en parallèle pour chacun. L'appel part de <code>_notifEssaiEdit</code>, après la mise à jour réussie en base.",
    body: { ...base, action: 'edit-essai', role: 'guideur',
            oldDate: D_LOIN, oldVille: 'paris', oldNiveau: 'debutant',
            newDate: D_PROCHE, newVille: 'vincennes', newNiveau: 'intermediaire' } },

  { id: 'ecancel', titre: "E-cancel — Vous supprimez une inscription d'essai",
    handler: 'handleNotifyEssaiAnnuleAdmin',
    note: "Envoyé quand vous supprimez une fiche depuis l'onglet Essai Tango. ⚠️ <b>Incohérence de vocabulaire</b> : le sujet et le bandeau annoncent « inscription <b>modifiée</b> » alors que le texte dit « a été <b>annulée</b> par notre équipe ». À trancher — soit c'est un adoucissement volontaire pour la boîte de réception, soit il faut aligner les deux sur « annulée ».",
    body: { ...base, date_essai: D_LOIN, ville: 'paris', niveau: 'debutant' } },
];

const ech = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtJ = iso => { const d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' ' + ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'][d.getMonth()] + ' ' + d.getFullYear(); };

(async () => {
  let sections = '', nav = '', total = 0;
  for (const c of CAS) {
    const params = c.tables ? { ...PARAMS, __tables: c.tables } : PARAMS;
    const mails = await executer(c.handler, c.body, params, c.aides || []);
    total += mails.length;
    nav += `<a href="#${c.id}">${ech(c.titre.split('—')[0].trim())}</a>`;
    sections += `<div class="pv-titre" id="${c.id}">${ech(c.titre)}</div>
<div class="pv-com">${c.note} <span class="pv-h">Handler : <code>${c.handler}</code> · ${mails.length} email(s) envoyé(s).</span></div>`;
    if (!mails.length) sections += `<div class="pv-com" style="color:#b71c1c;">⚠️ Aucun email produit avec ces données d'exemple — à vérifier.</div>`;
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
<title>Preview — Emails Cours d'essai tango</title>
<style>
body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
.pv-head { background:#111; border-bottom:3px solid #D4AF37; padding:22px 24px; text-align:center; }
.pv-head h1 { font-family:Georgia,serif; font-size:20px; font-weight:300; letter-spacing:5px; color:#D4AF37; margin:0; }
.pv-head p { font-size:12px; color:#888; margin:8px 0 0; }
.pv-gen { background:#0d2b0d; color:#a5d6a7; font-size:12px; text-align:center; padding:9px 16px; border-bottom:1px solid #1b5e20; line-height:1.6; }
.pv-gen code { color:#fff; }
.pv-nav { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; padding:12px 16px; background:#0a0a0a; position:sticky; top:0; z-index:10; }
.pv-nav a { color:#D4AF37; text-decoration:none; font-size:11px; border:1px solid #3a2f00; padding:5px 12px; border-radius:20px; }
.pv-titre { max-width:660px; margin:38px auto 0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#333; padding:10px 20px; border-left:4px solid #D4AF37; }
.pv-com { max-width:660px; margin:0 auto; font-size:13px; color:#555; padding:12px 20px; line-height:1.7; background:#fff; }
.pv-h { display:block; margin-top:6px; color:#8B6914; font-size:12px; }
.pv-dest { max-width:660px; margin:16px auto 0; font-size:12px; color:#333; background:#eceff1; padding:7px 16px; border-radius:6px 6px 0 0; font-weight:700; }
.pv-sujet { max-width:660px; margin:0 auto; font-size:13px; background:#fdf7e6; border-left:4px solid #D4AF37; padding:10px 16px; color:#3a2f00; }
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
  <p>Preview — emails des cours d'essai tango</p>
</div>
<div class="pv-gen">✅ Page <b>générée automatiquement</b> en exécutant les handlers de <code>worker.js</code> (Supabase et Brevo simulés) —
ce que vous voyez est exactement ce que reçoivent les destinataires.<br>Régénérer avec <code>node outils/generer-preview-essai.js</code></div>
<div class="pv-nav">${nav}<a href="#absents">Emails absents</a><a href="#notifs">🔔 Notifications</a></div>

${sections}

<div class="pv-titre" id="absents" style="border-left-color:#c62828;">Ce que les anciennes maquettes annonçaient et qui n'existe pas</div>
<div class="pv-com">
  <table class="tbl">
    <tr><th>Ancienne section</th><th>Réalité dans le code</th></tr>
    <tr><td><b>E7</b></td>
        <td>N'a jamais été un email distinct : c'est E6, l'ancienne page en gardait le nom pour la clarté.</td></tr>
    <tr><td><b>E5b</b> — « couple, un seul rôle complet »</td>
        <td>Aucune variante dédiée : les deux partenaires reçoivent l'email de liste d'attente ordinaire. Seul le libellé de VOTRE notification distingue le cas.</td></tr>
  </table>
</div>

<div class="pv-titre" id="notifs" style="border-left-color:#5c9dc2;">Notifications — toast, panel 🔔 et push OS</div>
${blocNotifs('notifs-essai.html')}

<div class="pv-fin">
  <table class="tbl">
    <tr><th>Ce qui détermine la variante</th><th>Règle appliquée par le code</th></tr>
    <tr><td><b>E1 ou E6</b></td><td><code>daysUntil &lt;= 7</code> → pas de mention du rappel, bouton « 👍 Je confirme ma présence » ajouté</td></tr>
    <tr><td><b>Liste d'attente</b></td><td><code>statut !== 'confirme'</code> — décidé par le formulaire : guidée seule toujours, guideur seul seulement si le quota est atteint <b>en septembre, octobre ou novembre</b></td></tr>
    <tr><td><b>Un ou deux emails</b></td><td>le partenaire reçoit le sien si son adresse est renseignée <b>et différente</b></td></tr>
    <tr><td><b>Gratuité</b></td><td>recalculée <b>côté serveur</b> : cours de septembre gratuits pour les débutants — le drapeau envoyé par le formulaire n'est pas cru sur parole</td></tr>
  </table>
  <p style="margin-top:16px;"><b>Dates d'exemple</b> — relatives à aujourd'hui, car le choix E1/E6 dépend du délai réel :
     cours « lointain » le ${fmtJ(D_LOIN)}, cours « proche » le ${fmtJ(D_PROCHE)}, rappel J-7 pour le ${fmtJ(D_J7)},
     lendemain de cours pour le ${fmtJ(D_HIER)}. ${total} emails produits pour cette page.</p>
</div>

</body>
</html>
`;
  const sortie = path.join(RACINE, 'preview-emails-essai-v2.html');
  fs.writeFileSync(sortie, page);
  console.log(`✅ preview-emails-essai-v2.html régénérée — ${CAS.length} cas, ${total} emails`);
})().catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
