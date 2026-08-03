// Groupe X — Stages : couple « mêmes stages » (défaut) ou stages différents (2026-07-29)
// Par défaut la case est décochée → un seul encadré, la sélection de l'inscripteur
// est recopiée pour le partenaire. Cochée → second encadré, sélections indépendantes.
// ⚠️ Ne soumet JAMAIS le formulaire (écriture réelle en base) — on teste l'état interne.
const { test, expect } = require('@playwright/test');

// Dates de stage contrôlées (2 dates suffisent, 3 créneaux chacune)
const DATES = {
  saison: '2025-2026',
  stages: [
    { date: '2026-08-01', label: 'Sam. 1 Août 2026', technique: true, nStages: 2, themes: ['Initiation', 'Séquence complexe'] },
    { date: '2026-08-08', label: 'Sam. 8 Août 2026', technique: true, nStages: 2, themes: ['Ganchos', 'Sacadas'] },
  ],
};
const PARAMS = { horaires: { tech_deb:'15h30', tech_fin:'16h30', s1_deb:'14h', s1_fin:'15h30', s2_deb:'16h30', s2_fin:'18h' } };

async function bootForm(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(([d, p]) => {
    localStorage.setItem('tev_dates_stages_2025-2026', JSON.stringify(d));
    localStorage.setItem('tev_params_stages_2025-2026', JSON.stringify(p));
  }, [DATES, PARAMS]);
  // ⚠️ Ne PAS bloquer Supabase : le formulaire attend la réponse de la synchro
  // au DOMContentLoaded ; une requête avortée fige l'initialisation (accordéons
  // jamais construits). On répond « 0 ligne » → repli immédiat sur localStorage.
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:8788/')) return route.continue();
    if (u.includes('supabase.co')) return route.fulfill({
      status: 406, contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST116', message: '0 rows' }),
    });
    return route.abort();
  });
  await page.goto('/stages-pwa.html', { waitUntil: 'domcontentloaded' });
  // Attendre que les accordéons soient RÉELLEMENT construits (précondition des
  // clics de créneaux) — plus fiable que DATES_STAGES, la synchro Supabase
  // bloquée par le routage pouvant retarder le rendu.
  await page.waitForFunction(
    () => typeof majZonesCouple === 'function'
      && document.querySelectorAll('#accordionInscrit .stage-row').length > 0
      && document.querySelectorAll('#accordionPartenaire .stage-row').length > 0,
    null, { timeout: 25000 });
  return errors;
}

// Passe à l'étape 2 en simulant l'état de l'étape 1 (sans cliquer tous les champs)
async function allerEtape2(page, avecPartenaire) {
  await page.evaluate((avec) => {
    document.getElementById('prenom').value = 'Jeremy';
    document.getElementById('nom').value = 'BRAITBART';
    document.getElementById('email').value = 'j@test.fr';
    document.getElementById('telephone').value = '0600000000';
    state.role = 'Guideur(se)';
    state.niveau = 'Intermédiaire';
    state.situation = avec ? 'avec-partenaire' : 'seul';
    if (avec) {
      document.getElementById('partenaire-prenom').value = 'Florencia';
      document.getElementById('partenaire-nom').value = 'GARCIA';
    }
    // Bascule directe vers l'étape 2 (la validation de l'étape 1 n'est pas l'objet du test)
    document.getElementById('recap-identite').textContent = 'Jeremy BRAITBART';
    majZonesCouple();
    document.getElementById('etape1').classList.remove('active');
    document.getElementById('etape2').classList.add('active');
  }, avecPartenaire);
}

// Coche un créneau chez l'inscripteur (1re date, 1er créneau non passé)
async function cocherCreneau(page, groupe, idx) {
  await page.evaluate(([g, i]) => {
    const cont = document.getElementById(g === 'inscrit' ? 'accordionInscrit' : 'accordionPartenaire');
    const rows = cont.querySelectorAll('.stage-row');
    rows[i].click();
  }, [groupe, idx]);
}

