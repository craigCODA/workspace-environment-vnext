import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const write = async (file, content) => {
  const full = path.join(root, file);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content.replace(/\r\n/g, '\n'), 'utf8');
};
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);

const commandNames = [
  'world.read','entity.inspect','package.inspect','capability.inspect',
  'entity.create','entity.remove','entity.rename','entity.reparent','transform.set','parameters.patch',
  'relationships.add','relationships.remove','reference.grant','reference.revoke','constraint.add','constraint.remove',
  'edit.begin','edit.update','edit.commit','edit.cancel','history.undo','history.redo','workspace.save',
  'instance.duplicate','parameters.copy','package.fork','package.publish','package.activate','package.disable','package.rollback','package.delete','package.state.patch',
  'workspace.import','workspace.export','application.search','application.open','window.focus','surface.bindWindow',
  'application.profile.save','application.profile.delete','application.close','application.restart'
];

await writeJson('contracts/schemas/vnext-envelope.schema.json', {
  $schema: 'http://json-schema.org/draft-07/schema#', title: 'VNextEnvelope',
  oneOf: [
    { $ref: '#/definitions/CommandRequest' }, { $ref: '#/definitions/CommandResultEnvelope' },
    { $ref: '#/definitions/RuntimePrepare' }, { $ref: '#/definitions/RuntimePrepared' },
    { $ref: '#/definitions/RuntimeActivate' }, { $ref: '#/definitions/RuntimeRetire' }, { $ref: '#/definitions/RuntimeFailed' }
  ],
  definitions: {
    CommandName: { type: 'string', enum: commandNames },
    CommandRequest: { type: 'object', additionalProperties: false, required: ['type','protocolVersion','requestId','command','payload'], properties: {
      type: { const: 'command.request' }, protocolVersion: { const: 1 }, requestId: { type: 'string', minLength: 1, maxLength: 128 },
      command: { $ref: '#/definitions/CommandName' }, payload: { type: 'object' }
    }},
    CommandResultEnvelope: { type: 'object', additionalProperties: false, required: ['type','protocolVersion','requestId','accepted'], properties: {
      type: { const: 'command.result' }, protocolVersion: { const: 1 }, requestId: { type: 'string' }, accepted: { type: 'boolean' },
      errorCode: { type: ['string','null'] }, payload: { type: ['object','null'] }
    }},
    RuntimePrepare: { type: 'object', additionalProperties: false, required: ['type','protocolVersion','candidateId','entityId','generationToken','source','manifestJson'], properties: {
      type: { const: 'runtime.prepare' }, protocolVersion: { const: 1 }, candidateId: { type: 'string' }, entityId: { type: 'string' }, generationToken: { type: 'string' }, source: { type: 'string' }, manifestJson: { type: 'string' }
    }},
    RuntimePrepared: { type: 'object', additionalProperties: false, required: ['type','protocolVersion','candidateId','generationToken'], properties: {
      type: { const: 'runtime.prepared' }, protocolVersion: { const: 1 }, candidateId: { type: 'string' }, generationToken: { type: 'string' }
    }},
    RuntimeActivate: { type: 'object', additionalProperties: false, required: ['type','protocolVersion','entityId','revisionDigest','generationToken'], properties: {
      type: { const: 'runtime.activate' }, protocolVersion: { const: 1 }, entityId: { type: 'string' }, revisionDigest: { type: 'string' }, generationToken: { type: 'string' }
    }},
    RuntimeRetire: { type: 'object', additionalProperties: false, required: ['type','protocolVersion','generationToken'], properties: {
      type: { const: 'runtime.retire' }, protocolVersion: { const: 1 }, generationToken: { type: 'string' }
    }},
    RuntimeFailed: { type: 'object', additionalProperties: false, required: ['type','protocolVersion','candidateId','generationToken','errorCode'], properties: {
      type: { const: 'runtime.failed' }, protocolVersion: { const: 1 }, candidateId: { type: 'string' }, generationToken: { type: 'string' }, errorCode: { type: 'string' }, message: { type: ['string','null'] }
    }}
  }
});

