import type * as THREE from 'three';
import { EntityRootRegistry } from './EntityRootRegistry.ts';

export interface SemanticPick {
  readonly entityId: string;
  readonly handleKey?: string;
  readonly generationToken: string;
  readonly implementationRevision: number;
}

export interface MissingHandlePick {
  readonly error: 'missing_handle';
  readonly entityId: string;
  readonly handleKey: string;
  readonly implementationRevision: number;
}

export class PickingResolver {
  readonly roots: EntityRootRegistry;

  constructor(roots: EntityRootRegistry) {
    this.roots = roots;
  }

  resolve(object: THREE.Object3D): SemanticPick | MissingHandlePick | undefined {
    const metadata = this.roots.metadataFor(object);
    if (!metadata) return undefined;
    if (metadata.handleKey !== undefined && !this.roots.isCurrentHandle(object, metadata)) {
      const current = this.roots.rootMetadata(metadata.entityId);
      return {
        error: 'missing_handle',
        entityId: metadata.entityId,
        handleKey: metadata.handleKey,
        implementationRevision: current?.implementationRevision ?? metadata.implementationRevision,
      };
    }
    return {
      entityId: metadata.entityId,
      ...(metadata.handleKey === undefined ? {} : { handleKey: metadata.handleKey }),
      generationToken: metadata.generationToken,
      implementationRevision: metadata.implementationRevision,
    };
  }
}
