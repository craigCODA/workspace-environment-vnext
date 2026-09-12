import * as THREE from 'three';
import { GuestSupervisor, QuickJsGuestEngine } from '@workspace/creative-runtime';
import { HostAssetResolver, PickingResolver, ThreeResourceProjector } from '@workspace/spatial-runtime';
import { HostConnection, type HostCommandResponse } from './host/HostConnection.ts';
import { InteractionController, type EditGateway, type TransformContract } from './interaction/InteractionController.ts';
import { createTrustedRecoveryControls } from './recovery/TrustedRecoveryControls.ts';
import { RuntimeCoordinator } from './runtime/RuntimeCoordinator.ts';

export function createTrustedInteraction(projector: ThreeResourceProjector, gateway: EditGateway) {
  return {
    controller: new InteractionController(projector.roots, gateway),
    picking: new PickingResolver(projector.roots),
  };
}

interface PackageBindingSnapshot {
  readonly packageId: string;
  readonly revisionDigest: string;
  readonly generationToken: string;
  readonly active: boolean;
}

interface WorldEntitySnapshot {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly transform: TransformContract;
  readonly packageBinding: PackageBindingSnapshot | null;
  readonly revisions: {
    readonly transform: number;
    readonly parameters: number;
    readonly relationships: number;
    readonly implementation: number;
    readonly packageState: number;
  };
}

interface WorldSnapshot {
  readonly worldRevision: number;
  readonly entities: Record<string, WorldEntitySnapshot>;
  readonly activeLeaseCount: number;
}

interface ResourceCounts {
  readonly generations: number;
  readonly resources: number;
  readonly stagedGroups: number;
  readonly activeEntities: number;
}

interface DiagnosticsSnapshot extends WorldSnapshot {
  readonly activeGenerationCount: number;
  readonly resourceCounts: ResourceCounts;
  readonly activePackageRevisions: Record<string, string>;
  readonly projectedKinds: readonly string[];
  readonly activePackageEntityId: string | null;
  readonly packagesPaused: boolean;
  readonly capabilityGrantCount: number;
  readonly rendererStatus: string;
}

interface DragState {
  readonly entityId: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly accepted: TransformContract;
  readonly begin: Promise<void>;
  latestX: number;
  latestY: number;
}

interface WorkspaceDiagnostics {
  snapshot(): DiagnosticsSnapshot;
}

interface PackageRevisionPayload {
  readonly packageId: string;
  readonly revisionDigest: string;
  readonly manifestJson: string;
  readonly source: string;
}

declare global {
  interface Window {
    __workspaceDiagnostics?: WorkspaceDiagnostics;
  }
}

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('app_root_missing');
const appRoot = app;
appRoot.replaceChildren();

const title = document.createElement('h1');
title.textContent = 'Workspace Environment vNext';
const status = document.createElement('div');
status.dataset.testid = 'agent-network-calls';
status.textContent = '0';
status.hidden = true;
const controls = document.createElement('div');
const undoButton = document.createElement('button');
undoButton.type = 'button';
undoButton.textContent = 'Undo';
const saveButton = document.createElement('button');
saveButton.type = 'button';
saveButton.textContent = 'Save';
const saveStatus = document.createElement('span');
saveStatus.dataset.testid = 'save-status';
saveStatus.textContent = 'idle';
saveStatus.hidden = true;
controls.append(undoButton, saveButton, saveStatus);
const surface = document.createElement('div');
surface.dataset.testid = 'workspace-surface';
Object.assign(surface.style, {
  position: 'relative',
  width: '640px',
  height: '360px',
  border: '1px solid #777',
  overflow: 'hidden',
  touchAction: 'none',
});
appRoot.append(title, status, controls, surface);

