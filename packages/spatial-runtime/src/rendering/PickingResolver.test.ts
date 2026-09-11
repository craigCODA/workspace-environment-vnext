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

test('stale semantic handle reports missing_handle after implementation regeneration', () => {
  const roots = new EntityRootRegistry();
  const root = roots.createRoot({ entityId: 'entity:board', generationToken: 'g:1', implementationRevision: 1 });
  const oldHandle = new THREE.Object3D();
  root.add(oldHandle);
  roots.registerHandle('entity:board', 'board.end.east', oldHandle);
  const resolver = new PickingResolver(roots);

  assert.deepEqual(resolver.resolve(oldHandle), {
    entityId: 'entity:board',
    handleKey: 'board.end.east',
    generationToken: 'g:1',
    implementationRevision: 1,
  });

  roots.createRoot({ entityId: 'entity:board', generationToken: 'g:2', implementationRevision: 2 });

  assert.deepEqual(resolver.resolve(oldHandle), {
    error: 'missing_handle',
    entityId: 'entity:board',
    handleKey: 'board.end.east',
    implementationRevision: 2,
  });

  const newHandle = new THREE.Object3D();
  root.add(newHandle);
  roots.registerHandle('entity:board', 'board.end.east', newHandle);
  assert.deepEqual(resolver.resolve(newHandle), {
    entityId: 'entity:board',
    handleKey: 'board.end.east',
    generationToken: 'g:2',
    implementationRevision: 2,
  });
});
