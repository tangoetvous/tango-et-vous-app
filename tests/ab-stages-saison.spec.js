// Groupe AB — Saison des inscriptions aux stages (2026-08-18)
// Avant : la saison était figée à '2025-2026' dans les deux INSERT du formulaire
// public → dès le 01/09/2026, toutes les inscriptions stages auraient été
// étiquetées dans une saison archivée. La saison est désormais dérivée de la
// DATE du stage (sept→août) — indispensable en été, où une même soumission peut
// mélanger un stage d'août (saison N) et un stage de septembre (saison N+1).
const { test, expect } = require('@playwright/test');
const { bootPublicForm } = require('./helpers');

test.describe('Groupe AB — Stages : saison dérivée de la date du stage', () => {

  test('AB1 — saisonDeDate : bornes de saison correctes, plus aucune saison figée', async ({ page }) => {
    const errs = await bootPublicForm(page, 'stages-pwa.html');
    const r = await page.evaluate(() => ({
      aout:    saisonDeDate('2026-08-01'),
      sept:    saisonDeDate('2026-09-19'),
      dec:     saisonDeDate('2026-12-05'),
      mars:    saisonDeDate('2027-03-14'),
      sept27:  saisonDeDate('2027-09-04'),
      invalide: saisonDeDate('n/a') === saisonCourante(),   // repli sûr, jamais une valeur figée
    }));
    expect(r.aout).toBe('2025-2026');
    expect(r.sept).toBe('2026-2027');
    expect(r.dec).toBe('2026-2027');
    expect(r.mars).toBe('2026-2027');
    expect(r.sept27).toBe('2027-2028');
    expect(r.invalide).toBe(true);
    expect(errs).toEqual([]);
  });

  test("AB2 — le code d'insertion utilise saisonDeDate(di.date), plus de littéral", async ({ page }) => {
    await bootPublicForm(page, 'stages-pwa.html');
    // Vérification structurelle sur la source servie : les deux lignes d'INSERT
    // (inscripteur + partenaire) dérivent la saison de la date, et aucun
    // « saison: '20xx-20xx' » figé ne subsiste dans le fichier.
    const src = await page.evaluate(() => fetch('/stages-pwa.html').then(r => r.text()));
    const inserts = src.match(/saison: saisonDeDate\(di\.date\)/g) || [];
    expect(inserts.length).toBe(2);
    expect(src).not.toMatch(/saison:\s*'20\d\d-20\d\d'/);
  });
});
