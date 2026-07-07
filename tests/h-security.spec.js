// Groupe H — Non-régression des corrections de sécurité (audit 2026-07-08)
// Vérifie que les champs contrôlés par l'utilisateur sont échappés dans le DOM
// (aucun nœud vivant injecté) ET que le rendu normal fonctionne toujours.
const { test, expect } = require('@playwright/test');
const { bootDemo, bootEleve } = require('./helpers');

const XSS = '<img src=x onerror="window.__xss_fired=1">';

test.describe('Groupe H — Sécurité (échappement XSS)', () => {

  test('H1 (#2) — panneau notifications élève : n.message échappé, pas de nœud injecté', async ({ page }) => {
    await bootEleve(page);
    const res = await page.evaluate((payload) => {
      // Injecter une notification piégée + une normale
      eleveData = eleveData || {};
      eleveData.notifications = [
        { id: 1, type: 'message_prive', message: '💬 Message de ' + payload + ' : coucou', lu: false, created_at: '2026-07-08T10:00:00Z' },
        { id: 2, type: 'info', message: '📰 Nouvelle publication', lu: true, created_at: '2026-07-08T09:00:00Z' },
      ];
      renderNotificationsPane();
      const pane = document.getElementById('notifications-pane');
      return {
        imgCount: pane.querySelectorAll('img').length,        // 0 attendu → payload neutralisé
        xssFired: !!window.__xss_fired,                       // false attendu
        showsNormal: pane.textContent.includes('Nouvelle publication'),
        showsEscaped: pane.textContent.includes('<img'),       // le payload apparaît en texte littéral
      };
    }, XSS);
    expect(res.imgCount).toBe(0);
    expect(res.xssFired).toBe(false);
    expect(res.showsNormal).toBe(true);   // les notifs légitimes s'affichent toujours
    expect(res.showsEscaped).toBe(true);  // le payload est visible comme texte, pas exécuté
  });

  test('H2 (#4) — liste des devis : client_nom / evt_lieu / prestations échappés', async ({ page }) => {
    await bootDemo(page);
    const res = await page.evaluate((payload) => {
      var devis = [{
        id: 'DV-XSS', numero: 'DEVIS-2026-9999', statut: 'brouillon',
        client_nom: payload, evt_lieu: payload, evt_date: null,
        montant_ht: 100, created_at: '2026-07-08T10:00:00Z',
        prestations: [{ intitule: payload }],
      }];
      var html = renderListeDevis(devis, [], {});   // STATUT_DEVIS={} → fallback interne
      var d = document.createElement('div'); d.innerHTML = html;
      return { imgCount: d.querySelectorAll('img').length, showsNumero: d.textContent.includes('DEVIS-2026-9999') };
    }, XSS);
    expect(res.imgCount).toBe(0);
    expect(res.showsNumero).toBe(true); // le devis s'affiche normalement
  });

  test('H3 (#5) — liste cours particuliers : email / tel échappés (texte + href)', async ({ page }) => {
    await bootDemo(page);
    const res = await page.evaluate((payload) => {
      var cp = [{
        id: 'CP-XSS', prenom: 'Test', nom: 'XSS',
        email: payload, tel: payload,
        created_at: '2026-07-08T10:00:00Z', statut: 'nouveau',
      }];
      var html = _renderCPListe(cp, {}, []);   // STATUTS={}, STATUTS_OPTS=[]
      var d = document.createElement('div'); d.innerHTML = html;
      return {
        imgCount: d.querySelectorAll('img').length,
        showsNom: d.textContent.includes('Test XSS'),
      };
    }, XSS);
    expect(res.imgCount).toBe(0);
    expect(res.showsNom).toBe(true);
  });
});
