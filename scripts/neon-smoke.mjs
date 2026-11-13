// Smoke test against the real Neon database named in .env.local (run: node scripts/neon-smoke.mjs).
// Inserts, reads, patches and deletes only its own rows, and prints no secrets.
import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const { useNeon, NEON_HOST } = await import('../lib/neon.js');
const env = process.env;
check('DATABASE_URL present (value hidden)', Boolean(env.DATABASE_URL));
check('useNeon switches the handlers to Neon', useNeon(env) === true && env.SUPABASE_URL === NEON_HOST);
const rest = async (path, init = {}) => {
  const res = await fetch(`${NEON_HOST}/rest/v1/${path}`, { ...init, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};
const id = crypto.randomUUID();
const tag = `E2E TEST ${id.slice(0, 8)}`;

// 1. adapter against real Neon: insert, read, filter, patch, delete
const ins = await rest('leads', { method: 'POST', headers: { Prefer: 'return=representation' }, body: { id, name: tag, phone: '6615550100', address: '1 Test St, Bakersfield, CA 93301', offer_amount: 1234.5 } });
check('insert returns the row (201)', ins.status === 201 && ins.data?.[0]?.id === id, `status ${ins.status}`);
check('numeric comes back as a JSON number', typeof ins.data?.[0]?.offer_amount === 'number');
const sel = await rest(`leads?id=eq.${id}&select=id,name&deleted_at=is.null`);
check('filtered select finds it', sel.data?.length === 1 && sel.data[0].name === tag);
const pat = await rest(`leads?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { status: 'connected' } });
check('patch updates status and the trigger logs it', pat.data?.[0]?.status === 'connected');
const ev = await rest(`lead_events?lead_id=eq.${id}&kind=eq.status_change&select=detail`);
check('status-change event written by trigger', ev.data?.length === 1, JSON.stringify(ev.data?.[0]?.detail));
const part = await rest('v_partner_results?select=slug&order=inquiries.desc&limit=3');
check('dashboard view readable', part.status === 200 && part.data.length > 0);
const rpc = await rest('rpc/lead_command_status', { method: 'POST', body: { request_id: crypto.randomUUID(), owner_hash: 'a'.repeat(64), fence: false } });
check('rpc function callable', rpc.status === 200 && rpc.data?.state === 'unresolved');

// 2. the real public handler: a family-form lead stored in Neon
const { default: leads } = await import('../api/leads.js');
const res = { statusCode: 200, headers: {}, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
const sub = crypto.randomUUID();
await leads({ method: 'POST', headers: { 'content-type': 'application/json' }, socket: { remoteAddress: '203.0.113.77' }, body: {
  form_type: 'family_transition', address: '12 Example Ave, Bakersfield, CA 93301', name: `${tag} Family`, phone: '(661) 555-0148',
  email: 'e2e@example.com', relationship: 'I own the property', contact_pref: 'call', consent_response: 'yes', submission_id: sub, language: 'en' } }, res, env);
check('POST /api/leads family form returns 200 ok', res.statusCode === 200 && res.body?.ok === true, `status ${res.statusCode}`);
const stored = await rest(`leads?id=eq.${sub}&select=form_type,relationship,consent_response`);
check('lead is stored in Neon with the right fields', stored.data?.[0]?.form_type === 'family_transition' && stored.data[0].relationship === 'I own the property' && stored.data[0].consent_response === true);

// 3. clean up only the rows this script created
const del1 = await rest(`leads?id=in.(${id},${sub})`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
check('test rows removed', del1.data?.length === 2, `${del1.data?.length} deleted`);
const left = await rest(`leads?name=like.${encodeURIComponent('E2E TEST*')}&select=id`);
check('no test rows left behind', left.data?.length === 0);

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
