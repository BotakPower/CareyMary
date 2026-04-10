# CareyMary Foundation — Design Spec

**Date:** 2026-04-10
**Owner:** Dev 1 — Edmund (Claude Max / Opus 4.6)
**Scope:** First-hour deliverable that unblocks Devs 2, 3, 4
**Deadline:** T+1:00 from hackathon start

---

## Purpose

Land a minimal but runnable Electron + TypeScript scaffold on `main` so that ZhiHao, SimYee, and Cody can branch and start work in parallel. The foundation must compile under `tsc` strict mode and boot a transparent overlay window on macOS via `npm start`.

This spec is scoped **only** to the foundation push. Edmund's subsequent Agora work (`agora-agent.ts`, `agora-rtc.ts`, `context-engine.ts`, final `index.ts` wiring) is out of scope and will get its own plan.

## Non-Goals

- No Agora integration (Edmund's next phase)
- No `active-win` integration (ZhiHao's module)
- No timer logic (ZhiHao's module)
- No real pixel art, sprite sheets, or CSS animations (Cody's module)
- No system tray (SimYee's module)
- No tests beyond `tsc --noEmit` (hackathon speed, per user decision)
- No linting or formatting tooling (per user decision)
- No Windows verification from this Mac (SimYee will verify Windows)

## Success Criteria

1. `npm install` completes with exit code 0
2. `npx tsc --noEmit` reports zero errors under strict mode
3. `npm run build` emits `dist/main/index.js`
4. `npm start` opens a transparent 200×200 click-through window anchored bottom-left on macOS without crashing
5. Preload's `contextBridge` registers a `window.careymary` object that the renderer can call
6. DevTools console in the renderer logs "renderer loaded" on boot
7. All code passes `path.join()` discipline (no hardcoded separators)
8. `main` branch at tag `foundation-v0` is ready for others to branch from
9. Three per-dev onboarding docs exist under `docs/` pointing at the correct modules in `CAREYMARY_CONTEXT.md`

## Architecture

Electron 33+ with TypeScript 5.5+ strict mode, CommonJS module output compiled to `dist/`. A main process creates the overlay window and loads a preload script. The renderer process is a transparent HTML shell with a placeholder character div.

No runtime dependencies beyond what is strictly required to boot the shell: `electron` (dev), `typescript` (dev), `@types/node` (dev), `electron-builder` (dev), `dotenv` (runtime, prepared for later .env use). `active-win` and `agora-rtc-sdk-ng` are installed so later modules don't need fresh installs, but they are not imported anywhere in the foundation code.

### Module boundaries

- `src/types/index.ts` — shared contract. Everyone else imports from here. No runtime code, only `interface` and `type` declarations.
- `src/main/overlay-window.ts` — exports a single factory `createOverlayWindow(): BrowserWindow`. SimYee will replace the internals later; the exported signature must not change.
- `src/main/index.ts` — app entry. Only imports `overlay-window` and Electron. No business logic.
- `src/preload/preload.ts` — `contextBridge` exposing `window.careymary` with a stub `onCharacterState(callback)` method. Cody's renderer consumes this contract.
- `src/renderer/overlay.ts` — subscribes to `window.careymary.onCharacterState`, logs state to console. Cody replaces with sprite animation.

## File Manifest

### Config files (6)

| Path | Purpose |
|---|---|
| `package.json` | Name `careymary`, version `0.1.0`, main `dist/main/index.js`, scripts (`build`, `start`, `dev`, `package:mac`, `package:win`), exact deps per CAREYMARY_CONTEXT.md |
| `tsconfig.json` | target ES2022, module commonjs, lib ES2022+DOM, outDir `./dist`, rootDir `./src`, strict, esModuleInterop, skipLibCheck, forceConsistentCasingInFileNames, resolveJsonModule, declaration, sourceMap |
| `.gitignore` | `node_modules`, `dist`, `.env`, `*.log`, `.DS_Store` |
| `.gitattributes` | `* text=auto eol=lf`, `*.png binary`, `*.ico binary` |
| `.env.example` | `AGORA_APP_ID`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`, `AGORA_RTC_TOKEN`, `AGORA_CHANNEL_NAME` (placeholders only) |
| `electron-builder.yml` | `productName: CareyMary`, `appId: com.careymary.app`, minimal mac + win targets |

### Source files (7)

| Path | Purpose |
|---|---|
| `src/types/index.ts` | `ScreenState`, `AppCategory`, `TimerConfig`, `TimerState`, `ReminderType`, `CharacterState`, `SessionStats` interfaces/types copied verbatim from CAREYMARY_CONTEXT.md Modules 2, 3, 8, plus a `CareyMaryAPI` interface describing the `window.careymary` surface |
| `src/main/index.ts` | Imports `electron.app`, `createOverlayWindow`. On `app.whenReady`, calls `createOverlayWindow()`. Handles `window-all-closed` with darwin check. Quits cleanly. |
| `src/main/overlay-window.ts` | Exports `createOverlayWindow(): BrowserWindow`. Implements BrowserWindow config from CAREYMARY_CONTEXT.md Module 1 exactly: 200×200, transparent, frame false, alwaysOnTop, skipTaskbar, focusable false, resizable false, hasShadow false, preload path, contextIsolation true, nodeIntegration false, windows backgroundColor fix. Sets `setIgnoreMouseEvents(true, { forward: true })`. Loads `dist/renderer/index.html`. |
| `src/preload/preload.ts` | Uses `contextBridge.exposeInMainWorld('careymary', { onCharacterState(cb) { ipcRenderer.on('character-state', (_, state) => cb(state)); } })` |
| `src/renderer/index.html` | `<html><body><div id="character">CareyMary</div><script src="./overlay.js"></script></body></html>` with linked stylesheet |
| `src/renderer/styles.css` | `html, body { background: transparent; margin: 0; overflow: hidden; }`, `#character { image-rendering: pixelated; font-family: monospace; color: #000; }` |
| `src/renderer/overlay.ts` | `console.log('renderer loaded'); window.careymary.onCharacterState((state) => { console.log('character-state:', state); });` with `declare global` augmentation for the `careymary` property |

### Onboarding docs (3)

| Path | Purpose |
|---|---|
| `docs/ONBOARDING_DEV2_ZHIHAO.md` | Tight checklist: read CAREYMARY_CONTEXT.md Modules 2 and 3, branch `dev/zhihao-monitors`, own `src/core/screen-monitor.ts` + `src/core/timer-manager.ts`, import types from `../types`, emit events per the interface contract, deadline T+3:00 |
| `docs/ONBOARDING_DEV3_SIMYEE.md` | Read CAREYMARY_CONTEXT.md Modules 1 and 7, branch `dev/simyee-shell`, own `src/main/overlay-window.ts` (replace Edmund's stub) + `src/main/tray.ts`, verify transparency on Windows, deadline T+2:30 |
| `docs/ONBOARDING_DEV4_CODY.md` | Read CAREYMARY_CONTEXT.md Module 8, branch `dev/cody-character`, own `src/renderer/overlay.ts` + `src/renderer/styles.css` + `assets/careymary-sprite.png`, consume `window.careymary.onCharacterState`, deadline T+4:00 |

## Dependency Versions

Copied from CAREYMARY_CONTEXT.md to avoid drift:

```
dependencies:
  active-win          ^9.0.0
  agora-rtc-sdk-ng    ^4.23.2
  dotenv              ^16.4.0
  electron-store      ^8.0.0

devDependencies:
  electron            ^33.0.0
  electron-builder    ^25.0.0
  typescript          ^5.5.0
  @types/node         ^22.0.0
```

Note: `active-win` and `agora-rtc-sdk-ng` are installed but not imported in the foundation. They are dependencies of later modules; installing them now saves time later and surfaces any install issues (native bindings for `active-win`) before they block ZhiHao.

## Agent Team Execution (Approach A)

Three general-purpose subagents run in parallel in a single tool invocation. File-domain split so there are zero write conflicts.

### Agent Scaffold
- **Writes:** `package.json`, `tsconfig.json`, `.gitignore`, `.gitattributes`, `.env.example`, `electron-builder.yml`
- **Rules:** Exact versions from Dependency Versions section. No extra scripts beyond the ones listed. No lint tooling. `type` field NOT set in package.json (CommonJS default). `main` points to `dist/main/index.js`.
- **Returns:** List of files written, any decisions made.

### Agent Main
- **Writes:** `src/types/index.ts`, `src/main/index.ts`, `src/main/overlay-window.ts`, `src/preload/preload.ts`
- **Rules:** Types file first (it is the contract). `overlay-window.ts` must match BrowserWindow config from CAREYMARY_CONTEXT.md Module 1 exactly. `index.ts` imports only from `./overlay-window` and `electron`. `path.join()` for every path. No Agora code, no active-win code, no IPC handlers beyond what the preload bridges.
- **Returns:** List of files written, exact exported symbols.

### Agent Renderer
- **Writes:** `src/renderer/index.html`, `src/renderer/styles.css`, `src/renderer/overlay.ts`, `docs/ONBOARDING_DEV2_ZHIHAO.md`, `docs/ONBOARDING_DEV3_SIMYEE.md`, `docs/ONBOARDING_DEV4_CODY.md`
- **Rules:** Transparent body. Renderer TS compiles into `dist/renderer/overlay.js`. Onboarding docs must be tight checklists pointing at CAREYMARY_CONTEXT.md rather than duplicating content. No emojis in docs (user global rule).
- **Returns:** List of files written.

### Shared rules for all agents

- TypeScript strict mode, zero errors tolerated
- No emojis in code or docs
- Use `path.join()` for every path
- Do not create files outside the assigned manifest
- Do not run `npm install`, `tsc`, or `npm start` — verification is Edmund's job
- Return a structured report: files written + decisions + any deviations

## Verification Protocol (Edmund, sequential)

Run from repo root after all three agents return:

1. `npm install` — must exit 0. If `active-win` native build fails on darwin, capture the error, escalate.
2. `npx tsc --noEmit` — must exit 0 with zero errors.
3. `npm run build` — must produce `dist/main/index.js`, `dist/preload/preload.js`, `dist/renderer/overlay.js`, `dist/renderer/index.html`, `dist/renderer/styles.css`. The `build` script is responsible for copying HTML + CSS into `dist/renderer/`; see the Static asset copy section below for the exact script.
4. `npm start` — must open a transparent 200×200 window bottom-left on macOS. Must not crash within 3 seconds. Close manually.
5. If any step fails: diagnose in-place, edit files directly, re-verify. Do not respawn agents.

### Static asset copy consideration

tsc only compiles `.ts` files. HTML and CSS need to be copied separately. The simplest hackathon solution is to add a tiny postbuild script in `package.json`:

```
"build": "tsc && node -e \"const fs=require('fs'),path=require('path');const src=path.join('src','renderer');const dst=path.join('dist','renderer');fs.mkdirSync(dst,{recursive:true});for(const f of fs.readdirSync(src)){if(f.endsWith('.html')||f.endsWith('.css'))fs.copyFileSync(path.join(src,f),path.join(dst,f));}\""
```

Agent Scaffold must include this in the `build` script. This is explicit in the spec so nobody drifts.

## Git Workflow

```
git checkout main
git pull
git add -A
git status
git commit -m "feat: electron foundation scaffold + booting overlay window"
git push origin main
git tag foundation-v0
git push origin foundation-v0
```

Direct push to `main` per user decision (hackathon speed, Edmund is Dev 1, no reviewer available). Tag marks the baseline all others branch from.

## Rollback

If the foundation lands broken on `main`:

1. `git revert HEAD` (not `reset` — `main` is shared)
2. `git push origin main`
3. Fix locally, re-verify, re-push

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `active-win` native build fails on darwin-arm64 | Install it during verification; if it fails, remove from deps and add a TODO for ZhiHao to install on his machine |
| Electron transparent window is opaque on first boot | Known quirk; CAREYMARY_CONTEXT.md already specifies `backgroundColor: '#00000000'` for win32. On darwin, just `transparent: true` is enough. |
| Renderer HTML/CSS not copied to `dist/` | Explicit copy step in `build` script, called out in the spec |
| Type contract in `src/types/index.ts` drifts from what other devs expect | Copy types verbatim from CAREYMARY_CONTEXT.md Modules 2, 3, 8 |
| Agent writes an unexpected file or goes out of scope | Each agent has an explicit manifest; Edmund reviews the returned file list before committing |

## Out of Scope for This Spec

- Agora integration (Edmund's next phase, separate spec)
- Tests (hackathon decision)
- Lint / format (hackathon decision)
- Windows verification (SimYee owns)
- Sprite sheet asset creation (Cody owns)

## Acceptance

This spec is done when:

1. `main` has the 16 files listed in the File Manifest
2. Tag `foundation-v0` exists and is pushed
3. `npm start` opens the transparent window on macOS
4. Edmund has sent the "foundation ready, branch from `foundation-v0`" message to the team
