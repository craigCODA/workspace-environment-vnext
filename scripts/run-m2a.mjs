import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { createNpmInvocation } from './desktop-build-command.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform !== 'win32') throw new Error('Workspace Environment M2A desktop launch currently supports Windows only.');
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) throw new Error(`Workspace Environment M2A requires Node 24 or newer. Current Node: ${process.version}`);

runNpm(['run', 'build', '--workspace', '@workspace/vnext-spatial']);
run('dotnet', ['build', path.join(repoRoot, 'apps', 'host-windows-vnext', 'Workspace.Host.Windows.csproj'), '--configuration', 'Release']);
run(process.execPath, [path.join(repoRoot, 'scripts', 'ensure-electron.mjs')]);

const electronExecutable = require('electron');
if (typeof electronExecutable !== 'string' || !existsSync(electronExecutable)) throw new Error(`Electron executable is unavailable: ${electronExecutable}`);
const result = spawnSync(electronExecutable, [repoRoot], { cwd: repoRoot, env: process.env, stdio: 'inherit', windowsHide: false });
if (result.error) throw result.error;
if (result.signal) process.kill(process.pid, result.signal);
process.exitCode = result.status ?? 1;

function runNpm(args) {
  const npm = createNpmInvocation({ nodeExecutable: process.execPath, npmCliPath: process.env.npm_execpath, args });
  run(npm.executable, npm.args);
}
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: repoRoot, env: process.env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} exited with code ${result.status}.`);
}
