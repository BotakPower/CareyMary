# CareyMary — Project Context Document

## For AI Coding Agents (Claude Code, Cursor, Copilot)

> **READ THIS FIRST.** This document is the single source of truth for building CareyMary. Every developer on the team should point their AI agent at this file before writing any code. If something contradicts this doc, this doc wins.

---

## What is CareyMary?

CareyMary is a desktop productivity companion for people with ADHD. She is a pixel-art animated character that lives on your screen — always visible, always caring. She uses **real-time voice AI** (powered by Agora) to talk to you and listen to you. She monitors what app you're using, tracks your hydration and break timers, and gently reminds you to stay on track — like a caring mother would.

She is NOT an app you open. She is a transparent overlay that floats on your desktop. She auto-launches and stays in the corner of your screen. The user interacts with her through voice, not clicks.

**Hackathon:** Agora Voice AI Hackathon Singapore 2026 (April 10, 2026 — TODAY)
**Team size:** 4 developers
**Time constraint:** ~6 hours of build time

---

## Team Roster

| Dev | Name | AI Tooling | Capacity | Role |
|-----|------|------------|----------|------|
| **Dev 1** | Edmund | Claude Code (Max plan, Opus 4.6) | **Highest** — largest session budget, Opus reasoning | Tech lead / integration / AI voice brain |
| **Dev 2** | ZhiHao | Claude Code (Pro plan, Sonnet) | Medium | Core monitoring logic |
| **Dev 3** | SimYee | Claude Code (Pro plan, Sonnet) | Medium | Electron shell + system integration |
| **Dev 4** | Cody | Cursor Pro | Medium | Visual layer (character + overlay UI) |

**Load-balancing rule:** Edmund (Dev 1) absorbs the most resource-intensive, integration-heavy, and cross-cutting work because his Claude Max plan gives him the highest session limit and unlimited Opus usage. ZhiHao, SimYee, and Cody each own self-contained modules that can be built with less back-and-forth and fewer deep-reasoning loops.

---

## Tech Stack — DO NOT DEVIATE

| Layer | Technology | Why |
|---|---|---|
| Desktop shell | **Electron 33+** | Cross-platform (macOS + Windows), transparent windows, tray icon |
| Language | **TypeScript** | Entire project. No plain JS files. |
| Package manager | **npm** | Not yarn, not pnpm. |
| Voice AI | **Agora Conversational AI Engine** (REST API + Web SDK) | Hackathon sponsor — must use |
| Audio transport | **Agora RTC Web SDK v4.23.2+** | Mic capture + speaker playback in Electron renderer |
| Active window | **active-win** (npm) | Detect current foreground app. Cross-platform. |
| Character animation | **Sprite sheet PNG + CSS animation** | Pixel-art CareyMary rendered in the overlay |
| Build tool | **electron-builder** | Cross-platform packaging |
| LLM/ASR/TTS | **Agora presets** (no external API keys needed) | `deepgram_nova_3,openai_gpt_5_mini,minimax_speech_2_6_turbo` |

### What we are NOT using

- No React, no Vue, no frontend framework — plain HTML/CSS/TS in Electron renderer
- No database — all state lives in memory (this is a hackathon)
- No cloud hosting — no Vercel, no Render, no Supabase, no Firebase
- No Docker — runs directly on the machine
- No Python — everything is TypeScript/Node.js

---

## Cross-Platform Requirements — CRITICAL

This project MUST run on both **macOS (ARM/M-series)** and **Windows (x64)**.

### Rules for all code

1. **File paths:** Always use `path.join()` — never hardcode `/` or `\\`
2. **Line endings:** `.gitattributes` must enforce `* text=auto eol=lf`
3. **active-win:** The npm package `active-win` works on both macOS and Windows. On macOS it uses Accessibility API, on Windows it uses Win32 API. No extra setup needed.
4. **Electron transparent windows:** Work on both platforms but require `transparent: true` in BrowserWindow options. On Windows, also set `backgroundColor: '#00000000'`.
5. **Tray icon:** Use `.png` for tray icon (works on both platforms). Do NOT use `.ico` only.
6. **Shell commands:** Never use platform-specific shell commands. Use Node.js APIs instead.
7. **Auto-launch:** Use `electron-builder`'s auto-launch config, not platform-specific startup scripts.

