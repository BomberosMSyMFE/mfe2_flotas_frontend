import React, { useState, useEffect } from 'react';
import { requestPushPermission, syncPushTokenToBackend } from '../services/firebaseMessaging';

export default function TacticalHud({
  unidades = [],
  camionSeleccionado = null,
  onSeleccionarCamion = null,
  incidenteActivo = null,
  rutaInfo = null,
  onActualizarFlotas = null,
  isRefreshing = false,
  onCalcularRuta = null,
  onReservarSaga = null,
  onCompensarSaga = null,
  onSimularTelemetria = null,
  toggleHotspots = null,
  mostrarHotspots = true,
}) {
  const [cargandoAccion, setCargandoAccion] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState(null);
  const [pushHabilitado, setPushHabilitado] = useState(
    typeof window !== 'undefined' ? (localStorage.getItem('fcm_push_enabled') === 'true' || (window.Notification && Notification.permission === 'granted')) : false
  );
  const [activandoPush, setActivandoPush] = useState(false);

  // ID del camión activo (tomado del objeto seleccionado o el primero de la flota)
  const camionActivo = camionSeleccionado || unidades[0] || null;
  const camionActivoId = camionActivo?.id || 'B-04';

  // Sincronización automática del token Push hacia el backend en el montaje
  useEffect(() => {
    const autoSyncToken = async () => {
      const savedToken = typeof window !== 'undefined' ? localStorage.getItem('fcm_token_bombero') : null;
      if (savedToken) {
        setPushHabilitado(true);
        await syncPushTokenToBackend(camionActivoId, savedToken);
      } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          await requestPushPermission(camionActivoId);
          setPushHabilitado(true);
        } catch (e) {
          console.warn('Auto-registro silencioso de push omitido:', e);
        }
      }
    };
    autoSyncToken();
  }, [camionActivoId]);

  const ejecutarAccionSegura = async (fn, mensaje) => {
    try {
      setCargandoAccion(true);
      setMensajeEstado(null);
      await fn();
      setMensajeEstado({ tipo: 'exito', texto: mensaje });
    } catch (e) {
      setMensajeEstado({ tipo: 'error', texto: e.message || 'Error en la operación' });
    } finally {
      setCargandoAccion(false);
    }
  };

  const handleDropdownChange = (e) => {
    const id = e.target.value;
    const encontrado = unidades.find((u) => u.id === id);
    if (encontrado && onSeleccionarCamion) {
      onSeleccionarCamion(encontrado);
    }
  };

  const handleActivarNotificaciones = async () => {
    try {
      setActivandoPush(true);
      setMensajeEstado(null);
      const token = await requestPushPermission(camionActivoId);
      setPushHabilitado(true);
      setMensajeEstado({
        tipo: 'exito',
        texto: '✅ ¡Notificaciones Push Tácticas activadas! Tu teléfono ya está registrado en Firebase y listo para recibir alertas.'
      });
    } catch (err) {
      setMensajeEstado({
        tipo: 'error',
        texto: 'Error activando notificaciones: ' + (err.message || err)
      });
    } finally {
      setActivandoPush(false);
    }
  };

  const handleSimularDespachoPush = async () => {
    try {
      setCargandoAccion(true);
      setMensajeEstado(null);

      // Garantizar que el backend tenga el token antes de disparar el despacho
      const savedToken = typeof window !== 'undefined' ? localStorage.getItem('fcm_token_bombero') : null;
      if (savedToken) {
        await syncPushTokenToBackend(camionActivoId, savedToken);
      }

      const isHttps = window.location.protocol === 'https:';
      const baseUrl = isHttps ? '/api/v1/flotas' : 'http://34.28.212.45:8082/api/v1/flotas';
      const res = await fetch(`${baseUrl}/despacho-notificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unidadId: camionActivoId,
          incidenteId: 'INC-2026-SCZ-' + Math.floor(100 + Math.random() * 900),
          tipoIncidente: 'INCENDIO ESTRUCTURAL',
          ubicacion: 'Av. Banzer y 4to Anillo (Santa Cruz)',
          latitud: -17.7650,
          longitud: -63.1750,
          prioridad: 'CODIGO_ROJO'
        })
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        setMensajeEstado({
          tipo: 'exito',
          texto: '🚨 ¡Orden de Despacho enviada por Firebase! Revisa la notificación emergente en tu celular.'
        });
      } else {
        setMensajeEstado({
          tipo: 'error',
          texto: data.mensaje || 'Error al emitir despacho push.'
        });
      }
    } catch (err) {
      setMensajeEstado({
        tipo: 'error',
        texto: 'Error comunicando con servidor: ' + err.message
      });
    } finally {
      setCargandoAccion(false);
    }
  };

  return (
    <div
      style={{
        width: '400px',
        height: '100%',
        backgroundColor: 'rgba(17, 24, 39, 0.96)',
        backdropFilter: 'blur(16px)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-main)',
        zIndex: 1000,
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.7)',
        overflowY: 'auto',
      }}
    >
      {/* Encabezado del HUD con botón de actualización manual y chip automático */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span className="badge badge-tactical">CENTRO DE DESPACHO GIS</span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
              Control de Flotas y Rutas
            </h3>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 700 }}>
            ● EN LÍNEA
          </span>
        </div>

        {/* Barra de Actualización de Flotas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <button
            onClick={() => onActualizarFlotas && onActualizarFlotas()}
            disabled={isRefreshing}
            style={{
              flex: 1,
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid var(--color-tactical-blue)',
              color: '#93C5FD',
              borderRadius: 'var(--radius-sm)',
              padding: '7px 12px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {isRefreshing ? '🔄 ACTUALIZANDO...' : '🔄 ACTUALIZAR FLOTAS'}
          </button>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Auto: cada 10s
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Notificación de estado de la última acción */}
        {mensajeEstado && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              backgroundColor:
                mensajeEstado.tipo === 'exito'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${
                mensajeEstado.tipo === 'exito'
                  ? 'var(--color-success)'
                  : 'var(--color-emergency)'
              }`,
              color:
                mensajeEstado.tipo === 'exito'
                  ? 'var(--color-success)'
                  : 'var(--color-emergency)',
            }}
          >
            {mensajeEstado.texto}
          </div>
        )}

        {/* Panel de Alertas Push Móviles (FCM) */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#FCA5A5', letterSpacing: '0.05em' }}>
              🔔 NOTIFICACIONES PUSH MÓVIL
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: pushHabilitado ? 'rgba(34, 197, 94, 0.2)' : 'rgba(156, 163, 175, 0.2)',
                color: pushHabilitado ? '#4ADE80' : '#9CA3AF',
                fontWeight: 700,
                border: `1px solid ${pushHabilitado ? '#22C55E' : '#6B7280'}`,
              }}
            >
              {pushHabilitado ? '● PUSH ACTIVO' : '○ NO REGISTRADO'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleSimularDespachoPush}
              disabled={cargandoAccion}
              style={{
                width: '100%',
                backgroundColor: 'rgba(220, 38, 38, 0.4)',
                border: '1px solid #EF4444',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.35)',
              }}
            >
              {cargandoAccion ? '📡 ENVIANDO ALERTA A FIREBASE...' : '🚨 PROBAR DESPACHO PUSH A MI CELULAR'}
            </button>

            <button
              onClick={handleActivarNotificaciones}
              disabled={activandoPush}
              style={{
                width: '100%',
                backgroundColor: pushHabilitado ? 'rgba(55, 65, 81, 0.5)' : 'rgba(239, 68, 68, 0.25)',
                border: pushHabilitado ? '1px solid #4B5563' : '1px solid var(--color-danger)',
                color: pushHabilitado ? '#D1D5DB' : '#FECACA',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {activandoPush
                ? '⏳ REGISTRANDO EN FIREBASE...'
                : (pushHabilitado ? '🔄 RE-VINCULAR DISPOSITIVO CON FIREBASE' : '🔔 ACTIVAR PUSH EN ESTE CELULAR')}
            </button>
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {pushHabilitado
              ? '✅ Dispositivo vinculado. Toca "Probar Despacho" para enviar la alerta a la pantalla de bloqueo.'
              : 'Toca "Activar Push" y luego "Permitir" cuando Chrome solicite permisos.'}
          </span>
        </div>

        {/* 1. SELECCIÓN DE UNIDAD (SINCRONIZACIÓN BIDIRECCIONAL CON EL MAPA) */}
        <div
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            border: '1px solid var(--border-focus)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
              UNIDAD ACTIVA EN FOCO:
            </span>
            <span
              className={`badge ${
                camionActivo?.estado === 'DISPONIBLE'
                  ? 'badge-success'
                  : (camionActivo?.estado === 'BLOQUEADO_SAGA' || camionActivo?.estado === 'RESERVADO_SAGA')
                  ? 'badge-purple'
                  : 'badge-tactical'
              }`}
            >
              {camionActivo?.estado || 'DESCONOCIDO'}
            </span>
          </div>

          <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
            Selecciona aquí o haz clic directamente sobre cualquier camión en el mapa.
          </p>

          <select
            value={camionActivoId}
            onChange={handleDropdownChange}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-focus)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '12px',
              marginTop: '8px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                🚒 {u.id} &bull; {u.tipo} &bull; {u.litrosAguaActual}L ({u.estado})
              </option>
            ))}
          </select>

          {/* Telemetría actual de la unidad activa */}
          {camionActivo && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 'var(--radius-sm)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '11px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Estación Origen:</span>
                <p style={{ fontWeight: 600 }}>{camionActivo.estacionOrigen}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Tanque de Agua:</span>
                <p style={{ fontWeight: 700, color: 'var(--color-hydrant-cyan)' }} className="font-mono">
                  {camionActivo.litrosAguaActual} Litros
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Velocidad:</span>
                <p style={{ fontWeight: 600 }} className="font-mono">
                  {camionActivo.velocidadKmh || 0} km/h
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Bomba de Agua:</span>
                <p style={{ fontWeight: 600 }} className="font-mono">
                  {camionActivo.presionBombaBares || 8.0} Bares
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 2. NAVEGACIÓN Y RUTA ÓPTIMA VIAL (CU-04) */}
        <div
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            border: '1px solid var(--border-focus)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Ruta Vial Óptima e Hidrantes (CU-04)
            </span>
            <span className="badge badge-cyan">POSTGIS</span>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Traza el recorrido real por calles para <strong>{camionActivoId}</strong> hacia el incendio y
            localiza hidrantes cercanos dentro de 500m.
          </p>

          <button
            onClick={() => onCalcularRuta && onCalcularRuta(camionActivoId)}
            style={{
              width: '100%',
              backgroundColor: 'var(--color-tactical-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '10px',
              fontSize: '12px',
              fontWeight: 700,
              marginTop: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            🗺️ TRAZAR RUTA ÓPTIMA DE {camionActivoId}
          </button>

          {rutaInfo && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Distancia vial real:</span>
                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--color-tactical-blue)' }}>
                  {rutaInfo.distanciaTotalMetros} metros
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tiempo estimado (ETA):</span>
                <span className="font-mono" style={{ fontWeight: 700 }}>
                  {Math.round((rutaInfo.duracionEstimadaSegundos / 60) * 10) / 10} min (48 km/h)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginTop: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Hidrantes en Zona Cero:</span>
                <span className="badge badge-cyan" title="Hidrantes operativos en la red en un radio de 500m del siniestro (destino)">
                  {rutaInfo.hidrantesCercanos?.length || 0} Operativos a &lt;500m del Siniestro
                </span>
              </div>
              {rutaInfo.hidrantesCercanos && rutaInfo.hidrantesCercanos.length > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', textAlign: 'right' }}>
                  💧 Abastecimiento en destino: {rutaInfo.hidrantesCercanos.map(h => `${h.id} (${h.distanciaMetrosAlSiniestro || 250}m)`).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. ORQUESTACIÓN SAGA (PASO 1 Y COMPENSACIÓN - CU-03) */}
        <div
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            border: '1px solid var(--border-focus)',
            borderTop: '3px solid var(--color-ai-purple)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="badge badge-purple">ORQUESTACIÓN SAGA (CU-03)</span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Transaccional</span>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            <strong>Paso 1:</strong> Reserva atómica de la unidad cisterna.{' '}
            <strong>Compensación:</strong> Revierte la reserva si otro paso falla.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
            {/* BOTÓN RESERVAR CAMIÓN */}
            <button
              disabled={cargandoAccion}
              onClick={() =>
                ejecutarAccionSegura(
                  () => onReservarSaga && onReservarSaga(camionActivoId),
                  `Paso 1 SAGA: Camión ${camionActivoId} reservado atómicamente.`
                )
              }
              style={{
                backgroundColor: 'var(--color-success)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '9px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
              }}
              title="Reserva este camión en la base de datos de flotas (estado RESERVADO_SAGA) para que ningún otro despacho lo use."
            >
              🔒 RESERVAR {camionActivoId}
            </button>

            {/* BOTÓN COMPENSAR / LIBERAR */}
            <button
              disabled={cargandoAccion}
              onClick={() =>
                ejecutarAccionSegura(
                  () => onCompensarSaga && onCompensarSaga(camionActivoId),
                  `SAGA Compensación: Camión ${camionActivoId} liberado (Rollback exitoso).`
                )
              }
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-emergency)',
                border: '1px solid var(--color-emergency)',
                borderRadius: 'var(--radius-sm)',
                padding: '9px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
              }}
              title="Si falla otro microservicio (ej. inventario o personal), el orquestador revierte la reserva devolviendo el camión a DISPONIBLE."
            >
              ↩️ LIBERAR / ROLLBACK
            </button>
          </div>
        </div>

        {/* 4. SIMULADOR DE TELEMETRÍA IoT (CU-05) */}
        <div
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            border: '1px solid var(--border-focus)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
              Telemetría IoT en Vivo (CU-05)
            </span>
            <span className="badge badge-tactical">4G / GPS</span>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Simula los sensores a bordo del camión <strong>{camionActivoId}</strong> enviando pings con
            posición GPS y descarga de agua hacia Spring Boot. Si trazaste la ruta, avanzará paso a paso por
            las calles hacia el siniestro.
          </p>

          <button
            onClick={() => onSimularTelemetria && onSimularTelemetria(camionActivoId)}
            style={{
              width: '100%',
              backgroundColor: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--color-hydrant-cyan)',
              border: '1px solid var(--color-hydrant-cyan)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px',
              fontSize: '11px',
              fontWeight: 700,
              marginTop: '8px',
              cursor: 'pointer',
            }}
          >
            📡 EMITIR PING DE TELEMETRÍA (AVANZAR EN CALLE)
          </button>
        </div>

        {/* 5. CAPA DE HOTSPOTS ESPACIALES (DBSCAN ML) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Clusters de Incendios (DBSCAN ML):
          </span>
          <button
            onClick={toggleHotspots}
            style={{
              backgroundColor: mostrarHotspots ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-elevated)',
              color: mostrarHotspots ? 'var(--color-emergency)' : 'var(--text-muted)',
              border: `1px solid ${mostrarHotspots ? 'var(--color-emergency)' : 'var(--border-focus)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {mostrarHotspots ? '● VISIBLES' : '○ OCULTOS'}
          </button>
        </div>

        {/* 6. LISTADO DE TODA LA FLOTA (CLIC PARA SELECCIONAR) */}
        <div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
            }}
          >
            Lista de Unidades ({unidades.length} Camiones):
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {unidades.map((u) => {
              const esSeleccionado = camionActivo?.id === u.id;
              return (
                <div
                  key={u.id}
                  onClick={() => onSeleccionarCamion && onSeleccionarCamion(u)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: esSeleccionado ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-surface)',
                    border: `1px solid ${
                      esSeleccionado ? 'var(--color-tactical-blue)' : 'var(--border-subtle)'
                    }`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <b style={{ fontSize: '13px' }}>
                      {esSeleccionado ? '👉 ' : ''}
                      {u.id}
                    </b>
                    <span
                      className={`badge ${
                        u.estado === 'DISPONIBLE'
                          ? 'badge-success'
                          : u.estado === 'RESERVADO_SAGA'
                          ? 'badge-tactical'
                          : 'badge-emergency'
                      }`}
                    >
                      {u.estado}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      marginTop: '4px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>{u.tipo}</span>
                    <span className="font-mono">{u.litrosAguaActual} L</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
