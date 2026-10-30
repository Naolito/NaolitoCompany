import { API_BASE, AGENT_NAME, requireEnv } from './config.mjs';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// `call` is the only thing that touches the network, so tests can run this against the real router.
export function makeApi(call) {
  const post = (path, body = {}) => call('POST', path, body);
  return {
    queue: async () => (await call('GET', 'queue')).queue,
    agencies: async () => (await call('GET', 'agencies')).agencies,
    templates: async () => (await call('GET', 'templates')).templates,
    saveTemplate: (lang, body) => call('PUT', `templates/${lang}`, body),
    claim: (id) => post(`agencies/${id}/claim`),
    recordSent: (id, sent) => post(`agencies/${id}/sends`, { status: 'enviado', ...sent }),
    recordStuck: (id, why) => post(`agencies/${id}/sends`, { status: 'atencion', why }),
    reply: (id, state, note) => post(`agencies/${id}/reply`, { state, note }),
  };
}

export function liveApi() {
  const [id, secret] = requireEnv('CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET');
  return makeApi(async (method, path, body) => {
    const res = await fetch(`${API_BASE}/${path}`, {
      method,
      redirect: 'manual',
      headers: {
        'CF-Access-Client-Id': id,
        'CF-Access-Client-Secret': secret,
        'X-Agent-Name': AGENT_NAME,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new ApiError(res.status, `La miniweb respondió ${res.status} sin JSON: revisa el service token.`);
    const data = await res.json();
    if (!res.ok) throw new ApiError(res.status, data.error || `La miniweb respondió ${res.status}`);
    return data;
  });
}
