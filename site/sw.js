// PULSE — service worker : rend l'app utilisable hors connexion.
// Stratégie « réseau d'abord » : on sert toujours la dernière version en ligne,
// et la copie en cache prend le relais sans réseau (ou si le réseau met plus de 3 s).
const CACHE = 'pulse-shell-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'js/app.js',
  'js/ui/icons.js',
  'js/ui/rings.js',
  'js/data/db.js',
  'js/data/schema.js',
  'js/data/summary.js',
  'js/data/demo.js',
  'fonts/inter.woff2',
  'fonts/space-grotesk.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const NETWORK_TIMEOUT = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pulse-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Seulement les GET du site lui-même (jamais l'API du coach ni les autres domaines).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    });
    network.catch(() => undefined); // évite une erreur non gérée si le cache a déjà répondu
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT, null));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch { /* hors ligne : on passe au cache */ }
    const cached = await cache.match(req, { ignoreSearch: true })
      ?? (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    return cached ?? network;
  })());
});
