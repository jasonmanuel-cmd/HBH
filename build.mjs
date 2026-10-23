// Builds the static site into ./dist. Run: npm run build
import { rmSync, mkdirSync, writeFileSync, cpSync, readFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import site from './site.config.mjs';
import {
  areas, guides, faqs, situations, contentDate,
  homePage, howItWorksPage, contactPage, accessibilityPage, situationPage, areaPage, situationsIndexPage, aboutPage, guidesIndexPage, guidePage,
  thankYouPage, notFoundPage, privacyPage, termsPage, familyPage, partnerGuidePage,
} from './src/templates.mjs';
import { family } from './src/family.mjs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('static', out, { recursive: true });
mkdirSync(join(out, 'hq/stats'), { recursive: true });
for (const statsSite of ['harbison-standard', 'call-harbison']) cpSync('static/hq/index.html', join(out, `hq/stats/${statsSite}.html`));
for (const hqRoute of ['leads', 'partners']) cpSync('static/hq/index.html', join(out, `hq/${hqRoute}.html`));

// [output file, html, url path for sitemap (null = exclude), lastmod]
const pages = [
  ['index.html', homePage(), '/'],
  ['about.html', aboutPage(), '/about'],
  ['how-it-works.html', howItWorksPage(), '/how-it-works'],
  ['contact.html', contactPage(), '/contact'],
  [`${family.path.slice(1)}.html`, familyPage(), family.path],
  ['family-property-guide.html', partnerGuidePage(), null],
  ['situations/index.html', situationsIndexPage(), '/situations'],
  ...situations.map((s) => [`situations/${s.slug}.html`, situationPage(s), `/situations/${s.slug}`, s.updated]),
  ...areas.map((a) => [`areas/${a.slug}.html`, areaPage(a), `/areas/${a.slug}`, a.updated]),
  ['guides/index.html', guidesIndexPage(), '/guides'],
  ...guides.map((g) => [`guides/${g.slug}.html`, guidePage(g), `/guides/${g.slug}`, g.updated]),
  ['privacy.html', privacyPage(), '/privacy'],
  ['terms.html', termsPage(), '/terms'],
  ['accessibility.html', accessibilityPage(), '/accessibility'],
  ['thank-you.html', thankYouPage(), null],
  ['404.html', notFoundPage(), null],
];

// Minify and fingerprint CSS + client scripts so repeat page navigations reuse immutable browser cache.
const css = readFileSync('static/styles.css', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();
const hashOf = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const cssHash = hashOf(css);
const jsHash = hashOf(readFileSync('static/script.js'));
const analyticsHash = hashOf(readFileSync('static/analytics.js'));

writeFileSync(join(out, `styles.${cssHash}.css`), css);
rmSync(join(out, 'styles.css'));
renameSync(join(out, 'script.js'), join(out, `script.${jsHash}.js`));
renameSync(join(out, 'analytics.js'), join(out, `analytics.${analyticsHash}.js`));

for (const [file, html] of pages) {
  const path = join(out, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    html
      .replace('href="/styles.css"', `href="/styles.${cssHash}.css"`)
      .replace('src="/script.js"', `src="/script.${jsHash}.js"`)
      .replace('src="/analytics.js"', `src="/analytics.${analyticsHash}.js"`)
  );
}

writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .filter(([, , p]) => p)
  .map(([, , p, mod]) => `  <url><loc>${site.url}${p}</loc><lastmod>${mod || contentDate(p)}</lastmod></url>`)
  .join('\n')}
</urlset>
`
);

// Search engines plus AI search/answer crawlers are explicitly welcome — being cited by AI assistants is the goal.
const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot', 'DuckAssistBot', 'meta-externalagent'];
writeFileSync(
  join(out, 'robots.txt'),
  `User-agent: *
Allow: /
Disallow: /api/
Disallow: /thank-you
Disallow: /family-property-guide
Disallow: /hq

${aiBots.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /
Disallow: /api/
Disallow: /thank-you
Disallow: /family-property-guide
Disallow: /hq

Sitemap: ${site.url}/sitemap.xml
`
);

// llms.txt — a plain-language map of the site for AI assistants (https://llmstxt.org).
const link = (path, name, note) => `- [${name}](${site.url}${path})${note ? `: ${note}` : ''}`;
writeFileSync(
  join(out, 'llms.txt'),
  `# ${site.name}

> ${site.name} buys houses and land as-is in Bakersfield, Tehachapi, California City, and throughout Kern County, California. It is led by ${site.agent}, a California-licensed REALTOR® (DRE #${site.dre}) with ${site.brokerage}, and compares a direct cash offer with listing, renovation, or development so owners can choose the best option. No repairs, showings, or obligation.

Key facts:
- Phone (call or text): ${site.phone}
- Email: ${site.email}
- Service area: ${areas.map((a) => a.name).join(', ')}
- Response time: typically within 24 hours
- Cost to request options: free, no obligation; no commission paid to Harbison on a direct sale
- Licensed agent: ${site.agent}, DRE #${site.dre} (${site.brokerageUrl})

## Main pages
${link('/', 'Home', 'overview, process, direct sale vs. listing comparison, FAQ')}
${link('/how-it-works', 'How it works', 'process, walkthrough, interactive net estimator, how direct offers are figured, seller promise')}
${link('/about', `About ${site.agent}`, 'credentials, approach, profiles')}
${link('/contact', 'Contact', `call or text ${site.phone}`)}
${link('/situations', 'Situations we help with')}
${link(family.path, 'Selling a loved one’s house', family.answer)}

## Situations
${situations.map((s) => link(`/situations/${s.slug}`, s.title, s.answer)).join('\n')}

## Service areas
${areas.map((a) => link(`/areas/${a.slug}`, a.title, a.answer)).join('\n')}

## Seller guides
${guides.map((g) => link(`/guides/${g.slug}`, g.title, g.answer)).join('\n')}

## FAQ
${faqs.map(([q, a]) => `- **${q}** ${a}`).join('\n')}
`
);

writeFileSync(
  join(out, 'site.webmanifest'),
  JSON.stringify({
    name: site.name,
    short_name: 'Harbison',
    start_url: '/',
    display: 'browser',
    background_color: '#f6f2e9',
    theme_color: '#031f2b',
    icons: [
      { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2)
);

console.log(`Built ${pages.length} pages into ./${out}`);
