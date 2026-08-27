// Groupe T — Yoga → Essai Yoga : vue filtrée (2026-07-24)
// 1. Seules les dates avec AU MOINS UN inscrit apparaissent (plus de dates vides)
// 2. Fenêtre passée de 7 jours (pointage ✓/✗ possible les jours qui suivent),
//    au-delà → onglet 📋 Historique. Max 20 dates.
// 3. Horaires yin/hatha des sous-titres lus depuis tev_params_yoga_<sai>.horaires
//    (plus de « 10h30 » / « 11h30 » codés en dur)
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

// HORLOGE GELÉE (page.clock.setFixedTime, comme le groupe AC) : l'ancienne
// version utilisait la vraie date du jour et cassait autour du 1er septembre
// (J+5 basculait sur la saison suivante → filtré par dateAppartientSaison —
// panne réelle constatée le 2026-08-27). Avec l'horloge posée AVANT page.goto,
// les dates du navigateur ET des fixtures partagent le même « aujourd'hui »
// figé en pleine saison → déterministe toute l'année.
const ANCRE = new Date('2026-03-12T10:00:00');
function iso(offsetJours) {
  const d = new Date(ANCRE); d.setDate(d.getDate() + offsetJours);
  return d.toISOString().slice(0, 10);
}
const ESSAIS = [
  // Passé LOINTAIN (>7 jours) → ne doit plus apparaître (Historique)
  { id: 1, prenom: 'Pia', nom: 'PASSEE', email: 'pia@test.fr', date: iso(-20), cours: 'yin', statut: 'confirme' },
  // Passé RÉCENT (≤7 jours) → visible, pointable dans les jours qui suivent
  { id: 4, prenom: 'Rex', nom: 'RECENT', email: 'rex@test.fr', date: iso(-3), cours: 'yin', statut: 'confirme' },
  // FUTUR avec inscrits → affiché
  { id: 2, prenom: 'Fab', nom: 'FUTUR', email: 'fab@test.fr', date: iso(5), cours: 'yin', statut: 'confirme' },
  { id: 3, prenom: 'Gus', nom: 'FORFAIT', email: 'gus@test.fr', date: iso(5), cours: 'forfait', statut: 'confirme' },
];

async function bootYogaEssai(page, horaires) {
  await page.clock.setFixedTime(ANCRE);   // AVANT le goto de bootDemo
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

  test('T1 — dates avec inscrits seulement ; fenêtre passée 7j ; vieux passé exclu', async ({ page }) => {
    await bootYogaEssai(page);
    const res = await page.evaluate(() => {
      const txt = document.getElementById('tab-content').textContent;
      return {
        futur: txt.indexOf('Fab') >= 0 && txt.indexOf('Gus') >= 0,
        recent: txt.indexOf('Rex') >= 0,
        vieuxPasse: txt.indexOf('Pia') >= 0,
        vide: txt.indexOf('Aucune inscription pour cette date') >= 0,
      };
    });
    expect(res.futur).toBe(true);        // date future avec inscrits affichée
    expect(res.recent).toBe(true);       // date d'il y a 3 jours : encore pointable
    expect(res.vieuxPasse).toBe(false);  // date d'il y a 20 jours → Historique
    expect(res.vide).toBe(false);        // plus aucune ligne « Aucune inscription… »
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
