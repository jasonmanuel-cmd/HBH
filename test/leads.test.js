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

test('cash-offer referral choices populate the lead channel and reject blank or unknown choices', () => {
  const offer = { ...valid, form_type: 'options', consent_response: 'yes' };
  for (const channel of ['social', 'paid_ads', 'ai_search']) {
    const { lead, errors } = parseLead({ ...offer, heard_about_us: channel });
    assert.deepEqual(errors, []);
    assert.equal(lead.channel, channel);
  }
  assert.equal(parseLead(offer).lead.channel, 'direct');
  for (const heard_about_us of ['', 'invalid']) {
    assert.deepEqual(parseLead({ ...offer, heard_about_us }).errors, ['heard_about_us']);
  }
});

test('email alerts require an explicit owner recipient and database storage', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true };
  };
  try {
    const result = await deliver(parseLead(valid).lead, { RESEND_API_KEY: 'test-key', LEAD_NOTIFY_EMAIL: 'owner@example.test' });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  } finally { globalThis.fetch = original; }
});

test('failed CRM storage stops notifications and cannot report success', async () => {
  const original = globalThis.fetch;
  const originalError = console.error;
  console.error = () => {};
  globalThis.fetch = async (url) => String(url).includes('resend.com')
    ? { ok: true }
    : { ok: false, status: 503, text: async () => 'Database unavailable' };
  try {
    const result = await deliver(parseLead(valid).lead, {
      RESEND_API_KEY: 'test-key', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.delivered, []);
    assert.equal(result.failures[0].channel, 'supabase');
  } finally { globalThis.fetch = original; console.error = originalError; }
});

test('rejects non-POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET' }, res, {});
  assert.equal(res.statusCode, 405);
});

test('honeypot returns ok without delivering', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: { ...valid, company: 'spam' } }, res, {});
  assert.equal(res.statusCode, 200);
});

test('invalid lead returns 400 with fields', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: JSON.stringify({ name: 'A' }) }, res, {});
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes('address'));
});

test('deliver does not post to a webhook before durable storage', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (calls.push([url, JSON.parse(opts.body)]), { ok: true });
  try {
    const r = await deliver(parseLead(valid).lead, { LEAD_WEBHOOK_URL: 'https://hook.test/x' });
    assert.equal(r.ok, false);
    assert.equal(calls.length, 0);

    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'err' });
    const origErr = console.error;
    console.error = () => {};
    const bad = await deliver(parseLead(valid).lead, { LEAD_WEBHOOK_URL: 'https://hook.test/x' });
    console.error = origErr;
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.failures[0].channel, 'storage');
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
    assert.equal(r.failures[0].channel, 'storage');
    assert.deepEqual(r.delivered, []);
  } finally {
    console.error = origErr;
  }
});

// Regression: handler must return 502, not 200, when delivery did not happen.
test('handler returns 502 when nothing could be delivered', async () => {
  const origErr = console.error;
  console.error = () => {};
  try {
    const res = mockRes();
    await handler({ method: 'POST', body: { ...valid } }, res, {});
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.ok, false);
  } finally {
    console.error = origErr;
  }
});
