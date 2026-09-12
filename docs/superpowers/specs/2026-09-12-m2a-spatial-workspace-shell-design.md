# M2A: Full-screen spatial Workspace

Date: 2026-09-12
Owner: Craig Ramos
Status: Approved product direction in the owner conversation; implementation authorized by `start M2A`.
Base: `3474aa01613cd93682a1571a56ab23718f336299`
Branch: `m2/spatial-workspace-shell`

## Product contract

Workspace takes over the primary monitor with an edge-to-edge Three.js world. It is a place to use the computer, not a web page with a small renderer. Windows remains the operating system. Explorer, Alt+Tab, the Windows key, and recovery remain available. No kiosk mode, shell replacement, persistent always-on-top flag, or keyboard trap.

M2A contains a room, desktop navigation, Build/Edit and Use modes, generic live Windows surfaces, placement/resizing, a reviewed brick package, and durable save/reopen. M2B adds Coda/model-driven live authoring. The brick in M2A is explicitly a reviewed fixture, not a claimed English-to-code feature. M1's 640x360 acceptance entry remains independently runnable and testable; it is not the M2A interface.

Application support is capability-based, not application-based. No executable-name branches, program whitelist, or special adapters for Terminal, VS Code, Cursor, Steam, RuneScape, or other ordinary applications. A selected running window goes through the same discovery, binding, capture, presentation, and input interfaces. Compatibility tests exercise Windows behavior categories; applications do not need individual integration work.

## Composition and ownership

- `apps/desktop`: isolated Electron desktop composition, using the repository's pinned Electron runtime. This is a new full-screen desktop shell, not a claim that the prototype WinUI/Coda application was ported. It owns window lifetime, primary-display bounds, recovery/exit, safe local asset serving, and host process supervision.
- `apps/spatial/workspace.html` and `apps/spatial/src/workspace`: the full-window product entry and focused renderer/interaction modules. The M1 `index.html`/`src/main.ts` entry is preserved.
- `apps/host`: the same .NET World Core/SQLite composition, with an explicit `--m2a` profile and optional Windows adapter build. Host-owned commands authorize all durable changes. Existing M1 entry/acceptance behavior remains available.
- `src/Workspace.Runtime/Applications`: platform-neutral window/capture/input ports and binding reconciliation. No Three.js or HWND values in persisted world state.
- `src/Workspace.Windows`: deliberately ported Win32/WGC adapters. Only the Windows host target references them.
- `examples/world-packages/m2a-brick`: reviewed guest SDK fixture. Isolated QuickJS creates its geometry; host-owned root placement persists independently.

No new cloud service, API key, model dependency, virtual-display driver, or app-specific plugin is required by M2A. Offline ordinary interaction remains a requirement after installation.

## Persistent and transient state

M2A uses a separate profile under the vNext local application data root. It never overwrites the M1/prototype profile. Room, brick, and screen entities have stable opaque IDs, authoritative transforms, parameters, and revision vectors in SQLite. Surface dimensions/tint and application selectors are durable parameters. A window selector stores executable identity/path, window class, and a title hint. Runtime HWNDs, PIDs, stream IDs, control leases, session tokens, pressed keys, pointer capture, and GPU handles are transient.

Reconnection checks current Windows facts. An exact unique selector match may reattach; missing or ambiguous matches leave the same spatial object visible with a truthful status and a rebind action. Never silently choose the first of several matching application windows. No automatic application launch on reopen. A deliberate Open saved application action may launch only the host-recorded executable, not arbitrary paths or command lines supplied by the renderer.

The default world is seeded only when a new M2A database is empty. It contains a neutral room, a screen awaiting a selected application, and a brick instance. Loading and relaunching do not reset an existing world. Save serializes accepted host state, never pointer previews. One completed drag is one history operation; Escape/blur/disconnection cancels previews and releases transient input state.

## Desktop and interaction

Borderless full-screen on the primary display; other displays remain ordinary Windows displays. Full-window rendering follows the actual viewport and device pixel ratio rather than a fixed 640x360 size. A small trusted dock exposes Applications, Add brick, Use/Edit, Undo/Redo, Save, and Desktop/Exit. A contextual inspector supplies position, rotation, scale, and tint controls. Status/error text is visible, not hidden in diagnostics.

