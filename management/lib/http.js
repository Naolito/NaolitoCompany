export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function readJson(request) {
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* falls through to the 400 */ }
  throw new HttpError(400, 'El cuerpo debe ser un objeto JSON.');
}

export function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `Falta «${field}».`);
  if (value.length > max) throw new HttpError(413, `«${field}» es demasiado largo.`);
  return value;
}
