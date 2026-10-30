import { $, esc, template, ui, when } from './state.js';
import { LANGS, PLACEHOLDERS } from './template-text.js';

const draftOf = (lang) => ui.drafts[lang] ?? template(lang);
const isDirty = (lang) => {
  const d = ui.drafts[lang];
  const t = template(lang);
  return !!d && (d.subject !== t.subject || d.body !== t.body);
};

function statusLine(t) {
  if (t.status === 'approved') return `Aprobada por ${esc(t.approved_by)} · ${when(t.approved_at)}`;
  return t.updated_by ? `Editada por ${esc(t.updated_by)} · ${when(t.updated_at)}` : 'Todavía sin aprobar';
}

function card(lang) {
  const t = template(lang);
  const d = draftOf(lang);
  const label = t.status === 'approved' ? 'Aprobada' : 'Necesita aprobación';
  return `<article class="card tpl" data-tpl="${lang}">
    <header><h3>${LANGS[lang]}</h3><span class="pill t-${t.status}" data-tpl-pill>${label}</span></header>
    <label class="field">Asunto<input data-tpl-field="subject" value="${esc(d.subject)}"></label>
    <label class="field">Mensaje<textarea data-tpl-field="body">${esc(d.body)}</textarea></label>
    <div class="acts"><p class="meta">${statusLine(t)}</p>
      <button class="btn" data-tpl-save disabled>Guardar</button>
      <button class="btn pri" data-tpl-approve>Aprobar</button></div>
  </article>`;
}

export function syncTemplateButtons(lang) {
  const box = $(`[data-tpl="${lang}"]`);
  const dirty = isDirty(lang);
  $('[data-tpl-save]', box).disabled = !dirty;
  $('[data-tpl-approve]', box).disabled = !dirty && template(lang).status === 'approved';
}

// A reload (or someone else's change) must never wipe text being typed.
export function renderTemplates() {
  const box = $('#templates');
  const langs = Object.keys(LANGS);
  const editing = langs.some(isDirty) || box.contains(document.activeElement);
  if (!editing || !box.children.length) {
    const hint = `<p class="meta">En el texto puedes usar ${PLACEHOLDERS.map((k) => `{{${k}}}`).join(' y ')}: cada agencia recibe los suyos.</p>`;
    box.innerHTML = langs.map(card).join('') + hint;
  }
  langs.forEach(syncTemplateButtons);
}