test.describe('Groupe X — Stages : couple mêmes stages / stages différents', () => {

  test('X1 — personne seule : pas de case à cocher, pas de bloc partenaire', async ({ page }) => {
    const errors = await bootForm(page);
    await allerEtape2(page, false);
    const res = await page.evaluate(() => ({
      caseVisible: getComputedStyle(document.getElementById('diff-box')).display !== 'none',
      blocPart: getComputedStyle(document.getElementById('bloc-stages-partenaire')).display !== 'none',
      explVisible: getComputedStyle(document.getElementById('expl-stages-communs')).display !== 'none',
      hdr: document.getElementById('label-stages-inscrit').textContent,
    }));
    expect(errors).toEqual([]);
    expect(res.caseVisible).toBe(false);
    expect(res.blocPart).toBe(false);
    expect(res.explVisible).toBe(false);
    expect(res.hdr).toContain('Vos stages');
  });

  test('X2 — couple, case décochée : un seul encadré, prénoms affichés, sélection recopiée', async ({ page }) => {
    const errors = await bootForm(page);
    await allerEtape2(page, true);
    const avant = await page.evaluate(() => ({
      caseVisible: getComputedStyle(document.getElementById('diff-box')).display !== 'none',
      blocPart: getComputedStyle(document.getElementById('bloc-stages-partenaire')).display !== 'none',
      hdr: document.getElementById('label-stages-inscrit').textContent,
      label: document.getElementById('diff-label').textContent,
      diff: state.stagesDifferents,
    }));
    expect(errors).toEqual([]);
    expect(avant.caseVisible).toBe(true);      // la case existe (couple)
    expect(avant.blocPart).toBe(false);        // …mais pas de second encadré
    expect(avant.hdr).toContain('Jeremy');     // en-tête personnalisé
    expect(avant.hdr).toContain('Florencia');
    expect(avant.label).toContain('Florencia ne fait pas les mêmes stages');
    expect(avant.diff).toBe(false);            // défaut = mêmes stages

    await cocherCreneau(page, 'inscrit', 0);
    const apres = await page.evaluate(() => ({
      insc: Array.from(state.stagesInscrit.keys()),
      part: Array.from(state.stagesPartenaire.keys()),
    }));
    expect(apres.insc.length).toBe(1);
    expect(apres.part).toEqual(apres.insc);    // recopié automatiquement
  });

  test('X3 — cocher la case : second encadré + sélection de départ recopiée et visible', async ({ page }) => {
    await bootForm(page);
    await allerEtape2(page, true);
    await cocherCreneau(page, 'inscrit', 0);
    await page.evaluate(() => toggleStagesDifferents());
    const res = await page.evaluate(() => ({
      diff: state.stagesDifferents,
      blocPart: getComputedStyle(document.getElementById('bloc-stages-partenaire')).display !== 'none',
      explVisible: getComputedStyle(document.getElementById('expl-stages-communs')).display !== 'none',
      part: Array.from(state.stagesPartenaire.keys()),
      insc: Array.from(state.stagesInscrit.keys()),
      // la recopie doit être VISIBLE dans l'accordéon reconstruit
      rowsSel: document.querySelectorAll('#accordionPartenaire .stage-row.selected').length,
      hdrI: document.getElementById('label-stages-inscrit').textContent,
      hdrP: document.getElementById('label-stages-partenaire').textContent,
    }));
    expect(res.diff).toBe(true);
    expect(res.blocPart).toBe(true);
    expect(res.explVisible).toBe(false);       // la phrase « mêmes stages » disparaît
    expect(res.part).toEqual(res.insc);        // point de départ = copie
    expect(res.rowsSel).toBe(1);               // et c'est visible à l'écran
    expect(res.hdrI).not.toContain('Florencia'); // l'en-tête redevient « Vos stages — Jeremy »
    expect(res.hdrP).toContain('Florencia');
  });

  test('X4 — stages différents : les deux sélections deviennent indépendantes', async ({ page }) => {
    await bootForm(page);
    await allerEtape2(page, true);
    await cocherCreneau(page, 'inscrit', 0);
    await page.evaluate(() => toggleStagesDifferents());
    // Le partenaire retire son créneau et en prend un autre
    await cocherCreneau(page, 'partenaire', 0);
    await cocherCreneau(page, 'partenaire', 1);
    const res = await page.evaluate(() => ({
      insc: Array.from(state.stagesInscrit.keys()),
      part: Array.from(state.stagesPartenaire.keys()),
    }));
    expect(res.insc.length).toBe(1);
    expect(res.part.length).toBe(1);
    expect(res.part).not.toEqual(res.insc);    // sélections bien distinctes
  });

  test('X5 — décocher : on revient à une sélection commune (partenaire re-synchronisé)', async ({ page }) => {
    await bootForm(page);
    await allerEtape2(page, true);
    await cocherCreneau(page, 'inscrit', 0);
    await page.evaluate(() => toggleStagesDifferents());
    await cocherCreneau(page, 'partenaire', 1);   // le partenaire diverge
    await page.evaluate(() => toggleStagesDifferents()); // puis on décoche
    const res = await page.evaluate(() => ({
      diff: state.stagesDifferents,
      blocPart: getComputedStyle(document.getElementById('bloc-stages-partenaire')).display !== 'none',
      insc: Array.from(state.stagesInscrit.keys()),
      part: Array.from(state.stagesPartenaire.keys()),
    }));
    expect(res.diff).toBe(false);
    expect(res.blocPart).toBe(false);
    expect(res.part).toEqual(res.insc);        // re-synchronisé
  });

  test('X6 — validation étape 2 : mode « mêmes stages » n\'exige pas de saisie partenaire', async ({ page }) => {
    await bootForm(page);
    await allerEtape2(page, true);
    await cocherCreneau(page, 'inscrit', 0);
    const res = await page.evaluate(() => {
      const ok = validerEtape2();
      return {
        ok,
        errPart: document.getElementById('err-stages-part').classList.contains('visible'),
        part: state.stagesPartenaire.size,
      };
    });
    expect(res.ok).toBe(true);       // validé alors que le partenaire n'a rien saisi lui-même
    expect(res.errPart).toBe(false);
    expect(res.part).toBe(1);        // sa sélection existe bien (recopiée) → insert correct
  });
});
