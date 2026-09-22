// Local preview: builds the site, serves ./dist with clean URLs, and runs /api/leads. Run: npm run dev
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import handler from './api/leads.js';

execSync('node build.mjs', { stdio: 'inherit' });

const PORT = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };

async function findFile(pathname) {
  const base = normalize(join('dist', decodeURIComponent(pathname))).replace(/[\\/]+$/, '');
  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/leads') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.body = raw;
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (b) => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(b)));
    return handler(req, res);
  }

  const file = (await findFile(url.pathname)) || 'dist/404.html';
  res.statusCode = file === 'dist/404.html' && url.pathname !== '/404' ? 404 : 200;
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
