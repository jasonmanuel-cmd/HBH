// HQ panel API: POST/GET/PATCH /api/hq?action=...
// Password login (HQ_PASSWORD) → signed, HttpOnly session cookie. All data access happens here with the
// Supabase service key; the browser never sees it. One function file keeps the Vercel Hobby function count low.
//
// Env: HQ_PASSWORD (required), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required),
//      HQ_SESSION_SECRET (optional — otherwise derived from the password + service key, so changing
//      the password signs everyone out).
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const STATUSES = ['new', 'contact_attempted', 'connected', 'qualified', 'appointment_set', 'property_reviewed', 'options_presented', 'nurture', 'under_contract', 'closed_won', 'closed_lost', 'not_a_fit', 'spam'];
const CLOSED = ['closed_won', 'closed_lost', 'not_a_fit', 'spam'];
export const OUTCOMES = ['direct_purchase', 'listing', 'referral_out', 'none'];
const EVENT_KINDS = ['note', 'call', 'text', 'email', 'appointment', 'offer'];
const SESSION_HOURS = 12;
const COOKIE = 'hq_session';

const LIST_COLS = 'id,created_at,name,phone,email,address,situation,status,channel,route_interest,next_followup,appointment_at,assigned_to,do_not_contact,form_type';

// ---------- field validation for edits ----------
const text = (max) => (v) => (v == null || v === '' ? null : typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const time = (v) => (v == null || v === '' ? null : Number.isNaN(Date.parse(v)) ? undefined : new Date(v).toISOString());
const oneOf = (list, nullable = false) => (v) => (nullable && (v == null || v === '') ? null : list.includes(v) ? v : undefined);
const required = (fn) => (v) => { const out = fn(v); return out === null ? undefined : out; };

export const EDITABLE = {
  status: oneOf(STATUSES),
  name: required(text(120)),
  phone: required(text(40)),
  email: text(160),
  address: required(text(200)),
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
  name: 'name', phone: 'phone', email: 'email', address: 'address', assigned_to: 'assigned to', next_followup: 'next follow-up',
  appointment_at: 'appointment', estimated_value: 'estimated value', offer_amount: 'offer amount', outcome_path: 'outcome path',
  closed_value: 'closed value', gross_profit: 'gross profit', lost_reason: 'lost reason', do_not_contact: 'do-not-contact', authority_confirmed: 'authority confirmed',
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

// Simple per-instance throttle on failed logins (8 per 15 minutes per IP).
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.reset) return false;
  return a.count >= 8;
}
function recordFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.reset) attempts.set(ip, { count: 1, reset: now + 15 * 60e3 });
  else a.count += 1;
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
  const minutes = last30.filter((l) => l.first_contact_at).map((l) => (t(l.first_contact_at) - t(l.created_at)) / 60e3).sort((a, b) => a - b);
  const won90 = real.filter((l) => l.status === 'closed_won' && now - t(l.closed_at || l.created_at) < 90 * day);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = now - i * 7 * day;
    return { weekEnding: new Date(end).toISOString().slice(0, 10), leads: real.filter((l) => t(l.created_at) <= end && t(l.created_at) > end - 7 * day).length };
  }).reverse();
  return {
    newToday: real.filter((l) => t(l.created_at) >= startToday.getTime()).length,
    new7: since(7),
    new30: since(30),
    uncontacted: real.filter((l) => l.status === 'new' && now - t(l.created_at) > 5 * 60e3).length,
    followupsDue: open.filter((l) => l.next_followup && t(l.next_followup) <= now).length,
    appointments7: real.filter((l) => l.appointment_at && t(l.appointment_at) >= now && t(l.appointment_at) < now + 7 * day).length,
    openPipeline: open.length,
    medianMinutesToContact: minutes.length ? Math.round(minutes[Math.floor((minutes.length - 1) / 2)]) : null,
    won90: won90.length,
    grossProfit90: won90.reduce((s, l) => s + (Number(l.gross_profit) || 0), 0),
    byStatus: count(open, 'status'),
    byChannel: count(last30, 'channel'),
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
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
    if (throttled(ip)) return res.status(429).json({ ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
    if (!passwordMatches(body.password, env)) {
      recordFailure(ip);
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

    if (action === 'stats' && req.method === 'GET') {
      const since = new Date(Date.now() - 365 * 864e5).toISOString();
      const rows = await sb(env, `leads?select=id,created_at,status,channel,route_interest,situation,first_contact_at,appointment_at,next_followup,gross_profit,closed_at&created_at=gte.${since}&limit=5000`);
      const waiting = await sb(env, 'v_uncontacted?select=id,created_at,name,phone,address,channel,minutes_waiting&limit=8');
      const upcoming = await sb(env, `leads?select=id,name,address,appointment_at&appointment_at=gte.${new Date().toISOString()}&order=appointment_at.asc&limit=6`);
      return res.status(200).json({ ok: true, stats: computeStats(rows), waiting, upcoming });
    }

    if (action === 'leads' && req.method === 'GET') {
      const p = new URLSearchParams({ select: LIST_COLS, order: 'created_at.desc' });
      const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      p.set('limit', String(limit));
      p.set('offset', String(offset));
      const status = url.searchParams.get('status') || '';
      const view = url.searchParams.get('view') || 'open';
      if (status && STATUSES.includes(status)) p.set('status', `eq.${status}`);
      else if (view === 'open') p.set('status', `not.in.(${CLOSED.join(',')})`);
      else if (view === 'closed') p.set('status', `in.(${CLOSED.filter((s) => s !== 'spam').join(',')})`);
      else if (view === 'followups') { p.set('next_followup', `lte.${new Date().toISOString()}`); p.set('status', `not.in.(${CLOSED.join(',')})`); p.set('order', 'next_followup.asc'); }
      else if (view === 'new') p.set('status', 'eq.new');
      const q = (url.searchParams.get('q') || '').replace(/[^\p{L}\p{N} @.+\-#]/gu, '').trim().slice(0, 60);
      if (q) p.set('or', `(${['name', 'phone', 'address', 'email'].map((c) => `${c}.ilike."*${q}*"`).join(',')})`);
      const leads = await sb(env, `leads?${p}`);
      return res.status(200).json({ ok: true, leads, limit, offset });
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
      const [lead] = await sb(env, `leads?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
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
      return res.status(200).json({ ok: true, event: ev });
    }

    return res.status(404).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[hq]', e.message);
    return res.status(502).json({ ok: false, error: 'The database request failed. Try again in a moment.' });
  }
}
