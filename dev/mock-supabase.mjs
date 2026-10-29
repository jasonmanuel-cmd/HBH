// Local-only stand-in for Supabase's REST API so HQ can be tried without real credentials:
//   npm run dev -- --mock      → HQ password "demo", sample leads (clearly fake), nothing leaves your machine.
// Implements just the PostgREST features api/hq.js, api/intake.js, and api/leads.js use.
const HOST = 'http://mock.supabase.local';

const day = 864e5;
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const uuid = () => crypto.randomUUID();

const seed = [
  ['Sample Seller A', '(661) 555-0101', '101 Example Ave, Bakersfield, CA 93301', 'I inherited the property', 'new', 'organic', 'direct', 0.01, null],
  ['Sample Seller B', '(661) 555-0102', '202 Demo St, Tehachapi, CA 93561', 'The property needs major repairs', 'new', 'google_ads', 'renovate', 0.2, null],
  ['Sample Seller C', '(661) 555-0103', '303 Test Rd, Bakersfield, CA 93306', 'The property is vacant', 'contact_attempted', 'direct', 'direct', 1.5, null],
  ['Sample Seller D', '(661) 555-0104', '404 Placeholder Ln, California City, CA 93505', 'Other', 'connected', 'partner', 'development', 3, 'rosewood'],
  ['Sample Seller E', '(661) 555-0105', '505 Mock Ct, Bakersfield, CA 93309', 'There are tenant or rental issues', 'qualified', 'organic', 'listing', 6, null],
  ['Sample Seller F', '(661) 555-0106', '606 Sample Way, Stallion Springs, CA 93561', 'I am relocating or facing a deadline', 'appointment_set', 'google_ads', 'direct', 9, null],
  ['Sample Seller G', '(661) 555-0107', '707 Fake Blvd, Bakersfield, CA 93312', 'I am considering listing', 'options_presented', 'youtube', 'listing', 14, null],
  ['Sample Seller H', '(661) 555-0108', '808 Trial Dr, Tehachapi, CA 93561', 'I am unsure what to do', 'nurture', 'ai_search', 'not_ready', 21, null],
  ['Sample Seller I', '(661) 555-0109', '909 Example Pl, Bakersfield, CA 93304', 'The property needs major repairs', 'under_contract', 'organic', 'direct', 30, null],
  ['Sample Seller J', '(661) 555-0110', '110 Demo Loop, Arvin, CA 93203', 'I inherited the property', 'closed_won', 'partner', 'direct', 45, 'kernfiduciary'],
  ['Sample Seller K', '(661) 555-0111', '111 Test Ave, Bakersfield, CA 93305', 'I may want to sell directly', 'closed_lost', 'google_ads', 'direct', 52, null],
  ['Sample Seller L', '(661) 555-0112', '112 Mock St, Taft, CA 93268', 'The property is vacant', 'closed_won', 'organic', 'listing', 64, null],
];

const currentMonth = `${new Date(now).toISOString().slice(0, 7)}-01`;

export const db = {
  leads: seed.map(([name, phone, address, situation, status, channel, route, daysAgo, refPartner], i) => ({
    id: uuid(), created_at: iso(daysAgo * day), name, phone, email: i % 3 ? null : `sample${i}@example.com`, address,
    situation, status, channel, route_interest: route, ref_partner: refPartner, form_type: 'options', consent_response: true, consent_marketing: i % 2 === 0,
    timeline: ['As soon as possible', 'Within 30 days', 'Within 1–3 months'][i % 3], occupancy: ['Vacant', 'Owner occupied', 'Tenant occupied'][i % 3],
    condition_flags: i % 2 ? ['Major repairs needed'] : ['Cosmetic updates needed'], desired_outcome: 'Compare my options',
    first_contact_at: status === 'new' ? null : iso(daysAgo * day - (8 + i * 3) * 60e3),
    next_followup: ['contact_attempted', 'connected', 'nurture'].includes(status) ? iso(-(i % 2 ? -1 : 1) * day * 0.5) : null,
    appointment_at: status === 'appointment_set' ? iso(-2 * day) : null,
    offer_amount: ['options_presented', 'under_contract', 'closed_won'].includes(status) ? 180000 + i * 5000 : null,
    gross_profit: status === 'closed_won' ? 18000 + i * 1000 : null, closed_at: status.startsWith('closed') ? iso((daysAgo - 20) * day) : null,
    outcome_path: status === 'closed_won' ? (route === 'listing' ? 'listing' : 'direct_purchase') : null,
    assigned_to: 'nathanael', do_not_contact: false, authority_confirmed: false, notes: null, updated_at: iso(daysAgo * day),
  })),
  lead_events: [],
  partners: [
    { slug: 'aroundtheclock', name: 'Around the Clock (senior placement)', category: 'placement', status: 'active', contact_name: null, contact_phone: null, contact_email: null, notes: null, created_at: iso(60 * day) },
    { slug: 'rosewood', name: 'Rosewood', category: 'senior_community', status: 'active', contact_name: null, contact_phone: null, contact_email: null, notes: null, created_at: iso(60 * day) },
    { slug: 'besp', name: 'Bakersfield Estate Sale Professionals', category: 'estate_sale', status: 'contacted', contact_name: null, contact_phone: null, contact_email: null, notes: null, created_at: iso(60 * day) },
    { slug: 'kernfiduciary', name: 'Kern Fiduciary Services', category: 'fiduciary', status: 'active', contact_name: null, contact_phone: null, contact_email: null, notes: null, created_at: iso(60 * day) },
    { slug: 'botti', name: 'Botti Law Group', category: 'elder_law', status: 'prospect', contact_name: null, contact_phone: null, contact_email: null, notes: null, created_at: iso(60 * day) },
    { slug: 'cem', name: 'Complete Estate Management', category: 'estate_sale', status: 'prospect', contact_name: null, contact_phone: null, contact_email: null, notes: null, created_at: iso(60 * day) },
  ],
  ad_spend: [
    { month: currentMonth, channel: 'google_ads', campaign: 'all', spend: 1200 },
  ],
};

