// Cloudflare Worker — Tango & Vous
// Gère les routes dynamiques + sert les assets statiques en fallback
//
// Aucun secret Cloudflare requis :
//   - Clé anon Supabase : publique (déjà dans le frontend)
//   - Opérations admin : JWT de l'utilisateur passé en Authorization
//   - Brevo : optionnel, si BREVO_API_KEY défini dans les secrets Cloudflare
//
// Routes :
//   POST  /admin/api/devis             — formulaire public → demandes_devis
//   POST  /api/devis/creer             — admin → réserver numéro + créer devis
//   PATCH /api/devis/:id/emettre       — admin → passer brouillon → emis
//   PATCH /api/devis/:id/annuler       — admin → annuler devis
//   PATCH /api/demandes-devis/:id      — admin → changer statut demande
//   PATCH /api/admin/update-auth-email — admin → sync email dans Supabase Auth (service role)
//   GET   /api/calendar/token          — génère l'URL ICS personnalisée (JWT requis)
//   GET   /calendar/e-{token}.ics      — flux iCalendar élève (token signé HMAC)
//   *                                  — assets statiques (Cloudflare Static Assets)

const SUPABASE_URL  = 'https://qhngqzvvllktuwspojxc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobmdxenZ2bGxrdHV3c3BvanhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjQ0NDYsImV4cCI6MjA5MjMwMDQ0Nn0.j-yMQryi3qoImIf6vyiqQ3SKzHeJoPsrJuP1YwaSyLs';

const CORS_ORIGINS = [
  'https://www.tangoetvous.com',
  'https://app.tangoetvous.fr',
];

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method;

      if (method === 'OPTIONS') {
        return corsResponse(null, 204, {}, request);
      }

      // Bloquer l'accès aux backups (données personnelles RGPD)
      if (pathname.startsWith('/backups/')) {
        return new Response('Forbidden', { status: 403 });
      }

      // POST /admin/api/devis — formulaire public (clé anon)
      if (pathname === '/admin/api/devis' && method === 'POST') {
        return handleDemandeDevis(request, env);
      }

      // Routes admin — JWT de l'admin extrait de Authorization
      const jwt = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();

      if (pathname === '/api/devis/creer' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleCreerDevis(request, jwt);
      }

      const emettreM = pathname.match(/^\/api\/devis\/([^/]+)\/emettre$/);
      if (emettreM && method === 'PATCH') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleEmettreDevis(emettreM[1], jwt);
      }

      const annulerM = pathname.match(/^\/api\/devis\/([^/]+)\/annuler$/);
      if (annulerM && method === 'PATCH') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleAnnulerDevis(annulerM[1], jwt);
      }

      const demandeM = pathname.match(/^\/api\/demandes-devis\/([^/]+)$/);
      if (demandeM && method === 'PATCH') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleUpdateDemande(request, demandeM[1], jwt);
      }

      if (pathname === '/api/admin/update-auth-email' && method === 'PATCH') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        if (!env.SUPABASE_SERVICE_KEY) return jsonError(503, 'Service non configuré');
        return handleUpdateAuthEmail(request, env.SUPABASE_SERVICE_KEY);
      }

      // GET /api/calendar/token — URL ICS personnalisée (JWT requis)
      if (pathname === '/api/calendar/token' && method === 'GET') {
        if (!jwt) return jsonError(401, 'Token manquant — connectez-vous d\'abord');
        return handleCalendarToken(jwt, env);
      }

      // GET /calendar/e-{token}.ics — flux iCalendar élève (personnalisé)
      const calM = pathname.match(/^\/calendar\/e-([A-Za-z0-9._-]+)\.ics$/);
      if (calM && method === 'GET') {
        return handleEleveICS(calM[1], env);
      }

      // GET /calendar/{slug}.ics — flux iCalendar public (sans token)
      const CAL_SLUGS = ['paris-debutant','paris-intermediaire','vincennes-debutant','vincennes-intermediaire','stages','milongas','yoga-yin','yoga-hatha'];
      const pubCalM = pathname.match(/^\/calendar\/([a-z-]+)\.ics$/);
      if (pubCalM && CAL_SLUGS.includes(pubCalM[1]) && method === 'GET') {
        return handlePublicICS(pubCalM[1]);
      }

      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('Worker error:', e);
      return jsonError(500, 'Une erreur est survenue');
    }
  },
};


