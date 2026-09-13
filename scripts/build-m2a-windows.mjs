import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { createElectronBuilderInvocation, createM2aWindowsPayloadPaths, isM2aWindowsInstallerName } from './m2a-build-command.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32') throw new Error('Workspace Environment M2A Windows packaging must run on Windows.');

run(process.execPath, [path.join(repoRoot, 'scripts', 'prepare-m2a-desktop.mjs')]);
run(process.execPath, [path.join(repoRoot, 'scripts', 'ensure-electron.mjs')]);
const builderPackage = path.dirname(require.resolve('electron-builder/package.json'));
const builderCliPath = path.join(builderPackage, 'out', 'cli', 'cli.js');
const invocation = createElectronBuilderInvocation({ nodeExecutable: process.execPath, builderCliPath });
run(invocation.executable, invocation.args);

const distRoot = path.join(repoRoot, 'dist');
const payload = createM2aWindowsPayloadPaths(distRoot);
if (!existsSync(payload.unpackedExe)) throw new Error(`win-unpacked executable is missing: ${payload.unpackedExe}`);
if (!existsSync(payload.hostExe)) throw new Error(`bundled vNext host is missing: ${payload.hostExe}`);
if (!existsSync(payload.workspaceHtml)) throw new Error(`bundled spatial client is missing: ${payload.workspaceHtml}`);
const installers = readdirSync(distRoot).filter(name => isM2aWindowsInstallerName(name));
if (installers.length === 0) throw new Error('NSIS setup executable was not produced.');
console.log(`M2A_WIN_UNPACKED=${payload.unpackedExe}`);
for (const installer of installers) console.log(`M2A_WIN_INSTALLER=${path.join(distRoot, installer)}`);

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: repoRoot, env: process.env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} exited with code ${result.status}.`);
}
