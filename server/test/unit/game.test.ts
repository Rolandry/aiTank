import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameWorld } from "../../src/game";
import { GAME_CONFIG, PLAYER_COLORS } from "../../src/protocol";
import { SPAWN_POINTS } from "../../src/map";
import type { ServerPlayer } from "../../src/types";
import type { Room } from "../../src/room";

function createMockRoom(): Room {
  const players = new Map<string, ServerPlayer>();
  return {
    roomId: "TEST",
    status: "playing",
    mode: "deathmatch",
    themeChoice: "random",
    mapTheme: "grass_jungle",
    players,
    winnerId: null,
    isDraw: false,
    obstacles: [],
    game: null,
    broadcast: vi.fn(),
    endGame: vi.fn(),
  } as unknown as Room;
}

function createPlayer(overrides: Partial<ServerPlayer> = {}): ServerPlayer {
  return {
    playerId: "p1",
    nickname: "tester",
    color: PLAYER_COLORS[0],
    socket: { readyState: 1, send: vi.fn() } as any,
    x: SPAWN_POINTS[0].x,
    y: SPAWN_POINTS[0].y,
    direction: "down",
    hp: GAME_CONFIG.maxHp,
    alive: true,
    hitCount: 0,
    kills: 0,
    respawnAt: null,
    lastShootTime: 0,
    activeBullets: 0,
    input: { up: false, down: false, left: false, right: false },
    lastInputSeq: 0,
    connected: true,
    sessionToken: "test-session-token",
    disconnectedAt: null,
    effects: new Map(),
    shield: 0,
    lastDashTime: 0,
    ...overrides,
  };
}

describe("GameWorld", () => {
  let room: Room;
  let world: GameWorld;

  beforeEach(() => {
    room = createMockRoom();
    world = new GameWorld(room);
  });

  describe("handleInput", () => {
    it("接受新序列号输入", () => {
      const player = createPlayer();
      room.players.set("p1", player);
      world.handleInput(player, { type: "player_input", seq: 1, up: true, down: false, left: false, right: false });
      expect(player.input.up).toBe(true);
      expect(player.lastInputSeq).toBe(1);
    });

    it("丢弃重复序列号", () => {
      const player = createPlayer({ lastInputSeq: 5 });
      room.players.set("p1", player);
      world.handleInput(player, { type: "player_input", seq: 5, up: true, down: false, left: false, right: false });
      expect(player.input.up).toBe(false);
    });

    it("丢弃旧序列号", () => {
      const player = createPlayer({ lastInputSeq: 10 });
      room.players.set("p1", player);
      world.handleInput(player, { type: "player_input", seq: 3, up: true, down: false, left: false, right: false });
      expect(player.input.up).toBe(false);
    });

    it("非游戏中状态忽略", () => {
      room.status = "waiting";
      const player = createPlayer();
      world.handleInput(player, { type: "player_input", seq: 1, up: true, down: false, left: false, right: false });
      expect(player.input.up).toBe(false);
    });

    it("死亡玩家忽略", () => {
      const player = createPlayer({ alive: false });
      world.handleInput(player, { type: "player_input", seq: 1, up: true, down: false, left: false, right: false });
      expect(player.input.up).toBe(false);
    });
  });

  describe("handleShoot", () => {
    it("正常射击创建子弹", () => {
      const player = createPlayer();
      room.players.set("p1", player);
      world.handleShoot(player);
      expect(player.activeBullets).toBe(1);
    });

    it("冷却时间内禁止再射", () => {
      const player = createPlayer({ lastShootTime: Date.now() });
      room.players.set("p1", player);
      world.handleShoot(player);
      expect(player.activeBullets).toBe(0);
    });

    it("超过子弹上限禁止射击", () => {
      const player = createPlayer({ activeBullets: GAME_CONFIG.maxBulletsPerPlayer });
      room.players.set("p1", player);
      world.handleShoot(player);
      expect(player.activeBullets).toBe(GAME_CONFIG.maxBulletsPerPlayer);
    });

    it("死亡玩家不能射击", () => {
      const player = createPlayer({ alive: false });
      world.handleShoot(player);
      expect(player.activeBullets).toBe(0);
    });
  });

  describe("start/stop", () => {
    it("start 初始化玩家位置和属性", () => {
      const p1 = createPlayer({ playerId: "p1" });
      const p2 = createPlayer({ playerId: "p2", hp: 0, alive: false });
      room.players.set("p1", p1);
      room.players.set("p2", p2);
      world.start();
      expect(p1.x).toBe(SPAWN_POINTS[0].x);
      expect(p1.hp).toBe(GAME_CONFIG.maxHp);
      expect(p1.alive).toBe(true);
      expect(p2.x).toBe(SPAWN_POINTS[1].x);
      expect(p2.hp).toBe(GAME_CONFIG.maxHp);
      world.stop();
    });

    it("stop 清除定时器", () => {
      world.start();
      world.stop();
      expect(world).toBeDefined();
    });
  });

  describe("buildSnapshot", () => {
    it("快照包含正确字段", () => {
      const player = createPlayer({ x: 100.555, y: 200.666 });
      room.players.set("p1", player);
      const snap = world.buildSnapshot();
      expect(snap.type).toBe("world_snapshot");
      expect(snap.roomId).toBe("TEST");
      expect(snap.players).toHaveLength(1);
      expect(snap.players[0].playerId).toBe("p1");
      expect(snap.players[0].x).toBe(100.56);
      expect(snap.players[0].y).toBe(200.67);
    });
  });
});
