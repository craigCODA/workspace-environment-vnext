$ErrorActionPreference = 'Stop'

npm install --ignore-scripts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run vnext:contracts:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

dotnet build Workspace.VNext.sln --configuration Release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

foreach ($project in @(
  'tests/Workspace.Core.Tests/Workspace.Core.Tests.csproj',
  'tests/Workspace.Storage.Tests/Workspace.Storage.Tests.csproj',
  'tests/Workspace.Runtime.Tests/Workspace.Runtime.Tests.csproj',
  'tests/Workspace.Host.Tests/Workspace.Host.Tests.csproj'
)) {
  dotnet test $project --configuration Release --no-build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

foreach ($workspace in @('@workspace/creative-sdk', '@workspace/spatial-runtime', '@workspace/creative-runtime', '@workspace/vnext-spatial')) {
  npm test --workspace $workspace
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm run typecheck --workspace $workspace
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}


npm run build --workspace @workspace/vnext-spatial
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$browserExternals = Get-ChildItem 'apps/spatial/dist' -Recurse -File | Where-Object { $_.Name -like '__vite-browser-external*' }
if ($browserExternals) {
  Write-Error 'vNext spatial browser bundle contains a Node builtin external shim'
  exit 1
}
