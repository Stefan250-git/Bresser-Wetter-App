
const CACHE = 'bresser-v36';
const DATA_CACHE = 'bresser-data-v1';

const STATIC = [
  './',
  './index.html',
  './styles.css?v=36',
  './mobile.css?v=36',
  './app.js?v=36',
  './history.js?v=36',
  './river.js?v=36',
  './icon.svg',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/moon-full-nasa.jpg',
  './assets/rhine-levels.jpg',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(key => key.startsWith('bresser-') && key !== CACHE && key !== DATA_CACHE)
              .map(key => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function stationResponse(request) {
  const cache=await caches.open(DATA_CACHE);
  try {
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  } catch {
    const saved=await cache.match(request);
    if(!saved)throw Error('No offline station data');
    const headers=new Headers(saved.headers);
    headers.set('X-Bresser-Offline','true');
    return new Response(await saved.blob(),{status:saved.status,statusText:saved.statusText,headers});
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.includes('/data/')) {
    event.respondWith(stationResponse(event.request));return;
  }
  if (url.hostname.includes('open-meteo.com') ||
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
