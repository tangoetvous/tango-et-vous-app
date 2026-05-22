// Cloudflare Worker — Tango & Vous
// Gère les routes dynamiques + sert les assets statiques en fallback
//
// Secrets Cloudflare optionnels :
//   - BREVO_API_KEY          : API Brevo → emails automatiques
//   - FIREBASE_SERVICE_ACCOUNT : JSON service account Firebase → push FCM v1
//   - CRON_SECRET            : protège les routes cron GitHub Actions
//   - SUPABASE_SERVICE_KEY   : auth admin Supabase (update-auth-email)
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
//   POST  /api/notify/yoga-date        — admin → emails Brevo élèves yoga (JWT admin requis)
//   POST  /api/register-token          — enregistre token FCM push (JWT requis)
//   GET   /api/config-check            — diagnostic secrets configurés (JWT admin requis)
//   POST  /api/remplacant/generate     — génère URL remplaçant signée (JWT admin requis)
//   GET   /api/remplacant/data         — données pointage pour le remplaçant (token signé)
//   POST  /api/notify/carte-pointage   — élève pointe sa carte → notif email admin (sans auth)
//   POST  /api/notify/carte-pointee-admin — admin pointe carte élève → email + notif in-app élève
//   POST  /api/notify/carte-epuisee    — carte 10/10 → email + notif élève + notif admin (sans auth)
//   POST  /api/cron/carte-expiree      — cron quotidien → emails cartes expirées aujourd'hui
//   POST  /api/cron/relance-cb3x       — cron quotidien → rappels 2ème/3ème échéance CB 3×
//   POST  /api/cron/relance-absences   — cron vendredi/mardi → email C6 si 2 absences consécutives
//   POST  /api/cron/fin-saison-c4      — rappel fin de saison → élèves avec cours restants (manuel)
//   POST  /api/cron/fin-saison-c5      — dernier rappel 25 août → élèves avec cours restants
//   POST  /api/notify/discussion-nouvelle — nouvelle discussion → notif in-app élèves (JWT admin)
//   POST  /api/notify/discussion-message  — nouveau message → notif in-app élèves (JWT admin)
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

      // POST /api/notify/sorano — email + notification in-app pour relance ou paiement réglé
      if (pathname === '/api/notify/sorano' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifySorano(request, env);
      }

      // POST /api/cron/essai-j1 — cron GitHub Actions → emails E-J1a / E-J1b le lendemain du cours
      if (pathname === '/api/cron/essai-j1' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronEssaiJ1(request, env);
      }

      // POST /api/cron/essai-yoga-j1 — cron GitHub Actions → emails Y-J1a / Y-J1b le lendemain du cours yoga
      if (pathname === '/api/cron/essai-yoga-j1' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronEssaiYogaJ1(request, env);
      }

      // POST /api/notify/inscription-essai — formulaire cours-essai.html (sans auth)
      if (pathname === '/api/notify/inscription-essai' && method === 'POST') {
        return handleNotifyInscriptionEssai(request, env);
      }

      // PATCH /api/essai/confirmer — élève confirme sa présence via lien email
      if (pathname === '/api/essai/confirmer' && method === 'PATCH') {
        return handleEssaiConfirmerAnnuler(request, url, 'confirmer', env);
      }

      // PATCH /api/essai/annuler — élève annule son essai via lien email
      if (pathname === '/api/essai/annuler' && method === 'PATCH') {
        return handleEssaiConfirmerAnnuler(request, url, 'annuler', env);
      }

      // POST /api/notify/inscription-cours — formulaire inscription-cours.html (sans auth)
      if (pathname === '/api/notify/inscription-cours' && method === 'POST') {
        return handleNotifyInscriptionCours(request, env);
      }

      // POST /api/notify/inscription-essai-yoga — formulaire essai-yoga.html (sans auth)
      if (pathname === '/api/notify/inscription-essai-yoga' && method === 'POST') {
        return handleNotifyInscriptionEssaiYoga(request, env);
      }

      // POST /api/notify/carte-pointage — élève pointe sa carte → email admin (sans auth)
      if (pathname === '/api/notify/carte-pointage' && method === 'POST') {
        return handleNotifyCartePointage(request, env);
      }

      // POST /api/notify/carte-pointee-admin — admin pointe → email + notif in-app élève (JWT admin)
      if (pathname === '/api/notify/carte-pointee-admin' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyCartePonteeAdmin(request, env);
      }

      // POST /api/notify/carte-epuisee — carte 10/10 → email + notif élève + notif admin (sans auth)
      if (pathname === '/api/notify/carte-epuisee' && method === 'POST') {
        return handleNotifyCarteEpuisee(request, env);
      }

      // POST /api/cron/carte-expiree — cron quotidien → emails cartes expirées (X-Cron-Secret)
      if (pathname === '/api/cron/carte-expiree' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronCarteExpiree(request, env);
      }

      // POST /api/cron/relance-cb3x — rappels 2ème/3ème échéance paiement CB 3×
      if (pathname === '/api/cron/relance-cb3x' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronRelanceCb3x(request, env);
      }

      // POST /api/cron/relance-absences — cron vendredi/mardi → email C6 si 2 absences consécutives (X-Cron-Secret)
      if (pathname === '/api/cron/relance-absences' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronRelanceAbsences(request, env);
      }

      // POST /api/notify/discussion-nouvelle — nouvelle discussion → notif in-app élèves + admin (JWT admin)
      if (pathname === '/api/notify/discussion-nouvelle' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyDiscussionNouvelle(request, jwt, env);
      }

      // POST /api/notify/discussion-message — nouveau message → notif in-app élèves + admin (JWT admin)
      if (pathname === '/api/notify/discussion-message' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyDiscussionMessage(request, jwt, env);
      }

      // POST /api/register-token — enregistre/met à jour le token FCM push de l'utilisateur (JWT requis)
      if (pathname === '/api/register-token' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleRegisterToken(request, jwt, env);
      }

      // GET /api/config-check — diagnostic : quels secrets sont configurés (JWT admin requis)
      if (pathname === '/api/config-check' && method === 'GET') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        const ok = await checkAdminJwt(jwt, env);
        if (!ok) return jsonError(403, 'Admin requis');
        return corsResponse({
          brevo_api_key:           !!env.BREVO_API_KEY,
          firebase_service_account: !!env.FIREBASE_SERVICE_ACCOUNT,
          cron_secret:             !!env.CRON_SECRET,
          supabase_service_key:    !!env.SUPABASE_SERVICE_KEY,
        }, 200, {}, request);
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

      // POST /api/notify/inscription-stage — nouvelle inscription stage (sans auth)
      if (pathname === '/api/notify/inscription-stage' && method === 'POST') {
        return handleNotifyInscriptionStage(request, env);
      }

      // POST /api/cron/rappel-stage-j3 — cron J-3 avant chaque stage (X-Cron-Secret)
      if (pathname === '/api/cron/rappel-stage-j3' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronRappelStageJ3(request, env);
      }

      // POST /api/notify/stage-valide — admin valide une inscription stage en attente (JWT admin)
      if (pathname === '/api/notify/stage-valide' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyStageValide(request, env);
      }

      // POST /api/notify/stage-annule — admin annule une inscription stage (JWT admin)
      if (pathname === '/api/notify/stage-annule' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyStageAnnule(request, env);
      }

      // POST /api/notify/cours-particulier — nouvelle demande de cours particulier (sans auth)
      if (pathname === '/api/notify/cours-particulier' && method === 'POST') {
        return handleNotifyCoursParticulier(request, env);
      }

      // POST /api/notify/carte-bienvenue — premier pointage carte10 (sans auth)
      if (pathname === '/api/notify/carte-bienvenue' && method === 'POST') {
        return handleNotifyCarteBienvenue(request, env);
      }

      // POST /api/notify/carte-renouvellement — carte10 renouvelée (sans auth)
      if (pathname === '/api/notify/carte-renouvellement' && method === 'POST') {
        return handleNotifyCarteRenouvellement(request, env);
      }

      // POST /api/notify/carte-paiement — paiement carte10 enregistré admin (JWT admin)
      if (pathname === '/api/notify/carte-paiement' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyCartePaiement(request, env);
      }

      // POST /api/notify/carte-report — carte10 reportée sur saison suivante (JWT admin)
      if (pathname === '/api/notify/carte-report' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyCarteReport(request, env);
      }

      // POST /api/notify/inscription-cours-validee — admin valide guidée → attente_paiement (JWT admin)
      if (pathname === '/api/notify/inscription-cours-validee' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyInscriptionCoursValidee(request, env);
      }

      // POST /api/notify/inscription-cours-payee — admin valide paiement → inscrit (JWT admin)
      if (pathname === '/api/notify/inscription-cours-payee' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyInscriptionCoursPaye(request, env);
      }

      // POST /api/notify/email-change — admin modifie l'email d'un élève (JWT admin)
      if (pathname === '/api/notify/email-change' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyEmailChange(request, env);
      }

      // POST /api/notify/inscription-cours-modifiee — admin modifie cours d'un élève inscrit (JWT admin)
      if (pathname === '/api/notify/inscription-cours-modifiee' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyInscriptionCoursModifiee(request, env);
      }

      // POST /api/cron/essai-rappel-j7 — cron J-7 avant chaque cours d'essai tango (X-Cron-Secret)
      if (pathname === '/api/cron/essai-rappel-j7' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronEssaiRappelJ7(request, env);
      }

      // POST /api/notify/essai-valide — admin valide essai en attente → confirme (JWT admin)
      if (pathname === '/api/notify/essai-valide' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyEssaiValide(request, env);
      }

      // POST /api/cron/essai-yoga-rappel-j3 — cron J-3 avant essai yoga (X-Cron-Secret)
      if (pathname === '/api/cron/essai-yoga-rappel-j3' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronEssaiYogaRappelJ3(request, env);
      }

      // POST /api/notify/essai-yoga-modifie — admin modifie date/cours d'un essai yoga (JWT admin)
      if (pathname === '/api/notify/essai-yoga-modifie' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyEssaiYogaModifie(request, env);
      }

      // POST /api/notify/yoga-inscription-validee — admin valide paiement yoga → YI1 (JWT admin)
      if (pathname === '/api/notify/yoga-inscription-validee' && method === 'POST') {
        if (!jwt) return jsonError(401, 'Token manquant — session expirée ?');
        return handleNotifyYogaInscriptionValidee(request, env);
      }

      // POST /api/cron/espace-eleve-activation — cron J+7 après I03 → email P1 (X-Cron-Secret)
      if (pathname === '/api/cron/espace-eleve-activation' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronEspaceEleveActivation(request, env);
      }

      // POST /api/cron/fin-saison-c4 — rappel fin de saison → élèves avec cours restants (X-Cron-Secret)
      if (pathname === '/api/cron/fin-saison-c4' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronFinSaisonC4(request, env);
      }

      // POST /api/cron/fin-saison-c5 — dernier rappel 25 août → élèves avec cours restants (X-Cron-Secret)
      if (pathname === '/api/cron/fin-saison-c5' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronFinSaisonC5(request, env);
      }

      // POST /api/cron/carte-pointee-j1 — CP-E : envoie emails élèves pointés la veille (X-Cron-Secret)
      if (pathname === '/api/cron/carte-pointee-j1' && method === 'POST') {
        const cronSecret = request.headers.get('X-Cron-Secret');
        if (!env.CRON_SECRET || cronSecret !== env.CRON_SECRET) return jsonError(401, 'Secret invalide');
        return handleCronCartePonteeJ1(request, env);
      }

      // GET /api/stages/confirmer — élève confirme sa présence via lien email (token HMAC)
      if (pathname === '/api/stages/confirmer' && (method === 'GET' || method === 'PATCH')) {
        return handleStagesConfirmer(request, url, env);
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
  const subject = hasAdded && hasRemoved ? '📅 Modifications de vos cours de yoga — Cours de yoga avec Florencia Garcia'
    : hasAdded   ? '📅 Nouveau cours de yoga ajouté — Cours de yoga avec Florencia Garcia'
    : '⚠️ Cours de yoga annulé — Cours de yoga avec Florencia Garcia';

  const bandeauBg  = hasRemoved ? '#fff8e1' : '#e8f5e9';
  const bandeauBrd = hasRemoved ? '#ffe082' : '#c8e6c9';
  const bandeauTxt = hasRemoved ? '#e65100' : '#2e7d32';
  const bandeauMsg = hasAdded && hasRemoved ? '📅 Modification de vos cours de yoga'
    : hasAdded ? '📅 Nouvelle date de yoga ajoutée'
    : '⚠️ Date de yoga annulée';

  const headerYoga = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:400;letter-spacing:4px;color:#D4AF37;">COURS DE YOGA</div>
    <div style="font-family:Georgia,serif;font-size:15px;font-weight:300;letter-spacing:3px;color:#D4AF37;margin-top:5px;">avec Florencia Garcia</div>
    </div>`;
  const footerYoga = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;">
    <a href="https://www.tangoetvous.com/cours-de-yoga" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">MA PAGE YOGA</a><br/>
    <a href="mailto:garciabraitbart@gmail.com" style="color:#888;text-decoration:none;">garciabraitbart@gmail.com</a> &nbsp;·&nbsp; 06 63 23 35 70
    </div>`;
  const signYoga = `<p style="font-size:14px;color:#2e7d32;text-align:center;margin:24px 0 0;">À très bientôt sur les tatamis !<br/>
    <strong style="color:#222;">Florencia Garcia</strong><br/>
    <span style="font-size:12px;color:#888;">Association Le Regard Se Pose · 06 63 23 35 70</span></p>`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    ${headerYoga}
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
      <p style="font-size:14px;color:#888;margin:20px 0 0;">Pour toute question, n'hésitez pas à me contacter.</p>
      ${signYoga}
    </div>
    ${footerYoga}
  </div></body></html>`;

  const yogaSender = 'regardsepose@gmail.com';
  let sent = 0;
  await Promise.all(emails.map(async (email) => {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Florencia Garcia — Yoga', email: 'tangoetvous@gmail.com' },
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
        // T1-val — bandeau vert, boîte cours bleue, bouton AssoConnect or, Quelques précisions, livret
        const isVincennes = (ville || '').toLowerCase() === 'vincennes';
        const lienACBtn = `<p style="text-align:center;margin:0 0 12px;"><a href="https://le-regard-se-pose.assoconnect.com/collect/description/695654-a-inscription-aux-cours-de-tango-argentin" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">S'inscrire sur AssoConnect →</a></p>
          <p style="font-size:12px;color:#888;text-align:center;margin:0 0 22px;">Votre place sera réservée une fois l'inscription en ligne et le premier paiement effectués.</p>`;
        const soranoBlock = isVincennes ? `<div style="background:#fff9e6;border:1px solid #f0c040;border-radius:8px;padding:16px 18px;margin:0 0 20px;">
          <p style="font-size:13px;font-weight:700;color:#795500;margin:0 0 8px;">🏛 Adhésion à l'Espace Sorano</p>
          <p style="font-size:13px;color:#555;line-height:1.6;margin:0;">Votre cours a lieu à l'Espace Sorano à Vincennes. Une adhésion à cet espace culturel est nécessaire pour participer. Nous vous contacterons prochainement avec les informations pour la régler.</p>
          </div>` : '';
        const quelquesPrecisions = `<div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:16px 18px;margin:0 0 20px;">
          <p style="font-size:13px;font-weight:700;color:#333;margin:0 0 12px;">📋 Quelques précisions</p>
          <div style="background:#fff3e0;border:1px solid #ffcc02;border-radius:6px;padding:10px 14px;margin:0 0 10px;">
            <p style="font-size:12px;color:#c65100;font-weight:700;margin:0;">⚠️ Si vous vous inscrivez en couple, chacun doit avoir une adresse email différente sur AssoConnect.</p>
          </div>
          <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 8px;"><strong>Modes de paiement acceptés :</strong> CB en 1× ou 3× sans frais, chèque à l'ordre de « Le Regard Se Pose », espèces, virement.</p>
          <p style="font-size:12px;color:#888;margin:0;">Cours de tango : aucun pourboire n'est attendu ni nécessaire.</p>
          </div>`;
        eleveHtml = wrap(`${headerEleve}
          <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">
            <span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre inscription au tango est validée — finalisez votre inscription</span></div>
          <div style="padding:28px 24px;">
            <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${recipientPrenom},</p>
            <p style="font-size:15px;color:#333;margin:0 0 20px;">Suite à votre cours d'essai, nous sommes ravis de vous accueillir dans nos cours de tango !</p>
            <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">INSCRIPTION TANGO</div>
              <div style="font-size:15px;font-weight:700;color:#111;">${_esc(coursAff)}</div>
              <div style="margin-top:10px;"><span style="background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✓ Validé·e</span></div>
            </div>
            ${soranoBlock}
            ${lienACBtn}
            ${quelquesPrecisions}
            ${signEleve}
          </div>${footer}`);
      }
      await sendBrevo(toEmail, `${isDemande ? '📋 Votre demande d\'inscription tango' : '🎓 Votre inscription tango est validée'} — ${_esc(coursAff)}`, eleveHtml);
    }
  }

  return corsResponse({ ok: true, sent }, 200, {}, request);
}

// ================================================================
// POST /api/cron/essai-j1 — emails E-J1a / E-J1b le lendemain du cours
// Appelé par GitHub Actions chaque matin (7h UTC) avec X-Cron-Secret
// ================================================================
async function handleCronEssaiJ1(request, env) {
  let body = {};
  try { body = await request.json(); } catch {}

  // date explicite dans le body, sinon hier (Paris = UTC+1/UTC+2)
  let targetDate = body.date;
  if (!targetDate) {
    const now = new Date();
    const parisOffset = 2; // CEST (été). À affiner si nécessaire.
    const paris = new Date(now.getTime() + parisOffset * 3600000);
    paris.setUTCDate(paris.getUTCDate() - 1);
    targetDate = paris.toISOString().slice(0, 10);
  }

  if (!env.BREVO_API_KEY) {
    console.log('[cron essai-j1] BREVO_API_KEY absent — skip');
    return corsResponse({ ok: true, sent: 0, skipped: true, date: targetDate }, 200, {}, request);
  }

  // Récupère les essais de la date cible avec presence_declaree non null
  const sbUrl = 'https://qhngqzvvllktuwspojxc.supabase.co';
  const sbKey = SUPABASE_ANON;
  const qs = `date_essai=eq.${targetDate}&presence_declaree=not.is.null&select=id,prenom,nom,email,ville,niveau,presence_declaree`;
  const resp = await fetch(`${sbUrl}/rest/v1/inscriptions_essai?${qs}`, {
    headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
  });
  if (!resp.ok) {
    console.error('[cron essai-j1] Supabase error', await resp.text());
    return jsonError(500, 'Erreur lecture Supabase');
  }
  const inscrits = await resp.json();
  if (!inscrits.length) return corsResponse({ ok: true, sent: 0, date: targetDate }, 200, {}, request);

  // Récupère les paramètres (horaires) depuis Supabase
  const paramsResp = await fetch(`${sbUrl}/rest/v1/parametres?select=cle,valeur`, {
    headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
  });
  let params = {};
  if (paramsResp.ok) {
    const rows = await paramsResp.json();
    rows.forEach(r => { try { params[r.cle] = typeof r.valeur === 'string' ? JSON.parse(r.valeur) : r.valeur; } catch {} });
  }

  // Détermine la saison depuis la date
  const dt = new Date(targetDate + 'T12:00:00');
  const y = dt.getFullYear(), m = dt.getMonth() + 1;
  const sai = m >= 9 ? `${y}-${y+1}` : `${y-1}-${y}`;

  const MOIS_L = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }
  const villeLabel = (v) => v === 'vincennes' ? 'Vincennes' : 'Paris';
  const nivLabel   = (n) => n === 'intermediaire' ? 'Intermédiaire' : 'Débutant';
  const adminEmail = 'tangoetvous@gmail.com';

  function getHoraire(ville) {
    const key = `tev_params_${ville}_${sai}`;
    const p = params[key] || {};
    const hor = (p.horaires || {})[ville === 'vincennes' ? 'vincennes' : 'paris'] || {};
    const deb = hor.debut || (ville === 'vincennes' ? '20h30' : '20h30');
    const fin = hor.fin   || (ville === 'vincennes' ? '22h00' : '22h00');
    return `${deb}–${fin}`;
  }
  function getAdresse(ville) {
    const key = `tev_params_${ville}_${sai}`;
    const p = params[key] || {};
    return (p.adresse || {}).nom || (ville === 'vincennes' ? 'Espace Sorano — Vincennes' : 'Paris');
  }
  function getLivret(ville, niveau) {
    const key = `tev_params_${ville}_${sai}`;
    const p = params[key] || {};
    const liv = p.livret || {};
    return niveau === 'intermediaire' ? (liv.url_int || '') : (liv.url_deb || '');
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
  const wrap = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  let sent = 0;
  async function sendBrevo(toEmail, subject, html) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(toEmail) }], subject, htmlContent: html }),
      });
      if (r.ok) sent++;
      else console.error('[cron essai-j1] Brevo error', toEmail, await r.text());
    } catch(e) { console.error('[cron essai-j1] fetch error', e); }
  }

  for (const ins of inscrits) {
    if (!ins.email) continue;
    const prenomAff = _esc(ins.prenom || '');
    const dateCours = fmtDate(targetDate);
    const ville = ins.ville || 'paris';
    const niveau = ins.niveau || 'debutant';
    const horaire = getHoraire(ville);
    const adresse = getAdresse(ville);
    const livret = getLivret(ville, niveau);
    const coursAff = `${villeLabel(ville)} — ${nivLabel(niveau)}`;
    const coursBox = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">COURS D'ESSAI TANGO</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="color:#888;padding:3px 0;width:120px;">Cours</td><td style="font-weight:700;color:#111;">${_esc(coursAff)}</td></tr>
        <tr><td style="color:#888;padding:3px 0;">Date</td><td style="font-weight:700;color:#111;">${_esc(dateCours)}</td></tr>
        <tr><td style="color:#888;padding:3px 0;">Horaire</td><td style="font-weight:700;color:#111;">${_esc(horaire)}</td></tr>
        <tr><td style="color:#888;padding:3px 0;">Lieu</td><td style="color:#444;">${_esc(adresse)}</td></tr>
      </table></div>`;
    const livretBtn = livret ? `<p style="text-align:center;margin:16px 0;"><a href="${_esc(livret)}" style="display:inline-block;background:#D4AF37;color:#111;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">📖 Télécharger le livret du cours</a></p>` : '';

    if (ins.presence_declaree === true) {
      // E-J1a — élève présent
      const inscriptionBtn = `<p style="text-align:center;margin:16px 0;"><a href="https://app.tangoetvous.fr/inscription-cours.html" style="display:inline-block;background:#2e7d32;color:#fff;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Demande d'inscription →</a></p>`;
      const html = wrap(`${headerEleve}
        <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">
          <span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Merci pour votre cours d'essai !</span></div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Nous espérons que ce cours d'essai de tango vous a plu !</p>
          ${coursBox}
          <p style="font-size:14px;color:#333;margin:0 0 16px;">Les cours continuent dès la semaine prochaine. Si vous souhaitez rejoindre nos cours réguliers, vous pouvez faire une demande d'inscription :</p>
          ${inscriptionBtn}
          ${niveau === 'debutant' ? `<p style="font-size:14px;color:#333;margin:16px 0 8px;"><strong>Pour rejoindre les cours :</strong></p>
          <ul style="font-size:14px;color:#444;line-height:1.8;margin:0 0 16px;padding-left:20px;">
            <li>Vous pouvez venir avec ou sans partenaire</li>
            <li>Aucune connaissance préalable requise</li>
            <li>Tenue décontractée, chaussures confortables à semelles lisses</li>
          </ul>` : ''}
          ${livretBtn}
          ${signEleve}
        </div>${footer}`);
      await sendBrevo(ins.email, `✓ Merci pour votre cours d'essai de tango — Tango & Vous`, html);
    } else if (ins.presence_declaree === false) {
      // E-J1b — élève absent
      const retourBtn = `<p style="text-align:center;margin:16px 0;"><a href="https://app.tangoetvous.fr/cours-essai.html" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">↩ Choisir une nouvelle date</a></p>`;
      const html = wrap(`${headerEleve}
        <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
          <span style="font-size:14px;font-weight:700;color:#e65100;">💙 Vous nous avez manqué !</span></div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Nous avons remarqué votre absence au cours d'essai d'hier. Pas d'inquiétude, il vous reste tout le temps de venir !</p>
          ${coursBox}
          <p style="font-size:14px;color:#333;margin:0 0 16px;">Votre cours d'essai n'a pas encore eu lieu — vous pouvez choisir une nouvelle date qui vous convient :</p>
          ${retourBtn}
          <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:14px 18px;margin:16px 0 0;">
            <p style="font-size:13px;color:#bf360c;margin:0;">Aucune pénalité — votre inscription reste valide pour le prochain cours disponible.</p>
          </div>
          ${signEleve}
        </div>${footer}`);
      await sendBrevo(ins.email, `💙 On vous attend bientôt pour votre cours d'essai de tango !`, html);
    }
  }

  return corsResponse({ ok: true, sent, date: targetDate, processed: inscrits.length }, 200, {}, request);
}

