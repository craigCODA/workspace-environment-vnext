# M2A Spatial Workspace Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A full-screen Windows spatial workspace with generic application surfaces and a persistent reviewed brick, preserving M1.
**Architecture:** Native .NET host authority and SQLite remain shared with M1. A separate full-viewport Three.js product entry and isolated Electron shell consume authenticated host contracts. Platform-neutral application ports isolate the Windows capture/input implementation.
**Tech Stack:** .NET SDK 8.0.425, C# 12, repository-pinned Three.js/Vite/QuickJS/Electron, Node 24.13+ for source launch, Playwright Chromium.
**Spec:** `docs/superpowers/specs/2026-09-12-m2a-spatial-workspace-shell-design.md`

## Global Constraints

- M1 base `3474aa01613cd93682a1571a56ab23718f336299`; implementation branch `m2/spatial-workspace-shell` only.
- Primary-monitor full-screen; no kiosk, Windows shell replacement, or Windows/Alt+Tab suppression.
- No per-application adapters or executable-name conditionals.
- M2A reviewed brick fixture; natural-language authoring belongs to M2B.
- World Core owns all persistent IDs, transforms and bindings; transient handles/tokens never persist.
- New M2A profile; original M1 entry and database remain intact.
- Physical Windows acceptance is separate from deterministic/headless tests.

## File map

`src/Workspace.Runtime/Applications/`: platform port DTOs, selector matching, bounded session/capture services.
`src/Workspace.Windows/`: WGC and Win32 adapters plus a Windows-only project.
`apps/host/Workspace.Host.Windows.csproj`: Windows composition sharing host source without altering the cross-platform M1 target.
`apps/host/Protocol/WorkspaceCommandService.M2A.cs`: additive trusted world/selector commands.
`apps/host/M2A/`: seeding, platform endpoints and composition helpers.
`apps/spatial/workspace.html`, `src/workspace/`: product renderer, navigation, object manipulation, app surface streaming, UI.
`apps/desktop/`: Electron composition, preload, local asset server and supervision.
`scripts/run-m2a.mjs`, `scripts/m2a-processes.mjs`: safe source launcher/build/packaging.
`tests/acceptance/m2a-*.spec.ts`: real host/browser world acceptance.
`tests/Workspace.Host.Tests/M2A*.cs`: world/transport/security acceptance.
`docs/architecture/vnext/m2a-acceptance.md`: commands run, exact evidence and limitations.

### Task 1: Durable M2A world and application contracts

Consumes `WorldEngine`, `WorldEntity`, `SqliteWorldStore`, `WorkspaceCommandService`.
Produces additive trusted CRUD/parameter commands, `M2AWorld.SeedAsync`, reusable desktop authentication and the application port contract.

- [ ] Add failing tests for untrusted rejection, room/brick/surface seed, parameter round-trip, transform undo, selector persistence without HWND/PID, and desktop reload authentication.
- [ ] Run `dotnet test tests/Workspace.Host.Tests --filter M2A` and retain the first expected missing-behavior failure.
- [ ] Add M2A seeding and command wiring. `entity.create` accepts only reviewed M2A template IDs; protected binding metadata can only change through `surface.bindWindow`.
- [ ] Include parameters in world snapshots, reject unknown/reserved patches, require expected revisions, leave M1 seeding unchanged.
- [ ] Run M1 and new .NET tests, record counts, commit the independently testable host changes.

Required behavior assertion:
```csharp
Assert.False((await Send("parameters.patch", guestContext)).Accepted);
Assert.Equal(before.Id, afterRestart.Id);
Assert.DoesNotContain("hwnd", serializedWorld, StringComparison.OrdinalIgnoreCase);
```

### Task 2: Generic Windows platform and control lifecycle

Consumes application port and world selector schema. Produces `WindowsApplicationPlatform` plus authenticated frame/control/input routes.

