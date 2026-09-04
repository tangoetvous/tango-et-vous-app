// Groupe AG — « + Pointer » admin sur la carte d'un RÉINSCRIT (2026-09-04)
// Bug réel du 1er cours de la saison : un élève revenu d'une saison précédente
// affichait « ⚠️ Pointage non enregistré : Élève introuvable ». Sa fiche eleves
// est restée sur l'ancienne saison — les 2 chemins de réinscription la laissent
// volontairement intacte (inscription directe : garde _elvAutreSaison ; valider
// le paiement : upsert ignoreDuplicates). _buildCartesData fabrique alors une
// pseudo-carte portant l'id inscriptions_cours, que tevPointerCours ne sait pas
// retrouver dans eleves. Le correctif du 2026-08-18 ne couvrait que les cartes
// REPORTÉES ; il couvre désormais toutes les pseudo-cartes.
// Les écritures Supabase sont interceptées par un faux TEV.client (aucun réseau).
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

async function lancerPointage(page, opts) {
  return page.evaluate(async (o) => {
    window.__log = [];
    IS_DEMO = false;                              // brancher le chemin réel (intercepté)
    chargerDonnees = function () { __log.push({ op: 'chargerDonnees' }); return Promise.resolve(); };
    window.fetch = function (u) { __log.push({ op: 'fetch', url: String(u) }); return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); };
    TEV.pointerCours = function (a) { __log.push({ op: 'pointerCours', args: a }); return Promise.resolve({ added: 1 }); };
    TEV.client = { from: function (table) { return {
      select: function () { return { eq: function (col, val) { return { maybeSingle: function () {
        __log.push({ t: table, op: 'select', col: col, val: val });
        return Promise.resolve({ data: o.ficheDB || null, error: null });
      } }; } }; },
      update: function (p) { return { eq: function (col, val) {
        __log.push({ t: table, op: 'update', payload: p, col: col, val: val });
        return Promise.resolve({ error: null });
      } }; },
      insert: function (rows) { __log.push({ t: table, op: 'insert', rows: rows }); return Promise.resolve({ error: null }); },
      upsert: function (p) { return { select: function () { return { single: function () {
        __log.push({ t: table, op: 'upsert', payload: p }); return Promise.resolve({ data: { id: 888 }, error: null });
      } }; } }; },
    }; } };
    var toasts = [];
    afficherToast = function (m) { toasts.push(String(m)); };

    var sc = saisonActive();
    var saiPrec = (parseInt(sc.slice(0, 4), 10) - 1) + '-' + sc.slice(0, 4);
    adminData.coursTango = [{ id: 'IC999', email: 'vlad@test.fr', prenom: 'Vlad', nom: 'DEMO', statut: 'inscrit', saison: sc, type: 'carte10', ville: 'paris', niveau: 'intermediaire' }];
    adminData.cartes = [];
    // Fiche eleves RESTÉE sur la saison précédente (le cœur du bug)
    if (o.ficheEnMemoire !== false) {
      adminData.cartes.push({ id: 555, email: 'vlad@test.fr', prenom: 'Vlad', nom: o.nomFiche || 'Vlad DEMO',
        saison: saiPrec, ville: 'paris', niveau: 'intermediaire', utilises: 10, restants: 0,
        datePremierCours: '2026-01-08', expiration: '2026-05-08', datesCours: [], paye: true });
    }
    // Pseudo-carte de la saison courante, reconstruite depuis inscriptions_cours
    adminData.cartes.push({ id: 'IC999', email: 'vlad@test.fr', nom: 'Vlad DEMO', ville: 'paris', niveau: 'intermediaire',
      utilises: o.dejaSaisis || 0, restants: 10 - (o.dejaSaisis || 0), _fromCoursTango: true,
      isReport: false, saisonOrigine: '', classesReportees: 0,
      datePremierCours: o.premierCours || '', expiration: '', datesCours: (o.datesCours || []).slice(), paye: true });

    pointerCoursAction('IC999', '2026-09-03', 1, null);
    for (var i = 0; i < 200; i++) {
      if (__log.some(function (l) { return l.op === 'chargerDonnees'; }) || toasts.some(function (t) { return t.indexOf('⚠️') === 0; })) break;
      await new Promise(function (r) { setTimeout(r, 25); });
    }
    var carte = adminData.cartes[adminData.cartes.length - 1];
    return { log: __log, toasts: toasts, carte: { utilises: carte.utilises, restants: carte.restants, datePremierCours: carte.datePremierCours, expiration: carte.expiration, datesCours: carte.datesCours } };
  }, opts);
}

