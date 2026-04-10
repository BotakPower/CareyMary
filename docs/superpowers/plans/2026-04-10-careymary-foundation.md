# CareyMary Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a runnable Electron + TypeScript scaffold on `uat` with a transparent booting overlay window, unblocking Devs 2/3/4 within the first hour of the hackathon.

**Architecture:** Electron 33+ main process creates a transparent click-through BrowserWindow; a `contextBridge` preload exposes `window.careymary` to the renderer; the renderer is a placeholder HTML shell that logs "renderer loaded". TypeScript strict, CommonJS output to `dist/`. Zero Agora, zero active-win, zero timer logic — those belong to other devs' branches and Edmund's later work.

**Tech Stack:** Electron 33+, TypeScript 5.5+ strict, Node 20+, npm.

**Spec:** `docs/superpowers/specs/2026-04-10-careymary-foundation-design.md`

**Baseline branch:** `uat`. Foundation pushes directly to `uat` and is tagged `foundation-v0`.

**Testing bar:** No unit/integration tests. `npx tsc --noEmit` + runtime smoke test (`npm start` must boot a transparent window on macOS) is the entire verification gate.

---

## File Structure

```
careymary/
├── package.json                        [Task 1]
├── tsconfig.json                       [Task 1]
├── .gitignore                          [Task 1]
├── .gitattributes                      [Task 1]
├── .env.example                        [Task 1]
├── electron-builder.yml                [Task 1]
│
├── src/
│   ├── types/
│   │   └── index.ts                    [Task 2] — shared contract for all devs
│   │
│   ├── main/
│   │   ├── overlay-window.ts           [Task 3] — SimYee replaces this later
│   │   └── index.ts                    [Task 3] — Edmund replaces this later
│   │
│   ├── preload/
│   │   └── preload.ts                  [Task 4] — contextBridge stub
│   │
│   └── renderer/
│       ├── index.html                  [Task 5]
│       ├── styles.css                  [Task 5] — Cody replaces this later
│       └── overlay.ts                  [Task 5] — Cody replaces this later
│
└── docs/
    ├── ONBOARDING_DEV2_ZHIHAO.md       [Task 6]
    ├── ONBOARDING_DEV3_SIMYEE.md       [Task 6]
    └── ONBOARDING_DEV4_CODY.md         [Task 6]
```

**Parallelization notes (for subagent-driven execution):**
- Tasks 1, 2, 5, 6 are independent file groups and can run in parallel.
- Tasks 3 and 4 depend on Task 2 (types must exist first), so run them after Task 2 completes.
- Tasks 7–11 are sequential integrator work (Edmund, not an agent).

---

## Task 1: Scaffold Config Files

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `.env.example`
- Create: `electron-builder.yml`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "careymary",
  "version": "0.1.0",
  "description": "Desktop productivity companion for people with ADHD",
  "main": "dist/main/index.js",
  "scripts": {
    "build": "tsc && node -e \"const fs=require('fs'),path=require('path');const src=path.join('src','renderer');const dst=path.join('dist','renderer');fs.mkdirSync(dst,{recursive:true});for(const f of fs.readdirSync(src)){if(f.endsWith('.html')||f.endsWith('.css'))fs.copyFileSync(path.join(src,f),path.join(dst,f));}\"",
    "start": "npm run build && electron .",
    "dev": "tsc --watch & electron .",
    "package:mac": "npm run build && electron-builder --mac",
    "package:win": "npm run build && electron-builder --win"
  },
  "dependencies": {
    "active-win": "^9.0.0",
    "agora-rtc-sdk-ng": "^4.23.2",
    "dotenv": "^16.4.0",
    "electron-store": "^8.0.0"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0"
  }
}
```

Note: do NOT set `"type": "module"`. CommonJS is the default and the tsconfig `module: "commonjs"` must match.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules
dist
release
.env
*.log
.DS_Store
```

- [ ] **Step 4: Write `.gitattributes`**

```
* text=auto eol=lf
*.png binary
*.ico binary
```

- [ ] **Step 5: Write `.env.example`**

