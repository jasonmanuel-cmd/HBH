import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { parseLead, deliver } from '../api/leads.js';

const valid = { address: '123 Main St, Bakersfield, CA', name: 'Pat Doe', phone: '(661) 555-0199', email: 'pat@example.com' };

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

test('parseLead validates required fields', () => {
  assert.deepEqual(parseLead(valid).errors, []);
  assert.deepEqual(parseLead({ address: 'x', name: '', phone: '123', email: 'bad' }).errors, ['address', 'name', 'phone', 'email']);
});

test('rejects non-POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
});

test('honeypot returns ok without delivering', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: { ...valid, company: 'spam' } }, res);
  assert.equal(res.statusCode, 200);
});

test('invalid lead returns 400 with fields', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: JSON.stringify({ name: 'A' }) }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes('address'));
});

test('deliver posts to configured webhook and reports failures', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (calls.push([url, JSON.parse(opts.body)]), { ok: true });
  try {
    const r = await deliver(parseLead(valid).lead, { LEAD_WEBHOOK_URL: 'https://hook.test/x' });
    assert.deepEqual(r, { ok: true, delivered: ['webhook'], failures: [] });
    assert.equal(calls[0][1].address, valid.address);

    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'err' });
    const origErr = console.error;
    console.error = () => {};
    const bad = await deliver(parseLead(valid).lead, { LEAD_WEBHOOK_URL: 'https://hook.test/x' });
    console.error = origErr;
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.failures[0].channel, 'webhook');
  } finally {
    globalThis.fetch = orig;
  }
});

// Regression: an unconfigured deployment used to return ok:true, which reported success
// to the visitor while the lead was only written to the log and lost. See TSK-0025.
test('deliver fails loudly when no destination is configured', async () => {
  const origErr = console.error;
  console.error = () => {};
  try {
    const r = await deliver(parseLead(valid).lead, {});
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no_delivery_configured');
    assert.deepEqual(r.delivered, []);
  } finally {
    console.error = origErr;
  }
});

// Regression: handler must return 502, not 200, when delivery did not happen.
test('handler returns 502 when nothing could be delivered', async () => {
  const origErr = console.error;
  console.error = () => {};
  const origEnv = { RESEND_API_KEY: process.env.RESEND_API_KEY, LEAD_NOTIFY_EMAIL: process.env.LEAD_NOTIFY_EMAIL, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, LEAD_WEBHOOK_URL: process.env.LEAD_WEBHOOK_URL, TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID };
  for (const k of Object.keys(origEnv)) delete process.env[k];
  try {
    const res = mockRes();
    await handler({ method: 'POST', body: { ...valid } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.ok, false);
  } finally {
    console.error = origErr;
    for (const [k, v] of Object.entries(origEnv)) if (v !== undefined) process.env[k] = v;
  }
});
