$ErrorActionPreference = 'Stop'
npm ci --ignore-scripts
npm run vnext:contracts:check
dotnet build Workspace.VNext.sln --configuration Release
