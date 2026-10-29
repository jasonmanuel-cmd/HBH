import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.config.mjs';
import { homePage } from '../src/templates.mjs';

// gtag.js (~177 KB) was the largest main-thread cost on phones. It must not be fetched during page load.
const html = homePage();
const headStart = html.slice(html.indexOf('<head>'), html.indexOf('<head>') + 1600);

test('gtag.js is not requested by a script tag in the page source', () => {
  assert.doesNotMatch(html, /<script[^>]+src="https:\/\/www\.googletagmanager\.com\/gtag\/js/);
});

test('the gtag() stub and config still run first, right after <head>', () => {
  assert.match(headStart, /window\.dataLayer=window\.dataLayer\|\|\[\];function gtag\(\)\{dataLayer\.push\(arguments\)\}/);
  assert.match(headStart, new RegExp(`gtag\\('config','${site.gaId}'\\)`));
});

test('gtag.js is loaded on first interaction or shortly after the load event', () => {
  assert.match(headStart, new RegExp(`googletagmanager\\.com/gtag/js\\?id=${site.gaId}`));
  for (const evt of ['pointerdown', 'keydown', 'touchstart', 'scroll']) assert.match(headStart, new RegExp(`'${evt}'`));
  assert.match(headStart, /addEventListener\('load'/);
});
