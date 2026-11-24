import { randomUUID } from 'node:crypto';
import { buildPages } from '../src/pages.mjs';
import { esPath } from '../src/i18n/translate.mjs';
import { analyticsSql, storePage } from '../lib/analytics-store.js';

const sites = new Map([
  ['www.callharbison.com', 'call_harbison'], ['callharbison.com', 'call_harbison'],
  ['www.harbisonstandard.com', 'harbison_standard'], ['harbisonstandard.com', 'harbison_standard'],
]);
const publicPaths = new Set(buildPages().flatMap(([, , path]) => path && path !== '/privacy' ? [path, esPath(path)] : []));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

export default async function handler(req, res, env = process.env, sqlFactory = analyticsSql) {
  res.setHeader('Cache-Control', 'no-store');
  const trace = randomUUID();
  res.setHeader('X-Analytics-Request-ID', trace);
  const url = new URL(req.url || '/api/track', 'http://local');
  if (url.searchParams.get('csp') === '1') return res.end ? res.status(204).end('') : res.status(204).json({ ok: true });
  const reply = (status, code) => res.status(status).json({ ok: status < 400, stored: status === 200, ...(code ? { code } : {}) });
  if (env.HBH_ANALYTICS_DISABLED === 'true') return reply(202, 'COLLECTOR_DISABLED');
  if (req.method !== 'POST') return reply(405, 'METHOD_NOT_ALLOWED');
  const headers = req.headers || {};
  if (headers['x-analytics-visitor'] || headers['x-analytics-hop']) return reply(508, 'FORWARDING_REJECTED');
  if (headers.dnt === '1' || headers['sec-gpc'] === '1') return reply(202, 'PRIVACY_OPT_OUT');
  const host = String(headers.host || '').toLowerCase();
  const site = sites.get(host);
  if (!site || (headers.origin && headers.origin !== `https://${host}`)) return reply(403, 'ORIGIN_REJECTED');
  if (/bot\b|crawler|spider|headlesschrome/i.test(String(headers['user-agent'] || ''))) return reply(202, 'AUTOMATED_TRAFFIC');
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return reply(400, 'INVALID_JSON'); }
  const path = typeof body?.path === 'string' ? body.path.split(/[?#]/)[0] : '';
  if (!publicPaths.has(path) || !uuid(body?.sid) || !uuid(body?.pageToken) || !['start', 'pageview', 'heartbeat', 'end'].includes(body.type)) {
    return reply(400, 'INVALID_EVENT');
  }
  if (body.consent !== true) return reply(202, 'CONSENT_REQUIRED');
  const duration = Number.isFinite(body.durationSeconds) ? Math.max(0, Math.min(1800, Math.round(body.durationSeconds))) : 0;
  const referrer = ['direct', 'search', 'social', 'referral'].includes(body.referrerType) ? body.referrerType : null;
  try {
    await storePage(sqlFactory(env), { site, sid: body.sid, token: body.pageToken, path, type: body.type, duration, referrer });
    return reply(200);
  } catch (error) {
    const code = ['DB_NOT_CONFIGURED', '42P01', '42501', '53300', '57P01'].includes(error?.code) ? error.code : 'STORAGE_FAILED';
    console.error('[analytics] database write failed', { trace, site, event: body.type, code });
    return reply(code === 'DB_NOT_CONFIGURED' ? 503 : 502, code);
  }
}
