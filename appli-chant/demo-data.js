/* ============================================================
   Appli Chant — données de DÉMO partagées (maquette)
   Stockage : localStorage (clé chant_demo_v1) + IndexedDB pour
   les fichiers audio uploadés. Aucun serveur, aucune vraie DB.
   Dans la vraie app : Supabase (tables eleves / exercices /
   pointages) + Supabase Storage pour l'audio + push FCM.
   ============================================================ */
(function () {
  var KEY = 'chant_demo_v1';

  function seed() {
    return {
      profNom: 'Professeure de chant',
      eleves: [
        {
          id: 'e1', prenom: 'Camille', nom: 'MARTIN', email: 'camille@test.fr',
          formule: 'carte', carteTotal: 10, pushActif: true,
          carteExpActive: true, carteExp: '2026-10-31',
          pointages: ['2026-06-11', '2026-06-18', '2026-06-25', '2026-07-02'],
          coursUnite: [],
          exercices: [
            {
              id: 'x1', titre: 'Vocalises en tierces',
              consigne: 'Monter par demi-tons depuis le do médium, sur « mi‑mé‑ma‑mo‑mou ». Garder le souffle bas, épaules relâchées. 10 minutes chaque jour.',
              audioName: 'piano-tierces.mp3', hasAudio: false,
              notifyProf: true, creeLe: '2026-07-02',
              faits: ['2026-07-05', '2026-07-08', '2026-07-11']
            },
            {
              id: 'x2', titre: 'Respiration — appui du souffle',
              consigne: 'Allongé·e, un livre sur le ventre : inspirer 4 temps, bloquer 4 temps, souffler sur « sss » 12 temps. 3 séries.',
              audioName: '', hasAudio: false,
              notifyProf: false, creeLe: '2026-06-25',
              faits: ['2026-06-27']
            }
          ],
          notifications: [
            { date: '2026-07-02', message: '🎵 Cours du jeudi 2 juillet pointé — il vous reste 6 cours sur votre carte.', lu: true },
            { date: '2026-07-02', message: '🎼 Nouvel exercice : « Vocalises en tierces »', lu: false }
          ]
        },
        {
          id: 'e2', prenom: 'Lucas', nom: 'BERNARD', email: 'lucas@test.fr',
          formule: 'unite', carteTotal: 0, pushActif: true,
          pointages: [],
          coursUnite: [
            { date: '2026-06-20', paye: true },
            { date: '2026-07-04', paye: true },
            { date: '2026-07-11', paye: false }
          ],
          exercices: [
            {
              id: 'x3', titre: 'Travail du passage — « Caruso »',
              consigne: 'Travailler le refrain en voix mixte, sans pousser. S’enregistrer et comparer avec le piano.',
              audioName: 'caruso-piano.mp3', hasAudio: false,
              notifyProf: true, creeLe: '2026-07-04',
              faits: []
            }
          ],
          notifications: []
        },
        {
          id: 'e3', prenom: 'Aïcha', nom: 'DIALLO', email: 'aicha@test.fr',
          formule: 'carte', carteTotal: 5, pushActif: false,
          pointages: ['2026-05-16', '2026-05-30', '2026-06-13', '2026-06-27', '2026-07-11'],
          coursUnite: [],
          exercices: [],
          notifications: [
            { date: '2026-07-11', message: '🎵 Cours du samedi 11 juillet pointé — votre carte est terminée (5/5).', lu: false }
          ]
        }
      ],
      profNotifications: [
        { date: '2026-07-11', message: '✅ Camille MARTIN a fait l’exercice « Vocalises en tierces »', lu: false },
        { date: '2026-07-08', message: '✅ Camille MARTIN a fait l’exercice « Vocalises en tierces »', lu: true }
      ]
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var s = seed();
    save(s);
    return s;
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    return load();
  }

  /* ---- helpers ---- */
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
  }
  function fmtDateCourt(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1];
  }
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function restants(el) {
    return Math.max(0, (el.carteTotal || 0) - (el.pointages || []).length);
  }
  function carteExpiree(el) {
    return !!(el.carteExpActive && el.carteExp && el.carteExp < todayISO());
  }

  /* ---- audio (IndexedDB, blobs des fichiers uploadés en démo) ---- */
  function idbOpen() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('chant_demo_audio', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('audios'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function audioSave(id, blob) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('audios', 'readwrite');
        tx.objectStore('audios').put(blob, id);
        tx.oncomplete = res;
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function audioGet(id) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var rq = db.transaction('audios').objectStore('audios').get(id);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    }).catch(function () { return null; });
  }
  function audioDelete(id) {
    return idbOpen().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction('audios', 'readwrite');
        tx.objectStore('audios').delete(id);
        tx.oncomplete = res;
        tx.onerror = res;
      });
    }).catch(function () {});
  }

  /* ---- sync entre onglets (le pointage prof apparaît chez l'élève) ---- */
  function onChange(cb) {
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) cb();
    });
  }

  window.CHANT = {
    load: load, save: save, reset: reset,
    todayISO: todayISO, fmtDate: fmtDate, fmtDateCourt: fmtDateCourt,
    uid: uid, esc: esc, restants: restants, carteExpiree: carteExpiree,
    audioSave: audioSave, audioGet: audioGet, audioDelete: audioDelete,
    onChange: onChange
  };
})();
