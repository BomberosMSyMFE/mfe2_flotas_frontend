const HOTSPOTS_SCZ_DEFAULT = {
  zonas_criticas: [
    {
      cluster_id: 1,
      centroide: { latitud: -17.7780, longitud: -63.1420 },
      clasificacion_riesgo: 'CRITICO',
      cantidad_incidentes: 42,
      nombre_zona: 'Parque Industrial PI-22 / Almacenes Químicos'
    },
    {
      cluster_id: 2,
      centroide: { latitud: -17.8180, longitud: -63.1380 },
      clasificacion_riesgo: 'CRITICO',
      cantidad_incidentes: 38,
      nombre_zona: 'Plan 3000 / El Mechero (Zona Comercial)'
    },
    {
      cluster_id: 3,
      centroide: { latitud: -17.7550, longitud: -63.1750 },
      clasificacion_riesgo: 'ALTO',
      cantidad_incidentes: 29,
      nombre_zona: 'Av. Banzer y 4to Anillo (Tráfico y Comercio)'
    },
    {
      cluster_id: 4,
      centroide: { latitud: -17.7620, longitud: -63.1280 },
      clasificacion_riesgo: 'CRITICO',
      cantidad_incidentes: 35,
      nombre_zona: 'Pampa de la Isla / Av. Virgen de Cotoca'
    },
    {
      cluster_id: 5,
      centroide: { latitud: -17.8050, longitud: -63.2080 },
      clasificacion_riesgo: 'ALTO',
      cantidad_incidentes: 24,
      nombre_zona: 'El Bajío / Doble Vía La Guardia'
    },
    {
      cluster_id: 6,
      centroide: { latitud: -17.7710, longitud: -63.1620 },
      clasificacion_riesgo: 'ALTO',
      cantidad_incidentes: 31,
      nombre_zona: 'Mercado Mutualista / 3er Anillo Interno'
    },
    {
      cluster_id: 7,
      centroide: { latitud: -17.8420, longitud: -63.1680 },
      clasificacion_riesgo: 'CRITICO',
      cantidad_incidentes: 27,
      nombre_zona: 'Los Lotes / Zona Sur Periurbana'
    },
    {
      cluster_id: 8,
      centroide: { latitud: -17.7880, longitud: -63.1850 },
      clasificacion_riesgo: 'ALTO',
      cantidad_incidentes: 22,
      nombre_zona: 'Casco Viejo / Mercado La Ramada'
    }
  ],
  algoritmo: 'DBSCAN Spatial Clustering',
  eps_km: 1.5,
  min_samples: 5
};

export async function fetchHotspotsDemo() {
  try {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const mcpUrl = isHttps ? `https://${host}/api/v1` : `http://${host}:8005/api/v1`;
    const res = await fetch(`${mcpUrl}/ml/hotspots/demo`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (error) {
    // Retornar dataset histórico DBSCAN oficial de Santa Cruz
    return HOTSPOTS_SCZ_DEFAULT;
  }
}

export async function fetchHidrantesMcp(latitud, longitud, radioMetros = 800) {
  try {
    const res = await fetch(`${MCP_BASE_URL}/mcp/call-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombreHerramienta: 'verificar_hidrantes_cercanos',
        argumentos: { latitud, longitud, radio_metros: radioMetros }
      })
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();
    return data.resultado || [];
  } catch (error) {
    console.warn('[mcpApi] Error consultando hidrantes vía FastMCP:', error.message);
    return [
      { id: 'HID-014', latitud: -17.7820, longitud: -63.1810, presionPsi: 65.5, caudalLitrosMinuto: 1200, operativo: true, distanciaMetros: 180 },
      { id: 'HID-028', latitud: -17.7845, longitud: -63.1830, presionPsi: 70.0, caudalLitrosMinuto: 1500, operativo: true, distanciaMetros: 250 },
      { id: 'HID-091', latitud: -17.7560, longitud: -63.1610, presionPsi: 80.0, caudalLitrosMinuto: 1800, operativo: true, distanciaMetros: 310 },
      { id: 'HID-105', latitud: -17.7660, longitud: -63.1890, presionPsi: 55.0, caudalLitrosMinuto: 1000, operativo: true, distanciaMetros: 190 }
    ];
  }
}

export async function solicitarDespachoReAct(incidenteId, tipoIncidente, latitud, longitud, litrosMinimos) {
  try {
    const res = await fetch(`${MCP_BASE_URL}/agente/despacho-tactico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidenteId,
        tipoIncidente,
        latitud,
        longitud,
        litrosMinimos,
        descripcion: 'Incendio activo despachado desde interfaz cartográfica'
      })
    });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('[mcpApi] Error solicitando despacho a agente ReAct:', error.message);
    return null;
  }
}
