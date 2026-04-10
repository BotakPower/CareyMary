# CareyMary Build Progress

> Running log of what's shipped on `uat` and who owns what next.
> Anyone running `cat docs/CAREYMARY_PROGRESS.md` should get the current state in under 30 seconds.

**Hackathon:** Agora Voice AI Hackathon Singapore 2026 — 2026-04-10
**Team:** Edmund (Dev 1) · ZhiHao (Dev 2) · SimYee (Dev 3) · Cody (Dev 4)
**Current state:** ✅ All four dev lanes merged to `uat`. Live Agora voice loop verified end-to-end.

---

## Current State — ALL SHIPPED ✅

| Module | Owner | Status | File(s) |
|---|---|---|---|
| Foundation (Electron + types + scaffold) | Edmund | ✅ shipped (tag `foundation-v0`) | `src/main/`, `src/preload/`, `src/renderer/`, `src/types/`, `package.json`, `tsconfig.json` |
| Screen monitor | ZhiHao + Edmund | ✅ shipped (active-win → get-windows swap for Electron ABI compat) | `src/core/screen-monitor.ts` |
| Timer manager | ZhiHao | ✅ shipped | `src/core/timer-manager.ts` |
| Context engine | Edmund | ✅ shipped | `src/core/context-engine.ts` |
| Session stats | Edmund | ✅ shipped | `src/core/session-stats.ts` |
| Agora ConvoAI agent (REST) | Edmund | ✅ shipped | `src/core/agora-agent.ts` |
| Agora RTC client (renderer SDK) | Edmund | ✅ shipped | `src/core/agora-rtc.ts`, `src/renderer/overlay.ts` |
| IPC wiring + main loop | Edmund | ✅ shipped | `src/main/ipc-handlers.ts`, `src/preload/preload.ts`, `src/main/index.ts` |
| RTC test harness | Edmund | ✅ shipped | `test-harness/rtc-test.html` |
| System tray | SimYee + Edmund | ✅ shipped (wired into main/index.ts) | `src/main/tray.ts`, `src/main/index.ts` |
| Character sprite UI | Cody + Edmund | ✅ shipped (sprite via CSS state classes; co-lives with RTC client in overlay.ts) | `src/renderer/overlay.ts`, `src/renderer/styles.css`, `src/renderer/careymary-spritesheet.png`, `scripts/copy-renderer-assets.js` |
| Real Agora credentials | ZhiHao | ✅ populated in `.env`; `AGORA_ENABLED=true` verified live | `.env` |

---

## Live Smoke Test — 2026-04-10

Ran `npm start` with `AGORA_ENABLED=true` and real credentials:

- ✅ `ScreenMonitor` started, classifies active app correctly (`app=Warp category=productive`)
- ✅ `TimerManager` started
- ✅ `AgoraAgent.start()` → `POST /join` returned `agent_id=A42AN82VM77PN22VJ73XN94NN97ML73P`
- ✅ Context loop tick #1 + tick #2 → `POST /update` succeeded, `prompt length=2090 → 2099` (growing as session stats accumulate)
- ✅ Tray icon visible, context menu working
- ✅ Overlay sprite renders in bottom-left, animates through `idle → happy` states based on screen category
- ⚠️ Chromium logs `BUNDLE codec collision` SDP warnings — cosmetic, audio works fine

---

## Merge Log

### 2026-04-10 — Foundation (Edmund)
- Electron shell, transparent overlay, preload bridge, shared types, scaffold
- macOS visibility + multi-space fix
- Tag: `foundation-v0`

### 2026-04-10 — Monitors (ZhiHao → merged into Edmund's ZM branch)
- `ScreenMonitor` — polling every 5s, app categorization, `'change'` events
- `TimerManager` — water/break/posture/stretch reminders, acknowledge API, `'reminder'` events
- Tests: `tests/screen-monitor.test.ts`, `tests/timer-manager.test.ts`

