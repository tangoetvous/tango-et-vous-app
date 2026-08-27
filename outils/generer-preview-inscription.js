#!/usr/bin/env node
// Régénère preview-emails-inscription-v1.html À PARTIR du code de worker.js.
//
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Ce script n'écrit AUCUN gabarit à la main : il exécute réellement les handlers
// (I01, I02, I03, I04) via outils/_banc-emails.js, avec Supabase et Brevo simulés,
// et affiche les emails effectivement produits.
//
// Usage :  node outils/generer-preview-inscription.js
// À relancer après TOUTE modification d'un email d'inscription.

const fs = require('fs');
const path = require('path');
const { executer, blocNotifs, CSS_NOTIFS } = require('./_banc-emails.js');

const RACINE = path.join(__dirname, '..');
const S = '2026-2027';

// Paramètres servis par le faux Supabase (mêmes clés qu'en production)
const PARAMS = {
  'tev_liens_assoconnect': { [S]: { cours: 'https://le-regard-se-pose.assoconnect.com/exemple' } },
  'tev_cours_dates': { paris: ['2026-09-03', '2026-09-10'], vincennes: ['2026-09-07'] },
  ['tev_params_paris_' + S]: {
    horaires: { deb: '20h30', deb_fin: '21h45', int: '21h45', int_fin: '23h00' },
    adresse: { nom: 'Espas Danse Studio', rue: '24 villa Riberolle, Paris 20e', transport: 'M° Alexandre Dumas (L2)', gps: '48.8568,2.3960' },
    livret: { url_deb: 'https://exemple/livret-deb-paris.pdf', url_int: 'https://exemple/livret-int-paris.pdf' },
  },
  ['tev_params_vincennes_' + S]: {
    horaires: { deb: '19h30', deb_fin: '21h00', int: '21h00', int_fin: '22h30' },
    adresse: { nom: 'Espace Sorano', rue: '16 rue Charles Pathé, 94300 Vincennes', transport: 'RER A — Vincennes' },
    livret: { url_deb: 'https://exemple/livret-deb-vincennes.pdf' },
  },
  __soranoLien: 'https://exemple/sorano',
};

const base = { email: 'camille@test.fr', prenom: 'Camille', nom: 'MARTIN', tel: '0612345678', saison: S };

