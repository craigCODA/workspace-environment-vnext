# Workspace Environment vNext M1 Acceptance Record

Status: M1 implementation evidence assembled; final Windows gate evidence is recorded after the first `verify-vnext-m1` workflow run.

Implementation evidence head before this record: `41d558d696449f76a731cd1664d6243a063c1fca`.

Primary verification command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-vnext-m1.ps1
```

The accepted M1 claim is limited to a persistent, manipulable, model-independent live-package runtime with the descriptor/resource mechanisms, authoritative host state, isolated guest execution, and revision-safe recovery explicitly exercised below.

## Verification environment

The automated M1 topology uses the .NET 8 host as authoritative world/command owner, a Vite/Three.js trusted renderer in Playwright Chromium, and QuickJS WebAssembly for untrusted package JavaScript. M1 package fixtures are manually authored; no model provider, Coda authoring process, or OpenCode execution is required. The final Windows workflow pins Node 24.20.0 and .NET SDK 8.0.425; repository pins include TypeScript 5.9.2, Vite 8.2.2, Three.js 0.185.1, QuickJS wrapper packages 0.32.0, and Playwright Test 1.63.0.

The acceptance command runs locked dependency installation, generated-contract verification, all vNext Node tests, TypeScript checks, the production vNext build, the complete .NET solution tests, Chromium installation, and the three M1 Playwright acceptance files. Browser/GPU evidence from the Windows gate is appended in the final evidence section after it is observed.

## Acceptance evidence

### A01 — Move an anchor in midair, create an object there
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; focused spatial interaction/root tests.
- Environment / process topology: trusted interaction and renderer tests; host-owned entity transform remains authoritative.
- Generic mechanism exercised: Spatial Anchor pose, trusted entity root, independent marker display radius.
- Fixture: trusted anchor/root manipulation fixture.
- Observed result: anchor/entity pose is preserved while display-handle radius remains presentation-only.
- Limits / non-claims: does not establish VR tracking or arbitrary physical placement hardware.

### A02 — Draw a colored line between arbitrary 3D points
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; creative SDK and spatial projector tests.
- Environment / process topology: guest descriptor data projected by trusted Three.js renderer.
- Generic mechanism exercised: `line` creative-resource descriptor.
- Fixture: `examples/world-packages/m1-line` and descriptor fixtures.
- Observed result: arbitrary 3D positions/color are represented without a floor-plane assumption.
- Limits / non-claims: a line descriptor is not evidence of complete Three.js API compatibility.

### A03 — Drag while a delayed package revision completes
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; runtime coordinator and interaction tests.
- Environment / process topology: host world + trusted interaction + candidate/active renderer generations.
- Generic mechanism exercised: stable entity root, edit lease, candidate preparation, atomic generation activation.
- Fixture: drag-preview/hot-replacement regression fixture.
- Observed result: implementation replacement keeps the same entity identity and latest user pose without snap-back.
- Limits / non-claims: only the tested revision planes and single-package M1 topology are covered.

### A04 — Independent revision-plane concurrency
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; World Core revision tests.
- Environment / process topology: .NET authoritative World Core.
- Generic mechanism exercised: separate transform/parameter/implementation revision planes and dependency-specific expected revisions.
- Fixture: concurrent independent-field and stale-dependent update tests.
- Observed result: independent changes can succeed while genuinely stale dependent mutations are rejected.
- Limits / non-claims: does not claim distributed multi-writer consensus.

### A06 — Grabbed subpart identity through regeneration
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; picking resolver tests.
- Environment / process topology: trusted renderer/interaction semantic picking path.
- Generic mechanism exercised: stable semantic handle keys and revision-aware pick resolution.
- Fixture: stale/missing handle regeneration tests.
- Observed result: removed handles report missing/re-selection instead of silently rebinding to a primitive index.
- Limits / non-claims: does not implement general deformation constraints.

### A07 — Malformed replacement preserves prior package
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; package activation/candidate tests and malformed package fixture.
- Environment / process topology: host package lifecycle with isolated guest preparation and detached renderer staging.
- Generic mechanism exercised: candidate preparation before activation, generation retirement, candidate cleanup.
- Fixture: `examples/world-packages/m1-malformed`.
- Observed result: malformed preparation fails without displacing the active generation or accepted world.
- Limits / non-claims: does not claim recovery from every native/runtime corruption mode.

### A08 — CPU and allocation budgets
- Status: PASS
- Commit: `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; creative-runtime guest security tests.
- Environment / process topology: QuickJS WebAssembly guest with trusted interrupt handler, per-runtime memory limit, and fixed-size module memory.
- Generic mechanism exercised: execution deadline, stack/memory budgets, hard WebAssembly memory ceiling, stable guest error normalization.
- Fixture: infinite loop and allocation-flood package source.
- Observed result: infinite execution becomes `guest_interrupted`; allocation flood becomes `guest_memory_limit_exceeded` without unbounded WASM growth.
- Limits / non-claims: M1 proves the pinned QuickJS wrapper/topology, not universal protection against host or OS compromise.

