# Workspace Environment vNext

Workspace Environment vNext is a Windows-first spatial computing environment built around a persistent semantic world and a live creative runtime. Real Windows applications remain real processes and windows, while spatial objects, relationships, behaviors, generated packages, and presentation state gain durable identity in the world.

The defining product goal is live authoring: while Workspace is running, the user can create, place, reshape, save, and revise things that were not preimplemented as named application features. Generated creativity is broad, while authority over files, processes, applications, network access, credentials, and other external effects remains explicit and host-controlled.

## Current status

The vNext architecture is approved and the M1 runtime-foundation implementation plan is ready. M1 application implementation has not started in this repository yet.

Canonical documents:

- [vNext architecture overview](docs/architecture/vnext/README.md)
- [Live Creative Runtime specification](docs/superpowers/specs/2026-09-11-vnext-live-creative-runtime-design.md)
- [M1 Runtime Foundation implementation plan](docs/superpowers/plans/2026-09-11-vnext-m1-runtime-foundation.md)
- [Baseline and reuse map](docs/architecture/vnext/baseline-and-reuse.md)

## Repository provenance

This repository is the clean product home for vNext. Its initial source snapshot came from `craigCODA/workspace-environment` at approved snapshot commit `24a368eef0e4fb3dd45e455a37cfa309aa1591ef`. The older repository remains the prototype/reference history and is not the implementation target for vNext.

Prototype source paths such as `apps/desktop-native`, `apps/host-windows`, `apps/spatial-client`, `packages/protocol`, and `packages/world-schema` are retained here as reference material while M1 builds the new vNext units side-by-side. They do not become authoritative merely because they were copied into this repository.

The old prototype CI workflow was intentionally not migrated. M1 adds CI for the vNext contracts and runtime as part of its own implementation plan.

## Architectural invariants

- World Core owns durable truth. Renderers, agents, guest runtimes, and transient Windows handles do not.
- Three.js runs only in the trusted renderer. Guest packages emit validated descriptors and resource updates.
- Guest JavaScript never runs on pointer/controller movement.
- Unknown creative ideas become packages, parameters, descriptors, relationships, and behaviors rather than new privileged host verbs.
- User manipulation remains authoritative over stale generated results.
- Ordinary editing and saved-package use do not require a model call.
- OpenCode/Codex/xAI are authoring engines behind Coda, not privileged mutation paths.

## M1 execution

Start from `main`, create an isolated worktree/branch named `m1/runtime-foundation`, and execute the M1 plan with TDD and its required acceptance evidence. Do not implement M2, OpenCode integration, voice replacement, or the full Windows-product migration as part of M1.
