// Local-only stand-in for Supabase's REST API so HQ can be tried without real credentials:
//   npm run dev -- --mock      → HQ password "demo", sample leads (clearly fake), nothing leaves your machine.
// Implements just the PostgREST features api/hq.js and api/leads.js use.
const HOST = 'http://mock.supabase.local';

const day = 864e5;
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const uuid = () => crypto.randomUUID();

const seed = [
  ['Sample Seller A', '(661) 555-0101', '101 Example Ave, Bakersfield, CA 93301', 'I inherited the property', 'new', 'organic', 'direct', 0.01],
  ['Sample Seller B', '(661) 555-0102', '202 Demo St, Tehachapi, CA 93561', 'The property needs major repairs', 'new', 'google_ads', 'renovate', 0.2],
  ['Sample Seller C', '(661) 555-0103', '303 Test Rd, Bakersfield, CA 93306', 'The property is vacant', 'contact_attempted', 'direct', 'direct', 1.5],
  ['Sample Seller D', '(661) 555-0104', '404 Placeholder Ln, California City, CA 93505', 'Other', 'connected', 'partner', 'development', 3],
  ['Sample Seller E', '(661) 555-0105', '505 Mock Ct, Bakersfield, CA 93309', 'There are tenant or rental issues', 'qualified', 'organic', 'listing', 6],
  ['Sample Seller F', '(661) 555-0106', '606 Sample Way, Stallion Springs, CA 93561', 'I am relocating or facing a deadline', 'appointment_set', 'google_ads', 'direct', 9],
  ['Sample Seller G', '(661) 555-0107', '707 Fake Blvd, Bakersfield, CA 93312', 'I am considering listing', 'options_presented', 'youtube', 'listing', 14],
  ['Sample Seller H', '(661) 555-0108', '808 Trial Dr, Tehachapi, CA 93561', 'I am unsure what to do', 'nurture', 'ai_search', 'not_ready', 21],
  ['Sample Seller I', '(661) 555-0109', '909 Example Pl, Bakersfield, CA 93304', 'The property needs major repairs', 'under_contract', 'organic', 'direct', 30],
  ['Sample Seller J', '(661) 555-0110', '110 Demo Loop, Arvin, CA 93203', 'I inherited the property', 'closed_won', 'partner', 'direct', 45],
  ['Sample Seller K', '(661) 555-0111', '111 Test Ave, Bakersfield, CA 93305', 'I may want to sell directly', 'closed_lost', 'google_ads', 'direct', 52],
  ['Sample Seller L', '(661) 555-0112', '112 Mock St, Taft, CA 93268', 'The property is vacant', 'closed_won', 'organic', 'listing', 64],
];

export const db = {
  leads: seed.map(([name, phone, address, situation, status, channel, route, daysAgo], i) => ({
    id: uuid(), created_at: iso(daysAgo * day), name, phone, email: i % 3 ? null : `sample${i}@example.com`, address,
    situation, status, channel, route_interest: route, form_type: 'options', consent_response: true, consent_marketing: i % 2 === 0,
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
};

const parseVal = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
function matches(row, key, expr) {
  if (key === 'or') {
    const parts = expr.slice(1, -1).split(',');
    return parts.some((p) => {
      const [col, op, ...rest] = p.split('.');
      const pat = rest.join('.').replace(/^"|"$/g, '').replace(/\*/g, '');
      return op === 'ilike' && String(row[col] ?? '').toLowerCase().includes(pat.toLowerCase());
    });
  }
  const [op, ...rest] = expr.split('.');
  const val = rest.join('.');
  const cell = row[key];
  const cmp = (a, b) => (Date.parse(a) && Date.parse(b) ? Date.parse(a) - Date.parse(b) : a < b ? -1 : a > b ? 1 : 0);
  if (op === 'eq') return String(cell) === String(parseVal(val));
  if (op === 'gte') return cell != null && cmp(cell, val) >= 0;
  if (op === 'lte') return cell != null && cmp(cell, val) <= 0;
  if (op === 'in') return val.slice(1, -1).split(',').includes(String(cell));
  if (op === 'not' && rest[0] === 'in') return !rest.slice(1).join('.').slice(1, -1).split(',').includes(String(cell));
  return true;
}

function view(name) {
  if (name === 'v_uncontacted') {
    return db.leads.filter((l) => l.status === 'new' && Date.now() - Date.parse(l.created_at) > 5 * 60e3)
      .map((l) => ({ ...l, minutes_waiting: Math.round((Date.now() - Date.parse(l.created_at)) / 60e3) }))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }
  return db[name];
}

async function handle(url, init = {}) {
  const u = new URL(url);
  const table = u.pathname.replace('/rest/v1/', '');
  const method = (init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : null;
  const reply = (data, status = 200) => new Response(data == null ? '' : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  let rows = view(table);
  if (!rows) return reply({ message: `relation "${table}" does not exist` }, 404);

  const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'limit', 'offset'].includes(k));
  const hit = (r) => filters.every(([k, v]) => matches(r, k, v));

  if (method === 'POST') {
    const row = { id: table === 'lead_events' ? db.lead_events.length + 1 : uuid(), created_at: new Date().toISOString(), at: new Date().toISOString(), status: 'new', ...body };
    db[table].push(row);
    return reply([row], 201);
  }
  if (method === 'PATCH') {
    const out = [];
    for (const r of db[table].filter(hit)) {
      // Mirror the log_status_change + touch_updated_at triggers.
      if (table === 'leads' && body.status && body.status !== r.status) {
        db.lead_events.push({ id: db.lead_events.length + 1, lead_id: r.id, at: new Date().toISOString(), kind: 'status_change', detail: `${r.status} → ${body.status}`, actor: null });
        if (r.status === 'new' && !r.first_contact_at) r.first_contact_at = new Date().toISOString();
      }
      Object.assign(r, body, { updated_at: new Date().toISOString() });
      out.push(r);
    }
    return reply(out);
  }
  rows = rows.filter(hit);
  const order = u.searchParams.get('order');
  if (order) {
    const [col, dir] = order.split('.');
    rows = [...rows].sort((a, b) => ((Date.parse(a[col]) || 0) - (Date.parse(b[col]) || 0)) * (dir === 'desc' ? -1 : 1));
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
