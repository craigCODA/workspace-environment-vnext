import { expect, test, type Page } from '@playwright/test';
import { startAcceptanceState, type AcceptanceState } from './helpers/start-state.ts';

interface DiagnosticsSnapshot {
  readonly activeGenerationCount: number;
  readonly resourceCounts: {
    readonly generations: number;
    readonly resources: number;
    readonly stagedGroups: number;
    readonly activeEntities: number;
  };
  readonly activePackageRevisions?: Record<string, string>;
  readonly activePackageEntityId?: string | null;
  readonly projectedKinds?: readonly string[];
  readonly packagesPaused?: boolean;
  readonly capabilityGrantCount?: number;
  readonly rendererStatus?: string;
}

let state: AcceptanceState;

test.beforeAll(async () => {
  state = await startAcceptanceState();
});

test.afterAll(async () => {
  await state?.stop();
});

test('A35 saved active package reconstructs after WebGL context loss and renderer reload', async ({ page }) => {
  await page.goto(state.appUrl);
  await expect.poll(async () => (await diagnostics(page)).activeGenerationCount).toBe(1);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('saved');

  const before = await diagnostics(page);
  const revision = before.activePackageRevisions?.['entity:box'];
  expect(revision).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(before.resourceCounts.resources).toBeGreaterThanOrEqual(7);

  const lost = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-workspace-renderer]');
    if (!canvas) return false;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(lost).toBe(true);
  await expect.poll(async () => (await diagnostics(page)).rendererStatus).toBe('context-lost');

  await page.reload();
  await expect.poll(async () => (await diagnostics(page)).activeGenerationCount).toBe(1);
  const recovered = await diagnostics(page);
  expect(recovered.rendererStatus).toBe('ready');
  expect(recovered.activePackageEntityId).toBe('entity:box');
  expect(recovered.activePackageRevisions?.['entity:box']).toBe(revision);
  expect(recovered.resourceCounts.resources).toBe(before.resourceCounts.resources);
});

test('A36 fake guest approval cannot grant capabilities while trusted recovery controls can pause and disable', async ({ page }) => {
  await page.goto(state.appUrl);
  await expect.poll(async () => (await diagnostics(page)).activeGenerationCount).toBe(1);
  expect((await diagnostics(page)).capabilityGrantCount).toBe(0);

  const canvas = page.locator('canvas[data-workspace-renderer]');
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 320, y: 180 } });
  expect((await diagnostics(page)).capabilityGrantCount).toBe(0);

  await page.getByRole('button', { name: 'Pause packages' }).click();
  await expect.poll(async () => (await diagnostics(page)).packagesPaused).toBe(true);

  await page.getByRole('button', { name: 'Disable current package' }).click();
  await expect.poll(async () => (await diagnostics(page)).activeGenerationCount).toBe(0);
  const disabled = await diagnostics(page);
  expect(disabled.resourceCounts.resources).toBe(0);
  expect(disabled.capabilityGrantCount).toBe(0);
});

test('A50 renderer asset path uses opaque handles and never accepts URL locators', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(state.appUrl);
  await expect.poll(async () => (await diagnostics(page)).activeGenerationCount).toBe(1);

  const assetRequests = requests.filter((url) => url.includes('/assets/resolve'));
  expect(assetRequests.length).toBeGreaterThan(0);
  expect(assetRequests.every((url) => /handle=asset%3Asha256%3A[0-9a-f]{64}/.test(url))).toBe(true);
  expect(assetRequests.every((url) => !/https%3A|file%3A|\.\.|%5C%5C/i.test(url.split('handle=')[1] ?? ''))).toBe(true);
});

async function diagnostics(page: Page): Promise<DiagnosticsSnapshot> {
  return page.evaluate(() => {
    const api = (window as Window & {
      __workspaceDiagnostics?: { snapshot(): DiagnosticsSnapshot };
    }).__workspaceDiagnostics;
    if (!api) throw new Error('workspace_diagnostics_missing');
    return api.snapshot();
  });
}
