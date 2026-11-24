// Recorded page views only: no customer/form fields, cookies, or cross-site IDs.
(() => {
  if (!['www.callharbison.com', 'callharbison.com', 'www.harbisonstandard.com', 'harbisonstandard.com'].includes(location.hostname)) return;
  let optedOut = false;
  const allowed = () => {
    if (optedOut) return false;
    try { return typeof window.hbhOk === 'function' && window.hbhOk() && localStorage.getItem('hbh_analytics') !== 'off' && !String(localStorage.getItem('hbh-consent') || '').includes('"denied"'); }
    catch { return false; }
  };
  document.querySelector('[data-analytics-optout]')?.addEventListener('click', (event) => {
    optedOut = true;
    try { localStorage.setItem('hbh_analytics', 'off'); } catch {}
    location.reload();
  });
  if (document.body.dataset.analyticsExcluded === 'true') return;
  let started = false;
  const start = () => {
    if (started || !allowed()) return;
    started = true;
    let sid, first;
    try {
      const last = Number(sessionStorage.getItem('hbh_analytics_last')) || 0;
      sid = sessionStorage.getItem('hbh_analytics_sid');
      first = !sid || Date.now() - last > 30 * 60000;
      if (first) { sid = crypto.randomUUID(); sessionStorage.setItem('hbh_analytics_sid', sid); }
      sessionStorage.setItem('hbh_analytics_last', String(Date.now()));
    } catch { return; }
    let queue = Promise.resolve();
    const token = crypto.randomUUID();
    const send = (type, extra = {}) => {
      if (!allowed()) return;
      queue = queue.catch(() => {}).then(async () => {
        if (!allowed()) return;
        const response = await fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid, type, path: location.pathname, pageToken: token, consent: true, ...extra }) });
        const result = await response.json();
        if (!response.ok || !result.stored) throw new Error('Analytics not recorded');
      }).catch(() => {});
    };
    let host = null;
    try { host = document.referrer ? new URL(document.referrer).hostname : null; } catch {}
    const referrerType = !host || host === location.hostname ? 'direct' : /google|bing|duckduckgo|yahoo/.test(host) ? 'search'
      : /youtube|facebook|instagram|linkedin|tiktok|reddit/.test(host) ? 'social' : 'referral';
    // Raw campaign parameters may contain contact data; retain them only with the inquiry in CRM.
    if (first) send('start', { referrerType });
    send('pageview');

    const MAX_SECONDS = 1800;
    const IDLE_MS = 60000;
    let activeSince = document.hidden ? null : Date.now();
    let lastInteraction = Date.now();
    let seconds = 0;
    let lastSentSeconds = -1;

    const markInteraction = () => {
      const now = Date.now();
      if (!document.hidden && activeSince === null && seconds < MAX_SECONDS) activeSince = now;
      lastInteraction = now;
    };
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, markInteraction, { passive: true }));

    const accrue = (now = Date.now()) => {
      if (activeSince !== null) {
        const effectiveEnd = Math.min(now, lastInteraction + IDLE_MS);
        if (effectiveEnd > activeSince) seconds = Math.min(MAX_SECONDS, seconds + (effectiveEnd - activeSince) / 1000);
        activeSince = !document.hidden && now - lastInteraction < IDLE_MS && seconds < MAX_SECONDS ? now : null;
      }
    };

    let timer;
    const flush = () => {
      accrue();
      const rounded = Math.min(MAX_SECONDS, Math.round(seconds));
      if (rounded !== lastSentSeconds) {
        lastSentSeconds = rounded;
        send('heartbeat', { durationSeconds: rounded });
      }
      try { sessionStorage.setItem('hbh_analytics_last', String(Date.now())); } catch {}
      if (seconds >= MAX_SECONDS && timer) { clearInterval(timer); timer = null; }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { accrue(); activeSince = null; flush(); }
      else { lastInteraction = Date.now(); if (seconds < MAX_SECONDS) activeSince = Date.now(); }
    });
    window.addEventListener('pagehide', flush);
    timer = setInterval(() => { if (!document.hidden) flush(); }, 15000);
  };
  window.addEventListener('hbh-analytics-consent', start);
  start();
})();
