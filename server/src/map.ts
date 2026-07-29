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

// 障碍物类型定义（血量与类型挂钩，与大小解耦）
interface ObstacleTypeConfig {
  name: string;
  gridW: number;
  gridH: number;
  destructible: boolean;
  maxHp: number; // 血量由类型决定，不由大小决定
}

interface ThemeConfig {
  name: string;
  background: string;
  obstacles: {
    small: ObstacleTypeConfig;   // 1x1
    medium: ObstacleTypeConfig;  // 2x1
    large: ObstacleTypeConfig;   // 2x2
  };
}

const THEMES: Record<MapTheme, ThemeConfig> = {
  grass_jungle: {
    name: "草地丛林",
    background: "map_grass_jungle",
    obstacles: {
      small: { name: "grass_jungle_tree", gridW: 1, gridH: 1, destructible: true, maxHp: 1 },
      medium: { name: "grass_jungle_rock", gridW: 2, gridH: 1, destructible: true, maxHp: 2 },
      large: { name: "grass_jungle_crate", gridW: 2, gridH: 2, destructible: true, maxHp: 3 }, // 大型也可破坏，3 HP
    },
  },
  desert_gobi: {
    name: "荒漠戈壁",
    background: "map_desert_gobi",
    obstacles: {
      small: { name: "desert_gobi_stone", gridW: 1, gridH: 1, destructible: true, maxHp: 1 },
      medium: { name: "desert_gobi_ruins", gridW: 2, gridH: 1, destructible: true, maxHp: 2 },
      large: { name: "desert_gobi_dune", gridW: 2, gridH: 2, destructible: true, maxHp: 3 },
    },
  },
  snow_tundra: {
    name: "雪地冰原",
    background: "map_snow_tundra",
    obstacles: {
      small: { name: "snow_tundra_ice", gridW: 1, gridH: 1, destructible: true, maxHp: 1 },
      medium: { name: "snow_tundra_snowblock", gridW: 2, gridH: 1, destructible: true, maxHp: 2 },
      large: { name: "snow_tundra_crate", gridW: 2, gridH: 2, destructible: true, maxHp: 3 },
    },
  },
  city_ruins: {
    name: "城市废墟",
    background: "map_city_ruins",
    obstacles: {
      small: { name: "city_ruins_steel", gridW: 1, gridH: 1, destructible: true, maxHp: 1 },
      medium: { name: "city_ruins_wall", gridW: 2, gridH: 1, destructible: true, maxHp: 2 },
      large: { name: "city_ruins_barricade", gridW: 2, gridH: 2, destructible: true, maxHp: 3 },
    },
  },
};

const SPAWN_SAFE_RADIUS = 3 * O; // 出生点安全区 3 格

export interface MapData {
  theme: MapTheme;
  obstacles: ObstacleSnapshot[];
}

// 生成随机主题
export function randomTheme(): MapTheme {
  const themes: MapTheme[] = ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"];
  return themes[Math.floor(Math.random() * themes.length)];
}

// 生成地图：固定骨架 + 随机填充，确保无重叠
export function generateMap(theme?: MapTheme): MapData {
  const selectedTheme = theme || randomTheme();
  const config = THEMES[selectedTheme];

  const obstacles: ObstacleSnapshot[] = [];
  const occupied = new Set<string>();
  let id = 0;

  const nextId = () => id++;

  // 1. 中央十字骨架（大型障碍物，不重叠）
  const cross = generateCenterCross(config.obstacles.large, occupied, nextId);
  obstacles.push(...cross);

  // 2. 四角障碍物组（中型障碍物，分散布置）
  const corners = generateCornerObstacles(config.obstacles.medium, occupied, nextId);
  obstacles.push(...corners);

  // 3. 随机填充（小型障碍物，补充空隙）
  const fillers = generateRandomFillers(config.obstacles.small, occupied, nextId);
  obstacles.push(...fillers);

  // 4. 验证连通性
  if (!checkConnectivity(obstacles)) {
    // 如果不连通，移除部分填充障碍物重试
    return generateMap(selectedTheme);
  }

  return { theme: selectedTheme, obstacles };
}

// 检查并标记占用
function markOccupied(occupied: Set<string>, col: number, row: number, gridW: number, gridH: number): boolean {
  // 检查是否已占用
  for (let dc = 0; dc < gridW; dc++) {
    for (let dr = 0; dr < gridH; dr++) {
      if (occupied.has(`${col + dc},${row + dr}`)) {
        return false;
      }
    }
  }
  // 标记占用
  for (let dc = 0; dc < gridW; dc++) {
    for (let dr = 0; dr < gridH; dr++) {
      occupied.add(`${col + dc},${row + dr}`);
    }
  }
  return true;
}

