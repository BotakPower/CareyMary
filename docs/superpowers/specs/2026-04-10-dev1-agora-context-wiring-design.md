# CareyMary Dev 1 Lane — Agora + Context + Wiring Design

**Date:** 2026-04-10
**Author:** Edmund (Dev 1)
**Branch baseline:** `ZM` (foundation-v0 + ZhiHao's monitors merged)
**Hackathon constraint:** Must ship ~3h including integration

---

## Goal

Build the "brain + voice" of CareyMary: context engine, Agora ConvoAI REST lifecycle, Agora RTC client in the renderer, IPC wiring, and the main-process orchestration loop. Ship it in dry-run mode so the app boots and the context loop runs without real Agora credentials; real credentials flip a flag to go live.

## Non-Goals

- System tray menu (SimYee, Dev 3)
- Sprite animation (Cody, Dev 4)
- Real Agora credentials (Edmund + ZhiHao later)
- Database / persistence (hackathon)
- Multi-user / multi-channel (hackathon)

## Architecture

```
                   ┌─────────────────── Main Process ───────────────────┐
                   │                                                     │
    active-win ──→ │  ScreenMonitor  ──→ 'change'  ──→ SessionStats      │
                   │                                                     │
     (timer)  ───→ │  TimerManager   ──→ 'reminder'                      │
                   │                                                     │
                   │  ┌──────────────── 30s loop ────────────────┐       │
                   │  │  ContextEngine.buildContextPrompt(...)   │       │
                   │  │         │                                 │      │
                   │  │         ▼                                 │      │
                   │  │  AgoraAgent.updateContext(prompt)  ──REST─┼───→ Agora API
                   │  │         │                                 │      │
                   │  │         ▼                                 │      │
                   │  │  ipcHandlers.broadcastCharacterState()   │      │
                   │  └──────────────────────┬───────────────────┘      │
                   │                         │                          │
                   └─────────────────────────┼──────────────────────────┘
                                             │ IPC (preload contextBridge)
                                             ▼
                   ┌─────────────── Overlay Renderer ───────────────────┐
                   │                                                    │
                   │  window.careymary API                              │
                   │    ├─ onCharacterState(cb) → swaps #character text │
                   │    ├─ onStartRTC(cb) → AgoraRTCClient.join()       │
                   │    ├─ onStopRTC(cb) → AgoraRTCClient.leave()       │
                   │    └─ onSetMicEnabled(cb) → track.setEnabled()     │
                   │                                                    │
                   │  AgoraRTCClient (wraps agora-rtc-sdk-ng)           │
                   │    dry-run: logs join/leave/mic, no SDK calls     │
                   │                                                    │
                   └────────────────────────────────────────────────────┘
```

## Dry-run contract

A single env var `AGORA_ENABLED` gates all network/SDK side effects:

- `AGORA_ENABLED=false` (default): `AgoraAgent` methods log the payload they *would* send and return mock data. `AgoraRTCClient` methods log their arguments and no-op the SDK calls. The context loop still builds prompts and logs them on every tick.
- `AGORA_ENABLED=true`: real REST + real SDK. No other code changes needed.

This lets Edmund ship a working, inspectable app today and ZhiHao flip a single flag when credentials land.

## File Manifest

| # | Path | Action | Purpose |
|---|------|--------|---------|
| 1 | `src/types/index.ts` | Modify | Expand `CareyMaryAPI` with RTC control channels |
| 2 | `.env.example` | Modify | Add `AGORA_ENABLED=false` + full Agora vars |
| 3 | `docs/CAREYMARY_PROGRESS.md` | Create | Running progress log keyed by dev + timestamp |
| 4 | `src/core/context-engine.ts` | Create | `buildContextPrompt()`, `CAREYMARY_SYSTEM_PROMPT`, `formatDuration()` |
| 5 | `src/core/session-stats.ts` | Create | Accumulates productive/distraction time from ScreenMonitor |
| 6 | `src/core/agora-agent.ts` | Create | `AgoraAgent` class — start / updateContext / stop, dry-run aware |
| 7 | `src/core/agora-rtc.ts` | Create | `AgoraRTCClient` class — join / leave / setMicEnabled, dry-run aware |
| 8 | `src/renderer/overlay.ts` | Modify | Instantiate AgoraRTCClient + listen to `onStartRTC`/`onStopRTC`/`onSetMicEnabled`/`onCharacterState` |
| 9 | `test-harness/rtc-test.html` | Create | Standalone Agora RTC test page — load in Chrome, test credentials before Electron |
| 10 | `src/preload/preload.ts` | Modify | Expose expanded `window.careymary` API |
| 11 | `src/main/ipc-handlers.ts` | Create | Registers + broadcasts all IPC channels from one place |
| 12 | `src/main/index.ts` | Modify | Wire everything, start modules, run 30s context loop |

## Key Design Decisions

### 1. RTC lives in the overlay renderer, not a hidden window

Agora RTC SDK requires browser audio APIs (`getUserMedia`, `AudioContext`). These work in any Electron renderer. Creating a second hidden window would double the Electron boilerplate for zero benefit — the overlay renderer is always alive as long as the app is running, which is exactly when we want the mic on.

`setIgnoreMouseEvents` only affects pointer events, not audio. Confirmed by Electron docs.

### 2. ContextEngine is stateless (pure functions)

`buildContextPrompt(screen, timers, dueReminders, sessionStats)` is a pure function. No class, no state, no side effects. Easy to unit-test, easy to reason about. `CAREYMARY_SYSTEM_PROMPT` is an exported const.

### 3. SessionStatsTracker is a tiny class, not a module-level singleton

~40 lines. Subscribes to `ScreenMonitor.on('change')`, accumulates productive/distraction seconds. Exposes `getStats(): SessionStats`. Easy to test with a fake ScreenMonitor.

### 4. AgoraAgent receives config via constructor, not reads env itself

The main process reads `process.env` once at startup and passes credentials + `enabled` flag to the constructor. Keeps the core module testable (no env pollution) and makes dry-run trivial.

### 5. IPC channel names are string constants in one place

`src/main/ipc-handlers.ts` exports an `IPC_CHANNELS` const so the preload and main stay in sync. Typo-proof.

### 6. Dry-run renderer still instantiates AgoraRTCClient

Even in dry-run, the renderer constructs `AgoraRTCClient` so the IPC handlers have a live instance to call. The class internally checks `enabled` and no-ops. This way the wiring is real; only the network side effects are gated.

## Agent Dispatch Plan

Subagents dispatched **sequentially** to avoid file conflicts. Two-stage review (spec compliance + code quality) after each.

**Stage 0 (me — contract work):**
- File 1: `src/types/index.ts` expansion
- File 2: `.env.example` update
- File 3: `docs/CAREYMARY_PROGRESS.md` scaffold

This establishes the type contract before any agent runs.

**Stage 1 — Agent Core (sequential):**
- Files 4, 5, 6
- No Electron imports. Pure Node + `fetch`.
- Tests: none required (hackathon). Must `tsc --noEmit` clean.

**Stage 2 — Agent RTC (sequential):**
- Files 7, 8, 9
- File 7 uses `agora-rtc-sdk-ng` (already in package.json)
- File 8 modifies the existing `overlay.ts` — must preserve the "no top-level imports/exports" constraint (it's loaded as a plain script)
- File 9 is a standalone HTML file with inline scripts — uses Agora RTC SDK from CDN for zero-build testing

**Stage 3 — me (integrator):**
- Files 10, 11, 12
- Wires everything together in main process. Avoids subagent conflicts on `index.ts` since it touches many things.

**Stage 4 — verification:**
- `tsc --noEmit` → 0 errors
- `npm run build` → dist/ populated, test-harness/ copied or left as-is
- `npm start` → overlay visible, console shows "ScreenMonitor started", "TimerManager started", "Context loop started", first context prompt logged after 30s (or on first tick if we add immediate kick)
- Open `test-harness/rtc-test.html` in Chrome with stub credentials, verify UI renders (join button etc.)

## Verification Protocol

**Success criteria:**
1. `npx tsc --noEmit` exits 0
2. `npm run build` exits 0, produces `dist/main/*`, `dist/core/*`, `dist/preload/*`, `dist/renderer/*`
3. `npm start` opens the overlay window (bottom-left, visible, click-through)
4. Console output includes:
   - `[ScreenMonitor] started`
   - `[TimerManager] started`
   - `[ContextLoop] tick #1` within 30s
   - `[AgoraAgent] DRY RUN — would POST to /join with payload: {...}`
   - `[AgoraRTCClient] DRY RUN — would join channel {channel} as uid {uid}`
5. Overlay renderer changes `#character` text when `character-state` IPC fires
6. `test-harness/rtc-test.html` opens in Chrome and renders its controls (join/leave/mute buttons, status text)

**Rollback:**
- All work happens on branch `ZM`. If anything breaks, `git reset --hard b03459e` (pre-ZhiHao-merge foundation) or the last known-good tag.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Agora SDK import breaks Electron renderer | Test harness first (file 9) validates the SDK in pure Chrome. If it works there, any Electron failure is an Electron-specific issue we can isolate. |
| Dynamic import of `active-win` (ESM) in core | Already solved by ZhiHao in `screen-monitor.ts`. Follow same pattern if needed. |
| IPC channel naming drift between main/preload | Centralize in `src/main/ipc-handlers.ts` as exported `IPC_CHANNELS` const. Preload imports the same const. |
| `overlay.ts` renderer can't `import` — no-top-level-imports constraint | Load the Agora SDK as a plain `<script>` in `index.html` pointing to `node_modules/agora-rtc-sdk-ng/AgoraRTC_N-production.js`. The SDK exposes `AgoraRTC` as a global. `overlay.ts` references it via `(window as any).AgoraRTC` with a local type alias. Preserves the no-top-level-imports constraint, matches the test harness pattern, no tsconfig split needed. |
| 30s loop collides with first startup (no state yet) | First tick happens at T+30s by default. Also fire an immediate tick on startup so the context engine runs once and logs something visible within 1s. |
| Agora REST request shape | Document is copied verbatim from CAREYMARY_CONTEXT.md spec — if Agora changes the API, update once in `agora-agent.ts`. |

## Open Questions (answered during brainstorming)

- **Credentials?** B — not yet, dry-run mode default ✓
- **Test harness?** Build it — `test-harness/rtc-test.html` ✓
- **RTC location?** Overlay renderer (not hidden window) ✓
- **Tray/character deferred?** Yes, SimYee/Cody lanes ✓

## Success = Demo Readiness

At the end of this lane, running `npm start` should produce:

1. A transparent overlay in the bottom-left (foundation, untouched)
2. Console logs every 30s showing CareyMary's *reasoning* — what she would tell the Agora agent right now, based on live screen state and timers
3. A clean plug point for ZhiHao to drop credentials into `.env` and flip `AGORA_ENABLED=true` → instant voice loop
4. A clean plug point for Cody's sprite work — the `character-state` IPC is already firing
5. A clean plug point for SimYee's tray — `TimerManager.acknowledge()` is already exposed

No architecture changes needed from the other devs to integrate.
