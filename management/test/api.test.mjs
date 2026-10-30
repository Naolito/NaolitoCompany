import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, beforeEach, test } from 'node:test';
import { route } from '../lib/router.js';
import { freshDb } from './d1-shim.mjs';

const person = { type: 'person', name: 'ana@naolito.com' };
const agent = { type: 'agent', name: 'Agente · Daniel' };
let env;

async function call(who, method, path, body) {
  const init = { method };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { 'content-type': 'application/json' }; }
  const res = await route(new Request(`https://x/api/${path}`, init), env, who);
  return { status: res.status, body: await res.json() };
}
const state = async () => (await call(person, 'GET', 'state')).body;
const agency = async (id) => (await state()).agencies.find((a) => a.id === id);
const approve = async (lang) => {
  const t = (await state()).templates.find((x) => x.lang === lang);
  return call(person, 'POST', `templates/${lang}/approve`, { subject: t.subject, body: t.body, version: t.version });
};
const sent = { status: 'enviado', subject: 'Hola', body: 'Texto enviado', proof: 'https://example.com/captura.png' };

before(() => execFileSync('node', ['scripts/build-seed.mjs']));
beforeEach(() => { env = { DB: freshDb() }; });

test('the import has the 20 real agencies, untouched, and nothing approved', async () => {
  const s = await state();
  assert.equal(s.agencies.length, 20);
  assert.ok(s.agencies.every((a) => a.state === 'nuevo'));
  assert.equal(s.events.length, 0);
  assert.equal(s.sends.length, 0);
  assert.ok(s.templates.every((t) => t.status === 'draft'));
  assert.equal(s.agencies[0].id, 'we-love-licensing');
  assert.equal(s.report.top5.length, 5);
});

test('each agency has the vía the brief gives it', async () => {
  const { agencies } = await state();
  const by = (via) => agencies.filter((a) => a.via === via).map((a) => a.id).sort();
  assert.deepEqual(by('form'), ['dimensional-branding', 'haven-global', 'home-made-licensing', 'nuevo-mundo', 'rb-licensing', 'surge-licensing']);
  assert.deepEqual(by('pending'), ['brand-new-day', 'kaufman-licensing', 'start-licensing']);
  assert.deepEqual(by('third'), ['maximum-orbit']);
  assert.ok(agencies.filter((a) => a.via === 'email').every((a) => a.email));
  assert.equal(by('email').length, 10);
});

test('an agency can only be queued once its language template is approved', async () => {
  let r = await call(person, 'POST', 'agencies/queue', { ids: ['maximum-licensing', 'we-love-licensing'] });
  assert.deepEqual(r.body, { queued: [], skipped: ['maximum-licensing', 'we-love-licensing'] });
  await approve('en');
  r = await call(person, 'POST', 'agencies/queue', { ids: ['maximum-licensing', 'we-love-licensing', 'maximum-orbit'] });
  assert.deepEqual(r.body.queued, ['maximum-licensing']);
  assert.deepEqual(r.body.skipped, ['we-love-licensing', 'maximum-orbit']);
  assert.equal((await agency('maximum-licensing')).state, 'cola');
  const s = await state();
  assert.equal(s.events.at(-1).actor, 'ana@naolito.com');
});

