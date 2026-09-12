import assert from 'node:assert/strict';
import test from 'node:test';

import { createElectronBuilderInvocation } from './m2a-build-command.mjs';

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
