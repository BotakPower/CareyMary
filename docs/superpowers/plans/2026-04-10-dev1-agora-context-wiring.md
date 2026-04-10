# CareyMary Dev 1 Lane — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship context engine, Agora REST agent, Agora RTC renderer client, and main-process wiring in dry-run mode.

**Architecture:** Main process orchestrates ScreenMonitor + TimerManager + SessionStats + ContextEngine + AgoraAgent REST. Renderer hosts AgoraRTCClient via Agora SDK loaded as a global script. Dry-run flag gates all Agora side effects.

**Tech Stack:** TypeScript 5.5, Electron 33, agora-rtc-sdk-ng (global script), native fetch (Node 22).

**Baseline:** Branch `ZM`, foundation-v0 + ZhiHao's monitors already merged.

---

## Task 1: Stage 0 — Contract Work (done by controller, not subagent)

**Files:**
- Modify: `src/types/index.ts`
- Modify: `.env.example`
- Create: `docs/CAREYMARY_PROGRESS.md`

### Step 1.1: Expand `CareyMaryAPI` in `src/types/index.ts`

Add RTC control types and expand the preload bridge interface.

```typescript
// Screen monitoring - CAREYMARY_CONTEXT.md Module 2
export type AppCategory = 'productive' | 'distraction' | 'neutral' | 'break';

export interface ScreenState {
  appName: string;
  category: AppCategory;
  activeFor: number;
  distractionStreak: number;
  productiveStreak: number;
}

// Timer management - CAREYMARY_CONTEXT.md Module 3
export interface TimerConfig {
  waterIntervalMs: number;
  breakIntervalMs: number;
  postureCheckMs: number;
  stretchIntervalMs: number;
}

export interface TimerState {
  lastWaterReminder: number;
  lastBreakReminder: number;
  lastPostureCheck: number;
  lastStretchReminder: number;
  waterCount: number;
  breaksTaken: number;
}

export type ReminderType = 'water' | 'break' | 'posture' | 'stretch';

// Session stats - consumed by context engine
export interface SessionStats {
  productiveTime: number;
  distractionTime: number;
  startedAt: number;
}

// Character animation - CAREYMARY_CONTEXT.md Module 8
export type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

// Agora RTC connection parameters passed from main to renderer
export interface RTCJoinParams {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  enabled: boolean; // false = dry-run
}

// Preload bridge contract - what the renderer sees on window.careymary
export interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
  onStartRTC: (callback: (params: RTCJoinParams) => void) => void;
  onStopRTC: (callback: () => void) => void;
  onSetMicEnabled: (callback: (enabled: boolean) => void) => void;
  notifyRendererReady: () => void;
}
```

### Step 1.2: Update `.env.example`

```bash
# Agora credentials - get from https://console.agora.io
AGORA_APP_ID=
AGORA_CUSTOMER_ID=
AGORA_CUSTOMER_SECRET=
AGORA_RTC_TOKEN=
AGORA_CHANNEL_NAME=careymary-dev

# Dry-run mode — set to true to actually hit Agora REST + RTC.
# Leave false for local dev without credentials.
AGORA_ENABLED=false
```

### Step 1.3: Create `docs/CAREYMARY_PROGRESS.md`

Running progress log. Must always show the current state of the project at a glance. Each dev appends a section when they merge.

```markdown
# CareyMary Build Progress

> Running log of what's shipped on `uat` and who owns what next.
> Update after every merge. Anyone running `cat docs/CAREYMARY_PROGRESS.md` should get the current state in under 30 seconds.

**Hackathon:** Agora Voice AI Hackathon Singapore 2026 — 2026-04-10
**Team:** Edmund (Dev 1) · ZhiHao (Dev 2) · SimYee (Dev 3) · Cody (Dev 4)
**Current integration branch:** `ZM`

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
| IPC wiring | Edmund | 🟡 in progress | `src/main/ipc-handlers.ts`, `src/preload/preload.ts`, `src/main/index.ts` |
| RTC test harness | Edmund | 🟡 in progress | `test-harness/rtc-test.html` |
| System tray | SimYee | ⬜ not started | `src/main/tray.ts` |
| Character sprite UI | Cody | ⬜ not started | `src/renderer/overlay.ts`, `src/renderer/styles.css`, `assets/careymary-sprite.png` |

---

## Merge Log

### 2026-04-10 — Foundation (Edmund)
- Electron shell, transparent overlay, preload bridge, shared types, scaffold
- Tag: `foundation-v0`

### 2026-04-10 — Monitors (ZhiHao → Edmund merge)
- ScreenMonitor (active-win polling, app categorization, change events)
- TimerManager (water/break/posture/stretch reminders, acknowledge API)

### 2026-04-10 — Dev 1 Agora + Context (Edmund) — IN PROGRESS
- Will add: context-engine, session-stats, agora-agent, agora-rtc, ipc-handlers, preload expansion, main wiring, RTC test harness
- Mode: dry-run by default (`AGORA_ENABLED=false`)

---

## How to Run (current)

```bash
npm install
npm start
```

Expected: transparent overlay in bottom-left corner, dry-run console logs every 30s.

For real voice loop: fill `.env` with Agora credentials and set `AGORA_ENABLED=true`.
```