const CAS = [
  { id: 'i01val', titre: 'I01 — Guideur seul (Paris)', handler: 'handleNotifyInscriptionCours',
    note: "Cas le plus courant. Statut « att. paiement » : la place est validée, il reste à régler sur AssoConnect. L'admin reçoit I0 en parallèle.",
    body: { ...base, role: 'guideur', venue: 'seul', nbCours: 1, c1: { ville: 'paris', niveau: 'debutant' } } },
  { id: 'i01couple', titre: 'I01 — En duo', handler: 'handleNotifyInscriptionCours',
    note: 'Chaque partenaire reçoit son propre email (adresses différentes). Bandeau et sujet mentionnent le duo.',
    body: { ...base, role: 'guidee', venue: 'avec-part', nbCours: 1, c1: { ville: 'paris', niveau: 'debutant' },
            pPrenom: 'Alex', pNom: 'MARTIN', pEmail: 'alex@test.fr', pRole: 'guideur' } },
  { id: 'i01vinc', titre: 'I01 — Vincennes (bloc Sorano)', handler: 'handleNotifyInscriptionCours',
    note: "À Vincennes s'ajoute l'encadré jaune de l'adhésion à l'Espace Sorano, avec son bouton si le lien est renseigné dans les Paramètres.",
    body: { ...base, role: 'guideur', venue: 'seul', nbCours: 1, c1: { ville: 'vincennes', niveau: 'debutant' } } },
  { id: 'i01att', titre: "I01-att — Guidée seule, liste d'attente", handler: 'handleNotifyInscriptionCours',
    note: "Statut « att. validation » : pas de bouton de paiement, mais l'explication de la parité et trois options. Déclenché par isWaitlist.",
    body: { ...base, role: 'guidee', venue: 'seul', nbCours: 1, c1: { ville: 'paris', niveau: 'debutant' }, isWaitlist: true } },
  { id: 'i01couplevinc', titre: 'I01 — En duo à Vincennes', handler: 'handleNotifyInscriptionCours',
    note: "Cumule les deux variantes : bandeau et sujet « en duo », plus l'encadré jaune de l'adhésion Sorano. Chacun reçoit son propre email.",
    body: { ...base, role: 'guideur', venue: 'avec-part', nbCours: 1, c1: { ville: 'vincennes', niveau: 'debutant' },
            pPrenom: 'Alex', pNom: 'MARTIN', pEmail: 'alex@test.fr', pRole: 'guidee' } },
  { id: 'i01coupleatt', titre: "I01-quota-att — Duo, cours complet", handler: 'handleNotifyInscriptionCours',
    note: "Quota atteint sur l'un des deux rôles : les DEUX partenaires passent en attente avec la variante duo — « vous serez confirmé·e·s tous les deux ensemble ». 2 options (attente / autre cours de ce niveau), pas de suggestion « trouvez un·e partenaire » ni de cours d'essai.",
    body: { ...base, role: 'guidee', venue: 'avec-part', nbCours: 1, c1: { ville: 'paris', niveau: 'debutant' },
            pPrenom: 'Alex', pNom: 'MARTIN', pEmail: 'alex@test.fr', pRole: 'guideur', isWaitlist: true,
            quotaFull1: { gui: true, gde: false } } },
  { id: 'i01complet', titre: "I01-complet — Seul·e, cours complet", handler: 'handleNotifyInscriptionCours',
    note: "Guideur (ou guidée) seul·e refusé·e par le quota : la raison affichée est « cours complet » (pas la parité), et la suggestion « trouvez un·e partenaire » disparaît — elle ne débloquerait rien. 2 options : attente ou autre cours de ce niveau (Paris / Vincennes).",
    body: { ...base, role: 'guideur', venue: 'seul', nbCours: 1, c1: { ville: 'vincennes', niveau: 'intermediaire' }, isWaitlist: true,
            quotaFull1: { gui: true, gde: false } } },
  { id: 'i01mixte', titre: 'I01 — Deux cours, statuts différents', handler: 'handleNotifyInscriptionCours',
    note: "Les quotas sont évalués cours par cours : ici le 1ᵉʳ cours est validé (guideur) et le 2ᵉ part en liste d'attente (guidée sans partenaire). Deux emails de nature différente.",
    body: { ...base, role: 'guideur', venue: 'seul', nbCours: 2, c1: { ville: 'paris', niveau: 'debutant' },
            c2: { ville: 'paris', niveau: 'intermediaire' }, role2: 'guidee', venue2: 'seul' } },
  { id: 'i01deux', titre: 'I01 — Inscription à deux cours', handler: 'handleNotifyInscriptionCours',
    note: "⚠️ L'élève reçoit DEUX emails séparés, un par cours, avec le même sujet — les quotas étant évalués cours par cours.",
    body: { ...base, role: 'guideur', venue: 'seul', nbCours: 2, c1: { ville: 'paris', niveau: 'debutant' },
            c2: { ville: 'paris', niveau: 'intermediaire' }, role2: 'guideur', venue2: 'seul' } },
  { id: 'i02', titre: 'I02 — Admin valide une guidée en attente', handler: 'handleNotifyInscriptionCoursValidee',
    note: "Envoyé quand vous validez une personne qui était en attente : « un·e partenaire vient de rejoindre votre cours ». Corps identique à I01 à partir de l'encadré.",
    body: { ...base, role: 'guidee', ville: 'paris', niveau: 'debutant', partenaire: 'Alex MARTIN',
            livretUrl: 'https://exemple/livret-deb-paris.pdf', assoConnectUrl: 'https://le-regard-se-pose.assoconnect.com/exemple' } },
  { id: 'i03', titre: 'I03 — Paiement validé (un cours)', handler: 'handleNotifyInscriptionCoursPaye',
    note: "Sujet volontairement différent d'I01/I02 pour éviter que Gmail regroupe les fils. Contient la section d'installation de l'appli élève.",
    body: { ...base, coursInfos: [{ ville: 'paris', niveau: 'debutant', role: 'guideur' }] } },
  { id: 'i03deux', titre: 'I03 — Paiement validé (deux cours)', handler: 'handleNotifyInscriptionCoursPaye',
    note: 'Un seul email, avec un encadré par cours et un bouton livret par couple ville/niveau distinct.',
    body: { ...base, coursInfos: [{ ville: 'paris', niveau: 'debutant', role: 'guideur' }, { ville: 'vincennes', niveau: 'intermediaire', role: 'guideur' }] } },
  { id: 'i04', titre: "I04 — Changement de cours", handler: 'handleNotifyInscriptionCoursModifiee',
    note: "Envoyé quand vous modifiez le cours d'un élève déjà inscrit : ancien cours barré, nouveau en vert.",
    body: { ...base, villeAvant: 'paris', niveauAvant: 'debutant', villeApres: 'paris', niveauApres: 'intermediaire',
            ancienCours: { ville: 'paris', niveau: 'debutant' }, nouveauCours: { ville: 'paris', niveau: 'intermediaire' } } },
];

