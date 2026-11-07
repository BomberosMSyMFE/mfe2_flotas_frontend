import { getPendingEvidences, updateEvidenceStatus } from './indexedDbOutbox';
import { getFlotasApiBase } from './flotasApi';

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSimulatingOffline = false;
    this.isSyncing = false;
    this.listeners = new Set();

    // Eventos nativos del navegador
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Escuchar mensajes del Service Worker si dispara background sync
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'TRIGGER_BACKGROUND_SYNC') {
          console.log('[SyncManager] Service Worker solicitó sincronización en segundo plano');
          this.syncPendingOutbox();
        }
      });
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (err) {
        console.error('[SyncManager] Error en listener:', err);
      }
    });
  }

  handleNetworkChange(online) {
    this.isOnline = online;
    console.log(`[SyncManager] Estado de red cambiado: ${online ? 'ONLINE' : 'OFFLINE'}`);
    this.notify('NETWORK_CHANGE', { isOnline: this.getEffectiveOnlineStatus() });

    if (this.getEffectiveOnlineStatus()) {
      this.syncPendingOutbox();
    }
  }

  /**
   * Permite al operador simular desconexión total (pérdida de señal en cerros/subsuelos)
   */
  setSimulatedOffline(simulate) {
    this.isSimulatingOffline = simulate;
    console.log(`[SyncManager] Simulación offline: ${simulate ? 'ACTIVADA' : 'DESACTIVADA'}`);
    this.notify('NETWORK_CHANGE', { isOnline: this.getEffectiveOnlineStatus() });

    if (this.getEffectiveOnlineStatus()) {
      this.syncPendingOutbox();
    }
  }

  getEffectiveOnlineStatus() {
    if (this.isSimulatingOffline) return false;
    return this.isOnline;
  }

  /**
   * Procesa la cola de Local Outbox con Idempotencia estricta (X-Idempotency-Key)
   */
  async syncPendingOutbox() {
    if (this.isSyncing) {
      console.log('[SyncManager] Sincronización ya en curso...');
      return;
    }

    if (!this.getEffectiveOnlineStatus()) {
      console.log('[SyncManager] Sin conexión efectiva. Sincronización pausada.');
      return;
    }

    this.isSyncing = true;
    this.notify('SYNC_STARTED');

    try {
      const pendingItems = await getPendingEvidences();
      console.log(`[SyncManager] Sincronizando ${pendingItems.length} evidencias pendientes...`);

      for (const item of pendingItems) {
        // Marcamos temporalmente como SINCRONIZANDO
        await updateEvidenceStatus(item.id, 'SINCRONIZANDO');
        this.notify('ITEM_SYNCING', item.id);

        try {
          const payload = {
            incidenteId: item.incidenteId,
            camionId: item.camionId,
            bomberoMatricula: item.bomberoMatricula,
            tipoEvidencia: item.tipoEvidencia,
            transcripcionLocal: item.transcripcionLocal,
            urlFotografia: item.urlFotografia,
            coordenadasCaptura: item.coordenadasCaptura,
            timestampCreacionOffline: item.timestampCreacionOffline,
          };

          const apiBase = getFlotasApiBase();
          const response = await fetch(`${apiBase}/evidencias`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': item.idempotencyKey || item.id, // UUID v7
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[SyncManager] Evidencia ${item.id} confirmada por servidor:`, data);
            await updateEvidenceStatus(item.id, 'CONFIRMADO_EN_SERVIDOR', data);
            this.notify('ITEM_CONFIRMED', { id: item.id, response: data });
          } else {
            console.warn(`[SyncManager] Error de servidor HTTP ${response.status} en evidencia ${item.id}`);
            await updateEvidenceStatus(item.id, 'PENDIENTE_SYNC');
          }
        } catch (fetchErr) {
          console.warn(`[SyncManager] Fallo de conexión al sincronizar ${item.id}:`, fetchErr.message);
          await updateEvidenceStatus(item.id, 'PENDIENTE_SYNC');
          // Si falló por red, no continuar con los demás en este ciclo
          break;
        }
      }
    } catch (err) {
      console.error('[SyncManager] Error durante el proceso de sincronización:', err);
    } finally {
      this.isSyncing = false;
      this.notify('SYNC_FINISHED');
    }
  }
}

export const syncManager = new SyncManager();
