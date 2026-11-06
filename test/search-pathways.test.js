import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import handler, { parseLead, leadIpLimiter, leadPhoneLimiter } from '../api/leads.js';
import { cleanPatch, ROUTES } from '../api/hq.js';
import { alertIntents } from '../lib/lead-alerts.js';
import { db, installMockSupabase } from '../dev/mock-supabase.mjs';
import { buildPages } from '../src/pages.mjs';
import track from '../api/track.js';

const res = () => ({ statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
const inquiry = route => ({ submission_id: randomUUID(), form_type: 'options', route_interest: route, name: 'Synthetic Inquiry', phone: '6615550196', email: 'synthetic@example.invalid', consent_response: true, source: `/${route === 'home_value' ? 'home-value' : route + 's'}`, utm_source: 'synthetic' });

test('all inquiry intents require response consent, keep marketing separate and preserve seller address validation', () => {
  for (const route of ['buyer', 'investor', 'home_value']) {
    const body = inquiry(route), { lead, errors } = parseLead(body);
    assert.deepEqual(errors, []); assert.equal(lead.address, ''); assert.equal(lead.route_interest, route);
    assert.equal(lead.consent_marketing, false); assert.equal(lead.utm_source, 'synthetic');
    assert.ok(parseLead({ ...body, consent_response: undefined }).errors.includes('consent_response'));
    assert.equal(parseLead({ ...body, address: 'Untrusted seller context' }).lead.address, '');
    assert.ok(ROUTES.includes(route));
    const patch = cleanPatch({ route_interest: route, notes: 'Synthetic note' });
    assert.deepEqual(patch.bad, []); assert.equal(patch.patch.route_interest, route);
  }
  assert.ok(parseLead({ ...inquiry('direct') }).errors.includes('address'));
  assert.ok(parseLead({ ...inquiry('unrecognized') }).errors.includes('address'));
});

test('legacy address-free retry stores intent once, notifies once, and cannot receive seller details', async () => {
  const original = globalThis.fetch, env = { RESEND_API_KEY: 'synthetic', HQ_PASSWORD: 'synthetic' };
  installMockSupabase(env); const databaseFetch = globalThis.fetch;
  let alerts = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) { alerts.push(JSON.parse(init.body)); return Response.json({}); }
    return databaseFetch(url, init);
  };
  try {
    for (const route of ['buyer', 'investor', 'home_value']) {
      leadIpLimiter.reset(); leadPhoneLimiter.reset(); alerts = [];
      const body = inquiry(route);
      const send = async body => { const result = res(); await handler({ method: 'POST', headers: {}, body }, result, env); return result; };
      const results = await Promise.all([send(body), send(body)]);
      assert.deepEqual(results.map(r => r.statusCode), [200, 200]);
      assert.equal(db.leads.filter(l => l.id === body.submission_id).length, 1);
      const stored = db.leads.find(l => l.id === body.submission_id);
      assert.equal(stored.route_interest, route); assert.equal(stored.address, '');
      assert.equal(alerts.length, 1); assert.ok(alerts[0].subject.includes(stored.situation));
      for (const result of results) assert.equal(result.body.details_token, '');
      assert.equal((await send({ kind: 'details', id: stored.id, phone: stored.phone, address: 'invented', occupancy: 'Vacant' })).statusCode, 401);
      const jobs = alertIntents(stored, env, { recipients: ['synthetic@example.invalid'] });
      assert.ok(jobs[0].payload.subject.includes(stored.situation));
    }
  } finally { globalThis.fetch = original; }
});

test('new intent never falls back to lossy legacy columns or triggers alerts on storage failure', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async url => { calls++; assert.ok(String(url).includes('/rest/v1/leads')); return new Response('column route_interest missing', { status: 400 }); };
  leadIpLimiter.reset(); leadPhoneLimiter.reset();
  try {
    const result = res(); await handler({ method: 'POST', headers: {}, body: inquiry('investor') }, result, { SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', RESEND_API_KEY: 'synthetic' });
    assert.equal(result.statusCode, 502); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('collector drops arbitrary inquiry data, titles and UTMs while preserving bounded engagement', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.durationSeconds, 1800); assert.equal(payload.path, '/investors');
    assert.doesNotMatch(init.body, /private|email|address|utm|title/);
    return Response.json({ ok: true, stored: true });
  };
  try { await track({ method: 'POST', body: { sid: randomUUID(), type: 'heartbeat', path: '/investors?email=private', durationSeconds: 9000, email: 'private', address: 'private', title: 'private', utm: { source: 'private' } } }, res(), { CRM_INGEST_SECRET: 'synthetic' }); }
  finally { globalThis.fetch = original; }
});

test('inquiry pages and neutral completion preserve accessible forms and cautious scope', () => {
  const pages = new Map(buildPages().map(([file, html]) => [file, html]));
  for (const file of ['buyers.html', 'investors.html', 'home-value.html']) {
    const html = pages.get(file);
    assert.match(html, /name="consent_response" value="yes" required/);
    assert.doesNotMatch(html, /name="(?:street|address|relationship)"/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.match(html, /name="form_type" value="options"/);
  }
  assert.match(pages.get('investors.html'), /not an offer of securities/);
  assert.match(pages.get('home-value.html'), /does not promise an appraisal/);
  assert.ok(pages.get('index.html').indexOf("I'm interested in investing") < pages.get('index.html').indexOf('Get Your Property Options'));
  assert.match(pages.get('thank-you.html'), /details-card[^>]*hidden/);
  assert.match(pages.get('thank-you.html'), /confirms that original request/);
  assert.match(readFileSync(new URL('../static/script.js', import.meta.url), 'utf8'), /if \(!json\.duplicate\)/);
});
