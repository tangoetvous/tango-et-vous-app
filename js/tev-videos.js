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
  };
})();
