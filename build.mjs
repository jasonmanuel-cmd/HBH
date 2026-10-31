// Builds the static site into ./dist. Run: npm run build
import { rmSync, mkdirSync, writeFileSync, cpSync, readFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import site from './site.config.mjs';
import { areas, guides, faqs, situations, contentDate } from './src/templates.mjs';
import { buildPages } from './src/pages.mjs';
import { decoratePage, esPath, loadDictionary, translatePage } from './src/i18n/translate.mjs';
import { family } from './src/family.mjs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('static', out, { recursive: true });
mkdirSync(join(out, 'hq/stats'), { recursive: true });
for (const statsSite of ['harbison-standard', 'call-harbison']) cpSync('static/hq/index.html', join(out, `hq/stats/${statsSite}.html`));
for (const hqRoute of ['leads', 'partners']) cpSync('static/hq/index.html', join(out, `hq/${hqRoute}.html`));

// [output file, html, url path for sitemap (null = exclude), lastmod]
// Every page is built in English and again in Spanish (under /es), then each gets its language switch and hreflang links.
const { dict, problems: dictionaryProblems } = loadDictionary();
for (const problem of dictionaryProblems) console.warn(`[i18n] ${problem}`);
const translation = { dict, siteUrl: site.url, report: { missing: new Set() } };
const englishPages = buildPages();
const pages = englishPages.flatMap(([file, html, path, mod]) => {
  if (file === '404.html') return [[file, html, path, mod]];
  const english = decoratePage(html, { lang: 'en', filePath: file, siteUrl: site.url });
  const spanish = decoratePage(translatePage(html, { ...translation, filePath: file }), { lang: 'es', filePath: file, siteUrl: site.url });
  return [
    [file, english, path, mod],
    [`es/${file}`, spanish, path ? esPath(path) : null, mod],
  ];
});
if (translation.report.missing.size) console.warn(`[i18n] ${translation.report.missing.size} English texts have no Spanish entry and stay in English on /es pages. Run: node scripts/i18n.mjs extract --out todo.json`);

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
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages
  .filter(([file, , p]) => p && !file.startsWith('es/'))
  .flatMap(([, , p, mod]) => {
    const en = `${site.url}${p === '/' ? '/' : p}`;
    const es = `${site.url}${esPath(p)}`;
    const alternates = `<xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="es" href="${es}"/><xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`;
    return [en, es].map((loc) => `  <url><loc>${loc}</loc><lastmod>${mod || contentDate(p)}</lastmod>${alternates}</url>`);
  })
  .join('\n')}
</urlset>
`
);

// Preserve existing crawler access preferences. Access does not guarantee indexing or AI citations.
const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot', 'DuckAssistBot', 'meta-externalagent'];
writeFileSync(
  join(out, 'robots.txt'),
  `User-agent: *
Allow: /
Disallow: /api/
Disallow: /thank-you
Disallow: /family-property-guide
Disallow: /es/thank-you
Disallow: /es/family-property-guide
Disallow: /hq

${aiBots.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /
Disallow: /api/
Disallow: /thank-you
Disallow: /family-property-guide
Disallow: /es/thank-you
Disallow: /es/family-property-guide
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
- Languages: English and Spanish. The whole site is also available in Spanish under /es
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
      { src: '/assets/icon-192.png?v=2', sizes: '192x192', type: 'image/png' },
      { src: '/assets/icon-512.png?v=2', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2)
);

console.log(`Built ${pages.length} pages into ./${out}`);
