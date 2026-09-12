from pathlib import Path

p = Path('docs/architecture/vnext/m1-acceptance.md')
text = p.read_text(encoding='utf-8')
text = text.replace(
    'Status: M1 implementation evidence assembled; final Windows gate evidence is recorded after the first `verify-vnext-m1` workflow run.',
    'Status: M1 runtime-foundation acceptance evidence recorded from the pinned Windows verification gate.',
)
text = text.replace(
    'The acceptance command runs locked dependency installation, generated-contract verification, all vNext Node tests, TypeScript checks, the production vNext build, the complete .NET solution tests, Chromium installation, and the three M1 Playwright acceptance files. Browser/GPU evidence from the Windows gate is appended in the final evidence section after it is observed.',
    'The acceptance command runs locked dependency installation, generated-contract verification, all vNext Node tests, TypeScript checks, the production vNext build, the complete .NET solution tests, Chromium installation, and the three M1 Playwright acceptance files. The observed Windows gate evidence is recorded below.',
)
old = '''## Final Windows evidence

To be filled only from an observed `windows-latest` run of `scripts/verify-vnext-m1.ps1`:

- Workflow run: pending
- Commit under test: pending
- Node test counts: pending
- .NET test counts: pending
- Playwright acceptance count: pending
- Browser/GPU backend: pending
- Final script marker: pending'''
new = '''## Final Windows evidence

Observed from the pinned `windows-latest` `verify-vnext-m1` gate:

- Workflow run: `34672313419` (`windows-ci`, job `verify-vnext-m1`) — PASS.
- Commit under test: `67b1bd622080d619486a9b2f74f2134d29f1cc6a`.
- Runner: Microsoft Windows Server 2025, image `windows-2025-vs2026` version `20260907.229.1`.
- Toolchain: PowerShell `5.1.26100.33296`, Node `v24.20.0`, npm `11.19.0`, .NET SDK `8.0.425` selected by repository `global.json`.
- vNext Node tests: 35 passed, 0 failed (`creative-sdk` 2; `creative-runtime` 8; `spatial-runtime` 17; `vnext-spatial` 8; contracts package 0 tests).
- .NET tests: 44 passed, 0 failed (`Workspace.Core.Tests` 8; `Workspace.Storage.Tests` 5; `Workspace.Runtime.Tests` 20; `Workspace.Host.Tests` 11).
- Playwright acceptance: 13 passed, 0 failed, one worker; Chrome for Testing `153.0.8010.12`, Playwright Chromium build `v1243`.
- Browser/GPU backend: WebGL available; vendor `Google Inc. (Google)`; renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`; version `WebGL 1.0 (OpenGL ES 2.0 Chromium)`.
- Final script marker: `M1_VERIFICATION_RESULT=PASS`.

This is software-rendered SwiftShader evidence. It is not evidence that every physical GPU or driver behaves identically.'''
if old not in text:
    raise SystemExit('expected final evidence placeholder block not found')
p.write_text(text.replace(old, new), encoding='utf-8')
