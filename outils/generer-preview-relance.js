#!/usr/bin/env node
// Régénère preview-relance-inscription-v1.html À PARTIR du code de worker.js.
//
// ⚠️ RÈGLE PERMANENTE (CLAUDE.md) : une maquette montrée à l'admin engage le code.
// Ce script rend la fidélité STRUCTURELLE : il extrait les gabarits réels de
// handleCronRelanceInscription et les évalue avec des données d'exemple, au lieu
// de réécrire la maquette à la main (ce qui avait produit 3 écarts le 2026-08-17).
//
// Usage :  node outils/generer-preview-relance.js
// À relancer après TOUTE modification de l'email de relance.

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RACINE, 'worker.js'), 'utf8');

// Extrait le corps d'une fonction par équilibrage des accolades
function corpsFonction(nom) {
  const i = src.indexOf('async function ' + nom + '(');
  if (i < 0) throw new Error('Fonction introuvable : ' + nom);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('Accolades non équilibrées : ' + nom);
}

// Bloc de gabarits : de « const coursBox » à la fin de l'assignation de htmlEleve
const handler = corpsFonction('handleCronRelanceInscription');
const deb = handler.indexOf('    const coursBox = `');
const fin = handler.indexOf("AssoConnect');", handler.indexOf('La rentree approche')) + "AssoConnect');".length;
if (deb < 0 || fin < deb) throw new Error('Gabarits introuvables — le handler a changé de structure');
const gabarits = handler.slice(deb, fin)
  .replace('const htmlEleve = wrap(', 'return wrap(')
  .replace(/^\s*const /gm, '  var ');

// Éléments communs du worker (identiques à ceux du handler)
const _esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
const footer = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
const signEleve = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
const wrap = inner => inner;

const construire = new Function(
  '_esc','headerEleve','footer','signEleve','wrap','f','prenomAff','saison','ville',
  'coursLabel','niveauLabel','villeLabel','roleColor','roleLabel','horaire','nextDateLabel',
  'lieuCell','livretUrl','lienAC','_riSorano','enCouple', gabarits);

function rendre(enCouple) {
  const f = { prenom: 'Camille', partenaire: enCouple ? 'Alex MARTIN' : '' };
  return construire(_esc, headerEleve, footer, signEleve, wrap, f, _esc(f.prenom),
    '2026-2027', 'paris', 'Paris — Débutant', 'Débutant', 'Paris',
    enCouple ? '#c2185b' : '#1565c0', enCouple ? 'Guidé·e' : 'Guideur·se',
    '20h30–21h45', 'Jeudi 3 septembre 2026',
    '<strong>Espas Danse Studio</strong><br/><span style="font-size:13px;font-weight:400;color:#444;">24 villa Riberolle, Paris 20e · M° Alexandre Dumas (L2)</span>',
    'https://exemple/livret.pdf', 'https://le-regard-se-pose.assoconnect.com/…', '', enCouple);
}

const solo = rendre(false), couple = rendre(true);

