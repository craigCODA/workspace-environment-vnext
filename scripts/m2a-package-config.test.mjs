import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('root desktop scripts target the vNext M2A Electron shell', () => {
  assert.equal(packageJson.main, 'apps/desktop/main.cjs');
  assert.equal(packageJson.scripts.electron, 'node scripts/run-m2a.mjs');
  assert.equal(packageJson.scripts.m2a, 'node scripts/run-m2a.mjs');
  assert.equal(packageJson.scripts['dist:win'], 'node scripts/build-m2a-windows.mjs');
});

test('electron-builder stages vNext spatial assets and self-contained Windows host', () => {
  assert.ok(packageJson.build.files.includes('apps/desktop/**/*.cjs'));
  assert.ok(packageJson.build.extraResources.some(entry => entry.from === 'apps/spatial/dist' && entry.to === 'spatial'));
  assert.ok(packageJson.build.extraResources.some(entry => entry.from === '.m2a-build/host' && entry.to === 'host'));
  assert.equal(packageJson.build.win.target[0].target, 'nsis');
  assert.ok(packageJson.build.win.target[0].arch.includes('x64'));
  assert.match(packageJson.build.nsis.artifactName, /Workspace Environment Setup/);
});
