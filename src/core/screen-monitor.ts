import { EventEmitter } from 'events';
import { ScreenState, AppCategory } from '../types/index';

const APP_CATEGORIES: Record<string, AppCategory> = {
  // Productive
  'Code': 'productive',
  'Visual Studio Code': 'productive',
  'Terminal': 'productive',
  'iTerm2': 'productive',
  'Windows Terminal': 'productive',
  'Cursor': 'productive',
  'WebStorm': 'productive',
  'Sublime Text': 'productive',
  'Warp': 'productive',

  // Distractions
  'TikTok': 'distraction',
  'Instagram': 'distraction',
  'Twitter': 'distraction',
  'Netflix': 'distraction',
  'Twitch': 'distraction',

  // Neutral
  'Slack': 'neutral',
  'Discord': 'neutral',
  'Notion': 'neutral',
  'Finder': 'neutral',
  'Explorer': 'neutral',
  'Spotify': 'neutral',

  // Break
  'FaceTime': 'break',
  'Messages': 'break',
  'zoom.us': 'break',
};

// Browser tab titles that indicate distraction
const DISTRACTION_TITLES = ['YouTube', 'Reddit', 'TikTok', 'Instagram', 'Twitter', 'Netflix', 'Twitch'];

export class ScreenMonitor extends EventEmitter {
  private state: ScreenState = {
    appName: '',
    category: 'neutral',
    activeFor: 0,
    distractionStreak: 0,
    productiveStreak: 0,
  };

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = Date.now();
  private readonly pollIntervalMs: number;

  constructor(pollIntervalMs = 5000) {
    super();
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Classifies an app by name + window title. Public for testing. */
  classifyApp(appName: string, windowTitle: string): AppCategory {
    // Check browser tab title for distracting sites
    for (const keyword of DISTRACTION_TITLES) {
      if (windowTitle.includes(keyword)) return 'distraction';
    }

    return APP_CATEGORIES[appName] ?? 'neutral';
  }

  start(): void {
    if (this.intervalId) return;
    this.lastTickTime = Date.now();
    this.intervalId = setInterval(() => this.tick(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getState(): ScreenState {
    return { ...this.state };
  }

  private async tick(): Promise<void> {
    // Dynamic import — active-win is ESM only
    const activeWin = await import('active-win');
    const result = await activeWin.activeWindow();

    const now = Date.now();
    const elapsed = Math.floor((now - this.lastTickTime) / 1000);
    this.lastTickTime = now;

    const appName = result?.owner?.name ?? 'Unknown';
    const windowTitle = result?.title ?? appName;
    const category = this.classifyApp(appName, windowTitle);
    const prevCategory = this.state.category;

    // Update streaks
    if (category === 'distraction') {
      this.state.distractionStreak += elapsed;
      this.state.productiveStreak = 0;
    } else if (category === 'productive') {
      this.state.productiveStreak += elapsed;
      this.state.distractionStreak = 0;
    } else {
      // neutral / break resets both streaks
      this.state.distractionStreak = 0;
      this.state.productiveStreak = 0;
    }

    // Update activeFor — reset if app changed
    if (appName !== this.state.appName) {
      this.state.activeFor = elapsed;
    } else {
      this.state.activeFor += elapsed;
    }

    this.state.appName = appName;
    this.state.category = category;

    if (category !== prevCategory) {
      this.emit('change', this.getState());
    }
  }
}
