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

  test('P4 — nudge install/push : handlers globaux + « Plus tard » enregistre le report', async ({ page }) => {
    const r = await page.evaluate(() => {
      const before = typeof window._nudgePlusTard === 'function' && typeof window._nudgeActiverPush === 'function';
      try { window._nudgePlusTard(); } catch(e) {}          // appelle renderAccueil (early-return) + pose le flag
      return { before, hasFlag: !!localStorage.getItem('tev_nudge_dismiss') };
    });
    expect(r.before).toBe(true);
    expect(r.hasFlag).toBe(true);
  });

  test('P5 — récap vidéo accueil : injecte la dernière vidéo + boutons (lecture / voir tout)', async ({ page }) => {
    const r = await page.evaluate(async () => {
      // Stubs des dépendances (réseau + contexte élève) — le récap est le code testé
      window._tevCoursActifs = () => ([{ ville:'paris', niveau:'debutant', nom:'Paris — Débutant', isForfait:false }]);
      window._saisonCourante = () => '2025-2026';
      const today = new Date().toISOString().slice(0,10);
      window.TEVVID.listApprouvees = async () => ([
        { bunny_video_id:'aaaa1111-bbbb-2222-cccc-333344445555', titre:'Ochos avant', ville:'paris', niveau:'debutant', source:'admin', date_cours: today },
        { bunny_video_id:'bbbb2222-cccc-3333-dddd-444455556666', titre:'Vieux giro', ville:'paris', niveau:'debutant', source:'admin', date_cours:'2025-10-01' },
      ]);
      const host = document.createElement('div'); host.id = 'acc-recap-video'; document.body.appendChild(host);
      await window._renderAccRecapVideo();
      const html = host.innerHTML;
      return {
        isFn: typeof window._renderAccRecapVideo === 'function',
        showsLatest: html.indexOf('Ochos avant') >= 0,     // la plus récente (aujourd'hui)
        notOld: html.indexOf('Vieux giro') < 0,             // pas l'ancienne
        hasPlay: html.indexOf('_vidPlayE') >= 0,
        hasSeeAll: html.indexOf("switchTab('videos')") >= 0,
        countAll: html.indexOf('(2)') >= 0,                 // 1 mise en avant + 1 autre
      };
    });
    expect(r.isFn).toBe(true);
    expect(r.showsLatest).toBe(true);
    expect(r.notOld).toBe(true);
    expect(r.hasPlay).toBe(true);
    expect(r.hasSeeAll).toBe(true);
    expect(r.countAll).toBe(true);
  });

  test('P6 — récap vidéo : aucune vidéo → placeholder vide (pas de carte fantôme)', async ({ page }) => {
    const empty = await page.evaluate(async () => {
      window._tevCoursActifs = () => ([{ ville:'paris', niveau:'debutant', nom:'Paris — Débutant', isForfait:false }]);
      window._saisonCourante = () => '2025-2026';
      window.TEVVID.listApprouvees = async () => ([]);
      const host = document.createElement('div'); host.id = 'acc-recap-video'; document.body.appendChild(host);
      await window._renderAccRecapVideo();
      return host.innerHTML;
    });
    expect(empty).toBe('');
  });
});
