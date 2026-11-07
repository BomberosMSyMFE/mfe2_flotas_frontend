importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ==========================================
// 1. INICIALIZACIÓN DE FIREBASE CLOUD MESSAGING
// ==========================================
firebase.initializeApp({
  apiKey: "AIzaSyARjygnKvJvJDtkRgmiWlEw1j9C3KTix38",
  authDomain: "bomberos-scz-flotas.firebaseapp.com",
  projectId: "bomberos-scz-flotas",
  storageBucket: "bomberos-scz-flotas.firebasestorage.app",
  messagingSenderId: "25544314454",
  appId: "1:25544314454:web:d9da2756c5f6322842b5f7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] onBackgroundMessage recibido:', payload);
  
  const title = payload.notification?.title || payload.data?.title || '🚨 ALERTA DE DESPACHO BOMBEROS';
  const tagId = 'despacho-' + (payload.data?.incidenteId || Date.now());
  const options = {
    body: payload.notification?.body || payload.data?.body || 'Nueva orden de despacho táctico recibida.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [500, 250, 500, 250, 1000],
    tag: tagId,
    renotify: true,
    requireInteraction: true,
    data: {
      url: payload.data?.url || '/',
      incidenteId: payload.data?.incidenteId || '',
      latitud: payload.data?.latitud || '',
      longitud: payload.data?.longitud || '',
      tipoIncidente: payload.data?.tipoIncidente || ''
    },
    actions: [
      { action: 'open_route', title: '🗺️ Trazar Ruta' },
      { action: 'close', title: 'Ignorar' }
    ]
  };

  return self.registration.showNotification(title, options);
});

// Listener nativo push de respaldo para asegurar entrega en todos los navegadores móviles
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Evento push nativo recibido');
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    try {
      data = { notification: { body: event.data.text() } };
    } catch (e) {}
  }

  // Si ya tiene notification en el payload, el SDK compat de Firebase lo procesa.
  // Si no, mostramos la notificación manualmente
  if (!data.notification && data.data) {
    const title = data.data?.title || '🚨 ORDEN DE DESPACHO TÁCTICO';
    const body = data.data?.body || 'Emergencia despachada a tu unidad.';
    const tagId = 'despacho-' + (data.data?.incidenteId || Date.now());

    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [500, 250, 500, 250, 1000],
        tag: tagId,
        renotify: true,
        requireInteraction: true,
        data: data.data || {}
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes(self.registration.scope)) {
            client.postMessage({
              type: 'PUSH_DESPACHO_CLICKED',
              data: event.notification.data
            });
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ==========================================
// 2. CACHÉ OFFLINE Y GESTIÓN DE RED PWA
// ==========================================
const CACHE_NAME = 'bomberos-cabina-pwa-v6';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/workers/aiWorker.js',
];

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Instalando v6 y cacheando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Advertencia al cachear:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activando v6...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.port === '8082' || url.port === '8080' || url.port === '8005') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

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
