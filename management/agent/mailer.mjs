import nodemailer from 'nodemailer';
import { AGENT_NAME, DOSSIER, MAILBOX, requireEnv } from './config.mjs';

export const messageIdFor = (agencyId) => `<first-contact.${agencyId}.${Date.now()}@naolito.com>`;

export function buildMessage({ to, subject, text, messageId, attachDossier = true }) {
  return {
    from: { name: AGENT_NAME, address: MAILBOX },
    to,
    subject,
    text,
    messageId,
    attachments: attachDossier ? [{ filename: 'naolito-licensing-dossier-en.pdf', path: DOSSIER, contentType: 'application/pdf' }] : [],
  };
}

export function gmailAuth() {
  const [user, pass] = requireEnv('AGENT_EMAIL', 'AGENT_EMAIL_APP_PASSWORD');
  if (user !== MAILBOX) throw new Error(`AGENT_EMAIL debería ser ${MAILBOX}.`);
  return { user, pass };
}

export function liveMailer() {
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: gmailAuth() });
  return { verify: () => transport.verify(), send: (message) => transport.sendMail(buildMessage(message)) };
}