### Platform-specific notes

```typescript
// Correct way to handle platform differences
import { platform } from 'os';

const IS_MAC = platform() === 'darwin';
const IS_WIN = platform() === 'win32';
```

---

## Project Structure

```
careymary/
├── package.json
├── tsconfig.json
├── .gitattributes          # line ending normalization
├── .env.example            # Agora credentials template
├── electron-builder.yml    # build config
│
├── src/
│   ├── main/                        # Electron main process
│   │   ├── index.ts                 # App entry — creates windows, tray
│   │   ├── overlay-window.ts        # Transparent always-on-top character window
│   │   ├── tray.ts                  # System tray icon + menu
│   │   └── ipc-handlers.ts          # IPC bridge between main and renderer
│   │
│   ├── renderer/                    # Electron renderer process (the overlay UI)
│   │   ├── index.html               # Overlay page — transparent background
│   │   ├── overlay.ts               # Character animation + state display
│   │   └── styles.css               # Overlay styles (transparent bg, positioning)
│   │
│   ├── core/                        # Shared logic (imported by main process)
│   │   ├── screen-monitor.ts        # Active window detection + classification
│   │   ├── timer-manager.ts         # Hydration, break, posture timers
│   │   ├── context-engine.ts        # Builds context string for LLM system prompt
│   │   ├── agora-agent.ts           # REST API calls to start/stop Agora ConvoAI agent
│   │   └── agora-rtc.ts             # Agora RTC Web SDK — join channel, mic/speaker
│   │
│   ├── preload/
│   │   └── preload.ts               # Context bridge for IPC
│   │
│   └── types/
│       └── index.ts                 # Shared TypeScript types
│
├── assets/
│   ├── careymary-sprite.png         # Pixel art sprite sheet
│   ├── tray-icon.png                # 16x16 or 22x22 tray icon
│   └── tray-icon@2x.png            # Retina tray icon
│
└── CAREYMARY_CONTEXT.md             # This file
```

---

## Module Specifications

### Module 1: Overlay Window (`src/main/overlay-window.ts`)

**Owner:** Dev 3 — SimYee
**Dependencies:** None

Creates a transparent, frameless, always-on-top, click-through Electron window anchored to the bottom-left corner of the screen.

```typescript
// Key BrowserWindow config
const overlay = new BrowserWindow({
  width: 200,
  height: 200,
  x: 0,                              // bottom-left
  y: screenHeight - 200,             // bottom-left
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,                  // don't show in taskbar/dock
  focusable: false,                   // don't steal focus
  resizable: false,
  hasShadow: false,
  webPreferences: {
    preload: path.join(__dirname, '../preload/preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
  // Windows-specific transparency fix
  ...(process.platform === 'win32' && { backgroundColor: '#00000000' }),
});

// Make click-through (clicks pass to apps behind)
overlay.setIgnoreMouseEvents(true, { forward: true });
```

**The overlay HTML/CSS:**
- Background must be `transparent`
- Body must have `overflow: hidden`, `margin: 0`
- Character sprite rendered as a `<div>` with sprite sheet background
- CSS `animation` cycles through sprite frames
- Character has states: `idle`, `talking`, `alert`, `happy`, `sad`

### Module 2: Screen Monitor (`src/core/screen-monitor.ts`)

**Owner:** Dev 2 — ZhiHao
**Dependencies:** `active-win`

Polls the active window every 5 seconds. Classifies the current app into categories.

