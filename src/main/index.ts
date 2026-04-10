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
  buildContextPrompt,
  CAREYMARY_SYSTEM_PROMPT,
  pickCharacterState,
} from '../core/context-engine';
import {
  broadcastCharacterState,
  requestStartRTC,
  requestSetMicEnabled,
  registerMainListeners,
} from './ipc-handlers';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const AGORA_ENABLED = (process.env.AGORA_ENABLED ?? 'false').toLowerCase() === 'true';
const CONTEXT_LOOP_MS = 30_000;

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let screenMonitor: ScreenMonitor | null = null;
let timerManager: TimerManager | null = null;
let sessionStats: SessionStatsTracker | null = null;
let agoraAgent: AgoraAgent | null = null;
let contextLoopHandle: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;
let isPaused = false;

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
    if (isPaused) {
      console.log('[ContextLoop] paused — skipping tick');
      return;
    }

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
    console.log(
      `[ContextLoop] app=${screenState.appName} category=${screenState.category} dueReminders=${dueReminders.join(',') || 'none'}`,
    );

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
