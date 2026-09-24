// Harbison HQ — dashboard + simple CRM. Talks only to /api/hq (session cookie, same origin).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STAGES = {
  new: 'New', contact_attempted: 'Contact attempted', connected: 'Connected', qualified: 'Qualified',
  appointment_set: 'Appointment set', property_reviewed: 'Property reviewed', options_presented: 'Options presented',
  nurture: 'Nurture', under_contract: 'Under contract', closed_won: 'Closed — won', closed_lost: 'Closed — lost',
  not_a_fit: 'Not a fit', spam: 'Spam',
};
const ROUTES = { direct: 'Sell direct', listing: 'List', renovate: 'Renovate then sell', development: 'Development', not_ready: 'Not ready yet' };
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
  loadDash();
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
function openTab(name) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $('#dash').hidden = name !== 'dash';
  $('#leads').hidden = name !== 'leads';
  if (name === 'dash') loadDash();
  if (name === 'leads') loadLeads(true);
}
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
    kpi(s.new7, 'New · 7 days'),
    kpi(s.openPipeline, 'Open pipeline', { go: 'open' }),
    kpi(s.appointments7, 'Appointments · next 7 days'),
    kpi(s.medianMinutesToContact == null ? '—' : `${s.medianMinutesToContact}m`, 'Median time to first contact · 30d'),
    kpi(money(s.grossProfit90), `Gross profit · ${s.won90} closed · 90d`, { go: 'closed' }),
  ].join('');
  document.querySelectorAll('.kpi[data-go]').forEach((k) => {
    const go = () => { openTab('leads'); setView(k.dataset.go); };
    k.addEventListener('click', go);
    k.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  const max = Math.max(1, ...s.weekly.map((w) => w.leads));
  $('#spark').innerHTML = s.weekly.map((w) => `<div style="height:${Math.max(2, (w.leads / max) * 100)}%" title="Week ending ${esc(w.weekEnding)}: ${w.leads} leads"><span class="sr-only">Week ending ${esc(w.weekEnding)}: ${w.leads} leads</span></div>`).join('');
  $('#spark-l').innerHTML = `<span>${esc(when(s.weekly[0].weekEnding, false))}</span><span>This week: ${s.weekly[s.weekly.length - 1].leads}</span>`;

  $('#waiting').innerHTML = d.waiting.length
    ? d.waiting.map((l) => `<li data-id="${esc(l.id)}"><span><strong>${esc(l.name)}</strong><br><span class="muted">${esc(l.address)}</span></span><span class="t due">${esc(l.minutes_waiting)} min</span></li>`).join('')
    : '<li class="empty">Everyone has been contacted.</li>';
  $('#upcoming').innerHTML = d.upcoming.length
    ? d.upcoming.map((l) => `<li data-id="${esc(l.id)}"><span><strong>${esc(l.name)}</strong><br><span class="muted">${esc(l.address)}</span></span><span class="t">${esc(when(l.appointment_at))}</span></li>`).join('')
    : '<li class="empty">No appointments scheduled.</li>';
  bars($('#by-status'), s.byStatus, STAGES);
  bars($('#by-channel'), s.byChannel);
  bars($('#by-route'), s.byRoute, ROUTES);
}
['#waiting', '#upcoming'].forEach((sel) => $(sel).addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) openLead(li.dataset.id);
}));

// ---------- lead list ----------
const list = { view: 'open', q: '', offset: 0, items: [] };
function setView(v) {
  list.view = v;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  loadLeads(true);
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
let searchTimer;
$('#q').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { list.q = e.target.value; loadLeads(true); }, 250);
});
$('#more').addEventListener('click', () => loadLeads(false));

