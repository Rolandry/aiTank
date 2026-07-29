import { describe, it, expect } from "vitest";
import {
  generateMap,
  randomTheme,
  validateGeneratedMap,
  SPAWN_POINTS,
} from "../../src/map";
import { GAME_CONFIG } from "../../src/protocol";
import type { ObstacleSnapshot } from "../../src/protocol";

const O = GAME_CONFIG.obstacleSize;
const COLS = Math.floor(GAME_CONFIG.mapWidth / O);
const ROWS = Math.floor(GAME_CONFIG.mapHeight / O);

describe("randomTheme", () => {
  it("返回有效主题", () => {
    const themes = ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"];
    for (let i = 0; i < 20; i++) {
      expect(themes).toContain(randomTheme());
    }
  });

  it("不连续重复同一主题", () => {
    const results: string[] = [];
    for (let i = 0; i < 20; i++) results.push(randomTheme());
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).not.toBe(results[i - 1]);
    }
  });
});

describe("generateMap", () => {
  it("返回有效主题和障碍物", () => {
    const data = generateMap();
    expect(data.theme).toBeTruthy();
    expect(data.obstacles).toBeInstanceOf(Array);
    expect(data.obstacles.length).toBeGreaterThan(0);
  });

  it("障碍物不超出地图边界", () => {
    for (let i = 0; i < 10; i++) {
      const { obstacles } = generateMap();
      for (const obs of obstacles) {
        expect(obs.x).toBeGreaterThanOrEqual(0);
        expect(obs.y).toBeGreaterThanOrEqual(0);
        expect(obs.x + obs.width).toBeLessThanOrEqual(GAME_CONFIG.mapWidth);
        expect(obs.y + obs.height).toBeLessThanOrEqual(GAME_CONFIG.mapHeight);
      }
    }
  });

  it("障碍物互不重叠", () => {
    for (let i = 0; i < 10; i++) {
      const { obstacles } = generateMap();
      const occupied = new Set<string>();
      for (const obs of obstacles) {
        const startC = Math.floor(obs.x / O);
        const startR = Math.floor(obs.y / O);
        const w = Math.ceil(obs.width / O);
        const h = Math.ceil(obs.height / O);
        for (let dc = 0; dc < w; dc++) {
          for (let dr = 0; dr < h; dr++) {
            const key = `${startC + dc},${startR + dr}`;
            expect(occupied.has(key)).toBe(false);
            occupied.add(key);
          }
        }
      }
    }
  });

  it("出生点安全区无障碍物", () => {
    const SAFE_RADIUS = O;
    for (let i = 0; i < 10; i++) {
      const { obstacles } = generateMap();
      for (const spawn of SPAWN_POINTS) {
        for (const obs of obstacles) {
          const nx = Math.max(obs.x, Math.min(spawn.x, obs.x + obs.width));
          const ny = Math.max(obs.y, Math.min(spawn.y, obs.y + obs.height));
          const dist = Math.hypot(spawn.x - nx, spawn.y - ny);
          expect(dist).toBeGreaterThanOrEqual(SAFE_RADIUS);
        }
      }
    }
  });

  it("四出生点 BFS 连通", () => {
    for (let i = 0; i < 10; i++) {
      const { obstacles } = generateMap();
      const blocked: boolean[][] = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => false)
      );
      for (const obs of obstacles) {
        const sc = Math.floor(obs.x / O);
        const sr = Math.floor(obs.y / O);
        const w = Math.ceil(obs.width / O);
        const h = Math.ceil(obs.height / O);
        for (let dc = 0; dc < w; dc++) {
          for (let dr = 0; dr < h; dr++) {
            if (sc + dc < COLS && sr + dr < ROWS) blocked[sr + dr][sc + dc] = true;
          }
        }
      }
      const spawnCells = SPAWN_POINTS.map((s) => ({
        c: Math.floor(s.x / O),
        r: Math.floor(s.y / O),
      }));
      const visited = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => false)
      );
      const queue: Array<[number, number]> = [[spawnCells[0].c, spawnCells[0].r]];
      visited[spawnCells[0].r][spawnCells[0].c] = true;
      while (queue.length > 0) {
        const [c, r] = queue.shift()!;
        for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && !visited[nr][nc] && !blocked[nr][nc]) {
            visited[nr][nc] = true;
            queue.push([nc, nr]);
          }
        }
      }
      for (const s of spawnCells) {
        expect(visited[s.r][s.c]).toBe(true);
      }
    }
  });

  it("多次调用生成不同布局", () => {
    const layouts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { obstacles } = generateMap();
      layouts.push(JSON.stringify(obstacles.map((o) => [o.x, o.y, o.type])));
    }
    const unique = new Set(layouts);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("每个主题都能生成有效地图", () => {
    for (const theme of ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"] as const) {
      const data = generateMap(theme);
      expect(data.theme).toBe(theme);
      expect(data.obstacles.length).toBeGreaterThan(0);
    }
  });
});

describe("validateGeneratedMap", () => {
  it("空障碍物列表不通过验证", () => {
    const result = validateGeneratedMap([]);
    expect(result.valid).toBe(false);
  });

  it("有效地图通过验证或返回最少问题", () => {
    const { obstacles } = generateMap();
    const result = validateGeneratedMap(obstacles);
    expect(result).toBeDefined();
    expect(result.obstacleCount).toBe(obstacles.length);
  });
});