### A09 — Unauthorized guest APIs are absent
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; creative-runtime guest probe tests.
- Environment / process topology: isolated QuickJS guest.
- Generic mechanism exercised: constrained global environment and module loader.
- Fixture: probes for `fetch`, `process`, `require`, `document`, and `WebSocket`.
- Observed result: all named privileged/browser/process globals are unavailable to guest code.
- Limits / non-claims: this does not replace OS-level process isolation for future richer execution profiles.

### A10 — Cross-generation resource/actor forgery denial
- Status: PASS
- Commit: `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; projector ownership and host IPC tests.
- Environment / process topology: trusted renderer resource registry plus authenticated host command boundary.
- Generic mechanism exercised: generation-scoped resource ownership and host-derived actor/generation context.
- Fixture: attacker generation guesses another generation's resource ID; forged payload actor/generation fields.
- Observed result: resource update is rejected as `resource_not_owned`; forged context does not become authority.
- Limits / non-claims: multi-package offender scheduling/isolation remains outside M1.

### A11 — Retired generation cannot act late
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; guest supervisor/runtime coordinator tests.
- Environment / process topology: host-owned generation lifecycle with disposable guest generations.
- Generic mechanism exercised: generation tokens and retired-generation filtering.
- Fixture: delayed message/callback from retired generation.
- Observed result: late retired-generation work is dropped and only one generation remains active per entity.
- Limits / non-claims: does not claim shared multi-tenant worker isolation.

### A13 — Crash-safe save/publication boundaries
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; storage fault-injection tests.
- Environment / process topology: host-owned SQLite persistence and immutable package revision blobs.
- Generic mechanism exercised: transactional world checkpoint/publication references and recovery selection.
- Fixture: publication/save fault points around SQLite commits.
- Observed result: reopen selects the last committed compatible state; accepted entities do not point at missing active package blobs.
- Limits / non-claims: does not claim distributed database durability or arbitrary filesystem failure recovery.

### A15 — Repeated activation/retirement cleanup
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; runtime coordinator 100-cycle cleanup test.
- Environment / process topology: guest supervisor + trusted projector/resource registry.
- Generic mechanism exercised: generation retirement, resource disposal, worker/guest cleanup.
- Fixture: 100 activation/replacement cycles.
- Observed result: resource counts return to the baseline and retired guest generations do not accumulate.
- Limits / non-claims: does not establish long-duration leak freedom for unimplemented resource families.

### A22 — Unsupported privileged/addon capability is explicit
- Status: PASS
- Commit: `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; forbidden-import security fixture.
- Environment / process topology: isolated QuickJS module loader.
- Generic mechanism exercised: explicit package-local import allowlist.
- Fixture: `examples/world-packages/m1-forbidden-import` importing `three`.
- Observed result: preparation returns explicit `module_not_allowed:three` compatibility failure.
- Limits / non-claims: broader Three.js/addon APIs remain unsupported unless separately adapted and tested.

### A23 — Model-offline ordinary editing
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; `m1-runtime.spec.ts` ordinary-editing acceptance.
- Environment / process topology: .NET host + Chromium spatial client; no model provider is started by the acceptance harness.
- Generic mechanism exercised: trusted edit lifecycle, history undo, save checkpoint, persisted reload.
- Fixture: `entity:box` move/undo/save/reopen flow with model-call diagnostic.
- Observed result: editing, undo, save, and reopen succeed while model-call count remains zero.
- Limits / non-claims: M1 does not include Coda/OpenCode authoring.

### A24 — Nested parent/child authority
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; hierarchy and interaction regression tests.
- Environment / process topology: authoritative host hierarchy projected into trusted renderer roots.
- Generic mechanism exercised: explicit durable parent identity plus child-local transform.
- Fixture: nested root/hot-replacement tests.
- Observed result: child-local pose and IDs remain stable through parent/child projection and implementation changes.
- Limits / non-claims: does not provide the later constraint/operator system.

### A26 — Package/instance lifecycle separation and migration
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; package lifecycle, fork, migration, and rollback .NET tests.
- Environment / process topology: .NET package coordinator and host-owned state.
- Generic mechanism exercised: distinct disable, duplicate-instance, fork-package, copy-parameters, migration, rollback operations.
- Fixture: package lifecycle/migration test suite.
- Observed result: identities and independent transforms follow operation semantics; bad migration is quarantined while compatible prior state remains.
- Limits / non-claims: reusable assembly export/import remains later work.

