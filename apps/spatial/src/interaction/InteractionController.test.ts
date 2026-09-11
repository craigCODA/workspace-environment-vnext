import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { line } from '@workspace/creative-sdk';
import { MemoryAssetResolver, PickingResolver, ThreeResourceProjector } from '@workspace/spatial-runtime';

const identityTransform = (x: number) => ({
  position: [x, 0, 0] as const,
  rotation: [0, 0, 0, 1] as const,
  scale: [1, 1, 1] as const,
});

test('drag preview does not snap back when package implementation swaps', async () => {
  const interactionModule = await import('./InteractionController.ts').catch(() => undefined);
  assert.ok(interactionModule, 'InteractionController module must exist');

  const scene = new THREE.Group();
  const projector = new ThreeResourceProjector(scene, new MemoryAssetResolver());
  await projector.applyBatch(
    { entityId: 'entity:box', generationToken: 'generation:a', implementationRevision: 1 },
    [line('outline', [[0, 0, 0], [1, 0, 0]], '#ffffff')],
  );

  const root = projector.roots.rootForEntity('entity:box');
  assert.ok(root);
  const firstImplementation = root.children[0];

  const calls: string[] = [];
  const gateway = {
    async begin(entityId: string, fields: readonly string[], expectedTransformRevision: number) {
      calls.push(`begin:${entityId}:${fields.join(',')}:${expectedTransformRevision}`);
      return { leaseId: 'lease:1' };
    },
    async commit() {
      calls.push('commit');
      return { accepted: true };
    },
    async cancel() {
      calls.push('cancel');
    },
  };

  const interaction = new interactionModule.InteractionController(projector.roots, gateway);
  interaction.acceptHostTransform('entity:box', identityTransform(1), 4);
  await interaction.beginTransform('entity:box');
  interaction.previewTransform('entity:box', identityTransform(8));

  assert.equal(root.position.x, 8);
  assert.deepEqual(calls, ['begin:entity:box:transform:4']);

  await projector.applyBatch(
    { entityId: 'entity:box', generationToken: 'generation:b', implementationRevision: 2 },
    [line('outline', [[0, 0, 0], [2, 0, 0]], '#00ff00')],
  );

  assert.strictEqual(projector.roots.rootForEntity('entity:box'), root);
  assert.equal(root.position.x, 8);
  assert.notStrictEqual(root.children[0], firstImplementation);
  assert.deepEqual(calls, ['begin:entity:box:transform:4']);
});

test('transform commit sends one final pose and cancel restores the last accepted pose', async () => {
  const { InteractionController } = await import('./InteractionController.ts');
  const scene = new THREE.Group();
  const projector = new ThreeResourceProjector(scene, new MemoryAssetResolver());
  await projector.applyBatch(
    { entityId: 'entity:edit', generationToken: 'generation:edit', implementationRevision: 1 },
    [line('outline', [[0, 0, 0], [1, 0, 0]], '#ffffff')],
  );

  const commits: unknown[] = [];
  const cancels: string[] = [];
  let leaseNumber = 0;
  const gateway = {
    async begin() { return { leaseId: `lease:${++leaseNumber}` }; },
    async commit(leaseId: string, transform: unknown) {
      commits.push({ leaseId, transform });
      return { accepted: true };
    },
    async cancel(leaseId: string) { cancels.push(leaseId); },
  };

  const interaction = new InteractionController(projector.roots, gateway);
  interaction.acceptHostTransform('entity:edit', identityTransform(1), 2);
  await interaction.beginTransform('entity:edit');
  interaction.previewTransform('entity:edit', identityTransform(6));
  interaction.previewTransform('entity:edit', identityTransform(7));
  await interaction.commitTransform('entity:edit');

  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0], { leaseId: 'lease:1', transform: identityTransform(7) });

  interaction.acceptHostTransform('entity:edit', identityTransform(7), 3);
  await interaction.beginTransform('entity:edit');
  interaction.previewTransform('entity:edit', identityTransform(11));
  interaction.acceptHostTransform('entity:edit', identityTransform(9), 4);
  assert.equal(projector.roots.rootForEntity('entity:edit')?.position.x, 11);
  await interaction.cancelTransform('entity:edit');

  assert.equal(projector.roots.rootForEntity('entity:edit')?.position.x, 9);
  assert.deepEqual(cancels, ['lease:2']);
});

