importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

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
  console.log('[firebase-messaging-sw.js] Mensaje recibido en background:', payload);
  
  const title = payload.notification?.title || payload.data?.title || '🚨 ALERTA DE DESPACHO BOMBEROS';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'Nueva orden de despacho táctico recibida.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [500, 250, 500, 250, 1000],
    tag: 'despacho-tactico',
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
