import assert from 'node:assert/strict';
import test from 'node:test';
import { SurfaceControl } from './SurfaceControl.ts';

test('Use-mode input acquires a lease, maps content UV, and ignores letterbox hits', async () => {
  const sent: unknown[] = [];
  const control = new SurfaceControl({
    acquire: async entityId => ({ leaseId: `lease:${entityId}`, mode: 'messages' }),
    input: async (entityId, leaseId, payload) => { sent.push({ entityId, leaseId, payload }); },
    release: async () => { sent.push({ released: true }); },
  });
  await control.pointer('surface:a', 'down', 0.25, 0.75, 'primary');
  await control.pointer('surface:a', 'move', 0.25, 0.75);
  assert.deepEqual(sent, [
    { entityId: 'surface:a', leaseId: 'lease:surface:a', payload: { kind: 'pointer', phase: 'down', x: 0.25, y: 0.75, button: 'primary' } },
    { entityId: 'surface:a', leaseId: 'lease:surface:a', payload: { kind: 'pointer', phase: 'move', x: 0.25, y: 0.75 } },
  ]);
  assert.equal(await control.pointer('surface:a', 'move', null, null), false);
});

test('control releases on Escape, blur, mode change, and rebind', async () => {
  const events: string[] = [];
  const control = new SurfaceControl({
    acquire: async () => ({ leaseId: 'lease:1', mode: 'messages' }),
    input: async () => { events.push('input'); },
    release: async () => { events.push('release'); },
  });
  await control.pointer('surface:a', 'down', 0.5, 0.5, 'primary');
  await control.release('Escape');
  await control.pointer('surface:a', 'down', 0.5, 0.5, 'primary');
  await control.release('blur');
  await control.pointer('surface:a', 'down', 0.5, 0.5, 'primary');
  await control.release('mode');
  await control.pointer('surface:a', 'down', 0.5, 0.5, 'primary');
  await control.release('rebind');
  assert.deepEqual(events.filter(e => e === 'release'), ['release', 'release', 'release', 'release']);
});

test('Windows key and Alt+Tab stay local and are not forwarded', async () => {
  const sent: unknown[] = [];
  const control = new SurfaceControl({
    acquire: async () => ({ leaseId: 'lease:1', mode: 'messages' }),
    input: async (_entity, _lease, payload) => { sent.push(payload); },
    release: async () => {},
  });
  await control.pointer('surface:a', 'down', 0.1, 0.2, 'primary');
  assert.equal(control.shouldForwardKey({ key: 'Meta', altKey: false, ctrlKey: false, metaKey: true }), false);
  assert.equal(control.shouldForwardKey({ key: 'Tab', altKey: true, ctrlKey: false, metaKey: false }), false);
  assert.equal(control.shouldForwardKey({ key: 'OS', altKey: false, ctrlKey: false, metaKey: false }), false);
  assert.equal(control.shouldForwardKey({ key: 'a', altKey: false, ctrlKey: false, metaKey: false }), true);
  assert.equal(control.shouldForwardKey({ key: 'Backspace', altKey: true, ctrlKey: true, metaKey: false }), false);
  await control.key('down', { key: 'Meta', altKey: false, ctrlKey: false, metaKey: true });
  await control.key('down', { key: 'Tab', altKey: true, ctrlKey: false, metaKey: false });
  assert.equal(sent.some((p: any) => p.kind === 'key'), false);
});