const vector3 = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } };
const color = { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' };
const base = (kind, extra, required = []) => ({ type: 'object', additionalProperties: false, required: ['kind','id',...required], properties: { kind: { const: kind }, id: { type: 'string', minLength: 1 }, ...extra } });
const descriptorSchemas = [
  base('line', { points: { type: 'array', minItems: 2, items: vector3 }, color }, ['points','color']),
  base('indexedGeometry', { positions: { type: 'array', items: { type: 'number' } }, indices: { type: 'array', items: { type: 'integer', minimum: 0 } }, attributes: { type: 'object', additionalProperties: { type: 'object', additionalProperties: false, required: ['itemSize','values'], properties: { itemSize: { type: 'integer', minimum: 1, maximum: 4 }, values: { type: 'array', items: { type: 'number' } } } } } }, ['positions','indices']),
  base('curve', { points: { type: 'array', minItems: 2, items: vector3 }, color }, ['points','color']),
  base('shaderMaterial', { vertexShader: { type: 'string' }, fragmentShader: { type: 'string' }, uniforms: { type: 'object' } }, ['vertexShader','fragmentShader']),
  base('texture', { assetHandle: { type: 'string', pattern: '^asset:sha256:[0-9a-f]{64}$' } }, ['assetHandle']),
  base('light', { lightType: { enum: ['ambient','directional','point'] }, color, intensity: { type: 'number' }, position: vector3 }, ['lightType','color','intensity']),
  base('points', { positions: { type: 'array', items: { type: 'number' } }, color, size: { type: 'number', exclusiveMinimum: 0 } }, ['positions','color','size']),
  base('instanced', { geometryId: { type: 'string' }, materialId: { type: 'string' }, transforms: { type: 'array', items: { type: 'array', minItems: 16, maxItems: 16, items: { type: 'number' } } } }, ['geometryId','materialId','transforms']),
  base('group', { children: { type: 'array', items: { type: 'string' } }, position: vector3, rotation: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' } }, scale: vector3 }, ['children'])
];
await writeJson('contracts/schemas/creative-resource.schema.json', {
  $schema: 'http://json-schema.org/draft-07/schema#', title: 'CreativeResource', oneOf: [
    ...descriptorSchemas,
    { type: 'object', additionalProperties: false, required: ['kind','id','patch'], properties: { kind: { const: 'update' }, id: { type: 'string' }, patch: { type: 'object' } } }
  ]
});

await writeJson('contracts/schemas/world-package.schema.json', {
  $schema: 'http://json-schema.org/draft-07/schema#', title: 'WorldPackage', type: 'object', additionalProperties: false,
  required: ['packageId','name','stateSchemaVersion','entry','requestedCapabilities','assets'],
  properties: {
    packageId: { type: 'string', pattern: '^pkg:[A-Za-z0-9._-]+$' }, name: { type: 'string', minLength: 1 }, stateSchemaVersion: { type: 'integer', minimum: 1 },
    entry: { type: 'string', pattern: '^[A-Za-z0-9._/-]+\\.js$' }, requestedCapabilities: { type: 'array', uniqueItems: true, items: { type: 'string' } },
    assets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['handle','digest','mediaType'], properties: { handle: { type: 'string', pattern: '^asset:sha256:[0-9a-f]{64}$' }, digest: { type: 'string', pattern: '^[0-9a-f]{64}$' }, mediaType: { type: 'string' } } } },
    lineageParentPackageId: { type: ['string','null'] }
  }
});

await writeJson('contracts/fixtures/vnext/command-transform-set.json', { type: 'command.request', protocolVersion: 1, requestId: 'fixture-transform', command: 'transform.set', payload: { entityId: 'entity:box', transform: { position: [1,2,3], rotation: [0,0,0,1], scale: [1,1,1] } } });
await writeJson('contracts/fixtures/vnext/command-workspace-save.json', { type: 'command.request', protocolVersion: 1, requestId: 'fixture-save', command: 'workspace.save', payload: {} });
await writeJson('contracts/fixtures/vnext/descriptor-line.json', { kind: 'line', id: 'line:1', points: [[0,0,0],[1,1,1]], color: '#ff0000' });
await writeJson('contracts/fixtures/vnext/descriptor-indexed-geometry.json', { kind: 'indexedGeometry', id: 'geo:1', positions: [0,0,0,1,0,0,0,1,0], indices: [0,1,2], attributes: { heat: { itemSize: 1, values: [0,0.5,1] } } });
const zero = '0'.repeat(64);
await writeJson('contracts/fixtures/vnext/package-valid.json', { packageId: 'pkg:valid', name: 'Valid', stateSchemaVersion: 1, entry: 'index.js', requestedCapabilities: [], assets: [{ handle: `asset:sha256:${zero}`, digest: zero, mediaType: 'image/raw-rgba' }] });
await writeJson('contracts/fixtures/vnext/package-forbidden-three.json', { packageId: 'pkg:forbidden-three', name: 'Forbidden Three', stateSchemaVersion: 1, entry: 'index.js', requestedCapabilities: [], assets: [] });

const csLib = (refs = '') => `<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><LangVersion>12</LangVersion></PropertyGroup>\n${refs}</Project>\n`;
const projectRef = (p) => `  <ItemGroup><ProjectReference Include="${p}" /></ItemGroup>\n`;
await write('src/Workspace.Contracts/Workspace.Contracts.csproj', csLib());
await write('src/Workspace.Core/Workspace.Core.csproj', csLib(projectRef('../Workspace.Contracts/Workspace.Contracts.csproj')));
await write('src/Workspace.Runtime/Workspace.Runtime.csproj', csLib(projectRef('../Workspace.Core/Workspace.Core.csproj')));
await write('src/Workspace.Storage/Workspace.Storage.csproj', csLib(projectRef('../Workspace.Core/Workspace.Core.csproj')));
await write('apps/host/Workspace.Host.csproj', `<Project Sdk="Microsoft.NET.Sdk.Web">\n  <PropertyGroup><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><LangVersion>12</LangVersion></PropertyGroup>\n  <ItemGroup><ProjectReference Include="../../src/Workspace.Runtime/Workspace.Runtime.csproj" /><ProjectReference Include="../../src/Workspace.Storage/Workspace.Storage.csproj" /></ItemGroup>\n</Project>\n`);
await write('apps/host/Program.cs', 'Console.WriteLine("Workspace Environment vNext host scaffold");\n');

const testProj = (ref) => `<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><LangVersion>12</LangVersion><IsPackable>false</IsPackable><IsTestProject>true</IsTestProject></PropertyGroup>\n  <ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.12.0" /><PackageReference Include="xunit" Version="2.9.2" /><PackageReference Include="xunit.runner.visualstudio" Version="2.8.2"><PrivateAssets>all</PrivateAssets></PackageReference></ItemGroup>\n  <ItemGroup><ProjectReference Include="${ref}" /></ItemGroup>\n</Project>\n`;
await write('tests/Workspace.Core.Tests/Workspace.Core.Tests.csproj', testProj('../../src/Workspace.Core/Workspace.Core.csproj'));
await write('tests/Workspace.Runtime.Tests/Workspace.Runtime.Tests.csproj', testProj('../../src/Workspace.Runtime/Workspace.Runtime.csproj'));
await write('tests/Workspace.Storage.Tests/Workspace.Storage.Tests.csproj', testProj('../../src/Workspace.Storage/Workspace.Storage.csproj'));
await write('tests/Workspace.Host.Tests/Workspace.Host.Tests.csproj', testProj('../../apps/host/Workspace.Host.csproj'));

await writeJson('packages/contracts/package.json', { name: '@workspace/vnext-contracts', version: '0.0.0', private: true, type: 'module', exports: './src/index.ts', scripts: { test: 'node --test', typecheck: 'tsc --noEmit' } });
await writeJson('packages/contracts/tsconfig.json', { compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true }, include: ['src/**/*.ts'] });
await write('packages/contracts/src/index.ts', `export * from './generated/vnext-envelope.js';\nexport * from './generated/creative-resource.js';\nexport * from './generated/world-package.js';\n`);
await writeJson('apps/spatial/package.json', { name: '@workspace/vnext-spatial', version: '0.0.0', private: true, type: 'module', scripts: { test: 'node --test', typecheck: 'tsc --noEmit', build: 'vite build' } });
await writeJson('apps/spatial/tsconfig.json', { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true }, include: ['src/**/*.ts'] });
await write('apps/spatial/index.html', '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n');
await write('apps/spatial/src/main.ts', `document.querySelector('#app')!.textContent = 'Workspace Environment vNext';\n`);

