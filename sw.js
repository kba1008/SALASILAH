const CACHE = "salasilah-v1";
const ASSETS = ["./","./index.html","./app.js","./manifest.json"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Network-first for Apps Script API
  if (url.hostname.includes("script.google.com")) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ ok: false, error: "Offline" }), { headers: { "Content-Type": "application/json" } })));
    return;
  }
  // Cache-first for static assets
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
    if (e.request.method === "GET" && resp.ok && url.origin === location.origin) {
      const clone = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
    }
    return resp;
  }).catch(() => caches.match("./index.html"))));
});
