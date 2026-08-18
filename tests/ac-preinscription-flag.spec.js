// Groupe AC — Interrupteur de pré-inscription auto-expirant (2026-08-18)
// Audit de bascule : le drapeau `tev_config_saison.preInscriptionOuverte`, persisté
// en localStorage + Supabase, n'était jamais refermé automatiquement. Resté collé
// après un été, il aurait envoyé les saisies admin de septembre dans une saison
// fantôme N+2 (saisonPourNouvelleEntree → saisonSuivante). Désormais il n'est
// honoré que si `saisonProchaine` (enregistrée à l'ouverture) est ENCORE la
// saison à venir — dès le 1er septembre il devient périmé et est ignoré.
//
// L'horloge du navigateur est simulée (page.clock) pour tester chaque période
// sans dépendre de la date réelle d'exécution.
const { test, expect } = require('@playwright/test');
const { COURS_DATES } = require('./helpers');

async function bootAvecDate(page, isoDate, configSaison) {
  await page.clock.setFixedTime(new Date(isoDate + 'T12:00:00'));
  await page.addInitScript(({ dates, cfg }) => {
    localStorage.setItem('tev_cours_dates', JSON.stringify(dates));
    if (cfg) localStorage.setItem('tev_config_saison', JSON.stringify(cfg));
  }, { dates: COURS_DATES, cfg: configSaison || null });
  await page.goto('/admin.html');
  await page.waitForFunction(() => typeof demarrerDemoApp === 'function');
  await page.evaluate(() => demarrerDemoApp('demo@test.local'));
  await page.waitForSelector('#app', { state: 'visible' });
  return page.evaluate(() => ({
    courante: saisonCourante(),
    suivante: saisonSuivante(),
    preinsc: isPreinscriptionPeriod(),
    nouvelle: saisonPourNouvelleEntree(),
  }));
}

test.describe('Groupe AC — Drapeau pré-inscription : expiration automatique au 1er septembre', () => {

  test('AC1 — 15 sept., drapeau resté collé depuis le printemps → ignoré, saisies en saison courante', async ({ page }) => {
    const r = await bootAvecDate(page, '2026-09-15',
      { preInscriptionOuverte: true, saisonProchaine: '2026-2027' });   // ouvert en mai, jamais refermé
    expect(r.courante).toBe('2026-2027');
    expect(r.preinsc).toBe(false);                                      // périmé → ignoré
    expect(r.nouvelle).toBe('2026-2027');                               // et non 2027-2028
  });

  test('AC2 — 15 sept., drapeau ancien sans saison notée → ignoré aussi (donnée legacy)', async ({ page }) => {
    const r = await bootAvecDate(page, '2026-09-15', { preInscriptionOuverte: true });
    expect(r.preinsc).toBe(false);
    expect(r.nouvelle).toBe('2026-2027');
  });

  test('AC3 — 10 avril, drapeau ouvert POUR la saison à venir → honoré (usage légitime hors fenêtre)', async ({ page }) => {
    const r = await bootAvecDate(page, '2027-04-10',
      { preInscriptionOuverte: true, saisonProchaine: '2027-2028' });
    expect(r.courante).toBe('2026-2027');
    expect(r.preinsc).toBe(true);                                       // encore d'actualité
    expect(r.nouvelle).toBe('2027-2028');
  });

  test('AC4 — 15 juillet sans drapeau → fenêtre mai-août intacte ; 15 janvier sans drapeau → mode normal', async ({ page }) => {
    const ete = await bootAvecDate(page, '2027-07-15', null);
    expect(ete.preinsc).toBe(true);
    expect(ete.nouvelle).toBe('2027-2028');
    await page.clock.setFixedTime(new Date('2027-01-15T12:00:00'));
    const hiver = await page.evaluate(() => {
      DEMO_DATE = new Date();                                           // le mode démo fige la date au chargement
      return { preinsc: isPreinscriptionPeriod(), nouvelle: saisonPourNouvelleEntree() };
    });
    expect(hiver.preinsc).toBe(false);
    expect(hiver.nouvelle).toBe('2026-2027');
  });
});
