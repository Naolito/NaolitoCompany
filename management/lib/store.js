import { HttpError } from './http.js';

export const now = () => new Date().toISOString();

const TEMPLATE_READY = `EXISTS (SELECT 1 FROM templates t WHERE t.lang = agencies.lang AND t.status = 'approved')`;

export async function getAgency(env, id) {
  const row = await env.DB.prepare('SELECT * FROM agencies WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Esa agencia no existe.');
  return row;
}

export const eventStatement = (env, actor, { agency = null, lang = null, kind, text }) => env.DB
  .prepare('INSERT INTO events (agency_id, template_lang, actor, actor_type, kind, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .bind(agency, lang, actor.name, actor.type, kind, text, now());

// Moves an agency only if it is still in one of `from`, so two people or agents can't both win.
export async function transition(env, actor, id, { from, to, text, kind = 'state', why = null, needsTemplate = false }) {
  const places = from.map(() => '?').join(', ');
  const guard = needsTemplate ? ` AND via != 'third' AND ${TEMPLATE_READY}` : '';
  const result = await env.DB
    .prepare(`UPDATE agencies SET state = ?, why = ?, updated_at = ? WHERE id = ? AND state IN (${places})${guard}`)
    .bind(to, why, now(), id, ...from).run();
  if (!result.meta.changes) return false;
  await eventStatement(env, actor, { agency: id, kind, text }).run();
  return true;
}

export async function getTemplates(env) {
  const { results } = await env.DB.prepare('SELECT * FROM templates ORDER BY lang').all();
  return results;
}

export async function getTemplate(env, lang) {
  const row = await env.DB.prepare('SELECT * FROM templates WHERE lang = ?').bind(lang).first();
  if (!row) throw new HttpError(404, 'Solo hay plantillas en inglés (en) y español (es).');
  return row;
}
