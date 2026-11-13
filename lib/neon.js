// Switches the data layer to Neon when DATABASE_URL is set. Without it, nothing changes and the handlers keep
// talking to Supabase. The handlers keep calling `${SUPABASE_URL}/rest/v1/...`; with Neon that address is a
// private placeholder host answered in-process by lib/neon-rest.js against the Neon database.
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { createRestHandler } from './neon-rest.js';

export const NEON_HOST = 'https://neon.invalid';
const installed = Symbol.for('callharbison.neon');

export function useNeon(env = process.env) {
  const url = (env.DATABASE_URL || '').trim();
  if (!url) return false;
  env.SUPABASE_URL = NEON_HOST;
  // Some signing fallbacks read this value, so give it a secret derived from the connection string.
  env.SUPABASE_SERVICE_ROLE_KEY = createHash('sha256').update(`callharbison:${url}`).digest('hex');
  if (!globalThis[installed]) {
    const sql = neon(url);
    const handle = createRestHandler(async (text, params) => ({ rows: await sql.query(text, params) }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (target, init) => (String(target).startsWith(`${NEON_HOST}/rest/v1/`) ? handle(String(target), init) : realFetch(target, init));
    globalThis[installed] = true;
  }
  return true;
}
