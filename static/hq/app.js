// Harbison HQ — dashboard + shared CRM. Talks only to /api/hq (session cookie, same origin).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STAGES = {
  new: 'New', contact_attempted: 'Contact attempted', connected: 'Connected', qualified: 'Qualified',
  appointment_set: 'Appointment set', property_reviewed: 'Property reviewed', options_presented: 'Options presented',
  nurture: 'Nurture', under_contract: 'Under contract', closed_won: 'Closed — won', closed_lost: 'Closed — lost',
  not_a_fit: 'Not a fit', spam: 'Spam',
};
const ROUTES = { direct: 'Sell direct', listing: 'List', renovate: 'Renovate then sell', development: 'Development', not_ready: 'Not ready yet' };
const BRANDS = { harbison_standard: 'Harbison Standard', call_harbison: 'Call Harbison' };
const brandOf = (l) => (l.form_type === 'harbison_standard' ? 'harbison_standard' : 'call_harbison');
const pillClass = (s) => (s === 'new' ? 'new' : s === 'closed_won' ? 'won' : ['closed_lost', 'not_a_fit', 'spam'].includes(s) ? 'lost' : ['appointment_set', 'options_presented', 'under_contract'].includes(s) ? 'hot' : '');
const pill = (s) => `<span class="pill ${pillClass(s)}">${esc(STAGES[s] || s)}</span>`;
const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const when = (iso, withTime = true) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', withTime ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' });
};
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const digits = (p) => String(p || '').replace(/[^\d+]/g, '');
const leadSubline = (l) => l.address || [BRANDS[brandOf(l)], l.situation || l.email].filter(Boolean).join(' · ') || 'General inquiry';

