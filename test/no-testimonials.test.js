import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homePage, aboutPage } from '../src/templates.mjs';
import * as content from '../src/content-extra.mjs';

// The three published quotes could not be traced to real clients, so the site shows none.
const removed = ['testimonials-h', 'quote-grid', 'Client Words', 'Our inherited home felt overwhelming'];

for (const [name, render] of [['home', homePage], ['about', aboutPage]]) {
  test(`${name} page has no testimonials section`, () => {
    const html = render();
    for (const text of removed) assert.ok(!html.includes(text), `${name} page still contains "${text}"`);
  });
}

test('testimonial content and Spanish translations are gone', () => {
  assert.equal(content.testimonials, undefined);
  const es = readFileSync('src/i18n/es/part-02.json', 'utf8');
  assert.ok(!es.includes('Palabras de nuestros clientes'));
});
