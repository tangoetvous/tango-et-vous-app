// Groupe R — Stages : les horaires doivent venir des PARAMÈTRES admin
// (override par date → horaires de saison), jamais des défauts codés
// (14h–15h / 15h–16h30 / 16h30–18h).
// Régression du fix 2026-07-17 : synchro Supabase des params 2 saisons +
// résolution des params PAR DATE dans chargerDonnees.
//
// ⚠️ Dates RELATIVES à aujourd'hui : des dates figées finissent par tomber dans
// le passé et le formulaire les filtre (il n'affiche que les 3 prochaines) —
// c'est ce qui a fait échouer R3 le 2026-08-03, avec un stage daté du 1er août.
const { test, expect } = require('@playwright/test');

function isoPlus(jours) {
  const d = new Date(); d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}
function saisonDe(iso) {
  const y = parseInt(iso.slice(0, 4)), m = parseInt(iso.slice(5, 7));
  return (m >= 9 ? y : y - 1) + '-' + (m >= 9 ? y + 1 : y);
}
// Regroupe des dates par saison → { '2026-2027': [dates…], … }
function parSaison(dates) {
  const out = {};
  dates.forEach(d => { (out[saisonDe(d)] = out[saisonDe(d)] || []).push(d); });
  return out;
}
function stageItem(date) {
  return { date, label: 'Stage ' + date, technique: true, nStages: 2, themes: ['', ''] };
}
// Horaires ADMIN volontairement distincts des défauts codés
const HOR_ADMIN = { tech_deb:'14h30', tech_fin:'15h30', s1_deb:'15h30', s1_fin:'17h', s2_deb:'17h', s2_fin:'18h30' };

