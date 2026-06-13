/* Salasilah Keluarga Elit — Service Worker (PWA)
   Strategi: Network-First untuk semua aset apl supaya pengguna sentiasa
   dapat versi terkini sebaik sahaja online. Cache hanya jadi sandaran
   apabila tiada talian. */
const CACHE = 'skg-v3.0';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(()=>{}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // JANGAN sentuh API Google Apps Script — biar pelayar uruskan.
  if (url.hostname.includes('script.google.com')) return;

  // Semua permintaan lain: Network-First (sentiasa cuba muat versi baharu).
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      }
      return res;
    }).catch(() =>
      caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    )
  );
});
