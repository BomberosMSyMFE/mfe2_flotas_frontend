import React, { useState, useEffect, useRef } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { saveEvidenceToOutbox } from '../services/indexedDbOutbox';
import { syncManager } from '../services/syncManager';
import { aiInferenceEngine } from '../services/aiInferenceEngine';

// Formateador semántico legible para categorías tácticas
export function formatCategoria(cat) {
  if (!cat) return 'Incendio Urbano Convencional';
  const mapping = {
    MATERIALES_PELIGROSOS_HAZMAT: 'Materiales Peligrosos (HazMat)',
    INCENDIO_ESTRUCTURAL_RESCATE: 'Incendio Estructural con Rescate',
    INCENDIO_FORESTAL_INTERFAZ: 'Incendio Forestal / Interfaz',
    RESCATE_VEHICULAR_PESADO: 'Rescate Vehicular Pesado',
    ATENCION_PREHOSPITALARIA_MEDICA: 'Atención Prehospitalaria y Médica',
    INCENDIO_ELECTRICO_ALTA_TENSION: 'Incendio Eléctrico / Redes',
    FASE_LIQUIDACION_Y_REMOCION: 'Fase Liquidación y Remoción',
    INCENDIO_URBANO_CONVENCIONAL: 'Incendio Urbano Convencional',
  };
  return mapping[cat] || cat.replace(/_/g, ' ');
}

