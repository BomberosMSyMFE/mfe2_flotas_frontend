import React from 'react';
import { clearConfirmedEvidences } from '../services/indexedDbOutbox';
import { syncManager } from '../services/syncManager';

export default function OutboxVisualizer({
  evidences = [],
  isSyncing,
  isOnline,
  onRefresh,
}) {
  const handleSyncClick = () => {
    syncManager.syncPendingOutbox();
  };

  const handleClearClick = async () => {
    const deletedCount = await clearConfirmedEvidences();
    alert(`Se eliminaron ${deletedCount} registros confirmados de la cola local.`);
    if (onRefresh) onRefresh();
  };

  return (
    <section className="tactical-card">
      <div className="card-header">
        <div className="header-title-box">
          <h2 className="card-title">BANDEJA DE SALIDA LOCAL (LOCAL OUTBOX EN INDEXEDDB)</h2>
          <p className="card-subtitle">
            Sincronización <strong>100% automática al recuperar señal</strong> &bull; Orden cronológico FIFO con UUID v7 &bull; Idempotencia con X-Idempotency-Key
          </p>
        </div>

        <div className="header-actions">
          <button
            className="btn-tactical btn-sync-primary"
            onClick={handleSyncClick}
            disabled={isSyncing || !isOnline}
            title={!isOnline ? 'Conéctese a internet para sincronizar' : 'La sincronización es automática al reconectar, pero puede pulsar aquí para forzarla inmediatamente'}
          >
            {isSyncing ? '🔄 SINCRONIZANDO COLA...' : '🔄 REINTENTAR AHORA (OPCIONAL)'}
          </button>

          <button
            className="btn-tactical btn-clear-secondary"
            onClick={handleClearClick}
            disabled={evidences.length === 0}
          >
            🧹 LIMPIAR CONFIRMADOS
          </button>
        </div>
      </div>

      {evidences.length === 0 ? (
        <div className="outbox-empty-state">
          <span className="empty-icon">📭</span>
          <p className="empty-text">No hay reportes ni evidencias en la bandeja de salida local.</p>
          <span className="empty-subtext">
            Las acciones registradas en cabina (con o sin señal) se encolarán aquí automáticamente.
          </span>
        </div>
      ) : (
        <div className="outbox-list">
          {evidences.map((item) => {
            const isConfirmed = item.status === 'CONFIRMADO_EN_SERVIDOR';
            const isPending = item.status === 'PENDIENTE_SYNC';
            const isCurrentSyncing = item.status === 'SINCRONIZANDO';

            return (
              <div
                key={item.id}
                className={`outbox-item-card ${
                  isConfirmed ? 'item-confirmed' : isPending ? 'item-pending' : 'item-syncing'
                }`}
              >
                <div className="item-status-col">
                  {isConfirmed && <span className="status-badge badge-green">✓ CONFIRMADO</span>}
                  {isPending && <span className="status-badge badge-orange">⏳ PENDIENTE</span>}
                  {isCurrentSyncing && <span className="status-badge badge-blue">🔄 EN VUELO</span>}
                  <span className="retry-count font-mono">INTENTOS: {item.reintentos || 0}</span>
                </div>

                <div className="item-content-col">
                  <div className="item-meta-row">
                    <span className="meta-uuid font-mono">
                      <strong>UUID v7:</strong> {item.id}
                    </span>
                    <span className="meta-chip">{item.tipoEvidencia}</span>
                    <span className="meta-chip chip-incident font-mono">{item.incidenteId}</span>
                    <span className="meta-chip font-mono">UNIDAD: {item.camionId}</span>
                  </div>

                  <p className="item-text">{item.transcripcionLocal || '(Sin transcripción)'}</p>

                  {item.analisisIA && (
                    <div className="item-ai-tag">
                      <span className="tag-ai-icon">🧠</span>
                      <span className="font-mono">
                        {item.analisisIA.categoria} &bull; SEV {item.analisisIA.severidad}/5 &bull; {item.analisisIA.alerta}
                      </span>
                    </div>
                  )}

                  <div className="item-footer-row">
                    <span className="footer-timestamp font-mono">
                      📅 Creado offline: {item.timestampCreacionOffline ? new Date(item.timestampCreacionOffline).toLocaleString('es-BO') : 'N/A'}
                    </span>
                    {item.servidorRespuesta && (
                      <span className="footer-server-id font-mono text-green">
                        🛡️ Servidor ID: {item.servidorRespuesta.evidenciaId || item.servidorRespuesta.id || 'CONFIRMADO'}
                        {item.servidorRespuesta.idempotencyKey ? ` • Clave: ${item.servidorRespuesta.idempotencyKey.substring(0, 8)}...` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
