import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { hostAssetHandle, type CreativeResourceDescriptor } from '@workspace/creative-sdk';
import { MemoryAssetResolver } from '../assets/AssetResolver.ts';
import { ThreeResourceProjector } from './ThreeResourceProjector.ts';

const owner = { entityId: 'entity:breadth', generationToken: 'generation:breadth', implementationRevision: 4 };

function breadthDescriptors(assetHandle: ReturnType<typeof hostAssetHandle>): CreativeResourceDescriptor[] {
  return [
    {
      kind: 'indexedGeometry', id: 'geometry',
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
      attributes: { heat: { itemSize: 1, values: [0, 0.5, 1] } },
    },
    { kind: 'curve', id: 'curve', points: [[0, 0, 0], [0.5, 1, 0], [1, 0, 0]], color: '#00ffff' },
    {
      kind: 'shaderMaterial', id: 'material',
      vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform float uTime; void main(){gl_FragColor=vec4(uTime,0.0,1.0,1.0);}',
      uniforms: { uTime: 0 },
    },
    { kind: 'texture', id: 'texture', assetHandle },
    { kind: 'light', id: 'light', lightType: 'point', color: '#ffffff', intensity: 2, position: [0, 2, 1] },
    { kind: 'points', id: 'points', positions: [0, 0, 0, 1, 0, 0], color: '#ffffff', size: 0.05 },
    {
      kind: 'instanced', id: 'instances', geometryId: 'geometry', materialId: 'material',
      transforms: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
    },
  ];
}

test('A47 breadth descriptors project indexed attributes, curve, shader, texture, point light, points and instancing', async () => {
  const assets = new MemoryAssetResolver();
  const assetHandle = hostAssetHandle(`asset:sha256:${'a'.repeat(64)}`);
  assets.set(assetHandle, { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 255]) });
  const projector = new ThreeResourceProjector(new THREE.Group(), assets);

  await projector.applyBatch(owner, breadthDescriptors(assetHandle));

  const geometry = projector.getResource(owner.generationToken, 'geometry');
  assert.ok(geometry instanceof THREE.BufferGeometry);
  assert.deepEqual([...geometry.getAttribute('heat').array], [0, 0.5, 1]);
  assert.ok(projector.getResource(owner.generationToken, 'curve') instanceof THREE.Line);
  assert.ok(projector.getResource(owner.generationToken, 'material') instanceof THREE.ShaderMaterial);
  assert.ok(projector.getResource(owner.generationToken, 'texture') instanceof THREE.DataTexture);
  assert.ok(projector.getResource(owner.generationToken, 'light') instanceof THREE.PointLight);
  assert.ok(projector.getResource(owner.generationToken, 'points') instanceof THREE.Points);
  assert.ok(projector.getResource(owner.generationToken, 'instances') instanceof THREE.InstancedMesh);
});

test('A47 point-buffer and shader-uniform updates stay package-local', async () => {
  const assets = new MemoryAssetResolver();
  const assetHandle = hostAssetHandle(`asset:sha256:${'a'.repeat(64)}`);
  assets.set(assetHandle, { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 255]) });
  const projector = new ThreeResourceProjector(new THREE.Group(), assets);
  await projector.applyBatch(owner, breadthDescriptors(assetHandle));

  projector.applyUpdate(owner, { kind: 'update', id: 'points', patch: { positions: [0, 1, 0, 1, 1, 0] } });
  projector.applyUpdate(owner, { kind: 'update', id: 'material', patch: { uniforms: { uTime: 3 } } });

  const points = projector.getResource(owner.generationToken, 'points');
  assert.ok(points instanceof THREE.Points);
  assert.deepEqual([...points.geometry.getAttribute('position').array], [0, 1, 0, 1, 1, 0]);
  const material = projector.getResource(owner.generationToken, 'material');
  assert.ok(material instanceof THREE.ShaderMaterial);
  assert.equal(material.uniforms.uTime?.value, 3);
});


test('A47 projected kinds remain read-only diagnostics for the active generation', async () => {
  const assets = new MemoryAssetResolver();
  const assetHandle = hostAssetHandle(`asset:sha256:${'a'.repeat(64)}`);
  assets.set(assetHandle, { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 255]) });
  const projector = new ThreeResourceProjector(new THREE.Group(), assets);
  await projector.applyBatch(owner, breadthDescriptors(assetHandle));

  assert.deepEqual(
    (projector as unknown as { projectedKinds(generationToken: string): readonly string[] }).projectedKinds(owner.generationToken),
    ['curve', 'indexedGeometry', 'instanced', 'light', 'points', 'shaderMaterial', 'texture'],
  );
});