```typescript
interface ScreenState {
  appName: string;           // e.g. "Code", "Google Chrome", "Slack"
  category: AppCategory;     // 'productive' | 'distraction' | 'neutral' | 'break'
  activeFor: number;         // seconds on current app
  distractionStreak: number; // consecutive seconds on distracting apps
  productiveStreak: number;  // consecutive seconds on productive apps
}

type AppCategory = 'productive' | 'distraction' | 'neutral' | 'break';

// App classification map — extend as needed
const APP_CATEGORIES: Record<string, AppCategory> = {
  // Productive
  'Code': 'productive',
  'Visual Studio Code': 'productive',
  'Terminal': 'productive',
  'iTerm2': 'productive',
  'Windows Terminal': 'productive',
  'Cursor': 'productive',
  'WebStorm': 'productive',
  'Sublime Text': 'productive',
  'Warp': 'productive',

  // Distractions
  'YouTube': 'distraction',        // detected via browser tab title
  'TikTok': 'distraction',
  'Instagram': 'distraction',
  'Twitter': 'distraction',
  'Reddit': 'distraction',
  'Netflix': 'distraction',
  'Twitch': 'distraction',

  // Neutral
  'Slack': 'neutral',
  'Discord': 'neutral',
  'Notion': 'neutral',
  'Finder': 'neutral',
  'Explorer': 'neutral',
  'Spotify': 'neutral',

  // Break
  'FaceTime': 'break',
  'Messages': 'break',
  'zoom.us': 'break',
};
```

**Browser tab detection:** `active-win` returns the window title. For browsers, the title usually contains the tab name (e.g. "YouTube - Google Chrome"). Use string matching on the window title to detect distracting sites even when the browser itself is the active app.

**Export:** A class `ScreenMonitor` with:
- `start()` — begins polling
- `stop()` — stops polling
- `getState(): ScreenState` — returns current state
- `on('change', callback)` — emits when category changes

### Module 3: Timer Manager (`src/core/timer-manager.ts`)

**Owner:** Dev 2 — ZhiHao
**Dependencies:** None (pure TypeScript)

Tracks time-based reminders. All times are configurable.

```typescript
interface TimerConfig {
  waterIntervalMs: number;     // default: 30 * 60 * 1000 (30 min)
  breakIntervalMs: number;     // default: 45 * 60 * 1000 (45 min)
  postureCheckMs: number;      // default: 20 * 60 * 1000 (20 min)
  stretchIntervalMs: number;   // default: 60 * 60 * 1000 (60 min)
}

interface TimerState {
  lastWaterReminder: number;   // timestamp
  lastBreakReminder: number;
  lastPostureCheck: number;
  lastStretchReminder: number;
  waterCount: number;          // how many times user confirmed drinking
  breaksTaken: number;
}

type ReminderType = 'water' | 'break' | 'posture' | 'stretch';
```

**Export:** A class `TimerManager` with:
- `start()` / `stop()`
- `getState(): TimerState`
- `acknowledge(type: ReminderType)` — user confirmed they did the thing
- `on('reminder', (type: ReminderType) => void)` — emits when a reminder is due
- `getDueReminders(): ReminderType[]` — returns all currently overdue reminders

### Module 4: Context Engine (`src/core/context-engine.ts`)

**Owner:** Dev 1 — Edmund
**Dependencies:** ScreenMonitor, TimerManager

This is the **brain**. It takes all the state from screen monitoring and timers, and builds a context string that gets injected into the Agora ConvoAI agent's system prompt.

```typescript
function buildContextPrompt(
  screen: ScreenState,
  timers: TimerState,
  dueReminders: ReminderType[],
  sessionStats: SessionStats
): string {
  return `
CURRENT STATE:
- Active app: ${screen.appName} (${screen.category})
- Time on current app: ${formatDuration(screen.activeFor)}
- Productive streak: ${formatDuration(screen.productiveStreak)}
- Distraction streak: ${formatDuration(screen.distractionStreak)}

HEALTH REMINDERS DUE:
${dueReminders.length > 0 ? dueReminders.map(r => `- ${r} reminder is overdue`).join('\n') : '- None currently due'}

