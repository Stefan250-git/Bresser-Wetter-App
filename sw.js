
const CACHE = 'bresser-v29';

const STATIC = [
  './',
  './index.html',
  './styles.css?v=29',
  './app.js?v=29',
  './icon.svg',
  './assets/moon-full-nasa.jpg',
  './assets/rhine-levels.jpg',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(key => key.startsWith('bresser-') && key !== CACHE)
              .map(key => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.pathname.includes('/data/') ||
      url.hostname.includes('open-meteo.com') ||
      url.hostname.endsWith('pegelonline.wsv.de')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache =>
            cache.put(event.request, copy)
          );
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
