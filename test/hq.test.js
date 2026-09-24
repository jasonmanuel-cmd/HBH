import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { makeSession, readSession, passwordMatches, cleanPatch, computeStats } from '../api/hq.js';

const env = { HQ_PASSWORD: 'correct horse battery staple', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };

function call(req, e = env) {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return handler({ headers: {}, ...req }, res, e).then(() => res);
}

test('sessions: valid, tampered, expired, and invalidated by a password change', () => {
  const tok = makeSession('Nate', env);
  assert.equal(readSession(tok, env).n, 'Nate');
  const [p, s] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ n: 'Mallory', exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal(readSession(`${forged}.${s}`, env), null);
  assert.equal(readSession(`${p}.${s}x`, env), null);
  assert.equal(readSession(makeSession('Nate', env, Date.now() - 13 * 3600e3), env), null);
  assert.equal(readSession(tok, { ...env, HQ_PASSWORD: 'new password' }), null);
});

test('password check', () => {
  assert.equal(passwordMatches('correct horse battery staple', env), true);
  assert.equal(passwordMatches('wrong', env), false);
  assert.equal(passwordMatches(undefined, env), false);
  assert.equal(passwordMatches('anything', { ...env, HQ_PASSWORD: '' }), false);
});

test('edits are whitelisted and validated', () => {
  const { patch, bad } = cleanPatch({ status: 'qualified', offer_amount: '185000.456', next_followup: '2026-10-01T16:00:00.000Z', notes: '  hi ', id: 'x', created_at: 'x', consent_response: true });
  assert.deepEqual(bad, []);
  assert.deepEqual(Object.keys(patch).sort(), ['next_followup', 'notes', 'offer_amount', 'status']);
  assert.equal(patch.offer_amount, 185000.46);
  assert.equal(patch.notes, 'hi');
  assert.deepEqual(cleanPatch({ status: 'bogus', offer_amount: 'abc', name: '' }).bad.sort(), ['name', 'offer_amount', 'status']);
  assert.ok(cleanPatch({ status: 'closed_won' }).patch.closed_at);
  assert.equal(cleanPatch({ next_followup: '' }).patch.next_followup, null);
});

test('unconfigured HQ explains what to set', async () => {
  const res = await call({ method: 'GET', url: '/api/hq?action=me' }, {});
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /HQ_PASSWORD/);
});

test('data endpoints require a session; writes also require the X-HQ header', async () => {
  assert.equal((await call({ method: 'GET', url: '/api/hq?action=leads' })).statusCode, 401);
  const cookie = `hq_session=${makeSession('Nate', env)}`;
  const noHeader = await call({ method: 'PATCH', url: '/api/hq?action=lead&id=00000000-0000-4000-8000-000000000000', headers: { cookie }, body: { status: 'qualified' } });
  assert.equal(noHeader.statusCode, 403);
  const badId = await call({ method: 'GET', url: '/api/hq?action=lead&id=1;drop', headers: { cookie } });
  assert.equal(badId.statusCode, 400);
});

test('login sets a secure HttpOnly cookie; wrong password does not', async () => {
  const bad = await call({ method: 'POST', url: '/api/hq?action=login', body: { password: 'nope' }, headers: { 'x-forwarded-for': '10.0.0.9' } });
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.headers['Set-Cookie'], undefined);
  const ok = await call({ method: 'POST', url: '/api/hq?action=login', body: { password: env.HQ_PASSWORD, name: 'Nate' } });
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
});

test('dashboard math', () => {
  const now = Date.parse('2026-09-24T18:00:00Z');
  const h = (x) => new Date(now - x * 3600e3).toISOString();
  const s = computeStats([
    { created_at: h(1), status: 'new', channel: 'organic' },
    { created_at: h(30), status: 'connected', channel: 'google_ads', first_contact_at: h(29.5), next_followup: h(1), route_interest: 'direct' },
    { created_at: h(200), status: 'closed_won', channel: 'partner', first_contact_at: h(199), gross_profit: 20000, closed_at: h(100) },
    { created_at: h(2), status: 'spam', channel: 'direct' },
  ], now);
  assert.equal(s.new7, 2);
  assert.equal(s.uncontacted, 1);
  assert.equal(s.followupsDue, 1);
  assert.equal(s.openPipeline, 2);
  assert.equal(s.won90, 1);
  assert.equal(s.grossProfit90, 20000);
  assert.equal(s.medianMinutesToContact, 30);
  assert.deepEqual(s.byRoute, { direct: 1 });
  assert.equal(s.byChannel.direct, undefined); // spam excluded
});
