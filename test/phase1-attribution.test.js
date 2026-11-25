import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/lead-attribution.js';
import { makeDetailsToken } from '../api/leads.js';
import { createTestDatabase } from '../dev/test-database.mjs';
import { createRestHandler } from '../lib/neon-rest.js';

const leadId = '11111111-1111-4111-8111-111111111111';
const env = {
  HQ_SESSION_SECRET: 'phase-one-test-secret',
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'phase-one-test-key',
};
const token = makeDetailsToken({ id: leadId, phone: '6615550101', address: '123 Main St, Bakersfield, CA 93301' }, env);

function response() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('optional source requires a signed lead and confirms the database write', async () => {
  const oldFetch = globalThis.fetch;
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, json: async () => [{ id: leadId }] };
  };
  try {
    const invalid = response();
    await handler({ method: 'POST', body: { details_token: 'invalid', self_reported_source: 'Referral' } }, invalid);
    assert.equal(invalid.code, 400);
    assert.equal(calls.length, 0);

    const saved = response();
    await handler({ method: 'POST', body: { details_token: token, self_reported_source: 'Google Maps' } }, saved);
    assert.equal(saved.code, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /is_test=eq\.false/);
    assert.deepEqual(JSON.parse(calls[0].init.body), { self_reported_source: 'Google Maps' });

    globalThis.fetch = async () => ({ ok: true, json: async () => [] });
    const unconfirmed = response();
    await handler({ method: 'POST', body: { details_token: token, self_reported_source: 'Referral' } }, unconfirmed);
    assert.equal(unconfirmed.code, 503);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('SQL adapter stores an optional source only on the signed, non-test lead', async () => {
  const db = await createTestDatabase();
  const oldFetch = globalThis.fetch;
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const testId = '22222222-2222-4222-8222-222222222222';
  try {
    await db.query(`insert into public.leads(id,address,name,phone,is_test) values
      ($1,'123 Main St, Bakersfield, CA 93301','Seller','6615550101',false),
      ($2,'123 Main St, Bakersfield, CA 93301','Canary','6615550101',true)`, [leadId, testId]);
    globalThis.fetch = createRestHandler((sql, params) => db.query(sql, params));
    const saved = response();
    await handler({ method: 'POST', body: { details_token: token, self_reported_source: 'Referral' } }, saved);
    assert.equal(saved.code, 200);
    const { rows } = await db.query('select id, self_reported_source from public.leads order by id');
    assert.equal(rows.find((row) => row.id === leadId).self_reported_source, 'Referral');
    assert.equal(rows.find((row) => row.id === testId).self_reported_source, null);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await db.close();
  }
});
