import { readDetailsToken } from './leads.js';
import { useNeon } from '../lib/neon.js';

const SOURCES = new Set(['Google Search', 'Google Maps', 'YouTube', 'Facebook/Instagram', 'Referral', 'Mail/Sign', 'Other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const env = { ...process.env };
  useNeon(env);
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const source = body?.self_reported_source;
  const reference = readDetailsToken(body?.details_token, env);
  if (!SOURCES.has(source) || !reference?.address || !UUID.test(reference.id || '')) {
    return res.status(400).json({ ok: false, error: 'Invalid answer or lead reference.' });
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ ok: false });
  try {
    const query = new URLSearchParams({ id: `eq.${reference.id}`, is_test: 'eq.false' });
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads?${query}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ self_reported_source: source }),
    });
    if (!response.ok) throw new Error(`Attribution storage returned ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id?.toLowerCase() !== reference.id.toLowerCase()) {
      throw new Error('Attribution write was not confirmed');
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Lead attribution storage failed', error.message);
    return res.status(503).json({ ok: false, error: 'Could not save the answer.' });
  }
}
