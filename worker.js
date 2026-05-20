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
//   GET   /devis/p/:token              — vue publique d'un devis (sans auth, token UUID)
//   POST  /api/notify/yoga-date         — admin → emails Brevo élèves yoga (JWT admin requis)
//   POST  /api/remplacant/generate     — génère URL remplaçant signée (JWT admin requis)
//   GET   /api/remplacant/data         — données pointage pour le remplaçant (token signé)
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

      // GET /devis/p/:token — vue publique d'un devis (sans auth)
      const dvPubM = pathname.match(/^\/devis\/p\/([A-Za-z0-9-]+)$/);
      if (dvPubM && method === 'GET') {
        return handlePublicDevisView(dvPubM[1], env);
      }

      // POST /api/notify/yoga-date — admin → emails Brevo élèves yoga (JWT admin requis)
      if (pathname === '/api/notify/yoga-date' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyYogaDate(request, env);
      }

      // POST /api/notify/essai-action — admin → email admin + élève(s) lors d'une action sur un essai tango
      if (pathname === '/api/notify/essai-action' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyEssaiAction(request, env);
      }

      // POST /api/remplacant/generate — génère URL remplaçant (JWT admin requis)
      if (pathname === '/api/remplacant/generate' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleRemplacantGenerate(request, jwt, env);
      }

      // GET /api/remplacant/data — données pointage (token signé, pas de JWT)
      if (pathname === '/api/remplacant/data' && method === 'GET') {
        return handleRemplacantData(request, url, env);
      }

      try {
        return await env.ASSETS.fetch(request);
      } catch (assetErr) {
        return new Response('Page introuvable', { status: 404, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
      }
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
    public_token:   crypto.randomUUID(),
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
// ================================================================
// POST /api/notify/yoga-date — envoie emails Brevo aux élèves yoga
// ================================================================
async function handleNotifyYogaDate(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const { addedDates = [], removedDates = [], emails = [] } = body;
  if (!emails.length) return corsResponse({ ok: true, sent: 0 }, 200, {}, request);

  if (!env.BREVO_API_KEY) {
    console.log('[notify yoga] BREVO_API_KEY absent — skip');
    return corsResponse({ ok: true, sent: 0, skipped: true }, 200, {}, request);
  }

  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  }

  const addedLines  = addedDates.map(d  => `<li style="margin:4px 0;color:#2e7d32;"><strong>+ ${_esc(fmtDate(d))}</strong></li>`).join('');
  const removedLines = removedDates.map(d => `<li style="margin:4px 0;color:#c62828;"><strong>✕ ${_esc(fmtDate(d))}</strong></li>`).join('');

  const hasAdded   = addedDates.length > 0;
  const hasRemoved = removedDates.length > 0;
  const subject = hasAdded && hasRemoved ? '📅 Modifications de vos cours de yoga — Tango & Vous'
    : hasAdded   ? '📅 Nouveau cours de yoga ajouté — Tango & Vous'
    : '⚠️ Cours de yoga annulé — Tango & Vous';

  const bandeauBg  = hasRemoved ? '#fff8e1' : '#e8f5e9';
  const bandeauBrd = hasRemoved ? '#ffe082' : '#c8e6c9';
  const bandeauTxt = hasRemoved ? '#e65100' : '#2e7d32';
  const bandeauMsg = hasAdded && hasRemoved ? '📅 Modification de vos cours de yoga'
    : hasAdded ? '📅 Nouvelle date de yoga ajoutée'
    : '⚠️ Date de yoga annulée';

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;">
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div>
      <div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin &amp; yoga</div>
    </div>
    <div style="background:${bandeauBg};padding:14px 24px;text-align:center;border-bottom:1px solid ${bandeauBrd};">
      <span style="font-size:14px;font-weight:700;color:${bandeauTxt};">${bandeauMsg}</span>
    </div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour,</p>
      <p style="font-size:15px;color:#333;margin:0 0 16px;">Des modifications ont été apportées au calendrier de yoga :</p>
      ${addedLines ? `<div style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:14px 18px;margin:0 0 16px;">
        <p style="font-size:13px;font-weight:700;color:#2e7d32;margin:0 0 8px;">📅 Date${addedDates.length>1?'s':''} ajoutée${addedDates.length>1?'s':''}</p>
        <ul style="margin:0;padding-left:18px;">${addedLines}</ul></div>` : ''}
      ${removedLines ? `<div style="background:#ffebee;border:1px solid #ffcdd2;border-radius:8px;padding:14px 18px;margin:0 0 16px;">
        <p style="font-size:13px;font-weight:700;color:#c62828;margin:0 0 8px;">✕ Date${removedDates.length>1?'s':''} annulée${removedDates.length>1?'s':''}</p>
        <ul style="margin:0;padding-left:18px;">${removedLines}</ul></div>` : ''}
      <p style="font-size:14px;color:#888;margin:20px 0 0;">Pour toute question, n'hésitez pas à nous contacter.</p>
      <p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur le tapis !<br/>
      <strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/>
      <span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>
    </div>
    <div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;">
      <a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/>
      <a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06
    </div>
  </div></body></html>`;

  let sent = 0;
  await Promise.all(emails.map(async (email) => {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Tango & Vous', email: 'tangoetvous@gmail.com' },
          to: [{ email: String(email) }],
          subject,
          htmlContent: html,
        }),
      });
      if (r.ok) sent++;
      else console.error('[notify yoga] Brevo error for', email, await r.text());
    } catch(e) { console.error('[notify yoga] fetch error', e); }
  }));

  return corsResponse({ ok: true, sent }, 200, {}, request);
}

// ================================================================
// POST /api/notify/essai-action — email admin + élève(s) lors d'une action essai tango
// action: 'edit-essai' | 'transfer-demande' | 'transfer-valide'
// ================================================================
async function handleNotifyEssaiAction(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  if (!env.BREVO_API_KEY) {
    console.log('[notify essai-action] BREVO_API_KEY absent — skip');
    return corsResponse({ ok: true, sent: 0, skipped: true }, 200, {}, request);
  }

  const { action, prenom, nom, email, tel, role, cours, ville, niveau, date,
          oldDate, oldVille, oldNiveau, newDate, newVille, newNiveau,
          partPrenom, partNom, partEmail } = body;

  const MOIS_L = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    if (!iso) return '(date inconnue)';
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }
  const villeLabel = (v) => v === 'vincennes' ? 'Vincennes' : 'Paris';
  const nivLabel   = (n) => n === 'intermediaire' ? 'Intermédiaire' : 'Débutant';
  const adminEmail = 'tangoetvous@gmail.com';
  let sent = 0;

  async function sendBrevo(toEmail, subject, html) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(toEmail) }], subject, htmlContent: html }),
      });
      if (r.ok) sent++;
      else console.error('[notify essai-action] Brevo error', toEmail, await r.text());
    } catch(e) { console.error('[notify essai-action] fetch error', e); }
  }

  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;">
    <div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div>
    <div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;">
    <a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/>
    <a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/>
    <strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/>
    <span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const adminLinkBtn = `<p style="text-align:center;margin:20px 0 0;"><a href="https://app.tangoetvous.fr/admin.html" style="display:inline-block;background:#D4AF37;color:#111;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">→ Ouvrir l'admin</a></p>`;
  const wrap = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  if (action === 'edit-essai') {
    const nameAff = _esc(`${prenom} ${nom}`.trim());
    const hasPartner = !!(partEmail && partEmail !== email);
    // Email admin
    const adminHtml = wrap(`<div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;">
      <div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div>
      <div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Essai tango — modifié</div></div>
      <div style="padding:20px 24px;">
      <div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:16px;">
        <div style="background:#D4AF37;padding:10px 16px;"><div style="font-size:16px;font-weight:700;color:#111;">${nameAff}${hasPartner ? ' + ' + _esc(`${partPrenom} ${partNom}`.trim()) : ''}</div>
        <div style="font-size:12px;color:#333;margin-top:2px;">${_esc(email)}${tel ? ' · ' + _esc(tel) : ''}</div></div>
        <div style="background:#fffdf8;padding:14px 16px;">
          <div style="font-size:13px;color:#c62828;margin-bottom:8px;"><s>${villeLabel(oldVille)} ${nivLabel(oldNiveau)} · ${fmtDate(oldDate)}</s></div>
          <div style="font-size:15px;font-weight:700;color:#2e7d32;">→ ${villeLabel(newVille)} ${nivLabel(newNiveau)} · ${fmtDate(newDate)}</div>
        </div>
      </div>${adminLinkBtn}</div>`);
    await sendBrevo(adminEmail, `📋 Essai modifié — ${nameAff} · ${fmtDate(newDate)}`, adminHtml);

    // Email élève(s)
    const eleveEmails = hasPartner ? [email, partEmail] : [email];
    for (const toEmail of eleveEmails) {
      const isPartner = toEmail !== email;
      const recipientPrenom = isPartner ? _esc(partPrenom||'') : _esc(prenom||'');
      const eleveHtml = wrap(`${headerEleve}
        <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;">
          <span style="font-size:14px;font-weight:700;color:#1565c0;">📋 Votre cours d'essai a été modifié</span></div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${recipientPrenom},</p>
          <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">VOTRE COURS D'ESSAI TANGO</div>
            <div style="font-size:13px;color:#999;margin-bottom:6px;"><s>${villeLabel(oldVille)} — ${nivLabel(oldNiveau)} · ${fmtDate(oldDate)}</s></div>
            <div style="font-size:15px;font-weight:700;color:#2e7d32;">→ ${villeLabel(newVille)} — ${nivLabel(newNiveau)} · ${fmtDate(newDate)}</div>
          </div>
          <p style="font-size:14px;color:#333;margin:0 0 16px;">Votre cours d'essai a été reprogrammé. Pour toute question, n'hésitez pas à nous contacter.</p>
          ${signEleve}
        </div>${footer}`);
      await sendBrevo(toEmail, `📋 Votre cours d'essai tango a été modifié — ${fmtDate(newDate)}`, eleveHtml);
    }
  }

  if (action === 'transfer-demande' || action === 'transfer-valide') {
    const isDemande = action === 'transfer-demande';
    const nameAff = _esc(`${prenom} ${nom}`.trim());
    const hasPartner = !!(partEmail && partEmail !== email);
    const coursAff = cours || `${villeLabel(ville)} — ${nivLabel(niveau)}`;
    // Email admin (I0)
    const roleBadge = role === 'guideur' ? '#1565c0' : role === 'guidee' ? '#c2185b' : '#6a1b9a';
    const roleLabel = role === 'guideur' ? 'Guideur·se' : role === 'guidee' ? 'Guidé·e' : 'Double rôle';
    const statutBadge = isDemande
      ? `<span style="background:#e65100;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">⏳ Att. validation</span>`
      : `<span style="background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✓ Att. paiement</span>`;
    const adminHtml = wrap(`<div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;">
      <div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div>
      <div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Inscription tango — ${isDemande ? 'demande en attente' : 'validé·e'}</div></div>
      <div style="padding:20px 24px;">
      <div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:16px;">
        <div style="background:#D4AF37;padding:10px 16px;display:flex;align-items:center;gap:12px;">
          <div style="flex:1;"><div style="font-size:16px;font-weight:700;color:#111;">${nameAff}</div>
          <div style="font-size:12px;color:#333;margin-top:2px;">${_esc(email)}${tel ? ' · ' + _esc(tel) : ''}</div></div>
          <span style="background:${roleBadge};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${roleLabel}</span>
        </div>
        <div style="background:#fffdf8;padding:14px 16px;">
          <div style="font-size:16px;font-weight:700;color:#111;">📍 ${_esc(coursAff)}</div>
          <div style="font-size:13px;color:#666;margin-top:6px;">${date ? 'Essai effectué le ' + fmtDate(date) : 'Issu de l\'essai tango'}</div>
          ${hasPartner ? `<div style="font-size:13px;color:#333;margin-top:6px;">Partenaire : ${_esc(partPrenom + ' ' + partNom)}${partEmail ? ' &lt;' + _esc(partEmail) + '&gt;' : ''}</div>` : ''}
          <div style="margin-top:10px;">${statutBadge}</div>
        </div>
      </div>${adminLinkBtn}</div>`);
    await sendBrevo(adminEmail, `${isDemande ? '📋 Demande inscription tango' : '🎓 Inscription tango validée'} — ${nameAff} · ${_esc(coursAff)}`, adminHtml);

    // Email élève(s)
    const eleveEmails = hasPartner ? [email, partEmail] : [email];
    for (const toEmail of eleveEmails) {
      const isPartner = toEmail !== email;
      const recipientPrenom = isPartner ? _esc(partPrenom||'') : _esc(prenom||'');
      let eleveHtml;
      if (isDemande) {
        eleveHtml = wrap(`${headerEleve}
          <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
            <span style="font-size:14px;font-weight:700;color:#e65100;">⏳ Votre demande d'inscription est enregistrée</span></div>
          <div style="padding:28px 24px;">
            <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${recipientPrenom},</p>
            <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">INSCRIPTION TANGO</div>
              <div style="font-size:15px;font-weight:700;color:#111;">${_esc(coursAff)}</div>
              <div style="margin-top:10px;"><span style="background:#e65100;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">⏳ En attente de validation</span></div>
            </div>
            <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
              <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">📋 Votre demande est bien enregistrée</p>
              <p style="font-size:14px;color:#444;line-height:1.7;margin:0;">Nous veillons à maintenir l'équilibre entre guideurs et guidées. Vous recevrez une confirmation dès validation de votre inscription. En attendant, n'hésitez pas à nous contacter pour toute question.</p>
            </div>
            ${signEleve}
          </div>${footer}`);
      } else {
        eleveHtml = wrap(`${headerEleve}
          <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">
            <span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre inscription est validée !</span></div>
          <div style="padding:28px 24px;">
            <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${recipientPrenom},</p>
            <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">INSCRIPTION TANGO</div>
              <div style="font-size:15px;font-weight:700;color:#111;">${_esc(coursAff)}</div>
              <div style="margin-top:10px;"><span style="background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✓ Inscription validée</span></div>
            </div>
            <p style="font-size:14px;color:#333;margin:0 0 16px;">Votre inscription est validée. La prochaine étape est le paiement sur AssoConnect pour finaliser votre inscription.</p>
            ${signEleve}
          </div>${footer}`);
      }
      await sendBrevo(toEmail, `${isDemande ? '📋 Votre demande d\'inscription tango' : '🎓 Votre inscription tango est validée'} — ${_esc(coursAff)}`, eleveHtml);
    }
  }

  return corsResponse({ ok: true, sent }, 200, {}, request);
}

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
// GET /devis/p/:token — vue publique d'un devis (sans auth)
// Requiert env.SUPABASE_SERVICE_KEY pour contourner le RLS
// ================================================================
async function handlePublicDevisView(token, env) {
  if (!env.SUPABASE_SERVICE_KEY) {
    return new Response('Service non configuré', { status: 503 });
  }
  const svcHeaders = {
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/devis?public_token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    { headers: svcHeaders }
  );
  if (!r.ok) return new Response('Erreur serveur', { status: 500 });
  const rows = await r.json();
  if (!rows.length) {
    return new Response(
      '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Devis introuvable</title>'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f6f9;}'
      + '.box{background:#fff;padding:40px;border-radius:12px;text-align:center;max-width:400px;}'
      + 'h2{color:#2840f0;margin-top:0;}p{color:#7a8099;}</style></head>'
      + '<body><div class="box"><h2>Devis introuvable</h2>'
      + '<p>Ce lien est invalide ou a expiré.</p>'
      + '<p style="font-size:12px;">Contactez Tango&nbsp;&amp;&nbsp;Vous pour obtenir un nouveau lien.</p></div></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
    );
  }
  const html = _renderDevisHtml(rows[0]);
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-store' },
  });
}

