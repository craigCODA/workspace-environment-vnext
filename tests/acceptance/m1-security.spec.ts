import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { QuickJsGuestEngine } from '../../packages/creative-runtime/src/guest/QuickJsGuestEngine.ts';
import { startAcceptanceState } from './helpers/start-state.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const guestBudget = {
  memoryLimitBytes: 8 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
  deadlineMs: 100,
  maxDescriptorsPerBatch: 32,
  maxTransferredBytesPerBatch: 256 * 1024,
};

test('A22 forbidden-import fixture rejects Three.js with explicit compatibility evidence', async () => {
  const source = await readFile(path.join(repoRoot, 'examples/world-packages/m1-forbidden-import/index.js'), 'utf8');
  const engine = await QuickJsGuestEngine.createForNodeTests(guestBudget);
  try {
    await expect(engine.prepare('generation:forbidden-import', source)).rejects.toThrow(/module_not_allowed:three/);
  } finally {
    engine.dispose();
  }
});

test('malformed package fixture fails inside the isolated guest preparation path', async () => {
  const source = await readFile(path.join(repoRoot, 'examples/world-packages/m1-malformed/index.js'), 'utf8');
  const engine = await QuickJsGuestEngine.createForNodeTests(guestBudget);
  try {
    await expect(engine.prepare('generation:malformed', source)).rejects.toThrow();
  } finally {
    engine.dispose();
  }
});

test('A31 fake credential process receives health only while generated code enters the guest pipeline', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'workspace-credential-stub-'));
  const sentinel = path.join(temp, 'credential.sentinel');
  const transcript = path.join(temp, 'credential.transcript');
  const stub = spawn(process.execPath, [
    path.join(repoRoot, 'tests/acceptance/fixtures/fake-credential-process.mjs'),
    sentinel,
    transcript,
  ], { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] });

  try {
    await expect.poll(async () => readFile(sentinel, 'utf8').catch(() => '')).toBe('credential-process-alive\n');
    stub.stdin.write('{"type":"health.ping"}\n');
    await expect.poll(async () => readFile(transcript, 'utf8').catch(() => '')).toBe('health.ping\n');

    const engine = await QuickJsGuestEngine.createForNodeTests(guestBudget);
    try {
      const prepared = await engine.prepare('generation:a31', `
        import { line } from '@workspace/creative-sdk';
        line('only-guest', [[0,0,0],[1,0,0]], '#ffffff');
      `);
      expect(prepared.initialDescriptors).toHaveLength(1);
      prepared.dispose();
    } finally {
      engine.dispose();
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await readFile(transcript, 'utf8')).toBe('health.ping\n');
    expect(await readFile(sentinel, 'utf8')).toBe('credential-process-alive\n');
  } finally {
    stub.kill('SIGTERM');
    await rm(temp, { recursive: true, force: true });
  }
});

test('A33 invalid session token is rejected by the host WebSocket boundary', async ({ page }) => {
  const state = await startAcceptanceState();
  try {
    const fragment = new URLSearchParams(new URL(state.appUrl).hash.slice(1));
    const hostUrl = fragment.get('host');
    expect(hostUrl).toBeTruthy();

    const close = await page.evaluate((url) => new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const socket = new WebSocket(url!);
      const timeout = setTimeout(() => reject(new Error('invalid_session_close_timeout')), 5_000);
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'session.hello', token: 'definitely-invalid-token' }));
      });
      socket.addEventListener('close', (event) => {
        clearTimeout(timeout);
        resolve({ code: event.code, reason: event.reason });
      });
      socket.addEventListener('error', () => {
        // The close event carries the policy result.
      });
    }), hostUrl);

    expect(close.code).toBe(1008);
    expect(close.reason).toBe('invalid_session');
  } finally {
    await state.stop();
  }
});

test('A36 guest canvas interaction cannot change capability grants', async ({ page }) => {
  const state = await startAcceptanceState();
  try {
    await page.goto(state.appUrl);
    await expect.poll(async () => (await diagnostics(page)).activeGenerationCount).toBe(1);
    const before = await diagnostics(page);
    expect(before.capabilityGrantCount).toBe(0);

    await page.locator('canvas[data-workspace-renderer]').click({ position: { x: 320, y: 180 } });
    expect((await diagnostics(page)).capabilityGrantCount).toBe(0);
  } finally {
    await state.stop();
  }
});

test('A50 active package asset requests use opaque host handles only', async ({ page }) => {
  const state = await startAcceptanceState();
  try {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(state.appUrl);
    await expect.poll(async () => (await diagnostics(page)).activeGenerationCount).toBe(1);

    const assetRequests = requests.filter((url) => url.includes('/assets/resolve'));
    expect(assetRequests.length).toBeGreaterThan(0);
    expect(assetRequests.every((url) => /handle=asset%3Asha256%3A[0-9a-f]{64}/.test(url))).toBe(true);
    expect(assetRequests.every((url) => !/https%3A|file%3A|\.\.|%5C%5C/i.test(url.split('handle=')[1] ?? ''))).toBe(true);
  } finally {
    await state.stop();
  }
});

interface SecurityDiagnostics {
  readonly activeGenerationCount: number;
  readonly capabilityGrantCount?: number;
}

async function diagnostics(page: Page): Promise<SecurityDiagnostics> {
  return page.evaluate(() => {
    const api = (window as Window & {
      __workspaceDiagnostics?: { snapshot(): SecurityDiagnostics };
    }).__workspaceDiagnostics;
    if (!api) throw new Error('workspace_diagnostics_missing');
    return api.snapshot();
  });
}
