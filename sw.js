const CACHE_NAME = 'salasilah-elit-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/@panzoom/panzoom@4.5.1/dist/panzoom.min.js'
];

// Install Event - Caching App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching App Shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First for API, Cache First for Static
self.addEventListener('fetch', (event) => {
  // For Google Apps Script API calls, always try network first
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ status: 'error', message: 'Anda berada di luar talian (Offline).' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // For static assets, try cache, then network
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request).then((fetchRes) => {
          return caches.open(CACHE_NAME).then((cache) => {
            // Don't cache third party dynamically unnecessarily, but cache core libs
            if(event.request.url.startsWith('http')) {
               cache.put(event.request, fetchRes.clone());
            }
            return fetchRes;
          });
        });
      })
  );
});
