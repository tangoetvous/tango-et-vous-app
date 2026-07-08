// Groupe M — Inscription directe cross-saison : ne pas écraser la carte d'une saison précédente
// Régression du bug Vlad (2026-07-08) : inscrire une personne pour la saison N+1 avec une carte
// écrasait sa carte de la saison N (qui apparaissait "renouvelée" 0/10). La carte de l'ancienne
// saison doit rester intacte ; une nouvelle carte est créée pour la nouvelle saison.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

const PARIS_INT = 'Paris — Jeudi — Intermédiaire';

test.describe('Groupe M — DI cross-saison (carte préservée)', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('M1 — inscrire pour la saison N+1 ne touche pas la carte de la saison N', async ({ page }) => {
    const res = await page.evaluate(() => {
      // Carte existante saison 2025-2026 : 10 pris, expirée (état "avant" de Vlad)
      adminData.cartes.push({
        id: 'C-VLAD', nom: 'Vlad TEST', prenom: 'Vlad', email: 'vlad@test.fr', niveau: 'Intermédiaire',
        ville: 'paris', statutEleve: 'Actif', utilises: 10, restants: 0,
        datePremierCours: '2025-11-20', expiration: '2026-02-20', statut: 'Active',
        source: 'inscription', datesCours: [], saison: '2025-2026', paye: true,
      });
      // Se placer sur la saison 2026-2027 pour l'inscription directe
      saisonVue = '2026-2027';
      currentTab = 'eleves-tango'; sousOngletEleves = 'inscrire'; renderTab();
      return { sai: saisonActive() };
    });
    expect(res.sai).toBe('2026-2027');

    await page.waitForSelector('#di-prenom');
    await page.evaluate(() => {
      gel('di-prenom').value = 'Vlad'; gel('di-nom').value = 'TEST';
      gel('di-email').value = 'vlad@test.fr'; gel('di-tel').value = '0612345678';
    });
    await page.evaluate((lbl) => {
      document.querySelectorAll('input[name="di-cours"]').forEach(function (cb) { if (cb.value === lbl && !cb.checked) cb.click(); });
    }, PARIS_INT);
    await page.waitForSelector('input[name="di-formule-c-1"]');
    await page.evaluate(() => {
      var r = document.querySelector('input[name="di-formule-c-1"][value="carte10"]'); if (r) r.click();
      gel('di-carte-nb').value = '10'; gel('di-carte-duree').value = '3';
    });
    await page.evaluate(() => soumettreInscriptionDirecte(true));

    const out = await page.evaluate(() => {
      var cartes = (adminData.cartes || []).filter(function (c) { return c.email === 'vlad@test.fr'; });
      var anc = cartes.find(function (c) { return (c.saison || '') === '2025-2026'; });
      var nouv = cartes.find(function (c) { return (c.saison || '') === '2026-2027'; });
      return {
        ancienneUtilises: anc ? anc.utilises : null,
        ancienneRestants: anc ? anc.restants : null,
        ancienneExp: anc ? anc.expiration : null,
        nouvelleExiste: !!nouv,
        nouvelleRestants: nouv ? nouv.restants : null,
        nouvelleUtilises: nouv ? nouv.utilises : null,
      };
    });
    // La carte 2025-2026 est INTACTE (10 pris, expirée)
    expect(out.ancienneUtilises).toBe(10);
    expect(out.ancienneRestants).toBe(0);
    expect(out.ancienneExp).toBe('2026-02-20');
    // Une carte 2026-2027 fraîche a été créée (0 pris)
    expect(out.nouvelleExiste).toBe(true);
    expect(out.nouvelleUtilises).toBe(0);
    expect(out.nouvelleRestants).toBe(10);
  });

  test('M2 — supprimer le cours de la saison N+1 ne supprime PAS la carte de la saison N', async ({ page }) => {
    const out = await page.evaluate(() => {
      // Carte 2025-2026 (saison N) — active, à préserver
      adminData.cartes.push({ id: 'C-BRAD-2526', nom: 'Brad PITT', prenom: 'Brad', email: 'brad@test.fr', niveau: 'Intermédiaire', ville: 'paris', statutEleve: 'Actif', utilises: 4, restants: 6, datePremierCours: '2025-11-20', expiration: '2026-02-20', statut: 'Active', source: 'inscription', datesCours: [], saison: '2025-2026', paye: true, _fromCoursTango: false });
      // Cours + carte 2026-2027 (saison N+1) — reconstruite depuis inscriptions_cours
      adminData.coursTango.push({ id: 'BRAD-2627', prenom: 'Brad', nom: 'PITT', email: 'brad@test.fr', tel: '', role: 'guideur', niveau: 'intermediaire', ville: 'paris', cours: 'Paris — Jeudi — Intermédiaire', statut: 'inscrit', type: 'carte10', saison: '2026-2027' });
      adminData.cartes.push({ id: 'C-BRAD-2627', nom: 'Brad PITT', prenom: 'Brad', email: 'brad@test.fr', niveau: 'Intermédiaire', ville: 'paris', statutEleve: 'Actif', utilises: 0, restants: 10, datePremierCours: '', expiration: '', statut: 'Nouvelle carte', source: 'inscription', datesCours: [], saison: '2026-2027', paye: true, _fromCoursTango: true });
      saisonVue = '2026-2027';
      // Supprimer le cours 2026-2027
      confirmerSupprimerEleve('BRAD-2627');
      var c2526 = (adminData.cartes || []).find(function (c) { return c.id === 'C-BRAD-2526'; });
      var c2627 = (adminData.cartes || []).find(function (c) { return c.id === 'C-BRAD-2627'; });
      var cours2627 = (adminData.coursTango || []).find(function (e) { return e.id === 'BRAD-2627'; });
      return { carte2526Statut: c2526 ? c2526.statut : null, carte2627Statut: c2627 ? c2627.statut : null, cours2627Statut: cours2627 ? cours2627.statut : null };
    });
    expect(out.carte2526Statut).toBe('Active');    // saison N INTACTE
    expect(out.carte2627Statut).toBe('supprimé');  // saison N+1 archivée
    expect(out.cours2627Statut).toBe('supprimé');
  });
});
