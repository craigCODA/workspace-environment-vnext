import * as THREE from 'three';
import type { EntityRootRegistry } from '@workspace/spatial-runtime';

export interface TransformContract {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface CommandResult {
  readonly accepted: boolean;
  readonly errorCode?: string | null;
}

export interface EditGateway {
  begin(entityId: string, fields: readonly string[], expectedTransformRevision: number): Promise<{ leaseId: string }>;
  commit(leaseId: string, transform: TransformContract): Promise<CommandResult>;
  cancel(leaseId: string): Promise<void>;
}

interface AcceptedTransform {
  transform: TransformContract;
  revision: number;
}

interface ActiveEdit {
  readonly leaseId: string;
  readonly accepted: TransformContract;
}

export class InteractionController {
  readonly #roots: EntityRootRegistry;
  readonly #gateway: EditGateway;
  readonly #accepted = new Map<string, AcceptedTransform>();
  readonly #active = new Map<string, ActiveEdit>();
  readonly #anchorHandles = new Map<string, THREE.Mesh>();

  constructor(roots: EntityRootRegistry, gateway: EditGateway) {
    this.#roots = roots;
    this.#gateway = gateway;
  }

  acceptHostTransform(entityId: string, transform: TransformContract, revision: number): void {
    const accepted = cloneTransform(transform);
    this.#accepted.set(entityId, { transform: accepted, revision });
    const active = this.#active.get(entityId);
    if (active) {
      this.#active.set(entityId, { leaseId: active.leaseId, accepted });
      return;
    }
    this.#apply(entityId, transform);
  }

  async beginTransform(entityId: string): Promise<void> {
    if (this.#active.has(entityId)) throw new Error('edit_already_active');
    const accepted = this.#accepted.get(entityId);
    if (!accepted) throw new Error('accepted_transform_missing');
    const lease = await this.#gateway.begin(entityId, ['transform'], accepted.revision);
    this.#active.set(entityId, { leaseId: lease.leaseId, accepted: cloneTransform(accepted.transform) });
  }

  previewTransform(entityId: string, transform: TransformContract): void {
    if (!this.#active.has(entityId)) throw new Error('edit_not_active');
    this.#apply(entityId, transform);
  }

  async commitTransform(entityId: string): Promise<CommandResult> {
    const edit = this.#active.get(entityId);
    if (!edit) throw new Error('edit_not_active');
    const transform = this.#capture(entityId);
    const result = await this.#gateway.commit(edit.leaseId, transform);
    this.#active.delete(entityId);
    if (result.accepted) {
      const previous = this.#accepted.get(entityId);
      this.#accepted.set(entityId, { transform: cloneTransform(transform), revision: previous?.revision ?? 0 });
    } else {
      this.#apply(entityId, edit.accepted);
    }
    return result;
  }

  async cancelTransform(entityId: string): Promise<void> {
    const edit = this.#active.get(entityId);
    if (!edit) return;
    this.#apply(entityId, edit.accepted);
    this.#active.delete(entityId);
    await this.#gateway.cancel(edit.leaseId);
  }

  createAnchorHandle(entityId: string, displayRadius = 0.08): THREE.Mesh {
    const root = this.#roots.rootForEntity(entityId);
    if (!root) throw new Error('entity_root_missing');
    let handle = this.#anchorHandles.get(entityId);
    if (!handle) {
      handle = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x66ccff, wireframe: true }),
      );
      handle.name = `workspace-anchor-handle:${entityId}`;
      root.add(handle);
      this.#anchorHandles.set(entityId, handle);
      this.#roots.registerHandle(entityId, 'anchor.position', handle);
    }
    this.#setAnchorRadius(handle, displayRadius);
    return handle;
  }

  setAnchorDisplayRadius(entityId: string, displayRadius: number): void {
    const handle = this.#anchorHandles.get(entityId);
    if (!handle) throw new Error('anchor_handle_missing');
    this.#setAnchorRadius(handle, displayRadius);
  }

  async cancelAll(): Promise<void> {
    for (const entityId of [...this.#active.keys()]) await this.cancelTransform(entityId);
  }

  #setAnchorRadius(handle: THREE.Mesh, displayRadius: number): void {
    handle.scale.setScalar(displayRadius);
  }

  #apply(entityId: string, transform: TransformContract): void {
    const root = this.#roots.rootForEntity(entityId);
    if (!root) throw new Error('entity_root_missing');
    root.position.set(...transform.position);
    root.quaternion.set(...transform.rotation);
    root.scale.set(...transform.scale);
  }

  #capture(entityId: string): TransformContract {
    const root = this.#roots.rootForEntity(entityId);
    if (!root) throw new Error('entity_root_missing');
    return {
      position: [root.position.x, root.position.y, root.position.z],
      rotation: [root.quaternion.x, root.quaternion.y, root.quaternion.z, root.quaternion.w],
      scale: [root.scale.x, root.scale.y, root.scale.z],
    };
  }
}

function cloneTransform(transform: TransformContract): TransformContract {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale],
  };
}
