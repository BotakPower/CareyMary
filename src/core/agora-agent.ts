import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface AgoraAgentConfig {
  appId: string;
  customerId: string;
  customerSecret: string;
  channelName: string;
  rtcToken: string;
  enabled: boolean; // false = dry-run
}

// On-disk crumb so we can kill zombie agents from crashed/killed previous runs.
// Path is stable + world-readable under /tmp so it survives Electron restarts
// but doesn't pollute the user's home dir.
const STATE_FILE = path.join(os.tmpdir(), 'careymary-last-agent-id.txt');

interface JoinResponse {
  agent_id?: string;
  [key: string]: unknown;
}

/**
 * Manages the Agora Conversational AI agent lifecycle via REST.
 *
 * In dry-run (enabled=false) every method logs the payload it would send and
 * returns mock data. No network calls are made.
 */
export class AgoraAgent {
  private agentId: string | null = null;
  private readonly basicAuth: string;

  constructor(private readonly config: AgoraAgentConfig) {
    this.basicAuth = Buffer.from(
      `${config.customerId}:${config.customerSecret}`,
    ).toString('base64');
  }

  /**
   * Kill a zombie agent from a previous crashed/killed session. We persist the
   * last agent_id to /tmp on successful /join — on startup we read that crumb
   * and POST /leave on it BEFORE starting a new agent. Without this cleanup,
   * zombies linger in the channel for `idle_timeout` seconds and their TTS
   * tracks collide with the new agent's audio, causing choppy playback and
   * flapping user-published/user-unpublished cycles.
   */
  private async cleanupZombieAgent(): Promise<void> {
    if (!this.config.enabled) return;
    let zombieId: string | null = null;
    try {
      if (fs.existsSync(STATE_FILE)) {
        zombieId = fs.readFileSync(STATE_FILE, 'utf8').trim() || null;
      }
    } catch (err) {
      console.warn('[AgoraAgent] failed to read zombie-id file:', err);
      return;
    }
    if (!zombieId) return;

    console.log('[AgoraAgent] cleaning up zombie agent from previous run:', zombieId);
    try {
      const res = await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${zombieId}/leave`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (res.ok) {
        console.log('[AgoraAgent] zombie cleanup succeeded');
      } else {
        console.log(`[AgoraAgent] zombie cleanup returned ${res.status} (already gone, OK)`);
      }
    } catch (err) {
      console.warn('[AgoraAgent] zombie cleanup request failed (continuing):', err);
    } finally {
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* file may not exist */
      }
    }
  }

  private persistAgentId(id: string): void {
    try {
      fs.writeFileSync(STATE_FILE, id, 'utf8');
    } catch (err) {
      console.warn('[AgoraAgent] failed to persist agent id:', err);
    }
  }

  async start(systemPrompt: string): Promise<void> {
    // Leave any ghost agent from the previous run before joining, so its TTS
    // track doesn't fight our fresh agent's publish.
    await this.cleanupZombieAgent();


    // Use the `preset` shorthand so Agora resolves ASR/LLM/TTS via its own
    // managed vendor credentials. The explicit-vendor-config path requires
    // each vendor to be configured in the Agora project console, which isn't
    // guaranteed — and it produced a zombie agent (task RUNNING but never
    // publishing audio, likely because the LLM model name `openai_gpt_5_mini`
    // from our original preset never existed).
    //
    // Preset reference: comma-separated vendor:model triples. Use models that
    // actually exist: gpt-4o-mini for LLM, tts-1 for TTS as a safe OpenAI
    // fallback that's always available. Minimax is kept as primary since the
    // voice is better, but if the allocation pool is exhausted we should
    // switch the preset string below.
    const payload = {
      name: `careymary-${Date.now()}`,
      preset: 'deepgram_nova_3,openai_gpt_4o_mini,minimax_speech_2_6_turbo',
      properties: {
        channel: this.config.channelName,
        token: this.config.rtcToken,
        agent_rtc_uid: '1001',
        remote_rtc_uids: ['*'],
        enable_string_uid: false,
        // Short idle timeout so ghost agents from killed sessions die fast and
        // don't overlap with a fresh /join. Combined with cleanupZombieAgent(),
        // this keeps the channel clean across dev restarts.
        idle_timeout: 30,
        asr: { params: { language: 'en' } },
        llm: {
          system_messages: [{ role: 'system', content: systemPrompt }],
          // The opening question. Anti-echo mic gating (start-muted + mute
          // while agent publishes) keeps it from interrupting itself.
          greeting_message: 'What are you working on today?',
          failure_message: "Hmm, I didn't catch that. Say it again for me?",
          max_history: 20,
        },
        tts: {
          params: {
            voice_setting: { voice_id: 'English_captivating_female1' },
          },
        },
      },
    };

    if (!this.config.enabled) {
      console.log('[AgoraAgent] DRY RUN — would POST /join with payload:', JSON.stringify(payload, null, 2));
      this.agentId = `dry-run-${Date.now()}`;
      return;
    }

    try {
      const res = await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/join`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Agora /join failed: ${res.status} ${body}`);
      }

      const data = (await res.json()) as JoinResponse;
      this.agentId = data.agent_id ?? null;
      // Log the full response so we can see if there's an unexpected shape
      // (different id field, error flags, etc.) — we're currently debugging
      // a "TaskNotFound" that appears a few seconds after /join succeeds.
      console.log('[AgoraAgent] /join response:', JSON.stringify(data));
      console.log('[AgoraAgent] agent started, agent_id=', this.agentId);
      // Persist so a subsequent crashed/killed run can kill this agent as a
      // zombie before starting a new one.
      if (this.agentId) this.persistAgentId(this.agentId);
    } catch (err) {
      console.error('[AgoraAgent] start error:', err);
      throw err;
    }
  }

  async updateContext(newSystemPrompt: string): Promise<void> {
    if (!this.agentId) {
      console.warn('[AgoraAgent] updateContext called with no active agent');
      return;
    }

    const payload = {
      llm: {
        system_messages: [{ role: 'system', content: newSystemPrompt }],
      },
    };

    if (!this.config.enabled) {
      console.log('[AgoraAgent] DRY RUN — would POST /update with new system prompt, length=', newSystemPrompt.length);
      return;
    }

    try {
      const res = await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${this.agentId}/update`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        // Transient: agent still provisioning or between turns. Next tick succeeds.
        if (res.status === 400 && body.includes('not in a running state')) {
          console.warn('[AgoraAgent] agent not yet running — skipping this update');
          return;
        }
        // Terminal: the agent task no longer exists on Agora's side. Clear our
        // local agentId so we stop pounding /update with a ghost id, and log
        // loudly so the user knows the agent died and needs to be rejoined.
        if (res.status === 404 && body.includes('task not found')) {
          console.error(
            '[AgoraAgent] agent task vanished on Agora side (TaskNotFound). ' +
              'Likely causes: renderer never joined the RTC channel, LLM/TTS ' +
              'vendor call failed, or agent idle-timed out. Clearing local agentId.',
          );
          this.agentId = null;
          return;
        }
        throw new Error(`Agora /update failed: ${res.status} ${body}`);
      }
      console.log('[AgoraAgent] context updated, prompt length=', newSystemPrompt.length);
    } catch (err) {
      console.error('[AgoraAgent] updateContext error:', err);
    }
  }

  /**
   * Make the agent speak proactively WITHOUT waiting for the user to talk first.
   * Uses the Agora Conversational AI `/speak` endpoint — this is the purpose-built
   * API for agent-initiated utterances.
   *
   * - priority=INTERRUPT: cuts off whatever the agent is currently saying
   * - interruptable=false: user can't talk over the nudge, ensuring it lands
   *
   * Docs: https://docs.agora.io/en/conversational-ai/rest-api/agent/speak
   */
  async speak(
    text: string,
    priority: 'INTERRUPT' | 'APPEND' | 'IGNORE' = 'INTERRUPT',
  ): Promise<void> {
    if (!this.agentId) {
      console.warn('[AgoraAgent] speak called with no active agent');
      return;
    }

    const payload = {
      text,
      priority,
      interruptable: false,
    };

    if (!this.config.enabled) {
      console.log('[AgoraAgent] DRY RUN — would POST /speak:', text);
      return;
    }

    try {
      const res = await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${this.agentId}/speak`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        // Transient: agent still provisioning. Nudge will fire again next tick.
        if (res.status === 400 && body.includes('not in a running state')) {
          console.warn('[AgoraAgent] agent not yet running — dropping this /speak');
          return;
        }
        // Terminal: agent died. Clear id so we stop pounding dead tasks.
        if (res.status === 404) {
          console.error('[AgoraAgent] /speak 404 — agent task vanished. Clearing local agentId.');
          this.agentId = null;
          return;
        }
        throw new Error(`Agora /speak failed: ${res.status} ${body}`);
      }
      console.log('[AgoraAgent] proactive speech sent:', text);
    } catch (err) {
      console.error('[AgoraAgent] speak error:', err);
    }
  }

  async stop(): Promise<void> {
    if (!this.agentId) return;

    if (!this.config.enabled) {
      console.log('[AgoraAgent] DRY RUN — would POST /leave for', this.agentId);
      this.agentId = null;
      return;
    }

    try {
      await fetch(
        `https://api.agora.io/api/conversational-ai-agent/v2/projects/${this.config.appId}/agents/${this.agentId}/leave`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${this.basicAuth}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err) {
      console.error('[AgoraAgent] stop error:', err);
    } finally {
      this.agentId = null;
      // Clean shutdown — no zombie to chase next run.
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* file may not exist */
      }
    }
  }
}