test('anchor display radius is trusted UI state and never changes the semantic root scale', async () => {
  const { InteractionController } = await import('./InteractionController.ts');
  const scene = new THREE.Group();
  const projector = new ThreeResourceProjector(scene, new MemoryAssetResolver());
  await projector.applyBatch(
    { entityId: 'anchor:placement', generationToken: 'generation:anchor', implementationRevision: 1 },
    [line('marker', [[0, 0, 0], [0, 1, 0]], '#ffffff')],
  );
  const gateway = {
    async begin() { return { leaseId: 'lease:anchor' }; },
    async commit() { return { accepted: true }; },
    async cancel() {},
  };
  const interaction = new InteractionController(projector.roots, gateway);
  interaction.acceptHostTransform('anchor:placement', identityTransform(5), 1);

  const handle = interaction.createAnchorHandle('anchor:placement', 0.2);
  assert.equal(handle.parent, projector.roots.rootForEntity('anchor:placement'));
  assert.deepEqual(new PickingResolver(projector.roots).resolve(handle), {
    entityId: 'anchor:placement',
    handleKey: 'anchor.position',
    generationToken: 'generation:anchor',
    implementationRevision: 1,
  });
  assert.deepEqual(projector.roots.rootForEntity('anchor:placement')?.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(handle.scale.toArray(), [0.2, 0.2, 0.2]);

  interaction.setAnchorDisplayRadius('anchor:placement', 0.45);
  assert.deepEqual(handle.scale.toArray(), [0.45, 0.45, 0.45]);
  assert.deepEqual(projector.roots.rootForEntity('anchor:placement')?.scale.toArray(), [1, 1, 1]);
  assert.equal(projector.roots.rootForEntity('anchor:placement')?.position.x, 5);
});

test('procedural local updates never modify the moved semantic root transform', async () => {
  const scene = new THREE.Group();
  const projector = new ThreeResourceProjector(scene, new MemoryAssetResolver());
  const owner = { entityId: 'entity:procedural', generationToken: 'generation:procedural', implementationRevision: 1 };
  await projector.applyBatch(owner, [line('moving', [[0, 0, 0], [1, 0, 0]], '#ffffff')]);
  const root = projector.roots.rootForEntity(owner.entityId);
  assert.ok(root);
  root.position.set(8, 0, 0);

  projector.applyUpdate(owner, { kind: 'update', id: 'moving', patch: { position: [2, 0, 0] } });

  assert.equal(root.position.x, 8);
  const resource = projector.getResource(owner.generationToken, 'moving');
  assert.ok(resource instanceof THREE.Object3D);
  assert.equal(resource.position.x, 2);
});


test('disconnect cancellation restores every active preview through the edit gateway', async () => {
  const { InteractionController } = await import('./InteractionController.ts');
  const scene = new THREE.Group();
  const projector = new ThreeResourceProjector(scene, new MemoryAssetResolver());
  for (const entityId of ['entity:a', 'entity:b']) {
    await projector.applyBatch(
      { entityId, generationToken: `generation:${entityId}`, implementationRevision: 1 },
      [line('outline', [[0, 0, 0], [1, 0, 0]], '#ffffff')],
    );
  }
  const cancelled: string[] = [];
  let nextLease = 0;
  const interaction = new InteractionController(projector.roots, {
    async begin() { return { leaseId: `lease:${++nextLease}` }; },
    async commit() { return { accepted: true }; },
    async cancel(leaseId: string) { cancelled.push(leaseId); },
  });
  interaction.acceptHostTransform('entity:a', identityTransform(1), 1);
  interaction.acceptHostTransform('entity:b', identityTransform(2), 1);
  await interaction.beginTransform('entity:a');
  await interaction.beginTransform('entity:b');
  interaction.previewTransform('entity:a', identityTransform(10));
  interaction.previewTransform('entity:b', identityTransform(20));

  await interaction.cancelAll();

  assert.equal(projector.roots.rootForEntity('entity:a')?.position.x, 1);
  assert.equal(projector.roots.rootForEntity('entity:b')?.position.x, 2);
  assert.deepEqual(cancelled.sort(), ['lease:1', 'lease:2']);
});