// POST /api/cron/essai-yoga-j1 — emails Y-J1a (présent) / Y-J1b (absent) le lendemain du cours yoga
// Appelé par GitHub Actions chaque matin (7h UTC) avec X-Cron-Secret
// ================================================================
async function handleCronEssaiYogaJ1(request, env) {
  let body = {};
  try { body = await request.json(); } catch {}

  let targetDate = body.date;
  if (!targetDate) {
    const now = new Date();
    const parisOffset = 2; // CEST (été)
    const paris = new Date(now.getTime() + parisOffset * 3600000);
    paris.setUTCDate(paris.getUTCDate() - 1);
    targetDate = paris.toISOString().slice(0, 10);
  }

  if (!env.BREVO_API_KEY) {
    console.log('[cron essai-yoga-j1] BREVO_API_KEY absent — skip');
    return corsResponse({ ok: true, sent: 0, skipped: true, date: targetDate }, 200, {}, request);
  }

  const sbUrl = 'https://qhngqzvvllktuwspojxc.supabase.co';
  const sbKey = SUPABASE_ANON;
  const qs = `date_essai=eq.${targetDate}&presence_declaree=not.is.null&select=id,prenom,nom,email,cours,presence_declaree`;
  const resp = await fetch(`${sbUrl}/rest/v1/inscriptions_essai_yoga?${qs}`, {
    headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
  });
  if (!resp.ok) {
    console.error('[cron essai-yoga-j1] Supabase error', await resp.text());
    return jsonError(500, 'Erreur lecture Supabase');
  }
  const inscrits = await resp.json();
  if (!inscrits.length) return corsResponse({ ok: true, sent: 0, date: targetDate }, 200, {}, request);

  // Paramètres yoga depuis Supabase
  const paramsResp = await fetch(`${sbUrl}/rest/v1/parametres?select=cle,valeur`, {
    headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
  });
  let params = {};
  if (paramsResp.ok) {
    const rows = await paramsResp.json();
    rows.forEach(r => { try { params[r.cle] = typeof r.valeur === 'string' ? JSON.parse(r.valeur) : r.valeur; } catch {} });
  }

  const dt = new Date(targetDate + 'T12:00:00');
  const y = dt.getFullYear(), mo = dt.getMonth() + 1;
  const sai = mo >= 9 ? `${y}-${y+1}` : `${y-1}-${y}`;
  const yogaParams = params[`tev_params_yoga_${sai}`] || {};
  const hor = yogaParams.horaires || {};
  const adresse = (yogaParams.adresse || {}).nom || 'Espace Sorano — Vincennes';
  const lienAC = ((params['tev_liens_assoconnect'] || {})[sai] || {}).yoga || '';

  const MOIS_L = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }
  function coursLabel(cours) {
    if (cours === 'yin') return 'Yin Yoga';
    if (cours === 'hatha') return 'Hatha Yoga';
    return 'Yin & Hatha Yoga (Forfait)';
  }
  function getHoraire(cours) {
    if (cours === 'yin' || cours === 'forfait') {
      const h = hor.yin || {};
      return h.debut && h.fin ? `${h.debut}–${h.fin}` : '';
    }
    const h = hor.hatha || {};
    return h.debut && h.fin ? `${h.debut}–${h.fin}` : '';
  }

  const adminEmail = 'regardsepose@gmail.com';
  const headerYoga = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:400;letter-spacing:4px;color:#D4AF37;">COURS DE YOGA</div>
    <div style="font-family:Georgia,serif;font-size:15px;font-weight:300;letter-spacing:3px;color:#D4AF37;margin-top:5px;">avec Florencia Garcia</div>
    </div>`;
  const footerYoga = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;">
    <a href="https://www.tangoetvous.com/cours-de-yoga" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">MA PAGE YOGA</a><br/>
    <a href="mailto:garciabraitbart@gmail.com" style="color:#888;text-decoration:none;">garciabraitbart@gmail.com</a> &nbsp;·&nbsp; 06 63 23 35 70
    </div>`;
  const signYoga = `<p style="font-size:14px;color:#2e7d32;text-align:center;margin:24px 0 0;">À très bientôt sur les tatamis !<br/>
    <strong style="color:#222;">Florencia Garcia</strong><br/>
    <span style="font-size:12px;color:#888;">Association Le Regard Se Pose · 06 63 23 35 70</span></p>`;
  const wrap = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  let sent = 0;
  async function sendBrevo(toEmail, subject, html) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Florencia Garcia — Yoga', email: 'tangoetvous@gmail.com' }, to: [{ email: String(toEmail) }], subject, htmlContent: html }),
      });
      if (r.ok) sent++;
      else console.error('[cron essai-yoga-j1] Brevo error', toEmail, await r.text());
    } catch(e) { console.error('[cron essai-yoga-j1] fetch error', e); }
  }

  // Récupère les tarifs yoga depuis Supabase pour Y-J1a
  const tarYoga = (yogaParams.tarifs || {});
  const tarifsYinStr   = tarYoga.yoga_forfait_1cours ? `Yin Yoga (1 cours/sem) : ${tarYoga.yoga_forfait_1cours}€` : 'Yin Yoga (1 cours/sem) : 340€';
  const tarifsHathaStr = tarYoga.yoga_forfait_1cours ? `Hatha Yoga (1 cours/sem) : ${tarYoga.yoga_forfait_1cours}€` : 'Hatha Yoga (1 cours/sem) : 340€';
  const tarifsForfaitStr = tarYoga.yoga_forfait_2cours ? `Forfait Yin + Hatha (2 cours/sem) : ${tarYoga.yoga_forfait_2cours}€` : 'Forfait Yin + Hatha (2 cours/sem) : 590€';
  // Fallback si non renseigné: 340/500/590
  const tarifsBlock = `<div style="background:#f1f8f1;border:1px solid #a5d6a7;border-radius:8px;padding:14px 18px;margin:16px 0;">
    <p style="font-size:13px;font-weight:700;color:#2e7d32;margin:0 0 8px;">💰 Tarifs annuels ${sai}</p>
    <p style="font-size:13px;color:#444;line-height:1.8;margin:0;">${tarifsYinStr}<br/>${tarifsHathaStr}<br/>${tarifsForfaitStr}</p>
    </div>`;

  for (const ins of inscrits) {
    if (!ins.email) continue;
    const prenomAff = _esc(ins.prenom || '');
    const coursAff = _esc(coursLabel(ins.cours));
    const horaire = getHoraire(ins.cours);
    const dateCours = fmtDate(targetDate);

    const yogaBox = `<div style="background:#f1f8f1;border:2px solid #388e3c;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#388e3c;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #a5d6a7;">COURS D'ESSAI YOGA</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="color:#888;padding:3px 0;width:120px;">Cours</td><td style="font-weight:700;color:#111;">${coursAff}</td></tr>
        <tr><td style="color:#888;padding:3px 0;">Date</td><td style="font-weight:700;color:#111;">${_esc(dateCours)}</td></tr>
        ${horaire ? `<tr><td style="color:#888;padding:3px 0;">Horaire</td><td style="font-weight:700;color:#111;">${_esc(horaire)}</td></tr>` : ''}
        <tr><td style="color:#888;padding:3px 0;">Lieu</td><td style="color:#444;">${_esc(adresse)}</td></tr>
      </table></div>`;

    if (ins.presence_declaree === true) {
      // Y-J1a — élève présent
      const acBtn = lienAC
        ? `<p style="text-align:center;margin:16px 0;"><a href="${_esc(lienAC)}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">S'inscrire aux cours réguliers →</a></p>`
        : `<p style="text-align:center;margin:16px 0;"><a href="https://www.tangoetvous.com/cours-de-yoga" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Voir les cours réguliers →</a></p>`;
      const horaireBlock = (hor.yin || hor.hatha) ? `<div style="background:#f1f8f1;border:1px solid #a5d6a7;border-radius:8px;padding:14px 18px;margin:16px 0;">
        <p style="font-size:13px;font-weight:700;color:#2e7d32;margin:0 0 8px;">📅 Les cours réguliers ont lieu :</p>
        <p style="font-size:13px;color:#444;line-height:1.8;margin:0;">
        ${hor.yin ? `Yin Yoga : ${_esc((hor.yin.jour||'')+(hor.yin.debut?' — '+hor.yin.debut+(hor.yin.fin?'–'+hor.yin.fin:''):''))}` : ''}
        ${hor.yin && hor.hatha ? '<br/>' : ''}
        ${hor.hatha ? `Hatha Yoga : ${_esc((hor.hatha.jour||'')+(hor.hatha.debut?' — '+hor.hatha.debut+(hor.hatha.fin?'–'+hor.hatha.fin:''):''))}` : ''}
        </p></div>` : '';
      const html = wrap(`${headerYoga}
        <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">
          <span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Merci pour votre cours d'essai yoga !</span></div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Merci d'être venu·e à ce cours d'essai yoga ! J'espère que l'expérience vous a plu et que vous avez envie de rejoindre les cours réguliers.</p>
          ${yogaBox}
          <p style="font-size:14px;color:#333;margin:0 0 12px;">Pour rejoindre les cours réguliers, rendez-vous sur AssoConnect :</p>
          ${acBtn}
          ${horaireBlock}
          ${tarifsBlock}
          ${signYoga}
        </div>${footerYoga}`);
      await sendBrevo(ins.email, `✓ Merci pour votre cours d'essai — Cours de yoga avec Florencia Garcia`, html);
      // Copie admin
      await sendBrevo(adminEmail, `[Copie] Y-J1a — ${_esc((ins.prenom||'')+' '+(ins.nom||''))} était présent·e`, html);
    } else if (ins.presence_declaree === false) {
      // Y-J1b — élève absent
      const retourBtn = `<p style="text-align:center;margin:16px 0;"><a href="https://app.tangoetvous.fr/essai-yoga.html" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">↩ Choisir une nouvelle date</a></p>`;
      const html = wrap(`${headerYoga}
        <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
          <span style="font-size:14px;font-weight:700;color:#e65100;">💙 Vous nous avez manqué !</span></div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
          <p style="font-size:15px;color:#333;margin:0 0 20px;">J'ai remarqué votre absence au cours d'essai d'hier. Pas d'inquiétude, il vous reste tout le temps de venir !</p>
          ${yogaBox}
          <p style="font-size:14px;color:#333;margin:0 0 16px;">Votre cours d'essai n'a pas encore eu lieu — vous pouvez choisir une nouvelle date qui vous convient :</p>
          ${retourBtn}
          <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:14px 18px;margin:16px 0 0;">
            <p style="font-size:13px;color:#bf360c;margin:0;">Aucune pénalité — votre inscription reste valide pour le prochain cours disponible.</p>
          </div>
          ${signYoga}
        </div>${footerYoga}`);
      await sendBrevo(ins.email, `💙 On vous attend bientôt — Cours de yoga avec Florencia Garcia`, html);
      await sendBrevo(adminEmail, `[Copie] Y-J1b — ${_esc((ins.prenom||'')+' '+(ins.nom||''))} était absent·e`, html);
    }
  }

  return corsResponse({ ok: true, sent, date: targetDate, processed: inscrits.length }, 200, {}, request);
}

function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function sendBrevoNotification(apiKey, body) {
  const prestations = (body.prestations_labels || []).map(_esc).join(', ') || '(non précisé)';
  const nomAff = _esc(`${body.civilite || ''} ${body.prenom || ''} ${body.nom || ''}`.trim());
  const isEvent = body.mode === 'event';
  const modeBadge = isEvent
    ? `<span style="background:#1565c0;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">🎉 Événement</span>`
    : `<span style="background:#6a1b9a;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">🎯 Cours privé</span>`;

  function row(label, val) {
    if (!val) return '';
    return `<tr><td style="color:#888;padding:4px 0;white-space:nowrap;width:160px;font-size:13px;">${_esc(label)}</td><td style="font-weight:700;color:#111;font-size:13px;padding:4px 0;">${val}</td></tr>`;
  }

  let detailRows = '';
  if (isEvent) {
    detailRows = [
      row('Type d\'événement', body.type_evenement ? _esc(body.type_evenement) : ''),
      row('Date', body.date_evenement ? _esc(body.date_evenement) + (body.date_flexible === 'oui' ? ' <span style="color:#888;font-size:11px;">(flexible)</span>' : '') : ''),
      row('Horaire', body.horaire_evenement ? _esc(body.horaire_evenement) : ''),
      row('Lieu', body.lieu ? _esc(body.lieu) + (body.code_postal ? ' (' + _esc(body.code_postal) + ')' : '') : ''),
      row('Nb invités', body.nombre_invites ? _esc(String(body.nombre_invites)) : ''),
      row('Durée prestation', body.duree_prestation ? _esc(body.duree_prestation) : ''),
      row('Budget', body.budget ? _esc(body.budget) : ''),
    ].join('');
  } else {
    detailRows = [
      row('Type de demande', body.type_demande ? _esc(body.type_demande) : ''),
      row('Pour qui', body.pour_qui ? _esc(body.pour_qui) : ''),
      row('Niveau tango', body.niveau_tango ? _esc(body.niveau_tango) : ''),
      row('Professeur souhaité', body.professeur ? _esc(body.professeur) : ''),
      row('Lieu cours', body.lieu_cours ? _esc(body.lieu_cours) : ''),
      row('Durée cours', body.duree_cours ? _esc(body.duree_cours) : ''),
      row('Nb de cours', body.nombre_cours ? _esc(String(body.nombre_cours)) : ''),
      row('Disponibilités', body.dates_periodes ? _esc(body.dates_periodes) : ''),
      row('Budget', body.budget ? _esc(body.budget) : ''),
    ].join('');
  }

  const adminHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;">
    <div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div>
    <div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Nouvelle demande de devis</div>
  </div>
  <div style="padding:24px;">
    <div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#D4AF37;padding:10px 16px;display:flex;align-items:center;gap:12px;">
        <div style="flex:1;">
          <div style="font-size:18px;font-weight:700;color:#111;">${nomAff}</div>
          <div style="font-size:12px;color:#333;margin-top:2px;">${_esc(body.email || '')}${body.telephone ? ' · ' + _esc(body.telephone) : ''}</div>
        </div>
        ${modeBadge}
      </div>
      <div style="background:#fffdf8;padding:14px 16px;">
        <p style="font-size:13px;font-weight:700;color:#555;margin:0 0 8px;">Prestations demandées</p>
        <p style="font-size:14px;color:#111;font-weight:700;margin:0 0 12px;">${prestations}</p>
        <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
        ${body.message ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e0d9c4;"><p style="font-size:12px;color:#888;margin:0 0 6px;">Message</p><div style="background:#f5f5f5;border-radius:6px;padding:10px 12px;font-size:13px;color:#333;white-space:pre-wrap;">${_esc(body.message)}</div></div>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
      ${body.telephone ? `<a href="tel:${_esc(body.telephone)}" style="display:inline-block;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">📞 Appeler</a>` : ''}
      <a href="mailto:${_esc(body.email || '')}" style="display:inline-block;background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">✉️ Email</a>
      ${body.telephone ? `<a href="sms:${_esc(body.telephone)}" style="display:inline-block;background:#f3e5f5;color:#6a1b9a;border:1px solid #ce93d8;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">💬 SMS</a>` : ''}
      <a href="https://app.tangoetvous.fr/admin.html" style="display:inline-block;background:#D4AF37;color:#111;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">→ Admin</a>
      <a href="https://app.tangoetvous.fr/generateur-devis.html" style="display:inline-block;background:#fff8e1;color:#795500;border:1px solid #f0c040;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">📋 Créer un devis →</a>
    </div>
  </div>
</div>
</body></html>`;

  // D0a / D0b : email admin
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Tango & Vous', email: 'tangoetvous@gmail.com' },
        to: [{ email: 'tangoetvous@gmail.com', name: 'Admin Tango & Vous' }],
        subject: `💼 Nouvelle demande de devis — ${nomAff}${isEvent && body.type_evenement ? ' · ' + body.type_evenement : ''}`,
        htmlContent: adminHtml,
      }),
    });
  } catch(e) { console.error('[sendBrevoNotification] admin email error', e); }

  // D2 : accusé réception au demandeur
  if (body.email) {
    const demandeurPrenom = _esc(body.prenom || body.nom || 'Madame, Monsieur');
    const recapRows = isEvent ? [
      row('Type d\'événement', body.type_evenement ? _esc(body.type_evenement) : ''),
      row('Date', body.date_evenement ? _esc(body.date_evenement) : ''),
      row('Prestations', prestations),
    ].join('') : [
      row('Type de demande', body.type_demande ? _esc(body.type_demande) : ''),
      row('Prestations', prestations),
    ].join('');

    const d2Html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;">
    <div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div>
    <div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div>
  </div>
  <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;">
    <span style="font-size:14px;font-weight:700;color:#1565c0;">📋 Votre demande est bien enregistrée</span>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${demandeurPrenom},</p>
    <p style="font-size:15px;color:#333;margin:0 0 20px;">Nous avons bien reçu votre demande de devis. Voici un récapitulatif :</p>
    <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">VOTRE DEMANDE</div>
      <table style="width:100%;border-collapse:collapse;">${recapRows}</table>
      ${body.message ? `<div style="margin-top:10px;font-size:13px;color:#555;"><strong>Message :</strong><br/>${_esc(body.message)}</div>` : ''}
    </div>
    <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px 18px;margin:0 0 22px;">
      <p style="font-size:14px;color:#e65100;font-weight:700;margin:0 0 8px;">⏱ Délai de réponse</p>
      <p style="font-size:14px;color:#444;margin:0;">Nous répondons généralement sous 24 à 48h. Nous vous contacterons pour affiner les détails et vous envoyer un devis personnalisé.</p>
    </div>
    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">Pour toute question urgente, vous pouvez nous contacter directement :</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="tel:07 73 27 59 06" style="display:inline-block;margin:4px;background:#D4AF37;color:#111;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">📞 07 73 27 59 06</a>
      <a href="mailto:tangoetvous@gmail.com" style="display:inline-block;margin:4px;background:#fff;border:2px solid #D4AF37;color:#111;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">✉️ tangoetvous@gmail.com</a>
    </div>
    <p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À bientôt !<br/>
    <strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/>
    <span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>
  </div>
  <div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;">
    <a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/>
    <a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06
  </div>
</div>
</body></html>`;
    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Tango & Vous', email: 'tangoetvous@gmail.com' },
          to: [{ email: String(body.email) }],
          subject: `📋 Votre demande de devis — Tango & Vous`,
          htmlContent: d2Html,
        }),
      });
    } catch(e) { console.error('[sendBrevoNotification] D2 email error', e); }
  }
}


// ================================================================
// POST /api/notify/sorano — email + notification in-app
// type: 'relance' | 'regle'
// ================================================================
async function handleNotifySorano(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const { type, prenom, nom, email, cours } = body;
  if (!email) return jsonError(400, 'email manquant');

  const prenomAff = _esc(prenom || (nom || '').split(' ')[0] || '');
  const adminEmail = 'tangoetvous@gmail.com';

  // Notification in-app (toujours, même sans Brevo)
  const notifMsg = type === 'regle'
    ? '✓ Votre adhésion Sorano a été enregistrée pour cette saison'
    : '⏳ Rappel : votre adhésion à l\'Espace Sorano n\'est pas encore réglée';
  const notifType = type === 'regle' ? 'sorano_regle' : 'sorano_relance';
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ email, type: notifType, message: notifMsg, lu: false }),
    });
  } catch(e) { console.error('[notify sorano] notifications_eleve error', e); }

  if (!env.BREVO_API_KEY) {
    console.log('[notify sorano] BREVO_API_KEY absent — skip email');
    return corsResponse({ ok: true, sent: 0, notified: true, skipped: true }, 200, {}, request);
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
  const wrap = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  let sent = 0;
  async function sendBrevo(toEmail, subject, html) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(toEmail) }], subject, htmlContent: html }),
      });
      if (r.ok) sent++;
      else console.error('[notify sorano] Brevo error', toEmail, await r.text());
    } catch(e) { console.error('[notify sorano] fetch error', e); }
  }

  const coursLabel = _esc(cours || 'Tango Vincennes');

  if (type === 'regle') {
    const html = wrap(`${headerEleve}
      <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">
        <span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Adhésion Sorano enregistrée</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">ADHÉSION ESPACE SORANO · VINCENNES</div>
          <div style="font-size:15px;font-weight:700;color:#2e7d32;margin-bottom:8px;">✓ Enregistrée pour cette saison</div>
          <div style="font-size:14px;color:#444;">${coursLabel}</div>
        </div>
        <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 16px;">Votre adhésion à l'Espace Sorano est bien enregistrée pour cette saison.</p>
        ${signEleve}
      </div>${footer}`);
    await sendBrevo(email, `✓ Adhésion Sorano enregistrée · Tango & Vous`, html);
  } else {
    const html = wrap(`${headerEleve}
      <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
        <span style="font-size:14px;font-weight:700;color:#e65100;">⏳ Rappel — Adhésion Sorano</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 20px;">L'Espace Sorano demande pour toutes les activités qui y ont lieu une adhésion nécessaire pour participer aux cours. Mais sachez que cette adhésion permet de bénéficier de réductions sur tous les spectacles proposés au Théâtre Sorano ainsi que sur ceux programmés par les services culturels de la Ville de Vincennes.</p>
        <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
          <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">📋 Comment procéder</p>
          <p style="font-size:14px;color:#444;line-height:1.7;margin:0;">Nous vous enverrons prochainement un lien pour régler cette adhésion.</p>
        </div>
        <p style="font-size:14px;color:#333;margin:0 0 24px;">Si vous avez déjà réglé votre adhésion pour une autre activité à l'Espace Sorano merci de nous l'indiquer.</p>
        <p style="text-align:center;margin:0 0 24px;"><a href="mailto:tangoetvous@gmail.com" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Nous contacter</a></p>
        ${signEleve}
      </div>${footer}`);
    await sendBrevo(email, `⏳ Rappel — Adhésion Sorano · Tango & Vous`, html);
  }

  return corsResponse({ ok: true, sent, notified: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/carte-pointage — élève pointe sa carte → email admin
// Aucune auth requise (appelé depuis QR page ou espace élève sans JWT admin)
// ================================================================
async function handleNotifyCartePointage(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const { email, prenom, nom, date, nbAdded, utilises, restants, source } = body;
  if (!email || !date) return jsonError(400, 'Paramètres manquants');

  const MOIS_L = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }

  const adminEmail = 'tangoetvous@gmail.com';
  const nb = Number(nbAdded) || 1;
  const sourceLabel = source === 'qr' ? 'QR code' : 'Espace élève';
  const nomAff = _esc((nom || email).trim());
  const dateLabel = fmtDate(date);
  const notifMsg = `📍 Pointage carte — ${nomAff} · ${dateLabel} · +${nb} cours via ${sourceLabel}`;

  // Notification panel admin (table notifications)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ type: 'carte_pointage', message: notifMsg, lu: false, lien_tab: 'cartes' }),
    });
  } catch(e) { console.error('[notify carte-pointage] notifications error', e); }

  if (!env.BREVO_API_KEY) {
    console.log('[notify carte-pointage] BREVO_API_KEY absent — skip email');
    return corsResponse({ ok: true, sent: 0, notified: true, skipped: true }, 200, {}, request);
  }

  const sourceBadge = source === 'qr'
    ? `<span style="background:#1565c0;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">QR code</span>`
    : `<span style="background:#388e3c;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">Espace élève</span>`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;">
    <div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div>
    <div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Pointage carte de 10</div>
  </div>
  <div style="padding:24px;">
    <div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#D4AF37;padding:10px 16px;display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:18px;font-weight:700;color:#111;">${nomAff}</div>
          <div style="font-size:12px;color:#333;margin-top:2px;">${_esc(email)}</div>
        </div>
        ${sourceBadge}
      </div>
      <div style="background:#fffdf8;padding:14px 16px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#e8f5e9;">
            <td style="padding:6px 8px;font-weight:700;color:#2e7d32;">⬤ Cours pointés CE JOUR</td>
            <td style="padding:6px 8px;font-weight:700;color:#2e7d32;text-align:right;">+${nb} cours</td>
          </tr>
          <tr><td style="padding:4px 8px;color:#888;">Date</td><td style="padding:4px 8px;font-weight:700;color:#111;text-align:right;">${dateLabel}</td></tr>
          ${utilises != null ? `<tr><td style="padding:4px 8px;color:#888;">Utilisés au total (carte)</td><td style="padding:4px 8px;font-weight:700;color:#111;text-align:right;">${utilises}/10</td></tr>` : ''}
          ${restants != null ? `<tr><td style="padding:4px 8px;color:#888;">Cours restants</td><td style="padding:4px 8px;font-weight:700;color:#2e7d32;text-align:right;">${restants}</td></tr>` : ''}
        </table>
      </div>
    </div>
    <p style="text-align:center;margin:0;"><a href="https://app.tangoetvous.fr/admin.html" style="display:inline-block;background:#D4AF37;color:#111;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ouvrir l'admin → Cartes 10</a></p>
  </div>
</div>
</body></html>`;

  let sent = 0;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Tango & Vous', email: adminEmail },
        to: [{ email: adminEmail }],
        subject: `📍 Pointage carte — ${nomAff} · ${dateLabel} (+${nb} cours via ${sourceLabel})`,
        htmlContent: html,
      }),
    });
    if (r.ok) sent++;
    else console.error('[notify carte-pointage] Brevo error', await r.text());
  } catch(e) { console.error('[notify carte-pointage] fetch error', e); }

  // Push FCM admin
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    getFcmTokensAdmin(_svcKey).then(function(tokens) {
      if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous — Admin', body: `📍 Pointage carte — ${nomAff} · ${dateLabel}` }).catch(function(){});
    }).catch(function(){});
  }

  return corsResponse({ ok: true, sent, notified: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/carte-pointee-admin — admin pointe → email + notif in-app élève
// ================================================================
async function handleNotifyCartePonteeAdmin(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const { email, prenom, nom, date, nbAdded, utilises, restants, expiration } = body;
  if (!email || !date) return jsonError(400, 'Paramètres manquants');

  const MOIS_L = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }

  const adminEmail = 'tangoetvous@gmail.com';
  const nb = Number(nbAdded) || 1;
  const prenomAff = _esc(prenom || (nom || '').split(' ')[0] || '');
  const dateLabel = fmtDate(date);
  const notifMsg = `✓ ${nb} cours pointé${nb > 1 ? 's' : ''} le ${dateLabel}${restants != null ? ' — ' + restants + ' restant' + (restants !== 1 ? 's' : '') : ''}`;

  // Notification in-app élève
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ email, type: 'carte_pointee', message: notifMsg, lu: false }),
    });
  } catch(e) { console.error('[notify carte-pointee-admin] notifications_eleve error', e); }

  // Mettre en file d'attente l'email CP-E (envoyé le lendemain matin via cron carte-pointee-j1)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        email,
        type: 'carte_pointee_pending_email',
        message: JSON.stringify({ email, prenom, nom, date, nbAdded: nb, utilises, restants, expiration }),
        lu: false,
      }),
    });
  } catch(e) { console.error('[notify carte-pointee-admin] pending email queue error', e); }

  const sent = 0;
  // Push FCM élève
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    getFcmTokensForEmail(String(email), _svcKey).then(function(tokens) {
      if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous', body: `✓ Présence enregistrée le ${dateLabel} — votre carte Tango & Vous` }).catch(function(){});
    }).catch(function(){});
  }

  return corsResponse({ ok: true, sent, notified: true }, 200, {}, request);
}

// ================================================================
// POST /api/cron/carte-pointee-j1 — CP-E : envoie emails élèves pointés la veille
// Lit notifications_eleve WHERE type='carte_pointee_pending_email' AND lu=false
// ================================================================
async function handleCronCartePonteeJ1(request, env) {
  if (!env.BREVO_API_KEY) {
    return corsResponse({ ok: false, skipped: true, reason: 'no_brevo_key' }, 200, {}, request);
  }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }

  const adminEmail = 'tangoetvous@gmail.com';

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications_eleve?type=eq.carte_pointee_pending_email&lu=eq.false&select=id,email,message`,
    { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  const pending = await res.json();

  if (!pending.length) return corsResponse({ ok: true, sent: 0, checked: 0 }, 200, {}, request);

  // Grouper par email
  const byEmail = {};
  for (const row of pending) {
    let data;
    try { data = typeof row.message === 'string' ? JSON.parse(row.message) : row.message; } catch { data = {}; }
    if (!byEmail[row.email]) byEmail[row.email] = { ids: [], entries: [] };
    byEmail[row.email].ids.push(row.id);
    byEmail[row.email].entries.push(data);
  }

  let sent = 0;
  for (const [emailAddr, { ids, entries }] of Object.entries(byEmail)) {
    const last = entries[entries.length - 1];
    const nbAdded = entries.reduce((s, e) => s + (Number(e.nbAdded) || 1), 0);
    const prenom = last.prenom || '';
    const nom = last.nom || '';
    const date = last.date || (entries[0] && entries[0].date) || '';
    const utilises = last.utilises;
    const restants = last.restants;
    const expiration = last.expiration;

    const prenomAff = _esc(prenom || (nom || '').split(' ')[0] || '');
    const dateLabel = date ? fmtDate(date) : '';
    const expirationRow = expiration
      ? `<tr><td style="padding:4px 8px;color:#888;">Validité carte</td><td style="padding:4px 8px;font-weight:700;color:#111;text-align:right;">jusqu'au ${fmtDate(expiration)}</td></tr>`
      : '';

    const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
    const footer = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
    const signEleve = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">
  ${headerEleve}
  <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Présence enregistrée pour votre carte</span></div>
  <div style="padding:28px 24px;">
    <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
    <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">VOTRE CARTE DE 10 COURS</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#e8f5e9;"><td style="padding:6px 8px;font-weight:700;color:#2e7d32;">⬤ Cours pointés CE JOUR</td><td style="padding:6px 8px;font-weight:700;color:#2e7d32;text-align:right;">${nbAdded} cours</td></tr>
        <tr><td style="padding:4px 8px;color:#888;">Date du cours</td><td style="padding:4px 8px;font-weight:700;color:#111;text-align:right;">${dateLabel}</td></tr>
        ${utilises != null ? `<tr><td style="padding:4px 8px;color:#888;">Utilisés au total (carte)</td><td style="padding:4px 8px;font-weight:700;color:#111;text-align:right;">${utilises}/10</td></tr>` : ''}
        ${restants != null ? `<tr><td style="padding:4px 8px;color:#888;">Cours restants</td><td style="padding:4px 8px;font-weight:700;color:#2e7d32;text-align:right;">${restants}</td></tr>` : ''}
        ${expirationRow}
      </table>
    </div>
    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">Retrouvez l'état de votre carte et votre historique de présences dans votre espace élève.</p>
    <p style="text-align:center;margin:0 0 24px;"><a href="https://app.tangoetvous.fr" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Accéder à mon espace élève →</a></p>
    ${signEleve}
  </div>
  ${footer}
</div></body></html>`;

    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Tango & Vous', email: adminEmail },
          to: [{ email: String(emailAddr) }],
          subject: `✓ Présence enregistrée le ${dateLabel} — Votre carte Tango & Vous`,
          htmlContent: html,
        }),
      });
      if (r.ok) sent++;
      else console.error('[cron-carte-pointee-j1] Brevo error', await r.text());
    } catch(e) { console.error('[cron-carte-pointee-j1] email error', e); }

    // Marquer les entrées comme traitées
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve?id=in.(${ids.join(',')})`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ lu: true }),
      });
    } catch(e) { console.error('[cron-carte-pointee-j1] mark processed error', e); }
  }

  return corsResponse({ ok: true, sent, checked: pending.length }, 200, {}, request);
}