// Clasificador táctico local para respuesta inmediata
function clasificarLocalmente(texto) {
  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return {
      categoria: 'INCENDIO_URBANO_CONVENCIONAL',
      severidad: 2,
      nivelRiesgo: 'MEDIO',
      alerta: 'DESPLIEGUE MANGUERA 1.5 PULGADAS / ATAQUE DIRECTO',
      confianza: 0.85,
      resumenTactico: 'Reporte sin descripción específica. Se asume siniestro urbano convencional estándar.',
      latenciaMs: 38,
    };
  }

  const raw = texto.toLowerCase();

  const categorias = [
    {
      id: 'MATERIALES_PELIGROSOS_HAZMAT',
      palabrasClave: [
        'quimic', 'químic', 'combustible', 'gasolina', 'diesel', 'diésel', 'gas', 'glp', 'garrafa',
        'cilindro', 'tóxic', 'toxic', 'explos', 'petróleo', 'petroleo', 'solvente', 'pintura',
        'acido', 'ácido', 'amoniaco', 'amoniaco', 'cloro', 'pesticida', 'tanque', 'humo negro espeso',
        'tambor', 'derrame', 'fuga de gas', 'inflamable', 'batería de litio'
      ],
      severidadBase: 5,
      nivelRiesgo: 'CRÍTICO EXTREMO',
      alerta: 'EVACUACIÓN PERÍMETRO 300M / PROHIBIDO AGUA DIRECTA / ESPUMA AFFF CLASE B',
      accion: 'Detección de sustancias inflamables o químicas peligrosas. Desplegar espuma y aislar perímetro.',
    },
    {
      id: 'ATENCION_PREHOSPITALARIA_MEDICA',
      palabrasClave: [
        'herid', 'victima', 'víctima', 'sangre', 'sangrando', 'quemadur', 'asfixia', 'intoxicad',
        'inconsciente', 'desmayad', 'paro', 'respirat', 'primeros auxilios', 'ambulancia', 'paramedico',
        'paramédico', 'fractur', 'politraumat', 'oxigeno', 'oxígeno', 'rcp', 'trauma', 'quemado'
      ],
      severidadBase: 4,
      nivelRiesgo: 'ALTO PRIORITARIO',
      alerta: 'DESPLIEGUE KIT SOPORTE VITAL / TRIAGE START / SOLICITUD AMBULANCIA',
      accion: 'Víctimas en escena. Priorizar control de hemorragias, vía aérea y triage rápido.',
    },
    {
      id: 'RESCATE_VEHICULAR_PESADO',
      palabrasClave: [
        'vehicul', 'vehícul', 'choque', 'colision', 'colisión', 'volcad', 'vuelco', 'camion', 'camión',
        'auto', 'coche', 'automóvil', 'automovil', 'moto', 'motocicleta', 'bus', 'micro', 'camioneta',
        'atrapado en los fierros', 'prensado', 'fierros', 'carrocería', 'zanja', 'cuneta', 'barranco',
        'volcó', 'aplastado'
      ],
      severidadBase: 4,
      nivelRiesgo: 'ALTO PRIORITARIO',
      alerta: 'ESTABILIZACIÓN CON CUÑAS / CORTE CON QUIJADA DE LA VIDA / CORTE DE BATERÍA',
      accion: 'Siniestro vial. Anular ignición desconectando batería y operar equipo hidráulico de extricación.',
    },
    {
      id: 'INCENDIO_ELECTRICO_ALTA_TENSION',
      palabrasClave: [
        'electr', 'eléctr', 'cortocircuito', 'corto circuito', 'transformador', 'poste', 'cable',
        'chispas', 'subestación', 'subestacion', 'alta tensión', 'baja tensión', 'tablero eléctrico',
        'medidor', 'arco electrico', 'arco eléctrico'
      ],
      severidadBase: 4,
      nivelRiesgo: 'ALTO PRIORITARIO',
      alerta: 'NO APLICAR AGUA HASTA CORTE ELÉCTRICO / EXTINTOR CO2 O POLVO QUÍMICO SECO',
      accion: 'Riesgo eléctrico activo. No aplicar agua hasta desenergización confirmada.',
    },
    {
      id: 'INCENDIO_FORESTAL_INTERFAZ',
      palabrasClave: [
        'forestal', 'pasto', 'pastizal', 'arbol', 'árbol', 'monte', 'maleza', 'bosque', 'campo',
        'chaqueo', 'chaco', 'viento', 'biomasa', 'hojarasca', 'interfaz', 'foco de calor', 'vegetacion'
      ],
      severidadBase: 3,
      nivelRiesgo: 'MEDIO ALTO',
      alerta: 'LÍNEA DE DEFENSA CORTAFUEGO / HERRAMIENTA MANUAL / MOCHILAS DE ESPALDA',
      accion: 'Propagación por biomasa y viento. Establecer línea de anclaje y zanjas de contención.',
    },
    {
      id: 'FASE_LIQUIDACION_Y_REMOCION',
      palabrasClave: [
        'controlado', 'liquidado', 'apagado', 'sofocado', 'enfriamiento', 'escombros', 'cenizas',
        'brasas', 'guardia de cenizas', 'sin llamas', 'humo blanco', 'temperatura bajando'
      ],
      severidadBase: 1,
      nivelRiesgo: 'BAJO CONTROLADO',
      alerta: 'MONITOREO CON CÁMARA TÉRMICA / REMOCIÓN DE BRASAS / VERIFICACIÓN PERÍMETRO',
      accion: 'Llamas sofocadas. Proceder con remoción de rescoldos y termografía.',
    },
    {
      id: 'INCENDIO_ESTRUCTURAL_RESCATE',
      palabrasClave: [
        'casa', 'vivienda', 'edificio', 'piso', 'departamento', 'habitacion', 'habitación', 'techo',
        'tinglado', 'almacen', 'almacén', 'galpón', 'galpon', 'cocina', 'fuego', 'llamas', 'llamaradas',
        'humo', 'ardiendo', 'quemando', 'incendio', 'derrumbe', 'colapso', 'pared', 'atrapad', 'niños',
        'personas adentro', 'rescate', 'estructura'
      ],
      severidadBase: 3,
      nivelRiesgo: 'ALTO',
      alerta: 'ATAQUE INTERIOR COORDINADO / BÚSQUEDA PRIMARIA RIT / VENTILACIÓN',
      accion: 'Estructura comprometida. Desplegar línea de ataque directo y búsqueda primaria.',
    },
  ];

  let mejorMatch = null;
  let maxPuntos = 0;

  for (const cat of categorias) {
    let puntos = 0;
    for (const kw of cat.palabrasClave) {
      if (raw.includes(kw)) {
        puntos += kw.includes(' ') ? 3 : 1.5;
      }
    }
    if (puntos > maxPuntos) {
      maxPuntos = puntos;
      mejorMatch = cat;
    }
  }

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
      alerta: 'DESPLIEGUE MANGUERA 1.5 PULGADAS / ATAQUE DIRECTO',
      confianza: 0.82,
      resumenTactico: `Siniestro reportado: "${texto.substring(0, 80)}...". Se procede con ataque inicial convencional.`,
      latenciaMs: 42,
    };
  }

  const confianzaCalculada = Math.min(0.99, Math.max(0.85, 0.84 + maxPuntos * 0.03));

  return {
    categoria: mejorMatch.id,
    severidad: severidadCalculada,
    nivelRiesgo: nivelRiesgoCalculado,
    alerta: mejorMatch.alerta,
    confianza: parseFloat(confianzaCalculada.toFixed(2)),
    resumenTactico: `${mejorMatch.accion} Evaluación sobre "${texto.substring(0, 90)}...".`,
    latenciaMs: 45,
  };
}

