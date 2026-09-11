import type { VNextEnvelope } from '@workspace/vnext-contracts';
import type { GuestSupervisor } from '@workspace/creative-runtime';
import type { ThreeResourceProjector } from '@workspace/spatial-runtime';

interface CandidateState {
  readonly candidateId: string;
  readonly entityId: string;
  readonly generationToken: string;
}

export class RuntimeCoordinator {
  readonly #guests: GuestSupervisor;
  readonly #projector: ThreeResourceProjector;
  readonly #candidates = new Map<string, CandidateState>();
  readonly #activeByEntity = new Map<string, string>();

  constructor(guests: GuestSupervisor, projector: ThreeResourceProjector) {
    this.#guests = guests;
    this.#projector = projector;
  }

  async prepare(message: VNextEnvelope): Promise<VNextEnvelope> {
    const candidateId = requiredString(message, 'candidateId');
    const generationToken = requiredString(message, 'generationToken');
    if (message.type !== 'runtime.prepare') return failed(candidateId, generationToken, 'runtime_message_type_invalid');

    const entityId = requiredString(message, 'entityId');
    const source = requiredString(message, 'source');
    try {
      const guest = await this.#guests.prepare(entityId, generationToken, source);
      await this.#projector.stageBatch({ entityId, generationToken }, guest.initialDescriptors);
      this.#candidates.set(generationToken, { candidateId, entityId, generationToken });
      return {
        type: 'runtime.prepared',
        protocolVersion: 1,
        candidateId,
        generationToken,
      };
    } catch (error) {
      this.#retireGeneration(generationToken);
      return failed(candidateId, generationToken, errorCode(error));
    }
  }

  activate(message: VNextEnvelope): void {
    if (message.type !== 'runtime.activate') throw new Error('runtime_message_type_invalid');
    const entityId = requiredString(message, 'entityId');
    const generationToken = requiredString(message, 'generationToken');
    const candidate = this.#candidates.get(generationToken);
    if (!candidate || candidate.entityId !== entityId) throw new Error('candidate_generation_not_found');

    this.#guests.activate(entityId, generationToken);
    const previous = this.#projector.activateGeneration({ entityId, generationToken });
    this.#activeByEntity.set(entityId, generationToken);
    if (previous && previous !== generationToken) this.#retireGeneration(previous);
  }

  retire(message: VNextEnvelope): void {
    if (message.type !== 'runtime.retire') throw new Error('runtime_message_type_invalid');
    this.#retireGeneration(requiredString(message, 'generationToken'));
  }

  activeGeneration(entityId: string): string | undefined {
    return this.#activeByEntity.get(entityId);
  }

  #retireGeneration(generationToken: string): void {
    const candidate = this.#candidates.get(generationToken);
    this.#guests.retireGeneration(generationToken);
    this.#projector.retireGeneration(generationToken);
    this.#candidates.delete(generationToken);
    if (candidate && this.#activeByEntity.get(candidate.entityId) === generationToken) {
      this.#activeByEntity.delete(candidate.entityId);
    }
  }
}

function requiredString(message: VNextEnvelope, key: keyof VNextEnvelope): string {
  const value = message[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`runtime_${String(key)}_required`);
  return value;
}

function failed(candidateId: string, generationToken: string, code: string): VNextEnvelope {
  return {
    type: 'runtime.failed',
    protocolVersion: 1,
    candidateId,
    generationToken,
    errorCode: code,
  };
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error) || !error.message) return 'runtime_prepare_failed';
  return error.message.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 160);
}
