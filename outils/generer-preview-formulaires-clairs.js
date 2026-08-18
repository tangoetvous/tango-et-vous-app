// Génère preview-formulaires-clairs-v1.html + preview-formulaires-clairs/*.html
// — les 3 formulaires publics encore SOMBRES (cours-essai, inscription-cours,
// stages-pwa) convertis en THÈME CLAIR, sans toucher aux fichiers sources.
//
// Méthode (règle « une maquette engage le code ») :
//  1. chaque formulaire RÉEL est rendu dans un navigateur (fixtures locales,
//     zéro réseau) et son DOM est capturé — la structure est donc exacte ;
//  2. une TABLE DE CORRESPONDANCE de couleurs (ci-dessous) est appliquée au
//     document capturé — c'est cette même table qui serait appliquée aux
//     fichiers sources si la maquette est validée ;
//  3. le header reste noir + or vif (identité), comme sur cours-particuliers.html
//     et demande-devis.html — ses règles CSS sont protégées de la conversion.
//
// Régénérer : node outils/generer-preview-formulaires-clairs.js
// (le serveur de test tests/server.js est démarré automatiquement)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const RACINE = path.join(__dirname, '..');
const DOSSIER_SORTIE = path.join(RACINE, 'preview-formulaires-clairs');
const BASE = 'http://127.0.0.1:8788';

// ────────────────────────────────────────────────────────────────
// Palette cible = celle de cours-particuliers.html (référence validée)
// ────────────────────────────────────────────────────────────────
// Fond page #faf8f4 · surface douce #f1ede5 · cartes #ffffff · relief #f5f2ec
// Or foncé (textes/boutons) #6e5100 · or moyen #8a6800 · bordure or #c4a060
// Or pâle (fonds sélection) #f5f0e4 · texte #1a1a1a · bordures #d5cec5

// Correspondances PARTAGÉES sombre → clair (hex sans #, minuscules)
const MAP_COMMUNE = {
  // Fonds
  '111': 'faf8f4', '0f0f0f': 'faf8f4', '141414': 'f1ede5',
  '1a1a1a': 'ffffff', '1e1e1e': 'ffffff',
  '222': 'e8e2d8', '2a2a2a': 'ded7cb', '333': 'd5cec5', '444': 'c0b8ac',
  // Textes clairs → foncés
  'fff': '1a1a1a', 'ffffff': '1a1a1a',
  'eee': '2a2a2a', 'ddd': '3a352c', 'ccc': '444444',
  'bbb': '4a453c', 'aaa': '555555', '999': '666666', '888': '6b655c',
  // Ors
  'd4af37': '6e5100', 'f0c030': '6e5100',
  'e8c84a': '8a6800', 'e8b020': '8a6800', 'c8a84a': '8a6800',
  'c09a28': '8a6800', 'b89030': '8a6800', 'a07830': '8a6800', 'a08050': '8a6800',
  'f5e4a0': '8a6800', 'ffdd88': '8a6800',
  '7a6030': 'a87e30', '7a6010': 'c4a060',
  '5a4500': 'c4a060', '5a4200': 'c4a060', '5a4000': 'c4a060', '5a4820': 'c4a060',
  // Fonds or sombre → or pâle
  '1f1a00': 'f5f0e4', '1a1500': 'f5f0e4', '151200': 'f5f0e4', '0f0d00': 'f5f0e4',
  '0a0800': 'f5f0e4', '100d00': 'f5f0e4', '080700': 'f5f0e4', '2e2200': 'e8ddbb',
  '261d00': 'f0e8cf', '2a2000': 'e8ddbb', '1e1500': 'f5f0e4', '251c00': 'f0e8cf',
  '2a1f00': 'f0e8cf', '1a1200': 'f5f0e4',
  // Rouges / alertes
  'ff6b6b': 'c62828', '1a0000': 'fdecec',
  'ffaa44': 'b45309', 'ff8800': 'c2410c',
  // Divers
  'f0f0f0': '2a2a2a', '8bc34a': '2e7d32', '2e5c00': '2e7d32',
  // Completes apres passe du verificateur (contextes relus dans les sources)
  '151515': 'f1ede5',                       // .part-zone (cours-essai)
  '0a1330': 'eef2fb',                       // .choix-btn bleu nuit (cours-essai)
  '3a0000': 'fdecec', '3a2000': 'fdf0e0',   // pastilles "complet" (cours-essai)
  '0c0900': 'f5f2ec', '0a0900': 'f5f0e4',   // .cadre / .role-auto (inscription)
  '0a1200': 'e8f5e9', '140000': 'fdecec',   // .pwa-badge / .errmsg (inscription)
};

