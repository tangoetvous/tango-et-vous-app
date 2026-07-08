// ================================================================
//  TANGO & VOUS — Client Supabase
//  Remplace : postAS() + Firebase Auth + BroadcastChannel sync
//  Dépendance : @supabase/supabase-js v2 (chargé via CDN dans les HTML)
// ================================================================

const TEV_SUPABASE_URL  = 'https://qhngqzvvllktuwspojxc.supabase.co';
const TEV_SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobmdxenZ2bGxrdHV3c3BvanhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjQ0NDYsImV4cCI6MjA5MjMwMDQ0Nn0.j-yMQryi3qoImIf6vyiqQ3SKzHeJoPsrJuP1YwaSyLs';

const _TEV_ADMIN_EMAILS = [
  'tangoetvous@gmail.com',
  'florencia@tangoetvous.com',
  'jeremy@tangoetvous.com',
];

if (!window.supabase) {
  console.error('[TEV] ERREUR : Supabase SDK non chargé — vérifiez que cdn.jsdelivr.net est accessible (VPN/proxy ?)');
  document.body && (document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#c00"><b>Erreur de chargement</b><br><br>Le SDK Supabase n\'a pas pu être chargé.<br>Vérifiez votre connexion ou désactivez votre VPN/proxy.<br><br><small>cdn.jsdelivr.net doit être accessible.</small></div>');
}
const _tev = window.supabase ? window.supabase.createClient(TEV_SUPABASE_URL, TEV_SUPABASE_KEY) : null;

// ── GARDE-FOU anti-écrasement massif (incident Karine Blum, 2026-07-02) ────────
// Les fiches partenaires sans email partagent toutes email='' en DB. Un UPDATE /
// DELETE / UPSERT filtré par `.eq('email', '')` toucherait donc TOUTES ces fiches
// (toutes personnes, toutes saisons) au lieu d'une seule. Ce wrapper intercepte
// toute mutation dont le filtre email est vide et la BLOQUE en levant une erreur
// explicite — quelle que soit la fonction appelante, présente ou future.
// Les SELECT ne sont pas concernés (lire par email vide est sans danger).
if (_tev && typeof _tev.from === 'function') {
  const _tevFromOrig = _tev.from.bind(_tev);
  _tev.from = function (table) {
    const builder = _tevFromOrig(table);
    ['update', 'delete', 'upsert'].forEach(function (m) {
      const orig = builder[m];
      if (typeof orig !== 'function') return;
      builder[m] = function () {
        const q = orig.apply(builder, arguments);
        const eqOrig = q && q.eq;
        if (typeof eqOrig === 'function') {
          q.eq = function (col, val) {
            if (col === 'email' && (val === undefined || val === null || String(val).trim() === '')) {
              const msg = '[TEV garde-fou] ' + m + ' sur « ' + table + ' » avec un filtre email VIDE — requête bloquée (elle toucherait toutes les fiches sans email). Cibler par id à la place.';
              console.error(msg);
              throw new Error(msg);
            }
            return eqOrig.call(q, col, val);
          };
        }
        const inOrig = q && q.in;
        if (typeof inOrig === 'function') {
          q.in = function (col, vals) {
            if (col === 'email' && Array.isArray(vals) && vals.some(function (v) { return v === undefined || v === null || String(v).trim() === ''; })) {
              const msg = '[TEV garde-fou] ' + m + ' sur « ' + table + ' » avec un email vide dans .in() — requête bloquée.';
              console.error(msg);
              throw new Error(msg);
            }
            return inOrig.call(q, col, vals);
          };
        }
        return q;
      };
    });
    return builder;
  };
}

// ── Helper ─────────────────────────────────────────────────────
function _fmtDateSb(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// ================================================================
// AUTH
// ================================================================

async function tevSignInMagicLink(email) {
  const { error } = await _tev.auth.signInWithOtp({ email });
  if (error) throw error;
}

async function tevVerifyOtp(email, token) {
  const { error } = await _tev.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

async function tevSignOut() {
  await _tev.auth.signOut();
}

function tevOnAuthChange(callback) {
  return _tev.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

async function tevGetSession() {
  const { data: { session } } = await _tev.auth.getSession();
  return session;
}

function tevIsAdmin(email) {
  return _TEV_ADMIN_EMAILS.includes((email || '').toLowerCase());
}

// ================================================================
// ÉLÈVE — getEleve (remplace getEleveByEmail)
// ================================================================
async function tevGetEleve(email) {
  email = (email || '').trim().toLowerCase();
  const { data: eleve, error } = await _tev
    .from('eleves')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !eleve) return { error: 'not_found', email };

  // Blocages explicites admin (indépendants de l'inscription)
  if (eleve.statut_eleve === 'En attente') {
    return {
      error: 'not_active',
      statut: 'En attente',
      message: "Votre compte est en cours de validation. Vous recevrez un email dès qu'il sera activé.",
    };
  }
  if (eleve.statut_eleve === 'Inactif') {
    return {
      error: 'not_active',
      statut: 'Inactif',
      message: "Votre accès est suspendu. Contactez-nous si vous pensez que c'est une erreur.",
    };
  }

  // Vérification d'inscription active (saison courante ou prochaine)
  const _now = new Date();
  const _m = _now.getMonth() + 1;
  const _y = _now.getFullYear();
  const _saiA = _m >= 9 ? `${_y}-${_y + 1}` : `${_y - 1}-${_y}`;
  const _saiParts = _saiA.split('-');
  const _saiN = `${parseInt(_saiParts[0]) + 1}-${parseInt(_saiParts[1]) + 1}`;

  const [{ data: _inscTango }, { data: _inscYoga }] = await Promise.all([
    _tev.from('inscriptions_cours').select('id').eq('email', email)
      .neq('statut', 'supprimé').in('saison', [_saiA, _saiN]).limit(1),
    _tev.from('cours_yoga').select('id').eq('email', email)
      .in('saison', [_saiA, _saiN]).limit(1),
  ]);

  if ((!_inscTango || !_inscTango.length) && (!_inscYoga || !_inscYoga.length)) {
    return {
      error: 'not_active',
      statut: eleve.statut_eleve,
      message: "Votre inscription pour cette saison est terminée. Contactez-nous pour vous réinscrire.",
    };
  }

  const { data: presences } = await _tev
    .from('presences')
    .select('date, niveau, note')
    .eq('eleve_id', eleve.id)
    .order('date', { ascending: false });

  return {
    eleve: {
      id: eleve.id,
      nom: eleve.nom,
      prenom: eleve.prenom,
      niveau: eleve.niveau,
      ville: eleve.ville,
      email: eleve.email,
      tel: eleve.tel,
      statut: eleve.statut_eleve,
      photo_url: eleve.photo_url || null,
      visible_repertoire: eleve.visible_repertoire || false,
    },
    carte: {
      coursUtilises:  eleve.carte_utilises,
      coursRestants:  eleve.carte_restants,
      dateAchat:      _fmtDateSb(eleve.carte_date_achat),
      dateExpiration: _fmtDateSb(eleve.carte_expiration),
      statut:         eleve.carte_statut,
      paye:           eleve.carte_paye,
      numero:         eleve.carte_num || 1,
      dureeMois:      eleve.carte_duree_mois || null,
    },
    presences: (presences || []).map(p => ({
      date:   _fmtDateSb(p.date),
      niveau: p.niveau,
      note:   p.note,
    })),
  };
}

// ================================================================
// POINTAGE — ajouterPresence (remplace pointageManuel)
// ================================================================
async function tevPointerCours({ eleveId, date, niveau, note, nbCours, maxParJour }) {
  const mpj = (maxParJour && maxParJour >= 1) ? Math.min(2, maxParJour) : 2;
  const n = Math.min(mpj, Math.max(1, parseInt(nbCours) || 1));

  // Compter les pointages du jour
  const { count: dejaPointe } = await _tev
    .from('presences')
    .select('id', { count: 'exact', head: true })
    .eq('eleve_id', eleveId)
    .eq('date', date);

  const aAjouter = Math.min(n, mpj - (dejaPointe || 0));
  if (aAjouter <= 0) {
    return { ok: true, skipped: true, message: `Déjà ${dejaPointe} cours pointé(s) le ${date}` };
  }

  // Récupérer les infos élève
  const { data: eleve } = await _tev.from('eleves').select('*').eq('id', eleveId).single();
  if (!eleve) throw new Error('Élève introuvable');

  const estPremierCours = (await _tev
    .from('presences').select('id', { count: 'exact', head: true }).eq('eleve_id', eleveId)
  ).count === 0;

  // Insérer les présences
  const rows = [];
  for (let i = 0; i < aAjouter; i++) {
    rows.push({
      eleve_id:  eleveId,
      eleve_nom: eleve.nom,
      date,
      niveau:    niveau || eleve.niveau,
      note:      note || (n > 1 ? `Cours ${(dejaPointe || 0) + i + 1}/${n}` : 'Ajout'),
    });
  }
  await _tev.from('presences').insert(rows);

  // Mettre à jour la carte
  const utilisesAvant = eleve.carte_utilises || 0;
  const totalApres    = utilisesAvant + aAjouter;
  // Taille de la carte EN COURS = utilises + restants (invariant du modèle, fallback 10)
  const tailleAncienne = (utilisesAvant + (eleve.carte_restants || 0)) || 10;
  // Taille d'une NOUVELLE carte = paramètre global (Paramètres → Fonctionnalités)
  const tailleNouvelle = _tevCarteNbCours();
  let renouvAuto = false, renouvOverflow = 0;
  let carteUpdate = {};

  // S'assurer que tev_cours_dates est chargé pour le calcul d'expiration
  let _storedDates = {};
  try { _storedDates = JSON.parse(localStorage.getItem('tev_cours_dates') || '{}'); } catch(e) {}
  const _coursDatesVille = eleve.ville === 'vincennes' ? _storedDates.vincennes : _storedDates.paris;
  if (!_coursDatesVille || !_coursDatesVille.length) await tevRefreshCoursDates();

  if (totalApres > tailleAncienne) {
    const overflow  = totalApres - tailleAncienne;
    const dureeNouvelle = _tevCarteDureeMois();
    const nouvExp   = _calcExpirationSb(date, eleve.ville, dureeNouvelle);
    carteUpdate = {
      carte_utilises:   overflow,
      carte_restants:   tailleNouvelle - overflow,
      carte_date_achat: date,
      carte_expiration: nouvExp,
      carte_paye:       false,
      carte_statut:     'Active',
      carte_duree_mois: dureeNouvelle,
      carte_exp_manuelle: false, // renouvellement auto (overflow) → retour au calcul auto
    };
    renouvAuto     = true;
    renouvOverflow = overflow;
    _tevIncrCarteNum(eleveId);
  } else {
    carteUpdate = {
      carte_utilises: totalApres,
      carte_restants: Math.max(0, (eleve.carte_restants || 0) - aAjouter),
    };
    // Une carte sans date de départ (nouvelle OU renouvelée) démarre à ce pointage.
    // ⚠️ Ne PAS conditionner à estPremierCours : après un renouvellement, l'élève a déjà
    // des présences historiques → la nouvelle carte ne démarrait jamais (ni date ni expiration).
    if (!eleve.carte_date_achat) {
      carteUpdate.carte_date_achat = date;
      carteUpdate.carte_expiration = _calcExpirationSb(date, eleve.ville, eleve.carte_duree_mois);
      carteUpdate.carte_statut     = 'Active';
    }
  }

  await _tev.from('eleves').update(carteUpdate).eq('id', eleveId);

  return {
    ok: true,
    added: aAjouter,
    renouvAuto,
    overflow: renouvOverflow,
    message: `${aAjouter} présence(s) ajoutée(s)`,
  };
}

// ================================================================
// CARTE — taille paramétrable (clé Supabase/localStorage tev_carte_nb_cours)
// Défaut 10. Le miroir localStorage est alimenté par l'admin (chargerParamsRemote)
// et par l'espace élève (fetch au login).
// ================================================================
function _tevCarteDureeMois() {
  try {
    var v = localStorage.getItem('tev_carte_duree_mois');
    if (v != null) {
      var o = v; try { o = JSON.parse(v); } catch(e) {}
      var n = parseInt((o && o.nb != null) ? o.nb : o, 10);
      if (n >= 1 && n <= 24) return n;
    }
  } catch(e) {}
  return 3;
}

function _tevCarteNbCours() {
  try {
    var v = localStorage.getItem('tev_carte_nb_cours');
    if (v != null) {
      var o = v; try { o = JSON.parse(v); } catch(e) {}
      var n = parseInt((o && o.nb != null) ? o.nb : o, 10);
      if (n >= 1 && n <= 100) return n;
    }
  } catch(e) {}
  return 10;
}

// ================================================================
// CARTE — renouvelerCarte
// ================================================================
async function _tevIncrCarteNum(eleveId) {
  // Numéro de carte (1ère/2ème… de la saison). Fire-and-forget : ne bloque JAMAIS
  // le renouvellement, même si la colonne carte_num n'existe pas encore en DB.
  try {
    const { data: e } = await _tev.from('eleves').select('carte_num').eq('id', eleveId).single();
    await _tev.from('eleves').update({ carte_num: ((e && e.carte_num) || 1) + 1 }).eq('id', eleveId);
  } catch (e) {}
}

async function tevRenouvelerCarte({ eleveId, paye, nbCours, dureeMois }) {
  _tevIncrCarteNum(eleveId);
  const _nb = (parseInt(nbCours, 10) >= 1 && parseInt(nbCours, 10) <= 100) ? parseInt(nbCours, 10) : _tevCarteNbCours();
  const _dm = (parseInt(dureeMois, 10) >= 1 && parseInt(dureeMois, 10) <= 24) ? parseInt(dureeMois, 10) : _tevCarteDureeMois();
  await _tev.from('eleves').update({
    carte_utilises:   0,
    carte_restants:   _nb,
    carte_date_achat: null,
    carte_expiration: null,
    carte_statut:     'Nouvelle carte',
    carte_paye:       paye !== false,
    carte_duree_mois: _dm,
    carte_exp_manuelle: false, // renouvellement → retour au calcul auto de l'expiration
  }).eq('id', eleveId);
  return { ok: true };
}

// ================================================================
// CARTE — toggleCartePaye
// ================================================================
async function tevToggleCartePaye({ eleveId, paye }) {
  await _tev.from('eleves').update({ carte_paye: paye }).eq('id', eleveId);
  return { ok: true };
}

// ================================================================
// ADMIN — getAdminData  (remplace getAdminData Apps Script)
// ================================================================
async function tevGetAdminData() {
  const [
    { data: eleves },
    { data: presences },
    { data: coursParticuliers },
    { data: inscriptionsCours },
    { data: inscriptionsStages },
    { data: inscriptionsEssai },
    { data: inscriptionsEssaiYoga },
    { data: publications },
    { data: agendaModifs },
    { data: coursYogaRaw },
    { data: absencesJour },
    { data: demandesDevisRaw },
    { data: devisListRaw },
    { data: notificationsRaw },
    { data: newsletterRaw },
  ] = await Promise.all([
    _tev.from('eleves').select('*').order('nom'),
    _tev.from('presences').select('*').order('date', { ascending: false }),
    _tev.from('cours_particuliers').select('*').order('created_at', { ascending: false }),
    _tev.from('inscriptions_cours').select('*').order('created_at', { ascending: false }),
    _tev.from('inscriptions_stages').select('*').order('stage_date', { ascending: false }),
    _tev.from('inscriptions_essai').select('*').order('date_essai', { ascending: false }),
    _tev.from('inscriptions_essai_yoga').select('*').order('date_essai', { ascending: false }),
    _tev.from('publications').select('*').order('created_at', { ascending: false }),
    _tev.from('agenda_modifs').select('*').order('date'),
    _tev.from('cours_yoga').select('*').order('created_at', { ascending: false }),
    _tev.from('absences_jour').select('*'),
    _tev.from('demandes_devis').select('*').order('created_at', { ascending: false }),
    _tev.from('devis').select('*').order('created_at', { ascending: false }),
    _tev.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
    _tev.from('newsletter_emails').select('*').order('created_at', { ascending: false }),
  ]);

  // Construire le format attendu par admin.html (cartes)
  const cartes = (eleves || []).map(e => ({
    id:              e.id,
    nom:             `${e.prenom} ${e.nom}`.trim() || e.nom,
    prenom:          e.prenom,
    niveau:          e.niveau,
    email:           e.email,
    tel:             e.tel,
    role:            e.role,
    statutEleve:     e.statut_eleve,
    source:          e.source,
    partenaire:      e.partenaire,
    emailPartenaire: e.email_partenaire,
    notes:           e.notes,
    photo_url:       e.photo_url || null,
    ville:           e.ville,
    saison:          e.saison,
    utilises:        e.carte_utilises,
    restants:        e.carte_restants,
    datePremierCours: _fmtDateSb(e.carte_date_achat),
    expiration:      _fmtDateSb(e.carte_expiration),
    statut:          e.carte_statut,
    paye:            e.carte_paye,
    carteNum:        e.carte_num || 1,
    dureeMois:       e.carte_duree_mois || null,
    expManuelle:     e.carte_exp_manuelle || false,
    datesCours:      (presences || [])
      .filter(p => p.eleve_id === e.id)
      .map(p => _fmtDateSb(p.date)),
  }));

  // Lookup eleves by email to enrich inscriptions_cours with tel, role and cours label
  const elevesMap = {};
  (eleves || []).forEach(e => { elevesMap[e.email] = e; });
  const _coursLabel = (ville, niveau) => {
    const v = ville === 'vincennes' ? 'Vincennes — Lundi' : 'Paris — Jeudi';
    const n = niveau === 'intermediaire' ? 'Intermédiaire' : 'Débutant';
    return `${v} — ${n}`;
  };
  const coursTango = (inscriptionsCours || []).map(ic => {
    const elv = elevesMap[ic.email] || {};
    return {
      ...ic,
      tel:              elv.tel || ic.tel   || '',
      role:             ic.role || elv.role || '',
      emailPartenaire:  ic.email_partenaire || ic.emailPartenaire || '',
      cours:            ic.cours || _coursLabel(ic.ville, ic.niveau),
      dateInscription:  ic.dateInscription || (ic.created_at || '').slice(0, 10),
    };
  });

  const coursYoga = (coursYogaRaw || []).map(cy => {
    const elv = elevesMap[cy.email] || {};
    return { ...cy, tel: cy.tel || elv.tel || '' };
  });

  const _normalizeRole = r => {
    if (!r) return '';
    if (r === 'Guideur.se') return 'guideur';
    if (r === 'Guidé·e' || r === 'Guidée') return 'guidee';
    if (r === 'Double rôle') return 'double';
    return r;
  };

  const _normalizeNiveau = n => {
    if (!n) return '';
    if (n === 'Débutant') return 'debutant';
    if (n.startsWith('Interm') || n.startsWith('interm')) return 'intermediaire';
    return n;
  };

  const _mapEssai = e => ({
    ...e,
    date:             e.date_essai,
    presenceConfirmee: e.presence_confirmee,
    present:          (e.presence_declaree !== null && e.presence_declaree !== undefined) ? e.presence_declaree : undefined,
    emailPartenaire:  e.email_partenaire || '',
    partenaire:       [e.part_prenom, e.part_nom].filter(Boolean).join(' ').trim() || e.partenaire || '',
    role:             _normalizeRole(e.role),
    niveau:           _normalizeNiveau(e.niveau),
  });

  return {
    cartes,
    presences:         presences        || [],
    coursParticuliers: coursParticuliers || [],
    coursTango,
    coursYoga:         coursYoga,
    inscriptionsStages: inscriptionsStages || [],
    coursEssai:        (inscriptionsEssai      || []).map(_mapEssai),
    essaiYoga:         (inscriptionsEssaiYoga  || []).map(_mapEssai),
    publications:      (publications || []).map(function(p){ return Object.assign({}, p.donnees || {}, p); }),
    agendaModifs:      agendaModifs       || [],
    absencesJour:      absencesJour != null ? absencesJour.map(a => ({ date: a.date, email: a.email })) : null,
    demandesDevis:     demandesDevisRaw  || [],
    devisList:         devisListRaw      || [],
    notifications:     (notificationsRaw || []).map(n => ({ ...n, date: n.created_at })),
    newsletter:        newsletterRaw     || [],
    stats: {
      total:     (eleves || []).length,
      actifs:    (eleves || []).filter(e => e.statut_eleve === 'Actif').length,
      enAttente: (eleves || []).filter(e => e.statut_eleve === 'En attente').length,
      inactifs:  (eleves || []).filter(e => e.statut_eleve === 'Inactif').length,
    },
  };
}

// ================================================================
// ÉLÈVE — creerEleve
// ================================================================
async function tevCreerEleve({ nom, prenom, email, tel, niveau, ville, source, notes, partenaire, emailPartenaire, saison }) {
  email = (email || '').trim().toLowerCase();

  const { data: exist } = await _tev.from('eleves').select('id').eq('email', email).single();
  if (exist) return { ok: true, action: 'already_exists', id: exist.id };

  const { data, error } = await _tev.from('eleves').insert({
    nom:             (nom || '').trim(),
    prenom:          (prenom || '').trim(),
    email,
    tel:             tel || '',
    niveau:          niveau || 'debutant',
    ville:           ville || 'paris',
    statut_eleve:    'En attente',
    source:          source || 'manuel',
    notes:           notes || '',
    partenaire:      partenaire || '',
    email_partenaire: emailPartenaire || '',
    saison:          saison || '2025-2026',
  }).select('id').single();

  if (error) throw error;
  return { ok: true, action: 'created', id: data.id };
}

// ================================================================
// ÉLÈVE — activerEleve / desactiverEleve
// ================================================================
async function tevActiverEleve({ id, email }) {
  const filter = id ? { id } : { email: (email||'').toLowerCase() };
  const { data: eleve } = await _tev.from('eleves').select('id, nom, email, niveau')
    .match(filter).single();
  if (!eleve) throw new Error('Élève introuvable');
  await _tev.from('eleves').update({ statut_eleve: 'Actif' }).eq('id', eleve.id);
  return { ok: true, nom: eleve.nom, email: eleve.email };
}

async function tevDesactiverEleve({ id, email, statut }) {
  const filter = id ? { id } : { email: (email||'').toLowerCase() };
  await _tev.from('eleves').update({ statut_eleve: statut || 'Inactif' }).match(filter);
  return { ok: true };
}

// ================================================================
// COURS PARTICULIERS
// ================================================================
// Ajoute un email à la newsletter (fire-and-forget côté appelant).
// INSERT sans .select() (règle formulaires publics anon : pas de RETURNING → pas de 42501).
// Garde email vide/invalide. La déduplication se fait à l'affichage admin.
async function tevAjouterNewsletter(email, source) {
  const em = (email || '').trim().toLowerCase();
  if (!em || em.indexOf('@') < 1 || em.indexOf('.') < 0) return { ok: false, skipped: true };
  try {
    const { error } = await _tev.from('newsletter_emails').insert({ email: em, source: source || 'newsletter' });
    if (error) return { ok: false, error };
    return { ok: true };
  } catch (e) { return { ok: false, error: e }; }
}

async function tevReservationCP(body) {
  const { error } = await _tev.from('cours_particuliers').insert({
    eleve_id:    body.eleveId || '',
    prenom:      body.prenom || '',
    nom:         body.nom || '',
    email:       (body.email || '').toLowerCase(),
    tel:         body.tel || '',
    niveau:      body.niveauEleve || '',
    professeur:  body.prof || '',
    duree:       body.duree || '',
    lieu:        body.lieu || '',
    lieu_detail: body.lieuDetail || '',
    objectifs:   body.objectifs || '',
    remarque:    body.remarque || '',
    dispos:      body.dispoTexte || '',
    urgence:     body.urgence || '',
    source:      body.source || 'app',
  });
  if (error) throw error;
  return { ok: true };
}

async function tevUpdateStatutCP({ id, statut }) {
  await _tev.from('cours_particuliers').update({ statut }).eq('id', id);
  return { ok: true };
}

// ================================================================
// STAGES
// ================================================================
async function tevInscriptionStage(body) {
  const { error } = await _tev.from('inscriptions_stages').insert({
    eleve_id:   body.eleveId || '',
    nom:        body.nom || '',
    prenom:     body.prenom || '',
    email:      (body.email || '').toLowerCase(),
    stage_date: body.date || null,
    stage_nom:  body.stageNom || '',
    type:       body.type || '',
    saison:     body.saison || '2025-2026',
  });
  if (error) throw error;
  return { ok: true };
}

// ================================================================
// PUBLICATIONS
// ================================================================
async function tevGetPublications() {
  const { data } = await _tev.from('publications').select('*')
    .order('created_at', { ascending: false });
  return (data || []).map(p => Object.assign({}, p.donnees || {}, p));
}

async function tevSauvegarderPublication({ id, cat, titre, extrait, contenu, image, video, dateProgrammee, datesProgrammees, cours, publiee }) {
  const donnees = { cat: cat||'actu', extrait: extrait||'', image: image||'', video: video||'', dateProgrammee: dateProgrammee||'', datesProgrammees: datesProgrammees||[], cours: cours||[] };
  const fields = { titre, contenu, publiee: publiee !== false, donnees };
  if (id) {
    const { error } = await _tev.from('publications').update(fields).eq('id', id);
    if (error) throw new Error(error.message || error.code || JSON.stringify(error));
  } else {
    const { data, error } = await _tev.from('publications').insert(fields).select('id').single();
    if (error) throw new Error(error.message || error.code || JSON.stringify(error));
    id = data?.id;
  }
  return { ok: true, id };
}

async function tevPublierPublication(id) {
  await _tev.from('publications').update({ publiee: true }).eq('id', id);
  return { ok: true };
}

async function tevSupprimerPublication(id) {
  await _tev.from('publications').delete().eq('id', id);
  return { ok: true };
}

// ================================================================
// DISCUSSIONS
// ================================================================
async function tevGetDiscussions({ eleveEmail } = {}) {
  const { data } = await _tev.from('discussions').select('*').order('last_message_at', { ascending: false });
  const all = data || [];
  if (!eleveEmail) return all; // admin : toutes les discussions
  const email = eleveEmail.toLowerCase();
  // Élève : ses propres discussions + discussions admin (eleve_email vide) +
  // discussions de groupe (groupes non vide) + discussions privées 1-to-1 dont il est la cible
  // Note : _discPeutVoir() dans index.html filtre ensuite par groupe de l'élève
  return all.filter(d => {
    if (!d.eleve_email || d.eleve_email === email) return true;
    // Discussion de groupe créée par un autre élève : visible si groupes non vide
    const grp = d.groupes;
    if (Array.isArray(grp) ? grp.length > 0 : (typeof grp === 'string' && grp)) return true;
    const dn = d.donnees && (typeof d.donnees === 'string' ? (() => { try { return JSON.parse(d.donnees); } catch(e) { return {}; } })() : d.donnees);
    return dn && dn.private === true && (dn.targetEmail || '').toLowerCase() === email;
  });
}

async function tevGetMessages(discussionId) {
  const { data } = await _tev.from('discussion_messages').select('*')
    .eq('discussion_id', discussionId).order('created_at');
  return data || [];
}

async function tevCreateDiscussion({ titre, eleveEmail, eleveNom, groupes, targetEmail }) {
  const insertData = {
    titre, eleve_email: eleveEmail.toLowerCase(), eleve_nom: eleveNom || '',
    groupes: groupes || [],
  };
  if (targetEmail) {
    insertData.donnees = { private: true, targetEmail: targetEmail.toLowerCase() };
  }
  const { data, error } = await _tev.from('discussions').insert(insertData).select('id').single();
  if (error) throw error;
  return { ok: true, id: data.id };
}

async function tevPostMessage({ discussionId, auteur, auteurEmail, auteurNom, contenu }) {
  await _tev.from('discussion_messages').insert({
    discussion_id: discussionId, auteur, auteur_email: auteurEmail || '',
    auteur_nom: auteurNom || '', contenu,
  });
  await _tev.from('discussions').update({ last_message_at: new Date().toISOString() })
    .eq('id', discussionId);
  return { ok: true };
}

async function tevCloseDiscussion(id) {
  await _tev.from('discussions').update({ fermee: true }).eq('id', id);
  return { ok: true };
}

async function tevDeleteDiscussion(id) {
  await _tev.from('discussions').delete().eq('id', id);
  return { ok: true };
}

// ================================================================
// AGENDA MODIFS
// ================================================================
async function tevGetAgendaModifs() {
  const { data } = await _tev.from('agenda_modifs').select('*').order('date');
  return data || [];
}

async function tevSauverModifAgenda({ type, date, action, note, newDate, newHeure, newLieu }) {
  // Supprimer une modification existante pour cette date/type si action = 'annule_modif'
  if (action === 'annule_modif') {
    await _tev.from('agenda_modifs').delete().eq('type', type).eq('date', date);
  } else {
    await _tev.from('agenda_modifs').upsert({
      type, date, action, note: note || '',
      new_date: newDate || null, new_heure: newHeure || '', new_lieu: newLieu || '',
    }, { onConflict: 'type,date' });
  }
  return { ok: true };
}

// ================================================================
// PARAMETRES (cours dates, milongas, tarifs, config saison…)
// ================================================================
async function tevGetParam(cle) {
  const { data } = await _tev.from('parametres').select('valeur').eq('cle', cle).single();
  return data ? data.valeur : null;
}
async function tevGetAllParams() {
  const { data } = await _tev.from('parametres').select('cle, valeur');
  const result = {};
  (data || []).forEach(row => { result[row.cle] = row.valeur; });
  return result;
}

async function tevSetParam(cle, valeur) {
  const { data: { session } } = await _tev.auth.getSession();
  if (!session) return { ok: false, error: 'Non autorisé' };
  const { error } = await _tev.from('parametres').upsert({ cle, valeur }, { onConflict: 'cle' });
  return error ? { ok: false, error } : { ok: true };
}

// ================================================================
// REAL-TIME — Remplace BroadcastChannel + localStorage sync
// ================================================================

function tevSubscribeEleve(eleveId, callback) {
  return _tev
    .channel('eleve-' + eleveId)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'eleves', filter: `id=eq.${eleveId}`,
    }, payload => callback('carteUpdate', payload.new))
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'presences', filter: `eleve_id=eq.${eleveId}`,
    }, payload => callback('presenceAdded', payload.new))
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'discussions',
    }, payload => callback('discussionCreated', payload.new))
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'discussions',
    }, payload => callback('discussionUpdated', payload.new))
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'discussion_messages',
    }, payload => callback('newMessage', payload.new))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'publications',
    }, payload => callback('publicationChanged', payload.new || payload.old))
    .subscribe();
}

