const CACHE = 'vanguard-road-v3';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './domain.mjs',
  './road-route.mjs',
  './portal-domain.mjs',
  './portal-controller.mjs',
  './export-track.mjs',
  './leaflet.js',
  './leaflet.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key => key.startsWith('vanguard-') && key !== CACHE)
    .map(key => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // OSM tiles and any CDN-hosted Leaflet assets are cross-origin, so let the
  // browser fetch them directly rather than intercepting or caching them.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE)
      .then(cache => cache.match(event.request))
      .then(cached => cached || fetch(event.request))
  );
});
