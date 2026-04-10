import { app, BrowserWindow, Tray, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createOverlayWindow } from './overlay-window';
import { createDashboardWindow } from './dashboard-window';
import { createTray } from './tray';
import { ScreenMonitor } from '../core/screen-monitor';
import { TimerManager } from '../core/timer-manager';
import { SessionStatsTracker } from '../core/session-stats';
import { AgoraAgent } from '../core/agora-agent';
import { OllamaClient } from '../core/ollama-client';
import {
  CAREYMARY_SYSTEM_PROMPT,
  pickCharacterState,
  pickProactiveUtterance,
} from '../core/context-engine';
import {
  broadcastCharacterState,
  requestStartRTC,
  requestSetMicEnabled,
  registerMainListeners,
} from './ipc-handlers';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const AGORA_ENABLED = (process.env.AGORA_ENABLED ?? 'false').toLowerCase() === 'true';
const OLLAMA_ENABLED = (process.env.OLLAMA_ENABLED ?? 'true').toLowerCase() === 'true';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1:8b-instruct';
const CONTEXT_LOOP_MS = 2_000;
// Don't nudge the user twice inside this window. Short so water can fire
// shortly after the distraction callout in the demo flow.
const PROACTIVE_COOLDOWN_MS = 8_000;
// 10s lingering on a distraction triggers the callout.
const DISTRACTION_THRESHOLD_SEC = 10;
// Hard grace window after the agent joins — blocks /speak so the opening
// Q&A isn't cut off. The renderer separately kills the mic after the 2nd
// agent utterance (the "got it" acknowledgement), which is the real end
// of the listening phase; this grace is just belt-and-suspenders for
// /speak timing in case the user takes a while to answer.
const STARTUP_GRACE_MS = 30_000;

// Chromium could not create its on-disk GPU/shader cache (common on Windows with locked profile dirs).
// Harmless for CareyMary; this avoids noisy console errors. Remove if you rely on that cache for perf.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// The overlay window is click-through and never focused, so Chromium marks it
// "background" / "occluded" and throttles timers + audio processing — that
// starves Agora's WebRTC jitter buffer and produces choppy playback. These
// switches complement webPreferences.backgroundThrottling=false on the overlay.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let overlayWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let screenMonitor: ScreenMonitor | null = null;
let timerManager: TimerManager | null = null;
let sessionStats: SessionStatsTracker | null = null;
let agoraAgent: AgoraAgent | null = null;
let ollamaClient: OllamaClient | null = null;
let contextLoopHandle: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;
let isPaused = false;
let lastProactiveAt = 0;
// Captured once from the user's first ASR transcript, after Ollama condenses
// it to a short phrase like "the hackathon app". Used to personalize the
// distraction + water nudge text. Null until the first transcript arrives.
let goalPhrase: string | null = null;
let goalCaptureInFlight = false;
// Wall-clock timestamp of the moment the agent finished joining. Used to
// enforce STARTUP_GRACE_MS — no proactive /speak during the goal-collection
// Q&A at the start of the session.
let agentJoinedAt = 0;

function registerOverlayIpcHandlers(): void {
  ipcMain.on('overlay:set-passthrough', (_event, passthrough: unknown) => {
    if (typeof passthrough !== 'boolean') {
      return;
    }
    const win = overlayWindow;
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(passthrough, { forward: true });
    }
  });

  ipcMain.on('overlay:quit', () => {
    app.quit();
  });

  ipcMain.on('dashboard:toggle', () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.close();
      dashboardWindow = null;
      return;
    }
    dashboardWindow = createDashboardWindow();
  });
}

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

  ollamaClient = new OllamaClient({
    url: OLLAMA_URL,
    model: OLLAMA_MODEL,
    enabled: OLLAMA_ENABLED,
    timeoutMs: 4000,
    maxTokens: 32,
    temperature: 0.2,
  });
  console.log(
    `[main] OllamaClient initialized (enabled=${OLLAMA_ENABLED}, url=${OLLAMA_URL}, model=${OLLAMA_MODEL})`,
  );

  try {
    await agoraAgent.start(CAREYMARY_SYSTEM_PROMPT);
    agentJoinedAt = Date.now();
  } catch (err) {
    console.error('[main] Agora.start failed:', err);
  }
}

