// Groupe AF — Quota du formulaire public inscription-cours.html (2026-08-19)
// Bug d'origine : le contrôle de quota lisait inscriptions_cours directement ;
// la RLS renvoyait silencieusement 0 ligne au client anonyme → 0 guideur compté
// → un guideur validé sur un cours COMPLET (cas réel Vincennes Int. 23/22).
// Fix : RPC SECURITY DEFINER compter_inscrits_cours + repli FAIL-OPEN.
// ⚠️ Tout Supabase est intercepté — l'INSERT est capturé, jamais envoyé.
const { test, expect } = require('@playwright/test');

async function bootEtSoumettre(page, opts) {
  const captures = { inserts: [], rpc: [], notify: [] };
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:8788/')) {
      // /api/notify/* du worker n'existe pas sur le serveur de test → laisser
      // passer (404, fire-and-forget côté formulaire)
      return route.continue();
    }
    if (u.includes('/api/notify/inscription-cours')) {
      // Charge utile envoyée au worker — porte la RAISON de l'attente (quotaFull1/2)
      captures.notify.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (u.includes('/rest/v1/rpc/compter_inscrits_cours')) {
      captures.rpc.push(JSON.parse(route.request().postData() || '{}'));
      if (opts.rpcEchoue) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.compte) });
    }
    if (u.includes('/rest/v1/inscriptions_cours') && route.request().method() === 'POST') {
      // Le formulaire peut poster un objet (1 ligne) ou un tableau — on aplatit
      const _b = JSON.parse(route.request().postData() || 'null');
      captures.inserts.push(...(Array.isArray(_b) ? _b : [_b]));
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (u.includes('supabase.co')) {
      return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: '0 rows' }) });
    }
    return route.abort();
  });
  await page.goto('/inscription-cours.html?mode=regulier', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof finalize === 'function' && !!window.TEV);

  await page.evaluate(async (o) => {
    S.nbCours = 1;
    S.c1 = { ville: 'vincennes', niveau: 'intermediaire' };
    S.role = o.role; S.venue = o.venue || 'seul';
    if (o.venue === 'avec-part') { S.pPrenom = 'Ana'; S.pNom = 'TEST'; S.pEmail = 'ana@test.fr'; S.pRole = getRoleAuto(o.role); }
    S.prenom = 'Marc'; S.nom = 'TEST'; S.email = 'marc@test.fr'; S.tel = '0600000000';
    S.saison = '2026-2027'; S.niveauEleve = '2ans';
    await finalize();
  }, opts.etat);
  await page.waitForTimeout(300);

  const ecran = await page.evaluate(() => ({
    wait: document.getElementById('success-wait').style.display === 'block',
    asso: document.getElementById('success-asso').style.display === 'block',
    notice: (function (n) { return !!n && n.style.display === 'block'; })(document.getElementById('quota-full-notice')),
  }));
  return { captures, ecran };
}

test.describe('Groupe AF — Quota inscription cours (RPC + fail-open)', () => {

  test('AF1 — 22 guideurs déjà comptés : le guideur passe en ATTENTE (statut demande)', async ({ page }) => {
    const { captures, ecran } = await bootEtSoumettre(page, {
      compte: { gui: 22, gde: 5 },
      etat: { role: 'guideur' },
    });
    // La RPC a bien été appelée avec le cours et la saison soumis
    expect(captures.rpc[0]).toEqual({ p_ville: 'vincennes', p_niveau: 'intermediaire', p_saison: '2026-2027' });
    // Écran liste d'attente + bandeau « cours complet »
    expect(ecran.wait).toBe(true);
    expect(ecran.asso).toBe(false);
    expect(ecran.notice).toBe(true);
    // La ligne insérée porte statut='demande' (Att. Validation), pas attente_paiement
    expect(captures.inserts.length).toBe(1);
    expect(captures.inserts[0].statut).toBe('demande');
    expect(captures.inserts[0].role).toBe('guideur');
    // La raison « quota » part vers le worker → variante email I01-complet
    expect(captures.notify[0].quotaFull1).toEqual({ gui: true, gde: false });
  });

  test('AF2 — quota libre : guideur validé comme avant (attente_paiement)', async ({ page }) => {
    const { captures, ecran } = await bootEtSoumettre(page, {
      compte: { gui: 10, gde: 5 },
      etat: { role: 'guideur' },
    });
    expect(ecran.asso).toBe(true);
    expect(ecran.wait).toBe(false);
    expect(ecran.notice).toBe(false);
    expect(captures.inserts[0].statut).toBe('attente_paiement');
    expect(captures.notify[0].quotaFull1).toBe(null);   // pas de quota → email inchangé
  });

  test('AF3 — FAIL-OPEN : la RPC échoue (500) → validé, jamais mis en attente à tort', async ({ page }) => {
    const { captures, ecran } = await bootEtSoumettre(page, {
      rpcEchoue: true,
      etat: { role: 'guideur' },
    });
    expect(captures.rpc.length).toBe(1);            // la RPC a bien été tentée
    expect(ecran.asso).toBe(true);                  // comportement historique
    expect(ecran.wait).toBe(false);
    expect(captures.inserts[0].statut).toBe('attente_paiement');
  });

  test('AF4 — couple : quota plein côté GUIDÉES → les DEUX fiches en attente', async ({ page }) => {
    // Le guideur s'inscrit avec sa partenaire guidée ; les guidées sont à 23/23
    const { captures, ecran } = await bootEtSoumettre(page, {
      compte: { gui: 10, gde: 23 },
      etat: { role: 'guideur', venue: 'avec-part' },
    });
    expect(ecran.wait).toBe(true);
    expect(ecran.notice).toBe(true);
    expect(captures.inserts.length).toBe(2);        // inscripteur + partenaire
    expect(captures.inserts[0].statut).toBe('demande');
    expect(captures.inserts[1].statut).toBe('demande');
    // Raison transmise : quota guidées → variante email I01-quota-att (duo)
    expect(captures.notify[0].quotaFull1).toEqual({ gui: false, gde: true });
  });
});
