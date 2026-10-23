// Spanish translation tooling.
//   node scripts/i18n.mjs extract [--out file.json]   write every English text that still lacks a Spanish entry
//   node scripts/i18n.mjs check                        exit 1 if anything is missing or malformed (used by npm test)
//   node scripts/i18n.mjs split <file.json> <n> <dir>  split an extract into n work files for translators
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import site from '../site.config.mjs';
import { buildPages } from '../src/pages.mjs';
import { loadDictionary, shapeOf, translatePage } from '../src/i18n/translate.mjs';

const [command = 'check', ...args] = process.argv.slice(2);
const { dict, problems } = loadDictionary();

function collectMissing() {
  const report = { missing: new Set() };
  const ctx = { dict, siteUrl: site.url, report };
  for (const [file, html] of buildPages()) {
    if (file === '404.html') continue;
    translatePage(html, { ...ctx, filePath: file });
  }
  return [...report.missing];
}

if (command === 'extract') {
  const missing = collectMissing();
  const out = args[args.indexOf('--out') + 1];
  const body = Object.fromEntries(missing.map((k) => [k, '']));
  if (out) writeFileSync(out, JSON.stringify(body, null, 2));
  console.log(`${missing.length} English texts have no Spanish entry yet${out ? ` -> ${out}` : ''}`);
} else if (command === 'verify') {
  // node scripts/i18n.mjs verify <work.json> <part.json>: does the translated part cover every key, with tags intact?
  const [workFile, partFile] = args;
  const work = JSON.parse(readFileSync(workFile, 'utf8'));
  const part = JSON.parse(readFileSync(partFile, 'utf8'));
  const issues = [];
  for (const key of Object.keys(work)) {
    if (!(key in part)) issues.push(`missing key: ${key.slice(0, 80)}`);
    else if (typeof part[key] !== 'string' || !part[key].trim()) issues.push(`empty value: ${key.slice(0, 80)}`);
    else if (shapeOf(key) !== shapeOf(part[key])) issues.push(`tags/placeholders differ: ${key.slice(0, 80)}  ->  ${part[key].slice(0, 80)}`);
  }
  for (const key of Object.keys(part)) if (!(key in work)) issues.push(`unknown key (do not edit keys): ${key.slice(0, 80)}`);
  issues.slice(0, 40).forEach((i) => console.error(i));
  console.log(issues.length ? `${issues.length} problems` : `OK: ${Object.keys(work).length} entries`);
  process.exit(issues.length ? 1 : 0);
} else if (command === 'split') {
  const [file, count, dir] = args;
  const entries = Object.entries(JSON.parse(readFileSync(file, 'utf8')));
  mkdirSync(dir, { recursive: true });
  const size = Math.ceil(entries.length / Number(count));
  for (let i = 0; i < Number(count); i++) {
    const chunk = Object.fromEntries(entries.slice(i * size, (i + 1) * size));
    writeFileSync(join(dir, `work-${String(i + 1).padStart(2, '0')}.json`), JSON.stringify(chunk, null, 2));
  }
  console.log(`${entries.length} texts -> ${count} files in ${dir}`);
} else {
  const missing = collectMissing();
  for (const p of problems) console.error(`problem: ${p}`);
  for (const m of missing.slice(0, 20)) console.error(`missing: ${m.slice(0, 100)}`);
  if (missing.length > 20) console.error(`...and ${missing.length - 20} more`);
  console.log(`${dict.size} Spanish entries, ${missing.length} missing, ${problems.length} problems`);
  process.exit(missing.length || problems.length ? 1 : 0);
}
