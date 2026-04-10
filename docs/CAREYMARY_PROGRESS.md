# CareyMary Build Progress

> Running log of what's shipped on `uat` and who owns what next.
> Update after every merge. Anyone running `cat docs/CAREYMARY_PROGRESS.md` should get the current state in under 30 seconds.

**Hackathon:** Agora Voice AI Hackathon Singapore 2026 — 2026-04-10
**Team:** Edmund (Dev 1) · ZhiHao (Dev 2) · SimYee (Dev 3) · Cody (Dev 4)
**Current integration branch:** `ZM` (will merge to `uat` at T+3:30)

---

## Current State

| Module | Owner | Status | File(s) |
|---|---|---|---|
| Foundation (Electron + types + scaffold) | Edmund | ✅ shipped (tag `foundation-v0`) | `src/main/`, `src/preload/`, `src/renderer/`, `src/types/`, `package.json`, `tsconfig.json` |
| Screen monitor | ZhiHao + Edmund | ✅ shipped (active-win → get-windows swap by Edmund for Electron ABI compat) | `src/core/screen-monitor.ts` |
| Timer manager | ZhiHao | ✅ shipped | `src/core/timer-manager.ts` |
| Context engine | Edmund | ✅ shipped | `src/core/context-engine.ts` |
| Session stats | Edmund | ✅ shipped | `src/core/session-stats.ts` |
| Agora ConvoAI agent | Edmund | ✅ shipped (dry-run) | `src/core/agora-agent.ts` |
| Agora RTC client | Edmund | ✅ shipped (dry-run) | `src/core/agora-rtc.ts` |
| IPC wiring + main loop | Edmund | ✅ shipped | `src/main/ipc-handlers.ts`, `src/preload/preload.ts`, `src/main/index.ts` |
| RTC test harness | Edmund | ✅ shipped | `test-harness/rtc-test.html` |
| System tray | SimYee | ✅ merged (needs wiring into main/index.ts) | `src/main/tray.ts` |
| Character sprite UI | Cody + Edmund | ✅ merged (sprite via CSS state classes; co-lives with RTC client in overlay.ts) | `src/renderer/overlay.ts`, `src/renderer/styles.css`, `src/renderer/careymary-spritesheet.png`, `scripts/copy-renderer-assets.js` |
| Real Agora credentials | ZhiHao | ⬜ not started | `.env` |

---

## Merge Log

### 2026-04-10 — Foundation (Edmund)
- Electron shell, transparent overlay, preload bridge, shared types, scaffold
- macOS visibility + multi-space fix
- Tag: `foundation-v0`

### 2026-04-10 — Monitors (ZhiHao → merged into Edmund's ZM branch)
- `ScreenMonitor` — active-win polling every 5s, app categorization, `'change'` events
- `TimerManager` — water/break/posture/stretch reminders, acknowledge API, `'reminder'` events
- Tests: `tests/screen-monitor.test.ts`, `tests/timer-manager.test.ts`

### 2026-04-10 — Dev 1 Agora + Context (Edmund) — SHIPPED
- Expanded `CareyMaryAPI` preload contract with RTC control channels (`onStartRTC`, `onStopRTC`, `onSetMicEnabled`, `notifyRendererReady`)
- `AGORA_ENABLED` dry-run flag — app boots + context loop logs prompts without real credentials
- Shipped: context-engine, session-stats, agora-agent (REST), agora-rtc (renderer SDK wrapper), ipc-handlers, main process wiring, RTC test harness
- Context loop: 30s tick builds prompt from ScreenMonitor + TimerManager + SessionStats, pushes to AgoraAgent, broadcasts character-state to overlay
- **Screen monitor swap:** active-win's native N-API binary wouldn't self-register under Electron 33's ABI even after `electron-rebuild`; swapped to `get-windows` (maintained successor, uses a spawned Swift binary — no N-API rebuild needed). macOS grants screen recording permission on first run.
- Smoke test ✅: `app=Warp category=productive`, zero errors, DRY RUN logs fire every 30s

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
- **Still to do (Edmund):** call `createTray()` in `main/index.ts` bootstrap and wire `ipcMain.on('tray:*')` handlers to `AgoraAgent` / `TimerManager`

### 2026-04-10 — Dev 2 Real Agora Credentials (ZhiHao) — NOT STARTED
- Fill `.env` with `AGORA_APP_ID`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`, `AGORA_RTC_TOKEN`
- Flip `AGORA_ENABLED=true` and verify end-to-end voice loop

---

## How to Run (current)

```bash
npm install
cp .env.example .env   # optional — only needed when AGORA_ENABLED=true
npm start
```

**Expected:**
- Transparent overlay in bottom-left corner (200x200)
- Console logs every 30s from the context loop
- In dry-run: `[AgoraAgent] DRY RUN ...` lines showing what would be sent

**For real voice loop:**
1. Fill `.env` with Agora credentials from console.agora.io
2. Set `AGORA_ENABLED=true`
3. Restart

---

## Integration Order (remaining)

1. ✅ T+0: Edmund foundation (`foundation-v0` tag)
2. ✅ T+0: ZhiHao monitors (merged into `ZM`)
3. ✅ T+3:30: Edmund Agora + context + wiring (on `ZM`, ready for `uat` merge)
4. ✅ T+?: SimYee tray → merged to `uat`
5. ✅ T+?: Cody character sprite → merged to `uat`
6. ⬜ T+5:00: Demo rehearsal + bug bash
7. ⬜ T+6:00: Submit
