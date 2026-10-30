import { MAX_WORDS } from './config.mjs';

const FORBIDDEN = /villains need love|comisi[oó]n|commission|exclusiv|royalt|regal[ií]a|anticipo|minimum guarantee|m[ií]nimo garantizado/i;

export const countWords = (text) => text.trim().split(/\s+/).filter(Boolean).length;

// Last check before anything leaves: a wrong text goes to Nacho, never to an agency.
export function problemsWith({ subject, body }) {
  const problems = [];
  const whole = `${subject}\n${body}`;
  if (/\{\{|\}\}/.test(whole)) problems.push('quedan huecos sin rellenar');
  if (countWords(body) >= MAX_WORDS) problems.push(`el texto tiene ${MAX_WORDS} palabras o más`);
  if (FORBIDDEN.test(whole)) problems.push('el texto menciona algo que no debe ir en un primer contacto');
  return problems;
}

// Claims the agency and returns its text, or moves it to «Necesita a Nacho» and returns null.
export async function claimChecked(api, id) {
  let item;
  try {
    item = await api.claim(id);
  } catch (error) {
    if (error.status === 409) return null;
    throw error;
  }
  const problems = problemsWith(item);
  if (!problems.length) return item;
  await api.recordStuck(id, `No se ha enviado: ${problems.join('; ')}.`);
  return null;
}
