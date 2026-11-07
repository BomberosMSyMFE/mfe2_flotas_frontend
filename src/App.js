import React, { useState, useEffect, useCallback, useRef } from 'react';
import VisorCartografico from './components/VisorCartografico';
import TacticalHud from './components/TacticalHud';
import TacticalActions from './components/TacticalActions';
import EvidenceCapture from './components/EvidenceCapture';
import OutboxVisualizer from './components/OutboxVisualizer';
import {
  fetchUnidadesActivas,
  fetchRutaOptima,
  registrarTelemetria,
  reservarCamionSaga,
  liberarCamionSaga,
  getFlotasApiBase,
} from './services/flotasApi';
import { fetchHotspotsDemo, fetchHidrantesMcp } from './services/mcpApi';
import { syncManager } from './services/syncManager';
import { getAllOutboxEvidences } from './services/indexedDbOutbox';

// Perfiles de cabina pre-configurados para los camiones de Santa Cruz
const PERFILES_CABINA = {
  'B-04': { camionId: 'B-04', matricula: 'SGT-7721', nombre: 'Sgto. Juan Pérez (Cisterna Pesada)', estacion: 'Pampa de la Isla' },
  'B-01': { camionId: 'B-01', matricula: 'CB-1090', nombre: 'Cabo Marcos Soliz (Ataque Rápido)', estacion: 'Estación Central' },
  'B-06': { camionId: 'B-06', matricula: 'SOF-3312', nombre: 'Sof. David Méndez (Escala Telescópica)', estacion: 'Equipetrol' },
  'B-08': { camionId: 'B-08', matricula: 'TNTE-4022', nombre: 'Tnte. Carlos Rojas (Cisterna Pesada)', estacion: 'Parque Industrial' },
  'B-11': { camionId: 'B-11', matricula: 'BOM-8831', nombre: 'Bmb. Rodrigo Vargas (Rescate Liviano)', estacion: 'Plan 3000' },
};