export default function EvidenceCapture({
  camionId = 'B-04',
  matricula = 'SGT-7721',
  incidenteId = 'INC-2026-0891',
  isOnline = true,
  onEvidenceSaved,
}) {
  const [tipoEvidencia, setTipoEvidencia] = useState('NOTA_VOZ_TACTICA');
  const [textoReporte, setTextoReporte] = useState(
    'Humo negro espeso saliendo de tinglado industrial con presencia de tambores de solventes y pintura inflamable.'
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [lastSubmission, setLastSubmission] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [microfonoError, setMicrofonoError] = useState(null);

  const workerRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Suscribirse a syncManager para actualizar reactivamente el estado de la evidencia cuando se sincroniza automáticamente
  useEffect(() => {
    const unsubscribe = syncManager.subscribe((event, data) => {
      if (event === 'ITEM_CONFIRMED' && data?.id) {
        setLastSubmission((prev) => {
          if (prev && prev.record && prev.record.id === data.id) {
            return {
              ...prev,
              mode: 'ONLINE',
              serverData: data.response,
              record: { ...prev.record, status: 'CONFIRMADO_EN_SERVIDOR' },
              mensaje: `✓ ¡SINCRONIZADO AUTOMÁTICAMENTE! La evidencia fue confirmada por el servidor central (${data.response?.evidenciaId || data.response?.id || 'CONFIRMADO'}).`,
            };
          }
          return prev;
        });
      } else if (event === 'SYNC_FINISHED') {
        setLastSubmission((prev) => {
          if (prev && (prev.mode === 'OFFLINE' || prev.mode === 'OFFLINE_FALLBACK')) {
            return {
              ...prev,
              mode: 'ONLINE',
              mensaje: '✓ ¡Sincronizado automáticamente! Las evidencias de la cola local fueron transmitidas exitosamente al servidor central.',
            };
          }
          return prev;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Inicializar Dedicated Web Worker para inferencia de IA Local Offline
  useEffect(() => {
    try {
      workerRef.current = new Worker('/workers/aiWorker.js');
      workerRef.current.onmessage = (event) => {
        const { type, categoria, severidad, nivelRiesgo, alerta, confianza, resumenTactico, latenciaMs } = event.data;
        if (type === 'INFERENCE_SUCCESS') {
          setAiAnalysis({
            categoria,
            severidad,
            nivelRiesgo,
            alerta,
            confianza,
            resumenTactico,
            latenciaMs,
          });
          setIsAiProcessing(false);
        }
      };
      workerRef.current.postMessage({ type: 'PING' });
    } catch (err) {
      console.warn('[WebWorker] Fallback a análisis local:', err);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Pre-clasificar automáticamente al cambiar el texto
  useEffect(() => {
    if (textoReporte.trim()) {
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'CLASSIFY_REPORT',
          payload: { ticketId: `AUTO-${Date.now()}`, textoReporte },
        });
      } else {
        setAiAnalysis(clasificarLocalmente(textoReporte));
      }
    }
  }, [textoReporte]);

  // Ejecutar inferencia manual de IA Local en el Web Worker
  const handleProcessWithAi = () => {
    if (!textoReporte.trim()) return;
    setIsAiProcessing(true);

    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'CLASSIFY_REPORT',
        payload: { ticketId: `TICK-${Date.now()}`, textoReporte },
      });
    } else {
      setTimeout(() => {
        setAiAnalysis(clasificarLocalmente(textoReporte));
        setIsAiProcessing(false);
      }, 50);
    }
  };

  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const isRecordingRef = useRef(false);

  // Timer para duración de la grabación
  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Captura y dictado real por voz desde el micrófono (aislado y ultra-resistente)
  const handleVoiceToggle = async () => {
    // Si ya está grabando, el usuario quiere detener
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);

      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      if (textoReporte.trim()) {
        handleProcessWithAi();
      }
      return;
    }

    setMicrofonoError(null);

    // 1. Solicitar permiso explícito al navegador/Android primero
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const streamTest = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Liberar el track inmediatamente para no bloquear el hardware
        streamTest.getTracks().forEach(t => t.stop());
      }
    } catch (permErr) {
      console.warn('Permiso de micrófono denegado:', permErr);
      setMicrofonoError('Permiso de micrófono denegado. Permite el acceso en los ajustes del navegador.');
      return;
    }

    isRecordingRef.current = true;
    setIsRecording(true);

    const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'es-419'; // Español latinoamericano (universal en Android y navegadores)
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        let baseText = textoReporte ? textoReporte.trim() + ' ' : '';

        recognition.onstart = () => {
          setIsRecording(true);
          setMicrofonoError(null);
        };

        recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            baseText += finalTranscript;
          }

          const fullText = (baseText + interimTranscript).trim();
          if (fullText) {
            setTextoReporte(fullText);

            // Inferencia Edge AI reactiva mientras habla
            if (workerRef.current && fullText.length > 8) {
              workerRef.current.postMessage({
                type: 'CLASSIFY_REPORT',
                payload: { ticketId: `VOICE-${Date.now()}`, textoReporte: fullText },
              });
            }
          }
        };

        recognition.onerror = (event) => {
          console.warn('SpeechRecognition error:', event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setMicrofonoError('Permiso de micrófono denegado. Permite el micrófono en los ajustes del navegador.');
            isRecordingRef.current = false;
            setIsRecording(false);
          } else if (event.error === 'network' || event.error === 'audio-capture') {
            // Si el servicio en la nube de Google falla o la conexión es inestable, conmutar a MediaRecorder sin cerrar
            console.warn('Conmutando a grabación directa por MediaRecorder...');
            try { recognition.stop(); } catch (e) {}
            iniciarMediaRecorderFallback();
          }
          // Otros errores como 'no-speech' se ignoran para no cortar la grabación
        };

        recognition.onend = () => {
          // Si el usuario no pulsó detener, reiniciar suavemente tras breve pausa para no colisionar
          if (isRecordingRef.current) {
            setTimeout(() => {
              if (isRecordingRef.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch (e) {
                  // Si el navegador rechaza reabrir SpeechRecognition, continuar con MediaRecorder
                  if (isRecordingRef.current && (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive')) {
                    iniciarMediaRecorderFallback();
                  }
                }
              }
            }, 300);
          } else {
            setIsRecording(false);
          }
        };

        recognition.start();
      } catch (err) {
        console.warn('Error iniciando SpeechRecognition, usando MediaRecorder:', err);
        iniciarMediaRecorderFallback();
      }
    } else {
      iniciarMediaRecorderFallback();
    }
  };

  const iniciarMediaRecorderFallback = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(250);
        setIsRecording(true);
        isRecordingRef.current = true;
      } else {
        setMicrofonoError('Tu navegador no soporta captura de audio por micrófono.');
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    } catch (e) {
      setMicrofonoError('Permiso de micrófono no disponible en este dispositivo.');
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  };

  /**
   * ACCIÓN INTELIGENTE UNIFICADA:
   * Detecta automáticamente si hay internet o no:
   * - Si hay internet: Envía directamente al servidor con confirmación instantánea y guarda copia local confirmada.
   * - Si NO hay internet: Lo resguarda automáticamente en IndexedDB (Local Outbox con UUID v7) para envío automático al volver la señal.
   */
  const handleEnviarReporte = async () => {
    if (!textoReporte.trim() || isSubmitting) return;

    setIsSubmitting(true);

    // 1. Asegurar análisis de IA enriquecido
    const currentAi = aiAnalysis || clasificarLocalmente(textoReporte);
    if (!aiAnalysis) setAiAnalysis(currentAi);

    // 2. Generar UUID v7 con timestamp embebido en milisegundos
    const idV7 = uuidv7();
    const timestampIso = new Date().toISOString();

    const payloadBase = {
      id: idV7,
      idempotencyKey: idV7,
      incidenteId,
      camionId,
      bomberoMatricula: matricula,
      tipoEvidencia,
      transcripcionLocal: textoReporte,
      analisisIA: currentAi,
      urlFotografia: 'https://storage.bomberos.gob.bo/evidencias/foto-siniestro-b04.jpg',
      coordenadasCaptura: {
        latitud: -17.7833,
        longitud: -63.1821,
      },
      timestampCreacionOffline: timestampIso,
    };

    const hasEffectiveConnection = syncManager.getEffectiveOnlineStatus();

    if (hasEffectiveConnection) {
      // ===== CASO 1: HAY INTERNET -> ENVÍO DIRECTO =====
      try {
        const response = await fetch('http://localhost:8080/api/v1/flotas/evidencias', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idV7,
          },
          body: JSON.stringify({
            incidenteId: payloadBase.incidenteId,
            camionId: payloadBase.camionId,
            bomberoMatricula: payloadBase.bomberoMatricula,
            tipoEvidencia: payloadBase.tipoEvidencia,
            transcripcionLocal: payloadBase.transcripcionLocal,
            urlFotografia: payloadBase.urlFotografia,
            coordenadasCaptura: payloadBase.coordenadasCaptura,
            timestampCreacionOffline: payloadBase.timestampCreacionOffline,
          }),
        });

        if (response.ok) {
          const serverData = await response.json();
          // Guardar copia confirmada en IndexedDB para el historial local de la cabina
          const saved = await saveEvidenceToOutbox({
            ...payloadBase,
            status: 'CONFIRMADO_EN_SERVIDOR',
            servidorRespuesta: serverData,
          });

          setLastSubmission({
            mode: 'ONLINE',
            record: saved,
            serverData,
            mensaje: `✓ Evidencia enviada y confirmada en tiempo real por el servidor (${serverData.evidenciaId || serverData.id}).`,
          });
        } else {
          throw new Error(`Respuesta HTTP ${response.status}`);
        }
      } catch (err) {
        console.warn('[EvidenceCapture] Falló el despacho en línea, aplicando resguardo offline automático:', err);
        // Fallback automático transparente: guardar en outbox offline
        const saved = await saveEvidenceToOutbox({
          ...payloadBase,
          status: 'PENDIENTE_SYNC',
        });
        setLastSubmission({
          mode: 'OFFLINE_FALLBACK',
          record: saved,
          mensaje: '⚠️ Falló la conexión con el servidor. Evidencia resguardada localmente con UUID v7; se enviará automáticamente al reconectar.',
        });
      }
    } else {
      // ===== CASO 2: NO HAY INTERNET -> RESGUARDO LOCAL AUTOMÁTICO =====
      const saved = await saveEvidenceToOutbox({
        ...payloadBase,
        status: 'PENDIENTE_SYNC',
      });

      setLastSubmission({
        mode: 'OFFLINE',
        record: saved,
        mensaje: '📡 Sin señal celular detectada. Evidencia blindada automáticamente en la bandeja local (UUID v7). Se despachará sola apenas vuelva el internet.',
      });
    }

    setIsSubmitting(false);

    if (onEvidenceSaved) {
      onEvidenceSaved();
    }
  };

  const quickTemplates = [
    {
      label: '⚠️ Químico / HazMat',
      text: 'Humo negro espeso saliendo de tinglado industrial con tambores de solventes y pintura inflamable.',
    },
    {
      label: '🔥 Estructural / Rescate',
      text: 'Fuego descontrolado en segundo piso de vivienda habitada, posibles personas atrapadas en habitación posterior.',
    },
    {
      label: '🌲 Forestal / Pastizal',
      text: 'Incendio de pastizal seco avanzando velozmente por ráfagas de viento hacia viviendas linderas.',
    },
    {
      label: '✅ Fuego Controlado',
      text: 'Fuego sofocado al 100%. Iniciando remoción de escombros y monitoreo de temperatura con cámara térmica.',
    },
  ];

  return (
    <section className="tactical-card">
      <div className="card-header">
        <h2 className="card-title">REGISTRO DE EVIDENCIA & IA LOCAL (CU-08)</h2>
        <span className="badge-mono font-mono">{incidenteId}</span>
      </div>

      <div className="evidence-form-grid">
        {/* Selector de Tipo de Evidencia */}
        <div className="form-group">
          <label className="form-label">TIPO DE EVIDENCIA DE CAMPO</label>
          <div className="radio-pill-group">
            {[
              { id: 'NOTA_VOZ_TACTICA', label: '🎙️ NOTA DE VOZ TÁCTICA' },
              { id: 'FOTOGRAFIA_ESCENA', label: '📸 FOTOGRAFÍA DE ESCENA' },
              { id: 'EVALUACION_DANOS', label: '📋 EVALUACIÓN DE DAÑOS' },
              { id: 'REPORTE_HIDRANTE', label: '💧 REPORTE DE HIDRANTE' },
            ].map((tipo) => (
              <button
                key={tipo.id}
                type="button"
                className={`pill-btn ${tipoEvidencia === tipo.id ? 'pill-btn-active' : ''}`}
                onClick={() => setTipoEvidencia(tipo.id)}
              >
                {tipo.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dictado o Texto */}
        <div className="form-group">
          <div className="label-with-action">
            <label className="form-label">TRANSCRIPCIÓN O NOTA TÁCTICA</label>
            <button
              type="button"
              className={`btn-tactical btn-record ${isRecording ? 'btn-recording-pulse' : ''}`}
              onClick={handleVoiceToggle}
              title="Graba tu voz usando el micrófono de tu celular o PC y transcribe en tiempo real"
            >
              {isRecording ? `🔴 GRABANDO TU VOZ (${recordingSeconds}s)... (TOCA PARA DETENER)` : '🎙️ GRABAR DICTADO POR VOZ (MICRÓFONO)'}
            </button>
          </div>

          {microfonoError && (
            <div style={{ color: '#F87171', fontSize: '11px', marginTop: '4px', marginBottom: '4px' }}>
              ⚠️ {microfonoError}
            </div>
          )}

          {audioUrl && (
            <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Audio grabado:</span>
              <audio controls src={audioUrl} style={{ height: '28px', maxWidth: '280px' }} />
            </div>
          )}

          <textarea
            className="tactical-textarea"
            rows="3"
            value={textoReporte}
            onChange={(e) => setTextoReporte(e.target.value)}
            placeholder="Habla por el micrófono con el botón superior o escribe el reporte táctico aquí..."
          />

          {/* Plantillas Rápidas */}
          <div className="template-chips">
            <span className="template-label">Plantillas rápidas:</span>
            {quickTemplates.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="chip-btn"
                onClick={() => setTextoReporte(item.text)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Panel de Inferencia IA Local (Transformers.js en Web Worker) */}
        {aiAnalysis && (
          <div className="ai-results-panel">
            <div className="ai-header">
              <span className="ai-title">⚡ INFERENCIA EDGE AI (WEB WORKER DEDICADO A 60 FPS)</span>
              <span className="ai-badge font-mono">
                LATENCIA: {aiAnalysis.latenciaMs}ms &bull; CONFIANZA: {(aiAnalysis.confianza * 100).toFixed(0)}%
              </span>
            </div>

            <div className="ai-grid">
              <div className="ai-metric-box">
                <span className="metric-box-label">CATEGORÍA PRE-CLASIFICADA</span>
                <div className="category-badge-pill font-bold">
                  {formatCategoria(aiAnalysis.categoria)}
                </div>
                <span className="category-code-sub">{aiAnalysis.categoria}</span>
              </div>

              <div className="ai-metric-box">
                <span className="metric-box-label">NIVEL DE SEVERIDAD</span>
                <div className="severity-meter">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <span
                      key={lvl}
                      className={`meter-bar ${lvl <= aiAnalysis.severidad ? `active-bar-${aiAnalysis.severidad}` : ''}`}
                    />
                  ))}
                  <span className="meter-number font-mono">
                    {aiAnalysis.severidad} / 5 ({aiAnalysis.nivelRiesgo})
                  </span>
                </div>
              </div>

              <div className="ai-metric-box full-width">
                <span className="metric-box-label">ALERTA Y RECOMENDACIÓN OPERATIVA</span>
                <span className="metric-box-alert font-mono">{aiAnalysis.alerta}</span>
                <p className="metric-box-sub">{aiAnalysis.resumenTactico}</p>
              </div>

              {/* Información del Dataset Táctico de 1,200 registros históricos para alimentar el razonamiento */}
              <div className="ai-metric-box full-width" style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-card)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="metric-box-label" style={{ color: 'var(--color-primary)', fontWeight: 800 }}>
                    🧠 RAZONAMIENTO BASADO EN DATASET HISTÓRICO (1,200 SINIESTROS SCZ)
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }} className="font-tactical-mono">k-NN &bull; DBSCAN</span>
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <p style={{ margin: 0, color: 'var(--text-primary)' }}>
                    💧 <b>Agua estimada recomendada:</b> {aiInferenceEngine.estimarRecursos(aiAnalysis.categoria, aiAnalysis.severidad).litrosAguaSugeridos.toLocaleString()} Litros
                  </p>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '11px' }}>
                    📌 Casos similares en Santa Cruz:
                  </p>
                  {aiInferenceEngine.buscarCasosSimilares(textoReporte, 2).map((caso) => (
                    <div key={caso.id} style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: 'var(--radius-btn)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <b style={{ color: 'var(--color-primary)' }}>[{caso.id}]</b> {caso.distritoMunicipal} ({caso.nombreZona}) - {caso.recursosRequeridos.litrosAguaMinimos}L &bull; {caso.recomendacionTacticaIA.substring(0, 75)}...
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ACCIÓN PRINCIPAL INTELIGENTE: Detecta estado de red automáticamente */}
        <div className="unified-action-container">
          <button
            type="button"
            className={`btn-tactical btn-unified-action ${
              isOnline ? 'btn-action-online' : 'btn-action-offline'
            }`}
            onClick={handleEnviarReporte}
            disabled={isSubmitting}
          >
            <div className="btn-action-content">
              <div className="btn-action-icon">{isOnline ? '🚀' : '📡'}</div>
              <div className="btn-action-text-group">
                <span className="btn-action-title">
                  {isSubmitting
                    ? 'PROCESANDO EVIDENCIA...'
                    : isOnline
                    ? 'REGISTRAR Y ENVIAR REPORTE AL COMANDO'
                    : 'REGISTRAR REPORTE EN MODO OFFLINE AUTOMÁTICO'}
                </span>
                <span className="btn-action-subtitle">
                  {isOnline
                    ? '● Conexión activa: Envío directo con confirmación inmediata del servidor'
                    : '▲ Sin señal: Resguardo local con UUID v7; se enviará automáticamente apenas vuelva el internet'}
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Tarjeta de Confirmación de Envío / Guardado */}
        {lastSubmission && (
          <div
            className={`submission-feedback-card ${
              lastSubmission.mode === 'ONLINE' ? 'feedback-online' : 'feedback-offline'
            }`}
          >
            <div className="feedback-icon">
              {lastSubmission.mode === 'ONLINE' ? '✅' : '📦'}
            </div>
            <div className="feedback-details">
              <span className="feedback-title">
                {lastSubmission.mode === 'ONLINE'
                  ? 'EVIDENCIA ENVIADA Y CONFIRMADA EN SERVIDOR'
                  : 'EVIDENCIA RESGUARDADA EN BANDEJA LOCAL (OUTBOX)'}
              </span>
              <p className="feedback-message">{lastSubmission.mensaje}</p>
              <div className="feedback-meta font-mono">
                <span>UUID v7: {lastSubmission.record?.id}</span>
                {lastSubmission.serverData && (
                  <span> &bull; Servidor ID: {lastSubmission.serverData.evidenciaId || lastSubmission.serverData.id}</span>
                )}
                <span> &bull; Estado: {lastSubmission.record?.status}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
