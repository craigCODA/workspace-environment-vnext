import type { CreativeResourceUpdate } from '@workspace/creative-sdk';
import type { PreparedGuest, PreparedGuestFactory } from './GuestProtocol.ts';

interface Candidate {
  readonly entityId: string;
  readonly guest: PreparedGuest;
}

export class GuestSupervisor {
  readonly #factory: PreparedGuestFactory;
  readonly #candidates = new Map<string, Candidate>();
  readonly #activeByEntity = new Map<string, string>();

  constructor(factory: PreparedGuestFactory) {
    this.#factory = factory;
  }

  async prepare(entityId: string, generationToken: string, source: string): Promise<PreparedGuest> {
    const previous = this.#candidates.get(generationToken);
    previous?.guest.dispose();
    const guest = await this.#factory(generationToken, source);
    this.#candidates.set(generationToken, { entityId, guest });
    return guest;
  }

  activate(entityId: string, generationToken: string): void {
    const candidate = this.#candidates.get(generationToken);
    if (!candidate || candidate.entityId !== entityId) throw new Error('candidate_generation_not_found');
    this.#activeByEntity.set(entityId, generationToken);
  }

  activeGeneration(entityId: string): string | undefined {
    return this.#activeByEntity.get(entityId);
  }

  tick(entityId: string, monotonicMs: number): CreativeResourceUpdate[] {
    const token = this.#activeByEntity.get(entityId);
    if (!token) return [];
    const candidate = this.#candidates.get(token);
    if (!candidate || candidate.entityId !== entityId) return [];
    return candidate.guest.tick(monotonicMs);
  }

  acceptUpdate(
    entityId: string,
    generationToken: string,
    update: CreativeResourceUpdate,
  ): CreativeResourceUpdate[] {
    if (this.#activeByEntity.get(entityId) !== generationToken) return [];
    const candidate = this.#candidates.get(generationToken);
    if (!candidate || candidate.entityId !== entityId) return [];
    return [structuredClone(update)];
  }

  retireGeneration(generationToken: string): void {
    const candidate = this.#candidates.get(generationToken);
    if (!candidate) return;
    candidate.guest.dispose();
    this.#candidates.delete(generationToken);
    if (this.#activeByEntity.get(candidate.entityId) === generationToken) {
      this.#activeByEntity.delete(candidate.entityId);
    }
  }

  preparedGuest(generationToken: string): PreparedGuest | undefined {
    return this.#candidates.get(generationToken)?.guest;
  }

  aliveCount(): number {
    return this.#candidates.size;
  }

  dispose(): void {
    for (const candidate of this.#candidates.values()) candidate.guest.dispose();
    this.#candidates.clear();
    this.#activeByEntity.clear();
  }
}
