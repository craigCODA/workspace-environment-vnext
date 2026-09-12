import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startAcceptanceState, type AcceptanceState } from './helpers/start-state.ts';

const initialPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

type Pose = typeof initialPose;

interface DiagnosticsSnapshot {
  readonly entities: Record<string, { transform: Pose }>;
  readonly activePackageRevisions?: Record<string, string>;
  readonly projectedKinds?: readonly string[];
  readonly activePackageEntityId?: string | null;
  readonly packagesPaused?: boolean;
  readonly capabilityGrantCount?: number;
  readonly rendererStatus?: string;
  readonly activeLeaseCount?: number;
  readonly activeGenerationCount?: number;
  readonly resourceCounts?: {
    readonly generations: number;
    readonly resources: number;
    readonly stagedGroups: number;
    readonly activeEntities: number;
  };
}

let state: AcceptanceState;

test.beforeAll(async () => {
  state = await startAcceptanceState();
});

test.afterAll(async () => {
  await state?.stop();
});

test('A23 ordinary editing is model independent', async ({ page }) => {
  await page.goto(state.appUrl);
  await expect(page.getByTestId('agent-network-calls')).toHaveText('0');

  await dragEntity(page, 'entity:box', { x: 120, y: 0 });
  await expect.poll(async () => (await entityPose(page, 'entity:box'))?.position[0]).not.toBe(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expectEntityPose(page, 'entity:box', initialPose);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('saved');
  await page.reload();

  await expectEntityPose(page, 'entity:box', initialPose);
  await expect(page.getByTestId('agent-network-calls')).toHaveText('0');
});

test('A52 save during an unfinished drag recovers accepted state without a zombie lease', async ({ page, context }) => {
  await page.goto(state.appUrl);

  await dragEntity(page, 'entity:box', { x: 90, y: 0 });
  await expect.poll(async () => (await entityPose(page, 'entity:box'))?.position[0]).not.toBe(0);
  const committedPose = await requireEntityPose(page, 'entity:box');

  await beginDragWithoutRelease(page, 'entity:box', { x: 140, y: -40 });
  await expect.poll(async () => activeLeaseCount(page)).toBe(1);

  await page.getByRole('button', { name: 'Save' }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByTestId('save-status')).toHaveText('saved');
  await page.close();

  const reopened = await reopenWorkspace(context);
  await expectEntityPose(reopened, 'entity:box', committedPose);
  await expect.poll(async () => activeLeaseCount(reopened)).toBe(0);

  await reopened.getByRole('button', { name: 'Undo' }).click();
  await expectEntityPose(reopened, 'entity:box', initialPose);
  await expect(reopened.getByTestId('agent-network-calls')).toHaveText('0');
});


test('A47 breadth package projects all M1 descriptor families and reconstructs on reload', async ({ page }) => {
  const webglErrors: string[] = [];
  const startupErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') startupErrors.push(`console:${message.text()}`);
    if (message.type() === 'error' && /webgl/i.test(message.text())) webglErrors.push(message.text());
  });
  page.on('pageerror', (error) => startupErrors.push(`pageerror:${error.message}`));
  page.on('requestfailed', (request) => startupErrors.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`));

  await page.goto(state.appUrl);
  await expect(page.locator('canvas[data-workspace-renderer]')).toBeVisible();
  await page.waitForTimeout(1500);
  const startup = await diagnosticSnapshot(page);
  if (startup.activeGenerationCount !== 1) {
    const runtime = await page.locator('#app').getAttribute('data-runtime');
    throw new Error(`task11_startup_failed:${JSON.stringify({ runtime, startup, startupErrors })}`);
  }

  const before = await diagnosticSnapshot(page);
  expect(before.activePackageEntityId).toBe('entity:box');
  expect(before.activePackageRevisions?.['entity:box']).toMatch(/^[0-9a-f]{64}$/);
  expect([...(before.projectedKinds ?? [])].sort()).toEqual([
    'curve', 'indexedGeometry', 'instanced', 'light', 'points', 'shaderMaterial', 'texture',
  ]);
  expect(before.rendererStatus).toBe('ready');
  expect(webglErrors).toEqual([]);

  const revision = before.activePackageRevisions?.['entity:box'];
  await page.reload();
  await expect.poll(async () => (await diagnosticSnapshot(page)).activeGenerationCount).toBe(1);
  const after = await diagnosticSnapshot(page);
  expect(after.activePackageEntityId).toBe('entity:box');
  expect(after.activePackageRevisions?.['entity:box']).toBe(revision);
  expect([...(after.projectedKinds ?? [])].sort()).toEqual([
    'curve', 'indexedGeometry', 'instanced', 'light', 'points', 'shaderMaterial', 'texture',
  ]);
  expect(webglErrors).toEqual([]);
});

test('Task10 diagnostics are deterministic and read only', async ({ page }) => {
  await page.goto(state.appUrl);
  await expect.poll(async () => (await diagnosticSnapshot(page)).activeGenerationCount).toBe(1);

  const snapshot = await diagnosticSnapshot(page);
  expect(snapshot.activeLeaseCount).toBe(0);
  expect(snapshot.activeGenerationCount).toBe(1);
  expect(snapshot.resourceCounts).toEqual({
    generations: 1,
    resources: 8,
    stagedGroups: 1,
    activeEntities: 1,
  });

  const diagnosticKeys = await page.evaluate(() => Object.keys((window as Window & {
    __workspaceDiagnostics?: object;
  }).__workspaceDiagnostics ?? {}).sort());
  expect(diagnosticKeys).toEqual(['snapshot']);
});

async function dragEntity(page: Page, entityId: string, delta: { x: number; y: number }): Promise<void> {
  const handle = page.locator(`[data-entity-id="${entityId}"]`);
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('entity_handle_has_no_bounds');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta.x, y + delta.y, { steps: 6 });
  await page.mouse.up();
}

async function beginDragWithoutRelease(page: Page, entityId: string, delta: { x: number; y: number }): Promise<void> {
  const handle = page.locator(`[data-entity-id="${entityId}"]`);
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('entity_handle_has_no_bounds');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta.x, y + delta.y, { steps: 6 });
}

async function reopenWorkspace(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(state.appUrl);
  await expect(page.getByTestId('agent-network-calls')).toHaveText('0');
  return page;
}

async function expectEntityPose(page: Page, entityId: string, expected: Pose): Promise<void> {
  await expect.poll(async () => entityPose(page, entityId)).toEqual(expected);
}

async function requireEntityPose(page: Page, entityId: string): Promise<Pose> {
  const pose = await entityPose(page, entityId);
  if (!pose) throw new Error(`entity_pose_missing:${entityId}`);
  return pose;
}

async function entityPose(page: Page, entityId: string): Promise<Pose | undefined> {
  const snapshot = await diagnosticSnapshot(page);
  return snapshot.entities[entityId]?.transform;
}

async function activeLeaseCount(page: Page): Promise<number | undefined> {
  return (await diagnosticSnapshot(page)).activeLeaseCount;
}

async function diagnosticSnapshot(page: Page): Promise<DiagnosticsSnapshot> {
  return page.evaluate(() => {
    const diagnostics = (window as Window & {
      __workspaceDiagnostics?: { snapshot(): DiagnosticsSnapshot };
    }).__workspaceDiagnostics;
    if (!diagnostics) throw new Error('workspace_diagnostics_missing');
    return diagnostics.snapshot();
  });
}
