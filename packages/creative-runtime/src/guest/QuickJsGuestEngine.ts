import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import nodeVariant from '@jitl/quickjs-singlefile-mjs-release-sync';
import type { CreativeResourceDescriptor, CreativeResourceUpdate, JsonValue } from '@workspace/creative-sdk';
import { validateDescriptor } from '@workspace/spatial-runtime';
import type { GuestBudget, PreparedGuest } from './GuestProtocol.ts';
import { CREATIVE_SDK_MODULE_SOURCE } from './sdk-module-source.ts';

type QuickJsModule = Awaited<ReturnType<typeof newQuickJSWASMModuleFromVariant>>;
type RuntimeLike = ReturnType<QuickJsModule['newRuntime']>;
type ContextLike = ReturnType<RuntimeLike['newContext']>;
type HandleLike = ReturnType<ContextLike['getProp']>;

interface EmissionState {
  descriptors: CreativeResourceDescriptor[];
  updates: CreativeResourceUpdate[];
  checkpointState?: JsonValue;
  count: number;
  bytes: number;
  phase: 'prepare' | 'tick';
}

export class QuickJsGuestEngine {
  readonly #module: QuickJsModule;
  readonly #budget: GuestBudget;
  readonly #guests = new Set<PreparedQuickJsGuest>();
  #disposed = false;

  private constructor(module: QuickJsModule, budget: GuestBudget) {
    this.#module = module;
    this.#budget = budget;
  }

  static async createForNodeTests(budget: GuestBudget): Promise<QuickJsGuestEngine> {
    const module = await newQuickJSWASMModuleFromVariant(nodeVariant);
    return new QuickJsGuestEngine(module, budget);
  }

  static async createForBrowser(budget: GuestBudget): Promise<QuickJsGuestEngine> {
    const imported = await import('@jitl/quickjs-singlefile-browser-release-sync');
    const module = await newQuickJSWASMModuleFromVariant(imported.default);
    return new QuickJsGuestEngine(module, budget);
  }

  async evaluateProbe(source: string): Promise<unknown> {
    this.#assertOpen();
    const { runtime, context, interrupted } = this.#newVm();
    try {
      interrupted.reset();
      const result = context.evalCode(source, 'probe.js');
      const handle = unwrap(context, result, interrupted.wasInterrupted);
      try {
        return structuredClone(context.dump(handle));
      } finally {
        handle.dispose();
      }
    } finally {
      context.dispose();
      runtime.dispose();
    }
  }

