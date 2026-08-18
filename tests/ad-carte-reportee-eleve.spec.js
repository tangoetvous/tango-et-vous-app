// Groupe AD — Carte reportée dans l'espace élève (2026-08-18)
// Maquette validée : preview-carte-reportee-v1.html. Une carte reportée EN ATTENTE
// de son premier cours affiche « ↩ Reportée », 0/N, « validité calculée à votre
// premier cours », sans bouton de pointage ni de renouvellement. Hors report,
// l'affichage historique doit rester STRICTEMENT inchangé.
const { test, expect } = require('@playwright/test');
const { bootEleve } = require('./helpers');

// ⚠️ Fixtures RELATIVES à la date d'exécution (règle du projet : jamais de dates
// figées). La saison courante côté Node = celle de la page (_saisonCourante).
const _now = new Date();
const _m = _now.getMonth() + 1, _y = _now.getFullYear();
const SC   = _m >= 9 ? _y + '-' + (_y + 1) : (_y - 1) + '-' + _y;   // saison courante
const Y1   = parseInt(SC.slice(0, 4), 10);
const PREV = (Y1 - 1) + '-' + Y1;                                   // saison précédente
const iso  = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

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
    res.accueilText = acc ? acc.textContent : '';
    res.accueilHTML = acc ? acc.innerHTML : '';
    res.titre = (document.getElementById('carte-section-title') || {}).textContent || '';
    res.gaugeUsed = (document.getElementById('gauge-used') || {}).textContent || '';
    res.gaugeRemaining = (document.getElementById('gauge-remaining') || {}).textContent || '';
    res.badge = (function(b){ return b && b.style.display !== 'none' ? b.textContent : ''; })(document.getElementById('expiration-badge'));
    res.btnPointe = (function(b){ return b ? b.style.display : 'absent'; })(document.getElementById('btn-je-pointe'));
    res.btnRenew  = (function(b){ return b ? b.style.display : 'absent'; })(document.getElementById('btn-renew-carte-self'));
    res.encart = (function(d){ return d ? d.textContent : ''; })(document.getElementById('carte-report-info'));
    res.valLbl = (document.getElementById('carte-validite-label') || {}).textContent || '';
    return res;
  }, build.toString());
}

// Élève reporté : ancienne carte 6/10 expirée sur la fiche, report de 4 cours
// pour la saison courante, pas encore redémarré.
const buildReporte = (sc) => {
  var y1 = parseInt(sc.slice(0, 4), 10), prev = (y1 - 1) + '-' + y1;
  return {
    eleve: { id: 42, prenom: 'Sophie', nom: 'DEMO', email: 's@demo.fr', niveau: 'debutant', ville: 'paris' },
    // Ancienne carte de la saison précédente : achat au printemps (avant le
    // 1er septembre de la saison courante), expiration passée.
    carte: { type: 'carte10', coursUtilises: 6, coursRestants: 4, dateAchat: y1 + '-03-05', dateExpiration: y1 + '-07-15', statut: 'Active', paye: true, numero: 2, dureeMois: 3 },
    inscriptionsTango: [
      { statut: 'inscrit', saison: sc, ville: 'paris', niveau: 'debutant', type: 'carte10',
        donnees: { isReport: true, reportedRestants: 4, saisonOrigine: prev } },
    ],
    nbCoursInscrits: 1, hasVincennes: false, soranoPayé: false, coursYoga: [], notifications: [], presences: [],
  };
};

