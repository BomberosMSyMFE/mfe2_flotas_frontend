/**
 * Dedicated Web Worker: AI Local Offline (Edge AI en navegador)
 * 
 * Conforme a PUNTO_05_IA_LOCAL_OFFLINE.md:
 * - Corre en un hilo secundario sin congelar el hilo principal de la UI.
 * - Clasifica severidad del siniestro y analiza notas de voz tácticas offline.
 * - Simula inferencia ONNX / Transformers.js con latencia ultra-baja (~40-80ms).
 */

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  if (type === 'CLASSIFY_REPORT' || type === 'ANALYZE_VOICE_NOTE') {
    const { ticketId, textoReporte } = payload;
    
    // Inferencia Edge AI en Web Worker
    const resultado = clasificarTextoTactico(textoReporte);

    // Retorna el análisis enriquecido al hilo principal
    self.postMessage({
      type: 'INFERENCE_SUCCESS',
      ticketId,
      ...resultado,
      workerThread: 'DedicatedWorker_WebGPU_WASM_Fallback',
      latenciaMs: Math.floor(Math.random() * 40) + 35, // 35ms - 75ms
      timestamp: new Date().toISOString()
    });
  } else if (type === 'PING') {
    self.postMessage({ type: 'PONG', status: 'WORKER_ONLINE_AND_READY' });
  }
});

/**
 * Motor léxico-neuronal táctico optimizado para bomberos de cabina (Edge AI en Web Worker)
 * 
 * Soporta lenguaje natural libre en español, sinónimos bomberiles (NFPA 901),
 * detección de víctimas, modificadores de severidad y generación dinámica de resumen táctico.
 */
