import { createRequire } from 'node:module';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test, expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const { startStaticServer } = require('../../apps/desktop/lib/static-server.cjs') as {
  startStaticServer: (root: string, options: { hostPort: number }) => Promise<{ origin: string; close: () => Promise<void> }>;
};
const root = path.resolve(import.meta.dirname, '../..');
const spatialDist = path.join(root, 'apps', 'spatial', 'dist');

let server: { origin: string; close: () => Promise<void> };

test.beforeAll(async () => {
  await buildSpatial();
  server = await startStaticServer(spatialDist, { hostPort: 65535 });
});
test.afterAll(async () => { await server?.close(); });

test('packaged renderer CSP still shows a connection error instead of a silent black page', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${server.origin}/workspace.html`);
  await expect(page.getByRole('alert')).toContainText('connection');
  await expect(page.getByTestId('connection-status')).toHaveText('Unable to start');
  expect(pageErrors.filter(message => /unsafe-eval|EvalError/i.test(message))).toEqual([]);
});

function buildSpatial(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
      cwd: path.join(root, 'apps/spatial'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout?.on('data', chunk => { log += String(chunk); });
    child.stderr?.on('data', chunk => { log += String(chunk); });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`spatial build failed: ${log}`)));
    child.on('error', reject);
  });
}
