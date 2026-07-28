// Groupe W — Stages : pastille de niveau D / I / A sur les fiches (2026-07-24)
// Le formulaire public impose Débutant / Intermédiaire / Avancé (champ obligatoire).
// La pastille doit apparaître sur les 4 vues de l'onglet Stages, avec le nom
// complet en infobulle, et disparaître proprement si le niveau est absent.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

const DATE = '2026-08-01';
const INSCRITS = [
  { _dbId: 1, prenom: 'Dan', nom: 'DEBUT', email: 'dan@test.fr', tel: '', role: 'guideur', niveau: 'Débutant',      slots: ['technique','stage1'], present: null, montant: 45, attente: false, partenaire: '', emailPartenaire: '' },
  { _dbId: 2, prenom: 'Ina', nom: 'INTER', email: 'ina@test.fr', tel: '', role: 'guidee',  niveau: 'Intermédiaire', slots: ['stage1'],             present: null, montant: 25, attente: false, partenaire: '', emailPartenaire: '' },
  { _dbId: 3, prenom: 'Ava', nom: 'AVANC', email: 'ava@test.fr', tel: '', role: 'guidee',  niveau: 'Avancé',        slots: ['stage1'],             present: null, montant: 25, attente: true,  partenaire: '', emailPartenaire: '' },
  { _dbId: 4, prenom: 'Sam', nom: 'SANSNIV', email: 'sam@test.fr', tel: '', role: 'guideur', niveau: '',            slots: ['stage1'],             present: null, montant: 25, attente: false, partenaire: '', emailPartenaire: '' },
];

// `marker` : un nom présent dans la vue attendue (la vue Attente ne montre qu'Ava)
async function bootStages(page, slot, marker) {
  await bootDemo(page);
  await page.evaluate(([date, ins, sl]) => {
    adminData.stages = {}; adminData.stages[date] = { label: 'Sam. 1 Août 2026', inscrits: ins.slice() };
    currentTab = 'stages';
    filtreStage = date;
    filtreStageSlot = sl;
    renderTab(); // rendu ASYNCHRONE (spinner puis doRender à +40ms)
  }, [DATE, INSCRITS, slot]);
  await page.waitForFunction((m) => {
    const tc = document.getElementById('tab-content');
    return tc && !tc.querySelector('.spinner') && tc.textContent.indexOf(m) >= 0;
  }, marker || 'DEBUT');
}

// Lit les pastilles de niveau (span dont le texte est exactement D, I ou A)
async function pastilles(page) {
  return page.$$eval('#tab-content span', els => els
    .filter(e => ['D', 'I', 'A'].indexOf(e.textContent.trim()) >= 0 && e.title)
    .map(e => ({ lettre: e.textContent.trim(), titre: e.title })));
}

test.describe('Groupe W — Stages : pastille de niveau D/I/A', () => {

  test('W1 — helper _stNiveauBadge : lettre, infobulle, couleur, cas vide', async ({ page }) => {
    await bootDemo(page);
    const res = await page.evaluate(() => ({
      deb:   _stNiveauBadge('Débutant'),
      inter: _stNiveauBadge('Intermédiaire'),
      av:    _stNiveauBadge('Avancé'),
      vide:  _stNiveauBadge(''),
      nul:   _stNiveauBadge(null),
      inconnu: _stNiveauBadge('Zumba'),
    }));
    expect(res.deb).toContain('>D<');
    expect(res.deb).toContain('title="Débutant"');
    expect(res.deb).toContain('#4ade80');       // vert
    expect(res.inter).toContain('>I<');
    expect(res.inter).toContain('#fbbf24');     // orange
    expect(res.av).toContain('>A<');
    expect(res.av).toContain('#f87171');        // rouge
    expect(res.vide).toBe('');                  // niveau absent → aucune pastille
    expect(res.nul).toBe('');
    expect(res.inconnu).toBe('');               // valeur hors D/I/A → rien, pas de plantage
  });

  test('W2 — vue 📋 Tous : une pastille par fiche renseignée, aucune si niveau vide', async ({ page }) => {
    await bootStages(page, 'tous');
    const p = await pastilles(page);
    expect(p.map(x => x.lettre).sort()).toEqual(['A', 'D', 'I']); // Sam (sans niveau) n'en a pas
    expect(p.find(x => x.lettre === 'D').titre).toBe('Débutant');
    expect(p.find(x => x.lettre === 'A').titre).toBe('Avancé');
  });

  test('W3 — vue ✓ Pointage : pastille présente, niveau retiré du texte de détail', async ({ page }) => {
    await bootStages(page, 'pointage');
    const p = await pastilles(page);
    expect(p.map(x => x.lettre).sort()).toEqual(['D', 'I']); // Ava est en attente → hors pointage
    // le mot entier ne doit plus apparaître en texte dans la ligne de détail
    const sub = await page.$$eval('#tab-content .point-sub', els => els.map(e => e.textContent).join(' | '));
    expect(sub).not.toContain('Intermédiaire');
  });

  test('W4 — vue ⏳ Attente : pastille compacte sur la fiche, titres de groupe conservés', async ({ page }) => {
    await bootStages(page, 'attente', 'AVANC');
    const p = await pastilles(page);
    expect(p.length).toBe(1);
    expect(p[0].lettre).toBe('A');
    expect(p[0].titre).toBe('Avancé');
    // Le regroupement par niveau (titre de section en toutes lettres) reste en place
    const txt = await page.evaluate(() => document.getElementById('tab-content').textContent);
    expect(txt).toContain('Avancé');
    // …mais la fiche elle-même ne porte plus le mot entier, seulement la pastille
    const carte = await page.$eval('#tab-content .card', e => e.textContent);
    expect(carte).not.toContain('Avancé');
    expect(carte).toContain('A');
  });

  test('W5 — vue par créneau : pastilles sur les inscrits ET la liste d\'attente', async ({ page }) => {
    await bootStages(page, 'stage1');
    const p = await pastilles(page);
    // Les 4 inscrits ont stage1 ; Sam n'a pas de niveau → 3 pastilles (dont Ava en attente)
    expect(p.map(x => x.lettre).sort()).toEqual(['A', 'D', 'I']);
  });
});