```
# Agora credentials — get from https://console.agora.io
AGORA_APP_ID=
AGORA_CUSTOMER_ID=
AGORA_CUSTOMER_SECRET=
AGORA_RTC_TOKEN=
AGORA_CHANNEL_NAME=careymary-dev
```

- [ ] **Step 6: Write `electron-builder.yml`**

```yaml
appId: com.careymary.app
productName: CareyMary
directories:
  output: release
files:
  - dist/**/*
  - package.json
  - assets/**/*
mac:
  target: dmg
  category: public.app-category.productivity
win:
  target: nsis
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore .gitattributes .env.example electron-builder.yml
git commit -m "feat: scaffold package.json, tsconfig, and build config"
```

---

## Task 2: Shared Types Contract

**Files:**
- Create: `src/types/index.ts`

This is the contract every other dev imports from. Must be written before Tasks 3 and 4.

- [ ] **Step 1: Write `src/types/index.ts`**

```typescript
// Screen monitoring — CAREYMARY_CONTEXT.md Module 2
export type AppCategory = 'productive' | 'distraction' | 'neutral' | 'break';

export interface ScreenState {
  appName: string;
  category: AppCategory;
  activeFor: number;
  distractionStreak: number;
  productiveStreak: number;
}

// Timer management — CAREYMARY_CONTEXT.md Module 3
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

// Session stats — consumed by context engine
export interface SessionStats {
  productiveTime: number;
  distractionTime: number;
  startedAt: number;
}

// Character animation — CAREYMARY_CONTEXT.md Module 8
export type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

// Preload bridge contract — what the renderer sees on window.careymary
export interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: shared types contract for all dev modules"
```

---

## Task 3: Electron Main Process

**Files:**
- Create: `src/main/overlay-window.ts`
- Create: `src/main/index.ts`

Depends on Task 2 (imports types implicitly via the preload path). SimYee will replace `overlay-window.ts` internals later but must preserve the exported factory signature.

- [ ] **Step 1: Write `src/main/overlay-window.ts`**

```typescript
import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

/**
 * Creates the transparent click-through overlay window anchored bottom-left.
 * SimYee (Dev 3) owns this module post-foundation — must preserve this signature.
 */
export function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height: screenHeight } = primaryDisplay.workAreaSize;

  const overlay = new BrowserWindow({
    width: 200,
    height: 200,
    x: 0,
    y: screenHeight - 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(process.platform === 'win32' && { backgroundColor: '#00000000' }),
  });

  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  return overlay;
}
```

- [ ] **Step 2: Write `src/main/index.ts`**

```typescript
import { app, BrowserWindow } from 'electron';
import { createOverlayWindow } from './overlay-window';

let overlayWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  overlayWindow = createOverlayWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      overlayWindow = createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/main/overlay-window.ts src/main/index.ts
git commit -m "feat: Electron main process + transparent overlay window factory"
```

---

## Task 4: Preload Bridge

**Files:**
- Create: `src/preload/preload.ts`

Depends on Task 2 (imports `CareyMaryAPI` and `CharacterState` as types). The preload uses `contextBridge` only — no direct Node access from the renderer.

- [ ] **Step 1: Write `src/preload/preload.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { CareyMaryAPI, CharacterState } from '../types';

const api: CareyMaryAPI = {
  onCharacterState: (callback: (state: CharacterState) => void) => {
    ipcRenderer.on('character-state', (_event, state: CharacterState) => {
      callback(state);
    });
  },
};

contextBridge.exposeInMainWorld('careymary', api);
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/preload.ts
git commit -m "feat: contextBridge preload exposing window.careymary stub"
```

---

## Task 5: Renderer Shell

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/styles.css`
- Create: `src/renderer/overlay.ts`

**Critical constraint:** `overlay.ts` is loaded via plain `<script src="./overlay.js">` — not as an ES module. It must therefore have **no top-level `import` or `export` statements**, or tsc will emit CommonJS wrappers that reference `exports` (undefined in the browser context and will crash on load). Types are duplicated inline from `src/types/index.ts` for this file only. Cody replaces this whole file later.

- [ ] **Step 1: Write `src/renderer/index.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>CareyMary</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <div id="character">CareyMary</div>
    <script src="./overlay.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `src/renderer/styles.css`**

