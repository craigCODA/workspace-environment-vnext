import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startAcceptanceState, type AcceptanceState } from './helpers/start-state.ts';

const initialPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

type Pose = typeof initialPose;

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
  return page.evaluate((id) => {
    const diagnostics = (window as Window & {
      __workspaceDiagnostics?: {
        snapshot(): {
          entities: Record<string, { transform: Pose }>;
          activeLeaseCount?: number;
        };
      };
    }).__workspaceDiagnostics;
    return diagnostics?.snapshot().entities[id]?.transform;
  }, entityId);
}

async function activeLeaseCount(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const diagnostics = (window as Window & {
      __workspaceDiagnostics?: { snapshot(): { activeLeaseCount?: number } };
    }).__workspaceDiagnostics;
    return diagnostics?.snapshot().activeLeaseCount;
  });
}
