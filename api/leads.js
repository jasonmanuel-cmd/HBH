// Vercel serverless function: POST /api/leads
// Delivers each lead to whichever destinations are configured via environment variables:
//   RESEND_API_KEY + LEAD_NOTIFY_EMAIL (+ optional LEAD_FROM_EMAIL)  -> email alert
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY                         -> row in `leads` table
//   LEAD_WEBHOOK_URL                                                 -> JSON POST (Zapier, Make, GoHighLevel, etc.)
// If none are configured the lead is written to the function logs so nothing is lost during setup.

const MAX = { address: 200, name: 120, phone: 40, email: 160, situation: 80, timeline: 60, source: 300, utm: 200 };

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function parseLead(body) {
  const lead = {
    address: clean(body.address, MAX.address),
    name: clean(body.name, MAX.name),
    phone: clean(body.phone, MAX.phone),
    email: clean(body.email, MAX.email),
    situation: clean(body.situation, MAX.situation),
    timeline: clean(body.timeline, MAX.timeline),
    source: clean(body.source, MAX.source),
    utm_source: clean(body.utm_source, MAX.utm),
    utm_medium: clean(body.utm_medium, MAX.utm),
    utm_campaign: clean(body.utm_campaign, MAX.utm),
  };
  const errors = [];
  if (lead.address.length < 5) errors.push('address');
  if (lead.name.length < 2) errors.push('name');
  if (lead.phone.replace(/\D/g, '').length < 10) errors.push('phone');
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push('email');
  return { lead, errors };
}

async function sendEmail(lead, env) {
  const rows = Object.entries(lead)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#62717a">${k}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join('');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.LEAD_FROM_EMAIL || 'Harbison Leads <onboarding@resend.dev>',
      to: env.LEAD_NOTIFY_EMAIL.split(',').map((s) => s.trim()),
      reply_to: lead.email || undefined,
      subject: `New property lead: ${lead.address}`,
      html: `<h2 style="font-family:Georgia,serif;color:#031f2b">New property lead</h2><table>${rows}</table><p><a href="tel:${escapeHtml(lead.phone)}">Call ${escapeHtml(lead.name)}</a></p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function saveToSupabase(lead, env) {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...lead, email: lead.email || null }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

async function postWebhook(lead, env) {
  const res = await fetch(env.LEAD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...lead, submitted_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Webhook ${res.status}`);
}

export async function deliver(lead, env = process.env) {
  const tasks = [];
  if (env.RESEND_API_KEY && env.LEAD_NOTIFY_EMAIL) tasks.push(['email', sendEmail(lead, env)]);
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) tasks.push(['supabase', saveToSupabase(lead, env)]);
  if (env.LEAD_WEBHOOK_URL) tasks.push(['webhook', postWebhook(lead, env)]);

  if (!tasks.length) {
    console.warn('[leads] No delivery configured — set RESEND/SUPABASE/WEBHOOK env vars. Lead:', JSON.stringify(lead));
    return { ok: true, delivered: [] };
  }

  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  const delivered = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') delivered.push(tasks[i][0]);
    else console.error(`[leads] ${tasks[i][0]} failed:`, r.reason?.message || r.reason);
  });
  if (!delivered.length) console.error('[leads] All deliveries failed. Lead:', JSON.stringify(lead));
  return { ok: delivered.length > 0, delivered };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === 'object' ? body : {};

  // Honeypot: bots fill the hidden "company" field. Pretend success.
  if (body.company) return res.status(200).json({ ok: true });

  const { lead, errors } = parseLead(body);
  if (errors.length) return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', fields: errors });

  const result = await deliver(lead);
  if (!result.ok) return res.status(502).json({ ok: false, error: 'We could not send your request. Please call us instead.' });
  return res.status(200).json({ ok: true });
}
