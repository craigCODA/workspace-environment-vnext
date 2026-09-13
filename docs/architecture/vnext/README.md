# Workspace Environment vNext

Status: M1 runtime foundation implemented; final acceptance is recorded and gated by the dedicated M1 verifier.

Start with the [Live Creative Runtime specification](../../superpowers/specs/2026-09-11-vnext-live-creative-runtime-design.md), then use the [M1 Runtime Foundation implementation plan](../../superpowers/plans/2026-09-11-vnext-m1-runtime-foundation.md). The [approved product sequence](product-roadmap.md) is the owner-corrected order of remaining work (void/fly → Coda orchestration → package lifecycle → open-ended creation). The [M1 acceptance record](m1-acceptance.md) is the evidence boundary for what M1 actually proves. The [baseline and reuse map](baseline-and-reuse.md) distinguishes inspected prototype source, recorded verification, proposed ports, and work that still requires proof.

## Repository checkpoint

- Product repository: `craigCODA/workspace-environment-vnext`.
- Canonical product line: `main`.
- M1 implementation line: `m1/runtime-foundation`.
- Imported approved snapshot: `craigCODA/workspace-environment@24a368eef0e4fb3dd45e455a37cfa309aa1591ef`.
- Prototype architecture/reference baseline: `58822736500e98192429297c6ab5cf3c919be14a`.
- The older repository remains prototype/reference history and is not the vNext implementation target.

Prototype application/source paths remain reference material until deliberately ported through later vNext milestones. The old prototype CI workflow was intentionally excluded from the fresh repo; vNext M1 has its own Windows verification job and does not consume or redefine prototype native/fallback artifacts.

## M1 acceptance gate

Run the complete M1 gate with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-vnext-m1.ps1
```

The verifier installs locked repository dependencies, checks generated contracts, runs all vNext Node tests, typechecks, builds vNext, runs the complete .NET solution tests, installs Chromium, and runs the runtime, renderer-failure, and security Playwright acceptance suites. `.github/workflows/windows-ci.yml` runs the same verifier as the `verify-vnext-m1` job on `windows-latest`.

M1 proves only the mechanisms listed in `m1-acceptance.md`: host-owned world/command authority, model-independent direct editing, isolated QuickJS guest execution with bounded CPU/memory, descriptor projection including the creative-breadth matrix, revision-safe package replacement, stable identity/picking, SQLite save/recovery, renderer context-loss recovery, trusted recovery controls, and the named M1 security boundaries.

M1 does not claim general constraints, Coda/OpenCode authoring, multi-package offender isolation, full Three.js API compatibility, all physical GPU/driver behavior, real Windows application-surface integration in vNext, remembered-grant policy, reusable assembly import/export, voice replacement, guest-to-guest executable imports, advanced renderer-wide passes, or VR hardware support.

## Working rules

Keep platform code, bundled runtimes, generated packages, and world data separate. Port useful prototype code with its tests and source provenance. Keep renderer and agents subordinate to host-owned state and authority. Treat broad renderer compatibility, isolation, voice quality, and VR support as acceptance obligations rather than completed features.
