// Groupe Z — Export vCard vers l'app Contacts (2026-08-17)
// Bouton « 📇 Contacts » dans Élèves Tango et Élèves Yoga : produit un .vcf
// contenant les fiches AFFICHÉES (onglet de cours, ou résultats de recherche).
// ⚠️ Ne déclenche jamais le téléchargement dans les tests — on vérifie le contenu produit.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');

async function fixtures(page) {
  return page.evaluate(() => {
    const sai = saisonActive();
    adminData.coursTango = [
      { prenom:'Camille', nom:'MARTIN', email:'camille@test.fr', tel:'06 12 34 56 78', ville:'paris', niveau:'debutant', role:'guideur', statut:'inscrit', saison:sai },
      { prenom:'Alex', nom:"O'BRIEN; Jr", email:'alex@test.fr', tel:'0798765432', ville:'paris', niveau:'debutant', role:'guidee', statut:'inscrit', saison:sai },
      // même personne, 2e cours → doit fusionner en UN seul contact
      { prenom:'Camille', nom:'MARTIN', email:'camille@test.fr', tel:'', ville:'paris', niveau:'intermediaire', role:'guideur', statut:'inscrit', saison:sai },
      // ni téléphone ni email → écarté
      { prenom:'Sans', nom:'CONTACT', email:'', tel:'', ville:'paris', niveau:'debutant', role:'guidee', statut:'inscrit', saison:sai },
      // autre cours → ne doit pas sortir dans l'onglet Paris Débutants
      { prenom:'Vince', nom:'DUPONT', email:'v@test.fr', tel:'0600000000', ville:'vincennes', niveau:'debutant', role:'guideur', statut:'inscrit', saison:sai },
      // supprimé → jamais exporté
      { prenom:'Parti', nom:'AILLEURS', email:'p@test.fr', tel:'0611111111', ville:'paris', niveau:'debutant', role:'guideur', statut:'supprimé', saison:sai },
    ];
    adminData.coursYoga = [
      { prenom:'Yoga', nom:'UN', email:'y1@test.fr', tel:'0622222222', cours:'yin', statut:'inscrit', saison:sai },
      { prenom:'Yoga', nom:'DEUX', email:'y2@test.fr', tel:'', cours:'forfait', statut:'inscrit', saison:sai },
      { prenom:'Yoga', nom:'SUPPR', email:'y3@test.fr', tel:'0633333333', cours:'yin', statut:'supprimé', saison:sai },
    ];
    return sai;
  });
}

// Reproduit la sélection du bouton Tango sans déclencher le téléchargement
async function vcfTango(page, onglet, recherche) {
  return page.evaluate(([ong, q]) => {
    sousOngletEleves = ong; rechercheEleve = q || '';
    const sai = saisonActive();
    const inscrits = (adminData.coursTango || []).filter(e =>
      (e.saison || saisonCourante()) === sai && e.statut === 'inscrit' && !e._isRenewalRow);
    let liste;
    if (rechercheEleve) {
      const s = rechercheEleve.toLowerCase().trim();
      liste = inscrits.filter(e => (e.prenom + ' ' + e.nom + ' ' + (e.partenaire || '') + ' ' + (e.email || '')).toLowerCase().indexOf(s) >= 0);
    } else {
      const o = _elevesOnglets().find(x => x.id === sousOngletEleves);
      liste = inscrits.filter(e => e.ville === o.ville && e.niveau === o.niv);
    }
    const fiches = _vcardDedup(liste.map(e => ({
      prenom: e.prenom, nom: e.nom, tel: e.tel, email: e.email,
      note: (e.ville === 'vincennes' ? 'Vincennes' : 'Paris') + ' — ' + (e.niveau === 'intermediaire' ? 'Intermédiaire' : 'Débutant')
            + ' · ' + (e.role === 'guidee' ? 'Guidée' : 'Guideur·se') + ' · ' + sai,
    })));
    return _vcardConstruire(fiches);
  }, [onglet, recherche]);
}