```css
html, body {
  background: transparent;
  margin: 0;
  overflow: hidden;
  width: 200px;
  height: 200px;
}

#character {
  image-rendering: pixelated;
  font-family: monospace;
  color: #000;
  font-size: 20px;
  text-align: center;
  padding-top: 90px;
  user-select: none;
}
```

- [ ] **Step 3: Write `src/renderer/overlay.ts`**

```typescript
// NOTE: This file is loaded as a plain script, not as an ES module.
// It must have no top-level imports/exports or tsc will emit CommonJS
// wrappers that reference `exports` (undefined in the browser context).
// Cody replaces this stub with the real sprite animation.

type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
}

console.log('renderer loaded');

const api = (window as Window & { careymary?: CareyMaryAPI }).careymary;
if (api) {
  api.onCharacterState((state) => {
    console.log('character-state:', state);
  });
} else {
  console.warn('window.careymary not available — preload failed?');
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/overlay.ts
git commit -m "feat: transparent renderer shell with preload-bridge stub"
```

---

## Task 6: Per-Dev Onboarding Docs

**Files:**
- Create: `docs/ONBOARDING_DEV2_ZHIHAO.md`
- Create: `docs/ONBOARDING_DEV3_SIMYEE.md`
- Create: `docs/ONBOARDING_DEV4_CODY.md`

Tight checklists that point at `CAREYMARY_CONTEXT.md` rather than duplicating it.

- [ ] **Step 1: Write `docs/ONBOARDING_DEV2_ZHIHAO.md`**

````markdown
# ZhiHao — Dev 2 Onboarding

Welcome. You own the core monitoring logic. 60-second kickoff below.

## Read first
1. `docs/CAREYMARY_CONTEXT.md` — skim the whole thing, then read **Modules 2 and 3** carefully
2. `src/types/index.ts` — the shared contract. Import from here. Do not add new types without telling Edmund.

## Branch
```bash
git fetch --tags
git checkout -b dev/zhihao-monitors foundation-v0
```

## Your files
- `src/core/screen-monitor.ts` — polls `active-win` every 5s, classifies the foreground app, emits `change` events when the category flips
- `src/core/timer-manager.ts` — tracks water / break / posture / stretch reminders, exposes `acknowledge(type)`, emits `reminder` events

## Deliverable contract
- `ScreenMonitor` class: `start()`, `stop()`, `getState(): ScreenState`, `on('change', callback)`
- `TimerManager` class: `start()`, `stop()`, `getState(): TimerState`, `acknowledge(type: ReminderType)`, `on('reminder', callback)`, `getDueReminders(): ReminderType[]`
- Both must be pure TypeScript — no Agora, no Electron imports
- Type-check clean under `npx tsc --noEmit`

## Deadline
**T+3:00** — merged to `uat`

## Ship
```bash
git rebase uat
git push -u origin dev/zhihao-monitors
# then open a PR to uat or ping Edmund to merge
```

## Help
- Stuck? Ping Edmund.
- Type mismatch with the shared contract? Edmund owns `src/types/index.ts`. Request the change, don't edit it yourself.
````

- [ ] **Step 2: Write `docs/ONBOARDING_DEV3_SIMYEE.md`**

````markdown
# SimYee — Dev 3 Onboarding

Welcome. You own the Electron shell — the transparent window and the system tray. 60-second kickoff below.

## Read first
1. `docs/CAREYMARY_CONTEXT.md` — skim all of it, then read **Modules 1 and 7** carefully
2. `src/main/overlay-window.ts` — Edmund wrote a working stub. You replace it with the full version (transparency quirks, screen math, multi-monitor handling)
3. `src/types/index.ts` — shared contract, do not edit

## Branch
```bash
git fetch --tags
git checkout -b dev/simyee-shell foundation-v0
```

