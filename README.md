# CareyMary

> A warm, caring AI mother figure who lives on your desktop and keeps you on track.

CareyMary is a desktop productivity companion for people with ADHD. She watches what you're working on, reminds you to drink water and take breaks, and talks to you in real time through Agora's Conversational AI Engine — all while a small animated character floats in the bottom-left of your screen.

**Built for the Agora Voice AI Hackathon Singapore 2026.**

---

## What it does

- **Ambient voice companion** — Speaks to you naturally (1–2 sentences) through a real Agora RTC voice channel. You can talk back.
- **Screen-aware context** — Polls the active window every 5s, classifies apps as `productive` / `distraction` / `neutral` / `break`, and feeds that into the prompt every 30s.
- **Health reminders** — Water, break, posture, and stretch timers with acknowledge actions wired to the system tray.
- **Character sprite** — A 2×2 spritesheet driven by CSS state classes (`idle` / `talking` / `alert` / `happy` / `sleeping`) in a transparent click-through overlay.
- **System tray controls** — Mute mic, pause CareyMary, acknowledge reminders, quit.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Main process (src/main/)                                   │
│  ┌───────────────┐  ┌─────────────┐  ┌───────────────────┐  │
│  │ ScreenMonitor │  │ TimerManager│  │ SessionStats      │  │
│  │ (get-windows) │  │ (water/break│  │ (productive time) │  │
│  └───────┬───────┘  └──────┬──────┘  └─────────┬─────────┘  │
│          │                 │                   │            │
│          └────────┬────────┴───────────────────┘            │
│                   ▼                                         │
│          ┌──────────────────┐      ┌──────────────────┐     │
│          │ Context engine   │─────▶│ AgoraAgent (REST)│     │
│          │ (buildPrompt)    │      │ /join /update    │     │
│          └──────────────────┘      └──────────────────┘     │
│                   │                                         │
│                   ▼                                         │
│          ┌──────────────────┐                               │
│          │ IPC → overlay    │                               │
│          └──────┬───────────┘                               │
└─────────────────┼───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Renderer (src/renderer/overlay.ts)                         │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │ Sprite state     │    │ AgoraRTCClient               │   │
│  │ machine (CSS)    │    │ (agora-rtc-sdk-ng, joins as  │   │
│  │                  │    │  uid 1002, hears uid 1001)   │   │
│  └──────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                  ▲
                  │ ipcMain.emit('tray:*', ...)
                  │
┌─────────────────┴───────────────────────────────────────────┐
│  Tray (src/main/tray.ts) — mute / pause / ack / quit        │
└─────────────────────────────────────────────────────────────┘
```

**How the voice loop works:**

1. Main process starts an Agora Conversational AI agent via REST (`POST /join`) with a system prompt describing CareyMary's personality.
2. That agent joins the RTC channel as uid `1001`.
3. Renderer joins the same channel as uid `1002` using `agora-rtc-sdk-ng` and publishes the user's mic.
4. Every 30s the main process rebuilds the system prompt from live context (active app, streaks, due reminders, session stats) and pushes it via `POST /update`.
5. The agent speaks back through the RTC channel; the renderer plays it as remote audio.

## Project layout

```
src/
├── core/                  Pure logic modules, no Electron imports
│   ├── screen-monitor.ts  Active-window poller (get-windows)
│   ├── timer-manager.ts   Water/break/posture/stretch reminders
│   ├── session-stats.ts   Accumulates productive/distraction time
│   ├── context-engine.ts  System prompt + prompt builder
│   ├── agora-agent.ts     REST client for Conversational AI (/join /update /leave)
│   └── agora-rtc.ts       RTC SDK wrapper (reference impl; renderer inlines a copy)
├── main/                  Electron main process
│   ├── index.ts           Bootstrap, context loop, tray wiring
│   ├── overlay-window.ts  Transparent click-through overlay window
│   ├── tray.ts            System tray + context menu
│   └── ipc-handlers.ts    IPC channel constants + sender helpers
├── preload/
│   └── preload.ts         contextBridge → window.careymary
├── renderer/
│   ├── index.html
│   ├── overlay.ts         Sprite state machine + inlined AgoraRTCClient
│   ├── styles.css         2×2 sprite animation via background-position
│   └── careymary-spritesheet.png
└── types/
    └── index.ts           Shared types (ScreenState, TimerState, CareyMaryAPI, ...)

test-harness/
└── rtc-test.html          Standalone browser page for manual RTC testing

scripts/
└── copy-renderer-assets.js  Copies html/css/png into dist/renderer/ on build

docs/
├── CAREYMARY_CONTEXT.md   Module-by-module design reference
├── CAREYMARY_PROGRESS.md  Current state + merge log
└── superpowers/           Specs + plans from the brainstorming workflow
```

## Tech stack

- **Electron 33** — Transparent click-through overlay window
- **TypeScript 5.5** — Strict mode, commonjs output
- **Agora Conversational AI Engine** — REST API for agent lifecycle
- **agora-rtc-sdk-ng 4.23** — Web SDK for the RTC voice channel (loaded as a global `<script>` in the renderer)
- **get-windows 9.3** — Active-window polling (ESM-only; uses a spawned Swift binary on macOS, no N-API rebuild required)

## Getting started

```bash
git clone <this repo>
cd CareyMary
npm install
cp .env.example .env        # fill in Agora credentials
npm start
```

### `.env`

```
AGORA_APP_ID=...
AGORA_CUSTOMER_ID=...
AGORA_CUSTOMER_SECRET=...
AGORA_RTC_TOKEN=...
AGORA_CHANNEL_NAME=careymary-dev
AGORA_ENABLED=true          # false = dry-run, no network calls
```

### Dry-run mode

Leave `AGORA_ENABLED=false` and you can develop against the full context loop without touching Agora. Every REST/RTC call logs what it *would* send. Useful for working on sprite states, timers, and prompt generation.

### macOS permissions

On first run macOS will prompt for **Screen Recording** (for `get-windows`) and **Microphone** (for RTC). Both are required for the full experience.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Build + launch Electron |
| `npm run build` | `tsc` + copy renderer assets into `dist/` |
| `npm run dev` | `tsc --watch` in the background + Electron |
| `npm test` | Run the node test runner against `tests/**/*.test.ts` |
| `npm run package:mac` | Build a macOS `.app` via electron-builder |
| `npm run package:win` | Build a Windows installer via electron-builder |

## Team

Built over ~6 hours by four developers working on parallel lanes:

| Dev | Lane | Files |
|---|---|---|
| **Edmund** (tech lead) | Foundation, Agora lane, context loop, wiring, conflict resolution | `src/main/`, `src/core/agora-*`, `src/core/context-engine.ts`, `src/core/session-stats.ts`, `src/preload/`, `src/types/` |
| **ZhiHao** | Monitors + real Agora credentials | `src/core/screen-monitor.ts`, `src/core/timer-manager.ts`, `tests/`, `.env` |
| **SimYee** | System tray | `src/main/tray.ts` |
| **Cody** | Character sprite | `src/renderer/styles.css`, `src/renderer/careymary-spritesheet.png`, `scripts/copy-renderer-assets.js` |

## Status

✅ All four lanes merged to `uat`. Live Agora voice loop verified end-to-end.
See [`docs/CAREYMARY_PROGRESS.md`](docs/CAREYMARY_PROGRESS.md) for the full merge log and current state.
