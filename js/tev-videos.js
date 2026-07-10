/* ============================================================
   Tango & Vous — Vidéos des cours (Bunny Stream)
   Helper partagé : upload direct (TUS), URLs lecteur/miniature, requêtes Supabase.
   Chargé dans index.html (élève) et admin.html.
   Dépendances (résolues à l'exécution, jamais au chargement) :
     - window.tus  (tus-js-client, chargé via CDN)
     - window.TEV  (client Supabase, tev-supabase.js)
   ============================================================ */
(function () {
  'use strict';

  var LIBRARY_ID = '701214';
  var HOST = 'vz-15dcd245-cc4.b-cdn.net';

  // URL du lecteur (iframe, lecture seule — pas de bouton téléchargement côté élève)
  function embedUrl(videoId) {
    return 'https://iframe.mediadelivery.net/embed/' + LIBRARY_ID + '/' +
      encodeURIComponent(videoId) + '?autoplay=false&preload=false&responsive=true';
  }
  // Miniature générée automatiquement par Bunny
  function thumbUrl(videoId) {
    return 'https://' + HOST + '/' + encodeURIComponent(videoId) + '/thumbnail.jpg';
  }

  // Jeton de session Supabase (pour authentifier l'appel au worker)
  async function _jwt() {
    try {
      var r = await window.TEV.client.auth.getSession();
      return (r && r.data && r.data.session) ? r.data.session.access_token : '';
    } catch (e) { return ''; }
  }

  // Upload complet : (1) créer l'objet Bunny via le worker, (2) upload direct TUS, (3) INSERT métadonnées.
  // opts = { file, titre, ville, niveau, saison, source, soumisParEmail, soumisParNom, statut, onProgress }
  // Retour : { ok:true, videoId } ou lève une Error.
  async function uploadVideo(opts) {
    opts = opts || {};
    var file = opts.file;
    if (!file) throw new Error('Aucun fichier vidéo');
    var titre = (opts.titre || '').trim() || 'Vidéo';
    var jwt = await _jwt();
    if (!jwt) throw new Error('Session expirée — reconnectez-vous');

    // 1) Créer l'objet vidéo côté Bunny (le worker garde la clé API)
    var cr = await fetch('/api/videos/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ titre: titre }),
    });
    var cj = null;
    try { cj = await cr.json(); } catch (e) {}
    if (!cr.ok || !cj || !cj.videoId) {
      throw new Error((cj && cj.error) || 'Préparation de l\'envoi impossible');
    }

    // 2) Upload direct du fichier vers Bunny (protocole TUS, reprise auto)
    if (!window.tus) throw new Error('Module d\'envoi non chargé — réessayez');
    await new Promise(function (resolve, reject) {
      var upload = new window.tus.Upload(file, {
        endpoint: 'https://video.bunnycdn.com/tusupload',
        retryDelays: [0, 2000, 5000, 10000],
        headers: {
          AuthorizationSignature: cj.signature,
          AuthorizationExpire: cj.expiration,
          VideoId: cj.videoId,
          LibraryId: cj.libraryId,
        },
        metadata: { filetype: file.type || 'video/mp4', title: titre },
        onError: function (err) { reject(err instanceof Error ? err : new Error('Échec de l\'envoi')); },
        onProgress: function (sent, total) {
          if (typeof opts.onProgress === 'function' && total) opts.onProgress(sent / total, sent, total);
        },
        onSuccess: function () { resolve(); },
      });
      upload.start();
    });

    // 3) Enregistrer les métadonnées (RLS : élève → en_attente en son nom ; admin → libre)
    var row = {
      titre: titre,
      ville: opts.ville || 'paris',
      niveau: opts.niveau || 'debutant',
      saison: opts.saison || '',
      bunny_video_id: cj.videoId,
      statut: opts.statut || 'en_attente',
      source: opts.source || 'eleve',
      soumis_par_email: opts.soumisParEmail || null,
      soumis_par_nom: opts.soumisParNom || null,
      date_cours: opts.dateCours || null,
    };
    if (row.statut === 'approuvee') row.approuvee_at = new Date().toISOString();
    var ins = await window.TEV.client.from('videos_cours').insert(row);
    if (ins && ins.error) throw new Error(ins.error.message || 'Enregistrement impossible');

    return { ok: true, videoId: cj.videoId };
  }

  // ── État d'encodage Bunny (badge « en cours d'encodage ») ─────────────────
  // Une vidéo fraîchement uploadée met un moment à être encodée : sa miniature
  // reste une image figée et la lecture ne marche pas encore. On interroge le
  // worker (statut Bunny, 4 = prêt) uniquement pour les vidéos récentes.
  function isRecent(v) {
    try { var t = new Date(v && v.created_at).getTime(); return !isNaN(t) && (Date.now() - t) < 24 * 3600 * 1000; }
    catch (e) { return false; }
  }
  async function statuses(ids) {
    if (!ids || !ids.length) return {};
    var jwt = await _jwt();
    if (!jwt) return {};
    try {
      var r = await fetch('/api/videos/status?ids=' + encodeURIComponent(ids.join(',')), {
        headers: { 'Authorization': 'Bearer ' + jwt }
      });
      if (!r.ok) return {};
      var j = await r.json();
      return (j && j.statuses) ? j.statuses : {};
    } catch (e) { return {}; }
  }

  function _encBadge(n, text) {
    n.style.position = 'relative';
    n.style.pointerEvents = 'none';                 // pas de lecture tant que non encodé
    var b = n.querySelector('.tev-enc-badge');
    if (!b) { b = document.createElement('div'); b.className = 'tev-enc-badge'; n.appendChild(b); }
    b.textContent = text;
    b.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;background:rgba(0,0,0,0.62);color:#fff;font-size:11.5px;font-weight:700;line-height:1.35;border-radius:inherit;z-index:2;';
  }
  function _encClear(n) {
    var b = n.querySelector('.tev-enc-badge'); if (b && b.parentNode) b.parentNode.removeChild(b);
    n.style.pointerEvents = '';
    n.removeAttribute('data-tev-encoding');
  }

  var _watchTimer = null, _watchRounds = 0;
  // Balaie le DOM pour les miniatures marquées data-tev-encoding, applique/retire le badge,
  // et se relance tant qu'une vidéo est encore en cours (max ~4 min). Idempotent.
  function watchEncoding() {
    if (_watchTimer) { clearTimeout(_watchTimer); _watchTimer = null; }
    var nodes = [].slice.call(document.querySelectorAll('[data-tev-encoding]'));
    if (!nodes.length) { _watchRounds = 0; return; }
    var ids = [];
    nodes.forEach(function (n) { var id = n.getAttribute('data-tev-encoding'); if (id && ids.indexOf(id) < 0) ids.push(id); });
    statuses(ids).then(function (map) {
      var pending = false;
      [].slice.call(document.querySelectorAll('[data-tev-encoding]')).forEach(function (n) {
        var st = map[n.getAttribute('data-tev-encoding')];
        if (st === 4) { _encClear(n); }                                   // prêt → miniature normale, cliquable
        else if (st === 5 || st === 6) { _encBadge(n, '⚠️ Vidéo indisponible'); n.removeAttribute('data-tev-encoding'); }
        else if (typeof st === 'number') { _encBadge(n, '⏳ Encodage en cours…'); pending = true; }
        else { n.removeAttribute('data-tev-encoding'); }                  // inconnu/API muette → fail-open (pas de badge)
      });
      _watchRounds++;
      if (pending && _watchRounds < 30) { _watchTimer = setTimeout(watchEncoding, 8000); }
      else if (!pending) { _watchRounds = 0; }
    });
  }

  // Requêtes de lecture
  async function listApprouvees(ville, niveau, saison) {
    var q = window.TEV.client.from('videos_cours').select('*')
      .eq('statut', 'approuvee').eq('ville', ville).eq('niveau', niveau)
      .order('created_at', { ascending: false });
    if (saison) q = q.eq('saison', saison);
    var r = await q;
    return (r && r.data) ? r.data : [];
  }
  async function listAValider(saison) { // admin — file de modération (saison courante par défaut)
    var q = window.TEV.client.from('videos_cours').select('*')
      .eq('statut', 'en_attente').order('created_at', { ascending: false });
    if (saison) q = q.eq('saison', saison);
    var r = await q;
    return (r && r.data) ? r.data : [];
  }
  async function listPubliees(saison) { // admin — bibliothèque (filtrée par la saison consultée)
    var q = window.TEV.client.from('videos_cours').select('*')
      .eq('statut', 'approuvee').order('created_at', { ascending: false });
    if (saison) q = q.eq('saison', saison);
    var r = await q;
    return (r && r.data) ? r.data : [];
  }

  // Modération admin
  async function approuver(id) {
    var r = await window.TEV.client.from('videos_cours')
      .update({ statut: 'approuvee', approuvee_at: new Date().toISOString() }).eq('id', id);
    if (r && r.error) throw new Error(r.error.message || 'Approbation impossible');
    return true;
  }
  // Refuser / supprimer : efface la vidéo côté Bunny PUIS la ligne Supabase.
  async function supprimer(id, bunnyVideoId) {
    if (bunnyVideoId) {
      try {
        var s = await window.TEV.client.auth.getSession();
        var jwt = (s && s.data && s.data.session) ? s.data.session.access_token : '';
        if (jwt) await fetch('/api/videos/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
          body: JSON.stringify({ id: bunnyVideoId })
        }).catch(function () {});
      } catch (e) {}
    }
    var r = await window.TEV.client.from('videos_cours').delete().eq('id', id);
    if (r && r.error) throw new Error(r.error.message || 'Suppression impossible');
    return true;
  }

  window.TEVVID = {
    LIBRARY_ID: LIBRARY_ID,
    HOST: HOST,
    embedUrl: embedUrl,
    thumbUrl: thumbUrl,
    uploadVideo: uploadVideo,
    listApprouvees: listApprouvees,
    listAValider: listAValider,
    listPubliees: listPubliees,
    approuver: approuver,
    supprimer: supprimer,
    isRecent: isRecent,
    statuses: statuses,
    watchEncoding: watchEncoding,
  };
})();
