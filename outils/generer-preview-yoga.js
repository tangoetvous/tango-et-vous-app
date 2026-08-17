#!/usr/bin/env node
// Régénère preview-emails-yoga-v1.html À PARTIR du code de worker.js.
//
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Ce script n'écrit AUCUN gabarit à la main : il exécute réellement les handlers
// yoga via outils/_banc-emails.js, avec Supabase et Brevo simulés.
// Seuls les encadrés « notifications » en fin de page sont rédigés à la main.
//
// Usage :  node outils/generer-preview-yoga.js

const fs = require('fs');
const path = require('path');
const { executer, blocNotifs, CSS_NOTIFS } = require('./_banc-emails.js');

const RACINE = path.join(__dirname, '..');

const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const saisonDe = iso => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };

const D_LOIN = jour(20);
const D_J3   = jour(3);
const D_HIER = jour(-1);
const SAI    = saisonDe(D_LOIN);
const SAI_SUIV = (() => { const [a, b] = SAI.split('-').map(Number); return `${a + 1}-${b + 1}`; })();

// Le cron de fin de saison calcule sa saison depuis la date du jour, pas depuis
// nos dates d'exemple : on renseigne le lien pour toutes les saisons plausibles.
const _sAuj = saisonDe(jour(0));
const _suiv = sa => { const [a, b] = sa.split('-').map(Number); return `${a + 1}-${b + 1}`; };
const _liens = {};
for (const sa of new Set([SAI, SAI_SUIV, _sAuj, _suiv(_sAuj)])) {
  _liens[sa] = { yoga: 'https://le-regard-se-pose.assoconnect.com/exemple-yoga-' + sa };
}
const PARAMS = { 'tev_liens_assoconnect': _liens };
for (const s of new Set([D_LOIN, D_J3, D_HIER].map(saisonDe))) {
  PARAMS['tev_params_yoga_' + s] = {
    horaires: { yin: '10h30', yin_fin: '11h30', hatha: '11h45', hatha_fin: '12h45' },
    adresse: { nom: 'Espace Sorano', rue: '16 rue Charles Pathé, 94300 Vincennes', transport: 'RER A — Vincennes' },
    livret: { url_yin: 'https://exemple/livret-yin.pdf', url_hatha: 'https://exemple/livret-hatha.pdf' },
    tarifs: { yoga_essai: 15, yoga_forfait_1cours: 340, yoga_forfait_2cours: 500 },
  };
}
PARAMS['tev_cours_dates'] = { yoga: [D_J3, D_LOIN] };

