const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const path = require('node:path');
const test = require('node:test');

const {
  HostAnnouncements,
  createWindowOptions,
  createWorkspaceUrl,
  resolveHostCommand,
  waitForHostAnnouncements,
} = require('../lib/runtime.cjs');

test('primary display opens as fullscreen non-kiosk sandboxed Workspace window', () => {
  const options = createWindowOptions({
    display: { bounds: { x: 1920, y: 0, width: 2560, height: 1440 } },
    preloadPath: 'D:\\repo\\apps\\desktop\\preload.cjs',
    packaged: true,
  });

  assert.equal(options.x, 1920);
  assert.equal(options.y, 0);
  assert.equal(options.width, 2560);
  assert.equal(options.height, 1440);
  assert.equal(options.fullscreen, true);
  assert.equal(options.kiosk, false);
  assert.equal(options.frame, false);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.webSecurity, true);
  assert.equal(options.webPreferences.preload, path.resolve('D:\\repo\\apps\\desktop\\preload.cjs'));
});

test('packaged Windows host command uses bundled M2A host and generic desktop arguments', () => {
  const command = resolveHostCommand({
    isPackaged: true,
    resourcesPath: 'C:\\Program Files\\Workspace Environment\\resources',
    repoRoot: 'D:\\src\\workspace',
    parentPid: 4312,
    port: 49321,
    allowedOrigin: 'http://127.0.0.1:49320',
  });

  assert.equal(command.executable, path.resolve('C:\\Program Files\\Workspace Environment\\resources', 'host', 'Workspace.Host.Windows.exe'));
  assert.equal(command.cwd, path.resolve('C:\\Program Files\\Workspace Environment\\resources', 'host'));
  assert.deepEqual(command.args, [
    '--m2a',
    '--port', '49321',
    '--parent-process', '4312',
    '--allowed-origin', 'http://127.0.0.1:49320',
  ]);
});

test('development Windows host command runs the vNext M2A host target without shell invocation', () => {
  const command = resolveHostCommand({
    isPackaged: false,
    resourcesPath: 'ignored',
    repoRoot: 'D:\\src\\workspace',
    parentPid: 77,
    port: 49321,
    allowedOrigin: 'http://127.0.0.1:49320',
  });

  assert.equal(command.executable, 'dotnet');
  assert.deepEqual(command.args, [
    'run',
    '--project', path.resolve('D:\\src\\workspace', 'apps', 'host-windows-vnext', 'Workspace.Host.Windows.csproj'),
    '--configuration', 'Release',
    '--no-launch-profile',
    '--no-build',
    '--',
    '--m2a',
    '--port', '49321',
    '--parent-process', '77',
    '--allowed-origin', 'http://127.0.0.1:49320',
  ]);
});

test('desktop URL carries the host-issued session and local WebSocket endpoint', () => {
  const url = createWorkspaceUrl({
    rendererOrigin: 'http://127.0.0.1:49000',
    hostHttpBase: 'http://127.0.0.1:49001',
    sessionToken: 'abc_123-token',
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin, 'http://127.0.0.1:49000');
  assert.equal(parsed.pathname, '/workspace.html');
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  assert.equal(fragment.get('session'), 'abc_123-token');
  assert.equal(fragment.get('host'), 'ws://127.0.0.1:49001/workspace');
});

test('host announcement parser accepts output split across arbitrary chunks', () => {
  const parser = new HostAnnouncements();
  parser.push('WORKSPACE_VNEXT_H');
  parser.push('OST=http://127.0.0.1:49222\nWORKSPACE_VNEXT_SE');
  parser.push('SSION=desktop-token\n');
  assert.deepEqual(parser.value(), {
    hostHttpBase: 'http://127.0.0.1:49222',
    sessionToken: 'desktop-token',
  });
});

test('host startup rejects an early child exit with diagnostics', async () => {
  const child = createChild();
  const ready = waitForHostAnnouncements(child, { timeoutMs: 500 });
  child.stderr.write('fatal startup error\n');
  child.exitCode = 1;
  child.emit('exit', 1, null);
  await assert.rejects(ready, /fatal startup error/);
});

function createChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const { DESKTOP_CHANNELS, isAllowedNavigation } = require('../lib/runtime.cjs');
const { startStaticServer } = require('../lib/static-server.cjs');

test('desktop preload scope contains only minimize and exit controls', () => {
  assert.deepEqual(DESKTOP_CHANNELS, Object.freeze({
    minimize: 'workspace-desktop:minimize',
    exit: 'workspace-desktop:exit',
  }));
});

test('desktop navigation stays on the isolated renderer origin', () => {
  assert.equal(isAllowedNavigation('http://127.0.0.1:49000/workspace.html#abc', 'http://127.0.0.1:49000'), true);
  assert.equal(isAllowedNavigation('https://example.com/', 'http://127.0.0.1:49000'), false);
  assert.equal(isAllowedNavigation('not a url', 'http://127.0.0.1:49000'), false);
});

test('desktop static server is loopback-only and permits only its selected host connection', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workspace-m2a-desktop-'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'workspace.html'), '<main>M2A</main>');
  await writeFile(path.join(root, 'assets', 'app.js'), 'export default 1;');
  const server = await startStaticServer(root, { hostPort: 49222 });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });

  assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const page = await requestHttp(`${server.origin}/workspace.html`);
  assert.equal(page.statusCode, 200);
  assert.equal(page.body, '<main>M2A</main>');
  assert.match(page.headers['content-security-policy'], /ws:\/\/127\.0\.0\.1:49222/);
  assert.match(page.headers['content-security-policy'], /http:\/\/127\.0\.0\.1:49222/);
  assert.match(page.headers['content-security-policy'], /script-src[^;]*'wasm-unsafe-eval'/);
  assert.match(page.headers['content-security-policy'], /script-src[^;]*'unsafe-eval'/);

  const moduleScript = await requestHttp(`${server.origin}/assets/app.js`, { origin: server.origin });
  assert.equal(moduleScript.statusCode, 200);
  assert.equal(moduleScript.headers['access-control-allow-origin'], server.origin);

  const traversal = await requestHttp(`${server.origin}/%2e%2e%2fpackage.json`);
  assert.equal(traversal.statusCode, 403);
});

function requestHttp(url, { origin } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: origin ? { Origin: origin } : {} }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
  });
}

const { readFile: readFilePromise } = require('node:fs/promises');
test('sandboxed preload has no local module dependency and exposes only approved IPC channels', async () => {
  const source = await readFilePromise(path.resolve(__dirname, '..', 'preload.cjs'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]\.\//);
  assert.match(source, /workspace-desktop:minimize/);
  assert.match(source, /workspace-desktop:exit/);
  assert.doesNotMatch(source, /nodeIntegration|child_process|fs\b|net\b/);
});
