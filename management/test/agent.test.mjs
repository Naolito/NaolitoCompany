import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, beforeEach, test } from 'node:test';
import nodemailer from 'nodemailer';
import { ApiError, makeApi } from '../agent/api.mjs';
import { countWords, problemsWith } from '../agent/first-contact.mjs';
import { parseMessage } from '../agent/inbox.mjs';
import { buildMessage } from '../agent/mailer.mjs';
import { buildIndex, matchAgency, needsNacho, ownWords, readReplies } from '../agent/replies.mjs';
import { sendQueue } from '../agent/send-queue.mjs';
import { fill, unknownPlaceholders } from '../public/js/template-text.js';
import { route } from '../lib/router.js';
import { freshDb } from './d1-shim.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const forms = read('../agent/forms.json');
const extras = read('../seed/agency-extras.json');
const templates = read('../seed/templates.json');
const research = read('../../licencias/agentes/agencias.json');

const person = { type: 'person', name: 'nacho@naolito.com' };
const agent = { type: 'agent', name: 'Agente · Daniel Martin' };
let env;
let api;

async function call(who, method, path, body) {
  const init = { method };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { 'content-type': 'application/json' }; }
  const res = await route(new Request(`https://x/api/${path}`, init), env, who);
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error);
  return data;
}
const state = () => call(person, 'GET', 'state');
const stateOf = async (id) => (await state()).agencies.find((a) => a.id === id);
async function approveAndQueue(...ids) {
  for (const t of (await state()).templates) {
    await call(person, 'POST', `templates/${t.lang}/approve`, { subject: t.subject, body: t.body, version: t.version });
  }
  await call(person, 'POST', 'agencies/queue', { ids });
}
function fakeMailer({ fail } = {}) {
  const sent = [];
  return {
    sent,
    verify: async () => {},
    send: async (m) => {
      if (fail) throw new Error(fail);
      sent.push(m);
      return { messageId: m.messageId, response: '250 2.0.0 OK' };
    },
  };
}
function fakeInbox(messages) {
  const seen = [];
  return { seen, unread: async () => messages, markSeen: async (uid) => { seen.push(uid); } };
}
const mail = (fields) => ({ uid: 1, from: '', subject: 'Re: Naolito', text: 'Thanks for writing, we will take a look.', inReplyTo: '', references: '', autoSubmitted: '', precedence: '', failedRecipients: '', ...fields });
async function contacted(id) {
  await approveAndQueue(id);
  await sendQueue({ api, mailer: fakeMailer(), forms });
  assert.equal((await stateOf(id)).state, 'enviado');
}

before(() => execFileSync('node', ['scripts/build-seed.mjs']));
beforeEach(() => {
  env = { DB: freshDb() };
  api = makeApi((method, path, body) => call(agent, method, `agent/${path}`, body));
});

