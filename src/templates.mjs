import site from '../site.config.mjs';
import { images, situations, areas, faqs, situationOptions, timelineOptions } from './content.mjs';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const year = new Date().getFullYear();
const logo = '/assets/harbison-buys-homes-logo.png';

const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const businessLd = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  '@id': `${site.url}/#business`,
  name: site.name,
  slogan: site.tagline,
  url: site.url,
  logo: `${site.url}${logo}`,
  image: `${site.url}${logo}`,
  telephone: site.phoneHref,
  email: site.email,
  employee: { '@type': 'Person', name: site.agent, identifier: `DRE #${site.dre}` },
  address: { '@type': 'PostalAddress', addressLocality: site.city, addressRegion: site.state, addressCountry: 'US' },
  areaServed: [
    ...site.serviceAreas.map((name) => ({ '@type': name.includes('County') ? 'AdministrativeArea' : 'City', name: `${name}, ${site.state}` })),
  ],
};

const faqLd = (list) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: list.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

const breadcrumbLd = (crumbs) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site.url}${path}` })),
});

function head({ title, description, path, image = `${site.url}${logo}`, noindex = false, ld = [] }) {
  const canonical = `${site.url}${path === '/' ? '/' : path}`;
  const ga = site.gaId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(site.gaId)}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(site.gaId)}');</script>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
  <meta name="theme-color" content="#031f2b">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(site.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${esc(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${logo}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  ${ga}
  <script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>
  <script defer src="/_vercel/insights/script.js"></script>
  ${ld.map(jsonLd).join('\n  ')}
</head>`;
}

