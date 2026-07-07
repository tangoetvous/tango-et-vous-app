// Groupe K — Smoke tests des formulaires publics (filet de sécurité).
// Vérifie que chaque formulaire public SE CHARGE et S'AFFICHE sans erreur JS.
// Hermétique : les requêtes externes (Turnstile, CDN, Supabase) sont bloquées
// (voir bootPublicForm) → on teste NOTRE code, pas les CDN tiers.
// ⚠️ Ne soumet JAMAIS : les formulaires publics écrivent dans la vraie base Supabase.
// Attrape les régressions les plus courantes : un formulaire qui ne s'affiche plus
// ou qui lève une erreur JS au chargement (ex : après une modif de tev-supabase.js).
const { test, expect } = require('@playwright/test');
const { bootPublicForm } = require('./helpers');

const FORMS = [
  { file: 'cours-essai.html',        titre: /essai/i },
  { file: 'inscription-cours.html',  titre: /inscription/i },
  { file: 'essai-yoga.html',         titre: /yoga/i },
  { file: 'stages-pwa.html',         titre: /stage/i },
  { file: 'cours-particuliers.html', titre: /particulier/i },
  { file: 'demande-devis.html',      titre: /devis/i },
];

test.describe('Groupe K — Formulaires publics (smoke)', () => {
  for (const f of FORMS) {
    test(`K — ${f.file} se charge sans erreur JS et affiche son contenu`, async ({ page }) => {
      const errors = await bootPublicForm(page, f.file);

      // 1. Aucune erreur JavaScript au chargement
      expect(errors, 'erreurs JS au chargement de ' + f.file).toEqual([]);

      // 2. Le titre de la page correspond au formulaire attendu
      expect(await page.title()).toMatch(f.titre);

      // 3. Du contenu et au moins un élément de formulaire sont rendus
      const info = await page.evaluate(() => ({
        bodyLen: (document.body && document.body.innerText || '').trim().length,
        controls: document.querySelectorAll('input,select,textarea,button').length,
      }));
      expect(info.bodyLen, 'contenu vide sur ' + f.file).toBeGreaterThan(80);
      expect(info.controls, 'aucun contrôle de formulaire sur ' + f.file).toBeGreaterThan(0);
    });
  }
});
