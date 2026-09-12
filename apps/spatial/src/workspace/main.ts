import './workspace.css';
import * as THREE from 'three';
import { GuestSupervisor, QuickJsGuestEngine } from '@workspace/creative-runtime';
import { HostAssetResolver, ThreeResourceProjector } from '@workspace/spatial-runtime';
import { InteractionController, type TransformContract } from '../interaction/InteractionController.ts';
import { RuntimeCoordinator } from '../runtime/RuntimeCoordinator.ts';
import { connectionSettings, readWorld, type WorldEntity, type WorldSnapshot } from './WorldSnapshot.ts';
import { WorkspaceClient } from './WorkspaceClient.ts';
import { WorkspaceScene } from './WorkspaceScene.ts';
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
  const client = await WorkspaceClient.connect(settings.host, settings.session, runtime, error => {
    ready = false; ui.status.textContent = 'Disconnected'; ui.setReady(false);
    navigation.release(); void cancelDrag().catch(() => {}); ui.notice(message(error));
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
    for (const entity of Object.values(world.entities)) {
      if (entity.parameters.kind !== 'room') interaction.acceptHostTransform(entity.id, entity.transform, entity.revisions.transform);
      else navigation.bounds = [entity.parameters.dimensions[0] / 2, entity.parameters.dimensions[2] / 2];
    }
    if (selected && !world.entities[selected]) selected = undefined;
    scene.select(selected ? projector.roots.rootForEntity(selected) : undefined);
    ui.updateWorld(world); ui.select(selected ? world.entities[selected] : undefined);
  }
  async function refresh(): Promise<void> { await synchronize(await client.world()); }
  function select(id: string): void {
    if (busy || drag || !ready) return;
    selected = id; navigation.release();
    scene.select(projector.roots.rootForEntity(id)); ui.select(world.entities[id]);
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
    if (name === 'mode') { mode = mode === 'edit' ? 'use' : 'edit'; ui.setMode(mode); return; }
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
  ui.bind(name => { void action(name).catch(error => ui.notice(message(error))); }, select);
  ui.setMode(mode);

  scene.canvas.addEventListener('pointerdown', event => {
    if (!ready || busy || drag || navigation.controls.isLocked || event.button !== 0) return;
    scene.scene.updateMatrixWorld(true);
    const ray = scene.ray(event.clientX, event.clientY);
    const hit = ray.intersectObjects(scene.projection.children, true).find(h => projector.roots.metadataFor(h.object));
    const metadata = hit && projector.roots.metadataFor(hit.object);
    if (!hit || !metadata) { navigation.capture(); return; }
    select(metadata.entityId);
    if (mode === 'use') { ui.notice('Application input is not wired in this room checkpoint. Switch to Edit mode to move objects.'); return; }
    const entity = world.entities[metadata.entityId];
    const object = projector.roots.rootForEntity(entity.id)!;
    const worldPosition = object.getWorldPosition(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(scene.camera.getWorldDirection(new THREE.Vector3()), hit.point);
    const begin = interaction.beginTransform(entity.id);
    // Attach immediately so a failed lease cannot become an unhandled rejection during a drag.
    void begin.catch(error => ui.notice(message(error)));
    drag = { id: entity.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, plane, offset: hit.point.clone().sub(worldPosition), begin, transform: structuredClone(entity.transform), moved: false };
    scene.canvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  scene.canvas.addEventListener('pointermove', event => {
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
  async function cancelDrag(): Promise<void> {
    const active = drag; drag = undefined;
    if (!active) return;
    if (scene.canvas.hasPointerCapture(active.pointerId)) scene.canvas.releasePointerCapture(active.pointerId);
    await active.begin.catch(() => {});
    await interaction.cancelTransform(active.id);
    scene.select(selected ? projector.roots.rootForEntity(selected) : undefined);
  }
  const cancel = () => { void cancelDrag().catch(error => ui.notice(message(error))); };
  scene.canvas.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') { navigation.release(); cancel(); } });
  window.addEventListener('pagehide', () => {
    if (disposed) return; disposed = true; ready = false;
    navigation.dispose(); client.close();
    for (const id of Object.keys(world.entities)) runtime.retireActive(id);
    engine.dispose(); scene.dispose();
  }, { once: true });

  Object.defineProperty(window, '__workspaceM2A', { configurable: true, value: Object.freeze({
    snapshot: () => ({ world: structuredClone(world), activeGenerationCount: runtime.activeGenerationCount(), resourceCounts: projector.snapshotCounts(), rendererStatus: scene.rendererStatus, mode, selectedEntityId: selected ?? null, camera: { position: scene.camera.position.toArray(), rotation: scene.camera.quaternion.toArray() } }),
  }) });
  await refresh(); ready = true; ui.status.textContent = 'Connected'; ui.setReady(true);
  root.dataset.runtime = 'connected';
  let last = 0;
  scene.renderer.setAnimationLoop(time => {
    if (disposed) return;
    navigation.tick(last ? (time - last) / 1000 : 0); last = time;
    if (scene.rendererStatus === 'ready') {
      try { runtime.tick(time); }
      catch (error) { runtime.setPackagesPaused(true); ui.notice(`Package paused: ${message(error)}`); }
      scene.render();
    }
  });
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
