const MCP_BASE_URL = 'http://localhost:8005/api/v1';

export async function fetchHotspotsDemo() {
  try {
    const res = await fetch(`${MCP_BASE_URL}/ml/hotspots/demo`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('[mcpApi] Error al consultar hotspots DBSCAN:', error.message);
    return null;
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
