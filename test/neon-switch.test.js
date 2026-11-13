import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../dev/test-database.mjs';
import { createRestHandler } from '../lib/neon-rest.js';
import { NEON_HOST, useNeon } from '../lib/neon.js';
import handler from '../api/leads.js';

const mockRes = () => {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
};

test('useNeon does nothing without DATABASE_URL', () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'keep' };
  assert.equal(useNeon(env), false);
  assert.deepEqual(env, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'keep' });
});

test('with DATABASE_URL set, env points at the in-process REST host and keeps a derived secret', () => {
  const env = { DATABASE_URL: 'postgres://user:pass@ep-test.us-west-2.aws.neon.tech/neondb?sslmode=require' };
  const realFetch = globalThis.fetch;
  try {
    assert.equal(useNeon(env), true);
    assert.equal(env.SUPABASE_URL, NEON_HOST);
    assert.match(env.SUPABASE_SERVICE_ROLE_KEY, /^[0-9a-f]{64}$/);
  } finally { globalThis.fetch = realFetch; delete globalThis[Symbol.for('callharbison.neon')]; }
});

test('a family-form lead submitted to /api/leads is stored in Postgres through the adapter', async () => {
  const db = await createTestDatabase();
  const handle = createRestHandler((text, params) => db.query(text, params));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).startsWith(`${NEON_HOST}/rest/v1/`) ? handle(String(url), init) : Promise.reject(new Error('blocked')));
  const env = { SUPABASE_URL: NEON_HOST, SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(64), HQ_PASSWORD: 'test-only' };
  const submission = crypto.randomUUID();
  try {
    const res = mockRes();
    await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, socket: { remoteAddress: '203.0.113.9' },
      body: { form_type: 'family_transition', address: '12 Example Ave, Bakersfield, CA 93301', name: 'Pat Example', phone: '(661) 555-0147', email: 'pat@example.com',
        relationship: 'I own the property', contact_pref: 'call', consent_response: 'yes', submission_id: submission, language: 'en' } }, res, env);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    const { rows } = await db.query('select name, form_type, relationship from leads where id = $1', [submission]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].form_type, 'family_transition');
    assert.equal(rows[0].relationship, 'I own the property');
  } finally { globalThis.fetch = realFetch; }
});
