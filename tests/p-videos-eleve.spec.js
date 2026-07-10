// Groupe P — Vidéos des cours (côté élève). Charge index.html (non connecté) :
// confirme surtout que le gros bloc JS ajouté parse et boote sans casser la page,
// que la rubrique rend son état vide sans crash, et que le lecteur s'ouvre.
const { test, expect } = require('@playwright/test');
const { bootEleve } = require('./helpers');

test.describe('Groupe P — Vidéos des cours (élève)', () => {
  test.beforeEach(async ({ page }) => { await bootEleve(page); });

  test('P1 — fonctions vidéo élève définies (parse + câblage OK)', async ({ page }) => {
    const r = await page.evaluate(() => ({
      play: typeof window._vidPlayE === 'function',
      proposer: typeof window._vidProposerE === 'function',
      filter: typeof window._vidFilterE === 'function',
      pane: !!document.getElementById('videos-pane'),
      tevvid: typeof window.TEVVID === 'object',
    }));
    expect(r.play).toBe(true);
    expect(r.proposer).toBe(true);
    expect(r.filter).toBe(true);
    expect(r.pane).toBe(true);
    expect(r.tevvid).toBe(true);
  });

  test('P2 — l\'onglet Vidéos rend un état vide sans inscription (pas de crash)', async ({ page }) => {
    const txt = await page.evaluate(() => {
      window.switchTab('videos');
      return document.getElementById('videos-pane').textContent || '';
    });
    expect(txt.length).toBeGreaterThan(10);
    expect(txt).toMatch(/vidéos de vos cours|inscription/i);
  });

  test('P3 — _vidPlayE ouvre un lecteur iframe Bunny', async ({ page }) => {
    const ok = await page.evaluate(() => {
      window._vidPlayE('abc12345-def6-7890-abcd-ef1234567890');
      const ifr = document.querySelector('iframe[src*="mediadelivery.net"]');
      const found = !!ifr;
      const ov = document.querySelector('div[style*="99999"]');
      if (ov) ov.remove();
      return found;
    });
    expect(ok).toBe(true);
  });
});
