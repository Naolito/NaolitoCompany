import { agentApi } from './agent-api.js';
import { HttpError, json } from './http.js';
import { peopleApi } from './people-api.js';

// A person can't use the agent API and a service token can't use the team's.
export async function route(request, env, identity) {
  try {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean).slice(1);
    if (parts[0] === 'agent') {
      if (identity.type !== 'agent') throw new HttpError(403, 'Esta API es solo para agentes.');
      return await agentApi(request, env, identity, parts.slice(1));
    }
    if (identity.type !== 'person') throw new HttpError(403, 'Esta API es solo para el equipo.');
    const writes = request.method !== 'GET' && request.method !== 'HEAD';
    if (writes && !request.headers.get('content-type')?.startsWith('application/json')) {
      throw new HttpError(415, 'Envía JSON.');
    }
    return await peopleApi(request, env, identity, parts);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Error interno.' }, 500);
  }
}
