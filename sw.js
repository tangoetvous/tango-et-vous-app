// sw.js — Service Worker Tango & Vous PWA (native Web Push, no Firebase)
const CACHE = 'tv-cartes-v6';
const PRECACHE = ['/', '/index.html'];

// ── Push notifications (native Web Push Protocol) ────────────────
self.addEventListener('push', function(event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch(e) {}
  var n = payload.notification || {};
  event.waitUntil(
    self.registration.showNotification(n.title || 'Tango & Vous', {
      body: n.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'tev-notification',
      data: payload.data || {}
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(wins) {
    for (var w of wins) {
      if (w.url.includes('index.html') || w.url.endsWith('/') || w.url.includes('admin')) {
        w.focus();
        var tab = (e.notification.data && e.notification.data.tab) || 'notifications';
        w.postMessage({ type: 'openTab', tab: tab });
        return;
      }
    }
    clients.openWindow('/');
  }));
});

// ── Cache & fetch ────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(PRECACHE); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Ne pas intercepter les ressources externes (Supabase, CDN, Firebase, Google)
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).catch(function() { return caches.match(e.request).then(function(r) { return r || new Response('', { status: 503 }); }); })
  );
});
