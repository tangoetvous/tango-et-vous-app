// Groupe AJ — Champs manquants signalés en rouge (2026-09-05)
// Demande admin : à chaque étape, si un champ obligatoire manque, l'élève doit
// voir LEQUEL — le message générique « Merci de remplir tous les champs
// obligatoires » ne dit rien. Le repérage est purement visuel : AUCUNE règle de
// validation n'a été modifiée (une soumission valide ne peut donc pas être
// bloquée par ce changement).
// stages-pwa et demande-devis ne sont pas dans la liste : ils affichaient déjà
// un message sous chaque champ (et stages une bordure rouge via .invalid).
const { test, expect } = require('@playwright/test');
const { bootPublicForm } = require('./helpers');
const fs = require('fs');
const path = require('path');

const MODIFIES = ['inscription-cours.html', 'cours-essai.html', 'essai-yoga.html', 'cours-particuliers.html', 'contact.html'];
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test.describe('Groupe AJ — Champs manquants signalés', () => {

  test('AJ1 — les 5 formulaires marquent les champs et les nomment', async () => {
    for (const f of MODIFIES) {
      const src = lire(f);
      expect(src, f + ' : helper absent').toContain('function _tevKO(');
      expect(src, f + ' : helper jamais appelé').toMatch(/_tevKO\(\[|_tevKO\(_ko/);
      // le message fourre-tout a disparu au profit d'un message nommant les champs
      expect(src, f + ' : message générique encore présent').not.toMatch(/remplir tous les champs obligatoires/);
    }
    // Les 2 formulaires déjà conformes ne doivent pas avoir été touchés
    expect(lire('stages-pwa.html')).toContain('input.invalid { border-color');
    expect(lire('demande-devis.html')).toContain('field-error');
  });

  test('AJ2 — contact : soumission vide → le champ manquant est nommé et marqué', async ({ page }) => {
    await bootPublicForm(page, 'contact.html');
    await page.evaluate(async () => { await soumettre(); });   // le bouton « Envoyer » appelle soumettre()
    const r = await page.evaluate(() => ({
      msg: (document.getElementById('c-err') || {}).textContent || '',
      marques: Array.from(document.querySelectorAll('[data-tev-ko]')).map(e => e.id),
      bordure: (document.getElementById('c-prenom') || {}).style ? document.getElementById('c-prenom').style.borderColor : '',
    }));
    expect(r.msg.toLowerCase()).toContain('prénom');
    expect(r.marques).toContain('c-prenom');
    expect(r.bordure).toBeTruthy();
    // la marque disparaît dès que la personne corrige
    await page.evaluate(() => {
      const el = document.getElementById('c-prenom');
      el.value = 'Camille';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const apres = await page.evaluate(() => Array.from(document.querySelectorAll('[data-tev-ko]')).map(e => e.id));
    expect(apres).not.toContain('c-prenom');
  });

  test('AJ3 — essai yoga : les deux champs manquants sont nommés ensemble', async ({ page }) => {
    await bootPublicForm(page, 'essai-yoga.html');
    const r = await page.evaluate(async () => {
      ['inp-prenom', 'inp-nom', 'inp-email', 'inp-tel'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      await soumettre();
      return {
        msg: (document.getElementById('errmsg') || {}).textContent || '',
        marques: Array.from(document.querySelectorAll('[data-tev-ko]')).map(e => e.id),
      };
    });
    expect(r.msg).toContain('Prénom');
    expect(r.msg).toContain('Nom');
    expect(r.marques).toEqual(expect.arrayContaining(['inp-prenom', 'inp-nom']));
  });
});
