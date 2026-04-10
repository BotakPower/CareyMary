import { BrowserWindow, ipcMain } from 'electron';
import type { CharacterState, RTCJoinParams } from '../types';

/** All IPC channel names - single source of truth. */
export const IPC_CHANNELS = {
  characterState: 'character-state',
  startRTC: 'start-rtc',
  stopRTC: 'stop-rtc',
  setMicEnabled: 'set-mic-enabled',
  rendererReady: 'renderer-ready',
  rendererLog: 'renderer-log',
  userTranscript: 'user-transcript',
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
 * - `onRendererReady`: the overlay finished mounting — safe to kick RTC.
 * - `onUserTranscript`: a final ASR transcript of something the user said,
 *   forwarded from the renderer's Agora stream-message listener. Main uses
 *   this (exactly once, for the first utterance) to extract the user's goal
 *   via Ollama and interpolate it into later nudge text.
 */
export function registerMainListeners(
  onRendererReady: () => void,
  onUserTranscript: (text: string) => void,
): void {
  ipcMain.on(IPC_CHANNELS.rendererReady, () => {
    console.log('[ipc] renderer-ready received');
    onRendererReady();
  });

  // Forward renderer logs to the main terminal so we can debug RTC issues
  // without opening DevTools. The renderer pushes short strings via
  // window.careymary.logToMain(...).
  ipcMain.on(IPC_CHANNELS.rendererLog, (_event, message: unknown) => {
    if (typeof message === 'string') {
      console.log('[renderer]', message);
    }
  });

  ipcMain.on(IPC_CHANNELS.userTranscript, (_event, text: unknown) => {
    if (typeof text !== 'string' || text.trim().length === 0) return;
    console.log('[ipc] user-transcript received:', text.slice(0, 200));
    onUserTranscript(text.trim());
  });
}
