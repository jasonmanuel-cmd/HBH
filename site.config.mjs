// Central business details. Edit here once — every page picks it up on the next build.

// Canonical links, the sitemap, and structured data all need an absolute https URL on the final host.
// Accepts sloppy input ("callharbison.com", "http://…/") and returns e.g. "https://www.callharbison.com".
// A bare two-part domain gets "www." because Vercel redirects the apex to www — canonicals must not redirect.
export function normalizeSiteUrl(raw) {
  const value = (raw || '').trim() || 'https://www.callharbison.com';
  const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  const local = u.hostname === 'localhost' || u.hostname.endsWith('.vercel.app');
  if (!local && u.hostname.split('.').length === 2) u.hostname = `www.${u.hostname}`;
  if (!local) u.protocol = 'https:';
  return `${u.origin}${u.pathname}`.replace(/\/$/, '');
}

export default {
  name: 'Harbison Buys Homes',
  tagline: 'Property problem? Call Harbison.',
  // Production URL (used for canonical links, sitemap, social cards). Override with SITE_URL on Vercel.
  url: normalizeSiteUrl(process.env.SITE_URL),

  phone: '(661) 472-7499',
  phoneHref: '+16614727499',
  email: 'nate85.realtor@gmail.com',

  // Licensee info — California requires the DRE number on advertising.
  agent: 'Nathanael Harbison',
  dre: '02059393',
  brokerage: 'Harbison Standard',
  brokerageUrl: 'https://www.harbisonstandard.com',
  agentProfiles: [
    'https://www.harbisonstandard.com/about',
    'https://www.facebook.com/nate85.realtor',
    'https://www.instagram.com/nathanaelharbison',
    'https://www.youtube.com/@Nathanaelharbison',
    'https://www.linkedin.com/in/nathanael-harbison',
  ],
  // Add the Google Business Profile URL here once it exists (strong local + AI search signal).
  businessProfiles: [],

  city: 'Bakersfield',
  state: 'CA',
  region: 'Kern County',
  serviceAreas: ['Bakersfield', 'Tehachapi', 'Kern County'],

  // Optional Google Analytics 4 ID (e.g. G-XXXXXXX). Set GA_MEASUREMENT_ID on Vercel to enable.
  gaId: process.env.GA_MEASUREMENT_ID || '',
  // Optional Google Tag Manager container (GTM-XXXXXXX). Preferred for Ads conversions + call tracking. Set GTM_ID on Vercel.
  gtmId: process.env.GTM_ID || '',
};
