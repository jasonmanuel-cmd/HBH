// HQ panel API: POST/GET/PATCH/DELETE /api/hq?action=...
// Password login (HQ_PASSWORD) → signed, HttpOnly session cookie. All data access happens here with the
// Supabase service key; the browser never sees it. One function file keeps the Vercel Hobby function count low.
//
// Env: HQ_PASSWORD (required), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required),
//      HQ_SESSION_SECRET (optional — otherwise derived from the password + service key, so changing
//      the password signs everyone out).
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { brandOf, brandFilter, STANDARD_FORM } from '../lib/shared-intake.js';
import { demoLeadReason } from '../lib/demo-leads.js';
import { clientIp, createRateLimiter } from '../lib/request-ip.js';
import { prepareLeadImport } from '../lib/lead-import.js';
import { fetchWithRetry } from '../lib/fetch-retry.js';
import { notificationRecipients } from './leads.js';

export const STATUSES = ['new', 'contact_attempted', 'connected', 'qualified', 'appointment_set', 'property_reviewed', 'options_presented', 'nurture', 'under_contract', 'closed_won', 'closed_lost', 'not_a_fit', 'spam'];
const CLOSED = ['closed_won', 'closed_lost', 'not_a_fit', 'spam'];
export const OUTCOMES = ['direct_purchase', 'listing', 'buyer_purchase', 'referral_out', 'none'];
export const ROUTES = ['direct', 'listing', 'renovate', 'development', 'not_ready'];
const PARTNER_CATEGORIES = ['placement', 'senior_community', 'estate_sale', 'fiduciary', 'elder_law', 'move_manager', 'other'];
const PARTNER_STATUSES = ['prospect', 'contacted', 'meeting_set', 'active', 'paused', 'declined'];
const PURGE_CONFIRMATION = 'DELETE';
const EMPTY_TRASH_MAX = 200;

const EVENT_KINDS = ['note', 'call', 'text', 'email', 'appointment', 'offer'];
const CONTACT_KINDS = ['call', 'text', 'email'];
const SESSION_HOURS = 12;
const COOKIE = 'hq_session';

const LIST_COLS = 'id,created_at,name,phone,email,address,situation,status,channel,source,route_interest,next_followup,appointment_at,assigned_to,do_not_contact,form_type';
const EXPORT_COLS = 'id,created_at,name,phone,email,address,situation,timeline,status,assigned_to,form_type,channel,route_interest,ref_partner,utm_source,utm_medium,utm_campaign,gclid,first_contact_at,appointment_at,next_followup,estimated_value,offer_amount,outcome_path,closed_value,gross_profit,closed_at,lost_reason,consent_response,consent_marketing,do_not_contact';

