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
    assert.deepEqual(r, { ok: true, delivered: ['webhook'] });
    assert.equal(calls[0][1].address, valid.address);

    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'err' });
    const origErr = console.error;
    console.error = () => {};
    const bad = await deliver(parseLead(valid).lead, { LEAD_WEBHOOK_URL: 'https://hook.test/x' });
    console.error = origErr;
    assert.equal(bad.ok, false);
  } finally {
    globalThis.fetch = orig;
  }
});
