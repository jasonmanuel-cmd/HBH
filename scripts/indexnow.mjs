import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { origin, publishChanges, validateManifest } from '../lib/indexnow.mjs';

const [checkpoint, nextCheckpoint] = process.argv.slice(2);
if (!checkpoint || !nextCheckpoint) throw new Error('Expected checkpoint input and output paths');

const previous = existsSync(checkpoint)
  ? validateManifest(JSON.parse(readFileSync(checkpoint, 'utf8')))
  : {};
const response = await fetch(`${origin}/indexnow-manifest.json`, {
  redirect: 'error',
  cache: 'no-store',
  headers: { 'Cache-Control': 'no-cache' },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Production manifest returned HTTP ${response.status}`);
const current = validateManifest(await response.json());
await publishChanges(previous, current);
writeFileSync(nextCheckpoint, JSON.stringify(current, null, 2) + '\n');