// ================================================================
// GET /api/stages/confirmer — élève confirme sa présence via lien email (token HMAC)
// Params: email, date (YYYY-MM-DD), token (HMAC(email:date, SUPABASE_ANON).slice(0,32))
// ================================================================
async function handleStagesConfirmer(request, url, env) {
  const email = url.searchParams.get('email');
  const date  = url.searchParams.get('date');
  const token = url.searchParams.get('token');
  if (!email || !date || !token) return new Response('Paramètres manquants', { status: 400, headers: { 'Content-Type': 'text/plain' } });

  const expectedHmac = await _calHmac(email + ':' + date, SUPABASE_ANON);
  if (token !== expectedHmac.slice(0, 32)) return new Response('Token invalide', { status: 403, headers: { 'Content-Type': 'text/plain' } });

  const upd = await fetch(
    `${SUPABASE_URL}/rest/v1/inscriptions_stages?email=eq.${encodeURIComponent(email)}&stage_date=eq.${date}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ presence_confirmee: true }),
    }
  );

  const dateDisp = date.split('-').reverse().join('/');
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirmation — Tango &amp; Vous</title>
<style>body{margin:0;padding:20px;background:#f5f5f5;font-family:Arial,sans-serif;text-align:center;}
.box{max-width:400px;margin:60px auto;background:#fff;border-radius:12px;padding:40px 32px;box-shadow:0 2px 16px rgba(0,0,0,.08);}
.icon{font-size:48px;margin:0 0 16px;}h1{font-size:22px;color:#2e7d32;margin:0 0 10px;}
p{font-size:15px;color:#555;line-height:1.6;margin:0 0 24px;}
a{display:inline-block;background:#D4AF37;color:#111;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;}
.sub{font-size:12px;color:#888;margin-top:10px;}</style></head><body>
<div class="box"><div class="icon">👍</div>
<h1>${upd.ok ? 'Présence confirmée !' : 'Déjà enregistré'}</h1>
<p>${upd.ok ? `Merci, votre présence au stage du ${dateDisp} a bien été enregistrée.<br/>À très bientôt sur la piste !` : 'Votre présence était déjà confirmée pour ce stage.'}</p>
<a href="https://www.tangoetvous.com">Retour au site →</a>
<div class="sub">Tango &amp; Vous</div>
</div></body></html>`;

  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
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

// ================================================================
// POST /api/notify/carte-epuisee — carte 10/10 sans renouvellement
// → email élève + notif in-app élève + notif panel admin
// Sans auth (appelé depuis QR, espace élève, admin)
// ================================================================
async function handleNotifyCarteEpuisee(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const { email, prenom, nom, utilises, restants } = body;
  if (!email) return jsonError(400, 'email manquant');

  const prenomAff = _esc(prenom || (nom || '').split(' ')[0] || '');
  const nomAff    = _esc(nom || email);

  const notifMsgEleve = '💳 Votre carte de 10 cours est terminée — pensez à la renouveler';
  const notifMsgAdmin = `💳 Carte terminée — ${nom || email} · 10/10 cours utilisés`;

  // Notif in-app élève
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email, type: 'carte_epuisee', message: notifMsgEleve, lu: false }),
    });
  } catch(e) { console.error('[carte-epuisee] notifications_eleve error', e); }

  // Notif panel admin
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: 'carte_epuisee', message: notifMsgAdmin, lu: false, lien_tab: 'cartes' }),
    });
  } catch(e) { console.error('[carte-epuisee] notifications error', e); }

  if (!env.BREVO_API_KEY) {
    return corsResponse({ ok: true, sent: 0, notified: true, skipped: true }, 200, {}, request);
  }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  // Email élève
  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
      <span style="font-size:14px;font-weight:700;color:#e65100;">💳 Votre carte de 10 cours est terminée</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Vous avez utilisé vos 10 cours. Pour continuer à venir danser, pensez à renouveler votre carte !</p>
      <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px 20px;margin:0 0 22px;">
        <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 8px;">⚠️ Carte terminée — 10/10 cours utilisés</p>
        <p style="font-size:13px;color:#444;margin:0;">Rendez-vous sur AssoConnect pour renouveler votre carte ou renouvelez directement depuis votre espace élève.</p>
      </div>
      <p style="text-align:center;margin:0 0 16px;"><a href="https://app.tangoetvous.fr" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">💳 Renouveler ma carte depuis l'espace élève →</a></p>
      <p style="text-align:center;margin:0 0 22px;"><a href="https://app.tangoetvous.fr" style="display:inline-block;background:#fff;border:2px solid #D4AF37;color:#111;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Accéder à mon espace élève →</a></p>
      ${signEleve}
    </div>${footer}`);

  // Email admin
  const htmlAdmin = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;">
    <div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div>
    <div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Carte terminée</div>
  </div>
  <div style="padding:24px;">
    <div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#D4AF37;padding:10px 16px;">
        <div style="font-size:18px;font-weight:700;color:#111;">${nomAff}</div>
        <div style="font-size:12px;color:#333;margin-top:2px;">${_esc(email)}</div>
      </div>
      <div style="background:#fffdf8;padding:14px 16px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#fff3e0;">
            <td style="padding:6px 8px;font-weight:700;color:#c62828;">💳 10/10 cours utilisés</td>
            <td style="padding:6px 8px;font-weight:700;color:#c62828;text-align:right;">Badge 💳</td>
          </tr>
          <tr><td style="padding:4px 8px;color:#888;">Statut</td><td style="padding:4px 8px;font-weight:700;color:#e65100;text-align:right;">Renouvellement en attente</td></tr>
          ${utilises != null ? `<tr><td style="padding:4px 8px;color:#888;">Utilisés</td><td style="padding:4px 8px;font-weight:700;color:#111;text-align:right;">${utilises}/10</td></tr>` : ''}
        </table>
      </div>
    </div>
    <p style="text-align:center;"><a href="https://app.tangoetvous.fr/admin.html" style="display:inline-block;background:#D4AF37;color:#111;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ouvrir l'admin → Cartes 10</a></p>
  </div>
</div></body></html>`;

  let sent = 0;
  const sendMail = async (to, subject, html) => {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: to }], subject, htmlContent: html }),
      });
      if (r.ok) sent++; else console.error('[carte-epuisee] Brevo error', await r.text());
    } catch(e) { console.error('[carte-epuisee] fetch error', e); }
  };
  await sendMail(String(email), '💳 Votre carte de 10 cours est terminée — Tango & Vous', htmlEleve);
  await sendMail(adminEmail, `💳 Carte terminée — ${nom || email}`, htmlAdmin);

  return corsResponse({ ok: true, sent, notified: true }, 200, {}, request);
}

// ================================================================
// POST /api/cron/carte-expiree — cron quotidien
// Notifie les élèves dont la carte expire aujourd'hui (X-Cron-Secret)
// ================================================================
async function handleCronCarteExpiree(request, env) {
  const today = new Date().toISOString().slice(0, 10);
  const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;

  // Chercher les élèves dont la carte expire aujourd'hui avec des cours restants
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eleves?carte_expiration=eq.${today}&carte_statut=in.(Active,Nouvelle carte)&select=email,prenom,nom,carte_utilises,carte_restants,carte_expiration`,
    { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
  );
  if (!res.ok) {
    console.error('[cron carte-expiree] Supabase error', await res.text());
    return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  }
  const eleves = await res.json();

  // Filtrer : seulement ceux avec des cours restants (pas encore épuisés)
  const aNotifier = eleves.filter(e => (e.carte_restants || 0) > 0);

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  let sent = 0;
  for (const e of aNotifier) {
    const prenomAff = _esc(e.prenom || (e.nom || '').split(' ')[0] || '');
    const nomAff    = _esc((e.prenom || '') + ' ' + (e.nom || '')).trim();
    const restants  = e.carte_restants || 0;
    const dateLabel = fmtDate(today);

    const notifMsg = `⏰ Votre carte expire aujourd'hui — il vous reste ${restants} cours non utilisés`;

    // Notif in-app élève
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email: e.email, type: 'carte_expiree', message: notifMsg, lu: false }),
      });
    } catch(err) { console.error('[cron carte-expiree] notif error', err); }

    // Notif panel admin
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ type: 'carte_expiree', message: `⏰ Carte expirée — ${nomAff || e.email} · ${restants} cours perdus`, lu: false, lien_tab: 'cartes' }),
      });
    } catch(err) { console.error('[cron carte-expiree] admin notif error', err); }

    if (!env.BREVO_API_KEY) continue;

    // Email élève (CX)
    const htmlEleve = wrap(`${headerEleve}
      <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
        <span style="font-size:14px;font-weight:700;color:#e65100;">⏰ Votre carte de 10 cours a expiré</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px 20px;margin:0 0 22px;">
          <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">Votre carte a expiré</p>
          <p style="font-size:13px;color:#444;line-height:1.6;margin:0 0 8px;">Votre carte de 10 cours est arrivée à sa date de fin de validité le <strong>${dateLabel}</strong>.</p>
          <p style="font-size:13px;color:#444;line-height:1.6;margin:0 0 8px;">Il vous reste <strong>${restants} cours</strong> non utilisé${restants > 1 ? 's' : ''} sur cette carte.</p>
          <p style="font-size:13px;color:#444;line-height:1.6;margin:0;">Si vous souhaitez continuer à danser, vous pouvez renouveler votre carte sur AssoConnect.</p>
        </div>
        <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 24px;">Pour toute question n'hésitez pas à nous contacter.</p>
        <p style="text-align:center;margin:0 0 16px;"><a href="https://le-regard-se-pose.assoconnect.com" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Renouveler ma carte sur AssoConnect →</a></p>
        <p style="text-align:center;margin:0 0 28px;"><a href="mailto:tangoetvous@gmail.com" style="display:inline-block;background:#fff;color:#555;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.5px;text-decoration:none;border:2px solid #999;">Nous contacter</a></p>
        ${signEleve}
      </div>${footer}`);

    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Tango & Vous', email: adminEmail },
          to: [{ email: String(e.email) }],
          subject: `⏰ Votre carte de 10 cours a expiré — Tango & Vous`,
          htmlContent: htmlEleve,
        }),
      });
      if (r.ok) sent++; else console.error('[cron carte-expiree] Brevo error', e.email, await r.text());
    } catch(err) { console.error('[cron carte-expiree] fetch error', err); }

    // Push FCM élève
    if (env.FIREBASE_SERVICE_ACCOUNT) {
      const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
      getFcmTokensForEmail(String(e.email), _svcKey).then(function(tokens) {
        if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous', body: `⏰ Votre carte de 10 cours a expiré — ${e.restants || 0} cours non utilisés` }).catch(function(){});
      }).catch(function(){});
    }
  }

  return corsResponse({ ok: true, sent, checked: eleves.length, notified: aNotifier.length, date: today }, 200, {}, request);
}

// ================================================================
// Helper : récupère les emails des élèves inscrits dans des groupes
// groupes : ['paris-debutants', 'paris-intermediaires', ...]
// saison  : '2025-2026'
// ================================================================
async function _getEmailsByGroupes(groupes, saison, jwt) {
  const GROUP_MAP = {
    'paris-debutants':          { ville: 'paris',    niveau: 'debutant' },
    'paris-intermediaires':     { ville: 'paris',    niveau: 'intermediaire' },
    'vincennes-debutants':      { ville: 'vincennes', niveau: 'debutant' },
    'vincennes-intermediaires': { ville: 'vincennes', niveau: 'intermediaire' },
  };
  const emailsSet = new Set();
  for (const grp of groupes) {
    const mapping = GROUP_MAP[grp];
    if (!mapping) continue;
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/inscriptions_cours?select=email&ville=eq.${mapping.ville}&niveau=eq.${mapping.niveau}&statut=eq.inscrit&saison=eq.${encodeURIComponent(saison)}`,
        { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${jwt}` } }
      );
      if (r.ok) {
        const rows = await r.json();
        rows.forEach(row => { if (row.email && row.email.trim()) emailsSet.add(row.email.trim().toLowerCase()); });
      }
    } catch(e) { console.error('[getEmailsByGroupes] error', grp, e); }
  }
  return Array.from(emailsSet);
}

// ================================================================
// POST /api/notify/discussion-nouvelle — nouvelle discussion ouverte
// → notif in-app pour chaque élève des groupes + notif panel admin
// JWT admin requis
// ================================================================
async function handleNotifyDiscussionNouvelle(request, jwt, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const { titre, discussionId, groupes, saison, adminNom } = body;
  if (!titre || !saison) return jsonError(400, 'Paramètres manquants');

  const emails = Array.isArray(groupes) && groupes.length > 0
    ? await _getEmailsByGroupes(groupes, saison, jwt)
    : [];

  const notifMsgEleve = `💬 Nouvelle discussion : ${titre}`;
  const notifMsgAdmin = `💬 Discussion créée : "${titre}" · ${emails.length} élève${emails.length !== 1 ? 's' : ''} notifié${emails.length !== 1 ? 's' : ''}`;

  // Notifs in-app élèves (une par email, fire-and-forget)
  const inserts = emails.map(email =>
    fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email, type: 'discussion_nouvelle', message: notifMsgEleve, lu: false }),
    }).catch(e => console.error('[discussion-nouvelle] notif_eleve error', e))
  );

  // Notif panel admin
  const adminInsert = fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ type: 'discussion_nouvelle', message: notifMsgAdmin, lu: false, lien_tab: 'discussions' }),
  }).catch(e => console.error('[discussion-nouvelle] notifications error', e));

  await Promise.all([...inserts, adminInsert]);

  return corsResponse({ ok: true, notified: emails.length }, 200, {}, request);
}

// ================================================================
// POST /api/notify/discussion-message — nouveau message dans discussion
// → notif in-app pour chaque élève des groupes + notif panel admin
// JWT admin requis
// ================================================================
async function handleNotifyDiscussionMessage(request, jwt, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const { discussionId, contenu, groupes, saison, adminNom, titre } = body;
  if (!saison) return jsonError(400, 'Paramètres manquants');

  const emails = Array.isArray(groupes) && groupes.length > 0
    ? await _getEmailsByGroupes(groupes, saison, jwt)
    : [];

  const titreLabel  = titre || 'Discussion';
  const extrait     = contenu ? (contenu.length > 60 ? contenu.slice(0, 60) + '…' : contenu) : '';
  const auteur      = adminNom || 'Florencia & Jérémy';
  const notifMsgEleve = `💬 ${auteur} : ${extrait || titreLabel}`;
  const notifMsgAdmin = `💬 Message envoyé dans "${titreLabel}" · ${emails.length} élève${emails.length !== 1 ? 's' : ''} notifié${emails.length !== 1 ? 's' : ''}`;

  const inserts = emails.map(email =>
    fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email, type: 'discussion_message', message: notifMsgEleve, lu: false }),
    }).catch(e => console.error('[discussion-message] notif_eleve error', e))
  );

  const adminInsert = fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ type: 'discussion_message', message: notifMsgAdmin, lu: false, lien_tab: 'discussions' }),
  }).catch(e => console.error('[discussion-message] notifications error', e));

  await Promise.all([...inserts, adminInsert]);

  return corsResponse({ ok: true, notified: emails.length }, 200, {}, request);
}

// ================================================================
// POST /api/cron/relance-cb3x
// Rappels 2ème (J+2 mois) et 3ème (J+4 mois) échéance paiement CB 3×
// Flag anti-doublon : donnees.relance_cb3x_2_sent / relance_cb3x_3_sent
// ================================================================
async function handleCronRelanceCb3x(request, env) {
  const today  = new Date().toISOString().slice(0, 10);
  const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;

  function addMonths(isoDate, months) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }
  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }
  function coursLabel(ville, niveau) {
    return (ville === 'paris' ? 'Paris' : 'Vincennes') + ' ' +
           (niveau === 'debutant' ? 'Débutants' : 'Intermédiaires');
  }

  // Lien AssoConnect depuis Supabase params (fallback : page principale)
  const lienAssoConnect = 'https://app.assoconnect.com/login';

  // Inscriptions CB 3× actives
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inscriptions_cours?paiement=eq.cb3x&statut=eq.inscrit&select=id,prenom,nom,email,ville,niveau,donnees`,
    { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
  );
  if (!res.ok) {
    console.error('[cron relance-cb3x] Supabase error', await res.text());
    return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  }
  const inscriptions = await res.json();

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  function buildHtml(prenomAff, cours, dateEcheance, ordinal, isLast) {
    const prelLabel = isLast ? (ordinal + ' sur 3 — dernier') : (ordinal + ' sur 3');
    const noteFinale = isLast ? ' Il s’agit du <strong>dernier pr\xe9l\xe8vement</strong> — votre inscription sera enti\xe8rement r\xe9gl\xe9e.' : '';
    return wrap(`${headerEleve}
      <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;">
        <span style="font-size:14px;font-weight:700;color:#1565c0;">💳 Rappel — ${ordinal} échéance de paiement CB</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 20px;">Votre inscription aux cours de tango <strong>${cours}</strong> a été réglée en 3 fois par CB. Le <strong>${ordinal} prélèvement</strong> (sur 3) va prochainement être effectué sur votre carte bancaire.</p>
        <div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">VOTRE PAIEMENT CB 3×</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:5px 0;color:#555;">Cours</td><td style="padding:5px 0;font-weight:700;color:#222;text-align:right;">${cours}</td></tr>
            <tr><td style="padding:5px 0;color:#555;">Prélèvement</td><td style="padding:5px 0;font-weight:700;color:#222;text-align:right;">${prelLabel}</td></tr>
            <tr><td style="padding:5px 0;color:#555;">Date du prélèvement</td><td style="padding:5px 0;font-weight:700;color:#1565c0;text-align:right;">${fmtDate(dateEcheance)}</td></tr>
          </table>
        </div>
        <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px 20px;margin:0 0 22px;">
          <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 8px;">✓ Vérifiez votre carte bancaire</p>
          <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 10px;">Assurez-vous que votre carte bancaire n'est pas expirée ou opposée avant la date du prélèvement. Si vous avez changé de carte ou souhaitez modifier votre moyen de paiement, rendez-vous sur AssoConnect.</p>
          <p style="font-size:12px;color:#888;margin:0;">Si votre carte est toujours valide, aucune action n'est nécessaire — le prélèvement se fera automatiquement.${noteFinale}</p>
        </div>
        <p style="text-align:center;margin:0 0 14px;"><a href="${lienAssoConnect}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Mettre à jour mon moyen de paiement →</a></p>
        <p style="font-size:13px;color:#888;text-align:center;margin:0 0 22px;">Une question ? <a href="mailto:tangoetvous@gmail.com" style="color:#D4AF37;">tangoetvous@gmail.com</a> · 07 73 27 59 06</p>
        ${signEleve}
      </div>${footer}`);
  }

  async function sendBrevo(toEmail, subject, html) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Tango & Vous', email: adminEmail },
        to: [{ email: String(toEmail) }],
        subject, htmlContent: html,
      }),
    });
    if (!r.ok) console.error('[relance-cb3x] Brevo error', toEmail, await r.text());
    return r.ok;
  }

  async function saveDonnees(id, donnees) {
    await fetch(`${SUPABASE_URL}/rest/v1/inscriptions_cours?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ donnees }),
    });
  }

  let sent2 = 0, sent3 = 0;

  for (const ins of inscriptions) {
    if (!ins.email) continue;
    let donnees = (typeof ins.donnees === 'object' && ins.donnees !== null) ? ins.donnees
                : (typeof ins.donnees === 'string'
                    ? (() => { try { return JSON.parse(ins.donnees); } catch(e) { return {}; } })()
                    : {});
    const dateP = donnees.datePremierPaiement;
    if (!dateP) continue;

    const cours     = coursLabel(ins.ville, ins.niveau);
    const prenomAff = _esc(ins.prenom || '');

    // ── 2ème échéance : 2 mois après le 1er paiement ─────────────
    const date2 = addMonths(dateP, 2);
    if (today >= date2 && !donnees.relance_cb3x_2_sent) {
      const html = buildHtml(prenomAff, cours, date2, '2\xe8me', false);
      let ok = !env.BREVO_API_KEY;
      if (env.BREVO_API_KEY) ok = await sendBrevo(ins.email, `💳 Rappel — 2ème prélèvement CB · Cours de tango ${cours}`, html);
      if (ok) {
        sent2++;
        donnees = { ...donnees, relance_cb3x_2_sent: true, relance_cb3x_2_date: today };
        await saveDonnees(ins.id, donnees);
      }
    }

    // ── 3ème échéance : 4 mois après le 1er paiement ─────────────
    const date3 = addMonths(dateP, 4);
    if (today >= date3 && !donnees.relance_cb3x_3_sent) {
      const html = buildHtml(prenomAff, cours, date3, '3\xe8me', true);
      let ok = !env.BREVO_API_KEY;
      if (env.BREVO_API_KEY) ok = await sendBrevo(ins.email, `💳 Rappel — 3ème prélèvement CB · Cours de tango ${cours}`, html);
      if (ok) {
        sent3++;
        donnees = { ...donnees, relance_cb3x_3_sent: true, relance_cb3x_3_date: today };
        await saveDonnees(ins.id, donnees);
      }
    }
  }

  return corsResponse({ ok: true, checked: inscriptions.length, sent2, sent3, date: today }, 200, {}, request);
}


// ================================================================
// PUSH FCM — infrastructure complète
// ================================================================

// ── Enregistrement token FCM ─────────────────────────────────────
async function handleRegisterToken(request, jwt, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  const { token, platform = 'web', userAgent = '' } = body;
  if (!token) return jsonError(400, 'Token requis');

  // Extraire l'email depuis le JWT (payload base64 non vérifié — confiance accordée car JWT validé par Supabase en amont)
  let email;
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    email = payload.email;
  } catch { return jsonError(400, 'JWT invalide'); }
  if (!email) return jsonError(400, 'Email introuvable dans le JWT');

  const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/fcm_tokens?on_conflict=token`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${svcKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ email, token, platform, user_agent: userAgent.slice(0, 300), updated_at: new Date().toISOString() }),
    }
  );
  if (!r.ok) {
    const err = await r.text();
    console.error('[register-token] Supabase error:', err);
    return jsonError(500, 'Erreur enregistrement token');
  }
  return corsResponse({ ok: true });
}

// ── OAuth2 access token depuis service account Firebase ──────────
async function _getFcmAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  function _b64url(obj) {
    return btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  const header  = _b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = _b64url({
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  });

  const sigInput = `${header}.${payload}`;

  // Importer la clé RSA privée du service account
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\n/g, '');
  const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwtStr = `${sigInput}.${sigB64}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwtStr}`,
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) throw new Error("Impossible d'obtenir un access token FCM: " + JSON.stringify(tokenData));
  return { accessToken: tokenData.access_token, projectId: sa.project_id };
}

// ── Envoyer une notification push via FCM v1 ─────────────────────
// tokens  : string[] — tokens FCM
// notif   : { title, body, link? }
// data    : { key: string } — payload additionnel (toutes valeurs en string)
async function sendFcmPush(env, tokens, notif, data = {}) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) { console.log('[FCM] FIREBASE_SERVICE_ACCOUNT absent — skip push'); return { skipped: true }; }
  if (!tokens || !tokens.length) return { skipped: true, reason: 'no_tokens' };

  let accessToken, projectId;
  try {
    ({ accessToken, projectId } = await _getFcmAccessToken(env.FIREBASE_SERVICE_ACCOUNT));
  } catch (e) {
    console.error('[FCM] Erreur access token:', e.message);
    return { ok: false, error: e.message };
  }

  const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
  const results = [];
  for (const token of tokens) {
    const message = {
      message: {
        token,
        notification: { title: notif.title || 'Tango & Vous', body: notif.body || '' },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        webpush: {
          notification: { icon: '/icon-192.png', badge: '/icon-192.png' },
          fcm_options:  { link: notif.link || 'https://app.tangoetvous.fr/' },
        },
      },
    };

    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(message),
    });
    const result = await r.json();
    results.push({ token: token.slice(-8), ok: r.ok });

    // Nettoyer les tokens invalides automatiquement
    if (!r.ok && (result.error?.status === 'NOT_FOUND' || result.error?.status === 'UNREGISTERED')) {
      fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens?token=eq.${encodeURIComponent(token)}`, {
        method:  'DELETE',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${svcKey}` },
      }).catch(() => {});
    }
  }
  return { ok: true, results };
}

// ── Récupérer les tokens FCM d'un email ─────────────────────────
async function getFcmTokensForEmail(email, svcKey) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/fcm_tokens?email=eq.${encodeURIComponent(email)}&select=token`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows.map(x => x.token).filter(Boolean) : [];
  } catch { return []; }
}

