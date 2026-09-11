import assert from 'node:assert/strict';
import test from 'node:test';
import type { CreativeResourceUpdate } from '@workspace/creative-sdk';
import { GuestSupervisor } from './GuestSupervisor.ts';

class FakePrepared {
  readonly initialDescriptors = [];
  readonly generationToken: string;
  disposed = false;

  constructor(generationToken: string) {
    this.generationToken = generationToken;
  }

  tick(): CreativeResourceUpdate[] { return []; }
  dispose(): void { this.disposed = true; }
}

test('late retired generation messages are dropped', async () => {
  const created = new Map<string, FakePrepared>();
  const supervisor = new GuestSupervisor(async (token) => {
    const guest = new FakePrepared(token);
    created.set(token, guest);
    return guest;
  });
  await supervisor.prepare('entity:x', 'generation:a', '');
  supervisor.activate('entity:x', 'generation:a');
  supervisor.retireGeneration('generation:a');
  assert.equal(created.get('generation:a')?.disposed, true);
  assert.deepEqual(supervisor.acceptUpdate('entity:x', 'generation:a', { kind: 'update', id: 'x', patch: {} }), []);
});

test('only one generation is active for an entity', async () => {
  const supervisor = new GuestSupervisor(async (token) => new FakePrepared(token));
  await supervisor.prepare('entity:x', 'generation:a', '');
  await supervisor.prepare('entity:x', 'generation:b', '');
  supervisor.activate('entity:x', 'generation:a');
  supervisor.activate('entity:x', 'generation:b');
  assert.equal(supervisor.activeGeneration('entity:x'), 'generation:b');
});
