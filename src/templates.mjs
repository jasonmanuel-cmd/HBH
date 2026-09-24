import site from '../site.config.mjs';
import { images, situations as baseSituations, areas as baseAreas, faqs as baseFaqs } from './content.mjs';
import { californiaCity, extraFaqs, glance, testimonials, about, guides as baseGuides } from './content-extra.mjs';
import { family, familyForm, partnerGuide } from './family.mjs';
import {
  supportingPromise, heroCopy, reassurance, processSteps, routes, compareDisclosure, whyHarbison, transparency, safeguards,
  offerExplanation, offerExample, walkthrough, formSituations, situationFormMap, detailOptions,
  newSituations, stallionSprings, newGuides, guideMeaning,
} from './content-playbook.mjs';

export const situations = [...baseSituations, ...newSituations];
// Bakersfield, Tehachapi, Stallion Springs, California City, Kern County
export const areas = [...baseAreas.slice(0, 2), stallionSprings, californiaCity, ...baseAreas.slice(2)];
export const faqs = [...baseFaqs.slice(0, 4), ...extraFaqs, ...baseFaqs.slice(4)];
export const guides = [...baseGuides.map((g) => ({ ...g, meaning: guideMeaning[g.slug] })), ...newGuides];

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s = '') => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const year = new Date().getFullYear();
// Brand assets cut from the Harbison Buys Homes logo sheet (see static/assets).
const logo = '/assets/logo-horizontal.png'; // full color, transparent, 1172×231
const logoReverse = '/assets/logo-header-reverse.png'; // ivory + gold for navy grounds, 487×96
const ogDefault = '/assets/og-default.jpg'; // 1200×630
const headshot = '/assets/nathanael-harbison.jpg'; // 325×325
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const niceDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Resize an Unsplash URL to exact dimensions (keeps width/height attributes honest → no layout shift).
const sized = (url, w, h) => url.replace(/([?&])w=\d+/, `$1w=${w}&h=${h}`);
const img = (url, alt, w, h, { eager = false, cls = '' } = {}) =>
  `<img${cls ? ` class="${cls}"` : ''} src="${sized(url, w, h)}" srcset="${sized(url, Math.round(w / 1.5), Math.round(h / 1.5))} ${Math.round(w / 1.5)}w, ${sized(url, w, h)} ${w}w" sizes="(max-width: 640px) 92vw, ${w}px" alt="${esc(alt)}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;

const pageTitle = (t) => (`${t} | ${site.name}`.length <= 66 ? `${t} | ${site.name}` : `${t} | Harbison`);

// ---------- Structured data (one connected @graph per page) ----------

const ids = {
  org: `${site.url}/#business`,
  person: `${site.url}/about#nathanael-harbison`,
  website: `${site.url}/#website`,
};

const placeLd = (a) => ({
  '@type': a.slug === 'kern-county' ? 'AdministrativeArea' : 'City',
  name: `${a.name}${a.slug === 'kern-county' ? '' : ', CA'}${a.slug === 'kern-county' ? ', California' : ''}`,
  ...(a.geo ? { geo: { '@type': 'GeoCoordinates', latitude: a.geo[0], longitude: a.geo[1] } } : {}),
});

const orgLd = () => ({
  '@type': 'RealEstateAgent',
  '@id': ids.org,
  name: site.name,
  slogan: site.tagline,
  description: `${site.name} buys houses and land as-is in Bakersfield, Tehachapi, California City, and throughout Kern County, California, and helps owners compare a direct sale with listing, renovation, or development.`,
  url: `${site.url}/`,
  logo: { '@type': 'ImageObject', url: `${site.url}${logo}`, width: 1172, height: 231 },
  image: `${site.url}${ogDefault}`,
  telephone: site.phoneHref,
  email: site.email,
  address: { '@type': 'PostalAddress', addressLocality: site.city, addressRegion: site.state, addressCountry: 'US' },
  areaServed: areas.map(placeLd),
  founder: { '@id': ids.person },
  employee: { '@id': ids.person },
  contactPoint: { '@type': 'ContactPoint', telephone: site.phoneHref, email: site.email, contactType: 'customer service', areaServed: 'US-CA', availableLanguage: 'English' },
  knowsAbout: ['Selling a house as-is', 'Cash home buying', 'Inherited and probate property', 'Real estate listing', 'Home renovation', 'Land development', 'Kern County real estate'],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Property solutions',
    itemListElement: situations.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.title, url: `${site.url}/situations/${s.slug}` } })),
  },
  ...(site.businessProfiles.length ? { sameAs: site.businessProfiles } : {}),
});

const personLd = () => ({
  '@type': 'Person',
  '@id': ids.person,
  name: site.agent,
  jobTitle: 'REALTOR®',
  url: `${site.url}/about`,
  image: { '@type': 'ImageObject', url: `${site.url}${headshot}`, width: 325, height: 325 },
  telephone: site.phoneHref,
  email: site.email,
  worksFor: [{ '@id': ids.org }, { '@type': 'RealEstateAgent', name: site.brokerage, url: site.brokerageUrl }],
  hasCredential: {
    '@type': 'EducationalOccupationalCredential',
    credentialCategory: 'license',
    name: 'California real estate license',
    identifier: `DRE #${site.dre}`,
    recognizedBy: { '@type': 'GovernmentOrganization', name: 'California Department of Real Estate', url: 'https://www.dre.ca.gov/' },
  },
  knowsAbout: ['Kern County real estate', 'Probate and inherited property sales', 'As-is home sales', 'Investment property analysis'],
  sameAs: site.agentProfiles,
});

const websiteLd = () => ({ '@type': 'WebSite', '@id': ids.website, url: `${site.url}/`, name: site.name, publisher: { '@id': ids.org }, inLanguage: 'en-US' });

const breadcrumbLd = (url, crumbs) => ({
  '@type': 'BreadcrumbList',
  '@id': `${url}#breadcrumb`,
  itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site.url}${path}` })),
});

const faqLd = (url, list) => ({
  '@type': 'FAQPage',
  '@id': `${url}#faq`,
  mainEntity: list.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
});