export default function App() {
  // Pestaña principal: 'CABINA' (Cabina + Mapa de Ruta) | 'MACRO' (Panorama Flotas GIS) | 'OUTBOX' (Bandeja Local)
  const [activeTab, setActiveTab] = useState('CABINA');

  // Estado de flotas e incidentes
  const [unidades, setUnidades] = useState([]);
  const [hidrantes, setHidrantes] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [mostrarHotspots, setMostrarHotspots] = useState(false);
  const [camionSeleccionado, setCamionSeleccionado] = useState(null);
  const [rutaCalculada, setRutaCalculada] = useState(null);
  const [telemetryStep, setTelemetryStep] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  // Estados de conectividad y Outbox PWA
  const [isOnline, setIsOnline] = useState(syncManager.getEffectiveOnlineStatus());
  const [isSimulatingOffline, setIsSimulatingOffline] = useState(syncManager.isSimulatingOffline);
  const [isSyncing, setIsSyncing] = useState(false);
  const [evidences, setEvidences] = useState([]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // Incidente activo (Parque Industrial Santa Cruz)
  const [incidenteActivo, setIncidenteActivo] = useState({
    incidenteId: 'INC-2026-SCZ-101',
    tipoFuego: 'INDUSTRIAL',
    latitud: -17.7833,
    longitud: -63.1821,
    litrosMinimos: 8000,
  });

  // Reloj local en tiempo real
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

  // Capturar evento PWA de instalación
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('[PWA] Evento beforeinstallprompt capturado');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      console.log('[PWA] Selección de usuario:', choice);
      setDeferredPrompt(null);
    } else {
      alert("🚒 Instalación de Cabina Táctica de Bomberos:\n\n1. En PC: Abre el menú de Chrome (3 puntos verticales) ➔ 'Guardar y compartir' ➔ 'Instalar página como aplicación'.\n\n2. En Celular: Menú de Chrome ➔ 'Instalar aplicación' o 'Agregar a la pantalla principal'.");
    }
  };

  // Cargar registros de la cola IndexedDB Outbox
  const refreshEvidences = useCallback(async () => {
    try {
      const items = await getAllOutboxEvidences();
      setEvidences(items || []);
    } catch (err) {
      console.error('[App] Error al leer IndexedDB:', err);
    }
  }, []);

  // Suscripción al gestor de sincronización offline
  useEffect(() => {
    refreshEvidences();

    const unsubscribe = syncManager.subscribe((event, data) => {
      if (event === 'NETWORK_CHANGE') {
        setIsOnline(data.isOnline);
      } else if (event === 'SYNC_STARTED') {
        setIsSyncing(true);
      } else if (event === 'SYNC_FINISHED' || event === 'ITEM_CONFIRMED') {
        setIsSyncing(false);
        refreshEvidences();
      }
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[App] Service Worker activo con scope:', reg.scope);
          reg.update();
        })
        .catch((err) => {
          console.warn('[App] Service Worker no registrado:', err);
        });
    }

    return () => {
      unsubscribe();
    };
  }, [refreshEvidences]);

  // Carga de datos de flota desde Spring Boot (:8082) y FastMCP (:8005)
  const cargarDatos = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const listaUnidades = await fetchUnidadesActivas();
      if (listaUnidades && listaUnidades.length > 0) {
        setUnidades(listaUnidades);

        setCamionSeleccionado((prev) => {
          if (!prev) return listaUnidades.find(u => u.id === 'B-04') || listaUnidades[0];
          const actualizado = listaUnidades.find(u => u.id === prev.id);
          return actualizado || listaUnidades[0];
        });
      }

      const listaHidrantes = await fetchHidrantesMcp(-17.7833, -63.1821, 1000);
      if (listaHidrantes) setHidrantes(listaHidrantes);

      const mlHotspots = await fetchHotspotsDemo();
      if (mlHotspots && mlHotspots.zonas_criticas) {
        setHotspots(mlHotspots.zonas_criticas);
      }
    } catch (e) {
      console.error('[MFE-02] Error cargando datos de flotas:', e);
    } finally {
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 300);
      } else {
        setIsRefreshing(false);
      }
    }
  }, []);

  // Polling automático cada 15 segundos
  useEffect(() => {
    cargarDatos(false);
    const interval = setInterval(() => {
      cargarDatos(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [cargarDatos]);

  // Calcular ruta óptima vial hacia el incidente
  const handleCalcularRuta = useCallback(async (camionId) => {
    const camion = unidades.find(u => u.id === camionId) || camionSeleccionado || unidades[0];
    if (!camion || !incidenteActivo) return;

    setCamionSeleccionado(camion);
    setTelemetryStep(0);

    const ruta = await fetchRutaOptima(
      camion.latitud,
      camion.longitud,
      incidenteActivo.latitud,
      incidenteActivo.longitud
    );

    if (ruta) {
      setRutaCalculada(ruta);
    }
  }, [unidades, camionSeleccionado, incidenteActivo]);

  // Recalcular ruta automáticamente al cambiar de camión seleccionado
  const lastSelectedCamionIdRef = useRef(null);
  useEffect(() => {
    if (camionSeleccionado && camionSeleccionado.id !== lastSelectedCamionIdRef.current) {
      lastSelectedCamionIdRef.current = camionSeleccionado.id;
      handleCalcularRuta(camionSeleccionado.id);
    }
  }, [camionSeleccionado, handleCalcularRuta]);

  // Manejar cambio de perfil/unidad desde el selector del operador o cabina
  const handleCambiarUnidad = (id) => {
    const encontrado = unidades.find(u => u.id === id);
    if (encontrado) {
      setCamionSeleccionado(encontrado);
    }
  };

  // Simulación de avance de telemetría a lo largo de las calles
  const handleSimularTelemetria = async (camionId) => {
    const camion = unidades.find(u => u.id === camionId) || camionSeleccionado || unidades[0];
    if (!camion) return;

    let nuevaLat = camion.latitud;
    let nuevaLon = camion.longitud;
    let nuevoAgua = Math.max((camion.litrosAguaActual || 4000) - 250, 400);
    let nuevaVelocidad = 52.0;

    const coordinates = rutaCalculada?.geometriaGeoJson?.coordinates;
    if (coordinates && coordinates.length > 0) {
      const nextStep = Math.min(telemetryStep + 4, coordinates.length - 1);
      const targetPoint = coordinates[nextStep];
      nuevaLon = targetPoint[0];
      nuevaLat = targetPoint[1];
      setTelemetryStep(nextStep);

      if (nextStep >= coordinates.length - 1) {
        nuevaVelocidad = 0.0;
      }
    } else {
      nuevaLat = camion.latitud + (incidenteActivo.latitud - camion.latitud) * 0.2;
      nuevaLon = camion.longitud + (incidenteActivo.longitud - camion.longitud) * 0.2;
    }

    await registrarTelemetria(
      camion.id,
      nuevaLat,
      nuevaLon,
      nuevoAgua,
      Math.max((camion.combustiblePorcentaje || 80) - 1, 15),
      nuevaVelocidad > 0 ? 'EN_TRANSITO' : 'EN_ESCENA',
      nuevaVelocidad
    );

    await cargarDatos();
  };

  // SAGA Reserva
  const handleReservarSaga = async (camionId) => {
    const camion = unidades.find(u => u.id === camionId) || camionSeleccionado || unidades[0];
    const data = await reservarCamionSaga(
      incidenteActivo.incidenteId,
      incidenteActivo.tipoFuego,
      camion ? camion.latitud : incidenteActivo.latitud,
      camion ? camion.longitud : incidenteActivo.longitud,
      1000
    );
    await cargarDatos(true);
    return data;
  };

  // SAGA Liberar / Compensar
  const handleCompensarSaga = async (camionId) => {
    const id = camionId || camionSeleccionado?.id || 'B-04';
    const data = await liberarCamionSaga(incidenteActivo.incidenteId, id);
    await cargarDatos(true);
    return data;
  };

  // Toggle de simulación offline
  const handleToggleSimulatedOffline = () => {
    const nextState = !isSimulatingOffline;
    setIsSimulatingOffline(nextState);
    syncManager.setSimulatedOffline(nextState);
  };

  const pendingCount = evidences.filter((e) => e.status === 'PENDIENTE_SYNC').length;
  const perfilActivo = PERFILES_CABINA[camionSeleccionado?.id] || {
    camionId: camionSeleccionado?.id || 'B-04',
    matricula: camionSeleccionado?.placa || 'SGT-7721',
    nombre: 'Bombero de Turno (Unidad Activa)',
    estacion: camionSeleccionado?.estacionOrigen || 'Central',
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-main)',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* ============================================================== */}
      {/* 1. BARRA SUPERIOR INSTITUCIONAL Y SELECTOR TÁCTICO DE UNIDAD  */}
      {/* ============================================================== */}
      <header style={{
        height: '66px',
        backgroundColor: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        zIndex: 1100,
        gap: '12px',
      }}>
        {/* Identidad Institucional */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '320px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid var(--color-emergency)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            boxShadow: '0 0 12px rgba(239, 68, 68, 0.3)',
          }}>
            🚒
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.4px', margin: 0 }}>
                CABINA TÁCTICA & VISOR CARTOGRÁFICO
              </h1>
              <span className="badge badge-emergency" style={{ fontSize: '9px', padding: '2px 6px' }}>
                MFE-02
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Santa Cruz de la Sierra &bull; Edge AI Offline (Web Worker) &bull; IndexedDB UUID v7
            </p>
          </div>
        </div>

        {/* SELECTOR DE UNIDAD / CABINA (Permite al Operador o Bombero conmutar de unidad) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(30, 41, 59, 0.7)',
          padding: '4px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#93C5FD' }}>
            🚒 CABINA / UNIDAD:
          </span>
          <select
            value={camionSeleccionado?.id || 'B-04'}
            onChange={(e) => handleCambiarUnidad(e.target.value)}
            style={{
              backgroundColor: '#0F172A',
              color: '#F8FAFC',
              border: '1px solid var(--color-tactical-blue)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              outline: 'none',
            }}
            title="El operador puede ingresar a la cabina de cualquier bombero o unidad"
          >
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                🚒 {u.id} | {u.placa} ({u.tipo}) - {PERFILES_CABINA[u.id]?.nombre?.split('(')[0] || u.estacionOrigen}
              </option>
            ))}
          </select>
        </div>

        {/* PESTAÑAS DE VISTA: CABINA UNIFICADA | PANORAMA GENERAL | BANDEJA OUTBOX */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setActiveTab('CABINA')}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: activeTab === 'CABINA' ? '1px solid var(--color-tactical-blue)' : '1px solid transparent',
              backgroundColor: activeTab === 'CABINA' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === 'CABINA' ? '#93C5FD' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🚒 CABINA & RUTA GIS
          </button>

          <button
            onClick={() => setActiveTab('MACRO')}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: activeTab === 'MACRO' ? '1px solid var(--color-ai-purple)' : '1px solid transparent',
              backgroundColor: activeTab === 'MACRO' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === 'MACRO' ? '#C4B5FD' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🌐 PANORAMA FLOTAS
          </button>

          <button
            onClick={() => setActiveTab('OUTBOX')}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: activeTab === 'OUTBOX' ? '1px solid var(--color-warning)' : '1px solid transparent',
              backgroundColor: activeTab === 'OUTBOX' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === 'OUTBOX' ? '#FCD34D' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📦 OUTBOX LOCAL
            {pendingCount > 0 && (
              <span style={{
                backgroundColor: 'var(--color-emergency)',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* CONTROLES DE RED, RELOJ Y SIMULACIÓN OFFLINE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Reloj local */}
          <div style={{
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-main)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
          }}>
            🕒 {currentTime || '--:--:--'}
          </div>

          {/* Estado de Red */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: '6px',
            backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.2)',
            border: isOnline ? '1px solid var(--color-success)' : '1px solid var(--color-emergency)',
            color: isOnline ? '#34D399' : '#F87171',
          }}>
            <span style={{ fontSize: '9px' }}>{isOnline ? '●' : '▲'}</span>
            {isOnline ? 'EN LÍNEA' : 'SIN SEÑAL'}
          </div>

          {/* Toggle de Simulación Offline */}
          <button
            onClick={handleToggleSimulatedOffline}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: isSimulatingOffline ? '1px solid var(--color-emergency)' : '1px solid var(--border-subtle)',
              backgroundColor: isSimulatingOffline ? 'var(--color-emergency)' : 'rgba(255, 255, 255, 0.06)',
              color: isSimulatingOffline ? '#FFFFFF' : '#CBD5E1',
            }}
            title="Simular pérdida total de señal de radio/red celular en terreno"
          >
            {isSimulatingOffline ? '🔴 OFFLINE FORZADO' : '📶 SIMULAR OFFLINE'}
          </button>

          {/* Botón Instalar PWA */}
          <button
            onClick={handleInstallApp}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid #10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#6EE7B7',
            }}
            title="Instalar en Celular o Tablet de Cabina como PWA nativa"
          >
            📲 INSTALAR PWA
          </button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. CONTENIDO PRINCIPAL: CABINA UNIFICADA | PANORAMA | OUTBOX   */}
      {/* ============================================================== */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* MODO 1: CABINA DE BOMBEROS CON MAPA CARTOGRÁFICO INTEGRADO */}
        {activeTab === 'CABINA' && (
          <div style={{ flex: 1, display: 'flex', width: '100%', height: '100%' }}>
            {/* PANEL IZQUIERDO: MAPA CARTOGRÁFICO CON RUTA DE NAVEGACIÓN */}
            <div style={{
              flex: '1 1 60%',
              height: '100%',
              position: 'relative',
              borderRight: '1px solid var(--border-subtle)',
            }}>
              {/* Overlay Superior de Navegación Vial */}
              <div style={{
                position: 'absolute',
                top: '12px',
                left: '14px',
                right: '14px',
                zIndex: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(10px)',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>🧭</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#F8FAFC' }}>
                      RUTA A INCENDIO: {incidenteActivo.incidenteId} (Parque Industrial)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Desde posición de <strong>{camionSeleccionado?.id || 'B-04'}</strong> &bull; PostGIS A* Routing
                    </div>
                  </div>
                </div>

                {rutaCalculada && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>DISTANCIA</span>
                      <strong style={{ fontSize: '13px', color: '#60A5FA', fontFamily: 'var(--font-mono)' }}>
                        {rutaCalculada.distanciaKm?.toFixed(1) || '4.2'} km
                      </strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>TIEMPO ESTIMADO</span>
                      <strong style={{ fontSize: '13px', color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                        {rutaCalculada.tiempoMinutos?.toFixed(0) || '7'} min
                      </strong>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleCalcularRuta(camionSeleccionado?.id)}
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid var(--color-tactical-blue)',
                      color: '#93C5FD',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 RECALCULAR
                  </button>
                  <button
                    onClick={() => handleSimularTelemetria(camionSeleccionado?.id)}
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid var(--color-success)',
                      color: '#6EE7B7',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Simula que el camión avanza por las calles hacia el fuego"
                  >
                    ▶ AVANZAR RUTA
                  </button>
                </div>
              </div>

              {/* Visor Cartográfico Leaflet */}
              <VisorCartografico
                unidades={unidades}
                hidrantes={hidrantes}
                incidenteActivo={incidenteActivo}
                rutaCalculada={rutaCalculada}
                hotspots={mostrarHotspots ? hotspots : []}
                onCamionClick={(camion) => setCamionSeleccionado(camion)}
                onTrazarRuta={handleCalcularRuta}
              />
            </div>

            {/* PANEL DERECHO: CABINA TÁCTICA DE OPERACIONES (Manos con Guantes + IA Local) */}
            <div style={{
              flex: '1 1 40%',
              maxWidth: '560px',
              minWidth: '400px',
              height: '100%',
              backgroundColor: 'rgba(15, 23, 42, 0.98)',
              borderLeft: '1px solid var(--border-subtle)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              padding: '16px',
              gap: '14px',
            }}>
              {/* Tarjeta de Telemetría e Identidad de la Cabina */}
              <div style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-emergency)', letterSpacing: '0.5px' }}>
                      CABINA ASIGNADA
                    </span>
                    <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '2px 0 0 0' }}>
                      {perfilActivo.nombre}
                    </h2>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Placa: <strong>{camionSeleccionado?.placa || '2190-ABC'}</strong> &bull; Base: {perfilActivo.estacion}
                    </span>
                  </div>
                  <span className={`badge ${
                    camionSeleccionado?.estado === 'EN_TRANSITO' ? 'badge-tactical' :
                    camionSeleccionado?.estado === 'EN_ESCENA' ? 'badge-emergency' : 'badge-success'
                  }`}>
                    {camionSeleccionado?.estado || 'DISPONIBLE'}
                  </span>
                </div>

                {/* Medidores de Agua y Combustible */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                  {/* Tanque de Agua */}
                  <div style={{
                    backgroundColor: 'rgba(6, 182, 212, 0.08)',
                    border: '1px solid rgba(6, 182, 212, 0.25)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                      <span style={{ color: '#06B6D4', fontWeight: 700 }}>💧 TANQUE AGUA</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {camionSeleccionado?.litrosAguaActual || 4000} L
                      </strong>
                    </div>
                    <div style={{
                      height: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '3px',
                      marginTop: '6px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, ((camionSeleccionado?.litrosAguaActual || 4000) / (camionSeleccionado?.capacidadMaximaAgua || 4000)) * 100)}%`,
                        backgroundColor: '#06B6D4',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>

                  {/* Combustible */}
                  <div style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                      <span style={{ color: '#F59E0B', fontWeight: 700 }}>⛽ COMBUSTIBLE</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {camionSeleccionado?.combustiblePorcentaje || 88}%
                      </strong>
                    </div>
                    <div style={{
                      height: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '3px',
                      marginTop: '6px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${camionSeleccionado?.combustiblePorcentaje || 88}%`,
                        backgroundColor: '#F59E0B',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Comandos Rápidos de Cabina (Manos con Guantes) */}
              <TacticalActions
                camionId={camionSeleccionado?.id || 'B-04'}
                isOnline={isOnline}
                onActionRecorded={() => {
                  cargarDatos(true);
                  refreshEvidences();
                }}
              />

              {/* Captura de Evidencias e IA Local en Web Worker */}
              <EvidenceCapture
                camionId={camionSeleccionado?.id || 'B-04'}
                matricula={perfilActivo.matricula}
                incidenteId={incidenteActivo.incidenteId}
                isOnline={isOnline}
                onEvidenceSaved={() => refreshEvidences()}
              />
            </div>
          </div>
        )}

        {/* MODO 2: PANORAMA MACRO DE FLOTAS Y RIESGOS GIS (CENTRO DE OPERACIONES) */}
        {activeTab === 'MACRO' && (
          <div style={{ flex: 1, display: 'flex', width: '100%', height: '100%' }}>
            <div style={{ flex: 1, height: '100%', position: 'relative' }}>
              <VisorCartografico
                unidades={unidades}
                hidrantes={hidrantes}
                incidenteActivo={incidenteActivo}
                rutaCalculada={rutaCalculada}
                hotspots={mostrarHotspots ? hotspots : []}
                onCamionClick={(camion) => {
                  setCamionSeleccionado(camion);
                  setActiveTab('CABINA'); // Al dar click en un camión en el macro mapa, abre su cabina!
                }}
                onTrazarRuta={handleCalcularRuta}
              />
            </div>

            <TacticalHud
              unidades={unidades}
              camionSeleccionado={camionSeleccionado}
              onSeleccionarCamion={(camion) => setCamionSeleccionado(camion)}
              incidenteActivo={incidenteActivo}
              rutaInfo={rutaCalculada}
              onActualizarFlotas={() => cargarDatos(true)}
              isRefreshing={isRefreshing}
              onCalcularRuta={handleCalcularRuta}
              onReservarSaga={handleReservarSaga}
              onCompensarSaga={handleCompensarSaga}
              onSimularTelemetria={handleSimularTelemetria}
              toggleHotspots={() => setMostrarHotspots(!mostrarHotspots)}
              mostrarHotspots={mostrarHotspots}
            />
          </div>
        )}

        {/* MODO 3: BANDEJA DE SALIDA LOCAL (OUTBOX INDEXEDDB) */}
        {activeTab === 'OUTBOX' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: 'var(--bg-primary)' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <OutboxVisualizer
                evidences={evidences}
                isSyncing={isSyncing}
                isOnline={isOnline}
                onRefresh={refreshEvidences}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
