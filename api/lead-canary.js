import { randomUUID } from 'node:crypto';
import { deliver } from './leads.js';
import { useNeon } from '../lib/neon.js';
import { leadWebhookTarget } from '../lib/lead-webhook.js';

export async function runCanary(env = process.env, fetcher) {
  if (!env.CANARY_FAILURE_WEBHOOK_URL || !env.RESEND_API_KEY || !env.LEAD_NOTIFY_EMAIL) throw new Error('Canary alert configuration missing');
  const failureTarget = leadWebhookTarget(env.CANARY_FAILURE_WEBHOOK_URL);
  if (env.LEAD_WEBHOOK_URL && new URL(failureTarget).hostname === new URL(env.LEAD_WEBHOOK_URL).hostname) throw new Error('Canary failure alert must use an independent destination');
  useNeon(env);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Canary storage configuration missing');
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const dbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const read = fetcher || globalThis.fetch;
  const schema = await read(`${base}/rest/v1/leads?select=is_test&limit=0`, { headers: dbHeaders, signal: AbortSignal.timeout(10000) });
  if (!schema.ok) throw new Error('Canary test marker schema missing');
  if (env.SELLER_OPERATIONS_ENABLED === 'true') throw new Error('Canary requires the active alert pipeline to be tested without bypass');
  const id = randomUUID();
  const lead = {
    id, is_test: true, address: 'Synthetic canary — no property', name: 'HBH Canary',
    phone: '6615550100', email: null, source: '/api/lead-canary', channel: 'canary',
    form_type: 'standard', consent_response: false, consent_marketing: false,
  };
  const result = await deliver(lead, { ...env, LEAD_WEBHOOK_URL: '', ENABLE_AUTO_SMS: 'false' });
  if (!result.ok || !result.delivered.includes('supabase') || !result.delivered.includes('email')) throw new Error('Canary storage or owner alert failed');
  const response = await read(`${base}/rest/v1/leads?id=eq.${id}&select=id,is_test`, {
    headers: dbHeaders,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Canary readback failed');
  const rows = await response.json();
  if (rows.length !== 1 || rows[0].id !== id || rows[0].is_test !== true) throw new Error('Canary test marker missing');
  return { id, stored: true, ownerAlertAccepted: true };
}

export default async function handler(req, res, env = process.env) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  if (!env.CRON_SECRET || req.headers?.authorization !== `Bearer ${env.CRON_SECRET}`) return res.status(401).json({ ok: false });
  if (env.LEAD_CANARY_ENABLED !== 'true') return res.status(200).json({ ok: true, enabled: false });
  try {
    const result = await runCanary(env);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[lead-canary] failed', { code: error.code || 'CANARY_FAILED' });
    if (env.CANARY_FAILURE_WEBHOOK_URL) {
      try {
        const alert = await fetch(leadWebhookTarget(env.CANARY_FAILURE_WEBHOOK_URL), {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Title': 'Call Harbison lead canary failed', 'X-Priority': '5' },
          body: 'The Call Harbison lead check failed. Check Vercel function logs and the lead database.',
        });
        if (!alert.ok) throw new Error('Failure webhook rejected alert');
      } catch { console.error('[lead-canary] failure alert unavailable'); }
    }
    return res.status(503).json({ ok: false, error: 'CANARY_FAILED' });
  }
}
