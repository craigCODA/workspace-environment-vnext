import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNpmInvocation } from './desktop-build-command.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = path.join(repoRoot, '.m2a-build');
const hostOutput = path.join(stagingRoot, 'host');
const spatialOutput = path.join(repoRoot, 'apps', 'spatial', 'dist');
const hostProject = path.join(repoRoot, 'apps', 'host-windows-vnext', 'Workspace.Host.Windows.csproj');

if (process.platform !== 'win32') throw new Error('Workspace Environment M2A Windows packaging must run on Windows.');
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) throw new Error(`Workspace Environment M2A requires Node 24 or newer. Current Node: ${process.version}`);
if (path.dirname(stagingRoot) !== repoRoot || path.basename(stagingRoot) !== '.m2a-build') throw new Error(`Refusing to clean unexpected staging path: ${stagingRoot}`);

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(hostOutput, { recursive: true });
runNpm(['run', 'build', '--workspace', '@workspace/vnext-spatial']);
run('dotnet', [
  'publish', hostProject,
  '--configuration', 'Release',
  '--runtime', 'win-x64',
  '--self-contained', 'true',
  '--output', hostOutput,
  '/p:DebugType=None',
  '/p:DebugSymbols=false',
]);

requireOutput(path.join(spatialOutput, 'workspace.html'));
requireOutput(path.join(hostOutput, 'Workspace.Host.Windows.exe'));
requireOutput(path.join(hostOutput, 'examples', 'world-packages', 'm2a-brick', 'manifest.json'));
requireOutput(path.join(hostOutput, 'examples', 'world-packages', 'm2a-brick', 'index.js'));

function runNpm(args) {
  const npm = createNpmInvocation({ nodeExecutable: process.execPath, npmCliPath: process.env.npm_execpath, args });
  run(npm.executable, npm.args);
}
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: repoRoot, env: process.env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} exited with code ${result.status}.`);
}
function requireOutput(file) { if (!existsSync(file)) throw new Error(`Expected M2A desktop build output is missing: ${file}`); }
