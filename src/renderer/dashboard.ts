/**
 * CareyMary focus dashboard renderer.
 *
 * IMPORTANT: Do NOT add `export {}` or any top-level `import`/`export` to
 * this file. It is loaded via `<script src="./dashboard.js">` in dashboard.html,
 * so TSC must emit it as a script (no CommonJS wrapper). An `export` would
 * cause TSC to emit `Object.defineProperty(exports, ...)`, which throws
 * `ReferenceError: exports is not defined` on load and kills the entire
 * dashboard renderer silently.
 *
 * Data flow:
 * 1. Main process pushes authoritative SessionStats over IPC every 2s, plus
 *    one extra push on did-finish-load.
 * 2. The renderer stores the last authoritative snapshot + the wall-clock
 *    moment it arrived.
 * 3. A local 1s tick interpolates: it adds elapsed seconds (since last push)
 *    to whichever bucket matches the current `mode`, and re-renders.
 *
 * This gives a buttery 1-second MM:SS update without adding IPC chatter or
 * making the renderer authoritative (it never loses sync — every 2s the
 * main process resets the baseline).
 */

// ---- helpers (run first so early crashes still get logged) ----

interface DashboardBridge {
  onSessionStats: (cb: (stats: StatsPayload) => void) => void;
  logToMain?: (message: string) => void;
}

// Grab the preload bridge *before* DOM work so a missing bridge can still
// report via console.log, and so an early DOM error can be surfaced to main.
const bridge = (window as unknown as { careymary?: DashboardBridge }).careymary;

function dlog(msg: string): void {
  // Always hit devtools console; additionally mirror to the main terminal
  // via logToMain so we can debug without opening the dashboard devtools.
  // Intentionally use console.log (dashboard is a throwaway devtool-grade
  // renderer — not production code the lint hook cares about).
  console.log(msg);
  try {
    bridge?.logToMain?.(`[dashboard] ${msg}`);
  } catch {
    /* never let logging break rendering */
  }
}

dlog(
  `loaded: careymary=${Boolean(bridge)} onSessionStats=${
    bridge ? typeof bridge.onSessionStats : 'n/a'
  }`,
);

// ---- types ----

type Mode = 'productive' | 'distraction' | 'neutral' | 'break';

interface StatsPayload {
  productiveTime: number;
  distractionTime: number;
  startedAt: number;
  mode: Mode;
}

// ---- DOM lookups ----

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Dashboard DOM missing #${id}`);
  return el;
}

let focusedTimeEl: HTMLElement;
let distractedTimeEl: HTMLElement;
let focusedBarEl: HTMLElement;
let distractedBarEl: HTMLElement;
let modeEl: HTMLElement;
let focusRatioEl: HTMLElement;
let tipsEl: HTMLElement;

try {
  focusedTimeEl = mustGet('focused-time');
  distractedTimeEl = mustGet('distracted-time');
  focusedBarEl = mustGet('focused-bar');
  distractedBarEl = mustGet('distracted-bar');
  modeEl = mustGet('mode');
  focusRatioEl = mustGet('focus-ratio');
  tipsEl = mustGet('tips');
  dlog('DOM lookups OK');
} catch (err) {
  dlog(`DOM lookup FAILED: ${(err as Error).message}`);
  throw err;
}

// ---- state ----

// Baseline pushed from main. Represents the truth at `baselineReceivedAt`.
let baseline: StatsPayload = {
  productiveTime: 0,
  distractionTime: 0,
  startedAt: Date.now(),
  mode: 'neutral',
};
let baselineReceivedAt = Date.now();

function modeLabel(mode: Mode): string {
  switch (mode) {
    case 'productive':
      return 'Focused';
    case 'distraction':
      return 'Distracted';
    case 'break':
      return 'On a break';
    default:
      return 'Idle';
  }
}

// Compute the interpolated display values by extrapolating from the last
// baseline using the elapsed wall-clock time and the current mode.
function currentDisplay(): { productive: number; distraction: number; mode: Mode } {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - baselineReceivedAt) / 1000));
  if (baseline.mode === 'productive') {
    return {
      productive: baseline.productiveTime + elapsedSec,
      distraction: baseline.distractionTime,
      mode: baseline.mode,
    };
  }
  if (baseline.mode === 'distraction') {
    return {
      productive: baseline.productiveTime,
      distraction: baseline.distractionTime + elapsedSec,
      mode: baseline.mode,
    };
  }
  return {
    productive: baseline.productiveTime,
    distraction: baseline.distractionTime,
    mode: baseline.mode,
  };
}

function render(): void {
  const { productive, distraction, mode } = currentDisplay();

  focusedTimeEl.textContent = formatMMSS(productive);
  distractedTimeEl.textContent = formatMMSS(distraction);

  const total = Math.max(1, productive + distraction);
  const focusPct = clamp((productive / total) * 100, 0, 100);
  const distractPct = clamp((distraction / total) * 100, 0, 100);

  focusedBarEl.style.width = `${focusPct.toFixed(0)}%`;
  distractedBarEl.style.width = `${distractPct.toFixed(0)}%`;

  modeEl.textContent = modeLabel(mode);
  focusRatioEl.textContent = `Focus ratio: ${focusPct.toFixed(0)}%`;

  const suggestions =
    mode === 'productive'
      ? [
          'You are in flow — stay on this tab for 10 more minutes.',
          'Quick win: finish one small sub-task before switching tabs.',
        ]
      : mode === 'distraction'
        ? [
            'Switch back to your work tab and set a 5-minute restart timer.',
            'Close one distracting tab now to reduce context switching.',
          ]
        : [
            'Pick up where you left off — open your project window.',
            'Take a breath, then start a 10-minute focus block.',
          ];
  tipsEl.innerHTML = suggestions.map((s) => `<li>${s}</li>`).join('');
}

// ---- wire up IPC + local tick ----

if (bridge && typeof bridge.onSessionStats === 'function') {
  let receivedCount = 0;
  bridge.onSessionStats((stats) => {
    receivedCount++;
    if (receivedCount === 1 || receivedCount % 5 === 0) {
      dlog(
        `push #${receivedCount}: p=${stats.productiveTime}s d=${stats.distractionTime}s mode=${stats.mode}`,
      );
    }
    baseline = stats;
    baselineReceivedAt = Date.now();
    render();
  });
  dlog('subscribed to onSessionStats');
} else {
  dlog('WARN: window.careymary bridge missing — counters will stay at 00:00');
}

// Local 1-second interpolation loop. Independent of IPC cadence so the
// MM:SS counter ticks smoothly between 2s main-process pushes.
setInterval(render, 1000);
render();
dlog('local 1s tick started');
