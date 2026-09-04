// Groupe AH — Champ « Note d'accès » de l'adresse (2026-09-04)
// Besoin admin : afficher sous l'adresse des emails de cours d'essai une consigne
// d'accès (digicode du portail de la villa Riberolle), pour PARIS uniquement.
// Le worker savait déjà rendre `adresse.note` (E0/E1/E2/E5/E6, E4, E-mod) mais le
// formulaire Paramètres ne permettait pas de la saisir : champ jamais écrit.
// Ces tests vérifient la saisie, la persistance et le cloisonnement par ville.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

// Ouvre Paramètres → <ville> → Adresse et renvoie le HTML du formulaire
async function formAdresse(page, ville) {
  return page.evaluate((v) => _renderSecAdresseContent(v, saisonActive()), ville);
}

test.describe('Groupe AH — Note d\'accès sur l\'adresse', () => {

  test('AH1 — le champ existe dans le formulaire, pour chaque lieu', async ({ page }) => {
    await bootDemo(page);
    for (const ville of ['paris', 'vincennes', 'yoga', 'stages']) {
      const html = await formAdresse(page, ville);
      expect(html).toContain('pm-' + ville + '-adr-note');
      expect(html).toContain('Note d\'accès');
    }
    // Les champs historiques sont toujours là — aucun n'a été remplacé
    const paris = await formAdresse(page, 'paris');
    for (const k of ['nom', 'rue', 'gps', 'transport', 'metrogps']) {
      expect(paris).toContain('pm-paris-adr-' + k);
    }
  });

  test('AH2 — la note est enregistrée puis relue dans le formulaire', async ({ page }) => {
    await bootDemo(page);
    const NOTE = 'Au portail, à l\'entrée de la villa Riberolle, appuyez sur la touche « P » du digicode situé à droite.';
    const r = await page.evaluate((note) => {
      const sai = saisonActive();
      document.body.insertAdjacentHTML('beforeend',
        '<div id="__t">' + _renderSecAdresseContent('paris', sai) + '</div>');
      gel('pm-paris-adr-nom').value = 'Espas Danse Studio';
      gel('pm-paris-adr-rue').value = '24 villa Riberolle, Paris 20e';
      gel('pm-paris-adr-transport').value = 'M° Alexandre Dumas (L2)';
      gel('pm-paris-adr-note').value = note;
      sauverAdresseType('paris', sai);
      const enBase = _loadParam('paris', sai, 'adresse');
      document.getElementById('__t').remove();
      return { enBase: enBase, htmlRelu: _renderSecAdresseContent('paris', sai) };
    }, NOTE);
    // Persistée telle quelle, sans perdre les autres champs
    expect(r.enBase.note).toBe(NOTE);
    expect(r.enBase.nom).toBe('Espas Danse Studio');
    expect(r.enBase.rue).toBe('24 villa Riberolle, Paris 20e');
    expect(r.enBase.transport).toBe('M° Alexandre Dumas (L2)');
    // Rechargée dans le champ (l'admin la voit et peut la modifier)
    expect(r.htmlRelu).toContain('villa Riberolle');
    expect(r.htmlRelu).toContain('digicode');
  });

  test('AH3 — cloisonnement : la note de Paris ne fuit pas sur Vincennes', async ({ page }) => {
    await bootDemo(page);
    const r = await page.evaluate(() => {
      const sai = saisonActive();
      document.body.insertAdjacentHTML('beforeend', '<div id="__t">' + _renderSecAdresseContent('paris', sai) + '</div>');
      gel('pm-paris-adr-nom').value = 'Espas Danse Studio';
      gel('pm-paris-adr-note').value = 'Digicode touche P';
      sauverAdresseType('paris', sai);
      document.getElementById('__t').remove();
      return { paris: _loadParam('paris', sai, 'adresse').note || '',
               vincennes: _loadParam('vincennes', sai, 'adresse').note || '' };
    });
    expect(r.paris).toBe('Digicode touche P');
    expect(r.vincennes).toBe('');          // Vincennes intact — exigence « Paris uniquement »
  });

  test('AH4 — note vide : le champ reste vide, rien n\'est inventé', async ({ page }) => {
    await bootDemo(page);
    const note = await page.evaluate(() => {
      const sai = saisonActive();
      document.body.insertAdjacentHTML('beforeend', '<div id="__t">' + _renderSecAdresseContent('paris', sai) + '</div>');
      gel('pm-paris-adr-nom').value = 'Espas Danse Studio';
      sauverAdresseType('paris', sai);
      document.getElementById('__t').remove();
      return _loadParam('paris', sai, 'adresse').note;
    });
    expect(note).toBe('');
  });
});
