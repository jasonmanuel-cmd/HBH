// Builds the static site into ./dist. Run: npm run build
import { rmSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import site from './site.config.mjs';
import { situations } from './src/content.mjs';
import {
  areas, guides, faqs,
  homePage, situationPage, areaPage, situationsIndexPage, aboutPage, guidesIndexPage, guidePage,
  thankYouPage, notFoundPage, privacyPage, termsPage, familyPage, partnerGuidePage,
} from './src/templates.mjs';
import { family } from './src/family.mjs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('static', out, { recursive: true });

const today = new Date().toISOString().slice(0, 10);

// [output file, html, url path for sitemap (null = exclude), lastmod]
const pages = [
  ['index.html', homePage(), '/'],
  ['about.html', aboutPage(), '/about'],
  ['sell-parents-house.html', familyPage(), '/sell-parents-house'],
  ['family-property-guide.html', partnerGuidePage(), null],
  ['situations/index.html', situationsIndexPage(), '/situations'],
  ...situations.map((s) => [`situations/${s.slug}.html`, situationPage(s), `/situations/${s.slug}`]),
  ...areas.map((a) => [`areas/${a.slug}.html`, areaPage(a), `/areas/${a.slug}`]),
  ['guides/index.html', guidesIndexPage(), '/guides'],
  ...guides.map((g) => [`guides/${g.slug}.html`, guidePage(g), `/guides/${g.slug}`, g.updated]),
  ['privacy.html', privacyPage(), '/privacy'],
  ['terms.html', termsPage(), '/terms'],
  ['thank-you.html', thankYouPage(), null],
  ['404.html', notFoundPage(), null],
];

for (const [file, html] of pages) {
  const path = join(out, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
}

writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .filter(([, , p]) => p)
  .map(([, , p, mod]) => `  <url><loc>${site.url}${p}</loc><lastmod>${mod || today}</lastmod></url>`)
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

${aiBots.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /
Disallow: /api/

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
${link('/about', `About ${site.agent}`, 'credentials, approach, profiles')}
${link('/situations', 'Situations we help with')}
${link(family.path, 'Selling a parent’s house', family.answer)}

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

console.log(`Built ${pages.length} pages into ./${out}`);
