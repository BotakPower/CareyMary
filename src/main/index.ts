import { app, BrowserWindow, Tray, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createOverlayWindow } from './overlay-window';
import { createTray } from './tray';
import { ScreenMonitor } from '../core/screen-monitor';
import { TimerManager } from '../core/timer-manager';
import { SessionStatsTracker } from '../core/session-stats';
import { AgoraAgent } from '../core/agora-agent';
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
const CONTEXT_LOOP_MS = 10_000;
// Don't nudge the user twice inside this window — prevents CareyMary from
// spamming /speak when the distraction streak stays high across multiple ticks.
const PROACTIVE_COOLDOWN_MS = 25_000;
// How long the user has to linger on a distraction before CareyMary calls it out.
// Kept aggressive so the hackathon demo lands: 10s of YouTube triggers the nudge.
const DISTRACTION_THRESHOLD_SEC = 10;
// Hard grace window after the agent joins. During this period:
//   - No /update calls (would interrupt the greeting mid-sentence)
//   - No proactive /speak calls (would interrupt the goal collection Q&A)
// Long enough to cover: greeting (~15s) + user response (~15s) + confirmation (~10s).
const STARTUP_GRACE_MS = 45_000;

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
let tray: Tray | null = null;
let screenMonitor: ScreenMonitor | null = null;
let timerManager: TimerManager | null = null;
let sessionStats: SessionStatsTracker | null = null;
let agoraAgent: AgoraAgent | null = null;
let contextLoopHandle: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;
let isPaused = false;
let lastProactiveAt = 0;
// Wall-clock timestamp of the moment the agent finished joining. Used to
// enforce STARTUP_GRACE_MS — no updates or proactive speech during the
// goal-collection Q&A at the start of the session.
let agentJoinedAt = 0;
// Once we cut the mic after grace, we never turn it back on — CareyMary
// should ONLY speak scripted /speak nudges (water + distraction), never
// respond conversationally. This flag makes sure we only send the mic-off
// IPC once instead of every tick.
let micCutAfterGrace = false;

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

  try {
    await agoraAgent.start(CAREYMARY_SYSTEM_PROMPT);
    agentJoinedAt = Date.now();
  } catch (err) {
    console.error('[main] AgoraAgent.start failed:', err);
  }
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

    // First tick AFTER the grace window: cut the mic permanently. CareyMary
    // only speaks scripted /speak nudges from here on — no ASR listening,
    // no conversational responses like "you're so sweet". The user already
    // told us their goal during the grace window; we don't need the mic
    // again for the rest of the session.
    if (!micCutAfterGrace) {
      micCutAfterGrace = true;
      console.log('[ContextLoop] grace window over — muting mic permanently (scripted nudges only)');
      requestSetMicEnabled(overlayWindow, false);
    }

    // No continuous /update calls — the system prompt tells CareyMary to
    // stay silent by default, and pushing context every 10s was making the
    // LLM ramble. We only talk to the agent via /speak for water + distraction.

    // Proactive speech: decide if CareyMary should say something WITHOUT
    // waiting for the user to talk first. Uses Agora's /speak endpoint.
    // Ownership of the cooldown timestamp + reminder acknowledgment lives
    // here so the picker stays pure.
    const nudge = pickProactiveUtterance(screenState, dueReminders, {
      nowMs: Date.now(),
      lastProactiveAt,
      cooldownMs: PROACTIVE_COOLDOWN_MS,
      distractionThresholdSec: DISTRACTION_THRESHOLD_SEC,
    });
    if (nudge) {
      console.log(`[ContextLoop] proactive nudge (${nudge.reason}):`, nudge.text);
      lastProactiveAt = Date.now();
      if (nudge.acknowledge) {
        timerManager.acknowledge(nudge.acknowledge);
      }
      try {
        await agoraAgent.speak(nudge.text);
      } catch (err) {
        console.error('[ContextLoop] speak failed:', err);
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

/**
 * Wire tray context-menu clicks into the running services.
 * SimYee's tray.ts fires synthetic ipcMain events — we bridge them here.
 */
function registerTrayListeners(): void {
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

  registerMainListeners(() => {
    kickRTCOnReady();
  });

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
