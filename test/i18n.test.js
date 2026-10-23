import { test } from 'node:test';
import assert from 'node:assert/strict';
import site from '../site.config.mjs';
import { buildPages } from '../src/pages.mjs';
import { decoratePage, esPath, isRoute, loadDictionary, pathOfFile, shapeOf, translatePage } from '../src/i18n/translate.mjs';
import { ACK_SMS, wantsSpanish } from '../api/leads.js';

const { dict, problems } = loadDictionary();
const pages = buildPages().filter(([file]) => file !== '404.html');
const render = (file) => {
  const html = pages.find(([f]) => f === file)[1];
  const report = { missing: new Set() };
  return { html, report, es: translatePage(html, { dict, siteUrl: site.url, filePath: file, report }) };
};

test('internal links and paths map to their /es twins', () => {
  assert.equal(esPath('/'), '/es');
  assert.equal(esPath('/#lead-form'), '/es#lead-form');
  assert.equal(esPath('/how-it-works#promise'), '/es/how-it-works#promise');
  assert.equal(esPath('/guides/cash-offer-vs-listing'), '/es/guides/cash-offer-vs-listing');
  assert.equal(esPath('/assets/icon-192.png'), '/assets/icon-192.png');
  assert.equal(esPath('/api/leads'), '/api/leads');
  assert.equal(isRoute('/es/about'), false);
  assert.equal(pathOfFile('index.html'), '/');
  assert.equal(pathOfFile('situations/index.html'), '/situations');
  assert.equal(pathOfFile('guides/x.html'), '/guides/x');
});

test('every English text on every page has a well-formed Spanish entry', () => {
  assert.deepEqual(problems, []);
  const missing = new Set();
  for (const [file, html] of pages) translatePage(html, { dict, siteUrl: site.url, filePath: file, report: { missing } });
  assert.deepEqual([...missing].slice(0, 10), [], `${missing.size} English texts are not translated yet. Run: node scripts/i18n.mjs extract --out todo.json`);
});

test('dictionary entries keep the same links and placeholders as their English text', () => {
  for (const [en, es] of dict) assert.equal(shapeOf(es), shapeOf(en), en.slice(0, 60));
});

test('Spanish pages keep form values in English so the CRM and HQ still understand them', () => {
  const { html, es } = render('index.html');
  const values = (page) => [...page.matchAll(/<input type="radio" name="situation" value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(values(es), values(html));
  assert.ok(values(es).length > 0);
  // Visible labels are Spanish.
  assert.notEqual(es.match(/class="choice"><input type="radio" name="situation" value="[^"]*"><span>([^<]*)/)[1], html.match(/class="choice"><input type="radio" name="situation" value="[^"]*"><span>([^<]*)/)[1]);
});

test('select options send the English value even when the label is Spanish', () => {
  const { html, es } = render('sell-loved-ones-house.html');
  // What a browser submits for each option: its value attribute, or its text when there is none.
  const submitted = (page) => [...page.matchAll(/<option(?:\s+value="([^"]*)")?>([^<]*)<\/option>/g)].map((m) => m[1] ?? m[2]);
  const labels = (page) => [...page.matchAll(/<option(?:\s+value="[^"]*")?>([^<]*)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(submitted(es), submitted(html));
  assert.ok(submitted(es).length > 3);
  assert.notDeepEqual(labels(es), labels(html), 'the visible option labels should be Spanish');
});

test('Spanish pages declare Spanish and point at the Spanish canonical URL', () => {
  const { es } = render('about.html');
  const full = decoratePage(es, { lang: 'es', filePath: 'about.html', siteUrl: site.url });
  assert.match(full, /<html lang="es-US">/);
  assert.match(full, new RegExp(`<link rel="canonical" href="${site.url}/es/about">`));
  assert.match(full, /hreflang="en" href="[^"]*\/about"/);
  assert.match(full, /hreflang="es" href="[^"]*\/es\/about"/);
  assert.match(full, /class="lang-switch" href="\/about"/);
  assert.match(full, /og:locale" content="es_US"/);
});

test('English pages get the Español switch, hreflang links and the remembered-language redirect', () => {
  const full = decoratePage(pages[0][1], { lang: 'en', filePath: 'index.html', siteUrl: site.url });
  assert.match(full, /class="lang-switch" href="\/es"/);
  assert.match(full, /hreflang="es"/);
  assert.match(full, /localStorage\.getItem\('hbh-lang'\)==='es'/);
});

test('internal links on Spanish pages stay on the Spanish site', () => {
  const { es } = render('index.html');
  const internal = [...es.matchAll(/\shref="(\/[^"]*)"/g)].map((m) => m[1]).filter((h) => isRoute(h.replace(/^\/es/, '') || '/') || h.startsWith('/es'));
  assert.ok(internal.length > 10);
  for (const href of internal) assert.ok(href === '/es' || href.startsWith('/es/') || href.startsWith('/es#'), `English link on a Spanish page: ${href}`);
});

test('leads from a Spanish page are recognised, and get the Spanish text-message acknowledgement', () => {
  assert.equal(wantsSpanish({ source: '/es/about' }), true);
  assert.equal(wantsSpanish({ source: '/es' }), true);
  assert.equal(wantsSpanish({ source: '/estate' }), false);
  assert.equal(wantsSpanish({ source: '/about' }), false);
  assert.match(ACK_SMS.es, /STOP/);
  assert.match(ACK_SMS.es, /Gracias/);
});