test.describe('Groupe AG — Pointage admin de la carte d\'un réinscrit', () => {

  test('AG1 — la carte démarre sur la vraie fiche eleves (plus d\'« Élève introuvable »)', async ({ page }) => {
    await bootDemo(page);
    const r = await lancerPointage(page, {});
    // Jamais tevPointerCours avec l'id inscriptions_cours — c'était toute la panne
    expect(r.log.some(l => l.op === 'pointerCours')).toBe(false);
    expect(r.toasts.some(t => t.indexOf('⚠️') === 0)).toBe(false);
    // Écriture sur la fiche trouvée en mémoire (id eleves réel), pas sur 'IC999'
    const upd = r.log.find(l => l.op === 'update' && l.t === 'eleves');
    expect(upd).toBeTruthy();
    expect(upd.val).toBe(555);
    expect(upd.payload.carte_utilises).toBe(1);
    expect(upd.payload.carte_restants).toBe(9);
    expect(upd.payload.carte_date_achat).toBe('2026-09-03');
    expect(upd.payload.carte_statut).toBe('Active');
    expect(upd.payload.carte_exp_manuelle).toBe(false);
    expect(upd.payload.carte_expiration).toBeTruthy();
    expect(upd.payload.carte_num).toBe(1);
    // ⚑ Bascule de saison : c'est elle qui remet la carte d'aplomb côté admin ET élève
    expect(upd.payload.saison).toBe(await page.evaluate(() => saisonActive()));
    // Présence insérée avec le vrai eleve_id → historique visible dans l'espace élève
    const ins = r.log.find(l => l.op === 'insert' && l.t === 'presences');
    expect(ins.rows.length).toBe(1);
    expect(ins.rows[0].eleve_id).toBe(555);
    expect(ins.rows[0].date).toBe('2026-09-03');
    // Notifications élève : récap CP-E + C1 bienvenue (la carte démarre)
    const urls = r.log.filter(l => l.op === 'fetch').map(l => l.url).join(' ');
    expect(urls).toContain('carte-pointee-admin');
    expect(urls).toContain('carte-bienvenue');
    expect(r.carte.utilises).toBe(1);
    expect(r.toasts.join(' ')).toContain('Carte démarrée — 1/10');
  });

  test('AG2 — les cours déjà saisis via ✏️ Modifier sont repris, pas écrasés', async ({ page }) => {
    await bootDemo(page);
    const r = await lancerPointage(page, { dejaSaisis: 2, premierCours: '2026-09-01', datesCours: ['2026-09-02', '2026-09-01'] });
    const upd = r.log.find(l => l.op === 'update' && l.t === 'eleves');
    expect(upd.payload.carte_utilises).toBe(3);              // 2 saisis + 1 pointé
    expect(upd.payload.carte_restants).toBe(7);
    expect(upd.payload.carte_date_achat).toBe('2026-09-01'); // 1er cours conservé, pas remplacé
    // Les 2 dates saisies rejoignent presences (absentes jusque-là) + celle du jour
    const ins = r.log.find(l => l.op === 'insert' && l.t === 'presences');
    expect(ins.rows.length).toBe(3);
    expect(ins.rows.map(x => x.date).sort()).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    // Carte déjà démarrée → pas de 2ᵉ email de bienvenue
    const urls = r.log.filter(l => l.op === 'fetch').map(l => l.url).join(' ');
    expect(urls).toContain('carte-pointee-admin');
    expect(urls).not.toContain('carte-bienvenue');
    expect(r.toasts.join(' ')).toContain('Carte démarrée — 3/10');
  });

  test('AG3 — garde email partagé : aucune écriture dans la fiche d\'un autre nom', async ({ page }) => {
    await bootDemo(page);
    // Fiche unique d'un couple d'une ancienne saison : même email, AUTRE personne
    const r = await lancerPointage(page, { ficheEnMemoire: false, ficheDB: { id: 999, prenom: 'Annette', nom: 'GOURDON' } });
    expect(r.log.some(l => l.op === 'update' && l.t === 'eleves')).toBe(false);   // carte du partenaire intacte
    expect(r.log.some(l => l.op === 'insert' && l.t === 'presences')).toBe(false);
    expect(r.log.some(l => l.op === 'upsert')).toBe(false);
    expect(r.toasts.some(t => t.indexOf('⚠️ Pointage non enregistré') === 0)).toBe(true);
    expect(r.toasts.join(' ')).toContain('✏️ Modifier');      // le contournement est indiqué
    expect(r.carte.utilises).toBe(0);                          // état local intact
  });

  test('AG4 — aucune fiche eleves : elle est créée sur la saison active', async ({ page }) => {
    await bootDemo(page);
    const r = await lancerPointage(page, { ficheEnMemoire: false, ficheDB: null });
    const ups = r.log.find(l => l.op === 'upsert' && l.t === 'eleves');
    expect(ups).toBeTruthy();
    expect(ups.payload.email).toBe('vlad@test.fr');
    expect(ups.payload.prenom).toBe('Vlad');                   // repris de inscriptions_cours
    expect(ups.payload.saison).toBe(await page.evaluate(() => saisonActive()));
    const upd = r.log.find(l => l.op === 'update' && l.t === 'eleves');
    expect(upd.val).toBe(888);                                 // l'id de la fiche créée
    expect(upd.payload.carte_utilises).toBe(1);
    expect(r.toasts.some(t => t.indexOf('⚠️') === 0)).toBe(false);
  });
});

