import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import intake from '../api/intake.js';
import hq, { makeSession, computeStats } from '../api/hq.js';
import { parseLead, deliver } from '../api/leads.js';
import { authorized, normalizeStandard } from '../lib/shared-intake.js';
import { installMockSupabase } from '../dev/mock-supabase.mjs';

const env = { CRM_INGEST_SECRET: 'test-secret-with-at-least-32-characters', HQ_PASSWORD: 'test-only-password' };
const envelope = () => ({ version: 1, brand: 'harbison_standard', submission_id: randomUUID(), lead: {
  name: 'Shared Test Buyer', email: 'buyer@example.test', phone: '6615550100', goal: 'Buying',
  desired_area: 'Tehachapi', budget: '$450,000', bedrooms: '3', timeline: 'Within 3 months',
  financing_status: 'Preapproved', message: '<script>literal submitted message</script>',
  source: 'https://www.harbisonstandard.com/areas/tehachapi', utm_source: 'instagram', utm_medium: 'social',
} });
function call(fn, req, config = env) {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  return fn({ headers: {}, ...req }, res, config).then(() => res);
}

test('private intake rejects missing, wrong and unconfigured credentials before database access', async () => {
  assert.equal(authorized('Bearer wrong', env.CRM_INGEST_SECRET), false);
  assert.equal(authorized(`Bearer ${env.CRM_INGEST_SECRET}`, env.CRM_INGEST_SECRET), true);
  assert.equal((await call(intake, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(intake, { method: 'POST' }, {})).statusCode, 503);
  assert.equal((await call(intake, { method: 'POST' })).statusCode, 401);
  assert.equal((await call(intake, { method: 'POST', headers: { authorization: 'Bearer wrong' } })).statusCode, 401);
});

test('normalization preserves buyer fields without inventing a property or consent', () => {
  const row = normalizeStandard(envelope());
  assert.equal(row.address, '');
  assert.equal(row.consent_response, false);
  assert.equal(row.consent_marketing, false);
  assert.equal(row.assigned_to, 'nathanael');
  assert.equal(row.channel, 'social');
  assert.match(row.notes, /Preferred area: Tehachapi/);
  assert.match(row.notes, /Budget: \$450,000/);
  assert.match(row.notes, /literal submitted message/);
  assert.throws(() => normalizeStandard({ ...envelope(), brand: 'unknown' }));
  assert.throws(() => normalizeStandard({ ...envelope(), submission_id: 'invalid' }));
  assert.equal(parseLead({ address: '123 Example St', name: 'Public Seller', phone: '6615550101', form_type: 'harbison_standard' }).lead.form_type, 'standard');
});

test('both website inquiries appear in one HQ; filters, retries, details and stats use the same database', async () => {
  const realFetch = globalThis.fetch;
  installMockSupabase(env);
  try {
    const body = envelope();
    const request = { method: 'POST', headers: { authorization: `Bearer ${env.CRM_INGEST_SECRET}` }, body };
    const stored = await call(intake, request);
    assert.equal(stored.statusCode, 201);
    assert.equal(stored.body.id, body.submission_id);
    const repeated = await call(intake, request);
    assert.equal(repeated.statusCode, 200);
    assert.equal(repeated.body.duplicate, true);

    const seller = parseLead({ address: '456 Example St', name: 'Shared Test Seller', phone: '6615550101', form_type: 'options', consent_response: true }).lead;
    assert.equal((await deliver(seller, env)).ok, true);
    const headers = { cookie: `hq_session=${makeSession('Test Admin', env)}`, 'x-hq': '1' };
    const read = (query) => call(hq, { method: 'GET', url: `/api/hq?${query}`, headers });
    const all = await read('action=leads&view=all&q=Shared%20Test');
    assert.equal(all.statusCode, 200);
    assert.equal(all.body.leads.length, 2);
    const buyers = await read('action=leads&view=all&brand=harbison_standard&q=Shared%20Test');
    assert.equal(buyers.body.leads.length, 1);
    const sellers = await read('action=leads&view=all&brand=call_harbison&q=Shared%20Test');
    assert.equal(sellers.body.leads.length, 1);
    assert.equal(sellers.body.leads[0].name, 'Shared Test Seller');
    const detail = await read(`action=lead&id=${body.submission_id}`);
    assert.match(detail.body.lead.notes, /Financing status: Preapproved/);
    assert.equal(detail.body.events.filter((event) => event.actor === 'Harbison Standard intake').length, 1);
    const stats = computeStats(all.body.leads);
    assert.deepEqual(stats.byBrand, { harbison_standard: 1, call_harbison: 1 });
  } finally { globalThis.fetch = realFetch; }
});

test('database failures are not reported as saved inquiries', async () => {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  console.error = () => {};
  try {
    const response = await call(intake, { method: 'POST', headers: { authorization: `Bearer ${env.CRM_INGEST_SECRET}` }, body: envelope() }, { ...env, SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test' });
    assert.equal(response.statusCode, 502);
    assert.equal(response.body.stored, false);
    assert.equal(JSON.stringify(response.body).includes('test-secret'), false);
  } finally { globalThis.fetch = realFetch; console.error = realError; }
});
