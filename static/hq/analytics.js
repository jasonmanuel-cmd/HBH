// Uses the existing HQ session. Aggregates are proxied by the server; no cross-site credentials reach this page.
let analyticsRequest = 0;
const duration = (value) => {
  const seconds = Math.max(0, Number(value) || 0);
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

async function loadAnalytics() {
  const request = ++analyticsRequest;
  const days = $('#analytics-days').value;
  const site = $('#analytics').dataset.site || 'harbison_standard';
  const label = site === 'call_harbison' ? 'Call Harbison' : 'Harbison Standard';
  $('#analytics-title').textContent = `${label} website stats`;
  $('#analytics-source').textContent = `${site === 'call_harbison' ? 'www.callharbison.com' : 'www.harbisonstandard.com'} · recorded first-party analytics`;
  $('#analytics-status').textContent = 'Loading…';
  $('#analytics-error').hidden = true;
  $('#analytics-content').hidden = true;
  try {
    const result = await api('analytics', { params: { days, site } });
    if (request !== analyticsRequest || $('#analytics').hidden || $('#analytics').dataset.site !== site) return;
    const data = result.analytics;
    const totals = data.totals;
    const number = (value) => Number(value || 0).toLocaleString('en-US');
    const cards = [
      ['Sessions', number(totals.sessions)], ['Daily visitor estimates (sum)', number(totals.uniqueVisitors)],
      ['Page views', number(totals.pageViews)], ['Pages per session', Number(totals.pagesPerSession || 0).toFixed(2)],
      ['Average time on site', duration(totals.avgDurationSeconds)], ['Median time on site', duration(totals.medianDurationSeconds)],
      ['Total time on site', duration(totals.totalDurationSeconds)],
    ];
    $('#analytics-kpis').innerHTML = cards.map(([label, value]) => `<div class="kpi"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`).join('');
    const max = Math.max(1, ...data.daily.map((day) => Number(day.sessions) || 0));
    $('#analytics-traffic').innerHTML = totals.sessions ? `<div class="analytics-chart" role="img" aria-label="Daily website sessions over the last ${Number(days)} days">${data.daily.map((day) => `<div style="height:${Math.max(0, (Number(day.sessions) || 0) / max * 100)}%" title="${esc(day.day)}: ${number(day.sessions)} sessions"><span class="sr-only">${esc(day.day)}: ${number(day.sessions)} sessions</span></div>`).join('')}</div><div class="spark-l"><span>${esc(data.daily[0]?.day)}</span><span>${esc(data.daily[data.daily.length - 1]?.day)}</span></div>` : '<p class="empty">No website sessions were recorded in this date range.</p>';
    const groups = [
      ['How they arrived', data.referrers], ['Top referring sites', data.referrerHosts], ['Campaigns (UTM)', data.campaigns],
      ['Countries', data.countries], ['States / regions', data.regions], ['Cities', data.cities],
      ['Devices', data.devices], ['Browsers', data.browsers], ['Operating systems', data.operatingSystems],
      ['Most viewed pages', data.topPages], ['Entry pages', data.entryPages], ['Exit pages', data.exitPages],
      ['By hour (UTC)', (data.hourlyUtc || []).map((entry) => ({ key: `${entry.hour}:00`, value: entry.value }))],
    ];
    $('#analytics-groups').innerHTML = groups.map(([title], i) => `<div class="card"><h3>${esc(title)}</h3><div class="bars" id="analytics-group-${i}"></div></div>`).join('');
    groups.forEach(([, entries], i) => {
      const values = Object.fromEntries((entries || []).map((entry) => [entry.key, Number(entry.value) || 0]));
      bars($(`#analytics-group-${i}`), values);
    });
    $('#analytics-content').hidden = false;
    $('#analytics-status').textContent = `Updated ${new Date(data.generatedAt || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } catch (error) {
    if (request !== analyticsRequest) return;
    $('#analytics-status').textContent = '';
    $('#analytics-error').textContent = error.message || 'Website stats could not be loaded.';
    $('#analytics-error').hidden = false;
  }
}
$('#analytics-days').addEventListener('change', loadAnalytics);
$('#analytics-refresh').addEventListener('click', loadAnalytics);
