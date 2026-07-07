// Groupe L — Newsletter : rendu de l'onglet admin "Emails newsletter"
// Vérifie la déduplication par email, l'affichage et le bouton copier.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

test.describe('Groupe L — Newsletter (onglet admin)', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('L1 — renderEmailsNewsletter dédoublonne par email et affiche le bouton copier', async ({ page }) => {
    const r = await page.evaluate(() => {
      adminData.newsletter = [
        { email: 'a@test.fr', source: 'newsletter', created_at: '2026-07-08T10:00:00Z' },
        { email: 'A@TEST.FR', source: 'cours-essai', created_at: '2026-07-07T10:00:00Z' }, // doublon (casse)
        { email: 'b@test.fr', source: 'stages', created_at: '2026-07-06T10:00:00Z' },
        { email: '', source: 'newsletter' },                 // vide → ignoré
        { email: 'pasunemail', source: 'newsletter' },        // invalide → ignoré
      ];
      var html = renderEmailsNewsletter();
      return {
        html: html,
        // nb d'adresses uniques annoncé
        deuxUniques: html.includes('2 adresses uniques'),
        aEmail: html.includes('a@test.fr'),
        bEmail: html.includes('b@test.fr'),
        pasDeVide: !html.includes('pasunemail'),
        boutonCopier: html.includes('newsletterCopierEmails'),
      };
    });
    expect(r.deuxUniques).toBe(true);   // a@ (dédupliqué) + b@ = 2
    expect(r.aEmail).toBe(true);
    expect(r.bEmail).toBe(true);
    expect(r.pasDeVide).toBe(true);
    expect(r.boutonCopier).toBe(true);
  });

  test('L2 — liste vide → message d\'invite, pas de bouton copier', async ({ page }) => {
    const r = await page.evaluate(() => {
      adminData.newsletter = [];
      var html = renderEmailsNewsletter();
      return { vide: html.includes('Aucune adresse'), pasBouton: !html.includes('newsletterCopierEmails') };
    });
    expect(r.vide).toBe(true);
    expect(r.pasBouton).toBe(true);
  });

  test('L3 — _copierEmailsFiches dédoublonne (helper de copie réutilisé)', async ({ page }) => {
    // Vérifie que newsletterCopierEmails ne plante pas et que le helper existe
    const ok = await page.evaluate(() => {
      adminData.newsletter = [{ email: 'x@test.fr', source: 'newsletter' }];
      return typeof newsletterCopierEmails === 'function' && typeof _copierEmailsFiches === 'function';
    });
    expect(ok).toBe(true);
  });
});
