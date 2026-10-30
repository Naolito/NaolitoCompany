import { $, STATES, VIA, ag, approved, canQueue, esc, logOf, pill, ui, when } from './state.js';
import { LANGS } from './template-text.js';

const inStates = (list) => ui.data.agencies.filter((a) => list.includes(a.state)).length;

function renderKpis() {
  const total = ui.data.agencies.length;
  const k = [
    [inStates(['enviado', 'respondio', 'reunion', 'firmada']), () => `de ${total} contactadas`],
    [inStates(['respondio', 'reunion', 'firmada']), (v) => (v === 1 ? 'ha respondido' : 'han respondido')],
    [inStates(['reunion', 'firmada']), (v) => (v === 1 ? 'reunión' : 'reuniones')],
    [inStates(['cola']), () => 'en cola'],
    [inStates(['atencion']), (v) => (v === 1 ? 'necesita a Nacho' : 'necesitan a Nacho')],
  ];
  $('#kpis').innerHTML = k.map(([v, t]) => `<div class="kpi"><b>${v}</b><span>${t(v)}</span></div>`).join('');
}

function renderChips() {
  const { agencies } = ui.data;
  const counts = (s) => agencies.filter((a) => a.state === s).length;
  const all = `<button class="chip ${ui.filter === 'all' ? 'on' : ''}" data-chip="all">Todas<b>${agencies.length}</b></button>`;
  $('#chips').innerHTML = all + STATES.filter(([s]) => s !== 'preparando' && counts(s))
    .map(([s, l]) => `<button class="chip ${ui.filter === s ? 'on' : ''}" data-chip="${s}">${l}<b>${counts(s)}</b></button>`).join('');
}

export function applyFilters() {
  const region = $('nav button.on')?.dataset.filter || 'all';
  document.querySelectorAll('#rows tr').forEach((tr) => {
    tr.classList.toggle('hidden', (region !== 'all' && tr.dataset.region !== region) || (ui.filter !== 'all' && tr.dataset.state !== ui.filter));
  });
}

function action(a) {
  if (canQueue(a)) return `<button class="btn sm" data-queue="${a.id}">Enviar</button>`;
  return `<button class="btn sm" data-open="${a.id}">Abrir</button>`;
}

export function renderTable() {
  for (const id of [...ui.picked]) if (!canQueue(ag(id))) ui.picked.delete(id);
  $('#rows').innerHTML = ui.data.agencies.map((a) => {
    const log = logOf(a.id);
    const last = log[log.length - 1];
    return `<tr data-region="${a.region}" data-row="${a.id}" data-state="${a.state}">
      <td class="c"><input type="checkbox" aria-label="Elegir ${esc(a.name)}" data-pick="${a.id}" ${ui.picked.has(a.id) ? 'checked' : ''} ${canQueue(a) ? '' : 'disabled'}></td>
      <td><span class="name">${esc(a.name)}</span> ${a.top_rank ? `<span class="badge top">Top ${a.top_rank}</span>` : ''}<span class="sub">${esc(a.country)}</span></td>
      <td class="num">${a.score}</td>
      <td class="via">${VIA[a.via]}</td>
      <td>${pill(a.state)}</td>
      <td><span class="sub">${last ? `${when(last.created_at)}<br>${esc(last.text)}` : 'Nada todavía'}</span></td>
      <td>${action(a)}</td></tr>`;
  }).join('');
  applyFilters();
  const ready = ui.picked.size;
  if (!ready) $('#pick-all').checked = false;
  $('#prep').disabled = !ready;
  $('#prep').textContent = ready ? `Enviar ${ready} ${ready === 1 ? 'agencia' : 'agencias'}` : 'Enviar las elegidas';
  const missing = Object.keys(LANGS).filter((lang) => !approved(lang)).map((lang) => LANGS[lang].toLowerCase());
  $('#tpl-hint').hidden = !missing.length;
  $('#tpl-hint').innerHTML = missing.length
    ? `Para poner agencias en cola hace falta aprobar la <a href="#plantillas">plantilla en ${missing.join(' y en ')}</a>.` : '';
}

const subject = (e) => (e.agency_id
  ? `<a data-open="${e.agency_id}"><b>${esc(ag(e.agency_id)?.name)}</b></a>: ${esc(e.text)}` : esc(e.text));

function renderLog() {
  const recent = ui.data.events.slice(-12).reverse();
  $('#log').innerHTML = recent.length
    ? recent.map((e) => `<li><time>${when(e.created_at)}</time><span>${subject(e)} <span class="who">· ${esc(e.actor)}</span></span></li>`).join('')
    : '<li class="empty">Todavía no se ha hecho nada.</li>';
}

function renderCards() {
  ui.data.agencies.forEach((a) => {
    const box = document.getElementById(a.id);
    if (!box) return;
    let row = box.querySelector('.track-row');
    if (!row) { row = document.createElement('div'); row.className = 'track-row'; box.appendChild(row); }
    row.innerHTML = `${pill(a.state)}<button class="btn sm" data-open="${a.id}">Seguimiento y envío</button>`;
  });
}

export function renderTracking() {
  renderKpis(); renderChips(); renderTable(); renderLog(); renderCards();
}

