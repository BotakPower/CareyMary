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
| Screen monitor | ZhiHao | ✅ shipped | `src/core/screen-monitor.ts` |
| Timer manager | ZhiHao | ✅ shipped | `src/core/timer-manager.ts` |
| Context engine | Edmund | 🟡 in progress | `src/core/context-engine.ts` |
| Session stats | Edmund | 🟡 in progress | `src/core/session-stats.ts` |
| Agora ConvoAI agent | Edmund | 🟡 in progress | `src/core/agora-agent.ts` |
| Agora RTC client | Edmund | 🟡 in progress | `src/core/agora-rtc.ts` |
| IPC wiring + main loop | Edmund | 🟡 in progress | `src/main/ipc-handlers.ts`, `src/preload/preload.ts`, `src/main/index.ts` |
| RTC test harness | Edmund | 🟡 in progress | `test-harness/rtc-test.html` |
| System tray | SimYee | ⬜ not started | `src/main/tray.ts` |
| Character sprite UI | Cody | ⬜ not started | `src/renderer/overlay.ts`, `src/renderer/styles.css`, `assets/careymary-sprite.png` |
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

### 2026-04-10 — Dev 1 Agora + Context (Edmund) — IN PROGRESS
- Expanding `CareyMaryAPI` preload contract with RTC control channels
- Adding `AGORA_ENABLED` dry-run flag
- Building: context-engine, session-stats, agora-agent (REST), agora-rtc (renderer SDK wrapper), ipc-handlers, preload expansion, main process wiring, RTC test harness
- Default mode: dry-run (`AGORA_ENABLED=false`) — app boots + context loop logs prompts without real credentials

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
3. 🟡 T+3:30: Edmund Agora + context + wiring (this lane) → merges to `uat`
4. ⬜ T+?: SimYee tray → merges to `uat`
5. ⬜ T+?: Cody character sprite → merges to `uat`
6. ⬜ T+5:00: Demo rehearsal + bug bash
7. ⬜ T+6:00: Submit
