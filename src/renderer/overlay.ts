// NOTE: This file is loaded as a plain script, not as an ES module.
// It must have no top-level imports/exports or tsc will emit CommonJS
// wrappers that reference `exports` (undefined in the browser context).

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
  toggleDashboard: () => void;
  logToMain: (message: string) => void;
}

const STATE_CLASSES: CharacterState[] = ['idle', 'talking', 'alert', 'happy', 'sleeping'];

function applyCharacterState(el: HTMLElement, state: CharacterState): void {
  for (const s of STATE_CLASSES) el.classList.remove(`state-${s}`);
  el.classList.add(`state-${state}`);
}

function rlog(...args: unknown[]): void {
  const msg = args
    .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  console.log(msg);
  const bridge = (window as Window & { careymary?: CareyMaryAPI }).careymary;
  bridge?.logToMain?.(msg);
}

let baseState: CharacterState = 'idle';
let talkingResetHandle: ReturnType<typeof setTimeout> | null = null;

function pulseTalking(ms = 1200): void {
  const characterEl = document.getElementById('character');
  if (!characterEl) return;
  applyCharacterState(characterEl, 'talking');
  if (talkingResetHandle) clearTimeout(talkingResetHandle);
  talkingResetHandle = setTimeout(() => applyCharacterState(characterEl, baseState), ms);
}

class AgoraRTCClient {
  private client: any = null;
  private localAudioTrack: any = null;
  private connected = false;

  async join(params: RTCJoinParams): Promise<void> {
    if (!params.enabled) {
      rlog('[rtc] DRY RUN join', params.channel, params.uid);
      this.connected = true;
      return;
    }

    const sdk = (window as any).AgoraRTC;
    if (!sdk) {
      rlog('[rtc] ERROR: window.AgoraRTC missing');
      return;
    }

    this.client = sdk.createClient({ mode: 'rtc', codec: 'vp8' });

    this.client.on('user-published', async (user: any, mediaType: string) => {
      if (mediaType !== 'audio') return;
      try {
        await this.client.subscribe(user, mediaType);
        user.audioTrack?.play();
        pulseTalking(1400);
        rlog('[rtc] remote audio playing uid=', user.uid);
      } catch (err) {
        rlog('[rtc] subscribe error', (err as Error).message ?? err);
      }
    });

    await this.client.join(params.appId, params.channel, params.token, params.uid);
    this.localAudioTrack = await sdk.createMicrophoneAudioTrack({
      AEC: false,
      ANS: false,
      AGC: false,
    });
    await this.client.publish([this.localAudioTrack]);
    this.connected = true;
    rlog('[rtc] joined channel', params.channel);
  }

  async leave(): Promise<void> {
    if (!this.connected) return;
    this.localAudioTrack?.close?.();
    this.localAudioTrack = null;
    try {
      await this.client?.leave?.();
    } catch (e) {
      rlog('[rtc] leave error', (e as Error).message ?? e);
    }
    this.client = null;
    this.connected = false;
    rlog('[rtc] left channel');
  }

  setMicEnabled(enabled: boolean): void {
    this.localAudioTrack?.setEnabled(enabled);
    rlog('[rtc] mic', enabled ? 'on' : 'off');
  }
}

function wireOverlayControls(bridge: CareyMaryAPI): void {
  const exitBtn = document.getElementById('exit-careymary');
  const dashboardBtn = document.getElementById('open-dashboard');
  if (!exitBtn && !dashboardBtn) return;

  let passthrough = true;
  const setPassthrough = (next: boolean) => {
    if (next === passthrough) return;
    passthrough = next;
    bridge.setOverlayPassthrough(next);
  };

  document.addEventListener(
    'mousemove',
    (ev: MouseEvent) => {
      const over = (el: Element | null): boolean => {
        if (!el) return false;
        const r = (el as HTMLElement).getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      };
      setPassthrough(!(over(exitBtn) || over(dashboardBtn)));
    },
    { passive: true },
  );
  document.addEventListener('mouseleave', () => setPassthrough(true));

  exitBtn?.addEventListener('click', () => bridge.quitCareyMary());
  dashboardBtn?.addEventListener('click', () => bridge.toggleDashboard());
}

const rtc = new AgoraRTCClient();
const characterEl = document.getElementById('character');
const api = (window as Window & { careymary?: CareyMaryAPI }).careymary;

if (!characterEl) rlog('[renderer] WARN #character missing');
if (!api) rlog('[renderer] WARN bridge missing');
if (characterEl) applyCharacterState(characterEl, 'idle');

if (api && characterEl) {
  api.onCharacterState((state) => {
    baseState = state;
    applyCharacterState(characterEl, state);
  });
  api.onStartRTC((params) => void rtc.join(params));
  api.onStopRTC(() => void rtc.leave());
  api.onSetMicEnabled((enabled) => rtc.setMicEnabled(enabled));
  wireOverlayControls(api);
  api.notifyRendererReady();
}