async function api(action, { method = 'GET', params = {}, body } = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`/api/hq?${qs}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json', 'X-HQ': '1' } : { 'X-HQ': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, error: 'Unexpected response' }));
  if (res.status === 401 && action !== 'login') { showLogin(); throw new Error(json.error || 'Signed out'); }
  if (!res.ok || !json.ok) throw Object.assign(new Error(json.error || 'Request failed'), { status: res.status });
  return json;
}

// ---------- URL routing ----------
function tabFromLocation() {
  const p = location.pathname;
  if (p.endsWith('/call-harbison')) return 'analytics-call';
  if (p.endsWith('/harbison-standard')) return 'analytics-standard';
  if (p.endsWith('/leads')) return 'leads';
  if (p.endsWith('/partners')) return 'partners';
  const t = new URLSearchParams(location.search).get('tab');
  return ['dash', 'leads', 'partners', 'analytics-standard', 'analytics-call'].includes(t) ? t : 'dash';
}

function syncUrl({ tab, leadId, replace = false } = {}) {
  const activeTab = tab || document.querySelector('[data-tab][aria-selected="true"]')?.dataset.tab || 'dash';
  let path = '/hq';
  if (activeTab === 'analytics-call') path = '/hq/stats/call-harbison';
  else if (activeTab === 'analytics-standard') path = '/hq/stats/harbison-standard';
  else if (activeTab === 'leads') path = '/hq/leads';
  else if (activeTab === 'partners') path = '/hq/partners';

  const sp = new URLSearchParams();
  if (activeTab === 'leads') {
    if (list.view && list.view !== 'open') sp.set('view', list.view);
    if (list.brand) sp.set('brand', list.brand);
    if (list.status) sp.set('status', list.status);
    if (list.q) sp.set('q', list.q);
  }
  const openId = leadId !== undefined ? leadId : current?.id;
  if (openId) sp.set('lead', openId);
  const next = `${path}${sp.toString() ? `?${sp}` : ''}`;
  if (`${location.pathname}${location.search}` !== next) {
    history[replace ? 'replaceState' : 'pushState']({}, '', next);
  }
}

// ---------- auth ----------
function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-err').textContent = msg;
  $('#login-password').value = '';
  ($('#login-name').value ? $('#login-password') : $('#login-name')).focus();
}
function showApp(name) {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who').textContent = name;
  try { localStorage.setItem('hq_name', name); } catch {}
  const sp = new URLSearchParams(location.search);
  if (sp.get('view')) list.view = sp.get('view');
  if (sp.get('brand')) { list.brand = sp.get('brand'); $('#brand').value = list.brand; }
  if (sp.get('status')) { list.status = sp.get('status'); $('#stage-filter').value = list.status; }
  if (sp.get('q')) { list.q = sp.get('q'); $('#q').value = list.q; }
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === list.view)));
  openTab(tabFromLocation(), false);
  const deepLead = sp.get('lead');
  if (deepLead) openLead(deepLead, false);
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  $('#login-err').textContent = '';
  try {
    const r = await api('login', { method: 'POST', body: { name: $('#login-name').value, password: $('#login-password').value } });
    showApp(r.name);
  } catch (err) {
    $('#login-err').textContent = err.message;
    $('#login-password').select();
  } finally {
    btn.disabled = false;
  }
});
$('#logout').addEventListener('click', async () => {
  await api('logout', { method: 'POST' }).catch(() => {});
  showLogin('Signed out.');
});

// ---------- tabs ----------
function openTab(name, navigate = true) {
  const analytics = name.startsWith('analytics-');
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $('#dash').hidden = name !== 'dash';
  $('#leads').hidden = name !== 'leads';
  $('#partners').hidden = name !== 'partners';
  $('#analytics').hidden = !analytics;
  if (navigate) syncUrl({ tab: name });
  if (name === 'dash') loadDash();
  if (name === 'leads') loadLeads(true);
  if (name === 'partners') loadPartners();
  if (analytics) {
    $('#analytics').dataset.site = name === 'analytics-call' ? 'call_harbison' : 'harbison_standard';
    $('#analytics').setAttribute('aria-labelledby', name === 'analytics-call' ? 'tab-analytics-call' : 'tab-analytics');
    loadAnalytics();
  }
}
window.addEventListener('popstate', () => {
  const sp = new URLSearchParams(location.search);
  const leadParam = sp.get('lead');
  if (!leadParam && !$('#drawer').hidden) closeDrawer(false);
  else if (leadParam && current?.id !== leadParam) openLead(leadParam, false);
  openTab(tabFromLocation(), false);
});
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));

// ---------- dashboard ----------
const bars = (el, obj, labels = {}) => {
  const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  el.innerHTML = rows.length
    ? rows.map(([k, n]) => `<div class="bar"><span>${esc(labels[k] || k.replace(/_/g, ' '))}</span><span class="track"><span class="fill" style="width:${(n / max) * 100}%"></span></span><span class="n">${n}</span></div>`).join('')
    : '<p class="empty">Nothing yet.</p>';
};

async function loadDash() {
  let d;
  try { d = await api('stats'); } catch (e) { $('#kpis').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const s = d.stats;
  const kpi = (v, l, { go, alert } = {}) => `<div class="kpi${alert ? ' alert' : ''}"${go ? ` data-go="${go}" role="button" tabindex="0"` : ''}><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`;
  $('#kpis').innerHTML = [
    kpi(s.uncontacted, 'Waiting for first contact', { go: 'new', alert: s.uncontacted > 0 }),
    kpi(s.followupsDue, 'Follow-ups due', { go: 'followups', alert: s.followupsDue > 0 }),
    kpi(s.newToday, 'New today', { go: 'new' }),
    kpi(s.new7, 'New · 7 days', { go: 'all' }),
    kpi(s.openPipeline, 'Open pipeline', { go: 'open' }),
    kpi(s.appointments7, 'Appointments · next 7 days', { go: 'open' }),
    kpi(s.medianMinutesToContact == null ? '—' : `${s.medianMinutesToContact}m`, 'Median time to first contact · 30d'),
    kpi(money(s.grossProfit90), `Gross profit · ${s.won90} closed · 90d`, { go: 'closed' }),
  ].join('');
  document.querySelectorAll('.kpi[data-go]').forEach((k) => {
    const go = () => { setView(k.dataset.go, false); openTab('leads'); };
    k.addEventListener('click', go);
    k.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  const max = Math.max(1, ...s.weekly.map((w) => w.leads));
  $('#spark').innerHTML = s.weekly.map((w) => `<div style="height:${Math.max(2, (w.leads / max) * 100)}%" title="Week ending ${esc(w.weekEnding)}: ${w.leads} leads"><span class="sr-only">Week ending ${esc(w.weekEnding)}: ${w.leads} leads</span></div>`).join('');
  $('#spark-l').innerHTML = `<span>${esc(when(s.weekly[0].weekEnding, false))}</span><span>This week: ${s.weekly[s.weekly.length - 1].leads}</span>`;

  $('#waiting').innerHTML = d.waiting.length
    ? d.waiting.map((l) => `<li data-id="${esc(l.id)}"><span><strong>${esc(l.name)}</strong><br><span class="muted">${esc(leadSubline(l))}</span></span><span class="t due">${esc(l.minutes_waiting)} min</span></li>`).join('')
    : '<li class="empty">Everyone has been contacted.</li>';
  $('#upcoming').innerHTML = d.upcoming.length
    ? d.upcoming.map((l) => `<li data-id="${esc(l.id)}"><span><strong>${esc(l.name)}</strong><br><span class="muted">${esc(leadSubline(l))}</span></span><span class="t">${esc(when(l.appointment_at))}</span></li>`).join('')
    : '<li class="empty">No appointments scheduled.</li>';
  bars($('#by-status'), s.byStatus, STAGES);
  bars($('#by-channel'), s.byChannel);
  bars($('#by-route'), s.byRoute, ROUTES);
  bars($('#by-brand'), s.byBrand, BRANDS);
  loadHealth();
}

async function loadHealth() {
  const el = $('#health-items');
  if (!el) return;
  try {
    const { health: h } = await api('health');
    const badge = (ok, text, warn = false) => `<span class="pill ${ok ? (warn ? 'hot' : 'won') : 'bad-p'}">${esc(text)}</span>`;
    const emailLabel = !h.email.configured
      ? 'Email alerts: off (RESEND_API_KEY unset)'
      : h.email.sandboxSender
        ? `Email alerts: sandbox sender (verify LEAD_FROM_EMAIL domain)`
        : `Email alerts: ready (${h.email.recipients.join(', ')})`;
    el.innerHTML = [
      badge(true, 'Supabase CRM: connected'),
      badge(h.email.configured, emailLabel, h.email.configured && h.email.sandboxSender),
      badge(h.standardBridge.configured, h.standardBridge.configured ? 'Standard bridge: active' : 'Standard bridge: unset', !h.standardBridge.configured),
      badge(true, h.webhook.configured ? 'Webhook: active' : 'Webhook: optional (off)', false),
      badge(true, h.sms.configured ? `SMS: configured (customer ack ${h.sms.customerAckEnabled ? 'on' : 'off'})` : 'SMS: off', false),
    ].join('');
  } catch {
    el.textContent = 'Could not check integration status.';
  }
}

$('#test-alert-btn')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const msg = $('#test-alert-msg');
  btn.disabled = true;
  msg.textContent = 'Sending…';
  msg.className = 'status-msg';
  try {
    const r = await api('test-alert', { method: 'POST', body: {} });
    msg.textContent = (r.channels || []).map((c) => c.detail).join(' · ') || 'Test alert sent.';
    msg.className = 'status-msg ok';
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'status-msg bad';
  } finally {
    btn.disabled = false;
  }
});
['#waiting', '#upcoming'].forEach((sel) => $(sel).addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) openLead(li.dataset.id);
}));

// ---------- partners & ROI ----------
$('#s-month').value = new Date().toISOString().slice(0, 7);
async function loadPartners() {
  let r;
  try { r = await api('partners'); } catch (e) {
    $('#partner-rows').innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`;
    return;
  }
  const baseUrl = location.origin.includes('localhost') ? 'https://www.callharbison.com' : location.origin;
  $('#partner-rows').innerHTML = (r.partners || []).length
    ? r.partners.map((p) => `<tr>
        <td><strong>${esc(p.name)}</strong><span class="sub">${esc(p.category.replace(/_/g, ' '))} · <code>${esc(p.slug)}</code></span></td>
        <td><span class="pill ${p.status === 'active' ? 'won' : ''}">${esc(p.status.replace(/_/g, ' '))}</span></td>
        <td class="num-col">${Number(p.inquiries || 0)}</td>
        <td class="num-col">${Number(p.appointments || 0)}</td>
        <td class="num-col">${Number(p.closed || 0)}</td>
        <td class="num-col">${money(p.gross_profit || 0)}</td>
        <td><button type="button" class="btn ghost sm" data-copy="${esc(`${baseUrl}/family?ref=${encodeURIComponent(p.slug)}`)}">Copy link</button></td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="empty">No partners configured yet.</td></tr>';

  $('#funnel-rows').innerHTML = (r.funnel || []).length
    ? r.funnel.map((f) => `<tr>
        <td>${esc(String(f.month).slice(0, 7))}</td>
        <td>${esc(f.channel)}</td>
        <td class="num-col">${Number(f.leads || 0)}</td>
        <td class="num-col">${Number(f.qualified || 0)}</td>
        <td class="num-col">${Number(f.closed || 0)}</td>
        <td class="num-col">${f.spend != null ? money(f.spend) : '—'}</td>
        <td class="num-col">${f.cost_per_lead != null ? money(f.cost_per_lead) : '—'}</td>
        <td class="num-col">${f.roas != null ? `${Number(f.roas).toFixed(2)}×` : '—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty">No funnel activity yet.</td></tr>';
}
$('#partner-rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    const prev = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = prev; }, 1600);
  } catch {}
});
$('#partner-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#p-msg');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  msg.textContent = '';
  try {
    const fd = Object.fromEntries(new FormData(e.target).entries());
    await api('partner', { method: 'POST', body: fd });
    msg.textContent = 'Partner saved.';
    msg.className = 'status-msg ok';
    e.target.reset();
    loadPartners();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'status-msg bad';
  } finally { btn.disabled = false; }
});
$('#spend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#s-msg');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  msg.textContent = '';
  try {
    const fd = Object.fromEntries(new FormData(e.target).entries());
    await api('spend', { method: 'POST', body: fd });
    msg.textContent = 'Spend recorded.';
    msg.className = 'status-msg ok';
    loadPartners();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'status-msg bad';
  } finally { btn.disabled = false; }
});

