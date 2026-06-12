/* Service Worker — Salasilah Keluarga Elit
   Cache shell asas, network-first untuk navigasi.
*/
const CACHE = 'salasilah-v1';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.5.1/dist/panzoom.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Jangan cache panggilan ke Google Apps Script
  if (url.hostname.includes('script.google.com')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((r) => {
            if (r && r.status === 200 && (url.origin === location.origin || SHELL.includes(req.url))) {
              const copy = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return r;
          })
          .catch(() => cached)
    )
  );
});

// Segerak tindakan tertangguh
self.addEventListener('sync', (e) => {
  if (e.tag === 'salasilah-sync') {
    self.clients.matchAll().then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'SYNC_NOW' }));
    });
  }
});
