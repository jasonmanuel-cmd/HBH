import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { clientIp, createRateLimiter } from '../lib/request-ip.js';
import { fetchWithRetry } from '../lib/fetch-retry.js';
import { resolveGtmId } from '../site.config.mjs';
import hqHandler, { makeSession, buildSearchOr, cleanPatch, cleanNewLead, computeStats } from '../api/hq.js';
import leadsHandler, { readDetailsToken, parseLead } from '../api/leads.js';
import trackHandler from '../api/track.js';
import { db, installMockSupabase } from '../dev/mock-supabase.mjs';

function callApi(fn, req, env) {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  res.end = (v = '') => ((res.raw = v), res);
  return Promise.resolve(fn({ headers: {}, ...req }, res, env)).then(() => res);
}

test('clientIp prefers x-real-ip and rightmost x-forwarded-for hop to resist spoofing', () => {
  assert.equal(clientIp({ headers: { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4, 198.51.100.7' } }), '198.51.100.7');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.42' } }), '198.51.100.42');
  const lim = createRateLimiter({ max: 2, windowMs: 60_000 });
  assert.equal(lim.hit('198.51.100.1', 1000).limited, false);
  assert.equal(lim.hit('198.51.100.1', 2000).limited, false);
  assert.equal(lim.hit('198.51.100.1', 3000).limited, true);
  assert.equal(lim.isLimited('198.51.100.1', 62_500), false);
});

test('buildSearchOr strips PostgREST-breaking parens and adds wildcard phone matching', () => {
  const orClause = buildSearchOr('(661) 555-0101');
  assert.ok(orClause.startsWith('or('));
  assert.ok(!orClause.slice(3, -1).includes('('), 'inner clauses must not contain raw parentheses');
  assert.match(orClause, /phone\.ilike\."\*661\*555\*0101\*"/);

  const plainDigits = buildSearchOr('6615550101');
  assert.match(plainDigits, /phone\.ilike\."\*661\*555\*0101\*"/);
});

test('cleanPatch and cleanNewLead support contact edits, buyer_purchase outcome, and manual entry', () => {
  const { patch, bad } = cleanPatch({
    phone: '(661) 555-1234',
    email: 'Seller@Example.com',
    address: '412 Oak St, Bakersfield',
    route_interest: 'not_ready',
    outcome_path: 'buyer_purchase',
  });
  assert.deepEqual(bad, []);
  assert.equal(patch.email, 'seller@example.com');
  assert.equal(patch.outcome_path, 'buyer_purchase');
  assert.equal(cleanPatch({ phone: '123' }).bad[0], 'phone');

  const created = cleanNewLead({
    brand: 'harbison_standard',
    name: 'Jordan Lee',
    phone: '661-555-8899',
    status: 'connected',
  });
  assert.deepEqual(created.bad, []);
  assert.equal(created.row.form_type, 'harbison_standard');
  assert.ok(created.row.first_contact_at);
  assert.equal(cleanNewLead({ name: 'No Contact' }).bad[0], 'phone');
});

test('computeStats excludes spam/not_a_fit from speed-to-lead and do_not_contact from follow-ups', () => {
  const now = Date.parse('2026-10-23T18:00:00Z');
  const m = (mins) => new Date(now - mins * 60e3).toISOString();
  const stats = computeStats([
    { created_at: m(60), status: 'connected', first_contact_at: m(45) }, // 15 min
    { created_at: m(500), status: 'not_a_fit', first_contact_at: m(10) }, // should be ignored
    { created_at: m(20), status: 'new', do_not_contact: true }, // DNC excluded from uncontacted
    { created_at: m(120), status: 'qualified', next_followup: m(30), do_not_contact: true }, // DNC excluded from followupsDue
  ], now);
  assert.equal(stats.medianMinutesToContact, 15);
  assert.equal(stats.uncontacted, 0);
  assert.equal(stats.followupsDue, 0);
});

