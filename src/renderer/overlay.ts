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
  private connected = false;

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
      try {
        await this.client.subscribe(user, mediaType);
        const track = user.audioTrack;
        if (!track) {
          rlog('[rtc] WARN: subscribe resolved without audioTrack for uid', user.uid);
          return;
        }
        track.play();
        rlog('[rtc] remote audio playing from uid', user.uid);
      } catch (err) {
        rlog('[rtc] ERROR: subscribe failed for uid', user.uid, (err as Error).message ?? err);
      }
    });

    this.client.on('user-unpublished', (user: any, mediaType: string) => {
      rlog('[rtc] user-unpublished uid=', user.uid, 'mediaType=', mediaType);
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
