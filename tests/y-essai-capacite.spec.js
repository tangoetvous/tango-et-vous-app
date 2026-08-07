// Groupe Y — Essai Tango « Par date » : les compteurs de capacité ne comptent
// que les personnes VALIDÉES (2026-08-04).
// Bug constaté : 👩 23/23 COMPLET affiché sur le 3 sept. 2026 alors que 18 des
// 23 guidées étaient en liste d'attente → seulement 5 confirmées, salle presque
// vide. Le compteur guidées incluait les 'attente', celui des guideurs non.
const { test, expect } = require('@playwright/test');
const { bootDemo, COURS_DATES } = require('./helpers');

// Une date de cours réelle du calendrier contrôlé, en SEPTEMBRE (les limites de
// capacité ne s'appliquent que de septembre à novembre — cf. noLimitsTango).
const DATE = COURS_DATES.paris.find(d => d.slice(5, 7) === '09' && d >= new Date().toISOString().slice(0, 10))
          || COURS_DATES.paris.find(d => d.slice(5, 7) === '09');

function fiche(id, prenom, role, statut) {
  return { id, prenom, nom: 'TESTY' + id, email: 'y' + id + '@test.fr', tel: '',
           role, ville: 'paris', niveau: 'debutant', date: DATE, statut,
           created_at: '2026-05-0' + (id % 9 + 1) + 'T10:00:00' };
}

// 5 guidées confirmées + 18 guidées en attente + 5 guideurs confirmés
const FICHES = [];
for (let i = 1; i <= 5; i++)  FICHES.push(fiche(i, 'GdeOK' + i, 'guidee', 'confirme'));
for (let i = 1; i <= 18; i++) FICHES.push(fiche(100 + i, 'GdeAtt' + i, 'guidee', 'attente'));
for (let i = 1; i <= 5; i++)  FICHES.push(fiche(200 + i, 'Gui' + i, 'guideur', 'confirme'));

async function rendreParDate(page) {
  await page.evaluate((f) => {
    saisonVue = '2026-2027';          // la date de test est en sept. 2026 → saison suivante
    adminData.essai = f.slice();
    adminData.coursTango = [];        // aucun élève régulier → compteurs = essais seuls
    currentTab = 'essai';
    filtreEssai = 'dates';
    renderTab();                       // rendu ASYNCHRONE (spinner puis rendu à +40 ms)
  }, FICHES);
  await page.waitForFunction(() => {
    const tc = document.getElementById('tab-content');
    return tc && !tc.querySelector('.spinner') && tc.textContent.indexOf('/22') >= 0;
  });
}

test.describe('Groupe Y — Essai : compteurs de capacité (validés seulement)', () => {

  test('Y1 — 5 confirmées + 18 en attente → 👩 5/23, pas de COMPLET', async ({ page }) => {
    await bootDemo(page);
    await rendreParDate(page);
    const txt = await page.evaluate(() => document.getElementById('tab-content').textContent);
    expect(txt).toContain('5/22');   // guideurs confirmés
    expect(txt).toContain('5/23');   // guidées CONFIRMÉES (et non 23/23)
    expect(txt).not.toContain('23/23');
    expect(txt).toContain('18 att.'); // les personnes en attente restent signalées
    expect(txt).not.toContain('COMPLET');
  });

  test('Y2 — le COMPLET reste possible quand les VALIDÉES atteignent le quota', async ({ page }) => {
    await bootDemo(page);
    await page.evaluate((d) => {
      saisonVue = '2026-2027';
      const f = [];
      for (let i = 1; i <= 23; i++) f.push({ id: i, prenom: 'G' + i, nom: 'PLEINE', email: 'p' + i + '@test.fr',
        role: 'guidee', ville: 'paris', niveau: 'debutant', date: d, statut: 'confirme', created_at: '2026-05-01T10:00:00' });
      adminData.essai = f; adminData.coursTango = [];
      currentTab = 'essai'; filtreEssai = 'dates'; renderTab();
    }, DATE);
    await page.waitForFunction(() => {
      const tc = document.getElementById('tab-content');
      return tc && !tc.querySelector('.spinner') && tc.textContent.indexOf('/23') >= 0;
    });
    const txt = await page.evaluate(() => document.getElementById('tab-content').textContent);
    expect(txt).toContain('23/23');
    expect(txt).toContain('COMPLET');  // le garde-fou fonctionne toujours
  });
});
