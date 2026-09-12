import { expect, test, type Page } from '@playwright/test';
import { startAcceptanceState, type AcceptanceState } from './helpers/start-state.ts';

const initialPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

type Pose = typeof initialPose;

interface ResourceCounts {
  readonly generations: number;
  readonly resources: number;
  readonly stagedGroups: number;
  readonly activeEntities: number;
}

interface DiagnosticSnapshot {
  readonly activeLeaseCount: number;
  readonly activeGenerationCount: number;
  readonly resourceCounts: ResourceCounts;
  readonly entities: Record<string, { transform: Pose }>;
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
  await expectTrustedDiagnostics(page);

  await dragEntity(page, 'entity:box', { x: 120, y: 0 });
  await expect.poll(async () => (await entityPose(page, 'entity:box'))?.position[0]).not.toBe(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expectEntityPose(page, 'entity:box', initialPose);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('saved');
  await page.reload();

  await expectEntityPose(page, 'entity:box', initialPose);
  await expect(page.getByTestId('agent-network-calls')).toHaveText('0');
  await expectTrustedDiagnostics(page);
});

test('A52 save during an active drag reopens accepted state without a stale lease', async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto(state.appUrl);
  await expectEntityPose(page, 'entity:box', initialPose);

  await beginDragPreview(page, 'entity:box', { x: 180, y: 0 });
  await page.getByRole('button', { name: 'Save' }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByTestId('save-status')).toHaveText('saved');

  await page.close();

  const reopened = await browser.newPage();
  await reopened.goto(state.appUrl);
  await expectEntityPose(reopened, 'entity:box', initialPose);
  await expect.poll(async () => (await diagnosticSnapshot(reopened))?.activeLeaseCount).toBe(0);
  await expectTrustedDiagnostics(reopened);

  await dragEntity(reopened, 'entity:box', { x: 100, y: 0 });
  await expect.poll(async () => (await entityPose(reopened, 'entity:box'))?.position[0]).not.toBe(0);
  await reopened.getByRole('button', { name: 'Undo' }).click();
  await expectEntityPose(reopened, 'entity:box', initialPose);

  await reopened.close();
});

async function expectTrustedDiagnostics(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    const diagnostics = (window as Window & {
      __workspaceDiagnostics?: { snapshot(): DiagnosticSnapshot };
    }).__workspaceDiagnostics;
    return diagnostics ? {
      frozen: Object.isFrozen(diagnostics),
      keys: Object.keys(diagnostics).sort(),
      snapshot: diagnostics.snapshot(),
    } : undefined;
  })).toEqual({
    frozen: true,
    keys: ['snapshot'],
    snapshot: expect.objectContaining({
      activeLeaseCount: 0,
      activeGenerationCount: 0,
      resourceCounts: {
        generations: 0,
        resources: 0,
        stagedGroups: 0,
        activeEntities: 0,
      },
    }),
  });
}

async function beginDragPreview(page: Page, entityId: string, delta: { x: number; y: number }): Promise<void> {
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

async function dragEntity(page: Page, entityId: string, delta: { x: number; y: number }): Promise<void> {
  await beginDragPreview(page, entityId, delta);
  await page.mouse.up();
}

async function expectEntityPose(page: Page, entityId: string, expected: Pose): Promise<void> {
  await expect.poll(async () => entityPose(page, entityId)).toEqual(expected);
}

async function entityPose(page: Page, entityId: string): Promise<Pose | undefined> {
  return (await diagnosticSnapshot(page))?.entities[entityId]?.transform;
}

async function diagnosticSnapshot(page: Page): Promise<DiagnosticSnapshot | undefined> {
  return page.evaluate(() => {
    const diagnostics = (window as Window & {
      __workspaceDiagnostics?: { snapshot(): DiagnosticSnapshot };
    }).__workspaceDiagnostics;
    return diagnostics?.snapshot();
  });
}
