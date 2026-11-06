const CACHE_NAME = 'khodam-servants-v1.0.2';
const DYNAMIC_CACHE = 'khodam-servants-static-v1.0.2';

const STATIC_ASSETS = ['./', './index.html', './style.css', './script.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) return caches.delete(key);
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!['http:', 'https:'].includes(new URL(request.url).protocol)) return;
  const url = new URL(request.url);
  if (url.hostname.includes('firebase') || url.hostname.includes('gstatic') || url.hostname.includes('googleapis') || url.hostname.includes('cloudflare') || request.method !== 'GET') return;
  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'document') {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone).catch(() => {})).catch(() => {});
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, networkResponse).catch(() => {})).catch(() => {});
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') return networkResponse;
        const responseClone = networkResponse.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, responseClone).catch(() => {})).catch(() => {});
        return networkResponse;
      }).catch(() => {
        if (request.destination === 'document') return caches.match('./index.html');
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
});