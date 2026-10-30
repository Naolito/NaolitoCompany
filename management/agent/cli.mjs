// Daniel Martin's first contact. Run it from any machine: see AGENTE.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveApi } from './api.mjs';
import { MAILBOX, MANAGEMENT, NEVER_CONTACT, loadEnv } from './config.mjs';
import { claimChecked, countWords, problemsWith } from './first-contact.mjs';
import { openInbox } from './inbox.mjs';
import { liveMailer } from './mailer.mjs';
import { oauthLogin } from './oauth-login.mjs';
import { readReplies } from './replies.mjs';
import { sendQueue } from './send-queue.mjs';

const readJson = (path) => JSON.parse(readFileSync(join(MANAGEMENT, path), 'utf8'));
const forms = () => readJson('agent/forms.json');
const print = (value) => console.log(JSON.stringify(value, null, 2));

async function saveTemplates() {
  const api = liveApi();
  const live = await api.templates();
  for (const { lang, subject, body } of readJson('seed/templates.json')) {
    const current = live.find((t) => t.lang === lang);
    // Only the untouched seed: whatever someone wrote or approved in the miniweb is theirs.
    if (current.updated_by || current.status === 'approved') {
      console.log(`${lang}: no se toca, ya la ha editado ${current.updated_by ?? 'alguien'}`);
      continue;
    }
    const saved = await api.saveTemplate(lang, { subject, body, version: current.version });
    console.log(`${lang}: guardada, versión ${saved.version}, estado ${saved.status}`);
  }
}

async function listForms() {
  const queue = (await liveApi().queue()).filter((a) => a.ready && a.state === 'cola' && a.via === 'form');
  const known = forms();
  print(queue.filter((a) => known[a.id] && !known[a.id].blocked && !NEVER_CONTACT.includes(a.id))
    .map((a) => ({ id: a.id, name: a.name, ...known[a.id] })));
}

async function claimForm(id) {
  if (!forms()[id] || forms()[id].blocked) throw new Error(`${id} no tiene un formulario utilizable.`);
  const item = await claimChecked(liveApi(), id);
  if (!item) throw new Error(`No se ha podido coger ${id}: no la envíes.`);
  print({ id, subject: item.subject, body: item.body, recipient: item.recipient });
}

async function markFormSent(id, proof) {
  if (!proof) throw new Error('Falta la prueba del envío.');
  const api = liveApi();
  const item = (await api.queue()).find((a) => a.id === id && a.state === 'preparando');
  if (!item?.ready) throw new Error(`${id} no está en «Preparando» con plantilla aprobada.`);
  print(await api.recordSent(id, { subject: item.subject, body: item.body, via: 'form', recipient: item.recipient, proof }));
}

// Always to our own mailbox, whatever the agency: tests never reach anyone else.
async function testEmail(id) {
  const agencies = readJson('seed/agency-extras.json');
  const agency = agencies[id];
  if (!agency) throw new Error(`No conozco ${id}.`);
  const { fill } = await import('../public/js/template-text.js');
  const template = readJson('seed/templates.json').find((t) => t.lang === agency.lang);
  const subject = fill(template.subject, agency);
  const body = fill(template.body, agency);
  const problems = problemsWith({ subject, body });
  if (problems.length) throw new Error(problems.join('; '));
  const info = await liveMailer().send({ to: MAILBOX, subject: `[PRUEBA] ${subject}`, text: body, messageId: `<test.${id}.${Date.now()}@naolito.com>` });
  print({ to: MAILBOX, words: countWords(body), messageId: info.messageId, response: info.response });
}

async function replies() {
  const inbox = await openInbox();
  try {
    print(await readReplies({ api: liveApi(), inbox }));
  } finally {
    await inbox.close();
  }
}

const COMMANDS = {
  'save-templates': saveTemplates,
  send: async () => print(await sendQueue({ api: liveApi(), mailer: liveMailer(), forms: forms() })),
  forms: listForms,
  claim: claimForm,
  sent: markFormSent,
  stuck: (id, why) => liveApi().recordStuck(id, why).then(print),
  flag: (id, why) => liveApi().reply(id, 'atencion', why).then(print),
  replies,
  'test-email': testEmail,
  'oauth-login': oauthLogin,
};

loadEnv();
const [command, ...args] = process.argv.slice(2);
if (!COMMANDS[command]) {
  console.error(`Órdenes: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(2);
}
COMMANDS[command](...args).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
