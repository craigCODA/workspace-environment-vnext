import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = new Set(process.argv.slice(2));
const dryRun = cli.has('--dry-run');
const smoke = cli.has('--smoke');
const skipInstall = cli.has('--skip-install');
const skipBuild = cli.has('--skip-build');

if (dryRun) {
  console.log(JSON.stringify(createPlan(43123, 43124, 'm1-local-dry-run')));
  process.exit(0);
}

if (Number(process.versions.node.split('.')[0]) < 24) {
  fail('Workspace Environment vNext M1 requires Node.js 24 or newer.');
}

await ensureCommand('dotnet', ['--version'], 'Workspace Environment vNext M1 requires the .NET 8 SDK.');

const vitePath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
if (!skipInstall && !(await exists(vitePath))) {
  console.log('Installing locked vNext dependencies...');
  await runChecked(npmCommand(), ['ci', '--ignore-scripts'], repoRoot);
}

if (!(await exists(vitePath))) {
  fail('Vite is not installed. Run: npm ci --ignore-scripts');
}

if (!skipBuild) {
  console.log('Building Workspace Environment vNext M1...');
  await runChecked(npmCommand(), ['run', 'vnext:build'], repoRoot, { PLATFORM: '' });
}

const hostPort = await reservePort();
const appPort = await reservePort();
const token = `m1-local-${randomUUID()}`;
const plan = createPlan(hostPort, appPort, token);
const children = [];
let stopping = false;

try {
  console.log('Starting vNext host...');
  const host = spawn(plan.host.command, plan.host.args, {
    cwd: plan.host.cwd,
    env: { ...process.env, PLATFORM: '' },
    stdio: 'inherit',
  });
  children.push(host);

  console.log('Starting vNext spatial client...');
  const spatial = spawn(plan.spatial.command, plan.spatial.args, {
    cwd: plan.spatial.cwd,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(spatial);

  for (const child of children) {
    child.once('error', (error) => {
      console.error(error);
      void stopAll(1);
    });
  }

  await Promise.all([
    waitForHttp(`http://127.0.0.1:${hostPort}/`, host),
    waitForHttp(`http://127.0.0.1:${appPort}/`, spatial),
  ]);

  console.log(`\nWorkspace Environment vNext is running:\n${plan.appUrl}\n`);

  if (smoke) {
    await stopAll(0);
  } else {
    openBrowser(plan.appUrl);
    console.log('The workspace was opened in your default browser.');
    console.log('Keep this terminal open. Press Ctrl+C here to stop Workspace.\n');
    await waitUntilStopped();
  }
} catch (error) {
  console.error(`\nFailed to start Workspace Environment vNext: ${error instanceof Error ? error.message : String(error)}`);
  await stopAll(1);
}

function createPlan(hostPort, appPort, sessionToken) {
  const hostSocket = `ws://127.0.0.1:${hostPort}/workspace`;
  return {
    host: {
      command: 'dotnet',
      args: [
        'run', '--project', 'apps/host/Workspace.Host.csproj',
        '--configuration', 'Release', '--no-build', '--',
        '--acceptance', '--session-token', sessionToken, '--port', String(hostPort),
      ],
      cwd: repoRoot,
    },
    spatial: {
      command: process.execPath,
      args: [vitePath, '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'],
      cwd: path.join(repoRoot, 'apps', 'spatial'),
    },
    appUrl: `http://127.0.0.1:${appPort}/#session=${encodeURIComponent(sessionToken)}&host=${encodeURIComponent(hostSocket)}`,
  };
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a loopback port.'));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`A vNext process exited early with code ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Still starting.
    }
    await delay(125);
  }
  throw new Error(`Startup timed out waiting for ${url}`);
}

async function runChecked(command, args, cwd, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function ensureCommand(command, args, message) {
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: repoRoot, stdio: 'ignore' });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
    });
  } catch {
    fail(message);
  }
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    const escaped = url.replaceAll('"', '""');
    spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${escaped}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
}

async function waitUntilStopped() {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    for (const child of children) child.once('exit', resolve);
  });
  await stopAll(0);
}

async function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) await stopProcess(child);
  process.exitCode = exitCode;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('error', () => resolve());
      killer.once('exit', () => resolve());
    });
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(2_000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