const parseVal = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
const ilikeMatch = (cell, rawPat) => {
  const unquoted = rawPat.replace(/^"|"$/g, '');
  const escaped = unquoted.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'is').test(String(cell ?? ''));
};

function splitConditions(value) {
  let depth = 0;
  let inQuotes = false;
  let start = 0;
  const parts = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  return [...parts, value.slice(start)];
}

function matches(row, key, expr) {
  if (key === 'and' || key === 'or') {
    const results = splitConditions(expr.slice(1, -1)).map((condition) => {
      if (condition.startsWith('or(')) return matches(row, 'or', condition.slice(2));
      if (condition.startsWith('and(')) return matches(row, 'and', condition.slice(3));
      const dot = condition.indexOf('.');
      return matches(row, condition.slice(0, dot), condition.slice(dot + 1));
    });
    return key === 'and' ? results.every(Boolean) : results.some(Boolean);
  }
  const [op, ...rest] = expr.split('.');
  const val = rest.join('.');
  const cell = row[key];
  const cmp = (a, b) => (Date.parse(a) && Date.parse(b) ? Date.parse(a) - Date.parse(b) : a < b ? -1 : a > b ? 1 : 0);
  if (op === 'eq') return String(cell) === String(parseVal(val));
  if (op === 'neq') return cell != null && String(cell) !== String(parseVal(val));
  if (op === 'is' && val === 'null') return cell == null;
  if (op === 'ilike') return ilikeMatch(cell, val);
  if (op === 'gte') return cell != null && cmp(cell, val) >= 0;
  if (op === 'lte') return cell != null && cmp(cell, val) <= 0;
  if (op === 'in') return val.slice(1, -1).split(',').includes(String(cell));
  if (op === 'not' && rest[0] === 'is' && rest[1] === 'null') return cell != null;
  if (op === 'not' && rest[0] === 'in') return !rest.slice(1).join('.').slice(1, -1).split(',').includes(String(cell));
  return true;
}

function computeFunnel() {
  const groups = new Map();
  for (const l of db.leads) {
    if (l.status === 'spam') continue;
    const month = `${String(l.created_at).slice(0, 7)}-01`;
    const channel = l.channel || 'unknown';
    const key = `${month}|${channel}`;
    if (!groups.has(key)) groups.set(key, { month, channel, leads: 0, qualified: 0, appointments: 0, offers: 0, under_contract: 0, closed: 0, purchases: 0, listings: 0, gross_profit: 0 });
    const g = groups.get(key);
    g.leads++;
    if (['qualified', 'appointment_set', 'property_reviewed', 'options_presented', 'under_contract', 'closed_won'].includes(l.status)) g.qualified++;
    if (l.appointment_at) g.appointments++;
    if (l.offer_amount != null) g.offers++;
    if (l.status === 'under_contract') g.under_contract++;
    if (l.status === 'closed_won') {
      g.closed++;
      if (l.outcome_path === 'direct_purchase') g.purchases++;
      if (l.outcome_path === 'listing') g.listings++;
      g.gross_profit += Number(l.gross_profit) || 0;
    }
  }
  return [...groups.values()];
}