test.describe('Groupe AD — Carte reportée (espace élève)', () => {
  test.beforeEach(async ({ page }) => { await bootEleve(page); });

  test('AD1 — état reporté : badge, 0/N, pas de dates, encart, boutons masqués', async ({ page }) => {
    const r = await renderEleve(page, buildReporte);
    expect(r.errors).toEqual([]);
    // Accueil
    expect(r.accueilText).toContain('Reportée de la saison ' + PREV);
    expect(r.accueilText).toContain('cours vous attendent');
    expect(r.accueilText).not.toContain('Expirée');
    expect(r.accueilText).not.toContain('Commencer une nouvelle carte');
    expect(r.accueilText).not.toContain('Je pointe ma présence');
    // Onglet Carte
    expect(r.titre).toContain('reportée de ' + PREV);
    expect(r.gaugeUsed).toBe('0');
    expect(r.gaugeRemaining).toBe('4');
    expect(r.badge).toBe('');                                   // jamais « Expirée »
    expect(r.btnPointe).toBe('none');
    expect(r.btnRenew).toBe('none');
    expect(r.encart).toContain('Vos 4 cours vous attendent');
    expect(r.valLbl).toContain('calculée à votre premier cours');
  });

  test('AD2 — carte redémarrée (1er cours pointé) : retour à l\'affichage normal', async ({ page }) => {
    const r = await renderEleve(page, (sc) => ({
      eleve: { id: 42, prenom: 'Sophie', nom: 'DEMO', email: 's@demo.fr', niveau: 'debutant', ville: 'paris' },
      // La fiche a redémarré : achat récent (dans la saison courante),
      // expiration future — dates relatives pour rester vraies toute l'année.
      carte: (function () {
        var a = new Date(), e = new Date(); e.setDate(e.getDate() + 60);
        return { type: 'carte10', coursUtilises: 1, coursRestants: 3,
                 dateAchat: a.toISOString().slice(0, 10), dateExpiration: e.toISOString().slice(0, 10),
                 statut: 'Active', paye: true, numero: 2, dureeMois: 3 };
      })(),
      inscriptionsTango: [
        { statut: 'inscrit', saison: sc, ville: 'paris', niveau: 'debutant', type: 'carte10',
          donnees: { isReport: true, reportedRestants: 4, saisonOrigine: '2024-2025' } },
      ],
      nbCoursInscrits: 1, hasVincennes: false, soranoPayé: false, coursYoga: [], notifications: [], presences: [],
    }));
    expect(r.errors).toEqual([]);
    expect(r.accueilText).not.toContain('Reportée de la saison');
    expect(r.accueilText).toContain('Je pointe ma présence');   // pointage auto de retour
    expect(r.gaugeUsed).toBe('1');
    expect(r.gaugeRemaining).toBe('3');
    expect(r.encart).toBe('');                                  // encart retiré au re-render
  });

  test('AD3 — non-régression : carte NORMALE rendue à l\'identique, octet pour octet', async ({ page }) => {
    // Le même élève, sans ligne isReport : le HTML de l'accueil doit être
    // strictement identique avant/après le correctif. On compare le rendu avec
    // détection active vs détection neutralisée — toute différence = régression.
    const diff = await page.evaluate(() => {
      var sc = _saisonCourante();
      eleveData = {
        eleve: { id: 7, prenom: 'Norma', nom: 'DEMO', email: 'n@demo.fr', niveau: 'debutant', ville: 'paris' },
        carte: { type: 'carte10', coursUtilises: 2, coursRestants: 6, dateAchat: '2026-01-08', dateExpiration: '2026-05-08', statut: 'Active', paye: true, numero: 1, dureeMois: 4 },
        inscriptionsTango: [ { statut: 'inscrit', saison: sc, ville: 'paris', niveau: 'debutant', type: 'carte10', donnees: {} } ],
        nbCoursInscrits: 1, hasVincennes: false, soranoPayé: false, coursYoga: [], notifications: [], presences: [],
      };
      renderAccueil(); renderDashboard();
      var avec = document.getElementById('accueil-pane').innerHTML
        + '|' + (document.getElementById('carte-section-title') || {}).textContent
        + '|' + (document.getElementById('btn-je-pointe') || {}).style.display
        + '|' + (document.getElementById('expiration-badge') || {}).textContent;
      var orig = _carteReportEnAttente;
      _carteReportEnAttente = function () { return null; };     // détection neutralisée
      renderAccueil(); renderDashboard();
      _carteReportEnAttente = orig;
      var sans = document.getElementById('accueil-pane').innerHTML
        + '|' + (document.getElementById('carte-section-title') || {}).textContent
        + '|' + (document.getElementById('btn-je-pointe') || {}).style.display
        + '|' + (document.getElementById('expiration-badge') || {}).textContent;
      return avec === sans ? '' : 'DIFFÉRENT';
    });
    expect(diff).toBe('');
  });

  test('AD4 — ceintures : renouvellement et pointage auto refusés en état reporté', async ({ page }) => {
    await renderEleve(page, buildReporte);
    const r = await page.evaluate(async () => {
      var alerts = [];
      var origAlert = window.alert; window.alert = function (m) { alerts.push(String(m)); };
      var carteAvant = JSON.stringify(eleveData.carte);
      try { await renewCarteSelf(); } catch (e) { alerts.push('ERR renew: ' + e.message); }
      try { ouvrirModalPointerSelf(); } catch (e) { alerts.push('ERR pointer: ' + e.message); }
      window.alert = origAlert;
      var modal = document.getElementById('modal-pointer-self');
      return {
        alerts: alerts,
        carteIntacte: JSON.stringify(eleveData.carte) === carteAvant,
        modalOuvert: !!(modal && modal.style.display === 'flex'),
      };
    });
    expect(r.alerts.length).toBe(2);                            // les deux gardes ont parlé
    expect(r.alerts.join(' ')).toContain('redémarrera');
    expect(r.carteIntacte).toBe(true);                          // rien n'a été écrasé
    expect(r.modalOuvert).toBe(false);                          // pas de modal de pointage
  });
});