const emptyResourceCounts: ResourceCounts = Object.freeze({
  generations: 0,
  resources: 0,
  stagedGroups: 0,
  activeEntities: 0,
});
let currentWorld: WorldSnapshot = { worldRevision: 0, entities: {}, activeLeaseCount: 0 };
let diagnosticCoordinator: RuntimeCoordinator | null = null;
let diagnosticProjector: ThreeResourceProjector | null = null;
let rendererStatus = 'not-started';
window.__workspaceDiagnostics = Object.freeze({
  snapshot: (): DiagnosticsSnapshot => {
    const activeEntities = activePackageEntities(currentWorld);
    const activeEntity = activeEntities[0];
    const generationToken = activeEntity ? diagnosticCoordinator?.activeGeneration(activeEntity.id) : undefined;
    return {
      ...structuredClone(currentWorld),
      activeGenerationCount: diagnosticCoordinator?.activeGenerationCount() ?? 0,
      resourceCounts: diagnosticProjector?.snapshotCounts() ?? structuredClone(emptyResourceCounts),
      activePackageRevisions: Object.fromEntries(activeEntities.map((entity) => [entity.id, entity.packageBinding!.revisionDigest])),
      projectedKinds: generationToken && diagnosticProjector ? diagnosticProjector.projectedKinds(generationToken) : [],
      activePackageEntityId: activeEntity?.id ?? null,
      packagesPaused: diagnosticCoordinator?.packagesPaused() ?? false,
      capabilityGrantCount: 0,
      rendererStatus,
    };
  },
});

void startRuntime();

