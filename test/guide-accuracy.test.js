import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.config.mjs';
import { buildPages } from '../src/pages.mjs';
import { loadDictionary, translatePage } from '../src/i18n/translate.mjs';

const pages = buildPages();
const { dict } = loadDictionary();
const variants = (slug) => {
  const file = `guides/${slug}.html`;
  const html = pages.find(([f]) => f === file)[1];
  return [html, translatePage(html, { dict, siteUrl: site.url, filePath: file, report: { missing: new Set() } })];
};
const nodes = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap(([, json]) => JSON.parse(json)['@graph'] || []);

test('revised guides preserve publication dates and agree on visible, Article, WebPage and sitemap dates', () => {
  const revised = {
    'sell-house-as-is-california': ['2026-09-22', '2026-11-05'],
    'cash-offer-vs-listing': ['2026-10-23', '2026-11-06'],
    'sell-inherited-house-california': ['2026-09-22', '2026-11-05'],
    'what-affects-a-cash-offer': ['2026-09-24', '2026-11-06'],
  };
  for (const [slug, [published, modified]] of Object.entries(revised)) {
    const row = pages.find(([file]) => file === `guides/${slug}.html`);
    assert.equal(row[3], modified, 'build uses this value for sitemap lastmod');
    for (const html of variants(slug)) {
      const article = nodes(html).find((n) => n['@type'] === 'Article');
      const webPage = nodes(html).find((n) => n['@type'] === 'WebPage');
      assert.equal(article.datePublished, published);
      assert.equal(article.dateModified, row[3]);
      assert.equal(webPage.dateModified, row[3]);
      assert.ok(html.includes(`<time datetime="${published}">`));
      assert.ok(html.includes(`<time datetime="${row[3]}">`));
      assert.doesNotMatch(html, /Last reviewed/);
    }
  }
});

test('both languages qualify cash-sale inspections and provide the same official inheritance sources', () => {
  for (const slug of ['sell-house-as-is-california', 'cash-offer-vs-listing']) {
    const [en, es] = variants(slug);
    assert.match(en, /no lender-required appraisal or inspection/);
    assert.match(en, /buyer may still inspect/i);
    assert.match(es, /comprador aún puede inspeccionar/);
    assert.doesNotMatch(en, /no appraisal, lender inspection, or showings/);
  }
  for (const html of variants('sell-inherited-house-california')) {
    for (const url of [
      'https://selfhelp.courts.ca.gov/probate/simple-transfer',
      'https://boe.ca.gov/prop19/',
      'https://www.irs.gov/faqs/interest-dividends-other-types-of-income/gifts-inheritances/gifts-inheritances',
    ]) assert.ok(html.includes(`href="${url}"`));
    assert.ok(html.includes('class="disclaimer"'));
  }
});

test('verified agent profile is visible and belongs to the Person entity', () => {
  const html = pages.find(([file]) => file === 'about.html')[1];
  const url = 'https://www.zillow.com/profile/nate85%20realtor';
  assert.ok(html.includes(`href="${url}"`));
  assert.ok(nodes(html).find((n) => n['@type'] === 'Person').sameAs.includes(url));
});
