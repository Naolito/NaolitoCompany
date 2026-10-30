import nodemailer from 'nodemailer';
import { AGENT_NAME, DOSSIER, MAILBOX } from './config.mjs';
import { gmailAuth } from './google-oauth.mjs';

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

// XOAUTH2 with an access token from the refresh token: see google-oauth.mjs.
async function transport() {
  const { user, accessToken } = await gmailAuth();
  return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user, accessToken } });
}

export function liveMailer() {
  return {
    verify: async () => (await transport()).verify(),
    send: async (message) => (await transport()).sendMail(buildMessage(message)),
  };
}
