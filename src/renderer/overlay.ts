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
  // How long to wait after the agent stops publishing before we re-enable
  // the mic. Too short → still catches tail audio. Too long → user has to
  // wait noticeably to respond. 400ms is a good middle ground.
  private static readonly MIC_UNMUTE_DELAY_MS = 400;

  private muteMicForAgentSpeech(): void {
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
  }

  private scheduleMicUnmute(): void {
    if (this.micUnmuteTimer) {
      clearTimeout(this.micUnmuteTimer);
    }
    this.micUnmuteTimer = setTimeout(() => {
      this.micUnmuteTimer = null;
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
      // Agent stopped speaking — re-enable the mic on a short delay so we
      // don't catch the trailing tail of the TTS clip still echoing out of
      // the laptop speakers.
      this.scheduleMicUnmute();
    });

    this.client.on('user-left', (user: any) => {
      rlog('[rtc] user-left uid=', user.uid);
    });

    this.client.on('connection-state-change', (cur: string, prev: string) => {
      rlog('[rtc] connection-state-change', prev, '->', cur);
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
