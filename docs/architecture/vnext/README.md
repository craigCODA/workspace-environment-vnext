# Workspace Environment vNext

Status: architecture approved; M1 implementation plan ready; application implementation has not started.

Start with the [Live Creative Runtime specification](../../superpowers/specs/2026-09-11-vnext-live-creative-runtime-design.md), then use the [M1 Runtime Foundation implementation plan](../../superpowers/plans/2026-09-11-vnext-m1-runtime-foundation.md). The [baseline and reuse map](baseline-and-reuse.md) distinguishes inspected prototype source, recorded verification, proposed ports, and work that still requires proof.

## Repository checkpoint

- Product repository: `craigCODA/workspace-environment-vnext`.
- Canonical product line: `main`.
- Imported approved snapshot: `craigCODA/workspace-environment@24a368eef0e4fb3dd45e455a37cfa309aa1591ef`.
- Prototype architecture/reference baseline: `58822736500e98192429297c6ab5cf3c919be14a`.
- The older repository remains prototype/reference history and is not the vNext implementation target.

Prototype application/source paths are retained in this repository only as reference while vNext ports proven behavior into new contracts. The old prototype CI workflow was intentionally excluded from the fresh repo.

## First implementation gate

Execute M1 from an isolated `m1/runtime-foundation` branch/worktree off `main`. M1 must prove the host-owned world/command boundary, model-independent direct editing, isolated guest execution, the descriptor pipeline with the A47 creative-resource matrix, revision-safe hot replacement, stable semantic picking/references, authored-state persistence, save/reload, resource-budget recovery, and the explicit M1 security fixtures.

M1 does not claim general constraints, AI authoring, multi-package offender isolation, or the full Windows product migration. M2 covers the two declared host constraint operators/bindings plus generic live behavior and interaction-mode semantics. OpenCode authoring is M3. Real Windows-product integration, remembered grants, reusable assembly import/export, and voice are M4.

## Working rules

Keep platform code, bundled runtimes, generated packages, and world data separate. Port useful prototype code with its tests and source provenance. Keep renderer and agents subordinate to host-owned state and authority. Treat broad renderer compatibility, isolation, voice quality, and VR support as acceptance obligations rather than completed features.
