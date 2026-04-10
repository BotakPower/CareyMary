// NOTE: This file is loaded as a plain script, not as an ES module.
// It must have no top-level imports/exports or tsc will emit CommonJS
// wrappers that reference `exports` (undefined in the browser context).
// Renders Cody's sprite via CSS state classes + owns the Agora RTC client.

type CharacterState = 'idle' | 'talking' | 'alert' | 'happy' | 'sleeping';

interface RTCJoinParams {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  enabled: boolean;
}

interface CareyMaryAPI {
  onCharacterState: (callback: (state: CharacterState) => void) => void;
  onStartRTC: (callback: (params: RTCJoinParams) => void) => void;
  onStopRTC: (callback: () => void) => void;
  onSetMicEnabled: (callback: (enabled: boolean) => void) => void;
  notifyRendererReady: () => void;
  setOverlayPassthrough: (passthrough: boolean) => void;
  quitCareyMary: () => void;
  logToMain: (message: string) => void;
  sendUserTranscript: (text: string) => void;
}

// Global log helper — forwards to main process terminal AND DevTools console.
// Lazily binds to window.careymary because the preload bridge is available
// when this module runs but we guard against missing API.
function rlog(...args: unknown[]): void {
  const msg = args
    .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  console.log(msg);
  const bridge = (window as Window & { careymary?: CareyMaryAPI }).careymary;
  bridge?.logToMain?.(msg);
}

// ---- Cody's sprite state machine ----
const STATE_CLASSES: CharacterState[] = [
  'idle',
  'talking',
  'alert',
  'happy',
  'sleeping',
];

function applyCharacterState(el: HTMLElement, state: CharacterState) {
  for (const s of STATE_CLASSES) {
    el.classList.remove(`state-${s}`);
  }
  el.classList.add(`state-${state}`);
}

// ---- Agora RTC client (inlined from src/core/agora-rtc.ts because the ----
// renderer is a plain script and can't import — keep in sync manually).
class AgoraRTCClient {
  private client: any = null;
  private localAudioTrack: any = null;
  private remoteAudioTrack: any = null;
  private connected = false;
  // Anti-echo state: when the agent is speaking, we mute the local mic so
  // the laptop mic doesn't pick up the laptop speakers and feed CareyMary's
  // own voice back into ASR (which causes her to interrupt herself). We
  // track this with a handle instead of a flag because we want the unmute
  // to happen on a short delay after user-unpublished, so we don't catch
  // the trailing tail of the TTS clip.
  private micUnmuteTimer: ReturnType<typeof setTimeout> | null = null;
  // CareyMary only listens long enough to hear the user's goal. Flow:
  //   Turn 1: Agent says "What are you working on today?"
  //   Turn 2: User answers (captured via stream-message user transcription)
  //   Turn 3: Agent acknowledges "I see, let's work on..."
  //   After the agent finishes turn 3 the mic is permanently disabled.
  //
  // We track turn completion via the Conversational AI stream-message
  // events (object="message.state", state="silent", turn_id=N) NOT via
  // RTC publish/unpublish events. Minimax TTS chunks a single utterance
  // into multiple publish cycles, so publish counting is unreliable —
  // counting `state=silent` keyed by turn_id is the correct boundary.
  private lastAgentTurnSilent = 0;
  private micPermanentlyOff = false;
  // How long to wait after the agent stops publishing before we re-enable
  // the mic. Short so we don't clip the user's opening words when they
  // answer the goal question. 80ms is fast enough that a late start on
  // "I'm working on X" still captures the "I" cleanly.
  private static readonly MIC_UNMUTE_DELAY_MS = 80;

  // Safety net: if user-unpublished never fires (subscribe error, missed
  // event, connection hiccup), the mic would be stuck muted forever. This
  // max-duration timer guarantees we unmute eventually so the user can
  // always speak again.
  private static readonly MIC_SAFETY_UNMUTE_MS = 8000;
  private safetyUnmuteTimer: ReturnType<typeof setTimeout> | null = null;