### A30 — Late result cannot resurrect deleted/expired state
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; package lifecycle/generation tests.
- Environment / process topology: host package lifecycle and revision validation.
- Generic mechanism exercised: explicit entity identity, generation/revision checks, deletion/lease invalidation.
- Fixture: stale lifecycle publication/result cases.
- Observed result: stale work cannot reactivate an invalid/deleted target through display-name rebinding.
- Limits / non-claims: concurrent model-authoring jobs are not an M1 feature.

### A31 — Draft and credential-process isolation
- Status: PASS
- Commit: `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; draft tests plus `m1-security.spec.ts` process-stub acceptance.
- Environment / process topology: isolated draft filesystem policy, deterministic credential-process stub, separate QuickJS guest pipeline.
- Generic mechanism exercised: canonical draft-root path enforcement and separation between credential-bearing process messages and guest execution.
- Fixture: product/auth sentinel files and `fake-credential-process.mjs`.
- Observed result: escape/rooted writes are denied, sentinels remain unchanged, stub receives only its health ping, and generated code executes only in the guest pipeline.
- Limits / non-claims: real Workspace-private OpenCode process separation must be re-proven in the later authoring milestone.

### A32 — Lifecycle/build hook denial
- Status: PASS
- Commit: `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; package manifest policy tests.
- Environment / process topology: trusted .NET package validation before activation.
- Generic mechanism exercised: closed manifest policy rejecting lifecycle scripts and unapproved plugin fields.
- Fixture: `postinstall`, `plugins`, and `buildPlugins` manifest fields.
- Observed result: candidates are rejected with `forbidden_manifest_field` before activation.
- Limits / non-claims: does not authorize arbitrary build tooling through another field.

### A33 — Host IPC/WebView forgery denial
- Status: PASS
- Commit: `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; host endpoint unit tests and invalid-session Playwright test.
- Environment / process topology: authenticated loopback WebSocket host boundary.
- Generic mechanism exercised: session authentication, strict envelope parsing, closed command surface, host-derived actor/generation context.
- Fixture: invalid token, forged top-level actor, forged payload actor/generation, unknown command.
- Observed result: invalid/forged inputs are rejected or ignored in favor of authenticated context; invalid session closes with policy violation.
- Limits / non-claims: localhost/CORS alone is not treated as authentication.

### A34 — Narrow capability widening denial
- Status: PASS
- Commit: `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; package manifest policy tests.
- Environment / process topology: trusted package manifest validation.
- Generic mechanism exercised: requested-capability allowlist for the M1 package profile.
- Fixture: filesystem, network, process, and native capability requests.
- Observed result: ungivable requests block candidate activation with `capability_not_available_in_m1`.
- Limits / non-claims: remembered-grant upgrade/revocation policy is later product-integration work.

### A35 — Renderer/context-loss recovery
- Status: PASS
- Commit: `96656b446fd9c3c75d86ee4af967b1a6ad11e8c6` and later M1 evidence head.
- Command: full M1 verifier; `m1-renderer-failure.spec.ts`.
- Environment / process topology: Chromium WebGL trusted renderer backed by authoritative host/SQLite state.
- Generic mechanism exercised: context-loss handling, renderer reconstruction from active package revision, trusted recovery controls.
- Fixture: `WEBGL_lose_context` acceptance after saved state.
- Observed result: committed world/package state survives context loss and reconstructs without granting new authority.
- Limits / non-claims: browser software/hardware backend evidence does not prove every physical GPU/driver.

### A36 — Trusted recovery cannot be self-approved
- Status: PASS
- Commit: Task 11/12 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; renderer-failure and security acceptance.
- Environment / process topology: trusted HTML recovery controls outside guest canvas/resource authority.
- Generic mechanism exercised: host/trusted pause-disable path and zero guest capability-grant route.
- Fixture: fake guest approval object/canvas interaction plus trusted Pause/Disable controls.
- Observed result: guest interaction leaves grant count unchanged while trusted recovery controls remain operable.
- Limits / non-claims: does not implement remembered user grants.

### A42 — Candidate activation half
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; package coordinator/runtime candidate tests.
- Environment / process topology: host package lifecycle with detached candidate renderer resources.
- Generic mechanism exercised: prepare/validate/stage before explicit activation acknowledgement.
- Fixture: valid/failed candidate preparation and progressive generation fixtures.
- Observed result: incomplete/failed candidate work does not displace the active generation; activation occurs only after accepted lifecycle transition.
- Limits / non-claims: model prose/stream completion acknowledgement is later authoring evidence.