// ── Récupérer tous les tokens admin ─────────────────────────────
// Retourne les tokens des comptes is_admin() (vérifié via le rôle dans la table eleves)
async function getFcmTokensAdmin(svcKey) {
  try {
    // Récupérer les emails admin depuis la table eleves
    const rEleves = await fetch(
      `${SUPABASE_URL}/rest/v1/eleves?role=eq.admin&select=email`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (!rEleves.ok) return [];
    const admins = await rEleves.json();
    if (!admins.length) return [];

    const emails = admins.map(a => a.email).filter(Boolean);
    const inFilter = emails.map(e => `"${e}"`).join(',');
    const rTokens = await fetch(
      `${SUPABASE_URL}/rest/v1/fcm_tokens?email=in.(${inFilter})&select=token`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (!rTokens.ok) return [];
    const rows = await rTokens.json();
    return Array.isArray(rows) ? rows.map(x => x.token).filter(Boolean) : [];
  } catch { return []; }
}

// ================================================================
// POST /api/notify/inscription-essai — formulaire cours-essai.html
// E0 (admin) + E1/E2/E5/E6 (élève) — sans auth
// ================================================================
async function handleNotifyInscriptionEssai(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  if (!env.BREVO_API_KEY) return corsResponse({ ok: true, sent: 0, skipped: true }, 200, {}, request);

  const { prenom, nom, email, tel, role, ville, niveau, dateIso, statut, enCouple,
          partPrenom, partNom, partEmail, partRole, gratuit } = body;

  const MOIS_L = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const JOURS_C = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtDateCourt(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_C[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()].slice(0,3) + '.';
  }
  const villeLabel = v => v === 'vincennes' ? 'Vincennes' : 'Paris';
  const nivLabel   = n => n === 'intermediaire' ? 'Intermédiaire' : 'Débutant';
  const roleLabel  = r => r === 'guidee' ? 'Guidée' : r === 'double' ? 'Double rôle' : 'Guideur·se';
  const roleBadgeCol = r => r === 'guidee' ? '#c2185b' : r === 'double' ? '#6a1b9a' : '#1565c0';
  const adminEmail = 'tangoetvous@gmail.com';
  let sent = 0;

  async function sendBrevo(to, subj, html) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(to) }], subject: subj, htmlContent: html }),
      });
      if (r.ok) sent++; else console.error('[inscription-essai] Brevo error', to, await r.text());
    } catch(e) { console.error('[inscription-essai] fetch error', e); }
  }

  const dt = new Date(dateIso + 'T12:00:00');
  const y = dt.getFullYear(), mo = dt.getMonth() + 1;
  const sai = mo >= 9 ? `${y}-${y+1}` : `${y-1}-${y}`;

  let villeParams = {};
  try {
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/parametres?cle=eq.tev_params_${ville}_${sai}&select=valeur`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` }
    });
    if (pr.ok) {
      const rows = await pr.json();
      if (rows[0]?.valeur) villeParams = typeof rows[0].valeur === 'string' ? JSON.parse(rows[0].valeur) : rows[0].valeur;
    }
  } catch {}
  const adresse = villeParams.adresse || {};
  const horaires = villeParams.horaires || {};
  const livret = villeParams.livret || {};
  const livretUrl = niveau === 'intermediaire' ? (livret.url_int || '') : (livret.url_deb || '');
  const livretLabel = nivLabel(niveau) + ' ' + villeLabel(ville);

  function getHoraire() {
    const h = horaires[niveau] || horaires.debutant || {};
    if (h.jour && h.debut && h.fin) return `${h.jour} ${h.debut}–${h.fin}`;
    if (h.debut && h.fin) return `${h.debut}–${h.fin}`;
    return '';
  }

  const secret = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
  let inscId = null;
  try {
    const ir = await fetch(
      `${SUPABASE_URL}/rest/v1/inscriptions_essai?prenom=eq.${encodeURIComponent(prenom)}&nom=eq.${encodeURIComponent(nom)}&date_essai=eq.${dateIso}&type=eq.tango&select=id&order=id.desc&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
    );
    if (ir.ok) { const rows = await ir.json(); if (rows[0]) inscId = rows[0].id; }
  } catch {}

  const APP_URL = 'https://app.tangoetvous.fr';
  let confirmUrl = `mailto:${adminEmail}`;
  let annulerUrl = `mailto:${adminEmail}?subject=${encodeURIComponent('Annulation essai tango ' + prenom + ' ' + nom)}`;
  if (inscId) {
    const tk = (await _calHmac(`${inscId}:${(email || '').toLowerCase()}`, secret)).slice(0, 32);
    confirmUrl = `${APP_URL}/api/essai/confirmer?id=${inscId}&token=${tk}`;
    annulerUrl = `${APP_URL}/api/essai/annuler?id=${inscId}&token=${tk}`;
  }

  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footerEleve = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:${adminEmail}" style="color:#888;text-decoration:none;">${adminEmail}</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const signWait  = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">Nous reviendrons vers vous très prochainement.<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap = (inner, pre) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">${pre ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${pre}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ''}<div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;

  const coursDateAff  = fmtDate(dateIso);
  const coursVilleAff = `${villeLabel(ville)} — ${nivLabel(niveau)}`;
  const horaire       = getHoraire();
  const lieuNom = adresse.nom || '';
  const lieuRue = adresse.rue || '';
  const lieuNote = adresse.note || '';
  const lieuTransport = adresse.transport || adresse.metro || '';
  const lieuGps = adresse.gps || '';
  const daysUntil = Math.floor((dt - new Date()) / 86400000);
  const isClose = daysUntil <= 7;
  const isConfirme = statut === 'confirme';
  const dayName = JOURS_L[dt.getDay()].toLowerCase();

  function lieuCell(withMaps) {
    let inner = lieuNom ? `<strong style="color:#111;font-weight:700;">${_esc(lieuNom)}</strong>` : '';
    const parts = [];
    if (lieuRue) parts.push(_esc(lieuRue));
    if (lieuNote) parts.push(`<em style="color:#666;">${_esc(lieuNote)}</em>`);
    if (lieuTransport) parts.push(_esc(lieuTransport));
    if (parts.length) inner += `<br/><span style="font-size:13px;font-weight:400;color:#444;">${parts.join('<br/>')}</span>`;
    if (withMaps && lieuGps) inner += `<br/><a href="https://maps.google.com/?q=${_esc(lieuGps)}" style="color:#1565c0;font-size:12px;">🗺 Voir sur Google Maps</a>`;
    return `<td style="color:#111;font-weight:700;">${inner}</td>`;
  }

  function coursBox(withMaps, duoAvecPrenom, personRole) {
    const tarif = duoAvecPrenom ? '30 € pour le duo' : (gratuit ? 'Gratuit' : '15 €');
    const tarifStyle = (gratuit && !duoAvecPrenom) ? 'color:#2e7d32;font-weight:700;' : 'color:#111;font-weight:700;';
    return `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">Votre cours d'essai</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:7px 0;color:#555;width:35%;vertical-align:top;">📅 Date</td><td style="color:#111;font-weight:700;">${_esc(coursDateAff)}</td></tr>
        ${horaire ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🕐 Heure</td><td style="color:#111;font-weight:700;">${_esc(horaire)}</td></tr>` : ''}
        <tr><td style="padding:7px 0;color:#555;vertical-align:top;">📍 Lieu</td>${lieuCell(withMaps)}</tr>
        <tr><td style="padding:7px 0;color:#555;vertical-align:top;">🎓 Cours</td><td style="color:#111;font-weight:700;">${_esc(coursVilleAff)}</td></tr>
        <tr><td style="padding:7px 0;color:#555;vertical-align:top;">🎯 Votre rôle</td><td><span style="background:${roleBadgeCol(personRole)};color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;display:inline-block;">${_esc(roleLabel(personRole))}</span></td></tr>
        ${duoAvecPrenom ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">👫 Duo avec</td><td style="color:#111;font-weight:700;">${_esc(duoAvecPrenom)}</td></tr>` : ''}
        <tr><td style="padding:7px 0;color:#555;">💶 Tarif</td><td style="${tarifStyle}">${_esc(tarif)}</td></tr>
      </table>
    </div>`;
  }

  const checklistDeb = niveau !== 'intermediaire' ? `<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:18px 20px;margin:0 0 22px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8962E;font-weight:700;margin-bottom:12px;">Pour votre cours d'essai</div><div style="font-size:14px;color:#444;line-height:2.1;">✓ <strong>Arrivez 5 minutes en avance</strong> — pour vous changer et commencer détendu·e.<br/>✓ <strong>Chaussures à semelles lisses</strong> — cuir ou daim, ou des chaussettes pour un premier cours.<br/>✓ <strong>Ne vous préoccupez pas de votre tenue</strong> — venez avec les vêtements que vous portez pendant la journée.</div></div>` : '';

  // ─── E0 admin ───
  const nameAff = _esc(`${prenom} ${nom}`.trim());
  const situationAff = (enCouple && partPrenom) ? 'En couple' : 'Seul·e';
  const delaiAff = daysUntil <= 0 ? "Aujourd'hui" : daysUntil === 1 ? '1 jour' : isClose ? `${daysUntil} jours — rappel immédiat` : `${daysUntil} jours → rappel J-7 prévu`;
  const gratuitAff = gratuit ? 'Oui — Gratuit' : ((enCouple && partPrenom) ? 'Non — 30 €' : 'Non — 15 €');
  const emailCodeAff = isConfirme
    ? (isClose ? 'E7 (confirmation ≤7 jours)' : 'E1 (confirmation >7 jours)')
    : ((enCouple && partPrenom) ? 'E6 (couple, liste d\'attente)' : (role === 'guidee' ? 'E2 (liste d\'attente parité)' : 'E5 (cours complet guideurs)'));

  const isWaitlist = !isConfirme;
  const encBorderCol = isWaitlist ? '#e65100' : '#D4AF37';
  const encHeaderBg  = isWaitlist ? '#e65100' : '#D4AF37';
  const encNameCol   = isWaitlist ? '#fff' : '#111';
  const encEmailCol  = isWaitlist ? '#ffe0cc' : '#333';
  const encInnerBg   = isWaitlist ? '#fff8f5' : '#fffdf8';

  const adminEncadre = `<div style="border:2px solid ${encBorderCol};border-radius:8px;overflow:hidden;margin-bottom:20px;">
    <div style="background:${encHeaderBg};padding:10px 16px;display:flex;align-items:center;gap:12px;">
      <div style="flex:1;"><div style="font-size:18px;font-weight:700;color:${encNameCol};">${nameAff}</div>
      <div style="font-size:12px;color:${encEmailCol};margin-top:2px;">${_esc(email || '')}${tel ? ' &nbsp;·&nbsp; ' + _esc(tel) : ''}</div></div>
      <span style="background:${roleBadgeCol(role)};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${roleLabel(role)}</span>
    </div>
    <div style="background:${encInnerBg};padding:14px 16px;">
      <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px;">📍 ${_esc(coursVilleAff)}</div>
      <div style="font-size:13px;color:#333;">${_esc(coursDateAff)}${horaire ? ' &nbsp;·&nbsp; ' + _esc(horaire) : ''}</div>
      ${lieuNom ? `<div style="font-size:12px;color:#666;margin-top:2px;">${_esc(lieuNom)}${lieuRue ? ' — ' + _esc(lieuRue) : ''}</div>` : ''}
      ${(enCouple && partPrenom) ? `<div style="font-size:13px;color:#555;margin-top:6px;">Partenaire : ${_esc(partPrenom || '')} ${_esc(partNom || '')}${partEmail ? ' &lt;' + _esc(partEmail) + '&gt;' : ''} (${roleLabel(partRole || '')})</div>` : ''}
    </div>
  </div>`;

  const statusRowBg = isWaitlist ? '#fff3e0' : '#f5f5f5';
  const statusRowBorder = isWaitlist ? 'border:1px solid #ffe0b2;' : '';
  const statutBadge = isConfirme
    ? `<span style="background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✓ Validé·e</span>`
    : `<span style="background:#e65100;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">⏳ En attente</span>`;

  const adminStatusRow = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:10px 14px;background:${statusRowBg};${statusRowBorder}border-radius:6px;">${statutBadge}<span style="font-size:12px;color:#555;">Email envoyé : <strong>${_esc(emailCodeAff)}</strong></span></div>`;

  const adminTable = isConfirme ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
    <tr style="border-bottom:1px solid #eee;"><td style="padding:8px 6px;color:#888;width:36%;">Situation</td><td style="padding:8px 6px;color:#222;font-weight:600;">${_esc(situationAff)}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:8px 6px;color:#888;">Délai avant cours</td><td style="padding:8px 6px;color:#222;font-weight:600;">${_esc(delaiAff)}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:8px 6px;color:#888;">Gratuit ?</td><td style="padding:8px 6px;color:#222;font-weight:600;">${_esc(gratuitAff)}</td></tr>
    <tr><td style="padding:8px 6px;color:#888;">Remarque</td><td style="padding:8px 6px;color:#777;font-style:italic;">—</td></tr>
  </table>` : '';

  const adminBtns = `<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
    ${tel ? `<a href="tel:${_esc(tel)}" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">📞 Appeler</a>` : ''}
    <a href="https://mail.google.com/mail/?view=cm&amp;to=${encodeURIComponent(email || '')}" style="display:inline-block;background:#111;color:#D4AF37;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">✉️ Email Gmail</a>
    ${tel ? `<a href="sms:${_esc(tel)}" style="display:inline-block;background:#2e7d32;color:#fff;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">💬 SMS</a>` : ''}
    ${isConfirme ? `<a href="${APP_URL}/admin.html" style="display:inline-block;background:#f5f5f5;color:#333;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:1px solid #ddd;">Ouvrir l'admin →</a>` : ''}
  </div>`;

  const adminFooter = `<div style="background:#f5f5f5;padding:10px 24px;text-align:center;font-size:10px;color:#999;border-top:1px solid #eee;">Tango &amp; Vous · ${adminEmail} · 07 73 27 59 06</div>`;
  const adminHeader = `<div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;"><div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Nouvelle inscription cours d'essai</div></div>`;
  const e0Subj = `[Essai tango] ${prenom} ${nom} — ${coursVilleAff} · ${fmtDateCourt(dateIso)} · ${roleLabel(role)} — ${isConfirme ? 'validé·e' : 'en attente'}`;
  const adminHtml = wrap(`${adminHeader}<div style="padding:24px;">${adminEncadre}${adminStatusRow}${adminTable}${adminBtns}</div>${adminFooter}`);
  await sendBrevo(adminEmail, e0Subj, adminHtml);

  // ─── Emails élèves ───
  const targets = [{ to: email, pren: prenom, r: role, duoAvec: (enCouple && partPrenom) ? (partPrenom || '') : null }];
  if (enCouple && partEmail && partEmail.toLowerCase() !== (email || '').toLowerCase()) {
    targets.push({ to: partEmail, pren: partPrenom || '', r: partRole || role, duoAvec: prenom || '' });
  }

  for (const tgt of targets) {
    const { to, pren, r, duoAvec } = tgt;
    if (!to) continue;

    if (isConfirme) {
      if (isClose) {
        // E7 — blue banner, confirm button first, empêchement box, livret, checklist
        const daysText = daysUntil <= 0 ? "aujourd'hui" : daysUntil === 1 ? 'demain' : `dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}`;
        const banner7 = `<div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">🗓 Votre cours d'essai a lieu ${_esc(daysText)}</span></div>`;
        const sign7 = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À ${_esc(dayName)} !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
        const introText = daysUntil <= 0 ? "Votre cours d'essai a lieu <strong>ce soir</strong> ! Merci de confirmer votre présence avec le bouton ci-dessous." : `Votre cours d'essai a lieu <strong>${dayName} soir</strong> ! Merci de confirmer votre présence avec le bouton ci-dessous.`;
        const body7 = `<div style="padding:30px 28px;">
          <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${_esc(pren)}</strong>,</p>
          <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">${introText}</p>
          ${coursBox(true, null, r)}
          <div style="text-align:center;margin:0 0 16px;">
            <a href="${confirmUrl}" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:1px;text-decoration:none;">👍 Je confirme ma présence</a>
          </div>
          <div style="border:1px solid #eee;border-radius:8px;padding:14px 20px;margin:0 0 22px;text-align:center;">
            <p style="font-size:12px;color:#888;margin:0 0 12px;">Empêchement de dernière minute ?</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <a href="${annulerUrl}" style="display:inline-block;background:#fff;color:#c62828;padding:9px 18px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:2px solid #c62828;">✕ Annuler</a>
              <a href="#URL_FORMULAIRE_A_RENSEIGNER" style="display:inline-block;background:#fff;color:#555;padding:9px 18px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:2px solid #999;">↩ Reporter à une autre date</a>
            </div>
          </div>
          ${livretUrl ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_esc(livretUrl)}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">📖 Télécharger le livret ${_esc(livretLabel)}</a></div>` : ''}
          ${checklistDeb}
          ${sign7}
        </div>`;
        await sendBrevo(to, `Votre cours d'essai tango a lieu ${dayName} — confirmez votre présence`, wrap(`${headerEleve}${banner7}${body7}${footerEleve}`, `${_esc(pren)}, votre cours d'essai a lieu ${dayName} — confirmez`));
      } else {
        // E1 — green banner, livret, checklist, reminder+annuler/reporter
        const intro1 = niveau === 'intermediaire'
          ? `Nous avons bien reçu votre inscription et nous avons hâte de vous accueillir. Voici tous les détails pour votre soirée.`
          : `Nous avons bien reçu votre inscription et nous avons hâte de vous accueillir pour votre premier cours de tango argentin. Voici tous les détails pour préparer votre soirée.`;
        const banner1 = `<div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre cours d'essai est confirmé !</span></div>`;
        const body1 = `<div style="padding:30px 28px;">
          <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${_esc(pren)}</strong>,</p>
          <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">${intro1}</p>
          ${coursBox(true, null, r)}
          ${livretUrl ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_esc(livretUrl)}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">📖 Télécharger le livret ${_esc(livretLabel)}</a></div>` : ''}
          ${checklistDeb}
          <div style="border:1px solid #eee;border-radius:8px;padding:16px 20px;margin:0 0 22px;text-align:center;">
            <p style="font-size:13px;color:#666;margin:0 0 14px;">Vous recevrez un rappel 7 jours avant le cours.</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <a href="${annulerUrl}" style="display:inline-block;background:#fff;color:#c62828;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:2px solid #c62828;">✕ Annuler mon cours d'essai</a>
              <a href="#URL_FORMULAIRE_A_RENSEIGNER" style="display:inline-block;background:#fff;color:#555;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:2px solid #999;">↩ Reporter à une autre date</a>
            </div>
          </div>
          ${signEleve}
        </div>`;
        const dateCourt2 = dt.getDate() + ' ' + MOIS_L[dt.getMonth()];
        await sendBrevo(to, `Votre cours d'essai tango est confirmé — ${dayName} ${dateCourt2} à ${villeLabel(ville)}`, wrap(`${headerEleve}${banner1}${body1}${footerEleve}`, `${_esc(pren)}, votre cours d'essai est confirmé — ${_esc(coursDateAff)}`));
      }
    } else {
      // Waitlist
      const bannerWait = `<div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;"><span style="font-size:14px;font-weight:700;color:#e65100;">⏳ Demande enregistrée — liste d'attente</span></div>`;

      if (enCouple && partPrenom) {
        // E6 — couple both waitlisted
        const body6 = `<div style="padding:30px 28px;">
          <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${_esc(pren)}</strong>,</p>
          <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Votre demande de cours d'essai en duo avec <strong>${_esc(duoAvec || '')}</strong> est bien enregistrée. Vous êtes pour l'instant en liste d'attente car ce cours d'essai est complet pour l'un des deux rôles.</p>
          ${coursBox(false, duoAvec || '', r)}
          <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
            <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">Ce créneau est complet pour l'un des deux rôles</p>
            <p style="font-size:14px;color:#444;line-height:1.7;margin:0;">Pour vous accueillir ensemble dans les meilleures conditions, vous êtes tous les deux placés en liste d'attente. Nous vous confirmons vos places dès qu'elles se libèrent — ou si vous n'avez pas de nouvelles de notre part dans les jours qui viennent, n'hésitez pas à reporter votre cours d'essai à une autre date ou à vous inscrire pour un cours à <strong>Vincennes</strong>.</p>
          </div>
          <div style="text-align:center;margin:0 0 22px;">
            <a href="#URL_FORMULAIRE_A_RENSEIGNER" style="display:inline-block;background:#fff;color:#555;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #999;">↩ Reporter mon cours d'essai à une autre date</a>
          </div>
          <div style="text-align:center;margin:0 0 22px;">
            <a href="mailto:${adminEmail}" style="display:inline-block;background:#fff;color:#B8962E;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #D4AF37;">Nous contacter</a>
          </div>
          ${signWait}
        </div>`;
        await sendBrevo(to, `Votre demande de cours d'essai tango en duo est bien reçue — liste d'attente`, wrap(`${headerEleve}${bannerWait}${body6}${footerEleve}`, `${_esc(pren)}, votre demande en duo est bien enregistrée — ${_esc(coursDateAff)}`));

      } else if (r === 'guidee') {
        // E2 — guidée seule
        const body2 = `<div style="padding:30px 28px;">
          <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${_esc(pren)}</strong>,</p>
          <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Votre demande de cours d'essai est bien enregistrée. Vous êtes pour l'instant en liste d'attente pour une question de parité guideur.se.s/guidé.e.s.</p>
          ${coursBox(false, null, r)}
          <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
            <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">Pourquoi une liste d'attente ?</p>
            <p style="font-size:14px;color:#444;line-height:1.7;margin:0;">Dans le tango, nous veillons à accueillir autant de guideurs que de guidées pour que chacun·e progresse dans les meilleures conditions. Vous êtes inscrite en liste d'attente — nous vous confirmons votre place dès qu'un guideur s'inscrit pour la même date. (Ce qui ne signifie pas que ce sera votre partenaire pour l'année puisque nous faisons en sorte de changer régulièrement de partenaires pendant les cours.)</p>
          </div>
          <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Les listes bougent vite ! Nous vous contactons dans les meilleurs délais.</p>
          <div style="text-align:center;margin:0 0 22px;">
            <a href="mailto:${adminEmail}" style="display:inline-block;background:#fff;color:#B8962E;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #D4AF37;">Nous contacter</a>
          </div>
          ${signWait}
        </div>`;
        await sendBrevo(to, `Votre demande de cours d'essai tango est bien reçue — liste d'attente`, wrap(`${headerEleve}${bannerWait}${body2}${footerEleve}`, `${_esc(pren)}, votre demande est bien enregistrée — ${_esc(coursDateAff)}`));

      } else {
        // E5 — guideur quota plein
        const body5 = `<div style="padding:30px 28px;">
          <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${_esc(pren)}</strong>,</p>
          <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Votre demande de cours d'essai est bien enregistrée. Vous êtes pour l'instant en liste d'attente pour une question de parité guideur.se.s/guidé.e.s.</p>
          ${coursBox(false, null, r)}
          <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
            <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">Ce créneau est complet pour votre rôle ce jour-là</p>
            <p style="font-size:14px;color:#444;line-height:1.7;margin:0;">Le nombre de guideur·se·s pour ce cours est atteint pour le moment. Vous êtes placé·e en liste d'attente — nous vous confirmons une place dès qu'elle se libère. Si vous n'avez pas de nouvelles de notre part dans les jours qui viennent, n'hésitez pas à reporter votre cours d'essai à une autre date ou à vous inscrire pour un cours à <strong>Vincennes</strong>.</p>
          </div>
          <div style="text-align:center;margin:0 0 22px;">
            <a href="#URL_FORMULAIRE_A_RENSEIGNER" style="display:inline-block;background:#fff;color:#555;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #999;">↩ Reporter mon cours d'essai à une autre date</a>
          </div>
          <div style="text-align:center;margin:0 0 22px;">
            <a href="mailto:${adminEmail}" style="display:inline-block;background:#fff;color:#B8962E;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #D4AF37;">Nous contacter</a>
          </div>
          ${signWait}
        </div>`;
        await sendBrevo(to, `Votre demande de cours d'essai tango est bien reçue — liste d'attente`, wrap(`${headerEleve}${bannerWait}${body5}${footerEleve}`, `${_esc(pren)}, votre demande est bien enregistrée — ${_esc(coursDateAff)}`));
      }
    }
  }

  return corsResponse({ ok: true, sent }, 200, {}, request);
}

// ================================================================
// PATCH /api/essai/confirmer — élève confirme présence via email
// PATCH /api/essai/annuler  — élève annule son essai via email
// ================================================================
async function handleEssaiConfirmerAnnuler(request, url, action, env) {
  const id    = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  if (!id || !token) return new Response('Lien invalide', { status: 400, headers: { 'Content-Type': 'text/html;charset=utf-8' } });

  const ir = await fetch(
    `${SUPABASE_URL}/rest/v1/inscriptions_essai?id=eq.${encodeURIComponent(id)}&type=eq.tango&select=id,prenom,nom,email,statut,date_essai,ville,niveau`,
    { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
  );
  if (!ir.ok) return new Response('Erreur serveur', { status: 500 });
  const rows = await ir.json();
  if (!rows.length) return new Response('Inscription introuvable', { status: 404 });
  const ins = rows[0];

  const secret   = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
  const expected = (await _calHmac(`${id}:${(ins.email || '').toLowerCase()}`, secret)).slice(0, 32);
  if (token !== expected) return new Response('Lien invalide ou expiré', { status: 403, headers: { 'Content-Type': 'text/html;charset=utf-8' } });

  const MOIS_L = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const d = new Date(ins.date_essai + 'T12:00:00');
  const coursDate = JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()];
  const villeAff  = ins.ville === 'vincennes' ? 'Vincennes' : 'Paris';
  const nivAff    = ins.niveau === 'intermediaire' ? 'Intermédiaire' : 'Débutant';
  const htmlPage  = (icon, titre, couleur, msg) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title></head><body style="margin:0;padding:40px 20px;background:#f5f5f5;font-family:Arial,sans-serif;text-align:center;"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 10px rgba(0,0,0,.1)"><div style="font-size:48px;margin-bottom:16px;">${icon}</div><h2 style="color:${couleur};margin:0 0 12px;">${titre}</h2><p style="color:#555;margin:0 0 20px;">${msg}</p><p style="margin-top:24px;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;font-weight:700;text-decoration:none;">www.tangoetvous.com</a></p></div></body></html>`;

  if (action === 'confirmer') {
    await fetch(`${SUPABASE_URL}/rest/v1/inscriptions_essai?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ presence_confirmee: true })
    });
    return new Response(
      htmlPage('👍', 'Présence confirmée !', '#2e7d32', `Votre présence au cours d'essai tango du <strong>${coursDate}</strong> (${villeAff} — ${nivAff}) est bien confirmée.`),
      { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  } else {
    if (ins.statut === 'annulé') {
      return new Response(htmlPage('ℹ️', 'Déjà annulé', '#e65100', `Cette inscription était déjà annulée.`),
        { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/inscriptions_essai?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ statut: 'annulé' })
    });
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ type: 'essai_annule', message: `✕ Annulation essai — ${ins.prenom} ${ins.nom} · ${villeAff} ${nivAff} · ${coursDate}`, lu: false, lien_tab: 'essai' })
      });
    } catch {}
    return new Response(
      htmlPage('✕', 'Inscription annulée', '#c62828', `Votre cours d'essai tango du <strong>${coursDate}</strong> (${villeAff} — ${nivAff}) a bien été annulé. Si vous souhaitez vous inscrire à une autre date, revenez sur le formulaire.`),
      { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
}

// ================================================================
// POST /api/notify/inscription-cours — formulaire inscription-cours.html
// I0 (admin) + I01-att / I01-val / I01-couple / I01-vinc (élève) — sans auth
// ================================================================
async function handleNotifyInscriptionCours(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  if (!env.BREVO_API_KEY) return corsResponse({ ok: true, sent: 0, skipped: true }, 200, {}, request);

  const { prenom, nom, email, tel, role, saison, c1, c2, nbCours,
          venue, role2, venue2, pPrenom, pNom, pEmail, pTel, pRole,
          p2Prenom, p2Nom, p2Email, samePartner, isWaitlist } = body;

  const MOIS_L = ['janvier','f\xe9vrier','mars','avril','mai','juin','juillet','ao\xfbt','septembre','octobre','novembre','d\xe9cembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDateLong(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }
  const villeLabel   = v => v === 'vincennes' ? 'Vincennes' : 'Paris';
  const nivLabel     = n => n === 'intermediaire' ? 'Interm\xe9diaire' : 'D\xe9butant';
  const roleLabel    = r => r === 'guidee' ? 'Guid\xe9e' : 'Guideur\xb7se';
  const roleBadgeCol = r => r === 'guidee' ? '#c2185b' : '#1565c0';
  const adminEmail   = 'tangoetvous@gmail.com';
  let sent = 0;

  async function sendBrevo(to, subj, html) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(to) }], subject: subj, htmlContent: html }),
      });
      if (r.ok) sent++; else console.error('[inscription-cours] Brevo error', to, await r.text());
    } catch(e) { console.error('[inscription-cours] fetch error', e); }
  }

  // ── Fetch params from Supabase
  let lienAC = '';
  let parisParams = {}, vincParams = {};
  let coursDatesList = {};
  try {
    const keys = ['tev_liens_assoconnect', 'tev_cours_dates', `tev_params_paris_${saison}`, `tev_params_vincennes_${saison}`];
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/parametres?cle=in.(${keys.map(k => '"' + k + '"').join(',')})&select=cle,valeur`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` }
    });
    if (pr.ok) {
      for (const row of await pr.json()) {
        try {
          const val = typeof row.valeur === 'string' ? JSON.parse(row.valeur) : row.valeur;
          if (row.cle === 'tev_liens_assoconnect') lienAC = ((val[saison] || {}).cours) || val.cours || '';
          else if (row.cle === 'tev_cours_dates') coursDatesList = val || {};
          else if (row.cle === `tev_params_paris_${saison}`) parisParams = val || {};
          else if (row.cle === `tev_params_vincennes_${saison}`) vincParams = val || {};
        } catch {}
      }
    }
  } catch {}
  if (!lienAC) lienAC = 'https://le-regard-se-pose.assoconnect.com/collect/description/695654-a-inscription-aux-cours-de-tango-argentin';

  function getAdresse(ville) {
    const a = (ville === 'vincennes' ? vincParams : parisParams).adresse || {};
    return { nom: a.nom || '', rue: a.rue || '', note: a.note || '', transport: a.transport || a.metro || '' };
  }
  function getHoraire(ville, niveau) {
    const h = (ville === 'vincennes' ? vincParams : parisParams).horaires || {};
    const nk = niveau === 'intermediaire' ? 'intermediaire' : 'debutant';
    const entry = h[nk] || h['debutant'] || {};
    const debut = entry.debut || '', fin = entry.fin || '', jour = entry.jour || '';
    if (!debut) return '';
    return (jour ? jour + ' \xb7 ' : '') + debut + (fin ? '–' + fin : '');
  }
  function getFirstDate(ville) {
    const today = new Date().toISOString().slice(0, 10);
    const arr = Array.isArray(coursDatesList[ville]) ? coursDatesList[ville] : [];
    return arr.filter(function(d){ return String(d) >= today; }).sort()[0] || '';
  }
  function getLivretUrl(ville, niveau) {
    const p = ville === 'vincennes' ? vincParams : parisParams;
    const liv = p.livret || {};
    return niveau === 'intermediaire' ? (liv.url_int || '') : (liv.url_deb || '');
  }

  // Build courses array
  const courses = [{ ville: c1.ville, niveau: c1.niveau, role: role || '', venue: venue || '',
                     pPrenom: pPrenom || '', pNom: pNom || '', pEmail: pEmail || '', pTel: pTel || '', pRole: pRole || '' }];
  if (nbCours === 2 && c2) {
    const p2P = samePartner ? (pPrenom || '') : (p2Prenom || '');
    const p2N = samePartner ? (pNom || '')   : (p2Nom    || '');
    const p2E = samePartner ? (pEmail || '')  : (p2Email  || '');
    const p2Tl = samePartner ? (pTel || '') : '';
    const autoRole = (role2 === 'guidee') ? 'guideur' : 'guidee';
    courses.push({ ville: c2.ville, niveau: c2.niveau, role: role2 || '', venue: venue2 || '',
                   pPrenom: p2P, pNom: p2N, pEmail: p2E, pTel: p2Tl, pRole: autoRole });
  }

  const wrap = function(inner) { return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">' + inner + '</div></body></html>'; };
  const headerEleve = '<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">\xc9cole de tango argentin</div></div>';
  const footer = '<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:' + adminEmail + '" style="color:#888;text-decoration:none;">' + adminEmail + '</a> &nbsp;\xb7&nbsp; 07 73 27 59 06</div>';
  const signEleve = '<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">\xc0 tr\xe8s bient\xf4t sur la piste\xa0!<br/><strong style="color:#222;">Florencia GARCIA &amp; J\xe9r\xe9my BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous \xb7 07 73 27 59 06</span></p>';

  // ── I0 — email admin (dark green header)
  const isWaitGlobal = !!isWaitlist;
  const statutBadge = isWaitGlobal
    ? '<span style="display:inline-block;background:#e65100;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">⏳ Att. validation</span>'
    : '<span style="display:inline-block;background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✓ Att. paiement AssoConnect</span>';

  let adminBlocs = '';
  for (const c of courses) {
    const adr = getAdresse(c.ville);
    const hor = getHoraire(c.ville, c.niveau);
    const emailCode = isWaitGlobal ? 'I01-att' : (c.venue === 'avec-part' && c.pPrenom ? 'I01-couple' : (c.ville === 'vincennes' ? 'I01-vinc' : 'I01-val'));
    adminBlocs += '<div style="border:2px solid #2e7d32;border-radius:8px;overflow:hidden;margin-bottom:20px;">'
      + '<div style="background:#2e7d32;padding:10px 16px;display:flex;align-items:center;gap:12px;">'
      + '<div style="flex:1;"><div style="font-size:18px;font-weight:700;color:#fff;">' + _esc((prenom + ' ' + nom).trim()) + '</div>'
      + '<div style="font-size:12px;color:#c8e6c9;margin-top:2px;">' + _esc(email || '') + (tel ? ' &nbsp;\xb7&nbsp; ' + _esc(tel) : '') + '</div></div>'
      + '<span style="display:inline-block;background:' + roleBadgeCol(c.role) + ';color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">' + roleLabel(c.role) + '</span>'
      + '</div>'
      + '<div style="background:#f1f8e9;padding:14px 16px;">'
      + '<div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px;">📍 ' + _esc(villeLabel(c.ville) + ' — ' + nivLabel(c.niveau)) + '</div>'
      + '<div style="font-size:13px;color:#333;">Saison ' + _esc(saison) + (hor ? ' &nbsp;\xb7&nbsp; ' + _esc(hor) : '') + '</div>'
      + (adr.nom || adr.rue ? '<div style="font-size:12px;color:#666;margin-top:2px;">' + (adr.nom ? _esc(adr.nom) : '') + (adr.nom && adr.rue ? ' — ' : '') + (adr.rue ? _esc(adr.rue) : '') + (adr.note ? ' &mdash; <em style="color:#777;">' + _esc(adr.note) + '</em>' : '') + '</div>' : '')
      + '</div></div>'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:10px 14px;background:#f5f5f5;border-radius:6px;">'
      + statutBadge
      + '<span style="font-size:12px;color:#555;">Email envoy\xe9 : <strong>' + emailCode + '</strong></span>'
      + '</div>'
      + (c.venue === 'avec-part' && c.pPrenom ? '<div style="font-size:13px;color:#555;margin-bottom:10px;">Partenaire : ' + _esc((c.pPrenom + ' ' + c.pNom).trim()) + (c.pEmail ? ' &lt;' + _esc(c.pEmail) + '&gt;' : '') + (c.pTel ? ' \xb7 ' + _esc(c.pTel) : '') + '</div>' : '');
  }
  const telFmt = (tel || '').replace(/\s/g, '');
  const adminHtml = wrap(
    '<div style="background:#0d2b0d;padding:16px 24px;text-align:center;border-bottom:4px solid #2e7d32;">'
    + '<div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div>'
    + '<div style="font-size:9px;letter-spacing:3px;color:#81c784;text-transform:uppercase;margin-top:3px;">Nouvelle demande d&apos;inscription \xb7 Cours r\xe9gulier</div>'
    + '</div>'
    + '<div style="padding:24px;">' + adminBlocs
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">'
    + (telFmt ? '<a href="tel:' + _esc(telFmt) + '" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">📞 Appeler</a>' : '')
    + '<a href="https://mail.google.com/mail/?view=cm&amp;to=' + encodeURIComponent(email || '') + '" style="display:inline-block;background:#111;color:#D4AF37;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">✉️ Email Gmail</a>'
    + (telFmt ? '<a href="sms:' + _esc(telFmt) + '" style="display:inline-block;background:#2e7d32;color:#fff;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">💬 SMS</a>' : '')
    + '<a href="https://app.tangoetvous.fr/admin.html" style="display:inline-block;background:#f5f5f5;color:#333;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:1px solid #ddd;">Ouvrir l&apos;admin →</a>'
    + '</div></div>'
    + '<div style="background:#0d2b0d;padding:10px 24px;text-align:center;font-size:10px;color:#81c784;border-top:1px solid #1b5e20;">'
    + 'Tango &amp; Vous \xb7 ' + adminEmail + ' \xb7 07 73 27 59 06'
    + '</div>'
  );
  const c0 = courses[0];
  await sendBrevo(adminEmail,
    '[Inscription tango] ' + _esc((prenom + ' ' + nom).trim()) + ' — ' + villeLabel(c0.ville) + ' ' + nivLabel(c0.niveau) + ' \xb7 ' + roleLabel(c0.role) + ' \xb7 ' + (isWaitGlobal ? 'att. validation' : 'att. paiement'),
    adminHtml);

  // ── "Quelques précisions" box (shared)
  const quellesPrecisions = '<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:18px 20px;margin:0 0 22px;">'
    + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8962E;font-weight:700;margin-bottom:14px;">Quelques pr\xe9cisions pour votre inscription</div>'
    + '<div style="font-size:14px;color:#333;line-height:1.9;">'
    + '<p style="margin:0 0 14px;background:#fff0f0;border:1px solid #ffcccc;border-radius:6px;padding:12px 14px;">⚠️ Si vous vous inscrivez en couple sur AssoConnect, <strong style="color:#c62828;">vous devez imp\xe9rativement renseigner une adresse email diff\xe9rente pour vous et pour votre partenaire</strong> dans le formulaire. Un seul email pour les deux ne fonctionnera pas.</p>'
    + '<p style="margin:0 0 12px;">Une fois sur Assoconnect, pour remplir le formulaire, cliquez sur le bouton jaune <strong>&ldquo;J&rsquo;adh\xe8re&rdquo;</strong>.</p>'
    + '<p style="margin:0 0 8px;font-weight:700;color:#555;">Moyens de paiement :</p>'
    + '<ul style="margin:0 0 12px;padding-left:20px;line-height:2.0;">'
    + '<li><strong>Carte bleue (1\xd7 ou 3\xd7)</strong> — utilise la certification 3D Secure : pr\xe9voyez une validation par SMS ou via votre appli bancaire.</li>'
    + '<li><strong>Esp\xe8ces</strong> — inscrivez-vous quand m\xeame en ligne en pr\xe9cisant \xe0 la fin du processus que vous r\xe9glez en esp\xe8ces.</li>'
    + '<li><strong>Ch\xe8que</strong> — nous pr\xe9f\xe9rons \xe9viter ce mode de paiement, mais si c&rsquo;est votre seule option, contactez-nous.</li>'
    + '</ul>'
    + '<p style="margin:0;font-size:13px;color:#888;">⚠️ AssoConnect propose un pourboire de fa\xe7on insistante — vous n&rsquo;\xeates pas du tout oblig\xe9\xb7e de le payer. Notez <strong>0 &euro;</strong> \xe0 la place de la somme propos\xe9e.</p>'
    + '</div></div>';

  // ── I01 élève — one email per course
  for (let ci = 0; ci < courses.length; ci++) {
    const c = courses[ci];
    // c1 uses isWaitlist; c2 computes from role2/venue2
    const courseWait = ci === 0 ? isWaitGlobal : (c.role === 'guidee' && c.venue !== 'avec-part');
    const adr = getAdresse(c.ville);
    const hor = getHoraire(c.ville, c.niveau);
    const firstDate = getFirstDate(c.ville);
    const firstDateStr = fmtDateLong(firstDate);
    const livretUrl = getLivretUrl(c.ville, c.niveau);
    const isCouple = c.venue === 'avec-part' && !!c.pPrenom;
    const isVinc = c.ville === 'vincennes';
    const coursAff = villeLabel(c.ville) + ' — ' + nivLabel(c.niveau);
    const saison2 = saison || '';

    // Recipients
    const targets = [{ to: email || '', pren: prenom || '', rl: c.role }];
    if (isCouple && c.pEmail && c.pEmail.toLowerCase() !== (email || '').toLowerCase()) {
      const partRole = c.pRole || (c.role === 'guidee' ? 'guideur' : 'guidee');
      targets.push({ to: c.pEmail, pren: c.pPrenom, rl: partRole });
    }

    for (const tgt of targets) {
      let eleveHtml, eleveSubj;

      if (courseWait) {
        // ── I01-att
        eleveSubj = 'Votre demande d\u2019inscription au tango est bien re\xe7ue \u2014 liste d\u2019attente';
        eleveHtml = wrap(headerEleve
          + '<div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">'
          + '<span style="font-size:14px;font-weight:700;color:#e65100;">⏳ Demande enregistr\xe9e — liste d&rsquo;attente</span></div>'
          + '<div style="padding:30px 28px;">'
          + '<p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">' + _esc(tgt.pren) + '</strong>,</p>'
          + '<p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Vous avez fait une demande d&rsquo;inscription \xe0 nos cours de tango pour la saison ' + _esc(saison2) + ' et nous vous en remercions.</p>'
          + '<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">'
          + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">Votre demande d&rsquo;inscription</div>'
          + '<table style="width:100%;border-collapse:collapse;font-size:14px;">'
          + '<tr><td style="padding:7px 0;color:#555;width:35%;vertical-align:top;">🎓 Cours</td><td style="color:#111;font-weight:700;">' + _esc(coursAff) + '</td></tr>'
          + '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📅 Saison</td><td style="color:#111;font-weight:700;">' + _esc(saison2) + '</td></tr>'
          + '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🎯 Votre r\xf4le</td><td><span style="display:inline-block;background:' + roleBadgeCol(tgt.rl) + ';color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">' + roleLabel(tgt.rl) + '</span></td></tr>'
          + '</table></div>'
          + '<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:18px 20px;margin:0 0 22px;">'
          + '<p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 10px;">Pourquoi une liste d’attente\xa0?</p>'
          + '<p style="font-size:14px;color:#444;line-height:1.7;margin:0;">Pour le confort de tous, nous faisons en sorte de commencer les cours avec la parit\xe9 guideur\xb7se\xb7s / guid\xe9\xb7e\xb7s. Vous vous inscrivez sans partenaire — nous ne pouvons donc pas encore confirmer votre place.</p>'
          + '</div>'
          + '<p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 18px;font-weight:700;">En attendant, nous vous proposons 3\xa0options\xa0:</p>'
          + '<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:18px 20px;margin:0 0 22px;">'
          + '<div style="font-size:14px;color:#333;line-height:2.0;">'
          + '<div style="margin-bottom:10px;">1️⃣ &nbsp;<strong>Trouvez un\xb7e partenaire</strong> pour vous inscrire ensemble — nous pourrons alors confirmer directement votre inscription.</div>'
          + '<div style="margin-bottom:10px;">2️⃣ &nbsp;<strong>Restez en liste d’attente</strong> — d\xe8s qu’une personne de l’autre r\xf4le s’inscrit, nous vous contacterons.</div>'
          + '<div>3️⃣ &nbsp;<strong>Commencez par un cours d’essai</strong> — pour d\xe9couvrir le tango le temps que votre place se lib\xe8re. <a href="#URL_FORMULAIRE_ESSAI_A_RENSEIGNER" style="color:#1565c0;font-weight:700;">→ Acc\xe9der au formulaire cours d’essai</a></div>'
          + '</div></div>'
          + '<p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Nous faisons de notre mieux pour r\xe9pondre \xe0 toutes les demandes. N’h\xe9sitez pas \xe0 nous \xe9crire pour tout renseignement.</p>'
          + '<div style="text-align:center;margin:0 0 22px;">'
          + '<a href="mailto:' + adminEmail + '" style="display:inline-block;background:#fff;color:#B8962E;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #D4AF37;">Nous contacter</a>'
          + '</div>'
          + signEleve + '</div>' + footer);
      } else {
        // ── I01-val / I01-couple / I01-vinc
        const isMainPerson = tgt.to.toLowerCase() === (email || '').toLowerCase();
        const personRole = isMainPerson ? c.role : (c.pRole || (c.role === 'guidee' ? 'guideur' : 'guidee'));
        const greetingName = isCouple ? (_esc(prenom) + ' &amp; ' + _esc(c.pPrenom)) : _esc(tgt.pren);

        // Cours box rows
        const lieuInner = (adr.nom ? '<strong>' + _esc(adr.nom) + '</strong>' : '')
          + (adr.rue ? '<br/><span style="font-size:13px;font-weight:400;color:#444;">' + _esc(adr.rue)
              + (adr.note ? '<br/><em style="color:#666;">' + _esc(adr.note) + '</em>' : '')
              + (adr.transport ? '<br/>' + _esc(adr.transport) : '')
              + '</span>' : '');
        const coursBoxRows = '<tr><td style="padding:7px 0;color:#555;width:35%;vertical-align:top;">🎓 Cours</td><td style="color:#111;font-weight:700;">' + _esc(coursAff) + '</td></tr>'
          + (firstDateStr ? '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📅 ' + (isCouple ? 'Prochain cours' : 'Premier cours') + '</td><td style="color:#111;font-weight:700;">' + _esc(firstDateStr) + '</td></tr>' : '')
          + (hor ? '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🕐 Heure</td><td style="color:#111;font-weight:700;">' + _esc(hor) + '</td></tr>' : '')
          + (lieuInner ? '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📍 Lieu</td><td style="color:#111;font-weight:700;">' + lieuInner + '</td></tr>' : '')
          + (isCouple
            ? '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">👫 Inscription</td><td><span style="display:inline-block;background:#6a1b9a;color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">En couple</span></td></tr>'
            : '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🎯 Votre r\xf4le</td><td><span style="display:inline-block;background:' + roleBadgeCol(personRole) + ';color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">' + roleLabel(personRole) + '</span></td></tr>');

        const bannerText = isCouple
          ? '✓ Votre demande en duo est valid\xe9e — finalisez votre inscription'
          : '✓ Votre demande est valid\xe9e — finalisez votre inscription';
        const introText = isCouple
          ? 'Nous sommes ravis de vous accueillir tous les deux dans nos cours de tango\xa0!'
          : (isVinc ? 'Nous sommes ravis de vous accueillir dans nos cours de tango \xe0 Vincennes\xa0!'
                    : 'Nous sommes ravis de vous accueillir dans nos cours de tango\xa0! Voici toutes les informations pour finaliser votre inscription.');

        const coupleNote = isCouple
          ? '<div style="background:#e8f4fd;border:1px solid #b3d9f5;border-radius:8px;padding:14px 18px;margin:0 0 20px;">'
            + '<p style="font-size:13px;color:#1565c0;font-weight:700;margin:0 0 6px;">👫 Inscription pour deux personnes</p>'
            + '<p style="font-size:13px;color:#444;line-height:1.7;margin:0;">Pour vous inscrire tous les deux sur AssoConnect : soit vous cliquez sur <strong>&ldquo;Ajouter un autre adh\xe9rent&rdquo;</strong> en bas du formulaire, soit vous remplissez chacun le formulaire s\xe9par\xe9ment.</p>'
            + '</div>'
          : '';
        const soranoNote = isVinc
          ? '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:14px 18px;margin:0 0 20px;">'
            + '<p style="font-size:13px;color:#5d4037;font-weight:700;margin:0 0 6px;">🏛 Adh\xe9sion \xe0 l’Espace Sorano</p>'
            + '<p style="font-size:13px;color:#444;line-height:1.7;margin:0;">Il est aussi n\xe9cessaire de souscrire une adh\xe9sion \xe0 l’Espace Sorano pour suivre les cours qui y ont lieu. Nous vous enverrons le lien pour r\xe9gler cette adh\xe9sion s\xe9par\xe9ment dans les prochains jours.</p>'
            + '</div>'
          : '';
        const acNote = isCouple
          ? 'Vos places seront r\xe9serv\xe9es une fois les inscriptions en ligne et les premiers paiements effectu\xe9s.'
          : 'Votre place sera r\xe9serv\xe9e une fois l’inscription en ligne et le premier paiement effectu\xe9s.';
        const livretBtn = livretUrl
          ? '<div style="text-align:center;margin:0 0 22px;"><a href="' + _esc(livretUrl) + '" style="display:inline-block;background:#fff;color:#1565c0;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #1565c0;">📖 T\xe9l\xe9charger le livret ' + nivLabel(c.niveau) + ' ' + villeLabel(c.ville) + '</a></div>'
          : '';

        eleveSubj = isCouple
          ? 'Votre demande d’inscription au tango en duo est valid\xe9e — proc\xe9dez \xe0 votre inscription sur AssoConnect'
          : (isVinc ? 'Votre demande d’inscription au tango \xe0 Vincennes est valid\xe9e — proc\xe9dez \xe0 votre inscription sur AssoConnect'
                    : 'Votre demande d’inscription au tango est valid\xe9e — proc\xe9dez \xe0 votre inscription sur AssoConnect');

        eleveHtml = wrap(headerEleve
          + '<div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">'
          + '<span style="font-size:14px;font-weight:700;color:#2e7d32;">' + bannerText + '</span></div>'
          + '<div style="padding:30px 28px;">'
          + '<p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">' + greetingName + '</strong>,</p>'
          + '<p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">' + introText + '</p>'
          + '<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">'
          + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">Votre inscription</div>'
          + '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + coursBoxRows + '</table>'
          + '</div>'
          + coupleNote + soranoNote
          + '<div style="text-align:center;margin:0 0 10px;">'
          + '<a href="' + _esc(lienAC) + '" style="display:inline-block;background:#D4AF37;color:#111;padding:15px 32px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:1px;text-decoration:none;">'
          + '🔗 INSCRIPTION AUX COURS DE TANGO ' + _esc(saison2) + '</a></div>'
          + '<p style="font-size:12px;color:#888;text-align:center;margin:0 0 24px;">' + acNote + '</p>'
          + quellesPrecisions
          + livretBtn
          + signEleve + '</div>' + footer);
      }

      await sendBrevo(tgt.to, eleveSubj, eleveHtml);
    }
  }

  return corsResponse({ ok: true, sent }, 200, {}, request);
}