const ech = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  let sections = '', nav = '', total = 0;
  for (const c of CAS) {
    const mails = await executer(c.handler, c.body, PARAMS);
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
<title>Preview — Emails Inscriptions Tango régulier</title>
<style>
body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
.pv-head { background:#111; border-bottom:3px solid #D4AF37; padding:22px 24px; text-align:center; }
.pv-head h1 { font-family:Georgia,serif; font-size:20px; font-weight:300; letter-spacing:5px; color:#D4AF37; margin:0; }
.pv-head p { font-size:12px; color:#888; margin:8px 0 0; }
.pv-gen { background:#0d2b0d; color:#a5d6a7; font-size:12px; text-align:center; padding:9px 16px; border-bottom:1px solid #1b5e20; line-height:1.6; }
.pv-gen code { color:#fff; }
.pv-nav { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; padding:12px 16px; background:#0a0a0a; position:sticky; top:0; z-index:10; }
.pv-nav a { color:#D4AF37; text-decoration:none; font-size:11px; border:1px solid #3a2f00; padding:5px 12px; border-radius:20px; }
.pv-titre { max-width:660px; margin:38px auto 0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#333; padding:10px 20px; border-left:4px solid #1565c0; }
.pv-com { max-width:660px; margin:0 auto; font-size:13px; color:#555; padding:12px 20px; line-height:1.7; background:#fff; }
.pv-h { display:block; margin-top:6px; color:#8B6914; font-size:12px; }
.pv-dest { max-width:660px; margin:16px auto 0; font-size:12px; color:#333; background:#eceff1; padding:7px 16px; border-radius:6px 6px 0 0; font-weight:700; }
.pv-sujet { max-width:660px; margin:0 auto; font-size:13px; background:#eef3f8; border-left:4px solid #1565c0; padding:10px 16px; color:#123; }
.pv-mail { max-width:600px; margin:10px auto 0; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.12); }
.pv-fin { max-width:660px; margin:40px auto 0; background:#fff; padding:18px 20px; font-size:13px; color:#444; line-height:1.8; border-top:3px solid #D4AF37; }
.pv-fin b { color:#8B6914; }
${CSS_NOTIFS}
</style>
</head>
<body>

<div class="pv-head">
  <h1>TANGO &amp; VOUS</h1>
  <p>Preview — emails d'inscription aux cours réguliers</p>
</div>
<div class="pv-gen">✅ Page <b>générée automatiquement</b> en exécutant les handlers de <code>worker.js</code> (Supabase et Brevo simulés) —
ce que vous voyez est exactement ce que reçoivent les destinataires.<br>Régénérer avec <code>node outils/generer-preview-inscription.js</code></div>
<div class="pv-nav">${nav}<a href="#notifs">🔔 Notifications</a></div>

${sections}

<div class="pv-titre" id="notifs" style="border-left-color:#5c9dc2;">Notifications — toast, panel 🔔 et push OS</div>
${blocNotifs('notifs-inscription.html')}

<div class="pv-fin">
  <p><b>Ce qui détermine la variante</b> — tout se joue dans le même handler <code>handleNotifyInscriptionCours</code> :</p>
  <p>• <b>liste d'attente</b> : <code>isWaitlist</code> envoyé par le formulaire, ou rôle « guidée » sans partenaire sur le 2ᵉ cours<br>
     • <b>duo</b> : <code>venue === 'avec-part'</code> et un prénom de partenaire renseigné<br>
     • <b>Vincennes</b> : <code>ville === 'vincennes'</code> → ajoute l'encadré Sorano</p>
  <p><b>⚠️ « I17 — pré-inscription » n'existe pas dans le code.</b> Le handler n'a aucune notion de pré-inscription :
     en mai-août, c'est exactement le même email, avec simplement la saison suivante dans <code>saison</code>.</p>
  <p><b>Données d'exemple</b> — les valeurs affichées (horaires, adresse, livret, lien AssoConnect, prochain cours)
     proviennent de paramètres factices ; en production elles sont relues dans les Paramètres au moment de l'envoi.
     ${total} emails produits pour cette page.</p>
</div>

</body>
</html>
`;
  const sortie = path.join(RACINE, 'preview-emails-inscription-v1.html');
  fs.writeFileSync(sortie, page);
  console.log(`✅ preview-emails-inscription-v1.html régénérée — ${CAS.length} cas, ${total} emails`);
})().catch(e => { console.error('❌ Échec :', e.message); process.exit(1); });
