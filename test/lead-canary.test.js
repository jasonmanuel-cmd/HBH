import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { runCanary } from '../api/lead-canary.js';
import hq, { makeSession } from '../api/hq.js';
import { db, installMockSupabase } from '../dev/mock-supabase.mjs';
import { createTestDatabase } from '../dev/test-database.mjs';

const env = () => ({
  SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
  RESEND_API_KEY: 'synthetic', LEAD_NOTIFY_EMAIL: 'owner@example.test',
  LEAD_WEBHOOK_URL: 'https://crm.example.test/intake',
  TWILIO_ACCOUNT_SID: 'synthetic', TWILIO_AUTH_TOKEN: 'synthetic', TWILIO_FROM: '+16615550101',
  ENABLE_AUTO_SMS: 'true', LEAD_ACK_ENABLED: 'true',
  CANARY_FAILURE_WEBHOOK_URL: 'https://monitor.example.test/failure', CRON_SECRET: 'synthetic-secret',
  LEAD_CANARY_ENABLED: 'true',
  HQ_PASSWORD: 'synthetic-admin-password',
});

function response() {
  return { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('canary stores a flagged row, confirms readback, alerts the owner, and skips customer channels', async () => {
  const config = env();
  const original = globalThis.fetch;
  installMockSupabase(config);
  const dbFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('api.resend.com')) { calls.push('owner'); return Response.json({ id: 'synthetic-receipt' }); }
    if (String(url).includes('crm.example.test') || String(url).includes('api.twilio.com')) calls.push('forbidden');
    return dbFetch(url, options);
  };
  try {
    const outcome = await runCanary(config);
    assert.equal(outcome.stored, true);
    assert.equal(outcome.ownerAlertAccepted, true);
    assert.deepEqual(calls, ['owner']);
    assert.equal(db.leads.find(row => row.id === outcome.id)?.is_test, true);
    const listed = response();
    await hq({ method: 'GET', url: '/api/hq?action=leads&view=all', headers: { cookie: `hq_session=${makeSession('Admin', config)}` } }, listed, config);
    assert.equal(listed.statusCode, 200);
    assert.ok(!listed.body.leads.some(row => row.id === outcome.id));
  } finally { globalThis.fetch = original; }
});

test('canary rejects unauthorized calls and alerts the independent monitor on storage failure', async () => {
  const config = env();
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('monitor.example.test')) return Response.json({ ok: true });
    return new Response('storage unavailable', { status: 503 });
  };
  const originalError = console.error; console.error = () => {};
  try {
    const denied = response();
    await handler({ method: 'GET', headers: {} }, denied, config);
    assert.equal(denied.statusCode, 401);
    assert.equal(calls.length, 0);
    const failed = response();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${config.CRON_SECRET}` } }, failed, config);
    assert.equal(failed.statusCode, 503);
    const alarm = calls.find(call => call.url.includes('monitor.example.test'));
    assert.equal(alarm.options.headers['Content-Type'], 'text/plain; charset=utf-8');
    assert.match(alarm.options.body, /lead check failed/);
    assert.ok(!calls.some(call => call.url.includes('api.resend.com')));
  } finally { globalThis.fetch = original; console.error = originalError; }
});

test('missing test marker schema blocks insertion, and SQL reports exclude flagged rows', async () => {
  const config = env();
  const original = globalThis.fetch;
  installMockSupabase(config);
  const count = db.leads.length;
  try {
    await assert.rejects(runCanary(config, async () => new Response('missing column', { status: 400 })), /schema missing/);
    assert.equal(db.leads.length, count);
  } finally { globalThis.fetch = original; }

  const sql = await createTestDatabase();
  try {
    await sql.query(`insert into public.leads(id,address,name,phone,is_test,created_at,notification_mode,intake_kind) values
      ('11111111-1111-4111-8111-111111111111','Synthetic test','Canary','6615550100',true,now()-interval '10 minutes','durable','inquiry'),
      ('22222222-2222-4222-8222-222222222222','Real property','Seller','6615550101',false,now()-interval '10 minutes','durable','inquiry')`);
    const funnel = await sql.query('select sum(leads)::int as n from public.v_funnel');
    assert.equal(funnel.rows[0].n, 1);
    const waiting = await sql.query('select count(*)::int as n from public.v_uncontacted');
    assert.equal(waiting.rows[0].n, 1);
    const queued = await sql.query('select count(*)::int as n from public.notification_outbox');
    assert.equal(queued.rows[0].n, 1);
  } finally { await sql.close(); }
});
