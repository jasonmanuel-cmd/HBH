// Private server-to-server bridge. Public visitors continue using /api/leads.
import { authorized, normalizeStandard } from '../lib/shared-intake.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req, res, env = process.env) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  if (!env.CRM_INGEST_SECRET || env.CRM_INGEST_SECRET.length < 32) return res.status(503).json({ ok: false, error: 'Intake unavailable' });
  if (!authorized(req.headers?.authorization, env.CRM_INGEST_SECRET)) return res.status(401).json({ ok: false });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ ok: false, error: 'CRM unavailable' });
  let row;
  let verification = false;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    verification = body?.kind === 'verify';
    row = normalizeStandard(verification ? {
      version: 1, brand: 'harbison_standard', submission_id: randomUUID(),
      lead: { name: 'CRM verification - do not contact', email: 'crm-verification@example.invalid', goal: 'Integration verification' },
    } : body);
    if (verification) row.status = 'spam';
  }
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
    if (verification) {
      // A private diagnostic with server-generated identity only. No email/SMS, and never touches a real inquiry.
      const read = await fetch(`${base}/leads?id=eq.${row.id}&select=id,email,form_type`, { headers, signal: AbortSignal.timeout(5000) });
      const records = read.ok ? await read.json() : [];
      const valid = records.length === 1 && records[0].id === row.id && records[0].email === row.email && records[0].form_type === row.form_type;
      const removed = await fetch(`${base}/leads?id=eq.${row.id}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' }, signal: AbortSignal.timeout(5000) });
      const deleted = removed.ok ? await removed.json() : [];
      if (!valid || !removed.ok || deleted.length !== 1 || deleted[0].id !== row.id) throw new Error('CRM verification or cleanup failed');
      return res.status(200).json({ ok: true, verified: true, cleaned: true });
    }
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
