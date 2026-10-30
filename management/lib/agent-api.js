import { fill } from '../public/js/template-text.js';
import { AFTER_SEND, LABEL, MAX_PROOF, MAX_TEXT, REPLY_STATES, VIA_LABEL } from './constants.js';
import { HttpError, json, readJson, text } from './http.js';
import { getAgency, getTemplate, getTemplates, now, transition } from './store.js';
import { saveTemplate } from './templates.js';

const publicAgency = (a) => ({
  id: a.id, name: a.name, region: a.region, country: a.country, lang: a.lang, state: a.state, via: a.via,
  web: a.web, email: a.email, form: a.form, person: a.person, why: a.why,
});
const recipientOf = (a) => (a.via === 'form' ? a.form : a.via === 'email' ? a.email : null);

function queueItem(agency, templates) {
  const template = templates.find((t) => t.lang === agency.lang);
  const ready = template?.status === 'approved';
  const item = { ...publicAgency(agency), recipient: recipientOf(agency), ready };
  if (!ready) return item;
  return { ...item, subject: fill(template.subject, agency), body: fill(template.body, agency), template_version: template.version };
}

async function readQueue(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM agencies WHERE state IN ('cola', 'preparando') ORDER BY sort`).all();
  const templates = await getTemplates(env);
  return results.map((a) => queueItem(a, templates));
}

async function claim(env, actor, id) {
  await getAgency(env, id);
  const done = await transition(env, actor, id, {
    from: ['cola'], to: 'preparando', kind: 'claim', text: 'El agente empieza el envío', needsTemplate: true,
  });
  if (!done) throw new HttpError(409, 'No se puede coger: no está en cola, ya la ha cogido otro agente o su plantilla necesita aprobación.');
  const agency = await getAgency(env, id);
  return queueItem(agency, [await getTemplate(env, agency.lang)]);
}

function checkProof(proof) {
  const value = text(proof, 'proof', MAX_PROOF);
  if (value.startsWith('data:') && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new HttpError(400, '«proof» solo admite capturas PNG, JPEG o WebP en base64.');
  }
  return value;
}

async function recordSend(env, actor, id, input) {
  const agency = await getAgency(env, id);
  const { status } = input;
  if (status !== 'enviado' && status !== 'atencion') throw new HttpError(400, '«status» debe ser «enviado» o «atencion».');
  const sent = status === 'enviado';
  const subject = sent ? text(input.subject, 'subject', 500) : input.subject ?? null;
  const body = sent ? text(input.body, 'body', MAX_TEXT) : input.body ?? null;
  const proof = sent ? checkProof(input.proof) : input.proof ?? null;
  const why = sent ? null : text(input.why, 'why', 1000);
  const via = input.via ?? agency.via;
  if (!JSON.parse(agency.vias).includes(via)) throw new HttpError(400, 'Esa vía no vale para esta agencia.');
  const recipient = input.recipient ?? recipientOf({ ...agency, via });
  const template = await getTemplate(env, agency.lang);
  const where = `? = (SELECT state FROM agencies WHERE id = ?)`;
  const message = sent ? `Enviado por ${VIA_LABEL[via]}${recipient ? ` a ${recipient}` : ''}` : `No se ha podido enviar: ${why}`;
  const stamp = now();
  // All three or none, and only while the agency is still claimed: a send can't be recorded twice.
  const [insert] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO sends (agency_id, status, via, recipient, subject, body, proof, template_version, actor, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${where}`)
      .bind(id, status, via, recipient, subject, body, proof, template.version, actor.name, stamp, 'preparando', id),
    env.DB.prepare(`INSERT INTO events (agency_id, actor, actor_type, kind, text, created_at)
      SELECT ?, ?, ?, 'send', ?, ? WHERE ${where}`)
      .bind(id, actor.name, actor.type, message, stamp, 'preparando', id),
    env.DB.prepare(`UPDATE agencies SET state = ?, via = ?, why = ?, updated_at = ? WHERE id = ? AND state = 'preparando'`)
      .bind(status, via, why, stamp, id),
  ]);
  if (!insert.meta.changes) throw new HttpError(409, 'Esta agencia no está en «Preparando»: cógela antes con claim.');
  return { ok: true, send_id: insert.meta.last_row_id, state: status };
}

// A reply that only a person should answer. Only here does an agency come back to «Necesita a Nacho» after a send.
async function escalateReply(env, actor, id, input) {
  const why = text(input.note, 'note', 1000);
  const done = await transition(env, actor, id, {
    from: ['enviado', 'respondio'], to: 'atencion', kind: 'reply', text: `Necesita a Nacho: ${why}`, why,
  });
  if (!done) throw new HttpError(409, 'Esta agencia no está esperando respuesta.');
  return { ok: true, state: 'atencion' };
}

async function markReply(env, actor, id, input) {
  await getAgency(env, id);
  if (input.state === 'atencion') return escalateReply(env, actor, id, input);
  if (!REPLY_STATES.includes(input.state)) throw new HttpError(400, `«state» debe ser uno de: ${REPLY_STATES.join(', ')}.`);
  const note = input.note ? `: ${text(input.note, 'note', 1000)}` : '';
  const done = await transition(env, actor, id, {
    from: AFTER_SEND, to: input.state, kind: 'reply', text: `Marcada como «${LABEL[input.state]}»${note}`,
  });
  if (!done) throw new HttpError(409, 'Esta agencia todavía no se ha contactado.');
  return { ok: true, state: input.state };
}

export async function agentApi(request, env, actor, parts) {
  const { method } = request;
  const [area, id, action] = parts;
  if (method === 'GET' && area === 'queue' && !id) return json({ queue: await readQueue(env) });
  if (method === 'GET' && area === 'templates' && !id) return json({ templates: await getTemplates(env) });
  if (method === 'PUT' && area === 'templates' && id) return json(await saveTemplate(env, actor, id, await readJson(request)));
  if (method === 'GET' && area === 'agencies' && !id) {
    const { results } = await env.DB.prepare('SELECT * FROM agencies ORDER BY sort').all();
    return json({ agencies: results.map(publicAgency) });
  }
  if (method === 'POST' && area === 'agencies' && id) {
    if (action === 'claim') return json(await claim(env, actor, id));
    if (action === 'sends') return json(await recordSend(env, actor, id, await readJson(request)), 201);
    if (action === 'reply') return json(await markReply(env, actor, id, await readJson(request)));
  }
  throw new HttpError(404, 'No existe.');
}

