import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { gmailAuth } from './mailer.mjs';

const headerText = (headers, name) => {
  const value = headers.get(name);
  return value === undefined ? '' : typeof value === 'string' ? value : value.value ?? String(value);
};

export async function parseMessage(uid, source) {
  const mail = await simpleParser(source);
  return {
    uid,
    from: mail.from?.value?.[0]?.address ?? '',
    subject: mail.subject ?? '',
    text: mail.text ?? '',
    inReplyTo: mail.inReplyTo ?? '',
    references: [mail.references ?? []].flat().join(' '),
    autoSubmitted: headerText(mail.headers, 'auto-submitted'),
    precedence: headerText(mail.headers, 'precedence'),
    failedRecipients: headerText(mail.headers, 'x-failed-recipients'),
  };
}

export async function openInbox() {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: gmailAuth(), logger: false });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  return {
    async unread() {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      const messages = [];
      for (const uid of uids) {
        const { source } = await client.fetchOne(String(uid), { source: true }, { uid: true });
        messages.push(await parseMessage(uid, source));
      }
      return messages;
    },
    markSeen: (uid) => client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }),
    async close() {
      lock.release();
      await client.logout();
    },
  };
}
