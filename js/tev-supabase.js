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
  if (eleve.statut_eleve !== 'Actif') {
    return {
      error: 'not_active',
      statut: eleve.statut_eleve,
      message: eleve.statut_eleve === 'En attente'
        ? "Votre compte est en cours de validation. Vous recevrez un email dès qu'il sera activé."
        : 'Votre accès est suspendu. Contactez-nous si vous pensez que c\'est une erreur.',
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
    },
    carte: {
      coursUtilises:  eleve.carte_utilises,
      coursRestants:  eleve.carte_restants,
      dateAchat:      _fmtDateSb(eleve.carte_date_achat),
      dateExpiration: _fmtDateSb(eleve.carte_expiration),
      statut:         eleve.carte_statut,
      paye:           eleve.carte_paye,
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
async function tevPointerCours({ eleveId, date, niveau, note, nbCours }) {
  const n = Math.min(2, Math.max(1, parseInt(nbCours) || 1));

  // Compter les pointages du jour
  const { count: dejaPointe } = await _tev
    .from('presences')
    .select('id', { count: 'exact', head: true })
    .eq('eleve_id', eleveId)
    .eq('date', date);

  const aAjouter = Math.min(n, 2 - (dejaPointe || 0));
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
  let renouvAuto = false, renouvOverflow = 0;
  let carteUpdate = {};

  if (totalApres > 10) {
    const overflow  = totalApres - 10;
    const nouvExp   = _calcExpirationSb(date, eleve.ville);
    carteUpdate = {
      carte_utilises:   overflow,
      carte_restants:   10 - overflow,
      carte_date_achat: date,
      carte_expiration: nouvExp,
      carte_paye:       false,
      carte_statut:     'Active',
    };
    renouvAuto     = true;
    renouvOverflow = overflow;
  } else {
    carteUpdate = {
      carte_utilises: totalApres,
      carte_restants: Math.max(0, (eleve.carte_restants || 0) - aAjouter),
    };
    if (!eleve.carte_date_achat && estPremierCours) {
      carteUpdate.carte_date_achat = date;
      carteUpdate.carte_expiration = _calcExpirationSb(date, eleve.ville);
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
// CARTE — renouvelerCarte
// ================================================================
async function tevRenouvelerCarte({ eleveId, paye }) {
  await _tev.from('eleves').update({
    carte_utilises:   0,
    carte_restants:   10,
    carte_date_achat: null,
    carte_expiration: null,
    carte_statut:     'Nouvelle carte',
    carte_paye:       paye !== false,
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

async function tevSauvegarderPublication({ id, cat, titre, extrait, contenu, image, video, dateProgrammee, datesProgrammees, cours }) {
  const donnees = { cat: cat||'actu', extrait: extrait||'', image: image||'', video: video||'', dateProgrammee: dateProgrammee||'', datesProgrammees: datesProgrammees||[], cours: cours||[] };
  const fields = { titre, contenu, publiee: true, donnees };
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
  // Élève : discussions publiques (créées par admin, eleve_email vide/null) + ses propres discussions
  return all.filter(d => !d.eleve_email || d.eleve_email === email);
}

async function tevGetMessages(discussionId) {
  const { data } = await _tev.from('discussion_messages').select('*')
    .eq('discussion_id', discussionId).order('created_at');
  return data || [];
}

async function tevCreateDiscussion({ titre, eleveEmail, eleveNom, groupes }) {
  const { data, error } = await _tev.from('discussions').insert({
    titre, eleve_email: eleveEmail.toLowerCase(), eleve_nom: eleveNom || '',
    groupes: groupes || [],
  }).select('id').single();
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
// UTILITAIRES
// ================================================================
function _calcExpirationSb(dateStr, ville) {
  if (!dateStr) return null;
  // T12:00:00 évite le glissement de -1 jour dû au décalage UTC/heure locale
  const debut = new Date(dateStr + 'T12:00:00');
  const fin   = new Date(debut.getTime());
  fin.setMonth(fin.getMonth() + 3);

  // Dates de cours depuis Paramètres (localStorage mis à jour depuis Supabase)
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('tev_cours_dates') || '{}'); } catch(e) {}
  const coursArr = ((ville === 'vincennes' ? stored.vincennes : stored.paris) || []).slice().sort();
  const coursSet = {};
  coursArr.forEach(d => { coursSet[d] = true; });

  const firstStored = coursArr[0] || '';
  const lastStored  = coursArr[coursArr.length - 1] || '';

  // Bornes de saison — calculées avant le bonus pour éviter le double-comptage été
  const seasonEndYear = debut.getMonth() >= 8 ? debut.getFullYear() + 1 : debut.getFullYear();
  const septStart = seasonEndYear + '-09-01';
  const seasonStartBound = (seasonEndYear - 1) + '-09-01';
  let lastSaisonCours = '';
  coursArr.forEach(d => { if (d >= seasonStartBound && d < septStart && d > lastSaisonCours) lastSaisonCours = d; });
  const firstNextCours = coursArr.find(d => d >= septStart) || '';

  // Bonus : semaines absentes INTRA-SAISON uniquement (cap à lastSaisonCours pour éviter
  // de compter juillet-août deux fois avec la coupure estivale ci-dessous)
  const bonusUpperBound = lastSaisonCours || lastStored;
  let bonus = 0;
  const cur = new Date(debut.getTime());
  cur.setDate(cur.getDate() + 7);
  const finStr = fin.toISOString().slice(0, 10);
  while (cur.toISOString().slice(0, 10) <= finStr) {
    const iso = cur.toISOString().slice(0, 10);
    if (firstStored && iso >= firstStored && iso <= bonusUpperBound && !coursSet[iso]) bonus++;
    cur.setDate(cur.getDate() + 7);
  }
  fin.setDate(fin.getDate() + bonus * 7);

  // Coupure estivale : ajoute les semaines entre dernier cours et reprise
  if (lastSaisonCours && firstNextCours) {
    const lastD  = new Date(lastSaisonCours  + 'T12:00:00');
    const firstD = new Date(firstNextCours + 'T12:00:00');
    if (fin > lastD) {
      const pauseWeeks = Math.ceil((firstD - lastD) / (7 * 24 * 60 * 60 * 1000));
      fin.setDate(fin.getDate() + pauseWeeks * 7);
    }
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
