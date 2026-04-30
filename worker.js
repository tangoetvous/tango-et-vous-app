// Cloudflare Worker — Tango & Vous
// Gère les routes dynamiques + sert les assets statiques en fallback
//
// Secrets à configurer (wrangler secret put) :
//   SUPABASE_URL           ex: https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY
//   BREVO_API_KEY
//
// Routes :
//   POST  /admin/api/devis             — formulaire public → demandes_devis + Brevo
//   POST  /api/devis/creer             — admin → réserver numéro + créer devis
//   PATCH /api/devis/:id/emettre       — admin → passer brouillon → emis
//   PATCH /api/devis/:id/annuler       — admin → annuler devis
//   PATCH /api/demandes-devis/:id      — admin → changer statut demande
//   *                                  — assets statiques (Cloudflare Static Assets)

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

      // Preflight CORS
      if (method === 'OPTIONS') {
        return corsResponse(null, 204, {}, request);
      }

      // ── Routes API ──────────────────────────────────────────────

      // POST /admin/api/devis — formulaire public
      if (pathname === '/admin/api/devis' && method === 'POST') {
        return handleDemandeDevis(request, env);
      }

      // POST /api/devis/creer — admin crée un devis officiel
      if (pathname === '/api/devis/creer' && method === 'POST') {
        return withAdminAuth(request, env, () => handleCreerDevis(request, env));
      }

      // PATCH /api/devis/:id/emettre
      const emettreM = pathname.match(/^\/api\/devis\/([^/]+)\/emettre$/);
      if (emettreM && method === 'PATCH') {
        return withAdminAuth(request, env, () => handleEmettreDevis(emettreM[1], env));
      }

      // PATCH /api/devis/:id/annuler
      const annulerM = pathname.match(/^\/api\/devis\/([^/]+)\/annuler$/);
      if (annulerM && method === 'PATCH') {
        return withAdminAuth(request, env, () => handleAnnulerDevis(annulerM[1], env));
      }

      // PATCH /api/demandes-devis/:id — mise à jour statut demande
      const demandeM = pathname.match(/^\/api\/demandes-devis\/([^/]+)$/);
      if (demandeM && method === 'PATCH') {
        return withAdminAuth(request, env, () => handleUpdateDemande(request, demandeM[1], env));
      }

      // Fallback → assets statiques
      return env.ASSETS.fetch(request);
    } catch (e) {
      return jsonError(500, `Erreur interne: ${e.message || String(e)}`);
    }
  },
};


// ================================================================
// Auth middleware — vérifie le JWT Supabase passé en Authorization
// ================================================================
async function withAdminAuth(request, env, handler) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, 'Secrets SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurés dans Cloudflare');
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return jsonError(401, 'Token manquant — session expirée ?');

  const supaUrl = env.SUPABASE_URL.replace(/\/$/, '');
  try {
    const r = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => r.status);
      return jsonError(401, `Token invalide (${r.status}): ${body}`);
    }
    return handler();
  } catch(e) {
    return jsonError(500, `Erreur vérification auth: ${e.message || String(e)}`);
  }
}


// ================================================================
// POST /admin/api/devis — formulaire public
// ================================================================
async function handleDemandeDevis(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError(500, 'Configuration serveur manquante (secrets non définis)');
  }

  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  // Construire la ligne à insérer
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
      type_evenement:   body.type_evenement || '',
      date_evenement:   body.date_evenement || '',
      horaire_evenement: body.horaire_evenement || '',
      date_flexible:    !!body.date_flexible,
      lieu:             body.lieu || '',
      code_postal:      body.code_postal || '',
      nombre_invites:   body.nombre_invites ? parseInt(body.nombre_invites) : null,
      duree_prestation: body.duree_prestation || '',
    });
  } else {
    Object.assign(row, {
      type_demande:        body.type_demande || '',
      pour_qui:            body.pour_qui || '',
      niveau_tango:        body.niveau_tango || '',
      date_butoir:         body.date_butoir || '',
      date_butoir_flexible: !!body.date_butoir_flexible,
      professeur:          body.professeur || '',
      lieu_cours:          body.lieu_cours || '',
      commune_domicile:    body.commune_domicile || '',
      duree_cours:         body.duree_cours || '',
      nombre_cours:        body.nombre_cours || '',
      dates_periodes:      body.dates_periodes || '',
    });
  }

  // Insert dans Supabase
  let insertRes;
  try {
    insertRes = await sbFetch(env, 'demandes_devis', 'POST', row);
  } catch (e) {
    return jsonError(500, `Erreur réseau Supabase: ${e.message || String(e)}`);
  }

  if (!insertRes.ok) {
    const err = await insertRes.text();
    return jsonError(500, `Erreur DB: ${err}`);
  }

  // Notification Brevo (non bloquant si échec)
  if (env.BREVO_API_KEY) {
    sendBrevoNotification(env, body).catch(() => {});
  }

  return corsResponse({ ok: true }, 200, {}, request);
}


