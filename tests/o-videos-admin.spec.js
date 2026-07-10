// Groupe O — Vidéos des cours (côté admin), rendu en mode démo.
// Vérifie que l'onglet Vidéos s'affiche (formulaire Publier + sous-onglets) et que
// le lecteur modal s'ouvre/se ferme, sans dépendre du réseau (Bunny/Supabase).
// ⚠️ renderTab() rend en ASYNCHRONE (setTimeout 40ms) → toujours attendre le DOM.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

test.describe('Groupe O — Vidéos des cours (admin)', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('O1 — l\'onglet Vidéos rend le formulaire Publier + les sous-onglets', async ({ page }) => {
    await page.evaluate(() => { _admVidSub = 'publier'; switchTab('videos'); });
    await page.waitForSelector('#vid-titre');
    const r = await page.evaluate(() => {
      const html = gel('tab-content').innerHTML;
      return {
        hasCours: !!document.getElementById('vid-cours'),
        hasFile: !!document.getElementById('vid-file'),
        hasPublier: html.indexOf('_videoPublier()') >= 0,
        hasSubtabs: html.indexOf('_vidSub(') >= 0,
      };
    });
    expect(r.hasCours).toBe(true);
    expect(r.hasFile).toBe(true);
    expect(r.hasPublier).toBe(true);
    expect(r.hasSubtabs).toBe(true);
  });

  test('O2 — le sous-onglet Bibliothèque rend sans erreur (démo)', async ({ page }) => {
    await page.evaluate(() => { switchTab('videos'); });
    await page.waitForSelector('#vid-titre');
    await page.evaluate(() => { _vidSub('biblio'); });
    await page.waitForFunction(() => gel('tab-content').innerHTML.indexOf('Bibliothèque vidéos') >= 0);
    expect(true).toBe(true);
  });

  test('O3 — _videoPlay ouvre le lecteur (iframe) puis _videoClose le retire', async ({ page }) => {
    const r = await page.evaluate(() => {
      _videoPlay('abc12345-def6-7890-abcd-ef1234567890');
      const opened = !!_vidModalEl && document.body.contains(_vidModalEl);
      const hasIframe = !!(_vidModalEl && _vidModalEl.querySelector('iframe'));
      _videoClose();
      return { opened, hasIframe, closed: _vidModalEl === null };
    });
    expect(r.opened).toBe(true);
    expect(r.hasIframe).toBe(true);
    expect(r.closed).toBe(true);
  });

  test('O4 — publier sans fichier affiche un message, aucun envoi réseau (garde IS_DEMO)', async ({ page }) => {
    await page.evaluate(() => { _admVidSub = 'publier'; switchTab('videos'); });
    await page.waitForSelector('#vid-titre');
    const msg = await page.evaluate(async () => {
      gel('vid-titre').value = 'Test démo';
      await _videoPublier();
      return gel('vid-msg').textContent;
    });
    expect(msg).toMatch(/vidéo|fichier/i);
  });
});