// ================================================================
// POST /admin/api/devis — formulaire public (clé anon, RLS permissif)
// ================================================================
async function handleDemandeDevis(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const row = {
    mode:               body.mode || 'event',
    prestations_ids:    body.prestations_ids || [],
    prestations_labels: body.prestations_labels || [],
    budget:             body.budget || '',
    message:            body.message || '',
    comment_connu:      body.comment_connu || '',
    civilite:           body.civilite || '',
    prenom:             (body.prenom || '').trim(),
    nom:                (body.nom || '').trim(),
    email:              (body.email || '').trim().toLowerCase(),
    telephone:          body.telephone || '',
    type_contact:       body.type_contact || 'particulier',
    nom_societe:        body.nom_societe || '',
    adresse_facturation: body.adresse_facturation || '',
    statut:             'reçue',
  };

  if (body.mode === 'event') {
    Object.assign(row, {
      type_evenement:    body.type_evenement    || '',
      date_evenement:    body.date_evenement    || '',
      horaire_evenement: body.horaire_evenement || '',
      date_flexible:     !!body.date_flexible,
      lieu:              body.lieu              || '',
      code_postal:       body.code_postal       || '',
      nombre_invites:    body.nombre_invites ? parseInt(body.nombre_invites) : null,
      duree_prestation:  body.duree_prestation  || '',
    });
  } else {
    Object.assign(row, {
      type_demande:         body.type_demande         || '',
      pour_qui:             body.pour_qui             || '',
      niveau_tango:         body.niveau_tango         || '',
      date_butoir:          body.date_butoir          || '',
      date_butoir_flexible: !!body.date_butoir_flexible,
      professeur:           body.professeur           || '',
      lieu_cours:           body.lieu_cours           || '',
      commune_domicile:     body.commune_domicile     || '',
      duree_cours:          body.duree_cours          || '',
      nombre_cours:         body.nombre_cours         || '',
      dates_periodes:       body.dates_periodes       || '',
    });
  }

  let insertRes;
  try {
    insertRes = await sbFetch('demandes_devis', 'POST', row, SUPABASE_ANON);
  } catch (e) {
    console.error('Supabase network error:', e);
    return jsonError(500, 'Une erreur est survenue');
  }

  if (!insertRes.ok) {
    console.error('Supabase insert error:', await insertRes.text());
    return jsonError(500, 'Une erreur est survenue');
  }

  if (env.BREVO_API_KEY) {
    sendBrevoNotification(env.BREVO_API_KEY, body).catch(() => {});
  }

  return corsResponse({ ok: true }, 200, {}, request);
}


// ================================================================
// POST /api/devis/creer — admin crée un devis officiel (JWT admin)
// ================================================================
async function handleCreerDevis(request, jwt) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  // Réserver un numéro atomique via RPC SECURITY DEFINER
  let rpcRes;
  try {
    rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserver_numero_devis`, {
      method: 'POST',
      headers: authHeaders(jwt),
      body: JSON.stringify({}),
    });
  } catch (e) {
    console.error('RPC network error:', e);
    return jsonError(500, 'Une erreur est survenue');
  }
  if (!rpcRes.ok) {
    console.error('RPC error:', await rpcRes.text());
    return jsonError(500, 'Une erreur est survenue');
  }
  const numero = await rpcRes.json();
  const match = numero.match(/^DEVIS-(\d{4})-(\d{4})$/);
  if (!match) return jsonError(500, 'Format numéro invalide');

  const annee = parseInt(match[1]);
  const numSequence = parseInt(match[2]);
  const dateEmission = new Date().toISOString().split('T')[0];
  const dateValidite = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const montantHt = (body.prestations || []).reduce((s, p) => s + (parseFloat(p.prix) || 0), 0);

  const row = {
    numero,
    annee,
    num_sequence:   numSequence,
    date_emission:  dateEmission,
    date_validite:  dateValidite,
    demande_id:     body.demande_id || null,
    client_nom:     body.client_nom     || '',
    client_adresse: body.client_adresse || '',
    evt_date:       body.evt_date       || '',
    evt_horaire:    body.evt_horaire    || '',
    evt_lieu:       body.evt_lieu       || '',
    evt_details:    body.evt_details    || '',
    prestations:    body.prestations    || [],
    montant_ht:     montantHt,
    acompte_mode:   body.acompte_mode  || 'percent',
    acompte_value:  parseFloat(body.acompte_value) || 30,
    statut:         'brouillon',
  };

  const insertRes = await sbFetch('devis', 'POST', row, jwt, 'return=representation');
  if (!insertRes.ok) {
    console.error('Devis insert error:', await insertRes.text());
    return jsonError(500, 'Une erreur est survenue');
  }
  const [devis] = await insertRes.json();

  const params = new URLSearchParams({ numero, date_emission: dateEmission, date_validite: dateValidite });
  if (body.client_nom)     params.set('client',       body.client_nom);
  if (body.client_adresse) params.set('adresse',      body.client_adresse);
  if (body.evt_date)       params.set('evt_date',     body.evt_date);
  if (body.evt_horaire)    params.set('evt_horaire',  body.evt_horaire);
  if (body.evt_lieu)       params.set('evt_lieu',     body.evt_lieu);
  if (body.evt_details)    params.set('evt_details',  body.evt_details);
  (body.prestations || []).forEach((p, i) => {
    const n = i + 1;
    if (p.type)       params.set('type'     + n, p.type);
    if (p.intitule)   params.set('p'        + n, p.intitule);
    if (p.duree)      params.set('duree'    + n, String(p.duree));
    if (p.nbPassages) params.set('passages' + n, String(p.nbPassages));
    if (p.prix)       params.set('prix'     + n, String(p.prix));
  });
  if (body.acompte_mode)  params.set('acompte_mode',  body.acompte_mode);
  if (body.acompte_value) params.set('acompte_value', String(body.acompte_value));

  const generateurUrl = `https://app.tangoetvous.fr/generateur-devis.html?${params.toString()}`;
  return corsResponse({ devis, generateur_url: generateurUrl }, 200);
}


