import React, { useState, useEffect } from 'react';
import { requestPushPermission, syncPushTokenToBackend } from '../services/firebaseMessaging';

export default function TacticalHud({
  unidades = [],
  camionSeleccionado = null,
  onSeleccionarCamion = null,
  incidenteActivo = null,
  incidentesDisponibles = [],
  onSeleccionarIncidente = null,
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
          incidenteId: incidenteActivo?.incidenteId || ('INC-2026-SCZ-' + Math.floor(100 + Math.random() * 900)),
          tipoIncidente: incidenteActivo?.tipoFuego || 'INCENDIO INDUSTRIAL',
          ubicacion: incidenteActivo?.ubicacion || 'Santa Cruz de la Sierra',
          latitud: incidenteActivo?.latitud || -17.7833,
          longitud: incidenteActivo?.longitud || -63.1821,
          prioridad: incidenteActivo?.prioridad || 'CODIGO_ROJO'
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
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-primary)',
        zIndex: 1000,
        boxShadow: '-2px 0 12px rgba(0, 0, 0, 0.06)',
        overflowY: 'auto',
      }}
    >
      {/* Encabezado del HUD con botón de actualización manual y chip automático */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: '#F8FAFC',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span className="badge-fire badge-fire-critical">CENTRO DE DESPACHO GIS</span>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginTop: '4px', letterSpacing: '0.02em' }}>
              Control de Flotas y Rutas
            </h3>
          </div>
          <span className="badge-fire badge-fire-success">
            ● EN LÍNEA
          </span>
        </div>

        {/* Barra de Actualización de Flotas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <button
            onClick={() => onActualizarFlotas && onActualizarFlotas()}
            disabled={isRefreshing}
            className="btn-fire-outline"
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            {isRefreshing ? '🔄 ACTUALIZANDO...' : '🔄 ACTUALIZAR FLOTAS'}
          </button>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }} className="font-tactical-mono">
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
              borderRadius: 'var(--radius-btn)',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor:
                mensajeEstado.tipo === 'exito'
                  ? 'var(--badge-controlado-bg)'
                  : 'var(--badge-critico-bg)',
              border: `1px solid ${
                mensajeEstado.tipo === 'exito'
                  ? 'var(--badge-controlado-border)'
                  : 'var(--badge-critico-border)'
              }`,
              color:
                mensajeEstado.tipo === 'exito'
                  ? 'var(--badge-controlado-text)'
                  : 'var(--badge-critico-text)',
            }}
          >
            {mensajeEstado.texto}
          </div>
        )}

        {/* Panel de Alertas Push Móviles (FCM) */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--color-primary-light)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--color-primary-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary)', fontWeight: 700, letterSpacing: '0.05em' }}>
              🔔 NOTIFICACIONES PUSH MÓVIL
            </span>
            <span
              className={`badge-fire ${pushHabilitado ? 'badge-fire-success' : 'badge-fire-neutral'}`}
            >
              {pushHabilitado ? '● PUSH ACTIVO' : '○ NO REGISTRADO'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleSimularDespachoPush}
              disabled={cargandoAccion}
              className="btn-fire-primary"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                boxShadow: '0 0 12px rgba(206, 32, 41, 0.4)',
              }}
            >
              {cargandoAccion ? '📡 ENVIANDO ALERTA A FIREBASE...' : '🚨 PROBAR DESPACHO PUSH A MI CELULAR'}
            </button>

            <button
              onClick={handleActivarNotificaciones}
              disabled={activandoPush}
              className="btn-fire-outline"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '10px',
                fontWeight: 700,
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
            backgroundColor: '#FFFFFF', boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-card)',
            padding: '14px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
              UNIDAD ACTIVA EN FOCO:
            </span>
            <span
              className={`badge-fire ${
                camionActivo?.estado === 'DISPONIBLE'
                  ? 'badge-fire-success'
                  : (camionActivo?.estado === 'BLOQUEADO_SAGA' || camionActivo?.estado === 'RESERVADO_SAGA')
                  ? 'badge-fire-warning'
                  : 'badge-fire-critical'
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
              backgroundColor: '#FFFFFF',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-input)',
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
                backgroundColor: '#F8FAFC', border: '1px solid var(--border-color)',
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

        {/* 1.5. SELECCIÓN DE INCIDENTE ACTIVO EN SANTA CRUZ */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-card)',
            padding: '14px',
            border: '1px solid var(--border-color)',
            borderLeft: '4px solid var(--color-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
              🔥 INCIDENTE TÁCTICO EN GESTIÓN:
            </span>
            <span className="badge-fire badge-fire-critical">
              {incidenteActivo?.prioridad || 'CODIGO_ROJO'}
            </span>
          </div>

          <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
            Selecciona el siniestro para trazar ruta vial PostGIS o reservar unidad vía SAGA.
          </p>

          <select
            value={incidenteActivo?.incidenteId || ''}
            onChange={(e) => {
              const incId = e.target.value;
              if (onSeleccionarIncidente) onSeleccionarIncidente(incId);
            }}
            style={{
              width: '100%',
              backgroundColor: '#FFFFFF',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-input)',
              padding: '8px 12px',
              fontSize: '12px',
              marginTop: '8px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {incidentesDisponibles.map((inc) => (
              <option key={inc.incidenteId} value={inc.incidenteId}>
                🔥 {inc.incidenteId} &bull; {inc.titulo || inc.tipoFuego}
              </option>
            ))}
          </select>

          {incidenteActivo && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ubicación:</span>
                <strong style={{ textAlign: 'right' }}>{incidenteActivo.ubicacion}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tipo de Fuego:</span>
                <span className="badge badge-emergency" style={{ fontSize: '9px', padding: '1px 4px' }}>
                  {incidenteActivo.tipoFuego}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Agua Mínima:</span>
                <strong className="font-mono">{incidenteActivo.litrosMinimos || 5000} L</strong>
              </div>
            </div>
          )}
        </div>

        {/* 2. NAVEGACIÓN Y RUTA ÓPTIMA VIAL (CU-04) */}
        <div
          style={{
            backgroundColor: '#FFFFFF', boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-card)',
            padding: '14px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Ruta Vial Óptima e Hidrantes (CU-04)
            </span>
            <span className="badge-fire badge-fire-neutral">POSTGIS</span>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Traza el recorrido real por calles para <strong>{camionActivoId}</strong> hacia el incendio y
            localiza hidrantes cercanos dentro de 500m.
          </p>

          <button
            onClick={() => onCalcularRuta && onCalcularRuta(camionActivoId)}
            className="btn-fire-primary"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '11px',
              fontWeight: 800,
              marginTop: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              letterSpacing: '0.03em',
            }}
          >
            🗺️ TRAZAR RUTA ÓPTIMA DE {camionActivoId}
          </button>

          {rutaInfo && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#F8FAFC', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-card)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Distancia vial real:</span>
                <span className="font-tactical-mono" style={{ fontWeight: 700, color: 'var(--color-primary)', fontWeight: 700 }}>
                  {rutaInfo.distanciaTotalMetros} metros
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tiempo estimado (ETA):</span>
                <span className="font-tactical-mono" style={{ fontWeight: 700 }}>
                  {Math.round((rutaInfo.duracionEstimadaSegundos / 60) * 10) / 10} min (48 km/h)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginTop: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Hidrantes en Zona Cero:</span>
                <span className="badge-fire badge-fire-neutral" title="Hidrantes operativos en la red en un radio de 500m del siniestro (destino)">
                  {rutaInfo.hidrantesCercanos?.length || 0} Operativos &lt;500m
                </span>
              </div>
              {rutaInfo.hidrantesCercanos && rutaInfo.hidrantesCercanos.length > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', textAlign: 'right' }}>
                  💧 Abastecimiento: {rutaInfo.hidrantesCercanos.map(h => `${h.id} (${h.distanciaMetrosAlSiniestro || 250}m)`).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. ORQUESTACIÓN SAGA (PASO 1 Y COMPENSACIÓN - CU-03) */}
        <div
          style={{
            backgroundColor: '#FFFFFF', boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-card)',
            padding: '14px',
            border: '1px solid var(--border-color)',
            borderTop: '3px solid var(--color-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="badge-fire badge-fire-critical">ORQUESTACIÓN SAGA (CU-03)</span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }} className="font-tactical-mono">Transaccional Multi-Cloud</span>
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
              className="btn-fire-primary"
              style={{
                padding: '9px 10px',
                fontSize: '11px',
                fontWeight: 800,
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
              className="btn-fire-danger"
              style={{
                padding: '9px 10px',
                fontSize: '11px',
                fontWeight: 700,
                textAlign: 'center',
              }}
              title="Si falla otro microservicio (ej. inventario o personal), el orquestador revierte la reserva devolviendo el camión a DISPONIBLE."
            >
              ↩️ LIBERAR / ROLLBACK
            </button>

            {/* BOTÓN CONCLUIR MISIÓN / FUEGO EXTINGUIDO */}
            <button
              disabled={cargandoAccion}
              onClick={() =>
                ejecutarAccionSegura(
                  async () => {
                    if (onCompensarSaga) await onCompensarSaga(camionActivoId);
                    try {
                      window.dispatchEvent(
                        new CustomEvent('BOMBEROS:ESTADO_INCIDENTE_CAMBIADO', {
                          detail: {
                            incidenteId: incidenteActivo?.incidenteId,
                            nuevoEstado: 'EXTINGUIDO',
                            camionId: camionActivoId,
                            timestamp: new Date().toLocaleTimeString()
                          },
                          bubbles: true
                        })
                      );
                      window.dispatchEvent(
                        new CustomEvent('BOMBEROS:UNIDAD_LIBERADA', {
                          detail: { camionId: camionActivoId, nuevoEstado: 'DISPONIBLE' },
                          bubbles: true
                        })
                      );
                    } catch (e) {}
                  },
                  `🏁 Misión Concluida: Camión ${camionActivoId} liberado (Estado: DISPONIBLE para nuevos siniestros).`
                )
              }
              className="btn-fire-outline"
              style={{
                gridColumn: '1 / -1',
                padding: '8px 10px',
                fontSize: '11px',
                fontWeight: 800,
                textAlign: 'center',
                borderColor: '#10B981',
                color: '#065F46',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
              }}
              title="Libera la unidad una vez culminada la emergencia, retornándola a estado DISPONIBLE para futuros despachos."
            >
              🏁 CONCLUIR MISIÓN / FUEGO EXTINGUIDO
            </button>
          </div>
        </div>

        {/* 4. SIMULADOR DE TELEMETRÍA IoT (CU-05) */}
        <div
          style={{
            backgroundColor: '#FFFFFF', boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-card)',
            padding: '14px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Telemetría IoT en Vivo (CU-05)
            </span>
            <span className="badge-fire badge-fire-neutral">4G / GPS</span>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Simula los sensores a bordo del camión <strong>{camionActivoId}</strong> enviando pings con
            posición GPS y descarga de agua hacia Spring Boot. Si trazaste la ruta, avanzará paso a paso por
            las calles hacia el siniestro.
          </p>

          <button
            onClick={() => onSimularTelemetria && onSimularTelemetria(camionActivoId)}
            className="btn-fire-outline"
            style={{
              width: '100%',
              padding: '9px',
              fontSize: '11px',
              fontWeight: 700,
              marginTop: '8px',
            }}
          >
            📡 EMITIR PING DE TELEMETRÍA (AVANZAR EN CALLE)
          </button>
        </div>

        {/* 5. CAPA DE HOTSPOTS ESPACIALES (DBSCAN ML) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            Clusters de Incendios (DBSCAN ML):
          </span>
          <button
            onClick={toggleHotspots}
            style={{
              backgroundColor: mostrarHotspots ? 'rgba(206, 32, 41, 0.15)' : 'var(--bg-elevated)',
              color: mostrarHotspots ? 'var(--color-primary-border)' : 'var(--text-muted)',
              border: `1px solid ${mostrarHotspots ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-btn)',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
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
              letterSpacing: '0.05em',
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
                    borderRadius: 'var(--radius-card)',
                    backgroundColor: esSeleccionado ? 'var(--color-primary-light)' : '#FFFFFF',
                    border: `1px solid ${
                      esSeleccionado ? 'var(--color-primary)' : 'var(--border-color)'
                    }`,
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <b style={{ fontSize: '13px' }}>
                      {esSeleccionado ? '🚒 ' : ''}
                      {u.id}
                    </b>
                    <span
                      className={`badge-fire ${
                        u.estado === 'DISPONIBLE'
                          ? 'badge-fire-success'
                          : (u.estado === 'RESERVADO_SAGA' || u.estado === 'BLOQUEADO_SAGA')
                          ? 'badge-fire-warning'
                          : 'badge-fire-critical'
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
                    <span className="font-tactical-mono" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                      {u.litrosAguaActual} L
                    </span>
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