### 2026-04-10 — Dev 1 Agora + Context (Edmund) — SHIPPED
- Expanded `CareyMaryAPI` preload contract with RTC control channels (`onStartRTC`, `onStopRTC`, `onSetMicEnabled`, `notifyRendererReady`)
- `AGORA_ENABLED` dry-run flag — app boots + context loop logs prompts without real credentials
- Shipped: context-engine, session-stats, agora-agent (REST), agora-rtc (renderer SDK wrapper), ipc-handlers, main process wiring, RTC test harness
- Context loop: 30s tick builds prompt from ScreenMonitor + TimerManager + SessionStats, pushes to AgoraAgent, broadcasts character-state to overlay
- **Screen monitor swap:** active-win's native N-API binary wouldn't self-register under Electron 33's ABI even after `electron-rebuild`; swapped to `get-windows` (maintained successor, uses a spawned Swift binary — no N-API rebuild needed). macOS grants screen recording permission on first run.

### 2026-04-10 — Dev 4 Character Sprite (Cody → merged into uat)
- 2×2 spritesheet (`src/renderer/careymary-spritesheet.png`), CSS-driven animation via `.state-idle/.state-talking/.state-alert/.state-happy/.state-sleeping` on `#character`
- `scripts/copy-renderer-assets.js` replaces the inline build step so `.png` assets ship into `dist/renderer/`
- `src/main/overlay-window.ts` — merge kept Edmund's macOS visibility fixes (`focusable: true`, `setVisibleOnAllWorkspaces`, `ready-to-show`)
- **Conflict resolution:** `src/renderer/overlay.ts` merged Cody's sprite state machine with Edmund's inlined `AgoraRTCClient` — one file now owns both the visual layer and the RTC client
- **Conflict resolution:** `src/renderer/index.html` — kept Cody's empty `#character` div + ARIA, kept Edmund's Agora SDK `<script>` tag

### 2026-04-10 — Dev 3 System Tray (SimYee) — MERGED
- `src/main/tray.ts` — tray icon + context menu (mute mic, pause, ack water, ack break, quit)
- Tray actions fire synthetic `ipcMain.emit()` events on these channels:
  - `tray:mic-toggle` (payload: `isMuted: boolean`)
  - `tray:pause-toggle` (payload: `isPaused: boolean`)
  - `tray:ack-water`
  - `tray:ack-break`
- Placeholder transparent PNG used until `assets/tray-icon.png` lands
- **Wired by Edmund in `main/index.ts`:**
  - `tray:mic-toggle` → `requestSetMicEnabled(overlayWindow, !muted)` (bridges to the renderer's AgoraRTCClient)
  - `tray:pause-toggle` → module-level `isPaused` flag; context loop tick returns early when paused
  - `tray:ack-water` / `tray:ack-break` → `timerManager.acknowledge('water' | 'break')`
  - Tray created in `app.whenReady`, destroyed in `before-quit`

### 2026-04-10 — Dev 2 Real Agora Credentials (ZhiHao) — DONE
- Filled `.env` with `AGORA_APP_ID`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`, `AGORA_RTC_TOKEN`
- Flipped `AGORA_ENABLED=true`
- End-to-end voice loop verified: `/join` returned real `agent_id`, `/update` succeeded, audio round-trip working

---

## How to Run

```bash
npm install
cp .env.example .env   # fill in Agora credentials
npm start
```

**Dry-run mode** (`AGORA_ENABLED=false`):
- Transparent overlay in bottom-left corner (200×200) with animated sprite
- Console logs every 30s from the context loop
- `[AgoraAgent] DRY RUN ...` lines showing what would be sent
- No network calls to Agora

**Live mode** (`AGORA_ENABLED=true`, credentials populated):
- Agent joins the Agora channel, greets the user
- Context updates every 30s with current screen state + session stats
- Tray menu controls mic/pause/reminders
- Character sprite reflects state (`idle`/`happy`/`alert`)

---

## Next Steps (remaining to submit)

1. ⬜ **Demo rehearsal** — run through the pitch flow, make sure voice responses land on cue
2. ⬜ **Bug bash** — short polish pass on tray icon asset, animation timing, any leftover console warnings
3. ⬜ **Submission** — record demo video, fill submission form, tag `uat` as `hackathon-submission`

See the per-dev breakdown at the bottom of the repo README for assignments.
