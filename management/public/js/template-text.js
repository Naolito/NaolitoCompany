// Shared by the page (preview) and the API (what agents send).
export const PLACEHOLDERS = ['saludo', 'referencia'];
export const LANGS = { en: 'Inglés', es: 'Español' };

const GREETING = {
  es: (name) => (name ? `Hola, ${name}:` : 'Hola:'),
  en: (name) => (name ? `Hi ${name},` : 'Hello,'),
};
const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function fill(text, agency) {
  const values = { saludo: GREETING[agency.lang](agency.greeting), referencia: agency.reference };
  return String(text).replace(TOKEN, (whole, key) => values[key] ?? whole);
}

export function unknownPlaceholders(text) {
  return [...String(text).matchAll(TOKEN)].map((m) => m[1]).filter((key) => !PLACEHOLDERS.includes(key));
}
