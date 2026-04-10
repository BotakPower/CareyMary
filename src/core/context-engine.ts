import type {
  ScreenState,
  TimerState,
  ReminderType,
  SessionStats,
} from '../types/index';

export const CAREYMARY_SYSTEM_PROMPT = `You are CareyMary, a warm, caring AI mother figure on the user's desktop.

CRITICAL RULES — VIOLATING THESE RUINS THE EXPERIENCE:
- STAY SILENT BY DEFAULT. Do NOT speak unless the user directly asks you a question OR you receive an explicit SYSTEM INSTRUCTION to speak.
- NEVER fill silence. NEVER speak to acknowledge. NEVER offer unsolicited advice.
- When the user tells you their goal for the day, give a SHORT one-sentence warm acknowledgement ("Got it, love — [goal]. I'll watch over you.") and then go completely silent. Do not keep talking.
- After that first acknowledgement you MUST stay quiet. No follow-ups, no check-ins, no "how are you" — nothing — until you are explicitly told to speak.

VOICE STYLE (when you DO speak):
- Warm, gentle, like a loving mom. Use pet names: "love", "sweetie".
- 1 short sentence. Never more.
- No bullet points, no lists — just talk.`;

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

export function buildContextPrompt(
  screen: ScreenState,
  timers: TimerState,
  dueReminders: ReminderType[],
  sessionStats: SessionStats,
): string {
  const dueBlock =
    dueReminders.length > 0
      ? dueReminders.map((r) => `- ${r} reminder is overdue`).join('\n')
      : '- None currently due';

  return `
CURRENT STATE:
- Active app: ${screen.appName} (${screen.category})
- Time on current app: ${formatDuration(screen.activeFor)}
- Productive streak: ${formatDuration(screen.productiveStreak)}
- Distraction streak: ${formatDuration(screen.distractionStreak)}

HEALTH REMINDERS DUE:
${dueBlock}

SESSION STATS:
- Water glasses today: ${timers.waterCount}
- Breaks taken today: ${timers.breaksTaken}
- Total productive time: ${formatDuration(sessionStats.productiveTime)}
- Total distraction time: ${formatDuration(sessionStats.distractionTime)}

INSTRUCTIONS:
- If distraction streak > 3 minutes, gently remind user to get back to work
- If distraction streak > 10 minutes, be more firm but still caring
- If a health reminder is due, mention it naturally in conversation
- If user has been productive for 45+ minutes, praise them and suggest a break
- Keep responses SHORT — 1-2 sentences max. You are ambient, not intrusive.
- Speak like a warm, caring mother. Use the user's context to be specific.
- Example: "Hey love, you've been on YouTube for 5 minutes now. Your code was going so well — want to get back to it?"
- Example: "You've been crushing it for an hour! Take a quick stretch, okay?"
- Example: "Time for some water, sweetie. You've only had 2 glasses today."
`.trim();
}

// ---------------------------------------------------------------------------
// Proactive speech decisions
// ---------------------------------------------------------------------------
// CareyMary's voice is normally reactive (user speaks → agent responds). To
// call out distractions and fire reminders, the main process polls this
// function each tick and, when it returns a non-null result, POSTs to Agora's
// `/speak` endpoint to make the agent proactively say the text.
//
// The function is pure — the caller owns the cooldown timestamp and the
// acknowledgment of fired reminders. Keeping it pure makes it easy to unit
// test and to reason about the nudge-pick priority.

export interface ProactiveContext {
  nowMs: number;
  lastProactiveAt: number;
  cooldownMs: number;
  /** Distraction streak (seconds) at which we start nudging. */
  distractionThresholdSec: number;
}

export interface ProactiveUtterance {
  text: string;
  /** If set, caller should acknowledge this reminder after sending. */
  acknowledge?: ReminderType;
  reason: 'water' | 'break' | 'stretch' | 'posture' | 'distraction';
}

