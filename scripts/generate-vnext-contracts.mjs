import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outRoot = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : process.cwd();
const files = [
  ['contracts/schemas/vnext-envelope.schema.json','vnext-envelope','VNextEnvelope'],
  ['contracts/schemas/creative-resource.schema.json','creative-resource','CreativeResource'],
  ['contracts/schemas/world-package.schema.json','world-package','WorldPackage'],
];
const run = (a) => { const exe = process.platform === 'win32' ? 'npx.cmd' : 'npx'; const r = spawnSync(exe, ['--no-install','quicktype',...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); };
for (const [schema, stem, top] of files) {
  const ts = path.join(outRoot, 'ts', stem + '.ts'); const cs = path.join(outRoot, 'cs', top + '.cs');
  await mkdir(path.dirname(ts), { recursive: true }); await mkdir(path.dirname(cs), { recursive: true });
  run(['--src', schema, '--src-lang', 'schema', '--lang', 'typescript', '--just-types', '--top-level', top, '--out', ts]);
  run(['--src', schema, '--src-lang', 'schema', '--lang', 'csharp', '--just-types', '--framework', 'SystemTextJson', '--namespace', 'Workspace.Contracts.Generated', '--top-level', top, '--out', cs]);
  for (const file of [ts, cs]) { const text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'); await writeFile(file, text, 'utf8'); }
}
if (outIndex < 0) {
  for (const [schema, stem, top] of files) {
    const pairs = [[path.join(outRoot,'ts',stem+'.ts'), path.join(process.cwd(),'packages/contracts/src/generated',stem+'.ts')],[path.join(outRoot,'cs',top+'.cs'), path.join(process.cwd(),'src/Workspace.Contracts/Generated',top+'.cs')]];
    for (const [src,dst] of pairs) { await mkdir(path.dirname(dst), { recursive: true }); await writeFile(dst, await readFile(src)); }
  }
}
