import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const sessionToken = 'm1-acceptance-token';
const repoRoot = path.resolve(import.meta.dirname, '../../..');

export interface AcceptanceState {
  readonly appUrl: string;
  readonly stateRoot: string;
  stop(): Promise<void>;
}

export async function startAcceptanceState(): Promise<AcceptanceState> {
  const stateRoot = await mkdtemp(path.join(tmpdir(), 'workspace-vnext-acceptance-'));
  const [hostPort, appPort] = await Promise.all([reservePort(), reservePort()]);
  const dotnet = process.env.DOTNET_EXE ?? 'dotnet';

  const host = spawn(dotnet, [
    'run', '--project', 'apps/host/Workspace.Host.csproj', '--configuration', 'Release', '--no-build', '--',
    '--acceptance', '--session-token', sessionToken, '--state-root', stateRoot, '--port', String(hostPort),
  ], {
    cwd: repoRoot,
    env: { ...process.env, PLATFORM: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const spatial = spawn(process.execPath, [
    path.join(repoRoot, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', String(appPort), '--strictPort',
  ], {
    cwd: path.join(repoRoot, 'apps/spatial'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const hostLog = capture(host);
  const spatialLog = capture(spatial);

  try {
    await Promise.all([
      waitForHttp(`http://127.0.0.1:${hostPort}/`, host, hostLog),
      waitForHttp(`http://127.0.0.1:${appPort}/`, spatial, spatialLog),
    ]);
  } catch (error) {
    await stopProcess(host);
    await stopProcess(spatial);
    await rm(stateRoot, { recursive: true, force: true });
    throw error;
  }

  return {
    appUrl: `http://127.0.0.1:${appPort}/#session=${encodeURIComponent(sessionToken)}&host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}/workspace`)}`,
    stateRoot,
    async stop() {
      await Promise.all([stopProcess(host), stopProcess(spatial)]);
      await rm(stateRoot, { recursive: true, force: true });
    },
  };
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('port_reservation_failed'));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function capture(process: ChildProcessWithoutNullStreams): () => string {
  let output = '';
  process.stdout.on('data', (chunk) => { output += String(chunk); });
  process.stderr.on('data', (chunk) => { output += String(chunk); });
  return () => output;
}

async function waitForHttp(url: string, process: ChildProcessWithoutNullStreams, output: () => string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`process_exited:${process.exitCode}\n${output()}`);
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`process_start_timeout:${url}\n${output()}`);
}

async function stopProcess(process: ChildProcessWithoutNullStreams): Promise<void> {
  if (process.exitCode !== null) return;
  process.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => process.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (process.exitCode === null) process.kill('SIGKILL');
}
