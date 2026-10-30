import { MAILBOX } from './config.mjs';

const PLATFORMS = new Set(['x.com', 'twitter.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'licensingdayespana.es']);
const OUR_THREAD = /first-contact\.([a-z0-9-]+)\.\d+@naolito\.com/i;
const AUTOMATIC_SUBJECT = /out of office|automatic reply|auto.?reply|autorespon|fuera de (la )?oficina|respuesta autom[aá]tica|abwesenheit|absence du bureau|fuori ufficio/i;
const QUOTE_START = /^(On .+ wrote:|El .+ escribi[oó]:|Le .+ a [ée]crit ?:|-{2,} ?(Original Message|Mensaje original|Forwarded message).*|(From|De): .+)$/im;

// Who Daniel is, or wanting to talk: both go to Nacho. A false alarm costs him a look; a miss leaves someone unanswered.
const NEEDS_NACHO = new RegExp([
  'who (are|is|am i speaking)', 'are you (a |an )?(real|human|person|bot|ai\\b|robot)', 'your (role|position|title|job)', 'daniel\\?',
  'qui[eé]n (eres|es|sois|habla)', 'eres (una? )?(persona|real|bot|robot|humano)', 'tu (cargo|puesto|rol)', 'su (cargo|puesto|rol)',
  'call', 'meet', 'speak', 'talk', 'chat', 'zoom', 'teams', 'phone', 'schedule', 'availab',
  'llamada', 'llamar', 'llam[oa]', 'reuni', 'hablar', 'hablamos', 'conversar', 'charlar', 'tel[eé]fono', 'whatsapp', 'agendar', 'disponib',
  'appel', 'rendez-vous', 'parler', 'changer', 'chiamata', 'incontro', 'parlare', 'anruf', 'gespr[aä]ch', 'treffen', 'sprechen',
  'reuni[aã]o', 'liga[cç][aã]o', 'falar',
].map((word) => `\\b${word}`).join('|'), 'i');

const hostOf = (value) => {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};
const domainOf = (address) => address.split('@')[1]?.toLowerCase() ?? null;
const emailsIn = (text) => (String(text || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).map((e) => e.toLowerCase());

export function buildIndex(agencies) {
  const entries = agencies.map((a) => {
    const emails = [...emailsIn(a.email), ...emailsIn(a.person)];
    const domains = [...emails.map(domainOf), hostOf(a.web), hostOf(a.form)].filter((d) => d && !PLATFORMS.has(d));
    return { agency: a, emails, domains: [...new Set(domains)] };
  });
  const seen = new Map();
  for (const { domains } of entries) for (const d of domains) seen.set(d, (seen.get(d) || 0) + 1);
  for (const entry of entries) entry.domains = entry.domains.filter((d) => seen.get(d) === 1);
  return entries;
}

export function matchAgency(message, index) {
  const thread = OUR_THREAD.exec(`${message.inReplyTo} ${message.references}`);
  const byThread = thread && index.find((e) => e.agency.id === thread[1].toLowerCase());
  if (byThread) return byThread.agency;
  const from = message.from.toLowerCase();
  const domain = domainOf(from);
  const found = index.find((e) => e.emails.includes(from))
    || index.find((e) => e.domains.some((d) => domain === d || domain?.endsWith(`.${d}`)));
  return found?.agency ?? null;
}

export function ownWords(text) {
  const start = String(text || '').search(QUOTE_START);
  const kept = start === -1 ? String(text || '') : String(text).slice(0, start);
  return kept.split('\n').filter((line) => !line.trimStart().startsWith('>')).join('\n').trim();
}

export const needsNacho = (text) => NEEDS_NACHO.test(ownWords(text));

export const isBounce = (m) => /^(mailer-daemon|postmaster)@/i.test(m.from) || Boolean(m.failedRecipients);

export function isAutomatic(m) {
  if (m.autoSubmitted && m.autoSubmitted.toLowerCase() !== 'no') return true;
  if (/^(auto_reply|bulk|junk|list)$/i.test(m.precedence || '')) return true;
  return AUTOMATIC_SUBJECT.test(m.subject);
}

const describe = (m) => `correo de ${m.from} («${m.subject.slice(0, 120)}»)`;

async function handleBounce(api, m, index, report) {
  const target = emailsIn(m.failedRecipients || m.text).find((address) => address !== MAILBOX);
  const agency = target && index.find((e) => e.emails.includes(target))?.agency;
  if (agency?.state !== 'enviado') {
    report.unmatched.push(describe(m));
    return false;
  }
  await api.reply(agency.id, 'atencion', `El correo a ${target} ha rebotado.`);
  agency.state = 'atencion';
  report.attention.push(agency.id);
  return true;
}

async function handleReply(api, m, agency, report) {
  const urgent = needsNacho(m.text);
  if (urgent && (agency.state === 'enviado' || agency.state === 'respondio')) {
    await api.reply(agency.id, 'atencion', `Respondió y pregunta quién escribe o pide hablar: ${describe(m)}. El agente no contesta.`);
    agency.state = 'atencion';
    report.attention.push(agency.id);
  } else if (agency.state === 'enviado') {
    await api.reply(agency.id, 'respondio', describe(m));
    agency.state = 'respondio';
    report.replied.push(agency.id);
  } else report.known.push(agency.id);
}

// Step 4. Never answers anyone. A message stays unread until it has been dealt with, so nothing is lost
// if a run stops halfway and one that can't be placed keeps showing up in the report.
export async function readReplies({ api, inbox }) {
  const agencies = await api.agencies();
  const index = buildIndex(agencies);
  const report = { replied: [], attention: [], known: [], automatic: 0, unmatched: [], read: [] };
  for (const m of await inbox.unread()) {
    if (m.from.toLowerCase() === MAILBOX) {
      await inbox.markSeen(m.uid);
    } else if (isBounce(m)) {
      if (await handleBounce(api, m, index, report)) await inbox.markSeen(m.uid);
    } else if (isAutomatic(m)) {
      report.automatic += 1;
      await inbox.markSeen(m.uid);
    } else {
      const agency = matchAgency(m, index);
      if (!agency || ['nuevo', 'cola', 'preparando'].includes(agency.state)) report.unmatched.push(describe(m));
      else {
        await handleReply(api, m, agency, report);
        report.read.push({ agency: agency.id, from: m.from, subject: m.subject, text: ownWords(m.text).slice(0, 800) });
        await inbox.markSeen(m.uid);
      }
    }
  }
  return report;
}
