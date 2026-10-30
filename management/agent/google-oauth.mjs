// Gmail by OAuth: this Workspace account has no app passwords. See oauth-login.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAILBOX, MANAGEMENT, requireEnv } from './config.mjs';

export const SCOPE = 'https://mail.google.com/';
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// A client JSON downloaded from the console: { installed: { client_id, client_secret } }.
export function clientFromJson(text) {
  const data = JSON.parse(text);
  const client = data.installed ?? data.web ?? data;
  if (!client.client_id || !client.client_secret) throw new Error('El JSON no trae client_id y client_secret.');
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

// From the file given, from Environment, or from a client_secret*.json left in management/.
export function findClient(file, env = process.env, dir = MANAGEMENT) {
  if (file) return clientFromJson(readFileSync(file, 'utf8'));
  if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET };
  }
  const local = existsSync(dir) && readdirSync(dir).find((name) => /^client_secret.*\.json$/.test(name));
  if (local) return clientFromJson(readFileSync(join(dir, local), 'utf8'));
  throw new Error('Falta el cliente OAuth: GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET, o la ruta del JSON de la consola.');
}

export function authUrl({ clientId, redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: MAILBOX,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(fields, fetchImpl) {
  const response = await fetchImpl(TOKEN_URL, { method: 'POST', body: new URLSearchParams(fields) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google rechazó el token: ${data.error_description ?? data.error ?? response.status}`);
  return data;
}

export const exchangeCode = ({ clientId, clientSecret, code, redirectUri, verifier }, fetchImpl = fetch) =>
  tokenRequest({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, code_verifier: verifier, grant_type: 'authorization_code' }, fetchImpl);

// One access token per run serves both SMTP and IMAP; it lasts an hour.
let cached;
export async function gmailAuth(fetchImpl = fetch) {
  const [user, clientId, clientSecret, refreshToken] = requireEnv('AGENT_EMAIL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'AGENT_GMAIL_REFRESH_TOKEN');
  if (user !== MAILBOX) throw new Error(`AGENT_EMAIL debería ser ${MAILBOX}.`);
  if (!cached || cached.expires < Date.now() + 60_000) {
    const data = await tokenRequest({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }, fetchImpl)
      .catch((error) => { throw new Error(`${error.message}. Si el refresh token ya no vale, repite «npm run agent oauth-login».`); });
    cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  }
  return { user, accessToken: cached.token };
}

export const forgetToken = () => { cached = undefined; };
