# Agent instructions

Before changing this repository, read [`docs/architecture/vnext/product-roadmap.md`](docs/architecture/vnext/product-roadmap.md). That file is the owner-corrected sequence and non-goals. Chat summaries and Cursor canvases are not the roadmap.

## Where to work

- Branch: `m2/spatial-workspace-shell` (not `main`).
- Do not rewrite M1 (`3474aa0`) or git history.
- Do not treat the furnished room seed as the product destination.

## Next implementation

**Layer 1: empty void + free-fly.** Not Coda. Not new object types.

- New worlds seed no visible content entities (no room, floor, brick, or screen fixture). Non-visible/system entities remain allowed.
- Remove room AABB from navigation. Stopping the room draw is not enough.
- Free-fly: empty-space click may pointer-lock; UI, objects, handles, and Use-mode surfaces must not.
- Fix Electron pointer lock. Failure is a bug, not a skip.

**Required regression:** `Add screen → picker → bind an arbitrary running window → live frame → Use-mode input` must keep working in the void.

Do not start Coda package authoring, OpenCode, or a catalog of product kinds until void/fly exists.

## Later, do not flatten

Coda is not a chat box that emits geometry. The stack is Coda + package lifecycle + durable identity + hot correction + user authority. The model does not write the live world. Preserve entity IDs unless the user intends replacement. Pointing needs entity + subpart/handle IDs + revision-aware hits.

M2A Task 6 is still open and is not documentation-only. Inventory `docs/architecture/vnext/product-roadmap.md` before claiming M2A complete.

## Invariants

World Core owns truth. Three.js only projects. No per-application Windows adapters. HWND/PID never persist. Coda has no private mutation API. Electron is fullscreen, not kiosk.
