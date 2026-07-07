// Groupe J — Tarif réduit (étape 1 : toggle + stockage donnees.tarifReduit)
// Vérifie que la case cochée stocke le flag dans donnees, et que SANS la case
// le comportement est identique à avant (non-régression).
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

const PARIS_DEB = 'Paris — Jeudi — Débutant';

async function cocherCours(page, prefix, labels) {
  await page.evaluate(([pfx, lbls]) => {
    document.querySelectorAll('input[name="' + pfx + '-cours"]').forEach(function (cb) {
      var doit = lbls.indexOf(cb.value) >= 0;
      if (cb.checked !== doit) cb.click();
    });
  }, [prefix, labels]);
}

test.describe('Groupe J — Tarif réduit (toggle + stockage)', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('J1 — DI avec tarif réduit coché → donnees.tarifReduit=true', async ({ page }) => {
    await page.evaluate(() => { currentTab = 'eleves-tango'; sousOngletEleves = 'inscrire'; renderTab(); });
    await page.waitForSelector('#di-tarif-reduit');
    await page.evaluate(() => {
      gel('di-prenom').value = 'Remy'; gel('di-nom').value = 'REDUIT';
      gel('di-email').value = 'remy@test.fr'; gel('di-tel').value = '0612345678';
      gel('di-tarif-reduit').checked = true;
    });
    await cocherCours(page, 'di', [PARIS_DEB]);
    await page.waitForSelector('input[name="di-formule-c-0"]');
    await page.evaluate(() => soumettreInscriptionDirecte(true));
    const r = await page.evaluate(() => {
      var row = (adminData.coursTango || []).find(function (e) { return e.email === 'remy@test.fr'; });
      return { exists: !!row, tarifReduit: row && row.donnees ? row.donnees.tarifReduit : undefined };
    });
    expect(r.exists).toBe(true);
    expect(r.tarifReduit).toBe(true);
  });

  test('J2 — DI SANS cocher → pas de tarifReduit (non-régression)', async ({ page }) => {
    await page.evaluate(() => { currentTab = 'eleves-tango'; sousOngletEleves = 'inscrire'; renderTab(); });
    await page.waitForSelector('#di-tarif-reduit');
    await page.evaluate(() => {
      gel('di-prenom').value = 'Plein'; gel('di-nom').value = 'TARIF';
      gel('di-email').value = 'plein@test.fr'; gel('di-tel').value = '0612345678';
    });
    await cocherCours(page, 'di', [PARIS_DEB]);
    await page.waitForSelector('input[name="di-formule-c-0"]');
    await page.evaluate(() => soumettreInscriptionDirecte(true));
    const r = await page.evaluate(() => {
      var row = (adminData.coursTango || []).find(function (e) { return e.email === 'plein@test.fr'; });
      return { exists: !!row, tarifReduit: row && row.donnees ? row.donnees.tarifReduit : undefined };
    });
    expect(r.exists).toBe(true);
    expect(r.tarifReduit).toBeUndefined();
  });

  test('J3 — VP avec tarif réduit coché → donnees.tarifReduit=true', async ({ page }) => {
    await page.evaluate(() => { currentTab = 'cours-tango'; sousOngletCoursTango = 'valider_paiement'; renderTab(); });
    await page.waitForSelector('#vp-tarif-reduit');
    await page.evaluate(() => {
      gel('vp-prenom').value = 'Vera'; gel('vp-nom').value = 'REDUIT';
      gel('vp-email').value = 'vera@test.fr'; gel('vp-tel').value = '0612345678';
      gel('vp-tarif-reduit').checked = true;
    });
    await cocherCours(page, 'vp', [PARIS_DEB]);
    await page.waitForSelector('input[name="vp-formule-c-0"]');
    await page.evaluate(() => soumettreValiderPaiement(true));
    const r = await page.evaluate(() => {
      var row = (adminData.coursTango || []).find(function (e) { return e.email === 'vera@test.fr'; });
      return { exists: !!row, tarifReduit: row && row.donnees ? row.donnees.tarifReduit : undefined };
    });
    expect(r.exists).toBe(true);
    expect(r.tarifReduit).toBe(true);
  });
});