// ================================================================
// POST /api/notify/inscription-essai-yoga — formulaire essai-yoga.html
// Y0 (admin regardsepose@gmail.com) + Y1/Y-att (élève) — sans auth
// ================================================================
async function handleNotifyInscriptionEssaiYoga(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }
  if (!env.BREVO_API_KEY) return corsResponse({ ok: true, sent: 0, skipped: true }, 200, {}, request);

  const { prenom, nom, email, tel, cours, dateIso, statut, gratuit } = body;
  const isWait = statut === 'attente';

  const MOIS_L = ['janvier','f\xe9vrier','mars','avril','mai','juin','juillet','ao\xfbt','septembre','octobre','novembre','d\xe9cembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return JOURS_L[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_L[d.getMonth()] + ' ' + d.getFullYear();
  }
  function coursLabel(c) {
    return c === 'yin' ? 'Yin Yoga' : c === 'hatha' ? 'Hatha Yoga' : 'Yin & Hatha Yoga (Forfait)';
  }
  const adminYogaEmail = 'regardsepose@gmail.com';
  const senderEmail    = 'tangoetvous@gmail.com';
  let sent = 0;

  async function sendBrevo(to, subj, html, senderName) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: senderName || 'Florencia Garcia — Yoga', email: senderEmail }, to: [{ email: String(to) }], subject: subj, htmlContent: html }),
      });
      if (r.ok) sent++; else console.error('[inscription-essai-yoga] Brevo error', to, await r.text());
    } catch(e) { console.error('[inscription-essai-yoga] fetch error', e); }
  }

  const dt = new Date(dateIso + 'T12:00:00');
  const y = dt.getFullYear(), mo = dt.getMonth() + 1;
  const sai = mo >= 9 ? (y + '-' + (y + 1)) : ((y - 1) + '-' + y);

  let yogaParams = {};
  try {
    const pr = await fetch(SUPABASE_URL + '/rest/v1/parametres?cle=eq.tev_params_yoga_' + sai + '&select=valeur', {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON }
    });
    if (pr.ok) {
      const rows = await pr.json();
      if (rows[0] && rows[0].valeur) yogaParams = typeof rows[0].valeur === 'string' ? JSON.parse(rows[0].valeur) : rows[0].valeur;
    }
  } catch {}
  const yogaAdresse  = yogaParams.adresse  || {};
  const yogaHoraires = yogaParams.horaires || {};
  const yogaTarifs   = yogaParams.tarifs   || {};
  function getYogaHoraire(c) {
    const h = yogaHoraires[c === 'hatha' ? 'hatha' : 'yin'] || yogaHoraires.yin || {};
    return h.debut && h.fin ? (h.debut + '–' + h.fin) : (h.debut || '');
  }

  const dateAff     = fmtDate(dateIso);
  const coursAff    = coursLabel(cours);
  const horaire     = getYogaHoraire(cours);
  const lieuNom     = yogaAdresse.nom || '';
  const lieuRue     = [yogaAdresse.rue, yogaAdresse.cp, yogaAdresse.ville].filter(Boolean).join(', ');
  const lieuTransp  = yogaAdresse.transport || yogaAdresse.metro || '';
  const tarifEssai  = gratuit ? 'Gratuit' : (yogaTarifs.yoga_essai ? (yogaTarifs.yoga_essai + '€') : '');
  const telFmt      = (tel || '').replace(/\s/g, '');

  const wrap = function(inner) {
    return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">' + inner + '</div></body></html>';
  };

  // ── Y0 — email admin yoga (background:#111)
  const adminHtml = wrap(
    '<div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;">'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#D4AF37;text-transform:uppercase;">Cours de Yoga avec Florencia Garcia</div>'
    + '<div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Nouvelle inscription essai</div>'
    + '</div>'
    + '<div style="padding:20px 24px;">'
    + '<div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:16px;">'
    + '<div style="background:#D4AF37;padding:10px 16px;">'
    + '<div style="font-size:18px;font-weight:700;color:#111;">' + _esc((prenom + ' ' + nom).trim()) + '</div>'
    + '<div style="font-size:12px;color:#333;margin-top:2px;">' + _esc(email || '') + (tel ? ' \xb7 ' + _esc(tel) : '') + '</div>'
    + '</div>'
    + '<div style="background:#fffdf8;padding:14px 16px;">'
    + '<div style="font-size:12px;font-weight:700;color:#777;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">' + _esc(dateAff) + '</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    + '<tr><td style="padding:5px 0;color:#555;width:90px;">🧘 Cours</td><td style="font-weight:700;color:#111;">' + _esc(coursAff) + '</td></tr>'
    + (horaire ? '<tr><td style="padding:5px 0;color:#555;">🕐 Horaire</td><td style="color:#111;">' + _esc(horaire) + '</td></tr>' : '')
    + '<tr><td style="padding:5px 0;color:#555;">📍 Lieu</td><td style="color:#111;">' + _esc(lieuNom || 'voir param\xe8tres') + (lieuRue ? '<br/><span style="font-size:12px;color:#777;">' + _esc(lieuRue) + '</span>' : '') + '</td></tr>'
    + (tarifEssai ? '<tr><td style="padding:5px 0;color:#555;">💶 Tarif</td><td style="font-weight:700;color:#111;">' + _esc(tarifEssai) + '</td></tr>' : '')
    + '<tr><td style="padding:5px 0;color:#555;">📋 Statut</td><td>'
    + (isWait
      ? '<span style="display:inline-block;background:#e65100;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">⏳ Liste d&rsquo;attente</span>'
      : '<span style="display:inline-block;background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✓ Confirm\xe9\xb7e automatiquement</span>')
    + '</td></tr>'
    + '</table>'
    + '</div></div>'
    + '<div style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#2e7d32;font-weight:700;">'
    + (isWait
      ? '⏳ Cours complet — inscription en liste d&rsquo;attente'
      : '✓ Inscription automatique — Email Y1 envoy\xe9 \xb7 Admin → Yoga → Essai')
    + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">'
    + (telFmt ? '<a href="tel:' + _esc(telFmt) + '" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">📞 Appeler</a>' : '')
    + '<a href="https://mail.google.com/mail/?view=cm&amp;to=' + encodeURIComponent(email || '') + '" style="display:inline-block;background:#111;color:#D4AF37;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">✉️ Email Gmail</a>'
    + (telFmt ? '<a href="sms:' + _esc(telFmt) + '" style="display:inline-block;background:#2e7d32;color:#fff;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">💬 SMS</a>' : '')
    + '<a href="https://app.tangoetvous.fr/admin.html" style="display:inline-block;background:#f5f5f5;color:#333;padding:10px 20px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:1px solid #ddd;">Ouvrir l&rsquo;admin →</a>'
    + '</div></div>'
    + '<div style="background:#f5f5f5;padding:10px 24px;text-align:center;font-size:10px;color:#888;border-top:1px solid #e0e0e0;">'
    + 'Association Le Regard Se Pose \xb7 <a href="mailto:' + adminYogaEmail + '" style="color:#888;text-decoration:none;">' + adminYogaEmail + '</a>'
    + '</div>'
  );
  await sendBrevo(adminYogaEmail,
    '🧘 Essai yoga — ' + _esc((prenom + ' ' + nom).trim()) + ' \xb7 ' + coursAff + ' \xb7 ' + dateAff,
    adminHtml,
    'Tango & Vous — Admin');

  // ── Y1 / Y-att — email élève
  const headerYoga = '<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;">'
    + '<div style="font-family:Georgia,serif;font-size:20px;font-weight:400;letter-spacing:4px;color:#D4AF37;">COURS DE YOGA</div>'
    + '<div style="font-family:Georgia,serif;font-size:15px;font-weight:300;letter-spacing:3px;color:#D4AF37;margin-top:5px;">avec Florencia Garcia</div>'
    + '</div>';
  const footerYoga = '<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;">'
    + '<a href="https://www.tangoetvous.com/cours-de-yoga" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">Ma Page YOGA</a><br/>'
    + '<a href="mailto:garciabraitbart@gmail.com" style="color:#888;text-decoration:none;">garciabraitbart@gmail.com</a> &nbsp;\xb7&nbsp; 06 63 23 35 70'
    + '</div>';

  // Yoga-box (green header + sections)
  const yogaBoxRows = '<tr><td style="padding:7px 0;color:#555;width:120px;vertical-align:top;">🧘 Cours</td><td style="color:#111;font-weight:700;">' + _esc(coursAff) + '</td></tr>'
    + '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📅 Date</td><td style="color:#111;font-weight:700;">' + _esc(dateAff) + '</td></tr>'
    + (horaire ? '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🕐 Horaire</td><td style="color:#111;">' + _esc(horaire) + '</td></tr>' : '')
    + '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📍 Lieu</td><td style="color:#111;font-weight:700;">'
    + (lieuNom ? _esc(lieuNom) : 'voir param\xe8tres')
    + (lieuRue ? '<br/><span style="font-size:13px;font-weight:400;color:#444;">' + _esc(lieuRue) + '</span>' : '')
    + (lieuTransp ? '<br/><span style="font-size:12px;color:#777;">' + _esc(lieuTransp) + '</span>' : '')
    + '</td></tr>'
    + (isWait
      ? '<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📋 Statut</td><td><span style="display:inline-block;background:#e65100;color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">⏳ Liste d&rsquo;attente</span></td></tr>'
      : '');
  const yogaBox = '<div style="background:#f1f8f1;border:2px solid #2e7d32;border-radius:10px;overflow:hidden;margin:0 0 22px;">'
    + '<div style="background:#2e7d32;padding:10px 18px;">'
    + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#fff;font-weight:700;">Votre cours d&rsquo;essai yoga</div>'
    + '</div>'
    + '<div style="padding:18px 20px;">'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + yogaBoxRows + '</table>'
    + '</div></div>';

  let eleveHtml, eleveSubj;
  if (isWait) {
    // ── Y-att
    eleveSubj = 'Votre inscription au cours d’essai yoga — liste d’attente';
    eleveHtml = wrap(headerYoga
      + '<div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">'
      + '<span style="font-size:14px;font-weight:700;color:#e65100;">⏳ Ce cours est complet — vous \xeates sur liste d&rsquo;attente</span></div>'
      + '<div style="padding:30px 28px;">'
      + '<p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">' + _esc(prenom) + '</strong>,</p>'
      + '<p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Nous avons bien re\xe7u votre demande d&rsquo;essai yoga. Malheureusement, ce cours est actuellement complet.</p>'
      + yogaBox
      + '<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px 20px;margin:0 0 22px;">'
      + '<p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 8px;">Nos cours sont limit\xe9s \xe0 14 participants</p>'
      + '<p style="font-size:13px;color:#555;line-height:1.7;margin:0;">Pour garantir un suivi personnalis\xe9, nous limitons nos groupes \xe0 14 \xe9l\xe8ves. Des places se lib\xe8rent parfois — nous vous contacterons d\xe8s qu&rsquo;une place est disponible pour vous.</p>'
      + '</div>'
      + '<div style="text-align:center;margin:0 0 22px;">'
      + '<a href="mailto:' + adminYogaEmail + '" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Nous contacter</a>'
      + '</div>'
      + '<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">\xc0 tr\xe8s bient\xf4t,<br/>'
      + '<strong style="color:#222;">Florencia Garcia</strong><br/>'
      + '<span style="font-size:12px;color:#888;">Association Le Regard Se Pose \xb7 06 63 23 35 70</span></p>'
      + '</div>' + footerYoga);
  } else {
    // ── Y1
    eleveSubj = '✓ Votre cours d’essai yoga est confirm\xe9 — ' + coursAff + ' \xb7 ' + dateAff;
    eleveHtml = wrap(headerYoga
      + '<div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;">'
      + '<span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre cours d&rsquo;essai yoga est confirm\xe9\xa0!</span></div>'
      + '<div style="padding:30px 28px;">'
      + '<p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">' + _esc(prenom) + '</strong>\xa0!</p>'
      + '<p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Nous sommes ravis de vous accueillir pour votre premier cours de yoga. Voici toutes les informations pour votre s\xe9ance.</p>'
      + yogaBox
      + '<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px 20px;margin:0 0 22px;">'
      + '<p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 8px;">En cas d&rsquo;emp\xeachement</p>'
      + '<p style="font-size:13px;color:#555;line-height:1.7;margin:0;">Merci de nous pr\xe9venir le plus t\xf4t possible, m\xeame au dernier moment. Cela permettra \xe0 quelqu&rsquo;un d&rsquo;autre de prendre votre place.</p>'
      + '</div>'
      + '<div style="text-align:center;margin:0 0 22px;">'
      + '<a href="mailto:' + adminYogaEmail + '" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Nous contacter</a>'
      + '</div>'
      + '<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">\xc0 tr\xe8s bient\xf4t sur le tapis\xa0!<br/>'
      + '<strong style="color:#222;">Florencia Garcia</strong><br/>'
      + '<span style="font-size:12px;color:#888;">Association Le Regard Se Pose \xb7 06 63 23 35 70</span><br/>'
      + '<a href="https://www.tangoetvous.com/cours-de-yoga" style="font-size:12px;color:#B8962E;text-decoration:none;">Ma Page YOGA</a>'
      + '</p>'
      + '</div>' + footerYoga);
  }

  await sendBrevo(email, eleveSubj, eleveHtml);
  return corsResponse({ ok: true, sent }, 200, {}, request);
}

// ================================================================
// POST /api/cron/essai-rappel-j7 — E4 : rappel J-7 avant essai tango
// Lit inscriptions_essai confirme dont date_essai = dans 7 jours
// ================================================================
async function handleCronEssaiRappelJ7(request, env) {
  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const d7 = new Date(); d7.setDate(d7.getDate()+7);
  const targetDate = d7.toISOString().slice(0,10);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inscriptions_essai?date_essai=eq.${targetDate}&statut=eq.confirme&type=eq.tango&select=id,email,prenom,nom,ville,niveau,date_essai`,
    { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  const inscrits = await res.json();

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  // Fetch params for addresses
  let paramsRaw = {};
  try {
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/parametres?select=cle,valeur`, { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } });
    if (pr.ok) { const rows = await pr.json(); for (const row of rows) { try { paramsRaw[row.cle] = typeof row.valeur === 'string' ? JSON.parse(row.valeur) : row.valeur; } catch { paramsRaw[row.cle] = row.valeur; } } }
  } catch(err) { console.error('[cron-essai-rappel-j7] params error', err); }

  let sent = 0;
  for (const e of inscrits) {
    if (!e.email || !env.BREVO_API_KEY) continue;
    const prenomAff   = _esc(e.prenom || '');
    const dateLabel   = fmtDate(targetDate);
    const niveauLabel = e.niveau === 'debutant' ? 'Débutant' : 'Intermédiaire';
    const villeLabel  = e.ville === 'paris' ? 'Paris' : 'Vincennes';

    const saiM = targetDate.slice(0,4); const mI = parseInt(targetDate.slice(5,7));
    const saison = mI >= 9 ? `${saiM}-${parseInt(saiM)+1}` : `${parseInt(saiM)-1}-${saiM}`;
    const parKey = `tev_params_${e.ville}_${saison}`;
    const params = paramsRaw[parKey] || {};
    const adresse = params.adresse || {};
    const horaires = params.horaires || {};
    const horLabel = (horaires[e.niveau === 'debutant' ? 'debutant' : 'intermediaire'] || '');

    const coursBox = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">VOTRE COURS D'ESSAI</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:5px 8px;color:#888;">Date</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${dateLabel}</td></tr>
        <tr><td style="padding:5px 8px;color:#888;">Cours</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${villeLabel} — ${niveauLabel}</td></tr>
        ${horLabel ? `<tr><td style="padding:5px 8px;color:#888;">Horaire</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(horLabel)}</td></tr>` : ''}
        ${adresse.nom ? `<tr><td style="padding:5px 8px;color:#888;">Lieu</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(adresse.nom)}</td></tr>` : ''}
      </table>
    </div>`;
    const confirmUrl = `https://app.tangoetvous.fr/api/essai/confirmer?id=${e.id}&token=j7`;
    const annulUrl   = `https://app.tangoetvous.fr/api/essai/annuler?id=${e.id}&token=j7`;
    const isDebutant = e.niveau === 'debutant';
    const checklist  = isDebutant ? `<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:12px 16px;margin:0 0 22px;"><p style="font-size:13px;font-weight:700;color:#333;margin:0 0 8px;">Pour votre cours d'essai</p><p style="font-size:13px;color:#555;line-height:1.7;margin:0;">• Arrivez 5 min avant · Chaussures à semelles lisses · Tenue confortable</p></div>` : '';
    const htmlEleve  = wrap(`${headerEleve}
      <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">🗓 Rappel — votre cours d'essai a lieu dans 7 jours !</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        ${coursBox}
        <div style="text-align:center;margin:0 0 22px;"><a href="${confirmUrl}" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">👍 Je confirme ma présence</a></div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:0 0 22px;">
          <a href="${annulUrl}" style="display:inline-block;background:#fff;color:#c62828;padding:11px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:2px solid #c62828;">✕ Annuler mon cours d'essai</a>
          <a href="https://app.tangoetvous.fr/cours-essai.html" style="display:inline-block;background:#fff;color:#555;padding:11px 20px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:2px solid #999;">↩ Reporter à une autre date</a>
        </div>
        ${checklist}
        ${signEleve}
      </div>${footer}`);
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(e.email) }], subject: `🗓 Rappel — votre cours d'essai du ${dateLabel} — Tango & Vous`, htmlContent: htmlEleve }),
      });
      if (r.ok) sent++;
    } catch(err) { console.error('[cron-essai-rappel-j7] brevo error', err); }
  }
  return corsResponse({ ok: true, sent, checked: inscrits.length, targetDate }, 200, {}, request);
}

