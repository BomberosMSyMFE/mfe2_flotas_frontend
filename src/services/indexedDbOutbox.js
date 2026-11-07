import { openDB } from 'idb';
import { v7 as uuidv7 } from 'uuid';

const DB_NAME = 'BomberosCabinaDB';
const DB_VERSION = 1;
const STORE_NAME = 'outbox_evidencias';

/**
 * Inicializa la base de datos IndexedDB local para la cabina del camión
 */
export async function initDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_status', 'status');
        store.createIndex('by_timestamp', 'timestampCreacionOffline');
        console.log(`[IndexedDB] Object store '${STORE_NAME}' creado exitosamente.`);
      }
    },
  });
}

/**
 * Guarda una nueva evidencia en la bandeja de salida local (Local Outbox)
 * Genera estrictamente un UUID v7 con timestamp embebido en milisegundos.
 */
export async function saveEvidenceToOutbox(evidenceData) {
  const db = await initDb();
  
  // Generar identificador UUID v7 (RFC 9562)
  const idV7 = uuidv7();
  const timestampIso = new Date().toISOString();

  const nuevaEvidencia = {
    id: idV7,
    idempotencyKey: evidenceData.idempotencyKey || idV7,
    incidenteId: evidenceData.incidenteId || 'INC-2026-0891',
    camionId: evidenceData.camionId || 'B-04',
    bomberoMatricula: evidenceData.bomberoMatricula || 'SGT-7721',
    tipoEvidencia: evidenceData.tipoEvidencia || 'FOTOGRAFIA_ESCENA',
    transcripcionLocal: evidenceData.transcripcionLocal || '',
    analisisIA: evidenceData.analisisIA || null,
    urlFotografia: evidenceData.urlFotografia || 'https://storage.bomberos.gob.bo/evidencias/foto-local.jpg',
    coordenadasCaptura: evidenceData.coordenadasCaptura || {
      latitud: -17.7833,
      longitud: -63.1821,
    },
    timestampCreacionOffline: timestampIso,
    status: evidenceData.status || 'PENDIENTE_SYNC', // PENDIENTE_SYNC | SINCRONIZANDO | CONFIRMADO_EN_SERVIDOR
    servidorRespuesta: evidenceData.servidorRespuesta || null,
    reintentos: 0,
  };

  await db.put(STORE_NAME, nuevaEvidencia);
  console.log(`[IndexedDB Outbox] Evidencia guardada localmente con UUID v7: ${idV7} (Estado: ${nuevaEvidencia.status})`);
  return nuevaEvidencia;
}

/**
 * Obtiene todas las evidencias almacenadas localmente en la cola
 */
export async function getAllOutboxEvidences() {
  const db = await initDb();
  const all = await db.getAll(STORE_NAME);
  // Ordenar por UUID v7 o timestamp descendente (los más recientes primero)
  return all.sort((a, b) => b.timestampCreacionOffline.localeCompare(a.timestampCreacionOffline));
}

/**
 * Obtiene las evidencias pendientes de sincronización
 */
export async function getPendingEvidences() {
  const db = await initDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('by_status');
  return index.getAll('PENDIENTE_SYNC');
}

/**
 * Actualiza el estado de una evidencia tras un intento de sincronización
 */
export async function updateEvidenceStatus(id, newStatus, servidorRespuesta = null) {
  const db = await initDb();
  const record = await db.get(STORE_NAME, id);
  if (!record) return null;

  record.status = newStatus;
  if (servidorRespuesta) {
    record.servidorRespuesta = servidorRespuesta;
  }
  if (newStatus === 'SINCRONIZANDO') {
    record.reintentos = (record.reintentos || 0) + 1;
  }

  await db.put(STORE_NAME, record);
  return record;
}

/**
 * Limpia los registros confirmados para liberar espacio
 */
export async function clearConfirmedEvidences() {
  const db = await initDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  let cursor = await tx.store.openCursor();
  let count = 0;
  while (cursor) {
    if (cursor.value.status === 'CONFIRMADO_EN_SERVIDOR') {
      await cursor.delete();
      count++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return count;
}
