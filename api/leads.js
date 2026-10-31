// Vercel serverless function: POST /api/leads
// Delivers each lead to whichever destinations are configured via environment variables:
//   RESEND_API_KEY + LEAD_NOTIFY_EMAIL (+ optional LEAD_FROM_EMAIL)  -> email alert
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY                         -> row in `leads` table
//   LEAD_WEBHOOK_URL                                                 -> JSON POST (Zapier, Make, GoHighLevel, etc.)
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM             -> instant text to the lead (+ LEAD_ALERT_SMS for staff)
// A second request type, { kind: 'details' }, adds the optional thank-you-page answers using a signed token.
// A configured HQ database must accept the lead before the visitor sees success.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { clientIp, createRateLimiter } from '../lib/request-ip.js';
import { fetchWithRetry } from '../lib/fetch-retry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeFailure = (channel, err) => ({ channel, reason: `${channel} delivery failed`, code: err?.code === 'SUBMISSION_CONFLICT' ? 'SUBMISSION_CONFLICT' : 'DELIVERY_FAILED' });

const MAX = { address: 200, name: 120, phone: 40, email: 160, situation: 80, timeline: 60, source: 300, utm: 200, short: 80, id: 256 };
const DETAILS_TTL_MS = 6 * 3600e3;

// Fields added for the family-transition funnel. Kept separate so an un-migrated database still gets the core lead.
export const LEGACY_FIELDS = ['address', 'name', 'phone', 'email', 'situation', 'timeline', 'source', 'utm_source', 'utm_medium', 'utm_campaign'];

export const leadIpLimiter = createRateLimiter({ max: 6, windowMs: 10 * 60e3 });
export const leadPhoneLimiter = createRateLimiter({ max: 3, windowMs: 10 * 60e3 });

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const yes = (v) => v === true || v === 'yes' || v === 'on' || v === 'true';

// ---------- Signed thank-you details token ----------
const detailsSecret = (env) => env.HQ_SESSION_SECRET || env.CRM_INGEST_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.RESEND_API_KEY || env.LEAD_WEBHOOK_URL || '';
const signDetails = (payload, secret) => createHmac('sha256', `lead-details|${secret}`).update(payload).digest('base64url');

export function makeDetailsToken({ id, phone, address }, env = process.env, now = Date.now()) {
  const secret = detailsSecret(env);
  if (!secret) return '';
  const payload = Buffer.from(JSON.stringify({ id: id || null, phone, address, exp: now + DETAILS_TTL_MS })).toString('base64url');
  return `${payload}.${signDetails(payload, secret)}`;
}