function view(name) {
  if (name === 'v_uncontacted') {
    return db.leads.filter((l) => l.status === 'new' && !l.do_not_contact && Date.now() - Date.parse(l.created_at) > 5 * 60e3)
      .map((l) => ({ ...l, minutes_waiting: Math.round((Date.now() - Date.parse(l.created_at)) / 60e3) }))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }
  if (name === 'v_partner_results') {
    return db.partners.map((p) => {
      const pLeads = db.leads.filter((l) => l.ref_partner === p.slug && l.status !== 'spam');
      return {
        slug: p.slug, name: p.name, category: p.category, status: p.status,
        inquiries: pLeads.length,
        appointments: pLeads.filter((l) => l.appointment_at != null).length,
        closed: pLeads.filter((l) => l.status === 'closed_won').length,
        gross_profit: pLeads.filter((l) => l.status === 'closed_won').reduce((s, l) => s + (Number(l.gross_profit) || 0), 0),
      };
    });
  }
  if (name === 'v_funnel') return computeFunnel();
  if (name === 'v_cost_per_stage') {
    const spendMap = new Map();
    for (const s of db.ad_spend) {
      const k = `${s.month}|${s.channel}`;
      spendMap.set(k, (spendMap.get(k) || 0) + (Number(s.spend) || 0));
    }
    const r2 = (n, d) => (n != null && d ? Math.round((n / d) * 100) / 100 : null);
    return computeFunnel().map((f) => {
      const spend = spendMap.get(`${f.month}|${f.channel}`) ?? null;
      return {
        ...f, spend,
        cost_per_lead: r2(spend, f.leads),
        cost_per_qualified: r2(spend, f.qualified),
        cost_per_appointment: r2(spend, f.appointments),
        cost_per_acquisition: r2(spend, f.closed),
        roas: r2(f.gross_profit, spend),
      };
    });
  }
  return db[name];
}

async function handle(url, init = {}) {
  const u = new URL(url);
  const table = u.pathname.replace('/rest/v1/', '');
  const method = (init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : null;
  const prefer = String(init.headers?.Prefer || init.headers?.prefer || '');
  const reply = (data, status = 200) => new Response(data == null ? '' : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  let rows = view(table);
  if (!rows) return reply({ message: `relation "${table}" does not exist` }, 404);

  const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k));
  const hit = (r) => filters.every(([k, v]) => matches(r, k, v));

  if (method === 'POST') {
    const merge = prefer.includes('resolution=merge-duplicates');
    if (table === 'partners' && body.slug) {
      const existing = db.partners.find((p) => p.slug === body.slug);
      if (existing) {
        if (!merge) return reply({ message: 'duplicate key' }, 409);
        Object.assign(existing, body);
        return reply([existing], 200);
      }
      const row = { status: 'prospect', created_at: new Date().toISOString(), ...body };
      db.partners.push(row);
      return reply([row], 201);
    }
    if (table === 'ad_spend') {
      const existing = db.ad_spend.find((s) => s.month === body.month && s.channel === body.channel && s.campaign === (body.campaign || 'all'));
      if (existing) {
        if (!merge) return reply({ message: 'duplicate key' }, 409);
        Object.assign(existing, body);
        return reply([existing], 200);
      }
      const row = { campaign: 'all', ...body };
      db.ad_spend.push(row);
      return reply([row], 201);
    }
    const ignore = prefer.includes('resolution=ignore-duplicates');
    const items = Array.isArray(body) ? body : [body];
    const inserted = [];
    for (const item of items) {
      const existing = item.id ? db[table].find((row) => row.id === item.id) : null;
      if (existing) {
        if (ignore) continue;
        if (merge) { Object.assign(existing, item); inserted.push(existing); continue; }
        return reply({ message: 'duplicate key' }, 409);
      }
      const row = {
        id: table === 'lead_events' ? db.lead_events.length + 1 : uuid(),
        created_at: new Date().toISOString(),
        at: new Date().toISOString(),
        ...(table === 'leads' ? { status: 'new', do_not_contact: false, authority_confirmed: false } : {}),
        ...item,
      };
      db[table].push(row);
      inserted.push(row);
    }
    return reply(inserted, 201);
  }
  if (method === 'PATCH') {
    const out = [];
    for (const r of db[table].filter(hit)) {
      // Mirror the log_status_change + touch_updated_at triggers.
      if (table === 'leads' && body.status && body.status !== r.status) {
        db.lead_events.push({ id: db.lead_events.length + 1, lead_id: r.id, at: new Date().toISOString(), kind: 'status_change', detail: `${r.status} → ${body.status}`, actor: null });
        if (r.status === 'new' && !['spam', 'not_a_fit'].includes(body.status) && !r.first_contact_at) r.first_contact_at = new Date().toISOString();
      }
      Object.assign(r, body, table === 'leads' ? { updated_at: new Date().toISOString() } : {});
      out.push(r);
    }
    return reply(out);
  }
  if (method === 'DELETE') {
    const out = db[table].filter(hit);
    db[table] = db[table].filter((row) => !hit(row));
    return reply(out);
  }
  rows = rows.filter(hit);
  const order = u.searchParams.get('order');
  if (order) {
    const [col, dir] = order.split('.');
    const sign = dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
      const ad = Date.parse(av);
      const bd = Date.parse(bv);
      if (!Number.isNaN(ad) && !Number.isNaN(bd)) return (ad - bd) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }
  const offset = Number(u.searchParams.get('offset')) || 0;
  const limit = Number(u.searchParams.get('limit')) || rows.length;
  return reply(rows.slice(offset, offset + limit));
}

export function installMockSupabase(env = process.env) {
  env.SUPABASE_URL = HOST;
  env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';
  env.HQ_PASSWORD = env.HQ_PASSWORD || 'demo';
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).startsWith(HOST) ? handle(String(url), init) : real(url, init));
}