// ================================================================
// PATCH /api/devis/:id/emettre
// ================================================================
async function handleEmettreDevis(id, jwt) {
  const r = await sbFetch(`devis?id=eq.${id}&statut=eq.brouillon`, 'PATCH',
    { statut: 'emis' }, jwt, 'return=representation');
  if (!r.ok) { console.error('Supabase error:', await r.text()); return jsonError(500, 'Une erreur est survenue'); }
  const rows = await r.json();
  if (!rows.length) return jsonError(409, 'Devis non en brouillon ou introuvable');
  return corsResponse(rows[0], 200);
}


// ================================================================
// PATCH /api/devis/:id/annuler
// ================================================================
async function handleAnnulerDevis(id, jwt) {
  const r = await sbFetch(`devis?id=eq.${id}`, 'PATCH',
    { statut: 'annule' }, jwt, 'return=representation');
  if (!r.ok) { console.error('Supabase error:', await r.text()); return jsonError(500, 'Une erreur est survenue'); }
  const rows = await r.json();
  return corsResponse(rows[0] || { id }, 200);
}


// ================================================================
// PATCH /api/demandes-devis/:id
// ================================================================
async function handleUpdateDemande(request, id, jwt) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const patch = {};
  ['statut', 'notes'].forEach(k => { if (body[k] !== undefined) patch[k] = body[k]; });
  if (!Object.keys(patch).length) return jsonError(400, 'Aucun champ modifiable');

  const r = await sbFetch(`demandes_devis?id=eq.${id}`, 'PATCH', patch, jwt, 'return=representation');
  if (!r.ok) { console.error('Supabase error:', await r.text()); return jsonError(500, 'Une erreur est survenue'); }
  const rows = await r.json();
  return corsResponse(rows[0] || { id }, 200);
}


