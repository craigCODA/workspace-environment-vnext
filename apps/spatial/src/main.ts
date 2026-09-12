import * as THREE from 'three';
import { GuestSupervisor, QuickJsGuestEngine } from '@workspace/creative-runtime';
import { MemoryAssetResolver, PickingResolver, ThreeResourceProjector } from '@workspace/spatial-runtime';
import { HostConnection, type HostCommandResponse } from './host/HostConnection.ts';
import { InteractionController, type EditGateway, type TransformContract } from './interaction/InteractionController.ts';
import { RuntimeCoordinator } from './runtime/RuntimeCoordinator.ts';

export function createTrustedInteraction(projector: ThreeResourceProjector, gateway: EditGateway) {
  return {
    controller: new InteractionController(projector.roots, gateway),
    picking: new PickingResolver(projector.roots),
  };
}

interface WorldEntitySnapshot {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly transform: TransformContract;
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
  snapshot(): WorldSnapshot;
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

let currentWorld: WorldSnapshot = { worldRevision: 0, entities: {} };
window.__workspaceDiagnostics = Object.freeze({
  snapshot: () => structuredClone(currentWorld),
});

void startRuntime();

async function startRuntime(): Promise<void> {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const host = fragment.get('host');
  const session = fragment.get('session');
  if (!host || !session) return;

  const engine = await QuickJsGuestEngine.createForBrowser({
    memoryLimitBytes: 32 * 1024 * 1024,
    maxStackSizeBytes: 512 * 1024,
    deadlineMs: 25,
    maxDescriptorsPerBatch: 512,
    maxTransferredBytesPerBatch: 2 * 1024 * 1024,
  });
  const guests = new GuestSupervisor((generationToken, source) => engine.prepare(generationToken, source));
  const projector = new ThreeResourceProjector(new THREE.Group(), new MemoryAssetResolver());
  const coordinator = new RuntimeCoordinator(guests, projector);
  const connection = await HostConnection.connect(host, session, coordinator);

  const gateway: EditGateway = {
    async begin(entityId, fields, expectedTransformRevision) {
      const response = await connection.command('edit.begin', { entityId, fields, expectedTransformRevision });
      if (!response.accepted) throw new Error(response.errorCode ?? 'edit_begin_rejected');
      const leaseId = response.payload?.leaseId;
      if (typeof leaseId !== 'string' || leaseId.length === 0) throw new Error('edit_lease_missing');
      return { leaseId };
    },
    async commit(leaseId, transform) {
      const response = await connection.command('edit.commit', { leaseId, transform });
      return { accepted: response.accepted, errorCode: response.errorCode };
    },
    async cancel(leaseId) {
      const response = await connection.command('edit.cancel', { leaseId });
      if (!response.accepted) throw new Error(response.errorCode ?? 'edit_cancel_rejected');
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
        generationToken: `world:${entity.id}`,
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
      syncHandle(handle, entity.transform);
    }
  };

  undoButton.addEventListener('click', () => {
    void (async () => {
      if (pendingCommit) await pendingCommit;
      const response = await connection.command('history.undo');
      if (!response.accepted) throw new Error(response.errorCode ?? 'undo_rejected');
      applyWorld(worldFrom(response));
    })();
  });

  saveButton.addEventListener('click', () => {
    saveStatus.textContent = 'saving';
    void (async () => {
      if (pendingCommit) await pendingCommit;
      const response = await connection.command('workspace.save');
      if (!response.accepted) throw new Error(response.errorCode ?? 'save_rejected');
      applyWorld(worldFrom(response));
      saveStatus.textContent = 'saved';
    })();
  });

  const initial = await connection.command('world.read');
  if (!initial.accepted) throw new Error(initial.errorCode ?? 'world_read_rejected');
  applyWorld(worldFrom(initial));
  appRoot.dataset.runtime = 'connected';
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
  if (!payload || typeof payload.worldRevision !== 'number' || typeof payload.entities !== 'object' || payload.entities === null) {
    throw new Error('world_payload_invalid');
  }
  return payload as unknown as WorldSnapshot;
}
