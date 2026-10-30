import { $, ui } from './state.js';

export function showProblem(message) {
  const box = $('#problem');
  box.hidden = !message;
  box.textContent = message || '';
}

export async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('No hay conexión o tu sesión ha caducado: recarga la página.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se ha podido guardar: recarga la página.');
  return data;
}

export async function load() {
  ui.data = await api('state');
}
