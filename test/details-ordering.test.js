import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverDetails, parseDetails } from '../api/leads.js';

const id = '11111111-1111-4111-8111-111111111111';
const details = parseDetails({ id, phone: '6615550199', address: '101 Synthetic Ave', occupancy: 'Vacant' });
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'mock', RESEND_API_KEY: 'mock', LEAD_WEBHOOK_URL: 'https://hook.test', LEAD_NOTIFY_EMAIL: 'operator@example.invalid' };
const response = (body, ok = true) => ({ ok, status: ok ? 200 : 503, text: async () => body });

test('unconfirmed details storage never admits alerts or retries the PATCH', async () => {
  const original = fetch, log = console.error;
  console.error = () => {};
  try {
    for (const result of [response('rejected', false), response(''), response('[]'), response('{}'), response('invalid json'), response(JSON.stringify([{ id: 'different' }])), response(JSON.stringify([{ id }, { id }])), new Error('ambiguous network outcome')]) {
      const calls = [];
      globalThis.fetch = async (url) => { calls.push(String(url)); if (result instanceof Error) throw result; return result; };
      const actual = await deliverDetails(details, env);
      assert.equal(actual.ok, false);
      assert.deepEqual(actual.delivered, []);
      assert.equal(actual.failures[0].channel, 'supabase');
      assert.equal(calls.length, 1);
      assert.ok(calls[0].startsWith('https://db.test/'));
    }
    globalThis.fetch = async () => { throw new Error('Must not call any provider without storage configuration'); };
    for (const config of [{}, { RESEND_API_KEY: 'mock' }, { ...env, SUPABASE_SERVICE_ROLE_KEY: '' }]) assert.equal((await deliverDetails(details, config)).ok, false);
  } finally { globalThis.fetch = original; console.error = log; }
});

test('details alerts wait for confirmed representation and preserve configured recipients', async () => {
  const original = fetch;
  const calls = [];
  let confirm;
  const pending = new Promise(resolve => { confirm = resolve; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith(env.SUPABASE_URL)) return { ok: true, text: () => pending };
    return { ok: true };
  };
  try {
    const delivery = deliverDetails(details, env);
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Prefer, 'return=representation');
    confirm(JSON.stringify([{ id }]));
    const result = await delivery;
    assert.equal(result.ok, true);
    assert.deepEqual(result.delivered, ['supabase', 'email', 'webhook']);
    assert.deepEqual(JSON.parse(calls[1].options.body).to, ['operator@example.invalid']);
  } finally { globalThis.fetch = original; }
});

test('confirmed details remain saved when optional alerts fail', async () => {
  const original = fetch, log = console.error;
  console.error = () => {};
  globalThis.fetch = async url => String(url).startsWith(env.SUPABASE_URL) ? response(JSON.stringify([{ id }])) : response('unavailable', false);
  try {
    const result = await deliverDetails(details, env);
    assert.equal(result.ok, true);
    assert.deepEqual(result.delivered, ['supabase']);
    assert.deepEqual(result.failures.map(f => f.channel), ['email', 'webhook']);
  } finally { globalThis.fetch = original; console.error = log; }
});
