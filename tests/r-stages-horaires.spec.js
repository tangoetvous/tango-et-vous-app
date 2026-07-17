// Groupe R — Stages : les horaires de la saison SUIVANTE doivent être lus
// depuis tev_params_stages_<saisonSuivante> (horaires admin), PAS les défauts
// codés (14h–15h / 15h–16h30 / 16h30–18h).
// Régression du fix 2026-07-17 : synchro Supabase des params 2 saisons +
// lecture par saison dans chargerDonnees (~ligne 725). Réseau bloqué → on
// teste la LECTURE pure depuis un localStorage pré-rempli.
const { test, expect } = require('@playwright/test');

test.describe('Groupe R — Stages horaires par saison', () => {

  test('R1 — horaires saison suivante lus depuis les params admin (pas les défauts)', async ({ page }) => {
    await page.addInitScript(() => {
      // Une date de stage en sept. 2026 → saison 2026-2027
      localStorage.setItem('tev_dates_stages_2026-2027', JSON.stringify({
        saison: '2026-2027',
        stages: [{ date: '2026-09-19', label: 'Sam. 19 Sep 2026', nStages: 2, technique: true, themes: ['', ''] }],
      }));
      // Horaires ADMIN volontairement distincts des défauts
      localStorage.setItem('tev_params_stages_2026-2027', JSON.stringify({
        horaires: { tech_deb: '11h', tech_fin: '12h', s1_deb: '12h', s1_fin: '13h', s2_deb: '13h', s2_fin: '14h' },
        adresse: { nom: 'Lieu Test', rue: '1 rue Test' },
      }));
    });
    await page.route('**/*', route => {
      const u = route.request().url();
      (u.includes('127.0.0.1:8788') || u.includes('localhost:8788')) ? route.continue() : route.abort();
    });
    await page.goto('/stages-pwa.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const res = await page.evaluate(() => {
      if (typeof chargerDonnees === 'function') chargerDonnees();
      const d = (typeof DATES_STAGES !== 'undefined' && DATES_STAGES[0]) || null;
      if (!d) return { ok: false };
      const map = {};
      d.stages.forEach(s => { map[s.type] = s.horaire; });
      return { ok: true, date: d.date, tech: map.technique, s1: map.stage1, s2: map.stage2, adr: (d.adresse && d.adresse.nom) || '' };
    });

    expect(res.ok).toBe(true);
    expect(res.date).toBe('2026-09-19');
    // Horaires ADMIN (11h–12h…), surtout PAS les défauts 14h–15h / 15h–16h30 / 16h30–18h
    expect(res.tech).toBe('11h–12h');
    expect(res.s1).toBe('12h–13h');
    expect(res.s2).toBe('13h–14h');
    expect(res.adr).toBe('Lieu Test');
  });

  test('R2 — appareil vierge : synchro Supabase (mockée) → horaires admin affichés', async ({ page }) => {
    // Chaîne COMPLÈTE sur localStorage vide : la synchro DOMContentLoaded doit
    // récupérer dates + params des 2 saisons depuis Supabase (mock avec les
    // données réelles de prod du 2026-07-17), puis chargerDonnees doit afficher
    // les horaires ADMIN — pas les défauts codés (14h–15h…).
    const REAL_DATES = {
      saison: '2026-2027',
      stages: [
        { date: '2026-09-19', label: 'Sam. 19 Sep 2026', technique: true, nStages: 2, themes: ['', ''] },
        { date: '2026-10-03', label: 'Sam. 3 Oct 2026', technique: true, nStages: 2, themes: ['', ''] },
        { date: '2026-11-07', label: 'Sam. 7 Nov 2026', technique: true, nStages: 2, themes: ['', ''] },
      ],
    };
    const REAL_PARAMS = {
      horaires: {
        s1_deb: '15h30', s1_fin: '17h', s2_deb: '17h', s2_fin: '18h30',
        s3_deb: '12h', s3_fin: '13h30', s4_deb: '10h30', s4_fin: '12h',
        tech_deb: '14h30', tech_fin: '15h30',
      },
    };
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.includes('127.0.0.1:8788') || u.includes('localhost:8788')) return route.continue();
      if (u.includes('supabase.co/rest/v1/parametres')) {
        let body = null;
        if (u.includes('tev_dates_stages_2026-2027')) body = { valeur: REAL_DATES };
        else if (u.includes('tev_params_stages_2026-2027')) body = { valeur: REAL_PARAMS };
        if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        // clé absente → PostgREST .single() 0 ligne
        return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: '0 rows' }) });
      }
      return route.abort();
    });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/stages-pwa.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500); // laisser la synchro async se terminer

    const res = await page.evaluate(() => {
      const d = (typeof DATES_STAGES !== 'undefined' && DATES_STAGES[0]) || null;
      const ls = {
        dates: !!localStorage.getItem('tev_dates_stages_2026-2027'),
        params: !!localStorage.getItem('tev_params_stages_2026-2027'),
      };
      if (!d) return { ls, count: 0 };
      const map = {};
      d.stages.forEach(s => { map[s.type] = s.horaire; });
      return { ls, count: DATES_STAGES.length, first: d.date, tech: map.technique, s1: map.stage1, s2: map.stage2 };
    });

    expect(errors).toEqual([]);
    expect(res.ls.dates).toBe(true);   // synchro dates OK
    expect(res.ls.params).toBe(true);  // synchro params OK
    expect(res.count).toBe(3);
    expect(res.first).toBe('2026-09-19');
    expect(res.tech).toBe('14h30–15h30');
    expect(res.s1).toBe('15h30–17h');
    expect(res.s2).toBe('17h–18h30');
  });

  test('R3 — liste mélangeant 2 saisons : chaque stage garde les horaires de SA saison', async ({ page }) => {
    // Scénario réel du bug (2026-07-17) : en été, le 1er stage de la liste est
    // le 1er août (saison 2025-2026, horaires personnalisés) et les suivants
    // sont de la saison 2026-2027. AVANT le fix, les horaires de la saison du
    // 1er stage s'appliquaient à TOUTES les dates → les stages 2026-2027
    // affichaient les mauvais horaires.
    await page.addInitScript(() => {
      localStorage.setItem('tev_dates_stages_2025-2026', JSON.stringify({
        saison: '2025-2026',
        stages: [{
          date: '2026-08-01', label: 'Sam. 1 Août 2026', technique: true, nStages: 2, themes: ['', ''],
          horaires: { s1_deb: '14h', s1_fin: '15h30', tech_deb: '15h30', tech_fin: '16h30', s2_deb: '16h30', s2_fin: '18h' },
        }],
      }));
      localStorage.setItem('tev_dates_stages_2026-2027', JSON.stringify({
        saison: '2026-2027',
        stages: [
          { date: '2026-09-19', label: 'Sam. 19 Sep 2026', technique: true, nStages: 2, themes: ['', ''] },
          { date: '2026-10-03', label: 'Sam. 3 Oct 2026', technique: true, nStages: 2, themes: ['', ''] },
        ],
      }));
      // Horaires de saison distincts pour chaque saison
      localStorage.setItem('tev_params_stages_2025-2026', JSON.stringify({
        horaires: { tech_deb: '13h', tech_fin: '14h', s1_deb: '14h', s1_fin: '15h30', s2_deb: '15h30', s2_fin: '17h' },
      }));
      localStorage.setItem('tev_params_stages_2026-2027', JSON.stringify({
        horaires: { tech_deb: '14h30', tech_fin: '15h30', s1_deb: '15h30', s1_fin: '17h', s2_deb: '17h', s2_fin: '18h30' },
      }));
    });
    await page.route('**/*', route => {
      const u = route.request().url();
      (u.includes('127.0.0.1:8788') || u.includes('localhost:8788')) ? route.continue() : route.abort();
    });
    await page.goto('/stages-pwa.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const res = await page.evaluate(() => {
      if (typeof chargerDonnees === 'function') chargerDonnees();
      return DATES_STAGES.map(d => {
        const map = {};
        d.stages.forEach(s => { map[s.type] = s.horaire; });
        return { date: d.date, tech: map.technique, s1: map.stage1, s2: map.stage2 };
      });
    });

    expect(res.length).toBe(3);
    // 1er août : horaires PERSONNALISÉS de la date (prioritaires)
    expect(res[0].date).toBe('2026-08-01');
    expect(res[0].s1).toBe('14h–15h30');
    expect(res[0].tech).toBe('15h30–16h30');
    // 19 sept & 3 oct : horaires de la saison 2026-2027 — PAS ceux de 2025-2026
    expect(res[1].date).toBe('2026-09-19');
    expect(res[1].tech).toBe('14h30–15h30');
    expect(res[1].s1).toBe('15h30–17h');
    expect(res[1].s2).toBe('17h–18h30');
    expect(res[2].date).toBe('2026-10-03');
    expect(res[2].tech).toBe('14h30–15h30');
  });
});
