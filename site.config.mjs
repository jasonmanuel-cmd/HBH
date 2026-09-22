// Central business details. Edit here once — every page picks it up on the next build.
export default {
  name: 'Harbison Buys Homes',
  tagline: 'Property problem? Call Harbison.',
  // Production URL (used for canonical links, sitemap, social cards). Override with SITE_URL on Vercel.
  url: (process.env.SITE_URL || 'https://www.harbisonbuyshomes.com').replace(/\/$/, ''),

  phone: '(661) 472-7499',
  phoneHref: '+16614727499',
  email: 'nate85.realtor@gmail.com',

  // Licensee info — California requires the DRE number on advertising.
  agent: 'Nathanael Harbison',
  dre: '02059393',
  brokerage: 'Harbison Standard',
  brokerageUrl: 'https://www.harbisonstandard.com',

  city: 'Bakersfield',
  state: 'CA',
  region: 'Kern County',
  serviceAreas: ['Bakersfield', 'Tehachapi', 'Kern County'],

  // Optional Google Analytics 4 ID (e.g. G-XXXXXXX). Set GA_MEASUREMENT_ID on Vercel to enable.
  gaId: process.env.GA_MEASUREMENT_ID || '',
};
