// Groupe S — Essai Tango : ordre d'affichage "Par date" (et helpers partagés).
// Ordre demandé (2026-07-23) :
//   1. couples validés · 2. solos validés alternés guideur/guidée
//   3. couples non validés · 4. guideurs solos non validés · 5. guidées solos non validées
// Solos triés : expérience croissante (vide=0 → 1er cours → … → 2+ → milonga) puis inscription.
const { test, expect } = require('@playwright/test');
const { bootDemo, bootPage } = require('./helpers');

// Jeu de données synthétique : un seul cours (2026-06-11, Paris débutant).
// created_at contrôlé → l'ordre attendu est calculé à la main.
const FIX = [
  // Couple validé n°2 (inscrit après le couple 1)
  { id: 201, created_at: '2026-05-02T10:00:00', prenom: 'Lucas', nom: 'ROY', email: 'lucas@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', partenaire: 'Emma PETIT', niveau_eleve: '1 an – bases acquises' },
  { id: 202, created_at: '2026-05-02T10:00:00', prenom: 'Emma', nom: 'PETIT', email: '', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', partenaire: 'Lucas ROY', niveau_eleve: '' },
  // Couple validé n°1
  { id: 101, created_at: '2026-05-01T09:00:00', prenom: 'Julien', nom: 'MOREAU', email: 'julien@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', partenaire: 'Claire MOREAU', niveau_eleve: 'Quelques cours' },
  { id: 102, created_at: '2026-05-01T09:00:00', prenom: 'Claire', nom: 'MOREAU', email: '', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', partenaire: 'Julien MOREAU', niveau_eleve: '' },
  // Solos validés — guideurs : Sam (2+), Paul (1er cours), Marc (quelques)
  { id: 301, created_at: '2026-05-03T08:00:00', prenom: 'Sam', nom: 'COHEN', email: 'sam@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', niveau_eleve: 'Plus de 2 ans' },
  { id: 302, created_at: '2026-05-04T08:00:00', prenom: 'Paul', nom: 'BLANC', email: 'paul@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', niveau_eleve: '1er cours' },
  { id: 303, created_at: '2026-05-05T08:00:00', prenom: 'Marc', nom: 'LEROY', email: 'marc@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', niveau_eleve: 'Quelques cours' },
  // Solos validés — guidées : Rosa (2+), Anna (vide=0), Zoé (2+ inscrite après Rosa)
  { id: 401, created_at: '2026-05-03T09:00:00', prenom: 'Rosa', nom: 'DIAZ', email: 'rosa@test.fr', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', niveau_eleve: 'Plus de 2 ans' },
  { id: 402, created_at: '2026-05-04T09:00:00', prenom: 'Anna', nom: 'SILVA', email: 'anna@test.fr', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', niveau_eleve: '' },
  { id: 403, created_at: '2026-05-06T09:00:00', prenom: 'Zoe', nom: 'LAMY', email: 'zoe@test.fr', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'confirme', niveau_eleve: 'Plus de 2 ans' },
  // Couple non validé
  { id: 501, created_at: '2026-05-07T10:00:00', prenom: 'Igor', nom: 'PAVLOV', email: 'igor@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'attente', partenaire: 'Nina PAVLOVA', niveau_eleve: '1er cours' },
  { id: 502, created_at: '2026-05-07T10:00:00', prenom: 'Nina', nom: 'PAVLOVA', email: '', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'attente', partenaire: 'Igor PAVLOV', niveau_eleve: '' },
  // Guideur solo non validé
  { id: 601, created_at: '2026-05-08T10:00:00', prenom: 'Yves', nom: 'GARNIER', email: 'yves@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'attente', niveau_eleve: '1er cours' },
  // Guidées solos non validées : Ines (2 ans), Sofia (1er cours)
  { id: 701, created_at: '2026-05-09T10:00:00', prenom: 'Ines', nom: 'BAKIR', email: 'ines@test.fr', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'attente', niveau_eleve: '2 ans' },
  { id: 702, created_at: '2026-05-10T10:00:00', prenom: 'Sofia', nom: 'RAMOS', email: 'sofia@test.fr', role: 'guidee', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'attente', niveau_eleve: '1er cours' },
  // Supprimé — doit rester tout en bas, hors classement
  { id: 801, created_at: '2026-05-01T08:00:00', prenom: 'Sup', nom: 'PRIME', email: 'sup@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', date: '2026-06-11', statut: 'supprimé', niveau_eleve: '1er cours' },
];

// Ordre attendu (prénoms), catégories 1→5 :
// 1. Couples validés (par inscription) : Julien+Claire, puis Lucas+Emma
// 2. Alternance solos validés :
//    guideurs triés exp puis date : Paul(0), Marc(0+), Sam(2+)
//    guidées  triées exp puis date : Anna(vide=0), Rosa(2+ 03/05), Zoé(2+ 06/05)
//    → Paul, Anna, Marc, Rosa, Sam, Zoé
// 3. Couple non validé : Igor+Nina
// 4. Guideur solo non validé : Yves
// 5. Guidées solos non validées : Sofia(0), Ines(2)
const ATTENDU = ['Julien', 'Claire', 'Lucas', 'Emma', 'Paul', 'Anna', 'Marc', 'Rosa', 'Sam', 'Zoe', 'Igor', 'Nina', 'Yves', 'Sofia', 'Ines'];
// Dans le DOM, le tri global de renderEssai (rôle alphabétique) place la guidée
// AVANT le guideur à l'intérieur de chaque couple (comportement historique conservé).
const ATTENDU_DOM = ['Claire', 'Julien', 'Emma', 'Lucas', 'Paul', 'Anna', 'Marc', 'Rosa', 'Sam', 'Zoe', 'Nina', 'Igor', 'Yves', 'Sofia', 'Ines'];

// Élèves réguliers pour la vue Pointage (Élèves ★). Vic est marqué absent du jour.
const ELEVES = [
  { id: 901, prenom: 'Ted', nom: 'STAR', email: 'ted@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', statut: 'inscrit', saison: '2025-2026' },
  { id: 902, prenom: 'Uma', nom: 'STARE', email: 'uma@test.fr', role: 'guidee', ville: 'paris', niveau: 'debutant', statut: 'inscrit', saison: '2025-2026' },
  { id: 903, prenom: 'Vic', nom: 'STARR', email: 'vic@test.fr', role: 'guideur', ville: 'paris', niveau: 'debutant', statut: 'inscrit', saison: '2025-2026' },
];

test.describe('Groupe S — Essai Tango : ordre Par date', () => {

  test('S1 — _essaiOrdonnerGroupes : 5 catégories, alternance, exp croissante, vide=0', async ({ page }) => {
    await bootPage(page);
    const ordre = await page.evaluate((fix) => {
      const actifs = fix.filter(function (e) { return e.statut !== 'supprimé'; });
      const groups = _essaiOrdonnerGroupes(_groupCouples(actifs), function (e) { return e.statut === 'attente'; });
      const out = [];
      groups.forEach(function (g) {
        if (g.type === 'couple') { out.push(g.persons[0].prenom, g.persons[1].prenom); }
        else out.push(g.person.prenom);
      });
      return out;
    }, FIX);
    expect(ordre).toEqual(ATTENDU);
  });

  test('S2 — ne mute pas la liste source + ordre stable sur deux exécutions', async ({ page }) => {
    await bootPage(page);
    const res = await page.evaluate((fix) => {
      const actifs = fix.filter(function (e) { return e.statut !== 'supprimé'; });
      const avant = actifs.map(function (e) { return e.id; });
      const att = function (e) { return e.statut === 'attente'; };
      const run = function () {
        const out = [];
        _essaiOrdonnerGroupes(_groupCouples(actifs), att).forEach(function (g) {
          if (g.type === 'couple') out.push(g.persons[0].id, g.persons[1].id);
          else out.push(g.person.id);
        });
        return out;
      };
      const r1 = run(), r2 = run();
      const apres = actifs.map(function (e) { return e.id; });
      return { sourceIntacte: JSON.stringify(avant) === JSON.stringify(apres), stable: JSON.stringify(r1) === JSON.stringify(r2) };
    }, FIX);
    expect(res.sourceIntacte).toBe(true); // risque 1 : la liste partagée n'est jamais réordonnée
    expect(res.stable).toBe(true);        // risque 3 : ordre identique à chaque re-rendu
  });

  test('S3 — vue Par date : DOM dans le bon ordre, supprimés en bas', async ({ page }) => {
    await bootDemo(page);
    await page.evaluate((fix) => {
      adminData.essai = fix.slice();
      currentTab = 'essai';
      filtreEssai = 'dates';
      renderTab(); // rendu ASYNCHRONE (spinner puis doRender à +40ms)
    }, FIX);
    await page.waitForFunction(() => document.querySelectorAll('#tab-content .point-row').length >= 16);
    const noms = await page.$$eval('#tab-content .point-row .point-nom', els =>
      els.map(e => e.textContent.trim().split(' ')[0]));
    // Les 15 actifs dans l'ordre attendu, puis le supprimé tout en bas
    expect(noms.slice(0, 15)).toEqual(ATTENDU_DOM);
    expect(noms[15]).toBe('Sup');
    // Le bandeau Supprimés est bien présent après les fiches actives
    const bandeau = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('#tab-content div')).find(function (d) { return d.textContent.indexOf('🗑 Supprimés (1)') === 0; });
      return !!el;
    });
    expect(bandeau).toBe(true);
  });

  test('S4 — boutons Valider/Supprimer visent toujours la bonne fiche après ré-ordre', async ({ page }) => {
    await bootDemo(page);
    await page.evaluate((fix) => {
      adminData.essai = fix.slice();
      currentTab = 'essai';
      filtreEssai = 'dates';
      renderTab(); // rendu ASYNCHRONE
    }, FIX);
    await page.waitForFunction(() => document.querySelectorAll('#tab-content .point-row').length >= 16);
    // La fiche de Sofia (id 702, attente, affichée avant-dernière) porte bien SES data-attributes
    const attrs = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#tab-content .point-row'));
      const row = rows.find(function (r) { return r.textContent.indexOf('Sofia') >= 0; });
      if (!row) return null;
      const btn = row.querySelector('[data-action="toggle-acc-essai"]');
      const val = document.querySelector('[data-action="val-guidee-essai"][data-id="702"]');
      return { acc: btn ? btn.dataset.id : '', validerExiste: !!val || 'accordeon-ferme' };
    });
    expect(attrs).toBeTruthy();
    expect(attrs.acc).toBe('ed_702'); // le bouton de SA ligne cible bien l'id 702, pas une position
  });

  test('S5 — vue Pointage : validés → Élèves ★ → ★ absents → attentes → supprimés', async ({ page }) => {
    await bootDemo(page);
    await page.evaluate(([fix, elv]) => {
      adminData.essai = fix.slice();
      adminData.coursTango = elv.slice();
      adminData.absencesJour = [{ date: '2026-06-11', email: 'vic@test.fr' }];
      currentTab = 'essai';
      filtreEssai = 'pointage';
      renderTab(); // rendu ASYNCHRONE
    }, [FIX, ELEVES]);
    await page.waitForFunction(() => document.querySelectorAll('#tab-content .point-row').length >= 19);
    const noms = await page.$$eval('#tab-content .point-row .point-nom', els =>
      els.map(e => e.textContent.trim().split(' ')[0]));
    expect(noms).toEqual([
      // 1. couples validés (guidée affichée avant le guideur — tri global historique)
      'Claire', 'Julien', 'Emma', 'Lucas',
      // 2. solos validés alternés (exp croissante puis inscription)
      'Paul', 'Anna', 'Marc', 'Rosa', 'Sam', 'Zoe',
      // 3. Élèves ★ présents (alternance guideur/guidée conservée)
      'Ted', 'Uma',
      // 3bis. Élèves ★ absents du jour
      'Vic',
      // 4-5-6. attentes : couple, puis guideurs, puis guidées (exp croissante)
      'Nina', 'Igor', 'Yves', 'Sofia', 'Ines',
      // Supprimés tout en bas
      'Sup',
    ]);
  });

  test('S6 — impression 🖨 : même ordre, Élèves ★ entre validés et attentes, sans supprimés', async ({ page }) => {
    await bootDemo(page);
    const rows = await page.evaluate(([fix, elv]) => {
      adminData.essai = fix.slice();
      adminData.coursTango = elv.slice();
      adminData.absencesJour = [{ date: '2026-06-11', email: 'vic@test.fr' }];
      let captured = null;
      window._tevPrint = function (titre, sections) { captured = sections; };
      imprimerEssaiTango();
      return captured ? captured[0].rows.map(function (r) { return [r[0].split(' ')[0], r[3]]; }) : null;
    }, [FIX, ELEVES]);
    expect(rows).toEqual([
      ['Julien', 'Essai'], ['Claire', 'Essai'], ['Lucas', 'Essai'], ['Emma', 'Essai'],
      ['Paul', 'Essai'], ['Anna', 'Essai'], ['Marc', 'Essai'], ['Rosa', 'Essai'], ['Sam', 'Essai'], ['Zoe', 'Essai'],
      ['Ted', 'Élève ★'], ['Uma', 'Élève ★'],
      ['Igor', 'Attente'], ['Nina', 'Attente'], ['Yves', 'Attente'], ['Sofia', 'Attente'], ['Ines', 'Attente'],
    ]);
  });
});