### Step 1.4: Verify contract compiles

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 1.5: Commit contract

```bash
git add src/types/index.ts .env.example docs/CAREYMARY_PROGRESS.md
git commit -m "feat: expand preload API, add AGORA_ENABLED flag, progress log"
```

---

## Task 2: Agent Core — context-engine + session-stats + agora-agent

**Files:**
- Create: `src/core/context-engine.ts`
- Create: `src/core/session-stats.ts`
- Create: `src/core/agora-agent.ts`

### Step 2.1: Dispatch Agent Core subagent

Dispatch with the full file content below. Subagent must not touch any other file.

### Step 2.2: `src/core/context-engine.ts`

```typescript
import type {
  ScreenState,
  TimerState,
  ReminderType,
  SessionStats,
} from '../types/index';

export const CAREYMARY_SYSTEM_PROMPT = `You are CareyMary, a warm and caring AI mother figure who lives on the user's desktop. You care deeply about their wellbeing and productivity.

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

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

export function buildContextPrompt(
  screen: ScreenState,
  timers: TimerState,
  dueReminders: ReminderType[],
  sessionStats: SessionStats,
): string {
  const dueBlock =
    dueReminders.length > 0
      ? dueReminders.map((r) => `- ${r} reminder is overdue`).join('\n')
      : '- None currently due';

  return `
CURRENT STATE:
- Active app: ${screen.appName} (${screen.category})
- Time on current app: ${formatDuration(screen.activeFor)}
- Productive streak: ${formatDuration(screen.productiveStreak)}
- Distraction streak: ${formatDuration(screen.distractionStreak)}

HEALTH REMINDERS DUE:
${dueBlock}

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

/** Picks the right character state for a given context, for IPC broadcast. */
export function pickCharacterState(
  screen: ScreenState,
  dueReminders: ReminderType[],
): 'idle' | 'happy' | 'alert' {
  if (dueReminders.length > 0) return 'alert';
  if (screen.category === 'productive') return 'happy';
  return 'idle';
}
```

### Step 2.3: `src/core/session-stats.ts`

```typescript
import { EventEmitter } from 'events';
import type { ScreenMonitor } from './screen-monitor';
import type { SessionStats, ScreenState } from '../types/index';

/**
 * Accumulates productive and distraction time by subscribing to a ScreenMonitor.
 * Uses the ScreenMonitor's streak fields as the source of truth — each tick we
 * take the delta in productiveStreak / distractionStreak and add it to totals.
 */
export class SessionStatsTracker {
  private stats: SessionStats;
  private lastProductiveStreak = 0;
  private lastDistractionStreak = 0;

  constructor() {
    this.stats = {
      productiveTime: 0,
      distractionTime: 0,
      startedAt: Date.now(),
    };
  }

  /** Attach to a ScreenMonitor and start accumulating. */
  attach(monitor: ScreenMonitor): void {
    monitor.on('change', (state: ScreenState) => this.ingest(state));
  }

  /** Call manually on every tick (for cases where 'change' doesn't fire). */
  ingest(state: ScreenState): void {
    // Productive delta
    if (state.productiveStreak >= this.lastProductiveStreak) {
      this.stats.productiveTime += state.productiveStreak - this.lastProductiveStreak;
    } else {
      // Streak reset — the streak we had before reset was already counted.
      this.stats.productiveTime += 0;
    }
    this.lastProductiveStreak = state.productiveStreak;

    // Distraction delta
    if (state.distractionStreak >= this.lastDistractionStreak) {
      this.stats.distractionTime += state.distractionStreak - this.lastDistractionStreak;
    } else {
      this.stats.distractionTime += 0;
    }
    this.lastDistractionStreak = state.distractionStreak;
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }
}
```

### Step 2.4: `src/core/agora-agent.ts`

```typescript
export interface AgoraAgentConfig {
  appId: string;
  customerId: string;
  customerSecret: string;
  channelName: string;
  rtcToken: string;
  enabled: boolean; // false = dry-run
}

interface JoinResponse {
  agent_id?: string;
  [key: string]: unknown;
}

/**
 * Manages the Agora Conversational AI agent lifecycle via REST.
 *
 * In dry-run (enabled=false) every method logs the payload it would send and
 * returns mock data. No network calls are made. This lets us ship + smoke-test
 * the whole app without credentials.
 */
export class AgoraAgent {
  private agentId: string | null = null;
  private readonly basicAuth: string;

  constructor(private readonly config: AgoraAgentConfig) {
    this.basicAuth = Buffer.from(
      `${config.customerId}:${config.customerSecret}`,
    ).toString('base64');
  }

  async start(systemPrompt: string): Promise<void> {
    const payload = {
      name: `careymary-${Date.now()}`,
      preset: 'deepgram_nova_3,openai_gpt_5_mini,minimax_speech_2_6_turbo',
      properties: {
        channel: this.config.channelName,
        token: this.config.rtcToken,
        agent_rtc_uid: '1001',
        remote_rtc_uids: ['1002'],
        idle_timeout: 600,
        llm: {
          system_messages: [{ role: 'system', content: systemPrompt }],
          greeting_message:
            "Hey sweetie! I'm CareyMary, your desktop buddy. I'll keep an eye on things and make sure you stay hydrated and focused. Just talk to me anytime!",
          failure_message: "Hmm, I didn't catch that. Say it again for me?",
          max_history: 20,
        },
        tts: {
          params: {
            voice_setting: { voice_id: 'English_captivating_female1' },
          },
        },
        asr: { params: { language: 'en' } },
      },
    };

    if (!this.config.enabled) {
      console.log('[AgoraAgent] DRY RUN — would POST /join with payload:', JSON.stringify(payload, null, 2));
      this.agentId = `dry-run-${Date.now()}`;
      return;
    }

    try {
      const res = await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/join`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Agora /join failed: ${res.status} ${body}`);
      }

      const data = (await res.json()) as JoinResponse;
      this.agentId = data.agent_id ?? null;
      console.log('[AgoraAgent] agent started, agent_id=', this.agentId);
    } catch (err) {
      console.error('[AgoraAgent] start error:', err);
      throw err;
    }
  }

  async updateContext(newSystemPrompt: string): Promise<void> {
    if (!this.agentId) {
      console.warn('[AgoraAgent] updateContext called with no active agent');
      return;
    }

    const payload = {
      llm: {
        system_messages: [{ role: 'system', content: newSystemPrompt }],
      },
    };

    if (!this.config.enabled) {
      console.log('[AgoraAgent] DRY RUN — would POST /update with new system prompt, length=', newSystemPrompt.length);
      return;
    }

    try {
      const res = await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${this.agentId}/update`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Agora /update failed: ${res.status} ${body}`);
      }
    } catch (err) {
      console.error('[AgoraAgent] updateContext error:', err);
    }
  }

  async stop(): Promise<void> {
    if (!this.agentId) return;

    if (!this.config.enabled) {
      console.log('[AgoraAgent] DRY RUN — would POST /leave for', this.agentId);
      this.agentId = null;
      return;
    }

    try {
      await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${this.agentId}/leave`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err) {
      console.error('[AgoraAgent] stop error:', err);
    } finally {
      this.agentId = null;
    }
  }
}
```

### Step 2.5: Verify Agent Core

Run: `npx tsc --noEmit`
Expected: exit 0

### Step 2.6: Commit Agent Core

```bash
git add src/core/context-engine.ts src/core/session-stats.ts src/core/agora-agent.ts
git commit -m "feat: context engine, session stats, agora REST agent (dry-run aware)"
```

---

## Task 3: Agent RTC — agora-rtc + renderer + test harness

**Files:**
- Create: `src/core/agora-rtc.ts`
- Modify: `src/renderer/overlay.ts`
- Modify: `src/renderer/index.html`
- Create: `test-harness/rtc-test.html`

### Step 3.1: `src/core/agora-rtc.ts`

```typescript
/**
 * Thin wrapper around agora-rtc-sdk-ng. Runs in the RENDERER process.
 *
 * The SDK is loaded as a global script in index.html (pointing at
 * node_modules/agora-rtc-sdk-ng/AgoraRTC_N-production.js), so this file
 * references it via `(window as any).AgoraRTC`.
 *
 * This file is imported by the renderer overlay which must not have top-level
 * imports/exports from its own script — but this file is a core module
 * shared with the test harness, so it's a normal TS module. The renderer
 * copies the shape from this file inline if needed.
 *
 * In dry-run (enabled=false) every method logs its args and no-ops.
 */

