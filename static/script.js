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
// First touch is kept 90 days (Google's gclid window) so a seller who returns weeks later is still credited
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

// ---------- Analytics (GTM dataLayer + GA4 gtag if present) ----------
// Event names follow the site playbook. Never send names, phones, emails, or addresses here.
const pageType = document.body.dataset.pageType || 'page';
const device = () => (matchMedia('(max-width: 640px)').matches ? 'mobile' : matchMedia('(max-width: 980px)').matches ? 'tablet' : 'desktop');
window.dataLayer = window.dataLayer || [];
const track = (event, props = {}) => {
  const a = attribution();
  const payload = {
    page_path: location.pathname,
    page_type: pageType,
    source: a.utm_source || '',
    medium: a.utm_medium || '',
    campaign: a.utm_campaign || '',
    content: a.utm_content || '',
    term: a.utm_term || '',
    device_type: device(),
    ...props,
  };
  window.dataLayer.push({ event, ...payload });
  if (window.gtag) window.gtag('event', event, payload);
};
const PAGE_VIEW_EVENTS = { guide: 'guide_view', situation: 'situation_page_view', location: 'location_page_view' };
if (PAGE_VIEW_EVENTS[pageType]) track(PAGE_VIEW_EVENTS[pageType]);

document.addEventListener('click', (e) => {
  if (e.target.closest('a[href^="tel:"]')) track('phone_click');
  const cta = e.target.closest('[data-cta]');
  if (cta) track('cta_click', { cta: cta.dataset.cta });
  // Path cards pre-fill route_interest on the page's form.
  const route = e.target.closest('[data-route]');
  if (route) {
    const field = document.querySelector('#lead-form input[name="route_interest"]');
    if (field) field.value = route.dataset.route;
    track('cta_click', { cta: 'route_card', route_interest: route.dataset.route });
  }
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

const formProps = (form) => {
  const v = (n) => form.querySelector(`[name="${n}"]:checked, input[type=hidden][name="${n}"], select[name="${n}"]`)?.value || '';
  return { form_type: form.dataset.formType || 'standard', situation_type: v('situation'), route_interest: v('route_interest'), location_interest: v('location_interest') };
};

// Report the form once, the first time it scrolls into view.
if ('IntersectionObserver' in window) {
  const seen = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { track('lead_form_view', formProps(en.target)); seen.unobserve(en.target); }
  }), { threshold: 0.4 });
  document.querySelectorAll('form[data-lead-form]').forEach((f) => seen.observe(f));
}

