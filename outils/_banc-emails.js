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

module.exports = { executer, corpsFonction };
