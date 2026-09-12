$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    Write-Host '== Workspace Environment vNext M1 verification =='
    Write-Host "PowerShell: $($PSVersionTable.PSVersion)"
    Write-Host "Node: $(node --version)"
    Write-Host "npm: $(npm --version)"
    Write-Host "dotnet: $(dotnet --version)"

    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }

    npm run vnext:contracts:check
    if ($LASTEXITCODE -ne 0) { throw "vnext:contracts:check failed with exit code $LASTEXITCODE" }

    npm run vnext:test:node
    if ($LASTEXITCODE -ne 0) { throw "vnext:test:node failed with exit code $LASTEXITCODE" }

    npm run vnext:typecheck
    if ($LASTEXITCODE -ne 0) { throw "vnext:typecheck failed with exit code $LASTEXITCODE" }

    npm run vnext:build
    if ($LASTEXITCODE -ne 0) { throw "vnext:build failed with exit code $LASTEXITCODE" }

    dotnet test Workspace.VNext.sln --configuration Release
    if ($LASTEXITCODE -ne 0) { throw "dotnet test failed with exit code $LASTEXITCODE" }

    npx playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw "playwright install failed with exit code $LASTEXITCODE" }

    npx playwright test tests/acceptance/m1-runtime.spec.ts tests/acceptance/m1-renderer-failure.spec.ts tests/acceptance/m1-security.spec.ts --config tests/acceptance/playwright.config.ts
    if ($LASTEXITCODE -ne 0) { throw "M1 Playwright acceptance failed with exit code $LASTEXITCODE" }

    $gpuProbe = @'
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const evidence = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return { webgl: false, vendor: null, renderer: null, version: null };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl: true,
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
  };
});
console.log(`M1_GPU_EVIDENCE=${JSON.stringify(evidence)}`);
await browser.close();
'@

    $gpuProbe | node --input-type=module
    if ($LASTEXITCODE -ne 0) { throw "GPU evidence probe failed with exit code $LASTEXITCODE" }

    Write-Host 'M1_VERIFICATION_RESULT=PASS'
}
finally {
    Pop-Location
}
