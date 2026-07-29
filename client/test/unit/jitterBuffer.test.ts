import { describe, it, expect, beforeEach, vi } from "vitest";

const { JitterBuffer } = await import("../../src/game/jitterBuffer");
type WorldSnapshot = {
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

function createSnapshot(players: Array<{ playerId: string; x: number; y: number }>, bullets: Array<{ bulletId: string; x: number; y: number }> = []): WorldSnapshot {
  return {
    type: "world_snapshot",
    tick: 0,
    roomId: "TEST",
    status: "playing",
    remainingTimeMs: 60000,
    players,
    bullets,
    obstacles: [],
    winnerId: null,
    isDraw: false,
  };
}

describe("JitterBuffer", () => {
  let jb: InstanceType<typeof JitterBuffer>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    jb = new JitterBuffer();
  });

  it("少于2个快照时 pop 返回 null", () => {
    jb.push(createSnapshot([{ playerId: "p1", x: 0, y: 0 }]), 1000);
    expect(jb.pop()).toBeNull();
  });

  it("push 2个快照后 pop 返回插值结果", () => {
    const snap1 = createSnapshot([{ playerId: "p1", x: 0, y: 0 }]);
    const snap2 = createSnapshot([{ playerId: "p1", x: 100, y: 0 }]);
    jb.push(snap1, 1000);
    jb.push(snap2, 1050);
    const result = jb.pop();
    expect(result).not.toBeNull();
    expect(result!.players[0].playerId).toBe("p1");
  });

  it("插值因子 t 随时间增长", () => {
    const snap1 = createSnapshot([{ playerId: "p1", x: 0, y: 0 }]);
    const snap2 = createSnapshot([{ playerId: "p1", x: 100, y: 0 }]);
    jb.push(snap1, 1000);
    jb.push(snap2, 1050);

    const r1 = jb.pop();
    const r2 = jb.pop();

    if (r1 && r2) {
      expect(r2.players[0].x).toBeGreaterThanOrEqual(r1.players[0].x);
    }
  });

  it("新出现的实体不插值", () => {
    const snap1 = createSnapshot([{ playerId: "p1", x: 0, y: 0 }]);
    const snap2 = createSnapshot([
      { playerId: "p1", x: 50, y: 0 },
      { playerId: "p2", x: 100, y: 100 },
    ]);
    jb.push(snap1, 1000);
    jb.push(snap2, 1050);
    const result = jb.pop();
    expect(result).not.toBeNull();
    const p2 = result!.players.find((p) => p.playerId === "p2");
    expect(p2).toBeDefined();
    expect(p2!.x).toBe(100);
  });

  it("clear 后 buffer 为空", () => {
    jb.push(createSnapshot([{ playerId: "p1", x: 0, y: 0 }]), 1000);
    jb.push(createSnapshot([{ playerId: "p1", x: 10, y: 0 }]), 1050);
    jb.clear();
    expect(jb.pop()).toBeNull();
  });

  it("子弹位置正确插值", () => {
    const snap1 = createSnapshot(
      [{ playerId: "p1", x: 0, y: 0 }],
      [{ bulletId: "b1", x: 0, y: 0 }]
    );
    const snap2 = createSnapshot(
      [{ playerId: "p1", x: 10, y: 0 }],
      [{ bulletId: "b1", x: 200, y: 0 }]
    );
    jb.push(snap1, 1000);
    jb.push(snap2, 1050);
    const result = jb.pop();
    expect(result).not.toBeNull();
    const bullet = result!.bullets[0];
    expect(bullet.x).toBeGreaterThanOrEqual(0);
    expect(bullet.x).toBeLessThanOrEqual(200);
  });
});
