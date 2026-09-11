import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { line, texture } from './descriptors.ts';

test('creative SDK has no Three.js dependency', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies?.three, undefined);
});

test('builders return plain descriptor data', () => {
  assert.deepEqual(line('l', [[0, 0, 0], [1, 0, 0]], '#ff0000'), { kind: 'line', id: 'l', points: [[0, 0, 0], [1, 0, 0]], color: '#ff0000' });
  assert.equal(texture('t', `asset:sha256:${'a'.repeat(64)}` as never).kind, 'texture');
});
