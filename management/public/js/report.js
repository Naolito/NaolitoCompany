import { $, ag, esc, ui } from './state.js';

const REGIONS = { 'es-latam': 'España y Latinoamérica', 'uk-eu': 'Reino Unido y Europa', us: 'Estados Unidos y Asia-Pacífico' };

const link = (text, url) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
const source = (url) => (url ? `<a class="src" href="${esc(url)}" target="_blank" rel="noopener">[fuente]</a>` : '');

function items(list) {
  if (!list?.length) return "<p class='muted'>Sin datos verificados.</p>";
  return `<ul>${list.map((it) => {
    if (it.name && it.note) return `<li><b>${link(it.name, it.url)}</b> — ${esc(it.note)}</li>`;
    if (it.name) return `<li><b>${link(it.name, it.url)}</b></li>`;
    return `<li>${esc(it.note)} ${source(it.url)}</li>`;
  }).join('')}</ul>`;
}

function contact(c = {}) {
  const parts = [];
  if (c.email) parts.push(`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`);
  if (c.form) parts.push(link('formulario / web de contacto', c.form));
  if (c.phone) parts.push(esc(c.phone));
  let out = parts.join(' · ') || "<span class='muted'>no publicado</span>";
  if (c.person) out += `<br><b>Persona:</b> ${esc(c.person)} ${source(c.person_url)}`;
  return out;
}

function card(a) {
  const r = a.research;
  const badge = a.top_rank ? `<span class="badge top">Top ${a.top_rank}</span>` : '';
  return `<article class="card" id="${esc(a.id)}" data-region="${esc(a.region)}">
    <header><h3>${link(a.name, a.web)} ${badge}</h3>
      <div class="score" title="Encaje con Naolito (1-10)">${a.score}<small>/10</small></div></header>
    <p class="meta"><b>${esc(a.country)}</b> · Territorios: ${esc(r.territories)}</p>
    <p class="meta">Tamaño: ${esc(r.size)} ${source(r.size_url)}</p>
    <details open><summary>Marcas parecidas a Naolito</summary>${items(r.similar_brands)}</details>
    <details><summary>Señales de que coge marcas emergentes o medianas</summary>${items(r.emerging_signals)}</details>
    <details><summary>Condiciones</summary><p>${esc(r.terms || 'No públicas.')}</p></details>
    <details open><summary>Contacto</summary><p>${contact(r.contact)}</p></details>
    <div class="fit"><p><b>Por qué encaja:</b> ${esc(r.fit)}</p><p><b>Riesgo:</b> ${esc(r.risk)}</p></div>
  </article>`;
}

function table(agencies) {
  const rows = [...agencies].sort((p, q) => q.score - p.score).map((a) => `<tr data-region="${esc(a.region)}">
    <td><a href="#${esc(a.id)}">${esc(a.name)}</a></td><td>${esc(REGIONS[a.region])}</td><td>${esc(a.country)}</td>
    <td>${esc(a.research.territories)}</td><td class="num">${a.score}</td><td>${a.top_rank ? `Top ${a.top_rank}` : ''}</td></tr>`).join('');
  return `<table><thead><tr><th>Agencia</th><th>Región</th><th>País</th><th>Territorios</th><th>Encaje</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function top5(list) {
  return `<ol class="top5">${[...list].sort((p, q) => p.rank - q.rank).map((t) => {
    const a = ag(t.id);
    return `<li><h3><a href="#${esc(a.id)}">${esc(a.name)}</a> <span class="terr">${esc(t.territory)}</span></h3><p>${esc(t.reason)}</p>
      <p class="meta"><b>Primer contacto:</b> ${contact(a.research.contact)}</p></li>`;
  }).join('')}</ol>`;
}

function regions(agencies) {
  return Object.entries(REGIONS).map(([key, title]) => {
    const cards = agencies.filter((a) => a.region === key).map(card);
    return cards.length ? `<section class="region" id="r-${key}"><h2>${esc(title)} <small>(${cards.length})</small></h2><div class="grid">${cards.join('')}</div></section>` : '';
  }).join('');
}

// Research only changes when the seed is re-run, so this is drawn once per page load.
export function renderReport() {
  const { agencies, report } = ui.data;
  $('#meta').innerHTML = `Investigación en fuentes públicas · ${esc(report.generated)} · ${agencies.length} agencias · descarga la tabla en <a href="/agencias.csv">agencias.csv</a>`;
  $('#lead').textContent = report.summary;
  $('#top5-list').innerHTML = top5(report.top5);
  $('#reco-text').innerHTML = report.recommendation.map((p) => `<p>${esc(p)}</p>`).join('');
  $('#table').innerHTML = table(agencies);
  $('#regions').innerHTML = regions(agencies);
  $('#discarded').innerHTML = `<ul>${report.discarded.map((d) => `<li><b>${esc(d.name)}</b> — ${esc(d.reason)} ${source(d.url)}</li>`).join('')}</ul>`;
  $('#method').innerHTML = report.method.map((m) => `<li>${esc(m)}</li>`).join('');
}
