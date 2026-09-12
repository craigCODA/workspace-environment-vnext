import { expect, test, type Page } from '@playwright/test';
import { startAcceptanceState, type AcceptanceState } from './helpers/start-state.ts';

const initialPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

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
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.reload();

  await expectEntityPose(page, 'entity:box', initialPose);
  await expect(page.getByTestId('agent-network-calls')).toHaveText('0');
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

async function expectEntityPose(page: Page, entityId: string, expected: typeof initialPose): Promise<void> {
  await expect.poll(async () => page.evaluate((id) => {
    const diagnostics = (window as Window & {
      __workspaceDiagnostics?: { snapshot(): { entities: Record<string, { transform: typeof initialPose }> } };
    }).__workspaceDiagnostics;
    return diagnostics?.snapshot().entities[id]?.transform;
  }, entityId)).toEqual(expected);
}
