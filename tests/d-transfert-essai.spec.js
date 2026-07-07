// Groupe D — Transfert essai → inscription tango (soumettreEssaiStatut)
// Flow réel : fiche essai → bouton "Validé·e" / "Demande en att." → choix du cours → soumission.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

async function injectEssai(page, entry) {
  await page.evaluate((e) => {
    if (!adminData.essai) adminData.essai = [];
    adminData.essai.push(e);
  }, entry);
}

async function transfert(page, email, statut) {
  await page.evaluate(([em, st]) => ouvrirFormulaireEssaiStatut(em, st), [email, statut]);
  await page.waitForSelector('input[name="es-cours"]:checked'); // cours par défaut pré-coché
  await page.evaluate(([em, st]) => soumettreEssaiStatut(em, st), [email, statut]);
}

test.describe('Groupe D — Transfert essai → inscription', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('D1 — "Validé·e" sur un guideur → fiche en attente_paiement dans Inscriptions Tango', async ({ page }) => {
    await injectEssai(page, { id: 'ES-D1', prenom: 'Didier', nom: 'TESTD1', email: 'd1@test', tel: '0600000001', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme' });
    await transfert(page, 'd1@test', 'attente_paiement');
    const row = await page.evaluate(() => (adminData.coursTango || []).find(function (e) { return e.email === 'd1@test'; }));
    expect(row).toBeTruthy();
    expect(row.statut).toBe('attente_paiement');
    expect(row.ville).toBe('paris');
    expect(row.niveau).toBe('debutant');
    expect(row.role).toBe('guideur');
  });

  test('D2 — "Demande en att." sur une guidée → fiche en demande (att. validation)', async ({ page }) => {
    await injectEssai(page, { id: 'ES-D2', prenom: 'Gaelle', nom: 'TESTD2', email: 'd2@test', tel: '0600000002', role: 'guidee', ville: 'vincennes', niveau: 'intermediaire', date: '2026-06-08', statut: 'confirme' });
    await transfert(page, 'd2@test', 'demande');
    const row = await page.evaluate(() => (adminData.coursTango || []).find(function (e) { return e.email === 'd2@test'; }));
    expect(row).toBeTruthy();
    expect(row.statut).toBe('demande');
    expect(row.ville).toBe('vincennes');
    expect(row.niveau).toBe('intermediaire');
  });

  test('D3 — essai avec partenaire SANS email : DEUX fiches créées (partenaire email vide, rôle inverse)', async ({ page }) => {
    await injectEssai(page, { id: 'ES-D3', prenom: 'Marc', nom: 'TESTD3', email: 'd3@test', tel: '0600000003', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', partenaire: 'Paula PARTD3', emailPartenaire: '' });
    await transfert(page, 'd3@test', 'attente_paiement');
    const rows = await page.evaluate(() => ({
      principal: (adminData.coursTango || []).find(function (e) { return e.email === 'd3@test'; }),
      partenaire: (adminData.coursTango || []).find(function (e) { return e.prenom === 'Paula' && e.nom === 'PARTD3'; }),
    }));
    expect(rows.principal).toBeTruthy();
    expect(rows.principal.statut).toBe('attente_paiement');
    expect(rows.partenaire).toBeTruthy();          // créée même sans email (règle if(ess.partenaire))
    expect(rows.partenaire.email).toBe('');
    expect(rows.partenaire.role).toBe('guidee');   // rôle inverse automatique
    expect(rows.partenaire.statut).toBe('attente_paiement');
  });
});