test('both templates, filled for all 20 agencies, stay under 120 words and say what they must', () => {
  for (const t of templates) {
    assert.deepEqual(unknownPlaceholders(`${t.subject} ${t.body}`), []);
    assert.deepEqual([...t.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort(), ['referencia', 'saludo']);
    for (const word of ['Homework', 'Disney+', 'Netflix', 'Amazon', 'PlayStation', 'Nestlé', '50', 'Nacho Arjona', 'The Cute Side of Life', 'Daniel Martin', 'dmartin@naolito.com']) {
      assert.ok(t.body.includes(word), `${t.lang}: ${word}`);
    }
    assert.ok(t.body.endsWith('Daniel Martin\nNaolito\ndmartin@naolito.com'));
    assert.ok(t.body.split('?').length === 2, 'a single question');
  }
  for (const [id, agency] of Object.entries(extras)) {
    const t = templates.find((x) => x.lang === agency.lang);
    const filled = { subject: fill(t.subject, agency), body: fill(t.body, agency) };
    assert.deepEqual(problemsWith(filled), [], id);
    assert.ok(countWords(filled.body) < 120, id);
  }
});

test('the Spanish template works in Spain and in Latin America', () => {
  assert.doesNotMatch(templates.find((t) => t.lang === 'es').body, /vosotr|vuestr|cre[eé]is|hacéis/i);
});

test('language: Spanish for es-latam except byFrog, English for the rest', () => {
  for (const a of research.agencies) {
    assert.equal(extras[a.id].lang, a.region === 'es-latam' && a.id !== 'byfrog' ? 'es' : 'en', a.id);
  }
});

test('every personal line comes from the agency research', () => {
  for (const a of research.agencies) {
    const blob = JSON.stringify(a).toLowerCase();
    for (const brand of extras[a.id].reference.split(/ and | y /)) assert.ok(blob.includes(brand.toLowerCase()), `${a.id}: ${brand}`);
  }
});

test('the last check stops leftovers, long texts and forbidden topics', () => {
  assert.ok(problemsWith({ subject: 'x', body: 'Hi {{saludo}}' }).length);
  assert.ok(problemsWith({ subject: 'x', body: 'word '.repeat(120) }).length);
  for (const body of ['Villains Need Love', 'our commission', 'en exclusiva', 'royalties']) assert.ok(problemsWith({ subject: 'x', body }).length, body);
});

test('forms.json covers exactly the agencies whose vía is a form', async () => {
  const byForm = (await state()).agencies.filter((a) => a.via === 'form');
  assert.deepEqual(Object.keys(forms).sort(), byForm.map((a) => a.id).sort());
  for (const a of byForm) assert.equal(forms[a.id].url, a.form);
});

test('nothing leaves while the template is a draft', async () => {
  await approveAndQueue('maximum-licensing');
  const t = (await state()).templates.find((x) => x.lang === 'en');
  await call(person, 'PUT', 'templates/en', { subject: t.subject, body: `${t.body} P.S.`, version: t.version });
  const mailer = fakeMailer();
  const report = await sendQueue({ api, mailer, forms });
  assert.deepEqual(report.waiting, ['maximum-licensing']);
  assert.equal(mailer.sent.length, 0);
  assert.equal((await stateOf('maximum-licensing')).state, 'cola');
});

test('an email goes to its agency with the filled text, and the miniweb keeps text and proof', async () => {
  await approveAndQueue('maximum-licensing', 'caravanserai');
  const mailer = fakeMailer();
  const report = await sendQueue({ api, mailer, forms });
  assert.deepEqual(report.sent.sort(), ['caravanserai', 'maximum-licensing']);
  const [first] = mailer.sent.filter((m) => m.to === 'sarah@maximumlicensing.com');
  assert.match(first.text, /^Hi Sarah,/);
  assert.match(first.text, /your work with Vexx/);
  const s = await state();
  const send = s.sends.find((x) => x.agency_id === 'maximum-licensing');
  assert.equal(send.body, first.text);
  assert.equal(send.subject, first.subject);
  assert.equal(send.recipient, 'sarah@maximumlicensing.com');
  assert.match(send.proof, /first-contact\.maximum-licensing/);
  assert.equal(send.actor, 'Agente · Daniel Martin');
  assert.match(mailer.sent.find((m) => m.to === 'cp@caravanserai.eu').text, /^Hola, Guillem:/);
});

test('a real message carries the dossier, from dmartin, in plain text', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const { message } = await transport.sendMail(buildMessage({ to: 'dmartin@naolito.com', subject: 'Hola', text: 'Texto', messageId: '<a@naolito.com>' }));
  const parsed = await (await import('mailparser')).simpleParser(message);
  assert.equal(parsed.from.value[0].address, 'dmartin@naolito.com');
  assert.equal(parsed.from.value[0].name, 'Daniel Martin');
  assert.equal(parsed.attachments[0].filename, 'naolito-licensing-dossier-en.pdf');
  assert.equal(parsed.attachments[0].contentType, 'application/pdf');
  assert.ok(parsed.attachments[0].size > 1000000);
});

