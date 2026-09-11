import type { GuestBudget, GuestWorkerMessage } from './GuestProtocol.ts';
import { GuestSupervisor } from './GuestSupervisor.ts';
import { QuickJsGuestEngine } from './QuickJsGuestEngine.ts';

const defaultBudget: GuestBudget = {
  memoryLimitBytes: 16 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
  deadlineMs: 16,
  maxDescriptorsPerBatch: 512,
  maxTransferredBytesPerBatch: 4 * 1024 * 1024,
};

let enginePromise: Promise<QuickJsGuestEngine> | undefined;
let supervisorPromise: Promise<GuestSupervisor> | undefined;

async function supervisor(): Promise<GuestSupervisor> {
  if (!enginePromise) enginePromise = QuickJsGuestEngine.createForBrowser(defaultBudget);
  if (!supervisorPromise) {
    supervisorPromise = enginePromise.then((engine) => new GuestSupervisor((token, source) => engine.prepare(token, source)));
  }
  return supervisorPromise;
}

if (typeof self !== 'undefined' && 'postMessage' in self) {
  self.addEventListener('message', (event: MessageEvent<GuestWorkerMessage>) => {
    void handleMessage(event.data);
  });
}

async function handleMessage(message: GuestWorkerMessage): Promise<void> {
  const guestSupervisor = await supervisor();
  try {
    switch (message.type) {
      case 'guest.prepare': {
        const prepared = await guestSupervisor.prepare(message.entityId, message.generationToken, message.source);
        self.postMessage({ type: 'guest.prepared', entityId: message.entityId, generationToken: message.generationToken, descriptors: prepared.initialDescriptors });
        break;
      }
      case 'guest.activate':
        guestSupervisor.activate(message.entityId, message.generationToken);
        self.postMessage({ type: 'guest.activated', entityId: message.entityId, generationToken: message.generationToken });
        break;
      case 'guest.retire':
        guestSupervisor.retireGeneration(message.generationToken);
        self.postMessage({ type: 'guest.retired', generationToken: message.generationToken });
        break;
      case 'guest.tick':
        self.postMessage({ type: 'guest.updates', entityId: message.entityId, generationToken: guestSupervisor.activeGeneration(message.entityId), updates: guestSupervisor.tick(message.entityId, message.monotonicMs) });
        break;
    }
  } catch (error) {
    self.postMessage({
      type: 'guest.failed',
      generationToken: 'generationToken' in message ? message.generationToken : guestSupervisor.activeGeneration(message.entityId),
      errorCode: error instanceof Error ? error.message : String(error),
    });
  }
}
