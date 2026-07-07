// Groupe I — Espace élève (index.html) : smoke test du rendu.
// index.html n'a PAS de mode démo → on injecte un eleveData réaliste et on appelle
// les fonctions de rendu globales. Vérifie que l'affichage (accueil + Forfait/Carte)
// se construit sans erreur JS pour les 3 configurations de cours.
// ⚠️ Ne couvre PAS l'auth magic-link, le chargement Supabase, ni l'écriture du pointage
//    en base — ça nécessite un vrai élève test.
const { test, expect } = require('@playwright/test');
const { bootEleve } = require('./helpers');

// Construit un eleveData et rend accueil + dashboard, retourne le DOM + erreurs éventuelles.
async function renderEleve(page, build) {
  return page.evaluate((buildFn) => {
    var sc = _saisonCourante();
    // eslint-disable-next-line no-eval
    var data = eval('(' + buildFn + ')')(sc);
    eleveData = data;
    var res = { errors: [] };
    try { renderAccueil(); } catch (e) { res.errors.push('renderAccueil: ' + e.message); }
    try { renderDashboard(); } catch (e) { res.errors.push('renderDashboard: ' + e.message); }
    var acc = document.getElementById('accueil-pane');
    var dash = document.getElementById('cours-encadres-dash');
    res.accueilText = acc ? acc.textContent : '';
    res.dashHTML = dash ? dash.innerHTML : '';
    res.accueilImgCount = acc ? acc.querySelectorAll('img[onerror]').length : -1;
    return res;
  }, build.toString());
}

const baseCarte = { type: 'carte10', coursUtilises: 2, coursRestants: 6, dateAchat: '2026-01-08', dateExpiration: '2026-05-08', statut: 'Active', paye: true, numero: 1, dureeMois: 4 };

test.describe('Groupe I — Espace élève (rendu)', () => {
  test.beforeEach(async ({ page }) => { await bootEleve(page); });

  test('I1 — élève mixte (forfait Paris déb + carte Paris interm) : 2 encadrés + suivi carte', async ({ page }) => {
    const r = await renderEleve(page, (sc) => ({
      eleve: { prenom: 'Mixte', nom: 'DEMO', email: 't@demo.fr', niveau: 'intermediaire', ville: 'paris' },
      carte: { type: 'carte10', coursUtilises: 2, coursRestants: 6, dateAchat: '2026-01-08', dateExpiration: '2026-05-08', statut: 'Active', paye: true, numero: 1, dureeMois: 4 },
      inscriptionsTango: [
        { statut: 'inscrit', saison: sc, ville: 'paris', niveau: 'debutant', type: 'forfait', donnees: {} },
        { statut: 'inscrit', saison: sc, ville: 'paris', niveau: 'intermediaire', type: 'carte10', donnees: {} },
      ],
      nbCoursInscrits: 1, hasVincennes: false, soranoPayé: false, coursYoga: [], notifications: [],
    }));
    expect(r.errors).toEqual([]);
    expect(r.accueilText).toContain('Paris');
    expect(r.accueilText).toContain('Forfait annuel');   // encadré du cours forfait
    expect(r.accueilText).toContain('cours restants');    // suivi de carte dans l'autre encadré
    expect(r.dashHTML.length).toBeGreaterThan(0);         // onglet Forfait/Carte : encadrés compacts
  });

  test('I2 — élève forfait pur (2 cours) : badges forfait, pas de suivi carte', async ({ page }) => {
    const r = await renderEleve(page, (sc) => ({
      eleve: { prenom: 'Forfait', nom: 'DEMO', email: 'f@demo.fr', niveau: 'debutant', ville: 'paris' },
      carte: { type: 'forfait' },
      inscriptionsTango: [
        { statut: 'inscrit', saison: sc, ville: 'paris', niveau: 'debutant', type: 'forfait', donnees: {} },
        { statut: 'inscrit', saison: sc, ville: 'vincennes', niveau: 'intermediaire', type: 'forfait', donnees: {} },
      ],
      nbCoursInscrits: 2, hasVincennes: true, soranoPayé: true, coursYoga: [], notifications: [],
    }));
    expect(r.errors).toEqual([]);
    expect(r.accueilText).toContain('Forfait annuel');
    expect(r.accueilText).not.toContain('cours restants'); // aucune carte à suivre
  });

  test('I3 — élève carte pure (1 cours) : suivi de carte complet', async ({ page }) => {
    const r = await renderEleve(page, (sc) => ({
      eleve: { prenom: 'Carte', nom: 'DEMO', email: 'c@demo.fr', niveau: 'debutant', ville: 'paris' },
      carte: { type: 'carte10', coursUtilises: 0, coursRestants: 10, dateAchat: '', dateExpiration: '', statut: 'Nouvelle carte', paye: true, numero: 1, dureeMois: 3 },
      inscriptionsTango: [
        { statut: 'inscrit', saison: sc, ville: 'paris', niveau: 'debutant', type: 'carte10', donnees: {} },
      ],
      nbCoursInscrits: 1, hasVincennes: false, soranoPayé: false, coursYoga: [], notifications: [],
    }));
    expect(r.errors).toEqual([]);
    expect(r.accueilText).toContain('cours restants');
    expect(r.accueilText).toContain('Je pointe ma présence'); // bouton pointage présent
  });

  test('I4 — panneau notifications : rendu + échappement (rappel du fix #2)', async ({ page }) => {
    const r = await page.evaluate((payload) => {
      eleveData = { eleve: { email: 'n@demo.fr' }, notifications: [
        { id: 1, type: 'info', message: '📰 ' + payload, lu: false, created_at: '2026-07-08T10:00:00Z' },
      ] };
      renderNotificationsPane();
      var pane = document.getElementById('notifications-pane');
      return { imgCount: pane.querySelectorAll('img').length, hasText: pane.textContent.includes('<img') };
    }, '<img src=x onerror="window.__i4=1">');
    expect(r.imgCount).toBe(0);
    expect(r.hasText).toBe(true);
  });
});
