// `npm run agent oauth-login [client.json]`: Nacho runs it once on his PC, signs in as
// dmartin@naolito.com in his own browser, and gets the refresh token in his terminal.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { MAILBOX } from './config.mjs';
import { authUrl, exchangeCode, findClient } from './google-oauth.mjs';

const base64url = (buffer) => buffer.toString('base64url');

function openBrowser(url) {
  const [command, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

// Google sends the browser back to a port of this machine with ?code=…
export async function listenForCode(state) {
  let settle;
  const code = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/') return response.writeHead(404).end();
    const done = (status, text, result) => {
      response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(text);
      server.close();
      result instanceof Error ? settle.reject(result) : settle.resolve(result);
    };
    if (url.searchParams.get('state') !== state) return done(400, 'Respuesta inesperada. Vuelve a ejecutar la orden.', new Error('El state no coincide.'));
    if (url.searchParams.get('error')) return done(400, 'Google no ha dado permiso.', new Error(`Google respondió ${url.searchParams.get('error')}.`));
    done(200, 'Listo. Vuelve a la terminal.', url.searchParams.get('code'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, code };
}

async function mailboxOf(accessToken) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`No se ha podido comprobar la cuenta: ${data.error?.message ?? response.status}`);
  return data.emailAddress;
}

export async function oauthLogin(file) {
  const client = findClient(file);
  const state = base64url(randomBytes(16));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const { port, code } = await listenForCode(state);
  const redirectUri = `http://127.0.0.1:${port}`;
  const url = authUrl({ clientId: client.clientId, redirectUri, state, challenge });

  console.log(`Entra como ${MAILBOX} y pulsa «Permitir». Si el navegador no se abre, copia esta dirección:\n\n${url}\n`);
  openBrowser(url);
  const tokens = await exchangeCode({ ...client, code: await code, redirectUri, verifier });
  const mailbox = await mailboxOf(tokens.access_token);
  if (mailbox !== MAILBOX) throw new Error(`Has entrado como ${mailbox}; tiene que ser ${MAILBOX}. Repite la orden.`);
  if (!tokens.refresh_token) throw new Error('Google no ha devuelto refresh token. Quita el acceso en myaccount.google.com/permissions y repite.');

  console.log(`Cuenta comprobada: ${mailbox}.\n\nAGENT_GMAIL_REFRESH_TOKEN (cópialo tú; no lo pegues en ningún chat):\n\n${tokens.refresh_token}\n`);
}
