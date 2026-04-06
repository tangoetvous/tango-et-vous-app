// sw.js — Service Worker Tango & Vous PWA
const CACHE = 'tv-cartes-v1';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first pour les requêtes API (Apps Script)
  if (e.request.url.includes('script.google.com') || e.request.url.includes('googleapis')) {
    return; // laisse passer sans cache
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
