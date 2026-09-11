import assert from 'node:assert/strict';
import test from 'node:test';
import { QuickJsGuestEngine } from './QuickJsGuestEngine.ts';

const budget = {
  memoryLimitBytes: 4 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
  deadlineMs: 50,
  maxDescriptorsPerBatch: 8,
  maxTransferredBytesPerBatch: 32 * 1024,
};

test('three import is rejected', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests(budget);
  await assert.rejects(
    () => engine.prepare('generation:three', `import * as THREE from 'three'; export function start(){}`),
    /module_not_allowed:three/,
  );
  engine.dispose();
});

test('filesystem network process and browser globals are absent', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests(budget);
  const result = await engine.evaluateProbe(`[
    typeof fetch, typeof process, typeof require, typeof WebSocket, typeof document
  ]`);
  assert.deepEqual(result, ['undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
  engine.dispose();
});

test('infinite loop is interrupted', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests({ ...budget, deadlineMs: 10 });
  await assert.rejects(() => engine.prepare('generation:loop', `while (true) {}`), /guest_interrupted/);
  engine.dispose();
});

test('descriptor emission is plain validated data and bounded', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests({ ...budget, maxDescriptorsPerBatch: 1 });
  const prepared = await engine.prepare('generation:one', `
    import { line } from '@workspace/creative-sdk';
    line('a', [[0,0,0],[1,0,0]], '#ff0000');
  `);
  assert.equal(prepared.initialDescriptors.length, 1);
  assert.equal(prepared.initialDescriptors[0]?.kind, 'line');
  prepared.dispose();
  await assert.rejects(() => engine.prepare('generation:two', `
    import { line } from '@workspace/creative-sdk';
    line('a', [[0,0,0],[1,0,0]], '#ff0000');
    line('b', [[0,0,0],[0,1,0]], '#00ff00');
  `), /guest_output_budget_exceeded/);
  engine.dispose();
});

test('trusted monotonic tick drives only emitted resource updates', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests(budget);
  const prepared = await engine.prepare('generation:tick', `
    import { update } from '@workspace/creative-sdk';
    export function onTick(t) { update('points', { visible: t >= 10 }); }
  `);
  assert.deepEqual(prepared.tick(9), [{ kind: 'update', id: 'points', patch: { visible: false } }]);
  assert.deepEqual(prepared.tick(10), [{ kind: 'update', id: 'points', patch: { visible: true } }]);
  prepared.dispose();
  engine.dispose();
});
