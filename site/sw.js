// PULSE — service worker : rend l'app utilisable hors connexion.
// Stratégie « réseau d'abord » : on sert toujours la dernière version en ligne,
// et la copie en cache prend le relais sans réseau (ou si le réseau met plus de 3 s).
const CACHE = 'pulse-shell-v4';
const SHELL = [
  './',
  'css/app.css',
  'css/tokens.css',
  'fonts/inter.woff2',
  'fonts/space-grotesk.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'index.html',
  'js/app.js',
  'js/coach/api.js',
  'js/coach/context.js',
  'js/coach/prompts.js',
  'js/coach/rules.js',
  'js/coach/tools.js',
  'js/data/db.js',
  'js/data/demo.js',
  'js/data/pipeline.js',
  'js/data/profile.js',
  'js/data/schema.js',
  'js/data/summary.js',
  'js/import/autosync.js',
  'js/import/client.js',
  'js/import/healthxml.js',
  'js/import/shortcut.js',
  'js/import/stream.js',
  'js/import/worker.js',
  'js/notify.js',
  'js/program/exercises.js',
  'js/program/generator.js',
  'js/scoring/config.js',
  'js/scoring/correlations.js',
  'js/scoring/cycle.js',
  'js/scoring/daily.js',
  'js/scoring/gamification.js',
  'js/scoring/nights.js',
  'js/scoring/scores.js',
  'js/scoring/stats.js',
  'js/scoring/stress.js',
  'js/state.js',
  'js/ui/charts.js',
  'js/ui/components.js',
  'js/ui/format.js',
  'js/ui/fx.js',
  'js/ui/icons.js',
  'js/ui/levelup.js',
  'js/ui/rings.js',
  'js/ui/sheet.js',
  'js/vendor/fflate.js',
  'js/views/breathe.js',
  'js/views/coach.js',
  'js/views/journal.js',
  'js/views/onboarding.js',
  'js/views/profile.js',
  'js/views/report.js',
  'js/views/sleep.js',
  'js/views/sport.js',
  'js/views/today.js',
  'manifest.webmanifest',
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

// Rappels (brief du matin, coucher, défi) envoyés par le service de rappels du site.
self.addEventListener('push', (event) => {
  let data = { title: 'PULSE', body: '', url: './#/aujourdhui' };
  try { data = { ...data, ...event.data?.json() }; } catch { /* message texte */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url },
    lang: 'fr',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? './', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.navigate(url).catch(() => {}); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