// ================================================================
// PATCH /api/admin/update-auth-email — sync email dans Supabase Auth
// Utilise la service role key (env.SUPABASE_SERVICE_KEY) pour accéder
// à l'Admin Auth API et mettre à jour l'email sans déconnecter l'élève.
// ================================================================
async function handleUpdateAuthEmail(request, serviceKey) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const oldEmail = (body.oldEmail || '').trim().toLowerCase();
  const newEmail = (body.newEmail || '').trim().toLowerCase();
  if (!oldEmail || !newEmail || oldEmail === newEmail) {
    return corsResponse({ ok: true, skipped: true }, 200);
  }

  const serviceHeaders = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  };

  // Trouver l'utilisateur par son ancien email
  let listRes;
  try {
    listRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(oldEmail)}&page=1&per_page=1`,
      { headers: serviceHeaders }
    );
  } catch (e) {
    console.error('Auth admin list error:', e);
    return jsonError(500, 'Une erreur est survenue');
  }
  if (!listRes.ok) {
    console.error('Auth admin list HTTP error:', listRes.status, await listRes.text());
    return jsonError(500, 'Une erreur est survenue');
  }
  const listData = await listRes.json();
  const users = listData.users || [];
  if (!users.length) {
    // Pas de compte Auth (l'élève ne s'est jamais connecté) — pas d'erreur
    return corsResponse({ ok: true, skipped: true, reason: 'no_auth_account' }, 200);
  }
  const userId = users[0].id;

  // Mettre à jour l'email dans Auth
  let updateRes;
  try {
    updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: serviceHeaders,
      body: JSON.stringify({ email: newEmail, email_confirm: true }),
    });
  } catch (e) {
    console.error('Auth admin update error:', e);
    return jsonError(500, 'Une erreur est survenue');
  }
  if (!updateRes.ok) {
    console.error('Auth admin update HTTP error:', updateRes.status, await updateRes.text());
    return jsonError(500, 'Une erreur est survenue');
  }

  return corsResponse({ ok: true, userId }, 200);
}


// ================================================================
// Brevo — notification email admin (optionnel)
// ================================================================
function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function sendBrevoNotification(apiKey, body) {
  const prestations = (body.prestations_labels || []).map(_esc).join(', ') || '(non précisé)';
  const nom = _esc(`${body.civilite || ''} ${body.prenom || ''} ${body.nom || ''}`.trim());
  const html = `
    <h2>Nouvelle demande de devis</h2>
    <p><strong>Contact :</strong> ${nom} &lt;${_esc(body.email)}&gt; ${body.telephone ? '· ' + _esc(body.telephone) : ''}</p>
    <p><strong>Mode :</strong> ${body.mode === 'event' ? 'Événement' : 'Cours privé'}</p>
    <p><strong>Prestations :</strong> ${prestations}</p>
    ${body.type_evenement ? `<p><strong>Type :</strong> ${_esc(body.type_evenement)}</p>` : ''}
    ${body.date_evenement ? `<p><strong>Date :</strong> ${_esc(body.date_evenement)}</p>` : ''}
    ${body.lieu ? `<p><strong>Lieu :</strong> ${_esc(body.lieu)} ${body.code_postal ? '(' + _esc(body.code_postal) + ')' : ''}</p>` : ''}
    ${body.nombre_invites ? `<p><strong>Invités :</strong> ${_esc(body.nombre_invites)}</p>` : ''}
    ${body.message ? `<p><strong>Message :</strong></p><p style="white-space:pre-wrap">${_esc(body.message)}</p>` : ''}
    <hr><p><a href="https://app.tangoetvous.fr/admin.html">→ Voir dans l'admin</a></p>
  `;
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Tango & Vous', email: 'tangoetvous@gmail.com' },
      to: [{ email: 'tangoetvous@gmail.com', name: 'Admin Tango & Vous' }],
      subject: `📋 Nouvelle demande de devis — ${nom}`,
      htmlContent: html,
    }),
  });
}


// ================================================================
// Helpers Supabase REST
// ================================================================
function authHeaders(jwt) {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${jwt}`,
  };
}

function sbFetch(resource, method, body, jwt, prefer) {
  const headers = authHeaders(jwt);
  if (prefer) headers['Prefer'] = prefer;
  return fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}


// ================================================================
// Helpers réponse CORS
// ================================================================
function corsOrigin(request) {
  const origin = (request && request.headers && request.headers.get('Origin')) || '';
  return CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[1];
}

function corsResponse(data, status, extraHeaders, request) {
  return new Response(data !== null ? JSON.stringify(data) : null, {
    status,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin(request),
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}


// ================================================================
// CALENDRIER ICS — abonnement élève
// ================================================================

async function handleCalendarToken(jwt, env) {
  let email = '';
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    email = (payload.email || '').toLowerCase().trim();
  } catch (e) {}
  if (!email) return jsonError(400, 'Email introuvable dans le token');
  const secret = env.SUPABASE_SERVICE_KEY || 'tev-calendar-fallback';
  const token = await _calEncodeToken(email, secret);
  return corsResponse({ url: `/calendar/e-${token}.ics` }, 200, {}, null);
}

async function handleEleveICS(token, env) {
  const secret = env.SUPABASE_SERVICE_KEY || 'tev-calendar-fallback';
  const email = await _calDecodeToken(token, secret);
  if (!email) return new Response('Token invalide', { status: 403 });
  const ics = await _generateEleveICS(email);
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tango-et-vous.ics"',
      'Cache-Control': 'no-cache, max-age=0',
    },
  });
}

