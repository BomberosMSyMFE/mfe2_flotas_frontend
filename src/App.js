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
import { subscribeToForegroundMessages } from './services/firebaseMessaging';

// Perfiles de cabina pre-configurados para los camiones de Santa Cruz
const PERFILES_CABINA = {
  'B-04': { camionId: 'B-04', matricula: 'SGT-7721', nombre: 'Sgto. Juan Pérez (Cisterna Pesada)', estacion: 'Pampa de la Isla' },
  'B-01': { camionId: 'B-01', matricula: 'CB-1090', nombre: 'Cabo Marcos Soliz (Ataque Rápido)', estacion: 'Estación Central' },
  'B-06': { camionId: 'B-06', matricula: 'SOF-3312', nombre: 'Sof. David Méndez (Escala Telescópica)', estacion: 'Equipetrol' },
  'B-08': { camionId: 'B-08', matricula: 'TNTE-4022', nombre: 'Tnte. Carlos Rojas (Cisterna Pesada)', estacion: 'Parque Industrial' },
  'B-11': { camionId: 'B-11', matricula: 'BOM-8831', nombre: 'Bmb. Rodrigo Vargas (Rescate Liviano)', estacion: 'Plan 3000' },
};

export default function App() {
  // Detección reactiva de móvil (< 960px)
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 960 : false
  );

  // Sub-vista en móvil para el modo CABINA: 'MAPA' | 'CABINA'
  const [mobileCabinaView, setMobileCabinaView] = useState('MAPA');

  // Modal interactivo de ayuda de instalación PWA
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Pestaña principal: 'CABINA' | 'MACRO' | 'OUTBOX'
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

  // Listener para redimensionamiento de pantalla (Móvil vs Escritorio)
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 960);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

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
      console.log('[PWA] beforeinstallprompt listo');
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
      setShowInstallModal(true);
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
        .register('/firebase-messaging-sw.js')
        .then((reg) => {
          console.log('[App] Master Service Worker activo:', reg.scope);
          reg.update();
        })
        .catch((err) => {
          console.warn('[App] Service Worker error:', err);
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

  // Polling periódico cada 15 segundos
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

  // Listener de Notificaciones Push de Despacho Táctico (FCM)
  useEffect(() => {
    const unsubscribeFCM = subscribeToForegroundMessages((payload) => {
      console.log('[App] Despacho recibido en Foreground:', payload);
      const data = payload.data || {};
      if (data.latitud && data.longitud) {
        const destLat = parseFloat(data.latitud);
        const destLon = parseFloat(data.longitud);
        setIncidenteActivo({
          incidenteId: data.incidenteId || 'INC-DESPACHO-TACTICO',
          tipoFuego: data.tipoIncidente || 'INCENDIO',
          latitud: destLat,
          longitud: destLon,
          litrosMinimos: 8000,
        });
        if (camionSeleccionado) {
          handleCalcularRuta(camionSeleccionado.id);
        }
      }
      alert(`🚨 ORDEN DE DESPACHO RECIBIDA:\n${payload.notification?.title || 'Emergencia Despachada'}\n${payload.notification?.body || ''}`);
    });

    const handleSwMessage = (e) => {
      if (e.data && e.data.type === 'PUSH_DESPACHO_CLICKED') {
        const data = e.data.data || {};
        if (data.latitud && data.longitud) {
          const destLat = parseFloat(data.latitud);
          const destLon = parseFloat(data.longitud);
          setIncidenteActivo({
            incidenteId: data.incidenteId || 'INC-DESPACHO-TACTICO',
            tipoFuego: data.tipoIncidente || 'INCENDIO',
            latitud: destLat,
            longitud: destLon,
            litrosMinimos: 8000,
          });
          if (camionSeleccionado) {
            handleCalcularRuta(camionSeleccionado.id);
          }
        }
      }
    };
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      if (unsubscribeFCM) unsubscribeFCM();
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
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

  // Valores de ruta formateados de forma segura
  const distanciaKmStr = rutaCalculada
    ? (rutaCalculada.distanciaKm !== undefined
        ? rutaCalculada.distanciaKm.toFixed(1)
        : (rutaCalculada.distanciaTotalMetros ? (rutaCalculada.distanciaTotalMetros / 1000).toFixed(1) : '1.6'))
    : '1.6';

  const tiempoMinStr = rutaCalculada
    ? (rutaCalculada.tiempoMinutos !== undefined
        ? rutaCalculada.tiempoMinutos.toFixed(0)
        : (rutaCalculada.duracionEstimadaSegundos ? Math.max(1, Math.round(rutaCalculada.duracionEstimadaSegundos / 60)).toString() : '2'))
    : '2';

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
      {/* 1. BARRA SUPERIOR TOTALMENTE RESPONSIVA (MÓVIL Y ESCRITORIO)  */}
      {/* ============================================================== */}
      <header style={{
        backgroundColor: 'rgba(15, 23, 42, 0.98)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1100,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}>
        {/* FILA 1: IDENTIDAD, SELECTOR DE UNIDAD Y ESTADO */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '8px 12px' : '10px 18px',
          gap: '8px',
        }}>
          {/* Logo y Título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexShrink: 1 }}>
            <div style={{
              width: isMobile ? '32px' : '38px',
              height: isMobile ? '32px' : '38px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1.5px solid var(--color-emergency)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isMobile ? '16px' : '20px',
              flexShrink: 0,
            }}>
              🚒
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h1 style={{
                  fontSize: isMobile ? '13px' : '15px',
                  fontWeight: 800,
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {isMobile ? 'CABINA BOMBEROS' : 'CABINA TÁCTICA & VISOR GIS'}
                </h1>
                <span className="badge badge-emergency" style={{ fontSize: '9px', padding: '1px 5px' }}>
                  SCZ
                </span>
              </div>
              {!isMobile && (
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0 0' }}>
                  Santa Cruz de la Sierra &bull; Edge AI Offline &bull; PostGIS Routing
                </p>
              )}
            </div>
          </div>

          {/* SELECTOR DE UNIDAD / CABINA */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            padding: '3px 8px',
            borderRadius: '6px',
            border: '1px solid var(--color-tactical-blue)',
            flexShrink: 0,
          }}>
            <select
              value={camionSeleccionado?.id || 'B-04'}
              onChange={(e) => handleCambiarUnidad(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                color: '#93C5FD',
                border: 'none',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                outline: 'none',
              }}
              title="Cambiar la unidad de cabina asignada"
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id} style={{ backgroundColor: '#0F172A', color: '#F8FAFC' }}>
                  🚒 {u.id} {isMobile ? '' : `| ${u.placa} (${u.tipo})`}
                </option>
              ))}
            </select>
          </div>

          {/* ESTADO DE CONEXIÓN Y RELOJ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <div style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '3px 6px',
              borderRadius: '4px',
              backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.2)',
              border: isOnline ? '1px solid var(--color-success)' : '1px solid var(--color-emergency)',
              color: isOnline ? '#34D399' : '#F87171',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <span>{isOnline ? '●' : '▲'}</span>
              <span>{isOnline ? (isMobile ? 'RED' : 'ONLINE') : 'OFFLINE'}</span>
            </div>

            <div style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              padding: '3px 6px',
              borderRadius: '4px',
              color: 'var(--text-muted)',
            }}>
              {currentTime.slice(0, 5) || '--:--'}
            </div>
          </div>
        </div>

        {/* FILA 2: PESTAÑAS Y HERRAMIENTAS RÁPIDAS */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '4px 10px 8px 10px' : '0 18px 8px 18px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          gap: '6px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          {/* Pestañas Principales */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => setActiveTab('CABINA')}
              style={{
                padding: isMobile ? '5px 10px' : '6px 12px',
                borderRadius: '6px',
                fontSize: isMobile ? '11px' : '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeTab === 'CABINA' ? '1px solid var(--color-tactical-blue)' : '1px solid transparent',
                backgroundColor: activeTab === 'CABINA' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'CABINA' ? '#93C5FD' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              🚒 CABINA & RUTA
            </button>

            <button
              onClick={() => setActiveTab('MACRO')}
              style={{
                padding: isMobile ? '5px 10px' : '6px 12px',
                borderRadius: '6px',
                fontSize: isMobile ? '11px' : '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeTab === 'MACRO' ? '1px solid var(--color-ai-purple)' : '1px solid transparent',
                backgroundColor: activeTab === 'MACRO' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'MACRO' ? '#C4B5FD' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              🌐 FLOTAS MACRO
            </button>

            <button
              onClick={() => setActiveTab('OUTBOX')}
              style={{
                padding: isMobile ? '5px 10px' : '6px 12px',
                borderRadius: '6px',
                fontSize: isMobile ? '11px' : '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: activeTab === 'OUTBOX' ? '1px solid var(--color-warning)' : '1px solid transparent',
                backgroundColor: activeTab === 'OUTBOX' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'OUTBOX' ? '#FCD34D' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              📦 OUTBOX
              {pendingCount > 0 && (
                <span style={{
                  backgroundColor: 'var(--color-emergency)',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  padding: '1px 5px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          {/* Botones de Simulación Offline e Instalación PWA */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={handleToggleSimulatedOffline}
              style={{
                padding: '4px 8px',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border: isSimulatingOffline ? '1px solid var(--color-emergency)' : '1px solid var(--border-subtle)',
                backgroundColor: isSimulatingOffline ? 'var(--color-emergency)' : 'rgba(255, 255, 255, 0.06)',
                color: isSimulatingOffline ? '#FFFFFF' : '#CBD5E1',
                whiteSpace: 'nowrap',
              }}
              title="Simular pérdida de señal de radio o celular"
            >
              {isSimulatingOffline ? '🔴 OFFLINE' : '📶 SIMULAR'}
            </button>

            <button
              onClick={handleInstallApp}
              style={{
                padding: '4px 8px',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid #10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#6EE7B7',
                whiteSpace: 'nowrap',
              }}
              title="Instalar en Celular o Tablet"
            >
              📲 INSTALAR
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. CONTENIDO PRINCIPAL: CABINA UNIFICADA | PANORAMA | OUTBOX   */}
      {/* ============================================================== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        
        {/* MODO 1: CABINA DE BOMBEROS CON MAPA CARTOGRÁFICO INTEGRADO */}
        {activeTab === 'CABINA' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100%', height: '100%', overflow: 'hidden' }}>
            
            {/* SUB-BARRA DE CONMUTACIÓN PARA MÓVILES: [MAPA] vs [MANDOS CABINA] */}
            {isMobile && (
              <div style={{
                display: 'flex',
                backgroundColor: '#0F172A',
                borderBottom: '1px solid var(--border-subtle)',
                padding: '6px 8px',
                gap: '8px',
                zIndex: 1000,
              }}>
                <button
                  onClick={() => setMobileCabinaView('MAPA')}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: mobileCabinaView === 'MAPA' ? '2px solid var(--color-tactical-blue)' : '1px solid var(--border-subtle)',
                    backgroundColor: mobileCabinaView === 'MAPA' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                    color: mobileCabinaView === 'MAPA' ? '#93C5FD' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  🗺️ MAPA DE RUTA ({camionSeleccionado?.id || 'B-04'})
                </button>

                <button
                  onClick={() => setMobileCabinaView('CABINA')}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: mobileCabinaView === 'CABINA' ? '2px solid var(--color-emergency)' : '1px solid var(--border-subtle)',
                    backgroundColor: mobileCabinaView === 'CABINA' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                    color: mobileCabinaView === 'CABINA' ? '#FCA5A5' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  🚒 MANDOS DE CABINA & IA
                </button>
              </div>
            )}

            {/* SECCIÓN DEL MAPA (Visible en desktop o cuando en móvil se elige 'MAPA') */}
            {(!isMobile || mobileCabinaView === 'MAPA') && (
              <div style={{
                flex: isMobile ? 1 : '1 1 60%',
                height: '100%',
                width: isMobile ? '100%' : 'auto',
                position: 'relative',
                borderRight: isMobile ? 'none' : '1px solid var(--border-subtle)',
                overflow: 'hidden',
              }}>
                {/* TARJETA FLOTANTE DE INFORMACIÓN DE RUTA (RESPONSIVA, SIN TRASLAPE) */}
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  right: '10px',
                  zIndex: 999,
                  backgroundColor: 'rgba(15, 23, 42, 0.94)',
                  backdropFilter: 'blur(12px)',
                  padding: isMobile ? '8px 12px' : '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}>
                  {/* Fila 1: Título e Incidente Destino */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '16px' }}>🧭</span>
                      <span style={{ fontSize: isMobile ? '11px' : '12px', fontWeight: 800, color: '#F8FAFC' }}>
                        RUTA: {camionSeleccionado?.id || 'B-04'} ➔ {incidenteActivo.incidenteId}
                      </span>
                    </div>
                    <span className="badge badge-emergency" style={{ fontSize: '9px', padding: '1px 5px' }}>
                      INCENDIO INDUSTRIAL
                    </span>
                  </div>

                  {/* Fila 2: Métricas de Distancia y Tiempo */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Distancia:</span>
                      <strong style={{ color: '#60A5FA', fontFamily: 'var(--font-mono)' }}>
                        {distanciaKmStr} km
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>ETA estimado:</span>
                      <strong style={{ color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                        {tiempoMinStr} min
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Hidrantes:</span>
                      <strong style={{ color: '#06B6D4', fontFamily: 'var(--font-mono)' }}>
                        {hidrantes.length}
                      </strong>
                    </div>
                  </div>

                  {/* Fila 3: Botones de Acción Táctica en Ruta */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleCalcularRuta(camionSeleccionado?.id)}
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        border: '1px solid var(--color-tactical-blue)',
                        color: '#93C5FD',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: isMobile ? '10px' : '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🔄 RECALCULAR
                    </button>

                    <button
                      onClick={() => handleSimularTelemetria(camionSeleccionado?.id)}
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid var(--color-success)',
                        color: '#6EE7B7',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: isMobile ? '10px' : '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title="Simular avance vial de la unidad hacia el siniestro"
                    >
                      ▶ AVANZAR RUTA
                    </button>

                    {isMobile && (
                      <button
                        onClick={() => setMobileCabinaView('CABINA')}
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.25)',
                          border: '1px solid var(--color-emergency)',
                          color: '#FCA5A5',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        🚒 MANDOS ➔
                      </button>
                    )}
                  </div>
                </div>

                {/* Mapa Leaflet interactivo */}
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
            )}

            {/* SECCIÓN DE LA CABINA TÁCTICA (Visible en desktop o cuando en móvil se elige 'CABINA') */}
            {(!isMobile || mobileCabinaView === 'CABINA') && (
              <div style={{
                flex: isMobile ? 1 : '1 1 40%',
                maxWidth: isMobile ? '100%' : '540px',
                minWidth: isMobile ? '100%' : '380px',
                height: '100%',
                backgroundColor: 'rgba(15, 23, 42, 0.98)',
                borderLeft: isMobile ? 'none' : '1px solid var(--border-subtle)',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                display: 'flex',
                flexDirection: 'column',
                padding: isMobile ? '12px' : '16px',
                gap: '12px',
              }}>
                {/* Botón flotante para volver al mapa en móvil */}
                {isMobile && (
                  <button
                    onClick={() => setMobileCabinaView('MAPA')}
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid var(--color-tactical-blue)',
                      color: '#93C5FD',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    ⬅️ VOLVER AL MAPA DE NAVEGACIÓN
                  </button>
                )}

                {/* Tarjeta de Telemetría e Identidad de la Cabina */}
                <div style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-emergency)', letterSpacing: '0.5px' }}>
                        UNIDAD SELECCIONADA
                      </span>
                      <h2 style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: 800, margin: '2px 0 0 0' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                    {/* Tanque de Agua */}
                    <div style={{
                      backgroundColor: 'rgba(6, 182, 212, 0.08)',
                      border: '1px solid rgba(6, 182, 212, 0.25)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                        <span style={{ color: '#06B6D4', fontWeight: 700 }}>💧 AGUA</span>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>
                          {camionSeleccionado?.litrosAguaActual || 4000} L
                        </strong>
                      </div>
                      <div style={{
                        height: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderRadius: '3px',
                        marginTop: '5px',
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
                      padding: '8px 10px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                        <span style={{ color: '#F59E0B', fontWeight: 700 }}>⛽ DIESEL</span>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>
                          {camionSeleccionado?.combustiblePorcentaje || 88}%
                        </strong>
                      </div>
                      <div style={{
                        height: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderRadius: '3px',
                        marginTop: '5px',
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
            )}
          </div>
        )}

        {/* MODO 2: PANORAMA MACRO DE TODAS LAS FLOTAS */}
        {activeTab === 'MACRO' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: isMobile ? '1 1 50%' : '1 1 65%', height: '100%', position: 'relative' }}>
              <VisorCartografico
                unidades={unidades}
                hidrantes={hidrantes}
                incidenteActivo={incidenteActivo}
                rutaCalculada={rutaCalculada}
                hotspots={mostrarHotspots ? hotspots : []}
                onCamionClick={(camion) => {
                  setCamionSeleccionado(camion);
                  setActiveTab('CABINA');
                  if (isMobile) setMobileCabinaView('MAPA');
                }}
                onTrazarRuta={handleCalcularRuta}
              />
            </div>

            <div style={{
              flex: isMobile ? '1 1 50%' : '1 1 35%',
              maxWidth: isMobile ? '100%' : '440px',
              height: '100%',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}>
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
          </div>
        )}

        {/* MODO 3: BANDEJA DE SALIDA LOCAL (OUTBOX) */}
        {activeTab === 'OUTBOX' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px' : '20px', backgroundColor: 'var(--bg-primary)' }}>
            <div style={{ maxWidth: '850px', margin: '0 auto' }}>
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

      {/* ============================================================== */}
      {/* 3. MODAL DE ASISTENCIA PARA INSTALACIÓN PWA EN CELULARES       */}
      {/* ============================================================== */}
      {showInstallModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}>
          <div style={{
            backgroundColor: '#1E293B',
            border: '2px solid var(--color-tactical-blue)',
            borderRadius: '12px',
            maxWidth: '480px',
            width: '100%',
            padding: '20px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>📲</span>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#F8FAFC' }}>
                  Instalar en tu Celular o Tablet
                </h3>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#FDE68A',
              lineHeight: 1.4,
            }}>
              <strong>⚠️ ¿Por qué Chrome dice "No se puede instalar esta app"?</strong><br />
              Por políticas de seguridad de Google y Android, la instalación de APKs automáticos exige certificado SSL HTTPS. Al ingresar por dirección IP directa (HTTP), Chrome bloquea la instalación de APK y requiere usar el acceso directo PWA.
            </div>

            <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#E2E8F0' }}>
              <strong>Pasos sencillos para instalarla como App en pantalla completa:</strong>
              <ol style={{ paddingLeft: '20px', marginTop: '6px' }}>
                <li>Toca los <strong>3 puntos verticales (⋮)</strong> arriba a la derecha en Google Chrome.</li>
                <li>Selecciona la opción <strong>"Agregar a la pantalla principal"</strong> (o <em>"Añadir a pantalla de inicio"</em>).</li>
                <li>Presiona <strong>"Agregar"</strong>.</li>
              </ol>
            </div>

            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#6EE7B7',
            }}>
              ✓ Se creará el ícono <strong>🚒 BomberoCabina</strong> en tu celular que abrirá en <strong>pantalla completa (sin barra de direcciones de Chrome)</strong>, con soporte offline y Web Worker AI.
            </div>

            <button
              onClick={() => setShowInstallModal(false)}
              style={{
                backgroundColor: 'var(--color-tactical-blue)',
                border: 'none',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: '4px',
              }}
            >
              ENTENDIDO, VOLVER A LA CABINA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
