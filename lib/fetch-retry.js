// Bounded fetch helper with timeout + single retry on transient network/429/5xx failures.
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchWithRetry(url, init = {}, { retries = 1, backoffMs = 200, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        ...(init.signal ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
      });
      if (res.ok || !TRANSIENT.has(res.status) || attempt === retries) return res;
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    } catch (err) {
      lastErr = err;
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}