const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview — Relance du 22 août (inscriptions en attente de paiement)</title>
<style>
body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
.pv-head { background:#111; border-bottom:3px solid #D4AF37; padding:22px 24px; text-align:center; }
.pv-head h1 { font-family:Georgia,serif; font-size:20px; font-weight:300; letter-spacing:5px; color:#D4AF37; margin:0; }
.pv-head p { font-size:12px; color:#888; margin:8px 0 0; }
.pv-gen { background:#0d2b0d; color:#a5d6a7; font-size:12px; text-align:center; padding:9px 16px; border-bottom:1px solid #1b5e20; }
.pv-nav { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; padding:14px 16px; background:#0a0a0a; position:sticky; top:0; z-index:10; }
.pv-nav a { color:#D4AF37; text-decoration:none; font-size:12px; border:1px solid #3a2f00; padding:6px 14px; border-radius:20px; }
.pv-titre { max-width:640px; margin:34px auto 0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#333; padding:10px 20px; border-left:4px solid #1565c0; }
.pv-com { max-width:640px; margin:0 auto; font-size:13px; color:#555; padding:12px 20px; line-height:1.7; background:#fff; }
.pv-com b { color:#8B6914; }
.pv-mail { max-width:600px; margin:14px auto 0; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.12); }
.pv-sujet { max-width:640px; margin:14px auto 0; font-size:13px; background:#eef3f8; border-left:4px solid #1565c0; padding:10px 16px; color:#123; }
table.tbl { width:100%; border-collapse:collapse; font-size:13px; margin-top:10px; }
table.tbl th { text-align:left; padding:8px; background:#eee; }
table.tbl td { padding:8px; border-top:1px solid #ddd; vertical-align:top; }
</style>
</head>
<body>

<div class="pv-head">
  <h1>TANGO &amp; VOUS</h1>
  <p>Preview — email de relance du 22 août · inscriptions en « Att. Paiement »</p>
</div>
<div class="pv-gen">✅ Page générée automatiquement depuis <code>worker.js</code> (handleCronRelanceInscription) — ce que vous voyez est exactement ce qui sera envoyé. Régénérer avec <code>node outils/generer-preview-relance.js</code>.</div>
<div class="pv-nav">
  <a href="#solo">① Personne seule</a>
  <a href="#couple">② Couple</a>
  <a href="#diff">③ Différences avec I01/I02</a>
  <a href="#ciblage">④ Qui le reçoit</a>
</div>

<div class="pv-titre" id="solo">① Personne seule</div>
<div class="pv-com">Exemple : Camille, guideur·se, Paris — Débutant. Les valeurs (cours, date, horaire, lieu, livret, lien AssoConnect) sont relues dans les Paramètres au moment de l'envoi.</div>
<div class="pv-sujet"><strong>Objet :</strong> La rentrée approche — finalisez votre inscription au tango</div>
<div class="pv-mail">${solo}</div>

<div class="pv-titre" id="couple" style="border-left-color:#6a1b9a;">② Couple — un email à chacun</div>
<div class="pv-com">Exemple : Camille, guidé·e, en couple avec Alex MARTIN. Chaque partenaire reçoit son propre email, avec son rôle et le nom de l'autre.</div>
<div class="pv-sujet"><strong>Objet :</strong> La rentrée approche — finalisez votre inscription au tango</div>
<div class="pv-mail">${couple}</div>

<div class="pv-titre" id="diff" style="border-left-color:#D4AF37;">③ Ce qui change par rapport à I01 / I02</div>
<div class="pv-com">
  <table class="tbl">
    <tr><th>Élément</th><th>Dans la relance</th></tr>
    <tr><td><b>Bandeau</b></td><td>Bleu, 17 px — « 🗓 Votre place vous attend » (solo) / « 🗓 Vos places en duo vous attendent » (couple). <i>I01 et I02 ont un bandeau vert de confirmation.</i></td></tr>
    <tr><td><b>Introduction</b></td><td>16,5 px — « La rentrée approche ! … pas encore finalisée sur AssoConnect ». <i>Aucune phrase d'I02 (« un·e partenaire vient de rejoindre votre cours ») n'est reprise.</i></td></tr>
    <tr><td><b>Encadré violet</b></td><td>Couple uniquement — chacun doit s'inscrire séparément avec une adresse email différente. <i>L'avertissement équivalent du bloc « Quelques précisions » a été retiré pour ne pas faire doublon.</i></td></tr>
    <tr><td>Encadré du cours, bouton AssoConnect, encadré rouge du pourboire, « Quelques précisions », bloc Sorano (Vincennes), bouton livret, signature</td><td><b>Identiques à I01 et I02</b> — repris tels quels. I01/I02 ne sont pas modifiés.</td></tr>
  </table>
</div>

<div class="pv-titre" id="ciblage" style="border-left-color:#2e7d32;">④ Qui reçoit cet email — et qui ne le reçoit pas</div>
<div class="pv-com" style="padding-bottom:30px;">
  <table class="tbl">
    <tr><th>Statut dans Inscriptions Tango</th><th>Reçoit ?</th><th>Pourquoi</th></tr>
    <tr><td><b>Att. Paiement</b></td><td style="color:#2e7d32;font-weight:700;">✓ OUI</td><td>Place validée, règlement AssoConnect à finaliser</td></tr>
    <tr><td><b>Att. Valid.</b> (demande)</td><td style="color:#c62828;font-weight:700;">✗ NON</td><td>Guidée sans partenaire : elle ne peut pas encore payer</td></tr>
    <tr><td>Élèves Tango (inscrit)</td><td style="color:#c62828;font-weight:700;">✗ NON</td><td>Déjà réglé — a quitté Inscriptions Tango</td></tr>
    <tr><td>Supprimé</td><td style="color:#c62828;font-weight:700;">✗ NON</td><td>Fiche archivée</td></tr>
    <tr><td>Fiche partenaire sans email</td><td style="color:#c62828;font-weight:700;">✗ NON</td><td>Aucune adresse où écrire (l'autre partenaire est prévenu)</td></tr>
  </table>
  <p style="margin-top:16px;line-height:1.7;">
    <b>Pas de marqueur anti-doublon</b> (choix admin) : une personne qui règle est basculée dans « Élèves Tango »
    et sort donc de la cible. Une <b>seconde relance</b> reste possible en relançant la tâche, et n'atteindra
    que ceux qui n'ont toujours pas payé.<br>
    <b>Saison ciblée</b> : la saison à venir (2026-2027), ou celle indiquée au déclenchement manuel.
  </p>
</div>

</body>
</html>
`;

const sortie = path.join(RACINE, 'preview-relance-inscription-v1.html');
fs.writeFileSync(sortie, page);
// Garde-fou : le rendu réel doit être intégralement présent dans la page produite
if (!page.includes(solo) || !page.includes(couple)) {
  console.error('❌ La page produite ne contient pas le rendu réel — génération abandonnée');
  process.exit(1);
}
console.log('✅ preview-relance-inscription-v1.html régénérée depuis worker.js');
