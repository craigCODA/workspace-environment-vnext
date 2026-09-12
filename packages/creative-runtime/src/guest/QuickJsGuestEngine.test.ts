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

test('A22 import "three" is rejected with an explicit compatibility error', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests(budget);
  await assert.rejects(
    () => engine.prepare('generation:three', `import * as THREE from 'three'; export function start(){}`),
    /module_not_allowed:three/,
  );
  engine.dispose();
});

test('A09 fetch process require document and WebSocket are unavailable', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests(budget);
  const result = await engine.evaluateProbe(`[
    typeof fetch, typeof process, typeof require, typeof WebSocket, typeof document
  ]`);
  assert.deepEqual(result, ['undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
  engine.dispose();
});

test('A08 infinite CPU loop is interrupted', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests({ ...budget, deadlineMs: 10 });
  await assert.rejects(() => engine.prepare('generation:loop', `while (true) {}`), /guest_interrupted/);
  engine.dispose();
});

test('A08 memory allocation ceiling is enforced with a stable failure', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests({
    ...budget,
    memoryLimitBytes: 8 * 1024 * 1024,
    deadlineMs: 5_000,
  });
  await assert.rejects(
    () => engine.prepare('generation:memory', `
      const blocks = [];
      for (let i = 0; i < 256; i += 1) blocks.push(new Uint8Array(1024 * 1024));
      export function start() {}
    `),
    /guest_memory_limit_exceeded/,
  );
  engine.dispose();
});

test('A08 retained memory is stopped at the configured ceiling across ticks', async () => {
  const engine = await QuickJsGuestEngine.createForNodeTests({
    ...budget,
    memoryLimitBytes: 8 * 1024 * 1024,
    deadlineMs: 500,
  });
  const prepared = await engine.prepare('generation:retained-memory', `
    const blocks = [];
    export function onTick() { blocks.push(new Uint8Array(1024 * 1024)); }
  `);

  let failure: unknown;
  let failedAtTick: number | undefined;
  for (let tick = 1; tick <= 12; tick += 1) {
    try {
      prepared.tick(tick);
    } catch (error) {
      failure = error;
      failedAtTick = tick;
      break;
    }
  }
  assert.match(String(failure), /guest_memory_limit_exceeded/);
  assert.ok(failedAtTick !== undefined && failedAtTick <= 8, `memory limit was not enforced at 8 MiB: failed at tick ${failedAtTick ?? 'never'}`);
  prepared.dispose();
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