function graph({ path, title, description, image, type = 'WebPage', crumbs, extra = [], faq, modified = BUILD_DATE }) {
  const url = `${site.url}${path === '/' ? '/' : path}`;
  const webpage = {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { '@id': ids.website },
    about: { '@id': type === 'ProfilePage' ? ids.person : ids.org },
    inLanguage: 'en-US',
    dateModified: modified,
    primaryImageOfPage: { '@type': 'ImageObject', url: image },
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.answer-box'] },
    ...(type === 'ProfilePage' ? { mainEntity: { '@id': ids.person } } : {}),
    ...(crumbs ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
  };
  const nodes = [orgLd(), personLd(), websiteLd(), webpage];
  if (crumbs) nodes.push(breadcrumbLd(url, crumbs));
  if (faq) nodes.push(faqLd(url, faq));
  nodes.push(...extra.map((n) => ({ ...n, mainEntityOfPage: { '@id': `${url}#webpage` } })));
  return { '@context': 'https://schema.org', '@graph': nodes };
}

const serviceLd = ({ name, description, url, areaServed }) => ({
  '@type': 'Service',
  '@id': `${url}#service`,
  name,
  description,
  serviceType: 'Home buying and real estate solutions',
  url,
  provider: { '@id': ids.org },
  areaServed,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free, no-obligation property evaluation' },
});

// ---------- Layout ----------

function head({ title, description, path, image, noindex = false, ld, preload, article }) {
  const canonical = `${site.url}${path === '/' ? '/' : path}`;
  const ogImage = image || `${site.url}${ogDefault}`;
  const ga = site.gaId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(site.gaId)}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(site.gaId)}');</script>`
    : '';
  const gtm = site.gtmId
    ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${esc(site.gtmId)}');</script>`
    : '';
  return `<!doctype html>
<html lang="en-US">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${noindex ? '<meta name="robots" content="noindex,follow">' : `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">\n  <link rel="canonical" href="${canonical}">`}
  <meta name="author" content="${esc(site.name)}">
  <meta name="geo.region" content="US-CA">
  <meta name="geo.placename" content="${esc(site.city)}, ${esc(site.region)}">
  <meta name="theme-color" content="#031f2b">
  <meta property="og:type" content="${article ? 'article' : 'website'}">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="${esc(site.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:image:alt" content="${esc(title)}">
  ${article ? `<meta property="article:modified_time" content="${article.updated}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/assets/favicon-48.png" type="image/png" sizes="48x48">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="sitemap" type="application/xml" href="/sitemap.xml">
  <link rel="preconnect" href="https://images.unsplash.com" crossorigin>
  ${preload ? `<link rel="preload" as="image" href="${preload}" fetchpriority="high">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  ${gtm}
  ${ga}
  <script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>
  <script defer src="/_vercel/insights/script.js"></script>
  ${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
</head>`;
}

function header(cta) {
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container nav-wrap">
    <a class="brand" href="/" aria-label="${esc(site.name)} home"><img src="${logoReverse}" alt="${esc(site.name)}" width="233" height="46"></a>
    <button class="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav"><span></span><span></span><span></span></button>
    <nav class="nav" id="site-nav" aria-label="Main">
      <a href="/how-it-works">How It Works</a>
      <a href="/situations">Situations</a>
      <a href="/sell-parents-house">Parent’s House</a>
      <a href="/guides">Guides</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
      <a class="nav-phone" href="tel:${site.phoneHref}">${esc(site.phone)}</a>
    </nav>
    <a class="btn btn-gold header-cta" href="${cta}" data-cta="header">Get My Options</a>
  </div>
</header>`;
}

const socialNames = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', linkedin: 'LinkedIn' };

function footer(cta) {
  const socials = site.agentProfiles
    .map((u) => [u, Object.entries(socialNames).find(([k]) => u.includes(k))?.[1]])
    .filter(([, n]) => n)
    .map(([u, n]) => `<a href="${u}" rel="noopener me" target="_blank">${n}</a>`)
    .join(' · ');
  return `<footer class="footer" id="contact">
  <div class="container footer-grid">
    <div><img class="footer-logo" src="${logoReverse}" alt="${esc(site.name)}" width="243" height="48" loading="lazy"><p><strong class="footer-tag">${esc(site.tagline)}</strong><br>${esc(supportingPromise)}</p><p class="footer-social">${socials}</p></div>
    <div><h2 class="footer-h">Explore</h2><a href="/how-it-works">How It Works</a><a href="/situations">Situations</a><a href="/sell-parents-house">Selling a Parent’s House</a><a href="/guides">Seller Guides</a><a href="/about">About Nathanael</a><a href="/#faq">FAQ</a></div>
    <div><h2 class="footer-h">Contact</h2><a href="tel:${site.phoneHref}">Call or text ${esc(site.phone)}</a><a href="mailto:${esc(site.email)}">${esc(site.email)}</a><a href="/contact">Contact page</a><a href="/#lead-form">Request property options</a></div>
    <div><h2 class="footer-h">Service Area</h2>${areas.map((a) => `<a href="/areas/${a.slug}">${esc(a.name)}</a>`).join('')}</div>
  </div>
  <div class="container footer-bottom"><span>© ${year} ${esc(site.name)}. ${esc(site.agent)}, DRE #${esc(site.dre)} • <a href="${site.brokerageUrl}">${esc(site.brokerage)}</a></span><span><a href="/privacy">Privacy</a> • <a href="/terms">Terms</a> • <a href="/accessibility">Accessibility</a></span></div>
</footer>
<div class="mobile-bar"><a href="tel:${site.phoneHref}" class="btn btn-outline">Call or Text</a><a href="${cta}" class="btn btn-gold" data-cta="mobile_bar">Get My Options</a></div>
<script src="/script.js" defer></script>`;
}

function page(opts, body) {
  const cta = opts.hasForm === false ? '/#lead-form' : '#lead-form';
  return `${head(opts)}
<body data-page-type="${esc(opts.pageType || 'page')}">
${site.gtmId ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${esc(site.gtmId)}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>` : ''}
${header(cta)}
<main id="main">
${body}
</main>
${footer(cta)}
</body>
</html>
`;
}

// ---------- Components ----------

// Progressive options form (playbook §4): situation → address → contact. The lead is created at step 3;
// timeline, occupancy, condition, and goals are asked afterwards on the thank-you page.
// `situation` preselects step 1 and opens the form on the address step.
function leadForm({ situation = '', heading = 'Get Your Property Options', city = '', location = '', pageType = 'page' } = {}) {
  const preset = formSituations.includes(situation) ? situation : '';
  const choice = formSituations
    .map((o) => `<label class="choice"><input type="radio" name="situation" value="${esc(o)}"${o === preset ? ' checked' : ''}><span>${esc(o)}</span></label>`)
    .join('');
  return `<aside class="lead-card" id="lead-form" aria-label="Request property options">
      <p class="eyebrow gold">Start Here · Free &amp; No Obligation</p>
      <h2>${esc(heading)}</h2>
      <form data-lead-form data-steps data-form-type="options"${preset ? ' data-start="1"' : ''} novalidate>
        <input type="hidden" name="form_type" value="options">
        <input type="hidden" name="route_interest" value="">
        <input type="hidden" name="location_interest" value="${esc(location)}">
        <input type="hidden" name="page_type" value="${esc(pageType)}">
        <ol class="step-dots" aria-hidden="true">${Array.from({ length: 3 }, (_, i) => `<li${i === 0 ? ' class="on"' : ''}></li>`).join('')}</ol>
        <fieldset class="fstep" data-step="1"${preset ? ' hidden' : ''}>
          <legend class="fstep-q">What would you like help with?</legend>
          <div class="choice-grid choice-list" role="radiogroup">${choice}</div>
          <button class="btn btn-gold btn-full" type="button" data-next>Continue →</button>
        </fieldset>
        <fieldset class="fstep" data-step="2"${preset ? '' : ' hidden'}>
          <legend class="fstep-q">Where is the property?</legend>
          <label for="f-street-${pageType}">Street address</label><input id="f-street-${pageType}" name="street" autocomplete="address-line1" placeholder="123 Main St" required>
          <div class="addr-row">
            <div><label for="f-city-${pageType}">City</label><input id="f-city-${pageType}" name="city" autocomplete="address-level2" value="${esc(city)}" required></div>
            <div><label for="f-zip-${pageType}">ZIP</label><input id="f-zip-${pageType}" name="zip" autocomplete="postal-code" inputmode="numeric" maxlength="10" required></div>
          </div>
          <input type="hidden" name="state" value="CA">
          <p class="form-hint">California · Kern County and nearby</p>
          <div class="fstep-nav">${preset ? '' : '<button class="btn btn-ghost" type="button" data-back>Back</button>'}<button class="btn btn-gold" type="button" data-next>Continue →</button></div>
        </fieldset>
        <fieldset class="fstep" data-step="3" hidden>
          <legend class="fstep-q">How can we reach you?</legend>
          <div class="two-col">
            <div><label for="f-first-${pageType}">First name</label><input id="f-first-${pageType}" name="first_name" autocomplete="given-name" required></div>
            <div><label for="f-last-${pageType}">Last name</label><input id="f-last-${pageType}" name="last_name" autocomplete="family-name" required></div>
          </div>
          <label for="f-phone-${pageType}">Mobile phone</label><input id="f-phone-${pageType}" name="phone" type="tel" autocomplete="tel" required>
          <label for="f-email-${pageType}">Email <span class="muted">(optional)</span></label><input id="f-email-${pageType}" name="email" type="email" autocomplete="email">
          <label class="check"><input type="checkbox" name="consent_response" value="yes" required><span>${esc(site.name)} may contact me by phone, text, or email about this property.</span></label>
          <label class="check"><input type="checkbox" name="consent_marketing" value="yes"><span>Also send me occasional seller tips and market updates. <span class="muted">(optional)</span></span></label>
          <label class="hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
          <div class="fstep-nav"><button class="btn btn-ghost" type="button" data-back>Back</button><button class="btn btn-gold" type="submit">Get My Property Options →</button></div>
          <p class="form-note">Consent is not a condition of any sale. Msg &amp; data rates may apply; reply STOP to opt out. We never share your number for others’ marketing. See our <a href="/privacy">Privacy Policy</a>.</p>
        </fieldset>
        <p class="form-status" role="status" aria-live="polite"></p>
        <p class="form-alt">Prefer to talk? Call or text <a href="tel:${site.phoneHref}">${esc(site.phone)}</a></p>
      </form>
    </aside>`;
}

const answerBox = (text, label = 'Quick answer') => `<div class="answer-box"><p class="answer-label">${label}</p><p>${text}</p></div>`;

const faqList = (list) => `<div class="faq-list">${list
  .map(([q, a]) => `<details class="faq"><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`)
  .join('')}</div>`;

const finalCta = (href = '#lead-form') => `<section class="section final-cta">
  <div class="container final-cta-grid">
    <div><p class="eyebrow gold-dark">Ready When You Are</p><h2>Not sure what to do with the property?</h2><p>Start with the address. We’ll help you find the clearest next step — or call or text <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a>.</p></div>
    <a class="btn btn-gold big" href="${href}" data-cta="final">Get My Property Options →</a>
  </div>
</section>`;

// Four steps; real sequence, so numbered.
const steps = (light = false) => `<ol class="steps four${light ? ' light-steps' : ''}">
      ${processSteps.map(([h, p], i) => `<li><span class="step-num" aria-hidden="true">${i + 1}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('\n      ')}
    </ol>`;

const reassuranceStrip = () => `<section class="reassure" aria-label="What to expect">
  <ul class="container reassure-list">${reassurance.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
</section>`;

// Each path pre-fills route_interest on the form so the team knows what the seller came in curious about.
const routeCards = () => `<div class="route-grid">${routes
  .map((r) => `<article class="route-card">${img(images[r.image], r.alt, 600, 380, { cls: 'solution-media' })}<div class="solution-body"><h3>${esc(r.name)}</h3><p>${esc(r.text)}</p><a class="route-link" href="#lead-form" data-route="${r.route}">${r.route === 'not_ready' ? 'Get information' : 'Ask about this path'} →</a></div></article>`)
  .join('')}</div>`;

const compareTable = () => `<div class="compare-wrap">
      <table class="compare">
        <caption class="sr-only">Selling directly to Harbison compared with a traditional listing</caption>
        <thead><tr><th scope="col"><span class="sr-only">Factor</span></th><th scope="col">Sell Direct to Harbison</th><th scope="col">Traditional Listing</th></tr></thead>
        <tbody>
          <tr><th scope="row">Repairs</th><td>None — sold as-is</td><td>Often needed to attract buyers</td></tr>
          <tr><th scope="row">Showings</th><td>One walkthrough</td><td>Open houses and repeat showings</td></tr>
          <tr><th scope="row">Timeline</th><td>You pick the closing date, subject to title</td><td>Depends on market and buyer financing</td></tr>
          <tr><th scope="row">Commissions</th><td>None paid to Harbison</td><td>Typically paid to agents</td></tr>
          <tr><th scope="row">Price</th><td>Reflects condition, costs, and convenience</td><td>Can be higher, especially for move-in-ready homes</td></tr>
        </tbody>
      </table>
    </div>
    <p class="disclosure">${esc(compareDisclosure)}</p>`;

const transparencyList = () => `<ul class="promise-list">${transparency.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

// Shown on every situation page: the realistic paths for this kind of property.
const pathsBlock = () => `<h3>Possible paths</h3><ul class="path-mini">${routes
  .map((r) => `<li><strong>${esc(r.name)}.</strong> ${esc(r.text)}</li>`)
  .join('')}</ul>
      <p class="note-small"><strong>What we don’t provide:</strong> legal, tax, or financial advice. For probate, trusts, taxes, or tenant disputes, we’ll suggest you check with an attorney or CPA — and we’re happy to coordinate with them.</p>`;

const glanceTable = () => `<dl class="glance">${glance.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

const testimonialSection = () => `<section class="section white" aria-labelledby="testimonials-h">
  <div class="container">
    <div class="section-head center">
      <p class="eyebrow gold-dark">Client Words</p>
      <h2 id="testimonials-h">What sellers say about <em>working with Nathanael.</em></h2>
    </div>
    <div class="quote-grid">${testimonials.map(([q, who]) => `<figure class="quote"><blockquote><p>“${esc(q)}”</p></blockquote><figcaption>${esc(who)}</figcaption></figure>`).join('')}</div>
    <p class="source-note">Client comments as published on <a class="link" href="${site.brokerageUrl}">${esc(site.brokerage)}</a>.</p>
  </div>
</section>`;

const guideCards = (list = guides) => `<div class="guide-grid">${list
  .map((g) => `<a class="guide-card" href="/guides/${g.slug}">${img(g.image, g.short, 600, 360)}<div><p class="eyebrow gold-dark">Seller Guide</p><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p><span>Read the guide →</span></div></a>`)
  .join('')}</div>`;

const situationGrid = `<div class="situation-grid">${situations
  .map((s) => `<a class="situation" href="/situations/${s.slug}">${esc(s.name)}<span>Learn more →</span></a>`)
  .join('')}</div>`;

const crumbNav = (crumbs) =>
  `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map(([n, p], i) => (i < crumbs.length - 1 ? `<li><a href="${p}">${esc(n)}</a></li>` : `<li aria-current="page">${esc(n)}</li>`)).join('')}</ol></nav>`;

// ---------- Pages ----------

export function homePage() {
  const title = 'We Buy Houses in Bakersfield & Kern County | Harbison Buys Homes';
  const description = 'Property problem? Call Harbison. Sell as-is or compare listing, renovation, and development — licensed, local, no obligation. Call or text (661) 472-7499.';
  const heroImg = sized(images.hero, 1800, 1100);
  return page(
    {
      title,
      description,
      path: '/',
      pageType: 'home',
      image: sized(images.hero, 1200, 630),
      preload: heroImg,
      ld: graph({ path: '/', title, description, image: sized(images.hero, 1200, 630), faq: faqs }),
    },
    `<section class="hero" style="--hero:url('${heroImg}')">
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">${esc(heroCopy.eyebrow)}</p>
      <h1><span class="h1-kicker">We buy houses in Bakersfield &amp; Kern County</span>Property<br>Problem?<br><em>Call Harbison.</em></h1>
      <p class="hero-lead">${esc(heroCopy.sub)}</p>
      <div class="hero-actions"><a class="btn btn-gold" href="#lead-form" data-cta="hero">Get My Property Options</a><a class="btn btn-outline" href="tel:${site.phoneHref}">Call or Text ${esc(site.phone)}</a></div>
      <ul class="hero-benefits">
        ${heroCopy.trust.map(([s, t]) => `<li><strong>${esc(s)}</strong><span>${esc(t)}</span></li>`).join('\n        ')}
      </ul>
    </div>
    ${leadForm({ pageType: 'home' })}
  </div>
</section>

${reassuranceStrip()}

<section class="section cream" id="how">
  <div class="container">
    <div class="section-head center">
      <p class="eyebrow gold-dark">How It Works</p>
      <h2>A clear path starts <em>with the property.</em></h2>
      <p>No runaround and no pressure — four steps, and you decide at the end. <a class="link" href="/how-it-works">More on how it works →</a></p>
    </div>
    ${steps()}
  </div>
</section>

<section class="section white" id="approach">
  <div class="container">
    <div class="section-head split">
      <div>
        <p class="eyebrow gold-dark">More Than a Cash Buyer</p>
        <h2>One property. <em>Several possible paths.</em></h2>
      </div>
      <div class="section-copy">
        <p>A direct purchase may be right. A traditional listing, a renovation plan, or a development review may be better.</p>
        <p><strong>The goal is not to force one solution. It is to identify the right one.</strong></p>
      </div>
    </div>
    ${routeCards()}
  </div>
</section>

<section class="section navy" id="situations">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow gold">Common Situations</p>
      <h2 class="light">Every house has <em>a story.</em></h2>
      <p class="light-soft">These are some of the property situations we can review.</p>
    </div>
    ${situationGrid}
  </div>
</section>

<section class="section cream" id="compare">
  <div class="container">
    <div class="section-head center">
      <p class="eyebrow gold-dark">Side by Side</p>
      <h2>Direct sale vs. <em>traditional listing.</em></h2>
      <p>Both can be the right answer. <a class="link" href="/guides/cash-offer-vs-listing">See a worked example →</a></p>
    </div>
    ${compareTable()}
  </div>
</section>

<section class="local-band" id="about-band">
  <div class="local-photo" style="--local:url('${sized(images.local, 1200, 900)}')" role="img" aria-label="Kern County landscape"></div>
  <div class="local-copy why">
    <p class="eyebrow gold">Why Harbison</p>
    <h2 class="light">Local roots.<br><em>Larger possibilities.</em></h2>
    <dl class="why-list">${whyHarbison.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <a class="btn btn-gold" href="/about">Meet Nathanael →</a>
  </div>
</section>

<section class="section white" id="transparency">
  <div class="container promise-grid">
    <div>
      <p class="eyebrow gold-dark">Seller Transparency</p>
      <h2>A more transparent <em>way to sell.</em></h2>
      <p class="section-copy">Selling a property, especially in a hard moment, deserves clear information and room to decide. These are commitments, not fine print.</p>
      <p><a class="link" href="/how-it-works#promise">Read our full seller promise →</a></p>
    </div>
    ${transparencyList()}
  </div>
</section>

${testimonialSection()}

<section class="section cream" aria-labelledby="guides-h">
  <div class="container">
    <div class="section-head split">
      <div><p class="eyebrow gold-dark">Seller Guides</p><h2 id="guides-h">Straight answers <em>before you sell.</em></h2></div>
      <div class="section-copy"><p>Plain-English guides to the questions Kern County owners ask most — written to help you decide, whether or not you work with us.</p><p><a class="link" href="/guides">All guides →</a></p></div>
    </div>
    ${guideCards(guides.slice(0, 3))}
  </div>
</section>

<section class="section white glance-section" aria-labelledby="glance-h">
  <div class="container">
    <div class="glance-grid">
      <div>
        <p class="eyebrow gold-dark">At a Glance</p>
        <h2 id="glance-h">Harbison Buys Homes, <em>in brief.</em></h2>
        ${answerBox(`${esc(site.name)} buys houses and land as-is in Bakersfield, Tehachapi, California City, Stallion Springs, and throughout Kern County, California. Led by licensed REALTOR® ${esc(site.agent)} (DRE #${esc(site.dre)}), Harbison compares a direct offer with listing, renovation, or development so owners can choose the best path — with no repairs, showings, or obligation.`, 'In short')}
      </div>
      ${glanceTable()}
    </div>
  </div>
</section>

<section class="section cream" id="faq">
  <div class="container narrow">
    <div class="section-head center">
      <p class="eyebrow gold-dark">Questions</p>
      <h2>Frequently asked <em>questions.</em></h2>
    </div>
    ${faqList(faqs)}
  </div>
</section>

${finalCta()}`
  );
}

function detailPage({ item, path, crumbs, eyebrow, extra = '', form = {}, pageType = 'page', service }) {
  const allFaqs = item.faqs ? [...item.faqs, ...faqs.slice(0, 3)] : faqs.slice(0, 4);
  const title = pageTitle(item.title);
  const heroImg = sized(item.image, 1600, 1000);
  const ogImg = sized(item.image, 1200, 630);
  return page(
    {
      title,
      description: item.description,
      path,
      pageType,
      image: ogImg,
      preload: heroImg,
      ld: graph({ path, title, description: item.description, image: ogImg, crumbs, faq: allFaqs, extra: [service] }),
    },
    `<section class="hero hero-sub" style="--hero:url('${heroImg}')">
  <div class="container hero-grid">
    <div class="hero-copy">
      ${crumbNav(crumbs)}
      <p class="eyebrow gold">${esc(eyebrow)}</p>
      <h1 class="h1-sub">${item.headline}</h1>
      <p class="hero-lead">${esc(item.lead)}</p>
    </div>
    ${leadForm({ ...form, pageType })}
  </div>
</section>

<section class="section cream">
  <div class="container detail-grid">
    <article class="prose">
      ${answerBox(esc(item.answer))}
      <h2 class="prose-h">${esc(item.title)}</h2>
      ${item.body.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}
      ${extra}
      <p class="updated">Last updated ${niceDate(BUILD_DATE)} · Reviewed by the ${esc(site.name)} team</p>
    </article>
    <aside class="help-card"><h2>How Harbison helps</h2><ul>${item.helps.map((h) => `<li>${esc(h)}</li>`).join('')}</ul><a class="btn btn-gold btn-full" href="#lead-form" data-cta="help_card">Get Options for This Property →</a><a class="btn btn-ghost btn-full" href="tel:${site.phoneHref}">Call ${esc(site.phone)}</a></aside>
  </div>
</section>

<section class="section navy">
  <div class="container">
    <div class="section-head center">
      <p class="eyebrow gold">A Simple Process</p>
      <h2 class="light">A clear path starts <em>with the property.</em></h2>
    </div>
    ${steps(true)}
  </div>
</section>

<section class="section cream">
  <div class="container narrow">
    <div class="section-head center"><p class="eyebrow gold-dark">Questions</p><h2>Common <em>questions.</em></h2></div>
    ${faqList(allFaqs)}
  </div>
</section>

${finalCta()}`
  );
}

const relatedGuidesFor = (slug) => guides.filter((g) => g.related.includes(slug));
const guideLinks = (list) =>
  list.length ? `<h3>Helpful guides</h3><ul class="link-list">${list.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.title)}</a></li>`).join('')}</ul>` : '';

export function situationPage(s) {
  const others = situations.filter((o) => o.slug !== s.slug);
  const url = `${site.url}/situations/${s.slug}`;
  const familyLink = ['life-change', 'inherited-property', 'relocation'].includes(s.slug)
    ? `<h3>Helping a parent move?</h3><ul class="link-list"><li><a href="/sell-parents-house">Selling a parent’s house in Kern County — as-is vs. listing</a></li></ul>`
    : '';
  const extra = `${pathsBlock()}${familyLink}${guideLinks(relatedGuidesFor(s.slug))}
      <h3>Where we buy</h3><ul class="chip-list">${areas.map((a) => `<li><a href="/areas/${a.slug}">${esc(a.name)}</a></li>`).join('')}</ul>
      <h3>Other situations we help with</h3><ul class="chip-list">${others.map((o) => `<li><a href="/situations/${o.slug}">${esc(o.name)}</a></li>`).join('')}</ul>`;
  return detailPage({
    item: s,
    path: `/situations/${s.slug}`,
    crumbs: [['Home', '/'], ['Situations', '/situations'], [s.name, `/situations/${s.slug}`]],
    eyebrow: `${s.name} • ${site.region}`,
    extra,
    pageType: 'situation',
    form: { situation: situationFormMap[s.slug] || '', heading: 'Get Options for This Property' },
    service: serviceLd({ name: s.title, description: s.description, url, areaServed: areas.map(placeLd) }),
  });
}

export function areaPage(a) {
  const url = `${site.url}/areas/${a.slug}`;
  const otherAreas = areas.filter((o) => o.slug !== a.slug);
  const extra = `<h3>Communities we cover near ${esc(a.name)}</h3><ul class="chip-list">${a.places.map((p) => `<li><span>${esc(p)}</span></li>`).join('')}</ul>
      <h3>Situations we help with in ${esc(a.name)}</h3><ul class="chip-list">${situations.map((o) => `<li><a href="/situations/${o.slug}">${esc(o.name)}</a></li>`).join('')}</ul>
      ${guideLinks(guides)}
      <h3>Other areas we serve</h3><ul class="chip-list">${otherAreas.map((o) => `<li><a href="/areas/${o.slug}">${esc(o.name)}</a></li>`).join('')}</ul>`;
  return detailPage({
    item: {
      ...a,
      helps: ['Sell as-is — no repairs or cleaning', 'No showings or open houses', 'Pick your closing date', 'Honest comparison of every option', `Licensed local agent — DRE #${site.dre}`],
    },
    path: `/areas/${a.slug}`,
    crumbs: [['Home', '/'], [a.name, `/areas/${a.slug}`]],
    eyebrow: `We Buy Houses • ${a.name}, CA`,
    extra,
    pageType: 'location',
    form: { city: a.slug === 'kern-county' ? '' : a.name, location: a.slug, heading: `Get Options for Your ${a.name} Property` },
    service: serviceLd({ name: a.title, description: a.description, url, areaServed: placeLd(a) }),
  });
}

export function situationsIndexPage() {
  const title = pageTitle('Property Situations We Help With');
  const description = `Inherited homes, major repairs, vacant properties, problem tenants, fire damage and more — see how ${site.name} helps ${site.region} owners sell as-is.`;
  const crumbs = [['Home', '/'], ['Situations', '/situations']];
  return page(
    {
      title,
      description,
      path: '/situations',
      pageType: 'situations_index',
      image: sized(images.street, 1200, 630),
      ld: graph({
        path: '/situations', title, description, image: sized(images.street, 1200, 630), type: 'CollectionPage', crumbs,
        extra: [{ '@type': 'ItemList', '@id': `${site.url}/situations#list`, itemListElement: situations.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${site.url}/situations/${s.slug}` })) }],
      }),
    },
    `<section class="section navy page-top">
  <div class="container">
    ${crumbNav(crumbs)}
    <div class="section-head">
      <p class="eyebrow gold">Common Situations</p>
      <h1 class="page-title light">Every house has <em>a story.</em></h1>
      <p class="light-soft">Pick the situation closest to yours to see how we can help — or just <a class="link-gold" href="#lead-form">send us the address</a>.</p>
    </div>
    <div class="card-grid">
      ${situations
        .map((s) => `<a class="story-card" href="/situations/${s.slug}">${img(s.image, s.name, 600, 360, { cls: 'story-media' })}<div class="story-body"><h2>${esc(s.name)}</h2><p>${esc(s.lead)}</p><span>Learn more →</span></div></a>`)
        .join('\n      ')}
    </div>
  </div>
</section>
<section class="section cream">
  <div class="container form-band">
    <div><p class="eyebrow gold-dark">Don’t see yours?</p><h2>Every property is <em>different.</em></h2><p>Tell us what’s going on. If we can’t help, we’ll tell you quickly and point you in the right direction.</p></div>
    ${leadForm({ heading: 'Tell Us About the Property', pageType: 'situations_index' })}
  </div>
</section>`
  );
}

export function aboutPage() {
  const title = pageTitle(`${about.title}, REALTOR®`);
  const crumbs = [['Home', '/'], ['About', '/about']];
  const image = `${site.url}${ogDefault}`;
  return page(
    {
      title,
      description: about.description,
      path: '/about',
      pageType: 'about',
      image,
      preload: headshot,
      hasForm: false,
      ld: graph({ path: '/about', title, description: about.description, image, type: 'ProfilePage', crumbs }),
    },
    `<section class="section navy page-top">
  <div class="container">
    ${crumbNav(crumbs)}
    <div class="about-hero">
      <img class="headshot" src="${headshot}" alt="${esc(site.agent)}, REALTOR®, Harbison Buys Homes" width="325" height="325" fetchpriority="high">
      <div>
        <p class="eyebrow gold">About Harbison Buys Homes</p>
        <h1 class="page-title light">Meet <em>${esc(site.agent)}.</em></h1>
        <p class="light-soft about-lead">California-licensed REALTOR® · DRE #${esc(site.dre)} · ${esc(site.brokerage)}</p>
      </div>
    </div>
  </div>
</section>
<section class="section cream">
  <div class="container detail-grid">
    <article class="prose">
      ${answerBox(`${esc(site.agent)} is a California-licensed REALTOR® (DRE #${esc(site.dre)}) with ${esc(site.brokerage)} who leads ${esc(site.name)}. He helps Kern County property owners sell as-is, list, renovate, or develop — and compares those options honestly before anyone commits.`, 'Who is Nathanael Harbison?')}
      ${about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}
      <h2 class="prose-h">How we work</h2>
      <dl class="principles">${about.principles.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <h2 class="prose-h">Verify &amp; connect</h2>
      <ul class="link-list">
        <li><a href="https://www2.dre.ca.gov/PublicASP/pplinfo.asp" rel="noopener" target="_blank">Look up DRE license #${esc(site.dre)}</a> on the California Department of Real Estate site</li>
        ${site.agentProfiles.map((u) => `<li><a href="${u}" rel="noopener me" target="_blank">${esc(u.replace(/^https:\/\/(www\.)?/, ''))}</a></li>`).join('\n        ')}
      </ul>
    </article>
    <aside class="help-card"><h2>Talk with Nathanael</h2><ul><li>Call or text ${esc(site.phone)}</li><li>${esc(site.email)}</li><li>Replies typically within 24 hours</li><li>Serving ${areas.map((a) => esc(a.name)).join(', ')}</li></ul><a class="btn btn-gold btn-full" href="/#lead-form">Get My Options →</a><a class="btn btn-ghost btn-full" href="tel:${site.phoneHref}">Call ${esc(site.phone)}</a></aside>
  </div>
</section>
${testimonialSection()}
${finalCta('/#lead-form')}`
  );
}

export function guidesIndexPage() {
  const title = pageTitle('Seller Guides for Kern County Homeowners');
  const description = 'Plain-English guides on selling a house as-is in California, cash offers vs. listing, and selling an inherited house — from Harbison Buys Homes.';
  const crumbs = [['Home', '/'], ['Guides', '/guides']];
  const image = sized(images.renovate, 1200, 630);
  return page(
    {
      title,
      description,
      path: '/guides',
      pageType: 'guides_index',
      image,
      hasForm: false,
      ld: graph({
        path: '/guides', title, description, image, type: 'CollectionPage', crumbs,
        extra: [{ '@type': 'ItemList', '@id': `${site.url}/guides#list`, itemListElement: guides.map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.title, url: `${site.url}/guides/${g.slug}` })) }],
      }),
    },
    `<section class="section cream page-top">
  <div class="container">
    ${crumbNav(crumbs)}
    <p class="eyebrow gold-dark">Seller Guides</p>
    <h1 class="page-title">Straight answers <em>before you sell.</em></h1>
    <p class="page-intro">Clear, practical guides for Kern County property owners. Not legal or tax advice — but a solid place to start.</p>
    ${guideCards()}
  </div>
</section>
${finalCta('/#lead-form')}`
  );
}

export function guidePage(g) {
  const path = `/guides/${g.slug}`;
  const url = `${site.url}${path}`;
  const title = pageTitle(g.title);
  const crumbs = [['Home', '/'], ['Guides', '/guides'], [g.short, path]];
  const image = sized(g.image, 1200, 630);
  const toc = g.sections.map(([h], i) => `<li><a href="#s${i + 1}">${esc(h)}</a></li>`).join('');
  const related = situations.filter((s) => g.related.includes(s.slug));
  const article = {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: g.title,
    description: g.description,
    image,
    datePublished: g.updated,
    dateModified: g.updated,
    author: { '@id': ids.org },
    publisher: { '@id': ids.org },
    about: g.sections.map(([h]) => ({ '@type': 'Thing', name: h })),
    inLanguage: 'en-US',
  };
  return page(
    { title, description: g.description, path, image, article: g, pageType: 'guide', ld: graph({ path, title, description: g.description, image, crumbs, extra: [article], modified: g.updated }) },
    `<section class="section cream page-top guide">
  <div class="container detail-grid">
    <article class="prose">
      ${crumbNav(crumbs)}
      <p class="eyebrow gold-dark">Seller Guide</p>
      <h1 class="page-title guide-title">${esc(g.title)}</h1>
      <p class="updated">By the ${esc(site.name)} team · Published <time datetime="${g.updated}">${niceDate(g.updated)}</time> · Last reviewed <time datetime="${BUILD_DATE}">${niceDate(BUILD_DATE)}</time></p>
      ${answerBox(esc(g.answer), 'The short answer')}
      <nav class="toc" aria-label="In this guide"><p class="answer-label">In this guide</p><ol>${toc}</ol></nav>
      ${g.sections.map(([h, paras], i) => `<section id="s${i + 1}"><h2 class="prose-h">${esc(h)}</h2>${paras.map((p) => (p.startsWith('<ul') || p.startsWith('<div') ? p : `<p>${p}</p>`)).join('')}</section>`).join('\n      ')}
      ${g.meaning ? `<aside class="meaning"><h2>What this means for your property</h2><p>${esc(g.meaning)}</p><a class="btn btn-gold" href="#lead-form" data-cta="guide_meaning">Get Options for My Property →</a></aside>` : ''}
      <aside class="author-box"><img class="author-photo" src="${headshot}" alt="${esc(site.agent)}" width="64" height="64" loading="lazy"><div><p class="answer-label">About the author</p><p>Written by the ${esc(site.name)} team, led by ${esc(site.agent)}, California-licensed REALTOR® (DRE #${esc(site.dre)}) with ${esc(site.brokerage)}. <a class="link" href="/about">About Nathanael →</a></p></div></aside>
      <p class="disclaimer">This guide is educational and does not replace legal, tax, or financial advice. Laws and thresholds change — consult a qualified attorney, CPA, or your agent about your specific situation.</p>
      <h3>Related situations</h3><ul class="chip-list">${related.map((s) => `<li><a href="/situations/${s.slug}">${esc(s.name)}</a></li>`).join('')}</ul>
      <h3>More guides</h3><ul class="link-list">${guides.filter((o) => o.slug !== g.slug).map((o) => `<li><a href="/guides/${o.slug}">${esc(o.title)}</a></li>`).join('')}</ul>
    </article>
    ${leadForm({ heading: 'Want Real Numbers for Your Property?', pageType: 'guide' })}
  </div>
</section>
${finalCta()}`
  );
}

function simplePage({ title, description, path, heading, body, noindex = false, pageType = 'page' }) {
  return page(
    { title: pageTitle(title), description, path, noindex, pageType, hasForm: false, ld: noindex ? null : graph({ path, title: pageTitle(title), description, image: `${site.url}${ogDefault}` }) },
    `<section class="section cream page-top">
  <div class="container narrow prose legal">
    <h1 class="page-title">${heading}</h1>
    ${body}
  </div>
</section>`
  );
}

// Optional follow-up questions. The lead already exists; these add context for the first call.
const detailRadios = (name, list) => `<div class="choice-grid" role="radiogroup">${list
  .map((o) => `<label class="choice"><input type="radio" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>`)
  .join('')}</div>`;
const detailChecks = (name, list) => `<div class="choice-grid">${list
  .map((o) => `<label class="choice"><input type="checkbox" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>`)
  .join('')}</div>`;

export function thankYouPage() {
  return page(
    { title: pageTitle('Thank You'), description: 'We received your property information.', path: '/thank-you', noindex: true, hasForm: false, pageType: 'thank_you' },
    `<section class="section cream page-top">
  <div class="container detail-grid">
    <div class="prose">
      <p class="eyebrow gold-dark">Request received</p>
      <h1 class="page-title">We received your <em>property information.</em></h1>
      <p class="lead">We’ll review the address and situation before contacting you. If a direct sale, listing, renovation, or development path appears relevant, we’ll explain why. There is no obligation to move forward.</p>
      <p>We typically respond within 24 hours. If there’s a specific deadline or issue we should know about, reply to our confirmation text or call or text <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a>.</p>
      <div class="hero-actions ty-actions"><a class="btn btn-gold" href="tel:${site.phoneHref}">Call or Text ${esc(site.phone)}</a><a class="btn btn-ghost-dark" href="/guides">Read the seller guides</a><a class="btn btn-ghost-dark" href="/how-it-works">How it works</a></div>
    </div>
    <aside class="lead-card details-card" aria-label="Optional property details">
      <p class="eyebrow gold">Optional · 30 seconds</p>
      <h2>Help us prepare for your call</h2>
      <form data-details-form novalidate>
        <fieldset><legend class="fstep-q">Timeline</legend>${detailRadios('timeline', detailOptions.timeline)}</fieldset>
        <fieldset><legend class="fstep-q">Who lives there now?</legend>${detailRadios('occupancy', detailOptions.occupancy)}</fieldset>
        <fieldset><legend class="fstep-q">Condition <span class="muted">(pick any)</span></legend>${detailChecks('condition', detailOptions.condition)}</fieldset>
        <fieldset><legend class="fstep-q">What matters most?</legend>${detailRadios('desired_outcome', detailOptions.outcome)}</fieldset>
        <button class="btn btn-gold btn-full" type="submit">Add to My Request</button>
        <p class="form-status" role="status" aria-live="polite"></p>
      </form>
    </aside>
  </div>
</section>`
  );
}

export function howItWorksPage() {
  const path = '/how-it-works';
  const title = pageTitle('How It Works: Selling With Harbison');
  const description = 'How Harbison reviews a property, how direct offers are figured, what happens at the walkthrough, and the seller promise behind every conversation.';
  const crumbs = [['Home', '/'], ['How It Works', path]];
  const image = sized(images.renovate, 1200, 630);
  return page(
    { title, description, path, image, pageType: 'how_it_works', hasForm: false, ld: graph({ path, title, description, image, crumbs }) },
    `<section class="section navy page-top">
  <div class="container">
    ${crumbNav(crumbs)}
    <p class="eyebrow gold">How It Works</p>
    <h1 class="page-title light">A clear path starts <em>with the property.</em></h1>
    <p class="light-soft page-intro">${esc(supportingPromise)} Here is exactly what happens — and what doesn’t.</p>
    ${steps(true)}
  </div>
</section>

<section class="section cream">
  <div class="container detail-grid">
    <article class="prose">
      ${answerBox(`Start with the address. ${esc(site.name)} reviews the property and your situation, then shows you the realistic paths — a direct sale, a listing, repairs first, or a development review — in writing, with the assumptions behind any number. You decide, with no obligation and no deadline.`, 'The short version')}
      <h2 class="prose-h" id="walkthrough">The walkthrough</h2>
      ${walkthrough.map((p) => `<p>${esc(p)}</p>`).join('')}
      <p><a class="link" href="/guides/direct-sale-walkthrough">What to expect at a walkthrough →</a></p>

      <h2 class="prose-h" id="offers">How a direct offer is figured</h2>
      <p>${esc(offerExplanation)}</p>
      <div class="compare-wrap"><table class="compare offer-table"><caption class="sr-only">Illustrative direct-offer breakdown</caption><thead><tr><th scope="col">Illustrative example</th><th scope="col">Amount</th></tr></thead><tbody>${offerExample.map(([k, v], i) => `<tr${i === offerExample.length - 1 ? ' class="total"' : ''}><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note-small">This is an example to show how the pieces fit together — not a formula applied to every property, a valuation of any home, or a promise of any offer. Every property’s numbers are different, and we show you yours.</p>

      <h2 class="prose-h">Direct sale or listing?</h2>
      ${compareTable()}

      <h2 class="prose-h" id="promise">Our seller promise</h2>
      ${transparencyList()}
      <dl class="principles safeguards">${safeguards.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>

      <h2 class="prose-h">Closing</h2>
      <p>Every sale closes through a licensed title or escrow company, which holds funds, handles payoffs, and records the deed. Signatures can often be done remotely. You choose the closing date, subject to title and any required approvals.</p>
    </article>
    <aside class="help-card"><h2>Ready to start?</h2><ul>${reassurance.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><a class="btn btn-gold btn-full" href="/#lead-form" data-cta="how_it_works">Get My Property Options →</a><a class="btn btn-ghost btn-full" href="tel:${site.phoneHref}">Call or Text ${esc(site.phone)}</a></aside>
  </div>
</section>
${finalCta('/#lead-form')}`
  );
}

export function contactPage() {
  const path = '/contact';
  const title = pageTitle('Contact Harbison Buys Homes');
  const description = `Call or text ${site.phone}, email ${site.email}, or send the property address. Serving Bakersfield, Tehachapi, and Kern County.`;
  const crumbs = [['Home', '/'], ['Contact', path]];
  const image = `${site.url}${ogDefault}`;
  const contactLd = { '@type': 'ContactPage', '@id': `${site.url}${path}#contact`, about: { '@id': `${site.url}/#business` } };
  return page(
    { title, description, path, image, pageType: 'contact', ld: graph({ path, title, description, image, crumbs, extra: [contactLd] }) },
    `<section class="section cream page-top">
  <div class="container form-band">
    <div>
      ${crumbNav(crumbs)}
      <p class="eyebrow gold-dark">Contact</p>
      <h1 class="page-title">Property problem? <em>Call Harbison.</em></h1>
      <dl class="contact-list">
        <div><dt>Call or text</dt><dd><a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a></dd></div>
        <div><dt>Email</dt><dd><a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a></dd></div>
        <div><dt>Response</dt><dd>Typically within 24 hours</dd></div>
        <div><dt>Service area</dt><dd>${areas.map((a) => `<a class="link" href="/areas/${a.slug}">${esc(a.name)}</a>`).join(', ')}</dd></div>
        <div><dt>Licensed</dt><dd>${esc(site.agent)}, REALTOR® · DRE #${esc(site.dre)} · ${esc(site.brokerage)}</dd></div>
      </dl>
      <p class="note-small">If you’ve asked us to stop contacting you, you won’t hear from us again. To make that request, reply STOP to any text or email ${esc(site.email)}.</p>
    </div>
    ${leadForm({ heading: 'Send Us the Property', pageType: 'contact' })}
  </div>
</section>`
  );
}

export function accessibilityPage() {
  return simplePage({
    title: 'Accessibility',
    description: `${site.name} is committed to a website everyone can use. How to reach us if something doesn’t work for you.`,
    path: '/accessibility',
    pageType: 'accessibility',
    heading: 'Accessibility',
    body: `<p class="muted-note">Last updated: ${niceDate(BUILD_DATE)}</p>
    <p>${esc(site.name)} wants everyone to be able to learn about their options and reach us, including people who use screen readers, keyboard navigation, magnification, or voice control.</p>
    <h2 class="prose-h">What we do</h2>
    <ul>
      <li>Aim to meet WCAG 2.1 Level AA</li>
      <li>Label every form field and announce form errors to assistive technology</li>
      <li>Keep pages usable by keyboard, with visible focus</li>
      <li>Maintain color contrast and never rely on color alone</li>
      <li>Describe meaningful images with alternative text</li>
    </ul>
    <h2 class="prose-h">Need help or found a problem?</h2>
    <p>If any part of this site is hard to use, call or text <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a> or email <a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a>. We’ll help you directly and fix the issue.</p>`,
  });
}

export function notFoundPage() {
  return simplePage({
    title: 'Page Not Found',
    description: 'Page not found.',
    path: '/404',
    noindex: true,
    heading: 'Page <em>not found.</em>',
    body: `<p class="lead">That page doesn’t exist — but we can still help with your property.</p><p><a class="btn btn-gold" href="/">Go to home</a> <a class="btn btn-ghost-dark" href="/situations">See situations</a></p>`,
  });
}

const lastUpdated = niceDate(BUILD_DATE);

export function privacyPage() {
  return simplePage({
    title: 'Privacy Policy',
    description: `How ${site.name} collects, uses, and protects information submitted through this website.`,
    path: '/privacy',
    heading: 'Privacy Policy',
    body: `<p class="muted-note">Last updated: ${lastUpdated}</p>
    <p>${esc(site.name)} (“we,” “us”) respects your privacy. This policy explains what information we collect through this website and how we use it.</p>
    <h2 class="prose-h">Information we collect</h2>
    <p>When you submit a form, we collect the information you provide, such as your name, phone number, email address, property address, and details about your situation. We also collect standard technical data (such as browser type, pages visited, and referring site) through cookies and analytics tools.</p>
    <h2 class="prose-h">How we use it</h2>
    <ul>
      <li>To respond to your inquiry and evaluate your property</li>
      <li>To contact you by phone, text message, or email about your property</li>
      <li>To improve our website and services</li>
      <li>To comply with legal obligations</li>
    </ul>
    <h2 class="prose-h">Text messages</h2>
    <p>If you provide your phone number, you agree we may contact you by call or text about your inquiry. Message and data rates may apply. Reply STOP to opt out at any time. We do not sell or share mobile numbers or SMS consent with third parties for their marketing purposes.</p>
    <h2 class="prose-h">Sharing</h2>
    <p>We do not sell your personal information. We may share it with service providers who help us operate our business (for example, hosting, email, CRM, and title/escrow companies when you choose to move forward), or when required by law.</p>
    <h2 class="prose-h">Your California privacy rights</h2>
    <p>California residents may request access to, correction of, or deletion of their personal information. To make a request, email <a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a>.</p>
    <h2 class="prose-h">Contact</h2>
    <p>Questions? Contact us at <a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a> or <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a>.</p>`,
  });
}

export function termsPage() {
  return simplePage({
    title: 'Terms of Use',
    description: `Terms of use for the ${site.name} website, including our no-offer disclaimer and California real estate license disclosure.`,
    path: '/terms',
    heading: 'Terms of Use',
    body: `<p class="muted-note">Last updated: ${lastUpdated}</p>
    <p>By using this website you agree to these terms.</p>
    <h2 class="prose-h">No offer or advice</h2>
    <p>Content on this site is for general information only. Nothing here is an offer to purchase any property, and no binding agreement exists until a written purchase agreement is signed by all parties. We do not provide legal, tax, or financial advice — please consult a qualified professional about your situation.</p>
    <h2 class="prose-h">License disclosure</h2>
    <p>${esc(site.agent)} is a California-licensed real estate agent (DRE #${esc(site.dre)}) with ${esc(site.brokerage)}. When ${esc(site.name)} offers to purchase a property directly, that licensed status is disclosed to the seller in writing.</p>
    <h2 class="prose-h">Submissions</h2>
    <p>You agree that information you submit is accurate and that you have the right to share it. Submitting a form does not obligate you to sell, and does not obligate us to make an offer.</p>
    <h2 class="prose-h">Intellectual property</h2>
    <p>The ${esc(site.name)} name, logo, and site content are our property and may not be used without permission.</p>
    <h2 class="prose-h">Limitation of liability</h2>
    <p>This site is provided “as is.” To the fullest extent permitted by law, we are not liable for damages arising from your use of the site.</p>
    <h2 class="prose-h">Contact</h2>
    <p><a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a> • <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a></p>`,
  });
}

// ---------- Family Property Transition ----------

const radios = (name, list, required = true) => `<div class="choice-grid" role="radiogroup">${list
  .map((o, i) => `<label class="choice"><input type="radio" name="${name}" value="${esc(o)}"${required && i === 0 ? ' required' : ''}><span>${esc(o)}</span></label>`)
  .join('')}</div>`;

// Four-step form. Step 1 asks for the address only, so the first commitment is small.
function familyLeadForm() {
  return `<aside class="lead-card family-card" id="lead-form" aria-label="Talk with Nathanael about a parent's house">
      <h2>What property are you trying to figure out?</h2>
      <form data-lead-form data-form-type="family_transition" data-steps novalidate>
        <input type="hidden" name="form_type" value="family_transition">
        <ol class="step-dots" aria-hidden="true"><li class="on"></li><li></li><li></li><li></li></ol>
        <fieldset class="fstep" data-step="1">
          <legend class="sr-only">Step 1 of 4: property</legend>
          <label>Property address<input name="address" autocomplete="street-address" placeholder="123 Main St, Bakersfield, CA" required></label>
          <button class="btn btn-gold btn-full" type="button" data-next>Continue →</button>
        </fieldset>
        <fieldset class="fstep" data-step="2" hidden>
          <legend class="fstep-q">What’s happening with the property?</legend>
          ${radios('situation', familyForm.situations)}
          <div class="fstep-nav"><button class="btn btn-ghost" type="button" data-back>Back</button><button class="btn btn-gold" type="button" data-next>Continue →</button></div>
        </fieldset>
        <fieldset class="fstep" data-step="3" hidden>
          <legend class="fstep-q">What would help most?</legend>
          ${radios('help_needed', familyForm.helpNeeded)}
          <label>Timing<select name="timeline"><option value="">Not sure</option>${familyForm.timelines.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
          <div class="fstep-nav"><button class="btn btn-ghost" type="button" data-back>Back</button><button class="btn btn-gold" type="button" data-next>Continue →</button></div>
        </fieldset>
        <fieldset class="fstep" data-step="4" hidden>
          <legend class="fstep-q">How should we reach you?</legend>
          <div class="two-col">
            <label>Your name<input name="name" autocomplete="name" required></label>
            <label>Phone<input name="phone" type="tel" autocomplete="tel" required></label>
          </div>
          <label>Email <span class="muted">(optional)</span><input name="email" type="email" autocomplete="email"></label>
          <label>Your relationship to the property<select name="relationship" required><option value="">Select one</option>${familyForm.relationships.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
          <label>Best way to reach you<select name="contact_pref">${familyForm.contactPrefs.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
          <label class="hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
          <div class="fstep-nav"><button class="btn btn-ghost" type="button" data-back>Back</button><button class="btn btn-gold" type="submit">Talk With Nathanael →</button></div>
          <p class="form-note">By submitting, you agree ${esc(site.name)} may contact you by phone, text, or email about this property. Consent is not a condition of any sale. Msg &amp; data rates may apply; reply STOP to opt out. We never ask for medical information. See our <a href="/privacy">Privacy Policy</a>.</p>
        </fieldset>
        <p class="form-status" role="status" aria-live="polite"></p>
      </form>
    </aside>`;
}

// Click-to-load YouTube (no third-party JS until the viewer asks for it). Placeholder until an ID exists.
const videoBlock = (v, { large = false } = {}) => v.id
  ? `<figure class="video${large ? ' video-lg' : ''}"><button class="video-btn" type="button" data-yt="${esc(v.id)}" aria-label="Play video: ${esc(v.title || v.q)}" style="--thumb:url('https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg')"><span class="play" aria-hidden="true">▶</span></button><figcaption>${esc(v.title || v.q)}</figcaption></figure>`
  : `<figure class="video video-pending${large ? ' video-lg' : ''}"><div class="video-btn"><span class="play" aria-hidden="true">▶</span><span class="soon">Video coming soon</span></div><figcaption>${esc(v.title || v.q)}</figcaption></figure>`;

const videoLd = (v, url) => (v.id ? [{
  '@type': 'VideoObject',
  '@id': `${url}#video-${v.id}`,
  name: v.title || v.q,
  description: v.title || v.q,
  thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
  embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
  uploadDate: BUILD_DATE,
}] : []);

export function familyPage() {
  const f = family;
  const url = `${site.url}${f.path}`;
  const title = pageTitle('Selling a Parent’s House in Kern County');
  const crumbs = [['Home', '/'], ['Selling a Parent’s House', f.path]];
  const heroImg = sized(f.image, 1600, 1000);
  const ogImg = sized(f.image, 1200, 630);
  const allFaqs = [...f.faqs, ...faqs.slice(0, 2)];
  const service = serviceLd({ name: f.title, description: f.description, url, areaServed: areas.map(placeLd) });
  const vids = [f.heroVideo, ...f.videos].flatMap((v) => videoLd(v, url));
  const howTo = {
    '@type': 'HowTo',
    '@id': `${url}#howto`,
    name: 'How to sell a parent’s house in Kern County',
    step: f.timeline.map(([n, t], i) => ({ '@type': 'HowToStep', position: i + 1, name: n, text: t })),
  };
  const { direct, listing } = f.paths;
  return page(
    { title, description: f.description, path: f.path, image: ogImg, preload: heroImg, pageType: 'family', ld: graph({ path: f.path, title, description: f.description, image: ogImg, crumbs, faq: allFaqs, extra: [service, howTo, ...vids] }) },
    `<section class="hero hero-sub" style="--hero:url('${heroImg}')">
  <div class="container hero-grid">
    <div class="hero-copy">
      ${crumbNav(crumbs)}
      <p class="eyebrow gold">For families in ${esc(site.region)}</p>
      <h1 class="h1-sub">${f.headline}</h1>
      <p class="hero-lead">${esc(f.lead)}</p>
      <div class="hero-actions"><a class="btn btn-gold" href="tel:${site.phoneHref}" data-track="call_click">Call Nathanael · ${esc(site.phone)}</a><a class="btn btn-outline" href="#options">See My Options</a></div>
    </div>
    ${familyLeadForm()}
  </div>
</section>

<section class="section white">
  <div class="container family-intro">
    <div>
      ${answerBox(esc(f.answer))}
      <p class="fam-note">Families usually call because they’re handling two things at once: helping a parent through a major move, and suddenly being responsible for an entire house.</p>
    </div>
    ${videoBlock(f.heroVideo, { large: true })}
  </div>
</section>

<section class="section cream">
  <div class="container">
    <div class="section-head">
      <h2>You’re probably dealing with <em>more than a house.</em></h2>
    </div>
    <div class="problem-grid">${f.problems.map(([h, p]) => `<article class="problem"><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('')}</div>
  </div>
</section>

<section class="section white" id="options">
  <div class="container">
    <div class="section-head center">
      <h2>Two paths. <em>Your family chooses.</em></h2>
      <p>Neither is automatically better. The right one depends on the house, the budget for the move, and how much time and energy the family has.</p>
    </div>
    <div class="path-grid">
      <article class="path-col"><h3>${esc(direct.name)}</h3><ul>${direct.rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p class="path-best">Best when convenience, speed, or condition matters most.</p></article>
      <article class="path-col alt"><h3>${esc(listing.name)}</h3><ul>${listing.rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p class="path-best">Best when the house shows well and there’s time to prepare it.</p></article>
    </div>
    <p class="disclosure">${esc(f.disclosure)}</p>
    <p class="btn-row"><a class="btn btn-gold big" href="#lead-form">Compare My Options →</a></p>
  </div>
</section>

<section class="section navy">
  <div class="container">
    <div class="section-head center"><h2 class="light">What the process <em>looks like.</em></h2></div>
    <ol class="steps light-steps five">${f.timeline.map(([h, p], i) => `<li><span class="step-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('')}</ol>
  </div>
</section>

<section class="section cream">
  <div class="container detail-grid">
    <div>
      <div class="section-head"><h2>Questions families <em>ask Nathanael.</em></h2></div>
      <div class="video-grid">${f.videos.map((v) => videoBlock(v)).join('')}</div>
    </div>
    <aside class="help-card"><h2>How Harbison helps</h2><ul>${f.helps.map((h) => `<li>${esc(h)}</li>`).join('')}</ul><a class="btn btn-gold btn-full" href="#lead-form">Talk With Nathanael →</a><a class="btn btn-ghost btn-full" href="tel:${site.phoneHref}" data-track="call_click">Call ${esc(site.phone)}</a></aside>
  </div>
</section>

<section class="section white" id="faq">
  <div class="container narrow">
    <div class="section-head center"><h2>Common <em>questions.</em></h2></div>
    ${faqList(allFaqs)}
    <p class="disclaimer">General information, not legal or tax advice. For questions about authority to sell, trusts, or conservatorships, talk with an elder-law or estate attorney.</p>
    <h3>Related</h3><ul class="chip-list">${['inherited-property', 'vacant-property', 'needs-major-repairs', 'relocation'].map((slug) => situations.find((s) => s.slug === slug)).filter(Boolean).map((s) => `<li><a href="/situations/${s.slug}">${esc(s.name)}</a></li>`).join('')}<li><a href="/guides/sell-inherited-house-california">Inherited house guide</a></li></ul>
  </div>
</section>

${finalCta()}`
  );
}

// Printable guide handed out by referral partners. Not indexed — it's a leave-behind, not a search page.
export function partnerGuidePage() {
  const g = partnerGuide;
  return page(
    { title: pageTitle('Family Property Guide'), description: g.intro, path: g.path, noindex: true, hasForm: false },
    `<section class="section cream page-top print-guide">
  <div class="container narrow prose">
    <h1 class="page-title">What to do with <em>a parent’s house.</em></h1>
    <p class="lead">${esc(g.intro)}</p>
    <h2 class="prose-h">Five questions to answer first</h2>
    <ol>${g.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
    <h2 class="prose-h">Your two main options</h2>
    <p><strong>Sell as-is:</strong> no repairs, belongings can stay, closing on your schedule. <strong>List traditionally:</strong> prepare the home and aim for full market value. Many families compare both before deciding.</p>
    <h2 class="prose-h">Talk it through with a local, licensed agent</h2>
    <p>${esc(site.agent)} · ${esc(site.name)} · DRE #${esc(site.dre)}<br>Call or text <strong>${esc(site.phone)}</strong> · ${esc(site.email)}<br>Online: <strong>${esc(site.url.replace(/^https?:\/\//, ''))}/family</strong></p>
    <p class="disclaimer">You choose whether to contact us. We never ask for medical information. On a direct purchase, Harbison is the buyer and discloses its license status in writing; you’re welcome to have anyone you trust review an offer.</p>
    <p class="no-print"><button class="btn btn-gold" type="button" onclick="print()">Print this guide</button></p>
  </div>
</section>`
  );
}
