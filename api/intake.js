// Private server-to-server bridge. Public visitors continue using /api/leads.
import { authorized, normalizeStandard } from '../lib/shared-intake.js';

export default async function handler(req, res, env = process.env) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  if (!env.CRM_INGEST_SECRET || env.CRM_INGEST_SECRET.length < 32) return res.status(503).json({ ok: false, error: 'Intake unavailable' });
  if (!authorized(req.headers?.authorization, env.CRM_INGEST_SECRET)) return res.status(401).json({ ok: false });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ ok: false, error: 'CRM unavailable' });
  let row;
  try { row = normalizeStandard(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); }
  catch { return res.status(400).json({ ok: false, error: 'Invalid inquiry' }); }
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  try {
    // An explicit UUID makes retries idempotent; conflicts never overwrite staff edits.
    const saved = await fetch(`${base}/leads`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row), signal: AbortSignal.timeout(10000),
    });
    if (saved.status === 409) {
      const check = await fetch(`${base}/leads?id=eq.${row.id}&form_type=eq.harbison_standard&select=id,email`, { headers, signal: AbortSignal.timeout(10000) });
      const existing = check.ok ? await check.json() : [];
      if (existing.length !== 1 || existing[0].email !== row.email) throw new Error('Submission conflict');
      return res.status(200).json({ ok: true, stored: true, id: row.id, duplicate: true });
    }
    if (!saved.ok) throw new Error(`CRM insert ${saved.status}`);
    const rows = await saved.json();
    if (!rows[0]?.id) throw new Error('CRM did not confirm storage');
    // Keep the original intake in the activity timeline even if staff later edit notes.
    try {
      const event = await fetch(`${base}/lead_events`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ lead_id: row.id, kind: 'note', actor: 'Harbison Standard intake', detail: row.notes }), signal: AbortSignal.timeout(5000),
      });
      if (!event.ok) console.error('[intake] Initial timeline snapshot failed:', event.status);
    } catch { console.error('[intake] Initial timeline snapshot unavailable; original intake remains in lead notes'); }
    return res.status(201).json({ ok: true, stored: true, id: row.id });
  } catch (error) {
    console.error('[intake]', error instanceof Error ? error.message : 'CRM storage failed');
    return res.status(502).json({ ok: false, stored: false, error: 'CRM storage failed' });
  }
}
