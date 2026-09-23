import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLead, classifyChannel, deliver } from '../api/leads.js';

const base = { address: '123 Main St, Bakersfield, CA', name: 'Pat Doe', phone: '(661) 555-0199' };

test('family form requires relationship to the property', () => {
  assert.ok(parseLead({ ...base, form_type: 'family_transition' }).errors.includes('relationship'));
  assert.deepEqual(parseLead({ ...base, form_type: 'family_transition', relationship: 'Trustee' }).errors, []);
  assert.deepEqual(parseLead(base).errors, []); // standard form unchanged
});

test('channel classification', () => {
  assert.equal(classifyChannel({ gclid: 'x' }), 'google_ads');
  assert.equal(classifyChannel({ ref_partner: 'rosewood' }), 'partner');
  assert.equal(classifyChannel({ utm_source: 'youtube' }), 'youtube');
  assert.equal(classifyChannel({ referrer: 'https://www.google.com/' }), 'organic');
  assert.equal(classifyChannel({ referrer: 'https://chatgpt.com/' }), 'ai_search');
  assert.equal(classifyChannel({}), 'direct');
});

test('ref slug is sanitized', () => {
  assert.equal(parseLead({ ...base, ref: 'Rose Wood<script>' }).lead.ref_partner, 'rosewoodscript');
});

test('sms alone does not count as a stored lead', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true });
  const err = console.error; console.error = () => {};
  try {
    const env = { TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', TWILIO_FROM: '+16615550100' };
    assert.equal((await deliver(parseLead(base).lead, env)).ok, false);
    assert.equal((await deliver(parseLead(base).lead, { ...env, LEAD_WEBHOOK_URL: 'https://h.test' })).ok, true);
  } finally { globalThis.fetch = orig; console.error = err; }
});

test('supabase falls back to core fields when migration is missing', async () => {
  const bodies = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (_u, o) => {
    bodies.push(JSON.parse(o.body));
    return bodies.length === 1 ? { ok: false, status: 400, text: async () => 'Could not find the \'gclid\' column' } : { ok: true };
  };
  const warn = console.warn; console.warn = () => {};
  try {
    const r = await deliver(parseLead({ ...base, gclid: 'g' }).lead, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
    assert.equal(r.ok, true);
    assert.equal(bodies[1].gclid, undefined);
    assert.equal(bodies[1].address, base.address);
  } finally { globalThis.fetch = orig; console.warn = warn; }
});