export interface AgoraRTCConfig {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  enabled: boolean;
}

type AgoraRTCGlobal = {
  createClient: (cfg: { mode: string; codec: string }) => unknown;
  createMicrophoneAudioTrack: (opts: { AEC: boolean; ANS: boolean; AGC: boolean }) => Promise<unknown>;
};

// The renderer script loads this file via require (CommonJS emit from tsc).
// Since we access AgoraRTC from window, this file is usable from any context
// that has AgoraRTC on the global scope.
export class AgoraRTCClient {
  private client: any = null;
  private localAudioTrack: any = null;
  private connected = false;

  constructor(private readonly getSDK: () => AgoraRTCGlobal | undefined) {}

  async join(config: AgoraRTCConfig): Promise<void> {
    if (!config.enabled) {
      console.log('[AgoraRTCClient] DRY RUN — would join channel', config.channel, 'as uid', config.uid);
      this.connected = true;
      return;
    }

    const sdk = this.getSDK();
    if (!sdk) {
      throw new Error('AgoraRTC SDK not loaded on window');
    }

    this.client = sdk.createClient({ mode: 'rtc', codec: 'vp8' });
    await this.client.join(config.appId, config.channel, config.token, config.uid);

    this.localAudioTrack = await sdk.createMicrophoneAudioTrack({
      AEC: true,
      ANS: true,
      AGC: true,
    });
    await this.client.publish([this.localAudioTrack]);

    this.client.on('user-published', async (user: any, mediaType: string) => {
      if (mediaType === 'audio') {
        await this.client.subscribe(user, mediaType);
        user.audioTrack?.play();
        console.log('[AgoraRTCClient] remote audio playing from uid', user.uid);
      }
    });

    this.connected = true;
    console.log('[AgoraRTCClient] joined channel', config.channel);
  }

