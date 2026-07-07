// Groupe F — Le polling 15s (_renderTabSiPasFormulaire) ne doit pas écraser les formulaires ouverts.
// On marque le DOM de #tab-content puis on appelle la garde : si le marqueur survit, pas de re-render.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

async function guardPreservesDom(page, setup) {
  return page.evaluate((setupFn) => {
    eval(setupFn);            // positionne currentTab / sous-onglets
    renderTab();
    var tc = gel('tab-content');
    tc.setAttribute('data-pw-marker', '1');
    if (document.activeElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    _renderTabSiPasFormulaire();
    var after = gel('tab-content');
    return after.getAttribute('data-pw-marker') === '1';
  }, setup);
}

test.describe('Groupe F — Garde anti-polling des formulaires', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('F1 — formulaire Valider Paiement ouvert : le polling ne re-rend PAS', async ({ page }) => {
    expect(await guardPreservesDom(page, "currentTab='cours-tango'; sousOngletCoursTango='valider_paiement';")).toBe(true);
  });

  test('F2 — formulaire Inscrire (Élèves Tango) ouvert : le polling ne re-rend PAS', async ({ page }) => {
    expect(await guardPreservesDom(page, "currentTab='eleves-tango'; sousOngletEleves='inscrire';")).toBe(true);
  });

  test('F3 — onglet Essai Tango : jamais interrompu par le polling', async ({ page }) => {
    expect(await guardPreservesDom(page, "currentTab='essai';")).toBe(true);
  });

  test('F4 — contrôle : sur un listing simple, le polling re-rend normalement', async ({ page }) => {
    expect(await guardPreservesDom(page, "currentTab='eleves-tango'; sousOngletEleves='paris-deb';")).toBe(false);
  });
});
