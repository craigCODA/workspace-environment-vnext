import './workspace.css';
import * as THREE from 'three';
import { GuestSupervisor, QuickJsGuestEngine } from '@workspace/creative-runtime';
import { HostAssetResolver, ThreeResourceProjector } from '@workspace/spatial-runtime';
import { InteractionController, type TransformContract } from '../interaction/InteractionController.ts';
import { RuntimeCoordinator } from '../runtime/RuntimeCoordinator.ts';
import { ApplicationPicker, readDiscoveredWindows } from './ApplicationPicker.ts';
import { ApplicationSurfaces, closeBitmap, createHostFrameTransport, decodeBitmap } from './ApplicationSurfaces.ts';
import { SurfaceControl, createHostControlTransport } from './SurfaceControl.ts';
import { connectionSettings, readWorld, type WorldEntity, type WorldSnapshot } from './WorldSnapshot.ts';
import { WorkspaceClient } from './WorkspaceClient.ts';
import { statusMessage, WorkspaceScene } from './WorkspaceScene.ts';
import { WorkspaceUI, type WorkspaceAction } from './WorkspaceUI.ts';
import { Navigation } from './Navigation.ts';

const root = document.querySelector<HTMLElement>('#workspace');
if (!root) throw new Error('Workspace root is missing.');
const ui = new WorkspaceUI(root);
void start(root).catch(error => { ui.status.textContent = 'Unable to start'; ui.setReady(false); ui.notice(message(error)); });

