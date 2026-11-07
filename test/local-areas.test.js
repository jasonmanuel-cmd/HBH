import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.config.mjs';
import { buildPages } from '../src/pages.mjs';
import { areas } from '../src/templates.mjs';

// Area pages must not read as copies of each other: each one carries its own questions and a self canonical.
const pages = buildPages();
const html = (slug) => pages.find(([f]) => f === `areas/${slug}.html`)[1];
const faqQuestions = (page) => [...page.matchAll(/<details class="faq"[^>]*><summary><h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
const words = (page) => page.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

test('every area has questions of its own', () => {
  for (const a of areas) assert.ok(a.faqs && a.faqs.length >= 2, `${a.slug} has area-specific FAQs`);
});

test('no two area pages share the same FAQ list', () => {
  const seen = new Map();
  for (const a of areas) {
    const key = faqQuestions(html(a.slug)).join('|');
    assert.ok(!seen.has(key), `${a.slug} repeats the FAQ list of ${seen.get(key)}`);
    seen.set(key, a.slug);
  }
});

test('area pages are self-canonical, current brand, and name the broker', () => {
  for (const a of areas) {
    const page = html(a.slug);
    assert.ok(page.includes(`<link rel="canonical" href="${site.url}/areas/${a.slug}">`), a.slug);
    assert.doesNotMatch(page, /harbisonbuyshomes|Harbison Buys Homes/i);
    assert.match(page.match(/<footer[\s\S]*?<\/footer>/)[0], /Mora Partners[\s\S]*02227690/);
  }
});

test('the Bakersfield page is no longer thin', () => {
  assert.ok(words(html('bakersfield')) > 1300, `Bakersfield page has ${words(html('bakersfield'))} words`);
});
