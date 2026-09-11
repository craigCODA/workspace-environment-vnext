import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EntityRootRegistry } from './EntityRootRegistry.ts';

test('semantic hierarchy follows explicit host parent identity and preserves child local transform', () => {
  const roots = new EntityRootRegistry();
  const scene = new THREE.Group();
  const parent = roots.createRoot({ entityId: 'entity:parent', generationToken: 'g:1', implementationRevision: 1 });
  const child = roots.createRoot({ entityId: 'entity:child', generationToken: 'g:1', implementationRevision: 1 });
  scene.add(parent, child);
  child.position.set(2, 3, 4);

  roots.setParent('entity:child', 'entity:parent', scene);

  assert.strictEqual(child.parent, parent);
  assert.deepEqual(child.position.toArray(), [2, 3, 4]);
  assert.equal(roots.parentIdFor('entity:child'), 'entity:parent');

  assert.throws(() => roots.setParent('entity:parent', 'entity:child', scene), /hierarchy_cycle/);
  roots.setParent('entity:child', null, scene);
  assert.strictEqual(child.parent, scene);
  assert.equal(roots.parentIdFor('entity:child'), undefined);
});