## Your files
- `src/main/overlay-window.ts` — replace Edmund's stub. Keep the exported signature `createOverlayWindow(): BrowserWindow` intact.
- `src/main/tray.ts` — system tray icon + context menu (mute, pause, acknowledge water, acknowledge break, quit)

## Cross-platform requirement
You MUST test the transparent window on **both macOS and Windows**. Edmund only verified macOS. On Windows, `backgroundColor: '#00000000'` is required on the BrowserWindow config (see `src/main/overlay-window.ts`).

## Deliverable contract
- `createOverlayWindow(): BrowserWindow` — unchanged signature
- `createTray(): Tray` — exports the tray instance, wires menu actions to IPC channels that Edmund will handle
- Type-check clean

## Deadline
**T+2:30** — merged to `uat`. You are on the critical path.

## Ship
```bash
git rebase uat
git push -u origin dev/simyee-shell
```

## Help
Ping Edmund.
````

- [ ] **Step 3: Write `docs/ONBOARDING_DEV4_CODY.md`**

````markdown
# Cody — Dev 4 Onboarding

Welcome. You own the visual layer — the pixel-art CareyMary character. 60-second kickoff below. You are on Cursor Pro, so point Cursor at this file + `docs/CAREYMARY_CONTEXT.md` and let it rip.

## Read first
1. `docs/CAREYMARY_CONTEXT.md` — skim all of it, then read **Module 8** carefully
2. `src/preload/preload.ts` — the contract. The renderer receives character state via `window.careymary.onCharacterState(callback)`. Do not change this contract.
3. `src/renderer/overlay.ts` — Edmund's placeholder logs state to console. You replace it with real sprite animation.
4. `src/renderer/styles.css` — Edmund's placeholder styles. You replace them with the sprite sheet CSS.

## Branch
```bash
git fetch --tags
git checkout -b dev/cody-character foundation-v0
```

## Your files
- `src/renderer/overlay.ts` — listen for `character-state` events, switch CSS classes on `#character` to drive the animation
- `src/renderer/styles.css` — sprite sheet background, `@keyframes` for each state (idle, talking, alert, happy, sleeping)
- `assets/careymary-sprite.png` — the pixel-art sprite sheet itself. Find, generate, or commission.
- `assets/tray-icon.png` + `assets/tray-icon@2x.png` — tray icons for SimYee

## Critical constraint
`src/renderer/overlay.ts` is loaded as a plain `<script>` tag, not an ES module. **Do not add top-level `import` or `export` statements** or the output will crash on load. Define types inline.

## Deliverable contract
- `#character` div animates through sprite frames based on the current state
- Listens to `window.careymary.onCharacterState((state) => {...})`
- Type-check clean

## Deadline
**T+4:00** — merged to `uat`

## Ship
```bash
git rebase uat
git push -u origin dev/cody-character
```

## Help
Ping Edmund.
````

- [ ] **Step 4: Commit**

```bash
git add docs/ONBOARDING_DEV2_ZHIHAO.md docs/ONBOARDING_DEV3_SIMYEE.md docs/ONBOARDING_DEV4_CODY.md
git commit -m "docs: per-dev onboarding checklists for Devs 2, 3, 4"
```

---

## Task 7: Install Dependencies

**Files:** none (generates `node_modules/` and `package-lock.json`)

- [ ] **Step 1: Run `npm install`**

```bash
cd /Users/whatelz/Documents/GitHub/CareyMary
npm install
```

Expected: exit code 0. Electron downloads (~200MB), active-win native build runs on darwin-arm64.

If `active-win` fails to build: capture the error, remove it from `dependencies` in `package.json`, re-run `npm install`, add a TODO in `docs/ONBOARDING_DEV2_ZHIHAO.md` telling ZhiHao to `npm install active-win@^9.0.0` on his own machine.

- [ ] **Step 2: Commit `package-lock.json`**

```bash
git add package-lock.json
git commit -m "chore: lock dependency versions via package-lock.json"
```

---

## Task 8: Type Check

**Files:** none (verification only)

- [ ] **Step 1: Run `npx tsc --noEmit`**

```bash
npx tsc --noEmit
```

