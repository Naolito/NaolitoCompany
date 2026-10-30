import { api, load, showProblem } from './api.js';
import { renderDrawer } from './drawer.js';
import { renderReport } from './report.js';
import { $, ag, ui } from './state.js';
import { renderTemplates, syncTemplateButtons } from './templates.js';
import { applyFilters, renderTable, renderTracking } from './tracking.js';

function render() { renderTracking(); renderTemplates(); renderDrawer(); }

async function act(work) {
  try {
    showProblem('');
    await work();
    await load();
    render();
  } catch (err) {
    showProblem(err.message);
  }
}

async function queue(ids) {
  const { skipped } = await api('agencies/queue', 'POST', { ids });
  ids.forEach((id) => ui.picked.delete(id));
  if (skipped.length) throw new Error(`${skipped.map((id) => ag(id).name).join(', ')}: no se ha podido poner en cola. Revisa su estado y su plantilla.`);
}

let notesTimer = null;
let notesPending = null;
function flushNotes() {
  clearTimeout(notesTimer);
  if (!notesPending) return;
  const { id, notes } = notesPending;
  notesPending = null;
  api(`agencies/${id}/notes`, 'PUT', { notes }).catch((err) => showProblem(err.message));
}

function closeDrawer() { flushNotes(); ui.open = null; renderDrawer(); }
function openDrawer(id) { flushNotes(); ui.open = id; ui.tab = 'send'; renderDrawer(); }

function saveTemplate(lang, approve) {
  const d = ui.drafts[lang] ?? ui.data.templates.find((x) => x.lang === lang);
  const body = { subject: d.subject, body: d.body, version: d.version };
  act(async () => {
    await (approve ? api(`templates/${lang}/approve`, 'POST', body) : api(`templates/${lang}`, 'PUT', body));
    delete ui.drafts[lang];
    $('#templates').innerHTML = '';
  });
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-queue],[data-open],[data-close],[data-tab],[data-chip],[data-action],[data-tpl-save],[data-tpl-approve],#prep,#scrim,nav button');
  if (e.target.matches('[data-pick]')) return;
  if (!t) { const row = e.target.closest('tr[data-row]'); if (row) openDrawer(row.dataset.row); return; }
  if (t.matches('nav button')) {
    const f = t.dataset.filter;
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b === t));
    document.querySelectorAll('[data-region]').forEach((el) => el.classList.toggle('hidden', f !== 'all' && el.dataset.region !== f));
    document.querySelectorAll('section.region').forEach((s) => s.classList.toggle('hidden', f !== 'all' && s.id !== `r-${f}`));
    applyFilters();
    return;
  }
  if (t.dataset.queue) { act(() => queue([t.dataset.queue])); return; }
  if (t.dataset.open) { openDrawer(t.dataset.open); return; }
  if ('close' in t.dataset || t.id === 'scrim') { closeDrawer(); return; }
  if (t.dataset.tab) { flushNotes(); ui.tab = t.dataset.tab; renderDrawer(); return; }
  if (t.dataset.chip) { ui.filter = t.dataset.chip; renderTracking(); return; }
  if (t.dataset.action) { act(() => api(`agencies/${ui.open}/${t.dataset.action}`, 'POST', {})); return; }
  if (t.id === 'prep') { act(() => queue([...ui.picked])); return; }
  const tpl = t.closest('[data-tpl]')?.dataset.tpl;
  if ('tplSave' in t.dataset) saveTemplate(tpl, false);
  if ('tplApprove' in t.dataset) saveTemplate(tpl, true);
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pick) { t.checked ? ui.picked.add(t.dataset.pick) : ui.picked.delete(t.dataset.pick); renderTable(); return; }
  if (t.id === 'pick-all') {
    ui.picked.clear();
    if (t.checked) document.querySelectorAll('#rows tr:not(.hidden) [data-pick]:not(:disabled)').forEach((c) => ui.picked.add(c.dataset.pick));
    renderTable();
    return;
  }
  if (t.matches('[data-via]')) { act(() => api(`agencies/${ui.open}/via`, 'POST', { via: t.value })); return; }
  if (t.matches('[data-state]')) act(() => api(`agencies/${ui.open}/state`, 'POST', { state: t.value }));
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if ('notes' in t.dataset) {
    ag(ui.open).notes = t.value;
    notesPending = { id: ui.open, notes: t.value };
    clearTimeout(notesTimer);
    notesTimer = setTimeout(flushNotes, 800);
  }
  if (t.dataset.tplField) {
    const lang = t.closest('[data-tpl]').dataset.tpl;
    const { subject, body, version } = ui.drafts[lang] ?? ui.data.templates.find((x) => x.lang === lang);
    ui.drafts[lang] = { subject, body, version, [t.dataset.tplField]: t.value };
    syncTemplateButtons(lang);
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.open) closeDrawer(); });

// Agents work while the page sits in a tab: catch up on return, unless someone is typing.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !ui.data || document.activeElement?.matches('input:not([type=checkbox]), textarea, select')) return;
  act(async () => {});
});

(async () => {
  try {
    await load();
    renderReport();
    render();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  } catch (err) {
    showProblem(err.message);
  }
})();