async function start(root: HTMLElement): Promise<void> {
  const settings = connectionSettings(location.hash);
  const scene = new WorkspaceScene(root, text => ui.notice(text));
  const navigation = new Navigation(scene.camera, scene.canvas, locked => { root.dataset.camera = locked ? 'locked' : 'released'; });
  const engine = await QuickJsGuestEngine.createForBrowser({ memoryLimitBytes: 32 * 1024 * 1024, maxStackSizeBytes: 512 * 1024, deadlineMs: 25, maxDescriptorsPerBatch: 512, maxTransferredBytesPerBatch: 2 * 1024 * 1024 });
  const guests = new GuestSupervisor((generation, source) => engine.prepare(generation, source));
  const projector = new ThreeResourceProjector(scene.projection, new HostAssetResolver(settings.httpBase, settings.session));
  const runtime = new RuntimeCoordinator(guests, projector);
  let world: WorldSnapshot = { worldRevision: 0, entities: {}, activeLeaseCount: 0 };
  let selected: string | undefined;
  let mode: 'edit' | 'use' = 'edit';
  let disposed = false;
  let ready = false;
  let busy = false;
  let contextLost = false;
  let polling = false;
  const client = await WorkspaceClient.connect(settings.host, settings.session, runtime, error => {
    ready = false; ui.status.textContent = 'Disconnected'; ui.setReady(false);
    navigation.release(); void cancelDrag().catch(() => {}); void control.release('blur').catch(() => {}); ui.notice(message(error));
  });
  const surfaces = new ApplicationSurfaces({
    transport: createHostFrameTransport(settings.httpBase, settings.session),
    decode: decodeBitmap,
    presenter: {
      showFrame: (id, image, width, height) => scene.applySurfaceFrame(id, image, width, height),
      showStatus: (id, status) => {
        scene.showSurfaceStatus(id, status);
        if (selected === id) ui.setSurfaceStatus(statusMessage(status));
      },
      dispose: id => scene.disposeSurfaceMedia(id),
    },
    closeImage: closeBitmap,
  });
  const control = new SurfaceControl(createHostControlTransport(settings.httpBase, settings.session));
  const picker = new ApplicationPicker({
    search: async () => readDiscoveredWindows((await client.command('application.search')).payload),
    bind: async windowId => {
      const entity = targetSurface();
      await client.command('surface.bindWindow', { entityId: entity.id, windowId, expectedParametersRevision: entity.revisions.parameters });
    },
    render: items => ui.renderWindows(items),
  });
  const interaction = new InteractionController(projector.roots, {
    async begin(entityId, fields, expectedTransformRevision) {
      const response = await client.command('edit.begin', { entityId, fields, expectedTransformRevision });
      const leaseId = response.payload?.leaseId;
      if (typeof leaseId !== 'string') throw new Error('Host did not grant an edit lease.');
      return { leaseId };
    },
    async commit(leaseId, transform) { return client.command('edit.commit', { leaseId, transform }); },
    async cancel(leaseId) { await client.command('edit.cancel', { leaseId }); },
  });
  interface Drag {
    id: string; pointerId: number; x: number; y: number; plane: THREE.Plane; offset: THREE.Vector3;
    begin: Promise<void>; transform: TransformContract; moved: boolean;
  }
  let drag: Drag | undefined;
  let surfacePointer: { entityId: string; pointerId: number; x: number; y: number } | undefined;

  function surfaceLabel(id: string | undefined): string {
    if (!id) return '';
    const status = surfaces.snapshot()[id]?.status;
    return status ? statusMessage(status) : 'Choose a running Windows window to connect.';
  }
  function targetSurface(): WorldEntity {
    const current = selected ? world.entities[selected] : undefined;
    if (current?.parameters.kind === 'surface') return current;
    const first = Object.values(world.entities).find(entity => entity.parameters.kind === 'surface');
    if (!first) throw new Error('Add a screen first.');
    selected = first.id;
    return first;
  }
  async function synchronize(next: WorldSnapshot): Promise<void> {
    for (const id of Object.keys(world.entities)) {
      if (!next.entities[id]) {
        runtime.retireActive(id);
        projector.roots.retireGeneration(`world:${id}`);
      }
    }
    for (const entity of Object.values(next.entities)) {
      const binding = entity.packageBinding;
      if (!binding?.active) { runtime.retireActive(entity.id); continue; }
      if (runtime.activeGeneration(entity.id) === binding.generationToken) continue;
      runtime.retireActive(entity.id);
      if (!/^[0-9a-f]{64}$/.test(binding.revisionDigest)) throw new Error('Invalid package revision.');
      const response = await fetch(`${settings.httpBase}/packages/revision/${binding.revisionDigest}`, { headers: { 'x-workspace-session': settings.session }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Package revision unavailable (${response.status}).`);
      const revision = await response.json();
      if (revision.revisionDigest !== binding.revisionDigest || typeof revision.source !== 'string' || typeof revision.manifestJson !== 'string') throw new Error('Invalid package revision response.');
      const result = await runtime.prepare({ type: 'runtime.prepare', protocolVersion: 1, candidateId: `restore:${entity.id}`, entityId: entity.id, generationToken: binding.generationToken, source: revision.source, manifestJson: revision.manifestJson });
      if (result.type !== 'runtime.prepared') throw new Error(result.errorCode ?? 'Package preparation failed.');
      runtime.activate({ type: 'runtime.activate', protocolVersion: 1, entityId: entity.id, generationToken: binding.generationToken, revisionDigest: binding.revisionDigest });
    }
    world = structuredClone(next);
    scene.synchronize(world, projector);
    surfaces.sync(world);
    if (control.entityId && !world.entities[control.entityId]) await control.release('rebind');
    for (const entity of Object.values(world.entities)) {
      if (entity.parameters.kind !== 'room') interaction.acceptHostTransform(entity.id, entity.transform, entity.revisions.transform);
      else navigation.bounds = [entity.parameters.dimensions[0] / 2, entity.parameters.dimensions[2] / 2];
    }
    if (selected && !world.entities[selected]) selected = undefined;
    scene.select(selected ? projector.roots.rootForEntity(selected) : undefined);
    ui.updateWorld(world); ui.select(selected ? world.entities[selected] : undefined, surfaceLabel(selected));
  }
  async function refresh(): Promise<void> { await synchronize(await client.world()); }
  function select(id: string): void {
    if (busy || drag || !ready) return;
    selected = id; navigation.release();
    scene.select(projector.roots.rootForEntity(id)); ui.select(world.entities[id], surfaceLabel(id));
  }
  function requireSelected(): WorldEntity {
    const entity = selected && world.entities[selected];
    if (!entity) throw new Error('Select an object first.'); return entity;
  }
  async function action(name: WorkspaceAction): Promise<void> {
    if (busy || !ready) return;
    navigation.release();
    await cancelDrag();
    if (name === 'objects') { ui.toggleObjects(); return; }
    if (name === 'applications') {
      if (!ui.toggleApplications()) return;
      const status = await picker.refresh();
      ui.setPickerStatus(status === 'available' ? 'Select a running window. Bindings are generic.' : `Discovery: ${status.replaceAll('_', ' ')}.`);
      return;
    }
    if (name === 'mode') {
      mode = mode === 'edit' ? 'use' : 'edit';
      ui.setMode(mode);
      await control.release('mode');
      return;
    }
    busy = true; ui.setBusy(true); ui.notice('');
    try {
      switch (name) {
        case 'save': await client.command('workspace.save'); ui.saveStatus.textContent = 'Saved'; break;
        case 'undo': await client.command('history.undo'); break;
        case 'redo': await client.command('history.redo'); break;
        case 'add-brick': case 'add-screen': {
          const position = scene.camera.position.clone().add(scene.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
          const response = await client.command('entity.create', { templateId: name === 'add-brick' ? 'm2a.brick' : 'm2a.surface', position: position.toArray() });
          const next = readWorld(response.payload);
          selected = Object.keys(next.entities).find(id => !world.entities[id]); break;
        }
        case 'transform': {
          const entity = requireSelected();
          await client.command('transform.set', { entityId: entity.id, expectedTransformRevision: entity.revisions.transform, transform: ui.transform() }); break;
        }
        case 'appearance': {
          const entity = requireSelected();
          await client.command('parameters.patch', { entityId: entity.id, expectedParametersRevision: entity.revisions.parameters, patch: ui.appearance() }); break;
        }
        case 'duplicate': case 'remove': {
          const entity = requireSelected();
          await client.command(name === 'duplicate' ? 'instance.duplicate' : 'entity.remove', { entityId: entity.id, expectedTransformRevision: entity.revisions.transform }); break;
        }
      }
      await refresh(); if (name !== 'save') ui.saveStatus.textContent = 'Changed';
    } catch (error) { ui.notice(message(error)); await refresh().catch(() => {}); }
    finally { busy = false; ui.setBusy(false); }
  }
  ui.bind(name => { void action(name).catch(error => ui.notice(message(error))); }, select, windowId => {
    void (async () => {
      if (busy || !ready) return;
      busy = true; ui.setBusy(true); ui.notice('');
      try {
        await control.release('rebind');
        await picker.bind(windowId);
        await refresh();
        ui.saveStatus.textContent = 'Changed';
        ui.setPickerStatus('Window bound. Use mode sends input to this screen.');
      } catch (error) { ui.notice(message(error)); }
      finally { busy = false; ui.setBusy(false); }
    })();
  });
  ui.setMode(mode);

  scene.canvas.addEventListener('pointerdown', event => {
    if (!ready || busy || drag || navigation.controls.isLocked || event.button !== 0) return;
    scene.scene.updateMatrixWorld(true);
    const ray = scene.ray(event.clientX, event.clientY);
    const hit = ray.intersectObjects(scene.projection.children, true).find(h => visible(h.object) && projector.roots.metadataFor(h.object));
    const metadata = hit && projector.roots.metadataFor(hit.object);
    if (!hit || !metadata) { navigation.capture(); return; }
    select(metadata.entityId);
    if (mode === 'use') {
      const content = scene.liveHit(hit);
      if (content) {
        surfacePointer = { entityId: content.entityId, pointerId: event.pointerId, x: content.x, y: content.y };
        scene.canvas.setPointerCapture(event.pointerId);
        void control.pointer(content.entityId, 'down', content.x, content.y, 'primary').catch(error => ui.notice(message(error)));
        event.preventDefault();
      }
      return;
    }
    const entity = world.entities[metadata.entityId];
    const object = projector.roots.rootForEntity(entity.id)!;
    const worldPosition = object.getWorldPosition(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(scene.camera.getWorldDirection(new THREE.Vector3()), hit.point);
    const begin = interaction.beginTransform(entity.id);
    void begin.catch(error => ui.notice(message(error)));
    drag = { id: entity.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, plane, offset: hit.point.clone().sub(worldPosition), begin, transform: structuredClone(entity.transform), moved: false };
    scene.canvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  scene.canvas.addEventListener('pointermove', event => {
    if (surfacePointer && surfacePointer.pointerId === event.pointerId) {
      const hit = scene.ray(event.clientX, event.clientY).intersectObjects(scene.projection.children, true).find(h => visible(h.object) && scene.liveHit(h));
      const content = hit && scene.liveHit(hit);
      if (!content) return;
      surfacePointer = { ...surfacePointer, x: content.x, y: content.y };
      void control.pointer(surfacePointer.entityId, 'move', content.x, content.y).catch(() => {});
      return;
    }
    const active = drag;
    if (!active || active.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) < 3 && !active.moved) return;
    const point = scene.ray(event.clientX, event.clientY).ray.intersectPlane(active.plane, new THREE.Vector3());
    if (!point) return;
    const object = projector.roots.rootForEntity(active.id)!;
    point.sub(active.offset); if (object.parent) object.parent.worldToLocal(point);
    active.transform = { ...active.transform, position: [point.x, point.y, point.z] }; active.moved = true;
    void active.begin.then(() => { if (drag === active) interaction.previewTransform(active.id, active.transform); }).catch(() => {});
  });
  scene.canvas.addEventListener('pointerup', event => {
    if (surfacePointer && surfacePointer.pointerId === event.pointerId) {
      const active = surfacePointer; surfacePointer = undefined;
      if (scene.canvas.hasPointerCapture(event.pointerId)) scene.canvas.releasePointerCapture(event.pointerId);
      void control.pointer(active.entityId, 'up', active.x, active.y, 'primary').catch(() => {});
      return;
    }
    const active = drag;
    if (!active || active.pointerId !== event.pointerId) return;
    drag = undefined; scene.canvas.releasePointerCapture(event.pointerId);
    busy = true; ui.setBusy(true);
    void (async () => {
      try {
        await active.begin;
        if (active.moved) { interaction.previewTransform(active.id, active.transform); await interaction.commitTransform(active.id); ui.saveStatus.textContent = 'Changed'; }
        else await interaction.cancelTransform(active.id);
        await refresh();
      } catch (error) { await interaction.cancelTransform(active.id).catch(() => {}); ui.notice(message(error)); await refresh().catch(() => {}); }
      finally { busy = false; ui.setBusy(false); }
    })();
  });
  scene.canvas.addEventListener('wheel', event => {
    if (mode !== 'use' || !ready) return;
    const hit = scene.ray(event.clientX, event.clientY).intersectObjects(scene.projection.children, true).find(h => visible(h.object) && scene.liveHit(h));
    const content = hit && scene.liveHit(hit);
    if (!content) return;
    event.preventDefault();
    void control.wheel(content.entityId, content.x, content.y, event.deltaX, event.deltaY).catch(error => ui.notice(message(error)));
  }, { passive: false });
  async function cancelDrag(): Promise<void> {
    const active = drag; drag = undefined;
    if (surfacePointer && scene.canvas.hasPointerCapture(surfacePointer.pointerId)) scene.canvas.releasePointerCapture(surfacePointer.pointerId);
    surfacePointer = undefined;
    if (!active) return;
    if (scene.canvas.hasPointerCapture(active.pointerId)) scene.canvas.releasePointerCapture(active.pointerId);
    await active.begin.catch(() => {});
    await interaction.cancelTransform(active.id);
    scene.select(selected ? projector.roots.rootForEntity(selected) : undefined);
  }
  const cancel = () => { void cancelDrag().catch(error => ui.notice(message(error))); };
  scene.canvas.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', () => { cancel(); void control.release('blur').catch(() => {}); });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      navigation.release(); cancel(); void control.release('Escape').catch(() => {});
      return;
    }
    if (mode !== 'use' || !control.entityId) return;
    if (!control.shouldForwardKey(event)) return;
    event.preventDefault();
    void control.key('down', event).catch(error => ui.notice(message(error)));
  });
  window.addEventListener('keyup', event => {
    if (mode !== 'use' || !control.entityId || !control.shouldForwardKey(event)) return;
    void control.key('up', event).catch(() => {});
  });
  window.addEventListener('pagehide', () => {
    if (disposed) return; disposed = true; ready = false;
    navigation.dispose(); void control.release('blur'); surfaces.dispose(); client.close();
    for (const id of Object.keys(world.entities)) runtime.retireActive(id);
    engine.dispose(); scene.dispose();
  }, { once: true });

  Object.defineProperty(window, '__workspaceM2A', { configurable: true, value: Object.freeze({
    snapshot: () => ({
      world: structuredClone(world),
      activeGenerationCount: runtime.activeGenerationCount(),
      resourceCounts: projector.snapshotCounts(),
      rendererStatus: scene.rendererStatus,
      mode,
      selectedEntityId: selected ?? null,
      surfaces: surfaces.snapshot(),
      controlEntityId: control.entityId ?? null,
      camera: { position: scene.camera.position.toArray(), rotation: scene.camera.quaternion.toArray() },
    }),
  }) });
  await refresh(); ready = true; ui.status.textContent = 'Connected'; ui.setReady(true);
  root.dataset.runtime = 'connected';
  let last = 0;
  let lastPoll = 0;
  scene.renderer.setAnimationLoop(time => {
    if (disposed) return;
    navigation.tick(last ? (time - last) / 1000 : 0); last = time;
    if (scene.rendererStatus === 'context-lost') contextLost = true;
    if (scene.rendererStatus === 'ready') {
      if (contextLost) { contextLost = false; surfaces.restart(); }
      try { runtime.tick(time); }
      catch (error) { runtime.setPackagesPaused(true); ui.notice(`Package paused: ${message(error)}`); }
      if (!polling && time - lastPoll > 80) {
        lastPoll = time;
        polling = true;
        void surfaces.poll().catch(error => ui.notice(message(error))).finally(() => { polling = false; });
      }
      scene.render();
    }
  });
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function visible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) { if (!current.visible) return false; current = current.parent; }
  return true;
}
