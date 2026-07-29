import { GAME_CONFIG } from "./protocol";
import type { ObstacleSnapshot } from "./protocol";
import type { Direction } from "./types";

const O = GAME_CONFIG.obstacleSize; // 64
const COLS = Math.floor(GAME_CONFIG.mapWidth / O); // 16
const ROWS = Math.floor(GAME_CONFIG.mapHeight / O); // 12

export interface SpawnPoint {
  x: number;
  y: number;
  direction: Direction;
}

// 四角出生点（坦克中心坐标），朝向战场内侧
export const SPAWN_POINTS: SpawnPoint[] = [
  { x: 88, y: 88, direction: "down" }, // P1 左上
  { x: 936, y: 88, direction: "down" }, // P2 右上
  { x: 88, y: 680, direction: "up" }, // P3 左下
  { x: 936, y: 680, direction: "up" }, // P4 右下
];

// 地图主题定义
export type MapTheme = "grass_jungle" | "desert_gobi" | "snow_tundra" | "city_ruins";

interface ThemeConfig {
  name: string;
  small: string; // 1x1 可破坏 1HP
  medium: string; // 2x1 可破坏 2HP
  large: string; // 2x2 不可破坏
}

const THEMES: Record<MapTheme, ThemeConfig> = {
  grass_jungle: {
    name: "草地丛林",
    small: "grass_jungle_tree",
    medium: "grass_jungle_rock",
    large: "grass_jungle_crate",
  },
  desert_gobi: {
    name: "荒漠戈壁",
    small: "desert_gobi_stone",
    medium: "desert_gobi_ruins",
    large: "desert_gobi_dune",
  },
  snow_tundra: {
    name: "雪地冰原",
    small: "snow_tundra_ice",
    medium: "snow_tundra_snowblock",
    large: "snow_tundra_crate",
  },
  city_ruins: {
    name: "城市废墟",
    small: "city_ruins_steel",
    medium: "city_ruins_wall",
    large: "city_ruins_barricade",
  },
};

type ObstacleSize = "small" | "medium" | "large";

interface ObstacleTemplate {
  type: string;
  size: ObstacleSize;
  gridW: number;
  gridH: number;
  destructible: boolean;
  maxHp: number;
}

// 根据主题生成障碍物模板
function getTemplates(theme: MapTheme): ObstacleTemplate[] {
  const config = THEMES[theme];
  return [
    { type: config.small, size: "small", gridW: 1, gridH: 1, destructible: true, maxHp: 1 },
    { type: config.medium, size: "medium", gridW: 2, gridH: 1, destructible: true, maxHp: 2 },
    { type: config.large, size: "large", gridW: 2, gridH: 2, destructible: false, maxHp: 0 },
  ];
}

const SPAWN_SAFE_RADIUS = 2 * O;

export interface MapData {
  theme: MapTheme;
  obstacles: ObstacleSnapshot[];
}

// 生成随机主题
export function randomTheme(): MapTheme {
  const themes: MapTheme[] = ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"];
  return themes[Math.floor(Math.random() * themes.length)];
}

// 生成地图：固定骨架 + 随机填充
export function generateMap(theme?: MapTheme): MapData {
  const selectedTheme = theme || randomTheme();
  const templates = getTemplates(selectedTheme);

  const obstacles: ObstacleSnapshot[] = [];
  let id = 0;

  // 1. 中央十字骨架（大型障碍物，不可破坏）
  obstacles.push(...generateCenterCross(templates[2], () => id++));

  // 2. 四角障碍物组（中型 + 大型，增加复杂度）
  obstacles.push(...generateCornerObstacles(templates, () => id++));

  // 3. 随机填充（小型 + 中型，增加随机性）
  obstacles.push(...generateRandomFillers(templates, obstacles, () => id++));

  // 4. 验证连通性
  if (!checkConnectivity(obstacles)) {
    // 如果不连通，移除部分填充障碍物
    return { theme: selectedTheme, obstacles: obstacles.slice(0, Math.floor(obstacles.length * 0.7)) };
  }

  return { theme: selectedTheme, obstacles };
}

// 中央十字骨架：保证战场基本划分
function generateCenterCross(template: ObstacleTemplate, nextId: () => number): ObstacleSnapshot[] {
  const obstacles: ObstacleSnapshot[] = [];

  // 水平线：行 5-6，列 6-9
  for (let col = 6; col <= 9; col++) {
    obstacles.push(createObstacle(template, col * O, 5 * O, nextId()));
    obstacles.push(createObstacle(template, col * O, 6 * O, nextId()));
  }

  // 垂直线：列 7-8，行 3-8（跳过交叉点）
  for (let row = 3; row <= 8; row++) {
    if (row === 5 || row === 6) continue;
    obstacles.push(createObstacle(template, 7 * O, row * O, nextId()));
    obstacles.push(createObstacle(template, 8 * O, row * O, nextId()));
  }

  return obstacles;
}

