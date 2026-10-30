export const STATES = ['nuevo', 'cola', 'preparando', 'atencion', 'enviado', 'respondio', 'reunion', 'firmada', 'descartada'];
export const AFTER_SEND = ['enviado', 'respondio', 'reunion', 'firmada', 'descartada'];
export const REPLY_STATES = ['respondio', 'reunion', 'firmada', 'descartada'];
export const LABEL = {
  nuevo: 'Sin empezar', cola: 'En cola', preparando: 'Preparando', atencion: 'Necesita a Nacho', enviado: 'Enviado',
  respondio: 'Respondió', reunion: 'Reunión', firmada: 'Firmada', descartada: 'Descartada',
};
export const VIA_LABEL = { form: 'formulario', email: 'email', pending: 'vía por confirmar', third: 'un tercero' };
export const MAX_PROOF = 1400000;
export const MAX_TEXT = 20000;