export function readDetailsToken(token, env = process.env, now = Date.now()) {
  const secret = detailsSecret(env);
  if (!secret || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = signDetails(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > now ? data : null;
  } catch {
    return null;
  }
}

export function parseLead(body) {
  const first = clean(body.first_name, MAX.short);
  const last = clean(body.last_name, MAX.short);
  const street = clean(body.street, MAX.address);
  const city = clean(body.city, MAX.short);
  const zip = clean(body.zip, 10);
  const composedAddress = street ? [street, city, `CA ${zip}`.trim()].filter(Boolean).join(', ') : '';
  const lead = {
    address: clean(body.address, MAX.address) || composedAddress,
    name: clean(body.name, MAX.name) || `${first} ${last}`.trim(),
    first_name: first,
    last_name: last,
    street,
    city,
    zip,
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
    // Do not let public submissions impersonate the authenticated Standard bridge.
    form_type: ['options', 'family_transition', 'standard'].includes(body.form_type) ? body.form_type : 'standard',
    relationship: clean(body.relationship, MAX.short),
    help_needed: clean(body.help_needed, MAX.short),
    contact_pref: clean(body.contact_pref, MAX.short),
    route_interest: clean(body.route_interest, MAX.short),
    location_interest: clean(body.location_interest, MAX.short),
    page_type: clean(body.page_type, MAX.short),
    // Transactional (reply about this property) and marketing consent are recorded separately.
    consent_response: yes(body.consent_response),
    consent_marketing: yes(body.consent_marketing),
  };
  if (lead.consent_response || lead.consent_marketing) lead.consent_at = new Date().toISOString();
  lead.channel = classifyChannel(lead);
  const errors = [];
  if (lead.address.length < 5) errors.push('address');
  if (lead.name.length < 2) errors.push('name');
  if (lead.phone.replace(/\D/g, '').length < 10) errors.push('phone');
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push('email');
  if (lead.form_type === 'family_transition' && !lead.relationship) errors.push('relationship');
  if (lead.form_type === 'options' && !lead.consent_response) errors.push('consent_response');
  if (lead.form_type === 'family_transition' && 'consent_response' in body && !lead.consent_response) errors.push('consent_response');
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

// A lead from a Spanish page (/es/...) is answered in Spanish. Derived from the page the form was on, so no database column is needed.
export const wantsSpanish = (lead) => /^\/es(\/|$)/.test(lead.source || '');

export const ACK_SMS = {
  en: 'Thank you for contacting Call Harbison. We received your inquiry and will forward it to Nathanael Harbison for follow-up. This is an automated acknowledgment. Reply STOP to opt out.',
  es: 'Gracias por comunicarse con Call Harbison. Recibimos su consulta y la enviaremos a Nathanael Harbison para su seguimiento. Este es un mensaje automático. Responda STOP para cancelar.',
};

const street = (a) => a.split(',')[0];
const e164 = (p) => {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : null;
};

export const notificationRecipients = (env) => [...new Set(
  (env.LEAD_NOTIFY_EMAIL || 'nate85.realtor@gmail.com,coaiebay@gmail.com')
    .split(',').map((value) => value.trim()).filter(Boolean)
)];

async function sendEmail(lead, env) {
  const rows = [...Object.entries(lead), ...(wantsSpanish(lead) ? [['language', 'Spanish: please reply in Spanish']] : [])]
    .filter(([k, v]) => v && k !== 'id')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#62717a">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join('');
  const siteBase = (env.SITE_URL || 'https://www.callharbison.com').replace(/\/$/, '');
  const hqLink = lead.id ? ` · <a href="${escapeHtml(`${siteBase}/hq?lead=${encodeURIComponent(lead.id)}`)}">Open in Harbison HQ →</a>` : '';
  const res = await fetchWithRetry('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(lead.id ? { 'Idempotency-Key': `lead-${lead.id}` } : {}) },
    body: JSON.stringify({
      from: env.LEAD_FROM_EMAIL || 'Harbison Leads <onboarding@resend.dev>',
      to: notificationRecipients(env),
      reply_to: lead.email || undefined,
      subject: `New ${lead.form_type === 'family_transition' ? 'family property' : 'property'} lead [${lead.channel}]${wantsSpanish(lead) ? ' [ES]' : ''}: ${lead.address}`,
      html: `<h2 style="font-family:Georgia,serif;color:#031f2b">New property lead</h2><table>${rows}</table><p><a href="tel:${escapeHtml(lead.phone)}">Call ${escapeHtml(lead.name)}</a>${hqLink}</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function saveToSupabase(lead, env) {
  const endpoint = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads${lead.id ? '?on_conflict=id' : ''}`;
  const prefer = lead.id ? 'resolution=ignore-duplicates,return=representation' : 'return=minimal';
  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: JSON.stringify({ ...lead, email: lead.email || null }),
  });
  if (res.ok) return readInsertResult(res, lead, env);
  const text = await res.text();
  // Migration 002 not run yet? Save the core lead instead of losing it.
  if (res.status === 400 && /column/i.test(text)) {
    console.warn('[leads] Supabase missing new columns — run supabase/migrations/002_family_transition.sql. Saving core fields.');
    const core = Object.fromEntries(LEGACY_FIELDS.map((k) => [k, lead[k] || null]));
    const retry = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
      body: JSON.stringify({ ...(lead.id ? { id: lead.id } : {}), ...core, address: lead.address, name: lead.name, phone: lead.phone }),
    });
    if (retry.ok) return readInsertResult(retry, lead, env, true);
    throw new Error(`Supabase ${retry.status}: ${await retry.text()}`);
  }
  throw new Error(`Supabase ${res.status}: ${text}`);
}

// The primary key arbitrates concurrent submissions; never overwrite a lead on retry.
async function readInsertResult(response, lead, env, legacy = false) {
  if (!lead.id) return { duplicate: false };
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Invalid storage response');
  if (rows.length) return { duplicate: false };
  const fields = legacy ? LEGACY_FIELDS : Object.keys(lead).filter((key) => !['id', 'consent_at'].includes(key));
  const q = new URLSearchParams({ id: `eq.${lead.id}`, select: fields.join(',') });
  const existing = await fetchWithRetry(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads?${q}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!existing.ok) throw new Error('Could not verify existing submission');
  const saved = (await existing.json())[0];
  // Reject token reuse with changed contact/consent. Never mint a details token for a different lead.
  if (legacy || !saved || fields.some((key) => (saved[key] ?? '') !== (lead[key] ?? ''))) {
    const err = new Error('Submission reference conflict'); err.code = 'SUBMISSION_CONFLICT'; throw err;
  }
  return { duplicate: true };
}

async function sendSms(to, body, env) {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetchWithRetry(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body }),
  }, { retries: 0 });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
}