test('HQ end-to-end: phone search, manual lead, outreach auto-contact, reopen, CSV export, and partners/spend', async () => {
  const origFetch = globalThis.fetch;
  const env = { HQ_PASSWORD: 'test-password-123' };
  installMockSupabase(env);

  try {
    const cookie = `hq_session=${makeSession('Nate', env)}`;
    const authHeaders = { cookie, 'x-hq': '1' };

    // 1. Digit-only phone search matches formatted "(661) 555-0101"
    const searchRes = await callApi(hqHandler, { method: 'GET', url: '/api/hq?action=leads&view=all&q=6615550101', headers: { cookie } }, env);
    assert.equal(searchRes.statusCode, 200);
    assert.equal(searchRes.body.leads.length, 1);
    assert.match(searchRes.body.leads[0].name, /Sample Seller A/);

    // 2. Manual lead creation in HQ
    const createRes = await callApi(hqHandler, {
      method: 'POST',
      url: '/api/hq?action=lead',
      headers: authHeaders,
      body: { name: '=Formula Seller', phone: '(661) 555-7788', address: '900 Truxtun Ave', status: 'new', brand: 'call_harbison' },
    }, env);
    assert.equal(createRes.statusCode, 201);
    const leadId = createRes.body.lead.id;
    assert.equal(createRes.body.lead.status, 'new');

    // 3. Logging a call auto-stamps first_contact_at, advances 'new' -> 'contact_attempted', and records actor
    const evRes = await callApi(hqHandler, {
      method: 'POST',
      url: `/api/hq?action=event&id=${leadId}`,
      headers: authHeaders,
      body: { kind: 'call', detail: 'Left voicemail with callback options' },
    }, env);
    assert.equal(evRes.statusCode, 200);
    const detailRes = await callApi(hqHandler, { method: 'GET', url: `/api/hq?action=lead&id=${leadId}`, headers: { cookie } }, env);
    assert.equal(detailRes.body.lead.status, 'contact_attempted');
    assert.ok(detailRes.body.lead.first_contact_at);
    const statusEv = detailRes.body.events.find((e) => e.kind === 'status_change');
    assert.equal(statusEv?.actor, 'Nate');

    // 4. Closing and reopening clears closed_at
    const closeRes = await callApi(hqHandler, {
      method: 'PATCH', url: `/api/hq?action=lead&id=${leadId}`, headers: authHeaders, body: { status: 'closed_lost', lost_reason: 'Paused' },
    }, env);
    assert.ok(closeRes.body.lead.closed_at);
    const reopenRes = await callApi(hqHandler, {
      method: 'PATCH', url: `/api/hq?action=lead&id=${leadId}`, headers: authHeaders, body: { status: 'qualified' },
    }, env);
    assert.equal(reopenRes.body.lead.closed_at, null);

    // 5. CSV export neutralizes spreadsheet formula prefixes
    const csvRes = await callApi(hqHandler, { method: 'GET', url: '/api/hq?action=export&view=open', headers: { cookie } }, env);
    assert.equal(csvRes.statusCode, 200);
    assert.match(csvRes.headers['Content-Type'], /text\/csv/);
    assert.match(csvRes.raw, /'=Formula Seller/);

    // 6. Partners & monthly ad spend upsert + rollup
    const pRes = await callApi(hqHandler, {
      method: 'POST', url: '/api/hq?action=partner', headers: authHeaders,
      body: { slug: 'kern-probate', name: 'Kern Probate Counsel', category: 'elder_law', status: 'active' },
    }, env);
    assert.equal(pRes.statusCode, 200);
    const sRes = await callApi(hqHandler, {
      method: 'POST', url: '/api/hq?action=spend', headers: authHeaders,
      body: { month: '2026-10', channel: 'google_ads', campaign: 'search-kern', spend: 1250 },
    }, env);
    assert.equal(sRes.statusCode, 200);
    const rollRes = await callApi(hqHandler, { method: 'GET', url: '/api/hq?action=partners', headers: { cookie } }, env);
    assert.equal(rollRes.statusCode, 200);
    assert.ok(rollRes.body.partners.some((p) => p.slug === 'kern-probate'));
    assert.ok(rollRes.body.funnel.some((f) => f.channel === 'google_ads'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('details_token signs thank-you property updates and blocks unauthenticated patches', async () => {
  const origFetch = globalThis.fetch;
  const env = {};
  installMockSupabase(env);

  try {
    const createRes = await callApi(leadsHandler, {
      method: 'POST',
      url: '/api/leads',
      headers: { 'x-real-ip': '198.51.100.88' },
      body: {
        form_type: 'options',
        first_name: 'Elena',
        last_name: 'Vance',
        phone: '(661) 555-3344',
        street: '714 Pine St',
        city: 'Tehachapi',
        situation: 'Inherited property',
        route_interest: 'direct',
        consent_response: true,
      },
    }, env);
    assert.equal(createRes.statusCode, 200);
    assert.ok(createRes.body.id);
    assert.ok(createRes.body.details_token);
    assert.equal(readDetailsToken(createRes.body.details_token, env).id, createRes.body.id);

    // Missing details_token is rejected with 401 when CRM secrets are configured
    const blocked = await callApi(leadsHandler, {
      method: 'POST',
      url: '/api/leads',
      headers: { 'x-real-ip': '198.51.100.88' },
      body: { kind: 'details', phone: '(661) 555-3344', address: '714 Pine St, Tehachapi', occupancy: 'Vacant' },
    }, env);
    assert.equal(blocked.statusCode, 401);

    // Valid details_token updates the exact lead record
    const okDetails = await callApi(leadsHandler, {
      method: 'POST',
      url: '/api/leads',
      headers: { 'x-real-ip': '198.51.100.88' },
      body: { kind: 'details', details_token: createRes.body.details_token, condition_flags: ['Major repairs needed'], occupancy: 'Vacant' },
    }, env);
    assert.equal(okDetails.statusCode, 200);
    const updated = db.leads.find((l) => l.id === createRes.body.id);
    assert.deepEqual(updated.condition_flags, ['Major repairs needed']);
    assert.equal(updated.occupancy, 'Vacant');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('family form enforces explicit consent_response when present and CSP sink returns 204', async () => {
  const denied = parseLead({
    form_type: 'family_transition',
    name: 'Sam Carter',
    phone: '661-555-9090',
    address: '102 Oak Ave, Bakersfield',
    relationship: 'Executor / trustee',
    consent_response: false,
  });
  assert.ok(denied.errors.includes('consent_response'));

  const csp = await callApi(trackHandler, { method: 'POST', url: '/api/track?csp=1', body: '{}' }, {});
  assert.equal(csp.statusCode, 204);
});

test('built dist outputs fingerprinted assets, HQ subroutes, hardened robots.txt, stable sitemap dates, and net estimator', () => {
  execSync('node build.mjs', { stdio: 'pipe' });
  const files = readdirSync('dist');
  const cssFile = files.find((f) => /^styles\.[0-9a-f]{10}\.css$/.test(f));
  const jsFile = files.find((f) => /^script\.[0-9a-f]{10}\.js$/.test(f));
  const analyticsFile = files.find((f) => /^analytics\.[0-9a-f]{10}\.js$/.test(f));
  assert.ok(cssFile && jsFile && analyticsFile, 'fingerprinted CSS and JS bundles exist');
  assert.ok(!existsSync('dist/styles.css') && !existsSync('dist/script.js'), 'unfingerprinted bundles removed');
  assert.ok(existsSync('dist/hq/leads.html') && existsSync('dist/hq/partners.html'), 'HQ clean-URL subroutes exist');

  const home = readFileSync('dist/index.html', 'utf8');
  assert.ok(home.includes(`href="/${cssFile}"`) && home.includes(`src="/${jsFile}"`) && home.includes(`src="/${analyticsFile}"`));
  assert.ok(!home.includes('playfair-italic-latin.woff2'), 'unused italic font preload removed');

  const how = readFileSync('dist/how-it-works.html', 'utf8');
  assert.ok(how.includes('data-net-estimator'), 'interactive net estimator rendered on /how-it-works');

  const kern = readFileSync('dist/areas/kern-county.html', 'utf8');
  const chipSection = kern.match(/<ul class="chip-list">([\s\S]*?)<\/ul>/)?.[1] || '';
  assert.equal((chipSection.match(/California City/g) || []).length, 1, 'duplicate California City chip removed');
  assert.ok(chipSection.includes('href="/areas/bakersfield"'), 'matching area chips link to area pages');

  const inherited = readFileSync('dist/situations/inherited-property.html', 'utf8');
  assert.ok(inherited.includes('data-back'), 'preselected stepped form retains Back button');

  const robots = readFileSync('dist/robots.txt', 'utf8');
  assert.equal((robots.match(/Disallow: \/hq/g) || []).length, 2, 'every robots block disallows /hq');
  assert.equal((robots.match(/Disallow: \/thank-you/g) || []).length, 2, 'every robots block disallows /thank-you');

  const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
  assert.ok(sitemap.includes('<loc>https://www.callharbison.com/about</loc><lastmod>2026-09-24</lastmod>'), 'unchanged pages retain stable historical lastmod dates');
  assert.ok(home.includes('/_vercel/speed-insights/script.js'), 'zero-dependency Vercel Speed Insights script included');
});

test('resolveGtmId rejects placeholders and accepts valid GTM container IDs', () => {
  assert.equal(resolveGtmId(''), '');
  assert.equal(resolveGtmId('GTM-XXXXXXX'), '');
  assert.equal(resolveGtmId('invalid'), '');
  assert.equal(resolveGtmId('GTM-K9P4R2'), 'GTM-K9P4R2');
});

test('fetchWithRetry recovers from transient 503 and partial email failure is logged to HQ timeline', async () => {
  const origFetch = globalThis.fetch;
  const origErr = console.error;
  console.error = () => {};
  const env = { RESEND_API_KEY: 're_test_bad_domain' };
  installMockSupabase(env);
  const mockSbFetch = globalThis.fetch;

  let attempts = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://transient.test/ping') {
      attempts++;
      return attempts === 1 ? { ok: false, status: 503, text: async () => 'busy' } : { ok: true, status: 200, text: async () => 'ok' };
    }
    if (String(url).includes('api.resend.com')) {
      return { ok: false, status: 403, text: async () => 'domain is not verified' };
    }
    return mockSbFetch(url, init);
  };

  try {
    const retryRes = await fetchWithRetry('https://transient.test/ping', {}, { retries: 1, backoffMs: 10 });
    assert.equal(retryRes.ok, true);
    assert.equal(attempts, 2);

    const leadRes = await callApi(leadsHandler, {
      method: 'POST',
      url: '/api/leads',
      headers: { 'x-real-ip': '198.51.100.55' },
      body: {
        form_type: 'options',
        first_name: 'Clara',
        last_name: 'Reyes',
        phone: '(661) 555-6161',
        street: '820 Truxtun Ave',
        city: 'Bakersfield',
        situation: 'I may want to sell directly',
        consent_response: true,
      },
    }, env);
    assert.equal(leadRes.statusCode, 200);
    const warnEvent = db.lead_events.find((e) => e.lead_id === leadRes.body.id && /Notification alert warning/.test(e.detail));
    assert.ok(warnEvent, 'HQ timeline records Resend delivery failure when Supabase storage succeeded');
  } finally {
    globalThis.fetch = origFetch;
    console.error = origErr;
  }
});

test('HQ duplicate-aware CSV import, integration health check, and one-click test-alert diagnostic', async () => {
  const origFetch = globalThis.fetch;
  const env = {
    HQ_PASSWORD: 'test-password-123',
    RESEND_API_KEY: 're_live_key',
    LEAD_FROM_EMAIL: 'Harbison Leads <leads@callharbison.com>',
    CRM_INGEST_SECRET: 'shared-secret-at-least-32-characters-long',
  };
  installMockSupabase(env);
  const mockSbFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'msg_test_123' }) };
    }
    return mockSbFetch(url, init);
  };

  try {
    const cookie = `hq_session=${makeSession('Jason', env)}`;
    const authHeaders = { cookie, 'x-hq': '1' };

    // 1. Health endpoint reports non-secret integration readiness
    const healthRes = await callApi(hqHandler, { method: 'GET', url: '/api/hq?action=health', headers: { cookie } }, env);
    assert.equal(healthRes.statusCode, 200);
    assert.equal(healthRes.body.health.email.configured, true);
    assert.equal(healthRes.body.health.email.sandboxSender, false);
    assert.equal(healthRes.body.health.standardBridge.configured, true);

    // 2. Test-alert sends a live diagnostic without creating fake leads
    const leadsBefore = db.leads.length;
    const alertRes = await callApi(hqHandler, { method: 'POST', url: '/api/hq?action=test-alert', headers: authHeaders, body: {} }, env);
    assert.equal(alertRes.statusCode, 200);
    assert.match(alertRes.body.channels[0].detail, /msg_test_123/);
    assert.equal(db.leads.length, leadsBefore, 'diagnostic alert never pollutes leads table');

    // 3. Dry-run CSV import previews rows, commits them with original dates, and skips duplicates on re-run
    const csv = [
      'name,email,phone,created_at,goal,desired_area,budget,message',
      'Arthur Pendelton,arthur@example.org,661-555-4411,2026-07-14T15:30:00Z,Buying,Bear Valley Springs,"$550,000","Looking for horse property"',
      'Invalid Row,,,2026-07-14T15:30:00Z,Buying,,,',
    ].join('\n');

    const previewRes = await callApi(hqHandler, {
      method: 'POST',
      url: '/api/hq?action=import',
      headers: authHeaders,
      body: { raw: csv, default_brand: 'harbison_standard', dry_run: true },
    }, env);
    assert.equal(previewRes.statusCode, 200);
    assert.deepEqual(previewRes.body.counts, { ready: 1, duplicates: 0, invalid: 1 });

    const commitRes = await callApi(hqHandler, {
      method: 'POST',
      url: '/api/hq?action=import',
      headers: authHeaders,
      body: { raw: csv, default_brand: 'harbison_standard', dry_run: false },
    }, env);
    assert.equal(commitRes.statusCode, 201);
    assert.equal(commitRes.body.imported, 1);

    const arthur = db.leads.find((l) => l.email === 'arthur@example.org');
    assert.ok(arthur);
    assert.equal(arthur.created_at, '2026-07-14T15:30:00.000Z');
    assert.equal(arthur.form_type, 'harbison_standard');
    assert.match(arthur.notes, /Bear Valley Springs/);

    // Re-running the exact same CSV skips the row as a duplicate
    const rerunRes = await callApi(hqHandler, {
      method: 'POST',
      url: '/api/hq?action=import',
      headers: authHeaders,
      body: { raw: csv, default_brand: 'harbison_standard', dry_run: true },
    }, env);
    assert.equal(rerunRes.body.counts.ready, 0);
    assert.equal(rerunRes.body.counts.duplicates, 1);
  } finally {
    globalThis.fetch = origFetch;
  }
});
