import { EventEmitter } from 'events';
import { TimerConfig, TimerState, ReminderType } from '../types/index';

// Demo-tuned intervals: 30-min hackathon demo needs reminders that fire within
// the session, not in an hour. For production-grade, pass a custom TimerConfig
// into the TimerManager constructor.
const DEFAULT_CONFIG: TimerConfig = {
  waterIntervalMs:   2 * 60 * 1000,   // 2 min
  stretchIntervalMs: 4 * 60 * 1000,   // 4 min
  breakIntervalMs:   6 * 60 * 1000,   // 6 min
  postureCheckMs:    5 * 60 * 1000,   // 5 min
};

export class TimerManager extends EventEmitter {
  private config: TimerConfig;
  private state: TimerState;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickIntervalMs: number;

  constructor(config: Partial<TimerConfig> = {}, tickIntervalMs = 1_000) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tickIntervalMs = tickIntervalMs;
    const now = Date.now() - 1; // 1ms in the past so sub-ms intervals fire immediately
    this.state = {
      lastWaterReminder: now,
      lastBreakReminder: now,
      lastPostureCheck: now,
      lastStretchReminder: now,
      waterCount: 0,
      breaksTaken: 0,
    };
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getState(): TimerState {
    return { ...this.state };
  }

  getDueReminders(): ReminderType[] {
    const now = Date.now();
    const due: ReminderType[] = [];

    if (now - this.state.lastWaterReminder >= this.config.waterIntervalMs) due.push('water');
    if (now - this.state.lastBreakReminder >= this.config.breakIntervalMs) due.push('break');
    if (now - this.state.lastPostureCheck >= this.config.postureCheckMs) due.push('posture');
    if (now - this.state.lastStretchReminder >= this.config.stretchIntervalMs) due.push('stretch');

    return due;
  }

  acknowledge(type: ReminderType): void {
    const now = Date.now();
    switch (type) {
      case 'water':
        this.state.lastWaterReminder = now;
        this.state.waterCount++;
        break;
      case 'break':
        this.state.lastBreakReminder = now;
        this.state.breaksTaken++;
        break;
      case 'posture':
        this.state.lastPostureCheck = now;
        break;
      case 'stretch':
        this.state.lastStretchReminder = now;
        break;
    }
  }

  private tick(): void {
    const due = this.getDueReminders();
    for (const type of due) {
      this.emit('reminder', type);
    }
  }
}
