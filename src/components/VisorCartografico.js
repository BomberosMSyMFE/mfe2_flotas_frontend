import React, { useEffect, useState, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { EVENTOS_BUS, suscribirEvento, emitirEvento } from '../services/eventBus';
import { fetchUnidadesActivas } from '../services/flotasApi';
import { fetchHidrantesMcp, fetchHotspotsDemo } from '../services/mcpApi';

// Componente para controlar la cámara del mapa y auto-ajustar tamaño en móviles
function CameraController({ center, zoom, bounds }) {
  const map = useMap();
  const lastBoundsKeyRef = useRef(null);
  const lastCenterKeyRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 200);
    return () => clearTimeout(timer);
  }, [map, center, zoom, bounds]);

  useEffect(() => {
    const handleResize = () => {
      try {
        map.invalidateSize();
      } catch (e) {}
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [map]);

  useEffect(() => {
    if (bounds && bounds.length > 0) {
      const boundsKey = `${bounds.length}_${bounds[0]}_${bounds[bounds.length - 1]}`;
      if (lastBoundsKeyRef.current !== boundsKey) {
        lastBoundsKeyRef.current = boundsKey;
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    } else if (center) {
      const centerKey = `${center[0]}_${center[1]}_${zoom}`;
      if (lastCenterKeyRef.current !== centerKey) {
        lastCenterKeyRef.current = centerKey;
        map.flyTo(center, zoom || 14, { duration: 1.2 });
      }
    }
  }, [center, zoom, bounds, map]);

  return null;
}

// Iconos tácticos personalizados generados con SVG limpio y halos semánticos
const crearIconoCamion = (tipo, estado) => {
  const claseHalo = estado === 'DISPONIBLE' ? 'halo-disponible' :
                    estado === 'EN_TRANSITO' ? 'halo-transito' : 'halo-escena';
  
  const svgCamion = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F9FAFB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="1" y="3" width="15" height="13"></rect>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
      <circle cx="5.5" cy="18.5" r="2.5"></circle>
      <circle cx="18.5" cy="18.5" r="2.5"></circle>
    </svg>
  `;

  return L.divIcon({
    className: `custom-marker-pin ${claseHalo}`,
    html: `<div style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">${svgCamion}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

const crearIconoHidrante = () => {
  const svgHidrante = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"></path>
      <path d="M12 2v20"></path>
      <circle cx="12" cy="7" r="3"></circle>
      <rect x="8" y="16" width="8" height="6" rx="1"></rect>
    </svg>
  `;

  return L.divIcon({
    className: 'custom-marker-pin halo-hidrante',
    html: `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">${svgHidrante}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const crearIconoFuego = (esActivo = true, tipoFuego = 'INDUSTRIAL', estado = 'ACTIVO') => {
  const isControlado = estado === 'CONTROLADO';

  if (isControlado) {
    const svgShield = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#10B981" stroke="#047857" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        <polyline points="9 12 11 14 15 10" stroke="#FFFFFF" stroke-width="2.5" fill="none"></polyline>
      </svg>
    `;
    return L.divIcon({
      className: 'custom-marker-pin halo-controlado',
      html: `<div style="width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.9)); background: rgba(16, 185, 129, 0.15); border-radius: 50%; border: 2px solid #10B981;">${svgShield}</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -19]
    });
  }

  const colorFuego = esActivo ? '#EF4444' : '#F59E0B';
  const strokeFuego = esActivo ? '#991B1B' : '#B45309';
  const tamano = esActivo ? 42 : 32;
  const shadow = esActivo 
    ? 'filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.85));'
    : 'filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.6)); opacity: 0.88;';

  const svgFuego = `
    <svg width="${Math.round(tamano * 0.65)}" height="${Math.round(tamano * 0.65)}" viewBox="0 0 24 24" fill="${colorFuego}" stroke="${strokeFuego}" stroke-width="1.6">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
    </svg>
  `;

  return L.divIcon({
    className: `custom-marker-pin ${esActivo ? 'halo-fuego' : 'halo-fuego-secundario'}`,
    html: `<div style="width: ${tamano}px; height: ${tamano}px; display: flex; align-items: center; justify-content: center; ${shadow}">${svgFuego}</div>`,
    iconSize: [tamano, tamano],
    iconAnchor: [tamano / 2, tamano / 2],
    popupAnchor: [0, -tamano / 2]
  });
};

