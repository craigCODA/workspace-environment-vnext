import { test, expect, type Page } from '@playwright/test';
import { startM2AState, type M2AState } from './helpers/m2a-state.ts';
let state: M2AState;
test.beforeEach(async () => { state = await startM2AState(); });
test.afterEach(async () => { await state?.stop(); });

async function snapshot(page: Page) {
  return page.evaluate(() => (window as any).__workspaceM2A.snapshot());
}
async function open(page: Page) {
  await page.goto(state.appUrl);
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
}
test('M2A full-viewport room renders a real guest brick and responds to resize', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  const canvas = page.locator('canvas[data-m2a-world]');
  await expect(canvas).toBeVisible();
  expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  expect((await snapshot(page)).activeGenerationCount).toBe(1);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect.poll(() => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  expect(errors).toEqual([]);
});
test('M2A missing connection configuration is visible instead of a silent blank page', async ({ page }) => {
  await page.goto(state.appUrl.split('#')[0]);
  await expect(page.getByRole('alert')).toContainText('connection');
  await expect(page.getByTestId('connection-status')).not.toHaveText('Connected');
});
test('M2A brick edits are host-owned, undoable and survive a complete host restart', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Brick', exact: true }).click();
  const before = await snapshot(page);
  const brick = Object.values(before.world.entities).find((e: any) => e.parameters.kind === 'brick') as any;
  await page.getByLabel('Position X').fill('1.25');
  await page.getByRole('button', { name: 'Apply transform' }).click();
  await expect.poll(async () => (await snapshot(page)).world.entities[brick.id].transform.position[0]).toBe(1.25);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.entities[brick.id].transform.position[0]).toBe(brick.transform.position[0]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.entities[brick.id].transform.position[0]).toBe(1.25);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const saved = (await snapshot(page)).world;
  await page.goto('about:blank');
  await state.restartHost();
  await open(page);
  expect((await snapshot(page)).world.entities).toEqual(saved.entities);
});
test('M2A camera motion needs world pointer ownership, not merely a held W key', async ({ page }) => {
  await open(page);
  const before = (await snapshot(page)).camera.position;
  await page.keyboard.down('w'); await page.waitForTimeout(200); await page.keyboard.up('w');
  expect((await snapshot(page)).camera.position).toEqual(before);
  await page.mouse.click(650, 570);
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true);
  await page.keyboard.down('w'); await page.waitForTimeout(250); await page.keyboard.up('w');
  expect((await snapshot(page)).camera.position).not.toEqual(before);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(false);
});

test('M2A adding a brick still creates guest geometry after the last brick was removed', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Brick', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).activeGenerationCount).toBe(0);
  await page.getByRole('button', { name: 'Add brick', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).activeGenerationCount).toBe(1);
});

test('M2A appearance edits preserve identity and renderer recovery preserves accepted state', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: 'Brick', exact: true }).click();
  await page.getByLabel('Dimension X', { exact: true }).fill('0.75');
  await page.getByLabel('Color', { exact: true }).fill('#335577');
  await page.getByRole('button', { name: 'Apply appearance' }).click();
  const brickId = (await snapshot(page)).selectedEntityId;
  await expect.poll(async () => (await snapshot(page)).world.entities[brickId].parameters.color).toBe('#335577');
  expect((await snapshot(page)).world.entities[brickId].parameters.dimensions[0]).toBe(0.75);
  const before = (await snapshot(page)).world;
  await page.locator('canvas[data-m2a-world]').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')!; const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Test renderer lacks context-loss support.');
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 250);
  });
  await expect.poll(async () => (await snapshot(page)).rendererStatus).toBe('context-lost');
  await expect.poll(async () => (await snapshot(page)).rendererStatus).toBe('ready');
  expect((await snapshot(page)).world).toEqual(before);
});

test('M2A dragging a screen commits one transform and Undo restores its pose', async ({ page }) => {
  const commits: unknown[] = [];
  page.on('websocket', socket => socket.on('framesent', frame => {
    try { const data = JSON.parse(String(frame.payload)); if (data.command === 'edit.commit') commits.push(data); } catch { /* Ignore non-command frames. */ }
  }));
  await open(page);
  const world = (await snapshot(page)).world;
  const screen = Object.values(world.entities).find((e: any) => e.parameters.kind === 'surface') as any;
  // The seeded screen is directly in front of the initial camera.
  await page.mouse.move(640, 335); await page.mouse.down();
  await page.mouse.move(760, 370, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).world.entities[screen.id].revisions.transform).toBe(screen.revisions.transform + 1);
  expect(commits).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.entities[screen.id].transform).toEqual(screen.transform);
});
