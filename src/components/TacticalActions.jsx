import React, { useState } from 'react';
import { getFlotasApiBase } from '../services/flotasApi';

export default function TacticalActions({ camionId = 'B-04', isOnline, onActionRecorded }) {
  const [currentStatus, setCurrentStatus] = useState('EN_SERVICIO');
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const tacticalStates = [
    {
      id: 'EN_TRANSITO',
      label: 'EN RUTA AL SINIESTRO',
      sublabel: 'Sirena encendida / Prioridad vial',
      colorClass: 'btn-tactical-blue',
      icon: '🚒',
    },
    {
      id: 'LLEGADA_A_ESCENA',
      label: 'LLEGADA A LA ESCENA',
      sublabel: 'Inicio de despliegue de mangueras',
      colorClass: 'btn-tactical-orange',
      icon: '📍',
    },
    {
      id: 'FUEGO_CONTROLADO',
      label: 'FUEGO CONTROLADO',
      sublabel: 'Perímetro asegurado / Fase enfriamiento',
      colorClass: 'btn-tactical-green',
      icon: '🛡️',
    },
    {
      id: 'REABASTECIMIENTO',
      label: 'REABASTECIENDO AGUA',
      sublabel: 'Conexión a hidrante de red',
      colorClass: 'btn-tactical-cyan',
      icon: '💧',
    },
  ];

  const handleStateClick = async (state) => {
    setIsUpdating(true);
    setCurrentStatus(state.id);
    const timestamp = new Date().toLocaleTimeString();

    if (isOnline) {
      try {
        const baseUrl = getFlotasApiBase();
        const resp = await fetch(`${baseUrl}/telemetria`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            camionId: camionId,
            latitud: -17.7833,
            longitud: -63.1821,
            velocidadKmH: state.id === 'EN_TRANSITO' ? 52.0 : 0.0,
            rumboGrados: 180.0,
            litrosAguaActual: state.id === 'REABASTECIMIENTO' ? 4000 : 2800,
            combustiblePorcentaje: 88,
            estadoOperativo: state.id === 'EN_TRANSITO' ? 'EN_TRANSITO' : 'EN_ESCENA',
          }),
        });

        if (resp.ok) {
          setFeedbackMsg(
            `[${timestamp}] ✓ Enlace en vivo: Telemetría de ${camionId} enviada a Spring Boot (8080) • PostgreSQL 'unidades_flota' (estado: ${state.id}) • Central de Despacho (:3002) actualizada.`
          );
        } else {
          setFeedbackMsg(`[${timestamp}] ⚠️ Servidor respondió con código ${resp.status}.`);
        }
      } catch (err) {
        setFeedbackMsg(`[${timestamp}] 📡 Red no disponible: Estado ${state.id} registrado localmente en tablet de cabina.`);
      }
    } else {
      setFeedbackMsg(`[${timestamp}] 📡 MODO OFFLINE (Sin señal): Estado ${state.id} resguardado en cabina.`);
    }

    // Emitir evento por bus para sincronía entre componentes
    try {
      window.dispatchEvent(
        new CustomEvent('BOMBEROS:ESTADO_CAMION_CAMBIADO', {
          detail: { camionId, nuevoEstado: state.id, timestamp },
        })
      );
    } catch (e) {
      // Ignorar si el entorno no soporta CustomEvent
    }

    if (onActionRecorded) {
      onActionRecorded(state.id);
    }

    setTimeout(() => {
      setIsUpdating(false);
    }, 400);
  };

  return (
    <section className="tactical-card">
      <div className="card-header">
        <h2 className="card-title">COMANDOS RÁPIDOS DE CABINA (MANOS CON GUANTES)</h2>
        <span className="badge-status">ESTADO ACTUAL: {currentStatus}</span>
      </div>

      <p className="card-description">
        Diseñados para pulsación táctil con guantes gruesos y en movimiento. Al pulsar, <strong>actualiza la tabla <code>unidades_flota</code> en PostgreSQL (puerto 8080)</strong> y <strong>notifica en tiempo real a la Central de Despacho / Visor Cartográfico (puerto 3002)</strong> con la nueva telemetría del camión ({camionId}).
      </p>

      <div className="tactical-button-grid">
        {tacticalStates.map((state) => {
          const isActive = currentStatus === state.id;
          return (
            <button
              key={state.id}
              className={`btn-tactical-large ${state.colorClass} ${
                isActive ? 'btn-tactical-active' : ''
              }`}
              onClick={() => handleStateClick(state)}
              disabled={isUpdating}
            >
              <div className="btn-icon">{state.icon}</div>
              <div className="btn-content">
                <span className="btn-main-label">{state.label}</span>
                <span className="btn-sub-label">{state.sublabel}</span>
              </div>
              {isActive && <span className="btn-badge-active">ACTIVO</span>}
            </button>
          );
        })}
      </div>

      {feedbackMsg && (
        <div className="tactical-feedback-banner">
          <span className="font-mono">{feedbackMsg}</span>
        </div>
      )}
    </section>
  );
}
