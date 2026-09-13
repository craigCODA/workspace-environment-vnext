import assert from 'node:assert/strict';
import test from 'node:test';

test('contain-fit letterboxes a wide frame on a taller screen', async () => {
  const { containFit, mapUvToCapture } = await import('./contentMapping.ts');
  const fit = containFit(1, 16 / 9);
  assert.equal(fit.u0, 0);
  assert.equal(fit.u1, 1);
  assert.ok(fit.v0 > 0 && fit.v1 < 1);

  assert.equal(mapUvToCapture(0.5, fit.v0, fit)?.y, 0);
  assert.equal(mapUvToCapture(0.5, fit.v1, fit)?.y, 1);
  assert.equal(mapUvToCapture(0, (fit.v0 + fit.v1) / 2, fit)?.x, 0);
  assert.equal(mapUvToCapture(1, (fit.v0 + fit.v1) / 2, fit)?.x, 1);
  assert.equal(mapUvToCapture(0.5, fit.v0 / 2, fit), null);
  assert.equal(mapUvToCapture(0.5, (fit.v1 + 1) / 2, fit), null);
});

test('contain-fit pillarboxes a tall frame on a wider screen', async () => {
  const { containFit, mapUvToCapture } = await import('./contentMapping.ts');
  const fit = containFit(16 / 9, 1);
  assert.equal(fit.v0, 0);
  assert.equal(fit.v1, 1);
  assert.ok(fit.u0 > 0 && fit.u1 < 1);
  assert.equal(mapUvToCapture(fit.u0 / 2, 0.5, fit), null);
  assert.equal(mapUvToCapture((fit.u0 + fit.u1) / 2, 0.5, fit)?.x, 0.5);
});

test('plane UV maps through content with a top-left capture origin', async () => {
  const { containFit, mapPlaneUvToCapture } = await import('./contentMapping.ts');
  const fit = containFit(16 / 9, 16 / 9);
  const topLeft = mapPlaneUvToCapture(0, 1, fit);
  const bottomRight = mapPlaneUvToCapture(1, 0, fit);
  assert.deepEqual(topLeft, { x: 0, y: 0 });
  assert.deepEqual(bottomRight, { x: 1, y: 1 });
  assert.equal(mapPlaneUvToCapture(-0.01, 0.5, fit), null);
  assert.equal(mapPlaneUvToCapture(0.5, 1.01, fit), null);
});