// ================================================================
// POST /api/devis/creer — admin crée un devis officiel
// ================================================================
async function handleCreerDevis(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  // Réserver un numéro atomique
  const rpcRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/reserver_numero_devis`,
    {
      method: 'POST',
      headers: sbHeaders(env, true),
      body: JSON.stringify({}),
    }
  );
  if (!rpcRes.ok) {
    const err = await rpcRes.text();
    return jsonError(500, `Erreur réservation numéro: ${err}`);
  }
  const numero = await rpcRes.json(); // "DEVIS-2026-0042"
  const match = numero.match(/^DEVIS-(\d{4})-(\d{4})$/);
  if (!match) return jsonError(500, 'Format numéro invalide');

  const annee = parseInt(match[1]);
  const numSequence = parseInt(match[2]);
  const dateEmission = new Date().toISOString().split('T')[0];
  const dateValidite = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const montantHt = (body.prestations || []).reduce(
    (sum, p) => sum + (parseFloat(p.prix) || 0), 0
  );

  const row = {
    numero,
    annee,
    num_sequence:   numSequence,
    date_emission:  dateEmission,
    date_validite:  dateValidite,
    demande_id:     body.demande_id || null,
    client_nom:     body.client_nom || '',
    client_adresse: body.client_adresse || '',
    evt_date:       body.evt_date || '',
    evt_horaire:    body.evt_horaire || '',
    evt_lieu:       body.evt_lieu || '',
    evt_details:    body.evt_details || '',
    prestations:    body.prestations || [],
    montant_ht:     montantHt,
    acompte_mode:   body.acompte_mode || 'percent',
    acompte_value:  parseFloat(body.acompte_value) || 30,
    statut:         'brouillon',
  };

  const insertRes = await sbFetch(env, 'devis', 'POST', row, 'return=representation');
  if (!insertRes.ok) {
    const err = await insertRes.text();
    return jsonError(500, `Erreur création devis: ${err}`);
  }
  const [devis] = await insertRes.json();

  // Construire l'URL du générateur
  const params = new URLSearchParams({ numero, date_emission: dateEmission, date_validite: dateValidite });
  if (body.client_nom) params.set('client', body.client_nom);
  if (body.client_adresse) params.set('adresse', body.client_adresse);
  if (body.evt_date) params.set('evt_date', body.evt_date);
  if (body.evt_horaire) params.set('evt_horaire', body.evt_horaire);
  if (body.evt_lieu) params.set('evt_lieu', body.evt_lieu);
  if (body.evt_details) params.set('evt_details', body.evt_details);
  (body.prestations || []).forEach((p, i) => {
    const n = i + 1;
    if (p.type)        params.set('type' + n,      p.type);
    if (p.intitule)    params.set('p' + n,          p.intitule);
    if (p.duree)       params.set('duree' + n,      String(p.duree));
    if (p.nbPassages)  params.set('passages' + n,   String(p.nbPassages));
    if (p.prix)        params.set('prix' + n,        String(p.prix));
  });
  if (body.acompte_mode)  params.set('acompte_mode', body.acompte_mode);
  if (body.acompte_value) params.set('acompte_value', String(body.acompte_value));

  const generateurUrl = `https://app.tangoetvous.fr/generateur-devis.html?${params.toString()}`;

  return corsResponse({ devis, generateur_url: generateurUrl }, 200);
}