// ---------- lead list ----------
const list = { view: 'open', q: '', brand: '', status: '', offset: 0, items: [] };
$('#stage-filter').innerHTML = `<option value="">Any stage</option>${Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}`;

function setView(v, reload = true) {
  list.view = v;
  if (v === 'spam' || v === 'trash') { list.status = ''; $('#stage-filter').value = ''; }
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (reload) { syncUrl({ tab: 'leads', replace: true }); loadLeads(true); }
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
let searchTimer;
$('#q').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { list.q = e.target.value; syncUrl({ tab: 'leads', replace: true }); loadLeads(true); }, 250);
});
$('#more').addEventListener('click', () => loadLeads(false));
$('#brand').addEventListener('change', (e) => { list.brand = e.target.value; syncUrl({ tab: 'leads', replace: true }); loadLeads(true); });
$('#stage-filter').addEventListener('change', (e) => { list.status = e.target.value; syncUrl({ tab: 'leads', replace: true }); loadLeads(true); });
$('#export-csv').addEventListener('click', () => {
  const qs = new URLSearchParams({ action: 'export', view: list.view, q: list.q, brand: list.brand, status: list.status });
  location.href = `/api/hq?${qs}`;
});

async function loadLeads(reset) {
  if (reset) { list.offset = 0; list.items = []; }
  let r;
  try {
    r = await api('leads', { params: { view: list.view, q: list.q, brand: list.brand, status: list.status, offset: String(list.offset), limit: '50' } });
  } catch (e) {
    $('#rows').innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`;
    return;
  }
  list.items = list.items.concat(r.leads);
  list.offset += r.leads.length;
  $('#more').hidden = r.leads.length < r.limit;
  $('#leads-empty').hidden = list.items.length > 0;
  const due = (l) => l.next_followup && Date.parse(l.next_followup) <= Date.now();
  // Leads that came in through the Spanish pages (/es/...) are marked so the team replies in Spanish.
  const spanishTag = (l) => (/^\/es(\/|$)/.test(l.source || '') ? ' · Spanish' : '');
  $('#rows').innerHTML = list.items.map((l) => `<tr data-id="${esc(l.id)}">
      <td>${esc(when(l.created_at))}<span class="sub">${esc(ago(l.created_at))}</span></td>
      <td><strong>${esc(l.name)}</strong><span class="sub">${esc(l.phone || l.email)}${spanishTag(l)}</span></td>
      <td>${esc(l.address || 'Not supplied')}</td>
      <td>${esc(l.situation || '—')}${l.route_interest ? `<span class="sub">Path: ${esc(ROUTES[l.route_interest] || l.route_interest)}</span>` : ''}</td>
      <td>${pill(l.status)}${l.do_not_contact ? '<span class="sub due">Do not contact</span>' : ''}</td>
      <td class="${due(l) ? 'due' : ''}">${esc(when(l.next_followup))}</td>
      <td>${esc(BRANDS[brandOf(l)])}<span class="sub">${esc(l.channel || '—')}</span></td></tr>`).join('');
  $('#cards').innerHTML = list.items.map((l) => `<div class="lead-card" data-id="${esc(l.id)}" role="button" tabindex="0">
      <div class="row"><strong>${esc(l.name)}</strong>${pill(l.status)}</div>
      <span class="muted">${esc(BRANDS[brandOf(l)])} · ${esc(l.address || l.email || 'General inquiry')}${spanishTag(l)}</span>
      <div class="row"><span class="muted">${esc(l.situation || '')}</span><span class="${due(l) ? 'due' : 'muted'}">${l.next_followup ? `Follow up ${esc(when(l.next_followup))}` : esc(ago(l.created_at))}</span></div></div>`).join('');
  renderEmptyTrash();
}
['#rows', '#cards'].forEach((sel) => {
  $(sel).addEventListener('click', (e) => { const el = e.target.closest('[data-id]'); if (el) openLead(el.dataset.id); });
  $(sel).addEventListener('keydown', (e) => { const el = e.target.closest('[data-id]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLead(el.dataset.id); } });
});

// ---------- modal / drawer helpers + focus trap ----------
let current = null;
let initialFormValues = {};
let lastFocus = null;
const FIELDS = ['name', 'phone', 'email', 'address', 'situation', 'route_interest', 'status', 'assigned_to', 'next_followup', 'appointment_at', 'estimated_value', 'offer_amount', 'outcome_path', 'closed_value', 'gross_profit', 'lost_reason', 'notes', 'authority_confirmed', 'do_not_contact'];
const statusOptionsHtml = Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
$('#f-status').innerHTML = statusOptionsHtml;
$('#nl-status').innerHTML = statusOptionsHtml;

function activeDialog() {
  if (!$('#drawer').hidden) return $('#drawer');
  if (!$('#new-drawer').hidden) return $('#new-drawer');
  if (!$('#import-drawer').hidden) return $('#import-drawer');
  return null;
}

function closeAllDrawers(updateHistory = true) {
  $('#drawer').hidden = true;
  $('#new-drawer').hidden = true;
  $('#import-drawer').hidden = true;
  $('#scrim').hidden = true;
  current = null;
  if (updateHistory) syncUrl({ leadId: null, replace: true });
  lastFocus?.focus?.();
}
function closeDrawer(updateHistory = true) { closeAllDrawers(updateHistory); }

$('#d-close').addEventListener('click', () => closeAllDrawers(true));
$('#new-close').addEventListener('click', () => closeAllDrawers(true));
$('#import-close').addEventListener('click', () => closeAllDrawers(true));
$('#scrim').addEventListener('click', () => closeAllDrawers(true));

document.addEventListener('keydown', (e) => {
  const dlg = activeDialog();
  if (!dlg) return;
  if (e.key === 'Escape') { e.preventDefault(); closeAllDrawers(true); return; }
  if (e.key === 'Tab') {
    const focusables = [...dlg.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// ---------- manual new-lead drawer ----------
function openNewLeadDrawer() {
  lastFocus = document.activeElement;
  $('#drawer').hidden = true;
  $('#import-drawer').hidden = true;
  $('#new-form').reset();
  $('#nl-assigned_to').value = 'nathanael';
  $('#nl-status').value = 'connected';
  $('#nl-consent_response').checked = true;
  $('#nl-msg').textContent = '';
  $('#nl-msg').className = 'status-msg';
  $('#new-drawer').hidden = false;
  $('#scrim').hidden = false;
  $('#nl-name').focus();
}
$('#top-new-lead').addEventListener('click', openNewLeadDrawer);
$('#leads-new-btn').addEventListener('click', openNewLeadDrawer);

$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#nl-msg');
  const btn = e.target.querySelector('button[type=submit]');
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.consent_response = $('#nl-consent_response').checked;
  if (!body.name.trim()) { msg.textContent = 'Enter a contact name.'; msg.className = 'status-msg bad'; $('#nl-name').focus(); return; }
  if (!body.phone.trim() && !body.email.trim()) { msg.textContent = 'Enter a phone number or email address.'; msg.className = 'status-msg bad'; $('#nl-phone').focus(); return; }
  btn.disabled = true;
  msg.textContent = '';
  try {
    const r = await api('lead', { method: 'POST', body });
    $('#new-drawer').hidden = true;
    if (!$('#leads').hidden) loadLeads(true);
    if (!$('#dash').hidden) loadDash();
    await openLead(r.lead.id);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'status-msg bad';
  } finally {
    btn.disabled = false;
  }
});

// ---------- historical CSV / JSON import drawer ----------
function openImportDrawer() {
  lastFocus = document.activeElement;
  $('#drawer').hidden = true;
  $('#new-drawer').hidden = true;
  $('#imp-msg').textContent = '';
  $('#imp-msg').className = 'status-msg';
  $('#imp-summary').hidden = true;
  $('#imp-summary').innerHTML = '';
  $('#import-drawer').hidden = false;
  $('#scrim').hidden = false;
  $('#imp-raw').focus();
}
$('#import-btn')?.addEventListener('click', openImportDrawer);

$('#imp-file')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $('#imp-raw').value = await file.text();
});

async function runLeadImport(dryRun) {
  const msg = $('#imp-msg');
  const summary = $('#imp-summary');
  const raw = $('#imp-raw').value.trim();
  if (!raw) { msg.textContent = 'Upload or paste CSV / JSON rows first.'; msg.className = 'status-msg bad'; $('#imp-raw').focus(); return; }
  $('#imp-preview-btn').disabled = true;
  $('#imp-run-btn').disabled = true;
  msg.textContent = dryRun ? 'Checking rows…' : 'Importing…';
  msg.className = 'status-msg';
  try {
    const r = await api('import', {
      method: 'POST',
      body: { raw, default_brand: $('#imp-brand').value, dry_run: dryRun },
    });
    const c = r.counts || { ready: 0, duplicates: 0, invalid: 0 };
    if (dryRun) {
      msg.textContent = `${c.ready} ready · ${c.duplicates} duplicate(s) skipped · ${c.invalid} invalid`;
      msg.className = `status-msg ${c.ready ? 'ok' : ''}`;
      const lines = [];
      if (r.preview?.length) {
        lines.push(`<strong>Sample rows ready (${r.preview.length} of ${c.ready}):</strong><ul>${r.preview.map((p) => `<li><strong>${esc(p.name)}</strong> (${esc(p.contact || '—')}) · ${esc(BRANDS[p.brand] || p.brand)} · ${esc(String(p.created_at).slice(0, 10))}</li>`).join('')}</ul>`);
      }
      if (r.invalid?.length) {
        lines.push(`<strong>Invalid rows (${c.invalid}):</strong><ul>${r.invalid.map((inv) => `<li>Row ${inv.row}: ${esc(inv.reason)}</li>`).join('')}</ul>`);
      }
      summary.innerHTML = lines.join('') || 'All rows already exist in HQ (duplicates skipped).';
      summary.hidden = false;
    } else {
      msg.textContent = `Imported ${r.imported} lead(s) (${c.duplicates} duplicate(s) skipped).`;
      msg.className = 'status-msg ok';
      summary.hidden = true;
      loadLeads(true);
      loadDash();
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'status-msg bad';
  } finally {
    $('#imp-preview-btn').disabled = false;
    $('#imp-run-btn').disabled = false;
  }
}

$('#imp-preview-btn')?.addEventListener('click', () => runLeadImport(true));
$('#import-form')?.addEventListener('submit', (e) => { e.preventDefault(); runLeadImport(false); });

// ---------- lead drawer ----------
async function openLead(id, updateHistory = true) {
  lastFocus = document.activeElement;
  $('#new-drawer').hidden = true;
  $('#import-drawer').hidden = true;
  let r;
  try { r = await api('lead', { params: { id } }); } catch (e) { alertMsg(e.message); return; }
  current = r.lead;
  renderLead(r.lead, r.events);
  $('#drawer').hidden = false;
  $('#scrim').hidden = false;
  $('#drawer').scrollTop = 0;
  if (updateHistory) syncUrl({ leadId: id, replace: true });
  $('#d-close').focus();
}
const alertMsg = (m) => { $('#d-save-msg').textContent = m; $('#d-save-msg').className = 'status-msg bad'; };

function renderLead(l, events) {
  $('#d-name').textContent = l.name;
  renderTrashState(l);
  $('#d-sub').textContent = `${BRANDS[brandOf(l)]} · ${l.address || 'Property not supplied'} · received ${when(l.created_at)}`;
  $('#d-dnc').hidden = !l.do_not_contact;
  const tel = digits(l.phone);
  const contactButtons = l.do_not_contact ? [] : [
    tel && `<a class="btn" href="tel:${esc(tel)}">Call ${esc(l.phone)}</a>`,
    tel && `<a class="btn ghost" href="sms:${esc(tel)}">Text</a>`,
    l.email && `<a class="btn ghost" href="mailto:${esc(l.email)}">Email</a>`,
    l.address && `<a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}" target="_blank" rel="noopener">Map</a>`,
  ].filter(Boolean);
  contactButtons.push(`<button class="btn ghost" type="button" id="copy-lead-link">Copy HQ link</button>`);
  $('#d-actions').innerHTML = contactButtons.join('');
  $('#copy-lead-link')?.addEventListener('click', async (ev) => {
    // currentTarget is null once the handler awaits, so keep the button first.
    const btn = ev.currentTarget;
    try {
      await navigator.clipboard.writeText(`${location.origin}/hq?lead=${encodeURIComponent(l.id)}`);
      btn.textContent = 'Link copied';
    } catch (e) {
      console.error('[hq] copy link failed:', e);
      btn.textContent = 'Copy failed';
    }
  });

  const consent = [l.consent_response && 'contact about property', l.consent_marketing && 'marketing'].filter(Boolean).join(' + ');
  const snapshot = events.find((event) => event.actor === 'Harbison Standard intake');
  $('#d-original').hidden = brandOf(l) !== 'harbison_standard';
  $('#d-original-text').textContent = snapshot?.detail || l.notes || '';
  const facts = [
    ['Brand', BRANDS[brandOf(l)]], ['Assigned to', l.assigned_to || 'Nathanael'],
    ['Phone', l.phone], ['Email', l.email], ['Property', l.address],
    ['Situation', l.situation], ['Path of interest', ROUTES[l.route_interest] || l.route_interest],
    ['Timeline', l.timeline], ['Occupancy', l.occupancy],
    ['Condition', Array.isArray(l.condition_flags) ? l.condition_flags.join(', ') : ''],
    ['Goal', l.desired_outcome], ['Relationship', l.relationship], ['Help needed', l.help_needed],
    ['Prefers', l.contact_pref], ['Consent', consent || (l.form_type === 'harbison_standard' ? 'Inquiry only; no marketing opt-in recorded' : l.form_type === 'options' ? 'none recorded' : 'form notice')],
    ['Source', [l.channel, l.ref_partner && `partner:${l.ref_partner}`, l.utm_source, l.utm_campaign].filter(Boolean).join(' · ')],
    ['Submitted from', l.source], ['Landing page', l.landing_page], ['Form', l.form_type],
    ['First contact', l.first_contact_at ? when(l.first_contact_at) : ''],
  ].filter(([, v]) => v);
  $('#d-facts').innerHTML = facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

  // When a Standard lead's notes are purely the untouched intake snapshot (already shown in #d-original),
  // present Team notes empty so staff don't have to edit around the raw intake block.
  const notesDuplicatesSnapshot = Boolean(snapshot?.detail && l.notes === snapshot.detail);
  $('#f-notes').placeholder = notesDuplicatesSnapshot ? 'Add team follow-up notes… (original inquiry is preserved above)' : '';

  initialFormValues = {};
  for (const f of FIELDS) {
    const el = $(`#f-${f}`);
    if (el.type === 'checkbox') {
      el.checked = !!l[f];
      initialFormValues[f] = el.checked;
    } else if (el.type === 'datetime-local') {
      el.value = toLocalInput(l[f]);
      initialFormValues[f] = el.value;
    } else if (f === 'notes' && notesDuplicatesSnapshot) {
      el.value = '';
      initialFormValues[f] = '';
    } else {
      el.value = l[f] ?? '';
      initialFormValues[f] = String(el.value);
    }
  }
  $('#d-save-msg').textContent = '';
  $('#d-save-msg').className = 'status-msg';
  renderTimeline(events);
}

