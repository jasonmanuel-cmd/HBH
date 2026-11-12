import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import site from '../site.config.mjs';
import { buildPages } from '../src/pages.mjs';
import { areas } from '../src/templates.mjs';
import { loadDictionary, translatePage } from '../src/i18n/translate.mjs';
const pages = buildPages();
const { dict } = loadDictionary();
const graph = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
for (const slug of ['bakersfield', 'tehachapi', 'stallion-springs', 'california-city', 'kern-county']) {
  for (const lang of ['en', 'es']) {
    test(`${lang}/areas/${slug}: current brand, translated quick answer and consistent SEO descriptions`, () => {
      const file = `areas/${slug}.html`;
      const area = areas.find(a => a.slug === slug);
      const en = pages.find(([f]) => f === file)[1];
      const report = { missing: new Set() };
      const html = lang === 'es' ? translatePage(en, { dict, siteUrl: site.url, filePath: file, report }) : en;
      assert.deepEqual([...report.missing], [], 'no untranslated fallback');
      assert.doesNotMatch(html, /Harbison Buys Homes/i);
      const answer = lang === 'es' ? dict.get(area.answer) : area.answer;
      const description = lang === 'es' ? dict.get(area.description) : area.description;
      assert.ok(answer && description, 'translated source fields exist');
      if (lang === 'es') assert.notEqual(answer, area.answer);
      assert.match(answer, /Call Harbison/);
      assert.ok(html.includes(`<p>${answer}</p>`), 'visible quick answer matches the localized source');
      const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
        assert.ok(html.includes(`<meta ${attribute} content="${escape(description)}">`), attribute);
      }
      for (const type of ['WebPage', 'Service']) {
        assert.equal(graph(html).find(node => node['@type'] === type).description, description, type);
      }
    });
  }
}
for (const file of ['index.html', 'about.html', 'contact.html']) {
  test(`${file}: English and Spanish shared branding and licensed identities`, () => {
    const en = pages.find(([f]) => f === file)[1];
    for (const html of [en, translatePage(en, { dict, siteUrl: site.url, filePath: file, report: { missing: new Set() } })]) {
      assert.doesNotMatch(html, /Harbison Buys Homes/i, `${file}: entire body, metadata and JSON-LD use the current brand`);
      const nodes = graph(html);
      for (const type of ['RealEstateAgent', 'WebSite']) assert.equal(nodes.find(n => n['@type'] === type).name, 'Call Harbison');
      const person = nodes.find(n => n['@type'] === 'Person');
      assert.equal(person.name, 'Nathanael Harbison');
      assert.ok(person.sameAs.includes('https://www.callharbison.com/about'));
      assert.doesNotMatch(html, /harbisonstandard\.com\/about/);
      const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
      const header = html.match(/<header[\s\S]*?<\/header>/)[0];
      for (const fragment of [header, footer]) {
        assert.match(fragment, /call-harbison-reverse\.svg/);
        assert.doesNotMatch(fragment, /Harbison Buys Homes|logo-header-reverse-v2/);
      }
      assert.match(footer, /02227690/);
      assert.match(footer, /02059393/);
      if (file === 'contact.html') {
        const selectors = nodes.find(n => n.speakable).speakable.cssSelector;
        assert.deepEqual(selectors, ['h1']);
        assert.equal((html.match(/<h1\b/g) || []).length, 1);
        assert.doesNotMatch(html, /class="answer-box/);
      }
    }
  });
}
test('new wordmarks preserve original mark pixels and contain visible Call Harbison text', () => {
  const original = readFileSync(new URL('../static/assets/h-house-mark-v3.png', import.meta.url)).toString('base64');
  for (const file of ['call-harbison.svg', 'call-harbison-reverse.svg']) {
    const svg = readFileSync(new URL(`../static/assets/${file}`, import.meta.url), 'utf8');
    assert.ok(svg.includes(`data:image/png;base64,${original}`));
    assert.match(svg, /<text[^>]*>CALL<\/text>/);
    assert.match(svg, /<text[^>]*>HARBISON<\/text>/);
    assert.doesNotMatch(svg, /BUYS HOMES/);
    assert.match(svg, /viewBox="0 0 1172 231"/);
  }
});
