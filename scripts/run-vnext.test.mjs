import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('root package exposes npm run vnext', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts?.vnext, 'node scripts/run-vnext.mjs');
});

test('vNext launcher dry-run targets the M1 host and spatial client', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/run-vnext.mjs', '--dry-run']);
  const plan = JSON.parse(stdout);

  assert.equal(plan.host.command, 'dotnet');
  assert.ok(plan.host.args.includes('apps/host/Workspace.Host.csproj'));
  assert.ok(plan.host.args.includes('--acceptance'));
  assert.match(plan.spatial.command, /node(?:\.exe)?$/i);
  assert.match(plan.spatial.cwd.replaceAll('\\', '/'), /\/apps\/spatial$/);
  assert.match(plan.appUrl, /^http:\/\/127\.0\.0\.1:\d+\/#session=/);
  assert.match(decodeURIComponent(plan.appUrl), /host=ws:\/\/127\.0\.0\.1:\d+\/workspace/);
});

test('Windows launcher can invoke npm as a child process', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows-specific npm subprocess regression');
    return;
  }

  const { stdout } = await execFileAsync(process.execPath, ['scripts/run-vnext.mjs', '--npm-probe']);
  assert.match(stdout, /npm subprocess ok/i);
});
