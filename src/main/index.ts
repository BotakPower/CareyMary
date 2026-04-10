import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createOverlayWindow } from './overlay-window';
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
