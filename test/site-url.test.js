import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSiteUrl } from '../site.config.mjs';

test('site URL is always absolute https on the www host', () => {
  assert.equal(normalizeSiteUrl('callharbison.com'), 'https://www.callharbison.com');
  assert.equal(normalizeSiteUrl('http://callharbison.com/'), 'https://www.callharbison.com');
  assert.equal(normalizeSiteUrl('https://www.callharbison.com/'), 'https://www.callharbison.com');
  assert.equal(normalizeSiteUrl('  www.callharbison.com  '), 'https://www.callharbison.com');
  assert.equal(normalizeSiteUrl(''), 'https://www.callharbison.com');
  assert.equal(normalizeSiteUrl(undefined), 'https://www.callharbison.com');
});

test('preview and local hosts are left alone', () => {
  assert.equal(normalizeSiteUrl('harbison-buys-homes.vercel.app'), 'https://harbison-buys-homes.vercel.app');
  assert.equal(normalizeSiteUrl('http://localhost:3000'), 'http://localhost:3000');
});
