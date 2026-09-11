export interface ResourceRegistrySnapshot {
  readonly generations: number;
  readonly resources: number;
}

export class ResourceRegistry<T> {
  readonly #byGeneration = new Map<string, Map<string, T>>();
  readonly #dispose?: (resource: T) => void;

  constructor(dispose?: (resource: T) => void) {
    this.#dispose = dispose;
  }

  set(generationToken: string, id: string, value: T): void {
    let resources = this.#byGeneration.get(generationToken);
    if (!resources) {
      resources = new Map();
      this.#byGeneration.set(generationToken, resources);
    }
    const previous = resources.get(id);
    if (previous !== undefined && this.#dispose) this.#dispose(previous);
    resources.set(id, value);
  }

  get(generationToken: string, id: string): T | undefined {
    return this.#byGeneration.get(generationToken)?.get(id);
  }

  entriesForGeneration(generationToken: string): readonly [string, T][] {
    return [...(this.#byGeneration.get(generationToken)?.entries() ?? [])];
  }

  delete(generationToken: string, id: string): void {
    const resources = this.#byGeneration.get(generationToken);
    const value = resources?.get(id);
    if (value !== undefined && this.#dispose) this.#dispose(value);
    resources?.delete(id);
    if (resources?.size === 0) this.#byGeneration.delete(generationToken);
  }

  retireGeneration(generationToken: string): void {
    const resources = this.#byGeneration.get(generationToken);
    if (!resources) return;
    if (this.#dispose) for (const resource of resources.values()) this.#dispose(resource);
    this.#byGeneration.delete(generationToken);
  }

  snapshotCounts(): ResourceRegistrySnapshot {
    let resources = 0;
    for (const generation of this.#byGeneration.values()) resources += generation.size;
    return { generations: this.#byGeneration.size, resources };
  }
}
