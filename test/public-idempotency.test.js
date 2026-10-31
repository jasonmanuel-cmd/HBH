import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import handler, { readDetailsToken, leadIpLimiter, leadPhoneLimiter } from '../api/leads.js';
import { db, installMockSupabase } from '../dev/mock-supabase.mjs';

const body = () => ({ submission_id: randomUUID(), address: '123 Example St, Test, CA', name: 'Test Seller', phone: '6615550192', form_type: 'options', consent_response: true });
const invoke = async (data, env) => {
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method: 'POST', headers: {}, body: data }, res, env);
  return res;
};
async function fixture(fn, { emailFailure = false } = {}) {
  const realFetch = globalThis.fetch, realError = console.error;
  const env = { RESEND_API_KEY: 'test', HQ_PASSWORD: 'mock' };
  installMockSupabase(env);
  const mockDbFetch = globalThis.fetch;
  const alerts = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('api.resend.com')) {
      alerts.push(options);
      return new Response(emailFailure ? 'private provider detail' : '{}', { status: emailFailure ? 400 : 200 });
    }
    return mockDbFetch(url, options);
  };
  console.error = () => {};
  leadIpLimiter.reset(); leadPhoneLimiter.reset();
  try { await fn(env, alerts); } finally { globalThis.fetch = realFetch; console.error = realError; }
}

test('concurrent public retries store once, notify once and return valid details references', async () => {
  await fixture(async (env, alerts) => {
    const data = body();
    const results = await Promise.all([invoke(data, env), invoke(data, env)]);
    assert.deepEqual(results.map(r => r.statusCode), [200, 200]);
    assert.equal(db.leads.filter(l => l.id === data.submission_id).length, 1);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].headers['Idempotency-Key'], `lead-${data.submission_id}`);
    for (const result of results) assert.equal(readDetailsToken(result.body.details_token, env).id, data.submission_id);
    assert.equal(results.filter(r => r.body.duplicate).length, 1);
    // Model a successful response lost to the browser, then repeated after a reload.
    assert.equal((await invoke(data, env)).body.duplicate, true);
    assert.equal(alerts.length, 1);
  });
});

test('retry cannot overwrite stored contact, consent or other payload fields', async () => {
  await fixture(async (env, alerts) => {
    const data = body();
    await invoke(data, env);
    for (const change of [{ name: 'Different' }, { consent_marketing: true }, { situation: 'Changed' }]) {
      const result = await invoke({ ...data, ...change }, env);
      assert.equal(result.statusCode, 409);
      assert.equal(result.body.code, 'SUBMISSION_CONFLICT');
      assert.equal(result.body.details_token, undefined);
    }
    assert.equal(alerts.length, 1);
    const stored = db.leads.find(l => l.id === data.submission_id);
    assert.equal(stored.name, data.name); assert.equal(stored.consent_marketing, false);
  });
});

test('failed alerts do not undo storage or resend on duplicate; HQ gets sanitized warning', async () => {
  await fixture(async (env, alerts) => {
    const data = body();
    const result = await invoke(data, env);
    assert.equal(result.statusCode, 200);
    assert.equal((await invoke(data, env)).statusCode, 200);
    assert.equal(alerts.length, 1);
    assert.ok(db.lead_events.some(e => e.lead_id === data.submission_id && e.detail.includes('Notification alert warning')));
    assert.ok(!JSON.stringify(result.body).includes('private provider detail'));
    assert.ok(!JSON.stringify(db.lead_events.filter(e => e.lead_id === data.submission_id)).includes('private provider detail'));
  }, { emailFailure: true });
});

test('stable public submissions reject unconfigured storage and invalid IDs without sending', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Must not call providers'); };
  try {
    const env = { RESEND_API_KEY: 'test' };
    assert.equal((await invoke(body(), env)).body.code, 'STORAGE_UNAVAILABLE');
    for (const submission_id of ['bad', [randomUUID()], { value: randomUUID() }, null, 123]) {
      assert.equal((await invoke({ ...body(), submission_id }, env)).statusCode, 400);
    }
  } finally { globalThis.fetch = realFetch; }
});

test('storage failures return no provider detail or contact data in errors/logs; no alerts', async () => {
  const realFetch = globalThis.fetch, realError = console.error;
  const calls = [], logs = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response('sensitive provider detail', { status: 403 }); };
  console.error = (...args) => logs.push(args);
  try {
    const data = body();
    const result = await invoke(data, { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'mock', RESEND_API_KEY: 'mock' });
    assert.equal(result.statusCode, 502);
    assert.equal(calls.length, 1);
    assert.ok(!calls[0].includes('resend'));
    const output = JSON.stringify([result.body, logs]);
    for (const value of ['sensitive provider detail', data.phone, data.address, data.name]) assert.ok(!output.includes(value));
  } finally { globalThis.fetch = realFetch; console.error = realError; }
});

test('legacy-schema fallback retains core inquiry and rejects unverified duplicate consent', async () => {
  const realFetch = globalThis.fetch, realWarn = console.warn, realError = console.error;
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'mock' };
  let stored;
  globalThis.fetch = async (_url, options = {}) => {
    assert.ok(options.signal, 'all storage operations have a bounded signal');
    if (!options.method) return Response.json([stored]);
    const data = JSON.parse(options.body);
    if ('consent_response' in data) return new Response('Missing column consent_response', { status: 400 });
    if (stored) return Response.json([]);
    stored = data;
    return Response.json([stored]);
  };
  console.warn = () => {}; console.error = () => {};
  try {
    const data = body();
    assert.equal((await invoke(data, env)).statusCode, 200);
    assert.equal(stored.address, data.address);
    assert.equal(stored.id, data.submission_id);
    assert.equal((await invoke(data, env)).body.code, 'SUBMISSION_CONFLICT');
  } finally { globalThis.fetch = realFetch; console.warn = realWarn; console.error = realError; }
});
