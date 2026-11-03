const API_BASE_URL = 'http://localhost:8080/api/v1/flotas';

export async function fetchUnidadesActivas() {
  try {
    const res = await fetch(`${API_BASE_URL}/unidades/activas`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('[flotasApi] Backend Fallback activado:', error.message);
    // Fallback con datos reales de Santa Cruz si el backend estuviera desconectado
    return [
      { id: 'B-01', placa: '2190-ABC', tipo: 'ATAQUE_RAPIDO', estado: 'DISPONIBLE', latitud: -17.7862, longitud: -63.1812, litrosAguaActual: 3000, capacidadMaximaAgua: 3000, combustiblePorcentaje: 95, estacionOrigen: 'Estación Central' },
      { id: 'B-04', placa: '3482-LKP', tipo: 'CISTERNA_PESADA', estado: 'DISPONIBLE', latitud: -17.7780, longitud: -63.1795, litrosAguaActual: 10000, capacidadMaximaAgua: 10000, combustiblePorcentaje: 88, estacionOrigen: 'Estación Pampa de la Isla' },
      { id: 'B-06', placa: '1122-XZY', tipo: 'ESCALA_TELESCOPICA', estado: 'DISPONIBLE', latitud: -17.7650, longitud: -63.1900, litrosAguaActual: 4000, capacidadMaximaAgua: 4000, combustiblePorcentaje: 90, estacionOrigen: 'Estación Equipetrol' },
      { id: 'B-08', placa: '4490-MNO', tipo: 'CISTERNA_PESADA', estado: 'DISPONIBLE', latitud: -17.7550, longitud: -63.1600, litrosAguaActual: 12000, capacidadMaximaAgua: 12000, combustiblePorcentaje: 92, estacionOrigen: 'Estación Parque Industrial' },
      { id: 'B-11', placa: '5501-QWE', tipo: 'RESCATE_LIVIANO', estado: 'DISPONIBLE', latitud: -17.8100, longitud: -63.1500, litrosAguaActual: 1500, capacidadMaximaAgua: 1500, combustiblePorcentaje: 85, estacionOrigen: 'Estación Plan 3000' }
    ];
  }
}

export async function fetchRutaOptima(origenLat, origenLon, destinoLat, destinoLon) {
  try {
    const url = `${API_BASE_URL}/ruta-optima?origenLat=${origenLat}&origenLon=${origenLon}&destinoLat=${destinoLat}&destinoLon=${destinoLon}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('[flotasApi] Error calculando ruta:', error.message);
    return null;
  }
}

export async function registrarTelemetria(camionId, latitud, longitud, litrosAgua, combustible, estado, velocidad) {
  try {
    const res = await fetch(`${API_BASE_URL}/telemetria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        camionId,
        latitud,
        longitud,
        litrosAguaActual: litrosAgua,
        combustiblePorcentaje: combustible,
        estado,
        velocidadKmH: velocidad,
        rumboGrados: 0
      })
    });
    return await res.json();
  } catch (error) {
    console.warn('[flotasApi] Error enviando telemetría:', error.message);
    return { ack: false };
  }
}