// Instant acknowledgement to the lead + alert to the team. Speed-to-lead is the single biggest conversion lever.
async function textLeadAndTeam(lead, env) {
  const jobs = [];
  const to = e164(lead.phone);
  if (env.LEAD_ACK_ENABLED === 'true' && to && lead.contact_pref !== 'Email' && lead.consent_response) {
    jobs.push(sendSms(to, ACK_SMS[wantsSpanish(lead) ? 'es' : 'en'], env));
  }
  if (env.LEAD_ALERT_SMS) {
    const alert = `NEW LEAD${wantsSpanish(lead) ? ' [SPANISH]' : ''} (${lead.channel}${lead.ref_partner ? `:${lead.ref_partner}` : ''}) ${lead.name} ${lead.phone} — ${street(lead.address)}. ${lead.situation || ''} ${lead.relationship ? `| ${lead.relationship}` : ''}${lead.route_interest ? ` | path: ${lead.route_interest}` : ''} | prefers ${lead.contact_pref || 'call'}`.slice(0, 320);
    env.LEAD_ALERT_SMS.split(',').map((n) => e164(n.trim())).filter(Boolean).forEach((n) => jobs.push(sendSms(n, alert, env)));
  }
  await Promise.all(jobs);
}

async function postWebhook(lead, env) {
  const res = await fetchWithRetry(env.LEAD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...lead, submitted_at: new Date().toISOString() }),
  }, { retries: 0 });
  if (!res.ok) throw new Error(`Webhook ${res.status}`);
}

