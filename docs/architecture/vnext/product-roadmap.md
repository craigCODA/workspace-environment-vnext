# Workspace Environment — approved product sequence

Date: 2026-09-13
Status: Owner-corrected roadmap. This file is the versioned source of truth for sequence and non-goals.
Branch at correction: `m2/spatial-workspace-shell`
Pushed Task 4 head: `b3e05a9` (`feat(m2a): wire generic live Windows surfaces into the spatial screen`)
Architecture source: [Live Creative Runtime](../../superpowers/specs/2026-09-11-vnext-live-creative-runtime-design.md)
M2A plan: [M2A Spatial Workspace Shell](../../superpowers/plans/2026-09-12-m2a-spatial-workspace-shell.md)

Do not treat a Cursor canvas, chat summary, or slogan as the roadmap. Later agents must read this file. `AGENTS.md` at the repository root is the short pickup pointer.

## Product contract

Workspace is a spatial computer you navigate, build through direct manipulation and Coda, and then use as the interface.

Coda is an authoring partner, not the only construction mechanism, and not a chat box that emits geometry. The important stack is **Coda + package lifecycle + durable identity + hot correction + user authority**.

Non-negotiable:

- World Core owns durable truth. Three.js only projects. Renderers, agents, and guest runtimes do not persist world truth.
- Coda has no private mutation API. All accepted mutation uses the closed host command surface.
- Authoring engines (Codex, OpenCode, later adapters) sit behind Coda. The model does not write the live world.
- No per-application Windows adapters. HWND/PID never persist.
- Electron is fullscreen on the primary monitor, not kiosk, not explorer replacement. Windows key and Alt+Tab stay.
- Talking does not replace grab/move/numeric edit/undo.
- Broad creativity is a progressive product requirement: open-ended authoring with no catalog of product object types, **within the installed creative runtime and descriptor vocabulary**. A new renderer/native capability may still require a product update.

## Sequence

```text
void / free-fly
  → Coda shell / orchestration
  → safe live package-authoring pipeline
  → open-ended creation / in-place correction / reference
  → richer interaction / behaviors / assemblies / places
  → voice / VR / later product
```

These layers are sequential for the Coda stack. Interaction-layer work (snap, numeric edit, handles, frames, depth) is **not** gated on Coda.

---

## Layer 0 — already in the product (checkpoint, not the destination)

What you can run today:

- M1 World Core: host-authoritative entities, SQLite, undo/redo/save, isolated QuickJS, descriptor-only guests, Three.js projector.
- M2A Electron shell: primary-monitor fullscreen, packaged `dist:win` path.
- Reviewed M2A brick fixture and dock **Add brick / Add screen** as **shortcuts**, not the creation model. `entity.create` currently accepts only reviewed templates `m2a.brick` and `m2a.surface`.
- Generic live Windows surfaces: Applications picker → bind selector (never HWND/PID) → live frame on a spatial screen → Use-mode input with a control lease.

The furnished room (floor, walls, ceiling, seeded brick, unbound screen) is a **demo seed**. It is not the intended world. Today that seeded room also participates in **navigation bounds**. Void work must remove that dependency, not merely stop drawing the room.

ChatGPT can already be a bound Windows surface. That is not Coda.

Known defects in this checkpoint:

- Pointer lock look is broken in the Electron shell (`PointerLockControls` / invalid root document). Fixing it is part of the void slice, not optional polish.
- README and M2A plan checkboxes are stale relative to Task 4.
- `docs/architecture/vnext/m2a-acceptance.md` does not exist. Task 6 is still open.

---

## Layer 1 — next implementation: void + free-fly

Approved product slice. Not built.

### Intent

New worlds seed **no visible content entities**: no room, floor, walls, ceiling, brick, or screen fixture. That is not a rule that World Core can never have a non-visible or system entity if one becomes useful.

The visual grid at y=0 is renderer-only. It is not a World Core entity, not saved, not selectable.

Existing saved profiles are not wiped. An old `kind: room` entity may remain in a profile that already has one.

### Camera / fly

Free-fly first person. Click **empty world space** acquires pointer lock; mouse look; Escape/blur releases.