// ================================================================
// POST /api/notify/essai-valide — E15/E15b
// Admin valide essai en attente → confirme
// Body: { email, prenom, nom, ville, niveau, dateEssai, role,
//         partPrenom?, partNom?, emailPartage?, daysUntil, livretUrl? }
// ================================================================
async function handleNotifyEssaiValide(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const { email, prenom, nom, ville, niveau, dateEssai, role, partenaire, id } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);

  const adminEmail = 'tangoetvous@gmail.com';
  const APP_URL    = 'https://app.tangoetvous.fr';
  const sbHeaders  = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

  // Calculate daysUntil
  const essaiDateObj = new Date((dateEssai||'') + 'T12:00:00');
  const todayObj = new Date(); todayObj.setHours(12,0,0,0);
  const daysUntil = Math.round((essaiDateObj - todayObj) / (1000*60*60*24));
  const proche    = daysUntil <= 7;

  // Saison from date
  const essaiM = essaiDateObj.getMonth() + 1;
  const essaiY = essaiDateObj.getFullYear();
  const sai    = essaiM >= 9 ? `${essaiY}-${essaiY+1}` : `${essaiY-1}-${essaiY}`;

  // Fetch params (horaires + adresse + livret) from Supabase
  let villeParams = {};
  try {
    const paramKey = `tev_params_${ville}_${sai}`;
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/parametres?select=valeur&cle=eq.${encodeURIComponent(paramKey)}`, { headers: sbHeaders });
    if (pr.ok) {
      const rows = await pr.json();
      const val = rows[0]?.valeur;
      villeParams = (typeof val === 'string' ? JSON.parse(val) : val) || {};
    }
  } catch {}

  const horaires  = villeParams.horaires || {};
  const horaire   = _esc(horaires[niveau] || '');
  const adresse   = villeParams.adresse  || {};
  const adrNom    = _esc(adresse.nom       || '');
  const adrRue    = _esc(adresse.rue       || '');
  const adrTransp = _esc(adresse.transport || '');
  const gps       = adresse.gps || '';
  const livret    = villeParams.livret   || {};
  const livretUrl = niveau === 'debutant' ? (livret.url_deb || '') : (livret.url_int || '');

  const niveauLabel = niveau === 'debutant' ? 'Débutant' : 'Intermédiaire';
  const villeLabel  = ville === 'paris' ? 'Paris' : 'Vincennes';
  const isDebutant  = niveau === 'debutant';
  const isCouple    = !!(partenaire);
  const isGratuit   = essaiM === 9 && isDebutant;
  const tarifEssai  = isGratuit ? 'Gratuit' : (isCouple ? '30 €' : '15 €');
  const dateLabel   = fmtDate(dateEssai);

  const roleBadge = role === 'guidee'
    ? `<span style="background:#c2185b;color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;">Guidée</span>`
    : `<span style="background:#1565c0;color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;">Guideur·se</span>`;

  // HMAC token for action links
  let confirmUrl = `mailto:${adminEmail}`;
  let annulerUrl = `mailto:${adminEmail}?subject=${encodeURIComponent('Annulation essai tango ' + prenom + ' ' + nom)}`;
  if (id) {
    const tk = (await _calHmac(`${id}:${(email||'').toLowerCase()}`, SUPABASE_ANON)).slice(0, 32);
    confirmUrl = `${APP_URL}/api/essai/confirmer?id=${id}&token=${tk}`;
    annulerUrl = `${APP_URL}/api/essai/annuler?id=${id}&token=${tk}`;
  }

  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const lieuCell = adrNom
    ? `${adrNom}${adrRue ? '<br/><span style="font-size:13px;font-weight:400;color:#444;">'+adrRue+'</span>' : ''}${adrTransp ? '<br/><span style="font-size:12px;color:#666;">'+adrTransp+'</span>' : ''}${gps ? '<br/><a href="https://maps.google.com/?q='+encodeURIComponent(gps)+'" style="color:#1565c0;font-size:12px;">🗺 Voir sur Google Maps</a>' : ''}`
    : '';

  const coursBox = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">Votre cours d'essai</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:7px 0;color:#555;width:35%;vertical-align:top;">📅 Date</td><td style="color:#111;font-weight:700;">${dateLabel}</td></tr>
      ${horaire ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🕐 Heure</td><td style="color:#111;font-weight:700;">${horaire}</td></tr>` : ''}
      ${lieuCell ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📍 Lieu</td><td style="color:#111;font-weight:700;">${lieuCell}</td></tr>` : ''}
      <tr><td style="padding:7px 0;color:#555;vertical-align:top;">🎓 Cours</td><td style="color:#111;font-weight:700;">${villeLabel} — ${niveauLabel}</td></tr>
      <tr><td style="padding:7px 0;color:#555;vertical-align:top;">🎯 Votre rôle</td><td>${roleBadge}</td></tr>
      <tr><td style="padding:7px 0;color:#555;">💶 Tarif</td><td style="color:#111;font-weight:700;">${tarifEssai}</td></tr>
    </table>
  </div>`;

  const livretBtn = livretUrl
    ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_esc(livretUrl)}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">📖 Télécharger le livret ${niveauLabel} ${villeLabel}</a></div>`
    : '';

  const checklist = isDebutant ? `<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#B8962E;font-weight:700;margin-bottom:12px;">Pour votre cours d'essai</div>
    <div style="font-size:14px;color:#444;line-height:2.1;">
      ✓ <strong>Arrivez 5 minutes en avance</strong> — pour vous changer et commencer détendu·e.<br/>
      ✓ <strong>Chaussures à semelles lisses</strong> — cuir ou daim, ou des chaussettes pour un premier cours.<br/>
      ✓ <strong>Ne vous préoccupez pas de votre tenue</strong> — venez avec les vêtements que vous portez pendant la journée.
    </div>
  </div>` : '';

  const actionBlock = proche
    ? `<div style="text-align:center;margin:0 0 16px;"><a href="${confirmUrl}" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:1px;text-decoration:none;">👍 Je confirme ma présence</a></div>
       <div style="border:1px solid #eee;border-radius:8px;padding:14px 20px;margin:0 0 22px;text-align:center;">
         <p style="font-size:12px;color:#888;margin:0 0 12px;">Empêchement de dernière minute ?</p>
         <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
           <a href="${annulerUrl}" style="display:inline-block;background:#fff;color:#c62828;padding:9px 18px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:2px solid #c62828;">✕ Annuler mon cours d'essai</a>
           <a href="${APP_URL}/cours-essai.html" style="display:inline-block;background:#fff;color:#555;padding:9px 18px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;border:2px solid #999;">↩ Reporter à une autre date</a>
         </div>
       </div>`
    : `<div style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:14px 18px;margin:0 0 22px;"><p style="font-size:13px;color:#2e7d32;margin:0;">🗓 Vous recevrez un rappel 7 jours avant le cours avec toutes les informations pratiques.</p></div>`;

  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Bonne nouvelle — votre cours d'essai est confirmé !</span></div>
    <div style="padding:30px 28px;">
      <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${_esc(prenom||'')}</strong>,</p>
      <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Bonne nouvelle ! Suite à l'évolution des disponibilités, votre cours d'essai de tango est désormais <strong>confirmé</strong>. Nous sommes ravis de vous accueillir !</p>
      ${coursBox}
      ${livretBtn}
      ${checklist}
      ${actionBlock}
      ${signEleve}
    </div>${footer}`);

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Tango & Vous', email: adminEmail },
        to: [{ email: String(email) }],
        subject: `✓ Bonne nouvelle — votre cours d'essai du ${dateLabel} est confirmé ! — Tango & Vous`,
        htmlContent: htmlEleve,
      }),
    });
  } catch(err) { console.error('[notify-essai-valide] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/cron/essai-yoga-rappel-j3 — Y3 : rappel J-3 avant essai yoga
// ================================================================
async function handleCronEssaiYogaRappelJ3(request, env) {
  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const d3 = new Date(); d3.setDate(d3.getDate()+3);
  const targetDate = d3.toISOString().slice(0,10);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inscriptions_essai_yoga?date_essai=eq.${targetDate}&statut=eq.confirme&select=id,email,prenom,nom,cours,date_essai`,
    { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  const inscrits = await res.json();

  const adminYogaEmail = 'regardsepose@gmail.com';
  const adminEmail     = 'tangoetvous@gmail.com';
  const headerYoga     = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:20px;font-weight:400;letter-spacing:4px;color:#D4AF37;">COURS DE YOGA</div><div style="font-family:Georgia,serif;font-size:15px;font-weight:300;letter-spacing:3px;color:#D4AF37;margin-top:5px;">avec Florencia Garcia</div></div>`;
  const footerYoga     = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com/cours-de-yoga" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">MA PAGE YOGA</a><br/><a href="mailto:${adminYogaEmail}" style="color:#888;text-decoration:none;">${adminYogaEmail}</a> &nbsp;·&nbsp; 06 63 23 35 70</div>`;
  const signYoga       = `<p style="font-size:14px;color:#2e7d32;text-align:center;margin:24px 0 0;">À très bientôt sur les tatamis !<br/><strong style="color:#222;">Florencia Garcia</strong><br/><span style="font-size:12px;color:#888;">Association Le Regard Se Pose · 06 63 23 35 70</span></p>`;
  const wrap           = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  // Fetch params
  let paramsRaw = {};
  try {
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/parametres?select=cle,valeur`, { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } });
    if (pr.ok) { const rows = await pr.json(); for (const row of rows) { try { paramsRaw[row.cle] = typeof row.valeur === 'string' ? JSON.parse(row.valeur) : row.valeur; } catch { paramsRaw[row.cle] = row.valeur; } } }
  } catch(err) { console.error('[cron-essai-yoga-rappel-j3] params error', err); }

  let sent = 0;
  for (const e of inscrits) {
    if (!e.email || !env.BREVO_API_KEY) continue;
    const prenomAff = _esc(e.prenom || '');
    const dateLabel = fmtDate(targetDate);
    const coursLabel = e.cours === 'yin' ? 'Yin Yoga' : e.cours === 'hatha' ? 'Hatha Yoga' : 'Yin + Hatha Yoga';

    const mI = parseInt(targetDate.slice(5,7)), yr = targetDate.slice(0,4);
    const saison = mI >= 9 ? `${yr}-${parseInt(yr)+1}` : `${parseInt(yr)-1}-${yr}`;
    const params = paramsRaw[`tev_params_yoga_${saison}`] || {};
    const horaires = params.horaires || {};
    const adresse  = params.adresse || {};
    const horLabel = horaires[e.cours] || horaires['yin'] || '';

    const yogaBox = `<div style="background:#f1f8f1;border:2px solid #388e3c;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#388e3c;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #a5d6a7;">COURS D'ESSAI YOGA</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:5px 8px;color:#888;">Date</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${dateLabel}</td></tr>
        <tr><td style="padding:5px 8px;color:#888;">Cours</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${coursLabel}</td></tr>
        ${horLabel ? `<tr><td style="padding:5px 8px;color:#888;">Horaire</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(horLabel)}</td></tr>` : ''}
        ${adresse.nom ? `<tr><td style="padding:5px 8px;color:#888;">Lieu</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(adresse.nom)}</td></tr>` : ''}
      </table>
    </div>`;
    const confirmUrl = `https://app.tangoetvous.fr/api/essai-yoga/confirmer?id=${e.id}&token=y3`;
    const htmlEleve  = wrap(`${headerYoga}
      <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">🗓 Rappel — votre cours d'essai yoga a lieu dans 3 jours !</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        ${yogaBox}
        <div style="text-align:center;margin:0 0 22px;"><a href="${confirmUrl}" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">👍 Je confirme ma présence</a></div>
        <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
          <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">En cas d'empêchement, merci de nous prévenir même au dernier moment, afin de permettre à quelqu'un d'autre de profiter de la place.</p>
        </div>
        ${signYoga}
      </div>${footerYoga}`);
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Florencia Garcia — Yoga', email: adminEmail }, to: [{ email: String(e.email) }], subject: `🗓 Rappel — votre cours d'essai yoga du ${dateLabel} — Cours de yoga avec Florencia Garcia`, htmlContent: htmlEleve }),
      });
      if (r.ok) sent++;
    } catch(err) { console.error('[cron-essai-yoga-rappel-j3] brevo error', err); }

    // Notif in-app élève
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email: String(e.email), type: 'essai_yoga_rappel', message: `📅 Rappel : votre cours d'essai yoga a lieu dans 3 jours — ${dateLabel}`, lu: false }),
      });
    } catch(err) { console.error('[cron-essai-yoga-rappel-j3] notif error', err); }
  }
  return corsResponse({ ok: true, sent, checked: inscrits.length, targetDate }, 200, {}, request);
}

// ================================================================
// POST /api/notify/essai-yoga-modifie — Y-mod
// Admin modifie date/cours d'un essai yoga
// Body: { email, prenom, nom, ancienneDate, nouvelleDateEssai, cours, ancienCours? }
// ================================================================
async function handleNotifyEssaiYogaModifie(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const adminYogaEmail = 'regardsepose@gmail.com';
  const adminEmail     = 'tangoetvous@gmail.com';
  const headerYoga     = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:20px;font-weight:400;letter-spacing:4px;color:#D4AF37;">COURS DE YOGA</div><div style="font-family:Georgia,serif;font-size:15px;font-weight:300;letter-spacing:3px;color:#D4AF37;margin-top:5px;">avec Florencia Garcia</div></div>`;
  const footerYoga     = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com/cours-de-yoga" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">MA PAGE YOGA</a><br/><a href="mailto:${adminYogaEmail}" style="color:#888;text-decoration:none;">${adminYogaEmail}</a> &nbsp;·&nbsp; 06 63 23 35 70</div>`;
  const signYoga       = `<p style="font-size:14px;color:#2e7d32;text-align:center;margin:24px 0 0;">À très bientôt sur les tatamis !<br/><strong style="color:#222;">Florencia Garcia</strong><br/><span style="font-size:12px;color:#888;">Association Le Regard Se Pose · 06 63 23 35 70</span></p>`;
  const wrap           = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, ancienneDate, nouvelleDateEssai, cours, ancienCours } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff  = _esc(prenom || '');
  const coursLabel = cours === 'yin' ? 'Yin Yoga' : cours === 'hatha' ? 'Hatha Yoga' : 'Yin + Hatha Yoga';
  const yogaBox    = `<div style="background:#f1f8f1;border:2px solid #388e3c;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#388e3c;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #a5d6a7;">📋 MODIFICATION DE VOTRE ESSAI</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${ancienneDate ? `<tr><td style="padding:5px 8px;color:#888;">Ancienne date</td><td style="padding:5px 8px;color:#c62828;text-decoration:line-through;text-align:right;">${fmtDate(ancienneDate)}</td></tr>` : ''}
      <tr><td style="padding:5px 8px;color:#888;">Nouvelle date</td><td style="padding:5px 8px;font-weight:700;color:#2e7d32;text-align:right;">${fmtDate(nouvelleDateEssai)}</td></tr>
      ${ancienCours && ancienCours !== cours ? `<tr><td style="padding:5px 8px;color:#888;">Ancien cours</td><td style="padding:5px 8px;color:#c62828;text-decoration:line-through;text-align:right;">${_esc(ancienCours)}</td></tr>` : ''}
      <tr><td style="padding:5px 8px;color:#888;">Cours</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${coursLabel}</td></tr>
    </table>
  </div>`;
  const htmlEleve = wrap(`${headerYoga}
    <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">📋 Votre cours d'essai yoga a été modifié</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre cours d'essai yoga a été modifié. Voici le récapitulatif des changements.</p>
      ${yogaBox}
      <div style="text-align:center;margin:0 0 22px;"><a href="mailto:${adminYogaEmail}" style="display:inline-block;background:#fff;color:#555;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:2px solid #999;">Nous contacter</a></div>
      ${signYoga}
    </div>${footerYoga}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Florencia Garcia — Yoga', email: adminEmail }, to: [{ email: String(email) }], subject: `📋 Votre cours d'essai yoga a été modifié — Cours de yoga avec Florencia Garcia`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-essai-yoga-modifie] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/yoga-inscription-validee — YI1
// Admin valide paiement yoga → inscrit
// Body: { email, prenom, nom, cours, saison, horaires, adresse,
//         paiement, montant, livretUrl? }
// ================================================================
async function handleNotifyYogaInscriptionValidee(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const adminYogaEmail = 'regardsepose@gmail.com';
  const adminEmail     = 'tangoetvous@gmail.com';
  const headerYoga     = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:20px;font-weight:400;letter-spacing:4px;color:#D4AF37;">COURS DE YOGA</div><div style="font-family:Georgia,serif;font-size:15px;font-weight:300;letter-spacing:3px;color:#D4AF37;margin-top:5px;">avec Florencia Garcia</div></div>`;
  const footerYoga     = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com/cours-de-yoga" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">MA PAGE YOGA</a><br/><a href="mailto:${adminYogaEmail}" style="color:#888;text-decoration:none;">${adminYogaEmail}</a> &nbsp;·&nbsp; 06 63 23 35 70</div>`;
  const signYoga       = `<p style="font-size:14px;color:#2e7d32;text-align:center;margin:24px 0 0;">À très bientôt sur les tatamis !<br/><strong style="color:#222;">Florencia Garcia</strong><br/><span style="font-size:12px;color:#888;">Association Le Regard Se Pose · 06 63 23 35 70</span></p>`;
  const wrap           = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, nom, cours, saison, horaires = {}, adresse = {}, paiement, montant, livretUrl } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff  = _esc(prenom || '');
  const coursLabel = cours === 'yin' ? 'Yin Yoga' : cours === 'hatha' ? 'Hatha Yoga' : 'Yin + Hatha Yoga';
  const isForfait  = cours === 'forfait';

  let horairesHtml = '';
  if (isForfait) {
    if (horaires.yin)   horairesHtml += `<tr><td style="padding:5px 8px;color:#888;">Yin Yoga</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(horaires.yin)}</td></tr>`;
    if (horaires.hatha) horairesHtml += `<tr><td style="padding:5px 8px;color:#888;">Hatha Yoga</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(horaires.hatha)}</td></tr>`;
  } else if (horaires[cours]) {
    horairesHtml = `<tr><td style="padding:5px 8px;color:#888;">Horaire</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(horaires[cours])}</td></tr>`;
  }

  const yogaBox = `<div style="background:#f1f8f1;border:2px solid #388e3c;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#388e3c;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #a5d6a7;">VOTRE INSCRIPTION</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:5px 8px;color:#888;">Cours</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${coursLabel}</td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Saison</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(saison||'')}</td></tr>
      ${horairesHtml}
      ${adresse.nom ? `<tr><td style="padding:5px 8px;color:#888;">Lieu</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(adresse.nom)}</td></tr>` : ''}
      ${montant ? `<tr><td style="padding:5px 8px;color:#888;">Montant</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${montant}€ ${_esc(paiement||'')}</td></tr>` : ''}
      <tr><td style="padding:5px 8px;color:#888;">Statut</td><td style="padding:5px 8px;text-align:right;"><span style="background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;">✓ Bienvenue</span></td></tr>
    </table>
  </div>`;

  const soranoBlock = `<div style="background:#fff9c4;border:1px solid #f9a825;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
    <p style="font-size:13px;color:#e65100;font-weight:700;margin:0 0 6px;">🏛 Adhésion à l'Espace Sorano</p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">Les cours ont lieu à l'Espace Sorano à Vincennes. Une adhésion est demandée. Vous recevrez prochainement les informations.</p>
  </div>`;

  const checklist = `<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
    <p style="font-size:13px;font-weight:700;color:#333;margin:0 0 10px;">Pour bien commencer</p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 4px;">• Tenue confortable et souple</p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 4px;">• Tapis de yoga (ou location sur place)</p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">• Ponctualité appréciée</p>
  </div>`;
  const livretBtn = livretUrl ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_esc(livretUrl)}" style="display:inline-block;background:#fff;color:#388e3c;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:2px solid #388e3c;">📖 Télécharger le livret ${coursLabel}</a></div>` : '';

  const htmlEleve = wrap(`${headerYoga}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Bienvenue — votre inscription yoga est confirmée !</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre inscription aux cours de yoga avec Florencia Garcia est confirmée. Nous sommes ravis de vous accueillir !</p>
      ${yogaBox}
      ${soranoBlock}
      ${checklist}
      ${livretBtn}
      ${signYoga}
    </div>${footerYoga}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Florencia Garcia — Yoga', email: adminEmail }, to: [{ email: String(email) }], subject: `✓ Bienvenue — votre inscription yoga est confirmée — Cours de yoga avec Florencia Garcia`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-yoga-inscription-validee] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/cron/espace-eleve-activation — P1 : J+7 après I03
// Lit eleves inscrits (statut='inscrit') dont inscription_date = il y a 7 jours
// ================================================================
async function handleCronEspaceEleveActivation(request, env) {
  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  // Find inscriptions_cours updated 7 days ago to statut='inscrit'
  const d7ago = new Date(); d7ago.setDate(d7ago.getDate()-7);
  const targetDate = d7ago.toISOString().slice(0,10);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inscriptions_cours?statut=eq.inscrit&created_at=gte.${targetDate}T00:00:00&created_at=lt.${targetDate}T23:59:59&select=email,prenom,nom`,
    { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  const inscrits = await res.json();

  // Deduplicate by email
  const seen = new Set();
  const unique = inscrits.filter(e => { if (!e.email || seen.has(e.email)) return false; seen.add(e.email); return true; });

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  let sent = 0;
  for (const e of unique) {
    if (!env.BREVO_API_KEY) continue;
    const prenomAff = _esc(e.prenom || '');
    const infoBox   = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">ACCÉDER À VOTRE ESPACE ÉLÈVE</div>
      <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 8px;"><strong>1.</strong> Ouvrez <a href="https://app.tangoetvous.fr" style="color:#1565c0;">app.tangoetvous.fr</a> sur votre téléphone</p>
      <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 8px;"><strong>2.</strong> Entrez votre adresse email</p>
      <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 8px;"><strong>3.</strong> Cliquez sur le lien reçu par email (magic link — pas de mot de passe)</p>
      <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 10px;"><strong>4.</strong> Installez l'appli sur votre téléphone</p>
      <div style="background:#f9f9f9;border-radius:6px;padding:10px 14px;font-size:12px;color:#666;line-height:1.7;">
        <strong>iPhone</strong> : Partage ↑ → "Sur l'écran d'accueil"<br/>
        <strong>Android</strong> : Menu ⋮ → "Ajouter à l'écran d'accueil"
      </div>
    </div>`;
    const fonctions = `<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
      <p style="font-size:13px;font-weight:700;color:#333;margin:0 0 8px;">Ce que vous pouvez faire depuis l'appli</p>
      <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 4px;">• Pointer vos cours (carte de 10 cours)</p>
      <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 4px;">• Suivre votre carte et les cours restants</p>
      <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 4px;">• Retrouver les milongas et les stages</p>
      <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">• Lire les publications de l'école</p>
    </div>`;
    const htmlEleve = wrap(`${headerEleve}
      <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre espace élève est prêt !</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre espace élève Tango &amp; Vous est prêt. Accédez à votre espace depuis votre téléphone pour pointer vos cours et retrouver toutes les informations de l'école.</p>
        ${infoBox}
        ${fonctions}
        <div style="text-align:center;margin:0 0 22px;"><a href="https://app.tangoetvous.fr" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Accéder à mon espace élève →</a></div>
        ${signEleve}
      </div>${footer}`);
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(e.email) }], subject: `✓ Votre espace élève est prêt — Tango & Vous`, htmlContent: htmlEleve }),
      });
      if (r.ok) sent++;
    } catch(err) { console.error('[cron-espace-eleve-activation] brevo error', err); }
  }
  return corsResponse({ ok: true, sent, checked: unique.length, targetDate }, 200, {}, request);
}

// ================================================================
// POST /api/notify/carte-bienvenue — C1 : premier pointage carte10
// Body: { email, prenom, nom, utilises, restants, expiration, cours }
// ================================================================
async function handleNotifyCarteBienvenue(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, nom, utilises = 1, restants = 9, expiration, cours } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff = _esc(prenom || '');
  const expiLabel = expiration ? fmtDate(expiration) : 'à calculer après le 1er cours';
  const carteBox  = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">🎫 VOTRE CARTE DE 10 COURS</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:5px 8px;color:#888;">Cours utilisés</td><td style="padding:5px 8px;font-weight:700;color:#1565c0;text-align:right;">${utilises}/10</td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Cours restants</td><td style="padding:5px 8px;font-weight:700;color:#2e7d32;text-align:right;">${restants}</td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Valide jusqu'au</td><td style="padding:5px 8px;font-weight:700;color:#333;text-align:right;">${expiLabel}</td></tr>
    </table>
  </div>`;
  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Bienvenue — votre carte de 10 cours est activée !</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre premier cours a été enregistré. Votre carte de 10 cours est maintenant active.</p>
      ${carteBox}
      <div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
        <p style="font-size:13px;font-weight:700;color:#333;margin:0 0 10px;">📱 Votre espace élève</p>
        <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 6px;">• Pointez vos cours vous-même depuis votre téléphone</p>
        <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 6px;">• Suivez votre carte et votre progression</p>
        <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">• Retrouvez les milongas et les stages</p>
      </div>
      <div style="text-align:center;margin:0 0 22px;"><a href="https://app.tangoetvous.fr" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Accéder à mon espace élève →</a></div>
      ${signEleve}
    </div>${footer}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `🎫 Votre carte de 10 cours est activée — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-carte-bienvenue] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/carte-renouvellement — C2/C2b : carte renouvelée sans payer
// Body: { email, prenom, nom, source ('eleve'|'admin'), liensAssoConnect }
// ================================================================
async function handleNotifyCarteRenouvellement(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, source = 'eleve', liensAssoConnect = '#' } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff  = _esc(prenom || '');
  const isAdmin    = source === 'admin';
  const carteBox   = `<div style="background:#fff3e0;border:2px solid #e65100;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#e65100;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #ffcc80;">🎫 NOUVELLE CARTE — PAIEMENT EN ATTENTE</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:5px 8px;color:#888;">Cours utilisés</td><td style="padding:5px 8px;font-weight:700;color:#e65100;text-align:right;">0/10</td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Statut paiement</td><td style="padding:5px 8px;font-weight:700;color:#e65100;text-align:right;">⚠️ Non payée</td></tr>
    </table>
  </div>`;
  const subjectPart = isAdmin ? 'renouvelée par l\'admin' : 'renouvelée';
  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;"><span style="font-size:14px;font-weight:700;color:#e65100;">⚠️ Nouvelle carte créée — finalisez votre paiement</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre carte de 10 cours a été renouvelée. Pour finaliser, veuillez régler votre nouvelle carte sur AssoConnect.</p>
      ${carteBox}
      <div style="text-align:center;margin:0 0 22px;"><a href="${_esc(String(liensAssoConnect))}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">💳 Renouveler ma carte sur AssoConnect →</a></div>
      ${signEleve}
    </div>${footer}`);

  // Notif in-app élève + panel admin
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email: String(email), type: 'carte_renouvelee', message: '⚠️ Nouvelle carte créée — pensez à finaliser votre paiement', lu: false }),
    });
  } catch(err) { console.error('[notify-carte-renouvellement] notif-eleve error', err); }
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: 'carte_renouvelee', message: `↻ Carte renouvelée ${isAdmin ? 'par l\'admin ' : ''}sans payer — ${_esc((prenom||''))} · ⚠️ Paiement en attente`, lu: false, lien_tab: 'cartes' }),
    });
  } catch(err) { console.error('[notify-carte-renouvellement] notif-admin error', err); }

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `⚠️ Nouvelle carte créée — finalisez votre paiement — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-carte-renouvellement] brevo error', err); }

  // Push FCM élève
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    getFcmTokensForEmail(String(email), _svcKey).then(function(tokens) {
      if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous', body: '⚠️ Nouvelle carte créée — pensez à finaliser votre paiement' }).catch(function(){});
    }).catch(function(){});
  }

  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/carte-paiement — C-pay : paiement carte10 enregistré
// Body: { email, prenom, nom, montant, modePaiement, datePaiement,
//         utilises, restants, expiration, cours }
// ================================================================
async function handleNotifyCartePaiement(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, nom, montant, modePaiement, datePaiement, utilises = 0, restants = 10, expiration } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff = _esc(prenom || '');
  const expiLabel = expiration ? fmtDate(expiration) : '';
  const carteBox  = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">🎫 VOTRE CARTE DE 10 COURS</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#e8f5e9;"><td style="padding:6px 8px;font-weight:700;color:#2e7d32;">✓ Paiement enregistré</td><td style="padding:6px 8px;font-weight:700;color:#2e7d32;text-align:right;">${montant ? montant+'€' : ''} ${_esc(modePaiement||'')}</td></tr>
      ${datePaiement ? `<tr><td style="padding:5px 8px;color:#888;">Date</td><td style="padding:5px 8px;font-weight:700;color:#333;text-align:right;">${fmtDate(datePaiement)}</td></tr>` : ''}
      <tr><td style="padding:5px 8px;color:#888;">Cours utilisés</td><td style="padding:5px 8px;font-weight:700;color:#333;text-align:right;">${utilises}/10</td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Cours restants</td><td style="padding:5px 8px;font-weight:700;color:#2e7d32;text-align:right;">${restants}</td></tr>
      ${expiLabel ? `<tr><td style="padding:5px 8px;color:#888;">Valide jusqu'au</td><td style="padding:5px 8px;font-weight:700;color:#333;text-align:right;">${expiLabel}</td></tr>` : ''}
    </table>
  </div>`;

  // Notif in-app élève
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email: String(email), type: 'carte_paiement', message: `✓ Paiement enregistré · Votre carte est active`, lu: false }),
    });
  } catch(err) { console.error('[notify-carte-paiement] notif error', err); }

  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Paiement enregistré — votre carte est active</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre carte de 10 cours est payée. Bon cours !</p>
      ${carteBox}
      <div style="text-align:center;margin:0 0 22px;"><a href="https://app.tangoetvous.fr" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Accéder à mon espace élève →</a></div>
      ${signEleve}
    </div>${footer}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `✓ Paiement enregistré — votre carte de 10 cours est active — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-carte-paiement] brevo error', err); }

  // Push FCM élève
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    getFcmTokensForEmail(String(email), _svcKey).then(function(tokens) {
      if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous', body: '✓ Paiement enregistré · Votre carte est active' }).catch(function(){});
    }).catch(function(){});
  }

  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/carte-report — C-report : carte reportée saison suivante
