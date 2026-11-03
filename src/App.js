import React, { useState, useEffect, useCallback } from 'react';
import VisorCartografico from './components/VisorCartografico';
import TacticalHud from './components/TacticalHud';
import { fetchUnidadesActivas, fetchRutaOptima, registrarTelemetria } from './services/flotasApi';
import { fetchHotspotsDemo, fetchHidrantesMcp } from './services/mcpApi';

export default function App() {
  const [unidades, setUnidades] = useState([]);
  const [hidrantes, setHidrantes] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [mostrarHotspots, setMostrarHotspots] = useState(true);
  const [camionSeleccionado, setCamionSeleccionado] = useState(null);
  const [rutaCalculada, setRutaCalculada] = useState(null);
  const [telemetryStep, setTelemetryStep] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Incidente demo inicial en Parque Industrial de Santa Cruz de la Sierra
  const [incidenteActivo, setIncidenteActivo] = useState({
    incidenteId: 'INC-2026-SCZ-101',
    tipoFuego: 'INDUSTRIAL',
    latitud: -17.7833,
    longitud: -63.1821,
    litrosMinimos: 8000
  });

  // Carga de datos desde Spring Boot (8080) y FastMCP (8005)
  const cargarDatos = useCallback(async (isManual = false) => {
    try {
      if (isManual) {
        setIsRefreshing(true);
      }
      const listaUnidades = await fetchUnidadesActivas();
      if (listaUnidades && listaUnidades.length > 0) {
        setUnidades(listaUnidades);

        // Mantener sincronizado el camión seleccionado usando el actualizador funcional para no romper dependencias
        setCamionSeleccionado((prev) => {
          if (!prev) return listaUnidades[0];
          const actualizado = listaUnidades.find(u => u.id === prev.id);
          if (!actualizado) return listaUnidades[0];
          // Solo cambiar referencia si realmente cambió estado o ubicación
          if (
            actualizado.estado === prev.estado &&
            actualizado.latitud === prev.latitud &&
            actualizado.longitud === prev.longitud &&
            actualizado.litrosAguaActual === prev.litrosAguaActual &&
            actualizado.combustiblePorcentaje === prev.combustiblePorcentaje
          ) {
            return prev;
          }
          return actualizado;
        });
      }

      const listaHidrantes = await fetchHidrantesMcp(-17.7833, -63.1821, 1000);
      if (listaHidrantes) {
        setHidrantes(listaHidrantes);
      }

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
  }, []); // Sin dependencias para garantizar función estable y evitar bucle de re-renderizado

  // Actualización automática periódica cada 15 segundos sin bloquear el hilo principal
  useEffect(() => {
    cargarDatos(false);
    const interval = setInterval(() => {
      cargarDatos(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [cargarDatos]);

  // Handler para cálculo de ruta óptima (CU-04)
  const handleCalcularRuta = async (camionId) => {
    const camion = unidades.find(u => u.id === camionId) || camionSeleccionado || unidades[0];
    if (!camion || !incidenteActivo) return;

    // Sincronizar camión seleccionado
    setCamionSeleccionado(camion);
    setTelemetryStep(0); // Reiniciar paso de simulación de ruta

    const ruta = await fetchRutaOptima(
      camion.latitud,
      camion.longitud,
      incidenteActivo.latitud,
      incidenteActivo.longitud
    );

    if (ruta) {
      setRutaCalculada(ruta);
    }
  };

  // Handler para SAGA Reserva (CU-03)
  const handleReservarSaga = async (camionId) => {
    const camion = unidades.find(u => u.id === camionId) || camionSeleccionado || unidades[0];
    const targetId = camion?.id || 'B-04';

    const res = await fetch('http://localhost:8080/api/v1/flotas/reservar-camion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidenteId: incidenteActivo.incidenteId,
        tipoFuego: incidenteActivo.tipoFuego,
        latitud: camion ? camion.latitud : incidenteActivo.latitud,
        longitud: camion ? camion.longitud : incidenteActivo.longitud,
        litrosMinimos: 1000
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.mensaje || `HTTP Error ${res.status}`);
    }

    const data = await res.json();
    await cargarDatos(true);
    return data;
  };

  // Handler para SAGA Compensación / Liberar (CU-03)
  const handleCompensarSaga = async (camionId) => {
    const id = camionId || camionSeleccionado?.id || 'B-04';
    const res = await fetch('http://localhost:8080/api/v1/flotas/liberar-camion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidenteId: incidenteActivo.incidenteId,
        camionId: id,
        motivoCompensacion: `Compensación SAGA ejecutada para camión ${id}`
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.mensaje || `HTTP Error ${res.status}`);
    }

    const data = await res.json();
    await cargarDatos(true);
    return data;
  };

  // Handler para simular telemetría en vivo (CU-05) avanzando por las calles reales
  const handleSimularTelemetria = async (camionId) => {
    const camion = unidades.find(u => u.id === camionId) || camionSeleccionado || unidades[0];
    if (!camion) return;

    let nuevaLat = camion.latitud;
    let nuevaLon = camion.longitud;
    let nuevoAgua = Math.max(camion.litrosAguaActual - 250, 400);
    let nuevaVelocidad = 52.0;

    // Si hay una ruta trazada con vértices viales, avanzar a lo largo de las calles
    const coordinates = rutaCalculada?.geometriaGeoJson?.coordinates;
    if (coordinates && coordinates.length > 0) {
      const nextStep = Math.min(telemetryStep + 4, coordinates.length - 1);
      const targetPoint = coordinates[nextStep]; // [lon, lat]
      nuevaLon = targetPoint[0];
      nuevaLat = targetPoint[1];
      setTelemetryStep(nextStep);

      // Si ya llegó al final de la ruta (siniestro)
      if (nextStep >= coordinates.length - 1) {
        nuevaVelocidad = 0.0;
      }
    } else {
      // Movimiento directo hacia el siniestro en Santa Cruz
      nuevaLat = camion.latitud + (incidenteActivo.latitud - camion.latitud) * 0.2;
      nuevaLon = camion.longitud + (incidenteActivo.longitud - camion.longitud) * 0.2;
    }

    await registrarTelemetria(
      camion.id,
      nuevaLat,
      nuevaLon,
      nuevoAgua,
      Math.max(camion.combustiblePorcentaje - 1, 15),
      nuevaVelocidad > 0 ? 'EN_TRANSITO' : 'EN_ESCENA',
      nuevaVelocidad
    );

    await cargarDatos();
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-primary)',
      overflow: 'hidden'
    }}>
      {/* Barra de Navegación Táctica Superior */}
      <header style={{
        height: '64px',
        backgroundColor: 'rgba(17, 24, 39, 0.90)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 1100
      }}>
        {/* Título e Identidad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--color-emergency)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-emergency)',
            fontWeight: 700,
            fontSize: '20px'
          }}>
            🚒
          </div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.5px' }}>
              MFE-02: VISOR CARTOGRÁFICO Y TELEMETRÍA DE FLOTAS
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Módulo Federado (React 18 + Leaflet) &bull; Santa Cruz de la Sierra &bull; Responsable: Maikol Molina
            </p>
          </div>
        </div>

        {/* Indicadores de Conexión del Backend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--color-success)' }}>●</span> MS-02 Spring Boot (8080)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--color-ai-purple)' }}>●</span> MS-05 FastMCP (8005)
          </div>
          <span className="badge badge-success">PUERTO 3002 | FEDERADO</span>
        </div>
      </header>

      {/* Cuerpo Principal: Mapa Leaflet + Panel HUD */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        <div style={{ flex: 1, height: '100%', position: 'relative' }}>
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

        {/* HUD Lateral Táctico */}
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
  );
}
