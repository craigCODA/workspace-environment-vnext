import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EntityRootRegistry } from './EntityRootRegistry.ts';
import { PickingResolver } from './PickingResolver.ts';

test('picking resolves trusted semantic root instead of triangle identity', () => {
  const roots = new EntityRootRegistry();
  const root = roots.createRoot({ entityId: 'entity:x', generationToken: 'g:1', implementationRevision: 3 });
  const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  root.add(child);
  const resolver = new PickingResolver(roots);
  assert.deepEqual(resolver.resolve(child), { entityId: 'entity:x', generationToken: 'g:1', implementationRevision: 3 });
});
