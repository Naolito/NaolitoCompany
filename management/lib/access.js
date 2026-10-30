// Cloudflare Access sits in front of the site, but the *.pages.dev addresses skip it:
// every request must carry a JWT that verifies here, or it gets a 403.
const ALLOWED_DOMAIN = '@naolito.com';
const KEYS_TTL_MS = 60 * 60 * 1000;
let keys = { team: null, at: 0, byKid: new Map() };

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const decodePart = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function loadKeys(team) {
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const { keys: jwks } = await res.json();
  const byKid = new Map();
  for (const jwk of jwks) {
    byKid.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  keys = { team, at: Date.now(), byKid };
}

async function keyFor(team, kid) {
  const stale = keys.team !== team || Date.now() - keys.at > KEYS_TTL_MS;
  if (stale || !keys.byKid.has(kid)) await loadKeys(team);
  return keys.byKid.get(kid);
}

async function verify(token, team, aud) {
  const [head, payload, signature, ...rest] = token.split('.');
  if (!head || !payload || !signature || rest.length) return null;
  const header = decodePart(head);
  if (header.alg !== 'RS256') return null;
  const key = await keyFor(team, header.kid);
  if (!key) return null;
  const signed = new TextEncoder().encode(`${head}.${payload}`);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(signature), signed)) return null;
  const claims = decodePart(payload);
  const audiences = [].concat(claims.aud);
  const now = Date.now() / 1000;
  if (claims.iss !== `https://${team}` || !audiences.includes(aud) || !(claims.exp > now)) return null;
  return claims;
}

const safeName = (name) => String(name || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 60);

export async function identify(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  let claims;
  try {
    claims = await verify(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  } catch (err) {
    console.error('access', err);
    return null;
  }
  if (!claims) return null;
  if (claims.email) {
    const email = String(claims.email).toLowerCase();
    return email.endsWith(ALLOWED_DOMAIN) ? { type: 'person', name: email } : null;
  }
  if (claims.common_name) {
    const label = safeName(request.headers.get('x-agent-name'));
    return { type: 'agent', name: label ? `Agente · ${label}` : 'Agente' };
  }
  return null;
}
