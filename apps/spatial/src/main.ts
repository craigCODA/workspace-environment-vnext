import * as THREE from 'three';
import { GuestSupervisor, QuickJsGuestEngine } from '@workspace/creative-runtime';
import { MemoryAssetResolver, ThreeResourceProjector } from '@workspace/spatial-runtime';
import { HostConnection } from './host/HostConnection.ts';
import { RuntimeCoordinator } from './runtime/RuntimeCoordinator.ts';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('app_root_missing');
const appRoot = app;
appRoot.textContent = 'Workspace Environment vNext';

void startRuntime();

async function startRuntime(): Promise<void> {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const host = fragment.get('host');
  const session = fragment.get('session');
  if (!host || !session) return;

  const engine = await QuickJsGuestEngine.createForBrowser({
    memoryLimitBytes: 32 * 1024 * 1024,
    maxStackSizeBytes: 512 * 1024,
    deadlineMs: 25,
    maxDescriptorsPerBatch: 512,
    maxTransferredBytesPerBatch: 2 * 1024 * 1024,
  });
  const guests = new GuestSupervisor((generationToken, source) => engine.prepare(generationToken, source));
  const projector = new ThreeResourceProjector(new THREE.Group(), new MemoryAssetResolver());
  const coordinator = new RuntimeCoordinator(guests, projector);
  await HostConnection.connect(host, session, coordinator);
  appRoot.dataset.runtime = 'connected';
}
