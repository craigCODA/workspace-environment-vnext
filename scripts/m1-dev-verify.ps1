$ErrorActionPreference = 'Stop'
node scripts/check-vnext-contracts.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
