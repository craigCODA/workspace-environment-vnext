$ErrorActionPreference = 'Stop'

npm ci --ignore-scripts
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
