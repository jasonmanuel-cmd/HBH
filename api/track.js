// Same-origin collector. Only this server can label records as Call Harbison.
import { createHmac } from 'node:crypto';
import { clientIp } from '../lib/request-ip.js';

export default async function handler(req, res, env = process.env) {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url || '/api/track', 'http://x');
  // Browser CSP report sink (routed from /csp-report in vercel.json without adding a separate function).
  if (url.searchParams.get('csp') === '1') {
    return res.end ? res.status(204).end('') : res.status(204).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!env.CRM_INGEST_SECRET) return res.status(503).json({ ok: false });
  if (req.headers?.dnt === '1' || req.headers?.['sec-gpc'] === '1') return res.status(202).json({ ok: true, stored: false });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({ ok: false }); }
  if (!body || !/^[a-f0-9-]{36}$/i.test(body.sid || '') || !['start', 'pageview', 'heartbeat', 'end'].includes(body.type)) return res.status(400).json({ ok: false });
  const path = typeof body.path === 'string' ? body.path.split(/[?#]/)[0].slice(0, 300) : '/';
  if (!path.startsWith('/') || path.startsWith('//') || /^\/(hq|api)(\/|$)/.test(path)) return res.status(400).json({ ok: false });
  const ip = clientIp(req) || 'unknown';
  const visitor = createHmac('sha256', env.CRM_INGEST_SECRET).update(`call_harbison:${new Date().toISOString().slice(0, 10)}:${ip}`).digest('hex');
  try {
    const response = await fetch('https://www.harbisonstandard.com/api/track', {
      method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${env.CRM_INGEST_SECRET}`,
        'x-analytics-user-agent': String(req.headers?.['user-agent'] || '').slice(0, 500),
        'x-analytics-visitor': visitor,
        'x-analytics-country': String(req.headers?.['x-vercel-ip-country'] || ''),
        'x-analytics-region': String(req.headers?.['x-vercel-ip-country-region'] || ''),
        'x-analytics-city': String(req.headers?.['x-vercel-ip-city'] || ''),
      },
      body: JSON.stringify({ ...body, site: 'call_harbison', path }),
    });
    const result = await response.json();
    return res.status(response.status).json({ ok: result.ok === true, stored: result.stored === true });
  } catch {
    console.error('[analytics] Call Harbison collector unavailable');
    return res.status(502).json({ ok: false });
  }
}