test('forms stay queued for the browser, unless the site cannot take one', async () => {
  await approveAndQueue('nuevo-mundo', 'dimensional-branding', 'rb-licensing', 'surge-licensing', 'haven-global', 'home-made-licensing');
  const mailer = fakeMailer();
  const report = await sendQueue({ api, mailer, forms });
  assert.deepEqual(report.forms.sort(), ['dimensional-branding', 'nuevo-mundo', 'rb-licensing']);
  assert.equal(mailer.sent.length, 0);
  assert.equal((await stateOf('nuevo-mundo')).state, 'cola');
  for (const [id, why] of [['surge-licensing', /no tiene formulario/], ['haven-global', /no tiene formulario/], ['home-made-licensing', /captcha/]]) {
    const a = await stateOf(id);
    assert.equal(a.state, 'atencion');
    assert.match(a.why, why);
  }
});

test('no confirmed vía goes to Nacho, and Maximum Orbit is never touched', async () => {
  await approveAndQueue('brand-new-day', 'maximum-orbit');
  assert.equal((await stateOf('maximum-orbit')).state, 'nuevo');
  env.DB.exec(`UPDATE agencies SET state = 'cola' WHERE id = 'maximum-orbit'`);
  const mailer = fakeMailer();
  const report = await sendQueue({ api, mailer, forms });
  assert.deepEqual(report.skipped, ['maximum-orbit']);
  assert.equal((await stateOf('maximum-orbit')).state, 'cola');
  assert.equal((await stateOf('brand-new-day')).state, 'atencion');
  assert.equal(mailer.sent.length, 0);
});

test('an SMTP failure reaches Nacho; a run cut halfway is never sent twice', async () => {
  await approveAndQueue('starbright', 'fluid-world');
  await sendQueue({ api, mailer: fakeMailer({ fail: 'Connection lost' }), forms });
  assert.match((await stateOf('starbright')).why, /Connection lost/);
  env.DB.exec(`UPDATE agencies SET state = 'preparando' WHERE id = 'jewel-branding'`);
  const mailer = fakeMailer();
  await sendQueue({ api, mailer, forms });
  assert.equal(mailer.sent.length, 0);
  assert.equal((await stateOf('jewel-branding')).state, 'atencion');
});

test('a plain reply marks «Respondió», never answers, and is left read', async () => {
  await contacted('maximum-licensing');
  const inbox = fakeInbox([mail({ from: 'sarah@maximumlicensing.com' })]);
  const report = await readReplies({ api, inbox });
  assert.deepEqual(report.replied, ['maximum-licensing']);
  assert.deepEqual(inbox.seen, [1]);
  assert.equal((await stateOf('maximum-licensing')).state, 'respondio');
});

test('asking who writes or to talk goes to Nacho, even after a first reply', async () => {
  await contacted('maximum-licensing');
  await contacted('fluid-world');
  await readReplies({ api, inbox: fakeInbox([mail({ from: 'admin@fluidworld.co.uk' })]) });
  const report = await readReplies({ api, inbox: fakeInbox([
    mail({ uid: 2, from: 'sarah@maximumlicensing.com', text: 'Sounds great. Can we schedule a call next week?' }),
    mail({ uid: 3, from: 'hanna@fluidworld.co.uk', text: 'Who is Daniel exactly?' }),
  ]) });
  assert.deepEqual(report.attention.sort(), ['fluid-world', 'maximum-licensing']);
  const a = await stateOf('maximum-licensing');
  assert.equal(a.state, 'atencion');
  assert.match(a.why, /sarah@maximumlicensing.com/);
});