export async function deliver(lead, env = process.env) {
  const crmConfigured = Boolean(env.SUPABASE_URL || env.SUPABASE_SERVICE_ROLE_KEY);
  const delivered = [];
  const failures = [];
  // Persist before notifying. At most one request wins the insert and attempts alerts.
  // This is not a durable outbox: a crash after insertion can leave an unalerted HQ lead.
  if (crmConfigured) {
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Incomplete storage configuration');
      const result = await saveToSupabase(lead, env);
      delivered.push('supabase');
      if (result?.duplicate) return { ok: true, delivered, failures, duplicate: true };
    } catch (err) {
      const failure = safeFailure('supabase', err);
      console.error('[leads] storage failed', { id: lead.id, code: failure.code });
      return { ok: false, delivered, failures: [failure] };
    }
  }
  const tasks = [];
  if (env.RESEND_API_KEY) tasks.push(['email', sendEmail(lead, env)]);
  if (env.LEAD_WEBHOOK_URL) tasks.push(['webhook', postWebhook(lead, env)]);
  // A customer acknowledgment must never precede successful durable storage.
  if (delivered.includes('supabase') && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) tasks.push(['sms', textLeadAndTeam(lead, env)]);
  if (!tasks.length && !delivered.length) {
    console.error('[leads] no storing destination configured', { id: lead.id });
    return { ok: false, delivered, error: 'no_delivery_configured' };
  }
  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') delivered.push(tasks[i][0]);
    else {
      const failure = safeFailure(tasks[i][0], r.reason);
      failures.push(failure);
      console.error('[leads] notification failed', { id: lead.id, channel: failure.channel });
    }
  });
  const stored = crmConfigured ? delivered.includes('supabase') : delivered.some((d) => d !== 'sms');
  if (stored && lead.id && failures.length && crmConfigured) {
    try {
      const warning = await fetchWithRetry(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/lead_events`, {
        method: 'POST',
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ lead_id: lead.id, kind: 'note', actor: 'System', detail: `Notification alert warning: ${failures.map((f) => f.reason).join('; ')}` }),
      }, { retries: 0 });
      if (!warning.ok) throw new Error('Warning storage failed');
    } catch { console.error('[leads] notification warning could not be stored', { id: lead.id }); }
  }
  return { ok: stored, delivered, failures };
}

// ---------- Optional details from the thank-you page ----------
const DETAIL_MAX = 80;
export function parseDetails(body) {
  const flags = Array.isArray(body.condition_flags) ? body.condition_flags : [];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id || '');
  return {
    ...(isUuid ? { id: body.id } : {}),
    phone: clean(body.phone, MAX.phone),
    address: clean(body.address, MAX.address),
    timeline: clean(body.timeline, DETAIL_MAX),
    occupancy: clean(body.occupancy, DETAIL_MAX),
    condition_flags: flags.slice(0, 10).map((f) => clean(f, DETAIL_MAX)).filter(Boolean),
    desired_outcome: clean(body.desired_outcome, DETAIL_MAX),
  };
}

// Attach to the exact lead ID when verified by token, or fallback to recent phone+address match.
async function patchSupabase(d, env) {
  const since = new Date(Date.now() - DETAILS_TTL_MS).toISOString();
  const q = d.id
    ? new URLSearchParams({ id: `eq.${d.id}`, created_at: `gte.${since}` })
    : new URLSearchParams({ phone: `eq.${d.phone}`, address: `eq.${d.address}`, created_at: `gte.${since}` });
  const res = await fetchWithRetry(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads?${q}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: d.id ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify({ timeline: d.timeline || undefined, occupancy: d.occupancy || null, condition_flags: d.condition_flags.length ? d.condition_flags : null, desired_outcome: d.desired_outcome || null }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  if (d.id) {
    const updated = text ? JSON.parse(text) : [];
    if (!updated.length) throw new Error('Lead not found for details update');
  }
}

export async function deliverDetails(d, env = process.env) {
  const summary = [d.timeline && `Timeline: ${d.timeline}`, d.occupancy && `Occupancy: ${d.occupancy}`, d.condition_flags.length && `Condition: ${d.condition_flags.join(', ')}`, d.desired_outcome && `Goal: ${d.desired_outcome}`].filter(Boolean);
  const siteBase = (env.SITE_URL || 'https://www.callharbison.com').replace(/\/$/, '');
  const hqLink = d.id ? `<p><a href="${escapeHtml(`${siteBase}/hq?lead=${encodeURIComponent(d.id)}`)}">Open in Harbison HQ →</a></p>` : '';
  const tasks = [];
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) tasks.push(['supabase', patchSupabase(d, env)]);
  if (env.RESEND_API_KEY) {
    tasks.push(['email', fetchWithRetry('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.LEAD_FROM_EMAIL || 'Harbison Leads <onboarding@resend.dev>',
        to: notificationRecipients(env),
        subject: `Lead details added: ${d.address}`,
        html: `<p><strong>${escapeHtml(d.address)}</strong> · ${escapeHtml(d.phone)}</p><ul>${summary.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>${hqLink}`,
      }),
    }, { retries: 0 }).then(async (r) => { if (!r.ok) throw new Error(`Resend ${r.status}`); })]);
  }
  if (env.LEAD_WEBHOOK_URL) {
    tasks.push(['webhook', fetchWithRetry(env.LEAD_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'details', ...d, submitted_at: new Date().toISOString() }),
    }, { retries: 0 }).then((r) => { if (!r.ok) throw new Error(`Webhook ${r.status}`); })]);
  }
  if (!tasks.length) {
    console.error('[leads] details destination unavailable', { id: d.id });
    return { ok: false, delivered: [], error: 'no_delivery_configured' };
  }
  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  const delivered = [];
  const failures = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') delivered.push(tasks[i][0]);
    else {
      failures.push(safeFailure(tasks[i][0], r.reason));
      console.error('[leads] details delivery failed', { id: d.id, channel: tasks[i][0] });
    }
  });
  const crmConfigured = Boolean(env.SUPABASE_URL || env.SUPABASE_SERVICE_ROLE_KEY);
  const ok = crmConfigured ? delivered.includes('supabase') : delivered.length > 0;
  return { ok, delivered, failures };
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip = clientIp(req);
  if (ip && leadIpLimiter.hit(ip).limited) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please wait a few minutes or call us directly.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === 'object' ? body : {};

  // Honeypot: bots fill the hidden "company" field. Pretend success so they learn nothing.
  if (body.company) return res.status(200).json({ ok: true });

  if (body.kind === 'details') {
    if (body.details_token && detailsSecret(env)) {
      const verified = readDetailsToken(body.details_token, env);
      if (!verified) return res.status(401).json({ ok: false, error: 'Invalid or expired lead reference.' });
      body = { ...body, id: verified.id, phone: verified.phone, address: verified.address };
    }
    const d = parseDetails(body);
    if (d.phone.replace(/\D/g, '').length < 10 || d.address.length < 5) {
      return res.status(400).json({ ok: false, error: 'Missing lead reference.' });
    }
    if (detailsSecret(env) && !body.details_token) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired lead reference.' });
    }
    const r = await deliverDetails(d, env);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, delivered: r.delivered || [], error: r.error, code: r.ok ? undefined : 'DELIVERY_FAILED' });
  }

  const { lead, errors } = parseLead(body);
  const es = wantsSpanish(lead) || body.language === 'es';
  if (errors.length) return res.status(400).json({ ok: false, error: es ? 'Por favor, revise los campos resaltados.' : 'Please check the highlighted fields.', fields: errors });

  if (ip) {
    const normalizedPhone = lead.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (normalizedPhone && leadPhoneLimiter.hit(normalizedPhone).limited) {
      return res.status(429).json({ ok: false, error: es ? 'Ya recibimos su solicitud reciente. Por favor, llámenos o envíenos un texto si necesita ayuda de inmediato.' : 'We already received your recent request. Please call or text us if you need immediate help.' });
    }
  }

  if (body.submission_id !== undefined && (typeof body.submission_id !== 'string' || !UUID.test(body.submission_id))) return res.status(400).json({ ok: false, error: 'Invalid submission reference.' });
  // Stable browser retries require the atomic database path, not email/webhook-only delivery.
  if (body.submission_id && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) return res.status(502).json({ ok: false, error: 'We could not save your request. Please call us instead.', code: 'STORAGE_UNAVAILABLE' });
  lead.id = body.submission_id || randomUUID();
  const result = await deliver(lead, env);
  if (!result.ok && result.failures?.[0]?.code === 'SUBMISSION_CONFLICT') return res.status(409).json({ ok: false, error: es ? 'Ya recibimos una solicitud con esta referencia. Llámenos para actualizarla.' : 'A request with this reference was already received. Please call us to update it.', code: 'SUBMISSION_CONFLICT' });
  if (!result.ok) return res.status(502).json({ ok: false, error: es ? 'No pudimos enviar su solicitud. Por favor, llámenos.' : 'We could not send your request. Please call us instead.', code: result.failures?.[0]?.code || 'DELIVERY_FAILED' });
  return res.status(200).json({
    ok: true,
    duplicate: result.duplicate || false,
    id: lead.id,
    details_token: makeDetailsToken({ id: lead.id, phone: lead.phone, address: lead.address }, env),
  });
}
