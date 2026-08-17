#!/usr/bin/env node
// Régénère preview-emails-stages-v1.html À PARTIR du code de worker.js.
//
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Ce script n'écrit AUCUN gabarit à la main : il exécute réellement les handlers
// (S0/S1/S2, S3, S4, S-cancel, S-edit) via outils/_banc-emails.js, avec Supabase
// et Brevo simulés, et affiche les emails effectivement produits.
//
// Usage :  node outils/generer-preview-stages.js
// À relancer après TOUTE modification d'un email de stage.

const fs = require('fs');
const path = require('path');
const { executer, blocNotifs, CSS_NOTIFS } = require('./_banc-emails.js');

const RACINE = path.join(__dirname, '..');

// ⚠️ Dates RELATIVES à aujourd'hui : S1 vs S1b (et S3 vs S3b) dépendent du délai
// réel jusqu'au stage. Une date figée finirait par basculer de variante toute seule.
const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const saisonDe = iso => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };

const D_LOIN   = jour(20);   // > 3 jours  → S1 / S3
const D_PROCHE = jour(2);    // ≤ 3 jours  → S1b / S3b
const D_J3     = jour(3);    // rappel J-3 → S4

const ADRESSE = { nom: 'Espas Danse Studio', rue: '24 villa Riberolle, Paris 20e', transport: 'M° Alexandre Dumas (L2)' };
const HORAIRES = {
  tech_deb: '14h', tech_fin: '15h',
  s1_deb: '15h',   s1_fin: '16h30',
  s2_deb: '16h30', s2_fin: '18h',
};
const THEMES = ['Ochos et enrosques', 'Séquence en abrazo fermé', '', ''];

// Paramètres servis par le faux Supabase, pour chaque saison concernée
const PARAMS = { __soranoLien: '' };
for (const s of new Set([D_LOIN, D_PROCHE, D_J3].map(saisonDe))) {
  PARAMS['tev_params_stages_' + s] = { adresse: ADRESSE, horaires: HORAIRES };
  PARAMS['tev_dates_stages_' + s]  = { stages: [
    { date: D_LOIN,   themes: THEMES },
    { date: D_PROCHE, themes: THEMES },
    { date: D_J3,     themes: THEMES },
  ] };
}

// Créneaux tels que les envoie le formulaire public (horaire_debut / horaire_fin / theme)
const slot = (deb, fin, theme) => ({ horaire_debut: deb, horaire_fin: fin, theme });
const CRENEAUX = [slot('14h', '15h', 'Technique Leader & Follower'), slot('15h', '16h30', THEMES[0])];
// Créneaux tels que les envoie l'admin (type / horaire_debut / horaire_fin / theme)
const slotAdmin = (type, deb, fin, theme) => ({ type, horaire_debut: deb, horaire_fin: fin, theme });

