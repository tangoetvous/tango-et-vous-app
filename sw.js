// sw.js — Service Worker Tango & Vous PWA
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE = 'tv-cartes-v1';
const PRECACHE = ['/', '/index.html'];

// ── Firebase Messaging (notifications push discussions) ──────────
firebase.initializeApp({
  apiKey: "AIzaSyD-STk_VpUIe6mjOh7kX9bsaOE8OvPNEcs",
  authDomain: "tango-et-vous.firebaseapp.com",
  projectId: "tango-et-vous",
  storageBucket: "tango-et-vous.firebasestorage.app",
  messagingSenderId: "778867090916",
  appId: "1:778867090916:web:697fab0815e79f336493f1"
});
const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Tango & Vous', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'tev-discussion',
    data: payload.data || {}
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    for (const w of wins) {
      if (w.url.includes('index.html') || w.url.endsWith('/')) {
        w.focus();
        w.postMessage({ type: 'openTab', tab: 'discussions' });
        return;
      }
    }
    clients.openWindow('/');
  }));
});

// ── Cache & fetch ────────────────────────────────────────────────
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
  // Ne pas intercepter les ressources externes (Supabase, CDN, Firebase, Google)
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || new Response('', { status: 503 })))
  );
});