// ================================================================
// PATCH /api/devis/:id/emettre
// ================================================================
async function handleEmettreDevis(id, env) {
  const r = await sbFetch(env, `devis?id=eq.${id}&statut=eq.brouillon`, 'PATCH',
    { statut: 'emis' }, 'return=representation');
  if (!r.ok) return jsonError(500, await r.text());
  const rows = await r.json();
  if (!rows.length) return jsonError(409, 'Devis non en brouillon ou introuvable');
  return corsResponse(rows[0], 200);
}


// ================================================================
// PATCH /api/devis/:id/annuler
// ================================================================
async function handleAnnulerDevis(id, env) {
  const r = await sbFetch(env, `devis?id=eq.${id}`, 'PATCH',
    { statut: 'annule' }, 'return=representation');
  if (!r.ok) return jsonError(500, await r.text());
  const rows = await r.json();
  return corsResponse(rows[0] || { id }, 200);
}


// ================================================================
// PATCH /api/demandes-devis/:id — mise à jour statut demande
// ================================================================
async function handleUpdateDemande(request, id, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const allowed = ['statut', 'notes'];
  const patch = {};
  allowed.forEach(k => { if (body[k] !== undefined) patch[k] = body[k]; });
  if (!Object.keys(patch).length) return jsonError(400, 'Aucun champ modifiable');

  const r = await sbFetch(env, `demandes_devis?id=eq.${id}`, 'PATCH',
    patch, 'return=representation');
  if (!r.ok) return jsonError(500, await r.text());
  const rows = await r.json();
  return corsResponse(rows[0] || { id }, 200);
}


// ================================================================
// Brevo — notification email admin
// ================================================================
async function sendBrevoNotification(env, body) {
  const prestations = (body.prestations_labels || []).join(', ') || '(non précisé)';
  const nom = `${body.civilite || ''} ${body.prenom || ''} ${body.nom || ''}`.trim();
  const sujet = `📋 Nouvelle demande de devis — ${nom}`;
  const html = `
    <h2>Nouvelle demande de devis</h2>
    <p><strong>Contact :</strong> ${nom} &lt;${body.email}&gt; ${body.telephone ? '· ' + body.telephone : ''}</p>
    <p><strong>Mode :</strong> ${body.mode === 'event' ? 'Événement' : 'Cours privé'}</p>
    <p><strong>Prestations :</strong> ${prestations}</p>
    ${body.type_evenement ? `<p><strong>Type :</strong> ${body.type_evenement}</p>` : ''}
    ${body.date_evenement ? `<p><strong>Date :</strong> ${body.date_evenement}</p>` : ''}
    ${body.lieu ? `<p><strong>Lieu :</strong> ${body.lieu} ${body.code_postal ? '(' + body.code_postal + ')' : ''}</p>` : ''}
    ${body.nombre_invites ? `<p><strong>Invités :</strong> ${body.nombre_invites}</p>` : ''}
    ${body.message ? `<p><strong>Message :</strong></p><p style="white-space:pre-wrap">${body.message}</p>` : ''}
    <hr>
    <p><a href="https://app.tangoetvous.fr/admin.html">→ Voir dans l'admin</a></p>
  `;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Tango & Vous', email: 'tangoetvous@gmail.com' },
      to: [{ email: 'tangoetvous@gmail.com', name: 'Admin Tango & Vous' }],
      subject: sujet,
      htmlContent: html,
    }),
  });
}


// ================================================================
// Helpers Supabase REST
// ================================================================
function sbHeaders(env, serviceRole = true) {
  return {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...(serviceRole ? { 'Prefer': 'return=minimal' } : {}),
  };
}

function sbFetch(env, resource, method, body, prefer) {
  const url = `${env.SUPABASE_URL}/rest/v1/${resource}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (prefer) headers['Prefer'] = prefer;
  return fetch(url, { method, headers, body: JSON.stringify(body) });
}


// ================================================================
// Helpers réponse
// ================================================================
function corsOrigin(request) {
  const origin = (request && request.headers && request.headers.get('Origin')) || '';
  return CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[1];
}

function corsResponse(data, status, extraHeaders, request) {
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin(request),
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  return new Response(data !== null ? JSON.stringify(data) : null, { status, headers });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