const base = { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', tel: '0612345678' };

const CAS = [
  { id: 's1', titre: 'S0 + S1 — Inscription confirmée (plus de 3 jours avant)',
    handler: 'handleNotifyInscriptionStage',
    note: "Cas courant depuis le formulaire public. L'admin reçoit S0, l'élève reçoit S1 avec la mention du rappel J-3 à venir.",
    body: { ...base, role: 'Guideur(se)', statut: 'confirme', saison: saisonDe(D_LOIN),
            inscriptionsParDate: [{ date: D_LOIN, slots: CRENEAUX, tarif: 45, adresse: ADRESSE }] } },

  { id: 's1b', titre: 'S1b — Inscription confirmée (moins de 3 jours avant)',
    handler: 'handleNotifyInscriptionStage',
    note: "Le rappel J-3 ne partira plus : le bouton « 👍 Je confirme ma présence » est donc placé directement dans l'email de confirmation.",
    body: { ...base, role: 'Guideur(se)', statut: 'confirme', saison: saisonDe(D_PROCHE),
            inscriptionsParDate: [{ date: D_PROCHE, slots: CRENEAUX, tarif: 45, adresse: ADRESSE }] } },

  { id: 's2', titre: "S2 — Guidée seule, mise en attente (parité)",
    handler: 'handleNotifyInscriptionStage',
    note: "Une guidée sans partenaire part en attente le temps d'équilibrer guideurs et guidées. Aucune capacité maximale n'entre en jeu : les stages n'ont pas de quota de places.",
    body: { ...base, prenom: 'Alex', nom: 'DUPONT', email: 'alex@test.fr', role: 'Guidé(e)', statut: 'attente',
            saison: saisonDe(D_LOIN),
            inscriptionsParDate: [{ date: D_LOIN, slots: CRENEAUX, tarif: 45, adresse: ADRESSE }] } },

  { id: 's1couple', titre: 'S1 — Couple, deux adresses email',
    handler: 'handleNotifyInscriptionStage',
    note: "Chacun reçoit son propre email et n'y voit QUE ses créneaux — dans un couple les stages choisis peuvent différer.",
    body: { ...base, role: 'Guideur(se)', statut: 'confirme', saison: saisonDe(D_LOIN),
            inscriptionsParDate: [{ date: D_LOIN, slots: CRENEAUX, tarif: 45, adresse: ADRESSE }],
            partPrenom: 'Alex', partNom: 'MARTIN', partEmail: 'alex@test.fr', partRole: 'Guidé(e)',
            partInscriptionsParDate: [{ date: D_LOIN, slots: [slot('15h', '16h30', THEMES[0])], tarif: 25, adresse: ADRESSE }] } },

  { id: 's1partage', titre: 'S1 — Couple, une seule adresse email',
    handler: 'handleNotifyInscriptionStage',
    note: "Un seul email est envoyé, avec une section par personne et le total de chacun.",
    body: { ...base, role: 'Guideur(se)', statut: 'confirme', saison: saisonDe(D_LOIN), emailPartage: true,
            inscriptionsParDate: [{ date: D_LOIN, slots: CRENEAUX, tarif: 45, adresse: ADRESSE }],
            partPrenom: 'Alex', partNom: 'MARTIN', partEmail: 'camille@test.fr', partRole: 'Guidé(e)',
            partInscriptionsParDate: [{ date: D_LOIN, slots: [slot('15h', '16h30', THEMES[0])], tarif: 25, adresse: ADRESSE }] } },

  { id: 's1multi', titre: 'S1 — Inscription à deux dates',
    handler: 'handleNotifyInscriptionStage',
    note: "Une personne inscrite à plusieurs dates reçoit UN email par date — chacun avec ses propres créneaux et son propre total.",
    body: { ...base, role: 'Guideur(se)', statut: 'confirme', saison: saisonDe(D_LOIN),
            inscriptionsParDate: [
              { date: D_LOIN,   slots: CRENEAUX, tarif: 45, adresse: ADRESSE },
              { date: D_PROCHE, slots: [slot('16h30', '18h', THEMES[1])], tarif: 25, adresse: ADRESSE } ] } },

  { id: 's3', titre: 'S3 — Admin valide une personne en attente (plus de 3 jours avant)',
    handler: 'handleNotifyStageValide',
    note: "Envoyé quand vous confirmez une inscription qui était en attente. Mentionne le rappel J-3 à venir.",
    body: { ...base, role: 'Guidé(e)',
            daysUntil: 20,
            inscriptionsParDate: [{ date: D_LOIN, slots: [slotAdmin('technique', '14h', '15h', 'Technique Leader & Follower'), slotAdmin('stage1', '15h', '16h30', THEMES[0])], tarif: 45 }] } },

  { id: 's3b', titre: 'S3b — Admin valide une personne en attente (moins de 3 jours avant)',
    handler: 'handleNotifyStageValide',
    note: "Même email que S3, mais avec le bouton « 👍 Je confirme ma présence » puisqu'aucun rappel ne partira plus.",
    body: { ...base, role: 'Guidé(e)',
            daysUntil: 2,
            inscriptionsParDate: [{ date: D_PROCHE, slots: [slotAdmin('stage1', '15h', '16h30', THEMES[0])], tarif: 25 }] } },

  { id: 's4', titre: 'S4 — Rappel automatique 3 jours avant le stage',
    handler: 'handleCronRappelStageJ3',
    note: "Seul email de stage envoyé longtemps après l'inscription : les <b>horaires et thèmes sont relus dans les Paramètres</b> (personnalisation par date prioritaire) et les créneaux sont remis dans l'ordre chronologique. Le montant vient de la colonne <code>total_inscrit</code>. L'encadré est volontairement identique à celui de S1.",
    body: { date: D_J3 },
    tables: [{ match: 'inscriptions_stages?stage_date=eq.', rows: [
        { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', role: 'Guideur(se)',
          stage_nom: 'technique|stage1', total_inscrit: 45,
          donnees: { inscriptionsParDate: [{ date: D_J3, stagesDetail: [{ type: 'stage1' }, { type: 'technique' }] }] } },
        // Fiche partenaire du nouveau format : donnees vide → créneaux relus dans stage_nom
        { email: 'alex@test.fr', prenom: 'Alex', nom: 'MARTIN', role: 'Guidé(e)',
          stage_nom: 'stage1', total_inscrit: 25, donnees: {} },
      ] },
      { match: 'inscriptions_stages?stage_date=is.null', rows: [] } ] },

  { id: 'scancel', titre: "S-cancel — Annulation d'une inscription par l'admin",
    handler: 'handleNotifyStageAnnule',
    note: "Envoyé quand vous retirez un créneau ou toute la journée depuis l'onglet Stages.",
    body: { ...base, inscriptionsParDate: [{ date: D_LOIN, slots: [{ horaire: '15h–16h30', theme: '' }], tarif: 0 }] } },

  { id: 'sedit', titre: 'S-edit — Modification des créneaux par l\'admin',
    handler: 'handleNotifyStageModifie',
    note: "Envoyé quand vous changez les créneaux d'une personne déjà inscrite : anciens créneaux barrés, nouveaux mis en avant, nouveau total.",
    body: { ...base, role: 'Guideur(se)', date: D_LOIN, newMontant: 65,
            oldSlots: [slotAdmin('stage1', '15h', '16h30', THEMES[0])],
            newSlots: [slotAdmin('technique', '14h', '15h', 'Technique Leader & Follower'),
                       slotAdmin('stage1', '15h', '16h30', THEMES[0]),
                       slotAdmin('stage2', '16h30', '18h', THEMES[1])] } },
];

const ech = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtJ = iso => { const d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' ' + ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'][d.getMonth()] + ' ' + d.getFullYear(); };

(async () => {
  let sections = '', nav = '', total = 0;
  for (const c of CAS) {
    const params = c.tables ? { ...PARAMS, __tables: c.tables } : PARAMS;
    const mails = await executer(c.handler, c.body, params);
    total += mails.length;
    nav += `<a href="#${c.id}">${ech(c.titre.split('—')[0].trim())}</a>`;
    sections += `<div class="pv-titre" id="${c.id}">${ech(c.titre)}</div>
<div class="pv-com">${c.note} <span class="pv-h">Handler : <code>${c.handler}</code> · ${mails.length} email(s) envoyé(s).</span></div>`;
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
<title>Preview — Emails Stages</title>
<style>
body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
.pv-head { background:#111; border-bottom:3px solid #D4AF37; padding:22px 24px; text-align:center; }
.pv-head h1 { font-family:Georgia,serif; font-size:20px; font-weight:300; letter-spacing:5px; color:#D4AF37; margin:0; }
.pv-head p { font-size:12px; color:#888; margin:8px 0 0; }
.pv-gen { background:#0d2b0d; color:#a5d6a7; font-size:12px; text-align:center; padding:9px 16px; border-bottom:1px solid #1b5e20; line-height:1.6; }
.pv-gen code { color:#fff; }
.pv-nav { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; padding:12px 16px; background:#0a0a0a; position:sticky; top:0; z-index:10; }
.pv-nav a { color:#D4AF37; text-decoration:none; font-size:11px; border:1px solid #3a2f00; padding:5px 12px; border-radius:20px; }
.pv-titre { max-width:660px; margin:38px auto 0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#333; padding:10px 20px; border-left:4px solid #B8962E; }
.pv-com { max-width:660px; margin:0 auto; font-size:13px; color:#555; padding:12px 20px; line-height:1.7; background:#fff; }
.pv-h { display:block; margin-top:6px; color:#8B6914; font-size:12px; }
.pv-dest { max-width:660px; margin:16px auto 0; font-size:12px; color:#333; background:#eceff1; padding:7px 16px; border-radius:6px 6px 0 0; font-weight:700; }
.pv-sujet { max-width:660px; margin:0 auto; font-size:13px; background:#fdf7e6; border-left:4px solid #B8962E; padding:10px 16px; color:#3a2f00; }
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
  <p>Preview — emails des stages</p>
</div>
<div class="pv-gen">✅ Page <b>générée automatiquement</b> en exécutant les handlers de <code>worker.js</code> (Supabase et Brevo simulés) —
ce que vous voyez est exactement ce que reçoivent les destinataires.<br>Régénérer avec <code>node outils/generer-preview-stages.js</code></div>
<div class="pv-nav">${nav}<a href="#notifs">🔔 Notifications</a></div>

${sections}

<div class="pv-titre" id="notifs" style="border-left-color:#5c9dc2;">Notifications — toast, panel 🔔 et push OS</div>
${blocNotifs('notifs-stages.html')}

<div class="pv-fin">
  <p><b>Dates d'exemple</b> — volontairement relatives à aujourd'hui, car le choix entre S1 et S1b (et entre S3 et S3b)
     dépend du délai réel jusqu'au stage : stage « lointain » le ${fmtJ(D_LOIN)}, stage « proche » le ${fmtJ(D_PROCHE)},
     rappel J-3 pour le ${fmtJ(D_J3)}.</p>
  <table class="tbl">
    <tr><th>Ce qui détermine la variante</th><th>Règle appliquée par le code</th></tr>
    <tr><td><b>S1 ou S1b</b></td><td><code>daysUntil &lt;= 3</code> → pas de mention du rappel, bouton « 👍 Je confirme ma présence » ajouté</td></tr>
    <tr><td><b>S2</b> (attente)</td><td><code>statut !== 'confirme'</code> — mise en attente liée à la <b>parité</b> guideurs/guidées, jamais à une capacité maximale</td></tr>
    <tr><td><b>Couple, un ou deux emails</b></td><td><code>emailPartage</code> → un seul email à deux sections ; sinon un email chacun, chacun ne voyant que ses créneaux</td></tr>
    <tr><td><b>Plusieurs dates</b></td><td>un email par date — la boucle parcourt <code>inscriptionsParDate</code></td></tr>
  </table>
  <p style="margin-top:16px;"><b>⚠️ S1 et S4 sont jumeaux</b> — l'encadré du stage est identique dans les deux
     (même mise en page, même bloc Lieu, même total, même mention de l'appoint). Toute évolution de l'un doit être
     répercutée dans l'autre : c'est l'oubli de cette règle qui avait produit le rappel amputé du 29 juillet 2026.</p>
  <p><b>Origine des données</b> — les créneaux viennent de l'inscription, mais leurs <b>horaires et thèmes sont relus
     dans les Paramètres</b> (override par date prioritaire sur les horaires de saison) et triés chronologiquement.
     Adresse et montant suivent la même logique. ${total} emails produits pour cette page.</p>
</div>

</body>
</html>
`;
  const sortie = path.join(RACINE, 'preview-emails-stages-v1.html');
  fs.writeFileSync(sortie, page);
  console.log(`✅ preview-emails-stages-v1.html régénérée — ${CAS.length} cas, ${total} emails`);
})().catch(e => { console.error('❌ Échec :', e.message); process.exit(1); });
