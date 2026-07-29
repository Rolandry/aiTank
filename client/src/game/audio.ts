type SoundName =
  | "shoot"
  | "hit"
  | "explosion"
  | "coin"
  | "game_over"
  | "bgm";

const SOUND_PATHS: Record<SoundName, string> = {
  shoot: "/assets/sounds/8-bits-shoot.wav",
  hit: "/assets/sounds/8-bit-hit.wav",
  explosion: "/assets/sounds/8-bit-explosion.wav",
  coin: "/assets/sounds/8-bit-coin.wav",
  game_over: "/assets/sounds/8-bit-game-over.wav",
  bgm: "/assets/sounds/8-bit-bgm.wav",
};

class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private myPlayerId: string | null = null;
  private muted = false;

  setMyPlayerId(id: string): void {
    this.myPlayerId = id;
  }

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);

    const entries = Object.entries(SOUND_PATHS) as [SoundName, string][];
    await Promise.all(
      entries.map(async ([name, path]) => {
        try {
          const res = await fetch(path);
          const arr = await res.arrayBuffer();
          const buf = await this.ctx!.decodeAudioData(arr);
          this.buffers.set(name, buf);
        } catch {
          console.warn(`音效加载失败: ${path}`);
        }
      })
    );
  }

  resume(): void {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 0.5;
  }

  isMuted(): boolean {
    return this.muted;
  }

  startBgm(): void {
    if (!this.ctx || !this.masterGain) return;
    this.stopBgm();
    const buf = this.buffers.get("bgm");
    if (!buf) return;
    this.bgmSource = this.ctx.createBufferSource();
    this.bgmSource.buffer = buf;
    this.bgmSource.loop = true;
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.15;
    this.bgmSource.connect(this.bgmGain);
    this.bgmGain.connect(this.masterGain);
    this.bgmSource.start();
  }

  stopBgm(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch {
        // already stopped
      }
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
  }

  play(name: SoundName, volume = 1): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  playWithDistance(
    name: SoundName,
    soundX: number,
    soundY: number,
    myX: number,
    myY: number,
    selfVolume = 1,
    maxDist = 700
  ): void {
    const isSelf = this.myPlayerId !== null;
    let volume: number;
    if (!isSelf) {
      volume = selfVolume;
    } else {
      const dist = Math.hypot(myX - soundX, myY - soundY);
      volume = Math.max(0.08, 1 - dist / maxDist) * selfVolume;
    }
    this.play(name, volume);
  }
}

export const audioManager = new AudioManager();
