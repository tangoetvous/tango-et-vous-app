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
});
