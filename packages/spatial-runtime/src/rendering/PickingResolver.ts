import type * as THREE from 'three';
import { EntityRootRegistry } from './EntityRootRegistry.ts';

export interface SemanticPick {
  readonly entityId: string;
  readonly handleKey?: string;
  readonly generationToken: string;
  readonly implementationRevision: number;
}

export class PickingResolver {
  readonly roots: EntityRootRegistry;

  constructor(roots: EntityRootRegistry) {
    this.roots = roots;
  }

  resolve(object: THREE.Object3D): SemanticPick | undefined {
    const metadata = this.roots.metadataFor(object);
    if (!metadata) return undefined;
    return {
      entityId: metadata.entityId,
      ...(metadata.handleKey === undefined ? {} : { handleKey: metadata.handleKey }),
      generationToken: metadata.generationToken,
      implementationRevision: metadata.implementationRevision,
    };
  }
}