### A43 — Package-local procedural motion versus root authority
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; trusted interaction and procedural runtime tests.
- Environment / process topology: scheduled guest ticks emit package-owned updates beneath trusted entity root.
- Generic mechanism exercised: local descriptor updates, trusted root transform, edit lease separation.
- Fixture: procedural point/uniform updates while root is moved.
- Observed result: procedural motion stays local and never overwrites the user-controlled root transform.
- Limits / non-claims: ephemeral procedural trajectories are not claimed durable.

### A47 — Positive creative-breadth descriptor matrix
- Status: PASS
- Commit: `96656b446fd9c3c75d86ee4af967b1a6ad11e8c6` and later M1 evidence head.
- Command: full M1 verifier; spatial projector tests and breadth Playwright acceptance.
- Environment / process topology: manually authored QuickJS package -> validated descriptors -> trusted Three.js projector.
- Generic mechanism exercised: `indexedGeometry` with custom attribute, `curve`, `shaderMaterial` with uniforms, `texture` via host asset handle, point `light`, `points` updates, and `instanced` draw.
- Fixture: `examples/world-packages/m1-breadth` plus line/procedural packages.
- Observed result: every named descriptor family projects, reloads under the same entity/revision, and runs without the guest importing Three.js.
- Limits / non-claims: no full Three.js API compatibility or large-group per-instance identity claim.

### A50 — Confused-deputy asset locator denial
- Status: PASS
- Commit: Task 11/12 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; asset resolver tests and `m1-security.spec.ts`.
- Environment / process topology: guest descriptor validation plus trusted host asset endpoint/resolver.
- Generic mechanism exercised: opaque `asset:sha256:*` handles and pre-fetch locator validation.
- Fixture: HTTP, file, traversal, UNC locators and active breadth texture asset.
- Observed result: forbidden locator syntax causes zero trusted fetches; accepted texture requests use opaque host handles.
- Limits / non-claims: future model/font/audio/include descriptor families require the same policy when implemented.

### A52 — Save/crash during active manipulation
- Status: PASS
- Commit: Task 10 evidence retained through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; `m1-runtime.spec.ts` unfinished-drag acceptance.
- Environment / process topology: host-authoritative edit lease + Chromium connection + SQLite checkpoint.
- Generic mechanism exercised: `edit.begin/update/commit/cancel`, connection-scoped lease cleanup, `workspace.save`, undo history.
- Fixture: committed move followed by unfinished drag, save, forced page close, reopen, undo.
- Observed result: reopen restores last host-accepted pose, active lease count returns to zero, and one undo returns to the initial pose without duplicate history.
- Limits / non-claims: only accepted state is checkpointed; local preview state is intentionally discarded.

### A53 — Structural durable-reference fixture
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; hierarchy, identity, picking, lifecycle tests.
- Environment / process topology: World Core durable entity/parent IDs plus stable semantic renderer keys.
- Generic mechanism exercised: opaque entity identity, explicit parent relationship, stable semantic handle key, missing-handle policy.
- Fixture: nested parent/child and regeneration/rollback structural fixtures.
- Observed result: structural identity survives rename/revision/regeneration without name/digest/proximity retargeting.
- Limits / non-claims: live cross-entity behavior/grant rule fixture belongs to the later behavior milestone.

### A57 — Pick/hit identity after regeneration
- Status: PASS
- Commit: M1 evidence through `41d558d696449f76a731cd1664d6243a063c1fca`.
- Command: full M1 verifier; `PickingResolver` and interaction tests.
- Environment / process topology: trusted renderer semantic root registry and picker.
- Generic mechanism exercised: current semantic instance/subpart key resolution independent of triangle identity.
- Fixture: regeneration followed by current/stale handle picking.
- Observed result: current semantic handle resolves; stale/missing handle reports `missing_handle` and requires re-selection.
- Limits / non-claims: does not make primitive/triangle IDs durable authority.

## Final Windows evidence

To be filled only from an observed `windows-latest` run of `scripts/verify-vnext-m1.ps1`:

- Workflow run: pending
- Commit under test: pending
- Node test counts: pending
- .NET test counts: pending
- Playwright acceptance count: pending
- Browser/GPU backend: pending
- Final script marker: pending

## Explicit M1 non-claims

This record makes no claim of the later constraint system, Coda/OpenCode authoring, multi-package/multi-tenant offender isolation, full Three.js API compatibility, equivalence between Playwright's GPU backend and all physical GPUs, real Windows application-surface integration in vNext, remembered-grant policy, voice replacement, reusable assembly import/export, guest-to-guest executable imports, advanced renderer-wide passes, or VR hardware support.
