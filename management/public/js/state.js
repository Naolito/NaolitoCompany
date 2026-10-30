export const STATES = [
  ['nuevo', 'Sin empezar'], ['cola', 'En cola'], ['preparando', 'Preparando'],
  ['atencion', 'Necesita a Nacho'], ['enviado', 'Enviado'], ['respondio', 'Respondió'],
  ['reunion', 'Reunión'], ['firmada', 'Firmada'], ['descartada', 'Descartada'],
];
export const LABEL = Object.fromEntries(STATES);
export const AFTER_SEND = ['enviado', 'respondio', 'reunion', 'firmada', 'descartada'];
export const VIA = { form: 'Formulario', email: 'Email', pending: 'Por confirmar', third: 'Por un tercero' };

export const ui = { data: null, open: null, tab: 'send', filter: 'all', picked: new Set(), drafts: {} };

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const when = (t) => { const d = new Date(t); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };
export const pill = (s) => `<span class="pill s-${s}">${LABEL[s]}</span>`;
export const ag = (id) => ui.data.agencies.find((a) => a.id === id);
export const template = (lang) => ui.data.templates.find((t) => t.lang === lang);
export const approved = (lang) => template(lang)?.status === 'approved';
export const logOf = (id) => ui.data.events.filter((e) => e.agency_id === id);
export const lastSend = (id) => ui.data.sends.filter((s) => s.agency_id === id).at(-1);
export const canQueue = (a) => a.state === 'nuevo' && a.via !== 'third' && approved(a.lang);
