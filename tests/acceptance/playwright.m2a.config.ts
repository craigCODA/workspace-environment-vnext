import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'm2a-*.spec.ts', workers: 1, fullyParallel: false,
  timeout: 60_000, expect: { timeout: 12_000 },
  use: { headless: true, viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
});
