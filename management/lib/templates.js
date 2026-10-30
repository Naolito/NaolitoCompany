import { LANGS, unknownPlaceholders } from '../public/js/template-text.js';
import { MAX_TEXT } from './constants.js';
import { HttpError, text } from './http.js';
import { eventStatement, getTemplate, now } from './store.js';

function clean(input) {
  const subject = text(input.subject, 'subject', 500);
  const body = text(input.body, 'body', MAX_TEXT);
  const unknown = unknownPlaceholders(`${subject} ${body}`);
  if (unknown.length) throw new HttpError(400, `Esta plantilla no conoce: ${unknown.map((k) => `{{${k}}}`).join(', ')}.`);
  return { subject, body };
}

// Any change of text goes back to needing approval. `version`, when given, stops someone
// from overwriting (or approving) a text they haven't seen.
export async function saveTemplate(env, actor, lang, input) {
  const current = await getTemplate(env, lang);
  const { subject, body } = clean(input);
  if (input.version !== undefined && input.version !== current.version) {
    throw new HttpError(409, 'Alguien ha cambiado esta plantilla. Recarga para ver su versión.');
  }
  if (subject === current.subject && body === current.body) return getTemplate(env, lang);
  const stamp = now();
  const result = await env.DB.prepare(`UPDATE templates SET subject = ?, body = ?, status = 'draft', version = version + 1,
      updated_by = ?, updated_at = ?, approved_by = NULL, approved_at = NULL WHERE lang = ? AND version = ?`)
    .bind(subject, body, actor.name, stamp, lang, current.version).run();
  if (!result.meta.changes) throw new HttpError(409, 'Alguien ha cambiado esta plantilla. Recarga para ver su versión.');
  const verb = current.status === 'approved' ? 'editada: vuelve a necesitar aprobación' : 'guardada como borrador';
  await eventStatement(env, actor, { lang, kind: 'template', text: `Plantilla en ${LANGS[lang].toLowerCase()} ${verb}` }).run();
  return getTemplate(env, lang);
}

export async function approveTemplate(env, actor, lang, input) {
  const saved = await saveTemplate(env, actor, lang, input);
  if (saved.status === 'approved') return saved;
  const result = await env.DB.prepare(`UPDATE templates SET status = 'approved', approved_by = ?, approved_at = ?
      WHERE lang = ? AND version = ?`).bind(actor.name, now(), lang, saved.version).run();
  if (!result.meta.changes) throw new HttpError(409, 'Alguien ha cambiado esta plantilla. Recarga para ver su versión.');
  await eventStatement(env, actor, { lang, kind: 'template', text: `Plantilla en ${LANGS[lang].toLowerCase()} aprobada` }).run();
  return getTemplate(env, lang);
}
