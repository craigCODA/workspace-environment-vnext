import * as THREE from 'three';

export interface EntityRootMetadata {
  readonly entityId: string;
  readonly generationToken: string;
  readonly implementationRevision: number;
  readonly handleKey?: string;
}

export class EntityRootRegistry {
  readonly #metadata = new WeakMap<THREE.Object3D, EntityRootMetadata>();
  readonly #rootsByEntity = new Map<string, THREE.Group>();

  createRoot(metadata: EntityRootMetadata): THREE.Group {
    const existing = this.#rootsByEntity.get(metadata.entityId);
    if (existing) {
      this.#metadata.set(existing, metadata);
      return existing;
    }
    const root = new THREE.Group();
    root.name = `workspace-root:${metadata.entityId}`;
    this.#metadata.set(root, metadata);
    this.#rootsByEntity.set(metadata.entityId, root);
    return root;
  }

  rootForEntity(entityId: string): THREE.Group | undefined {
    return this.#rootsByEntity.get(entityId);
  }

  metadataFor(object: THREE.Object3D): EntityRootMetadata | undefined {
    let cursor: THREE.Object3D | null = object;
    while (cursor) {
      const metadata = this.#metadata.get(cursor);
      if (metadata) return metadata;
      cursor = cursor.parent;
    }
    return undefined;
  }

  retireGeneration(generationToken: string): void {
    for (const [entityId, root] of this.#rootsByEntity) {
      const metadata = this.#metadata.get(root);
      if (metadata?.generationToken !== generationToken) continue;
      root.removeFromParent();
      this.#rootsByEntity.delete(entityId);
    }
  }
}