// ---------- field validation for edits ----------
const text = (max) => (v) => (v == null || v === '' ? null : typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const nonNullText = (max) => (v) => (v == null || v === '' ? '' : typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const phoneField = (v) => {
  if (v == null || v === '') return '';
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim().slice(0, 40);
  if (!trimmed) return '';
  return trimmed.replace(/\D/g, '').length >= 7 ? trimmed : undefined;
};
const emailField = (v) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim().slice(0, 160).toLowerCase();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : undefined;
};
const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const time = (v) => (v == null || v === '' ? null : Number.isNaN(Date.parse(v)) ? undefined : new Date(v).toISOString());
const oneOf = (list, nullable = false) => (v) => (nullable && (v == null || v === '') ? null : list.includes(v) ? v : undefined);
const required = (fn) => (v) => { const out = fn(v); return out === null || out === '' ? undefined : out; };

export const EDITABLE = {
  status: oneOf(STATUSES),
  name: required(text(120)),
  phone: phoneField,
  email: emailField,
  address: nonNullText(200),
  situation: text(120),
  route_interest: oneOf(ROUTES, true),
  assigned_to: text(60),
  next_followup: time,
  appointment_at: time,
  estimated_value: num,
  offer_amount: num,
  outcome_path: oneOf(OUTCOMES, true),
  closed_value: num,
  gross_profit: num,
  lost_reason: text(300),
  notes: text(5000),
  do_not_contact: bool,
  authority_confirmed: bool,
};

const LABELS = {
  name: 'name', phone: 'phone', email: 'email', address: 'address', situation: 'inquiry', route_interest: 'path of interest',
  assigned_to: 'assigned to', next_followup: 'next follow-up', appointment_at: 'appointment', estimated_value: 'estimated value',
  offer_amount: 'offer amount', outcome_path: 'outcome path', closed_value: 'closed value', gross_profit: 'gross profit',
  lost_reason: 'lost reason', do_not_contact: 'do-not-contact', authority_confirmed: 'authority confirmed',
};

export function cleanPatch(body) {
  const patch = {};
  const bad = [];
  for (const [k, fn] of Object.entries(EDITABLE)) {
    if (!(k in body)) continue;
    const v = fn(body[k]);
    if (v === undefined) bad.push(k);
    else patch[k] = v;
  }
  if (patch.status === 'closed_won' || patch.status === 'closed_lost') patch.closed_at = new Date().toISOString();
  return { patch, bad };
}

export function cleanNewLead(body) {
  const bad = [];
  const name = required(text(120))(body.name);
  if (name === undefined) bad.push('name');
  const phone = phoneField(body.phone);
  if (phone === undefined) bad.push('phone');
  const email = emailField(body.email);
  if (email === undefined) bad.push('email');
  if (!phone && !email && !bad.includes('phone') && !bad.includes('email')) bad.push('phone');
  const status = body.status ? oneOf(STATUSES)(body.status) : 'new';
  if (status === undefined) bad.push('status');
  const route = oneOf(ROUTES, true)(body.route_interest);
  if (route === undefined) bad.push('route_interest');
  if (bad.length) return { row: null, bad };

  const brand = body.brand === 'harbison_standard' ? 'harbison_standard' : 'call_harbison';
  const nowIso = new Date().toISOString();
  const row = {
    name,
    phone: phone || '',
    email: email || null,
    address: nonNullText(200)(body.address) ?? '',
    situation: text(120)(body.situation) || (brand === 'harbison_standard' ? 'General inquiry' : 'Phone / manual inquiry'),
    route_interest: route,
    channel: text(60)(body.channel) || 'phone_call',
    source: 'hq_manual',
    form_type: brand === 'harbison_standard' ? STANDARD_FORM : 'manual',
    status,
    assigned_to: text(60)(body.assigned_to) || 'nathanael',
    notes: text(5000)(body.notes),
    consent_response: Boolean(body.consent_response),
    consent_marketing: false,
    ...(status !== 'new' && !['spam', 'not_a_fit'].includes(status) ? { first_contact_at: nowIso } : {}),
  };
  return { row, bad: [] };
}

// Punctuation-tolerant search across name, phone, address, and email.
// Stored phones vary between "(661) 555-0101" and "6615550101", so digit queries add a wildcard pattern.
export function buildSearchOr(rawQ) {
  const raw = String(rawQ || '').trim().slice(0, 60);
  if (!raw) return null;
  const cleanText = raw.replace(/[^\p{L}\p{N} @.+\-#]/gu, ' ').replace(/\s+/g, ' ').trim();
  const clauses = [];
  if (cleanText) {
    for (const col of ['name', 'phone', 'address', 'email']) {
      clauses.push(`${col}.ilike."*${cleanText}*"`);
    }
  }
  const digits = raw.replace(/\D/g, '');
  const d10 = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d10.length === 10) {
    clauses.push(`phone.ilike."*${d10.slice(0, 3)}*${d10.slice(3, 6)}*${d10.slice(6)}*"`);
  } else if (d10.length === 7) {
    clauses.push(`phone.ilike."*${d10.slice(0, 3)}*${d10.slice(3)}*"`);
  } else if (d10.length >= 4 && /^[\d\s().+-]+$/.test(raw)) {
    clauses.push(`phone.ilike."*${d10.split('').join('*')}*"`);
  }
  return clauses.length ? `or(${[...new Set(clauses)].join(',')})` : null;
}

// ---------- sessions ----------
const b64url = (s) => Buffer.from(s).toString('base64url');
const sessionKey = (env) => env.HQ_SESSION_SECRET || createHash('sha256').update(`hq-session|${env.SUPABASE_SERVICE_ROLE_KEY || ''}|${env.HQ_PASSWORD || ''}`).digest('hex');
const sign = (payload, env) => createHmac('sha256', sessionKey(env)).update(payload).digest('base64url');

export function makeSession(name, env, now = Date.now()) {
  const payload = b64url(JSON.stringify({ n: name, exp: now + SESSION_HOURS * 3600e3 }));
  return `${payload}.${sign(payload, env)}`;
}

export function readSession(token, env, now = Date.now()) {
  if (!token || !env.HQ_PASSWORD) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, env);
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

export function passwordMatches(given, env) {
  if (!env.HQ_PASSWORD || typeof given !== 'string') return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(env.HQ_PASSWORD).digest();
  return timingSafeEqual(a, b);
}

const cookies = (req) => Object.fromEntries((req.headers?.cookie || '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const setCookie = (res, value, maxAge) => res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);

// Spoof-resistant per-IP throttle on failed logins (8 per 15 minutes).
export const loginLimiter = createRateLimiter({ max: 8, windowMs: 15 * 60e3 });
export const testAlertLimiter = createRateLimiter({ max: 4, windowMs: 10 * 60e3 });

async function logTrashEvent(env, id, detail, actor) {
  try {
    await sb(env, 'lead_events', { method: 'POST', body: { lead_id: id, kind: 'note', detail, actor }, prefer: 'return=minimal' });
  } catch (e) {
    console.error('[hq] trash activity not recorded:', e.message);
  }
}

// ---------- Supabase ----------
async function sb(env, path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Supabase ${res.status}: ${txt.slice(0, 300)}`), { status: res.status });
  return txt ? JSON.parse(txt) : null;
}

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');

function applyLeadFilters(p, searchParams) {
  const status = searchParams.get('status') || '';
  const view = searchParams.get('view') || 'open';
  // Trashed leads are hidden from every view except Trash.
  const trash = view === 'trash';
  p.set('deleted_at', trash ? 'not.is.null' : 'is.null');
  if (trash) p.set('order', 'deleted_at.desc');
  else if (status && STATUSES.includes(status)) p.set('status', `eq.${status}`);
  else if (view === 'open') p.set('status', `not.in.(${CLOSED.join(',')})`);
  else if (view === 'closed') p.set('status', `in.(${CLOSED.filter((s) => s !== 'spam').join(',')})`);
  else if (view === 'spam') p.set('status', 'eq.spam');
  else if (view === 'followups') { p.set('next_followup', `lte.${new Date().toISOString()}`); p.set('status', `not.in.(${CLOSED.join(',')})`); p.set('do_not_contact', 'eq.false'); p.set('order', 'next_followup.asc'); }
  else if (view === 'new') p.set('status', 'eq.new');

  const assigned = (searchParams.get('assigned_to') || '').replace(/[^\p{L}\p{N} _.\-@]/gu, '').trim().slice(0, 60);
  if (assigned) p.set('assigned_to', `ilike.${assigned}`);

  const conditions = [];
  const brand = brandFilter(searchParams.get('brand'));
  if (brand) conditions.push(brand);
  const searchOr = buildSearchOr(searchParams.get('q'));
  if (searchOr) conditions.push(searchOr);
  if (conditions.length) p.set('and', `(${conditions.join(',')})`);
}

function toCsv(rows) {
  const cols = ['id', 'brand', 'created_at', 'name', 'phone', 'email', 'address', 'situation', 'timeline', 'status', 'assigned_to', 'channel', 'route_interest', 'ref_partner', 'utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'first_contact_at', 'appointment_at', 'next_followup', 'estimated_value', 'offer_amount', 'outcome_path', 'closed_value', 'gross_profit', 'closed_at', 'lost_reason', 'consent_response', 'consent_marketing', 'do_not_contact', 'form_type'];
  const cell = (v) => {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) {
    const withBrand = { ...r, brand: brandOf(r) };
    lines.push(cols.map((c) => cell(withBrand[c])).join(','));
  }
  return lines.join('\r\n');
}

async function stampLatestStatusActor(env, leadId, actor) {
  try {
    const recent = await sb(env, `lead_events?lead_id=eq.${leadId}&kind=eq.status_change&actor=is.null&order=id.desc&limit=1`);
    if (recent?.[0]?.id != null) {
      await sb(env, `lead_events?id=eq.${recent[0].id}`, { method: 'PATCH', body: { actor }, prefer: 'return=minimal' });
    }
  } catch {}
}

// ---------- dashboard math (pure, tested) ----------
export function computeStats(leads, now = Date.now()) {
  const day = 864e5;
  const t = (s) => (s ? Date.parse(s) : NaN);
  const real = leads.filter((l) => l.status !== 'spam');
  const since = (days) => real.filter((l) => now - t(l.created_at) < days * day).length;
  // "Today" in Kern County time, not the server's (Vercel runs in UTC).
  const local = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const startToday = new Date(now - (local - new Date(local).setHours(0, 0, 0, 0)));
  const open = real.filter((l) => !CLOSED.includes(l.status));
  const count = (list, key) => list.reduce((m, l) => ((m[l[key] || 'unknown'] = (m[l[key] || 'unknown'] || 0) + 1), m), {});
  const last30 = real.filter((l) => now - t(l.created_at) < 30 * day);
  const minutes = last30
    .filter((l) => l.first_contact_at && !['not_a_fit', 'spam'].includes(l.status))
    .map((l) => (t(l.first_contact_at) - t(l.created_at)) / 60e3)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);
  const won90 = real.filter((l) => l.status === 'closed_won' && now - t(l.closed_at || l.created_at) < 90 * day);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = now - i * 7 * day;
    return { weekEnding: new Date(end).toISOString().slice(0, 10), leads: real.filter((l) => t(l.created_at) <= end && t(l.created_at) > end - 7 * day).length };
  }).reverse();
  return {
    newToday: real.filter((l) => t(l.created_at) >= startToday.getTime()).length,
    new7: since(7),
    new30: since(30),
    uncontacted: real.filter((l) => l.status === 'new' && !l.do_not_contact && now - t(l.created_at) > 5 * 60e3).length,
    followupsDue: open.filter((l) => !l.do_not_contact && l.next_followup && t(l.next_followup) <= now).length,
    appointments7: real.filter((l) => l.appointment_at && t(l.appointment_at) >= now && t(l.appointment_at) < now + 7 * day).length,
    openPipeline: open.length,
    medianMinutesToContact: minutes.length ? Math.round(minutes[Math.floor((minutes.length - 1) / 2)]) : null,
    won90: won90.length,
    grossProfit90: won90.reduce((s, l) => s + (Number(l.gross_profit) || 0), 0),
    byStatus: count(open, 'status'),
    byChannel: count(last30, 'channel'),
    byBrand: last30.reduce((counts, lead) => { const brand = brandOf(lead); counts[brand] = (counts[brand] || 0) + 1; return counts; }, {}),
    byRoute: count(last30.filter((l) => l.route_interest), 'route_interest'),
    bySituation: count(last30.filter((l) => l.situation), 'situation'),
    weekly: weeks,
  };
}

// ---------- handler ----------
export default async function handler(req, res, env = process.env) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action') || '';
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};

  if (!env.HQ_PASSWORD || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, error: 'HQ is not configured yet. Set HQ_PASSWORD, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.' });
  }

  if (action === 'login' && req.method === 'POST') {
    const ip = clientIp(req) || 'local';
    if (loginLimiter.isLimited(ip)) return res.status(429).json({ ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
    if (!passwordMatches(body.password, env)) {
      loginLimiter.hit(ip);
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({ ok: false, error: 'That password isn’t right.' });
    }
    const name = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 40) || 'Team';
    setCookie(res, makeSession(name, env), SESSION_HOURS * 3600);
    return res.status(200).json({ ok: true, name });
  }

  if (action === 'logout') {
    setCookie(res, '', 0);
    return res.status(200).json({ ok: true });
  }

  const session = readSession(cookies(req)[COOKIE], env);
  if (!session) return res.status(401).json({ ok: false, error: 'Please sign in.' });
  // Writes must come from the HQ page's own script (plus SameSite=Strict on the cookie).
  if (req.method !== 'GET' && req.headers?.['x-hq'] !== '1') return res.status(403).json({ ok: false, error: 'Forbidden' });

  try {
    if (action === 'me') return res.status(200).json({ ok: true, name: session.n });

    if (action === 'health' && req.method === 'GET') {
      const fromRaw = (env.LEAD_FROM_EMAIL || '').trim();
      const recipients = notificationRecipients(env);
      const maskEmail = (e) => {
        const [u, d] = String(e || '').split('@');
        return u && d ? `${u.slice(0, 2)}***@${d}` : '***';
      };
      return res.status(200).json({
        ok: true,
        health: {
          crm: { ok: true, label: 'Supabase shared CRM connected' },
          email: {
            configured: Boolean(env.RESEND_API_KEY),
            fromConfigured: Boolean(fromRaw),
            sandboxSender: !fromRaw || /@resend\.dev\b/i.test(fromRaw),
            recipients: recipients.map(maskEmail),
          },
          webhook: { configured: Boolean(env.LEAD_WEBHOOK_URL) },
          sms: {
            configured: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
            staffAlerts: Boolean(env.LEAD_ALERT_SMS),
            customerAckEnabled: env.LEAD_ACK_ENABLED === 'true',
          },
          standardBridge: { configured: Boolean(env.CRM_INGEST_SECRET && env.CRM_INGEST_SECRET.length >= 32) },
        },
      });
    }

    if (action === 'test-alert' && req.method === 'POST') {
      const ip = clientIp(req) || session.n || 'hq';
      if (testAlertLimiter.hit(ip).limited) return res.status(429).json({ ok: false, error: 'Wait a few minutes before sending another test alert.' });
      const channels = [];
      const sentAt = new Date().toISOString();
      if (env.RESEND_API_KEY) {
        const recipients = notificationRecipients(env);
        const from = (env.LEAD_FROM_EMAIL || '').trim() || 'Harbison Leads <onboarding@resend.dev>';
        try {
          const r = await fetchWithRetry('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from,
              to: recipients,
              subject: `[HQ Diagnostic] Notification delivery check (${sentAt.slice(0, 16)}Z)`,
              html: `<h2 style="font-family:Georgia,serif;color:#031f2b">Harbison HQ delivery check</h2><p>Triggered by <strong>${String(session.n).replace(/[<>&]/g, '')}</strong> at ${sentAt} to confirm live email receipt without creating a fake public lead.</p>`,
            }),
          });
          const txt = await r.text();
          if (!r.ok) channels.push({ channel: 'email', ok: false, detail: `Resend ${r.status}: ${txt.slice(0, 180)}` });
          else {
            let msgId = '';
            try { msgId = JSON.parse(txt)?.id || ''; } catch {}
            channels.push({ channel: 'email', ok: true, detail: `Accepted by Resend${msgId ? ` (${msgId})` : ''} for ${recipients.length} recipient(s)` });
          }
        } catch (err) {
          channels.push({ channel: 'email', ok: false, detail: err.message || 'Resend request failed' });
        }
      } else {
        channels.push({ channel: 'email', ok: false, detail: 'RESEND_API_KEY is not set' });
      }
      if (env.LEAD_WEBHOOK_URL) {
        try {
          const r = await fetchWithRetry(env.LEAD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'hq_diagnostic', triggered_by: session.n, sent_at: sentAt }),
          });
          channels.push({ channel: 'webhook', ok: r.ok, detail: r.ok ? `Webhook HTTP ${r.status}` : `Webhook failed (${r.status})` });
        } catch (err) {
          channels.push({ channel: 'webhook', ok: false, detail: err.message || 'Webhook request failed' });
        }
      }
      const allOk = channels.some((c) => c.ok) && channels.every((c) => c.ok);
      return res.status(allOk ? 200 : 502).json({ ok: allOk, channels });
    }

    if (action === 'import' && req.method === 'POST') {
      const existingLeads = await sb(env, 'leads?select=id,name,email,phone,created_at,form_type&order=created_at.desc&limit=5000');
      const defaultBrand = body.default_brand === 'call_harbison' ? 'call_harbison' : 'harbison_standard';
      const format = ['csv', 'json', 'auto'].includes(body.format) ? body.format : 'auto';
      const { ready, duplicates, invalid } = prepareLeadImport(body.raw ?? body.rows, { format, defaultBrand, existingLeads });
      if (body.dry_run !== false) {
        return res.status(200).json({
          ok: true,
          dry_run: true,
          counts: { ready: ready.length, duplicates: duplicates.length, invalid: invalid.length },
          preview: ready.slice(0, 10).map((r) => ({ id: r.id, created_at: r.created_at, brand: brandOf(r), name: r.name, contact: r.email || r.phone, status: r.status, situation: r.situation })),
          duplicates: duplicates.slice(0, 15),
          invalid: invalid.slice(0, 15),
        });
      }
      if (!ready.length) {
        return res.status(400).json({
          ok: false,
          error: invalid.length && !duplicates.length ? invalid[0].reason : 'No new non-duplicate rows to import.',
          counts: { ready: 0, duplicates: duplicates.length, invalid: invalid.length },
          duplicates: duplicates.slice(0, 15),
          invalid: invalid.slice(0, 15),
        });
      }
      const inserted = await sb(env, 'leads?on_conflict=id', {
        method: 'POST',
        body: ready,
        prefer: 'resolution=ignore-duplicates,return=representation',
      });
      const savedRows = Array.isArray(inserted) ? inserted : [];
      if (savedRows.length) {
        const events = savedRows.map((l) => ({
          lead_id: l.id,
          kind: 'note',
          actor: session.n,
          detail: `Imported historical ${brandOf(l) === 'harbison_standard' ? 'Harbison Standard' : 'Call Harbison'} record${l.notes ? `\n\n${l.notes}` : ''}`.slice(0, 2000),
        }));
        await sb(env, 'lead_events', { method: 'POST', body: events, prefer: 'return=minimal' }).catch(() => {});
      }
      return res.status(201).json({
        ok: true,
        dry_run: false,
        imported: savedRows.length,
        counts: { ready: ready.length, duplicates: duplicates.length, invalid: invalid.length },
      });
    }

    if (action === 'analytics' && req.method === 'GET') {
      if (!env.CRM_INGEST_SECRET) return res.status(503).json({ ok: false, error: 'Website analytics connection is not configured.' });
      const days = Math.min(Math.max(Math.floor(Number(url.searchParams.get('days')) || 30), 1), 365);
      const site = url.searchParams.get('site') || 'harbison_standard';
      if (!['harbison_standard', 'call_harbison'].includes(site)) return res.status(400).json({ ok: false, error: 'Unknown website.' });
      const response = await fetch(`https://www.harbisonstandard.com/api/hq/analytics?days=${days}&site=${site}`, {
        headers: { Authorization: `Bearer ${env.CRM_INGEST_SECRET}` }, signal: AbortSignal.timeout(25000), redirect: 'error',
      });
      if (!response.ok) return res.status(502).json({ ok: false, error: 'Website analytics are temporarily unavailable.' });
      const analytics = await response.json();
      if (analytics.site !== site || !analytics.totals || !Array.isArray(analytics.daily)) throw new Error('Invalid analytics response');
      return res.status(200).json({ ok: true, site, analytics });
    }

    if (action === 'demo-leads' && req.method === 'GET') {
      const rows = await sb(env, 'leads?select=id,name,email,phone,address,form_type&order=created_at.desc&limit=5000');
      return res.status(200).json({ ok: true, candidates: rows.filter(demoLeadReason).map((lead) => ({ id: lead.id, name: lead.name, reason: demoLeadReason(lead) })) });
    }
    if (action === 'demo-leads' && req.method === 'DELETE') {
      const ids = body.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(isUuid) || new Set(ids).size !== ids.length) return res.status(400).json({ ok: false, error: 'Supply explicit, unique test-record IDs (maximum 100).' });
      const rows = [];
      for (const id of ids) {
        const [lead] = await sb(env, `leads?id=eq.${id}&select=id,name,email,phone,address,form_type,updated_at`);
        // Validate the entire selection before removing anything. Real customer records are not eligible.
        if (!lead || !demoLeadReason(lead)) return res.status(409).json({ ok: false, error: 'A selected record is missing or is not a recognized demo/test record. Nothing was deleted.' });
        rows.push(lead);
      }
      const deleted = [];
      for (const lead of rows) {
        const filter = new URLSearchParams({ id: `eq.${lead.id}` });
        if (lead.updated_at) filter.set('updated_at', `eq.${lead.updated_at}`);
        const result = await sb(env, `leads?${filter}`, { method: 'DELETE', prefer: 'return=representation' });
        if (result?.[0]?.id === lead.id) deleted.push(lead.id);
      }
      return res.status(200).json({ ok: true, deleted, skipped: ids.filter((id) => !deleted.includes(id)) });
    }

    if (action === 'stats' && req.method === 'GET') {
      const now = Date.now();
      const since = new Date(now - 365 * 864e5).toISOString();
      const fiveMinAgo = new Date(now - 5 * 60e3).toISOString();
      const rows = await sb(env, `leads?select=id,created_at,status,channel,form_type,route_interest,situation,first_contact_at,appointment_at,next_followup,gross_profit,closed_at,do_not_contact&created_at=gte.${since}&deleted_at=is.null&limit=5000&order=created_at.desc`);
      const rawWaiting = await sb(env, `leads?select=id,created_at,name,phone,email,address,situation,channel,form_type,do_not_contact&status=eq.new&do_not_contact=eq.false&deleted_at=is.null&created_at=lte.${fiveMinAgo}&order=created_at.asc&limit=8`);
      const waiting = rawWaiting.map((l) => ({ ...l, minutes_waiting: Math.round((now - Date.parse(l.created_at)) / 60e3) }));
      const upcoming = await sb(env, `leads?select=id,name,address,situation,form_type,appointment_at&appointment_at=gte.${new Date(now).toISOString()}&deleted_at=is.null&order=appointment_at.asc&limit=6`);
      return res.status(200).json({ ok: true, stats: computeStats(rows, now), waiting, upcoming });
    }

    if (action === 'partners' && req.method === 'GET') {
      const [partners, funnel] = await Promise.all([
        sb(env, 'v_partner_results?select=*&order=inquiries.desc').catch(() => []),
        sb(env, 'v_cost_per_stage?select=*&order=month.desc&limit=24').catch(() => []),
      ]);
      return res.status(200).json({ ok: true, partners, funnel });
    }

    if (action === 'partner' && req.method === 'POST') {
      const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) : '';
      const name = required(text(120))(body.name);
      const category = oneOf(PARTNER_CATEGORIES)(body.category);
      const status = body.status ? oneOf(PARTNER_STATUSES)(body.status) : 'prospect';
      if (!slug || !name || !category || !status) return res.status(400).json({ ok: false, error: 'Check slug, partner name, category, and status.' });
      const row = {
        slug, name, category, status,
        contact_name: text(120)(body.contact_name),
        contact_phone: text(40)(body.contact_phone),
        contact_email: emailField(body.contact_email) ?? null,
        notes: text(1000)(body.notes),
      };
      const [saved] = await sb(env, 'partners?on_conflict=slug', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' });
      return res.status(200).json({ ok: true, partner: saved });
    }

    if (action === 'spend' && req.method === 'POST') {
      const rawMonth = typeof body.month === 'string' ? body.month.trim() : '';
      const month = /^\d{4}-\d{2}(-\d{2})?$/.test(rawMonth) ? `${rawMonth.slice(0, 7)}-01` : null;
      const channel = typeof body.channel === 'string' ? body.channel.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) : '';
      const spend = num(body.spend);
      if (!month || !channel || spend == null || spend < 0) return res.status(400).json({ ok: false, error: 'Supply a valid YYYY-MM month, channel, and non-negative spend.' });
      const campaign = text(80)(body.campaign) || 'all';
      const [saved] = await sb(env, 'ad_spend?on_conflict=month,channel,campaign', {
        method: 'POST', body: { month, channel, campaign, spend }, prefer: 'resolution=merge-duplicates,return=representation',
      });
      return res.status(200).json({ ok: true, spend: saved });
    }

    if (action === 'leads' && req.method === 'GET') {
      const p = new URLSearchParams({ select: LIST_COLS, order: 'created_at.desc' });
      const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      p.set('limit', String(limit));
      p.set('offset', String(offset));
      applyLeadFilters(p, url.searchParams);
      const leads = await sb(env, `leads?${p}`);
      return res.status(200).json({ ok: true, leads, limit, offset });
    }

    if (action === 'export' && req.method === 'GET') {
      const p = new URLSearchParams({ select: EXPORT_COLS, order: 'created_at.desc', limit: '2000' });
      applyLeadFilters(p, url.searchParams);
      const leads = await sb(env, `leads?${p}`);
      const csv = toCsv(leads);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="harbison-leads-${dateStr}.csv"`);
      return res.end ? res.status(200).end(csv) : res.status(200).json({ ok: true, csv });
    }

    if (action === 'lead' && req.method === 'POST') {
      const { row, bad } = cleanNewLead(body);
      if (bad.length) return res.status(400).json({ ok: false, error: `Check these fields: ${bad.join(', ')}`, fields: bad });
      const [lead] = await sb(env, 'leads', { method: 'POST', body: row, prefer: 'return=representation' });
      await sb(env, 'lead_events', {
        method: 'POST', body: { lead_id: lead.id, kind: 'note', detail: 'Created manually in HQ', actor: session.n }, prefer: 'return=minimal',
      }).catch(() => {});
      return res.status(201).json({ ok: true, lead });
    }

    const id = url.searchParams.get('id');
    if (action === 'lead' && req.method === 'GET') {
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Bad id' });
      const [lead] = await sb(env, `leads?id=eq.${id}&select=*`);
      if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });
      const events = await sb(env, `lead_events?lead_id=eq.${id}&select=id,at,kind,detail,actor&order=at.desc&limit=200`);
      return res.status(200).json({ ok: true, lead, events });
    }

    if (action === 'lead' && req.method === 'PATCH') {
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Bad id' });
      const { patch, bad } = cleanPatch(body);
      if (bad.length) return res.status(400).json({ ok: false, error: `Check these fields: ${bad.join(', ')}`, fields: bad });
      if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'Nothing to save' });
      const [before] = patch.status ? await sb(env, `leads?id=eq.${id}&select=id,status,first_contact_at,closed_at`) : [];
      if (patch.status && !before) return res.status(404).json({ ok: false, error: 'Lead not found' });
      if (patch.status && before?.closed_at && !CLOSED.includes(patch.status)) patch.closed_at = null;
      let [lead] = await sb(env, `leads?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
      if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });
      if (patch.status && before && before.status !== patch.status) {
        await stampLatestStatusActor(env, id, session.n);
        // Protect median speed-to-lead even if migration 005 has not been applied yet.
        if (before.status === 'new' && ['spam', 'not_a_fit'].includes(patch.status) && !before.first_contact_at && lead.first_contact_at) {
          const [cleaned] = await sb(env, `leads?id=eq.${id}`, { method: 'PATCH', body: { first_contact_at: null }, prefer: 'return=representation' });
          if (cleaned) lead = cleaned;
        }
      }
      const changed = Object.keys(patch).filter((k) => k !== 'status' && k !== 'closed_at' && k !== 'notes');
      if (changed.length) await sb(env, 'lead_events', { method: 'POST', body: { lead_id: id, kind: 'note', detail: `Updated ${changed.map((k) => LABELS[k] || k).join(', ')}`, actor: session.n }, prefer: 'return=minimal' });
      return res.status(200).json({ ok: true, lead });
    }

    if (action === 'event' && req.method === 'POST') {
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Bad id' });
      const kind = EVENT_KINDS.includes(body.kind) ? body.kind : 'note';
      const detail = typeof body.detail === 'string' ? body.detail.trim().slice(0, 2000) : '';
      if (!detail) return res.status(400).json({ ok: false, error: 'Write something first' });
      const [ev] = await sb(env, 'lead_events', { method: 'POST', body: { lead_id: id, kind, detail, actor: session.n }, prefer: 'return=representation' });
      // Logging an outreach call/text/email automatically records first contact and clears the 'new' alarm.
      if (CONTACT_KINDS.includes(kind)) {
        const [lead] = await sb(env, `leads?id=eq.${id}&select=id,status,first_contact_at`);
        if (lead && (!lead.first_contact_at || lead.status === 'new')) {
          const leadPatch = {};
          if (!lead.first_contact_at) leadPatch.first_contact_at = new Date().toISOString();
          if (lead.status === 'new') leadPatch.status = 'contact_attempted';
          await sb(env, `leads?id=eq.${id}`, { method: 'PATCH', body: leadPatch, prefer: 'return=minimal' });
          if (leadPatch.status) await stampLatestStatusActor(env, id, session.n);
        }
      }
      return res.status(200).json({ ok: true, event: ev });
    }

    // Trash is a recoverable delete: the lead drops out of every list, count and view until restored.
    if (action === 'lead' && req.method === 'DELETE') {
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Bad id' });
      const [lead] = await sb(env, `leads?id=eq.${id}&deleted_at=is.null`, {
        method: 'PATCH', body: { deleted_at: new Date().toISOString(), deleted_by: session.n }, prefer: 'return=representation',
      });
      if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found, or it is already in Trash.' });
      await logTrashEvent(env, id, 'Moved to Trash', session.n);
      return res.status(200).json({ ok: true, lead });
    }

    if (action === 'restore' && req.method === 'POST') {
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Bad id' });
      const [lead] = await sb(env, `leads?id=eq.${id}&deleted_at=not.is.null`, {
        method: 'PATCH', body: { deleted_at: null, deleted_by: null }, prefer: 'return=representation',
      });
      if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found in Trash.' });
      await logTrashEvent(env, id, 'Restored from Trash', session.n);
      return res.status(200).json({ ok: true, lead });
    }

    // Permanent deletion (e.g. a privacy request). Only from Trash, and only with the typed confirmation.
    if (action === 'purge' && req.method === 'DELETE') {
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Bad id' });
      if (body.confirm !== PURGE_CONFIRMATION) return res.status(400).json({ ok: false, error: `Type ${PURGE_CONFIRMATION} to confirm.` });
      const [lead] = await sb(env, `leads?id=eq.${id}&select=id,deleted_at`);
      if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found' });
      if (!lead.deleted_at) return res.status(409).json({ ok: false, error: 'Move the lead to Trash first.' });
      const removed = await sb(env, `leads?id=eq.${id}&deleted_at=not.is.null`, { method: 'DELETE', prefer: 'return=representation' });
      if (!removed?.length) return res.status(409).json({ ok: false, error: 'The lead changed before it could be deleted. Nothing was removed.' });
      // The row and its activity log are gone, so keep a server-side record of who removed what.
      console.warn(`[hq] lead ${id} permanently deleted by ${session.n}`);
      return res.status(200).json({ ok: true, deleted: id });
    }

    // Empty Trash removes only the trashed leads the user was shown, so a lead trashed meanwhile is never swept up.
    if (action === 'empty-trash' && req.method === 'DELETE') {
      if (body.confirm !== PURGE_CONFIRMATION) return res.status(400).json({ ok: false, error: `Type ${PURGE_CONFIRMATION} to confirm.` });
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
      if (!ids.length || ids.length > EMPTY_TRASH_MAX || !ids.every(isUuid)) {
        return res.status(400).json({ ok: false, error: `Send between 1 and ${EMPTY_TRASH_MAX} lead ids.` });
      }
      const removed = await sb(env, `leads?id=in.(${ids.join(',')})&deleted_at=not.is.null`, { method: 'DELETE', prefer: 'return=representation' });
      const count = removed?.length || 0;
      console.warn(`[hq] ${count} trashed lead(s) permanently deleted by ${session.n}: ${(removed || []).map((l) => l.id).join(',')}`);
      return res.status(200).json({ ok: true, deleted: count });
    }

    return res.status(404).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[hq]', e.message);
    return res.status(502).json({ ok: false, error: 'The database request failed. Try again in a moment.' });
  }
}
