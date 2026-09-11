$ErrorActionPreference = 'Stop'

npm ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run vnext:contracts:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

dotnet build Workspace.VNext.sln --configuration Release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

dotnet test tests/Workspace.Core.Tests/Workspace.Core.Tests.csproj --configuration Release --no-build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
