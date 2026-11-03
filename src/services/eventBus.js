/**
 * Bus de Eventos Nativo del DOM (window CustomEvents)
 * Permite comunicación 100% desacoplada entre Microfrontends (Angular Host <-> React Mapa).
 * Documentado en PUNTO_02_MICROFRONTENDS.md, Sección 5.2.
 */

export const EVENTOS_BUS = {
  INCIDENTE_SELECCIONADO: 'BOMBEROS:INCIDENTE_SELECCIONADO',
  CAMION_SELECCIONADO: 'BOMBEROS:CAMION_SELECCIONADO',
  RUTA_ACTUALIZADA: 'BOMBEROS:RUTA_ACTUALIZADA',
  TELEMETRIA_EN_VIVO: 'BOMBEROS:TELEMETRIA_EN_VIVO'
};

export const emitirEvento = (nombreEvento, detalle) => {
  if (typeof window !== 'undefined') {
    const evento = new CustomEvent(nombreEvento, { detail: detalle, bubbles: true });
    window.dispatchEvent(evento);
    console.log(`[EventBus MFE-02 Emitted] -> ${nombreEvento}`, detalle);
  }
};

export const suscribirEvento = (nombreEvento, callback) => {
  if (typeof window !== 'undefined') {
    const manejador = (e) => callback(e.detail);
    window.addEventListener(nombreEvento, manejador);
    return () => window.removeEventListener(nombreEvento, manejador);
  }
  return () => {};
};