// Correspondances SPÉCIFIQUES stages-pwa (violet partenaire + bleus récap)
const MAP_STAGES = {
  'c792ea': '6a1b9a', 'cbb6e8': '7d5c96', '1d1727': 'f5f0fa', '1a1622': 'f5f0fa',
  '0a1020': 'e8f0fd', '0a0a20': 'e8ecfa', '1a2a50': 'b8c6e8',
  '7aaaff': '2255cc', '7ec8e3': '0e7490', '5a8fa8': '2e6f8e',
  'a8d8ea': '1a5a75', '0a2a3a': 'bcd8e8',
  '161616': 'fbf8f0', '3a2f00': 'c4a060',   // zone inscripteur (doree)
  '17151c': 'f8f5fc', '4a3a63': 'a58cc8',   // zone partenaire (violette)
  '0a1a00': 'e8f5e9', '200800': 'fdf0e0', '0d0020': 'f0ecfa',  // pastilles type de stage
  '00101a': 'eef6fc', '001828': 'dcecf8', '001220': 'eef6fc',  // recapitulatif bleu
  // '6b1a1a' et 'f5ece0' (ecran de confirmation) volontairement NON convertis :
  // bloc rouge sombre auto-contraste, lisible tel quel sur fond clair.
};

// Règles COMPOSÉES appliquées avant la table (contexte : texte posé sur un
// bouton/badge or vif → l'or devient foncé, le texte noir devient blanc ;
// bandes noires de progression → fond de page clair). Le header, protégé,
// n'est pas concerné.
const REGLES_COMPOSEES = [
  { de: /color:\s*#000\b/gi, jeton: 'TXTBTN', vers: 'color:#fff' },
  { de: /color:\s*#111\b/gi, jeton: 'TXTBTN2', vers: 'color:#fff' },
  { de: /background:\s*#000\b/gi, jeton: 'FONDPROG', vers: 'background:#faf8f4' },
];

// rgba : voiles blancs → voiles noirs ; halos or vif → or foncé
function convertirRgba(html) {
  html = html.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([0-9.]+)\s*\)/gi, (m, a) => {
    const alpha = parseFloat(a);
    return alpha < 0.2 ? 'rgba(0,0,0,0.05)' : `rgba(0,0,0,${Math.min(0.75, alpha + 0.05).toFixed(2)})`;
  });
  html = html.replace(/rgba\(\s*212\s*,\s*175\s*,\s*55\s*,/gi, 'rgba(110,81,0,');
  html = html.replace(/rgba\(\s*240\s*,\s*192\s*,\s*48\s*,/gi, 'rgba(110,81,0,');
  return html;
}

// ────────────────────────────────────────────────────────────────
// Conversion d'un document capturé
// ────────────────────────────────────────────────────────────────
function convertir(html, mapSupplementaire) {
  const map = Object.assign({}, MAP_COMMUNE, mapSupplementaire || {});

  // 1. Protéger les règles CSS du header (noir + or vif conservés)
  const masques = [];
  html = html.replace(/(^|[\n{}])(\s*)((?:\.header|\.hdr|\.logo)[^{}]*)\{[^{}]*\}/g, (m, avant, esp, sel) => {
    masques.push(m.slice(avant.length));
    return avant + `M${masques.length - 1}`;
  });

  // 2. Règles composées → jetons (pour échapper à la table hex)
  REGLES_COMPOSEES.forEach(r => { html = html.replace(r.de, r.jeton); });

  // 3. Table hex — une seule passe simultanée (pas de chaînes de remplacement)
  const cles = Object.keys(map).sort((a, b) => b.length - a.length);
  const rx = new RegExp('#(' + cles.join('|') + ')\\b', 'gi');
  html = html.replace(rx, (m, hexa) => '#' + map[hexa.toLowerCase()]);

  // 4. rgba
  html = convertirRgba(html);

  // 5. Restaurer jetons puis header
  REGLES_COMPOSEES.forEach(r => { html = html.split(r.jeton).join(r.vers); });
  html = html.replace(/M(\d+)/g, (m, i) => masques[parseInt(i, 10)]);

  return html;
}

// Vérificateur : signale les fonds encore sombres / textes encore clairs
// restants APRÈS conversion (hors header) — chaque alerte = couleur à ajouter
// à la table ou à accepter en connaissance de cause.
function verifier(html, nom) {
  const lum = (hexa) => {
    let h = hexa.length === 3 ? hexa.split('').map(c => c + c).join('') : hexa;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const sansHeader = html.replace(/(?:\.header|\.hdr|\.logo)[^{}]*\{[^{}]*\}/g, '');
  const alertes = {};
  let m;
  const rxFond = /background(?:-color)?:\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  while ((m = rxFond.exec(sansHeader))) { if (lum(m[1]) < 0.45) alertes['fond sombre #' + m[1]] = (alertes['fond sombre #' + m[1]] || 0) + 1; }
  const rxTexte = /color:\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  while ((m = rxTexte.exec(sansHeader))) { if (lum(m[1]) > 0.78) alertes['texte clair #' + m[1]] = (alertes['texte clair #' + m[1]] || 0) + 1; }
  const lignes = Object.entries(alertes).map(([k, n]) => `    ${k} ×${n}`);
  if (lignes.length) console.log(`  ⚠ ${nom} — restes à vérifier :\n` + lignes.join('\n'));
  else console.log(`  ✓ ${nom} — aucun reste sombre/clair détecté`);
  return alertes;
}

function nettoyer(html) {
  // Les scripts ne doivent PAS se ré-exécuter dans la maquette statique
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]+challenges\.cloudflare[^>]*>/gi, '');
}

const SEPARATEUR_CSS = `
<style id="tev-preview-separateurs">
.tev-sep{margin:34px 0 18px;padding:7px 24px;background:#333;color:#fff;
  font:bold 12px/1.4 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;}
</style>`;

function noteBasDePage(nomSource) {
  return `<div style="margin-top:40px;padding:14px 24px;background:#1a3a1a;color:#c8e6c9;font:12px/1.6 Arial,sans-serif;">
MAQUETTE — thème clair appliqué au DOM réel de <b>${nomSource}</b> (structure et textes capturés tels quels,
seules les couleurs changent). Générée par <code>outils/generer-preview-formulaires-clairs.js</code>.</div>`;
}

// ────────────────────────────────────────────────────────────────
// Fixtures communes (dates relatives — règle du projet)
// ────────────────────────────────────────────────────────────────
function isoPlus(j) { const d = new Date(); d.setDate(d.getDate() + j); return d.toISOString().slice(0, 10); }
function saisonDe(iso) { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return (m >= 9 ? y : y - 1) + '-' + (m >= 9 ? y + 1 : y); }
function prochainJour(jourSemaine, decalage) { // 4=jeudi, 1=lundi
  const d = new Date(); d.setDate(d.getDate() + decalage);
  while (d.getDay() !== jourSemaine) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function serieHebdo(jourSemaine, n) {
  const out = []; let iso = prochainJour(jourSemaine, 7);
  for (let i = 0; i < n; i++) { out.push(iso); const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 7); iso = d.toISOString().slice(0, 10); }
  return out;
}

async function bloquerReseau(page) {
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE + '/')) return route.continue();
    if (u.includes('supabase.co')) return route.fulfill({
      status: 406, contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST116', message: '0 rows' }),
    });
    return route.abort();
  });
}

