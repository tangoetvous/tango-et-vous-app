// Groupe J — Tarif réduit (étape 1 : toggle + stockage donnees.tarifReduit)
// Vérifie que la case cochée stocke le flag dans donnees, et que SANS la case
// le comportement est identique à avant (non-régression).
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

const PARIS_DEB = 'Paris — Jeudi — Débutant';

async function cocherCours(page, prefix, labels) {
  await page.evaluate(([pfx, lbls]) => {
    document.querySelectorAll('input[name="' + pfx + '-cours"]').forEach(function (cb) {
      var doit = lbls.indexOf(cb.value) >= 0;
      if (cb.checked !== doit) cb.click();
    });
  }, [prefix, labels]);
}

test.describe('Groupe J — Tarif réduit (toggle + stockage)', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('J1 — DI avec tarif réduit coché → donnees.tarifReduit=true', async ({ page }) => {
    await page.evaluate(() => { currentTab = 'eleves-tango'; sousOngletEleves = 'inscrire'; renderTab(); });
    await page.waitForSelector('#di-tarif-reduit');
    await page.evaluate(() => {
      gel('di-prenom').value = 'Remy'; gel('di-nom').value = 'REDUIT';
      gel('di-email').value = 'remy@test.fr'; gel('di-tel').value = '0612345678';
      gel('di-tarif-reduit').checked = true;
    });
    await cocherCours(page, 'di', [PARIS_DEB]);
    await page.waitForSelector('input[name="di-formule-c-0"]');
    await page.evaluate(() => soumettreInscriptionDirecte(true));
    const r = await page.evaluate(() => {
      var row = (adminData.coursTango || []).find(function (e) { return e.email === 'remy@test.fr'; });
      return { exists: !!row, tarifReduit: row && row.donnees ? row.donnees.tarifReduit : undefined };
    });
    expect(r.exists).toBe(true);
    expect(r.tarifReduit).toBe(true);
  });

  test('J2 — DI SANS cocher → pas de tarifReduit (non-régression)', async ({ page }) => {
    await page.evaluate(() => { currentTab = 'eleves-tango'; sousOngletEleves = 'inscrire'; renderTab(); });
    await page.waitForSelector('#di-tarif-reduit');
    await page.evaluate(() => {
      gel('di-prenom').value = 'Plein'; gel('di-nom').value = 'TARIF';
      gel('di-email').value = 'plein@test.fr'; gel('di-tel').value = '0612345678';
    });
    await cocherCours(page, 'di', [PARIS_DEB]);
    await page.waitForSelector('input[name="di-formule-c-0"]');
    await page.evaluate(() => soumettreInscriptionDirecte(true));
    const r = await page.evaluate(() => {
      var row = (adminData.coursTango || []).find(function (e) { return e.email === 'plein@test.fr'; });
      return { exists: !!row, tarifReduit: row && row.donnees ? row.donnees.tarifReduit : undefined };
    });
    expect(r.exists).toBe(true);
    expect(r.tarifReduit).toBeUndefined();
  });

  test('J4 — pastille R visible si tarifReduit && !justifRecu, masquée sinon', async ({ page }) => {
    const r = await page.evaluate(() => {
      var base = { id: 'INS999', prenom: 'R', nom: 'TEST', email: 'r@t.fr', role: 'guideur', type: 'carte10' };
      return {
        aReduireNonRecu: ficheEleveInscrit(Object.assign({}, base, { donnees: { tarifReduit: true } }), '', false, false),
        aReduireRecu:    ficheEleveInscrit(Object.assign({}, base, { donnees: { tarifReduit: true, justifRecu: true } }), '', false, false),
        sansReduire:     ficheEleveInscrit(Object.assign({}, base, { donnees: {} }), '', false, false),
      };
    });
    expect(r.aReduireNonRecu).toContain('marquerJustifRecu');   // pastille présente
    expect(r.aReduireRecu).not.toContain('marquerJustifRecu');  // justif reçu → masquée
    expect(r.sansReduire).not.toContain('marquerJustifRecu');   // pas de tarif réduit → rien
  });

  test('J5 — marquerJustifRecu + confirmation → donnees.justifRecu=true', async ({ page }) => {
    const flag = await page.evaluate(() => {
      adminData.coursTango.push({ id: 'INS998', prenom: 'A', nom: 'B', email: 'ab@t.fr', statut: 'inscrit', donnees: { tarifReduit: true } });
      marquerJustifRecu('INS998');       // ouvre la modale de confirmation
      confirmerModalConfirm();           // valide
      var e = adminData.coursTango.find(function (x) { return x.id === 'INS998'; });
      return e.donnees.justifRecu;
    });
    expect(flag).toBe(true);
  });

  test('J6 — trace permanente dans Compta (justif en attente puis reçu)', async ({ page }) => {
    const r = await page.evaluate(() => {
      var mk = function (donnees) { return { id: 'C1', prenom: 'Co', nom: 'MPTA', email: 'c@t.fr', ville: 'paris', niveau: 'debutant', type: 'carte10', montant: 130, paiement: 'cb1x', statut: 'inscrit', donnees: donnees }; };
      return {
        enAttente: _comptaBlock([mk({ tarifReduit: true })], null, 'tango'),
        recu:      _comptaBlock([mk({ tarifReduit: true, justifRecu: true })], null, 'tango'),
        sans:      _comptaBlock([mk({})], null, 'tango'),
      };
    });
    expect(r.enAttente).toContain('tarif réduit');
    expect(r.enAttente).toContain('justif en attente');
    expect(r.recu).toContain('tarif réduit');
    expect(r.recu).toContain('justif ✓');
    expect(r.recu).not.toContain('justif en attente');
    expect(r.sans).not.toContain('tarif réduit');
  });

  test('J7 — bouton "Relancer justif" dans l\'accordéon si tarifReduit && !justifRecu && email', async ({ page }) => {
    const r = await page.evaluate(() => {
      var base = { id: 'ACC1', prenom: 'R', nom: 'T', email: 'r@t.fr', role: 'guideur', type: 'carte10' };
      _openElevesAcc.add('ACC1'); // accordéon ouvert → boutons visibles
      var enAttente = ficheEleveInscrit(Object.assign({}, base, { donnees: { tarifReduit: true } }), '', false, false);
      var recu      = ficheEleveInscrit(Object.assign({}, base, { donnees: { tarifReduit: true, justifRecu: true } }), '', false, false);
      var sansEmail = ficheEleveInscrit(Object.assign({}, base, { email: '', donnees: { tarifReduit: true } }), '', false, false);
      return { enAttente: enAttente.includes('relancerJustif'), recu: recu.includes('relancerJustif'), sansEmail: sansEmail.includes('relancerJustif') };
    });
    expect(r.enAttente).toBe(true);    // justif en attente + email → bouton présent
    expect(r.recu).toBe(false);        // justif reçu → pas de relance
    expect(r.sansEmail).toBe(false);   // pas d'email → pas de relance
  });

  test('J3 — VP avec tarif réduit coché → donnees.tarifReduit=true', async ({ page }) => {
    await page.evaluate(() => { currentTab = 'cours-tango'; sousOngletCoursTango = 'valider_paiement'; renderTab(); });
    await page.waitForSelector('#vp-tarif-reduit');
    await page.evaluate(() => {
      gel('vp-prenom').value = 'Vera'; gel('vp-nom').value = 'REDUIT';
      gel('vp-email').value = 'vera@test.fr'; gel('vp-tel').value = '0612345678';
      gel('vp-tarif-reduit').checked = true;
    });
    await cocherCours(page, 'vp', [PARIS_DEB]);
    await page.waitForSelector('input[name="vp-formule-c-0"]');
    await page.evaluate(() => soumettreValiderPaiement(true));
    const r = await page.evaluate(() => {
      var row = (adminData.coursTango || []).find(function (e) { return e.email === 'vera@test.fr'; });
      return { exists: !!row, tarifReduit: row && row.donnees ? row.donnees.tarifReduit : undefined };
    });
    expect(r.exists).toBe(true);
    expect(r.tarifReduit).toBe(true);
  });
});
