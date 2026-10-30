import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { identify } from '../lib/access.js';

const team = 'naolito.cloudflareaccess.com';
const env = { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: 'the-aud' };
const b64 = (data) => Buffer.from(data).toString('base64url');
let keys;

before(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
  globalThis.fetch = async (url) => {
    assert.equal(url, `https://${team}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }));
  };
});

async function token(claims, { key = keys.privateKey, alg = 'RS256' } = {}) {
  const head = b64(JSON.stringify({ alg, kid: 'k1' }));
  const body = b64(JSON.stringify({ iss: `https://${team}`, aud: ['the-aud'], exp: Date.now() / 1000 + 60, ...claims }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64(new Uint8Array(signature))}`;
}
const ask = (jwt, extra = {}) => identify(new Request('https://x/', { headers: { ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}), ...extra } }), env);

test('a @naolito.com person is identified by their email', async () => {
  assert.deepEqual(await ask(await token({ email: 'Ana@Naolito.com' })), { type: 'person', name: 'ana@naolito.com' });
});

test('a service token is an agent, named by its header', async () => {
  assert.deepEqual(await ask(await token({ common_name: 'abc.access' }), { 'x-agent-name': 'Daniel <b>' }), { type: 'agent', name: 'Agente · Daniel b' });
  assert.deepEqual(await ask(await token({ common_name: 'abc.access' })), { type: 'agent', name: 'Agente' });
});

test('everything else is refused', async () => {
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const good = await token({ email: 'a@naolito.com' });
  assert.equal(await ask(null), null);
  assert.equal(await ask('not-a-jwt'), null);
  assert.equal(await ask(`${good.split('.').slice(0, 2).join('.')}.AAAA`), null);
  assert.equal(await ask(await token({ email: 'a@naolito.com' }, { key: other.privateKey })), null);
  assert.equal(await ask(await token({ email: 'a@gmail.com' })), null);
  assert.equal(await ask(await token({ email: 'a@naolito.com.evil.org' })), null);
  assert.equal(await ask(await token({ email: 'a@naolito.com', aud: ['other'] })), null);
  assert.equal(await ask(await token({ email: 'a@naolito.com', iss: 'https://evil.cloudflareaccess.com' })), null);
  assert.equal(await ask(await token({ email: 'a@naolito.com', exp: 1 })), null);
  assert.equal(await identify(new Request('https://x/', { headers: { 'cf-access-jwt-assertion': good } }), {}), null);
});
