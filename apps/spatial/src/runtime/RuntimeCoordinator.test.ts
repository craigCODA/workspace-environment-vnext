import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GuestSupervisor, type PreparedGuestFactory } from '@workspace/creative-runtime';
import { hostAssetHandle, type CreativeResourceDescriptor } from '@workspace/creative-sdk';
import {
  EntityRootRegistry,
  MemoryAssetResolver,
  ThreeResourceProjector,
} from '@workspace/spatial-runtime';
import { RuntimeCoordinator } from './RuntimeCoordinator.ts';

const descriptorsBySource: Record<string, readonly CreativeResourceDescriptor[]> = {
  A: [
    {
      kind: 'line',
      id: 'line-a',
      points: [[0, 0, 0], [1, 0, 0]],
      color: '#ff0000',
    },
  ],
  B: [
    {
      kind: 'line',
      id: 'line-b',
      points: [[0, 0, 0], [0, 1, 0]],
      color: '#00ff00',
    },
  ],
};

const factory: PreparedGuestFactory = async (generationToken, source) => {
  if (source === 'FAIL') throw new Error('candidate_prepare_failed');
  const initialDescriptors = descriptorsBySource[source];
  if (!initialDescriptors) throw new Error(`unknown_source:${source}`);
  return {
    generationToken,
    initialDescriptors,
    tick: () => [],
    dispose: () => undefined,
  };
};

test('candidate generation stays detached until activation and failed prepare preserves active generation', async () => {
  const scene = new THREE.Group();
  const roots = new EntityRootRegistry();
  const projector = new ThreeResourceProjector(scene, new MemoryAssetResolver(), roots);
  const guests = new GuestSupervisor(factory);
  const coordinator = new RuntimeCoordinator(guests, projector);

  const preparedA = await coordinator.prepare({
    type: 'runtime.prepare',
    protocolVersion: 1,
    candidateId: 'candidate:a',
    entityId: 'entity:box',
    generationToken: 'generation:a',
    source: 'A',
    manifestJson: '{}',
  });
  assert.equal(preparedA.type, 'runtime.prepared');
  assert.equal(scene.children.length, 0, 'prepared candidate must remain detached');

  coordinator.activate({
    type: 'runtime.activate',
    protocolVersion: 1,
    entityId: 'entity:box',
    revisionDigest: 'sha256:a',
    generationToken: 'generation:a',
  });

  assert.equal(scene.children.length, 1);
  const stableRoot = scene.children[0] as THREE.Group;
  assert.equal(stableRoot.name, 'workspace-root:entity:box');
  assert.equal(stableRoot.children.length, 1);
  assert.equal(stableRoot.children[0]?.name, 'workspace-implementation:generation:a');

  const preparedB = await coordinator.prepare({
    type: 'runtime.prepare',
    protocolVersion: 1,
    candidateId: 'candidate:b',
    entityId: 'entity:box',
    generationToken: 'generation:b',
    source: 'B',
    manifestJson: '{}',
  });
  assert.equal(preparedB.type, 'runtime.prepared');
  assert.equal(scene.children[0], stableRoot, 'entity root identity must remain stable');
  assert.equal(stableRoot.children.length, 1, 'active generation remains the only visible implementation');
  assert.equal(stableRoot.children[0]?.name, 'workspace-implementation:generation:a');

  coordinator.activate({
    type: 'runtime.activate',
    protocolVersion: 1,
    entityId: 'entity:box',
    revisionDigest: 'sha256:b',
    generationToken: 'generation:b',
  });

  assert.equal(scene.children[0], stableRoot, 'activation swaps below the stable root');
  assert.equal(stableRoot.children.length, 1);
  assert.equal(stableRoot.children[0]?.name, 'workspace-implementation:generation:b');

  const failed = await coordinator.prepare({
    type: 'runtime.prepare',
    protocolVersion: 1,
    candidateId: 'candidate:failed',
    entityId: 'entity:box',
    generationToken: 'generation:failed',
    source: 'FAIL',
    manifestJson: '{}',
  });
  assert.equal(failed.type, 'runtime.failed');
  assert.equal(scene.children[0], stableRoot);
  assert.equal(stableRoot.children.length, 1);
  assert.equal(stableRoot.children[0]?.name, 'workspace-implementation:generation:b');
});


test('100 activation cycles retire all resources and guest generations', async () => {
  const scene = new THREE.Group();
  const roots = new EntityRootRegistry();
  const assets = new MemoryAssetResolver();
  const assetHandle = hostAssetHandle(`asset:sha256:${'b'.repeat(64)}`);
  assets.set(assetHandle, { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]) });
  const projector = new ThreeResourceProjector(scene, assets, roots);
  const cycleFactory: PreparedGuestFactory = async (generationToken) => ({
    generationToken,
    initialDescriptors: [
      {
        kind: 'indexedGeometry',
        id: 'geometry',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
      },
      {
        kind: 'shaderMaterial',
        id: 'material',
        vertexShader: 'void main(){gl_Position=vec4(0.0);}',
        fragmentShader: 'void main(){gl_FragColor=vec4(1.0);}',
      },
      { kind: 'texture', id: 'texture', assetHandle },
    ],
    tick: () => [],
    dispose: () => undefined,
  });
  const guests = new GuestSupervisor(cycleFactory);
  const coordinator = new RuntimeCoordinator(guests, projector);
  const baseline = projector.snapshotCounts();

  for (let index = 0; index < 100; index += 1) {
    const generationToken = `generation:${index}`;
    const candidateId = `candidate:${index}`;
    const prepared = await coordinator.prepare({
      type: 'runtime.prepare',
      protocolVersion: 1,
      candidateId,
      entityId: 'entity:cycle',
      generationToken,
      source: 'CYCLE',
      manifestJson: '{}',
    });
    assert.equal(prepared.type, 'runtime.prepared');
    coordinator.activate({
      type: 'runtime.activate',
      protocolVersion: 1,
      entityId: 'entity:cycle',
      revisionDigest: `sha256:${index}`,
      generationToken,
    });
    coordinator.retire({ type: 'runtime.retire', protocolVersion: 1, generationToken });
    assert.deepEqual(projector.snapshotCounts(), baseline);
    assert.equal(guests.aliveCount(), 0);
  }
});
