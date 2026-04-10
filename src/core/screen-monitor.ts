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
  // Classify Electron as productive so dev-time testing of the dashboard
  // actually shows focus time accumulate. When CareyMary runs in production
  // the active window is the user's real app, not Electron itself.
  'Electron': 'productive',

  // Distractions
  'TikTok': 'distraction',
  'Instagram': 'distraction',
  'Twitter': 'distraction',
  'Netflix': 'distraction',
  'Twitch': 'distraction',

  // Browsers default to distraction. Without macOS Screen Recording permission,
  // get-windows can't read window titles and returns just the app name — so a
  // Chrome tab on YouTube looks identical to a Chrome tab on GitHub. For the
  // demo, treat browsers as distraction by default. When title access DOES
  // work, PRODUCTIVE_TITLES (GitHub / Stack Overflow / localhost) overrides
  // this in classifyApp() and lifts the classification back to productive.
  'Google Chrome': 'distraction',
  'Chrome': 'distraction',
  'Arc': 'distraction',
  'Safari': 'distraction',
  'Firefox': 'distraction',
  'Microsoft Edge': 'distraction',
  'Brave Browser': 'distraction',

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
const DISTRACTION_TITLES = ['YouTube', 'Reddit', 'TikTok', 'Instagram', 'Twitter', 'Netflix', 'Twitch', 'Facebook'];

// Browser tab titles / URLs that indicate productive coding work. Checked when
// the active app is a browser (Chrome / Arc / Safari / Edge) — so a Chrome
// window on GitHub counts as productive, but a Chrome window on YouTube does not.
const PRODUCTIVE_TITLES = [
  'GitHub',
  'Stack Overflow',
  'stackoverflow',
  'MDN',
  'developer.mozilla',
  'localhost',
  '127.0.0.1',
  'ChatGPT',
  'Claude',
  'Linear',
  'Jira',
  'Figma',
];

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

  constructor(pollIntervalMs = 2000) {
    super();
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Classifies an app by name + window title. Public for testing. */
  classifyApp(appName: string, windowTitle: string): AppCategory {
    // Distraction titles win over productive titles — YouTube in a GitHub
    // tab is still YouTube. Check specific-signal titles before falling back
    // to the app-name map.
    for (const keyword of DISTRACTION_TITLES) {
      if (windowTitle.includes(keyword)) return 'distraction';
    }

    for (const keyword of PRODUCTIVE_TITLES) {
      if (windowTitle.includes(keyword)) return 'productive';
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
    try {
      // Dynamic import for ESM-only get-windows under module: commonjs.
      // (active-win was renamed to get-windows upstream.)
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const getWindowsModule = await dynamicImport('get-windows');
      const mod: any = getWindowsModule;
      const activeWin =
        (typeof mod?.activeWindow === 'function' ? mod.activeWindow : undefined) ??
        (typeof mod?.default === 'function' ? mod.default : undefined) ??
        (typeof mod === 'function' ? mod : undefined);
      if (!activeWin) {
        throw new Error('get-windows import did not expose a callable function');
      }
      const fn = activeWin as () => Promise<{
        owner?: { name?: string };
        title?: string;
      } | null>;
      const result = await fn();

      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - this.lastTickTime) / 1000));
      this.lastTickTime = now;

      const appName = result?.owner?.name ?? 'Unknown';
      const windowTitle = result?.title ?? appName;
      const category = this.classifyApp(appName, windowTitle);
      const prevCategory = this.state.category;

      // Debug: log raw app + title so we can see whether macOS Screen Recording
      // permission is letting get-windows read the tab title (e.g. "YouTube -
      // ..." vs. just "Google Chrome"). If the title equals the app name, the
      // OS is redacting it — see the APP_CATEGORIES browser fallback above.
      if (appName !== this.state.appName || category !== prevCategory) {
        console.log(
          `[ScreenMonitor] app="${appName}" title="${windowTitle}" → ${category}`,
        );
      }

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

      // Per-tick event — fires every poll, independent of category transitions.
      // SessionStatsTracker subscribes to this so it can accumulate wall-clock
      // time into the right bucket every tick (not only on category flips).
      this.emit('tick', { category, elapsed, state: this.getState() });

      if (category !== prevCategory) {
        this.emit('change', this.getState());
      }
    } catch (err) {
      console.error('[ScreenMonitor] tick error:', err);
    }
  }
}
