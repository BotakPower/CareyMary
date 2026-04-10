type Mode = 'focused' | 'distracted';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
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

const focusedTimeEl = mustGet('focused-time');
const distractedTimeEl = mustGet('distracted-time');
const focusedBarEl = mustGet('focused-bar');
const distractedBarEl = mustGet('distracted-bar');
const modeEl = mustGet('mode');
const streakEl = mustGet('streak');

let focusedSeconds = 6 * 60 + 18; // mock
let distractedSeconds = 2 * 60 + 41; // mock
let mode: Mode = 'focused';
let streakSeconds = 23; // mock

function flipMode(): void {
  mode = mode === 'focused' ? 'distracted' : 'focused';
  streakSeconds = 0;
}

// Flip mode every ~15s so judges can see changes.
setInterval(() => flipMode(), 15_000);

function render(): void {
  focusedTimeEl.textContent = formatMMSS(focusedSeconds);
  distractedTimeEl.textContent = formatMMSS(distractedSeconds);

  const total = Math.max(1, focusedSeconds + distractedSeconds);
  const focusPct = clamp((focusedSeconds / total) * 100, 0, 100);
  const distractPct = clamp((distractedSeconds / total) * 100, 0, 100);

  focusedBarEl.style.width = `${focusPct.toFixed(0)}%`;
  distractedBarEl.style.width = `${distractPct.toFixed(0)}%`;

  modeEl.textContent = mode === 'focused' ? 'Focused' : 'Distracted';
  streakEl.textContent = `Streak: ${Math.floor(streakSeconds / 60)}:${pad2(streakSeconds % 60)}`;
}

setInterval(() => {
  if (mode === 'focused') focusedSeconds += 1;
  else distractedSeconds += 1;
  streakSeconds += 1;
  render();
}, 1000);

render();