const base = { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', tel: '0612345678' };

const CAS = [
  { id: 'y1', titre: 'Y0 + Y1 — Essai yoga confirmé automatiquement',
    handler: 'handleNotifyInscriptionEssaiYoga',
    note: "Il n'y a <b>pas de validation manuelle</b> en yoga : dès qu'une place est libre, l'inscription est confirmée et Y1 part immédiatement. Vous recevez Y0 en parallèle, à l'adresse yoga.",
    body: { ...base, cours: 'yin', dateIso: D_LOIN, statut: 'confirme', gratuit: false } },

  { id: 'y1gratuit', titre: 'Y1 — Essai gratuit (les deux premiers cours de septembre)',
    handler: 'handleNotifyInscriptionEssaiYoga',
    note: "Même email, avec la mention de gratuité. Le tarif affiché sinon vient de <code>tev_params_yoga_&lt;saison&gt;.tarifs.yoga_essai</code> — aucun montant n'est écrit en dur.",
    body: { ...base, cours: 'hatha', dateIso: D_LOIN, statut: 'confirme', gratuit: true } },

  { id: 'yatt', titre: 'Y-att — Le cours régulier est complet (liste d\'attente)',
    handler: 'handleNotifyInscriptionEssaiYoga',
    note: "Quand le cours affiche déjà 14 inscrits sur la saison. L'email explique la limite de 14 participants et qu'une place peut se libérer. Pas de livret à ce stade : la place n'est pas acquise.",
    body: { ...base, cours: 'yin', dateIso: D_LOIN, statut: 'attente', gratuit: false } },

  { id: 'y3', titre: 'Y3 — Rappel automatique 3 jours avant',
    handler: 'handleCronEssaiYogaRappelJ3',
    note: "Cron quotidien. Bouton « 👍 Je confirme ma présence » et encadré demandant de prévenir en cas d'empêchement.",
    body: { date: D_J3 },
    tables: [{ match: 'inscriptions_essai_yoga?date_essai=eq.', rows: [
      { id: 301, email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', cours: 'yin', date_essai: D_J3, statut: 'confirme' },
    ] }] },

  { id: 'yj1a', titre: 'Y-J1a — Le lendemain, la personne était présente',
    handler: 'handleCronEssaiYogaJ1',
    note: "Propose de rejoindre les cours réguliers, avec les tarifs réels lus dans les Paramètres et le bouton AssoConnect yoga. Une <b>copie vous est adressée</b> à l'adresse yoga — ce doublon n'était documenté nulle part.",
    body: { date: D_HIER },
    tables: [{ match: 'inscriptions_essai_yoga?date_essai=eq.', rows: [
      { id: 401, prenom: 'Camille', nom: 'MARTIN', email: 'camille@test.fr', cours: 'yin', presence_declaree: true },
    ] }] },

  { id: 'yj1b', titre: 'Y-J1b — Le lendemain, la personne était absente',
    handler: 'handleCronEssaiYogaJ1',
    note: "Ton bienveillant et bouton pour choisir une nouvelle date. ⚠️ Les personnes non pointées ne reçoivent rien. Là aussi, une <b>copie vous est adressée</b>.",
    body: { date: D_HIER },
    tables: [{ match: 'inscriptions_essai_yoga?date_essai=eq.', rows: [
      { id: 402, prenom: 'Alex', nom: 'DUPONT', email: 'alex@test.fr', cours: 'hatha', presence_declaree: false },
    ] }] },

  { id: 'ymod', titre: "Y-mod — Vous déplacez un essai yoga",
    handler: 'handleNotifyEssaiYogaModifie',
    note: "Envoyé quand vous changez la date ou le cours d'un essai depuis la fiche (✏️).",
    body: { ...base, ancienneDate: D_LOIN, nouvelleDateEssai: D_J3, cours: 'hatha', ancienCours: 'yin' } },

  { id: 'yi1', titre: 'YI0 + YI1 — Inscription régulière validée',
    handler: 'handleNotifyYogaInscriptionValidee',
    note: "Envoyé quand vous inscrivez quelqu'un aux cours réguliers. L'élève reçoit YI1 (bienvenue, horaires hebdomadaires, adhésion Sorano, livret), vous recevez YI0 à l'adresse yoga.",
    body: { ...base, cours: 'yin', saison: SAI, paiement: 'cb1x', montant: 340, isDirectAdmin: true } },

  { id: 'yi1forfait', titre: 'YI1 — Forfait Yin + Hatha (deux livrets)',
    handler: 'handleNotifyYogaInscriptionValidee',
    note: "En formule forfait, les <b>deux</b> boutons de livret apparaissent côte à côte, et les horaires des deux cours sont listés.",
    body: { ...base, cours: 'forfait', saison: SAI, paiement: 'virement1x', montant: 500, isDirectAdmin: true } },

  { id: 'yelevemod', titre: "YI-mod — Vous changez le cours d'un élève régulier",
    handler: 'handleNotifyYogaEleveModifie',
    note: "Envoyé quand vous modifiez la formule d'un élève déjà inscrit (par exemple Yin seul → forfait). ⚠️ Cet email <b>n'apparaissait dans aucune maquette</b> jusqu'ici.",
    body: { ...base, coursBefore: 'yin', cours: 'forfait', saison: SAI, paiement: 'cb1x', montant: 500 } },

  { id: 'yfin', titre: 'Y-fin — Email de fin de saison (15 juin)',
    handler: 'handleCronYogaFinSaison',
    note: "Cron annuel du 15 juin : remercie pour la saison écoulée et propose la réinscription pour la suivante, avec le lien AssoConnect yoga de la saison à venir. ⚠️ Absent des anciennes maquettes.",
    body: {},
    tables: [{ match: 'cours_yoga?statut=eq.inscrit', rows: [
      { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', cours: 'yin' },
    ] }] },

  { id: 'ydate', titre: "Y-date — Vous modifiez le calendrier des cours",
    handler: 'handleNotifyYogaDate',
    note: "Envoyé aux élèves yoga quand vous ajoutez ou retirez des dates dans le calendrier. ⚠️ Absent des anciennes maquettes.",
    body: { addedDates: [D_LOIN], removedDates: [D_J3], emails: ['camille@test.fr'] } },
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
    if (!mails.length) sections += `<div class="pv-com" style="color:#b71c1c;">⚠️ Aucun email produit avec ces données d'exemple — à vérifier.</div>`;
    for (const m of mails) {
      const admin = /regardsepose@gmail\.com|tangoetvous@gmail\.com/.test(m.to);
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
<title>Preview — Emails Yoga</title>
<style>
body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
.pv-head { background:#111; border-bottom:3px solid #7e57c2; padding:22px 24px; text-align:center; }
.pv-head h1 { font-family:Georgia,serif; font-size:19px; font-weight:300; letter-spacing:4px; color:#b39ddb; margin:0; }
.pv-head p { font-size:12px; color:#888; margin:8px 0 0; }
.pv-gen { background:#0d2b0d; color:#a5d6a7; font-size:12px; text-align:center; padding:9px 16px; border-bottom:1px solid #1b5e20; line-height:1.6; }
.pv-gen code { color:#fff; }
.pv-nav { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; padding:12px 16px; background:#0a0a0a; position:sticky; top:0; z-index:10; }
.pv-nav a { color:#b39ddb; text-decoration:none; font-size:11px; border:1px solid #3a2f4a; padding:5px 12px; border-radius:20px; }
.pv-titre { max-width:660px; margin:38px auto 0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#333; padding:10px 20px; border-left:4px solid #7e57c2; }
.pv-com { max-width:660px; margin:0 auto; font-size:13px; color:#555; padding:12px 20px; line-height:1.7; background:#fff; }
.pv-h { display:block; margin-top:6px; color:#5e35b1; font-size:12px; }
.pv-dest { max-width:660px; margin:16px auto 0; font-size:12px; color:#333; background:#eceff1; padding:7px 16px; border-radius:6px 6px 0 0; font-weight:700; }
.pv-sujet { max-width:660px; margin:0 auto; font-size:13px; background:#f3eefb; border-left:4px solid #7e57c2; padding:10px 16px; color:#2c1a4a; }
.pv-mail { max-width:600px; margin:10px auto 0; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.12); }
.pv-fin { max-width:660px; margin:40px auto 0; background:#fff; padding:18px 20px; font-size:13px; color:#444; line-height:1.8; border-top:3px solid #7e57c2; }
.pv-fin b { color:#5e35b1; }
table.tbl { width:100%; border-collapse:collapse; font-size:13px; margin-top:10px; }
table.tbl th { text-align:left; padding:8px; background:#eee; }
table.tbl td { padding:8px; border-top:1px solid #ddd; vertical-align:top; }
${CSS_NOTIFS}
</style>
</head>
<body>

<div class="pv-head">
  <h1>COURS DE YOGA AVEC FLORENCIA GARCIA</h1>
  <p>Preview — emails yoga</p>
</div>
<div class="pv-gen">✅ Page <b>générée automatiquement</b> en exécutant les handlers de <code>worker.js</code> (Supabase et Brevo simulés) —
ce que vous voyez est exactement ce que reçoivent les destinataires.<br>Régénérer avec <code>node outils/generer-preview-yoga.js</code></div>
<div class="pv-nav">${nav}<a href="#absents">Emails absents</a><a href="#notifs">🔔 Notifications</a></div>

${sections}

<div class="pv-titre" id="absents" style="border-left-color:#c62828;">Ce que les anciennes maquettes annonçaient et qui n'existe pas</div>
<div class="pv-com">
  <table class="tbl">
    <tr><th>Ancienne section</th><th>Réalité dans le code</th></tr>
    <tr><td><b>Y-full</b> — « cette date précise est complète (14/14) »</td>
        <td>Aucun email de ce type dans le worker. Le formulaire public gère lui-même le cas en amont ; une inscription qui arrive produit Y1 ou Y-att, jamais Y-full.</td></tr>
    <tr><td><b>Y2</b> (et ses variantes « plus de 3 jours » / « moins de 3 jours »)</td>
        <td>N'existe pas comme email distinct. L'inscription étant confirmée d'emblée, c'est Y1 qui joue ce rôle ; l'ancienne maquette gardait Y2 d'une époque où une validation manuelle était prévue.</td></tr>
  </table>
  <p style="margin-top:14px;">À l'inverse, <b>trois emails yoga bien réels ne figuraient dans aucune maquette</b> : la modification du cours d'un élève régulier, l'email de fin de saison du 15 juin, et la notification de changement de calendrier. Ils sont désormais dans la page.</p>
</div>

<div class="pv-titre" id="notifs" style="border-left-color:#5c9dc2;">Notifications — toast, panel 🔔 et push OS</div>
${blocNotifs('notifs-yoga.html')}

<div class="pv-fin">
  <p><b>Branding yoga</b> — tous ces emails partent de <code>contact@tangoetvous.fr</code> (seul expéditeur vérifié) mais
     au nom de <b>Florencia Garcia — Le Regard Se Pose</b>, avec les réponses redirigées vers
     <code>regardsepose@gmail.com</code>. Les emails qui vous sont destinés arrivent à cette même adresse yoga,
     jamais à <code>tangoetvous@gmail.com</code>.</p>
  <table class="tbl">
    <tr><th>Ce qui détermine la variante</th><th>Règle appliquée par le code</th></tr>
    <tr><td><b>Y1 ou Y-att</b></td><td><code>statut === 'attente'</code> — décidé par le formulaire quand le cours régulier affiche déjà 14 inscrits sur la saison</td></tr>
    <tr><td><b>Livret</b></td><td>un bouton pour Yin, un pour Hatha, <b>les deux</b> en formule forfait ; aucun si l'adresse n'est pas renseignée dans les Paramètres</td></tr>
    <tr><td><b>Horaires</b></td><td>lus à plat dans <code>tev_params_yoga_&lt;saison&gt;.horaires</code> (<code>yin</code>, <code>yin_fin</code>, <code>hatha</code>, <code>hatha_fin</code>) — jamais écrits en dur</td></tr>
  </table>
  <p style="margin-top:16px;">${total} emails produits pour cette page.</p>
</div>

</body>
</html>
`;
  const sortie = path.join(RACINE, 'preview-emails-yoga-v1.html');
  fs.writeFileSync(sortie, page);
  console.log(`✅ preview-emails-yoga-v1.html régénérée — ${CAS.length} cas, ${total} emails`);
})().catch(e => { console.error('❌ Échec :', e.stack || e.message); process.exit(1); });