async function _calHmac(email, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(email));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _calEncodeToken(email, secret) {
  const b64 = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const hmac = await _calHmac(email, secret);
  return b64 + '.' + hmac.slice(0, 20);
}

async function _calDecodeToken(token, secret) {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  let email;
  try {
    email = atob(token.slice(0, dot).replace(/-/g, '+').replace(/_/g, '/')).toLowerCase().trim();
  } catch (e) { return null; }
  if (!email || !email.includes('@')) return null;
  const expected = await _calHmac(email, secret);
  if (expected.slice(0, 20) !== token.slice(dot + 1)) return null;
  return email;
}

function _calSaison() {
  const now = new Date();
  const y = now.getFullYear();
  return (now.getMonth() + 1) >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function _calParseTime(str) {
  const m = (str || '').match(/^(\d{1,2})h(\d{2})?/);
  if (!m) return '000000';
  return String(parseInt(m[1])).padStart(2, '0') + (m[2] || '00') + '00';
}

function _calIcsDate(isoDate, timeStr, afterTime) {
  // Si afterTime est fourni et que timeStr est avant afterTime → lendemain (ex: fin à 2h après début à 20h30)
  let date = isoDate;
  if (afterTime && _calParseTime(timeStr) < _calParseTime(afterTime)) {
    const d = new Date(isoDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
  }
  return date.replace(/-/g, '') + 'T' + _calParseTime(timeStr);
}

function _calEsc(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function _calFold(line) {
  const out = [];
  while (line.length > 75) { out.push(line.slice(0, 75)); line = ' ' + line.slice(75); }
  out.push(line);
  return out.join('\r\n');
}

function _calLine(key, val) {
  return _calFold(`${key}:${_calEsc(String(val || ''))}`);
}

async function _generateEleveICS(email) {
  const sai = _calSaison();
  const saiStart = sai.slice(0, 4) + '-09-01';

  const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };
  const [inscRes, stagesRes, paramsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/inscriptions_cours?email=eq.${encodeURIComponent(email)}&statut=eq.inscrit&saison=eq.${sai}&select=ville,niveau`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/inscriptions_stages?email=eq.${encodeURIComponent(email)}&type_confirmation=eq.confirme&select=stage_date,stage_nom,slots`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/parametres?cle=in.(tev_cours_dates,tev_milongas_${sai},tev_params_paris_${sai},tev_params_vincennes_${sai})&select=cle,valeur`, { headers }),
  ]);

  const inscriptions = await inscRes.json().catch(() => []);
  const stagesData   = await stagesRes.json().catch(() => []);
  const paramsData   = await paramsRes.json().catch(() => []);

  const params = {};
  (Array.isArray(paramsData) ? paramsData : []).forEach(p => { params[p.cle] = p.valeur; });

  const coursDates  = params['tev_cours_dates'] || {};
  const parisDates  = coursDates.paris      || [];
  const vincDates   = coursDates.vincennes  || [];
  const milongasVal = params[`tev_milongas_${sai}`] || {};
  const milongas    = milongasVal.milongas || [];
  const pparis      = params[`tev_params_paris_${sai}`]      || {};
  const pvinc       = params[`tev_params_vincennes_${sai}`]  || {};

  const HOR_P = { deb:'20h30', deb_fin:'21h45', int:'21h45', int_fin:'23h00' };
  const HOR_V = { deb:'19h30', deb_fin:'21h00', int:'21h00', int_fin:'22h30' };
  const horP  = Object.assign({}, HOR_P, pparis.horaires || {});
  const horV  = Object.assign({}, HOR_V, pvinc.horaires  || {});

  const adrP = pparis.adresse || {};
  const adrV = pvinc.adresse  || {};
  const locParis = [adrP.nom || 'Centre Kim Kan', adrP.rue || '6 rue Borrégo, Paris 20e'].filter(Boolean).join(' — ');
  const locVinc  = [adrV.nom || 'Centre Sorano',  adrV.rue || ''].filter(Boolean).join(' — ');

  const events = [];

  // 1. Cours tango de l'élève
  (Array.isArray(inscriptions) ? inscriptions : []).forEach(ins => {
    const isVinc   = ins.ville === 'vincennes';
    const isInt    = ins.niveau === 'intermediaire';
    const dates    = isVinc ? vincDates : parisDates;
    const hor      = isVinc ? horV : horP;
    const dKey     = isInt ? 'int' : 'deb';
    const fKey     = isInt ? 'int_fin' : 'deb_fin';
    const summary  = `Tango ${isVinc ? 'Vincennes' : 'Paris'} — ${isInt ? 'Intermédiaire' : 'Débutant'}`;
    const location = isVinc ? locVinc : locParis;
    dates.filter(d => d >= saiStart).forEach(d => {
      events.push({ uid: `cours-${ins.ville}-${ins.niveau}-${d}@tangoetvous.fr`, dtstart: _calIcsDate(d, hor[dKey]), dtend: _calIcsDate(d, hor[fKey]), summary, location, description: 'Cours de tango — Tango & Vous' });
    });
  });

  // 2. Milongas
  milongas.forEach(mil => {
    const loc = [(mil.lieu || {}).nom, (mil.lieu || {}).rue].filter(Boolean).join(' — ');
    (mil.dates || []).forEach(de => {
      const dStr = typeof de === 'string' ? de : de.date;
      if (!dStr || dStr < saiStart) return;
      const hdeb = (typeof de === 'object' ? de.horaire_debut : null) || mil.horaire_debut || '20h30';
      events.push({ uid: `milonga-${(mil.id || 'mil').replace(/\s/g, '')}-${dStr}@tangoetvous.fr`, dtstart: _calIcsDate(dStr, hdeb), duration: 'PT3H', summary: mil.nom || 'Milonga', location: loc, description: `Milonga — ${(mil.lieu || {}).transport || ''}` });
    });
  });

  // 3. Stages de l'élève
  (Array.isArray(stagesData) ? stagesData : []).filter(s => s.stage_date).forEach(s => {
    events.push({ uid: `stage-${s.stage_date}-${email.replace(/[^a-z0-9]/g,'')}@tangoetvous.fr`, dtstart: _calIcsDate(s.stage_date, '15h00'), dtend: _calIcsDate(s.stage_date, '18h00'), summary: s.stage_nom || 'Stage de tango', location: locParis, description: 'Stage de tango — Tango & Vous' });
  });

  return _buildICS('Tango & Vous', events);
}

// ================================================================
// Flux ICS publics — 8 calendriers thématiques sans token
// ================================================================

async function handlePublicICS(slug) {
  const saiCur = _calSaison();
  const y2 = parseInt(saiCur.split('-')[1]);
  const saiNext      = `${y2}-${y2 + 1}`;
  const saiNextStart = `${y2}-09-01`;
  const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

  // Fetch all params — même approche que chargerParamsRemote() côté admin
  const paramsData = await fetch(
    `${SUPABASE_URL}/rest/v1/parametres?select=cle,valeur`,
    { headers }
  ).then(r => r.json()).catch(() => []);

  const P = {};
  (Array.isArray(paramsData) ? paramsData : []).forEach(p => { P[p.cle] = p.valeur; });

  // Cours dates — single key, contains all seasons admin has configured
  const cd        = P['tev_cours_dates'] || {};
  const parDates  = cd.paris      || [];
  const vincDates = cd.vincennes  || [];
  const yogaDates = cd.yoga       || [];

  // Milongas — merge both seasons (match by id then nom)
  const milsCur  = (P[`tev_milongas_${saiCur}`]  || {}).milongas || [];
  const milsNext = (P[`tev_milongas_${saiNext}`] || {}).milongas || [];
  const milsAll  = [...milsCur];
  milsNext.forEach(mn => {
    const ex = milsAll.find(m => (m.id && m.id === mn.id) || m.nom === mn.nom);
    if (ex) ex.dates = [...(ex.dates || []), ...(mn.dates || [])];
    else milsAll.push(mn);
  });

  // Stages — merge both seasons
  const stagesAll = [
    ...((P[`tev_dates_stages_${saiCur}`]  || {}).stages || []),
    ...((P[`tev_dates_stages_${saiNext}`] || {}).stages || []),
  ];

  // Select params by date
  function par(type, date) {
    return P[`tev_params_${type}_${date >= saiNextStart ? saiNext : saiCur}`] || {};
  }

  // Location from adresse object — no defaults
  function loc(adr) {
    return adr ? [adr.nom, adr.rue].filter(Boolean).join(' — ') : '';
  }

  const CAL_NAMES = {
    'paris-debutant':         'Tango — Paris — Débutant',
    'paris-intermediaire':    'Tango — Paris — Intermédiaire',
    'vincennes-debutant':     'Tango — Vincennes — Débutant',
    'vincennes-intermediaire':'Tango — Vincennes — Intermédiaire',
    'stages':                 'Stages Tango',
    'milongas':               'Milongas',
    'yoga-yin':               'Yin Yoga',
    'yoga-hatha':             'Hatha Yoga',
  };

  const events = [];

  if (slug === 'paris-debutant') {
    parDates.forEach(d => {
      const p = par('paris', d); const hor = p.horaires || {};
      if (!hor.deb) return;
      const ev = { uid:`paris-deb-${d}@tangoetvous.fr`, dtstart:_calIcsDate(d,hor.deb), summary:'Tango — Paris — Débutant', location:loc(p.adresse) };
      if (hor.deb_fin) ev.dtend = _calIcsDate(d, hor.deb_fin); else ev.duration = 'PT1H30M';
      events.push(ev);
    });

  } else if (slug === 'paris-intermediaire') {
    parDates.forEach(d => {
      const p = par('paris', d); const hor = p.horaires || {};
      if (!hor.int) return;
      const ev = { uid:`paris-int-${d}@tangoetvous.fr`, dtstart:_calIcsDate(d,hor.int), summary:'Tango — Paris — Intermédiaire', location:loc(p.adresse) };
      if (hor.int_fin) ev.dtend = _calIcsDate(d, hor.int_fin); else ev.duration = 'PT1H30M';
      events.push(ev);
    });

  } else if (slug === 'vincennes-debutant') {
    vincDates.forEach(d => {
      const p = par('vincennes', d); const hor = p.horaires || {};
      if (!hor.deb) return;
      const ev = { uid:`vinc-deb-${d}@tangoetvous.fr`, dtstart:_calIcsDate(d,hor.deb), summary:'Tango — Vincennes — Débutant', location:loc(p.adresse) };
      if (hor.deb_fin) ev.dtend = _calIcsDate(d, hor.deb_fin); else ev.duration = 'PT1H30M';
      events.push(ev);
    });

  } else if (slug === 'vincennes-intermediaire') {
    vincDates.forEach(d => {
      const p = par('vincennes', d); const hor = p.horaires || {};
      if (!hor.int) return;
      const ev = { uid:`vinc-int-${d}@tangoetvous.fr`, dtstart:_calIcsDate(d,hor.int), summary:'Tango — Vincennes — Intermédiaire', location:loc(p.adresse) };
      if (hor.int_fin) ev.dtend = _calIcsDate(d, hor.int_fin); else ev.duration = 'PT1H30M';
      events.push(ev);
    });

  } else if (slug === 'stages') {
    stagesAll.forEach(s => {
      if (!s.date) return;
      const p   = par('stages', s.date);
      const hor = p.horaires || {};
      // Build slots exactly like the student accueil (prochain stage box)
      const hasTech = !!s.technique;
      const n       = s.nStages || 2;
      const sDb     = ['s1_deb','s2_deb','s3_deb','s4_deb'];
      const sFn     = ['s1_fin','s2_fin','s3_fin','s4_fin'];
      const sNames  = [s.s1, s.s2, s.s3, s.s4];
      const slotTimes = [];
      if (hasTech && hor.tech_deb && hor.tech_fin)
        slotTimes.push({ d:hor.tech_deb, f:hor.tech_fin, label: s.tech || 'Technique' });
      for (let si = 0; si < n; si++) {
        if (hor[sDb[si]] && hor[sFn[si]])
          slotTimes.push({ d:hor[sDb[si]], f:hor[sFn[si]], label: sNames[si] || `Stage ${si + 1}` });
      }
      if (!slotTimes.length) return; // horaires not configured — skip
      slotTimes.sort((a, b) => _calParseTime(a.d).localeCompare(_calParseTime(b.d)));
      const startH = slotTimes[0].d;
      const endH   = slotTimes[slotTimes.length - 1].f;
      const themes = (s.themes || []).filter(t => t && t !== 'À venir').join(' · ');
      const desc   = slotTimes.map(sl => `${sl.d}–${sl.f} : ${sl.label}`).join('\n');
      events.push({ uid:`stage-${s.date}@tangoetvous.fr`, dtstart:_calIcsDate(s.date,startH), dtend:_calIcsDate(s.date,endH), summary: themes ? `Stage — ${themes}` : 'Stage Tango', location:loc(p.adresse), description:desc });
    });

  } else if (slug === 'milongas') {
    // mil.dates peut être [{date, horaire_debut?, horaire_fin?}] ou ['YYYY-MM-DD', ...]
    milsAll.forEach(mil => {
      (mil.dates || []).forEach(de => {
        const dateStr = typeof de === 'string' ? de : de.date;
        if (!dateStr) return;
        const hdeb = (typeof de === 'object' ? de.horaire_debut : null) || mil.horaire_debut;
        const hfin = (typeof de === 'object' ? de.horaire_fin   : null) || mil.horaire_fin;
        if (!hdeb) return; // no start time — skip
        const l   = loc(mil.lieu);
        const uid = `milonga-${(mil.id||mil.nom||'m').replace(/[^a-z0-9]/gi,'').toLowerCase()}-${dateStr}@tangoetvous.fr`;
        const ev  = { uid, dtstart:_calIcsDate(dateStr,hdeb), summary:mil.nom, location:l, description:(mil.lieu||{}).transport||'' };
        if (hfin) ev.dtend = _calIcsDate(dateStr, hfin, hdeb); else ev.duration = 'PT3H';
        events.push(ev);
      });
    });

  } else if (slug === 'yoga-yin') {
    yogaDates.forEach(d => {
      const p = par('yoga', d); const hor = p.horaires || {};
      if (!hor.yin) return;
      const ev = { uid:`yoga-yin-${d}@tangoetvous.fr`, dtstart:_calIcsDate(d,hor.yin), summary:'Yin Yoga', location:loc(p.adresse) };
      if (hor.yin_fin) ev.dtend = _calIcsDate(d, hor.yin_fin); else ev.duration = 'PT1H30M';
      events.push(ev);
    });

  } else if (slug === 'yoga-hatha') {
    yogaDates.forEach(d => {
      const p = par('yoga', d); const hor = p.horaires || {};
      if (!hor.hatha) return;
      const ev = { uid:`yoga-hatha-${d}@tangoetvous.fr`, dtstart:_calIcsDate(d,hor.hatha), summary:'Hatha Yoga', location:loc(p.adresse) };
      if (hor.hatha_fin) ev.dtend = _calIcsDate(d, hor.hatha_fin); else ev.duration = 'PT1H30M';
      events.push(ev);
    });
  }

  const ics = _buildICS(CAL_NAMES[slug] || slug, events);
  return new Response(ics, {
    headers: { 'Content-Type':'text/calendar; charset=utf-8', 'Content-Disposition':'inline; filename="'+slug+'.ics"', 'Cache-Control':'no-cache, max-age=0' },
  });
}

// ================================================================
// Helper : construit le texte ICS complet depuis une liste d'events
// ================================================================
function _buildICS(calName, events) {
  events.sort((a, b) => a.dtstart.localeCompare(b.dtstart));
  const stamp = new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)+'Z';
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tango & Vous//FR',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',
    _calLine('X-WR-CALNAME', calName),
    'X-WR-TIMEZONE:Europe/Paris','REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'BEGIN:VTIMEZONE','TZID:Europe/Paris',
    'BEGIN:STANDARD','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','END:STANDARD',
    'BEGIN:DAYLIGHT','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','END:DAYLIGHT',
    'END:VTIMEZONE',
  ];
  events.forEach(ev => {
    lines.push('BEGIN:VEVENT');
    lines.push(_calLine('UID', ev.uid));
    lines.push('DTSTAMP:'+stamp);
    lines.push('DTSTART;TZID=Europe/Paris:'+ev.dtstart);
    if (ev.dtend)    lines.push('DTEND;TZID=Europe/Paris:'+ev.dtend);
    if (ev.duration) lines.push('DURATION:'+ev.duration);
    lines.push(_calLine('SUMMARY', ev.summary));
    if (ev.location)    lines.push(_calLine('LOCATION', ev.location));
    if (ev.description) lines.push(_calLine('DESCRIPTION', ev.description));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
