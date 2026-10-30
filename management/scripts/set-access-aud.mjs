// Copies ACCESS_AUD from the environment into the Pages project without printing it.
import { spawnSync } from 'node:child_process';

const aud = process.env.ACCESS_AUD;
if (!/^[0-9a-f]{64}$/.test(aud || '')) {
  console.error('ACCESS_AUD no está en el entorno o no tiene 64 caracteres hexadecimales.');
  process.exit(1);
}
const args = ['wrangler', 'pages', 'secret', 'put', 'ACCESS_AUD', '--project-name', 'naolito-management'];
const { status } = spawnSync('npx', args, { input: aud, stdio: ['pipe', 'inherit', 'inherit'] });
process.exit(status ?? 1);
