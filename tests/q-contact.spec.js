// Groupe Q — Formulaire de contact (contact.html public + onglet admin).
// bootPublicForm bloque le réseau → on ne teste QUE les chemins sans écriture DB
// (validation, honeypot). Le chemin réel (INSERT Supabase) n'est jamais déclenché.
const { test, expect } = require('@playwright/test');
const { bootDemo, bootPublicForm } = require('./helpers');

test.describe('Groupe Q — Contact', () => {

  test('Q1 — contact.html : champs séparés prénom/nom + parse sans erreur JS', async ({ page }) => {
    const errors = await bootPublicForm(page, 'contact.html');
    const r = await page.evaluate(() => ({
      prenom: !!document.getElementById('c-prenom'),
      nom: !!document.getElementById('c-nom'),
      email: !!document.getElementById('c-email'),
      tel: !!document.getElementById('c-tel'),
      message: !!document.getElementById('c-message'),
      honeypot: !!document.getElementById('c-website'),
      soumettre: typeof window.soumettre === 'function',
    }));
    expect(errors.length).toBe(0);
    expect(r.prenom).toBe(true); expect(r.nom).toBe(true);
    expect(r.email).toBe(true); expect(r.tel).toBe(true);
    expect(r.message).toBe(true); expect(r.honeypot).toBe(true);
    expect(r.soumettre).toBe(true);
  });

  test('Q2 — validation : prénom vide → message d\'erreur, reste sur le formulaire', async ({ page }) => {
    await bootPublicForm(page, 'contact.html');
    const r = await page.evaluate(async () => {
      document.getElementById('c-nom').value = 'Test';
      document.getElementById('c-email').value = 'a@b.fr';
      document.getElementById('c-message').value = 'Bonjour';
      // prénom laissé vide → doit bloquer sans réseau
      await window.soumettre();
      return {
        err: document.getElementById('c-err').textContent || '',
        formVisible: document.getElementById('form-zone').style.display !== 'none',
        successHidden: document.getElementById('success').style.display !== 'block',
      };
    });
    expect(r.err).toMatch(/prénom/i);
    expect(r.formVisible).toBe(true);
    expect(r.successHidden).toBe(true);
  });

  test('Q3 — honeypot rempli (bot) → écran succès factice, aucun envoi', async ({ page }) => {
    await bootPublicForm(page, 'contact.html');
    const r = await page.evaluate(async () => {
      document.getElementById('c-prenom').value = 'Bot';
      document.getElementById('c-nom').value = 'Bot';
      document.getElementById('c-email').value = 'bot@spam.fr';
      document.getElementById('c-message').value = 'spam';
      document.getElementById('c-website').value = 'http://spam';  // honeypot
      await window.soumettre();
      return {
        success: document.getElementById('success').style.display === 'block',
        formHidden: document.getElementById('form-zone').style.display === 'none',
      };
    });
    expect(r.success).toBe(true);
    expect(r.formHidden).toBe(true);
  });

  test('Q3b — validation : téléphone vide → message d\'erreur (obligatoire)', async ({ page }) => {
    await bootPublicForm(page, 'contact.html');
    const r = await page.evaluate(async () => {
      document.getElementById('c-prenom').value = 'Marie';
      document.getElementById('c-nom').value = 'Test';
      document.getElementById('c-email').value = 'a@b.fr';
      document.getElementById('c-message').value = 'Bonjour';
      // téléphone laissé vide → doit bloquer
      await window.soumettre();
      return {
        err: document.getElementById('c-err').textContent || '',
        formVisible: document.getElementById('form-zone').style.display !== 'none',
      };
    });
    expect(r.err).toMatch(/téléphone/i);
    expect(r.formVisible).toBe(true);
  });

  test('Q4 — admin : onglet Contact rend + helpers définis + label + bouton menu', async ({ page }) => {
    await bootDemo(page);
    const r = await page.evaluate(async () => {
      const defs = {
        render: typeof renderContact === 'function',
        card: typeof _contactCard === 'function',
        toggle: typeof window._contactToggleStatut === 'function',
        del: typeof window._contactSupprimer === 'function',
        menuBtn: !!document.querySelector('.tab-btn[data-tab="contact"]'),
      };
      window.switchTab('contact');
      await new Promise(r => setTimeout(r, 80));
      const lbl = document.getElementById('admin-active-lbl');
      return Object.assign(defs, {
        lbl: lbl ? lbl.textContent : '',
        txt: (document.getElementById('tab-content').textContent || '').slice(0, 60),
      });
    });
    expect(r.render).toBe(true); expect(r.card).toBe(true);
    expect(r.toggle).toBe(true); expect(r.del).toBe(true);
    expect(r.menuBtn).toBe(true);
    expect(r.lbl).toContain('Contact');
    expect(r.txt).toMatch(/démo|Chargement|message/i);
  });
});