test.describe('Groupe R — Stages horaires par saison', () => {

  test('R1 — horaires lus depuis les params admin de la saison (pas les défauts)', async ({ page }) => {
    const d1 = isoPlus(30);
    const sai = saisonDe(d1);
    await page.addInitScript(([date, s]) => {
      localStorage.setItem('tev_dates_stages_' + s, JSON.stringify({ saison: s, stages: [
        { date, label: 'Stage ' + date, nStages: 2, technique: true, themes: ['', ''] }] }));
      localStorage.setItem('tev_params_stages_' + s, JSON.stringify({
        horaires: { tech_deb:'11h', tech_fin:'12h', s1_deb:'12h', s1_fin:'13h', s2_deb:'13h', s2_fin:'14h' },
        adresse: { nom: 'Lieu Test', rue: '1 rue Test' },
      }));
    }, [d1, sai]);
    await page.route('**/*', route => {
      const u = route.request().url();
      (u.includes('127.0.0.1:8788') || u.includes('localhost:8788')) ? route.continue() : route.abort();
    });
    await page.goto('/stages-pwa.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const res = await page.evaluate(() => {
      // Appel manuel : réseau coupé, la synchro du DOMContentLoaded ne se termine pas
      if (typeof chargerDonnees === 'function') chargerDonnees();
      const d = (typeof DATES_STAGES !== 'undefined' && DATES_STAGES[0]) || null;
      if (!d) return { ok: false };
      const map = {}; d.stages.forEach(s => { map[s.type] = s.horaire; });
      return { ok: true, date: d.date, tech: map.technique, s1: map.stage1, s2: map.stage2, adr: (d.adresse && d.adresse.nom) || '' };
    });

    expect(res.ok).toBe(true);
    expect(res.date).toBe(d1);
    // Horaires ADMIN (11h–12h…), surtout PAS les défauts 14h–15h / 15h–16h30 / 16h30–18h
    expect(res.tech).toBe('11h–12h');
    expect(res.s1).toBe('12h–13h');
    expect(res.s2).toBe('13h–14h');
    expect(res.adr).toBe('Lieu Test');
  });

  test('R2 — appareil vierge : synchro Supabase (mockée) → horaires admin affichés', async ({ page }) => {
    // Chaîne COMPLÈTE sur localStorage vide : la synchro DOMContentLoaded doit
    // récupérer dates + params depuis Supabase, puis chargerDonnees doit afficher
    // les horaires ADMIN — pas les défauts codés.
    const dates = [isoPlus(30), isoPlus(37), isoPlus(44)];
    const groupes = parSaison(dates);
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.includes('127.0.0.1:8788') || u.includes('localhost:8788')) return route.continue();
      if (u.includes('supabase.co/rest/v1/parametres')) {
        let body = null;
        for (const s of Object.keys(groupes)) {
          if (u.includes('tev_dates_stages_' + s)) body = { valeur: { saison: s, stages: groupes[s].map(stageItem) } };
          else if (u.includes('tev_params_stages_' + s)) body = { valeur: { horaires: HOR_ADMIN } };
        }
        if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        // clé absente → PostgREST .single() 0 ligne
        return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: '0 rows' }) });
      }
      return route.abort();
    });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/stages-pwa.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500); // laisser la synchro async se terminer

    const res = await page.evaluate((saisons) => {
      const d = (typeof DATES_STAGES !== 'undefined' && DATES_STAGES[0]) || null;
      const ls = saisons.every(s => !!localStorage.getItem('tev_dates_stages_' + s));
      if (!d) return { ls, count: 0 };
      const map = {}; d.stages.forEach(s => { map[s.type] = s.horaire; });
      return { ls, count: DATES_STAGES.length, first: d.date, tech: map.technique, s1: map.stage1, s2: map.stage2 };
    }, Object.keys(groupes));

    expect(errors).toEqual([]);
    expect(res.ls).toBe(true);      // synchro des dates écrite en localStorage
    expect(res.count).toBe(3);
    expect(res.first).toBe(dates[0]);
    expect(res.tech).toBe('14h30–15h30');
    expect(res.s1).toBe('15h30–17h');
    expect(res.s2).toBe('17h–18h30');
  });

  test('R3 — liste mélangeant 2 saisons : chaque stage garde les horaires de SA saison', async ({ page }) => {
    // Scénario réel du bug (2026-07-17) : en été la liste mélange deux saisons
    // (ex. 1er août = saison N, 19 sept = saison N+1). AVANT le fix, les horaires
    // de la saison du 1er stage s'appliquaient à TOUTES les dates.
    const dProche = isoPlus(3);
    const dLoin1  = isoPlus(60);
    const dLoin2  = isoPlus(67);
    const saiProche = saisonDe(dProche), saiLoin = saisonDe(dLoin1);
    test.skip(saiProche === saiLoin || saisonDe(dLoin2) !== saiLoin,
      'Scénario propre à la bascule de saison (juillet-août) — non reproductible à cette date');

    const HOR_PERSO      = { s1_deb:'14h', s1_fin:'15h30', tech_deb:'15h30', tech_fin:'16h30', s2_deb:'16h30', s2_fin:'18h' };
    const HOR_SAI_PROCHE = { tech_deb:'13h', tech_fin:'14h', s1_deb:'14h', s1_fin:'15h30', s2_deb:'15h30', s2_fin:'17h' };

    await page.addInitScript(([dp, dl1, dl2, sp, sl, hPerso, hProche, hLoin]) => {
      localStorage.setItem('tev_dates_stages_' + sp, JSON.stringify({ saison: sp, stages: [
        { date: dp, label: 'Stage ' + dp, technique: true, nStages: 2, themes: ['', ''], horaires: hPerso }] }));
      localStorage.setItem('tev_dates_stages_' + sl, JSON.stringify({ saison: sl, stages: [
        { date: dl1, label: 'Stage ' + dl1, technique: true, nStages: 2, themes: ['', ''] },
        { date: dl2, label: 'Stage ' + dl2, technique: true, nStages: 2, themes: ['', ''] }] }));
      localStorage.setItem('tev_params_stages_' + sp, JSON.stringify({ horaires: hProche }));
      localStorage.setItem('tev_params_stages_' + sl, JSON.stringify({ horaires: hLoin }));
    }, [dProche, dLoin1, dLoin2, saiProche, saiLoin, HOR_PERSO, HOR_SAI_PROCHE, HOR_ADMIN]);

    await page.route('**/*', route => {
      const u = route.request().url();
      (u.includes('127.0.0.1:8788') || u.includes('localhost:8788')) ? route.continue() : route.abort();
    });
    await page.goto('/stages-pwa.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const res = await page.evaluate(() => {
      if (typeof chargerDonnees === 'function') chargerDonnees();
      return DATES_STAGES.map(d => {
        const map = {}; d.stages.forEach(s => { map[s.type] = s.horaire; });
        return { date: d.date, tech: map.technique, s1: map.stage1, s2: map.stage2 };
      });
    });

    expect(res.length).toBe(3);
    // Date proche : horaires PERSONNALISÉS de la date (prioritaires sur sa saison)
    expect(res[0].date).toBe(dProche);
    expect(res[0].s1).toBe('14h–15h30');
    expect(res[0].tech).toBe('15h30–16h30');
    // Saison suivante : SES horaires à elle, pas ceux de la saison proche
    expect(res[1].date).toBe(dLoin1);
    expect(res[1].tech).toBe('14h30–15h30');
    expect(res[1].s1).toBe('15h30–17h');
    expect(res[1].s2).toBe('17h–18h30');
    expect(res[2].date).toBe(dLoin2);
    expect(res[2].tech).toBe('14h30–15h30');
  });
});
