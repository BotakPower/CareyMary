/**
 * Thin OpenAI-compatible client for a locally-running Ollama server.
 *
 * Runs in the MAIN process — never exposed to the renderer. Ollama must be
 * reachable at the configured URL (default http://localhost:11434). No tunnel
 * required because the client lives on the same machine as Ollama.
 *
 * Every call is bounded by a timeout and catches all errors, returning null
 * on any failure. The context loop must keep ticking even if Ollama dies
 * mid-demo, so this client never throws.
 */

export interface OllamaClientConfig {
  url: string; // base URL, e.g. http://localhost:11434
  model: string; // e.g. llama3.1:8b-instruct
  enabled: boolean; // false = generate() is a no-op that returns null
  timeoutMs?: number; // default 4000
  maxTokens?: number; // default 120
  temperature?: number; // default 0.6
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OllamaClient {
  constructor(private readonly config: OllamaClientConfig) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Sends a chat completion request. Returns the assistant's text content,
   * or null on disabled/timeout/error. Never throws.
   */
  async generate(systemPrompt: string, userPrompt: string): Promise<string | null> {
    if (!this.config.enabled) return null;

    const timeoutMs = this.config.timeoutMs ?? 4000;
    const maxTokens = this.config.maxTokens ?? 120;
    const temperature = this.config.temperature ?? 0.6;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.config.url.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(
          '[OllamaClient] non-ok response:',
          res.status,
          body.slice(0, 200),
        );
        return null;
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        console.warn('[OllamaClient] response missing choices[0].message.content');
        return null;
      }

      return content.trim();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.warn('[OllamaClient] timed out after', timeoutMs, 'ms');
      } else {
        console.warn('[OllamaClient] fetch failed:', (err as Error).message);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
