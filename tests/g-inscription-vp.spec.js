// Groupe G — Inscription directe & Valider Paiement (formulaires réels, mode démo)
// Inclut les régressions des bugs corrigés le 2026-07-07 :
//   - carte rattachée au cours en formule carte (pas au 1er cours coché)
//   - _vpPrefillIds : la fiche d'une AUTRE personne ne doit jamais être modifiée
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

const PARIS_DEB = 'Paris — Jeudi — Débutant';
const PARIS_INT = 'Paris — Jeudi — Intermédiaire';

async function cocherCours(page, prefix, labels) {
  await page.evaluate(([pfx, lbls]) => {
    document.querySelectorAll('input[name="' + pfx + '-cours"]').forEach(function (cb) {
      var doit = lbls.indexOf(cb.value) >= 0;
      if (cb.checked !== doit) cb.click();
    });
  }, [prefix, labels]);
}

test.describe('Groupe G — Inscription directe / Valider Paiement', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('G1 — DI 2 cours mixte (forfait Débutant + carte Intermédiaire 8 cours/4 mois)', async ({ page }) => {
    await page.evaluate(() => { currentTab = 'eleves-tango'; sousOngletEleves = 'inscrire'; renderTab(); });
    await page.waitForSelector('#di-prenom');
    await page.evaluate(() => {
      gel('di-prenom').value = 'Gaston'; gel('di-nom').value = 'TESTG1';
      gel('di-email').value = 'g1@test.fr'; gel('di-tel').value = '0612345678';
    });
    await cocherCours(page, 'di', [PARIS_DEB, PARIS_INT]);
    await page.waitForSelector('input[name="di-formule-c-0"]');
    await page.evaluate(() => {
      document.querySelector('input[name="di-formule-c-0"][value="forfait"]').click();  // Débutant → forfait
      document.querySelector('input[name="di-formule-c-1"][value="carte10"]').click();  // Intermédiaire → carte
      gel('di-carte-nb').value = '8'; gel('di-carte-duree').value = '4';
    });
    await page.evaluate(() => soumettreInscriptionDirecte(true));
    const res = await page.evaluate(() => {
      var rows = (adminData.coursTango || []).filter(function (e) { return e.email === 'g1@test.fr'; });
      var carte = (adminData.cartes || []).find(function (c) { return c.email === 'g1@test.fr'; });
      return {
        types: rows.map(function (r) { return r.niveau + ':' + r.type; }).sort(),
        carte: carte ? { ville: carte.ville, niveau: carte.niveau, restants: carte.restants, dureeMois: carte.dureeMois } : null,
        maxJour: _maxParJour('g1@test.fr'),
      };
    });
    expect(res.types).toEqual(['debutant:forfait', 'intermediaire:carte10']);
    // Régression 2026-07-07 : la carte est rattachée au cours EN FORMULE CARTE (Intermédiaire)
    expect(res.carte).toEqual({ ville: 'paris', niveau: 'Intermédiaire', restants: 8, dureeMois: 4 });
    // Régression 2026-07-07 : 1 seul cours sur carte → 1 pointage/jour maximum
    expect(res.maxJour).toBe(1);
  });

  test('G2 — VP : _vpPrefillIds périmé ne modifie JAMAIS la fiche d\'une autre personne', async ({ page }) => {
    // La victime : une demande en attente d'une AUTRE personne
    await page.evaluate(() => {
      var sai = saisonActive();
      adminData.coursTango.push({ id: 777001, prenom: 'Victime', nom: 'TESTG2', email: 'victime@test.fr', tel: '0600000000', statut: 'demande', type: '', ville: 'paris', niveau: 'debutant', role: 'guidee', saison: sai });
      currentTab = 'cours-tango'; sousOngletCoursTango = 'valider_paiement'; renderTab();
    });
    await page.waitForSelector('#vp-prenom');
    await page.evaluate(() => {
      _vpPrefillIds = [777001]; // simulation d'une sélection précédente restée en mémoire (bug fiche fantôme)
      gel('vp-prenom').value = 'Bibi'; gel('vp-nom').value = 'TESTG2B';
      gel('vp-email').value = 'bibi@test.fr'; gel('vp-tel').value = '0698765432';
    });
    await cocherCours(page, 'vp', [PARIS_DEB, PARIS_INT]);
    await page.waitForSelector('input[name="vp-formule-c-0"]');
    await page.evaluate(() => {
      document.querySelector('input[name="vp-formule-c-0"][value="forfait"]').click();
      document.querySelector('input[name="vp-formule-c-1"][value="carte10"]').click();
      gel('vp-carte-nb').value = '6'; gel('vp-carte-duree').value = '2';
    });
    await page.evaluate(() => soumettreValiderPaiement(true));
    const res = await page.evaluate(() => {
      var victime = (adminData.coursTango || []).find(function (e) { return String(e.id) === '777001'; });
      var rows = (adminData.coursTango || []).filter(function (e) { return e.email === 'bibi@test.fr'; });
      var carte = (adminData.cartes || []).find(function (c) { return c.email === 'bibi@test.fr'; });
      return {
        victimeStatut: victime.statut, victimeTel: victime.tel,
        nbRows: rows.length,
        statuts: rows.map(function (r) { return r.statut; }),
        carte: carte ? { ville: carte.ville, niveau: carte.niveau, restants: carte.restants, dureeMois: carte.dureeMois } : null,
      };
    });
    expect(res.victimeStatut).toBe('demande');       // la victime n'a PAS été basculée
    expect(res.victimeTel).toBe('0600000000');       // ni modifiée
    expect(res.nbRows).toBe(2);                       // Bibi a bien ses 2 fiches
    expect(res.statuts).toEqual(['inscrit', 'inscrit']);
    expect(res.carte).toEqual({ ville: 'paris', niveau: 'Intermédiaire', restants: 6, dureeMois: 2 });
  });
});
