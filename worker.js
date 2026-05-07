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