// AG5 — 2ᵉ pointage le même jour (élève inscrit à 2 cours) : l'historique repris
// ne doit pas être réinséré une seconde fois dans presences.
test('AG5 — 2ᵉ pointage du jour : pas de présences en double', async ({ page }) => {
  await bootDemo(page);
  const r = await page.evaluate(async () => {
    window.__log = [];
    IS_DEMO = false;
    chargerDonnees = function () { __log.push({ op: 'chargerDonnees' }); return Promise.resolve(); };
    window.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); };
    TEV.pointerCours = function (a) { __log.push({ op: 'pointerCours', args: a }); return Promise.resolve({ added: 1 }); };
    TEV.client = { from: function (table) { return {
      select: function () { return { eq: function () { return { maybeSingle: function () { return Promise.resolve({ data: null, error: null }); } }; } }; },
      update: function (p) { return { eq: function (col, val) { __log.push({ t: table, op: 'update', payload: p, val: val }); return Promise.resolve({ error: null }); } }; },
      insert: function (rows) { __log.push({ t: table, op: 'insert', rows: rows }); return Promise.resolve({ error: null }); },
      upsert: function () { return { select: function () { return { single: function () { return Promise.resolve({ data: { id: 888 }, error: null }); } }; } }; },
    }; } };
    afficherToast = function () {};
    var sc = saisonActive();
    // Élève inscrit à 2 cours → 2 pointages autorisés le même jour
    adminData.coursTango = [
      { id: 'IC999', email: 'vlad@test.fr', prenom: 'Vlad', nom: 'DEMO', statut: 'inscrit', saison: sc, type: 'carte10', ville: 'paris', niveau: 'intermediaire' },
      { id: 'IC998', email: 'vlad@test.fr', prenom: 'Vlad', nom: 'DEMO', statut: 'inscrit', saison: sc, type: 'carte10', ville: 'vincennes', niveau: 'intermediaire' },
    ];
    adminData.cartes = [{ id: 'IC999', email: 'vlad@test.fr', nom: 'Vlad DEMO', ville: 'paris', niveau: 'intermediaire',
      utilises: 2, restants: 8, _fromCoursTango: true, isReport: false, saisonOrigine: '',
      datePremierCours: '2026-09-01', expiration: '', datesCours: ['2026-09-02', '2026-09-01'], paye: true }];
    var attendre = async function () {
      for (var i = 0; i < 200; i++) {
        if (__log.some(function (l) { return l.op === 'chargerDonnees'; })) return;
        await new Promise(function (r) { setTimeout(r, 25); });
      }
    };
    pointerCoursAction('IC999', '2026-09-03', 1, null); await attendre();
    var phase1 = __log.slice();
    window.__log = __log = [];                       // journal remis à zéro entre les 2 clics
    pointerCoursAction('IC999', '2026-09-03', 1, null); await attendre();
    var lot = function (l) { return l.filter(function (x) { return x.op === 'insert' && x.t === 'presences'; }); };
    return { ins1: lot(phase1), ins2: lot(__log),
             upd2: __log.filter(function (x) { return x.op === 'update' && x.t === 'eleves'; }) };
  });
  // 1er pointage : la présence du jour + les 2 cours saisis via ✏️ Modifier
  expect(r.ins1.length).toBe(1);
  expect(r.ins1[0].rows.map(x => x.date).sort()).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  // 2ᵉ pointage : uniquement la présence du jour — pas de reprise en double
  expect(r.ins2.length).toBe(1);
  expect(r.ins2[0].rows.length).toBe(1);
  expect(r.ins2[0].rows[0].date).toBe('2026-09-03');
  expect(r.upd2[0].payload.carte_utilises).toBe(4);      // 2 saisis + 1er pointage + 2ᵉ
});
