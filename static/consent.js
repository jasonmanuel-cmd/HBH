// Cookie and privacy choices. Analytics and marketing measurement tools load only after the visitor accepts.
// The choice is stored in this browser only (localStorage) and expires after 12 months.
(() => {
  const KEY = 'hbh-consent';
  const MAX_AGE = 365 * 24 * 60 * 60 * 1000;
  const spanish = (document.documentElement.lang || '').toLowerCase().startsWith('es');
  const say = (english, es) => (spanish ? es : english);

  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && (saved.value === 'granted' || saved.value === 'denied') && Date.now() - saved.at < MAX_AGE) return saved.value;
    } catch {}
    return null;
  };
  const write = (value) => {
    try { localStorage.setItem(KEY, JSON.stringify({ value, at: Date.now() })); } catch {}
  };
  // A browser privacy signal counts as a decline and no banner is needed.
  const privacySignal = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';

  const apply = (value) => {
    if (value === 'granted') {
      for (const name of ['hbhLoadAnalytics', 'hbhLoadMetricool', 'hbhLoadTagManager']) {
        try { if (typeof window[name] === 'function') window[name](); } catch {}
      }
    }
  };

  let banner = null;
  const close = () => { if (banner) { banner.remove(); banner = null; } };
  const choose = (value) => { write(value); close(); apply(value); };

  const open = () => {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', say('Cookie and privacy choices', 'Opciones de cookies y privacidad'));
    const title = document.createElement('p');
    title.className = 'consent-title';
    title.textContent = say('Your privacy choices', 'Sus opciones de privacidad');
    const text = document.createElement('p');
    text.className = 'consent-text';
    text.append(say(
      'We collect website usage data, such as pages visited and device type, with Google Analytics and similar tools to understand what helps visitors and improve this site. Accept to allow it, or decline and we will use only what the site needs to work. Details are in our ',
      'Recopilamos datos de uso del sitio, como las páginas visitadas y el tipo de dispositivo, con Google Analytics y herramientas similares para entender qué ayuda a los visitantes y mejorar este sitio. Acepte para permitirlo, o rechace y usaremos solo lo que el sitio necesita para funcionar. Los detalles están en nuestra '
    ));
    const link = document.createElement('a');
    link.href = spanish ? '/es/privacy' : '/privacy';
    link.textContent = say('Privacy Policy', 'Política de privacidad');
    text.append(link, '.');
    const actions = document.createElement('div');
    actions.className = 'consent-actions';
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'btn btn-ghost-dark consent-btn';
    decline.textContent = say('Decline', 'Rechazar');
    decline.addEventListener('click', () => choose('denied'));
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'btn btn-gold consent-btn';
    accept.textContent = say('Accept', 'Aceptar');
    accept.addEventListener('click', () => choose('granted'));
    actions.append(decline, accept);
    banner.append(title, text, actions);
    document.body.append(banner);
  };

  document.querySelectorAll('[data-consent-open]').forEach((el) => el.addEventListener('click', (event) => { event.preventDefault(); open(); }));

  const saved = read();
  if (saved) { apply(saved); return; }
  if (privacySignal()) { write('denied'); return; }
  open();
})();
