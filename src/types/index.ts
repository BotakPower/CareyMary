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
  setOverlayPassthrough: (passthrough: boolean) => void;
  quitCareyMary: () => void;
  logToMain: (message: string) => void;
  toggleDashboard: () => void;
}