  async leave(): Promise<void> {
    if (!this.connected) return;

    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.close();
      } catch (err) {
        console.error('[AgoraRTCClient] error closing track:', err);
      }
      this.localAudioTrack = null;
    }

    if (this.client) {
      try {
        await this.client.leave();
      } catch (err) {
        console.error('[AgoraRTCClient] error leaving:', err);
      }
      this.client = null;
    }

    this.connected = false;
    console.log('[AgoraRTCClient] left channel');
  }

  setMicEnabled(enabled: boolean): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.setEnabled(enabled);
      console.log('[AgoraRTCClient] mic', enabled ? 'on' : 'off');
    } else {
      console.log('[AgoraRTCClient] DRY RUN — would set mic to', enabled);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
```

### Step 3.2: Modify `src/renderer/index.html`

Add the Agora SDK script tag BEFORE the overlay.js script tag.

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>CareyMary</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <div id="character">CareyMary</div>
    <!-- Agora RTC SDK loaded as a global script; exposes window.AgoraRTC -->
    <script src="../../node_modules/agora-rtc-sdk-ng/AgoraRTC_N-production.js"></script>
    <script src="./overlay.js"></script>
  </body>
</html>
```

Note the relative path: the built `dist/renderer/index.html` is two levels deep from repo root, so `../../node_modules/...` resolves correctly at runtime.

### Step 3.3: Modify `src/renderer/overlay.ts`

Must preserve zero-top-level-imports rule. Inline types. Pull AgoraRTC from window. Listen to preload events.

```typescript
// NOTE: This file is loaded as a plain script, not as an ES module.
// It must have no top-level imports/exports or tsc will emit CommonJS
// wrappers that reference `exports` (undefined in the browser context).
// Cody replaces this stub with the real sprite animation later.

type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

interface RTCJoinParams {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  enabled: boolean;
}

interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
  onStartRTC: (callback: (params: RTCJoinParams) => void) => void;
  onStopRTC: (callback: () => void) => void;
  onSetMicEnabled: (callback: (enabled: boolean) => void) => void;
  notifyRendererReady: () => void;
}

// Inline AgoraRTCClient — duplicated from src/core/agora-rtc.ts because the
// renderer is a plain script and can't import. Keep in sync manually.
class AgoraRTCClient {
  private client: any = null;
  private localAudioTrack: any = null;
  private connected = false;

  async join(params: RTCJoinParams): Promise<void> {
    if (!params.enabled) {
      console.log('[AgoraRTCClient] DRY RUN — would join channel', params.channel, 'as uid', params.uid);
      this.connected = true;
      return;
    }
    const sdk = (window as any).AgoraRTC;
    if (!sdk) {
      console.error('[AgoraRTCClient] window.AgoraRTC is missing — script tag did not load');
      return;
    }
    this.client = sdk.createClient({ mode: 'rtc', codec: 'vp8' });
    await this.client.join(params.appId, params.channel, params.token, params.uid);
    this.localAudioTrack = await sdk.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
    await this.client.publish([this.localAudioTrack]);
    this.client.on('user-published', async (user: any, mediaType: string) => {
      if (mediaType === 'audio') {
        await this.client.subscribe(user, mediaType);
        user.audioTrack?.play();
        console.log('[AgoraRTCClient] remote audio playing from uid', user.uid);
      }
    });
    this.connected = true;
    console.log('[AgoraRTCClient] joined channel', params.channel);
  }

  async leave(): Promise<void> {
    if (!this.connected) return;
    this.localAudioTrack?.close?.();
    this.localAudioTrack = null;
    try { await this.client?.leave?.(); } catch (e) { console.error(e); }
    this.client = null;
    this.connected = false;
    console.log('[AgoraRTCClient] left channel');
  }

  setMicEnabled(enabled: boolean): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.setEnabled(enabled);
      console.log('[AgoraRTCClient] mic', enabled ? 'on' : 'off');
    } else {
      console.log('[AgoraRTCClient] DRY RUN — would set mic to', enabled);
    }
  }
}

console.log('[renderer] loaded');

const rtc = new AgoraRTCClient();
const characterEl = document.getElementById('character');

const api = (window as Window & { careymary?: CareyMaryAPI }).careymary;
if (!api) {
  console.warn('[renderer] window.careymary not available — preload failed?');
} else {
  api.onCharacterState((state) => {
    console.log('[renderer] character-state:', state);
    if (characterEl) {
      characterEl.textContent = `CareyMary · ${state}`;
    }
  });

  api.onStartRTC((params) => {
    console.log('[renderer] onStartRTC', params);
    rtc.join(params).catch((err) => console.error('[renderer] rtc.join failed', err));
  });

  api.onStopRTC(() => {
    console.log('[renderer] onStopRTC');
    rtc.leave().catch((err) => console.error('[renderer] rtc.leave failed', err));
  });

  api.onSetMicEnabled((enabled) => {
    console.log('[renderer] onSetMicEnabled', enabled);
    rtc.setMicEnabled(enabled);
  });

  api.notifyRendererReady();
}
```

### Step 3.4: Create `test-harness/rtc-test.html`

Standalone Chrome test page. Loads Agora RTC SDK from CDN, offers manual join/leave/mute controls. No Electron required.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CareyMary Agora RTC Test Harness</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 640px; margin: 2rem auto; padding: 1rem; }
    input, button { display: block; width: 100%; padding: 0.5rem; margin: 0.25rem 0; font-size: 1rem; }
    button { cursor: pointer; background: #0a7; color: white; border: 0; }
    button:disabled { background: #aaa; }
    .row { display: flex; gap: 0.5rem; }
    .row > * { flex: 1; }
    #log { background: #111; color: #0f0; padding: 0.5rem; height: 200px; overflow: auto; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
    label { font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <h1>CareyMary Agora RTC Test Harness</h1>
  <p>Standalone test page — no Electron needed. Fill credentials, click Join, speak, verify you hear yourself back from the ConvoAI agent.</p>

  <label>App ID</label>
  <input id="appId" placeholder="agora app id">

  <label>Channel</label>
  <input id="channel" value="careymary-dev">

  <label>RTC Token</label>
  <input id="token" placeholder="temp token from Agora Console">

  <label>UID</label>
  <input id="uid" type="number" value="1002">

  <div class="row">
    <button id="joinBtn">Join</button>
    <button id="leaveBtn" disabled>Leave</button>
    <button id="muteBtn" disabled>Mute</button>
  </div>

  <h3>Log</h3>
  <div id="log"></div>

  <script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.23.2.js"></script>
  <script>
    const logEl = document.getElementById('log');
    const joinBtn = document.getElementById('joinBtn');
    const leaveBtn = document.getElementById('leaveBtn');
    const muteBtn = document.getElementById('muteBtn');

    let client = null;
    let localTrack = null;
    let muted = false;

    function log(...args) {
      const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      logEl.textContent += line + '\n';
      logEl.scrollTop = logEl.scrollHeight;
      console.log(...args);
    }

    if (!window.AgoraRTC) {
      log('ERROR: AgoraRTC SDK failed to load');
    } else {
      log('AgoraRTC SDK loaded, version:', AgoraRTC.VERSION);
    }

    joinBtn.addEventListener('click', async () => {
      const appId = document.getElementById('appId').value.trim();
      const channel = document.getElementById('channel').value.trim();
      const token = document.getElementById('token').value.trim();
      const uid = parseInt(document.getElementById('uid').value, 10);

      if (!appId || !channel || !token) {
        log('ERROR: fill appId, channel, and token');
        return;
      }

      try {
        client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        log('joining...', { channel, uid });
        await client.join(appId, channel, token, uid);
        log('joined');

        localTrack = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
        await client.publish([localTrack]);
        log('published mic');

        client.on('user-published', async (user, mediaType) => {
          log('user-published', user.uid, mediaType);
          if (mediaType === 'audio') {
            await client.subscribe(user, mediaType);
            user.audioTrack && user.audioTrack.play();
            log('playing remote audio from', user.uid);
          }
        });

        joinBtn.disabled = true;
        leaveBtn.disabled = false;
        muteBtn.disabled = false;
      } catch (err) {
        log('join failed:', err.message || err);
      }
    });

    leaveBtn.addEventListener('click', async () => {
      try {
        localTrack && localTrack.close();
        client && await client.leave();
        log('left');
      } catch (err) {
        log('leave failed:', err.message || err);
      }
      joinBtn.disabled = false;
      leaveBtn.disabled = true;
      muteBtn.disabled = true;
    });

    muteBtn.addEventListener('click', () => {
      muted = !muted;
      localTrack && localTrack.setEnabled(!muted);
      muteBtn.textContent = muted ? 'Unmute' : 'Mute';
      log(muted ? 'muted' : 'unmuted');
    });
  </script>
</body>
</html>
```

### Step 3.5: Verify Agent RTC

Run: `npx tsc --noEmit`
Expected: exit 0

Open `test-harness/rtc-test.html` in Chrome. Verify:
- "AgoraRTC SDK loaded, version: X.Y.Z" appears in log
- Join/Leave/Mute buttons render
- Clicking Join without credentials logs "ERROR: fill appId, channel, and token"

### Step 3.6: Commit Agent RTC

```bash
git add src/core/agora-rtc.ts src/renderer/overlay.ts src/renderer/index.html test-harness/rtc-test.html
git commit -m "feat: agora RTC client (dry-run aware) + standalone test harness"
```

---

## Task 4: Integrator — preload + ipc-handlers + index.ts

**Files:**
- Modify: `src/preload/preload.ts`
- Create: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

### Step 4.1: Create `src/main/ipc-handlers.ts`

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import type { CharacterState, RTCJoinParams } from '../types/index';

/** All IPC channel names — single source of truth. */
export const IPC_CHANNELS = {
  characterState: 'character-state',
  startRTC: 'start-rtc',
  stopRTC: 'stop-rtc',
  setMicEnabled: 'set-mic-enabled',
  rendererReady: 'renderer-ready',
} as const;

/**
 * Small sender helpers used by the main process to push state to the overlay.
 */
export function broadcastCharacterState(win: BrowserWindow, state: CharacterState): void {
  if (win.isDestroyed()) return;
  win.webContents.send(IPC_CHANNELS.characterState, state);
}

export function requestStartRTC(win: BrowserWindow, params: RTCJoinParams): void {
  if (win.isDestroyed()) return;
  win.webContents.send(IPC_CHANNELS.startRTC, params);
}

export function requestStopRTC(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.webContents.send(IPC_CHANNELS.stopRTC);
}

export function requestSetMicEnabled(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return;
  win.webContents.send(IPC_CHANNELS.setMicEnabled, enabled);
}

/**
 * Register main-side listeners for signals coming FROM the renderer.
 * Right now there's only `renderer-ready`. Extend here as tray/acknowledge wiring lands.
 */
export function registerMainListeners(onRendererReady: () => void): void {
  ipcMain.on(IPC_CHANNELS.rendererReady, () => {
    console.log('[ipc] renderer-ready received');
    onRendererReady();
  });
}
```

### Step 4.2: Modify `src/preload/preload.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { CareyMaryAPI, CharacterState, RTCJoinParams } from '../types/index';

// IPC channel names — must match src/main/ipc-handlers.ts IPC_CHANNELS.
const CHANNELS = {
  characterState: 'character-state',
  startRTC: 'start-rtc',
  stopRTC: 'stop-rtc',
  setMicEnabled: 'set-mic-enabled',
  rendererReady: 'renderer-ready',
} as const;

const api: CareyMaryAPI = {
  onCharacterState: (callback) => {
    ipcRenderer.on(CHANNELS.characterState, (_event, state: CharacterState) => callback(state));
  },
  onStartRTC: (callback) => {
    ipcRenderer.on(CHANNELS.startRTC, (_event, params: RTCJoinParams) => callback(params));
  },
  onStopRTC: (callback) => {
    ipcRenderer.on(CHANNELS.stopRTC, () => callback());
  },
  onSetMicEnabled: (callback) => {
    ipcRenderer.on(CHANNELS.setMicEnabled, (_event, enabled: boolean) => callback(enabled));
  },
  notifyRendererReady: () => {
    ipcRenderer.send(CHANNELS.rendererReady);
  },
};

contextBridge.exposeInMainWorld('careymary', api);
```

### Step 4.3: Modify `src/main/index.ts`

```typescript
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createOverlayWindow } from './overlay-window';
import { ScreenMonitor } from '../core/screen-monitor';
import { TimerManager } from '../core/timer-manager';
import { SessionStatsTracker } from '../core/session-stats';
import { AgoraAgent } from '../core/agora-agent';
import { buildContextPrompt, CAREYMARY_SYSTEM_PROMPT, pickCharacterState } from '../core/context-engine';
import {
  broadcastCharacterState,
  requestStartRTC,
  registerMainListeners,
} from './ipc-handlers';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const AGORA_ENABLED = (process.env.AGORA_ENABLED ?? 'false').toLowerCase() === 'true';
const CONTEXT_LOOP_MS = 30_000;

let overlayWindow: BrowserWindow | null = null;
let screenMonitor: ScreenMonitor | null = null;
let timerManager: TimerManager | null = null;
let sessionStats: SessionStatsTracker | null = null;
let agoraAgent: AgoraAgent | null = null;
let contextLoopHandle: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

async function startServices(): Promise<void> {
  screenMonitor = new ScreenMonitor();
  timerManager = new TimerManager();
  sessionStats = new SessionStatsTracker();

  sessionStats.attach(screenMonitor);

  screenMonitor.start();
  console.log('[main] ScreenMonitor started');

  timerManager.start();
  console.log('[main] TimerManager started');

  agoraAgent = new AgoraAgent({
    appId: process.env.AGORA_APP_ID ?? '',
    customerId: process.env.AGORA_CUSTOMER_ID ?? '',
    customerSecret: process.env.AGORA_CUSTOMER_SECRET ?? '',
    channelName: process.env.AGORA_CHANNEL_NAME ?? 'careymary-dev',
    rtcToken: process.env.AGORA_RTC_TOKEN ?? '',
    enabled: AGORA_ENABLED,
  });

  console.log(`[main] AgoraAgent initialized (enabled=${AGORA_ENABLED})`);

  try {
    await agoraAgent.start(CAREYMARY_SYSTEM_PROMPT);
  } catch (err) {
    console.error('[main] AgoraAgent.start failed:', err);
  }
}

function startContextLoop(): void {
  const tick = async (): Promise<void> => {
    if (!screenMonitor || !timerManager || !sessionStats || !agoraAgent || !overlayWindow) return;

    tickCount++;
    const screenState = screenMonitor.getState();
    const timerState = timerManager.getState();
    const dueReminders = timerManager.getDueReminders();
    const stats = sessionStats.getStats();

    const prompt =
      CAREYMARY_SYSTEM_PROMPT +
      '\n\n' +
      buildContextPrompt(screenState, timerState, dueReminders, stats);

    console.log(`[ContextLoop] tick #${tickCount}`);
    console.log(`[ContextLoop] app=${screenState.appName} category=${screenState.category} dueReminders=${dueReminders.join(',') || 'none'}`);

    try {
      await agoraAgent.updateContext(prompt);
    } catch (err) {
      console.error('[ContextLoop] updateContext failed:', err);
    }

    const characterState = pickCharacterState(screenState, dueReminders);
    broadcastCharacterState(overlayWindow, characterState);
  };

  // Fire once immediately for fast feedback, then every 30s.
  void tick();
  contextLoopHandle = setInterval(() => void tick(), CONTEXT_LOOP_MS);
  console.log('[main] Context loop started');
}

function kickRTCOnReady(): void {
  if (!overlayWindow) return;
  requestStartRTC(overlayWindow, {
    appId: process.env.AGORA_APP_ID ?? '',
    channel: process.env.AGORA_CHANNEL_NAME ?? 'careymary-dev',
    token: process.env.AGORA_RTC_TOKEN ?? '',
    uid: 1002,
    enabled: AGORA_ENABLED,
  });
}

app.whenReady().then(async () => {
  overlayWindow = createOverlayWindow();

  registerMainListeners(() => {
    kickRTCOnReady();
  });

  await startServices();
  startContextLoop();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      overlayWindow = createOverlayWindow();
    }
  });
});

