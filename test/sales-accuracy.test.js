import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import site from '../site.config.mjs';
import { buildPages } from '../src/pages.mjs';
import { contentDate } from '../src/templates.mjs';
import { loadDictionary, translatePage } from '../src/i18n/translate.mjs';

const pages = buildPages();
const { dict } = loadDictionary();
const page = (file) => pages.find(([f]) => f === file)[1];
const es = (file) => translatePage(page(file), { dict, siteUrl: site.url, filePath: file, report: { missing: new Set() } });

test('public copy does not guarantee no showings or a seller-chosen closing date', () => {
  for (const [file, html] of pages) {
    assert.doesNotMatch(html, /no (?:repairs, |repairs or |staging, )?showings|one walkthrough, no showings|(?:you (?:pick|choose)|pick your|choose your) (?:the )?closing date|closing date you choose|Close on your timeline/i, file);
    assert.doesNotMatch(es(file), /sin visitas|usted elige la fecha de cierre|elija su fecha de cierre/i, file);
  }
  const build = readFileSync(new URL('../build.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(build, /No repairs, showings, or obligation/);
  assert.match(build, /Property access, inspections and closing timing depend on the written agreement, title and escrow/);
});

test('comparisons distinguish initial review from contractual access and encourage independent review in both languages', () => {
  for (const file of ['index.html', 'how-it-works.html']) {
    const en = page(file);
    assert.match(en, file === 'index.html' ? /No cleaning or repairs are needed for the initial review/ : /You do not need to clean, repair, or empty anything first/);
    assert.match(en, /Initial walkthrough; further access by agreement/);
    assert.match(en, /Agreed date, subject to contract, title and escrow/);
    assert.match(en, /Ask an independent broker or attorney to review the proposed terms before signing/);
    const spanish = es(file);
    if (file === 'index.html') assert.match(spanish, /No hace falta limpiar ni reparar para la evaluación inicial/);
    assert.match(spanish, /Visita inicial; acceso posterior según lo acordado/);
    assert.match(spanish, /Pida a un corredor independiente o a un abogado que revise las condiciones propuestas antes de firmar/);
  }
});

test('cash-offer comparison timing is illustrative, not a promised or measured result', () => {
  const file = 'guides/cash-offer-vs-listing.html';
  assert.match(page(file), /Illustrative timeline/);
  assert.match(page(file), /Timing is illustrative too: the closing date must be agreed in writing/);
  assert.match(es(file), /Plazo ilustrativo/);
  assert.match(es(file), /Los plazos también son ilustrativos/);
});

test('substantively changed landing pages have matching WebPage and sitemap source dates', () => {
  const changedPaths = ['/', '/how-it-works', '/sell-loved-ones-house',
    ...['bakersfield', 'tehachapi', 'stallion-springs', 'california-city', 'kern-county'].map((a) => `/areas/${a}`),
    ...['needs-major-repairs', 'problem-tenants', 'life-change', 'relocation'].map((s) => `/situations/${s}`)];
  for (const path of changedPaths) {
    const [, html, , modified] = pages.find(([, , p]) => p === path);
    const sitemapDate = modified || contentDate(path);
    assert.equal(sitemapDate, '2026-11-06', path);
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(graph['@graph'].find((n) => n['@type'] === 'WebPage').dateModified, sitemapDate, path);
  }
  assert.equal(contentDate('/about'), '2026-11-05', 'unmodified pages keep their prior date');
});