function renderTimeline(events) {
  const label = { status_change: 'Stage', note: 'Note', call: 'Call', text: 'Text', email: 'Email', appointment: 'Appointment', offer: 'Offer' };
  const pretty = (e) => (e.kind === 'status_change' ? String(e.detail || '').replace(/[a-z_]+/g, (s) => STAGES[s] || s) : e.detail);
  $('#d-timeline').innerHTML = events.length
    ? events.map((e) => `<li><div><strong>${esc(label[e.kind] || e.kind)}</strong> — ${esc(pretty(e))}</div><div class="meta">${esc(when(e.at))}${e.actor ? ` · ${esc(e.actor)}` : ''}</div></li>`).join('')
    : '<li class="empty">No activity yet.</li>';
}

$('#d-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const body = {};
  const nonNullFields = new Set(['phone', 'address']);
  for (const f of FIELDS) {
    const el = $(`#f-${f}`);
    if (el.type === 'checkbox') {
      if (el.checked !== initialFormValues[f]) body[f] = el.checked;
    } else if (el.type === 'datetime-local') {
      if (el.value !== initialFormValues[f]) body[f] = el.value ? new Date(el.value).toISOString() : null;
    } else {
      const trimmed = el.value.trim();
      if (trimmed !== initialFormValues[f].trim()) {
        body[f] = trimmed === '' ? (nonNullFields.has(f) ? '' : null) : trimmed;
      }
    }
  }
  const msg = $('#d-save-msg');
  if (!Object.keys(body).length) { msg.textContent = 'No changes to save.'; msg.className = 'status-msg'; return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await api('lead', { method: 'PATCH', params: { id: current.id }, body });
    const r = await api('lead', { params: { id: current.id } });
    current = r.lead;
    renderLead(r.lead, r.events);
    msg.textContent = 'Saved.';
    msg.className = 'status-msg ok';
    if (!$('#leads').hidden) loadLeads(true);
    if (!$('#dash').hidden) loadDash();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'status-msg bad';
  } finally {
    btn.disabled = false;
  }
});