// Extract a short 2-5 word goal phrase from the user's raw ASR transcript.
// Used to personalize later nudge text. Runs through local Ollama so it stays
// offline and private. On any failure (Ollama down, timeout, empty output)
// we fall back to a naive heuristic so the demo still reads naturally.
const GOAL_EXTRACTOR_SYSTEM = `You extract short goal phrases from voice transcripts.

The user just answered the question "What are you working on today?" Your job is to produce a 2-5 word noun phrase describing their project.

RULES:
- Output ONLY the phrase. No punctuation, no quotes, no preamble.
- Use natural English that fits after "get back to ___" or "working on ___".
- Examples:
  - "I'm working on the hackathon app" → the hackathon app
  - "coding my Electron project" → your coding
  - "writing dissertation chapter three" → your dissertation chapter
  - "doing some Leetcode" → your Leetcode
- If the transcript is unclear, output exactly: your work`;

function heuristicGoalPhrase(raw: string): string {
  // Strip common filler prefixes so "I'm working on X" becomes "X".
  const cleaned = raw
    .toLowerCase()
    .replace(/^(um+|uh+|okay|ok|so|well|hey|hi|hello)[,\s]+/g, '')
    .replace(/^i(?:'m| am)\s+(?:currently\s+)?(?:working on|doing|writing|building|making|coding)\s+/, '')
    .replace(/^(?:working on|doing|writing|building|making)\s+/, '')
    .replace(/[.!?]+$/, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 5);
  return words.length > 0 ? words.join(' ') : 'your work';
}

async function captureGoalFromTranscript(text: string): Promise<void> {
  // Only capture the first transcript. Subsequent transcripts (if the mic
  // ever reopens) don't overwrite the goal.
  if (goalPhrase !== null || goalCaptureInFlight) {
    console.log('[main] goal already captured, ignoring transcript');
    return;
  }
  goalCaptureInFlight = true;
  console.log('[main] capturing goal from transcript:', text.slice(0, 200));

  let phrase: string | null = null;
  if (ollamaClient?.isEnabled()) {
    phrase = await ollamaClient.generate(GOAL_EXTRACTOR_SYSTEM, text);
    if (phrase) {
      // Ollama sometimes wraps in quotes or adds trailing punctuation.
      phrase = phrase.replace(/^["'`]|["'`]$/g, '').replace(/[.!?]+$/, '').trim();
    }
  }
  if (!phrase || phrase.length === 0 || phrase.length > 60) {
    phrase = heuristicGoalPhrase(text);
    console.log('[main] ollama unavailable/bad output — heuristic goal:', phrase);
  } else {
    console.log('[main] ollama extracted goal:', phrase);
  }
  goalPhrase = phrase;
  goalCaptureInFlight = false;
}

function startContextLoop(): void {
  const tick = async (): Promise<void> => {
    if (!screenMonitor || !timerManager || !sessionStats || !agoraAgent || !overlayWindow) return;
    if (isPaused) {
      console.log('[ContextLoop] paused — skipping tick');
      return;
    }

    tickCount++;
    const screenState = screenMonitor.getState();
    const dueReminders = timerManager.getDueReminders();

    // Hard grace window: during goal collection (greeting + user response +
    // confirmation) we don't push any /update or /speak, because either of
    // them can cut the agent off mid-utterance or stomp on the user's reply.
    // Screen state keeps accumulating so distractionStreak is accurate the
    // moment grace ends — we just don't act on it yet.
    const sinceJoin = Date.now() - agentJoinedAt;
    const inGrace = agentJoinedAt > 0 && sinceJoin < STARTUP_GRACE_MS;

    console.log(`[ContextLoop] tick #${tickCount}${inGrace ? ` (grace, ${Math.round((STARTUP_GRACE_MS - sinceJoin) / 1000)}s left)` : ''}`);
    console.log(
      `[ContextLoop] app=${screenState.appName} category=${screenState.category} distractionStreak=${screenState.distractionStreak}s productiveStreak=${screenState.productiveStreak}s dueReminders=${dueReminders.join(',') || 'none'}`,
    );

    if (inGrace) {
      // Still update the character sprite so the overlay animates, but skip
      // everything that talks to Agora.
      const characterStateInGrace = pickCharacterState(screenState, dueReminders);
      broadcastCharacterState(overlayWindow, characterStateInGrace);
      return;
    }

    // Mic is already killed by the renderer after the 2nd agent utterance
    // (the "got it" acknowledgement). We don't touch the mic from main here.

    // No continuous /update calls — the system prompt tells CareyMary to
    // stay silent by default, and pushing context every 10s was making the
    // LLM ramble. We only talk to the agent via /speak for water + distraction.

    // Proactive speech: decide if CareyMary should say something WITHOUT
    // waiting for the user to talk first. Uses Agora's /speak endpoint.
    // Ownership of the cooldown timestamp + reminder acknowledgment lives
    // here so the picker stays pure.
    const nowMs = Date.now();
    const cooldownLeft = Math.max(0, PROACTIVE_COOLDOWN_MS - (nowMs - lastProactiveAt));
    const nudge = pickProactiveUtterance(screenState, dueReminders, {
      nowMs,
      lastProactiveAt,
      cooldownMs: PROACTIVE_COOLDOWN_MS,
      distractionThresholdSec: DISTRACTION_THRESHOLD_SEC,
      goalPhrase: goalPhrase ?? undefined,
    });
    if (nudge) {
      console.log(`[ContextLoop] FIRING proactive nudge (${nudge.reason}):`, nudge.text);
      lastProactiveAt = Date.now();
      if (nudge.acknowledge) {
        timerManager.acknowledge(nudge.acknowledge);
      }
      try {
        await agoraAgent.speak(nudge.text);
      } catch (err) {
        console.error('[ContextLoop] speak failed:', err);
      }
    } else {
      // Explain exactly why nothing fired so we can debug silent ticks.
      const reasons: string[] = [];
      if (cooldownLeft > 0) reasons.push(`cooldown ${Math.round(cooldownLeft / 1000)}s left`);
      if (!dueReminders.includes('water') && screenState.category !== 'distraction') {
        reasons.push(`not distraction (category=${screenState.category})`);
      }
      if (
        screenState.category === 'distraction' &&
        screenState.distractionStreak < DISTRACTION_THRESHOLD_SEC
      ) {
        reasons.push(`streak ${screenState.distractionStreak}s < ${DISTRACTION_THRESHOLD_SEC}s threshold`);
      }
      if (reasons.length > 0) {
        console.log(`[ContextLoop] no nudge: ${reasons.join('; ')}`);
      }
    }

    const characterState = pickCharacterState(screenState, dueReminders);
    broadcastCharacterState(overlayWindow, characterState);
  };

  // Delay the first tick until near the end of the startup grace window.
  // During grace the tick would no-op anyway (inGrace early-return), so
  // there's no point burning ticks. 5s buffer before STARTUP_GRACE_MS gives
  // us one tick during grace for diagnostics, then tick #2 onwards does real
  // work after grace expires.
  const INITIAL_TICK_DELAY_MS = Math.max(5_000, STARTUP_GRACE_MS - 5_000);
  setTimeout(() => void tick(), INITIAL_TICK_DELAY_MS);
  contextLoopHandle = setInterval(() => void tick(), CONTEXT_LOOP_MS);
  console.log(`[main] Context loop started (first tick in ${INITIAL_TICK_DELAY_MS / 1000}s, grace=${STARTUP_GRACE_MS / 1000}s)`);
}

function registerTrayListeners(): void {
  ipcMain.on('tray:toggle-dashboard', () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.close();
      dashboardWindow = null;
      return;
    }
    dashboardWindow = createDashboardWindow();
  });

  ipcMain.on('tray:mic-toggle', (_event, muted: boolean) => {
    console.log('[tray] mic-toggle muted=', muted);
    if (overlayWindow) {
      requestSetMicEnabled(overlayWindow, !muted);
    }
  });

  ipcMain.on('tray:pause-toggle', (_event, paused: boolean) => {
    console.log('[tray] pause-toggle paused=', paused);
    isPaused = paused;
  });

  ipcMain.on('tray:ack-water', () => {
    console.log('[tray] ack-water');
    timerManager?.acknowledge('water');
  });

  ipcMain.on('tray:ack-break', () => {
    console.log('[tray] ack-break');
    timerManager?.acknowledge('break');
  });
}

function kickRTCOnReady(): void {
  if (!overlayWindow) return;
  const appId = process.env.AGORA_APP_ID ?? '';
  const channel = process.env.AGORA_CHANNEL_NAME ?? 'careymary-dev';
  const token = process.env.AGORA_RTC_TOKEN ?? '';
  // Print enough of each credential to verify dotenv picked up the fresh
  // values and that the token matches the channel we're joining. Tokens are
  // long so we only show the prefix + length.
  console.log(
    '[main] RTC credentials:',
    `appId=...${appId.slice(-6)}`,
    `channel="${channel}"`,
    `tokenPrefix=${token.slice(0, 20)}...`,
    `tokenLength=${token.length}`,
  );
  requestStartRTC(overlayWindow, {
    appId,
    channel,
    token,
    uid: 1002,
    enabled: AGORA_ENABLED,
  });
}

app.whenReady().then(async () => {
  registerOverlayIpcHandlers();
  overlayWindow = createOverlayWindow();

  registerMainListeners(
    () => {
      kickRTCOnReady();
    },
    (text: string) => {
      void captureGoalFromTranscript(text);
    },
  );

  registerTrayListeners();

  try {
    tray = createTray();
    console.log('[main] Tray created');
  } catch (err) {
    console.error('[main] Failed to create tray:', err);
  }

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
  tray?.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
