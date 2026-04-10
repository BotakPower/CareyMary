import type { ScreenMonitor } from './screen-monitor';
import type { SessionStats, AppCategory } from '../types/index';

/**
 * Accumulates productive and distraction time by subscribing to a ScreenMonitor.
 *
 * Design note: we subscribe to the per-tick `'tick'` event (fires every poll),
 * NOT the `'change'` event (fires only on category transitions). The previous
 * design used streak deltas from 'change' events, which both (a) missed all
 * time between transitions and (b) discarded seconds across streak resets.
 * Accumulating elapsed wall-clock per tick is simpler and actually correct.
 *
 * Time is only added to a bucket when the tick's category matches that bucket:
 * - productive tick → productiveTime += elapsed
 * - distraction tick → distractionTime += elapsed
 * - neutral / break ticks → nothing (they're neither win nor loss)
 */
export class SessionStatsTracker {
  private stats: SessionStats;
  private currentMode: AppCategory = 'neutral';

  constructor() {
    this.stats = {
      productiveTime: 0,
      distractionTime: 0,
      startedAt: Date.now(),
    };
  }

  /** Attach to a ScreenMonitor and start accumulating. */
  attach(monitor: ScreenMonitor): void {
    monitor.on(
      'tick',
      (payload: { category: AppCategory; elapsed: number }) => {
        this.ingest(payload.category, payload.elapsed);
      },
    );
  }

  /**
   * Ingest a single tick. `elapsed` is the wall-clock seconds since the
   * previous tick; `category` is the classification at this tick. Exposed
   * for testing with a fake monitor.
   */
  ingest(category: AppCategory, elapsed: number): void {
    this.currentMode = category;
    if (elapsed <= 0) return;
    if (category === 'productive') {
      this.stats.productiveTime += elapsed;
    } else if (category === 'distraction') {
      this.stats.distractionTime += elapsed;
    }
    // neutral / break: don't count — they're neither focus nor drift.
  }

  getStats(): SessionStats {
    return { ...this.stats };
  }

  getCurrentMode(): AppCategory {
    return this.currentMode;
  }
}