test('editing an approved template needs approval again and holds the queue', async () => {
  await approve('en');
  await call(person, 'POST', 'agencies/queue', { ids: ['maximum-licensing'] });
  let { queue } = (await call(agent, 'GET', 'agent/queue')).body;
  assert.equal(queue[0].ready, true);
  assert.match(queue[0].body, /^Hi Sarah,/);
  assert.match(queue[0].body, /Vexx/);
  assert.doesNotMatch(queue[0].body, /\{\{/);

  const t = (await state()).templates.find((x) => x.lang === 'en');
  const put = await call(agent, 'PUT', 'agent/templates/en', { subject: t.subject, body: `${t.body}\nP.S.` });
  assert.equal(put.body.status, 'draft');
  assert.equal(put.body.updated_by, 'Agente · Daniel');
  ({ queue } = (await call(agent, 'GET', 'agent/queue')).body);
  assert.equal(queue[0].ready, false);
  assert.equal(queue[0].body, undefined);
  assert.equal((await call(agent, 'POST', 'agent/agencies/maximum-licensing/claim', {})).status, 409);
});

test('saving identical text keeps the approval; a stale version and unknown placeholders are refused', async () => {
  await approve('es');
  const t = (await state()).templates.find((x) => x.lang === 'es');
  assert.equal((await call(person, 'PUT', 'templates/es', { subject: t.subject, body: t.body, version: t.version })).body.status, 'approved');
  assert.equal((await call(person, 'PUT', 'templates/es', { subject: 'x', body: 'y', version: t.version - 1 })).status, 409);
  assert.equal((await call(person, 'PUT', 'templates/es', { subject: 'x', body: 'Hola {{nombre}}' })).status, 400);
});

test('agents save drafts but cannot approve or use the team API, and people cannot use the agent API', async () => {
  assert.equal((await call(agent, 'POST', 'agent/templates/en/approve', {})).status, 404);
  assert.equal((await call(agent, 'POST', 'templates/en/approve', {})).status, 403);
  assert.equal((await call(agent, 'GET', 'state')).status, 403);
  assert.equal((await call(person, 'GET', 'agent/queue')).status, 403);
});

test('the full run: claim, send with text and proof, reply; no double claims or double sends', async () => {
  await approve('en');
  await call(person, 'POST', 'agencies/queue', { ids: ['home-made-licensing'] });
  const id = 'home-made-licensing';
  assert.equal((await call(agent, 'POST', `agent/agencies/${id}/sends`, sent)).status, 409);
  const claim = await call(agent, 'POST', `agent/agencies/${id}/claim`, {});
  assert.equal(claim.status, 200);
  assert.equal(claim.body.recipient, 'https://homemadelicensing.com/contact.php');
  assert.equal((await call(agent, 'POST', `agent/agencies/${id}/claim`, {})).status, 409);
  assert.equal((await call(agent, 'POST', `agent/agencies/${id}/sends`, { ...sent, proof: '' })).status, 400);
  const send = await call(agent, 'POST', `agent/agencies/${id}/sends`, sent);
  assert.equal(send.status, 201);
  assert.equal((await call(agent, 'POST', `agent/agencies/${id}/sends`, sent)).status, 409);
  const s = await state();
  assert.equal(s.sends.length, 1);
  assert.equal(s.sends[0].body, 'Texto enviado');
  assert.equal(s.sends[0].proof, sent.proof);
  assert.equal(s.sends[0].actor, 'Agente · Daniel');
  assert.equal((await agency(id)).state, 'enviado');
  assert.equal((await call(agent, 'POST', `agent/agencies/${id}/reply`, { state: 'nuevo' })).status, 400);
  assert.equal((await call(agent, 'POST', `agent/agencies/${id}/reply`, { state: 'respondio', note: 'Aline quiere hablar' })).status, 200);
  const after = await state();
  assert.equal(after.agencies.find((a) => a.id === id).state, 'respondio');
  assert.match(after.events.at(-1).text, /Aline quiere hablar/);
});

test('a reply cannot be marked before contacting, and a stuck agency reaches a person', async () => {
  assert.equal((await call(agent, 'POST', 'agent/agencies/fluid-world/reply', { state: 'respondio' })).status, 409);
  await approve('es');
  await call(person, 'POST', 'agencies/queue', { ids: ['brand-new-day'] });
  await call(agent, 'POST', 'agent/agencies/brand-new-day/claim', {});
  assert.equal((await call(agent, 'POST', 'agent/agencies/brand-new-day/sends', { status: 'atencion' })).status, 400);
  await call(agent, 'POST', 'agent/agencies/brand-new-day/sends', { status: 'atencion', why: 'No hay email público' });
  const a = await agency('brand-new-day');
  assert.equal(a.state, 'atencion');
  assert.equal(a.why, 'No hay email público');
  assert.equal((await call(person, 'POST', 'agencies/brand-new-day/manual', {})).status, 200);
  assert.equal((await agency('brand-new-day')).state, 'enviado');
});

test('screenshots round-trip and only safe image types are accepted', async () => {
  await approve('en');
  await call(person, 'POST', 'agencies/queue', { ids: ['starbright'] });
  await call(agent, 'POST', 'agent/agencies/starbright/claim', {});
  const svg = await call(agent, 'POST', 'agent/agencies/starbright/sends', { ...sent, proof: 'data:image/svg+xml;base64,PHN2Zz4=' });
  assert.equal(svg.status, 400);
  await call(agent, 'POST', 'agent/agencies/starbright/sends', { ...sent, proof: 'data:image/png;base64,iVBORw0KGgo=' });
  const s = await state();
  assert.equal(s.sends[0].proof, null);
  assert.equal(s.sends[0].proof_image, 1);
  const res = await route(new Request(`https://x/api/sends/${s.sends[0].id}/proof`), env, person);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal((await res.arrayBuffer()).byteLength, 8);
});

test('notes save, and team writes must be JSON', async () => {
  await call(person, 'PUT', 'agencies/caravanserai/notes', { notes: 'Llamar el lunes' });
  await call(person, 'PUT', 'agencies/caravanserai/notes', { notes: 'Llamar el martes' });
  const s = await state();
  assert.equal(s.agencies.find((a) => a.id === 'caravanserai').notes, 'Llamar el martes');
  assert.equal(s.events.filter((e) => e.kind === 'notes').length, 1);
  const res = await route(new Request('https://x/api/agencies/queue', { method: 'POST', body: 'ids=x' }), env, person);
  assert.equal(res.status, 415);
});

test('re-running the seed keeps states, vías and notes', async () => {
  await call(person, 'PUT', 'agencies/caravanserai/notes', { notes: 'Importante' });
  await call(person, 'POST', 'agencies/rb-licensing/via', { via: 'email' });
  env.DB.exec(readFileSync(new URL('../seed/seed.sql', import.meta.url), 'utf8'));
  assert.equal((await agency('caravanserai')).notes, 'Importante');
  assert.equal((await agency('rb-licensing')).via, 'email');
});
