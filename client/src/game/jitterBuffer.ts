import type { WorldSnapshot } from "../types/protocol";

interface TimedSnapshot {
  snapshot: WorldSnapshot;
  serverTime: number;
  receivedAt: number;
}

const BUFFER_DELAY = 30;
const MAX_BUFFER_SIZE = 10;
const TICK_INTERVAL = 1000 / 60;

export class JitterBuffer {
  private buffer: TimedSnapshot[] = [];
  private renderTime = 0;

  push(snapshot: WorldSnapshot, serverTime: number): void {
    const timed: TimedSnapshot = {
      snapshot,
      serverTime,
      receivedAt: performance.now(),
    };
    this.buffer.push(timed);

    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    if (this.renderTime === 0) {
      this.renderTime = timed.receivedAt - BUFFER_DELAY;
    }
  }

  pop(): WorldSnapshot | null {
    if (this.buffer.length < 2) return null;

    const now = performance.now();
    this.renderTime += TICK_INTERVAL;

    if (this.renderTime > now) {
      this.renderTime = now;
    }

    let prev: TimedSnapshot | null = null;
    let curr: TimedSnapshot | null = null;

    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].receivedAt <= this.renderTime) {
        prev = this.buffer[i];
        curr = this.buffer[i + 1] ?? this.buffer[i];
      } else {
        if (!prev) {
          prev = this.buffer[i];
          curr = this.buffer[i + 1] ?? this.buffer[i];
        }
        break;
      }
    }

    if (!prev || !curr) return null;

    const span = curr.receivedAt - prev.receivedAt;
    const t = span > 0 ? (this.renderTime - prev.receivedAt) / span : 1;
    const clampedT = Math.max(0, Math.min(1, t));

    return this.interpolate(prev.snapshot, curr.snapshot, clampedT);
  }

  clear(): void {
    this.buffer = [];
    this.renderTime = 0;
  }

  private interpolate(
    prev: WorldSnapshot,
    curr: WorldSnapshot,
    t: number
  ): WorldSnapshot {
    const players = curr.players.map((player) => {
      const p = prev.players.find((x) => x.playerId === player.playerId);
      if (!p) return player;
      return {
        ...player,
        x: lerp(p.x, player.x, t),
        y: lerp(p.y, player.y, t),
      };
    });

    const bullets = curr.bullets.map((bullet) => {
      const b = prev.bullets.find((x) => x.bulletId === bullet.bulletId);
      if (!b) return bullet;
      return {
        ...bullet,
        x: lerp(b.x, bullet.x, t),
        y: lerp(b.y, bullet.y, t),
      };
    });

    return { ...curr, players, bullets };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
