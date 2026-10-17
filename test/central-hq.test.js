import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { makeSession } from '../api/hq.js';
import { demoLeadReason } from '../lib/demo-leads.js';
import { db, installMockSupabase } from '../dev/mock-supabase.mjs';

const env = { HQ_PASSWORD: 'test password', SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test key', CRM_INGEST_SECRET: 'test-shared-secret-longer-than-32-characters' };
const headers = () => ({ cookie: `hq_session=${makeSession('Test Admin', env)}`, 'x-hq': '1' });
async function call(req) {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  await handler({ headers: {}, ...req }, res, env);
  return res;
}

test('test-record recognition requires independent fake markers and protects ordinary contacts', () => {
  assert.ok(demoLeadReason({ name: 'CIPHER QA Regression', email: 'cipher-qa-test@chaoticallyorganizedai.invalid', phone: '6615550199' }));
  assert.ok(demoLeadReason({ name: 'Sample Seller A', phone: '(661) 555-0101', address: '101 Example Ave' }));
  for (const lead of [
    { name: 'Real Buyer', email: 'buyer@example.com', phone: '6615550199' },
    { name: 'CIPHER QA Customer', email: 'person@business.com', phone: '6614727499' },
    { name: 'Sample Seller A', phone: '6614727499', address: '101 Example Ave' },
    { name: 'Jane Testa', email: 'jane@example.invalid', phone: '6615550199' },
  ]) assert.equal(demoLeadReason(lead), null);
});

test('website analytics requires HQ login, stays server-side, clamps the range, and fails visibly', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('Unauthenticated requests must not fetch anything'); };
    assert.equal((await call({ method: 'GET', url: '/api/hq?action=analytics' })).statusCode, 401);
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://www.harbisonstandard.com/api/hq/analytics?days=365');
      assert.equal(init.headers.Authorization, `Bearer ${env.CRM_INGEST_SECRET}`);
      assert.equal(init.redirect, 'error');
      return Response.json({ totals: { sessions: 12, pageViews: 23 }, daily: [] });
    };
    const stats = await call({ method: 'GET', url: '/api/hq?action=analytics&days=9999', headers: headers() });
    assert.equal(stats.statusCode, 200);
    assert.equal(stats.body.analytics.totals.sessions, 12);
    assert.equal(stats.headers['Cache-Control'], 'no-store');
    assert.equal(JSON.stringify(stats.body).includes(env.CRM_INGEST_SECRET), false);
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    const failed = await call({ method: 'GET', url: '/api/hq?action=analytics', headers: headers() });
    assert.equal(failed.statusCode, 502);
    assert.equal(failed.body.analytics, undefined);
  } finally { globalThis.fetch = original; }
});

test('demo cleanup is authenticated, checks the whole selection, and deletes only explicit fake IDs', async () => {
  const original = globalThis.fetch;
  installMockSupabase(env);
  const real = { id: '00000000-0000-4000-8000-000000000099', name: 'Actual Customer', email: 'actual@example.com', phone: '6614727499', address: '1 Real Avenue', updated_at: new Date().toISOString() };
  db.leads.push(real);
  try {
    const fakeId = db.leads.find((lead) => demoLeadReason(lead)).id;
    const before = db.leads.length;
    assert.equal((await call({ method: 'DELETE', url: '/api/hq?action=demo-leads', body: { ids: [fakeId] } })).statusCode, 401);
    assert.equal((await call({ method: 'DELETE', url: '/api/hq?action=demo-leads', headers: { cookie: headers().cookie }, body: { ids: [fakeId] } })).statusCode, 403);
    const mixed = await call({ method: 'DELETE', url: '/api/hq?action=demo-leads', headers: headers(), body: { ids: [fakeId, real.id] } });
    assert.equal(mixed.statusCode, 409);
    assert.equal(db.leads.length, before);
    const removed = await call({ method: 'DELETE', url: '/api/hq?action=demo-leads', headers: headers(), body: { ids: [fakeId] } });
    assert.deepEqual(removed.body.deleted, [fakeId]);
    assert.equal(db.leads.length, before - 1);
    assert.ok(db.leads.find((lead) => lead.id === real.id));
  } finally { globalThis.fetch = original; }
});