async function startRuntime(): Promise<void> {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const host = fragment.get('host');
  const session = fragment.get('session');
  if (!host || !session) return;
  const httpBase = trustedHttpBase(host);

  const engine = await QuickJsGuestEngine.createForBrowser({
    memoryLimitBytes: 32 * 1024 * 1024,
    maxStackSizeBytes: 512 * 1024,
    deadlineMs: 25,
    maxDescriptorsPerBatch: 512,
    maxTransferredBytesPerBatch: 2 * 1024 * 1024,
  });
  const guests = new GuestSupervisor((generationToken, source) => engine.prepare(generationToken, source));

  const projectionScene = new THREE.Group();
  const projector = new ThreeResourceProjector(projectionScene, new HostAssetResolver(httpBase, session));
  const coordinator = new RuntimeCoordinator(guests, projector);
  diagnosticProjector = projector;
  diagnosticCoordinator = coordinator;

  const renderScene = new THREE.Scene();
  renderScene.add(projectionScene);
  const camera = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
  camera.position.set(0, 0, 4);
  const canvas = document.createElement('canvas');
  canvas.dataset.workspaceRenderer = 'true';
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '640px',
    height: '360px',
    zIndex: '0',
  });
  surface.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  rendererStatus = 'ready';
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    rendererStatus = 'context-lost';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    rendererStatus = 'ready';
  });

  const connection = await HostConnection.connect(host, session, coordinator);

  const updateActiveLeaseCount = (value: unknown): void => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return;
    currentWorld = { ...currentWorld, activeLeaseCount: value };
  };

  const gateway: EditGateway = {
    async begin(entityId, fields, expectedTransformRevision) {
      const response = await connection.command('edit.begin', { entityId, fields, expectedTransformRevision });
      if (!response.accepted) throw new Error(response.errorCode ?? 'edit_begin_rejected');
      const leaseId = response.payload?.leaseId;
      if (typeof leaseId !== 'string' || leaseId.length === 0) throw new Error('edit_lease_missing');
      updateActiveLeaseCount(response.payload?.activeLeaseCount);
      return { leaseId };
    },
    async commit(leaseId, transform) {
      const response = await connection.command('edit.commit', { leaseId, transform });
      return { accepted: response.accepted, errorCode: response.errorCode };
    },
    async cancel(leaseId) {
      const response = await connection.command('edit.cancel', { leaseId });
      if (!response.accepted) throw new Error(response.errorCode ?? 'edit_cancel_rejected');
      updateActiveLeaseCount(response.payload?.activeLeaseCount);
    },
  };
  const { controller } = createTrustedInteraction(projector, gateway);
  const handles = new Map<string, HTMLButtonElement>();
  let drag: DragState | null = null;
  let pendingCommit: Promise<void> | null = null;

  const applyWorld = (world: WorldSnapshot): void => {
    currentWorld = structuredClone(world);
    for (const entity of Object.values(world.entities)) {
      projector.roots.createRoot({
        entityId: entity.id,
        generationToken: entity.packageBinding?.active ? entity.packageBinding.generationToken : `world:${entity.id}`,
        implementationRevision: entity.revisions.implementation,
      });
    }
    for (const entity of Object.values(world.entities)) {
      projector.roots.setParent(entity.id, entity.parentId, projector.scene);
      controller.acceptHostTransform(entity.id, entity.transform, entity.revisions.transform);
      let handle = handles.get(entity.id);
      if (!handle) {
        handle = createEntityHandle(entity.id, entity.name);
        handles.set(entity.id, handle);
        surface.append(handle);
        handle.addEventListener('pointerdown', (event) => {
          if (drag) return;
          event.preventDefault();
          const acceptedEntity = currentWorld.entities[entity.id];
          if (!acceptedEntity) return;
          handle!.setPointerCapture(event.pointerId);
          drag = {
            entityId: entity.id,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            latestX: event.clientX,
            latestY: event.clientY,
            accepted: structuredClone(acceptedEntity.transform),
            begin: controller.beginTransform(entity.id),
          };
        });
        handle.addEventListener('pointermove', (event) => {
          const active = drag;
          if (!active || active.pointerId !== event.pointerId || active.entityId !== entity.id) return;
          active.latestX = event.clientX;
          active.latestY = event.clientY;
          const preview = transformForDrag(active);
          syncHandle(handle!, preview);
          void active.begin.then(() => {
            if (drag === active) controller.previewTransform(entity.id, preview);
          });
        });
        handle.addEventListener('pointerup', (event) => {
          const active = drag;
          if (!active || active.pointerId !== event.pointerId || active.entityId !== entity.id) return;
          active.latestX = event.clientX;
          active.latestY = event.clientY;
          drag = null;
          pendingCommit = finishDrag(active, controller, connection, applyWorld).finally(() => {
            pendingCommit = null;
          });
        });
      }
      handle.style.zIndex = '1';
      syncHandle(handle, entity.transform);
    }
  };

  const reconcilePackages = async (world: WorldSnapshot): Promise<void> => {
    for (const entity of Object.values(world.entities)) {
      const binding = entity.packageBinding;
      if (!binding?.active) {
        coordinator.retireActive(entity.id);
        continue;
      }
      if (coordinator.activeGeneration(entity.id) === binding.generationToken) continue;
      coordinator.retireActive(entity.id);
      const revision = await fetchPackageRevision(httpBase, session, binding.revisionDigest);
      const prepared = await coordinator.prepare({
        type: 'runtime.prepare',
        protocolVersion: 1,
        candidateId: `reconstruct:${entity.id}:${binding.generationToken}`,
        entityId: entity.id,
        generationToken: binding.generationToken,
        source: revision.source,
        manifestJson: revision.manifestJson,
      });
      if (prepared.type !== 'runtime.prepared') {
        throw new Error(prepared.errorCode ?? 'package_prepare_failed');
      }
      coordinator.activate({
        type: 'runtime.activate',
        protocolVersion: 1,
        entityId: entity.id,
        revisionDigest: binding.revisionDigest,
        generationToken: binding.generationToken,
      });
    }
  };

  controls.append(createTrustedRecoveryControls({
    packagesPaused: () => coordinator.packagesPaused(),
    setPackagesPaused: (paused) => coordinator.setPackagesPaused(paused),
    async disableCurrentPackage() {
      const entity = activePackageEntities(currentWorld)[0];
      if (!entity?.packageBinding) return;
      const response = await connection.command('package.disable', {
        entityId: entity.id,
        expectedImplementationRevision: entity.revisions.implementation,
      });
      if (!response.accepted) throw new Error(response.errorCode ?? 'package_disable_rejected');
      coordinator.retireActive(entity.id);
      applyWorld(worldFrom(response));
    },
  }));

  undoButton.addEventListener('click', () => {
    void (async () => {
      if (pendingCommit) await pendingCommit;
      const response = await connection.command('history.undo');
      if (!response.accepted) throw new Error(response.errorCode ?? 'undo_rejected');
      const world = worldFrom(response);
      applyWorld(world);
      await reconcilePackages(world);
    })();
  });

  saveButton.addEventListener('click', () => {
    saveStatus.textContent = 'saving';
    void (async () => {
      if (pendingCommit) await pendingCommit;
      const response = await connection.command('workspace.save');
      if (!response.accepted) throw new Error(response.errorCode ?? 'save_rejected');
      const world = worldFrom(response);
      applyWorld(world);
      await reconcilePackages(world);
      saveStatus.textContent = 'saved';
    })();
  });

  const initial = await connection.command('world.read');
  if (!initial.accepted) throw new Error(initial.errorCode ?? 'world_read_rejected');
  const initialWorld = worldFrom(initial);
  applyWorld(initialWorld);
  await reconcilePackages(initialWorld);
  appRoot.dataset.runtime = 'connected';

  const frame = (time: number): void => {
    if (rendererStatus === 'ready') {
      coordinator.tick(time);
      renderer.render(renderScene, camera);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function fetchPackageRevision(baseUrl: string, sessionToken: string, revisionDigest: string): Promise<PackageRevisionPayload> {
  if (!/^[0-9a-f]{64}$/.test(revisionDigest)) throw new Error('invalid_revision_digest');
  const response = await fetch(`${baseUrl}/packages/revision/${revisionDigest}`, {
    headers: { 'x-workspace-session': sessionToken },
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'package_revision_not_authorized' : 'package_revision_fetch_failed');
  const payload = await response.json() as Partial<PackageRevisionPayload>;
  if (typeof payload.packageId !== 'string'
    || payload.revisionDigest !== revisionDigest
    || typeof payload.manifestJson !== 'string'
    || typeof payload.source !== 'string') {
    throw new Error('package_revision_payload_invalid');
  }
  return payload as PackageRevisionPayload;
}

function trustedHttpBase(webSocketUrl: string): string {
  const url = new URL(webSocketUrl);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  else if (url.protocol === 'wss:') url.protocol = 'https:';
  else throw new Error('host_websocket_url_invalid');
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function activePackageEntities(world: WorldSnapshot): WorldEntitySnapshot[] {
  return Object.values(world.entities)
    .filter((entity) => entity.packageBinding?.active === true)
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function finishDrag(
  drag: DragState,
  controller: InteractionController,
  connection: HostConnection,
  applyWorld: (world: WorldSnapshot) => void,
): Promise<void> {
  await drag.begin;
  controller.previewTransform(drag.entityId, transformForDrag(drag));
  const result = await controller.commitTransform(drag.entityId);
  if (!result.accepted) throw new Error(result.errorCode ?? 'edit_commit_rejected');
  const refreshed = await connection.command('world.read');
  if (!refreshed.accepted) throw new Error(refreshed.errorCode ?? 'world_read_rejected');
  applyWorld(worldFrom(refreshed));
}

function transformForDrag(drag: DragState): TransformContract {
  return {
    position: [
      drag.accepted.position[0] + (drag.latestX - drag.startX) / 100,
      drag.accepted.position[1] - (drag.latestY - drag.startY) / 100,
      drag.accepted.position[2],
    ],
    rotation: [...drag.accepted.rotation],
    scale: [...drag.accepted.scale],
  };
}

function createEntityHandle(entityId: string, name: string): HTMLButtonElement {
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.dataset.entityId = entityId;
  handle.setAttribute('aria-label', name);
  handle.textContent = name;
  Object.assign(handle.style, {
    position: 'absolute',
    width: '72px',
    height: '48px',
    userSelect: 'none',
    touchAction: 'none',
    cursor: 'grab',
  });
  return handle;
}

function syncHandle(handle: HTMLElement, transform: TransformContract): void {
  handle.style.left = `${100 + transform.position[0] * 100}px`;
  handle.style.top = `${100 - transform.position[1] * 100}px`;
}

function worldFrom(response: HostCommandResponse): WorldSnapshot {
  const payload = response.payload;
  if (!payload
    || typeof payload.worldRevision !== 'number'
    || typeof payload.entities !== 'object'
    || payload.entities === null
    || typeof payload.activeLeaseCount !== 'number') {
    throw new Error('world_payload_invalid');
  }
  return payload as unknown as WorldSnapshot;
}
