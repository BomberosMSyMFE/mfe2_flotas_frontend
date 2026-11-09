import React, { useState, useEffect } from 'react';

export default function CabinHeader({
  isOnline,
  isSimulatingOffline,
  onToggleSimulatedOffline,
  pendingCount,
  camionId = 'B-04',
  matricula = 'SGT-7721',
  onCambiarPerfil = null,
  onInstallApp = null,
}) {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('es-BO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const opcionesCabinas = [
    { camionId: 'B-04', matricula: 'SGT-7721', nombre: 'Sgto. Juan Pérez (Cisterna Pesada)' },
    { camionId: 'B-08', matricula: 'TNTE-4022', nombre: 'Tnte. Carlos Rojas (Cisterna Pesada)' },
    { camionId: 'B-01', matricula: 'CB-1090', nombre: 'Cabo Marcos Soliz (Ataque Rápido)' },
    { camionId: 'B-06', matricula: 'SOF-3312', nombre: 'Sof. David Méndez (Escala Telescópica)' },
    { camionId: 'B-11', matricula: 'BOM-8831', nombre: 'Bmb. Rodrigo Vargas (Rescate Liviano)' },
  ];

  return (
    <header className="tactical-header">
      <div className="header-brand">
        <div className="brand-badge">
          <span className="badge-flame">🔥</span>
          <div className="brand-text">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="brand-title">TERMINAL DE CABINA - UNIDAD {camionId}</h1>
              <span className="badge-fire badge-fire-critical" style={{ fontSize: '10px' }}>PERFIL ACTIVO</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                OPERADOR: <strong>{matricula}</strong> &bull;
              </span>
              {onCambiarPerfil && (
                <select
                  value={camionId}
                  onChange={(e) => {
                    const sel = opcionesCabinas.find(c => c.camionId === e.target.value);
                    if (sel) onCambiarPerfil(sel);
                  }}
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    padding: '2px 6px',
                    fontFamily: 'var(--font-mono)'
                  }}
                  title="En producción, este perfil se asigna automáticamente mediante el Login SSO (JWT de Nataly en MS-01)"
                >
                  {opcionesCabinas.map(c => (
                    <option key={c.camionId} value={c.camionId}>
                      🚒 {c.camionId} | {c.matricula} - {c.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="header-status-group">
        {/* Reloj táctico */}
        <div className="status-metric">
          <span className="metric-label">HORA LOCAL</span>
          <span className="metric-value font-mono">{currentTime || '--:--:--'}</span>
        </div>

        {/* GPS Cabina */}
        <div className="status-metric">
          <span className="metric-label">GPS CABINA</span>
          <span className="metric-value font-mono">-17.7833, -63.1821</span>
        </div>

        {/* Indicador de Red */}
        <div
          className={`status-pill ${
            isOnline ? 'pill-online' : 'pill-offline'
          }`}
        >
          <span className="indicator-dot"></span>
          <span className="pill-text">
            {isOnline ? 'EN LÍNEA (4G)' : 'MODO OFFLINE'}
          </span>
        </div>

        {/* Contador Outbox */}
        <div className="status-metric outbox-metric">
          <span className="metric-label">OUTBOX</span>
          <span className="metric-value metric-accent font-mono">
            {pendingCount} PENDIENTES
          </span>
        </div>

        {/* Botón Simulación Pérdida de Cobertura */}
        <button
          className={`btn-tactical btn-simulation ${
            isSimulatingOffline ? 'btn-active-sim' : ''
          }`}
          onClick={onToggleSimulatedOffline}
          title="Permite simular la pérdida física de conectividad celular en zona de siniestro"
        >
          {isSimulatingOffline ? '📶 RESTAURAR SEÑAL' : '⚠️ SIMULAR PÉRDIDA DE SEÑAL'}
        </button>

        {/* Botón Instalar App PWA */}
        {onInstallApp && (
          <button
            className="btn-tactical"
            onClick={onInstallApp}
            style={{
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              color: '#38BDF8',
              border: '1px solid #38BDF8',
              cursor: 'pointer',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Instalar esta aplicación PWA en el dispositivo (PC o Móvil)"
          >
            📲 INSTALAR APP
          </button>
        )}
      </div>
    </header>
  );
}
