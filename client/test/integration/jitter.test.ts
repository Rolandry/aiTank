import { describe, it, expect } from "vitest";
import { JitterBuffer } from "../../src/game/jitterBuffer";

type Snap = {
  type: "world_snapshot";
  tick: number;
  roomId: string;
  status: string;
  remainingTimeMs: number;
  players: Array<{ playerId: string; x: number; y: number; [k: string]: unknown }>;
  bullets: Array<{ bulletId: string; x: number; y: number; [k: string]: unknown }>;
  obstacles: unknown[];
  winnerId: string | null;
  isDraw: boolean;
};

function snap(tick: number, x: number): Snap {
  return {
    type: "world_snapshot",
    tick,
    roomId: "TEST",
    status: "playing",
    remainingTimeMs: 60000,
    players: [{ playerId: "p1", x, y: 0, nickname: "test", color: "red", direction: "up", hp: 3, alive: true, hitCount: 0 }],
    bullets: [],
    obstacles: [],
    winnerId: null,
    isDraw: false,
  };
}

describe("网络抖动下 jitter buffer 表现", () => {
  it("均匀到达时输出平滑", () => {
    const jb = new JitterBuffer();
    const positions: number[] = [];

    for (let i = 0; i < 20; i++) {
      jb.push(snap(i, i * 10), Date.now());
    }

    for (let i = 0; i < 30; i++) {
      const r = jb.pop();
      if (r) positions.push(r.players[0].x);
    }

    expect(positions.length).toBeGreaterThan(0);
    const deltas = positions.slice(1).map((v, i) => Math.abs(v - positions[i]));
    const maxDelta = Math.max(...deltas);
    expect(maxDelta).toBeLessThan(100);
  });

  it("突发到达（一次来3个）时仍能输出", () => {
    const jb = new JitterBuffer();

    jb.push(snap(0, 0), Date.now());
    jb.push(snap(1, 10), Date.now());
    jb.push(snap(2, 20), Date.now());
    jb.push(snap(3, 30), Date.now());

    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = jb.pop();
      if (r) results.push(r.players[0].x);
    }

    expect(results.length).toBeGreaterThan(0);
    const max = Math.max(...results);
    const min = Math.min(...results);
    expect(max - min).toBeLessThanOrEqual(30);
  });

  it("长时间无快照时 pop 返回最后一个状态或 null", () => {
    const jb = new JitterBuffer();
    jb.push(snap(0, 0), Date.now());
    jb.push(snap(1, 10), Date.now());

    const results: (number | null)[] = [];
    for (let i = 0; i < 20; i++) {
      const r = jb.pop();
      results.push(r ? r.players[0].x : null);
    }

    const validResults = results.filter((r): r is number => r !== null);
    expect(validResults.length).toBeGreaterThan(0);
  });

  it("快照位置单调递增（不回退）", () => {
    const jb = new JitterBuffer();
    for (let i = 0; i < 10; i++) {
      jb.push(snap(i, i * 10), Date.now());
    }

    const positions: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = jb.pop();
      if (r) positions.push(r.players[0].x);
    }

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }
  });
});
