import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8')
);

test('the misspelled contact-us path redirects to the real contact page', () => {
  const redirects = config.redirects || [];
  const hit = redirects.find((r) => r.source === '/contact-us');
  assert.ok(hit, '/contact-us must redirect, otherwise it 404s for anyone typing or linking it');
  assert.equal(hit.destination, '/contact');
});

test('every redirect points at a destination that is not itself redirected', () => {
  const destinations = new Set((config.redirects || []).map((r) => r.destination));
  for (const r of config.redirects || []) {
    assert.ok(!destinations.has(r.source), `${r.source} redirects into another redirect: ${r.destination}`);
  }
});

test('security headers are set on every response', () => {
  const catchAll = (config.headers || []).find((h) => h.source === '/(.*)');
  assert.ok(catchAll, 'a catch-all header rule must exist');
  const keys = new Set(catchAll.headers.map((h) => h.key.toLowerCase()));
  for (const required of ['x-content-type-options', 'referrer-policy', 'x-frame-options']) {
    assert.ok(keys.has(required), `missing ${required} on the catch-all rule`);
  }
});

test('a report-only Content-Security-Policy is present', () => {
  const catchAll = (config.headers || []).find((h) => h.source === '/(.*)');
  const csp = catchAll.headers.find((h) => h.key.toLowerCase() === 'content-security-policy-report-only');
  assert.ok(csp, 'CSP report-only must be present before any enforcement');
  assert.match(csp.value, /report-uri|report-to/);
});

test('the hq dashboard stays uncached, noindex and unframeable', () => {
  const hq = (config.headers || []).find((h) => h.source === '/hq(.*)');
  assert.ok(hq, '/hq must have its own header rule');
  const byKey = Object.fromEntries(hq.headers.map((h) => [h.key.toLowerCase(), h.value]));
  assert.equal(byKey['x-robots-tag'], 'noindex, nofollow');
  assert.equal(byKey['cache-control'], 'no-store');
  assert.equal(byKey['x-frame-options'], 'DENY');
});