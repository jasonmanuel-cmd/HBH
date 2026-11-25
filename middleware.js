import { next, rewrite } from '@vercel/functions';
import { prefersMarkdown } from './lib/markdown-accept.js';
import { buildPages } from './src/pages.mjs';
import { esPath } from './src/i18n/translate.mjs';

const assets = new Map(buildPages().flatMap(([file, , path]) => {
  if (!path) return [];
  const markdown = file.replace(/\.html$/, '.md');
  return [[path, markdown], [esPath(path), 'es/' + markdown]];
}));

export default function middleware(request) {
  const url = new URL(request.url);
  const file = assets.get(url.pathname);
  if (!file || !['GET', 'HEAD'].includes(request.method)) return next();

  const headers = new Headers({ Vary: 'Accept' });
  if (!prefersMarkdown(request.headers.get('Accept') || '')) return next({ headers });

  headers.set('Content-Type', 'text/markdown; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  const destination = new URL('/_agent-markdown/' + file, url.origin);
  return rewrite(destination, { headers });
}

export const config = {
  matcher: ['/((?!api/|hq(?:/|$)|_agent-markdown/|_vercel/|assets/|fonts/|.*\\.).*)'],
};