  private muteMicForAgentSpeech(): void {
    // Permanent off wins — never reach for the mic again once CareyMary
    // has stopped listening.
    if (this.micPermanentlyOff) return;
    if (this.micUnmuteTimer) {
      clearTimeout(this.micUnmuteTimer);
      this.micUnmuteTimer = null;
    }
    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.setEnabled(false);
      } catch (e) {
        rlog('[rtc] mic mute error (ignored):', (e as Error).message ?? e);
      }
    }
    // Arm the safety net each time we mute.
    if (this.safetyUnmuteTimer) clearTimeout(this.safetyUnmuteTimer);
    this.safetyUnmuteTimer = setTimeout(() => {
      this.safetyUnmuteTimer = null;
      if (this.localAudioTrack) {
        try {
          this.localAudioTrack.setEnabled(true);
          rlog('[rtc] mic safety-unmuted (user-unpublished missed)');
        } catch (e) {
          rlog('[rtc] safety unmute error (ignored):', (e as Error).message ?? e);
        }
      }
    }, AgoraRTCClient.MIC_SAFETY_UNMUTE_MS);
  }

  private scheduleMicUnmute(): void {
    if (this.micPermanentlyOff) return;
    if (this.micUnmuteTimer) {
      clearTimeout(this.micUnmuteTimer);
    }
    if (this.safetyUnmuteTimer) {
      clearTimeout(this.safetyUnmuteTimer);
      this.safetyUnmuteTimer = null;
    }
    this.micUnmuteTimer = setTimeout(() => {
      this.micUnmuteTimer = null;
      if (this.micPermanentlyOff) return;
      if (this.localAudioTrack) {
        try {
          this.localAudioTrack.setEnabled(true);
          rlog('[rtc] mic re-enabled (agent finished speaking)');
        } catch (e) {
          rlog('[rtc] mic unmute error (ignored):', (e as Error).message ?? e);
        }
      }
    }, AgoraRTCClient.MIC_UNMUTE_DELAY_MS);
  }

  private killMicPermanently(reason: string): void {
    if (this.micPermanentlyOff) return;
    this.micPermanentlyOff = true;
    if (this.micUnmuteTimer) {
      clearTimeout(this.micUnmuteTimer);
      this.micUnmuteTimer = null;
    }
    if (this.safetyUnmuteTimer) {
      clearTimeout(this.safetyUnmuteTimer);
      this.safetyUnmuteTimer = null;
    }
    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.setEnabled(false);
        rlog('[rtc] mic PERMANENTLY OFF —', reason);
      } catch (e) {
        rlog('[rtc] permanent mute error (ignored):', (e as Error).message ?? e);
      }
    }
  }

  // ---- Stream-message decoding + turn tracking ----
  // Chunks currently being reassembled, keyed by msg_id. Each chunk arrives
  // as its own stream-message event; we accumulate base64 parts until all
  // `total` parts are present, then decode + parse the combined payload.
  private streamChunks = new Map<string, { total: number; parts: string[]; received: number }>();
  // Dedup: the agent sometimes re-broadcasts completed messages multiple
  // times (observed in the log). Once we've processed a msg_id we don't
  // re-process it.
  private processedMsgIds = new Set<string>();

  private handleStreamMessagePart(payload: Uint8Array): void {
    let raw = '';
    try {
      raw = new TextDecoder().decode(payload);
    } catch (e) {
      rlog('[rtc] stream-message decode error:', (e as Error).message ?? e);
      return;
    }

    // Framing: "<msg_id>|<chunk_idx>|<total>|<b64>"
    // The base64 payload itself may contain '=' padding but no '|', so the
    // first three pipes are always the framing separators.
    const firstBar = raw.indexOf('|');
    const secondBar = raw.indexOf('|', firstBar + 1);
    const thirdBar = raw.indexOf('|', secondBar + 1);
    if (firstBar < 0 || secondBar < 0 || thirdBar < 0) {
      rlog('[rtc] stream-message unframed, ignoring:', raw.slice(0, 120));
      return;
    }
    const msgId = raw.slice(0, firstBar);
    const idx = parseInt(raw.slice(firstBar + 1, secondBar), 10);
    const total = parseInt(raw.slice(secondBar + 1, thirdBar), 10);
    const b64 = raw.slice(thirdBar + 1);
    if (!msgId || !Number.isFinite(idx) || !Number.isFinite(total) || total <= 0) {
      rlog('[rtc] stream-message bad frame header, ignoring');
      return;
    }

    if (this.processedMsgIds.has(msgId)) return;

    let entry = this.streamChunks.get(msgId);
    if (!entry) {
      entry = { total, parts: new Array(total).fill(''), received: 0 };
      this.streamChunks.set(msgId, entry);
    }
    // idx is 1-based in Agora's framing
    const slot = idx - 1;
    if (slot < 0 || slot >= entry.parts.length) return;
    if (entry.parts[slot] === '') {
      entry.parts[slot] = b64;
      entry.received++;
    }
    if (entry.received < entry.total) return;

    // All parts received — assemble + decode
    this.streamChunks.delete(msgId);
    this.processedMsgIds.add(msgId);
    // Bound the dedup set so it doesn't grow forever over a long session.
    if (this.processedMsgIds.size > 500) {
      const first = this.processedMsgIds.values().next().value;
      if (first) this.processedMsgIds.delete(first);
    }

    const combinedB64 = entry.parts.join('');
    let jsonText = '';
    try {
      jsonText = atob(combinedB64);
    } catch (e) {
      rlog('[rtc] base64 decode failed for msg', msgId, (e as Error).message ?? e);
      return;
    }
    let msg: any;
    try {
      msg = JSON.parse(jsonText);
    } catch (e) {
      rlog('[rtc] JSON parse failed for msg', msgId, ':', jsonText.slice(0, 200));
      return;
    }

    this.onAgoraMessage(msg);
  }

  private onAgoraMessage(msg: any): void {
    const object: string = msg.object ?? msg.type ?? '';
    // Terse log — one line per decoded message
    const preview = typeof msg.text === 'string' ? msg.text.slice(0, 80) : '';
    rlog(
      '[rtc] msg',
      object,
      'turn=', msg.turn_id ?? '-',
      'state=', msg.state ?? '-',
      preview ? 'text=' + JSON.stringify(preview) : '',
    );

    // Agent turn lifecycle: message.state speaking → silent, keyed by turn_id.
    // turn_id=0 is the initial idle/silent before the agent starts talking.
    // turn_id=1 is the greeting ("What are you working on today?"). When
    // that turn's state flips to 'silent', the greeting is done and the user
    // should be able to answer — unmute the mic.
    // turn_id=2 is the agent's acknowledgement ("I see, let's work on...").
    // When that turn's state flips to 'silent', kill the mic for good.
    if (
      object === 'message.state' &&
      msg.state === 'silent' &&
      typeof msg.turn_id === 'number' &&
      msg.turn_id >= 1 &&
      msg.turn_id > this.lastAgentTurnSilent
    ) {
      this.lastAgentTurnSilent = msg.turn_id;
      rlog('[rtc] agent finished turn', msg.turn_id, '→ acting on it');
      if (msg.turn_id >= 2) {
        this.killMicPermanently('agent acknowledgement done (turn 2 silent)');
      } else {
        this.scheduleMicUnmute();
      }
      return;
    }

    // User transcription: capture the first final one and forward to main
    // for Ollama goal extraction. Object name guesses cover known Agora
    // Conversational AI variants.
    const isUserTranscription =
      object === 'user.transcription' ||
      object === 'user.transcribe' ||
      (object === 'transcription' && (msg.role === 'user' || msg.speaker === 'user'));
    if (isUserTranscription) {
      const text: string = typeof msg.text === 'string' ? msg.text : '';
      const isFinal: boolean =
        msg.final === true ||
        msg.is_final === true ||
        msg.final_text === true ||
        msg.turn_status === 2;
      if (text && isFinal) {
        rlog('[rtc] USER TRANSCRIPT (final):', text);
        const bridge = (window as Window & { careymary?: CareyMaryAPI }).careymary;
        bridge?.sendUserTranscript?.(text);
      }
    }
  }

  async join(params: RTCJoinParams): Promise<void> {
    if (!params.enabled) {
      rlog('[rtc] DRY RUN — would join channel', params.channel, 'as uid', params.uid);
      this.connected = true;
      return;
    }
    const sdk = (window as any).AgoraRTC;
    if (!sdk) {
      rlog('[rtc] ERROR: window.AgoraRTC is missing — script tag did not load');
      return;
    }
    rlog('[rtc] sdk version=', sdk.VERSION, 'joining channel=', params.channel, 'as uid=', params.uid);
    this.client = sdk.createClient({ mode: 'rtc', codec: 'vp8' });

    // Subscribe listeners BEFORE join so we don't miss the agent's first publish.
    this.client.on('user-published', async (user: any, mediaType: string) => {
      rlog('[rtc] user-published uid=', user.uid, 'mediaType=', mediaType);
      if (mediaType !== 'audio') return;
      // The agent is about to talk — mute our mic synchronously (before we
      // even subscribe) so there's zero window for our speakers to loop back
      // into the mic capture.
      this.muteMicForAgentSpeech();
      try {
        await this.client.subscribe(user, mediaType);
        const track = user.audioTrack;
        if (!track) {
          rlog('[rtc] WARN: subscribe resolved without audioTrack for uid', user.uid);
          return;
        }
        // CRITICAL: Stop the previous remote track before starting a new one.
        // Minimax TTS chunks speech into segments and the agent republishes
        // its audio track between segments. Without this stop, each republish
        // stacks a new playing track on top of the old one → overlapping
        // playback → choppy / doubled audio. Stop-then-play keeps the stream
        // monophonic and clean.
        if (this.remoteAudioTrack && this.remoteAudioTrack !== track) {
          try {
            this.remoteAudioTrack.stop();
          } catch (e) {
            rlog('[rtc] remote track stop error (ignored):', (e as Error).message ?? e);
          }
        }
        this.remoteAudioTrack = track;
        track.play();
        rlog('[rtc] remote audio playing from uid', user.uid);
      } catch (err) {
        rlog('[rtc] ERROR: subscribe failed for uid', user.uid, (err as Error).message ?? err);
      }
    });

    this.client.on('user-unpublished', (user: any, mediaType: string) => {
      rlog('[rtc] user-unpublished uid=', user.uid, 'mediaType=', mediaType);
      if (mediaType !== 'audio') return;
      // Stop the playing remote track as soon as the agent stops publishing.
      // Agora's SDK will hand us a fresh track on the next user-published
      // event — we don't want the old one lingering and overlapping.
      if (this.remoteAudioTrack) {
        try {
          this.remoteAudioTrack.stop();
        } catch (e) {
          rlog('[rtc] remote track stop error (ignored):', (e as Error).message ?? e);
        }
        this.remoteAudioTrack = null;
      }
      // NOTE: we intentionally do NOT count unpublish events to decide
      // mic state. Minimax TTS chunks one utterance into multiple publish
      // cycles, so publish counting races the real turn boundaries.
      // Mic state is driven by message.state → silent events, handled
      // inside handleStreamMessagePart().
    });

    this.client.on('user-left', (user: any) => {
      rlog('[rtc] user-left uid=', user.uid);
    });

    this.client.on('connection-state-change', (cur: string, prev: string) => {
      rlog('[rtc] connection-state-change', prev, '->', cur);
    });

    // Agora Conversational AI sends ASR + lifecycle events as chunked data
    // messages. Framing (empirically verified):
    //   "<msg_id>|<chunk_idx>|<total_chunks>|<base64-json>"
    // e.g. "7ae7f82a|1|3|eyJvYmplY3Q..." is part 1 of 3 for msg 7ae7f82a.
    // We reassemble by msg_id, base64-decode, JSON-parse. Then we inspect
    // the `object` field: message.state drives turn tracking, and
    // user.transcription (with final=true) is the captured goal.
    this.client.on('stream-message', (_uid: any, payload: Uint8Array) => {
      this.handleStreamMessagePart(payload);
    });

    try {
      await this.client.join(params.appId, params.channel, params.token, params.uid);
      rlog('[rtc] joined channel', params.channel);
    } catch (err) {
      rlog('[rtc] ERROR: join failed:', (err as Error).message ?? err);
      throw err;
    }

    // AEC/ANS/AGC on the Agora Web SDK mic track share a processing pipeline
    // with remote playback. In Electron, clock drift between capture and
    // playback makes the echo canceller drop/clip frames, producing choppy
    // remote audio. Disable the software processors and rely on the OS —
    // macOS CoreAudio handles EC cleanly, and we don't need browser AEC.
    try {
      this.localAudioTrack = await sdk.createMicrophoneAudioTrack({
        AEC: false,
        ANS: false,
        AGC: false,
      });
      rlog('[rtc] mic track created');
    } catch (err) {
      rlog('[rtc] ERROR: createMicrophoneAudioTrack failed:', (err as Error).message ?? err);
      throw err;
    }

    try {
      await this.client.publish([this.localAudioTrack]);
      rlog('[rtc] mic published');
    } catch (err) {
      rlog('[rtc] ERROR: publish failed:', (err as Error).message ?? err);
      throw err;
    }

    // Start muted — the greeting is about to play through the laptop
    // speakers and we don't want the mic to loop it back before the first
    // user-published event fires. The user-unpublished handler after the
    // greeting will unmute automatically.
    try {
      this.localAudioTrack.setEnabled(false);
      rlog('[rtc] mic starts muted (will unmute after greeting)');
    } catch (e) {
      rlog('[rtc] initial mic mute error (ignored):', (e as Error).message ?? e);
    }

    this.connected = true;
  }

  async leave(): Promise<void> {
    if (!this.connected) return;
    this.localAudioTrack?.close?.();
    this.localAudioTrack = null;
    try { await this.client?.leave?.(); } catch (e) { rlog('[rtc] leave error:', (e as Error).message ?? e); }
    this.client = null;
    this.connected = false;
    rlog('[rtc] left channel');
  }

  setMicEnabled(enabled: boolean): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.setEnabled(enabled);
      rlog('[rtc] mic', enabled ? 'on' : 'off');
    } else {
      rlog('[rtc] DRY RUN — would set mic to', enabled);
    }
  }
}