// ---------- Stepped forms ----------
document.querySelectorAll('form[data-steps]').forEach((form) => {
  const steps = [...form.querySelectorAll('.fstep')];
  const dots = [...form.querySelectorAll('.step-dots li')];
  const status = form.querySelector('.form-status');
  let current = 0;
  let started = false;
  form.show = (i, focus = true) => {
    current = Math.max(0, Math.min(i, steps.length - 1));
    steps.forEach((s, n) => (s.hidden = n !== current));
    dots.forEach((d, n) => d.classList.toggle('on', n <= current));
    const h = form.closest('.lead-card')?.querySelector('h2');
    if (h && current === 0 && form.dataset.formType === 'family_transition') h.textContent = 'What property are you trying to figure out?';
    if (focus) steps[current].querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,input[type=radio]')?.focus({ preventScroll: true });
  };
  if (form.dataset.start) form.show(Number(form.dataset.start), false);

  const stepValid = (s) => {
    const bad = [];
    const addr = s.querySelector('[name=address]');
    if (addr && addr.value.trim().length < 5) bad.push(addr);
    const street = s.querySelector('[name=street]');
    if (street && street.value.trim().length < 4) bad.push(street);
    const city = s.querySelector('[name=city]');
    if (city && city.value.trim().length < 2) bad.push(city);
    const zip = s.querySelector('[name=zip]');
    if (zip && !/^\d{5}(-\d{4})?$/.test(zip.value.trim())) bad.push(zip);
    s.querySelectorAll('.choice-grid[role=radiogroup]').forEach((g) => {
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
        const typed = bad.some((el) => el.tagName === 'INPUT');
        status.textContent = typed ? (form.querySelector('[name=street]') ? 'Please enter the street, city, and 5-digit ZIP code.' : 'Please enter the property address.') : 'Please choose the closest option.';
        status.classList.add('error');
        track('lead_form_error', { ...formProps(form), step: current + 1 });
        return;
      }
      if (!started) { started = true; track('lead_form_start', formProps(form)); }
      track('lead_form_step_complete', { ...formProps(form), step: current + 1 });
      form.show(current + 1);
    }
    if (e.target.closest('[data-back]')) form.show(current - 1);
  });
  // Enter advances instead of submitting early.
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

// ---------- Lead forms ----------
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
    // Options form: split fields → the combined values the CRM and alerts use.
    if (data.street !== undefined) data.address = [data.street, data.city, `${data.state || 'CA'} ${data.zip || ''}`.trim()].map((s) => (s || '').trim()).filter(Boolean).join(', ');
    if (data.first_name !== undefined) data.name = `${data.first_name || ''} ${data.last_name || ''}`.trim();

    const missing = [];
    if ((data.address || '').trim().length < 5) missing.push('address');
    if ((data.name || '').trim().length < 2 || (data.first_name !== undefined && !(data.first_name || '').trim())) missing.push('name');
    if ((data.phone || '').replace(/\D/g, '').length < 10) missing.push('phone');
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push('email');
    if (form.dataset.formType === 'family_transition' && !data.relationship) missing.push('relationship');
    if (form.dataset.formType === 'options' && data.consent_response !== 'yes') missing.push('consent_response');
    if (missing.length) return showErrors(missing);

    track('lead_form_submit', formProps(form));
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
        track('lead_form_success', formProps(form));
        track('generate_lead', { form_type: data.form_type || 'standard' });
        store.set('hbh_lead', { phone: data.phone, address: data.address }, sessionStorage);
        location.href = '/thank-you';
        return;
      }
      if (json.fields) return showErrors(json.fields);
      throw new Error(json.error || 'Request failed');
    } catch {
      track('lead_form_error', { ...formProps(form), step: 'submit' });
      const phone = document.querySelector('.nav-phone');
      status.textContent = `Something went wrong sending your request — nothing you typed was lost. Please try again${phone ? `, or call or text ${phone.textContent}` : ''}.`;
      status.classList.add('error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });

  function showErrors(fields) {
    track('lead_form_error', { ...formProps(form), fields: fields.join(',') });
    // Map combined fields back to the inputs the visitor actually sees.
    const names = fields.flatMap((f) => (f === 'address' && form.querySelector('[name=street]') ? ['street', 'city', 'zip'] : f === 'name' && form.querySelector('[name=first_name]') ? ['first_name', 'last_name'] : [f]));
    if (form.show) {
      const idx = [...form.querySelectorAll('.fstep')].findIndex((s) => names.some((f) => s.querySelector(`[name="${f}"]`)));
      if (idx >= 0) form.show(idx);
    }
    names.forEach((f) => form.querySelector(`[name="${f}"]`)?.classList.add('invalid'));
    form.querySelector('.invalid')?.focus();
    status.textContent =
      names.length === 1 && names[0] === 'consent_response' ? 'Please check the box so we can contact you about this property.'
      : fields.includes('relationship') && fields.length === 1 ? 'Please tell us your relationship to the property.'
      : 'Please check the highlighted fields — we need the property address, your name, and a valid phone number.';
    status.classList.add('error');
  }
});

// ---------- Thank-you page: optional details ----------
document.querySelectorAll('form[data-details-form]').forEach((form) => {
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      kind: 'details',
      ...(store.get('hbh_lead', sessionStorage) || {}),
      timeline: fd.get('timeline') || '',
      occupancy: fd.get('occupancy') || '',
      condition_flags: fd.getAll('condition'),
      desired_outcome: fd.get('desired_outcome') || '',
    };
    if (!payload.timeline && !payload.occupancy && !payload.condition_flags.length && !payload.desired_outcome) {
      status.textContent = 'Choose at least one answer, or skip this — it’s optional.';
      status.className = 'form-status error';
      return;
    }
    if (!payload.phone) {
      status.textContent = 'Thanks — please mention these details when we call.';
      status.className = 'form-status';
      return;
    }
    button.disabled = true;
    try {
      const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      status.textContent = 'Added to your request. Thank you.';
      status.className = 'form-status ok';
      button.textContent = 'Added';
      track('lead_details_added', { fields: ['timeline', 'occupancy', 'desired_outcome'].filter((k) => payload[k]).concat(payload.condition_flags.length ? ['condition'] : []).join(',') });
    } catch {
      button.disabled = false;
      status.textContent = 'That didn’t go through. Please mention these details when we call.';
      status.className = 'form-status error';
    }
  });
});