function header(cta) {
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container nav-wrap">
    <a class="brand" href="/" aria-label="${esc(site.name)} home"><img src="${logo}" alt="${esc(site.name)}" width="58" height="58"></a>
    <button class="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav"><span></span><span></span><span></span></button>
    <nav class="nav" id="site-nav">
      <a href="/#how">How It Works</a>
      <a href="/situations">Situations</a>
      <a href="/#approach">Our Approach</a>
      <a href="/#faq">FAQ</a>
      <a href="/#contact">Contact</a>
      <a class="nav-phone" href="tel:${site.phoneHref}">${esc(site.phone)}</a>
    </nav>
    <a class="btn btn-gold header-cta" href="${cta}">Get My Options</a>
  </div>
</header>`;
}

function footer(cta) {
  return `<footer class="footer" id="contact">
  <div class="container footer-grid">
    <div><img class="footer-logo" src="${logo}" alt="${esc(site.name)}" width="74" height="74" loading="lazy"><p>${esc(site.tagline)}</p></div>
    <div><h4>Explore</h4><a href="/#how">How It Works</a><a href="/situations">Situations</a><a href="/#approach">Our Approach</a><a href="/#faq">FAQ</a></div>
    <div><h4>Contact</h4><a href="tel:${site.phoneHref}">${esc(site.phone)}</a><a href="mailto:${esc(site.email)}">${esc(site.email)}</a><a href="/#lead-form">Request property options</a></div>
    <div><h4>Service Area</h4>${areas.map((a) => `<a href="/areas/${a.slug}">${esc(a.name)}</a>`).join('')}</div>
  </div>
  <div class="container footer-bottom"><span>© ${year} ${esc(site.name)}. ${esc(site.agent)}, DRE #${esc(site.dre)} • <a href="${site.brokerageUrl}">${esc(site.brokerage)}</a></span><span><a href="/privacy">Privacy</a> • <a href="/terms">Terms</a></span></div>
</footer>
<div class="mobile-bar"><a href="tel:${site.phoneHref}" class="btn btn-outline">Call Now</a><a href="${cta}" class="btn btn-gold">Get My Options</a></div>
<script src="/script.js" defer></script>`;
}

function page(opts, body) {
  const cta = opts.hasForm === false ? '/#lead-form' : '#lead-form';
  return `${head(opts)}
<body>
${header(cta)}
<main id="main">
${body}
</main>
${footer(cta)}
</body>
</html>
`;
}

const options = (list) => list.map((o) => `<option>${esc(o)}</option>`).join('');

function leadForm({ situation = '', heading = 'Get Your Property Options' } = {}) {
  const situationSelect = situationOptions
    .map((o) => `<option${o.toLowerCase().startsWith(situation.toLowerCase()) && situation ? ' selected' : ''}>${esc(o)}</option>`)
    .join('');
  return `<aside class="lead-card" id="lead-form">
      <p class="eyebrow gold">Start Here</p>
      <h2>${esc(heading)}</h2>
      <p>Tell us a little about the property. No obligation.</p>
      <form data-lead-form novalidate>
        <label>Property address<input name="address" autocomplete="street-address" placeholder="123 Main St, Bakersfield, CA" required></label>
        <div class="two-col">
          <label>Your name<input name="name" autocomplete="name" required></label>
          <label>Phone number<input name="phone" type="tel" autocomplete="tel" required></label>
        </div>
        <label>Email <span class="muted">(optional)</span><input name="email" type="email" autocomplete="email"></label>
        <div class="two-col">
          <label>Situation<select name="situation"><option value="">Select one</option>${situationSelect}</select></label>
          <label>Timeline<select name="timeline"><option value="">Select one</option>${options(timelineOptions)}</select></label>
        </div>
        <label class="hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
        <button class="btn btn-gold btn-full" type="submit">See My Options →</button>
        <p class="form-note">By submitting, you agree ${esc(site.name)} may contact you by phone, text, or email about your property. Consent is not a condition of any sale. Msg &amp; data rates may apply; reply STOP to opt out. See our <a href="/privacy">Privacy Policy</a>.</p>
        <p class="form-status" role="status" aria-live="polite"></p>
      </form>
    </aside>`;
}

const faqList = (list) => `<div class="faq-list">${list
  .map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`)
  .join('')}</div>`;

const finalCta = `<section class="section final-cta">
  <div class="container final-cta-grid">
    <div><p class="eyebrow gold-dark">Ready When You Are</p><h2>Not sure what to do with the property?</h2><p>Start with the address. We’ll take it from there — or call <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a>.</p></div>
    <a class="btn btn-gold big" href="#lead-form">Get My Property Options →</a>
  </div>
</section>`;

const situationGrid = `<div class="situation-grid">${situations
  .map((s) => `<a class="situation" href="/situations/${s.slug}">${esc(s.name)}<span>Learn more →</span></a>`)
  .join('')}</div>`;

// ---------- Pages ----------

export function homePage() {
  return page(
    {
      title: `${site.name} | Property Problem? Call Harbison.`,
      description: `${site.name} helps ${site.region} property owners explore clear options — sell as-is, list, renovate, or develop. No repairs, no pressure.`,
      path: '/',
      ld: [businessLd, faqLd(faqs)],
    },
    `<section class="hero" style="--hero:url('${images.hero}')">
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">Kern County • Bakersfield • Tehachapi • And Beyond</p>
      <h1>Property<br>Problem?<br><em>Call Harbison.</em></h1>
      <p class="hero-lead">Sell your property as-is without repairs, showings, or the usual headache. We’ll help you understand your options and choose a clear next step.</p>
      <div class="hero-benefits">
        <div><strong>Fair Offers</strong><span>No pressure</span></div>
        <div><strong>Fast Process</strong><span>Move on your timeline</span></div>
        <div><strong>Any Condition</strong><span>Sell as-is</span></div>
        <div><strong>Local Experience</strong><span>Kern County focused</span></div>
      </div>
    </div>
    ${leadForm()}
  </div>
</section>

<section class="section cream" id="approach">
  <div class="container">
    <div class="section-head split">
      <div>
        <p class="eyebrow gold-dark">More Than a Cash Buyer</p>
        <h2>Real solutions for <em>real situations.</em></h2>
      </div>
      <div class="section-copy">
        <p>Harbison can evaluate more than one path for a property. A direct purchase may be right. A traditional listing, renovation strategy, or development opportunity may be better.</p>
        <p><strong>The goal is not to force one solution. It is to identify the right one.</strong></p>
      </div>
    </div>
    <div class="solution-grid">
      ${[
        ['home', '⌂', 'Sell Direct', 'Get a straightforward offer and close on a timeline that works for you.'],
        ['list', '◇', 'List on the Market', 'If retail exposure makes more sense, we can identify that route instead.'],
        ['renovate', '✦', 'Renovate &amp; Add Value', 'Repairs or improvements may materially change your property’s outcome.'],
        ['land', '↗', 'Development', 'Some homes and parcels may have a bigger opportunity than the structure itself.'],
      ]
        .map(([k, icon, h, p]) => `<article class="solution-card"><div class="solution-media" style="background-image:url('${images[k]}')"></div><div class="solution-body"><span class="icon" aria-hidden="true">${icon}</span><h3>${h}</h3><p>${p}</p></div></article>`)
        .join('\n      ')}
    </div>
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

<section class="section cream" id="how">
  <div class="container">
    <div class="section-head center">
      <p class="eyebrow gold-dark">A Simple Process</p>
      <h2>Three steps to <em>clarity.</em></h2>
      <p>No runaround. No complicated process. Just a clear path forward.</p>
    </div>
    <div class="steps">
      <article><span class="step-num">01</span><h3>Tell Us About the Property</h3><p>Send the address, fill out a quick form, or give us a call.</p></article>
      <article><span class="step-num">02</span><h3>We Review Your Options</h3><p>We evaluate the property, condition, timeline, and situation.</p></article>
      <article><span class="step-num">03</span><h3>Choose Your Next Step</h3><p>Consider a direct offer or another property solution that fits better.</p></article>
    </div>
  </div>
</section>

<section class="section white" id="compare">
  <div class="container">
    <div class="section-head center">
      <p class="eyebrow gold-dark">Side by Side</p>
      <h2>Direct sale vs. <em>traditional listing.</em></h2>
      <p>Both can be the right answer. Here’s how they typically compare.</p>
    </div>
    <div class="compare-wrap">
      <table class="compare">
        <thead><tr><th scope="col"></th><th scope="col">Sell Direct to Harbison</th><th scope="col">Traditional Listing</th></tr></thead>
        <tbody>
          <tr><th scope="row">Repairs</th><td>None — sold as-is</td><td>Often needed to attract buyers</td></tr>
          <tr><th scope="row">Showings</th><td>One walkthrough</td><td>Open houses and repeat showings</td></tr>
          <tr><th scope="row">Timeline</th><td>You pick the closing date</td><td>Depends on market and buyer financing</td></tr>
          <tr><th scope="row">Commissions</th><td>None paid to Harbison</td><td>Typically paid to agents</td></tr>
          <tr><th scope="row">Price</th><td>Reflects condition and speed</td><td>Can be higher for move-in-ready homes</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="local-band" id="about">
  <div class="local-photo" style="--local:url('${images.local}')"></div>
  <div class="local-copy">
    <div>
      <p class="eyebrow gold">Kern County. Local Knowledge.</p>
      <h2 class="light">Local roots.<br><em>Larger possibilities.</em></h2>
      <p class="light-soft">Harbison is built around practical real-estate judgment, local market knowledge, construction perspective, and a long-term view of property value.</p>
      <a class="btn btn-gold" href="#lead-form">Let’s Talk →</a>
    </div>
    <div class="local-points"><span>Local Experience</span><span>Real Solutions</span><span>Clear Next Steps</span></div>
  </div>
</section>

<section class="section cream" id="faq">
  <div class="container narrow">
    <div class="section-head center">
      <p class="eyebrow gold-dark">Questions</p>
      <h2>Straight <em>answers.</em></h2>
    </div>
    ${faqList(faqs)}
  </div>
</section>

${finalCta}`
  );
}

function detailPage({ item, path, crumbs, eyebrow, extra = '', formSituation = '' }) {
  const allFaqs = item.faqs ? [...item.faqs, ...faqs.slice(0, 3)] : faqs.slice(0, 4);
  return page(
    {
      title: `${item.title} | ${site.name}`,
      description: item.description,
      path,
      image: item.image,
      ld: [businessLd, breadcrumbLd(crumbs), faqLd(allFaqs)],
    },
    `<section class="hero hero-sub" style="--hero:url('${item.image}')">
  <div class="container hero-grid">
    <div class="hero-copy">
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, p], i) => (i < crumbs.length - 1 ? `<a href="${p}">${esc(n)}</a> / ` : `<span>${esc(n)}</span>`)).join('')}</nav>
      <p class="eyebrow gold">${esc(eyebrow)}</p>
      <h1 class="h1-sub">${item.headline}</h1>
      <p class="hero-lead">${esc(item.lead)}</p>
    </div>
    ${leadForm({ situation: formSituation })}
  </div>
</section>

<section class="section cream">
  <div class="container detail-grid">
    <article class="prose">
      ${item.body.map((p) => `<p>${esc(p)}</p>`).join('\n      ')}
      ${extra}
    </article>
    ${item.helps ? `<aside class="help-card"><h3>How Harbison helps</h3><ul>${item.helps.map((h) => `<li>${esc(h)}</li>`).join('')}</ul><a class="btn btn-gold btn-full" href="#lead-form">Get My Options →</a><a class="btn btn-ghost btn-full" href="tel:${site.phoneHref}">Call ${esc(site.phone)}</a></aside>` : ''}
  </div>
</section>

<section class="section navy">
  <div class="container">
    <div class="section-head center">
      <p class="eyebrow gold">A Simple Process</p>
      <h2 class="light">Three steps to <em>clarity.</em></h2>
    </div>
    <div class="steps light-steps">
      <article><span class="step-num">01</span><h3>Tell Us About the Property</h3><p>Send the address, fill out a quick form, or give us a call.</p></article>
      <article><span class="step-num">02</span><h3>We Review Your Options</h3><p>We evaluate the property, condition, timeline, and situation.</p></article>
      <article><span class="step-num">03</span><h3>Choose Your Next Step</h3><p>Consider a direct offer or another property solution that fits better.</p></article>
    </div>
  </div>
</section>

<section class="section cream">
  <div class="container narrow">
    <div class="section-head center"><p class="eyebrow gold-dark">Questions</p><h2>Common <em>questions.</em></h2></div>
    ${faqList(allFaqs)}
  </div>
</section>

${finalCta}`
  );
}

export function situationPage(s) {
  const others = situations.filter((o) => o.slug !== s.slug);
  const extra = `<h3>Other situations we help with</h3><ul class="chip-list">${others.map((o) => `<li><a href="/situations/${o.slug}">${esc(o.name)}</a></li>`).join('')}</ul>`;
  return detailPage({
    item: s,
    path: `/situations/${s.slug}`,
    crumbs: [['Home', '/'], ['Situations', '/situations'], [s.name, `/situations/${s.slug}`]],
    eyebrow: `${s.name} • ${site.region}`,
    extra,
    formSituation: s.name.split(' ')[0],
  });
}

export function areaPage(a) {
  const extra = `<h3>Areas we cover near ${esc(a.name)}</h3><ul class="chip-list">${a.places.map((p) => `<li><span>${esc(p)}</span></li>`).join('')}</ul>
      <h3>Situations we help with</h3><ul class="chip-list">${situations.map((o) => `<li><a href="/situations/${o.slug}">${esc(o.name)}</a></li>`).join('')}</ul>`;
  return detailPage({
    item: {
      ...a,
      helps: ['Sell as-is — no repairs or cleaning', 'No showings or open houses', 'Pick your closing date', 'Honest comparison of every option'],
    },
    path: `/areas/${a.slug}`,
    crumbs: [['Home', '/'], [a.name, `/areas/${a.slug}`]],
    eyebrow: `We Buy Houses • ${a.name}`,
    extra,
  });
}

export function situationsIndexPage() {
  return page(
    {
      title: `Property Situations We Help With | ${site.name}`,
      description: `Inherited homes, major repairs, vacant properties, problem tenants, fire damage and more — see how ${site.name} helps ${site.region} owners.`,
      path: '/situations',
      ld: [businessLd, breadcrumbLd([['Home', '/'], ['Situations', '/situations']])],
    },
    `<section class="section navy page-top">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow gold">Common Situations</p>
      <h1 class="page-title light">Every house has <em>a story.</em></h1>
      <p class="light-soft">Pick the situation closest to yours to see how we can help — or just <a class="link-gold" href="#lead-form">send us the address</a>.</p>
    </div>
    <div class="card-grid">
      ${situations
        .map((s) => `<a class="story-card" href="/situations/${s.slug}"><div class="story-media" style="background-image:url('${s.image}')"></div><div class="story-body"><h2>${esc(s.name)}</h2><p>${esc(s.lead)}</p><span>Learn more →</span></div></a>`)
        .join('\n      ')}
    </div>
  </div>
</section>
<section class="section cream">
  <div class="container form-band">
    <div><p class="eyebrow gold-dark">Don’t see yours?</p><h2>Every property is <em>different.</em></h2><p>Tell us what’s going on. If we can’t help, we’ll tell you quickly and point you in the right direction.</p></div>
    ${leadForm({ heading: 'Tell Us About the Property' })}
  </div>
</section>`
  );
}

function simplePage({ title, description, path, heading, body, noindex = false }) {
  return page(
    { title: `${title} | ${site.name}`, description, path, noindex, hasForm: false },
    `<section class="section cream page-top">
  <div class="container narrow prose legal">
    <h1 class="page-title">${heading}</h1>
    ${body}
  </div>
</section>`
  );
}

export function thankYouPage() {
  return simplePage({
    title: 'Thank You',
    description: 'Thanks for reaching out to Harbison Buys Homes.',
    path: '/thank-you',
    noindex: true,
    heading: 'Thank you — <em>we’ve got it.</em>',
    body: `<p class="lead">We received your property information and will reach out shortly, usually within one business day.</p>
    <h3>What happens next</h3>
    <ol>
      <li>We review the address, condition, and timeline you shared.</li>
      <li>We call or text to ask a few quick questions and schedule a walkthrough if needed.</li>
      <li>We lay out your options — including a direct offer if it fits.</li>
    </ol>
    <p>Need us sooner? Call <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a>.</p>
    <p><a class="btn btn-gold" href="/">Back to home</a></p>
    <script>window.gtag&&gtag('event','generate_lead');</script>`,
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

export function privacyPage() {
  return simplePage({
    title: 'Privacy Policy',
    description: `How ${site.name} collects and uses information.`,
    path: '/privacy',
    heading: 'Privacy Policy',
    body: `<p class="muted-note">Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p>${esc(site.name)} (“we,” “us”) respects your privacy. This policy explains what information we collect through this website and how we use it.</p>
    <h3>Information we collect</h3>
    <p>When you submit a form, we collect the information you provide, such as your name, phone number, email address, property address, and details about your situation. We also collect standard technical data (such as browser type, pages visited, and referring site) through cookies and analytics tools.</p>
    <h3>How we use it</h3>
    <ul>
      <li>To respond to your inquiry and evaluate your property</li>
      <li>To contact you by phone, text message, or email about your property</li>
      <li>To improve our website and services</li>
      <li>To comply with legal obligations</li>
    </ul>
    <h3>Text messages</h3>
    <p>If you provide your phone number, you agree we may contact you by call or text about your inquiry. Message and data rates may apply. Reply STOP to opt out at any time. We do not sell or share mobile numbers or SMS consent with third parties for their marketing purposes.</p>
    <h3>Sharing</h3>
    <p>We do not sell your personal information. We may share it with service providers who help us operate our business (for example, hosting, email, CRM, and title/escrow companies when you choose to move forward), or when required by law.</p>
    <h3>Your California privacy rights</h3>
    <p>California residents may request access to, correction of, or deletion of their personal information. To make a request, email <a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a>.</p>
    <h3>Contact</h3>
    <p>Questions? Contact us at <a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a> or <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a>.</p>`,
  });
}

export function termsPage() {
  return simplePage({
    title: 'Terms of Use',
    description: `Terms of use for the ${site.name} website.`,
    path: '/terms',
    heading: 'Terms of Use',
    body: `<p class="muted-note">Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p>By using this website you agree to these terms.</p>
    <h3>No offer or advice</h3>
    <p>Content on this site is for general information only. Nothing here is an offer to purchase any property, and no binding agreement exists until a written purchase agreement is signed by all parties. We do not provide legal, tax, or financial advice — please consult a qualified professional about your situation.</p>
    <h3>Submissions</h3>
    <p>You agree that information you submit is accurate and that you have the right to share it. Submitting a form does not obligate you to sell, and does not obligate us to make an offer.</p>
    <h3>Intellectual property</h3>
    <p>The ${esc(site.name)} name, logo, and site content are our property and may not be used without permission.</p>
    <h3>Limitation of liability</h3>
    <p>This site is provided “as is.” To the fullest extent permitted by law, we are not liable for damages arising from your use of the site.</p>
    <h3>Contact</h3>
    <p><a class="link" href="mailto:${esc(site.email)}">${esc(site.email)}</a> • <a class="link" href="tel:${site.phoneHref}">${esc(site.phone)}</a></p>`,
  });
}

