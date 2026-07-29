import { describe, it, expect } from "vitest";
import {
  aabbOverlap,
  tankRect,
  bulletRect,
  hitsObstacle,
  insideMap,
  DIRECTION_VECTOR,
} from "../../src/collision";
import { GAME_CONFIG } from "../../src/protocol";

describe("aabbOverlap", () => {
  it("检测重叠", () => {
    expect(aabbOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it("边界相切不算重叠", () => {
    expect(aabbOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(aabbOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 10, width: 10, height: 10 })).toBe(false);
  });

  it("包含关系算重叠", () => {
    expect(aabbOverlap({ x: 0, y: 0, width: 20, height: 20 }, { x: 5, y: 5, width: 5, height: 5 })).toBe(true);
  });

  it("完全分离不重叠", () => {
    expect(aabbOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 100, y: 100, width: 10, height: 10 })).toBe(false);
  });
});

describe("tankRect", () => {
  it("中心坐标转为左上角 AABB", () => {
    const r = tankRect(100, 200);
    expect(r.x).toBe(100 - GAME_CONFIG.tankSize / 2);
    expect(r.y).toBe(200 - GAME_CONFIG.tankSize / 2);
    expect(r.width).toBe(GAME_CONFIG.tankSize);
    expect(r.height).toBe(GAME_CONFIG.tankSize);
  });
});

describe("bulletRect", () => {
  it("中心坐标转为左上角 AABB", () => {
    const r = bulletRect(50, 60);
    expect(r.x).toBe(50 - GAME_CONFIG.bulletSize / 2);
    expect(r.y).toBe(60 - GAME_CONFIG.bulletSize / 2);
    expect(r.width).toBe(GAME_CONFIG.bulletSize);
    expect(r.height).toBe(GAME_CONFIG.bulletSize);
  });
});

describe("hitsObstacle", () => {
  it("命中障碍物", () => {
    const obstacles = [{ obstacleId: "o1", x: 100, y: 100, width: 64, height: 64 }];
    expect(hitsObstacle(tankRect(120, 120), obstacles)).toBe(true);
  });

  it("未命中障碍物", () => {
    const obstacles = [{ obstacleId: "o1", x: 100, y: 100, width: 64, height: 64 }];
    expect(hitsObstacle(tankRect(500, 500), obstacles)).toBe(false);
  });

  it("空障碍物列表", () => {
    expect(hitsObstacle(tankRect(100, 100), [])).toBe(false);
  });
});

describe("insideMap", () => {
  it("地图内", () => {
    expect(insideMap({ x: 0, y: 0, width: 48, height: 48 })).toBe(true);
    expect(insideMap({ x: 100, y: 100, width: 48, height: 48 })).toBe(true);
  });

  it("左上角越界", () => {
    expect(insideMap({ x: -1, y: 0, width: 48, height: 48 })).toBe(false);
    expect(insideMap({ x: 0, y: -1, width: 48, height: 48 })).toBe(false);
  });

  it("右下角越界", () => {
    expect(insideMap({ x: GAME_CONFIG.mapWidth - 47, y: 0, width: 48, height: 48 })).toBe(false);
    expect(insideMap({ x: 0, y: GAME_CONFIG.mapHeight - 47, width: 48, height: 48 })).toBe(false);
  });

  it("刚好在边界上", () => {
    expect(insideMap({ x: GAME_CONFIG.mapWidth - 48, y: 0, width: 48, height: 48 })).toBe(true);
    expect(insideMap({ x: 0, y: GAME_CONFIG.mapHeight - 48, width: 48, height: 48 })).toBe(true);
  });
});

describe("DIRECTION_VECTOR", () => {
  it("up 方向", () => {
    expect(DIRECTION_VECTOR.up).toEqual({ dx: 0, dy: -1 });
  });
  it("down 方向", () => {
    expect(DIRECTION_VECTOR.down).toEqual({ dx: 0, dy: 1 });
  });
  it("left 方向", () => {
    expect(DIRECTION_VECTOR.left).toEqual({ dx: -1, dy: 0 });
  });
  it("right 方向", () => {
    expect(DIRECTION_VECTOR.right).toEqual({ dx: 1, dy: 0 });
  });
});