$('#note-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const input = $('#n-detail');
  if (!input.value.trim()) { input.focus(); return; }
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    await api('event', { method: 'POST', params: { id: current.id }, body: { kind: $('#n-kind').value, detail: input.value } });
    input.value = '';
    const r = await api('lead', { params: { id: current.id } });
    current = r.lead;
    renderLead(r.lead, r.events);
    if (!$('#leads').hidden) loadLeads(true);
    if (!$('#dash').hidden) loadDash();
  } catch (err) {
    alertMsg(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- boot ----------
try { $('#login-name').value = localStorage.getItem('hq_name') || ''; } catch {}
api('me').then((r) => showApp(r.name)).catch((e) => showLogin(e.status === 503 ? e.message : ''));

// ---------- Trash: delete, restore, delete forever ----------
function renderTrashState(l) {
  const trashed = Boolean(l.deleted_at);
  $('#d-trash').hidden = !trashed;
  $('#d-trash-text').textContent = trashed ? `In Trash — deleted ${when(l.deleted_at)}${l.deleted_by ? ` by ${l.deleted_by}` : ''}` : '';
  $('#d-form').hidden = trashed;
  $('#note-form').hidden = trashed;
  $('#d-delete-start').hidden = trashed;
  $('#d-delete-confirm').hidden = true;
  $('#d-purge').hidden = !trashed;
  $('#d-purge-confirm').value = '';
  $('#d-purge-go').disabled = true;
  $('#d-danger-msg').textContent = '';
  $('#d-danger-msg').className = 'status-msg';
}

function dangerMsg(text, ok = false) {
  $('#d-danger-msg').textContent = text;
  $('#d-danger-msg').className = `status-msg ${ok ? 'ok' : 'bad'}`;
}

async function afterTrashChange() {
  if (!$('#leads').hidden) await loadLeads(true);
  if (!$('#dash').hidden) await loadDash();
}

$('#d-delete').addEventListener('click', () => {
  $('#d-delete-start').hidden = true;
  $('#d-delete-confirm').hidden = false;
  $('#d-delete-yes').focus();
});
$('#d-delete-no').addEventListener('click', () => {
  $('#d-delete-confirm').hidden = true;
  $('#d-delete-start').hidden = false;
  $('#d-delete').focus();
});
$('#d-delete-yes').addEventListener('click', async (ev) => {
  if (!current) return;
  const btn = ev.currentTarget; // currentTarget is cleared once the event finishes dispatching
  btn.disabled = true;
  try {
    await api('lead', { method: 'DELETE', params: { id: current.id } });
    closeDrawer();
    await afterTrashChange();
  } catch (e) {
    dangerMsg(e.message);
  } finally {
    btn.disabled = false;
  }
});
$('#d-restore').addEventListener('click', async (ev) => {
  if (!current) return;
  const btn = ev.currentTarget;
  btn.disabled = true;
  try {
    await api('restore', { method: 'POST', params: { id: current.id }, body: {} });
    const r = await api('lead', { params: { id: current.id } });
    current = r.lead;
    renderLead(r.lead, r.events);
    dangerMsg('Restored. The lead is back in your lists.', true);
    await afterTrashChange();
  } catch (e) {
    dangerMsg(e.message);
  } finally {
    btn.disabled = false;
  }
});
$('#d-purge-confirm').addEventListener('input', (e) => { $('#d-purge-go').disabled = e.target.value.trim() !== 'DELETE'; });
$('#d-purge').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current || $('#d-purge-confirm').value.trim() !== 'DELETE') return;
  $('#d-purge-go').disabled = true;
  try {
    await api('purge', { method: 'DELETE', params: { id: current.id }, body: { confirm: 'DELETE' } });
    closeDrawer();
    await afterTrashChange();
  } catch (err) {
    dangerMsg(err.message);
    $('#d-purge-go').disabled = false;
  }
});