export default function VisorCartografico({
  unidades = [],
  hidrantes = [],
  incidenteActivo = null,
  incidentes = [],
  rutaCalculada = null,
  camionSeleccionado = null,
  hotspots = [],
  onCamionClick = null,
  onIncidenteClick = null,
  onTrazarRuta = null
}) {
  const [mapCenter, setMapCenter] = useState([-17.7833, -63.1821]);
  const [mapZoom, setMapZoom] = useState(13);

  // Auto-carga resiliente para cuando se monta como Microfrontend en el App Shell de Nataly sin props
  const [unidadesSelf, setUnidadesSelf] = useState([]);
  const [hidrantesSelf, setHidrantesSelf] = useState([]);
  const [hotspotsSelf, setHotspotsSelf] = useState([]);

  useEffect(() => {
    if (!unidades || unidades.length === 0) {
      fetchUnidadesActivas().then(data => {
        if (data && data.length > 0) setUnidadesSelf(data);
      });
    }
    if (!hidrantes || hidrantes.length === 0) {
      fetchHidrantesMcp(-17.7833, -63.1821, 3000).then(data => {
        if (data && data.length > 0) setHidrantesSelf(data);
      });
    }
    if (!hotspots || hotspots.length === 0) {
      fetchHotspotsDemo().then(data => {
        if (data && data.zonas_criticas) setHotspotsSelf(data.zonas_criticas);
      });
    }
  }, [unidades, hidrantes, hotspots]);

  const activeUnidades = (unidades && unidades.length > 0) ? unidades : unidadesSelf;
  const activeHidrantes = (hidrantes && hidrantes.length > 0) ? hidrantes : hidrantesSelf;
  const activeHotspots = (hotspots && hotspots.length > 0) ? hotspots : hotspotsSelf;

  // Escuchar el Event Bus global del navegador (desacoplamiento total con Angular Host)
  useEffect(() => {
    const desuscribir = suscribirEvento(EVENTOS_BUS.INCIDENTE_SELECCIONADO, (detalle) => {
      if (detalle && detalle.lat && detalle.lon) {
        console.log('[MFE-02 Leaflet] Centrando cámara en incidente reportado por Comandos:', detalle);
        setMapCenter([detalle.lat, detalle.lon]);
        setMapZoom(15);
      }
    });
    return desuscribir;
  }, []);

  const handleMarkerClick = (camion) => {
    emitirEvento(EVENTOS_BUS.CAMION_SELECCIONADO, camion);
    if (onCamionClick) {
      onCamionClick(camion);
    }
  };

  const routePositions = useMemo(() => {
    if (rutaCalculada && rutaCalculada.geometriaGeoJson && rutaCalculada.geometriaGeoJson.coordinates) {
      return rutaCalculada.geometriaGeoJson.coordinates.map(coord => [coord[1], coord[0]]);
    }
    return null;
  }, [rutaCalculada]);

  // Desmarcado dinámico: A medida que el camión avanza, la ruta recorrida se desmarca y solo queda la restante
  const { rutaRecorrida, rutaRestante } = useMemo(() => {
    if (!routePositions || routePositions.length === 0) {
      return { rutaRecorrida: null, rutaRestante: null };
    }

    if (!camionSeleccionado || camionSeleccionado.latitud == null || camionSeleccionado.longitud == null) {
      return { rutaRecorrida: null, rutaRestante: routePositions };
    }

    const cLat = camionSeleccionado.latitud;
    const cLon = camionSeleccionado.longitud;

    // Localizar el vértice más cercano de la ruta a la ubicación actual del camión
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < routePositions.length; i++) {
      const p = routePositions[i];
      const dist = (p[0] - cLat) ** 2 + (p[1] - cLon) ** 2;
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    // Porción ya recorrida (desmarcada)
    const pasada = routePositions.slice(0, closestIdx);

    // Porción restante activa: desde la posición del camión hacia el siniestro
    const restante = [[cLat, cLon], ...routePositions.slice(closestIdx + 1)];

    return {
      rutaRecorrida: pasada.length > 1 ? pasada : null,
      rutaRestante: restante.length > 1 ? restante : routePositions
    };
  }, [routePositions, camionSeleccionado?.latitud, camionSeleccionado?.longitud]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <CameraController center={mapCenter} zoom={mapZoom} bounds={rutaRestante || routePositions} />

        {/* Capa Base de Mapas OpenStreetMap con Dark Filter aplicado en CSS */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | SCI Bomberos'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* 1. Capa de Hotspots ML (DBSCAN Clusters Espaciales en Santa Cruz) */}
        {activeHotspots && activeHotspots.map((cluster) => (
          <Circle
            key={`cluster-${cluster.cluster_id}`}
            center={[cluster.centroide.latitud, cluster.centroide.longitud]}
            radius={1500}
            pathOptions={{
              color: cluster.clasificacion_riesgo === 'CRITICO' ? '#EF4444' : '#F59E0B',
              fillColor: cluster.clasificacion_riesgo === 'CRITICO' ? '#EF4444' : '#F59E0B',
              fillOpacity: 0.22,
              weight: 2,
              dashArray: '4, 8'
            }}
          >
            <Popup>
              <div style={{ fontSize: '13px', minWidth: '190px' }}>
                <span className="badge badge-emergency">HOTSPOT DBSCAN #{cluster.cluster_id}</span>
                <h4 style={{ margin: '6px 0 2px 0', fontSize: '12px', color: '#F9FAFB' }}>
                  {cluster.nombre_zona || `Sector Municipal #${cluster.cluster_id}`}
                </h4>
                <p style={{ marginTop: '4px', fontWeight: 600, color: cluster.clasificacion_riesgo === 'CRITICO' ? '#EF4444' : '#F59E0B' }}>
                  Riesgo: {cluster.clasificacion_riesgo}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '2px 0' }}>
                  Incidentes recurrentes: <b>{cluster.cantidad_incidentes}</b> siniestros
                </p>
                <p style={{ color: 'var(--text-dim)', fontSize: '10px' }}>Radio de propagación: 1.5 km (Haversine)</p>
              </div>
            </Popup>
          </Circle>
        ))}

        {/* 2. Capa de Hidrantes de la Red PostGIS */}
        {activeHidrantes && activeHidrantes.map((h) => (
          <Marker
            key={h.id}
            position={[h.latitud, h.longitud]}
            icon={crearIconoHidrante()}
          >
            <Popup>
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span className="badge badge-cyan">{h.id}</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600 }}>● OPERATIVO</span>
                </div>
                <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Presión</span>
                    <p className="font-mono" style={{ fontWeight: 600 }}>{h.presionPsi} PSI</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Caudal</span>
                    <p className="font-mono" style={{ fontWeight: 600 }}>{h.caudalLitrosMinuto} L/min</p>
                  </div>
                </div>
                {h.distanciaMetros && (
                  <p style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Distancia al siniestro: <b className="font-mono">{h.distanciaMetros}m</b>
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 3. Incidentes Activos en Santa Cruz (Focos de Fuego) */}
        {(() => {
          const listaIncidentes = (incidentes && incidentes.length > 0)
            ? incidentes
            : (incidenteActivo ? [incidenteActivo] : []);

          return listaIncidentes
            .filter((inc) => inc.estado !== 'EXTINGUIDO' && inc.estado !== 'LIQUIDADO')
            .map((inc) => {
              const esActivo = inc.incidenteId === incidenteActivo?.incidenteId;
              const isControlado = inc.estado === 'CONTROLADO';
              return (
                <Marker
                  key={inc.incidenteId}
                  position={[inc.latitud, inc.longitud]}
                  icon={crearIconoFuego(esActivo, inc.tipoFuego, inc.estado)}
                  eventHandlers={{
                    click: () => {
                      if (onIncidenteClick) onIncidenteClick(inc);
                    }
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '13px', minWidth: '190px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span
                          className={`badge ${
                            isControlado
                              ? 'badge-success'
                              : esActivo
                              ? 'badge-emergency'
                              : 'badge-amber'
                          }`}
                          style={{
                            fontSize: '10px',
                            backgroundColor: isControlado ? '#10B981' : undefined,
                            color: isControlado ? '#FFFFFF' : undefined,
                          }}
                        >
                          {isControlado
                            ? '🛡️ FUEGO CONTROLADO'
                            : esActivo
                            ? '🔥 SINIESTRO OBJETIVO'
                            : '⚠️ SINIESTRO ACTIVO'}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }} className="font-mono">
                          {inc.incidenteId}
                        </span>
                      </div>

                      <h4 style={{ margin: '6px 0 2px 0', color: isControlado ? '#059669' : (esActivo ? 'var(--color-emergency)' : '#D97706'), fontSize: '13px' }}>
                        {inc.titulo || inc.tipoFuego || 'SINIESTRO'}
                      </h4>

                    {inc.ubicacion && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: '3px 0' }}>
                        📍 {inc.ubicacion}
                      </p>
                    )}

                    {inc.descripcion && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '10px', margin: '2px 0', fontStyle: 'italic' }}>
                        {inc.descripcion}
                      </p>
                    )}

                    <div style={{ marginTop: '6px', padding: '6px', backgroundColor: '#F8FAFC', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Agua mín:</span>
                        <strong className="font-mono">{inc.litrosMinimos || 5000} L</strong>
                      </div>
                      {inc.camionSugeridoId && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Unidad ideal:</span>
                          <span className="badge badge-cyan" style={{ fontSize: '9px', padding: '0 4px' }}>
                            🚒 {inc.camionSugeridoId}
                          </span>
                        </div>
                      )}
                    </div>

                    {!esActivo && onIncidenteClick && (
                      <button
                        onClick={() => onIncidenteClick(inc)}
                        className="btn-fire-primary"
                        style={{
                          marginTop: '8px',
                          width: '100%',
                          padding: '6px 8px',
                          fontSize: '10px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        🧭 ASIGNAR ESTE INCIDENTE A LA RUTA
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          });
        })()}

        {/* 4. Trazo de Ruta Óptima Real sobre Calles (CU-04 PostGIS + Red Urbana) */}
        {/* Trayecto ya recorrido: se desmarca con un trazo punteado gris tenue */}
        {rutaRecorrida && (
          <Polyline
            positions={rutaRecorrida}
            pathOptions={{
              color: '#475569',
              weight: 3,
              opacity: 0.25,
              dashArray: '3, 6'
            }}
          />
        )}

        {/* Trayecto activo restante: brilla en azul fluorescente desde el camión al fuego */}
        {rutaRestante && (
          <>
            {/* Borde fluorescente exterior */}
            <Polyline
              positions={rutaRestante}
              pathOptions={{
                color: '#38BDF8',
                weight: 8,
                opacity: 0.45
              }}
            />
            {/* Núcleo sólido continuo sobre las calles */}
            <Polyline
              positions={rutaRestante}
              pathOptions={{
                color: '#2563EB',
                weight: 4,
                opacity: 1.0
              }}
            />
          </>
        )}

        {/* 5. Unidades de Flota en Tiempo Real (CU-05) */}
        {activeUnidades && activeUnidades.map((camion) => (
          <Marker
            key={camion.id}
            position={[camion.latitud, camion.longitud]}
            icon={crearIconoCamion(camion.tipo, camion.estado)}
            eventHandlers={{
              click: () => handleMarkerClick(camion)
            }}
          >
            <Popup>
              <div style={{ fontSize: '13px', minWidth: '180px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <b style={{ fontSize: '14px' }}>{camion.id}</b>
                  <span className={`badge ${camion.estado === 'DISPONIBLE' ? 'badge-success' : 'badge-tactical'}`}>
                    {camion.estado}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                  Placa: <span className="font-mono">{camion.placa}</span> | {camion.tipo}
                </p>
                
                {/* Barras de Telemetría Táctica */}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Estanque de Agua:</span>
                    <span className="font-mono" style={{ fontWeight: 600, color: 'var(--color-hydrant-cyan)' }}>
                      {camion.litrosAguaActual} / {camion.capacidadMaximaAgua} L
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '5px', background: '#1F2937', borderRadius: '3px', marginTop: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(camion.litrosAguaActual / camion.capacidadMaximaAgua) * 100}%`,
                      height: '100%',
                      background: 'var(--color-hydrant-cyan)'
                    }} />
                  </div>
                </div>

                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Combustible:</span>
                    <span className="font-mono" style={{ fontWeight: 600 }}>{camion.combustiblePorcentaje}%</span>
                  </div>
                  <div style={{ width: '100%', height: '5px', background: '#1F2937', borderRadius: '3px', marginTop: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${camion.combustiblePorcentaje}%`,
                      height: '100%',
                      background: camion.combustiblePorcentaje > 50 ? 'var(--color-success)' : 'var(--color-warning)'
                    }} />
                  </div>
                </div>

                <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-dim)' }}>
                  Base: <b>{camion.estacionOrigen}</b>
                </p>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onTrazarRuta) onTrazarRuta(camion.id);
                  }}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    padding: '6px 8px',
                    backgroundColor: 'var(--color-tactical-blue)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  🗺️ Trazar Ruta Óptima Vial
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

/**
 * Función mount estándar de Module Federation para microfrontends React dentro de Angular / App Shell
 */
export function mount(containerElement, props = {}) {
  if (!containerElement) return;
  const root = ReactDOM.createRoot(containerElement);
  root.render(<VisorCartografico {...props} />);
  return () => {
    try {
      root.unmount();
    } catch (e) {}
  };
}