SESSION STATS:
- Water glasses today: ${timers.waterCount}
- Breaks taken today: ${timers.breaksTaken}
- Total productive time: ${formatDuration(sessionStats.productiveTime)}
- Total distraction time: ${formatDuration(sessionStats.distractionTime)}

INSTRUCTIONS:
- If distraction streak > 3 minutes, gently remind user to get back to work
- If distraction streak > 10 minutes, be more firm but still caring
- If a health reminder is due, mention it naturally in conversation
- If user has been productive for 45+ minutes, praise them and suggest a break
- Keep responses SHORT — 1-2 sentences max. You are ambient, not intrusive.
- Speak like a warm, caring mother. Use the user's context to be specific.
- Example: "Hey love, you've been on YouTube for 5 minutes now. Your code was going so well — want to get back to it?"
- Example: "You've been crushing it for an hour! Take a quick stretch, okay?"
- Example: "Time for some water, sweetie. You've only had 2 glasses today."
  `.trim();
}
```

**The system prompt for CareyMary's personality** (set once when starting the agent):

```typescript
const CAREYMARY_SYSTEM_PROMPT = `You are CareyMary, a warm and caring AI mother figure who lives on the user's desktop. You care deeply about their wellbeing and productivity.

PERSONALITY:
- Warm, gentle, encouraging — like a loving mom
- Never nagging or annoying — you know when to speak and when to be quiet
- Playful and sometimes uses light humor
- Celebrates small wins enthusiastically
- Firm but kind when the user is slacking off
- Uses pet names occasionally: "love", "sweetie", "dear"

VOICE STYLE:
- Keep responses to 1-2 sentences maximum
- Speak naturally, not like a robot or an AI
- Don't use bullet points or lists — just talk
- Match the energy of what's happening — calm for reminders, excited for praise

RULES:
- NEVER interrupt the user if they are in a flow state (productive for 15+ min)
- Only speak when you have something useful to say
- When the user talks to you, respond conversationally
- You can ask about their day, their work, how they're feeling
- If the user seems stressed, be extra gentle

You will receive real-time context about what the user is doing. Use it naturally.`;
```

### Module 5: Agora Agent (`src/core/agora-agent.ts`)

**Owner:** Dev 1 — Edmund
**Dependencies:** Agora REST API

Manages the Agora Conversational AI agent lifecycle via REST API calls.

