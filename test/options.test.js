import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { parseLead, parseDetails, deliverDetails } from '../api/leads.js';

const optionsLead = {
  form_type: 'options',
  first_name: 'Pat',
  last_name: 'Doe',
  street: '123 Main St',
  city: 'Bakersfield',
  zip: '93301',
  phone: '(661) 555-0199',
  situation: 'The property needs major repairs',
  route_interest: 'renovate',
  consent_response: 'yes',
};

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

test('options form composes name and address from split fields', () => {
  const { lead, errors } = parseLead(optionsLead);
  assert.deepEqual(errors, []);
  assert.equal(lead.name, 'Pat Doe');
  assert.equal(lead.address, '123 Main St, Bakersfield, CA 93301');
  assert.equal(lead.route_interest, 'renovate');
  assert.equal(lead.consent_response, true);
  assert.equal(lead.consent_marketing, false);
  assert.ok(lead.consent_at);
});

test('options form requires response consent; marketing consent stays separate', () => {
  assert.ok(parseLead({ ...optionsLead, consent_response: '' }).errors.includes('consent_response'));
  const { lead } = parseLead({ ...optionsLead, consent_marketing: 'yes' });
  assert.equal(lead.consent_marketing, true);
  // Other forms are not affected by the consent rule.
  assert.deepEqual(parseLead({ address: '1 A St, Taft', name: 'Al B', phone: '6615550100' }).errors, []);
});

test('details are cleaned and capped', () => {
  const d = parseDetails({ phone: '6615550199', address: '123 Main St', condition_flags: ['Major repairs needed', '', 5, ...Array(20).fill('x')], timeline: 'Within 30 days' });
  assert.equal(d.timeline, 'Within 30 days');
  assert.ok(d.condition_flags.length <= 10);
  assert.ok(!d.condition_flags.includes(''));
});

test('details request needs a lead reference', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: { kind: 'details', timeline: 'Unsure' } }, res);
  assert.equal(res.statusCode, 400);
});

test('details patch only the matching recent lead', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o) => (calls.push([url, o]), { ok: true, text: async () => '' });
  try {
    const d = parseDetails({ phone: '(661) 555-0199', address: '123 Main St, Bakersfield, CA 93301', occupancy: 'Vacant', condition_flags: ['Major repairs needed'] });
    const r = await deliverDetails(d, { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'k' });
    assert.equal(r.ok, true);
    const [url, opts] = calls[0];
    assert.equal(opts.method, 'PATCH');
    assert.match(url, /^https:\/\/x\.supabase\.co\/rest\/v1\/leads\?/);
    const q = new URL(url).searchParams;
    assert.equal(q.get('phone'), 'eq.(661) 555-0199');
    assert.equal(q.get('address'), 'eq.123 Main St, Bakersfield, CA 93301');
    assert.match(q.get('created_at'), /^gte\./);
    const body = JSON.parse(opts.body);
    assert.deepEqual(Object.keys(body).sort(), ['condition_flags', 'desired_outcome', 'occupancy']);
  } finally {
    globalThis.fetch = orig;
  }
});
