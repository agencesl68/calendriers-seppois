/* Service worker : l'app fonctionne sans réseau (porte-à-porte en zone blanche).
   Pensez à changer VERSION à chaque mise en ligne pour que les téléphones récupèrent la nouvelle version. */
const VERSION = 'cal-2026-10-04b';
const TILES = 'cal-tiles';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'config.js', 'manifest.webmanifest',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/qrcode.js',
  'icons/logo.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'data.geopf.fr') { e.respondWith(tile(req)); return; }
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(staleWhileRevalidate(req));
});
// Fichiers de l'app : réseau d'abord (mises à jour immédiates), cache si le réseau traîne plus de 3 s ou est absent.
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const res = await Promise.race([net, timeout]);
    if (res) return res;
  } catch (err) { /* hors ligne */ }
  const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
  return hit || net.catch(() => Response.error());
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => hit || (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
  return hit || net;
}
async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      cache.put(req, res.clone());
      cache.keys().then((keys) => { if (keys.length > 2500) keys.slice(0, keys.length - 2500).forEach((k) => cache.delete(k)); });
    }
    return res;
  } catch (err) { return Response.error(); }
}
