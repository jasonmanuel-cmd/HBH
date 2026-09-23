// Mobile menu
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});

nav.querySelectorAll('a').forEach((a) => {
  a.addEventListener('click', () => {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  });
});

// ---------- Attribution ----------
// First touch is kept 90 days (Google's gclid window) so a family that returns weeks later is still credited
// to the ad or partner that found them. Last-touch UTMs are kept for the session.
const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'ref'];
const FIRST_KEY = 'hbh_first_touch';
const TTL = 90 * 864e5;
const params = new URLSearchParams(location.search);
const store = {
  get(k, s = localStorage) { try { return JSON.parse(s.getItem(k) || 'null'); } catch { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch {} },
};
(() => {
  const incoming = Object.fromEntries(ATTR_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k).slice(0, 256)]));
  // Partner short links: /family?ref=rosewood → treated as a referral campaign.
  if (incoming.ref && !incoming.utm_source) Object.assign(incoming, { utm_source: incoming.ref, utm_medium: 'referral', utm_campaign: incoming.utm_campaign || 'family_transition' });
  const first = store.get(FIRST_KEY);
  if (!first || Date.now() - first.t > TTL) {
    store.set(FIRST_KEY, { t: Date.now(), landing_page: location.pathname, referrer: document.referrer.slice(0, 300), ...incoming });
  } else if (incoming.gclid || incoming.gbraid || incoming.wbraid || incoming.ref) {
    // A new ad click or partner visit is a stronger signal than an old organic visit.
    store.set(FIRST_KEY, { ...first, ...incoming, t: Date.now() });
  }
  if (Object.keys(incoming).length) store.set('hbh_last_touch', incoming, sessionStorage);
})();
const attribution = () => {
  const first = store.get(FIRST_KEY) || {};
  const last = store.get('hbh_last_touch', sessionStorage) || {};
  const out = { landing_page: first.landing_page || location.pathname, referrer: first.referrer || document.referrer };
  ATTR_KEYS.forEach((k) => (out[k] = first[k] || last[k] || ''));
  return out;
};

// ---------- Analytics events (GTM dataLayer + GA4 gtag if present) ----------
window.dataLayer = window.dataLayer || [];
const track = (event, props = {}) => {
  window.dataLayer.push({ event, ...props });
  if (window.gtag) window.gtag('event', event, props);
};
document.addEventListener('click', (e) => {
  const tel = e.target.closest('a[href^="tel:"]');
  if (tel) track('call_click', { page: location.pathname });
});

// ---------- Click-to-load video ----------
document.querySelectorAll('button[data-yt]').forEach((b) => {
  b.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&rel=0`;
    f.title = b.getAttribute('aria-label') || 'Video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    b.replaceWith(f);
    track('video_play', { video_id: b.dataset.yt });
  });
});

// ---------- Stepped forms ----------
document.querySelectorAll('form[data-steps]').forEach((form) => {
  const steps = [...form.querySelectorAll('.fstep')];
  const dots = [...form.querySelectorAll('.step-dots li')];
  const status = form.querySelector('.form-status');
  let current = 0;
  let started = false;
  form.show = (i) => {
    current = Math.max(0, Math.min(i, steps.length - 1));
    steps.forEach((s, n) => (s.hidden = n !== current));
    dots.forEach((d, n) => d.classList.toggle('on', n <= current));
    const h = form.closest('.lead-card')?.querySelector('h2');
    const q = steps[current].querySelector('legend.fstep-q');
    if (h && current === 0) h.textContent = 'What property are you trying to figure out?';
    steps[current].querySelector('input:not([type=hidden]),select')?.focus({ preventScroll: true });
    if (q) q.setAttribute('tabindex', '-1');
  };
  const stepValid = (s) => {
    const bad = [];
    const addr = s.querySelector('[name=address]');
    if (addr && addr.value.trim().length < 5) bad.push(addr);
    s.querySelectorAll('.choice-grid').forEach((g) => {
      if (!g.querySelector('input:checked')) bad.push(g);
    });
    return bad;
  };
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) {
      const bad = stepValid(steps[current]);
      form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
      status.className = 'form-status';
      status.textContent = '';
      if (bad.length) {
        bad.forEach((el) => el.classList.add('invalid'));
        status.textContent = current === 0 ? 'Please enter the property address.' : 'Please choose the closest option.';
        status.classList.add('error');
        return;
      }
      if (!started) { started = true; track('form_start', { form_type: form.dataset.formType }); }
      track('form_step', { form_type: form.dataset.formType, step: current + 2 });
      form.show(current + 1);
    }
    if (e.target.closest('[data-back]')) form.show(current - 1);
  });
  // Enter on step 1 advances instead of submitting.
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && current < steps.length - 1 && e.target.tagName === 'INPUT') {
      e.preventDefault();
      form.querySelector('.fstep:not([hidden]) [data-next]')?.click();
    }
  });
  // Auto-advance when a radio is picked — one tap per step on mobile.
  form.addEventListener('change', (e) => {
    if (e.target.type === 'radio' && steps[current].querySelectorAll('.choice-grid').length === 1 && !steps[current].querySelector('select')) {
      setTimeout(() => form.querySelector('.fstep:not([hidden]) [data-next]')?.click(), 180);
    }
  });
});

// Lead forms
document.querySelectorAll('form[data-lead-form]').forEach((form) => {
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    status.className = 'form-status';

    const data = Object.fromEntries(new FormData(form).entries());
    data.source = location.pathname;
    Object.assign(data, attribution());

    const missing = [];
    if ((data.address || '').trim().length < 5) missing.push('address');
    if ((data.name || '').trim().length < 2) missing.push('name');
    if ((data.phone || '').replace(/\D/g, '').length < 10) missing.push('phone');
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push('email');
    if (form.dataset.formType === 'family_transition' && !data.relationship) missing.push('relationship');
    if (missing.length) return showErrors(missing);

    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'Sending…';

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        track('generate_lead', { form_type: data.form_type || 'standard', lead_situation: data.situation || '' });
        location.href = '/thank-you';
        return;
      }
      if (json.fields) return showErrors(json.fields);
      throw new Error(json.error || 'Request failed');
    } catch {
      const phone = document.querySelector('.nav-phone');
      status.textContent = `Something went wrong sending your request. Please try again${phone ? ` or call ${phone.textContent}` : ''}.`;
      status.classList.add('error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });

  function showErrors(fields) {
    // On stepped forms, jump back to the first step that holds a bad field.
    if (form.show) {
      const idx = [...form.querySelectorAll('.fstep')].findIndex((s) => fields.some((f) => s.querySelector(`[name="${f}"]`)));
      if (idx >= 0) form.show(idx);
    }
    fields.forEach((f) => form.querySelector(`[name="${f}"]`)?.classList.add('invalid'));
    form.querySelector('.invalid')?.focus();
    status.textContent = fields.includes('relationship') && fields.length === 1 ? 'Please tell us your relationship to the property.' : 'Please check the highlighted fields — we need a property address, your name, and a valid phone number.';
    status.classList.add('error');
  }
});
