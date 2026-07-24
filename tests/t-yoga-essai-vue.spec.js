// Groupe T — Yoga → Essai Yoga : vue filtrée (2026-07-24)
// 1. Seules les dates avec AU MOINS UN inscrit apparaissent (plus de dates vides)
// 2. Seules les dates du jour et à venir (le passé = onglet 📋 Historique), max 20
// 3. Horaires yin/hatha des sous-titres lus depuis tev_params_yoga_<sai>.horaires
//    (plus de « 10h30 » / « 11h30 » codés en dur)
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

// Saison active en démo = 2025-2026 (sept 2025 → août 2026). Aujourd'hui : juillet 2026.
const ESSAIS = [
  // Date PASSÉE avec inscrit → ne doit PLUS apparaître (Historique)
  { id: 1, prenom: 'Pia', nom: 'PASSEE', email: 'pia@test.fr', date: '2026-07-01', cours: 'yin', statut: 'confirme' },
  // Date FUTURE avec inscrits → affichée
  { id: 2, prenom: 'Fab', nom: 'FUTUR', email: 'fab@test.fr', date: '2026-08-04', cours: 'yin', statut: 'confirme' },
  { id: 3, prenom: 'Gus', nom: 'FORFAIT', email: 'gus@test.fr', date: '2026-08-04', cours: 'forfait', statut: 'confirme' },
];

async function bootYogaEssai(page, horaires) {
  await bootDemo(page);
  await page.evaluate(([essais, hor]) => {
    if (hor) localStorage.setItem('tev_params_yoga_' + saisonActive(), JSON.stringify({ horaires: hor }));
    adminData.essaiYoga = essais.slice();
    currentTab = 'yoga';
    sousOngletYoga = 'essai';
    renderTab(); // rendu ASYNCHRONE (spinner puis doRender à +40ms)
  }, [ESSAIS, horaires || null]);
  await page.waitForFunction(() => {
    var tc = document.getElementById('tab-content');
    return tc && !tc.querySelector('.spinner') && tc.textContent.length > 50;
  });
}

test.describe('Groupe T — Yoga Essai : dates filtrées + horaires params', () => {

  test('T1 — seules les dates futures AVEC inscrits apparaissent ; passé et dates vides exclus', async ({ page }) => {
    await bootYogaEssai(page);
    const res = await page.evaluate(() => {
      const txt = document.getElementById('tab-content').textContent;
      return {
        futur: txt.indexOf('Fab') >= 0 && txt.indexOf('Gus') >= 0,
        passe: txt.indexOf('Pia') >= 0,
        vide: txt.indexOf('Aucune inscription pour cette date') >= 0,
        moisAout: txt.indexOf('Août 2026') >= 0,
        moisJuillet: txt.indexOf('Juillet 2026') >= 0,
      };
    });
    expect(res.futur).toBe(true);        // la date du 4 août (2 inscrits) est affichée
    expect(res.passe).toBe(false);       // le 1er juillet (passé) a disparu → Historique
    expect(res.vide).toBe(false);        // plus aucune ligne « Aucune inscription… »
    expect(res.moisAout).toBe(true);     // accordéon du mois avec inscrits présent
    expect(res.moisJuillet).toBe(false); // mois sans date affichable → pas d'accordéon
  });

  test('T2 — horaires yin/hatha lus depuis Paramètres (plus de 10h30/11h30 en dur)', async ({ page }) => {
    await bootYogaEssai(page, { yin: '9h15', yin_fin: '10h15', hatha: '10h30', hatha_fin: '11h30' });
    const res = await page.evaluate(() => {
      const txt = document.getElementById('tab-content').textContent;
      return {
        yinParam: txt.indexOf('Yin Yoga 9h15') >= 0,
        yinDur: txt.indexOf('Yin Yoga 10h30') >= 0,
        hathaParam: txt.indexOf('Hatha Yoga 10h30') >= 0,
      };
    });
    expect(res.yinParam).toBe(true);   // horaire admin appliqué
    expect(res.yinDur).toBe(false);    // l'ancien libellé en dur a disparu
    expect(res.hathaParam).toBe(true); // hatha suit aussi les Paramètres
  });

  test('T3 — sans params sauvegardés : repli sur les défauts (10h30 / 11h30)', async ({ page }) => {
    await bootYogaEssai(page);
    const res = await page.evaluate(() => {
      const txt = document.getElementById('tab-content').textContent;
      return {
        yin: txt.indexOf('Yin Yoga 10h30') >= 0,
        hatha: txt.indexOf('Hatha Yoga 11h30') >= 0,
      };
    });
    expect(res.yin).toBe(true);
    expect(res.hatha).toBe(true);
  });
});