// 四角障碍物组：每个角 2-3 个障碍物
function generateCornerObstacles(templates: ObstacleTemplate[], nextId: () => number): ObstacleSnapshot[] {
  const obstacles: ObstacleSnapshot[] = [];
  const corners = [
    { x: 1, y: 1, dirX: 1, dirY: 1 },   // P1 左上
    { x: 14, y: 1, dirX: -1, dirY: 1 },  // P2 右上
    { x: 1, y: 10, dirX: 1, dirY: -1 },  // P3 左下
    { x: 14, y: 10, dirX: -1, dirY: -1 }, // P4 右下
  ];

  for (const corner of corners) {
    // 在安全区外围生成 2-3 个障碍物
    const count = 2 + Math.floor(Math.random() * 2);

    for (let i = 0; i < count; i++) {
      const dist = 3 + Math.floor(Math.random() * 2); // 距离出生点 3-4 格
      const offsetX = corner.dirX * (dist + (i % 2));
      const offsetY = corner.dirY * (dist + Math.floor(i / 2));

      const x = (corner.x + offsetX) * O;
      const y = (corner.y + offsetY) * O;

      // 确保在地图范围内
      if (x < 0 || x >= GAME_CONFIG.mapWidth - O || y < 0 || y >= GAME_CONFIG.mapHeight - O) continue;

      // 随机选择中型或大型
      const template = Math.random() > 0.5 ? templates[1] : templates[2];
      obstacles.push(createObstacle(template, x, y, nextId()));
    }
  }

  return obstacles;
}

// 随机填充：小型和中型障碍物
function generateRandomFillers(
  templates: ObstacleTemplate[],
  existing: ObstacleSnapshot[],
  nextId: () => number
): ObstacleSnapshot[] {
  const obstacles: ObstacleSnapshot[] = [];
  const count = 6 + Math.floor(Math.random() * 4); // 6-9 个

  const occupied = new Set<string>();
  for (const obs of existing) {
    const col = Math.floor(obs.x / O);
    const row = Math.floor(obs.y / O);
    const w = Math.ceil(obs.width / O);
    const h = Math.ceil(obs.height / O);
    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) {
        occupied.add(`${col + dc},${row + dr}`);
      }
    }
  }

  let attempts = 0;
  while (obstacles.length < count && attempts < count * 5) {
    attempts++;

    // 随机位置（避开出生点和中央十字）
    const col = 1 + Math.floor(Math.random() * (COLS - 3));
    const row = 1 + Math.floor(Math.random() * (ROWS - 3));

    // 检查是否在出生点安全区
    if (isNearSpawn(col * O, row * O)) continue;

    // 检查是否与已放置的重叠
    let overlap = false;
    for (let dc = 0; dc < 2; dc++) {
      for (let dr = 0; dr < 2; dr++) {
        if (occupied.has(`${col + dc},${row + dr}`)) {
          overlap = true;
          break;
        }
      }
      if (overlap) break;
    }
    if (overlap) continue;

    // 随机选择小型或中型
    const template = Math.random() > 0.3 ? templates[0] : templates[1];
    const x = col * O;
    const y = row * O;

    obstacles.push(createObstacle(template, x, y, nextId()));

    // 标记占用
    for (let dc = 0; dc < template.gridW; dc++) {
      for (let dr = 0; dr < template.gridH; dr++) {
        occupied.add(`${col + dc},${row + dr}`);
      }
    }
  }

  return obstacles;
}

function createObstacle(template: ObstacleTemplate, x: number, y: number, id: number): ObstacleSnapshot {
  return {
    obstacleId: `obs_${id}`,
    x,
    y,
    width: template.gridW * O,
    height: template.gridH * O,
    type: template.type,
    destructible: template.destructible,
    hp: template.destructible ? template.maxHp : undefined,
    maxHp: template.destructible ? template.maxHp : undefined,
  };
}

// 检查是否靠近出生点
function isNearSpawn(x: number, y: number): boolean {
  for (const spawn of SPAWN_POINTS) {
    const dx = x + O / 2 - spawn.x;
    const dy = y + O / 2 - spawn.y;
    if (dx * dx + dy * dy < SPAWN_SAFE_RADIUS * SPAWN_SAFE_RADIUS) {
      return true;
    }
  }
  return false;
}

// BFS 连通性检查：所有出生点之间必须互相可达
function checkConnectivity(obstacles: ObstacleSnapshot[]): boolean {
  const grid: boolean[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => false)
  );

  for (const obs of obstacles) {
    const startC = Math.floor(obs.x / O);
    const startR = Math.floor(obs.y / O);
    const w = Math.ceil(obs.width / O);
    const h = Math.ceil(obs.height / O);
    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) {
        const c = startC + dc;
        const r = startR + dr;
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
          grid[r][c] = true;
        }
      }
    }
  }

  const spawnCells = SPAWN_POINTS.map((s) => ({
    c: Math.floor(s.x / O),
    r: Math.floor(s.y / O),
  }));

  const visited: boolean[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => false)
  );

  const start = spawnCells[0];
  const queue: Array<[number, number]> = [[start.c, start.r]];
  visited[start.r][start.c] = true;

  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    const neighbors: Array<[number, number]> = [
      [c - 1, r],
      [c + 1, r],
      [c, r - 1],
      [c, r + 1],
    ];
    for (const [nc, nr] of neighbors) {
      if (
        nc >= 0 &&
        nc < COLS &&
        nr >= 0 &&
        nr < ROWS &&
        !visited[nr][nc] &&
        !grid[nr][nc]
      ) {
        visited[nr][nc] = true;
        queue.push([nc, nr]);
      }
    }
  }

  return spawnCells.every((s) => visited[s.r][s.c]);
}