// ────────────────────────────────────────────────────────────────
// Captures
// ────────────────────────────────────────────────────────────────
// Certains formulaires répètent 67× « ↑ Remonter… » (remplissage volontaire
// pour l'iframe Wix) — une occurrence suffit dans la maquette, couleur inchangée.
async function reduireHintRemonter(page) {
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach(d => {
      const n = (d.innerHTML.match(/Remonter pour terminer/g) || []).length;
      if (n >= 3 && !d.querySelector('div')) {
        const fleche = d.querySelector('span');
        d.innerHTML = (fleche ? fleche.outerHTML : '↑') +
          ' Remonter pour terminer de remplir le formulaire <i style="opacity:.6">(répété ' + n + '× dans le vrai formulaire — tronqué ici)</i>';
      }
    });
  });
}

async function capturerCoursEssai(browser) {
  const page = await browser.newPage();
  const dates = { paris: serieHebdo(4, 5), vincennes: serieHebdo(1, 5) };
  await page.addInitScript((d) => { localStorage.setItem('tev_cours_dates', JSON.stringify(d)); }, dates);
  await bloquerReseau(page);
  await page.goto(BASE + '/cours-essai.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Parcours réel : Paris → Débutant → liste des dates → 1re date sélectionnée
  await page.evaluate(() => {
    const clic = (sel) => { const el = document.querySelector(sel); if (el) el.click(); };
    clic('#e1 .choix-btn');
    clic('#e2 .choix-btn');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const d = document.querySelector('#e3 .date-item'); if (d) d.click(); });
  await page.waitForTimeout(300);

  await reduireHintRemonter(page);
  // Toutes les étapes visibles, empilées avec un bandeau par étape
  await page.evaluate((sepCss) => {
    document.head.insertAdjacentHTML('beforeend', sepCss + '<style>.etape{display:block!important}.success{display:none!important}</style>');
    const libelles = { e1: 'Étape 1 — Ville', e2: 'Étape 2 — Niveau', e3: 'Étape 3 — Date', e4: 'Étape 4 — Vos informations' };
    document.querySelectorAll('.etape').forEach(et => {
      if (libelles[et.id]) et.insertAdjacentHTML('beforebegin', `<div class="tev-sep">${libelles[et.id]}</div>`);
    });
  }, SEPARATEUR_CSS);

  const html = await page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
  await page.close();
  return html;
}

async function capturerInscriptionCours(browser) {
  const page = await browser.newPage();
  await bloquerReseau(page);
  await page.goto(BASE + '/inscription-cours.html?mode=regulier', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof render === 'function' && !!document.getElementById('app'));
  await page.waitForTimeout(400);

  // 3 écrans réels capturés successivement puis empilés
  const etats = await page.evaluate(() => {
    const shot = [];
    const barre = () => { const b = document.querySelector('.prog-bar'); return b ? b.outerHTML : ''; };
    const app = () => document.getElementById('app').innerHTML;
    // Écran 1 — nombre de cours
    shot.push({ titre: 'Écran 1 — Nombre de cours', barre: barre(), app: app() });
    // Écran 2 — choix du cours (Paris sélectionné → niveaux affichés)
    S.nbCours = 1; S.step = 2; render(); pickVille(1, 'paris');
    shot.push({ titre: 'Écran 2 — Choix du cours (Paris sélectionné)', barre: barre(), app: app() });
    // Écran 3 — infos (rôle guideur → bloc partenaire)
    S.c1.niveau = 'debutant'; S.step = 3; render();
    try { if (typeof setVenue === 'function') setVenue(1, 'paris'); } catch (e) {}
    try { if (typeof setRole === 'function') setRole(1, 'guideur'); } catch (e) {}
    shot.push({ titre: 'Écran 3 — Vos informations (rôle choisi)', barre: barre(), app: app() });
    return shot;
  });

  await page.evaluate(([sepCss, etatsJson]) => {
    document.head.insertAdjacentHTML('beforeend', sepCss);
    const etats2 = JSON.parse(etatsJson);
    const bar = document.querySelector('.prog-bar'); if (bar) bar.style.display = 'none';
    document.getElementById('app').innerHTML = etats2
      .map(e => `<div class="tev-sep">${e.titre}</div>${e.barre}${e.app}`)
      .join('');
  }, [SEPARATEUR_CSS, JSON.stringify(etats)]);

  const html = await page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
  await page.close();
  return html;
}

async function capturerStages(browser) {
  const page = await browser.newPage();
  const D1 = isoPlus(14), D2 = isoPlus(21), SAI = saisonDe(D1);
  const DATES = { saison: SAI, stages: [
    { date: D1, label: 'Stage ' + D1, technique: true, nStages: 2, themes: ['Initiation', 'Séquence complexe'] },
    { date: D2, label: 'Stage ' + D2, technique: true, nStages: 2, themes: ['Ganchos', 'Sacadas'] },
  ] };
  const PARAMS = { horaires: { tech_deb: '15h30', tech_fin: '16h30', s1_deb: '14h', s1_fin: '15h30', s2_deb: '16h30', s2_fin: '18h' },
    adresse: { nom: 'Centre Kim Kan', rue: '6 rue Borrégo, Paris 20e' } };
  await page.addInitScript(([d, p, sai]) => {
    localStorage.setItem('tev_dates_stages_' + sai, JSON.stringify(d));
    localStorage.setItem('tev_params_stages_' + sai, JSON.stringify(p));
  }, [DATES, PARAMS, SAI]);
  await bloquerReseau(page);
  await page.goto(BASE + '/stages-pwa.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof majZonesCouple === 'function' && document.querySelectorAll('#accordionInscrit .stage-row').length > 0,
    null, { timeout: 25000 });

  // Étape 2 en couple (état par défaut « mêmes stages ») + 2 créneaux cochés
  await page.evaluate(() => {
    document.getElementById('prenom').value = 'Jeremy';
    document.getElementById('nom').value = 'BRAITBART';
    document.getElementById('email').value = 'j@test.fr';
    document.getElementById('telephone').value = '0600000000';
    state.role = 'Guideur(se)'; state.niveau = 'Intermédiaire'; state.situation = 'avec-partenaire';
    document.getElementById('partenaire-prenom').value = 'Florencia';
    document.getElementById('partenaire-nom').value = 'GARCIA';
    document.getElementById('recap-identite').textContent = 'Jeremy BRAITBART';
    majZonesCouple();
    const rows = document.querySelectorAll('#accordionInscrit .stage-row');
    if (rows[0]) rows[0].click();
    if (rows[1]) rows[1].click();
  });
  await page.waitForTimeout(400);

  await reduireHintRemonter(page);
  await page.evaluate((sepCss) => {
    document.head.insertAdjacentHTML('beforeend', sepCss + '<style>.etape{display:block!important}</style>');
    const e1 = document.getElementById('etape1'), e2 = document.getElementById('etape2');
    if (e1) e1.insertAdjacentHTML('beforebegin', '<div class="tev-sep">Étape 1 — Vos informations</div>');
    if (e2) e2.insertAdjacentHTML('beforebegin', '<div class="tev-sep">Étape 2 — Choix des stages (couple, 2 créneaux cochés)</div>');
  }, SEPARATEUR_CSS);

  const html = await page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
  await page.close();
  return html;
}

// ────────────────────────────────────────────────────────────────
// Page d'index
// ────────────────────────────────────────────────────────────────
function tableCouleurs(map) {
  const lignes = Object.entries(map)
    .map(([de, vers]) => `<tr><td><span class="pastille" style="background:#${de}"></span>#${de}</td>` +
      `<td>→</td><td><span class="pastille" style="background:#${vers}"></span>#${vers}</td></tr>`)
    .join('');
  return `<table class="tbl-couleurs"><tbody>${lignes}</tbody></table>`;
}

function pageIndex(fiches) {
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const sections = fiches.map(f => `
  <section id="${f.id}">
    <h2>${f.titre}</h2>
    <p class="notes">${f.notes}</p>
    <p><a class="lien-plein" href="preview-formulaires-clairs/${f.fichier}" target="_blank">↗ Ouvrir en pleine page</a></p>
    <iframe src="preview-formulaires-clairs/${f.fichier}" title="${f.titre}" loading="lazy"></iframe>
  </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maquette — Formulaires publics en thème clair</title>
<style>
body{font-family:Arial,sans-serif;background:#f0f0f5;color:#111;margin:0;padding:0 0 60px;}
.bandeau{background:#1a3a1a;color:#c8e6c9;padding:14px 22px;font-size:13px;line-height:1.6;}
.bandeau code{background:#0d260d;padding:2px 6px;border-radius:4px;}
main{max-width:960px;margin:0 auto;padding:0 16px;}
h1{font-size:22px;margin:26px 0 6px;}
h2{font-size:17px;margin:40px 0 6px;color:#7c5c00;}
.intro{font-size:14px;line-height:1.65;color:#333;background:#fff;border:1px solid #ccc;border-radius:10px;padding:14px 18px;}
.notes{font-size:13px;color:#444;line-height:1.6;}
iframe{width:100%;height:900px;border:2px solid #888;border-radius:10px;background:#faf8f4;}
.lien-plein{font-size:13px;color:#7c5c00;font-weight:bold;}
details{margin:14px 0;background:#fff;border:1px solid #ccc;border-radius:10px;padding:10px 16px;}
summary{font-size:14px;font-weight:bold;cursor:pointer;color:#7c5c00;}
.tbl-couleurs{border-collapse:collapse;font-size:12px;margin:10px 0;}
.tbl-couleurs td{padding:3px 8px;border-bottom:1px solid #eee;font-family:monospace;}
.pastille{display:inline-block;width:14px;height:14px;border-radius:4px;border:1px solid #999;vertical-align:-2px;margin-right:6px;}
.regle{background:#fff8e1;border:1px solid #e0c060;border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.6;margin:14px 0;}
</style>
</head>
<body>
<div class="bandeau">✅ <b>Page générée depuis le code réel</b> — chaque maquette ci-dessous est le DOM du vrai formulaire
(rendu dans un navigateur avec des données d'exemple), auquel seule une table de correspondance de couleurs a été appliquée.
Régénérer : <code>node outils/generer-preview-formulaires-clairs.js</code> · Générée le ${date}.</div>
<main>
<h1>Formulaires publics — conversion en thème clair (maquette de décision)</h1>
<div class="intro">
Les 3 formulaires encore en thème sombre sont présentés ici convertis en clair, sur le modèle validé de
<b>cours-particuliers.html</b> : fond crème <code>#faf8f4</code>, cartes blanches, <b>or foncé <code>#6e5100</code></b>
pour textes et boutons (l'or vif est illisible sur fond clair), <b>header conservé noir + or vif</b> (identité visuelle),
boutons principaux or foncé à texte blanc. <b>Seules les couleurs changent</b> — aucune structure, aucun texte,
aucune police modifiés → risque de casse minimal à l'application.
</div>
<div class="regle">📌 <b>Engagement</b> : si une maquette est validée, la conversion réelle appliquera <b>exactement la même
table de correspondance</b> au fichier source (CSS + couleurs générées par le JS), header exclu — le rendu final sera
celui affiché ici. Les tables sont dépliables sous chaque formulaire.</div>
${sections}
<details>
<summary>Table de correspondance commune (sombre → clair)</summary>
${tableCouleurs(MAP_COMMUNE)}
<p class="notes">Règles de contexte : <code>color:#000</code> (texte sur bouton/badge or) → <code>#fff</code> ·
<code>background:#000</code> (barres de progression) → <code>#faf8f4</code> · voiles <code>rgba(255,255,255,…)</code> →
<code>rgba(0,0,0,…)</code> · halos <code>rgba(212,175,55,…)</code> → <code>rgba(110,81,0,…)</code> ·
règles CSS du header (<code>.header</code>/<code>.hdr</code>/<code>.logo</code>) : <b>inchangées</b>.</p>
</details>
<details>
<summary>Table complémentaire stages-pwa (violet partenaire + bleus récap)</summary>
${tableCouleurs(MAP_STAGES)}
</details>
</main>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────
async function main() {
  // Serveur de test (réutilisé s'il tourne déjà)
  let serveur = null;
  const dejaLa = await fetch(BASE + '/admin.html').then(r => r.ok).catch(() => false);
  if (!dejaLa) {
    serveur = spawn('node', [path.join(RACINE, 'tests', 'server.js')], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 800));
  }

  const browser = await chromium.launch();
  fs.mkdirSync(DOSSIER_SORTIE, { recursive: true });

  const fiches = [
    { id: 'cours-essai', source: 'cours-essai.html', fichier: 'cours-essai-clair.html',
      titre: '1 · cours-essai.html — Cours d’essai tango',
      map: null, capture: capturerCoursEssai,
      notes: 'Les 4 étapes sont empilées (bandeaux gris). Parcours capturé : Paris → Débutant → 1re date sélectionnée. ' +
        'Les cases sélectionnées passent sur fond or pâle, les boutons « Continuer » en or foncé/texte blanc.' },
    { id: 'inscription-cours', source: 'inscription-cours.html', fichier: 'inscription-cours-clair.html',
      titre: '2 · inscription-cours.html — Inscription cours réguliers',
      map: null, capture: capturerInscriptionCours,
      notes: '3 écrans empilés : nombre de cours, choix du cours (Paris sélectionné), informations (rôle choisi). ' +
        'Ce formulaire utilise des variables CSS : la conversion réelle se ferait surtout dans son bloc :root.' },
    { id: 'stages', source: 'stages-pwa.html', fichier: 'stages-pwa-clair.html',
      titre: '3 · stages-pwa.html — Inscription aux stages',
      map: MAP_STAGES, capture: capturerStages,
      notes: 'Étapes 1 et 2 empilées, en couple avec 2 créneaux cochés (zones dorée/violette visibles). ' +
        'Les bleus du récapitulatif et le violet partenaire ont leur table dédiée (dépliable en bas de page).' },
  ];

  for (const f of fiches) {
    console.log('▶ ' + f.source);
    let html = await f.capture(browser);
    html = nettoyer(html);
    html = convertir(html, f.map);
    html = html.replace('</body>',
      '<style id="tev-header-identite">.hdr{border-bottom-color:#D4AF37}.hdr-logo{color:#D4AF37}.hdr-sub{color:#e8e0c8}</style>'
      + noteBasDePage(f.source) + '</body>');
    verifier(html, f.source);
    fs.writeFileSync(path.join(DOSSIER_SORTIE, f.fichier), html);
    console.log('  → preview-formulaires-clairs/' + f.fichier + ' (' + Math.round(html.length / 1024) + ' Ko)');
  }

  fs.writeFileSync(path.join(RACINE, 'preview-formulaires-clairs-v1.html'), pageIndex(fiches));
  console.log('→ preview-formulaires-clairs-v1.html');

  await browser.close();
  if (serveur) serveur.kill();
}

main().catch(e => { console.error(e); process.exit(1); });