  async prepare(generationToken: string, source: string): Promise<PreparedGuest> {
    this.#assertOpen();
    if (!generationToken) throw new Error('generation_token_required');

    const { runtime, context, interrupted } = this.#newVm();
    const state: EmissionState = {
      descriptors: [],
      updates: [],
      count: 0,
      bytes: 0,
      phase: 'prepare',
    };

    const hostHandles = this.#installHostBridge(context, state);
    runtime.setModuleLoader((moduleName: string) => {
      if (moduleName !== '@workspace/creative-sdk') {
        throw new Error(`module_not_allowed:${moduleName}`);
      }
      return CREATIVE_SDK_MODULE_SOURCE;
    });

    let moduleHandle: HandleLike | undefined;
    let onTickHandle: HandleLike | undefined;
    try {
      interrupted.reset();
      const result = context.evalCode(source, 'guest-package.js', { type: 'module' });
      moduleHandle = unwrap(context, result, interrupted.wasInterrupted) as HandleLike;

      const candidateOnTick = context.getProp(moduleHandle, 'onTick');
      if (context.typeof(candidateOnTick) === 'function') {
        onTickHandle = candidateOnTick;
      } else {
        candidateOnTick.dispose();
      }

      const prepared = new PreparedQuickJsGuest(
        generationToken,
        runtime,
        context,
        moduleHandle,
        onTickHandle,
        hostHandles,
        state,
        this.#budget,
        interrupted,
        () => this.#guests.delete(prepared),
      );
      this.#guests.add(prepared);
      return prepared;
    } catch (error) {
      onTickHandle?.dispose();
      moduleHandle?.dispose();
      for (const handle of hostHandles) handle.dispose();
      context.dispose();
      runtime.dispose();
      throw normalizeGuestError(error, interrupted.wasInterrupted());
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    for (const guest of [...this.#guests]) guest.dispose();
    this.#guests.clear();
    this.#module.dispose();
    this.#disposed = true;
  }

  #assertOpen(): void {
    if (this.#disposed) throw new Error('guest_engine_disposed');
  }

  #newVm(): {
    runtime: RuntimeLike;
    context: ContextLike;
    interrupted: { reset(): void; wasInterrupted(): boolean };
  } {
    const runtime = this.#module.newRuntime();
    runtime.setMemoryLimit(this.#budget.memoryLimitBytes);
    runtime.setMaxStackSize(this.#budget.maxStackSizeBytes);

    let deadline = 0;
    let didInterrupt = false;
    const reset = () => {
      didInterrupt = false;
      deadline = performance.now() + this.#budget.deadlineMs;
    };
    runtime.setInterruptHandler(() => {
      if (performance.now() <= deadline) return false;
      didInterrupt = true;
      return true;
    });

    const context = runtime.newContext();
    return {
      runtime,
      context,
      interrupted: {
        reset,
        wasInterrupted: () => didInterrupt,
      },
    };
  }

  #installHostBridge(context: ContextLike, state: EmissionState): HandleLike[] {
    const emitDescriptor = context.newFunction('__workspace_emitDescriptor', (valueHandle) => {
      if (state.phase !== 'prepare') throw new Error('descriptor_emission_not_allowed_on_tick');
      const value = structuredClone(context.dump(valueHandle));
      const validation = validateDescriptor(value);
      if (!validation.ok || validation.value?.kind === 'update') throw new Error('invalid_guest_descriptor');
      consumeBudget(state, validation.value, this.#budget);
      state.descriptors.push(structuredClone(validation.value));
    });

    const emitUpdate = context.newFunction('__workspace_emitUpdate', (valueHandle) => {
      if (state.phase !== 'tick') throw new Error('update_emission_not_allowed_during_prepare');
      const value = structuredClone(context.dump(valueHandle));
      const validation = validateDescriptor(value);
      if (!validation.ok || validation.value?.kind !== 'update') throw new Error('invalid_guest_update');
      consumeBudget(state, validation.value, this.#budget);
      state.updates.push(structuredClone(validation.value));
    });

    const checkpoint = context.newFunction('__workspace_checkpointState', (valueHandle) => {
      const value = structuredClone(context.dump(valueHandle)) as JsonValue;
      const bytes = byteLength(value);
      if (bytes > this.#budget.maxTransferredBytesPerBatch) throw new Error('guest_output_budget_exceeded');
      state.checkpointState = value;
    });

    context.setProp(context.global, '__workspace_emitDescriptor', emitDescriptor);
    context.setProp(context.global, '__workspace_emitUpdate', emitUpdate);
    context.setProp(context.global, '__workspace_checkpointState', checkpoint);

    return [emitDescriptor, emitUpdate, checkpoint] as HandleLike[];
  }
}

class PreparedQuickJsGuest implements PreparedGuest {
  readonly generationToken: string;
  readonly initialDescriptors: readonly CreativeResourceDescriptor[];
  readonly #runtime: RuntimeLike;
  readonly #context: ContextLike;
  readonly #moduleHandle: HandleLike;
  readonly #onTickHandle?: HandleLike;
  readonly #hostHandles: readonly HandleLike[];
  readonly #state: EmissionState;
  readonly #budget: GuestBudget;
  readonly #interrupted: { reset(): void; wasInterrupted(): boolean };
  readonly #onDispose: () => void;
  #disposed = false;

  constructor(
    generationToken: string,
    runtime: RuntimeLike,
    context: ContextLike,
    moduleHandle: HandleLike,
    onTickHandle: HandleLike | undefined,
    hostHandles: readonly HandleLike[],
    state: EmissionState,
    budget: GuestBudget,
    interrupted: { reset(): void; wasInterrupted(): boolean },
    onDispose: () => void,
  ) {
    this.generationToken = generationToken;
    this.#runtime = runtime;
    this.#context = context;
    this.#moduleHandle = moduleHandle;
    this.#onTickHandle = onTickHandle;
    this.#hostHandles = hostHandles;
    this.#state = state;
    this.#budget = budget;
    this.#interrupted = interrupted;
    this.#onDispose = onDispose;
    this.initialDescriptors = structuredClone(state.descriptors);
  }

  get checkpointState(): JsonValue | undefined {
    return this.#state.checkpointState === undefined ? undefined : structuredClone(this.#state.checkpointState);
  }

  tick(monotonicMs: number): CreativeResourceUpdate[] {
    if (this.#disposed) throw new Error('guest_disposed');
    if (!Number.isFinite(monotonicMs) || monotonicMs < 0) throw new Error('invalid_monotonic_tick');
    if (!this.#onTickHandle) return [];

    this.#state.phase = 'tick';
    this.#state.updates = [];
    this.#state.count = 0;
    this.#state.bytes = 0;
    this.#interrupted.reset();

    const tickHandle = this.#context.newNumber(monotonicMs);
    try {
      const result = this.#context.callFunction(this.#onTickHandle, this.#context.global, tickHandle);
      const resultHandle = unwrap(this.#context, result, this.#interrupted.wasInterrupted) as HandleLike;
      resultHandle.dispose();
      return structuredClone(this.#state.updates);
    } catch (error) {
      throw normalizeGuestError(error, this.#interrupted.wasInterrupted());
    } finally {
      tickHandle.dispose();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#onTickHandle?.dispose();
    this.#moduleHandle.dispose();
    for (const handle of this.#hostHandles) handle.dispose();
    this.#context.dispose();
    this.#runtime.dispose();
    this.#onDispose();
  }
}

function consumeBudget(
  state: EmissionState,
  value: CreativeResourceDescriptor | CreativeResourceUpdate,
  budget: GuestBudget,
): void {
  state.count += 1;
  state.bytes += byteLength(value);
  if (state.count > budget.maxDescriptorsPerBatch || state.bytes > budget.maxTransferredBytesPerBatch) {
    throw new Error('guest_output_budget_exceeded');
  }
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function unwrap(context: ContextLike, result: ReturnType<ContextLike['evalCode']>, wasInterrupted: () => boolean): HandleLike {
  try {
    return context.unwrapResult(result) as HandleLike;
  } catch (error) {
    throw normalizeGuestError(error, wasInterrupted());
  }
}

function normalizeGuestError(error: unknown, interrupted: boolean): Error {
  if (interrupted) return new Error('guest_interrupted');
  const message = error instanceof Error ? error.message : String(error);
  const moduleMatch = message.match(/module_not_allowed:[^\s'";,)]+/);
  if (moduleMatch) return new Error(moduleMatch[0]);
  if (message.includes('guest_output_budget_exceeded')) return new Error('guest_output_budget_exceeded');
  if (message.includes('interrupted')) return new Error('guest_interrupted');
  return new Error(message);
}
