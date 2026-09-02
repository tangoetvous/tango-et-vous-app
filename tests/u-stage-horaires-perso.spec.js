// Groupe U — Stages admin : le bandeau de la vue Stages doit afficher les
// horaires PERSONNALISÉS de la date (st.horaires), pas les horaires de saison
// ni les défauts. Régression du bug 2026-07-24 (renderStages lisait
// _loadParam('stages',sai,'horaires') sans fusionner l'override par date).
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

// HORLOGE GELÉE (comme les groupes AC/T/S) : la fixture stage est datée 2026-08-01 (saison 2025-2026) — sans horloge figée,
// la bascule du 1er septembre filtre la fixture (panne réelle du 2026-09-01).
const ANCRE = new Date('2026-07-20T10:00:00');

test('U1 — vue Stages : horaire technique personnalisé de la date affiché (pas le défaut)', async ({ page }) => {
  await page.clock.setFixedTime(ANCRE);  // AVANT le goto de bootDemo
  await bootDemo(page);
  await page.evaluate(() => {
    var sai = saisonActive();
    var d = '2026-08-01'; // date de saison 2025-2026 (août)
    // Horaires de SAISON = 14h–15h pour la technique (proches du défaut)
    localStorage.setItem('tev_params_stages_' + sai, JSON.stringify({
      horaires: { tech_deb: '14h', tech_fin: '15h', s1_deb: '15h', s1_fin: '16h30', s2_deb: '16h30', s2_fin: '18h' },
    }));
    // Entrée STAGES avec override PAR DATE : technique 16h–17h (personnalisé)
    STAGES = (typeof STAGES !== 'undefined' ? STAGES : []).filter(function (s) { return s.date !== d; });
    STAGES.push({ date: d, label: 'Sam. 1 Août 2026', technique: true, nStages: 2, themes: ['', ''],
      horaires: { tech_deb: '16h', tech_fin: '17h' } });
    adminData.stages = adminData.stages || {};
    adminData.stages[d] = { label: 'Sam. 1 Août 2026', inscrits: [
      { prenom: 'Ana', nom: 'TEST', email: 'ana@test.fr', role: 'guidee', slots: ['technique'], attente: false },
    ] };
    currentTab = 'stages';
    filtreStage = d;
    filtreStageSlot = 'technique';
    renderTab(); // rendu ASYNCHRONE
  });
  await page.waitForFunction(() => {
    var tc = document.getElementById('tab-content');
    return tc && !tc.querySelector('.spinner') && tc.textContent.indexOf('Technique') >= 0;
  });
  const res = await page.evaluate(() => {
    const txt = document.getElementById('tab-content').textContent;
    return { perso: txt.indexOf('16H–17H') >= 0 || txt.indexOf('16h–17h') >= 0,
             saison: txt.indexOf('14H–15H') >= 0 || txt.indexOf('14h–15h') >= 0 };
  });
  expect(res.perso).toBe(true);   // horaire personnalisé de la date affiché
  expect(res.saison).toBe(false); // l'horaire de saison/défaut n'apparaît plus
});
