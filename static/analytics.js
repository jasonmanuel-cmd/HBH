// Recorded page views only: no customer/form fields, cookies, or cross-site IDs.
(() => {
  if (!['www.callharbison.com', 'callharbison.com'].includes(location.hostname) || /^\/(hq|api)(\/|$)/.test(location.pathname)) return;
  let optedOut = false;
  const allowed = () => {
    if (optedOut) return false;
    try { return navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl && localStorage.getItem('hbh_analytics') !== 'off'; }
    catch { return false; }
  };
  document.querySelector('[data-analytics-optout]')?.addEventListener('click', event => {
    optedOut = true;
    try { localStorage.setItem('hbh_analytics', 'off'); } catch {}
    event.target.textContent = 'First-party analytics disabled in this browser';
  });
  if (!allowed()) return;
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
      const response = await fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, type, path: location.pathname, pageToken: token, ...extra }) });
      const result = await response.json();
      if (!response.ok || !result.stored) throw new Error('Analytics not recorded');
    }).catch(() => {});
  };
  let host = null;
  try { host = document.referrer ? new URL(document.referrer).hostname : null; } catch {}
  const referrerType = !host || host === location.hostname ? 'direct' : /google|bing|duckduckgo|yahoo/.test(host) ? 'search'
    : /youtube|facebook|instagram|linkedin|tiktok|reddit/.test(host) ? 'social' : 'referral';
  const params = new URLSearchParams(location.search);
  if (first) send('start', { referrerHost: host, referrerType, utm: Object.fromEntries(['source', 'medium', 'campaign'].map(k => [k, params.get(`utm_${k}`)])) });
  send('pageview', { title: document.title });
  let activeSince = document.hidden ? null : Date.now();
  let seconds = 0;
  const flush = () => {
    if (activeSince !== null) { seconds += Math.max(0, (Date.now() - activeSince) / 1000); activeSince = null; }
    send('heartbeat', { durationSeconds: Math.min(1800, Math.round(seconds)) });
    try { sessionStorage.setItem('hbh_analytics_last', String(Date.now())); } catch {}
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else activeSince = Date.now(); });
  window.addEventListener('pagehide', flush);
  setInterval(() => { if (!document.hidden) { flush(); activeSince = Date.now(); } }, 15000);
})();
