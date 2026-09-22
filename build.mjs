// Builds the static site into ./dist. Run: npm run build
import { rmSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import site from './site.config.mjs';
import { situations, areas } from './src/content.mjs';
import {
  homePage, situationPage, areaPage, situationsIndexPage,
  thankYouPage, notFoundPage, privacyPage, termsPage,
} from './src/templates.mjs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('static', out, { recursive: true });

// [output file, html, url path for sitemap (null = exclude)]
const pages = [
  ['index.html', homePage(), '/'],
  ['situations/index.html', situationsIndexPage(), '/situations'],
  ...situations.map((s) => [`situations/${s.slug}.html`, situationPage(s), `/situations/${s.slug}`]),
  ...areas.map((a) => [`areas/${a.slug}.html`, areaPage(a), `/areas/${a.slug}`]),
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

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .filter(([, , p]) => p)
  .map(([, , p]) => `  <url><loc>${site.url}${p}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n')}
</urlset>
`
);
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /thank-you\n\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${pages.length} pages into ./${out}`);
