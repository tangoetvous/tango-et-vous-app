// Groupe AA — Renouvellement de carte fait par l'élève (2026-08-17)
// Avant ce câblage, « Renouveler sans payer » dans l'espace élève mettait la carte
// à jour SANS prévenir personne : ni email C2 à l'élève, ni notification 🔔 admin.
const { test, expect } = require('@playwright/test');
const { bootEleve } = require('./helpers');

test.describe('Groupe AA — Renouvellement élève : notification branchée', () => {

  test('AA1 — renewCarteSelf appelle bien la route de notification en source « eleve »', async ({ page }) => {
    await bootEleve(page);
    const src = await page.evaluate(() => String(window.renewCarteSelf));
    expect(src).toContain('/api/notify/carte-renouvellement');
    expect(src).toContain("source: 'eleve'");
    // L'appel doit suivre le renouvellement réel, jamais le précéder
    expect(src.indexOf('TEV.renouvelerCarte')).toBeLessThan(src.indexOf('/api/notify/carte-renouvellement'));
    // …et rester en dehors de la branche démo (qui sort avant)
    expect(src.indexOf('IS_DEMO')).toBeLessThan(src.indexOf('/api/notify/carte-renouvellement'));
  });

  test('AA2 — le lien AssoConnect envoyé suit les Paramètres, avec repli sur le défaut', async ({ page }) => {
    await bootEleve(page);
    const res = await page.evaluate(() => {
      const sai = _sai();
      const avant = localStorage.getItem('tev_liens_assoconnect');
      localStorage.setItem('tev_liens_assoconnect', JSON.stringify({ [sai]: { renouv: 'https://exemple/renouv-parametre' } }));
      const configure = _lienRenouvAC();
      localStorage.removeItem('tev_liens_assoconnect');
      const repli = _lienRenouvAC();
      if (avant !== null) localStorage.setItem('tev_liens_assoconnect', avant);
      return { configure, repli };
    });
    expect(res.configure).toBe('https://exemple/renouv-parametre');
    expect(res.repli).toContain('assoconnect.com');   // jamais vide → le bouton de l'email reste cliquable
  });
});