Expected: exit code 0, zero errors.

- [ ] **Step 2: Fix any errors inline**

Common issues:
- Missing `@types/node` → already in devDependencies, should not happen
- `overlay.ts` emitting CommonJS wrapper → Task 5 Step 3 explicitly avoids imports/exports. If this happens, double-check the file has no top-level `import` or `export`.
- `preload.ts` import path → must be `'../types'`, not `'../types/index'`

Fix in place and re-run until zero errors. Do not proceed until clean.

---

## Task 9: Build

**Files:** none (produces `dist/`)

- [ ] **Step 1: Run `npm run build`**

```bash
npm run build
```

Expected: tsc compiles everything, the inline node script copies `index.html` + `styles.css` to `dist/renderer/`.

- [ ] **Step 2: Verify all expected outputs exist**

```bash
ls dist/main/index.js dist/main/overlay-window.js dist/preload/preload.js dist/renderer/overlay.js dist/renderer/index.html dist/renderer/styles.css dist/types/index.js
```

Expected: all 7 files listed with no "No such file" errors.

If any are missing, diagnose and fix in place (most likely cause: the inline copy script in `package.json` had an issue — check the exact build script in Task 1 Step 1).

---

## Task 10: Runtime Verification

**Files:** none (smoke test)

- [ ] **Step 1: Run `npm start`**

```bash
npm start
```

Expected: Electron launches, a transparent 200×200 window appears anchored to the bottom-left of the primary display.

- [ ] **Step 2: Verify transparent window**

Visual check on macOS:
- Window is bottom-left corner
- Background is transparent (you can see the desktop wallpaper behind "CareyMary" text)
- Text "CareyMary" is visible in black monospace
- Clicks pass through to the app behind (click-through)
- Window does not appear in the dock or Mission Control
- Window stays on top of other apps

- [ ] **Step 3: Verify renderer IPC bridge**

With the window open, in a separate terminal launch Electron's devtools for the overlay:

Actually, since `focusable: false` and the window has no menu bar, opening DevTools requires a small detour. Skip for the foundation — the fact that the window opens without crashing proves the preload loaded. If you want to confirm the console log, temporarily add `overlay.webContents.openDevTools({ mode: 'detach' });` to `src/main/overlay-window.ts` AFTER `overlay.loadFile(...)`, rebuild, re-run, confirm "renderer loaded" appears in DevTools console, then REMOVE the devtools line before committing.

- [ ] **Step 4: Close the window and verify clean exit**

`Cmd+Q` to quit Electron. Process should exit cleanly.

- [ ] **Step 5: If the runtime test fails**

Diagnose and fix in place. Do not respawn subagents. Common issues:
- Window is opaque → confirm `transparent: true` in overlay-window.ts
- Window appears but no text → confirm the HTML/CSS copy step in `npm run build` ran (check `dist/renderer/index.html` exists)
- Electron crashes on startup → check main process path in `package.json` `"main"` field matches compiled output

After fixing, run `npm run build && npm start` again. Do not proceed to Task 11 until the runtime test passes.

---

## Task 11: Tag and Push

**Files:** none (git operations)

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If not clean, something in Tasks 7–10 produced uncommitted changes — commit or stash before proceeding.

- [ ] **Step 2: Tag the foundation baseline**

```bash
git tag foundation-v0
```

- [ ] **Step 3: Push branch and tag**

```bash
git push origin uat
git push origin foundation-v0
```

Expected: both push successfully.

- [ ] **Step 4: Announce**

Tell Edmund (user): "Foundation is on `uat`, tagged `foundation-v0`. Team can branch. Onboarding docs are in `docs/ONBOARDING_DEV{2,3,4}_*.md`."

---

## Done

The foundation is shipped when:
1. All 11 tasks above are checked off
2. `foundation-v0` tag is on the remote
3. `npm start` opens a transparent window on macOS
4. The team has been notified to branch from `foundation-v0`

Post-foundation, Edmund immediately starts on `dev/edmund-agora` (Agora agent + RTC + context engine + final `index.ts` wiring). That is a separate spec and plan.
