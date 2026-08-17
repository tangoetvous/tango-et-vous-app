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
async function executer(nom, body, params = {}) {
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

  const src = corpsFonction(nom);
  const noms = Object.keys(contexte);
  const construire = new Function(...noms, `${src}\nreturn ${nom};`);
  const handler = construire(...noms.map(n => contexte[n]));

  const request = { json: async () => body, headers: { get: () => null }, url: 'https://app.tangoetvous.fr/' };
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

module.exports = { executer, corpsFonction, blocNotifs, CSS_NOTIFS };
