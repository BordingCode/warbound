// Network-first service worker. Fresh code when online, full offline fallback.
// BUMP CACHE on every shippable change.
const CACHE = 'warbound-v103';
const SHELL = [
  './', './index.html', './manifest.json', './icons/favicon.svg',
  './css/tokens.css', './css/board.css', './css/units.css', './css/hud.css',
  './js/main.js', './js/dom.js', './js/rng.js', './js/grid.js', './js/svg.js', './js/svg2.js', './js/champ-art.js', './js/icons.js', './js/gear-art.js',
  './js/data/units.js', './js/data/traits.js', './js/data/enemies.js', './js/data/items.js', './js/data/augments.js', './js/data/honors.js', './js/data/creatures.js',
  './js/sim/rules.js', './js/sim/combat.js', './js/render/player.js', './js/render/fx.js',
  './js/input/drag.js', './js/state/run.js', './js/state/bots.js', './js/state/rank.js', './js/state/meta.js', './js/audio/audio.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  url.search = '';
  const clean = url.toString();
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => { c.put(e.request, clone); c.put(clean, res.clone()); });
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match(clean) || caches.match('./index.html')))
  );
});
