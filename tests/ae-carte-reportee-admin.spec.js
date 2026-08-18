// Groupe AE — « + Pointer » admin sur une carte reportée (2026-08-18, volet 2/2)
// Avant : la carte reportée porte l'id inscriptions_cours → tevPointerCours ne
// retrouvait pas la fiche eleves → throw avalé par un catch MUET : le clic
// semblait fait, rien n'était enregistré. Désormais le premier pointage
// REDÉMARRE la carte (même logique que ✏️ Modifier) : résolution du vrai
// eleves.id par email, fiche remise à neuf (n/N, date, expiration, saison
// active), présences insérées, notifications envoyées — et tout échec est
// affiché en toast.
// Les écritures Supabase sont interceptées par un faux TEV.client (aucun réseau).
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

// Installe les intercepteurs + la carte reportée, puis lance pointerCoursAction.
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
        return Promise.resolve(o.eleveIntrouvable ? { data: null, error: null } : { data: { id: 777 }, error: null });
      } }; } }; },
      update: function (p) { return { eq: function (col, val) {
        __log.push({ t: table, op: 'update', payload: p, col: col, val: val });
        return Promise.resolve(o.updateEchoue ? { error: { message: 'colonne inconnue' } } : { error: null });
      } }; },
      insert: function (rows) { __log.push({ t: table, op: 'insert', rows: rows }); return Promise.resolve({ error: null }); },
      upsert: function (p) { return { select: function () { return { single: function () {
        __log.push({ t: table, op: 'upsert', payload: p }); return Promise.resolve({ data: { id: 888 }, error: null });
      } }; } }; },
    }; } };
    var toasts = [];
    afficherToast = function (m) { toasts.push(String(m)); };

    var sc = saisonActive();
    adminData.coursTango = [{ id: 'IC999', email: 'sophie@test.fr', prenom: 'Sophie', nom: 'DEMO', statut: 'inscrit', saison: sc, type: 'carte10', ville: 'paris', niveau: 'debutant' }];
    adminData.cartes = [];
    if (o.carteNormale) {
      adminData.cartes.push({ id: 555, email: 'sophie@test.fr', prenom: 'Sophie', nom: 'Sophie DEMO', ville: 'paris', niveau: 'debutant', utilises: 2, restants: 8, datePremierCours: '2026-01-08', expiration: '2026-05-08', datesCours: [], paye: true });
    } else {
      adminData.cartes.push({ id: 'IC999', email: 'sophie@test.fr', prenom: 'Sophie', nom: 'Sophie DEMO', ville: 'paris', niveau: 'debutant', utilises: 0, restants: 4, classesReportees: 4, isReport: true, saisonOrigine: '2024-2025', _fromCoursTango: true, datePremierCours: '', expiration: '', datesCours: [], paye: true });
    }
    pointerCoursAction(o.carteNormale ? 555 : 'IC999', '2026-09-03', 1, null);
    // Attendre la fin de la chaîne asynchrone (chargerDonnees stubé, ou toast d'erreur)
    for (var i = 0; i < 200; i++) {
      if (__log.some(function (l) { return l.op === 'chargerDonnees'; }) || toasts.some(function (t) { return t.indexOf('⚠️') === 0; })) break;
      await new Promise(function (r) { setTimeout(r, 25); });
    }
    var carte = adminData.cartes[0];
    return { log: __log, toasts: toasts, carte: { utilises: carte.utilises, restants: carte.restants, datePremierCours: carte.datePremierCours, expiration: carte.expiration, datesCours: carte.datesCours } };
  }, opts);
}

test.describe('Groupe AE — Pointage admin des cartes reportées', () => {

  test('AE1 — carte reportée : redémarrage complet via le vrai eleves.id', async ({ page }) => {
    await bootDemo(page);
    const r = await lancerPointage(page, {});
    // Résolution par email, jamais tevPointerCours avec le mauvais id
    expect(r.log.some(l => l.op === 'pointerCours')).toBe(false);
    expect(r.log.find(l => l.op === 'select' && l.t === 'eleves').val).toBe('sophie@test.fr');
    // Fiche eleves remise à neuf : 1/4, date du cours, expiration, saison active
    const upd = r.log.find(l => l.op === 'update' && l.t === 'eleves');
    expect(upd.val).toBe(777);
    expect(upd.payload.carte_utilises).toBe(1);
    expect(upd.payload.carte_restants).toBe(3);
    expect(upd.payload.carte_date_achat).toBe('2026-09-03');
    expect(upd.payload.carte_statut).toBe('Active');
    expect(upd.payload.carte_expiration).toBeTruthy();
    expect(upd.payload.saison).toMatch(/^\d{4}-\d{4}$/);
    expect(upd.payload.carte_num).toBe(1);                   // 1ʳᵉ carte de la nouvelle saison
    // Présence insérée avec le bon eleve_id
    const ins = r.log.find(l => l.op === 'insert' && l.t === 'presences');
    expect(ins.rows.length).toBe(1);
    expect(ins.rows[0].eleve_id).toBe(777);
    expect(ins.rows[0].date).toBe('2026-09-03');
    // Notifications élève : récap CP-E + C1 bienvenue
    const urls = r.log.filter(l => l.op === 'fetch').map(l => l.url).join(' ');
    expect(urls).toContain('carte-pointee-admin');
    expect(urls).toContain('carte-bienvenue');
    // État local : la carte affiche 1/4 avec sa nouvelle expiration
    expect(r.carte.utilises).toBe(1);
    expect(r.carte.restants).toBe(3);
    expect(r.carte.datePremierCours).toBe('2026-09-03');
    expect(r.carte.expiration).toBeTruthy();
    expect(r.toasts.join(' ')).toContain('redémarrée — 1/4');
  });

  test('AE2 — non-régression : une carte NORMALE passe toujours par tevPointerCours', async ({ page }) => {
    await bootDemo(page);
    const r = await lancerPointage(page, { carteNormale: true });
    const pc = r.log.find(l => l.op === 'pointerCours');
    expect(pc).toBeTruthy();
    expect(pc.args.eleveId).toBe(555);                       // l'id eleves, comme avant
    expect(r.log.some(l => l.op === 'update' && l.t === 'eleves')).toBe(false); // pas de remise à neuf
    expect(r.toasts.join(' ')).not.toContain('⚠️');
  });

  test('AE3 — un échec d\'écriture est désormais VISIBLE (plus de catch muet)', async ({ page }) => {
    await bootDemo(page);
    const r = await lancerPointage(page, { updateEchoue: true });
    expect(r.toasts.some(t => t.indexOf('⚠️ Pointage non enregistré') === 0)).toBe(true);
    expect(r.carte.utilises).toBe(0);                        // état local intact
    expect(r.log.some(l => l.op === 'insert' && l.t === 'presences')).toBe(false); // rien après l'échec
  });
});
