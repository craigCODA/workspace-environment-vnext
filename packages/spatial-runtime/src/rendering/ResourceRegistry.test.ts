import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceRegistry } from './ResourceRegistry.ts';

test('resource ids are scoped to generation ownership', () => {
  const registry = new ResourceRegistry<object>();
  registry.set('generation:a', 'mesh', { owner: 'a' });
  assert.equal(registry.get('generation:a', 'mesh')?.owner, 'a');
  assert.equal(registry.get('generation:b', 'mesh'), undefined);
});

test('retiring generation removes only that generation', () => {
  const registry = new ResourceRegistry<object>();
  registry.set('generation:a', 'mesh', {});
  registry.set('generation:b', 'mesh', {});
  registry.retireGeneration('generation:a');
  assert.equal(registry.get('generation:a', 'mesh'), undefined);
  assert.ok(registry.get('generation:b', 'mesh'));
});
