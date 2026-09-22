// Central business details. Edit here once — every page picks it up on the next build.
export default {
  name: 'Harbison Buys Homes',
  tagline: 'Property problem? Call Harbison.',
  // Production URL (used for canonical links, sitemap, social cards). Override with SITE_URL on Vercel.
  url: (process.env.SITE_URL || 'https://www.harbisonbuyshomes.com').replace(/\/$/, ''),

  // TODO before launch: replace placeholder phone + email.
  phone: '(661) 555-0123',
  phoneHref: '+16615550123',
  email: 'hello@harbisonbuyshomes.com',

  city: 'Bakersfield',
  state: 'CA',
  region: 'Kern County',
  serviceAreas: ['Bakersfield', 'Tehachapi', 'Kern County'],

  // Optional Google Analytics 4 ID (e.g. G-XXXXXXX). Set GA_MEASUREMENT_ID on Vercel to enable.
  gaId: process.env.GA_MEASUREMENT_ID || '',
};
