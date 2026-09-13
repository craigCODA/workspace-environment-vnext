import assert from 'node:assert/strict';
import test from 'node:test';

import { createElectronBuilderInvocation, createM2aWindowsPayloadPaths, isM2aWindowsInstallerName } from './m2a-build-command.mjs';

test('Windows packaging invokes electron-builder through Node rather than a cmd shim', () => {
  const invocation = createElectronBuilderInvocation({
    nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    builderCliPath: 'D:\\repo\\node_modules\\electron-builder\\out\\cli\\cli.js',
  });
  assert.deepEqual(invocation, {
    executable: 'C:\\Program Files\\nodejs\\node.exe',
    args: [
      'D:\\repo\\node_modules\\electron-builder\\out\\cli\\cli.js',
      '--win', 'nsis', '--x64', '--publish', 'never',
    ],
  });
});

test('Windows packaging verifies unpacked Electron, bundled host, spatial client, and NSIS installer', () => {
  const payload = createM2aWindowsPayloadPaths('D:\\repo\\dist');
  assert.equal(payload.unpackedExe, 'D:\\repo\\dist\\win-unpacked\\Workspace Environment.exe');
  assert.equal(payload.hostExe, 'D:\\repo\\dist\\win-unpacked\\resources\\host\\Workspace.Host.Windows.exe');
  assert.equal(payload.workspaceHtml, 'D:\\repo\\dist\\win-unpacked\\resources\\spatial\\workspace.html');
  assert.equal(isM2aWindowsInstallerName('Workspace Environment Setup 0.1.0.exe'), true);
  assert.equal(isM2aWindowsInstallerName('Workspace Environment.exe'), false);
});
