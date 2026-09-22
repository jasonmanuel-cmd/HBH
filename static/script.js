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

// Remember ad/campaign parameters for the session so they travel with the lead.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const params = new URLSearchParams(location.search);
UTM_KEYS.forEach((k) => {
  try {
    if (params.get(k)) sessionStorage.setItem(k, params.get(k));
  } catch {}
});
const storedUtm = (k) => {
  try {
    return sessionStorage.getItem(k) || '';
  } catch {
    return '';
  }
};

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
    UTM_KEYS.forEach((k) => (data[k] = storedUtm(k)));

    const missing = [];
    if ((data.address || '').trim().length < 5) missing.push('address');
    if ((data.name || '').trim().length < 2) missing.push('name');
    if ((data.phone || '').replace(/\D/g, '').length < 10) missing.push('phone');
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push('email');
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
    fields.forEach((f) => form.querySelector(`[name="${f}"]`)?.classList.add('invalid'));
    form.querySelector('.invalid')?.focus();
    status.textContent = 'Please check the highlighted fields — we need a property address, your name, and a valid phone number.';
    status.classList.add('error');
  }
});
