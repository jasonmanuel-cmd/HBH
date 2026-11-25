import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export const origin = 'https://www.callharbison.com';
export const key = '79b16ca590874ec787d3b250cf98076a';
const keyLocation = `${origin}/${key}.txt`;
const endpoint = 'https://api.indexnow.org/indexnow';

function allowed(url) {
  const path = url.slice(origin.length);
  return url.startsWith(origin + '/')
    && /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(path)
    && !/^\/(?:es\/)?(?:hq|api|private|admin|auth|thank-you|family-property-guide)(?:\/|$)/.test(path);
}

export function indexNowEntry(url, html, markdown) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  if (!allowed(url) || !head.includes(`<link rel="canonical" href="${url}">`)
      || /<meta\b[^>]*name="(?:robots|bingbot|googlebot)"[^>]*content="[^"]*\b(?:noindex|none)\b/i.test(head)) {
    return null;
  }

  const metadata = head.match(/<title>[\s\S]*?<\/title>|<meta name="description"[^>]*>|<script type="application\/ld\+json">[\s\S]*?<\/script>/gi) ?? [];
  const hash = createHash('sha256').update(JSON.stringify([markdown, ...metadata])).digest('hex');
  return { url, hash };
}

export function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)
      || !Object.hasOwn(manifest, origin + '/') || !Object.hasOwn(manifest, origin + '/es')
      || Object.keys(manifest).length > 10_000
      || Object.entries(manifest).some(([url, hash]) => !allowed(url) || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Invalid IndexNow content manifest');
  }
  return manifest;
}

export async function publishChanges(previous, current, { request = fetch, pause = sleep, log = console.log } = {}) {
  const get = (url) => request(url, {
    redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  const changed = Object.keys(current).filter((url) => current[url] !== previous[url]);
  let removed = 0;
  for (const url of Object.keys(previous).filter((url) => !Object.hasOwn(current, url) && allowed(url))) {
    const response = await get(url);
    await response.body?.cancel();
    if ([404, 410].includes(response.status)) {
      changed.push(url);
      removed++;
    } else if (response.status !== 200 && ![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error(`Cannot verify removal for ${url} (HTTP ${response.status})`);
    }
  }
  log(`IndexNow: ${changed.length} eligible changes, including ${removed} confirmed removals.`);
  if (!changed.length) return;

  if (changed.length > 10_000) throw new Error('IndexNow batch exceeds protocol limit');
  const verification = await get(keyLocation);
  if (verification.status !== 200 || await verification.text() !== key) {
    throw new Error(`IndexNow verification key check failed (HTTP ${verification.status})`);
  }
  const body = JSON.stringify({ host: new URL(origin).hostname, key, keyLocation, urlList: changed });
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await request(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json; charset=utf-8' }, body,
      });
    } catch (error) {
      if (attempt === 3) throw error;
      log(`IndexNow attempt ${attempt}: transport failure; retrying.`);
    }
    if (response) {
      await response.body?.cancel();
      const { status } = response;
      log(`IndexNow attempt ${attempt}: HTTP ${status} for ${changed.length} URLs.`);
      if (status === 200 || status === 202) return status;
      const reason = { 400: 'invalid request', 403: 'key verification rejected', 422: 'URL or key mismatch' }[status];
      if (reason || (status !== 429 && status < 500) || attempt === 3) {
        throw new Error(`IndexNow HTTP ${status}${reason ? ' (' + reason + ')' : ''}`);
      }
      const retryAfter = response.headers.get('Retry-After');
      const wait = retryAfter && (/^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now());
      if (wait > 30_000) throw new Error(`IndexNow HTTP ${status}: retry deferred to next production check`);
      await pause(Math.max(wait || 0, attempt * 2000));
    } else {
      await pause(attempt * 2000);
    }
  }
}