// ---------- Empty Trash ----------
// Deletes only the trashed leads currently listed, and says how many before anything happens.
const plural = (n) => `${n} lead${n === 1 ? '' : 's'}`;
function resetEmptyTrashForm() {
  $('#empty-trash-form').hidden = true;
  $('#empty-trash-start').hidden = false;
  $('#empty-trash-confirm').value = '';
  $('#empty-trash-go').disabled = true;
}
function renderEmptyTrash() {
  const n = list.view === 'trash' ? list.items.length : 0;
  $('#empty-trash').hidden = n === 0;
  resetEmptyTrashForm();
  emptyTrashMsg('');
  if (!n) return;
  $('#empty-trash-text').textContent = `Empty Trash deletes the ${plural(n)} listed below and their activity, for good.`;
  $('#empty-trash-go').textContent = `Delete ${plural(n)} forever`;
}
function emptyTrashMsg(text, ok = false) {
  $('#empty-trash-msg').textContent = text;
  $('#empty-trash-msg').className = `status-msg ${ok ? 'ok' : 'bad'}`;
}
$('#empty-trash-start').addEventListener('click', () => {
  $('#empty-trash-start').hidden = true;
  $('#empty-trash-form').hidden = false;
  emptyTrashMsg('');
  $('#empty-trash-confirm').focus();
});
$('#empty-trash-cancel').addEventListener('click', resetEmptyTrashForm);
$('#empty-trash-confirm').addEventListener('input', (e) => { $('#empty-trash-go').disabled = e.target.value.trim() !== 'DELETE'; });
$('#empty-trash-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ids = list.view === 'trash' ? list.items.map((l) => l.id) : [];
  if (!ids.length || $('#empty-trash-confirm').value.trim() !== 'DELETE') return;
  $('#empty-trash-go').disabled = true;
  try {
    const r = await api('empty-trash', { method: 'DELETE', body: { confirm: 'DELETE', ids } });
    await afterTrashChange();
    // The reload hides the bar once Trash is empty; keep it open just to confirm what happened.
    if (!list.items.length) {
      $('#empty-trash-text').textContent = '';
      $('#empty-trash-start').hidden = true;
      $('#empty-trash').hidden = false;
    }
    emptyTrashMsg(`Deleted ${plural(r.deleted)} for good.`, true);
  } catch (err) {
    emptyTrashMsg(err.message);
    $('#empty-trash-go').disabled = false;
  }
});
