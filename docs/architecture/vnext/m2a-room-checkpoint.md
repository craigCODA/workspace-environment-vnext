# M2A room checkpoint

Date: 2026-09-12
Status: Task 3 implementation checkpoint. M2A is NOT complete.
Branch: `m2/spatial-workspace-shell`
Approved scope: `docs/superpowers/specs/2026-09-12-m2a-spatial-workspace-shell-design.md`

## What this checkpoint implements

The product entry at `apps/spatial/workspace.html` fills its browser viewport with a Three.js room. It preserves M1's separate `index.html` acceptance entry. The neutral room includes a screen placeholder and a real isolated QuickJS brick package. Workspace owns selection, camera input, object controls and saved state; generated package code never gets the host session token.

WASD movement requires pointer lock acquired on empty world space; Escape and blur release it. The inspector exposes position, rotation, scale, dimensions and tint through host commands. Pointer dragging uses an edit lease and commits one history operation on release. Undo, Redo and Save use the authoritative host. Missing connection configuration and host disconnects are visible rather than silent blank pages.

The brick template is now staged independently of placed brick instances. Removing the last brick no longer makes the next brick invisible. A missing template is rejected explicitly.

## Verification performed

The following commands completed successfully in the Linux working environment using Node 24.13.0, .NET SDK 8.0.425 and repository-locked dependencies:

```sh
npm run vnext:contracts:check
npm run vnext:test:node
npm run vnext:typecheck
npm run build --workspace @workspace/vnext-spatial
dotnet test Workspace.VNext.sln --configuration Release --no-restore
xvfb-run -a node node_modules/@playwright/test/cli.js test --config tests/acceptance/playwright.config.ts --reporter=line
xvfb-run -a node node_modules/@playwright/test/cli.js test --config tests/acceptance/playwright.m2a.config.ts --reporter=line
```

Results: 36 Node tests; 67 .NET tests; 13 M1 Chromium acceptance tests; 7 M2A Chromium acceptance tests. No failures or skipped tests in those suites. The contracts workspace has no Node test cases; schema checks are a separate command. Vite emits a large-bundle warning for the existing runtime chunks. This is not a warning-free build claim.

The seven M2A browser tests prove: full viewport/resize with an active guest package; visible missing launch configuration; brick edit/Undo/Redo/Save and complete host restart preserving entity state; camera input ownership; brick creation after removal of the last instance; tint/dimension edits and renderer context recovery; and a screen drag with exactly one commit plus Undo. Each test owns a separate temporary SQLite profile, real .NET host and Vite instance. The screen-drag test's initial order dependency was removed by isolating each test.

A 1600x900 screenshot was rendered and visually inspected. The screen visibly says it needs a running Windows window. It is not a fake application frame.

## Not implemented or not verified here

- Generic application picker, frame consumption, aspect-correct textures and Use-mode input routing (Task 4).
- Borderless primary-monitor Electron shell, native escape/exit and cold one-command launch (Task 5).
- Finished Windows distribution and complete M2A acceptance (Task 6).
- Installed third-party application/game compatibility, physical GPU capture/input, multi-monitor/fullscreen behavior.
- Coda/natural-language creation, voice and VR (outside M2A).

Do not describe this checkpoint as a finished M2A release or tell users that `npm run m2a` is available. No automatic hiding/minimizing of application windows has been introduced. Main and the M1 branch have not been changed.

## Resume

Continue Task 4 from the approved implementation plan. Reuse `ApplicationSurfaceService` and the existing authenticated `/m2a` host endpoints, add behavior-first mapping/stream/input tests, then implement the generic client and picker. Keep the existing successful M1 and room gates.
