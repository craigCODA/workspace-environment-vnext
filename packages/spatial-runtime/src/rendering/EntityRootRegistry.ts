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
  readonly #handlesByEntity = new Map<string, Map<string, THREE.Object3D>>();
  readonly #parentByEntity = new Map<string, string>();

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

  rootMetadata(entityId: string): EntityRootMetadata | undefined {
    const root = this.#rootsByEntity.get(entityId);
    return root ? this.#metadata.get(root) : undefined;
  }

  setParent(entityId: string, parentId: string | null, scene: THREE.Object3D): void {
    const root = this.#rootsByEntity.get(entityId);
    if (!root) throw new Error('entity_root_missing');
    if (parentId === entityId) throw new Error('hierarchy_cycle');

    if (parentId === null) {
      this.#parentByEntity.delete(entityId);
      scene.add(root);
      return;
    }

    const parent = this.#rootsByEntity.get(parentId);
    if (!parent) throw new Error('parent_root_missing');
    let cursor: string | undefined = parentId;
    while (cursor !== undefined) {
      if (cursor === entityId) throw new Error('hierarchy_cycle');
      cursor = this.#parentByEntity.get(cursor);
    }

    this.#parentByEntity.set(entityId, parentId);
    parent.add(root);
  }

  parentIdFor(entityId: string): string | undefined {
    return this.#parentByEntity.get(entityId);
  }

  registerHandle(entityId: string, handleKey: string, object: THREE.Object3D): void {
    if (!handleKey) throw new Error('handle_key_required');
    const rootMetadata = this.rootMetadata(entityId);
    if (!rootMetadata) throw new Error('entity_root_missing');
    const metadata: EntityRootMetadata = { ...rootMetadata, handleKey };
    this.#metadata.set(object, metadata);
    let handles = this.#handlesByEntity.get(entityId);
    if (!handles) {
      handles = new Map();
      this.#handlesByEntity.set(entityId, handles);
    }
    handles.set(handleKey, object);
  }

  isCurrentHandle(object: THREE.Object3D, metadata: EntityRootMetadata): boolean {
    if (metadata.handleKey === undefined) return true;
    const currentRoot = this.rootMetadata(metadata.entityId);
    if (!currentRoot) return false;
    return currentRoot.generationToken === metadata.generationToken
      && currentRoot.implementationRevision === metadata.implementationRevision
      && this.#handlesByEntity.get(metadata.entityId)?.get(metadata.handleKey) === object;
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
      this.#handlesByEntity.delete(entityId);
      this.#parentByEntity.delete(entityId);
      for (const [childId, parentId] of this.#parentByEntity) {
        if (parentId === entityId) this.#parentByEntity.delete(childId);
      }
    }
  }
}
