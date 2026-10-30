import { $, AFTER_SEND, LABEL, VIA, approved, ag, canQueue, esc, host, lastSend, logOf, pill, template, ui, when } from './state.js';
import { LANGS, fill } from './template-text.js';

const FORM_FIELDS = [['Nombre', 'Daniel Martin'], ['Empresa', 'Naolito'], ['Email', 'dmartin@naolito.com']];

function proofLink(send) {
  if (!send) return '';
  if (send.proof_image) return `<a href="/api/sends/${send.id}/proof" target="_blank" rel="noopener">Ver la prueba del envío</a>`;
  if (/^https:\/\//.test(send.proof || '')) return `<a href="${esc(send.proof)}" target="_blank" rel="noopener">Ver la prueba del envío</a>`;
  return send.proof ? `Prueba: ${esc(send.proof)}` : '';
}

function history(a) {
  const log = [...logOf(a.id)].reverse();
  if (!log.length) return '<ol class="log"><li class="empty">Todavía no se ha hecho nada.</li></ol>';
  return `<ol class="log">${log.map((e) => `<li><time>${when(e.created_at)}</time><span>${esc(e.text)} <span class="who">· ${esc(e.actor)}</span></span></li>`).join('')}</ol>`;
}

function shown(a, send) {
  if (AFTER_SEND.includes(a.state) && send?.body) return { subject: send.subject, body: send.body };
  const t = template(a.lang);
  return { subject: fill(t.subject, a), body: fill(t.body, a) };
}

function sendFoot(a) {
  if (AFTER_SEND.includes(a.state)) {
    return `<div class="foot"><span class="hint">Marca aquí cómo va la conversación.</span><select data-state aria-label="Estado">${AFTER_SEND.map((s) => `<option value="${s}" ${s === a.state ? 'selected' : ''}>${LABEL[s]}</option>`).join('')}</select></div>`;
  }
  if (a.state === 'atencion') {
    return `<div class="foot"><span class="hint">Si lo resuelves por otra vía, márcalo aquí.</span><span class="acts">${lastSend(a.id)?.status === 'enviado' ? '' : '<button class="btn" data-action="requeue">Devolver a la cola</button>'}<button class="btn" data-action="manual">Lo he enviado yo</button></span></div>`;
  }
  if (a.state === 'cola') {
    const hint = approved(a.lang) ? 'Un agente la enviará con la plantilla aprobada.' : 'Espera a que se apruebe su plantilla.';
    return `<div class="foot"><span class="hint">${hint}</span><button class="btn" data-action="unqueue">Sacar de la cola</button></div>`;
  }
  if (a.state === 'preparando') {
    return `<div class="foot"><span class="hint">Un agente la está enviando.</span><button class="btn" data-action="requeue">Devolver a la cola</button></div>`;
  }
  return `<div class="foot"><span class="hint">Queda en cola y un agente la envía con la plantilla aprobada.</span><button class="btn pri" data-queue="${a.id}" ${canQueue(a) ? '' : 'disabled'}>Enviar</button></div>`;
}

function sendTab(a) {
  const v = a.via;
  const send = lastSend(a.id);
  const locked = AFTER_SEND.includes(a.state);
  const opts = a.vias.map((k) => `<option value="${k}" ${k === v ? 'selected' : ''}>${VIA[k]}</option>`).join('');
  const target = v === 'form' ? a.form : v === 'email' ? `mailto:${a.email}` : a.web;
  const place = v === 'email' ? a.email : host(target);
  let body = `<div class="row"><label>Vía <select data-via ${locked || a.state === 'preparando' ? 'disabled' : ''}>${opts}</select></label>${target ? `<a href="${esc(target)}" target="_blank" rel="noopener">${esc(place)}</a>` : ''}</div>`;
  if (a.state === 'atencion') body += `<div class="note warn"><b>Necesita a Nacho:</b> ${esc(a.why || 'El agente no ha podido terminar.')}</div>`;
  if (v === 'third') body += `<div class="note warn">${esc(a.person)}</div>`;
  if (locked) body += `<div class="note ok">Enviado. ${proofLink(send) || 'El texto y la prueba del envío quedan en el historial.'}</div>`;
  else if (!approved(a.lang)) body += `<div class="note warn">La <a href="#plantillas" data-close>plantilla en ${LANGS[a.lang].toLowerCase()}</a> necesita aprobación.</div>`;
  const text = shown(a, send);
  const fields = `<label class="field">Asunto<input value="${esc(text.subject)}" readonly></label>
    <label class="field">Mensaje<textarea readonly>${esc(text.body)}</textarea></label>`;
  if (v === 'form') {
    body += `<div class="sheet"><div class="site"><span>Formulario de ${esc(host(a.form))}</span><span>Vista previa</span></div>
      ${FORM_FIELDS.map(([l, x]) => `<label class="field">${l}<input value="${esc(x)}" readonly></label>`).join('')}${fields}
      <p class="attach muted">Un formulario no suele admitir adjuntos: este envío no lleva el dossier.</p></div>`;
  } else {
    body += `<div class="sheet"><div class="site"><span>Para: ${esc(a.email || 'sin email público')}</span><span>Vista previa</span></div>${fields}
      <p class="attach muted">Adjunto: naolito-licensing-dossier-en.pdf</p></div>`;
  }
  return { body, foot: sendFoot(a) };
}

export function renderDrawer() {
  const box = $('#drawer-box');
  box.hidden = !ui.open;
  if (!ui.open) return;
  const a = ag(ui.open);
  const tabs = [['send', 'Envío'], ['hist', `Historial (${logOf(a.id).length})`], ['notes', 'Notas']];
  const head = `<header><div class="dhead"><div><h3>${esc(a.name)} ${a.top_rank ? `<span class="badge top">Top ${a.top_rank}</span>` : ''}</h3>
    <p class="meta">${esc(a.country)} · ${pill(a.state)}</p></div><button class="x" aria-label="Cerrar" data-close>×</button></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div></header>`;
  let body = '';
  let foot = '';
  if (ui.tab === 'send') ({ body, foot } = sendTab(a));
  if (ui.tab === 'hist') body = history(a);
  if (ui.tab === 'notes') body = `<label class="field">Notas de esta agencia<textarea data-notes placeholder="Lo que te han dicho, a quién llamar…">${esc(a.notes)}</textarea></label>`;
  $('#drawer').innerHTML = `${head}<div class="body">${body}</div>${foot}`;
}
