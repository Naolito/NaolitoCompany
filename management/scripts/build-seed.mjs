// Writes seed/seed.sql and public/agencias.csv from licencias/agentes.
// Safe to run again: it refreshes the research and never touches states, vías, notes or history.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, '..', 'licencias', 'agentes');
const data = JSON.parse(readFileSync(join(source, 'agencias.json'), 'utf8'));
const extras = JSON.parse(readFileSync(join(root, 'seed', 'agency-extras.json'), 'utf8'));
const templates = JSON.parse(readFileSync(join(root, 'seed', 'templates.json'), 'utf8'));

const sql = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const ranks = Object.fromEntries(data.top5.map((t) => [t.id, t.rank]));
const ordered = data.agencies
  .map((a, index) => ({ a, index, rank: ranks[a.id] ?? 99 }))
  .sort((p, q) => p.rank - q.rank || q.a.score - p.a.score || p.index - q.index);

const REFRESHED = ['name', 'region', 'country', 'score', 'top_rank', 'sort', 'web', 'email', 'form', 'person',
  'greeting', 'reference', 'lang', 'vias', 'research'];

const agencyRows = ordered.map(({ a }, sort) => {
  const extra = extras[a.id];
  if (!extra) throw new Error(`seed/agency-extras.json no tiene ${a.id}`);
  const row = {
    id: a.id, name: a.name, region: a.region, country: a.country, score: a.score, top_rank: ranks[a.id] ?? null, sort,
    web: a.web, email: a.contact?.email ?? null, form: a.contact?.form ?? null, person: a.contact?.person ?? null,
    greeting: extra.greeting, reference: extra.reference, lang: extra.lang, vias: JSON.stringify(extra.vias),
    research: JSON.stringify(a), via: extra.via,
  };
  const columns = Object.keys(row);
  const updates = REFRESHED.map((c) => `${c} = excluded.${c}`).join(', ');
  return `INSERT INTO agencies (${columns.join(', ')}) VALUES (${columns.map((c) => sql(row[c])).join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates};`;
});

const templateRows = templates.map((t) => `INSERT OR IGNORE INTO templates (lang, subject, body) VALUES (${sql(t.lang)}, ${sql(t.subject)}, ${sql(t.body)});`);

const { generated, summary, top5, recommendation, discarded, method } = data;
const report = JSON.stringify({ generated, summary, top5, recommendation, discarded, method });
const reportRow = `INSERT INTO report (id, data) VALUES (1, ${sql(report)}) ON CONFLICT (id) DO UPDATE SET data = excluded.data;`;

writeFileSync(join(root, 'seed', 'seed.sql'), [...agencyRows, ...templateRows, reportRow].join('\n') + '\n');
copyFileSync(join(source, 'agencias.csv'), join(root, 'public', 'agencias.csv'));
console.log(`seed.sql: ${agencyRows.length} agencias, ${templateRows.length} plantillas`);