While locked: WASD along look (including vertical), Space/Ctrl up/down, Shift faster. No gravity, no floor collision, no room AABB clamp. Optional soft far-distance limit only.

**Acceptance — interaction ownership (required):**

- Empty-space click may acquire pointer lock.
- Clicking UI, a brick/object, transform controls, or a live application surface in Use mode **must not** acquire fly/camera lock.
- Camera ownership stays separate from object/application interaction (existing vNext Interaction rule).
- Use-mode typing must not move the camera.
- Pointer-lock failure in Electron is a bug to fix, not a skip.

**Acceptance — live Windows surfaces (required regression):**

In the void, this path must keep working:

`Add screen → application picker → bind an arbitrary running window → live frame → Use-mode input`

“Add screen still spawns” is not sufficient. Do not trade Task 4 away while replacing the room.

Add brick / Add screen remain reviewed shortcuts that spawn along look. They are not the authoring model.

### Explicitly not in this slice

Coda, OpenCode, package authoring of new kinds, walking on placed floors, grid snap, collision, wiping existing databases.

---

## Layer 2 — after void exists: Coda shell / orchestration

Coda does **not** jump from chat to “the model writes a guest package.”

This layer is the conversation and orchestration surface:

- Coda UI/conversation state while Workspace stays open
- relevant bounded context (request, selected entity/subpart IDs, handle keys, revisions, schemas — assembled from current World Core, not cached poses)
- authoring-engine adapter/process behind Coda (Codex / Workspace-private OpenCode; engine, provider, model, and voice are distinct settings)
- progress and error reporting
- no private mutation path; Coda submits the same host commands as the user

Coda is Workspace-aware. ChatGPT-as-window remains optional and separate.

Thin first step: natural language → **existing** host commands (move, tint, add reviewed brick/screen, undo, save). That proves orchestration without inventing arbitrary packages yet.

---

## Layer 3 — safe live package-authoring pipeline

M2A `entity.create` is deliberately constrained to reviewed brick/screen templates. Arbitrary package instances **cannot** become another hardcoded `entity.create` kind.

Required path (from the live creative runtime spec):

```text
request
  → isolated draft
  → deterministic compile
  → validate
  → candidate preparation / preview
  → revalidate current world revisions
  → package.publish / package.activate
  → retire previous runtime resources
```

Coda orchestrates an authoring engine. Generated source is staged and validated. The isolated runtime executes an **accepted** package. World Core accepts the resulting package/entity lifecycle (`package.publish`, `package.activate`, `package.disable`, `package.rollback`, `package.delete`, `instance.duplicate`, `package.fork`, `parameters.copy`).

The model itself does not directly write the live world. Coda reports success only after the host acknowledges publication/activation. Model prose claiming “done” is not activation.

Generalized package-backed instance creation must exist as a host lifecycle, not a growing template enum.

### Defining acceptance rules (not polish)

1. **Authoring happens while Workspace stays open.**
2. **A failed replacement leaves the prior working package active.**
3. **If the user moves an object while Coda is rebuilding it, user placement wins** over stale generated state. Replacing geometry never republishes a stale root pose. Independent revision planes stay independent.

---

## Layer 4 — open-ended creation, correction, and reference

Promise (precise): **open-ended authoring with no catalog of product object types, within the capabilities of the installed creative runtime and descriptor vocabulary.**

A cloud, bat, wall, fire, line, board, constraint, or animated behavior must not require a `Cloud` / `Fire` product feature. Some future request may still need a new renderer or native capability, and therefore a product update. This is progressive breadth, not an unlimited-runtime claim.

Coda is not only static geometry. Unfamiliar **visuals, interactions, and observable conditions** become packages: fire falling from the sky, a board pinned at one end, animation, constraints, behaviors. Computer/OS side effects still require host capabilities. Package creativity is broader than meshes.

### Correction and identity

The normal correction path is **revise the package or parameters in place while preserving the entity ID**.

Durable identity is a central vNext rule. Deleting and recreating is exceptional and intentional: it can destroy relationships, history, references, instance state, and anything pointing at that object.

**Preserve identity unless the user actually intends replacement.** “Ask only if it was moved/saved/mixed” is not the architectural rule.

