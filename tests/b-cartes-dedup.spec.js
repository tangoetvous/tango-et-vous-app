// Groupe B — Cartes 10 : couples email partagé, déduplication, limite de pointage
// Groupe E — Quotas guideurs/guidées (nbInscritsCours)
// Tests sur les fonctions réelles de admin.html, en mode démo (aucune écriture DB).
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

test.describe('Groupe B — Cartes 10 (dédup, couples, pointage)', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('B1 — élève inscrit à 2 cours : une SEULE carte dans Cartes 10', async ({ page }) => {
    const count = await page.evaluate(() => {
      var sai = saisonActive();
      adminData.coursTango.push(
        { id: 'T-B1a', prenom: 'Bea', nom: 'TESTB1', email: 'b1@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'debutant', role: 'guidee', saison: sai },
        { id: 'T-B1b', prenom: 'Bea', nom: 'TESTB1', email: 'b1@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'intermediaire', role: 'guidee', saison: sai }
      );
      adminData.cartes.push({ id: 'C-B1', nom: 'Bea TESTB1', email: 'b1@test', niveau: 'Intermédiaire', ville: 'paris', statutEleve: 'Actif', utilises: 2, restants: 8, datePremierCours: '', expiration: '', statut: 'Active', source: 'inscription', datesCours: [], saison: sai, paye: true });
      return _buildCartesData().cartes.filter(function (c) { return c.email === 'b1@test'; }).length;
    });
    expect(count).toBe(1);
  });

  test('B2 — couple email partagé : les DEUX noms apparaissent, pas dédupliqués', async ({ page }) => {
    const noms = await page.evaluate(() => {
      var sai = saisonActive();
      adminData.cartes.push(
        { id: 'C-B2a', nom: 'Henry TESTB2', email: 'b2@test', niveau: 'Débutant', ville: 'paris', statutEleve: 'Actif', utilises: 3, restants: 7, datePremierCours: '', expiration: '', statut: 'Active', source: 'inscription', datesCours: [], saison: sai, paye: true },
        { id: 'C-B2b', nom: 'Irmak TESTB2', email: 'b2@test', niveau: 'Débutant', ville: 'paris', statutEleve: 'Actif', utilises: 5, restants: 5, datePremierCours: '', expiration: '', statut: 'Active', source: 'inscription', datesCours: [], saison: sai, paye: true }
      );
      return _buildCartesData().cartes.filter(function (c) { return c.email === 'b2@test'; }).map(function (c) { return c.nom; }).sort();
    });
    expect(noms).toEqual(['Henry TESTB2', 'Irmak TESTB2']);
  });

  test('B3 — lignes de renouvellement (isRenewal) : jamais de carte en double', async ({ page }) => {
    const res = await page.evaluate(() => {
      var sai = saisonActive();
      // Personne avec carte + une ligne renouvellement → 1 seule carte
      adminData.coursTango.push(
        { id: 'T-B3a', prenom: 'Rene', nom: 'TESTB3', email: 'b3@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'debutant', role: 'guideur', saison: sai },
        { id: 'T-B3b', prenom: 'Rene', nom: 'TESTB3', email: 'b3@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'debutant', role: 'guideur', saison: sai, _isRenewalRow: true }
      );
      adminData.cartes.push({ id: 'C-B3', nom: 'Rene TESTB3', email: 'b3@test', niveau: 'Débutant', ville: 'paris', statutEleve: 'Actif', utilises: 1, restants: 9, datePremierCours: '', expiration: '', statut: 'Active', source: 'inscription', datesCours: [], saison: sai, paye: true });
      // Personne SANS carte dont la seule ligne est un renouvellement → aucune carte fantôme
      adminData.coursTango.push({ id: 'T-B3c', prenom: 'Solo', nom: 'TESTB3R', email: 'b3r@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'debutant', role: 'guideur', saison: sai, _isRenewalRow: true });
      var d = _buildCartesData();
      return {
        avecCarte: d.cartes.filter(function (c) { return c.email === 'b3@test'; }).length,
        fantome: d.cartes.filter(function (c) { return c.email === 'b3r@test'; }).length,
      };
    });
    expect(res.avecCarte).toBe(1);
    expect(res.fantome).toBe(0);
  });

  test('B4 — _maxParJour : 1 cours→1 · 2 cours carte→2 · mixte forfait+carte→1 · forfait seul→1', async ({ page }) => {
    const res = await page.evaluate(() => {
      var sai = saisonActive();
      var rows = [
        { id: 'T-B4a', email: 'b4-un@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'debutant', saison: sai },
        { id: 'T-B4b', email: 'b4-deux@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'debutant', saison: sai },
        { id: 'T-B4c', email: 'b4-deux@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'intermediaire', saison: sai },
        // Cas mixte (bug corrigé 2026-07-07) : le cours forfait ne compte PAS
        { id: 'T-B4d', email: 'b4-mixte@test', statut: 'inscrit', type: 'forfait', ville: 'paris', niveau: 'debutant', saison: sai },
        { id: 'T-B4e', email: 'b4-mixte@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'intermediaire', saison: sai },
        { id: 'T-B4f', email: 'b4-forfait@test', statut: 'inscrit', type: 'forfait', ville: 'paris', niveau: 'debutant', saison: sai },
        // Renouvellement : exclu du compteur
        { id: 'T-B4g', email: 'b4-un@test', statut: 'inscrit', type: 'carte10', ville: 'paris', niveau: 'debutant', saison: sai, _isRenewalRow: true },
      ];
      rows.forEach(function (r) { r.prenom = 'X'; r.nom = 'B4'; r.role = 'guideur'; adminData.coursTango.push(r); });
      return {
        un: _maxParJour('b4-un@test'),
        deux: _maxParJour('b4-deux@test'),
        mixte: _maxParJour('b4-mixte@test'),
        forfait: _maxParJour('b4-forfait@test'),
      };
    });
    expect(res.un).toBe(1);
    expect(res.deux).toBe(2);
    expect(res.mixte).toBe(1);   // régression du bug "2 cours pointés sur la carte"
    expect(res.forfait).toBe(1);
  });
});

test.describe('Groupe E — Quotas guideurs/guidées', () => {
  test.beforeEach(async ({ page }) => { await bootDemo(page); });

  test('E1+E2 — nbInscritsCours : inscrit+att.paiement comptés, demande/supprimé/renouvellements exclus, dédup par nom', async ({ page }) => {
    const res = await page.evaluate(() => {
      var sai = saisonActive();
      var avant = nbInscritsCours('vincennes', 'debutant', 'guideur');
      var mk = function (id, nom, statut, extra) {
        var r = Object.assign({ id: id, prenom: 'Q', nom: nom, email: id + '@test', statut: statut, type: 'forfait', ville: 'vincennes', niveau: 'debutant', role: 'guideur', saison: sai }, extra || {});
        adminData.coursTango.push(r);
      };
      mk('T-E1a', 'QUOTA-UN', 'inscrit');
      mk('T-E1b', 'QUOTA-UN', 'inscrit');            // doublon même nom → compté 1 fois
      mk('T-E1c', 'QUOTA-DEUX', 'attente_paiement'); // compté (règle quota toute l'année)
      mk('T-E1d', 'QUOTA-TROIS', 'demande');          // NON compté
      mk('T-E1e', 'QUOTA-QUATRE', 'supprimé');        // NON compté
      mk('T-E1f', 'QUOTA-CINQ', 'inscrit', { _isRenewalRow: true }); // NON compté
      return { delta: nbInscritsCours('vincennes', 'debutant', 'guideur') - avant };
    });
    expect(res.delta).toBe(2); // QUOTA-UN (1×) + QUOTA-DEUX
  });
});
