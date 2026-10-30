import { AFTER_SEND, LABEL } from './constants.js';
import { HttpError, json, readJson } from './http.js';
import { eventStatement, getAgency, getTemplates, now, transition } from './store.js';
import { approveTemplate, saveTemplate } from './templates.js';

const NOTES_EVENT_WINDOW_MS = 10 * 60 * 1000;
const parse = (row) => ({ ...row, vias: JSON.parse(row.vias), research: JSON.parse(row.research) });

async function fullState(env, actor) {
  const [agencies, events, sends, report] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM agencies ORDER BY sort'),
    env.DB.prepare('SELECT * FROM events ORDER BY id'),
    env.DB.prepare(`SELECT id, agency_id, status, via, recipient, subject, body, actor, created_at,
        CASE WHEN proof LIKE 'data:%' THEN NULL ELSE proof END AS proof, proof LIKE 'data:%' AS proof_image
      FROM sends ORDER BY id`),
    env.DB.prepare('SELECT data FROM report WHERE id = 1'),
  ]);
  return {
    me: actor.name,
    agencies: agencies.results.map(parse),
    events: events.results,
    sends: sends.results,
    templates: await getTemplates(env),
    report: JSON.parse(report.results[0]?.data || '{}'),
  };
}

async function queue(env, actor, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Elige al menos una agencia.');
  const queued = [];
  const skipped = [];
  for (const id of ids) {
    const done = await transition(env, actor, String(id), {
      from: ['nuevo'], to: 'cola', kind: 'queue', text: 'Puesta en cola para enviar', needsTemplate: true,
    });
    (done ? queued : skipped).push(id);
  }
  return { queued, skipped };
}

async function setVia(env, actor, id, via) {
  const agency = await getAgency(env, id);
  if (!JSON.parse(agency.vias).includes(via)) throw new HttpError(400, 'Esa vía no vale para esta agencia.');
  if (agency.via === via) return;
  const result = await env.DB.prepare(`UPDATE agencies SET via = ?, updated_at = ? WHERE id = ? AND state IN ('nuevo', 'cola', 'atencion')`)
    .bind(via, now(), id).run();
  if (!result.meta.changes) throw new HttpError(409, 'Ya no se puede cambiar la vía de esta agencia.');
  await eventStatement(env, actor, { agency: id, kind: 'via', text: `Vía cambiada a ${via === 'form' ? 'formulario' : via}` }).run();
}

async function saveNotes(env, actor, id, notes) {
  if (typeof notes !== 'string' || notes.length > 20000) throw new HttpError(400, 'Las notas no son válidas.');
  const agency = await getAgency(env, id);
  if (agency.notes === notes) return;
  await env.DB.prepare('UPDATE agencies SET notes = ?, updated_at = ? WHERE id = ?').bind(notes, now(), id).run();
  // Notes save as you type: one history line per sitting, not one per pause.
  const last = await env.DB.prepare('SELECT actor, kind, created_at FROM events WHERE agency_id = ? ORDER BY id DESC LIMIT 1').bind(id).first();
  const recent = last?.kind === 'notes' && last.actor === actor.name && Date.now() - Date.parse(last.created_at) < NOTES_EVENT_WINDOW_MS;
  if (!recent) await eventStatement(env, actor, { agency: id, kind: 'notes', text: 'Notas actualizadas' }).run();
}

async function agencyAction(env, actor, id, action, input) {
  const conflict = (message) => { throw new HttpError(409, message); };
  await getAgency(env, id);
  if (action === 'unqueue') {
    return await transition(env, actor, id, { from: ['cola'], to: 'nuevo', kind: 'queue', text: 'Sacada de la cola' })
      || conflict('Ya no está en cola.');
  }
  if (action === 'requeue') {
    const sent = await env.DB.prepare(`SELECT 1 AS yes FROM sends WHERE agency_id = ? AND status = 'enviado' LIMIT 1`).bind(id).first();
    if (sent) conflict('Esta agencia ya recibió el primer contacto: no se le puede enviar otra vez.');
    return await transition(env, actor, id, {
      from: ['atencion', 'preparando'], to: 'cola', kind: 'queue', text: 'Devuelta a la cola', needsTemplate: true,
    }) || conflict('No se puede devolver a la cola: revisa que la plantilla esté aprobada.');
  }
  if (action === 'manual') {
    return await transition(env, actor, id, { from: ['atencion'], to: 'enviado', kind: 'send', text: 'Enviado a mano' })
      || conflict('Esta agencia ya no espera a nadie.');
  }
  if (action === 'state') {
    if (!AFTER_SEND.includes(input.state)) throw new HttpError(400, 'Ese estado no existe.');
    return await transition(env, actor, id, {
      from: AFTER_SEND, to: input.state, kind: 'state', text: `Estado cambiado a «${LABEL[input.state]}»`,
    }) || conflict('Esta agencia todavía no se ha contactado.');
  }
  throw new HttpError(404, 'Acción desconocida.');
}

async function proofImage(env, id) {
  const row = await env.DB.prepare('SELECT proof FROM sends WHERE id = ?').bind(id).first();
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(row?.proof || '');
  if (!match) throw new HttpError(404, 'Este envío no tiene captura.');
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': match[1], 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=3600' } });
}

export async function peopleApi(request, env, actor, parts) {
  const { method } = request;
  const [area, id, action, sub] = parts;
  if (method === 'GET' && area === 'state' && !id) return json(await fullState(env, actor));
  if (method === 'GET' && area === 'sends' && action === 'proof' && !sub) return proofImage(env, id);
  if (method === 'POST' && area === 'agencies' && id === 'queue' && !action) {
    return json(await queue(env, actor, (await readJson(request)).ids));
  }
  if (area === 'agencies' && id && action) {
    if (method === 'PUT' && action === 'notes') {
      await saveNotes(env, actor, id, (await readJson(request)).notes);
      return json({ ok: true });
    }
    if (method === 'POST' && action === 'via') {
      await setVia(env, actor, id, (await readJson(request)).via);
      return json({ ok: true });
    }
    if (method === 'POST') {
      await agencyAction(env, actor, id, action, await readJson(request));
      return json({ ok: true });
    }
  }
  if (area === 'templates' && id) {
    if (method === 'PUT' && !action) return json(await saveTemplate(env, actor, id, await readJson(request)));
    if (method === 'POST' && action === 'approve') return json(await approveTemplate(env, actor, id, await readJson(request)));
  }
  throw new HttpError(404, 'No existe.');
}
