/**
 * Thin wrapper around agora-rtc-sdk-ng. Runs in the RENDERER process.
 *
 * The SDK is loaded as a global script in index.html, exposing window.AgoraRTC.
 * This file references it via an injected getSDK function so it can be unit-tested
 * without touching the global.
 *
 * In dry-run (enabled=false) every method logs its args and no-ops.
 *
 * NOTE: this file is a shared core module. The renderer's overlay.ts inlines a
 * copy of this class because it can't have top-level imports. Keep in sync.
 */

export interface AgoraRTCConfig {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  enabled: boolean;
}

type AgoraRTCGlobal = {
  createClient: (cfg: { mode: string; codec: string }) => unknown;
  createMicrophoneAudioTrack: (opts: { AEC: boolean; ANS: boolean; AGC: boolean }) => Promise<unknown>;
};

export class AgoraRTCClient {
  private client: any = null;
  private localAudioTrack: any = null;
  private connected = false;

  constructor(private readonly getSDK: () => AgoraRTCGlobal | undefined) {}

  async join(config: AgoraRTCConfig): Promise<void> {
    if (!config.enabled) {
      console.log('[AgoraRTCClient] DRY RUN — would join channel', config.channel, 'as uid', config.uid);
      this.connected = true;
      return;
    }

    const sdk = this.getSDK();
    if (!sdk) {
      throw new Error('AgoraRTC SDK not loaded on window');
    }

    this.client = (sdk as any).createClient({ mode: 'rtc', codec: 'vp8' });
    await this.client.join(config.appId, config.channel, config.token, config.uid);

    this.localAudioTrack = await (sdk as any).createMicrophoneAudioTrack({
      AEC: true,
      ANS: true,
      AGC: true,
    });
    await this.client.publish([this.localAudioTrack]);

    this.client.on('user-published', async (user: any, mediaType: string) => {
      if (mediaType === 'audio') {
        await this.client.subscribe(user, mediaType);
        user.audioTrack?.play();
        console.log('[AgoraRTCClient] remote audio playing from uid', user.uid);
      }
    });

    this.connected = true;
    console.log('[AgoraRTCClient] joined channel', config.channel);
  }

  async leave(): Promise<void> {
    if (!this.connected) return;

    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.close();
      } catch (err) {
        console.error('[AgoraRTCClient] error closing track:', err);
      }
      this.localAudioTrack = null;
    }

    if (this.client) {
      try {
        await this.client.leave();
      } catch (err) {
        console.error('[AgoraRTCClient] error leaving:', err);
      }
      this.client = null;
    }

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

  isConnected(): boolean {
    return this.connected;
  }
}
