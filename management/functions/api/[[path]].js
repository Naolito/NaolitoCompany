import { route } from '../../lib/router.js';

export const onRequest = ({ request, env, data }) => route(request, env, data.identity);