// Body: { email, prenom, nom, restants, saisonSuivante }
// ================================================================
async function handleNotifyCarteReport(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, restants = 0, saisonSuivante = '' } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff = _esc(prenom || '');
  const carteBox  = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">🎫 VOTRE CARTE ${_esc(saisonSuivante)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#e8f5e9;"><td style="padding:6px 8px;font-weight:700;color:#2e7d32;">↩ Cours reportés</td><td style="padding:6px 8px;font-weight:700;color:#2e7d32;text-align:right;">${restants} cours préservés</td></tr>
    </table>
  </div>`;

  // Notif in-app élève
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email: String(email), type: 'carte_reportee', message: `↩ Votre carte reportée · ${restants} cours préservés pour ${saisonSuivante}`, lu: false }),
    });
  } catch(err) { console.error('[notify-carte-report] notif error', err); }

  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Vos cours sont reportés sur la prochaine saison</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Vos cours non utilisés ont été reportés sur la saison prochaine. Votre carte vous attend à la rentrée de septembre.</p>
      ${carteBox}
      <div style="text-align:center;margin:0 0 22px;"><a href="https://app.tangoetvous.fr" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Accéder à mon espace élève →</a></div>
      ${signEleve}
    </div>${footer}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `↩ Vos cours sont reportés sur ${saisonSuivante} — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-carte-report] brevo error', err); }

  // Push FCM élève
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    getFcmTokensForEmail(String(email), _svcKey).then(function(tokens) {
      if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous', body: `↩ Votre carte reportée · ${restants} cours préservés pour ${saisonSuivante}` }).catch(function(){});
    }).catch(function(){});
  }

  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/inscription-cours-validee — I02
// Admin valide guidée → statut attente_paiement
// Body: { email, prenom, nom, tel, role, ville, niveau, saison,
//         partenaire?, emailPartenaire?, livretUrl? }
// ================================================================
async function handleNotifyInscriptionCoursValidee(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, nom, tel, role, ville, niveau, saison, partenaire, emailPartenaire, livretUrl, assoConnectUrl = '#' } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff   = _esc(prenom || '');
  const niveauLabel = niveau === 'debutant' ? 'Débutant' : 'Intermédiaire';
  const villeLabel  = ville === 'paris' ? 'Paris' : 'Vincennes';
  const coursLabel  = `${villeLabel} — ${niveauLabel}`;
  const roleColor   = role === 'guideur' ? '#1565c0' : '#c2185b';
  const roleLabel   = role === 'guideur' ? 'Guideur·se' : 'Guidé·e';

  const coursBox = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">VOTRE COURS</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:5px 8px;color:#888;">Cours</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${coursLabel}</td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Saison</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(saison||'')}</td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Rôle</td><td style="padding:5px 8px;text-align:right;"><span style="background:${roleColor};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;">${roleLabel}</span></td></tr>
      <tr><td style="padding:5px 8px;color:#888;">Statut</td><td style="padding:5px 8px;text-align:right;"><span style="background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;">✓ Validé·e</span></td></tr>
      ${partenaire ? `<tr><td style="padding:5px 8px;color:#888;">Partenaire</td><td style="padding:5px 8px;font-weight:700;color:#111;text-align:right;">${_esc(partenaire)}</td></tr>` : ''}
    </table>
  </div>`;

  const soranoBlock = ville === 'vincennes' ? `<div style="background:#fff9c4;border:1px solid #f9a825;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
    <p style="font-size:13px;color:#e65100;font-weight:700;margin:0 0 6px;">🏛 Adhésion à l'Espace Sorano</p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">Les cours à Vincennes ont lieu à l'Espace Sorano. Une adhésion à l'Espace Sorano est demandée. Vous recevrez prochainement les informations pour la régler.</p>
  </div>` : '';

  const quelquesPrec = `<div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
    <p style="font-size:13px;font-weight:700;color:#333;margin:0 0 10px;">Quelques précisions</p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 8px;">Pour finaliser votre inscription, rendez-vous sur AssoConnect pour régler la cotisation et le premier paiement.</p>
    <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">Modes de paiement acceptés : CB (1× ou 3×), espèces, chèque, virement.</p>
  </div>`;

  const livretBtn = livretUrl ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_esc(livretUrl)}" style="display:inline-block;background:#fff;color:#1565c0;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:2px solid #1565c0;">📖 Télécharger le livret ${niveauLabel} ${villeLabel}</a></div>` : '';

  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre demande d'inscription est validée</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Nous avons le plaisir de vous informer que votre demande d'inscription est validée. Pour finaliser votre inscription, veuillez vous rendre sur AssoConnect.</p>
      ${coursBox}
      ${soranoBlock}
      <div style="text-align:center;margin:0 0 22px;"><a href="${_esc(assoConnectUrl)}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Finaliser mon inscription sur AssoConnect →</a></div>
      ${quelquesPrec}
      ${livretBtn}
      ${signEleve}
    </div>${footer}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `✓ Votre demande d'inscription au tango est validée — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-inscription-cours-validee] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/inscription-cours-payee — I03
// Admin valide paiement → statut inscrit
// Body: { email, prenom, nom, ville, niveau, saison, role? }
// ================================================================
async function handleNotifyInscriptionCoursPaye(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const { email, prenom, nom, ville, niveau, saison, role } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);

  const adminEmail  = 'tangoetvous@gmail.com';
  const sbHeaders   = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` };

  // Fetch params ville + dates depuis Supabase
  let villeParams = {}, coursDatesList = {};
  try {
    const keys = [`tev_params_${ville}_${saison}`, 'tev_cours_dates'];
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/parametres?cle=in.(${keys.map(k => '"'+k+'"').join(',')})&select=cle,valeur`, { headers: sbHeaders });
    if (pr.ok) {
      const rows = await pr.json();
      for (const row of rows) {
        const val = typeof row.valeur === 'string' ? JSON.parse(row.valeur) : row.valeur;
        if (row.cle === `tev_params_${ville}_${saison}`) villeParams = val || {};
        else if (row.cle === 'tev_cours_dates') coursDatesList = val || {};
      }
    }
  } catch {}

  // Prochain cours
  const today = new Date().toISOString().slice(0, 10);
  const datesVille = (coursDatesList[ville] || []).filter(d => d >= today).sort();
  const prochainISO = datesVille[0] || '';
  let prochainLabel = '';
  if (prochainISO) {
    const d = new Date(prochainISO + 'T12:00:00Z');
    const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const MOIS  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    prochainLabel = JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  // Horaires + adresse + livret
  const horaires    = villeParams.horaires || {};
  const horaire     = _esc(horaires[niveau] || '');
  const adresse     = villeParams.adresse  || {};
  const adrNom      = _esc(adresse.nom       || '');
  const adrRue      = _esc(adresse.rue       || '');
  const adrTransp   = _esc(adresse.transport || '');
  const livret      = villeParams.livret   || {};
  const livretUrl   = niveau === 'debutant' ? (livret.url_deb || '') : (livret.url_int || '');

  const niveauLabel = niveau === 'debutant' ? 'Débutant' : 'Intermédiaire';
  const villeLabel  = ville === 'paris' ? 'Paris' : 'Vincennes';
  const prenomAff   = _esc(prenom || '');
  const roleBadge   = role === 'guidee'
    ? `<span style="display:inline-block;background:#c2185b;color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">Guidée</span>`
    : `<span style="display:inline-block;background:#1565c0;color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">Guideur·se</span>`;

  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const coursBox = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">VOTRE INSCRIPTION CONFIRMÉE</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:7px 0;color:#555;width:35%;vertical-align:top;">🎓 Cours</td><td style="color:#111;font-weight:700;">${villeLabel} — ${niveauLabel}</td></tr>
      ${prochainLabel ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📅 Prochain cours</td><td style="color:#111;font-weight:700;">${_esc(prochainLabel)}</td></tr>` : ''}
      ${horaire ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🕐 Heure</td><td style="color:#111;font-weight:700;">${horaire}</td></tr>` : ''}
      ${adrNom ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">📍 Lieu</td><td style="color:#111;font-weight:700;">${adrNom}${adrRue ? `<br/><span style="font-size:13px;font-weight:400;color:#444;">${adrRue}${adrTransp ? ' · ' + adrTransp : ''}</span>` : ''}</td></tr>` : ''}
      ${role ? `<tr><td style="padding:7px 0;color:#555;vertical-align:top;">🎯 Votre rôle</td><td style="padding:4px 0;">${roleBadge}</td></tr>` : ''}
      <tr><td style="padding:7px 0;color:#555;vertical-align:top;">✓ Statut</td><td><span style="display:inline-block;background:#2e7d32;color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;">✓ Inscrit·e</span></td></tr>
    </table>
  </div>`;

  const pwaSection = `<div style="background:#f4f0ff;border:2px solid #7c4dff;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#7c4dff;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #d1c4e9;">📱 VOTRE ESPACE ÉLÈVE — TANGO &amp; VOUS</div>
    <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 14px;">Suivez vos cours, consultez votre agenda et vos publications depuis votre téléphone en ajoutant l'appli Tango &amp; Vous à votre écran d'accueil.</p>
    <div style="background:#fff;border-radius:8px;padding:12px 16px;margin:0 0 10px;border:1px solid #e0d7ff;">
      <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:8px;">🍎 Sur iPhone (Safari uniquement)</div>
      <ol style="font-size:13px;color:#444;line-height:2.0;padding-left:18px;margin:0;">
        <li>Ouvrez le lien ci-dessous dans <strong>Safari</strong> (pas Chrome)</li>
        <li>Appuyez sur l'icône <strong>Partager</strong> ⬆ en bas de l'écran</li>
        <li>Faites défiler et choisissez <strong>"Sur l'écran d'accueil"</strong></li>
        <li>Tapez <strong>"Ajouter"</strong></li>
      </ol>
    </div>
    <div style="background:#fff;border-radius:8px;padding:12px 16px;margin:0 0 16px;border:1px solid #e0d7ff;">
      <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:8px;">🤖 Sur Android (Chrome)</div>
      <ol style="font-size:13px;color:#444;line-height:2.0;padding-left:18px;margin:0;">
        <li>Ouvrez le lien ci-dessous dans <strong>Chrome</strong></li>
        <li>Appuyez sur le menu <strong>⋮</strong> (trois points en haut à droite)</li>
        <li>Choisissez <strong>"Ajouter à l'écran d'accueil"</strong> ou <strong>"Installer l'application"</strong></li>
        <li>Confirmez en appuyant sur <strong>"Ajouter"</strong></li>
      </ol>
    </div>
    <div style="text-align:center;">
      <a href="https://app.tangoetvous.fr" style="display:inline-block;background:#7c4dff;color:#fff;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">🎵 Accéder à mon espace élève</a>
    </div>
    <p style="font-size:12px;color:#888;text-align:center;margin:10px 0 0;">Entrez votre adresse email pour recevoir votre lien de connexion.</p>
  </div>`;

  const livretBtn = livretUrl ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_esc(livretUrl)}" style="display:inline-block;background:#fff;color:#1565c0;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:2px solid #1565c0;">📖 Télécharger le livret ${niveauLabel} ${villeLabel}</a></div>` : '';

  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Inscription confirmée — bienvenue dans nos cours !</span></div>
    <div style="padding:30px 28px;">
      <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${prenomAff}</strong>,</p>
      <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">Nous avons bien reçu votre paiement sur AssoConnect. Votre inscription est confirmée — nous vous attendons pour le prochain cours !</p>
      ${coursBox}
      ${pwaSection}
      ${livretBtn}
      ${signEleve}
    </div>${footer}`);

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `✓ Votre inscription au tango est confirmée — à bientôt !`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-inscription-cours-payee] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/email-change — admin met à jour l'email d'un élève
// Body: { oldEmail, newEmail, prenom, nom }
// Envoyé à newEmail pour informer l'élève et expliquer comment se reconnecter
// ================================================================
async function handleNotifyEmailChange(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const { oldEmail, newEmail, prenom, nom } = body;
  if (!newEmail || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);

  const adminEmail  = 'tangoetvous@gmail.com';
  const prenomAff   = _esc(prenom || '');
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const emailBox = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #b3d9f5;">MODIFICATION D'ADRESSE EMAIL</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${oldEmail ? `<tr><td style="padding:7px 0;color:#888;width:40%;vertical-align:top;">Ancienne adresse</td><td style="padding:7px 0;color:#999;text-decoration:line-through;">${_esc(oldEmail)}</td></tr>` : ''}
      <tr><td style="padding:7px 0;color:#555;vertical-align:top;">Nouvelle adresse</td><td style="padding:7px 0;color:#2e7d32;font-weight:700;">${_esc(newEmail)}</td></tr>
    </table>
  </div>`;

  const reconnectBox = `<div style="background:#f4f0ff;border:2px solid #7c4dff;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#7c4dff;margin-bottom:12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #d1c4e9;">📱 COMMENT SE RECONNECTER</div>
    <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 12px;">Pour accéder à votre espace élève avec votre nouvelle adresse :</p>
    <ol style="font-size:14px;color:#444;line-height:2.0;padding-left:20px;margin:0 0 16px;">
      <li>Ouvrez <strong>app.tangoetvous.fr</strong></li>
      <li>Entrez votre nouvelle adresse email : <strong style="color:#7c4dff;">${_esc(newEmail)}</strong></li>
      <li>Cliquez sur le lien reçu dans cette boîte mail</li>
    </ol>
    <div style="text-align:center;">
      <a href="https://app.tangoetvous.fr" style="display:inline-block;background:#7c4dff;color:#fff;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">🎵 Accéder à mon espace élève</a>
    </div>
  </div>`;

  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">📋 Votre adresse email a été mise à jour</span></div>
    <div style="padding:30px 28px;">
      <p style="font-size:16px;margin:0 0 18px;">Bonjour <strong style="color:#B8962E;">${prenomAff}</strong>,</p>
      <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 22px;">L'adresse email associée à votre espace élève Tango &amp; Vous a été mise à jour. Utilisez désormais cette nouvelle adresse pour vous connecter.</p>
      ${emailBox}
      ${reconnectBox}
      ${signEleve}
    </div>${footer}`);

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Tango & Vous', email: adminEmail },
        to: [{ email: String(newEmail) }],
        subject: `📋 Votre adresse email a été mise à jour — Tango & Vous`,
        htmlContent: htmlEleve,
      }),
    });
  } catch(err) { console.error('[notify-email-change] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/inscription-cours-modifiee — I04
// Admin modifie le cours d'un élève inscrit
// Body: { email, prenom, nom, ancienCours, nouveauCours, ville, niveau }
// ================================================================
async function handleNotifyInscriptionCoursModifiee(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, ancienCours, nouveauCours } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff = _esc(prenom || '');
  const coursBox  = `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">📋 MODIFICATION DE VOTRE INSCRIPTION</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${ancienCours ? `<tr><td style="padding:5px 8px;color:#888;">Ancien cours</td><td style="padding:5px 8px;color:#c62828;text-decoration:line-through;text-align:right;">${_esc(ancienCours)}</td></tr>` : ''}
      <tr><td style="padding:5px 8px;color:#888;">Nouveau cours</td><td style="padding:5px 8px;font-weight:700;color:#2e7d32;text-align:right;">${_esc(nouveauCours||'')}</td></tr>
    </table>
  </div>`;
  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">📋 Votre inscription a été modifiée</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre inscription a été modifiée. Voici le récapitulatif des changements.</p>
      ${coursBox}
      <div style="text-align:center;margin:0 0 22px;"><a href="mailto:${adminEmail}" style="display:inline-block;background:#fff;color:#555;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:2px solid #999;">Nous contacter</a></div>
      ${signEleve}
    </div>${footer}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `📋 Votre inscription a été modifiée — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-inscription-cours-modifiee] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ── Helper : vérifier si le JWT est admin ───────────────────────
async function checkAdminJwt(jwt, env) {
  try {
    const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const email = payload.email;
    if (!email) return false;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/eleves?email=eq.${encodeURIComponent(email)}&role=eq.admin&select=email&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

// ================================================================
// POST /api/notify/inscription-stage
// S0 (admin), S1/S1b (confirmé), S2 (attente guidée) + notif panel
// Body: { email, prenom, nom, tel, role, statut, saison,
//         inscriptionsParDate: [{date, slots:[{type,theme,horaire_debut,horaire_fin}], tarif}],
//         partEmail?, partPrenom?, partNom?, emailPartage? }
// ================================================================
async function handleNotifyInscriptionStage(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const MOIS_CT = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }
  function fmtDateCourt(iso) { const d = new Date(iso+'T12:00:00'); return d.getDate()+' '+MOIS_CT[d.getMonth()]; }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const headerAdmin = `<div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;"><div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Nouvelle inscription stage</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, nom, tel, role, statut, saison, inscriptionsParDate = [], partEmail, partPrenom, partNom, emailPartage } = body;
  const prenomAff = _esc(prenom || '');
  const nomAff    = _esc((prenom||'')+' '+(nom||'')).trim();
  const isConfirme = (statut === 'confirme');
  const isPartage  = !!emailPartage;

  // Build stage-box HTML for a given list of dates + slots
  function buildStageBox(dates, prenomLabel, nomLabel, roleLabel) {
    let html = '';
    for (const d of dates) {
      const dateLabel = fmtDate(d.date);
      const slots = d.slots || [];
      const total = d.tarif || 0;
      html += `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 18px;">`;
      html += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:10px;font-weight:700;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">📅 ${dateLabel}</div>`;
      if (prenomLabel) html += `<p style="font-size:13px;color:#333;font-weight:700;margin:0 0 8px;">${_esc(prenomLabel)} ${_esc(nomLabel||'')} — <span style="color:#1565c0;">${_esc(roleLabel||'')}</span></p>`;
      for (const sl of slots) {
        html += `<div style="font-size:13px;color:#444;margin:0 0 4px;">• ${_esc(sl.horaire_debut||'')}–${_esc(sl.horaire_fin||'')} — ${_esc(sl.theme||sl.type||'')}</div>`;
      }
      if (total) html += `<p style="font-size:13px;color:#1565c0;font-weight:700;margin:8px 0 0;">Prix : ${total}€</p>`;
      html += `</div>`;
    }
    return html;
  }

  // Notif panel admin
  const dateLabels = inscriptionsParDate.map(d => fmtDateCourt(d.date)).join(' · ');
  const statutLabel = isConfirme ? '✓ Confirmé·e' : '⏳ Att. validation — parité';
  const notifBg     = isConfirme ? '#0f1f0f' : '#1f1800';
  const notifBorder = isConfirme ? '#4caf50' : '#e8c84a';
  const notifMsg    = `🎭 ${isConfirme ? 'Inscription' : 'Demande'} stage — ${nomAff} · ${dateLabels} · ${statutLabel}`;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: 'stage_inscription', message: notifMsg, lu: false, lien_tab: 'stages' }),
    });
  } catch(err) { console.error('[notify-stage] notif error', err); }

  if (!env.BREVO_API_KEY) return corsResponse({ ok: true, notified: true }, 200, {}, request);

  async function sendMail(to, subj, html) {
    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(to) }], subject: subj, htmlContent: html }),
      });
    } catch(err) { console.error('[notify-stage] sendMail error', err); }
  }

  // S0 — admin email
  const firstDate = inscriptionsParDate[0] || {};
  const allSlots  = (firstDate.slots||[]).map(sl => `${sl.horaire_debut||''}–${sl.horaire_fin||''} : ${sl.theme||sl.type||''}`).join('<br/>');
  const htmlAdmin = wrap(`${headerAdmin}
    <div style="padding:20px 24px;">
      <div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <div style="background:#D4AF37;padding:10px 16px;display:flex;align-items:center;gap:12px;">
          <div style="flex:1;">
            <div style="font-size:18px;font-weight:700;color:#111;">${nomAff}</div>
            <div style="font-size:12px;color:#333;margin-top:2px;">${_esc(email||'')} · ${_esc(tel||'')}</div>
          </div>
          <span style="display:inline-block;background:${isConfirme?'#2e7d32':'#e65100'};color:#fff;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">${isConfirme?'✓ Confirmé·e':'⏳ Attente'}</span>
        </div>
        <div style="background:#fffdf8;padding:14px 16px;">
          <div style="font-size:14px;font-weight:700;color:#111;margin-bottom:6px;">🎭 Stage · ${dateLabels}</div>
          <div style="font-size:13px;color:#333;margin-bottom:4px;">Rôle : ${_esc(role||'')}</div>
          <div style="font-size:13px;color:#333;">${allSlots}</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="tel:${_esc(tel||'')}" style="background:#1565c0;color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">📞 Appeler</a>
        <a href="mailto:${_esc(email||'')}" style="background:#555;color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">✉️ Gmail</a>
        <a href="https://app.tangoetvous.fr/admin.html#stages" style="background:#D4AF37;color:#111;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">Ouvrir l'admin</a>
      </div>
    </div>${footer}`);
  await sendMail(adminEmail, `🎭 Inscription stage — ${nomAff} · ${dateLabels}`, htmlAdmin);

  // S1/S1b ou S2 — email élève
  const today    = new Date().toISOString().slice(0,10);
  const daysUntil = inscriptionsParDate.length > 0
    ? Math.round((new Date(inscriptionsParDate[0].date+'T12:00:00') - new Date(today+'T12:00:00')) / 86400000)
    : 99;
  const proche   = daysUntil <= 3;

  if (isConfirme) {
    const bandeau = proche
      ? `<div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre inscription au stage est confirmée</span></div>`
      : `<div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Votre inscription au stage est confirmée</span></div>`;
    const rappelNote = proche ? '' : `<p style="font-size:13px;color:#555;text-align:center;margin:0 0 20px;">Vous recevrez un rappel 3 jours avant le stage.</p>`;
    const _s1bFirstDate = inscriptionsParDate[0]?.date || '';
    const _s1bToken = _s1bFirstDate ? (await _calHmac(String(email) + ':' + _s1bFirstDate, SUPABASE_ANON)).slice(0, 32) : '';
    const _s1bConfirmUrl = _s1bFirstDate ? `https://app.tangoetvous.fr/api/stages/confirmer?email=${encodeURIComponent(String(email))}&date=${_s1bFirstDate}&token=${_s1bToken}` : '#';
    const confirmBtn = proche ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_s1bConfirmUrl}" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">👍 Je confirme ma présence</a></div>` : '';
    const stageBoxHtml = buildStageBox(inscriptionsParDate, null, null, null);
    const htmlEleve = wrap(`${headerEleve}${bandeau}
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre inscription au stage Tango &amp; Vous est bien enregistrée. Voici le récapitulatif.</p>
        ${stageBoxHtml}
        ${confirmBtn}
        ${rappelNote}
        <p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 20px;">Le règlement se fait sur place. Merci de prévoir l'appoint.</p>
        ${signEleve}
      </div>${footer}`);
    const firstDateLabel = fmtDate(inscriptionsParDate[0]?.date || today);
    await sendMail(String(email), `🎭 Votre inscription au stage du ${firstDateLabel} — Tango & Vous`, htmlEleve);
  } else {
    // S2 — attente guidée
    const stageBoxHtml = buildStageBox(inscriptionsParDate, null, null, null);
    const htmlEleve = wrap(`${headerEleve}
      <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;"><span style="font-size:14px;font-weight:700;color:#e65100;">⏳ Votre demande d'inscription est enregistrée</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        ${stageBoxHtml}
        <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:16px 20px;margin:0 0 22px;">
          <p style="font-size:14px;color:#bf360c;font-weight:700;margin:0 0 8px;">⏳ En attente de validation</p>
          <p style="font-size:13px;color:#444;line-height:1.7;margin:0;">Nous veillons à avoir autant de guideurs que de guidées. Votre inscription sera confirmée selon l'équilibre des inscrits.</p>
        </div>
        <div style="text-align:center;margin:0 0 22px;"><a href="mailto:${adminEmail}" style="display:inline-block;background:#fff;color:#555;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border:2px solid #999;">Nous contacter</a></div>
        ${signEleve}
      </div>${footer}`);
    const firstDateLabel = fmtDate(inscriptionsParDate[0]?.date || today);
    await sendMail(String(email), `🎭 Votre demande d'inscription au stage du ${firstDateLabel} — Tango & Vous`, htmlEleve);
  }

  // Push FCM admin
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    getFcmTokensAdmin(_svcKey).then(function(tokens) {
      if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous — Admin', body: `🎭 Inscription stage — ${nomAff} · ${inscriptionsParDate[0] ? fmtDateCourt(inscriptionsParDate[0].date) : ''}` }).catch(function(){});
    }).catch(function(){});
  }

  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/cron/rappel-stage-j3 — S4 : rappel J-3 avant chaque stage
// Lit inscriptions_stages confirmées dont stage_date = dans 3 jours
// ================================================================
async function handleCronRappelStageJ3(request, env) {
  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const d3 = new Date(); d3.setDate(d3.getDate()+3);
  const targetDate = d3.toISOString().slice(0,10);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inscriptions_stages?stage_date=eq.${targetDate}&type_confirmation=eq.confirme&select=email,prenom,nom,role,donnees`,
    { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  const inscrits = await res.json();

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  let sent = 0;
  for (const e of inscrits) {
    if (!e.email || !env.BREVO_API_KEY) continue;
    const prenomAff = _esc(e.prenom || '');
    const dateLabel = fmtDate(targetDate);
    const donnees   = typeof e.donnees === 'string' ? JSON.parse(e.donnees||'{}') : (e.donnees||{});
    const slots     = donnees.stagesDetail || [];
    let slotsHtml   = '';
    for (const sl of slots) {
      slotsHtml += `<div style="font-size:13px;color:#444;margin:0 0 4px;">• ${_esc(sl.horaire||'')} — ${_esc(sl.theme||sl.type||'')}</div>`;
    }
    const stageBox = `<div style="background:#e3f2fd;border:2px solid #1565c0;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;margin-bottom:10px;font-weight:700;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">📅 ${dateLabel}</div>
      ${slotsHtml || '<div style="font-size:13px;color:#444;">Stage Tango &amp; Vous</div>'}
    </div>`;
    const _s4Token = (await _calHmac(String(e.email) + ':' + targetDate, SUPABASE_ANON)).slice(0, 32);
    const _s4ConfirmUrl = `https://app.tangoetvous.fr/api/stages/confirmer?email=${encodeURIComponent(String(e.email))}&date=${targetDate}&token=${_s4Token}`;
    const htmlEleve = wrap(`${headerEleve}
      <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">🗓 Rappel — votre stage a lieu dans 3 jours !</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        ${stageBox}
        <div style="text-align:center;margin:0 0 22px;"><a href="${_s4ConfirmUrl}" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">👍 Je confirme ma présence</a></div>
        <div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
          <p style="font-size:13px;color:#555;line-height:1.7;margin:0;">Merci de confirmer votre présence. Si vous devez annuler votre venue merci de nous prévenir, même au dernier moment car nous faisons en sorte d'avoir la parité guideurs/guidées.</p>
        </div>
        ${signEleve}
      </div>${footer}`);
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(e.email) }], subject: `🗓 Rappel stage du ${dateLabel} — Tango & Vous`, htmlContent: htmlEleve }),
      });
      if (r.ok) sent++;
    } catch(err) { console.error('[cron-rappel-stage-j3] error', err); }
  }
  return corsResponse({ ok: true, sent, checked: inscrits.length, targetDate }, 200, {}, request);
}

