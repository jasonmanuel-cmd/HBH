// Local preview: builds the site, serves ./dist with clean URLs, and runs /api/leads + /api/hq + /api/intake + /api/track. Run: npm run dev
// Add `-- --mock` to try HQ with sample data and password "demo" (no real database needed).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { execSync } from 'node:child_process';
import handler from './api/leads.js';
import hqHandler from './api/hq.js';
import intakeHandler from './api/intake.js';
import trackHandler from './api/track.js';
import { installMockSupabase } from './dev/mock-supabase.mjs';
import { family } from './src/family.mjs';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

if (process.argv.includes('--mock')) {
  installMockSupabase();
  console.log(`HQ mock mode: sample data, password "demo" → http://localhost:${PORT}/hq`);
}

execSync('node build.mjs', { stdio: 'inherit' });

const DIST_ROOT = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

async function findFile(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const base = resolve(DIST_ROOT, `.${decoded}`).replace(/[\\/]+$/, '');
  if (base !== DIST_ROOT && !base.startsWith(`${DIST_ROOT}${sep}`)) return null;
  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/csp-report') {
    req.url = '/api/track?csp=1';
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(b)));
    return trackHandler(req, res);
  }

  if (['/api/leads', '/api/hq', '/api/intake', '/api/track'].includes(url.pathname)) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.body = raw;
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(b)));
    return url.pathname === '/api/hq' ? hqHandler(req, res) : url.pathname === '/api/track' ? trackHandler(req, res) : url.pathname === '/api/intake' ? intakeHandler(req, res) : handler(req, res);
  }

  // Mirror vercel.json redirects locally.
  if (url.pathname === '/family' || url.pathname === family.oldPath) {
    res.writeHead(url.pathname === '/family' ? 307 : 308, { Location: `${family.path}${url.search}` });
    return res.end();
  }
  if (url.pathname === '/contact-us' || url.pathname === '/get-in-touch') {
    res.writeHead(308, { Location: `/contact${url.search}` });
    return res.end();
  }

  const file = (await findFile(url.pathname)) || 'dist/404.html';
  res.statusCode = file === 'dist/404.html' && url.pathname !== '/404' ? 404 : 200;
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.end(await readFile(file));
}).listen(PORT, HOST, () => console.log(`Preview: http://localhost:${PORT}`));
