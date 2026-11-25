import assert from 'node:assert/strict';
import test from 'node:test';
import { indexNowEntry, key, origin, publishChanges, validateManifest } from '../lib/indexnow.mjs';

const home = origin + '/';
const spanish = origin + '/es';
const contact = origin + '/contact';
const removed = origin + '/former-page';
const hash = 'a'.repeat(64);
const head = (url, extra = '') => `<head><link rel="canonical" href="${url}"><title>Homes</title>${extra}</head>`;
const verify = () => new Response(key);

test('IndexNow hashes content and metadata while excluding unsafe or noncanonical entries', () => {
  const entry = indexNowEntry(home, head(home), 'Offer');
  assert.equal(entry.hash, indexNowEntry(home, head(home) + '<script>tracking()</script>', 'Offer').hash);
  assert.notEqual(entry.hash, indexNowEntry(home, head(home), 'Updated offer').hash);
  assert.notEqual(entry.hash, indexNowEntry(home, head(home, '<meta name="description" content="Updated">'), 'Offer').hash);
  for (const url of [origin + '/hq/login', origin + '/api/track', origin + '/es/thank-you',
    origin + '/family-property-guide', home + '?preview=1', 'https://callharbison.com/']) {
    assert.equal(indexNowEntry(url, head(url), 'Offer'), null);
  }
  assert.equal(indexNowEntry(contact, head(home), 'Offer'), null);
  assert.equal(indexNowEntry(home, head(home, '<meta name="robots" content="noindex,follow">'), 'Offer'), null);
  assert.throws(() => validateManifest({ [home]: hash }), /Invalid/);
  assert.doesNotThrow(() => validateManifest({ [home]: hash, [spanish]: hash }));
});

test('IndexNow submits new and materially changed pages plus confirmed removals', async () => {
  const redirected = origin + '/moved-page';
  const excluded = origin + '/new-noindex';
  const previous = { [home]: hash, [spanish]: hash, [removed]: hash, [redirected]: hash, [excluded]: hash };
  const current = { [home]: hash, [spanish]: 'b'.repeat(64), [contact]: hash };
  const calls = [];
  const status = await publishChanges(previous, current, {
    log() {},
    request(url, options) {
      calls.push(url);
      if (url === removed) return new Response(null, { status: 410 });
      if (url === redirected) return new Response(null, { status: 301 });
      if (url === excluded) return new Response(null, { status: 200 });
      if (url === origin + '/' + key + '.txt') return verify();
      assert.equal(url, 'https://api.indexnow.org/indexnow');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body).urlList, [spanish, contact, removed]);
      return new Response(null, { status: 202 });
    },
  });
  assert.equal(status, 202);
  assert.equal(calls.at(-2), origin + '/' + key + '.txt');
  await publishChanges(current, current, { log() {}, request: () => assert.fail('Unchanged pages made a request') });
});

test('IndexNow verifies the key and bounds retries for rate limits and server errors', async () => {
  const current = { [home]: hash };
  let attempts = 0;
  const waits = [];
  const status = await publishChanges({}, current, {
    log() {},
    pause: async (ms) => waits.push(ms),
    request(url) {
      if (url.endsWith('.txt')) return verify();
      const status = [429, 503, 200][attempts++];
      return new Response(null, { status, headers: { 'Retry-After': '3' } });
    },
  });
  assert.equal(status, 200);
  assert.deepEqual(waits, [3000, 4000]);
  for (const status of [400, 403, 422, 429]) {
    let posts = 0;
    await assert.rejects(publishChanges({}, current, {
      log() {},
      pause: async () => {},
      request(url) {
        if (url.endsWith('.txt')) return verify();
        posts++;
        return new Response(null, { status });
      },
    }), new RegExp(`HTTP ${status}`));
    assert.equal(posts, status === 429 ? 3 : 1);
  }
  await assert.rejects(publishChanges({}, current, {
    log() {},
    request(url) {
      assert.ok(url.endsWith('.txt'));
      return new Response('incorrect');
    },
  }), /key check failed/);
});