test.describe('Groupe Z — Export vCard vers Contacts', () => {

  test('Z1 — format vCard valide, échappement, société et note', async ({ page }) => {
    await bootDemo(page); await fixtures(page);
    const vcf = await vcfTango(page, 'paris-deb');
    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('VERSION:3.0');
    expect(vcf).toContain('END:VCARD');
    expect(vcf).toContain('N:MARTIN;Camille;;;');
    expect(vcf).toContain('FN:Camille MARTIN');
    expect(vcf).toContain('ORG:Tango & Vous');                 // repérable dans Contacts
    expect(vcf).toContain('TEL;TYPE=CELL:06 12 34 56 78');
    expect(vcf).toContain('EMAIL;TYPE=INTERNET:camille@test.fr');
    expect(vcf).toContain('NOTE:Paris — Débutant · Guideur·se');
    expect(vcf).toContain("N:O'BRIEN\\; Jr;Alex;;;");           // point-virgule échappé
    expect(vcf.split('\r\n').length).toBeGreaterThan(5);        // séparateurs CRLF
  });

  test('Z2 — n\'exporte que le cours affiché, jamais les supprimés', async ({ page }) => {
    await bootDemo(page); await fixtures(page);
    const vcf = await vcfTango(page, 'paris-deb');
    expect(vcf).toContain('Camille MARTIN');
    expect(vcf).toContain('Alex');
    expect(vcf).not.toContain('Vince');    // autre cours
    expect(vcf).not.toContain('Parti');    // supprimé
  });

  test('Z3 — fiche sans téléphone ni email écartée ; doublon 2 cours fusionné', async ({ page }) => {
    await bootDemo(page); await fixtures(page);
    const vcf = await vcfTango(page, 'paris-deb');
    expect(vcf).not.toContain('Sans CONTACT');
    expect((vcf.match(/BEGIN:VCARD/g) || []).length).toBe(2);   // Camille + Alex
    expect((vcf.match(/FN:Camille MARTIN/g) || []).length).toBe(1);
  });

  test('Z4 — une recherche en cours exporte les résultats, tous cours confondus', async ({ page }) => {
    await bootDemo(page); await fixtures(page);
    const vcf = await vcfTango(page, 'paris-deb', 'vince');
    expect(vcf).toContain('Vince DUPONT');
    expect(vcf).not.toContain('Camille');
  });

  test('Z5 — Yoga : inscrits de la saison, supprimés exclus', async ({ page }) => {
    await bootDemo(page); await fixtures(page);
    const vcf = await page.evaluate(() => {
      const sai = saisonActive();
      const liste = (adminData.coursYoga || []).filter(e => (e.saison || saisonCourante()) === sai && e.statut !== 'supprimé');
      const LBL = { yin:'Yin Yoga', hatha:'Hatha Yoga', forfait:'Yin + Hatha' };
      const fiches = _vcardDedup(liste.map(e => ({
        prenom:e.prenom, nom:e.nom, tel:e.tel || _yogaTel(e), email:e.email,
        note:'Yoga — ' + (LBL[e.cours] || e.cours || '') + ' · ' + sai })));
      return _vcardConstruire(fiches);
    });
    expect(vcf).toContain('FN:Yoga UN');
    expect(vcf).toContain('NOTE:Yoga — Yin Yoga');
    expect(vcf).toContain('FN:Yoga DEUX');       // sans tel mais avec email → conservé
    expect(vcf).not.toContain('SUPPR');
  });

  test('Z6 — les boutons sont présents et les vues ne cassent pas', async ({ page }) => {
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await bootDemo(page); await fixtures(page);
    // Élèves Tango
    await page.evaluate(() => { currentTab = 'eleves-tango'; sousOngletEleves = 'paris-deb'; rechercheEleve = ''; renderTab(); });
    await page.waitForFunction(() => document.getElementById('tab-content').textContent.indexOf('📇 Contacts') >= 0);
    let ok = await page.evaluate(() => typeof exporterContactsTango === 'function'
      && !!document.getElementById('tab-content').querySelector('[onclick="imprimerElevesTango()"]'));
    expect(ok).toBe(true);   // le bouton Imprimer existant est toujours là
    // Élèves Yoga
    await page.evaluate(() => { currentTab = 'yoga'; sousOngletYoga = 'eleves'; renderTab(); });
    await page.waitForFunction(() => document.getElementById('tab-content').textContent.indexOf('📇 Contacts') >= 0);
    ok = await page.evaluate(() => typeof exporterContactsYoga === 'function'
      && !!document.getElementById('tab-content').querySelector('[onclick="imprimerYogaEleves()"]'));
    expect(ok).toBe(true);
    expect(errs).toEqual([]);
  });
});