async function loadLeads(reset) {
  if (reset) { list.offset = 0; list.items = []; }
  let r;
  try {
    r = await api('leads', { params: { view: list.view, q: list.q, offset: String(list.offset), limit: '50' } });
  } catch (e) {
    $('#rows').innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`;
    return;
  }
  list.items = list.items.concat(r.leads);
  list.offset += r.leads.length;
  $('#more').hidden = r.leads.length < r.limit;
  $('#leads-empty').hidden = list.items.length > 0;
  const due = (l) => l.next_followup && Date.parse(l.next_followup) <= Date.now();
  $('#rows').innerHTML = list.items.map((l) => `<tr data-id="${esc(l.id)}">
      <td>${esc(when(l.created_at))}<span class="sub">${esc(ago(l.created_at))}</span></td>
      <td><strong>${esc(l.name)}</strong><span class="sub">${esc(l.phone)}</span></td>
      <td>${esc(l.address)}</td>
      <td>${esc(l.situation || '—')}${l.route_interest ? `<span class="sub">Path: ${esc(ROUTES[l.route_interest] || l.route_interest)}</span>` : ''}</td>
      <td>${pill(l.status)}${l.do_not_contact ? '<span class="sub due">Do not contact</span>' : ''}</td>
      <td class="${due(l) ? 'due' : ''}">${esc(when(l.next_followup))}</td>
      <td>${esc(l.channel || '—')}</td></tr>`).join('');
  $('#cards').innerHTML = list.items.map((l) => `<div class="lead-card" data-id="${esc(l.id)}" role="button" tabindex="0">
      <div class="row"><strong>${esc(l.name)}</strong>${pill(l.status)}</div>
      <span class="muted">${esc(l.address)}</span>
      <div class="row"><span class="muted">${esc(l.situation || '')}</span><span class="${due(l) ? 'due' : 'muted'}">${l.next_followup ? `Follow up ${esc(when(l.next_followup))}` : esc(ago(l.created_at))}</span></div></div>`).join('');
}
['#rows', '#cards'].forEach((sel) => {
  $(sel).addEventListener('click', (e) => { const el = e.target.closest('[data-id]'); if (el) openLead(el.dataset.id); });
  $(sel).addEventListener('keydown', (e) => { const el = e.target.closest('[data-id]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLead(el.dataset.id); } });
});

// ---------- lead drawer ----------
let current = null;
let lastFocus = null;
const FIELDS = ['status', 'assigned_to', 'next_followup', 'appointment_at', 'estimated_value', 'offer_amount', 'outcome_path', 'closed_value', 'gross_profit', 'lost_reason', 'notes', 'authority_confirmed', 'do_not_contact'];
$('#f-status').innerHTML = Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

function closeDrawer() {
  $('#drawer').hidden = true;
  $('#scrim').hidden = true;
  current = null;
  lastFocus?.focus?.();
}
$('#d-close').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });

async function openLead(id) {
  lastFocus = document.activeElement;
  let r;
  try { r = await api('lead', { params: { id } }); } catch (e) { alertMsg(e.message); return; }
  current = r.lead;
  renderLead(r.lead, r.events);
  $('#drawer').hidden = false;
  $('#scrim').hidden = false;
  $('#drawer').scrollTop = 0;
  $('#d-close').focus();
}
const alertMsg = (m) => { $('#d-save-msg').textContent = m; };

function renderLead(l, events) {
  $('#d-name').textContent = l.name;
  $('#d-sub').textContent = `${l.address} · received ${when(l.created_at)}`;
  $('#d-dnc').hidden = !l.do_not_contact;
  const tel = digits(l.phone);
  $('#d-actions').innerHTML = l.do_not_contact ? '' : [
    tel && `<a class="btn" href="tel:${esc(tel)}">Call ${esc(l.phone)}</a>`,
    tel && `<a class="btn ghost" href="sms:${esc(tel)}">Text</a>`,
    l.email && `<a class="btn ghost" href="mailto:${esc(l.email)}">Email</a>`,
    `<a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}" target="_blank" rel="noopener">Map</a>`,
  ].filter(Boolean).join('');

  const consent = [l.consent_response && 'contact about property', l.consent_marketing && 'marketing'].filter(Boolean).join(' + ');
  const facts = [
    ['Phone', l.phone], ['Email', l.email], ['Property', l.address],
    ['Situation', l.situation], ['Path of interest', ROUTES[l.route_interest] || l.route_interest],
    ['Timeline', l.timeline], ['Occupancy', l.occupancy],
    ['Condition', Array.isArray(l.condition_flags) ? l.condition_flags.join(', ') : ''],
    ['Goal', l.desired_outcome], ['Relationship', l.relationship], ['Help needed', l.help_needed],
    ['Prefers', l.contact_pref], ['Consent', consent || (l.form_type === 'options' ? 'none recorded' : 'form notice')],
    ['Source', [l.channel, l.utm_source, l.utm_campaign].filter(Boolean).join(' · ')],
    ['Landing page', l.landing_page], ['Form', l.form_type],
  ].filter(([, v]) => v);
  $('#d-facts').innerHTML = facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

  for (const f of FIELDS) {
    const el = $(`#f-${f}`);
    if (el.type === 'checkbox') el.checked = !!l[f];
    else if (el.type === 'datetime-local') el.value = toLocalInput(l[f]);
    else el.value = l[f] ?? '';
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
  for (const f of FIELDS) {
    const el = $(`#f-${f}`);
    const v = el.type === 'checkbox' ? el.checked : el.type === 'datetime-local' ? (el.value ? new Date(el.value).toISOString() : null) : el.value.trim();
    const old = current[f];
    const same = el.type === 'datetime-local' ? toLocalInput(old) === el.value : el.type === 'checkbox' ? !!old === v : String(old ?? '') === String(v ?? '');
    if (!same) body[f] = v === '' ? null : v;
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
    renderTimeline(r.events);
  } catch (err) {
    alertMsg(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- boot ----------
try { $('#login-name').value = localStorage.getItem('hq_name') || ''; } catch {}
api('me').then((r) => showApp(r.name)).catch((e) => showLogin(e.status === 503 ? e.message : ''));