function tevSubscribeAdmin(callback) {
  return _tev
    .channel('admin-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'eleves' },
      payload => callback('eleve', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presences' },
      payload => callback('presence', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'publications' },
      payload => callback('publication', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_messages' },
      payload => callback('message', payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_modifs' },
      payload => callback('agenda', payload))
    .subscribe();
}

function tevUnsubscribe(channel) {
  if (channel) _tev.removeChannel(channel);
}

// ================================================================
// COURS DATES — Rafraîchir depuis Supabase si absent du localStorage
// ================================================================
let _coursDatesReady = false;
async function tevRefreshCoursDates() {
  if (_coursDatesReady) return;
  _coursDatesReady = true;
  try {
    const { data } = await _tev.from('parametres').select('valeur').eq('cle', 'tev_cours_dates').single();
    if (data && data.valeur) {
      const val = typeof data.valeur === 'string' ? JSON.parse(data.valeur) : data.valeur;
      if (val && (val.paris || val.vincennes || val.yoga)) {
        localStorage.setItem('tev_cours_dates', JSON.stringify(
          Object.assign({}, val, { modifie: new Date().toISOString().slice(0, 10) })
        ));
      }
    }
  } catch(e) { _coursDatesReady = false; }
}

// ================================================================
// UTILITAIRES
// ================================================================
function _calcExpirationSb(dateStr, ville, dureeMois) {
  if (!dateStr) return null;
  // Fenêtre A paramétrable (durée de validité en mois, défaut 3) — B et C inchangés.
  // ⚠️ Toute modification ici doit être répliquée À L'IDENTIQUE dans calcExpiration (admin.html).
  let _dm = parseInt(dureeMois, 10); if (!(_dm >= 1 && _dm <= 24)) _dm = 3;
  const debut = new Date(dateStr + 'T12:00:00');
  const fin   = new Date(debut.getTime());
  fin.setMonth(fin.getMonth() + _dm);

  // Dates de cours depuis Paramètres (localStorage mis à jour depuis Supabase)
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('tev_cours_dates') || '{}'); } catch(e) {}
  const coursArr = ((ville === 'vincennes' ? stored.vincennes : stored.paris) || []).slice().sort();
  const coursSet = {};
  coursArr.forEach(d => { coursSet[d] = true; });

  const firstStored = coursArr[0] || '';
  const lastStored  = coursArr[coursArr.length - 1] || '';

  // Normalisation : si dateStr n'est pas un jour de cours (ex: saisie manuelle un mardi alors que
  // les cours sont le jeudi), snapper au cours le plus proche dans coursArr (±3 jours).
  // Sans ça, cur vérifie le mauvais jour de semaine et chaque semaine paraît sans cours.
  if (coursArr.length > 0) {
    const _closest = coursArr.reduce((best, d) => {
      if (!best) return d;
      const da = Math.abs(new Date(d + 'T12:00:00') - debut);
      const db = Math.abs(new Date(best + 'T12:00:00') - debut);
      return da < db ? d : best;
    }, null);
    if (_closest) {
      const _closestDt = new Date(_closest + 'T12:00:00');
      if (Math.abs(_closestDt - debut) <= 3 * 24 * 60 * 60 * 1000) {
        debut.setTime(_closestDt.getTime());
        fin.setTime(debut.getTime());
        fin.setMonth(fin.getMonth() + _dm);
      } else {
        // Aucun cours à ±3 jours (date en plein été/vacances) : recaler sur le PROCHAIN
        // cours réel. Sinon la marche hebdomadaire est sur le mauvais jour de semaine et
        // CHAQUE semaine compte comme vacances → expiration aberrante (+1 an).
        const _debutIso = debut.toISOString().slice(0, 10);
        let _next = null;
        for (let _ni = 0; _ni < coursArr.length; _ni++) { if (coursArr[_ni] >= _debutIso) { _next = coursArr[_ni]; break; } }
        if (_next) {
          debut.setTime(new Date(_next + 'T12:00:00').getTime());
          fin.setTime(debut.getTime());
          fin.setMonth(fin.getMonth() + _dm);
        }
      }
    }
  }

  // Algorithme itératif : chaque semaine sans cours repousse fin d'1 semaine.
  // Les deux saisons (courante + suivante) sont traitées comme un tout continu :
  // tev_cours_dates contient les dates des deux saisons → lastStored atteint juin N+1.
  // Juillet/août = absents de coursSet → gaps comptés. Semaines de cours = présents → non comptés.
  // Vacances (Toussaint, Noël…) = absents de coursSet → gaps comptés. Aucune valeur hardcodée.
  const cur = new Date(debut.getTime());
  cur.setDate(cur.getDate() + 7);
  while (cur <= fin) {
    const iso = cur.toISOString().slice(0, 10);
    if (firstStored && iso >= firstStored && !coursSet[iso] && iso <= lastStored) {
      fin.setDate(fin.getDate() + 7);
    }
    cur.setDate(cur.getDate() + 7);
  }
  return fin.toISOString().slice(0, 10);
}

// ================================================================
// PHOTO ÉLÈVE
// ================================================================
async function tevUpdateElevePhoto(email, photo_url) {
  email = (email || '').trim().toLowerCase();
  const { error } = await _tev.from('eleves').update({ photo_url }).eq('email', email);
  if (error) throw error;
  return { ok: true };
}

async function tevUpdateEleveTel(email, tel) {
  email = (email || '').trim().toLowerCase();
  // RLS inscriptions_cours interdit UPDATE aux non-admins — seule eleves est accessible à l'élève
  const { error } = await _tev.from('eleves').update({ tel }).eq('email', email);
  if (error) throw error;
  return { ok: true };
}

// Export global pour usage dans les HTML
window.TEV = {
  // Auth
  signInMagicLink: tevSignInMagicLink,
  verifyOtp:       tevVerifyOtp,
  signOut:         tevSignOut,
  onAuthChange:    tevOnAuthChange,
  getSession:      tevGetSession,
  isAdmin:         tevIsAdmin,
  // Élève
  getEleve:        tevGetEleve,
  creerEleve:      tevCreerEleve,
  activerEleve:    tevActiverEleve,
  desactiverEleve: tevDesactiverEleve,
  // Pointage / carte
  pointerCours:    tevPointerCours,
  renouvelerCarte: tevRenouvelerCarte,
  toggleCartePaye: tevToggleCartePaye,
  // Admin
  getAdminData:    tevGetAdminData,
  // CP
  reservationCP:   tevReservationCP,
  ajouterNewsletter: tevAjouterNewsletter,
  updateStatutCP:  tevUpdateStatutCP,
  // Stages
  inscriptionStage: tevInscriptionStage,
  // Publications
  getPublications:       tevGetPublications,
  sauvegarderPublication: tevSauvegarderPublication,
  publierPublication:    tevPublierPublication,
  supprimerPublication:  tevSupprimerPublication,
  // Discussions
  getDiscussions:   tevGetDiscussions,
  getMessages:      tevGetMessages,
  createDiscussion: tevCreateDiscussion,
  postMessage:      tevPostMessage,
  closeDiscussion:  tevCloseDiscussion,
  deleteDiscussion: tevDeleteDiscussion,
  // Agenda
  getAgendaModifs:   tevGetAgendaModifs,
  sauverModifAgenda: tevSauverModifAgenda,
  // Params
  getParam:    tevGetParam,
  getAllParams: tevGetAllParams,
  setParam: tevSetParam,
  // Real-time
  subscribeEleve: tevSubscribeEleve,
  subscribeAdmin: tevSubscribeAdmin,
  unsubscribe:    tevUnsubscribe,
  // Photo
  updateElevePhoto: tevUpdateElevePhoto,
  updateEleveTel:   tevUpdateEleveTel,
  // Client brut (pour requêtes custom)
  client: _tev,
};