- [ ] Add failing platform-neutral tests for exact/ambiguous/missing selector matching, obsolete discovery IDs, lease session mismatch, release and expiry.
- [ ] Port WGC and existing input primitives with path/commit provenance. Add generic discovery using process-start identity and window class.
- [ ] Implement bounded capture sessions; recheck live identity at use time. Native fallback is explicit; no executable-name conditions.
- [ ] Add short-lived control grants and release-on-disconnect; reject malformed/infinite coordinates, oversized text, and missing auth before platform calls.
- [ ] Compile the Windows target and carry input mapping regressions. Hardware fixtures report unavailable capture distinctly rather than silently pass.

Required behavior assertion:
```csharp
Assert.Null(WindowSelector.Match(saved, twoMatchingWindows));
Assert.False(leases.Allows(otherSession, surfaceId, leaseId));
```

### Task 3: Full-window room and durable direct manipulation

Consumes host world/command contracts and the existing QuickJS/projector runtime. Produces `workspace.html`, `WorkspaceScene`, `Navigation`, `WorkspaceClient` and `WorkspaceUI`.

- [ ] Add failing viewport/coordinate/input-ownership tests and browser launch assertion.
- [ ] Implement full-window rendering with resize and pixel-ratio handling, neutral room, WASD/camera capture, and trusted UI.
- [ ] Prepare the reviewed brick through QuickJS; apply accepted root transforms. Move/scale/rotate/tint through normal host commands, with pointer previews and one commit per drag.
- [ ] Implement cancellation, undo/redo, save status and visible missing-session/startup errors.
- [ ] Run typecheck, tests and Chromium world acceptance; inspect a rendered screenshot before commit.

Required browser assertions:
```ts
await expect(page.locator('canvas[data-m2a-world]')).toBeVisible();
expect(await page.locator('canvas').boundingBox()).toMatchObject({ width: 1280, height: 720 });
await expect(page.getByTestId('connection-status')).toHaveText('Connected');
```

### Task 4: Live generic surfaces in the same world

Consumes platform routes and entity snapshots. Produces `ApplicationSurfaces`, generic picker, Use-mode routing and rebind/status actions.

- [ ] Test aspect mapping, black-bar rejection, latest-frame sequencing and interaction cleanup.
- [ ] Bind a selected discovered window to an existing/new screen; use safe text nodes for window titles.
- [ ] Fetch bounded latest frames, use textures, dispose old frames on rebind/removal/context loss and show unavailable/minimized/missing states.
- [ ] Forward normalized UV pointer/key/text input only in Use mode with a control lease. Release on blur/Escape/mode change; keep OS escape combinations local.
- [ ] Test two arbitrary window fixture IDs without app-specific code, then real Windows fixture separately.

### Task 5: Safe full-screen desktop launch and source workflow

Consumes built spatial assets and the Windows host target. Produces `npm run m2a` and staged Windows desktop artifact.

- [ ] Write failing tests for primary-monitor bounds, fullscreen/no-kiosk policy, navigation/preload scope, and safe npm child invocation.
- [ ] Invoke npm through Node plus `npm-cli.js` rather than spawning `npm.cmd`; install pinned dependencies and explicitly ensure Electron's binary.
- [ ] Start a loopback static server and .NET host, parse host-issued token/port, load the full product URL directly in Electron.
- [ ] Add primary-display fullscreen, single-instance behavior, recovery/minimize/exit and owned-child cleanup. Show actionable startup errors.
- [ ] Test real cold install/build path on Windows, not only `--skip-install --skip-build`. Stage built host/assets with the shell.

Required shell assertion:
```js
assert.equal(options.fullscreen, true);
assert.equal(options.kiosk, false);
assert.equal(options.webPreferences.nodeIntegration, false);
assert.equal(options.webPreferences.sandbox, true);
```

### Task 6: Restart proof, packaging and evidence

- [ ] Preserve M1 tests and run all new tests/typechecks/builds.
- [ ] Move the brick/screen, change tint, save, stop the host entirely, restart against the same temporary directory and assert IDs/poses/selectors match.
- [ ] Test denied control, unavailable platform, stale/ambiguous window reconnect, visible startup failure and renderer recovery.
- [ ] Run Windows compile/CI and inspect exact artifacts; never report installed-app/game compatibility from headless or mock evidence.
- [ ] Write `m2a-acceptance.md`, README launch instructions and remaining hardware gates. Publish source/artifact with exact revision, leaving main/M1 untouched.
