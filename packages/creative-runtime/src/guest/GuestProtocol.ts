import type { CreativeResourceDescriptor, CreativeResourceUpdate, JsonValue } from '@workspace/creative-sdk';

export interface GuestBudget {
  readonly memoryLimitBytes: number;
  readonly maxStackSizeBytes: number;
  readonly deadlineMs: number;
  readonly maxDescriptorsPerBatch: number;
  readonly maxTransferredBytesPerBatch: number;
}

export interface PreparedGuest {
  readonly generationToken: string;
  readonly initialDescriptors: readonly CreativeResourceDescriptor[];
  readonly checkpointState?: JsonValue;
  tick(monotonicMs: number): CreativeResourceUpdate[];
  dispose(): void;
}

export type PreparedGuestFactory = (
  generationToken: string,
  source: string,
) => Promise<PreparedGuest>;

export interface GuestWorkerPrepareMessage {
  readonly type: 'guest.prepare';
  readonly entityId: string;
  readonly generationToken: string;
  readonly source: string;
}

export interface GuestWorkerActivateMessage {
  readonly type: 'guest.activate';
  readonly entityId: string;
  readonly generationToken: string;
}

export interface GuestWorkerRetireMessage {
  readonly type: 'guest.retire';
  readonly generationToken: string;
}

export interface GuestWorkerTickMessage {
  readonly type: 'guest.tick';
  readonly entityId: string;
  readonly monotonicMs: number;
}

export type GuestWorkerMessage =
  | GuestWorkerPrepareMessage
  | GuestWorkerActivateMessage
  | GuestWorkerRetireMessage
  | GuestWorkerTickMessage;
