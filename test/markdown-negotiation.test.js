import { test } from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';
import { prefersMarkdown } from '../lib/markdown-accept.js';
import { pageMarkdown } from '../src/markdown.mjs';
import { buildPages } from '../src/pages.mjs';

test('Markdown requires an explicit positive preference', () => {
  for (const v of ['', '*/*', 'text/html', 'text/markdown;q=0', 'text/html;q=1, text/markdown;q=0.5']) assert.equal(prefersMarkdown(v), false, v);
  for (const v of ['text/markdown', 'Text/Markdown; charset=utf-8', 'text/html;q=0.5, text/markdown;q=1']) assert.equal(prefersMarkdown(v), true, v);
});

test('only public HTML routes negotiate Markdown, including Spanish and HEAD', () => {
  const visit = (path, accept, method = 'GET') => middleware(new Request('https://www.callharbison.com' + path, { headers: { Accept: accept }, method }));
  for (const [path, target] of [['/', '/_agent-markdown/index.md'], ['/es', '/_agent-markdown/es/index.md'], ['/es/areas/bakersfield', '/_agent-markdown/es/areas/bakersfield.md']]) {
    const md = visit(path, 'text/markdown', 'HEAD');
    assert.equal(new URL(md.headers.get('x-middleware-rewrite')).pathname, target);
    assert.match(md.headers.get('content-type'), /^text\/markdown/);
    assert.equal(md.headers.get('vary'), 'Accept');
    const html = visit(path, 'text/html');
    assert.equal(html.headers.get('x-middleware-rewrite'), null);
    assert.equal(html.headers.get('vary'), 'Accept');
  }
  for (const path of ['/hq', '/api/leads', '/thank-you', '/es/thank-you', '/family-property-guide', '/es/family-property-guide', '/missing', '/sitemap.xml']) {
    assert.equal(visit(path, 'text/markdown').headers.get('x-middleware-rewrite'), null, path);
  }
  assert.equal(visit('/contact', 'text/markdown', 'POST').headers.get('x-middleware-rewrite'), null);
});

test('Markdown keeps readable headings and links while dropping scripts and form controls', () => {
  const [, html] = buildPages().find(([file]) => file === 'contact.html');
  const md = pageMarkdown(html);
  assert.match(md, /^# .*Call Harbison/m);
  assert.match(md, /tel:\+16614727499/);
  assert.doesNotMatch(md, /mailto:/);
  assert.doesNotMatch(md, /<script|data-lead-form|captcha|How did you hear about us\?/);
});
