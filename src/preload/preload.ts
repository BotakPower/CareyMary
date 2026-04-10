import { contextBridge, ipcRenderer } from 'electron';
import type { CareyMaryAPI, CharacterState, RTCJoinParams } from '../types';

// IPC channel names - must match src/main/ipc-handlers.ts IPC_CHANNELS.
const CHANNELS = {
  characterState: 'character-state',
  startRTC: 'start-rtc',
  stopRTC: 'stop-rtc',
  setMicEnabled: 'set-mic-enabled',
  rendererReady: 'renderer-ready',
  rendererLog: 'renderer-log',
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
  setOverlayPassthrough: (passthrough: boolean) => {
    ipcRenderer.send('overlay:set-passthrough', passthrough);
  },
  quitCareyMary: () => {
    ipcRenderer.send('overlay:quit');
  },
  logToMain: (message: string) => {
    ipcRenderer.send(CHANNELS.rendererLog, message);
  },
  toggleDashboard: () => {
    ipcRenderer.send('dashboard:toggle');
  },
};

contextBridge.exposeInMainWorld('careymary', api);
