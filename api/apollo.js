import { readFile } from 'node:fs/promises';
import { addWalkthrough, apolloHost, approvedDestination, configuredApolloStore } from '../lib/apollo.js';

export default async function handler(req,res,env=process.env,store) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Referrer-Policy','no-referrer');
  if (!apolloHost(req.headers?.host,env)) { res.statusCode=404; return res.end(); }
  if (!['GET','HEAD'].includes(req.method)) {
    res.statusCode=405; res.setHeader('Allow','GET, HEAD'); return res.end();
  }
  let state;
  try { state = await (store ?? configuredApolloStore(env))?.read(); }
  catch { console.warn('[apollo] serving original page: settings store unavailable'); }
  const target = state?.destination ? approvedDestination(state.destination,env) : null;
  if (target) { res.statusCode=307; res.setHeader('Location',target); return res.end(); }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src https://fonts.gstatic.com; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.statusCode=200;
  if (req.method === 'HEAD') return res.end();
  const html = await readFile(new URL('../content/apollo.html',import.meta.url),'utf8');
  return res.end(addWalkthrough(html,state?.video));
}
