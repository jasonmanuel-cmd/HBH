import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGaId } from '../site.config.mjs';

test('a valid GA4 ID from the environment is used', () => {
  assert.equal(resolveGaId('G-ABC123XYZ9'), 'G-ABC123XYZ9');
  assert.equal(resolveGaId('  G-ABC123XYZ9  '), 'G-ABC123XYZ9');
});

test('empty or placeholder values fall back to the default tag', () => {
  for (const bad of ['', undefined, 'GA_MEASUREMENT_ID', 'G-XXXXXXX', 'not-an-id']) {
    assert.equal(resolveGaId(bad), 'G-SN1ZWS50M7');
  }
});