// 中央十字骨架：确保不重叠
function generateCenterCross(
  template: ObstacleTypeConfig,
  occupied: Set<string>,
  nextId: () => number
): ObstacleSnapshot[] {
  const obstacles: ObstacleSnapshot[] = [];

  // 水平线：行 5-6，列 6-9（4 个大型障碍物）
  for (let col = 6; col <= 9; col++) {
    // 上行
    if (markOccupied(occupied, col, 5, template.gridW, template.gridH)) {
      obstacles.push(createObstacle(template, col * O, 5 * O, nextId()));
    }
    // 下行
    if (markOccupied(occupied, col, 6, template.gridW, template.gridH)) {
      obstacles.push(createObstacle(template, col * O, 6 * O, nextId()));
    }
  }

  // 垂直线：列 7-8，行 3-4 和 7-8（跳过交叉点 5-6）
  for (let row = 3; row <= 4; row++) {
    // 左列
    if (markOccupied(occupied, 7, row, template.gridW, template.gridH)) {
      obstacles.push(createObstacle(template, 7 * O, row * O, nextId()));
    }
    // 右列
    if (markOccupied(occupied, 8, row, template.gridW, template.gridH)) {
      obstacles.push(createObstacle(template, 8 * O, row * O, nextId()));
    }
  }
  for (let row = 7; row <= 8; row++) {
    // 左列
    if (markOccupied(occupied, 7, row, template.gridW, template.gridH)) {
      obstacles.push(createObstacle(template, 7 * O, row * O, nextId()));
    }
    // 右列
    if (markOccupied(occupied, 8, row, template.gridW, template.gridH)) {
      obstacles.push(createObstacle(template, 8 * O, row * O, nextId()));
    }
  }

  return obstacles;
}

// 四角障碍物组：分散布置，不重叠
function generateCornerObstacles(
  template: ObstacleTypeConfig,
  occupied: Set<string>,
  nextId: () => number
): ObstacleSnapshot[] {
  const obstacles: ObstacleSnapshot[] = [];
  const corners = [
    { baseCol: 1, baseRow: 1, dirX: 1, dirY: 1 },   // P1 左上
    { baseCol: 14, baseRow: 1, dirX: -1, dirY: 1 },  // P2 右上
    { baseCol: 1, baseRow: 10, dirX: 1, dirY: -1 },  // P3 左下
    { baseCol: 14, baseRow: 10, dirX: -1, dirY: -1 }, // P4 右下
  ];

  for (const corner of corners) {
    // 每个角生成 2 个障碍物，分散在不同位置
    const positions = [
      { dx: 3, dy: 1 },  // 横向偏移
      { dx: 1, dy: 3 },  // 纵向偏移
    ];

    for (const pos of positions) {
      const col = corner.baseCol + corner.dirX * pos.dx;
      const row = corner.baseRow + corner.dirY * pos.dy;

      // 确保在地图范围内
      if (col < 0 || col >= COLS - template.gridW || row < 0 || row >= ROWS - template.gridH) continue;

      // 检查是否在出生点安全区
      if (isNearSpawn(col * O, row * O)) continue;

      if (markOccupied(occupied, col, row, template.gridW, template.gridH)) {
        obstacles.push(createObstacle(template, col * O, row * O, nextId()));
      }
    }
  }

  return obstacles;
}

// 随机填充：小型障碍物，补充空隙
function generateRandomFillers(
  template: ObstacleTypeConfig,
  occupied: Set<string>,
  nextId: () => number
): ObstacleSnapshot[] {
  const obstacles: ObstacleSnapshot[] = [];
  const count = 5 + Math.floor(Math.random() * 3); // 5-7 个

  let attempts = 0;
  while (obstacles.length < count && attempts < count * 5) {
    attempts++;

    // 随机位置（避开边缘和中央）
    const col = 1 + Math.floor(Math.random() * (COLS - 3));
    const row = 1 + Math.floor(Math.random() * (ROWS - 3));

    // 检查是否在出生点安全区
    if (isNearSpawn(col * O, row * O)) continue;

    if (markOccupied(occupied, col, row, template.gridW, template.gridH)) {
      obstacles.push(createObstacle(template, col * O, row * O, nextId()));
    }
  }

  return obstacles;
}

function createObstacle(
  template: ObstacleTypeConfig,
  x: number,
  y: number,
  id: number
): ObstacleSnapshot {
  return {
    obstacleId: `obs_${id}`,
    x,
    y,
    width: template.gridW * O,
    height: template.gridH * O,
    type: template.name,
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