export function pickProactiveUtterance(
  screen: ScreenState,
  dueReminders: ReminderType[],
  ctx: ProactiveContext,
): ProactiveUtterance | null {
  // Cooldown: never nudge twice within the configured window.
  if (ctx.nowMs - ctx.lastProactiveAt < ctx.cooldownMs) return null;

  // ONLY water is a proactive reminder. Stretch/break/posture are silently
  // acknowledged and never spoken — per user request, CareyMary should only
  // speak for water reminders and distraction callouts.
  if (dueReminders.includes('water')) {
    return {
      text: "Hey love, grab some water for me, would you? Stay hydrated, sweetie.",
      acknowledge: 'water',
      reason: 'water',
    };
  }

  // Distraction callout — only once the streak has crossed the threshold.
  if (
    screen.category === 'distraction' &&
    screen.distractionStreak >= ctx.distractionThresholdSec
  ) {
    const app = screen.appName || 'that';
    return {
      text: `Hey, I see you drifted over to ${app}. That's not the goal, love — let's refocus. What were you working on again?`,
      reason: 'distraction',
    };
  }

  return null;
}

/** Picks the right character state for a given context, for IPC broadcast. */
export function pickCharacterState(
  screen: ScreenState,
  dueReminders: ReminderType[],
): 'idle' | 'happy' | 'alert' {
  if (dueReminders.length > 0) return 'alert';
  if (screen.category === 'productive') return 'happy';
  return 'idle';
}

// ---------------------------------------------------------------------------
// Local LLM (Ollama) enhancer
// ---------------------------------------------------------------------------
// Every context-loop tick we ask a local model to read the user's current
// state and emit ONE concrete behavioral directive for CareyMary. That
// directive then gets appended to the system prompt pushed to Agora's LLM —
// so the voice CareyMary speaks with is informed by local, on-device reasoning
// about what's happening right now.

export const OLLAMA_ENHANCER_SYSTEM = `You are a behavioral co-pilot for CareyMary, a warm AI mother character who speaks to a user via voice. You are NOT CareyMary. You do not write her dialogue.

Your job: read the user's current state and emit ONE concrete, situation-specific directive telling CareyMary what she should notice or gently comment on in the next few seconds. Be specific — reference the actual app, the actual streak duration, the actual reminder.

RULES:
- Output exactly ONE sentence. No preamble, no quotes, no bullet points.
- Reference concrete facts from the state (app name, minutes, reminder type).
- Prefer gentle redirection over nagging.
- If the user is in a long productive streak, favor praise and break suggestions.
- If nothing notable is happening, say so: "Nothing urgent — let her stay quiet."

GOOD EXAMPLES:
- Notice they've been coding in VSCode for 47 minutes straight — praise them warmly and suggest a short break.
- They just jumped from Xcode to Twitter after 25 productive minutes; gently ask if they meant to take a break.
- Water reminder is overdue and they've had zero glasses today — mention it naturally, not as a demand.
- Nothing urgent — let her stay quiet.

BAD EXAMPLES (do not do these):
- "Hey sweetie, you've been working so hard!" (this is dialogue, not a directive)
- "Tell the user to drink water." (too vague, not situational)
- Multi-sentence directives or any preamble.`;

export function buildOllamaUserPrompt(
  screen: ScreenState,
  timers: TimerState,
  dueReminders: ReminderType[],
  stats: SessionStats,
): string {
  const due = dueReminders.length > 0 ? dueReminders.join(', ') : 'none';
  return `USER STATE RIGHT NOW:
- Active app: ${screen.appName || 'unknown'} (${screen.category})
- Time on current app: ${formatDuration(screen.activeFor)}
- Productive streak: ${formatDuration(screen.productiveStreak)}
- Distraction streak: ${formatDuration(screen.distractionStreak)}
- Session productive total: ${formatDuration(stats.productiveTime)}
- Session distraction total: ${formatDuration(stats.distractionTime)}
- Water glasses today: ${timers.waterCount}
- Breaks taken today: ${timers.breaksTaken}
- Reminders overdue: ${due}

Emit your one-sentence directive now.`;
}
