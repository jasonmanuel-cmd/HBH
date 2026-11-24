import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import track from '../api/track.js';
import { readAnalytics } from '../lib/analytics-store.js';
import { leadWebhookTarget } from '../lib/lead-webhook.js';
import { buildPages } from '../src/pages.mjs';
import { esPath } from '../src/i18n/translate.mjs';

const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(c) { this.statusCode=c; return this; }, json(b) { this.body=b; return this; } });
const request = (path, extra = {}, headers = {}) => ({
  method: 'POST',
  headers: { host: 'www.callharbison.com', origin: 'https://www.callharbison.com', ...headers },
  body: { path, sid: crypto.randomUUID(), pageToken: crypto.randomUUID(), type: 'pageview', consent: true, ...extra },
});

test('collector persists minimized, deduplicated rows and HQ aggregates them', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    await db.exec(await readFile(new URL('../supabase/migrations/20261125000000_hbh_analytics.sql', import.meta.url), 'utf8'));
    const sql = async (parts, ...params) => (await db.query(parts.reduce((q, p, i) => q + (i ? '$' + i : '') + p, ''), params)).rows;
    const send = async req => { const res = response(); await track(req, res, {}, () => sql); assert.equal(res.body.stored, true); assert.match(res.headers['X-Analytics-Request-ID'], /^[a-f0-9-]{36}$/); };
    const req = request('/contact?email=private', { email: 'private@example.test', site: 'harbison_standard' }, { 'x-forwarded-for': '192.0.2.8' });
    await send(req);
    await send(req);
    await send({ ...req, body: { ...req.body, type: 'heartbeat', durationSeconds: 32 } });
    await send({ ...req, body: { ...req.body, type: 'heartbeat', durationSeconds: 4 } });
    await send(request('/es/contact'));
    await send(request('/contact', {}, {host:'www.harbisonstandard.com',origin:'https://www.harbisonstandard.com'}));
    const {rows} = await db.query('select * from public.hbh_analytics_pages order by path');
    assert.equal(rows.length, 3);
    assert.equal(rows.find(r=>r.session_id === req.body.sid).duration_seconds, 32);
    assert.equal(rows.find(r=>r.session_id === req.body.sid).site, 'call_harbison');
    assert.doesNotMatch(JSON.stringify(rows), /private|192\.0\.2\.8/);
    assert.equal((await readAnalytics(sql, 'call_harbison', 7)).totals.pageViews, 2);
    assert.equal((await readAnalytics(sql, 'harbison_standard', 7)).totals.pageViews, 1);
  } finally { await db.close(); }
});

test('all sitemap pages follow the public collector policy in both languages', async () => {
  for (const [, , path] of buildPages()) {
    if (!path) continue;
    for (const translated of [path, esPath(path)]) {
      const res = response();
      let writes = 0;
      await track(request(translated), res, {}, () => async () => { writes++; });
      assert.equal(writes, path === '/privacy' ? 0 : 1, translated);
    }
  }
});

test('collector rejects private routes, forwarding, invalid origins and privacy opt-outs before storage', async () => {
  const cases = [
    ...['/hq','/hq/leads','/api/track','/thank-you','/es/thank-you','/family-property-guide','/es/family-property-guide','/privacy','/es/privacy','/404','/unknown']
      .map(path => [request(path),400]),
    [request('/contact',{}, {'x-analytics-visitor':'legacy'}),508],
    [request('/contact',{}, {'x-analytics-hop':'1'}),508],
    [request('/contact',{}, {origin:'https://other.example'}),403],
    [request('/contact',{consent:false}),202],
    [request('/contact',{}, {'sec-gpc':'1'}),202],
    [request('/contact',{}, {dnt:'1'}),202],
  ];
  for (const [req, expected] of cases) {
    const res = response();
    await track(req, res, {}, () => assert.fail('No storage expected'));
    assert.equal(res.statusCode, expected);
  }
});

test('lead webhook blocks same-deployment callbacks', () => {
  for (const url of ['https://www.callharbison.com/api/leads','https://www.harbisonstandard.com/api/intake','https://hbh-pi.vercel.app/api/track']) {
    assert.throws(() => leadWebhookTarget(url), /Unsafe/);
  }
  assert.equal(leadWebhookTarget('https://hook.test/x'), 'https://hook.test/x');
});

test('browser forwards approved Clarity event names only after consent', async () => {
  const script = await readFile(new URL('../static/script.js', import.meta.url), 'utf8');
  const section = script.slice(script.indexOf('const clarityEvents'), script.indexOf('const PAGE_VIEW_EVENTS'));
  const ga = [], clarity = [], dataLayer = [];
  let consent = false;
  const window = { hbhOk: () => consent, clarity: (...args) => clarity.push(args), gtag: (...args) => ga.push(args), dataLayer };
  const document = { body: { dataset: {} } };
  const context = vm.createContext({ window, document, location: { pathname: '/contact' }, device: () => 'desktop', pageType: 'contact' });
  vm.runInContext(section, context);
  const emit = (event) => vm.runInContext(`track(${JSON.stringify(event)}, { example: 'ignored by Clarity' })`, context);
  emit('sms_click');
  assert.equal(clarity.length, 0);
  consent = true;
  for (const event of ['lead_form_success', 'generate_lead', 'sms_click', 'email_click']) emit(event);
  assert.deepEqual(clarity, [['event','generate_lead'], ['event','sms_click'], ['event','email_click']]);
  assert.equal(ga.filter(args => args[1] === 'generate_lead').length, 1);
  assert.equal(dataLayer.length, 0);
  document.body.dataset.analyticsExcluded = 'true';
  emit('email_click');
  assert.equal(clarity.length, 3);
});

test('public HTML masks the full recording and private HTML excludes Clarity', () => {
  for (const [, html, path] of buildPages()) {
    if (!path || path === '/privacy') assert.doesNotMatch(html, /ziuecx6j9o/);
    else assert.match(html, /<body[^>]*data-clarity-mask="true"/);
  }
});
