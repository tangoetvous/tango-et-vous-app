// Banc d'essai commun : exécute un handler d'email de worker.js avec des
// substituts (Supabase, Brevo, push) et retourne les emails RÉELLEMENT produits.
// ⚠️ Ne fait AUCUN appel réseau — fetch est entièrement simulé.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

function corpsFonction(nom, src = SRC) {
  const i = src.indexOf('async function ' + nom + '(');
  if (i < 0) throw new Error('Handler introuvable : ' + nom);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('Accolades non équilibrées : ' + nom);
}

/**
 * Exécute un handler et capture les emails envoyés via Brevo.
 * @param {string} nom      nom du handler dans worker.js
 * @param {object} body     charge utile de la requête
 * @param {object} params   { 'tev_cours_dates': {...}, … } servis par le faux Supabase
 * @returns {Promise<Array<{to,subject,html}>>}
 */
async function executer(nom, body, params = {}, aides = []) {
  const envoyes = [];

  const fauxFetch = async (url, opts = {}) => {
    const u = String(url);
    // ── Brevo : on capture au lieu d'envoyer ──
    if (u.includes('api.brevo.com')) {
      const p = JSON.parse(opts.body || '{}');
      envoyes.push({
        to: (p.to && p.to[0] && p.to[0].email) || '',
        subject: p.subject || '',
        html: p.htmlContent || '',
      });
      return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
    }
    // ── Supabase : sert les paramètres fournis ──
    if (u.includes('supabase.co') || u.includes('/rest/v1/')) {
      const m = u.match(/cle=eq\.([^&]+)/);
      if (m) {
        const cle = decodeURIComponent(m[1]);
        const v = params[cle];
        return { ok: true, status: 200, json: async () => (v === undefined ? [] : [{ cle, valeur: v }]), text: async () => '' };
      }
      if (u.includes('select=cle,valeur')) {
        return { ok: true, status: 200, json: async () => Object.keys(params).map(c => ({ cle: c, valeur: params[c] })), text: async () => '' };
      }
      // ── Autres tables : __tables = [{ match:'<fragment d’URL>', rows:[…] }, …]
      for (const t of (params.__tables || [])) {
        if (u.includes(t.match)) {
          return { ok: true, status: 200, json: async () => t.rows, text: async () => '' };
        }
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };

  const contexte = {
    fetch: fauxFetch,
    console,
    SUPABASE_URL: 'https://exemple.supabase.co',
    SUPABASE_ANON: 'cle-anon-factice',
    _esc: s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    corsResponse: (o) => ({ ok: true, body: o }),
    jsonError: (c, m) => ({ erreur: c + ' ' + m }),
    _getSoranoLien: async () => params.__soranoLien || '',
    _insertNotification: async () => ({ ok: true, status: 201, text: async () => '' }),
    getFcmTokensAdmin: async () => [],
    getFcmTokensForEmail: async () => [],
    sendFcmPush: async () => {},
    sendBrevoNotification: async () => {},
    _calHmac: async () => 'jetonfactice0000000000000000000000',
    _buildTokenMap: async () => new Map(),
  };

  // `aides` : autres fonctions de worker.js dont le handler a besoin — elles sont
  // extraites et exécutées telles quelles (plus fidèle qu'un substitut écrit ici).
  // `corpsFonction` ne gère que les fonctions `async` ; certaines aides sont des
  // fonctions ordinaires, extraites ici de la même façon.
  const corpsSimple = (n) => {
    const i = SRC.indexOf('function ' + n + '(');
    if (i < 0) throw new Error('Fonction introuvable : ' + n);
    let d = 0;
    for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
      if (SRC[k] === '{') d++;
      else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
    }
    throw new Error('Accolades non équilibrées : ' + n);
  };
  const extraire = (n) => SRC.includes('async function ' + n + '(') ? corpsFonction(n) : corpsSimple(n);
  const src = [...aides.map(extraire), corpsFonction(nom)].join('\n');
  const noms = Object.keys(contexte);
  const construire = new Function(...noms, `${src}\nreturn ${nom};`);
  const handler = construire(...noms.map(n => contexte[n]));

  // Certains crons lisent request.text() plutôt que request.json()
  const request = {
    json: async () => body,
    text: async () => JSON.stringify(body || {}),
    headers: { get: () => null },
    url: 'https://app.tangoetvous.fr/',
  };
  const env = { BREVO_API_KEY: 'cle-brevo-factice', SUPABASE_SERVICE_KEY: 'cle-service-factice', HMAC_SECRET: 'secret', CRON_SECRET: 's' };
  await handler(request, env);
  return envoyes;
}

// ── Encadrés « notifications » (panel 🔔, toast, push OS) ────────────────────
// ⚠️ Ces encadrés sont RÉDIGÉS À LA MAIN, contrairement aux emails de la page :
// les notifications ne sont pas produites par un gabarit qu'on puisse exécuter
// (elles partent en base et vers FCM). Ils sont conservés depuis les anciennes
// maquettes et signalés comme tels sur la page.
const CSS_NOTIFS = `
.pv-notifs { max-width:660px; margin:0 auto; background:#141414; color:#ddd; padding:24px 20px 6px; }
.pv-notifs .email-block { margin-bottom:44px; }
.pv-notifs .email-label { color:#888; font-size:11px; letter-spacing:2px; text-transform:uppercase; margin-bottom:8px; padding-left:4px; }
.pv-notifs .email-label strong { color:#D4AF37; }
.pv-notifs .email-label em { color:#aaa; font-style:normal; font-size:10px; }
.pv-notifs .push-mockup { background:#fff; border-radius:14px; box-shadow:0 4px 24px rgba(0,0,0,.35); padding:14px 16px; max-width:360px; display:flex; gap:12px; align-items:flex-start; margin-bottom:12px; }
.pv-notifs .push-mockup-icon { width:36px; height:36px; border-radius:8px; background:#111; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
.pv-notifs .push-mockup-body { flex:1; }
.pv-notifs .push-mockup-app { font-size:11px; font-weight:700; color:#555; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px; }
.pv-notifs .push-mockup-title { font-size:13px; font-weight:700; color:#111; margin-bottom:2px; }
.pv-notifs .push-mockup-text { font-size:12px; color:#444; line-height:1.4; }
.pv-notifs .push-mockup-time { font-size:11px; color:#999; margin-top:4px; }
.pv-main { max-width:660px; margin:34px auto 0; font-size:13px; background:#fff3e0; border:1px solid #ffe0b2; border-left:4px solid #e65100; padding:12px 18px; color:#5d4037; line-height:1.6; }
`;

/**
 * Rend les encadrés notifications d'une famille, précédés de leur avertissement.
 * @param {string} fichier  nom du fichier dans outils/blocs/
 */
function blocNotifs(fichier) {
  const p = path.join(__dirname, 'blocs', fichier);
  if (!fs.existsSync(p)) return '';
  return `<div class="pv-main">✍️ <b>Section rédigée à la main</b>, contrairement aux emails ci-dessus :
les notifications (toast, panel 🔔, push OS) ne passent pas par un gabarit qu'on puisse exécuter.
Elles sont donc à vérifier manuellement en cas de changement.</div>
<div class="pv-notifs">${fs.readFileSync(p, 'utf8')}</div>`;
}

/**
 * Construit une page de preview complète à partir d'une liste de cas exécutés.
 * Utilisé par les générateurs des familles courtes ; les familles historiques
 * (inscription, stages, cartes, essai, yoga) gardent leur mise en page propre.
 *
 * @param {object} o
 *   titre, sousTitre, commande  — en-tête de la page
 *   accent                      — couleur d'accent (bordures, puces)
 *   cas                         — [{ id, titre, note, handler, body, tables?, aides? }]
 *   params                      — paramètres servis par le faux Supabase
 *   notifs?                     — nom d'un fichier de outils/blocs/
 *   absents?                    — HTML du tableau « ce qui n'existe pas »
 *   fin?                        — HTML du pied de page
 *   sortie                      — chemin du fichier à écrire
 */
async function construirePage(o) {
  const ech = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ACC = o.accent || '#D4AF37';
  let sections = '', nav = '', total = 0;
  for (const c of o.cas) {
    const params = c.tables ? { ...o.params, __tables: c.tables } : o.params;
    const mails = await executer(c.handler, c.body, params, c.aides || []);
    total += mails.length;
    nav += `<a href="#${c.id}">${ech(c.titre.split('—')[0].trim())}</a>`;
    sections += `<div class="pv-titre" id="${c.id}">${ech(c.titre)}</div>
<div class="pv-com">${c.note} <span class="pv-h">Handler : <code>${c.handler}</code> · ${mails.length} email(s) envoyé(s).</span></div>`;
    if (!mails.length) sections += `<div class="pv-com" style="color:#b71c1c;">⚠️ Aucun email produit avec ces données d'exemple — à vérifier.</div>`;
    for (const m of mails) {
      const admin = /tangoetvous@gmail\.com|regardsepose@gmail\.com/.test(m.to);
      sections += `<div class="pv-dest">${admin ? '📥 Email ADMIN' : '📧 Email DESTINATAIRE'} → <code>${ech(m.to)}</code></div>
<div class="pv-sujet"><strong>Objet :</strong> ${ech(m.subject)}</div>
<div class="pv-mail">${m.html}</div>`;
    }
  }

  const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ech(o.titre)}</title>
<style>
body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
.pv-head { background:#111; border-bottom:3px solid ${ACC}; padding:22px 24px; text-align:center; }
.pv-head h1 { font-family:Georgia,serif; font-size:20px; font-weight:300; letter-spacing:5px; color:${ACC}; margin:0; }
.pv-head p { font-size:12px; color:#888; margin:8px 0 0; }
.pv-gen { background:#0d2b0d; color:#a5d6a7; font-size:12px; text-align:center; padding:9px 16px; border-bottom:1px solid #1b5e20; line-height:1.6; }
.pv-gen code { color:#fff; }
.pv-nav { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; padding:12px 16px; background:#0a0a0a; position:sticky; top:0; z-index:10; }
.pv-nav a { color:${ACC}; text-decoration:none; font-size:11px; border:1px solid #333; padding:5px 12px; border-radius:20px; }
.pv-titre { max-width:660px; margin:38px auto 0; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#fff; background:#333; padding:10px 20px; border-left:4px solid ${ACC}; }
.pv-com { max-width:660px; margin:0 auto; font-size:13px; color:#555; padding:12px 20px; line-height:1.7; background:#fff; }
.pv-h { display:block; margin-top:6px; color:#666; font-size:12px; }
.pv-dest { max-width:660px; margin:16px auto 0; font-size:12px; color:#333; background:#eceff1; padding:7px 16px; border-radius:6px 6px 0 0; font-weight:700; }
.pv-sujet { max-width:660px; margin:0 auto; font-size:13px; background:#f7f7f7; border-left:4px solid ${ACC}; padding:10px 16px; color:#222; }
.pv-mail { max-width:600px; margin:10px auto 0; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.12); }
.pv-fin { max-width:660px; margin:40px auto 0; background:#fff; padding:18px 20px; font-size:13px; color:#444; line-height:1.8; border-top:3px solid ${ACC}; }
table.tbl { width:100%; border-collapse:collapse; font-size:13px; margin-top:10px; }
table.tbl th { text-align:left; padding:8px; background:#eee; }
table.tbl td { padding:8px; border-top:1px solid #ddd; vertical-align:top; }
${CSS_NOTIFS}
</style>
</head>
<body>

<div class="pv-head">
  <h1>${ech(o.titre)}</h1>
  <p>${ech(o.sousTitre || '')}</p>
</div>
<div class="pv-gen">✅ Page <b>générée automatiquement</b> en exécutant les handlers de <code>worker.js</code> (Supabase et Brevo simulés) —
ce que vous voyez est exactement ce que reçoivent les destinataires.<br>Régénérer avec <code>${ech(o.commande)}</code></div>
<div class="pv-nav">${nav}${o.absents ? `<a href="#absents">${ech(o.absentsOnglet || 'Emails absents')}</a>` : ''}${o.notifs ? '<a href="#notifs">🔔 Notifications</a>' : ''}</div>

${sections}

${o.absents ? `<div class="pv-titre" id="absents" style="border-left-color:#c62828;">${ech(o.absentsTitre || "Ce que les anciennes maquettes annonçaient et qui n'existe pas")}</div>
<div class="pv-com">${o.absents}</div>` : ''}

${o.notifs ? `<div class="pv-titre" id="notifs" style="border-left-color:#5c9dc2;">Notifications — toast, panel 🔔 et push OS</div>
${blocNotifs(o.notifs)}` : ''}

<div class="pv-fin">${o.fin || ''}<p style="margin-top:14px;">${total} emails produits pour cette page.</p></div>

</body>
</html>
`;
  fs.writeFileSync(o.sortie, page);
  console.log(`✅ ${path.basename(o.sortie)} régénérée — ${o.cas.length} cas, ${total} emails`);
  return total;
}

module.exports = { executer, corpsFonction, blocNotifs, CSS_NOTIFS, construirePage };
