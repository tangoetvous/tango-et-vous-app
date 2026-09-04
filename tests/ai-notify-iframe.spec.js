// Groupe AI — Les notifications ne doivent jamais être « lancées et oubliées » (2026-09-04)
// Bug réel : « Inscriptions Tango → Nouvelle demande » ouvre le formulaire public
// dans une fenêtre intégrée. À la validation, le formulaire prévenait l'admin, qui
// changeait de sous-onglet et retirait la fenêtre du DOM — annulant la requête
// d'envoi encore en vol. L'inscription était enregistrée, mais ni email ni push.
// Correctif : envoi attendu (borné) + keepalive, AVANT de prévenir l'admin.
// + bouton « ✉️ Renvoyer l'email » sur chaque fiche d'inscription.
const { test, expect } = require('@playwright/test');
const { bootDemo } = require('./helpers');
const fs = require('fs');
const path = require('path');

// Les 5 formulaires publics ouverts en fenêtre intégrée depuis l'admin.
// (demande-devis.html n'y figure pas : son envoi est déjà attendu — c'est
// l'enregistrement lui-même, pas une notification annexe.)
const FORMULAIRES = ['inscription-cours.html', 'cours-essai.html', 'stages-pwa.html', 'essai-yoga.html', 'cours-particuliers.html'];
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test.describe('Groupe AI — Envoi des notifications depuis une fenêtre intégrée', () => {

  test('AI1 — les 4 formulaires attendent l\'envoi et utilisent keepalive', async () => {
    for (const f of FORMULAIRES) {
      const src = lire(f);
      expect(src, f + ' : helper _tevNotify absent').toContain('async function _tevNotify(');
      expect(src, f + ' : keepalive absent').toContain('keepalive: true');
      // plus aucun envoi de notification en « lancer et oublier »
      expect(src.match(/fetch\('https:\/\/app\.tangoetvous\.fr\/api\/notify\/[^']*',\s*\{/g), f + ' : envoi non encapsulé').toBeNull();
      expect(src, f + ' : envoi non attendu').toContain('await _tevNotify(');
    }
  });

  test('AI2 — l\'envoi précède la notification de l\'admin (ordre = cause du bug)', async () => {
    for (const f of FORMULAIRES) {
      const src = lire(f);
      const envoi = src.indexOf('await _tevNotify(\'https://app.tangoetvous.fr/api/notify/');
      // dernière construction de BroadcastChannel = celle du chemin réel
      const admin = src.lastIndexOf('new BroadcastChannel(');
      expect(envoi, f + ' : aucun envoi trouvé').toBeGreaterThan(-1);
      expect(admin, f + ' : aucune notification admin trouvée').toBeGreaterThan(-1);
      expect(envoi, f + ' : l\'admin est prévenu AVANT l\'envoi').toBeLessThan(admin);
    }
  });

  test('AI3 — renvoi : charge utile fidèle à la fiche (solo en attente)', async ({ page }) => {
    await bootDemo(page);
    const r = await page.evaluate(async () => {
      window.__posts = [];
      IS_DEMO = false;
      ouvrirModalConfirm = function (msg, cb) { window.__confirm = msg; cb(); };
      afficherToast = function (m) { (window.__toasts = window.__toasts || []).push(String(m)); };
      window.fetch = function (u, o) { __posts.push({ url: String(u), body: JSON.parse(o.body), keepalive: o.keepalive }); return Promise.resolve({ ok: true }); };
      adminData.coursTango = [{ id: 'IC1', prenom: 'Camille', nom: 'DEMO', email: 'camille@test.fr', tel: '0600000000',
        role: 'guidee', ville: 'paris', niveau: 'debutant', statut: 'demande', saison: saisonActive(), partenaire: '', emailPartenaire: '' }];
      renvoyerEmailInscription('IC1');
      for (let i = 0; i < 40 && !__posts.length; i++) await new Promise(r => setTimeout(r, 25));
      // laisser la promesse d'envoi se résoudre (le toast est posé dans son .then)
      for (let i = 0; i < 40 && !(window.__toasts || []).length; i++) await new Promise(r => setTimeout(r, 25));
      return { posts: __posts, confirm: window.__confirm, toasts: window.__toasts || [] };
    });
    expect(r.posts.length).toBe(1);
    expect(r.posts[0].url).toContain('/api/notify/inscription-cours');
    expect(r.posts[0].keepalive).toBe(true);
    const b = r.posts[0].body;
    expect(b.email).toBe('camille@test.fr');
    expect(b.prenom).toBe('Camille');
    expect(b.c1).toEqual({ ville: 'paris', niveau: 'debutant' });
    expect(b.c2).toBeNull();
    expect(b.nbCours).toBe(1);
    expect(b.isWaitlist).toBe(true);          // statut 'demande' → variante liste d'attente
    expect(b.venue).toBe('seul');
    expect(r.confirm).toContain('camille@test.fr');
    expect(r.toasts.join(' ')).toContain('renvoyé');
  });

  test('AI4 — renvoi : couple validé → les deux adresses, sans liste d\'attente', async ({ page }) => {
    await bootDemo(page);
    const r = await page.evaluate(async () => {
      window.__posts = [];
      IS_DEMO = false;
      ouvrirModalConfirm = function (msg, cb) { window.__confirm = msg; cb(); };
      afficherToast = function () {};
      window.fetch = function (u, o) { __posts.push({ body: JSON.parse(o.body) }); return Promise.resolve({ ok: true }); };
      adminData.coursTango = [{ id: 'IC2', prenom: 'Thomas', nom: 'DEMO', email: 'thomas@test.fr', tel: '',
        role: 'guideur', ville: 'vincennes', niveau: 'intermediaire', statut: 'attente_paiement', saison: saisonActive(),
        partenaire: 'Marie DEMO', emailPartenaire: 'marie@test.fr' }];
      renvoyerEmailInscription('IC2');
      for (let i = 0; i < 40 && !__posts.length; i++) await new Promise(r => setTimeout(r, 25));
      return { body: __posts[0].body, confirm: window.__confirm };
    });
    expect(r.body.isWaitlist).toBe(false);     // attente_paiement → variante validée
    expect(r.body.venue).toBe('avec-part');
    expect(r.body.pPrenom).toBe('Marie');
    expect(r.body.pNom).toBe('DEMO');
    expect(r.body.pEmail).toBe('marie@test.fr');
    expect(r.body.pRole).toBe('guidee');       // rôle inverse du guideur
    expect(r.body.c1).toEqual({ ville: 'vincennes', niveau: 'intermediaire' });
    expect(r.confirm).toContain('marie@test.fr');
  });

  test('AI5 — garde-fous : sans email rien ne part, et en démo aucun appel réseau', async ({ page }) => {
    await bootDemo(page);
    const r = await page.evaluate(async () => {
      window.__posts = [];
      window.__toasts = [];
      ouvrirModalConfirm = function (m, cb) { cb(); };
      afficherToast = function (m) { __toasts.push(String(m)); };
      window.fetch = function () { __posts.push(1); return Promise.resolve({ ok: true }); };
      adminData.coursTango = [
        { id: 'IC3', prenom: 'Sans', nom: 'EMAIL', email: '', ville: 'paris', niveau: 'debutant', statut: 'demande', saison: saisonActive() },
        { id: 'IC4', prenom: 'Demo', nom: 'MODE', email: 'demo@test.fr', ville: 'paris', niveau: 'debutant', statut: 'demande', saison: saisonActive() },
      ];
      IS_DEMO = false; renvoyerEmailInscription('IC3');       // pas d'email → refus
      IS_DEMO = true;  renvoyerEmailInscription('IC4');       // démo → aucun envoi
      await new Promise(r => setTimeout(r, 300));
      return { posts: __posts.length, toasts: __toasts };
    });
    expect(r.posts).toBe(0);
    expect(r.toasts.join(' ')).toContain('Aucune adresse email');
    expect(r.toasts.join(' ')).toContain('démo');
  });
});
