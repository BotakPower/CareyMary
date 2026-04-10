// Stub — will be replaced by Edmund's canonical version on merge.
// Interfaces match CAREYMARY_CONTEXT.md exactly.

export type AppCategory = 'productive' | 'distraction' | 'neutral' | 'break';

export interface ScreenState {
  appName: string;
  category: AppCategory;
  activeFor: number;         // seconds on current app
  distractionStreak: number; // consecutive seconds on distracting apps
  productiveStreak: number;  // consecutive seconds on productive apps
}

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

export interface SessionStats {
  productiveTime: number;   // seconds
  distractionTime: number;  // seconds
}
