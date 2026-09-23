// Vercel serverless function: POST /api/leads
// Delivers each lead to whichever destinations are configured via environment variables:
//   RESEND_API_KEY + LEAD_NOTIFY_EMAIL (+ optional LEAD_FROM_EMAIL)  -> email alert
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY                         -> row in `leads` table
//   LEAD_WEBHOOK_URL                                                 -> JSON POST (Zapier, Make, GoHighLevel, etc.)
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM             -> instant text to the lead (+ LEAD_ALERT_SMS for staff)
// If none are configured the lead is written to the function logs so nothing is lost during setup.

const MAX = { address: 200, name: 120, phone: 40, email: 160, situation: 80, timeline: 60, source: 300, utm: 200, short: 80, id: 256 };

// Fields added for the family-transition funnel. Kept separate so an un-migrated database still gets the core lead.
export const LEGACY_FIELDS = ['address', 'name', 'phone', 'email', 'situation', 'timeline', 'source', 'utm_source', 'utm_medium', 'utm_campaign'];

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
    utm_term: clean(body.utm_term, MAX.utm),
    utm_content: clean(body.utm_content, MAX.utm),
    gclid: clean(body.gclid, MAX.id),
    gbraid: clean(body.gbraid, MAX.id),
    wbraid: clean(body.wbraid, MAX.id),
    ref_partner: clean(body.ref, MAX.short).toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    landing_page: clean(body.landing_page, MAX.source),
    referrer: clean(body.referrer, MAX.source),
    form_type: clean(body.form_type, MAX.short) || 'standard',
    relationship: clean(body.relationship, MAX.short),
    help_needed: clean(body.help_needed, MAX.short),
    contact_pref: clean(body.contact_pref, MAX.short),
  };
  lead.channel = classifyChannel(lead);
  const errors = [];
  if (lead.address.length < 5) errors.push('address');
  if (lead.name.length < 2) errors.push('name');
  if (lead.phone.replace(/\D/g, '').length < 10) errors.push('phone');
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push('email');
  if (lead.form_type === 'family_transition' && !lead.relationship) errors.push('relationship');
  return { lead, errors };
}

// One channel per lead, decided server-side so reporting doesn't depend on the browser.
export function classifyChannel(l) {
  const src = (l.utm_source || '').toLowerCase();
  const med = (l.utm_medium || '').toLowerCase();
  const ref = (l.referrer || '').toLowerCase();
  if (l.gclid || l.gbraid || l.wbraid || (src === 'google' && ['cpc', 'ppc', 'paid'].includes(med))) return 'google_ads';
  if (l.ref_partner || med === 'referral') return 'partner';
  if (src.includes('youtube') || ref.includes('youtube.')) return 'youtube';
  if (/chatgpt|perplexity|claude\.ai|copilot|gemini/.test(src + ref)) return 'ai_search';
  if (['social', 'paid_social'].includes(med) || /facebook|instagram|\/\/(l\.)?fb\.|\/\/t\.co\/|linkedin/.test(`${src} ${ref}`)) return 'social';
  if (/google\.|bing\.|duckduckgo\.|yahoo\./.test(ref)) return 'organic';
  if (src || med) return 'campaign';
  return ref ? 'other_referral' : 'direct';
}

const firstName = (n) => n.split(/\s+/)[0];
const street = (a) => a.split(',')[0];
const e164 = (p) => {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : null;
};

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
      subject: `New ${lead.form_type === 'family_transition' ? 'family property' : 'property'} lead [${lead.channel}]: ${lead.address}`,
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
  if (res.ok) return;
  const text = await res.text();
  // Migration 002 not run yet? Save the core lead instead of losing it.
  if (res.status === 400 && /column/i.test(text)) {
    console.warn('[leads] Supabase missing new columns — run supabase/migrations/002_family_transition.sql. Saving core fields.');
    const core = Object.fromEntries(LEGACY_FIELDS.map((k) => [k, lead[k] || null]));
    const retry = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ...core, address: lead.address, name: lead.name, phone: lead.phone }),
    });
    if (retry.ok) return;
    throw new Error(`Supabase ${retry.status}: ${await retry.text()}`);
  }
  throw new Error(`Supabase ${res.status}: ${text}`);
}

async function sendSms(to, body, env) {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
}

// Instant acknowledgement to the lead + alert to the team. Speed-to-lead is the single biggest conversion lever.
async function textLeadAndTeam(lead, env) {
  const jobs = [];
  const to = e164(lead.phone);
  if (to && lead.contact_pref !== 'Email') {
    jobs.push(sendSms(to, `Hi ${firstName(lead.name)}, this is Nathanael Harbison's team. We got your note about ${street(lead.address)} and will reach out shortly. If texting is easier, just reply here. Reply STOP to opt out.`, env));
  }
  if (env.LEAD_ALERT_SMS) {
    const alert = `NEW LEAD (${lead.channel}${lead.ref_partner ? `:${lead.ref_partner}` : ''}) ${lead.name} ${lead.phone} — ${street(lead.address)}. ${lead.situation || ''} ${lead.relationship ? `| ${lead.relationship}` : ''} | prefers ${lead.contact_pref || 'call'}`.slice(0, 320);
    env.LEAD_ALERT_SMS.split(',').map((n) => e164(n.trim())).filter(Boolean).forEach((n) => jobs.push(sendSms(n, alert, env)));
  }
  await Promise.all(jobs);
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
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) tasks.push(['sms', textLeadAndTeam(lead, env)]);

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
  // A text alone isn't a record of the lead — require at least one storing destination.
  const stored = delivered.some((d) => d !== 'sms');
  if (!stored) console.error('[leads] No storing destination succeeded. Lead:', JSON.stringify(lead));
  return { ok: stored, delivered };
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
