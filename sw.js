// ===== SALASILAH sw.js — VERSI v2.19 — dijana 12 Jun 2026 =====
const V = "salasilah-v219";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js?v=219-layout-freeze",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin === location.origin) {
    if (e.request.method !== "GET") return;
    if (u.pathname.endsWith("/app.js") || u.pathname.endsWith("/sw.js")) {
      e.respondWith(fetch(e.request, { cache: "no-store" }).catch(() => caches.match(e.request)));
      return;
    }
    e.respondWith(
      caches.match(e.request).then(r => 
        r || fetch(e.request, { cache: "no-store" }).then(res => {
          const c = res.clone();
          caches.open(V).then(ca => ca.put(e.request, c));
          return res;
        }).catch(() => caches.match("./index.html"))
      )
    );
  }
});