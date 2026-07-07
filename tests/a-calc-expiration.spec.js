// Groupe A — calcExpiration (algorithme A+B+C, le plus fragile de l'appli)
// Calendrier contrôlé (voir helpers.js) → résultats attendus calculés à la main :
//   Fenêtre A = durée en mois · B = semaines de vacances dans A · C = nouveaux gaps dans l'extension.
const { test, expect } = require('@playwright/test');
const { bootPage } = require('./helpers');

async function calc(page, date, ville, duree) {
  return page.evaluate(
    ([d, v, dm]) => calcExpiration(d, v, dm),
    [date, ville, duree === undefined ? null : duree]
  );
}

test.describe('Groupe A — calcExpiration', () => {
  test.beforeEach(async ({ page }) => { await bootPage(page); });

  test('A1 — Paris, 1er cours un jeudi : 3 mois + 2 semaines Toussaint', async ({ page }) => {
    // 2025-09-04 + 3 mois = 2025-12-04 · Toussaint (23+30 oct absents) = +14j → 2025-12-18
    expect(await calc(page, '2025-09-04', 'paris')).toBe('2025-12-18');
  });

  test('A2 — Paris, date saisie un MARDI : normalisée vers le jeudi le plus proche', async ({ page }) => {
    // 2025-09-02 (mardi) → snap 2025-09-04 (jeudi) → même résultat que A1
    expect(await calc(page, '2025-09-02', 'paris')).toBe('2025-12-18');
  });

  test('A3 — Vincennes (lundis) : expiration distincte de Paris, Noël en cascade (règle C)', async ({ page }) => {
    // 2025-09-08 + 3 mois = 2025-12-08 · Toussaint (20+27 oct) = +14j → 2025-12-22
    // extension : 22 et 29 déc absents (Noël) → +14j → 2026-01-05 (lundi de reprise)
    expect(await calc(page, '2025-09-08', 'vincennes')).toBe('2026-01-05');
  });

  test('A4 — durée paramétrable : 1 mois sans vacances, 6 mois avec Toussaint+Noël', async ({ page }) => {
    // dm=1 : 2025-09-04 + 1 mois = 2025-10-04, aucune vacance avant → inchangé
    expect(await calc(page, '2025-09-04', 'paris', 1)).toBe('2025-10-04');
    // dm=6 : 2025-09-04 + 6 mois = 2026-03-04 · 4 semaines de vacances dans A → 2026-04-01
    expect(await calc(page, '2025-09-04', 'paris', 6)).toBe('2026-04-01');
    // durée invalide → défaut 3 mois (comme A1)
    expect(await calc(page, '2025-09-04', 'paris', 99)).toBe('2025-12-18');
    expect(await calc(page, '2025-09-04', 'paris', 0)).toBe('2025-12-18');
  });

  test('A5 — date en plein été (aucun cours à ±3j) : recalage sur le prochain cours réel', async ({ page }) => {
    // 2026-07-07 → aucun jeudi à ±3j → snap avant sur 2026-09-03 (rentrée)
    // + 3 mois = 2026-12-03 · Toussaint 2026 (22+29 oct) = +14j → 2026-12-17
    expect(await calc(page, '2026-07-07', 'paris')).toBe('2026-12-17');
  });

  test('A6 — parité stricte calcExpiration (admin) ↔ _calcExpirationSb (tev-supabase)', async ({ page }) => {
    // Règle permanente CLAUDE.md : les deux implémentations doivent rester identiques.
    const cases = [
      ['2025-09-04', 'paris', null], ['2025-09-02', 'paris', null],
      ['2025-09-08', 'vincennes', null], ['2025-09-04', 'paris', 1],
      ['2025-09-04', 'paris', 6], ['2026-07-07', 'paris', null],
      ['2026-01-08', 'paris', 2], ['2025-11-06', 'paris', 3],
      ['2025-10-16', 'paris', 4], ['2026-02-23', 'vincennes', 5],
    ];
    for (const [d, v, dm] of cases) {
      const [a, b] = await page.evaluate(
        ([dd, vv, mm]) => [calcExpiration(dd, vv, mm), _calcExpirationSb(dd, vv, mm)],
        [d, v, dm]
      );
      expect(b, `divergence admin/supabase pour ${d} ${v} dm=${dm}`).toBe(a);
    }
  });

  test('A7 — recalcul après modification de la date (pas de mise en cache)', async ({ page }) => {
    const e1 = await calc(page, '2025-09-04', 'paris');
    const e2 = await calc(page, '2025-11-06', 'paris');
    expect(e1).not.toBe(e2); // deux dates de départ → deux expirations distinctes
  });
});
