# SimYee - Dev 3 Onboarding

Welcome. You own the Electron shell - the transparent window and the system tray. 60-second kickoff below.

## Read first
1. `docs/CAREYMARY_CONTEXT.md` - skim all of it, then read **Modules 1 and 7** carefully
2. `src/main/overlay-window.ts` - Edmund wrote a working stub. You replace it with the full version (transparency quirks, screen math, multi-monitor handling)
3. `src/types/index.ts` - shared contract, do not edit

## Branch
```bash
git fetch --tags
git checkout -b dev/simyee-shell foundation-v0
```

## Your files
- `src/main/overlay-window.ts` - replace Edmund's stub. Keep the exported signature `createOverlayWindow(): BrowserWindow` intact.
- `src/main/tray.ts` - system tray icon + context menu (mute, pause, acknowledge water, acknowledge break, quit)

## Cross-platform requirement
You MUST test the transparent window on **both macOS and Windows**. Edmund only verified macOS. On Windows, `backgroundColor: '#00000000'` is required on the BrowserWindow config.

## Deliverable contract
- `createOverlayWindow(): BrowserWindow` - unchanged signature
- `createTray(): Tray` - exports the tray instance, wires menu actions to IPC channels that Edmund will handle
- Type-check clean

## Deadline
**T+2:30** - merged to `uat`. You are on the critical path.

## Ship
```bash
git rebase uat
git push -u origin dev/simyee-shell
```

## Help
Ping Edmund.