```typescript
// Environment variables (from .env)
// AGORA_APP_ID=<from Agora Console>
// AGORA_CUSTOMER_ID=<from Agora Console>
// AGORA_CUSTOMER_SECRET=<from Agora Console>
// AGORA_CHANNEL_NAME=careymary-<random>
// AGORA_RTC_TOKEN=<generated from Console or token server>

interface AgoraAgentConfig {
  appId: string;
  customerId: string;
  customerSecret: string;
  channelName: string;
  rtcToken: string;
}

class AgoraAgent {
  private agentId: string | null = null;

  // Start the ConvoAI agent — it joins the RTC channel and begins listening
  async start(systemPrompt: string): Promise<void> {
    const credentials = Buffer.from(
      `${this.config.customerId}:${this.config.customerSecret}`
    ).toString('base64');

    const response = await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/join`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `careymary-${Date.now()}`,
          preset: 'deepgram_nova_3,openai_gpt_5_mini,minimax_speech_2_6_turbo',
          properties: {
            channel: this.config.channelName,
            token: this.config.rtcToken,
            agent_rtc_uid: '1001',
            remote_rtc_uids: ['1002'],
            idle_timeout: 600, // 10 min idle before auto-stop
            llm: {
              system_messages: [
                { role: 'system', content: systemPrompt }
              ],
              greeting_message: "Hey sweetie! I'm CareyMary, your desktop buddy. I'll keep an eye on things and make sure you stay hydrated and focused. Just talk to me anytime!",
              failure_message: "Hmm, I didn't catch that. Say it again for me?",
              max_history: 20,
            },
            tts: {
              params: {
                voice_setting: {
                  voice_id: 'English_captivating_female1'
                }
              }
            },
            asr: {
              params: {
                language: 'en'
              }
            }
          }
        })
      }
    );

    const data = await response.json();
    this.agentId = data.agent_id;
  }

  // Update the system prompt with fresh context (call every 30s)
  async updateContext(newSystemPrompt: string): Promise<void> {
    if (!this.agentId) return;

    const credentials = Buffer.from(
      `${this.config.customerId}:${this.config.customerSecret}`
    ).toString('base64');

    await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${this.agentId}/update`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llm: {
            system_messages: [
              { role: 'system', content: newSystemPrompt }
            ]
          }
        })
      }
    );
  }

  // Stop the agent
  async stop(): Promise<void> {
    if (!this.agentId) return;

    const credentials = Buffer.from(
      `${this.config.customerId}:${this.config.customerSecret}`
    ).toString('base64');

    await fetch(
      `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${this.agentId}/leave`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      }
    );

    this.agentId = null;
  }
}
```

### Module 6: Agora RTC Client (`src/core/agora-rtc.ts`)

**Owner:** Dev 1 — Edmund
**Dependencies:** `agora-rtc-sdk-ng`

The user-side RTC client that joins the same channel as the AI agent. This handles mic capture and speaker output in the Electron renderer process.

```typescript
import AgoraRTC from 'agora-rtc-sdk-ng';

class AgoraRTCClient {
  private client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  private localAudioTrack: any = null;

  async join(appId: string, channel: string, token: string, uid: number = 1002) {
    await this.client.join(appId, channel, token, uid);

    // Capture microphone
    this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
      AEC: true,  // echo cancellation
      ANS: true,  // noise suppression
      AGC: true,  // auto gain control
    });

    await this.client.publish([this.localAudioTrack]);

    // Subscribe to remote audio (the AI agent)
    this.client.on('user-published', async (user, mediaType) => {
      if (mediaType === 'audio') {
        await this.client.subscribe(user, mediaType);
        user.audioTrack?.play(); // plays through speakers
      }
    });
  }

  async leave() {
    this.localAudioTrack?.close();
    await this.client.leave();
  }

  // Mute/unmute mic
  setMicEnabled(enabled: boolean) {
    this.localAudioTrack?.setEnabled(enabled);
  }
}
```

**IMPORTANT:** The Agora RTC Web SDK runs in the **renderer process** (browser context), not the main process. Communication between main and renderer uses Electron IPC via the preload script.

### Module 7: System Tray (`src/main/tray.ts`)

**Owner:** Dev 3 — SimYee
**Dependencies:** None

Provides a system tray icon with a context menu for controls.

```typescript
// Tray menu items:
// - "🎙️ Mute/Unmute Mic" — toggle mic
// - "⏸️ Pause CareyMary" — stop monitoring + voice
// - "▶️ Resume" — restart
// - "💧 I drank water" — acknowledge water reminder
// - "🧘 Taking a break" — acknowledge break
// - "❌ Quit" — exit app
```

### Module 8: Character Overlay UI (`src/renderer/overlay.ts`)

**Owner:** Dev 4 — Cody
**Dependencies:** Sprite sheet asset

The pixel-art CareyMary character rendered in the transparent overlay window.

```typescript
// Character states with corresponding sprite sheet rows/columns
type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

// Animation approach:
// - Use a sprite sheet PNG (e.g. 5 states × 4 frames = 20 cells)
// - CSS animation steps through frames: background-position shift
// - State changes triggered via IPC from main process

// CSS example for sprite animation:
// .character {
//   width: 128px;
//   height: 128px;
//   background: url('../assets/careymary-sprite.png') no-repeat;
//   image-rendering: pixelated;  /* crisp pixel art */
// }
// .character.idle { animation: idle-anim 1s steps(4) infinite; }
// .character.talking { animation: talk-anim 0.5s steps(4) infinite; }
// @keyframes idle-anim {
//   from { background-position: 0 0; }
//   to { background-position: -512px 0; }
// }
```

---

## Wiring It All Together (`src/main/index.ts`)

The main entry point orchestrates everything:

```typescript
// Startup sequence:
// 1. Create overlay window (transparent, bottom-left)
// 2. Create tray icon with menu
// 3. Start screen monitor (polls every 5s)
// 4. Start timer manager
// 5. Start Agora RTC client (renderer joins channel)
// 6. Start Agora ConvoAI agent (REST API — agent joins same channel)
// 7. Begin context update loop (every 30s, update agent's system prompt)

// Context update loop (runs every 30 seconds):
setInterval(async () => {
  const screenState = screenMonitor.getState();
  const timerState = timerManager.getState();
  const dueReminders = timerManager.getDueReminders();
  const sessionStats = getSessionStats();

  const contextPrompt = CAREYMARY_SYSTEM_PROMPT + '\n\n' +
    buildContextPrompt(screenState, timerState, dueReminders, sessionStats);

  await agoraAgent.updateContext(contextPrompt);

  // Update character animation state
  if (dueReminders.length > 0) {
    overlayWindow.webContents.send('character-state', 'alert');
  } else if (screenState.category === 'productive') {
    overlayWindow.webContents.send('character-state', 'happy');
  } else {
    overlayWindow.webContents.send('character-state', 'idle');
  }
}, 30_000);
```

---

## Environment Setup

### .env.example

```bash
# Get these from https://console.agora.io
AGORA_APP_ID=your_app_id_here
AGORA_CUSTOMER_ID=your_customer_id_here
AGORA_CUSTOMER_SECRET=your_customer_secret_here

# Generate from Agora Console > Project > Temp Token
AGORA_RTC_TOKEN=your_temp_token_here

# Channel name — all team members testing must use different channels
AGORA_CHANNEL_NAME=careymary-dev
```

### package.json (key dependencies)

```json
{
  "name": "careymary",
  "version": "0.1.0",
  "main": "dist/main/index.js",
  "scripts": {
    "build": "tsc",
    "start": "npm run build && electron .",
    "dev": "tsc --watch & electron .",
    "package:mac": "electron-builder --mac",
    "package:win": "electron-builder --win"
  },
  "dependencies": {
    "active-win": "^9.0.0",
    "agora-rtc-sdk-ng": "^4.23.2",
    "dotenv": "^16.4.0",
    "electron-store": "^8.0.0"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### .gitattributes

```
* text=auto eol=lf
*.png binary
*.ico binary
```

---

## Task Assignment Guide

Work is split across 4 developers. Edmund (Dev 1) takes the heaviest, most integration-heavy work because his Claude Max plan gives him the largest session budget and Opus-level reasoning for debugging API issues and wiring the system together.

### Dev 1 — Edmund (Claude Max / Opus 4.6) — **Tech Lead + AI Voice Brain**

**Owns the resource-intensive, cross-cutting work.**

| File | What |
|------|------|
| `src/core/agora-agent.ts` | Agora ConvoAI REST API lifecycle — start / updateContext / stop. Heaviest API integration. |
| `src/core/agora-rtc.ts` | Agora RTC Web SDK in renderer — mic capture, speaker playback, publish/subscribe |
| `src/core/context-engine.ts` | The brain — builds system prompt from screen + timer state, feeds agent every 30s |
| `src/main/index.ts` | App entry, startup sequence, context update loop, final wiring of all modules |
| `src/main/ipc-handlers.ts` | IPC bridge between main and renderer (Agora RTC lives in renderer, state lives in main) |
| `src/preload/preload.ts` | contextBridge setup |
| `src/types/index.ts` | Shared TypeScript types — define first so others can import |
| `.env.example`, `tsconfig.json`, `package.json`, `.gitattributes` | Repo scaffolding |

**Why Edmund:** Agora integration is the hackathon's scored surface area (judges care about this), it has the most unknowns (REST API quirks, RTC in Electron renderer, IPC across main↔renderer), and it's where Opus reasoning + long sessions pay off. Edmund also owns integration because he has the broadest view of the system.

**First-hour deliverable:** Repo scaffold + shared types pushed to `main` so everyone else can branch from a working baseline.

---

### Dev 2 — ZhiHao (Claude Pro / Sonnet) — **Core Monitoring**

**Owns self-contained logic with zero Agora dependency.** Can work fully offline.

| File | What |
|------|------|
| `src/core/screen-monitor.ts` | `active-win` polling every 5s, app categorization, change events |
| `src/core/timer-manager.ts` | Water / break / posture / stretch reminders, acknowledge API, due events |

**Why ZhiHao:** These modules are pure TypeScript with clean interfaces (defined in `src/types/index.ts` by Edmund). No external API debugging, no Electron quirks — Sonnet handles this cleanly and the session budget stays under control. Ships independently, unblocks the context engine.

**Deliverable contract:** Both modules export classes matching the interfaces in Module 2 and Module 3 of this doc. Must emit events that `context-engine.ts` can consume.

---

### Dev 3 — SimYee (Claude Pro / Sonnet) — **Electron Shell**

**Owns the desktop container — the thing the user actually sees.**

| File | What |
|------|------|
| `src/main/overlay-window.ts` | Transparent, frameless, always-on-top, click-through BrowserWindow |
| `src/main/tray.ts` | System tray icon + context menu (mute, pause, acknowledge reminders, quit) |
| Cross-platform transparency fixes (macOS + Windows) | Platform-specific BrowserWindow tweaks |
| Auto-launch config in `electron-builder.yml` | Runs on startup |

**Why SimYee:** Electron shell work is mostly configuration and platform branching — well-documented, Sonnet is strong here. Critical path but low unknowns.

**Deliverable contract:** `createOverlayWindow()` and `createTray()` functions that `index.ts` can call. Tray menu emits IPC events that Edmund wires into the main loop.

**First-hour deliverable:** A transparent empty window visible in the bottom-left on both macOS and Windows. Everyone else builds on top of this.

---

### Dev 4 — Cody (Cursor Pro) — **Visual Layer / Character**

**Owns the pixel-art character and the overlay UI.** Independent of all backend logic.

| File | What |
|------|------|
| `src/renderer/index.html` | Transparent overlay page shell |
| `src/renderer/overlay.ts` | Character state machine (idle / talking / alert / happy / sleeping), IPC listener for state changes |
| `src/renderer/styles.css` | Sprite sheet CSS animations, transparent background, positioning |
| `assets/careymary-sprite.png` | Pixel-art sprite sheet (find, generate, or commission) |
| `assets/tray-icon.png` + `@2x` | Tray icons for both platforms |

**Why Cody:** Cursor Pro is great for focused visual/CSS iteration, and this module is fully isolated — it just listens for `character-state` IPC events and swaps CSS classes. No TypeScript business logic, no cross-module coordination.

**Deliverable contract:** The renderer receives `character-state` messages via `window.careymary.onCharacterState(callback)` (exposed by Edmund's preload) and animates accordingly.

---

### Module → Dev Summary

| Module | Owner | Blocks |
|--------|-------|--------|
| Repo scaffold + types | Edmund | Everyone |
| Overlay window + tray | SimYee | Edmund's final wiring |
| Screen monitor + timers | ZhiHao | Edmund's context engine |
| Character UI | Cody | Nothing (IPC contract only) |
| Agora agent + RTC | Edmund | Final integration |
| Context engine | Edmund | Final integration |
| Final `index.ts` wiring | Edmund | — |

### Integration Order (time-boxed)

1. **T+0:00 — Edmund:** Push repo scaffold (`package.json`, `tsconfig.json`, `src/types/index.ts`, `.env.example`, `.gitattributes`) to `main`. Everyone branches.
2. **T+0:00 — SimYee:** Blank transparent Electron window, bottom-left, both platforms.
3. **T+0:00 — ZhiHao:** Build screen monitor + timer manager against the type contracts. Fully testable in isolation.
4. **T+0:00 — Cody:** Start on sprite sheet + CSS animation in a plain HTML sandbox.
5. **T+1:30 — Edmund:** Agora RTC joining a channel from a minimal HTML test harness; agent greeting audible.
6. **T+2:30 — SimYee:** Tray menu working, merges to `main`.
7. **T+3:00 — ZhiHao:** Monitoring modules merged to `main`.
8. **T+3:30 — Edmund:** Context engine + agora-agent merged; starts wiring in `index.ts`.
9. **T+4:00 — Cody:** Character UI merged; Edmund hooks up `character-state` IPC.
10. **T+4:30 — Edmund:** Full end-to-end flow: screen change → context update → CareyMary speaks → character animates.
11. **T+5:00 — Everyone:** Demo rehearsal + bug bash.
12. **T+6:00 — Submit.**

---

## Git Workflow

```bash
# Branch naming
uat                     # active baseline branch; foundation lives here from T+0 (tagged foundation-v0)
dev/edmund-agora        # Dev 1 — Agora agent, RTC, context engine, index.ts, IPC
dev/zhihao-monitors     # Dev 2 — screen-monitor, timer-manager
dev/simyee-shell        # Dev 3 — overlay-window, tray
dev/cody-character      # Dev 4 — renderer UI, sprite, styles

# Merge order:
# 1. Edmund pushes scaffold + shared types directly to uat (T+0, tagged foundation-v0)
# 2. simyee-shell     → uat  (transparent window baseline)
# 3. zhihao-monitors  → uat  (core logic, independent)
# 4. cody-character   → uat  (visual layer, independent)
# 5. edmund-agora     → uat  (final wiring — Edmund merges everything together in index.ts)
```

**Commit convention:** `<type>: <description>` (feat, fix, refactor, docs, chore). Keep commits small so conflicts during the final integration push are trivial.

**Merge protocol:** Everyone rebases on `uat` before pushing their branch. Edmund has merge authority on `uat` during integration (T+3:30 onward) to avoid race conditions. All devs branch from tag `foundation-v0`, not from floating `uat` HEAD, to avoid picking up in-progress work mid-branch.

---

## How to Run

```bash
# 1. Clone and install
git clone <repo-url>
cd careymary
npm install

# 2. Copy env and fill in Agora credentials
cp .env.example .env
# Edit .env with your Agora credentials

# 3. Build and run
npm start

# Or for development (auto-rebuild on changes):
npm run dev
```

---

## Demo Script (for judging)

1. Launch CareyMary — she appears in the bottom-left corner, greets the user by voice
2. Open VS Code and start coding — CareyMary goes into happy/idle state
3. After a minute, switch to YouTube — CareyMary's animation changes to alert, she says something like "Hey love, you were doing so well! Want to get back to it?"
4. Switch back to VS Code — CareyMary praises you
5. Wait for water reminder — CareyMary gently reminds you to drink water
6. Talk to CareyMary — say "Hey CareyMary, how am I doing today?" — she responds with your session stats
7. Use tray menu to acknowledge water, show controls

---

## Judging Criteria Alignment

Based on the hackathon requirements (Agora Voice AI):

- **Agora integration:** Two-way real-time voice conversation using Agora ConvoAI Engine + RTC SDK ✓
- **Innovation:** ADHD productivity companion with ambient voice AI — not a chatbot, a companion ✓
- **Technical execution:** Cross-platform Electron app with real-time screen awareness ✓
- **Completeness:** End-to-end flow from screen monitoring → context → voice reminders ✓
- **Presentation:** Visual character + voice makes for a compelling live demo ✓

---

## Quick Reference for AI Agents

When asked to implement a module, check:

1. Does it match the interface defined in this document?
2. Does it use only the dependencies listed in the tech stack?
3. Does it work on both macOS and Windows?
4. Does it use TypeScript (not plain JavaScript)?
5. Does it follow the project structure exactly?
6. Does it use `path.join()` for all file paths?

**If you are unsure about anything, refer back to this document. This document is the source of truth.**