function _renderDevisHtml(dv) {
  const e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fDate = iso => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }); }
    catch { return iso; }
  };
  const fMoney = n => (parseFloat(n)||0).toLocaleString('fr-FR', { style:'currency', currency:'EUR', minimumFractionDigits:2, maximumFractionDigits:2 });

  const pres    = Array.isArray(dv.prestations) ? dv.prestations : [];
  const remise  = dv.remise || {};
  const total   = parseFloat(dv.montant_ht) || 0;
  const aMode   = dv.acompte_mode  || 'percent';
  const aVal    = parseFloat(dv.acompte_value) || 30;
  const aAmt    = aMode === 'percent' ? total * (aVal / 100) : Math.min(aVal, total);
  const solde   = total - aAmt;
  const aText   = aMode === 'percent' ? `${aVal}%&nbsp;(soit ${fMoney(aAmt)})` : fMoney(aAmt);

  // Recalcul du sous-total prestations pour la ligne remise
  const subPres = pres.reduce((s, p) => s + (parseInt(p.quantite)||1) * (parseFloat(p.prix)||0), 0);
  let remiseAmt = 0;
  if (remise.actif && remise.valeur) {
    remiseAmt = remise.mode === 'percent' ? subPres * (remise.valeur/100) : Math.min(remise.valeur, subPres);
  }

  const presRows = pres.map(p => {
    const qty  = parseInt(p.quantite) || 1;
    const pu   = parseFloat(p.prix) || 0;
    const desc = [
      p.duree ? `Durée : ${e(p.duree)}` : '',
      p.hasPassages && p.nbPassages > 0 ? `${p.nbPassages} passage${p.nbPassages > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');
    return `<tr>
      <td>${e(p.intitule||'—')}${desc ? `<div class="pd">${desc}</div>` : ''}</td>
      <td class="r">${qty > 1 ? qty : '—'}</td>
      <td class="r">${qty > 1 ? fMoney(pu) : '—'}</td>
      <td class="r">${fMoney(qty * pu)}</td>
    </tr>`;
  }).join('');

  const remiseRow = (remise.actif && remiseAmt > 0)
    ? `<div class="tot-row"><span class="tk">Remise${remise.mode==='percent'?` (${remise.valeur}%)`:''}
       </span><span class="tv" style="color:#c0392b">−${fMoney(remiseAmt)}</span></div>` : '';

  const evtAdresse = dv.evt_lieu ? e(dv.evt_lieu).replace(/\n/g,'<br>') : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(dv.numero||'Devis')} — Le Regard Se Pose</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bleu:#2840f0;--bleu-soft:#eef0fe;--noir:#1a1d24;--gris:#f5f6f9;--border:#d8dce8;--dim:#7a8099;--r:6px}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;font-size:12px;color:var(--noir);background:#e8eaf0;line-height:1.55}
.page{max-width:800px;margin:0 auto;padding:20px}
.print-btn{background:var(--bleu);color:#fff;border:none;padding:10px 20px;border-radius:var(--r);cursor:pointer;font-size:13px;font-family:inherit;display:flex;align-items:center;gap:8px;margin:0 auto 20px;font-weight:500}
.print-btn:hover{opacity:.9}
.devis{background:#fff;padding:40px 48px;border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,.08)}
/* Header */
.dh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;gap:24px}
.dh-brand{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:var(--bleu);letter-spacing:.04em}
.dh-sub{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--dim);margin-top:2px}
.dh-meta{text-align:right;flex-shrink:0}
.dh-num{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;color:var(--bleu)}
.dh-label{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-top:4px}
.dh-dates{margin-top:10px;font-size:11px;line-height:1.7}
.dh-dates .k{color:var(--dim);display:inline-block;min-width:70px}
/* Parties */
.parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:28px}
.party h3{font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--bleu);margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border)}
.pname{font-weight:600;font-size:13px;margin-bottom:3px}
.pinfo{font-size:11px;white-space:pre-line;color:var(--noir)}
/* Événement */
.evt{background:var(--bleu-soft);border-left:3px solid var(--bleu);padding:12px 16px;margin-bottom:24px;border-radius:0 var(--r) var(--r) 0}
.evt h3{font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--bleu);margin-bottom:8px}
.evt-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 20px;font-size:11px}
.evt-grid .k{color:var(--dim);font-weight:500}.evt-grid .v{color:var(--noir)}
.evt-det{margin-top:8px;padding-top:8px;border-top:1px solid rgba(40,64,240,.15);font-size:11px;white-space:pre-line}
/* Table */
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:11px}
thead th{background:var(--noir);color:#fff;text-align:left;padding:8px 12px;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
thead th.r{text-align:right}
tbody td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top}
tbody td.r{text-align:right;white-space:nowrap}
.pn{font-weight:500}.pd{font-size:10px;color:var(--dim);margin-top:1px}
/* Totaux */
.tots{display:flex;justify-content:flex-end;margin-bottom:20px}
.tots-inner{min-width:260px;font-size:12px}
.tot-row{display:flex;justify-content:space-between;padding:5px 0}
.tk{color:var(--dim)}.tv{color:var(--noir)}
.tot-total{border-top:2px solid var(--noir);margin-top:3px;padding-top:8px;font-size:14px;font-weight:600}
.tot-total .tk{color:var(--noir)}.tot-total .tv{color:var(--bleu)}
/* TVA */
.tva{background:var(--gris);border:1px solid var(--border);border-radius:var(--r);padding:9px 12px;margin-bottom:20px;font-size:10px;color:var(--dim);font-style:italic;line-height:1.5}
/* Règlement */
.pay h3{font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--bleu);margin-bottom:7px}
.pay p{font-size:11px;line-height:1.7;margin-bottom:6px}
.pay .amt{color:var(--bleu);font-weight:600}
/* RIB */
.rib{background:var(--gris);border-radius:var(--r);padding:10px 14px;margin-top:8px;font-size:10px}
.rib-r{display:flex;margin-bottom:2px}
.rib-k{color:var(--dim);min-width:80px;font-weight:500}
.rib-v{font-family:monospace;letter-spacing:.03em}
/* Signature */
.sig{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px;padding-top:20px;border-top:1px solid var(--border)}
.sig-lbl{font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:5px}
.sig-ins{color:var(--dim);font-style:italic;font-size:10px;margin-bottom:44px}
.sig-line{border-bottom:1px solid var(--noir)}
/* Fait à */
.fait{margin-top:20px;font-size:11px;color:var(--dim);text-align:right;font-style:italic}
/* Mentions */
.ment{margin-top:24px;padding-top:18px;border-top:1px solid var(--border)}
.ment h3{font-size:9px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--bleu);margin-bottom:10px}
.mgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px 16px;font-size:9px;line-height:1.5;color:#2a2f3a}
.mi strong{font-weight:600;color:var(--noir)}
/* Footer */
.foot{margin-top:32px;padding-top:14px;border-top:1px solid var(--border);text-align:center;font-size:9px;color:var(--dim);line-height:1.7}
.foot .fn{font-weight:600;color:var(--bleu);letter-spacing:.05em}
.foot a{color:var(--dim);text-decoration:none}
@media print{
  body{background:#fff}
  .page{padding:0}
  .print-btn{display:none}
  .devis{box-shadow:none;border-radius:0;padding:14mm 16mm}
  .ment{page-break-before:always;padding-top:14mm}
  @page{size:A4;margin:0}
}
@media(max-width:600px){
  .devis{padding:20px}
  .parties,.evt-grid,.sig,.mgrid{grid-template-columns:1fr}
  .tots{justify-content:stretch}.tots-inner{width:100%}
}
</style>
</head>
<body>
<div class="page">
  <button class="print-btn" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
  <div class="devis">

    <!-- En-tête -->
    <div class="dh">
      <div>
        <div class="dh-brand">LE REGARD SE POSE</div>
        <div class="dh-sub">Tango &amp; Vous</div>
      </div>
      <div class="dh-meta">
        <div class="dh-num">${e(dv.numero||'—')}</div>
        <div class="dh-label">Devis</div>
        <div class="dh-dates">
          <div><span class="k">Émis le</span>${fDate(dv.date_emission)}</div>
          <div><span class="k">Valable</span>${fDate(dv.date_validite)}</div>
        </div>
      </div>
    </div>

    <!-- Parties -->
    <div class="parties">
      <div class="party">
        <h3>Émetteur</h3>
        <div class="pname">Association Le Regard Se Pose</div>
        <div class="pinfo">MVAC20 — 18 rue Ramus, 75020 Paris
SIRET 522 679 752 00025
tangoetvous@gmail.com · 07 73 27 59 06</div>
      </div>
      <div class="party">
        <h3>Client</h3>
        <div class="pname">${e(dv.client_nom||'—')}</div>
        ${dv.client_adresse ? `<div class="pinfo">${e(dv.client_adresse).replace(/\n/g,'<br>')}</div>` : ''}
      </div>
    </div>

    ${(dv.evt_date||dv.evt_horaire||dv.evt_lieu||dv.evt_details) ? `
    <!-- Événement -->
    <div class="evt">
      <h3>Détails de la prestation</h3>
      <div class="evt-grid">
        ${dv.evt_date    ? `<div class="k">Date</div><div class="v">${fDate(dv.evt_date)}</div>` : ''}
        ${dv.evt_horaire ? `<div class="k">Horaire</div><div class="v">${e(dv.evt_horaire)}</div>` : ''}
        ${dv.evt_lieu    ? `<div class="k">Lieu</div><div class="v">${evtAdresse}</div>` : ''}
      </div>
      ${dv.evt_details ? `<div class="evt-det">${e(dv.evt_details)}</div>` : ''}
    </div>` : ''}

    <!-- Prestations -->
    <table>
      <thead><tr>
        <th>Désignation</th>
        <th class="r" style="width:50px">Qté</th>
        <th class="r" style="width:110px">P.U. HT</th>
        <th class="r" style="width:120px">Total HT = TTC</th>
      </tr></thead>
      <tbody>${presRows}</tbody>
    </table>

    <!-- Totaux -->
    <div class="tots"><div class="tots-inner">
      ${remiseRow}
      <div class="tot-row"><span class="tk">Total HT</span><span class="tv">${fMoney(total)}</span></div>
      <div class="tot-row"><span class="tk">TVA</span><span class="tv" style="font-style:italic;color:var(--dim)">Non applicable</span></div>
      <div class="tot-row tot-total"><span class="tk">Total TTC</span><span class="tv">${fMoney(total)}</span></div>
    </div></div>

    <!-- TVA -->
    <div class="tva">
      <strong>TVA non applicable, art. 293 B du CGI.</strong>
      L'Association Le Regard Se Pose bénéficie de la franchise en base de TVA.
      Les montants indiqués sont nets de toute taxe.
    </div>

    <!-- Règlement -->
    <div class="pay">
      <h3>Modalités de règlement</h3>
      <p>Un acompte de <span class="amt">${aText}</span> est à régler à la signature du présent devis afin de confirmer la réservation.
      Le solde, soit <span class="amt">${fMoney(solde)}</span>, sera réglé le jour de la prestation.</p>
      <p>Les règlements s'effectuent par <strong>virement bancaire</strong> sur le compte de l'association
      <em>(vous trouverez nos coordonnées bancaires ci-après)</em>.</p>
    </div>

    <!-- Signature -->
    <div class="sig">
      <div>
        <div class="sig-lbl">Émetteur</div>
        <div class="sig-ins">Le Regard Se Pose</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="sig-lbl">Bon pour accord — Le client</div>
        <div class="sig-ins">Date, signature précédée de la mention manuscrite « Bon pour accord »</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <!-- Fait à -->
    <div class="fait">Fait à Paris, le ${fDate(dv.date_emission)}.</div>

    <!-- Page 2 : RIB + Mentions -->
    <div class="ment">
      <h3>Coordonnées bancaires</h3>
      <div class="rib" style="margin-bottom:20px">
        <div class="rib-r"><span class="rib-k">Titulaire</span><span class="rib-v">LE REGARD SE POSE</span></div>
        <div class="rib-r"><span class="rib-k">Banque</span><span class="rib-v">Crédit Mutuel — CCM Paris 1-2 Louvre Montorgueil</span></div>
        <div class="rib-r"><span class="rib-k">IBAN</span><span class="rib-v">FR76 1027 8060 3100 0204 2490 107</span></div>
        <div class="rib-r"><span class="rib-k">BIC</span><span class="rib-v">CMCIFR2A</span></div>
      </div>
      <h3>Mentions légales et conditions</h3>
      <div class="mgrid">
        <div class="mi"><strong>Devis gratuit.</strong> L'établissement de ce devis est gratuit et n'engage le client qu'après acceptation écrite (mention manuscrite « Bon pour accord » et signature) et versement de l'acompte.</div>
        <div class="mi"><strong>Validité.</strong> Le présent devis est valable jusqu'à la date indiquée en en-tête. Passé ce délai, les tarifs et conditions sont susceptibles d'être révisés.</div>
        <div class="mi"><strong>Annulation par le client.</strong> En cas d'annulation à plus de 30 jours de la prestation, l'acompte est conservé à titre de dédommagement. À moins de 30 jours, la totalité du montant reste due.</div>
        <div class="mi"><strong>Annulation par l'émetteur.</strong> En cas d'annulation par l'émetteur (sauf force majeure), l'acompte est intégralement remboursé sous 14 jours.</div>
        <div class="mi"><strong>Force majeure.</strong> En cas de force majeure rendant la prestation impossible, les parties conviendront soit d'un report soit du remboursement de l'acompte.</div>
        <div class="mi"><strong>Pénalités de retard.</strong> Tout paiement après l'échéance donnera lieu, sans mise en demeure, à des pénalités de retard au taux légal, ainsi qu'à une indemnité de 40 € (art. L441-10 C. com.).</div>
        <div class="mi"><strong>Litiges.</strong> En cas de litige et à défaut d'accord amiable, le tribunal compétent sera celui du ressort du siège social de l'émetteur (Paris).</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="foot">
      <div class="fn">ASSOCIATION LE REGARD SE POSE</div>
      Association loi 1901 — MVAC20, 18 rue Ramus, 75020 Paris ·
      Tél : 07 73 27 59 06 ·
      <a href="mailto:tangoetvous@gmail.com">tangoetvous@gmail.com</a><br>
      SIRET 522 679 752 00025 · RNA W751181053 · TVA non applicable, art. 293 B du CGI
    </div>

  </div>
</div>
</body>
</html>`;
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

// ================================================================
// REMPLAÇANT — pointage carte10 par un tiers de confiance
// ================================================================

async function handleRemplacantGenerate(request, jwt, env) {
  // Vérifier que le JWT est bien un admin
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  let isAdmin = false;
  try { isAdmin = await checkRes.json(); } catch(e) {}
  if (!isAdmin) return jsonError(403, 'Accès refusé — non administrateur');

  let body;
  try { body = await request.json(); } catch(e) { return jsonError(400, 'JSON invalide'); }
  const { cours, date } = body || {};
  if (!cours || !Array.isArray(cours) || !cours.length || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError(400, 'Paramètres invalides (cours[], date)');
  }

  // Signe avec service key si dispo, sinon clé anon (token auto-protégé par date)
  const secret  = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
  const payload = JSON.stringify({ cours, date });
  const token   = await _rempSignToken(payload, secret);
  const url     = `https://app.tangoetvous.fr/remplacant.html?token=${encodeURIComponent(token)}`;
  return corsResponse({ ok: true, url }, 200, {}, request);
}

async function handleRemplacantData(request, urlObj, env) {
  const token = urlObj.searchParams.get('token') || '';
  if (!token) return jsonError(400, 'Token manquant');

  // Vérifie avec service key si dispo, sinon clé anon (même secret que generate)
  const secret  = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
  const payload = await _rempVerifyToken(token, secret);
  if (!payload) return jsonError(401, 'Lien invalide ou signature incorrecte');

  const today = new Date().toISOString().split('T')[0];
  if (payload.date !== today) return jsonError(403, `Lien expiré — valable uniquement le ${payload.date}`);

  const saison = _currentSaison();
  const result = [];

  for (const coursKey of payload.cours) {
    const dash   = coursKey.indexOf('-');
    const ville  = coursKey.slice(0, dash);
    const niveau = coursKey.slice(dash + 1);
    const label  = (ville === 'vincennes' ? 'Vincennes' : 'Paris') + ' — ' + (niveau === 'intermediaire' ? 'Intermédiaire' : 'Débutant');

    // Appel RPC SECURITY DEFINER accessible à anon — pas besoin de service key
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_remplacant_eleves`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ville: ville, p_niveau: niveau, p_saison: saison }),
    });
    const eleves = rpcRes.ok ? (await rpcRes.json() || []) : [];
    result.push({ key: coursKey, label, eleves });
  }

  return corsResponse({ date: today, cours: result }, 200, {}, request);
}

function _currentSaison() {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

async function _rempSignToken(payload, secret) {
  const b64  = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const hmac = await _calHmac(b64, secret);
  return `${b64}.${hmac.slice(0, 32)}`;
}

async function _rempVerifyToken(token, secret) {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const b64Part = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const expected = await _calHmac(b64Part, secret);
  if (expected.slice(0, 32) !== sig) return null;
  try {
    return JSON.parse(atob(b64Part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch(e) { return null; }
}

// ================================================================

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
