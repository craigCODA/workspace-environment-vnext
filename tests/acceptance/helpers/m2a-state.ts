import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
export interface M2AState {
  readonly appUrl: string;
  readonly stateRoot: string;
  restartHost(): Promise<void>;
  stop(): Promise<void>;
}
export async function startM2AState(): Promise<M2AState> {
  const stateRoot = await mkdtemp(path.join(tmpdir(), 'workspace-m2a-'));
  const hostPort = await freePort();
  const appPort = await freePort();
  const origin = `http://127.0.0.1:${appPort}`;
  let token = '';
  let host: ChildProcess | undefined;
  const spatial = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
    cwd: path.join(root, 'apps/spatial'), stdio: ['ignore', 'pipe', 'pipe'],
  });
  const spatialLog = capture(spatial);
  async function launchHost() {
    token = '';
    host = spawn(process.env.DOTNET_EXE ?? 'dotnet', [
      path.join(root, 'apps/host/bin/Release/net8.0/Workspace.Host.dll'),
      '--m2a', '--port', String(hostPort), '--state-root', stateRoot, '--allowed-origin', origin,
    ], { cwd: root, env: { ...process.env, PLATFORM: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = capture(host);
    await waitFor(`http://127.0.0.1:${hostPort}/health`, host, log);
    token = /WORKSPACE_VNEXT_SESSION=([^\r\n]+)/.exec(log())?.[1] ?? '';
    if (!token) throw new Error('Host did not issue a session token.');
  }
  try {
    await Promise.all([launchHost(), waitFor(`${origin}/`, spatial, spatialLog)]);
  } catch (error) {
    await Promise.all([stopProcess(host), stopProcess(spatial)]);
    await rm(stateRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    stateRoot,
    get appUrl() { return `${origin}/workspace.html#session=${encodeURIComponent(token)}&host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}/workspace`)}`; },
    async restartHost() { await stopProcess(host); await launchHost(); },
    async stop() {
      await Promise.all([stopProcess(host), stopProcess(spatial)]);
      await rm(stateRoot, { recursive: true, force: true });
    },
  };
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return server.close(() => reject(new Error('Port unavailable.')));
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}
function capture(child: ChildProcess): () => string {
  let text = '';
  const append = (chunk: unknown) => { text = (text + String(chunk)).slice(-32_000); };
  child.stdout?.on('data', append); child.stderr?.on('data', append);
  child.once('error', append);
  return () => text;
}
async function waitFor(url: string, child: ChildProcess, log: () => string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Startup failed: ${log()}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).status < 500) return; } catch { /* Still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Startup timed out: ${log()}`);
}
async function stopProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
}
