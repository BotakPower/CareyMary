# Cody - Dev 4 Onboarding

Welcome. You own the visual layer - the pixel-art CareyMary character. 60-second kickoff below. You are on Cursor Pro, so point Cursor at this file + `docs/CAREYMARY_CONTEXT.md` and let it rip.

## Read first
1. `docs/CAREYMARY_CONTEXT.md` - skim all of it, then read **Module 8** carefully
2. `src/preload/preload.ts` - the contract. The renderer receives character state via `window.careymary.onCharacterState(callback)`. Do not change this contract.
3. `src/renderer/overlay.ts` - Edmund's placeholder logs state to console. You replace it with real sprite animation.
4. `src/renderer/styles.css` - Edmund's placeholder styles. You replace them with the sprite sheet CSS.

## Branch
```bash
git fetch --tags
git checkout -b dev/cody-character foundation-v0
```

## Your files
- `src/renderer/overlay.ts` - listen for `character-state` events, switch CSS classes on `#character` to drive the animation
- `src/renderer/styles.css` - sprite sheet background, `@keyframes` for each state (idle, talking, alert, happy, sleeping)
- `assets/careymary-sprite.png` - the pixel-art sprite sheet itself. Find, generate, or commission.
- `assets/tray-icon.png` + `assets/tray-icon@2x.png` - tray icons for SimYee

## Critical constraint
`src/renderer/overlay.ts` is loaded as a plain `<script>` tag, not an ES module. **Do not add top-level `import` or `export` statements** or the output will crash on load. Define types inline.

## Deliverable contract
- `#character` div animates through sprite frames based on the current state
- Listens to `window.careymary.onCharacterState((state) => {...})`
- Type-check clean

## Deadline
**T+4:00** - merged to `uat`

## Ship
```bash
git rebase uat
git push -u origin dev/cody-character
```

## Help
Ping Edmund.