// ---- Exit button / passthrough toggle (Cody's work) ----
// The overlay is click-through by default. When the mouse hovers the exit
// button, temporarily turn off passthrough so the button can receive the click.
function wireExitControl(bridge: CareyMaryAPI): void {
  const exitBtn = document.getElementById('exit-careymary');
  if (!exitBtn) {
    return;
  }

  let passthrough = true;

  function setPassthrough(next: boolean): void {
    if (next === passthrough) {
      return;
    }
    passthrough = next;
    bridge.setOverlayPassthrough(next);
  }

  document.addEventListener(
    'mousemove',
    (ev: MouseEvent) => {
      const r = exitBtn!.getBoundingClientRect();
      const over =
        ev.clientX >= r.left &&
        ev.clientX <= r.right &&
        ev.clientY >= r.top &&
        ev.clientY <= r.bottom;
      setPassthrough(!over);
    },
    { passive: true },
  );

  document.addEventListener('mouseleave', () => {
    setPassthrough(true);
  });

  exitBtn.addEventListener('click', () => {
    bridge.quitCareyMary();
  });
}

console.log('[renderer] loaded');

const rtc = new AgoraRTCClient();
const characterEl = document.getElementById('character');
const api = (window as Window & { careymary?: CareyMaryAPI }).careymary;

if (!characterEl) {
  console.warn('[renderer] #character missing');
}
if (!api) {
  console.warn('[renderer] window.careymary not available — preload failed?');
}

if (characterEl) {
  applyCharacterState(characterEl, 'idle');
}

if (api) {
  api.onCharacterState((state) => {
    console.log('[renderer] character-state:', state);
    if (characterEl) {
      applyCharacterState(characterEl, state);
    }
  });

  api.onStartRTC((params) => {
    console.log('[renderer] onStartRTC', params);
    rtc.join(params).catch((err) => console.error('[renderer] rtc.join failed', err));
  });

  api.onStopRTC(() => {
    console.log('[renderer] onStopRTC');
    rtc.leave().catch((err) => console.error('[renderer] rtc.leave failed', err));
  });

  api.onSetMicEnabled((enabled) => {
    console.log('[renderer] onSetMicEnabled', enabled);
    rtc.setMicEnabled(enabled);
  });

  wireExitControl(api);

  api.notifyRendererReady();
}
