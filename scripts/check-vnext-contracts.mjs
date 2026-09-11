import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const canonical = (text) => text.replace(/\r\n/g, '\n');
const temp = await mkdtemp(path.join(tmpdir(), 'workspace-contracts-'));

try {
  const result = spawnSync(process.execPath, ['scripts/generate-vnext-contracts.mjs', '--out', temp], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'contract generation failed');
  }

  const pairs = [
    ['packages/contracts/src/generated/vnext-envelope.ts', 'ts/vnext-envelope.ts'],
    ['packages/contracts/src/generated/creative-resource.ts', 'ts/creative-resource.ts'],
    ['packages/contracts/src/generated/world-package.ts', 'ts/world-package.ts'],
    ['src/Workspace.Contracts/Generated/VNextEnvelope.cs', 'cs/VNextEnvelope.cs'],
    ['src/Workspace.Contracts/Generated/CreativeResource.cs', 'cs/CreativeResource.cs'],
    ['src/Workspace.Contracts/Generated/WorldPackage.cs', 'cs/WorldPackage.cs'],
  ];

  for (const [committed, generated] of pairs) {
    const [a, b] = await Promise.all([
      readFile(committed, 'utf8'),
      readFile(path.join(temp, generated), 'utf8'),
    ]);

    if (canonical(a) !== canonical(b)) {
      throw new Error(`stale generated contract: ${committed}`);
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