const generator = `import { mkdir, readFile, writeFile } from 'node:fs/promises';\nimport path from 'node:path';\nimport { spawnSync } from 'node:child_process';\nconst args = process.argv.slice(2);\nconst outIndex = args.indexOf('--out');\nconst outRoot = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : process.cwd();\nconst files = [\n  ['contracts/schemas/vnext-envelope.schema.json','vnext-envelope','VNextEnvelope'],\n  ['contracts/schemas/creative-resource.schema.json','creative-resource','CreativeResource'],\n  ['contracts/schemas/world-package.schema.json','world-package','WorldPackage'],\n];\nconst run = (a) => { const exe = process.platform === 'win32' ? 'npx.cmd' : 'npx'; const r = spawnSync(exe, ['--no-install','quicktype',...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); };\nfor (const [schema, stem, top] of files) {\n  const ts = path.join(outRoot, 'ts', stem + '.ts'); const cs = path.join(outRoot, 'cs', top + '.cs');\n  await mkdir(path.dirname(ts), { recursive: true }); await mkdir(path.dirname(cs), { recursive: true });\n  run(['--src', schema, '--src-lang', 'schema', '--lang', 'typescript', '--just-types', '--top-level', top, '--out', ts]);\n  run(['--src', schema, '--src-lang', 'schema', '--lang', 'csharp', '--framework', 'SystemTextJson', '--namespace', 'Workspace.Contracts.Generated', '--top-level', top, '--out', cs]);\n  for (const file of [ts, cs]) { const text = (await readFile(file, 'utf8')).replace(/\\r\\n/g, '\\n'); await writeFile(file, text, 'utf8'); }\n}\nif (outIndex < 0) {\n  for (const [schema, stem, top] of files) {\n    const pairs = [[path.join(outRoot,'ts',stem+'.ts'), path.join(process.cwd(),'packages/contracts/src/generated',stem+'.ts')],[path.join(outRoot,'cs',top+'.cs'), path.join(process.cwd(),'src/Workspace.Contracts/Generated',top+'.cs')]];\n    for (const [src,dst] of pairs) { await mkdir(path.dirname(dst), { recursive: true }); await writeFile(dst, await readFile(src)); }\n  }\n}\n`;
await write('scripts/generate-vnext-contracts.mjs', generator);
await write('scripts/m1-dev-verify.ps1', `$ErrorActionPreference = 'Stop'\nnpm ci --ignore-scripts\nnpm run vnext:contracts:check\ndotnet build Workspace.VNext.sln --configuration Release\n`);

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
pkg.workspaces = [...new Set([...(pkg.workspaces ?? []), 'apps/spatial'])];
pkg.scripts = { ...pkg.scripts,
  'vnext:contracts': 'node scripts/generate-vnext-contracts.mjs',
  'vnext:contracts:check': 'node scripts/check-vnext-contracts.mjs',
  'vnext:test:dotnet': 'dotnet test Workspace.VNext.sln --configuration Release',
  'vnext:test:node': 'npm test --workspace @workspace/vnext-contracts --workspace @workspace/creative-sdk --workspace @workspace/creative-runtime --workspace @workspace/spatial-runtime --workspace @workspace/vnext-spatial',
  'vnext:typecheck': 'npm run typecheck --workspace @workspace/vnext-contracts --workspace @workspace/creative-sdk --workspace @workspace/creative-runtime --workspace @workspace/spatial-runtime --workspace @workspace/vnext-spatial',
  'vnext:build': 'npm run build --workspace @workspace/vnext-spatial && dotnet build Workspace.VNext.sln --configuration Release'
};
pkg.devDependencies = { ...pkg.devDependencies, quicktype: '26.0.0' };
await writeJson('package.json', pkg);