// ================================================================
// POST /api/notify/stage-valide — S3/S3b : admin valide attente → confirme
// Body: { email, prenom, nom, role, inscriptionsParDate, daysUntil }
// ================================================================
async function handleNotifyStageValide(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, nom, role, inscriptionsParDate = [], daysUntil = 99 } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff  = _esc(prenom || '');
  const proche     = daysUntil <= 3;
  let slotsHtml = '';
  for (const d of inscriptionsParDate) {
    const dateLabel = fmtDate(d.date);
    slotsHtml += `<div style="background:#e8f4fd;border:2px solid #1565c0;border-radius:10px;padding:14px 18px;margin:0 0 16px;">`;
    slotsHtml += `<div style="font-size:10px;text-transform:uppercase;color:#1565c0;font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #b3d9f5;">📅 ${dateLabel}</div>`;
    for (const sl of (d.slots||[])) {
      slotsHtml += `<div style="font-size:13px;color:#444;margin:0 0 3px;">• ${_esc(sl.horaire_debut||'')}–${_esc(sl.horaire_fin||'')} — ${_esc(sl.theme||sl.type||'')}</div>`;
    }
    if (d.tarif) slotsHtml += `<p style="font-size:13px;color:#1565c0;font-weight:700;margin:8px 0 0;">Prix : ${d.tarif}€</p>`;
    slotsHtml += `</div>`;
  }
  const _s3bFirstDate = inscriptionsParDate[0]?.date || '';
  const _s3bToken = proche && _s3bFirstDate ? (await _calHmac(String(email) + ':' + _s3bFirstDate, SUPABASE_ANON)).slice(0, 32) : '';
  const _s3bConfirmUrl = proche && _s3bFirstDate ? `https://app.tangoetvous.fr/api/stages/confirmer?email=${encodeURIComponent(String(email))}&date=${_s3bFirstDate}&token=${_s3bToken}` : '#';
  const confirmBtn = proche ? `<div style="text-align:center;margin:0 0 22px;"><a href="${_s3bConfirmUrl}" style="display:inline-block;background:#2e7d32;color:#fff;padding:15px 36px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">👍 Je confirme ma présence</a></div>` : '';
  const rappelNote = proche ? '' : `<p style="font-size:13px;color:#555;text-align:center;margin:0 0 20px;">Vous recevrez un rappel 3 jours avant le stage.</p>`;
  const firstDateLabel = inscriptionsParDate[0] ? fmtDate(inscriptionsParDate[0].date) : '';
  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#e8f5e9;padding:14px 24px;text-align:center;border-bottom:1px solid #c8e6c9;"><span style="font-size:14px;font-weight:700;color:#2e7d32;">✓ Bonne nouvelle — votre place au stage est confirmée !</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Suite à l'évolution des inscriptions, nous avons le plaisir de vous confirmer votre place au stage.</p>
      ${slotsHtml}
      ${confirmBtn}
      ${rappelNote}
      <p style="font-size:13px;color:#555;margin:0 0 20px;">Le règlement se fait sur place. Merci de prévoir l'appoint.</p>
      ${signEleve}
    </div>${footer}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `🎭 Bonne nouvelle — votre place au stage du ${firstDateLabel} est confirmée ! — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-stage-valide] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/stage-annule — S-cancel : admin annule une inscription stage
// Body: { email, prenom, nom, inscriptionsParDate }
// ================================================================
async function handleNotifyStageAnnule(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const MOIS_L  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_L = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  function fmtDate(iso) { const d = new Date(iso+'T12:00:00'); return JOURS_L[d.getDay()]+' '+d.getDate()+' '+MOIS_L[d.getMonth()]+' '+d.getFullYear(); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, inscriptionsParDate = [] } = body;
  if (!email || !env.BREVO_API_KEY) return corsResponse({ ok: false }, 200, {}, request);
  const prenomAff = _esc(prenom || '');
  let slotsHtml = '';
  for (const d of inscriptionsParDate) {
    slotsHtml += `<div style="background:#ffebee;border:2px solid #c62828;border-radius:10px;padding:14px 18px;margin:0 0 16px;">
      <div style="font-size:10px;text-transform:uppercase;color:#c62828;font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #ef9a9a;">✕ STAGE ANNULÉ — ${fmtDate(d.date)}</div>
      ${(d.slots||[]).map(sl => `<div style="font-size:13px;color:#777;text-decoration:line-through;margin:0 0 3px;">${_esc(sl.horaire_debut||'')}–${_esc(sl.horaire_fin||'')} — ${_esc(sl.theme||sl.type||'')}</div>`).join('')}
    </div>`;
  }
  const firstDateLabel = inscriptionsParDate[0] ? fmtDate(inscriptionsParDate[0].date) : '';
  const htmlEleve = wrap(`${headerEleve}
    <div style="background:#ffebee;padding:14px 24px;text-align:center;border-bottom:1px solid #ef9a9a;"><span style="font-size:14px;font-weight:700;color:#c62828;">✕ Votre inscription au stage a été annulée</span></div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Votre inscription au stage a été annulée. Voici le récapitulatif des créneaux concernés.</p>
      ${slotsHtml}
      <div style="text-align:center;margin:0 0 22px;"><a href="https://app.tangoetvous.fr/stages-pwa.html" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Voir les prochains stages →</a></div>
      ${signEleve}
    </div>${footer}`);
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(email) }], subject: `✕ Votre inscription au stage du ${firstDateLabel} a été annulée — Tango & Vous`, htmlContent: htmlEleve }),
    });
  } catch(err) { console.error('[notify-stage-annule] error', err); }
  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/notify/cours-particulier — CP0 (admin) + CP1 (élève) + notif panel
// Body: { email, prenom, nom, tel, prof, duree, lieu, objectifs,
//         niveauEleve, dispoTexte, remarque, urgence }
// ================================================================
async function handleNotifyCoursParticulier(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'JSON invalide'); }

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerAdmin = `<div style="background:#111;padding:16px 24px;text-align:center;border-bottom:4px solid #D4AF37;"><div style="font-size:13px;font-weight:700;letter-spacing:4px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:9px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:3px;">Nouvelle demande cours particulier</div></div>`;
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = h => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${h}</div></body></html>`;

  const { email, prenom, nom, tel, prof, duree, lieu, objectifs, niveauEleve, dispoTexte, remarque, urgence } = body;
  const nomAff    = _esc((prenom||'')+' '+(nom||'')).trim();
  const prenomAff = _esc(prenom || '');

  // Notif panel admin
  const urgBadge = urgence === 'haute' ? ' · Urgence haute' : '';
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ type: 'cours_particulier', message: `🎯 Cours particulier — ${nomAff}${urgBadge} · ⏳ À traiter`, lu: false, lien_tab: 'cours-particuliers' }),
    });
  } catch(err) { console.error('[notify-cp] notif error', err); }

  if (!env.BREVO_API_KEY) return corsResponse({ ok: true, notified: true }, 200, {}, request);

  async function sendMail(to, subj, html) {
    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { name: 'Tango & Vous', email: adminEmail }, to: [{ email: String(to) }], subject: subj, htmlContent: html }),
      });
    } catch(err) { console.error('[notify-cp] sendMail error', err); }
  }

  function row(label, val) {
    if (!val) return '';
    return `<tr><td style="padding:6px 10px;font-size:12px;color:#888;width:140px;vertical-align:top;">${label}</td><td style="padding:6px 10px;font-size:13px;color:#222;white-space:pre-wrap;">${_esc(String(val))}</td></tr>`;
  }

  const urgStyle = urgence === 'haute' ? 'display:inline-block;background:#c62828;color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px;margin-left:8px;' : '';
  const urgSpan  = urgence === 'haute' ? `<span style="${urgStyle}">URGENCE HAUTE</span>` : '';

  // CP0 — admin
  const htmlAdmin = wrap(`${headerAdmin}
    <div style="padding:20px 24px;">
      <div style="border:2px solid #D4AF37;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <div style="background:#D4AF37;padding:10px 16px;">
          <div style="font-size:18px;font-weight:700;color:#111;">${nomAff} ${urgSpan}</div>
          <div style="font-size:12px;color:#333;margin-top:2px;">${_esc(email||'')} · ${_esc(tel||'')}</div>
        </div>
        <div style="background:#fffdf8;padding:0;">
          <table style="width:100%;border-collapse:collapse;">
            ${row('Professeur', prof)}
            ${row('Durée', duree)}
            ${row('Niveau', niveauEleve)}
            ${row('Lieu', lieu)}
            ${row('Objectifs', objectifs)}
            ${row('Disponibilités', dispoTexte)}
            ${row('Remarques', remarque)}
          </table>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="tel:${_esc(tel||'')}" style="background:#1565c0;color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">📞 Appeler</a>
        <a href="mailto:${_esc(email||'')}" style="background:#555;color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">✉️ Gmail</a>
        <a href="sms:${_esc(tel||'')}" style="background:#388e3c;color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">💬 SMS</a>
        <a href="https://app.tangoetvous.fr/admin.html#cours-particuliers" style="background:#D4AF37;color:#111;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">Ouvrir l'admin</a>
      </div>
    </div>${footer}`);
  await sendMail(adminEmail, `🎯 Cours particulier — ${nomAff}${urgBadge}`, htmlAdmin);

  // CP1 — élève (accusé réception)
  if (email) {
    const cpBox = `<div style="background:#ede7f6;border:2px solid #7b1fa2;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#7b1fa2;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #ce93d8;">VOTRE DEMANDE</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Professeur', prof)}
        ${row('Durée', duree)}
        ${row('Lieu', lieu)}
        ${row('Objectifs', objectifs)}
        ${row('Disponibilités', dispoTexte)}
        ${row('Remarques', remarque)}
      </table>
    </div>`;
    const htmlEleve = wrap(`${headerEleve}
      <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;"><span style="font-size:14px;font-weight:700;color:#1565c0;">📋 Votre demande est bien enregistrée</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 22px;">Nous avons bien reçu votre demande de cours particulier. Voici le récapitulatif.</p>
        ${cpBox}
        <div style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
          <p style="font-size:14px;color:#2e7d32;font-weight:700;margin:0 0 6px;">Prochaine étape</p>
          <p style="font-size:13px;color:#444;line-height:1.7;margin:0;">Nous vous contactons dans les meilleurs délais pour convenir d'un créneau.</p>
        </div>
        <p style="font-size:13px;color:#555;text-align:center;margin:0 0 6px;">📞 07 73 27 59 06</p>
        <p style="font-size:13px;color:#555;text-align:center;margin:0 0 22px;"><a href="mailto:${adminEmail}" style="color:#B8962E;">${adminEmail}</a></p>
        ${signEleve}
      </div>${footer}`);
    await sendMail(String(email), `📋 Votre demande de cours particulier — Tango & Vous`, htmlEleve);
  }

  // Push FCM admin
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    const _svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
    getFcmTokensAdmin(_svcKey).then(function(tokens) {
      if (tokens.length) sendFcmPush(env, tokens, { title: 'Tango & Vous — Admin', body: `🎯 Cours particulier — ${nomAff}${urgBadge}` }).catch(function(){});
    }).catch(function(){});
  }

  return corsResponse({ ok: true }, 200, {}, request);
}

// ================================================================
// POST /api/cron/fin-saison-c4 — rappel fin de saison (C4)
// Déclenché le lendemain du dernier cours Paris de juin
// Cron quotidien 20-30 juin — le handler vérifie si hier = dernier cours Paris de juin
// ================================================================
async function handleCronFinSaisonC4(request, env) {
  const now = new Date();
  const yr = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1; // 1-based
  const sai = mo >= 9 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
  const saiNext = mo >= 9 ? `${yr + 1}-${yr + 2}` : `${yr}-${yr + 1}`;
  const anneeFin = parseInt(sai.split('-')[1]); // ex: 2026 pour saison 2025-2026

  // Lire le body pour override force (workflow_dispatch manuel)
  let bodyForce = false;
  try {
    const bt = await request.text();
    if (bt) { const parsed = JSON.parse(bt); bodyForce = parsed.force === true; }
  } catch(e) {}

  const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;

  // Fetch tev_liens_assoconnect + tev_cours_dates depuis parametres
  let lienCours = '';
  let coursDatesParis = [];
  try {
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/parametres?cle=in.(tev_liens_assoconnect,tev_cours_dates)&select=cle,valeur`,
      { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (pr.ok) {
      const rows = await pr.json();
      for (const row of rows) {
        if (row.cle === 'tev_liens_assoconnect') {
          const liens = row.valeur || {};
          lienCours = (liens[saiNext] || {}).cours || (liens[saiNext] || {}).renouv || '';
        }
        if (row.cle === 'tev_cours_dates') {
          coursDatesParis = Array.isArray((row.valeur || {}).paris) ? row.valeur.paris : [];
        }
      }
    } else { console.error('[cron fin-saison-c4] Supabase params error', await pr.text()); }
  } catch(e) { console.error('[cron fin-saison-c4] fetch params error', e); }

  // Vérifier si hier = dernier cours Paris de juin (sauf si force=true)
  if (!bodyForce) {
    const parisOffset = now.getUTCMonth() >= 2 && now.getUTCMonth() <= 9 ? 2 : 1;
    const parisDt = new Date(now.getTime() + parisOffset * 3600 * 1000);
    const yesterdayISO = new Date(parisDt.getTime() - 86400000).toISOString().slice(0, 10);
    const juneDates = coursDatesParis.filter(d => d.startsWith(`${anneeFin}-06`)).sort();
    const lastJune = juneDates.length ? juneDates[juneDates.length - 1] : null;
    if (!lastJune) {
      return corsResponse({ ok: true, skipped: true, reason: 'no_june_dates_in_params' }, 200, {}, request);
    }
    if (lastJune !== yesterdayISO) {
      return corsResponse({ ok: true, skipped: true, reason: 'not_the_day', lastJune, yesterdayISO }, 200, {}, request);
    }
  }

  // Fetch élèves avec des cours restants et un statut de carte actif
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eleves?carte_restants=gt.0&carte_statut=in.(Active,Nouvelle carte)&saison=eq.${encodeURIComponent(sai)}&select=email,prenom,nom,carte_restants,carte_statut`,
    { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
  );
  if (!res.ok) {
    console.error('[cron fin-saison-c4] Supabase eleves error', await res.text());
    return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  }
  const eleves = await res.json();

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;
  const btnLienHref = lienCours || 'https://www.tangoetvous.com';

  let sent = 0;
  for (const e of eleves) {
    const prenomAff = _esc(e.prenom || (e.nom || '').split(' ')[0] || '');
    const restants  = e.carte_restants || 0;
    const notifMsg  = `📅 Il vous reste ${restants} cours — reportez votre carte sur la saison ${saiNext}`;

    // Notif in-app élève
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email: e.email, type: 'fin_saison_c4', message: notifMsg, lu: false }),
      });
    } catch(err) { console.error('[cron fin-saison-c4] notif error', err); }

    if (!env.BREVO_API_KEY) continue;

    // Email élève (C4)
    const htmlEleve = wrap(`${headerEleve}
      <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;">
        <span style="font-size:14px;font-weight:700;color:#1565c0;">📅 Fin de saison — vos cours non utilisés</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 22px;">Il vous reste <strong>${restants} cours</strong> sur votre carte de 10 cours de la saison en cours.</p>
        <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 22px;">Les pré-inscriptions pour la saison ${saiNext} sont ouvertes. Réglez simplement l'adhésion à notre association avant le 25 août ${anneeFin} sur AssoConnect pour reporter les cours de votre carte à la saison prochaine.</p>
        <div style="background:#fff3e0;border:2px solid #e65100;border-radius:10px;padding:16px 20px;margin:0 0 24px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#e65100;margin-bottom:10px;font-weight:700;">Votre carte</div>
          <div style="font-size:22px;font-weight:700;color:#c62828;">${restants} cours restant${restants > 1 ? 's' : ''}</div>
          <div style="font-size:13px;color:#bf360c;margin-top:6px;">À reporter avant le 31 août ${anneeFin}</div>
        </div>
        <p style="text-align:center;margin:0 0 28px;"><a href="${_esc(btnLienHref)}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Reportez votre carte → Réglez votre adhésion de la saison prochaine</a></p>
        ${signEleve}
      </div>${footer}`);

    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Tango & Vous', email: adminEmail },
          to: [{ email: String(e.email) }],
          subject: `📅 Il vous reste ${restants} cours — reportez votre carte sur la saison ${saiNext}`,
          htmlContent: htmlEleve,
        }),
      });
      if (r.ok) sent++; else console.error('[cron fin-saison-c4] Brevo error', e.email, await r.text());
    } catch(err) { console.error('[cron fin-saison-c4] fetch error', err); }
  }

  return corsResponse({ ok: true, sent, checked: eleves.length, saison: sai, saiNext }, 200, {}, request);
}

// ================================================================
// POST /api/cron/fin-saison-c5 — dernier rappel 25 août (C5)
// Planifié au 25 août — ton d'urgence
// ================================================================
async function handleCronFinSaisonC5(request, env) {
  const now = new Date();
  const yr = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const sai = mo >= 9 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
  const saiNext = mo >= 9 ? `${yr + 1}-${yr + 2}` : `${yr}-${yr + 1}`;
  const anneeFin = parseInt(sai.split('-')[1]);

  const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;

  // Fetch tev_liens_assoconnect depuis parametres
  let lienCours = '';
  try {
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/parametres?cle=eq.tev_liens_assoconnect&select=valeur`,
      { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (pr.ok) {
      const rows = await pr.json();
      if (rows.length && rows[0].valeur) {
        const liens = rows[0].valeur || {};
        lienCours = (liens[saiNext] || {}).cours || (liens[saiNext] || {}).renouv || '';
      }
    } else { console.error('[cron fin-saison-c5] Supabase params error', await pr.text()); }
  } catch(e) { console.error('[cron fin-saison-c5] fetch params error', e); }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eleves?carte_restants=gt.0&carte_statut=in.(Active,Nouvelle carte)&saison=eq.${encodeURIComponent(sai)}&select=email,prenom,nom,carte_restants,carte_statut`,
    { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
  );
  if (!res.ok) {
    console.error('[cron fin-saison-c5] Supabase eleves error', await res.text());
    return corsResponse({ ok: false, error: 'Supabase query failed' }, 500, {}, request);
  }
  const eleves = await res.json();

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const signEleve   = `<p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia GARCIA &amp; Jérémy BRAITBART</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>`;
  const wrap        = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`;
  const btnLienHref = lienCours || 'https://www.tangoetvous.com';

  let sent = 0;
  for (const e of eleves) {
    const prenomAff = _esc(e.prenom || (e.nom || '').split(' ')[0] || '');
    const restants  = e.carte_restants || 0;
    const notifMsg  = `⚠️ Dernier rappel — reportez vos ${restants} cours avant le 31 août ${anneeFin}`;

    // Notif in-app élève
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications_eleve`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email: e.email, type: 'fin_saison_c5', message: notifMsg, lu: false }),
      });
    } catch(err) { console.error('[cron fin-saison-c5] notif error', err); }

    if (!env.BREVO_API_KEY) continue;

    // Email élève (C5)
    const htmlEleve = wrap(`${headerEleve}
      <div style="background:#fff8e1;padding:14px 24px;text-align:center;border-bottom:1px solid #ffe082;">
        <span style="font-size:14px;font-weight:700;color:#e65100;">⚠️ Dernier rappel — reportez vos cours avant le 31 août ${anneeFin}</span></div>
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#333;margin:0 0 20px;">Bonjour ${prenomAff},</p>
        <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 22px;">Il vous reste <strong>${restants} cours</strong>. Réglez simplement l'adhésion à notre association avant le 25 août ${anneeFin} sur AssoConnect pour reporter les cours de votre carte à la saison prochaine.</p>
        <div style="background:#fff3e0;border:2px solid #e65100;border-radius:10px;padding:16px 20px;margin:0 0 24px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#e65100;margin-bottom:10px;font-weight:700;">Votre carte</div>
          <div style="font-size:22px;font-weight:700;color:#c62828;">${restants} cours restant${restants > 1 ? 's' : ''}</div>
          <div style="font-size:13px;color:#bf360c;margin-top:6px;font-weight:700;">⚠️ À reporter avant le 31 août ${anneeFin}</div>
        </div>
        <p style="text-align:center;margin:0 0 28px;"><a href="${_esc(btnLienHref)}" style="display:inline-block;background:#D4AF37;color:#111;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;">Reportez votre carte → Réglez votre adhésion de la saison prochaine</a></p>
        ${signEleve}
      </div>${footer}`);

    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Tango & Vous', email: adminEmail },
          to: [{ email: String(e.email) }],
          subject: `⚠️ Dernier rappel — reportez vos cours avant le 31 août ${anneeFin}`,
          htmlContent: htmlEleve,
        }),
      });
      if (r.ok) sent++; else console.error('[cron fin-saison-c5] Brevo error', e.email, await r.text());
    } catch(err) { console.error('[cron fin-saison-c5] fetch error', err); }
  }

  return corsResponse({ ok: true, sent, checked: eleves.length, saison: sai, saiNext }, 200, {}, request);
}

// ================================================================
// POST /api/cron/relance-absences — cron quotidien (vendredi Paris, mardi Vincennes)
// Email C6 : relance informelle si 2 absences consécutives sur une carte10
//
// ⚠️ SQL à exécuter dans Supabase avant la première exécution :
//   ALTER TABLE eleves ADD COLUMN IF NOT EXISTS derniere_relance_abs DATE;
//
// Anti-doublon : derniere_relance_abs = date du 2e cours absent → pas de double envoi
// pour la même paire d'absences.
// ================================================================
async function handleCronRelanceAbsences(request, env) {
  const todayDt = new Date();
  // Approximation heure de Paris : UTC+2 en été (mars–oct), UTC+1 en hiver
  const parisOffset = todayDt.getUTCMonth() >= 2 && todayDt.getUTCMonth() <= 9 ? 2 : 1;
  const parisDt = new Date(todayDt.getTime() + parisOffset * 3600 * 1000);
  const dow     = parisDt.getUTCDay(); // 0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam
  const today   = parisDt.toISOString().slice(0, 10);

  // Lire le body pour un éventuel override de ville (passé par les crons GitHub Actions)
  let bodyVille = null;
  try {
    const bodyText = await request.text();
    if (bodyText) { const parsed = JSON.parse(bodyText); bodyVille = parsed.ville || null; }
  } catch(e) {}

  // Si ville explicite dans le body → forcer ; sinon détecter via le jour de la semaine
  let checkParis, checkVincennes;
  if (bodyVille === 'paris')     { checkParis = true;  checkVincennes = false; }
  else if (bodyVille === 'vincennes') { checkParis = false; checkVincennes = true; }
  else {
    // Vendredi (5) → vérifier Paris ; Mardi (2) → vérifier Vincennes
    checkParis     = dow === 5;
    checkVincennes = dow === 2;
    if (!checkParis && !checkVincennes) {
      return corsResponse({ ok: true, skipped: true, reason: 'not_a_check_day', dow, today }, 200, {}, request);
    }
  }

  const svcKey = env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;
  const MOIS_C6  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const JOURS_C6 = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  const adminEmail  = 'tangoetvous@gmail.com';
  const headerEleve = `<div style="background:#111;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #D4AF37;"><div style="font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">TANGO &amp; VOUS</div><div style="font-size:10px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:5px;">École de tango argentin</div></div>`;
  const footer      = `<div style="background:#111;padding:16px 24px;text-align:center;font-size:11px;color:#888;line-height:2;"><a href="https://www.tangoetvous.com" style="color:#D4AF37;text-decoration:none;font-weight:700;letter-spacing:1px;">WWW.TANGOETVOUS.COM</a><br/><a href="mailto:tangoetvous@gmail.com" style="color:#888;text-decoration:none;">tangoetvous@gmail.com</a> &nbsp;·&nbsp; 07 73 27 59 06</div>`;
  const wrapC6      = function(inner) { return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;background:#fff;">${inner}</div></body></html>`; };

  // Charger tev_cours_dates depuis parametres
  let coursDatesParis    = [];
  let coursDatesTous     = [];
  let coursVincennes     = [];
  try {
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/parametres?cle=eq.tev_cours_dates&select=valeur`,
      { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
    );
    if (pr.ok) {
      const rows = await pr.json();
      if (rows.length && rows[0].valeur) {
        const val = rows[0].valeur;
        coursDatesParis  = Array.isArray(val.paris)     ? val.paris     : [];
        coursVincennes   = Array.isArray(val.vincennes) ? val.vincennes : [];
      }
    } else {
      console.error('[relance-absences] Supabase parametres error', await pr.text());
    }
  } catch(e) { console.error('[relance-absences] fetch tev_cours_dates error', e); }

  // Retourne les 2 dernières dates strictement < ref dans un tableau de dates ISO
  function getDernieresDatesC6(arr, ref) {
    const past = arr.filter(function(d) { return d < ref; }).sort();
    return past.slice(-2); // [avant-dernière, dernière]
  }

  let totalSent    = 0;
  let totalChecked = 0;

  const villes = [];
  if (checkParis)     villes.push({ ville: 'paris',     dates: getDernieresDatesC6(coursDatesParis, today) });
  if (checkVincennes) villes.push({ ville: 'vincennes', dates: getDernieresDatesC6(coursVincennes,  today) });

  for (const villeObj of villes) {
    const ville = villeObj.ville;
    const dates = villeObj.dates;

    if (dates.length < 2) {
      console.log('[relance-absences] pas assez de dates passées pour ' + ville + ' (trouvé ' + dates.length + ')');
      continue;
    }
    const dateAvant    = dates[0]; // avant-dernière date de cours
    const dateDerniere = dates[1]; // dernière date de cours

    // Charger les élèves avec carte active pour cette ville
    let eleves = [];
    try {
      const er = await fetch(
        `${SUPABASE_URL}/rest/v1/eleves?carte_statut=in.(Active,Nouvelle%20carte)&ville=eq.${ville}&select=id,email,prenom,nom,carte_restants,derniere_relance_abs`,
        { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
      );
      if (!er.ok) {
        console.error('[relance-absences] Supabase eleves error (' + ville + ')', await er.text());
        continue;
      }
      eleves = await er.json();
    } catch(e) { console.error('[relance-absences] fetch eleves error (' + ville + ')', e); continue; }

    totalChecked += eleves.length;

    for (const eleve of eleves) {
      // Anti-doublon : déjà relancé pour cette dernière date d'absence
      if (eleve.derniere_relance_abs === dateDerniere) continue;

      // Vérifier présences sur les 2 dates dans la table presences
      let presences = [];
      try {
        const pq = await fetch(
          `${SUPABASE_URL}/rest/v1/presences?eleve_id=eq.${eleve.id}&date=in.(${dateAvant},${dateDerniere})&select=date`,
          { headers: { 'apikey': svcKey, 'Authorization': `Bearer ${svcKey}` } }
        );
        if (pq.ok) presences = await pq.json();
      } catch(e) { console.error('[relance-absences] fetch presences error (' + eleve.email + ')', e); }

      const datesPresentMap = new Set(presences.map(function(p) { return p.date; }));

      // Absent = aucune présence enregistrée sur cette date
      // (absence déclarée via absences_jour OU simple non-venue = même résultat)
      const absentAvant    = !datesPresentMap.has(dateAvant);
      const absentDerniere = !datesPresentMap.has(dateDerniere);

      // N'envoyer que si absent sur les DEUX dates
      if (!absentAvant || !absentDerniere) continue;

      const prenomAff = _esc(eleve.prenom || '');
      const nomAff    = _esc(((eleve.prenom || '') + ' ' + (eleve.nom || '')).trim());
      const restants  = eleve.carte_restants != null ? eleve.carte_restants : '?';

      // Email C6 (si Brevo configuré)
      if (env.BREVO_API_KEY) {
        const htmlEleve = wrapC6(`${headerEleve}
          <div style="background:#e3f2fd;padding:14px 24px;text-align:center;border-bottom:1px solid #bbdefb;">
            <span style="font-size:14px;font-weight:700;color:#1565c0;">💙 On prend de tes nouvelles</span>
          </div>
          <div style="padding:28px 24px;">
            <p style="font-size:15px;color:#333;margin:0 0 20px;">Coucou ${prenomAff},</p>
            <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 16px;">On ne t'a pas vu·e aux 2 derniers cours. Tout va bien ?</p>
            <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 16px;">Nous sommes là pour t'accompagner dès que tu reprends pour te partager ce qui a été vu dernièrement.</p>
            <div style="background:#e8f4fd;border:1px solid #b3d9f5;border-radius:8px;padding:14px 18px;margin:0 0 22px;">
              <p style="font-size:14px;color:#1565c0;font-weight:700;margin:0 0 6px;">Rappel</p>
              <p style="font-size:14px;color:#333;line-height:1.6;margin:0;">Il te reste <strong>${restants} cours</strong> sur ta carte. Ils t'attendent !</p>
            </div>
            <p style="font-size:13px;color:#555;text-align:center;margin:0 0 6px;">📞 07 73 27 59 06</p>
            <p style="font-size:13px;color:#555;text-align:center;margin:0 0 28px;"><a href="mailto:${adminEmail}" style="color:#B8962E;">${adminEmail}</a></p>
            <p style="font-size:14px;color:#B8962E;text-align:center;margin:24px 0 0;">À très bientôt sur la piste !<br/><strong style="color:#222;">Florencia &amp; Jérémy</strong><br/><span style="font-size:12px;color:#888;">Tango &amp; Vous · 07 73 27 59 06</span></p>
          </div>${footer}`);

        try {
          const r = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'Tango & Vous', email: adminEmail },
              to: [{ email: String(eleve.email) }],
              subject: '💙 On prend de tes nouvelles — Tango & Vous',
              htmlContent: htmlEleve,
            }),
          });
          if (r.ok) {
            totalSent++;
          } else {
            console.error('[relance-absences] Brevo error', eleve.email, await r.text());
          }
        } catch(e) { console.error('[relance-absences] Brevo fetch error', e); }
      }

      // Notification panel admin 🔔
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            type: 'relance_absences',
            message: '💙 2 absences consécutives — ' + (nomAff || eleve.email) + ' · ' + (ville === 'paris' ? 'Paris' : 'Vincennes') + ' · Email C6 envoyé · → Cartes 10 → Détails',
            lu: false,
            lien_tab: 'cartes',
          }),
        });
      } catch(e) { console.error('[relance-absences] admin notif error', e); }

      // Mettre à jour derniere_relance_abs pour éviter un double envoi la semaine prochaine
      Promise.resolve(
        fetch(`${SUPABASE_URL}/rest/v1/eleves?email=eq.${encodeURIComponent(String(eleve.email))}`, {
          method: 'PATCH',
          headers: {
            'apikey': svcKey, 'Authorization': `Bearer ${svcKey}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ derniere_relance_abs: dateDerniere }),
        })
      ).catch(function(e) { console.error('[relance-absences] patch derniere_relance_abs error', e); });
    }
  }

  return corsResponse({ ok: true, sent: totalSent, checked: totalChecked, dow, today }, 200, {}, request);
}
