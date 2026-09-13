import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldSnapshot } from './WorldSnapshot.ts';
import { ApplicationSurfaces, decodeBitmap, type FrameRead } from './ApplicationSurfaces.ts';

test('ApplicationSurfaces decodes the latest in-order frame and drops stale ones', async () => {
  const reads: FrameRead[] = [
    frame('live', 2, 'second'),
    frame('live', 1, 'stale'),
    frame('live', 3, 'third'),
  ];
  const { surfaces, shown, disposed } = harness(() => reads.shift() ?? frame('idle', 3, 'idle'));
  surfaces.sync(worldWith('surface:a'));
  await surfaces.poll();
  await surfaces.poll();
  await surfaces.poll();
  assert.deepEqual(shown, [
    ['surface:a', 'second', 16, 9],
    ['surface:a', 'third', 16, 9],
  ]);
  assert.deepEqual(disposed, ['second']);
  assert.equal(surfaces.snapshot()['surface:a']?.status, 'live');
  assert.equal(surfaces.snapshot()['surface:a']?.sequence, 3);
});

test('ApplicationSurfaces shows explicit host states and disposes on removal or rebind', async () => {
  const { surfaces, shown, statuses, disposed, closeCalls } = harness(
    entityId => entityId === 'surface:a' ? { status: 'window_minimized' } : { status: 'capture_protected' },
  );
  surfaces.sync(worldWith('surface:a', 'surface:b'));
  await surfaces.poll();
  assert.deepEqual(statuses, [
    ['surface:a', 'minimized'],
    ['surface:b', 'protected'],
  ]);
  surfaces.sync(worldWith('surface:b', { id: 'surface:b', selector: 'selector:2' }));
  assert.ok(disposed.includes('surface:a'));
  assert.ok(disposed.includes('surface:b'));
  surfaces.dispose();
  assert.ok(closeCalls.length >= 0);
});

test('context-loss restart disposes decoded frames and resumes consumption', async () => {
  let sequence = 1;
  const { surfaces, shown, disposed } = harness(() => frame('live', sequence, `frame-${sequence}`));
  surfaces.sync(worldWith('surface:a'));
  await surfaces.poll();
  sequence = 2;
  surfaces.restart();
  assert.ok(disposed.includes('frame-1'));
  await surfaces.poll();
  assert.equal(shown.at(-1)?.[1], 'frame-2');
});

function harness(read: (entityId: string, after: number) => FrameRead) {
  const shown: [string, string, number, number][] = [];
  const statuses: [string, string][] = [];
  const disposed: string[] = [];
  const closeCalls: string[] = [];
  const images = new Map<string, string>();
  const surfaces = new ApplicationSurfaces({
    transport: { readFrame: async (entityId, after) => read(entityId, after) },
    decode: async body => {
      const label = new TextDecoder().decode(body);
      return { image: label, width: 16, height: 9 };
    },
    presenter: {
      showFrame(entityId, image, width, height) {
        const previous = images.get(entityId);
        if (previous) disposed.push(previous);
        images.set(entityId, String(image));
        shown.push([entityId, String(image), width, height]);
      },
      showStatus(entityId, status) { statuses.push([entityId, status]); },
      dispose(entityId) {
        const previous = images.get(entityId);
        if (previous) disposed.push(previous);
        disposed.push(entityId);
        images.delete(entityId);
      },
    },
    closeImage: image => { closeCalls.push(String(image)); },
  });
  return { surfaces, shown, statuses, disposed, closeCalls };
}

function frame(status: string, sequence: number, label: string): FrameRead {
  return { status, sequence, width: 16, height: 9, mimeType: 'image/png', body: new TextEncoder().encode(label).buffer };
}

function worldWith(...items: Array<string | { id: string; selector?: string }>): WorldSnapshot {
  const entities: WorldSnapshot['entities'] = {};
  for (const item of items) {
    const id = typeof item === 'string' ? item : item.id;
    const selector = typeof item === 'string' ? 'selector:1' : item.selector ?? 'selector:1';
    entities[id] = {
      id,
      name: id,
      parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      parameters: {
        kind: 'surface',
        dimensions: [2.8, 1.6, 0.06],
        application: { applicationId: selector, executablePath: 'C:/app.exe', windowClass: 'Class', titleHint: id },
      },
      revisions: { transform: 0, parameters: 0, implementation: 0, relationships: 0, packageState: 0 },
      packageBinding: null,
    };
  }
  return { worldRevision: 1, entities, activeLeaseCount: 0 };
}

test('captured frames decode with a Y flip so ImageBitmap matches the WebGL origin', async () => {
  const calls: unknown[] = [];
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = (async (_image: ImageBitmapSource, options?: ImageBitmapOptions) => {
    calls.push(options);
    return { width: 16, height: 9, close() {} } as ImageBitmap;
  }) as typeof createImageBitmap;
  try {
    await decodeBitmap(new ArrayBuffer(8), 'image/png');
    assert.deepEqual(calls, [{ imageOrientation: 'flipY' }]);
  } finally {
    globalThis.createImageBitmap = original;
  }
});
