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
      console.log('[AgoraRTCClient] DRY RUN — would join channel', params.channel, 'as uid', params.uid);
      this.connected = true;
      return;
    }
    const sdk = (window as any).AgoraRTC;
    if (!sdk) {
      console.error('[AgoraRTCClient] window.AgoraRTC is missing — script tag did not load');
      return;
    }
    this.client = sdk.createClient({ mode: 'rtc', codec: 'vp8' });
    await this.client.join(params.appId, params.channel, params.token, params.uid);
    this.localAudioTrack = await sdk.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
    await this.client.publish([this.localAudioTrack]);
    this.client.on('user-published', async (user: any, mediaType: string) => {
      if (mediaType === 'audio') {
        await this.client.subscribe(user, mediaType);
        user.audioTrack?.play();
        console.log('[AgoraRTCClient] remote audio playing from uid', user.uid);
      }
    });
    this.connected = true;
    console.log('[AgoraRTCClient] joined channel', params.channel);
  }

  async leave(): Promise<void> {
    if (!this.connected) return;
    this.localAudioTrack?.close?.();
    this.localAudioTrack = null;
    try { await this.client?.leave?.(); } catch (e) { console.error(e); }
    this.client = null;
    this.connected = false;
    console.log('[AgoraRTCClient] left channel');
  }

  setMicEnabled(enabled: boolean): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.setEnabled(enabled);
      console.log('[AgoraRTCClient] mic', enabled ? 'on' : 'off');
    } else {
      console.log('[AgoraRTCClient] DRY RUN — would set mic to', enabled);
    }
  }
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

  api.notifyRendererReady();
}
