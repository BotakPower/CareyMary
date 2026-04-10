export interface AgoraAgentConfig {
  appId: string;
  customerId: string;
  customerSecret: string;
  channelName: string;
  rtcToken: string;
  enabled: boolean; // false = dry-run
}

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

  async start(systemPrompt: string): Promise<void> {
    const payload = {
      name: `careymary-${Date.now()}`,
      preset: 'deepgram_nova_3,openai_gpt_5_mini,minimax_speech_2_6_turbo',
      properties: {
        channel: this.config.channelName,
        token: this.config.rtcToken,
        agent_rtc_uid: '1001',
        remote_rtc_uids: ['1002'],
        idle_timeout: 600,
        llm: {
          system_messages: [{ role: 'system', content: systemPrompt }],
          greeting_message:
            "Hey sweetie! I'm CareyMary, your desktop buddy. I'll keep an eye on things and make sure you stay hydrated and focused. Just talk to me anytime!",
          failure_message: "Hmm, I didn't catch that. Say it again for me?",
          max_history: 20,
        },
        tts: {
          params: {
            voice_setting: { voice_id: 'English_captivating_female1' },
          },
        },
        asr: { params: { language: 'en' } },
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
      console.log('[AgoraAgent] agent started, agent_id=', this.agentId);
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
        throw new Error(`Agora /update failed: ${res.status} ${body}`);
      }
    } catch (err) {
      console.error('[AgoraAgent] updateContext error:', err);
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
    }
  }
}
