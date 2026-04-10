import type { ScreenMonitor } from './screen-monitor';
import type { SessionStats, ScreenState } from '../types/index';

/**
 * Accumulates productive and distraction time by subscribing to a ScreenMonitor.
 * Uses the ScreenMonitor's streak fields as the source of truth — each tick we
 * take the delta in productiveStreak / distractionStreak and add it to totals.
 */
export class SessionStatsTracker {
  private stats: SessionStats;
  private lastProductiveStreak = 0;
  private lastDistractionStreak = 0;

  constructor() {
    this.stats = {
      productiveTime: 0,
      distractionTime: 0,
      startedAt: Date.now(),
    };
  }

  /** Attach to a ScreenMonitor and start accumulating. */
  attach(monitor: ScreenMonitor): void {
    monitor.on('change', (state: ScreenState) => this.ingest(state));
  }

  /** Ingest a screen state snapshot and update totals. */
  ingest(state: ScreenState): void {
    if (state.productiveStreak >= this.lastProductiveStreak) {
      this.stats.productiveTime += state.productiveStreak - this.lastProductiveStreak;
    }
    this.lastProductiveStreak = state.productiveStreak;

    if (state.distractionStreak >= this.lastDistractionStreak) {
      this.stats.distractionTime += state.distractionStreak - this.lastDistractionStreak;
    }
    this.lastDistractionStreak = state.distractionStreak;
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }
}
