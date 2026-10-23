// Spoof-resistant client IP resolution + bounded in-memory sliding-window rate limiter.
// On Vercel, x-real-ip is set by the edge proxy; if falling back to x-forwarded-for, take the
// rightmost (proxy-appended) address so a client cannot rotate a spoofed leftmost header.

export function clientIp(req) {
  const realIp = req?.headers?.['x-real-ip'] || req?.headers?.['x-vercel-forwarded-for'];
  if (realIp) return String(realIp).split(',').at(-1).trim();
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',').at(-1).trim();
  const remote = req?.socket?.remoteAddress;
  return remote ? String(remote).trim() : '';
}

export function createRateLimiter({ max, windowMs, maxEntries = 5000 }) {
  const buckets = new Map();

  function sweep(now) {
    if (buckets.size <= maxEntries) return;
    for (const [k, v] of buckets) {
      if (now > v.reset) buckets.delete(k);
    }
    while (buckets.size > maxEntries) {
      const oldest = buckets.keys().next().value;
      buckets.delete(oldest);
    }
  }

  return {
    isLimited(key, now = Date.now()) {
      if (!key) return false;
      const entry = buckets.get(key);
      if (!entry || now > entry.reset) return false;
      return entry.count >= max;
    },
    hit(key, now = Date.now()) {
      if (!key) return { limited: false, count: 0 };
      const entry = buckets.get(key);
      if (!entry || now > entry.reset) {
        sweep(now);
        buckets.set(key, { count: 1, reset: now + windowMs });
        return { limited: false, count: 1 };
      }
      entry.count += 1;
      return { limited: entry.count > max, count: entry.count };
    },
    reset() {
      buckets.clear();
    },
  };
}