app.on('before-quit', async () => {
  if (contextLoopHandle) clearInterval(contextLoopHandle);
  screenMonitor?.stop();
  timerManager?.stop();
  if (agoraAgent) await agoraAgent.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### Step 4.4: Verify build

Run: `npx tsc --noEmit`
Expected: exit 0

Run: `npm run build`
Expected: exit 0, dist/ populated

### Step 4.5: Runtime smoke test

Run: `npm start`

Expected console output:
```
[main] ScreenMonitor started
[main] TimerManager started
[main] AgoraAgent initialized (enabled=false)
[AgoraAgent] DRY RUN — would POST /join with payload: ...
[main] Context loop started
[ContextLoop] tick #1
[ContextLoop] app=<something> category=<something>
[AgoraAgent] DRY RUN — would POST /update with new system prompt, length=...
[ipc] renderer-ready received
[renderer] loaded
[renderer] onStartRTC {...}
[AgoraRTCClient] DRY RUN — would join channel careymary-dev as uid 1002
[renderer] character-state: idle|happy
```

Expected visual: overlay visible, text updates from "CareyMary" to "CareyMary · idle" (or similar).

### Step 4.6: Commit integrator

```bash
git add src/preload/preload.ts src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat: main-process wiring with 30s context loop and IPC bridge"
```

---

## Task 5: Update progress doc + final commit

**Files:**
- Modify: `docs/CAREYMARY_PROGRESS.md`

### Step 5.1: Update status rows

Change Edmund's Dev 1 lane rows from 🟡 in progress to ✅ shipped. Add a new Merge Log entry summarizing exactly what landed.

### Step 5.2: Commit + push

```bash
git add docs/CAREYMARY_PROGRESS.md
git commit -m "docs: mark Dev 1 lane shipped in progress log"
git push origin ZM
```

---

## Verification Checklist

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm start` opens the overlay window (bottom-left, visible)
- [ ] Console shows all expected log lines above
- [ ] `#character` text updates within 1s of startup (immediate tick)
- [ ] `test-harness/rtc-test.html` loads in Chrome and shows "AgoraRTC SDK loaded"
- [ ] No errors in main or renderer consoles
- [ ] Overlay still persists across spaces/fullscreen apps
- [ ] `docs/CAREYMARY_PROGRESS.md` reflects final state
- [ ] `git push origin ZM` succeeded
