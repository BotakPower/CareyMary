# ZhiHao - Dev 2 Onboarding

Welcome. You own the core monitoring logic. 60-second kickoff below.

## Read first
1. `docs/CAREYMARY_CONTEXT.md` - skim the whole thing, then read **Modules 2 and 3** carefully
2. `src/types/index.ts` - the shared contract. Import from here. Do not add new types without telling Edmund.

## Branch
```bash
git fetch --tags
git checkout -b dev/zhihao-monitors foundation-v0
```

## Your files
- `src/core/screen-monitor.ts` - polls `active-win` every 5s, classifies the foreground app, emits `change` events when the category flips
- `src/core/timer-manager.ts` - tracks water / break / posture / stretch reminders, exposes `acknowledge(type)`, emits `reminder` events

## Deliverable contract
- `ScreenMonitor` class: `start()`, `stop()`, `getState(): ScreenState`, `on('change', callback)`
- `TimerManager` class: `start()`, `stop()`, `getState(): TimerState`, `acknowledge(type: ReminderType)`, `on('reminder', callback)`, `getDueReminders(): ReminderType[]`
- Both must be pure TypeScript - no Agora, no Electron imports
- Type-check clean under `npx tsc --noEmit`

## Deadline
**T+3:00** - merged to `uat`

## Ship
```bash
git rebase uat
git push -u origin dev/zhihao-monitors
```

## Help
- Stuck? Ping Edmund.
- Type mismatch with the shared contract? Edmund owns `src/types/index.ts`. Request the change, don't edit it yourself.
