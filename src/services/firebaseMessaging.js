import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyARjygnKvJvJDtkRgmiWlEw1j9C3KTix38",
  authDomain: "bomberos-scz-flotas.firebaseapp.com",
  projectId: "bomberos-scz-flotas",
  storageBucket: "bomberos-scz-flotas.firebasestorage.app",
  messagingSenderId: "25544314454",
  appId: "1:25544314454:web:d9da2756c5f6322842b5f7",
  measurementId: "G-HJE781PX2H"
};

export const VAPID_KEY = "BAQK7o8iiziBi0AEg3jNH7S7fDWwRPSi-IVaK87f9mdPC8qKMHIN6lg2rLY-EqIRhMdgdZ9KUdNAY-7UjkWDZp0";

let app = null;
let messaging = null;

export function initFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
      try {
        messaging = getMessaging(app);
      } catch (err) {
        console.warn('Firebase Messaging no soportado en este navegador:', err);
      }
    }
  }
  return { app, messaging };
}

export async function requestPushPermission(unidadId = 'B-01') {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    throw new Error('Notificaciones no soportadas en este navegador');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado.');
  }

  initFirebase();
  if (!messaging) {
    throw new Error('El módulo de mensajería de Firebase no está disponible.');
  }

  // Registrar explícitamente el service worker de Firebase
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const currentToken = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  if (!currentToken) {
    throw new Error('No se generó token de registro FCM');
  }

  localStorage.setItem('fcm_token_bombero', currentToken);
  localStorage.setItem('fcm_push_enabled', 'true');

  await syncPushTokenToBackend(unidadId, currentToken);
  return currentToken;
}

export async function syncPushTokenToBackend(unidadId = 'B-04', explicitToken = null) {
  const token = explicitToken || (typeof window !== 'undefined' ? localStorage.getItem('fcm_token_bombero') : null);
  if (!token) return false;

  try {
    const isHttps = window.location.protocol === 'https:';
    const baseUrl = isHttps ? '/api/v1/flotas' : 'http://34.28.212.45:8082/api/v1/flotas';
    const res = await fetch(`${baseUrl}/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unidadId: unidadId,
        token: token,
        plataforma: 'ANDROID_PWA'
      })
    });
    console.log('✅ Token FCM sincronizado con backend para unidad:', unidadId);
    return res.ok;
  } catch (err) {
    console.warn('Sync token con backend falló:', err);
    return false;
  }
}

export function subscribeToForegroundMessages(callback) {
  initFirebase();
  if (!messaging) return () => {};

  return onMessage(messaging, async (payload) => {
    console.log('[Foreground FCM] Mensaje recibido en primer plano:', payload);

    // Disparar la notificación nativa en Android incluso si la app está abierta en pantalla
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const title = payload.notification?.title || payload.data?.title || '🚨 ORDEN DE DESPACHO TÁCTICO';
        const body = payload.notification?.body || payload.data?.body || 'Nueva orden de despacho recibida.';
        const tag = 'despacho-' + (payload.data?.incidenteId || Date.now());
        await reg.showNotification(title, {
          body: body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [500, 250, 500, 250, 1000],
          tag: tag,
          renotify: true,
          requireInteraction: true,
          data: payload.data || {}
        });
      }
    } catch (e) {
      console.warn('Advertencia mostrando notificación nativa en primer plano:', e);
    }

    if (callback) {
      callback(payload);
    }
  });
}

