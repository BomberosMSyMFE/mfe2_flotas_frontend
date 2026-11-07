const CACHE_NAME = 'bomberos-cabina-pwa-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/bundle.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/workers/aiWorker.js',
];

// Install Event: Skip waiting immediately to activate newest version
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Instalando nueva versión v3...');
  self.skipWaiting();
});

// Activate Event: Clean up all outdated caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activando y purgando cachés obsoletas...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Network-First with Cache Fallback (Evita pantallas en blanco por bundles antiguos)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // APIs externas (Spring Boot / FastAPI) no deben ser interceptadas por el SW
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network First: Intentar red primero; si no hay red, usar caché local
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Modo Offline: buscar en caché
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Background Sync Listener
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-evidencias-outbox') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
        });
      })
    );
  }
});
