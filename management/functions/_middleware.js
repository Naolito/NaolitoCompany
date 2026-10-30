import { identify } from '../lib/access.js';

export async function onRequest({ request, env, next, data }) {
  const identity = await identify(request, env);
  if (!identity) return new Response('Acceso denegado', { status: 403 });
  const onSite = !new URL(request.url).pathname.startsWith('/api/');
  if (onSite && identity.type !== 'person') return new Response('Acceso denegado', { status: 403 });
  data.identity = identity;
  return next();
}