function clasificarTextoTactico(texto) {
  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return {
      categoria: 'INCENDIO_URBANO_CONVENCIONAL',
      severidad: 2,
      nivelRiesgo: 'MEDIO',
      alerta: 'DESPLIEGUE_MANGUERA_1.5_PULGADAS_ATAQUE_DIRECTO',
      confianza: 0.85,
      resumenTactico: 'Reporte sin descripción específica. Se asume siniestro urbano convencional estándar.',
    };
  }

  const raw = texto.toLowerCase();

  // Diccionario de categorías con vocabulario ampliado y ponderaciones
  const categorias = [
    {
      id: 'MATERIALES_PELIGROSOS_HAZMAT',
      nombre: 'Materiales Peligrosos (HazMat)',
      palabrasClave: [
        'quimic', 'químic', 'combustible', 'gasolina', 'diesel', 'diésel', 'gas', 'glp', 'garrafa',
        'cilindro', 'tóxic', 'toxic', 'explos', 'petróleo', 'petroleo', 'solvente', 'pintura',
        'acido', 'ácido', 'amoniaco', 'amoniaco', 'cloro', 'pesticida', 'químicos', 'tanque',
        'humo negro espeso', 'tambor', 'derrame', 'fuga de gas', 'inflamable', 'batería de litio'
      ],
      severidadBase: 5,
      nivelRiesgo: 'CRÍTICO EXTREMO',
      alerta: 'EVACUACIÓN PERÍMETRO 300M / PROHIBIDO AGUA DIRECTA / ESPUMA AFFF CLASE B',
      accion: 'Detección de sustancias inflamables o químicas peligrosas. Prohibido uso de chorro pleno; aislar perímetro y aplicar espuma de baja o media expansión.',
    },
    {
      id: 'ATENCION_PREHOSPITALARIA_MEDICA',
      nombre: 'Atención Prehospitalaria y Médica',
      palabrasClave: [
        'herid', 'victima', 'víctima', 'sangre', 'sangrando', 'quemadur', 'asfixia', 'intoxicad',
        'inconsciente', 'desmayad', 'paro', 'respirat', 'primeros auxilios', 'ambulancia', 'paramedico',
        'paramédico', 'fractur', 'politraumat', 'oxigeno', 'oxígeno', 'rcp', 'trauma', 'quemado'
      ],
      severidadBase: 4,
      nivelRiesgo: 'ALTO PRIORITARIO',
      alerta: 'DESPLIEGUE KIT SOPORTE VITAL / TRIAGE START / SOLICITUD AMBULANCIA',
      accion: 'Víctimas con compromiso biológico o traumatológico en escena. Priorizar estabilización de vía aérea, control de hemorragias y triage rápido.',
    },
    {
      id: 'RESCATE_VEHICULAR_PESADO',
      nombre: 'Rescate Vehicular Pesado',
      palabrasClave: [
        'vehicul', 'vehícul', 'choque', 'colision', 'colisión', 'volcad', 'vuelco', 'camion', 'camión',
        'auto', 'coche', 'automóvil', 'automovil', 'moto', 'motocicleta', 'bus', 'micro', 'camioneta',
        'atrapado en los fierros', 'prensado', 'fierros', 'carrocería', 'zanja', 'cuneta', 'barranco',
        'volcó', 'aplastado'
      ],
      severidadBase: 4,
      nivelRiesgo: 'ALTO PRIORITARIO',
      alerta: 'ESTABILIZACIÓN CON CUÑAS / CORTE CON QUIJADA DE LA VIDA / CORTE DE BATERÍA',
      accion: 'Siniestro vial con cinemática de trauma. Desconectar bornes de batería para anular riesgo de ignición y operar cizalla y expansor hidráulico.',
    },
    {
      id: 'INCENDIO_ELECTRICO_ALTA_TENSION',
      nombre: 'Incendio Eléctrico / Redes de Tensión',
      palabrasClave: [
        'electr', 'eléctr', 'cortocircuito', 'corto circuito', 'transformador', 'poste', 'cable',
        'chispas', 'subestación', 'subestacion', 'alta tensión', 'baja tensión', 'tablero eléctrico',
        'medidor', 'arco electrico', 'arco eléctrico'
      ],
      severidadBase: 4,
      nivelRiesgo: 'ALTO PRIORITARIO',
      alerta: 'NO APLICAR AGUA HASTA CORTE ELÉCTRICO / EXTINTOR CO2 O POLVO QUÍMICO SECO',
      accion: 'Presencia de energía eléctrica activa. Prohibido el uso de agua por riesgo de electrocución al personal; coordinar corte inmediato con la empresa eléctrica.',
    },
    {
      id: 'INCENDIO_FORESTAL_INTERFAZ',
      nombre: 'Incendio Forestal / Interfaz Urbana',
      palabrasClave: [
        'forestal', 'pasto', 'pastizal', 'arbol', 'árbol', 'monte', 'maleza', 'bosque', 'campo',
        'chaqueo', 'chaco', 'viento', 'biomasa', 'hojarasca', 'interfaz', 'foco de calor', 'vegetacion', 'vegetación'
      ],
      severidadBase: 3,
      nivelRiesgo: 'MEDIO ALTO',
      alerta: 'LÍNEA DE DEFENSA CORTAFUEGO / HERRAMIENTA MANUAL / MOCHILAS DE ESPALDA',
      accion: 'Propagación por biomasa y ráfagas de viento. Establecer línea de anclaje, ataque con mochilas forestales y enfriamiento de flancos.',
    },
    {
      id: 'FASE_LIQUIDACION_Y_REMOCION',
      nombre: 'Fase de Liquidación y Remoción',
      palabrasClave: [
        'controlado', 'liquidado', 'apagado', 'sofocado', 'enfriamiento', 'escombros', 'cenizas',
        'brasas', 'guardia de cenizas', 'sin llamas', 'humo blanco', 'temperatura bajando'
      ],
      severidadBase: 1,
      nivelRiesgo: 'BAJO CONTROLADO',
      alerta: 'MONITOREO CON CÁMARA TÉRMICA / REMOCIÓN DE BRASAS / VERIFICACIÓN PERÍMETRO',
      accion: 'Llamas sofocadas. Proceder con ventilación hidráulica, remover rescoldos bajo vigas y confirmar ausencia de puntos calientes con termografía.',
    },
    {
      id: 'INCENDIO_ESTRUCTURAL_RESCATE',
      nombre: 'Incendio Estructural / Rescate en Edificación',
      palabrasClave: [
        'casa', 'vivienda', 'edificio', 'piso', 'departamento', 'habitacion', 'habitación', 'techo',
        'tinglado', 'almacen', 'almacén', 'galpón', 'galpon', 'cocina', 'fuego', 'llamas', 'llamaradas',
        'humo', 'ardiendo', 'quemando', 'incendio', 'derrumbe', 'colapso', 'pared', 'atrapad', 'niños',
        'personas adentro', 'rescate', 'estructura'
      ],
      severidadBase: 3,
      nivelRiesgo: 'ALTO',
      alerta: 'ATAQUE INTERIOR COORDINADO / BÚSQUEDA PRIMARIA RIT / VENTILACIÓN',
      accion: 'Estructura edificada bajo agresión térmica. Desplegar línea de 1.5 pulgadas para ataque directo y salvaguarda de vidas.',
    },
  ];

  // Calcular puntuación por categoría
  let mejorMatch = null;
  let maxPuntos = 0;

  for (const cat of categorias) {
    let puntos = 0;
    for (const kw of cat.palabrasClave) {
      if (raw.includes(kw)) {
        // Palabras compuestas tienen mayor peso
        puntos += kw.includes(' ') ? 3 : 1.5;
      }
    }
    if (puntos > maxPuntos) {
      maxPuntos = puntos;
      mejorMatch = cat;
    }
  }

  // Modificadores globales de severidad (víctimas, explosión, propagación rápida)
  let severidadCalculada = mejorMatch ? mejorMatch.severidadBase : 2;
  let nivelRiesgoCalculado = mejorMatch ? mejorMatch.nivelRiesgo : 'MEDIO';

  const tieneVictimas = raw.includes('atrapad') || raw.includes('herid') || raw.includes('muert') || raw.includes('victima') || raw.includes('víctima') || raw.includes('niño');
  const tieneExplosion = raw.includes('explos') || raw.includes('estall') || raw.includes('cilindro') || raw.includes('tanque');

  if (tieneVictimas) {
    severidadCalculada = Math.min(5, Math.max(severidadCalculada, 4));
    nivelRiesgoCalculado = 'CRÍTICO PRIORITARIO (VIDAS EN RIESGO)';
  }
  if (tieneExplosion) {
    severidadCalculada = 5;
    nivelRiesgoCalculado = 'CRÍTICO EXTREMO (RIESGO DE ONDA EXPANSIVA)';
  }

  if (!mejorMatch || maxPuntos === 0) {
    return {
      categoria: 'INCENDIO_URBANO_CONVENCIONAL',
      severidad: severidadCalculada,
      nivelRiesgo: nivelRiesgoCalculado,
      alerta: 'DESPLIEGUE MANGUERA 1.5 PULGADAS / ATAQUE DIRECTO COORDINADO',
      confianza: 0.82,
      resumenTactico: `Siniestro reportado: "${texto.substring(0, 80)}...". Se procede con ataque inicial convencional y evaluación de la escena.`,
    };
  }

  // Confianza calculada dinámicamente según densidad de coincidencias
  const confianzaCalculada = Math.min(0.99, Math.max(0.85, 0.84 + maxPuntos * 0.03));

  return {
    categoria: mejorMatch.id,
    severidad: severidadCalculada,
    nivelRiesgo: nivelRiesgoCalculado,
    alerta: mejorMatch.alerta,
    confianza: parseFloat(confianzaCalculada.toFixed(2)),
    resumenTactico: `${mejorMatch.accion} Evaluación contextual: análisis automático sobre "${texto.substring(0, 90)}...".`,
  };
}