Follow-ups keep entity IDs. Duplicate instance, fork package, and copy parameters remain distinct operations.

### Pointing / reference

“That cloud” can resolve to an entity. The design also needs **subpart/handle IDs plus revision-aware hit information**.

Later phrases such as “make that end longer,” “move this corner,” or “use that side” must resolve to stable handle keys (for example `board.end.east`), not triangle indices. Missing/redefined handles require explicit re-selection. Picking never remaps by primitive order.

---

## Layer 5 — richer interaction, behaviors, assemblies, places

These are later product layers. They are **not** implied by finishing authoring, and several are **not** blocked on Coda.

| Work | Dependency |
| --- | --- |
| Optional snapping, numeric editing, local/world frames, depth adjustment, manipulation handles | Interaction layer. Can proceed independently of AI. Schedule may still prefer after void; that is preference, not architecture. |
| Walking / colliding on placed floors | Needs real placed floors; fly is void locomotion. |
| Assemblies, reusable rooms, projects-as-places | After durable identity and package instances are real. |
| Objects as computer controls | Behaviors request closed host actions; guest JS never talks to the OS. |
| ChatGPT moving between dock and spatial screens | Surface pipeline exists; layout product later. |
| Multi-monitor takeover | M2A is primary display only. |

---

## Layer 6 — later: voice, VR, hardware claims

- Voice after Coda chat/orchestration works.
- VR/WebXR may reuse World Core; hardware is unproven. Do not claim it.
- Specific games (Steam, RuneScape, anti-cheat) are generic Windows path only; physical test required. Never report compatibility from headless or mock evidence.

---

## M2A Task 6 inventory (do not collapse to “docs”)

Plan items from `docs/superpowers/plans/2026-09-12-m2a-spatial-workspace-shell.md` Task 6. Inventory before claiming M2A complete.

| Plan item | Current evidence | Still open |
| --- | --- | --- |
| Preserve M1 tests; run new tests/typechecks/builds | Local gates have been green on this branch; M1 verifier still exists | Formal M2A evidence record with exact revision is missing |
| Move brick/screen, change tint, save, **full host restart**, IDs/poses/selectors match | Playwright: brick transform/undo/redo/save survives `restartHost`; appearance/tint/dimensions persist across WebGL loss | Bound-window **selector** persistence across full restart after a live bind is not in the suite |
| Denied control | .NET: foreign edit-lease commit rejected; control lease rejects other session | End-to-end Use-mode denied-control on a live surface still needs Task 6 evidence language |
| Unavailable platform | Host `platform_unavailable`; picker test allows unavailable/select copy | Distinct unavailable-platform world evidence vs Linux Playwright “no Windows capture” |
| Stale/ambiguous reconnect | Unit: unique selector match; never first-of-two; missing → `window_missing_or_ambiguous` | World-level reconnect after a real bind (missing vs ambiguous, truthful status, rebind action) |
| Visible startup failure | Missing launch config alert; packaged renderer CSP still shows connection error | Record in `m2a-acceptance.md` |
| Renderer recovery | M2A appearance test loses/restores WebGL; accepted world unchanged | Record in `m2a-acceptance.md` |
| Windows compile/CI; inspect exact artifacts | `npm run dist:win` path exists; do not claim app/game compatibility from mocks | Exact artifact inspection + published revision still required |
| Write `m2a-acceptance.md`, README launch instructions, hardware gates | **Missing.** README still says Task 4 is incomplete | Docs, remaining hardware gates, publish source/artifact with exact revision |

Task 6 can overlap void work. It is not “only README.” Do not declare M2A closed until this inventory is closed item-by-item.

---

## What the next agent must not do

- Interpret Coda as a chat box that emits geometry.
- Hardcode new product kinds (`Cloud`, `Bat`, `Fire`) instead of package lifecycle.
- Delete/recreate entities as the default correction path.
- Reduce pointing to entity IDs only.
- Claim unlimited runtime creativity.
- Let void navigation keep depending on a seeded room AABB.
- Drop the live Windows surface path while emptying the seed.
- Treat snap/handles as blocked on Coda.
- Treat Task 6 as documentation-only.
- Rewrite M1 git history or `main` as part of this line of work.
