import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const MANAGEMENT = join(here, '..');
export const API_BASE = 'https://management.naolito.com/api/agent';
export const AGENT_NAME = 'Daniel Martin';
export const MAILBOX = 'dmartin@naolito.com';
export const DOSSIER = join(MANAGEMENT, '..', 'licencias', 'dossier', 'naolito-licensing-dossier-en.pdf');
export const NEVER_CONTACT = ['maximum-orbit'];
export const MAX_WORDS = 120;

// Environment arrives as variables or as a .env, depending on the machine.
export function loadEnv() {
  for (const file of [join(MANAGEMENT, '..', '.env'), join(MANAGEMENT, '.env')]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

export function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Faltan variables de Environment: ${missing.join(', ')}`);
  return names.map((name) => process.env[name]);
}
