// Groupe V — Newsletter : repère « déjà copié dans ma liste de diffusion » (2026-07-24)
// 1. Confirmation explicite : copier NE marque PAS ; seul « Oui, marquer » pose le repère
// 2. Deux boutons : « Copier les N nouvelles » (principal) + « Copier toutes » (secondaire)
// 3. « Nouvelle » = première collecte postérieure au repère (une ré-inscription
//    d'une adresse déjà connue ne la fait pas ressortir comme nouvelle)
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

function isoIlYa(jours) {
  const d = new Date(); d.setDate(d.getDate() - jours);
  return d.toISOString();
}

// vieux@ : collecté il y a 30 j PUIS re-soumis il y a 2 j (liste triée created_at DESC)
// recent@ : collecté il y a 2 j → seule vraie nouveauté après un repère à J-10
const EMAILS = [
  { id: 1, email: 'recent@test.fr', source: 'newsletter',   created_at: isoIlYa(2) },
  { id: 2, email: 'vieux@test.fr',  source: 'stages',       created_at: isoIlYa(2) },
  { id: 3, email: 'vieux@test.fr',  source: 'cours-essai',  created_at: isoIlYa(30) },
  { id: 4, email: 'ancien@test.fr', source: 'newsletter',   created_at: isoIlYa(40) },
];

async function bootNewsletter(page, repere) {
  await bootDemo(page);
  await page.evaluate(([emails, rep]) => {
    if (rep) localStorage.setItem('tev_newsletter_export', JSON.stringify(rep));
    else localStorage.removeItem('tev_newsletter_export');
    _nlPendingCopie = null;
    adminData.newsletter = emails.slice();
    currentTab = 'emails-newsletter';
    renderTab(); // rendu ASYNCHRONE (spinner puis doRender à +40ms)
  }, [EMAILS, repere || null]);
  await page.waitForFunction(() => {
    const tc = document.getElementById('tab-content');
    return tc && !tc.querySelector('.spinner') && tc.textContent.indexOf('Emails newsletter') >= 0;
  });
}

test.describe('Groupe V — Newsletter : repère de copie', () => {

  test('V1 — sans repère : un seul bouton, aucune pastille NOUVEAU', async ({ page }) => {
    await bootNewsletter(page);
    const res = await page.evaluate(() => {
      const tc = document.getElementById('tab-content');
      return {
        txt: tc.textContent,
        nbBtnCopier: Array.from(tc.querySelectorAll('button')).filter(b => b.textContent.indexOf('Copier') >= 0).length,
        badges: tc.textContent.split('NOUVEAU').length - 1,
      };
    });
    expect(res.txt).toContain('Aucune copie enregistrée');
    expect(res.txt).toContain('Copier toutes les adresses (3)'); // 3 uniques (vieux@ dédoublonné)
    expect(res.nbBtnCopier).toBe(1);  // pas de doublon inutile la première fois
    expect(res.badges).toBe(0);       // pas de pastille quand tout est nouveau
  });

  test('V2 — copier NE marque PAS : bandeau de confirmation, repère absent tant qu\'on n\'a pas confirmé', async ({ page }) => {
    await bootNewsletter(page);
    await page.evaluate(() => newsletterCopierEmails('toutes'));
    await page.waitForFunction(() => document.getElementById('tab-content').textContent.indexOf('Sont-elles bien ajoutées') >= 0);
    const avant = await page.evaluate(() => ({
      repere: localStorage.getItem('tev_newsletter_export'),
      pending: !!_nlPendingCopie,
      nb: _nlPendingCopie && _nlPendingCopie.nb,
    }));
    expect(avant.repere).toBeNull(); // ← rien n'est marqué par la simple copie
    expect(avant.pending).toBe(true);
    expect(avant.nb).toBe(3);

    // « Plus tard » : on referme sans rien marquer
    await page.evaluate(() => newsletterPlusTard());
    const apresPlusTard = await page.evaluate(() => localStorage.getItem('tev_newsletter_export'));
    expect(apresPlusTard).toBeNull();

    // « Oui, marquer » : le repère est posé avec le nombre copié
    await page.evaluate(() => newsletterCopierEmails('toutes'));
    await page.evaluate(() => newsletterMarquerCopie());
    const apres = await page.evaluate(() => JSON.parse(localStorage.getItem('tev_newsletter_export') || 'null'));
    expect(apres).toBeTruthy();
    expect(apres.nb).toBe(3);
    expect(Date.parse(apres.date)).toBeGreaterThan(0);
  });

  test('V3 — avec repère : « nouvelles » = première collecte postérieure (ré-inscription exclue)', async ({ page }) => {
    await bootNewsletter(page, { date: isoIlYa(10), nb: 2 });
    const res = await page.evaluate(() => {
      const d = _nlUniques();
      return {
        nouvelles: d.nouvelles.map(u => u.email).sort(),
        txt: document.getElementById('tab-content').textContent,
        badges: document.getElementById('tab-content').textContent.split('NOUVEAU').length - 1,
      };
    });
    // vieux@ a été re-soumis il y a 2 j MAIS sa 1re collecte date de 30 j → pas nouvelle
    expect(res.nouvelles).toEqual(['recent@test.fr']);
    expect(res.txt).toContain('Copier les 1 nouvelle adresse');
    expect(res.txt).toContain('Copier toutes les adresses (3)');
    expect(res.badges).toBe(1); // une seule pastille NOUVEAU
  });

  test('V4 — « Copier les nouvelles » ne copie que celles-là ; le polling n\'efface pas le bandeau', async ({ page }) => {
    await bootNewsletter(page, { date: isoIlYa(10), nb: 2 });
    const nb = await page.evaluate(() => {
      newsletterCopierEmails('nouvelles');
      return _nlPendingCopie && _nlPendingCopie.nb;
    });
    expect(nb).toBe(1); // seule recent@ est copiée, pas les 3

    // Attendre que le bandeau soit rendu (renderTab est asynchrone : spinner puis rendu)
    await page.waitForFunction(() => document.getElementById('tab-content').textContent.indexOf('Sont-elles bien ajoutées') >= 0);
    // Garde anti-polling : un rafraîchissement de fond ne doit pas effacer le bandeau
    await page.evaluate(() => _renderTabSiPasFormulaire());
    await page.waitForTimeout(150); // laisser passer un éventuel re-rendu
    const survit = await page.evaluate(() =>
      !!_nlPendingCopie && document.getElementById('tab-content').textContent.indexOf('Sont-elles bien ajoutées') >= 0);
    expect(survit).toBe(true);
  });

  test('V5 — réinitialisation : tout redevient non copié', async ({ page }) => {
    await bootNewsletter(page, { date: isoIlYa(10), nb: 2 });
    await page.evaluate(() => {
      // ouvrirModalConfirm attend une confirmation : on exécute directement l'action
      _nlSetExport(null);
      _nlPendingCopie = null;
      renderTab();
    });
    await page.waitForFunction(() => document.getElementById('tab-content').textContent.indexOf('Aucune copie enregistrée') >= 0);
    const res = await page.evaluate(() => ({
      repere: localStorage.getItem('tev_newsletter_export'),
      nouvelles: _nlUniques().nouvelles.length,
    }));
    expect(res.repere).toBeNull();
    expect(res.nouvelles).toBe(3); // les 3 adresses uniques redeviennent à copier
  });
});