WASD movement and mouse look operate only while the world owns pointer capture. Clicking empty world space requests pointer capture; Escape releases it. UI controls, transform handles, and application surfaces never initiate camera movement. Edit mode selects/places/resizes world entities; Use mode routes input to a selected surface. App typing must not move the camera or trigger world shortcuts. Blur and leaving Use mode release held input. Alt+Tab and Windows key are never globally suppressed. Ctrl+Alt+Backspace is a trusted escape to the ordinary desktop.

A surface uses a live captured frame as a Three.js texture with aspect-correct presentation. UV hits map through the displayed content rectangle, not through letterbox bars, to normalized capture coordinates. Resizing a spatial screen does not resize/kill the real application process.

## Generic Windows compatibility boundary

Windows Graphics Capture is the initial capture backend, ported from the prototype. Captured windows remain real, unmodified Windows windows. Do not minimize or hide them automatically: minimized applications can stop producing frames. Missing/closed, minimized, protected, denied, and unavailable capture states must be distinguishable from a healthy live frame. No fake terminal, simulated desktop, or stale screenshot labeled live.

Input is behind an application-neutral interface. Ordinary window-message routing can keep Workspace foreground where the target supports it. Explicit foreground/native handoff remains available for windows requiring OS focus or raw input. Queueing a message or SendInput succeeding does not itself prove a third-party application processed the event. A game/anti-cheat/DRM/elevated/secure-desktop restriction is reported honestly, not bypassed. Universal in-world game compatibility is not inferred from a Win32 test fixture.

The Windows port preserves the prototype WGC lifecycle and foreground input router, with separate generic message-mode routing and host validation. No injected DLLs, process patching, driver installation, anti-cheat workarounds, or integrity-level escalation. Physical capture/input/game compatibility is an acceptance gate that automated headless tests cannot replace.

## Security and lifecycle

Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no remote page navigation, no arbitrary window creation, no broad IPC proxy. Preload exposes only the desktop escape/exit controls. Local static server serves only the built spatial assets with traversal checks and a restrictive content policy. Launch configuration is supplied directly to the trusted entry; it does not pass through `cmd start` or rely on manually copied fragments.

The host binds only loopback, authenticates every world connection and frame/input request, validates origins, and issues a cryptographically random desktop-session token. Desktop reconnection is distinct from M1's single-consumption session tests. Guest packages never receive the token or native bridge.

Window IDs come from a host discovery snapshot and are checked against current process/window identity before capture or input. A durable selector is not a control grant. Explicit Use activation yields a short-lived session-scoped control lease. Held input is released on expiry, release, blur, renderer close, or host shutdown. Input payloads are bounded and validated. Caps bound active captures and image-transfer work; slow frames do not accumulate a queue.

Startup errors stop owned child processes and show a readable recovery/error message. Host failure cannot leave an apparently connected scene. Quit affects only Workspace's processes, not the user's bound applications. A packaged Windows artifact includes its host/runtime and built assets; source launch reports/install-checks prerequisites without swallowing the underlying error.

## Acceptance

M2A-01: exact full-screen primary-monitor window policy, sandbox/preload/navigation checks.
M2A-02: full-viewport scene and resize, first-person movement/input ownership, visible startup failures.
M2A-03: generic discovery/binding; stale IDs, duplicate matches, missing windows, and denied requests fail safely.
M2A-04: real Windows capture/input fixture, focus/native fallback, resize/closed/minimized status; hardware/installed-app checks recorded separately.
M2A-05: direct brick/screen move/resize/tint, undo/redo and save, then full host restart with the same IDs/poses/binding selector.
M2A-06: no model requests; guest package and app surfaces coexist, context-loss recovery, held-input cleanup.
M2A-07: fresh source launcher exercises dependency/build paths; published artifact is inspected and its exact commit recorded.
M1 regression gate remains required. Passing mocks, fixture transports, or dry-run shell policies alone never closes physical Windows acceptance.

## References and provenance

Prototype reference commit: `58822736500e98192429297c6ab5cf3c919be14a` in `craigCODA/workspace-environment`, carried unchanged into M1 snapshot `3474aa0` in this repository. Port sources: `apps/host-windows/src/Workspace.Host/Windows/{GraphicsCaptureWindowCapture,Win32InputRouter,IInputRouter,IWindowCapture,WindowSnapshot,SurfaceFrame}.cs`. Corresponding input mapping/lifecycle tests are port candidates. Old coordinators, old world persistence, and old app UI are not adopted as vNext authority.

Primary technical references checked 2026-09-12:
- https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/tutorial/sandbox
- https://nodejs.org/api/child_process.html