test('later stages are never pushed back and contacted agencies cannot be sent again', async () => {
  await contacted('maximum-licensing');
  await api.reply('maximum-licensing', 'reunion', 'Reunión fijada');
  const report = await readReplies({ api, inbox: fakeInbox([mail({ from: 'sarah@maximumlicensing.com', text: 'See you then, thanks!' })]) });
  assert.deepEqual(report.known, ['maximum-licensing']);
  assert.equal((await stateOf('maximum-licensing')).state, 'reunion');

  await contacted('fluid-world');
  await api.reply('fluid-world', 'atencion', 'Pide hablar');
  await assert.rejects(call(person, 'POST', 'agencies/fluid-world/requeue', {}), { status: 409 });
  await assert.rejects(api.reply('caravanserai', 'atencion', 'x'), { status: 409 });
});

test('auto-replies are ignored, strangers stay unread, bounces reach Nacho', async () => {
  await contacted('maximum-licensing');
  await contacted('starbright');
  const inbox = fakeInbox([
    mail({ uid: 1, from: 'sarah@maximumlicensing.com', subject: 'Out of office', autoSubmitted: 'auto-replied' }),
    mail({ uid: 2, from: 'someone@gmail.com' }),
    mail({ uid: 3, from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification', failedRecipients: 'info@starbrightlicensing.it' }),
    mail({ uid: 4, from: 'dmartin@naolito.com', subject: '[PRUEBA] x' }),
  ]);
  const report = await readReplies({ api, inbox });
  assert.equal((await stateOf('maximum-licensing')).state, 'enviado');
  assert.equal((await stateOf('starbright')).state, 'atencion');
  assert.deepEqual(inbox.seen.sort(), [1, 3, 4]);
  assert.equal(report.unmatched.length, 1);
});

test('replies match by thread, address or own domain, never by a shared platform', async () => {
  const { agencies } = await state();
  const index = buildIndex(agencies);
  const id = (m) => matchAgency(mail(m), index)?.id;
  assert.equal(id({ from: 'x@gmail.com', inReplyTo: '<first-contact.home-made-licensing.123@naolito.com>' }), 'home-made-licensing');
  assert.equal(id({ from: 'charlie@rocketlicensing.com' }), 'rocket-licensing');
  assert.equal(id({ from: 'guillem@caravanserai.eu' }), 'caravanserai');
  assert.equal(id({ from: 'ana@nmlicencias.com' }), 'nuevo-mundo');
  assert.equal(id({ from: 'promo@x.com' }), undefined);
  assert.equal(id({ from: 'info@licensingdayespana.es' }), undefined);
});

test('only the words of the reply count, not the quoted message', () => {
  const quoted = 'Thanks, not for us.\n\nOn Mon, 2 Nov 2026 at 10:00, Daniel Martin <dmartin@naolito.com> wrote:\n> Could we talk? call meeting';
  assert.equal(ownWords(quoted), 'Thanks, not for us.');
  assert.equal(needsNacho(quoted), false);
  assert.equal(needsNacho('¿Quién eres exactamente?'), true);
  assert.equal(needsNacho('¿Podemos hablar el lunes?'), true);
  assert.equal(needsNacho('Gracias, lo vemos y os decimos.'), false);
});

test('a raw reply from the mailbox keeps the headers the matching needs', async () => {
  const raw = ['From: Sarah <sarah@maximumlicensing.com>', 'To: dmartin@naolito.com', 'Subject: Re: hi', 'In-Reply-To: <first-contact.maximum-licensing.1@naolito.com>',
    'References: <first-contact.maximum-licensing.1@naolito.com>', 'Auto-Submitted: auto-replied', 'Content-Type: text/plain; charset=utf-8', '', 'Hola'].join('\r\n');
  const m = await parseMessage(9, Buffer.from(raw));
  assert.equal(m.from, 'sarah@maximumlicensing.com');
  assert.match(m.inReplyTo, /first-contact\.maximum-licensing/);
  assert.match(m.references, /first-contact/);
  assert.equal(m.autoSubmitted, 'auto-replied');
  assert.equal(m.text.trim(), 'Hola');
});
