import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import site from '../site.config.mjs';
import { buildPages } from '../src/pages.mjs';
import { loadDictionary, translatePage, decoratePage } from '../src/i18n/translate.mjs';

const pages = buildPages();
const page = (file) => pages.find(([f]) => f === file)[1];
const graphs = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('licensed brokerage is a distinct verified entity, not the Harbison Standard profile', () => {
  assert.equal(site.brokerage, 'The Mora Partners Inc.');
  assert.equal(site.brokerageDre, '02227690');
  assert.equal(new URL(site.brokerageUrl).searchParams.get('License_id'), site.brokerageDre);
  const about = page('about.html');
  const nodes = graphs(about).flatMap((g) => g['@graph'] || [g]);
  const broker = nodes.find((n) => n['@id'] === `${site.url}/#responsible-broker`);
  const person = nodes.find((n) => n['@type'] === 'Person');
  assert.equal(broker.name, site.brokerage);
  assert.match(broker.identifier, /02227690/);
  assert.equal(broker.address, undefined, 'do not invent a business office address');
  assert.ok(person.worksFor.some((n) => n['@id'] === broker['@id']));
  assert.match(about, /License_id=02059393/);
  assert.match(about, /The Mora Partners Inc\. · DRE #02227690/);
  assert.doesNotMatch(about, /Harbison Standard, a Kern County real estate brokerage/);
  assert.ok(site.agentProfiles.includes('https://www.harbisonstandard.com/about'));
});

test('call and text buttons invoke the appropriate separate phone actions in both languages', () => {
  const { dict } = loadDictionary();
  for (const file of ['index.html', 'contact.html', 'thank-you.html']) {
    const english = page(file);
    const spanish = translatePage(english, { dict, siteUrl: site.url, filePath: file, report: { missing: new Set() } });
    for (const html of [english, spanish]) {
      assert.ok(html.includes(`href="tel:${site.phoneHref}"`));
      assert.ok(html.includes(`href="sms:${site.phoneHref}"`));
      assert.doesNotMatch(html, /href="tel:[^"]*"[^>]*>Call or Text/);
    }
  }
});

test('thank-you does not promise an automated confirmation text; form requirements are explicit', () => {
  assert.doesNotMatch(page('thank-you.html'), /reply to our confirmation text/i);
  assert.match(page('index.html'), /property address, your name, phone number, and permission to respond/);
});

test('public pages retain canonical URLs and valid JSON-LD; utility pages remain noindex', () => {
  for (const [file, html, path] of pages) {
    graphs(html); // invalid JSON throws
    if (path) {
      assert.ok(html.includes(`<link rel="canonical" href="${site.url}${path}">`), file);
      assert.doesNotMatch(html, /content="noindex/);
    }
  }
  for (const file of ['thank-you.html', 'family-property-guide.html']) {
    assert.match(page(file), /content="noindex,follow"/);
  }
  const es = decoratePage(page('about.html'), { lang: 'en', filePath: 'about.html', siteUrl: site.url });
  assert.ok(es.includes(`hreflang="es" href="${site.url}/es/about"`));
});

test('explicit bot rules preserve the same Spanish utility-path exclusions as the wildcard', () => {
  const source = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.equal(source.split('Disallow: /es/thank-you').length - 1, 2);
  assert.equal(source.split('Disallow: /es/family-property-guide').length - 1, 2);
});
