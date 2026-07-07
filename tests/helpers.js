// Helpers partagés des tests Playwright — admin.html en MODE DÉMO.
// Règle absolue : jamais de connexion réelle, jamais d'écriture Supabase.

/**
 * Calendriers de cours contrôlés (2 saisons continues, comme en prod).
 * Paris = jeudis, Vincennes = lundis. Vacances retirées :
 *  - Paris    : Toussaint 2025-10-23 / 2025-10-30 · Noël 2025-12-25 / 2026-01-01
 *               Toussaint 2026-10-22 / 2026-10-29 · Noël 2026-12-24 / 2026-12-31
 *  - Vincennes: Toussaint 2025-10-20 / 2025-10-27 · Noël 2025-12-22 / 2025-12-29
 * Juillet/août : aucune date (coupure d'été).
 */
function weekly(startIso, endIso, excluded) {
  const out = [];
  const d = new Date(startIso + 'T12:00:00');
  const end = new Date(endIso + 'T12:00:00');
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (!excluded.includes(iso)) out.push(iso);
    d.setDate(d.getDate() + 7);
  }
  return out;
}

const COURS_DATES = {
  paris: [
    ...weekly('2025-09-04', '2026-06-25', ['2025-10-23', '2025-10-30', '2025-12-25', '2026-01-01']),
    ...weekly('2026-09-03', '2027-06-24', ['2026-10-22', '2026-10-29', '2026-12-24', '2026-12-31']),
  ],
  vincennes: [
    ...weekly('2025-09-08', '2026-06-22', ['2025-10-20', '2025-10-27', '2025-12-22', '2025-12-29']),
    ...weekly('2026-09-07', '2027-06-21', []),
  ],
};

/**
 * Charge admin.html, installe le calendrier contrôlé dans localStorage,
 * puis démarre le mode démo (DEMO_DATA en mémoire, zéro réseau Supabase).
 */
async function bootDemo(page) {
  await page.addInitScript((dates) => {
    localStorage.setItem('tev_cours_dates', JSON.stringify(dates));
  }, COURS_DATES);
  await page.goto('/admin.html');
  await page.waitForFunction(() => typeof demarrerDemoApp === 'function');
  await page.evaluate(() => demarrerDemoApp('demo@test.local'));
  await page.waitForSelector('#app', { state: 'visible' });
}

/** Charge admin.html SANS démarrer l'app (pour tester les fonctions pures). */
async function bootPage(page) {
  await page.addInitScript((dates) => {
    localStorage.setItem('tev_cours_dates', JSON.stringify(dates));
  }, COURS_DATES);
  await page.goto('/admin.html');
  await page.waitForFunction(() => typeof calcExpiration === 'function');
}

/** Charge index.html (espace élève) — pour tester le rendu côté élève (ex: panneau notifications). */
async function bootEleve(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderNotificationsPane === 'function' && !!document.getElementById('notifications-pane'));
}

/**
 * Charge un formulaire public (cours-essai, inscription-cours…) en mode SMOKE :
 * - bloque toute requête externe (Turnstile, CDN, Supabase) pour un test hermétique et rapide
 *   → on teste NOTRE HTML/JS, pas les CDN tiers (qui timeouteraient dans le sandbox)
 * - capture les erreurs JS de la page (pageerror)
 * Retourne le tableau des erreurs JS (doit être vide).
 * ⚠️ Ne soumet JAMAIS le formulaire — les formulaires publics écrivent dans la VRAIE base Supabase.
 */
async function bootPublicForm(page, file) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', route =>
    route.request().url().startsWith('http://127.0.0.1:8788/') ? route.continue() : route.abort());
  await page.goto('/' + file, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  return errors;
}

module.exports = { bootDemo, bootPage, bootEleve, bootPublicForm, COURS_DATES };
