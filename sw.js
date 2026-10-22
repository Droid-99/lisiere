/* Version web : garde le jeu en cache pour qu'il s'ouvre même sans réseau. Le marché, lui, passe toujours par le réseau. */
const VERSION = "lisiere-0.15.8";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(VERSION).then(c => c.addAll(["./", "index.html", "style.css", "config.js", "reseau.js", "contenu.js", "moteur.js", "manifest.json"]))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;   // Supabase et le reste : réseau direct
  e.respondWith(caches.open(VERSION).then(async c => {
    const r = await c.match(e.request);
    if (r) return r;
    const n = await fetch(e.request);
    if (n.ok) c.put(e.request, n.clone());
    return n;
  }));
});
