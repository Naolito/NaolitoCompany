import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { SCOPE, authUrl, clientFromJson, findClient, forgetToken, gmailAuth } from '../agent/google-oauth.mjs';
import { listenForCode } from '../agent/oauth-login.mjs';

const consoleJson = JSON.stringify({ installed: { client_id: 'id.apps.googleusercontent.com', client_secret: 'GOCSPX-x', redirect_uris: ['http://localhost'] } });
const env = { AGENT_EMAIL: 'dmartin@naolito.com', GOOGLE_OAUTH_CLIENT_ID: 'env-id', GOOGLE_OAUTH_CLIENT_SECRET: 'env-secret', AGENT_GMAIL_REFRESH_TOKEN: 'refresh' };

beforeEach(() => {
  forgetToken();
  Object.assign(process.env, env);
});

test('the client comes from the JSON given, then Environment, then a client_secret file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oauth-'));
  const file = join(dir, 'client_secret_123.json');
  writeFileSync(file, consoleJson);
  assert.deepEqual(clientFromJson(consoleJson), { clientId: 'id.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' });
  assert.equal(findClient(file, env, dir).clientId, 'id.apps.googleusercontent.com');
  assert.equal(findClient(undefined, env, dir).clientId, 'env-id');
  assert.equal(findClient(undefined, {}, dir).clientId, 'id.apps.googleusercontent.com');
  assert.throws(() => findClient(undefined, {}, mkdtempSync(join(tmpdir(), 'oauth-'))), /Falta el cliente OAuth/);
});

test('the consent page asks for full Gmail, offline, for dmartin, with PKCE', () => {
  const url = new URL(authUrl({ clientId: 'id', redirectUri: 'http://127.0.0.1:5000', state: 's', challenge: 'c' }));
  assert.equal(url.searchParams.get('scope'), SCOPE);
  assert.equal(SCOPE, 'https://mail.google.com/');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('login_hint'), 'dmartin@naolito.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('SMTP and IMAP get one access token from the refresh token, reused while it lasts', async () => {
  const calls = [];
  const fakeFetch = async (url, { body }) => {
    calls.push(Object.fromEntries(body));
    return { ok: true, json: async () => ({ access_token: `access-${calls.length}`, expires_in: 3599 }) };
  };
  assert.deepEqual(await gmailAuth(fakeFetch), { user: 'dmartin@naolito.com', accessToken: 'access-1' });
  assert.equal((await gmailAuth(fakeFetch)).accessToken, 'access-1');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { client_id: 'env-id', client_secret: 'env-secret', refresh_token: 'refresh', grant_type: 'refresh_token' });
});

test('no app password any more, and a revoked token says how to fix it', async () => {
  delete process.env.AGENT_GMAIL_REFRESH_TOKEN;
  await assert.rejects(gmailAuth(), /AGENT_GMAIL_REFRESH_TOKEN/);
  process.env.AGENT_GMAIL_REFRESH_TOKEN = 'refresh';
  process.env.AGENT_EMAIL = 'someone@naolito.com';
  await assert.rejects(gmailAuth(), /debería ser dmartin@naolito.com/);
  process.env.AGENT_EMAIL = 'dmartin@naolito.com';
  const revoked = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) });
  await assert.rejects(gmailAuth(revoked), /revoked.*oauth-login/);
});

test('oauth-login takes the code Google sends back, and only with its state', async () => {
  const good = await listenForCode('state-1');
  const page = await fetch(`http://127.0.0.1:${good.port}/?state=state-1&code=the-code`);
  assert.equal(page.status, 200);
  assert.equal(await good.code, 'the-code');

  const bad = await listenForCode('state-2');
  const rejected = assert.rejects(bad.code, /state/);
  assert.equal((await fetch(`http://127.0.0.1:${bad.port}/?state=other&code=x`)).status, 400);
  await rejected;
});
