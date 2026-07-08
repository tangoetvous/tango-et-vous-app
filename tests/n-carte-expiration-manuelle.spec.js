// Groupe N — Date d'expiration forcée manuellement sur une carte (Cartes 10)
// L'admin peut saisir une date d'expiration dans la modale "Modifier les cours".
// Règle : la date forcée est COLLANTE (persiste à la ré-édition) mais est remise
// au calcul automatique lors d'un renouvellement.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

const CARTE_ID = 'CTr014'; // Felipe DIAZ — Paris, datePremierCours 2026-01-08

test.describe('Groupe N — Expiration manuelle des cartes', () => {
  test.beforeEach(async ({ page }) => {
    await bootDemo(page);
    await page.evaluate(() => { saisonVue = '2025-2026'; });
  });

  test('N1 — forcer une date d\'expiration : collante + prérempli à la ré-ouverture', async ({ page }) => {
    const r = await page.evaluate((id) => {
      var c = adminData.cartes.find(function (x) { return x.id === id; });
      ouvrirModalEditCarte(c);
      gel('modal-ec-expiration').value = '2026-09-30';
      sauvegarderEditCarte();
      var c2 = adminData.cartes.find(function (x) { return x.id === id; });
      // ré-ouverture : le champ doit être prérempli avec la date forcée
      ouvrirModalEditCarte(c2);
      var prefilled = gel('modal-ec-expiration').value;
      return { exp: c2.expiration, manu: c2.expManuelle, prefilled: prefilled };
    }, CARTE_ID);
    expect(r.exp).toBe('2026-09-30');
    expect(r.manu).toBe(true);
    expect(r.prefilled).toBe('2026-09-30');
  });

  test('N2 — champ vidé : retour au calcul automatique', async ({ page }) => {
    const r = await page.evaluate((id) => {
      var c = adminData.cartes.find(function (x) { return x.id === id; });
      // d'abord forcer
      ouvrirModalEditCarte(c);
      gel('modal-ec-expiration').value = '2026-09-30';
      sauvegarderEditCarte();
      // puis vider → auto
      var c2 = adminData.cartes.find(function (x) { return x.id === id; });
      ouvrirModalEditCarte(c2);
      gel('modal-ec-expiration').value = '';
      sauvegarderEditCarte();
      var c3 = adminData.cartes.find(function (x) { return x.id === id; });
      var auto = calcExpiration(c3.datePremierCours, c3.ville || 'paris', c3.dureeMois);
      return { manu: c3.expManuelle, exp: c3.expiration, auto: auto };
    }, CARTE_ID);
    expect(r.manu).toBe(false);
    expect(r.exp).toBe(r.auto);        // recalculée automatiquement
    expect(r.exp).not.toBe('2026-09-30');
  });

  test('N3 — le renouvellement efface la date forcée (retour auto)', async ({ page }) => {
    const r = await page.evaluate((id) => {
      var c = adminData.cartes.find(function (x) { return x.id === id; });
      ouvrirModalEditCarte(c);
      gel('modal-ec-expiration').value = '2026-09-30';
      sauvegarderEditCarte();
      // renouvellement (DEMO) → reset
      renouvelerCarteAction(id, null, true, 0, null, 10, 3);
      var c2 = adminData.cartes.find(function (x) { return x.id === id; });
      return { manu: c2.expManuelle, exp: c2.expiration };
    }, CARTE_ID);
    expect(r.manu).toBe(false);
    expect(r.exp).toBe('');
  });

  test('N4 — pointer le 1er cours ne réécrase PAS une date forcée', async ({ page }) => {
    const r = await page.evaluate((id) => {
      var c = adminData.cartes.find(function (x) { return x.id === id; });
      // Carte fraîche (pas de premier cours) avec une date d'expiration forcée dans le futur
      c.datePremierCours = ''; c.utilises = 0; c.restants = 10; c.datesCours = []; c.expiration = '';
      ouvrirModalEditCarte(c);
      gel('modal-ec-expiration').value = '2026-12-31';
      sauvegarderEditCarte();
      // Pointer le tout premier cours → NE doit PAS recalculer l'expiration
      adminData._dailyCounts = {};
      pointerCoursAction(id, '2026-05-14', 1);
      var c2 = adminData.cartes.find(function (x) { return x.id === id; });
      return { exp: c2.expiration, manu: c2.expManuelle, dpc: c2.datePremierCours, util: c2.utilises };
    }, CARTE_ID);
    expect(r.exp).toBe('2026-12-31');   // date forcée préservée
    expect(r.manu).toBe(true);
    expect(r.dpc).toBe('2026-05-14');   // le premier cours est bien enregistré
    expect(r.util).toBe(1);
  });
});
