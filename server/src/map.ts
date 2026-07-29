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
      large: { name: "grass_jungle_crate", gridW: 2, gridH: 2, destructible: true, maxHp: 3 },
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
const THEMES_ORDER: MapTheme[] = ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"];
let lastTheme: MapTheme | null = null;

export interface MapData {
  theme: MapTheme;
  obstacles: ObstacleSnapshot[];
}

// 生成随机主题：避免连续两局总是同一主题，增强“换地图”的可感知性
export function randomTheme(): MapTheme {
  const candidates = lastTheme
    ? THEMES_ORDER.filter((theme) => theme !== lastTheme)
    : THEMES_ORDER;
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  lastTheme = selected;
  return selected;
}

// 生成地图：自然掩体骨架 + 随机点缀，确保无重叠、出生区安全、全图连通
export function generateMap(theme?: MapTheme): MapData {
  const selectedTheme = theme || randomTheme();
  const config = THEMES[selectedTheme];

  for (let attempt = 0; attempt < 8; attempt++) {
    const builder = createMapBuilder(config);

    // 1. 中场由 4 个错落大掩体形成“岛链”，不再堆成十字墙。
    generateCenterIslands(builder);

    // 2. 侧翼连续但留通道的中型掩体，形成战场分区和绕后路径。
    generateWingCover(builder);

    // 3. 角落外沿掩体只做推进保护，避免出生点被关进死路。
    generateOuterCover(builder);

    // 4. 少量小型点缀打破规则感，同时做局部遮挡。
    generateRandomDetails(builder);

    if (checkConnectivity(builder.obstacles)) {
      return { theme: selectedTheme, obstacles: builder.obstacles };
    }
  }

  // 极端情况下退回保守布局，保证可玩性优先。
  const fallback = createMapBuilder(config);
  generateCenterIslands(fallback);
  return { theme: selectedTheme, obstacles: fallback.obstacles };
}

interface MapBuilder {
  config: ThemeConfig;
  obstacles: ObstacleSnapshot[];
  occupied: Set<string>;
  nextId: () => number;
  place: (template: ObstacleTypeConfig, col: number, row: number) => boolean;
}

function createMapBuilder(config: ThemeConfig): MapBuilder {
  let id = 0;
  const builder: MapBuilder = {
    config,
    obstacles: [],
    occupied: new Set<string>(),
    nextId: () => id++,
    place: (template, col, row) => {
      if (!canPlace(builder.occupied, col, row, template.gridW, template.gridH)) {
        return false;
      }
      markOccupied(builder.occupied, col, row, template.gridW, template.gridH);
      builder.obstacles.push(createObstacle(template, col * O, row * O, builder.nextId()));
      return true;
    },
  };
  return builder;
}

function generateCenterIslands(builder: MapBuilder): void {
  const { large, medium } = builder.config.obstacles;
  const variants = [
    {
      large: [[5, 4], [9, 4], [5, 7], [9, 7]],
      medium: [[7, 3], [7, 8]],
    },
    {
      large: [[6, 3], [8, 5], [6, 7], [10, 7]],
      medium: [[4, 6], [10, 4]],
    },
    {
      large: [[4, 4], [10, 4], [6, 7], [9, 7]],
      medium: [[7, 5], [7, 8]],
    },
  ];
  const variant = variants[Math.floor(Math.random() * variants.length)];

  for (const [col, row] of variant.large) {
    builder.place(large, col, row);
  }
  for (const [col, row] of variant.medium) {
    builder.place(medium, col, row);
  }
}

function generateWingCover(builder: MapBuilder): void {
  const { medium } = builder.config.obstacles;
  const wingPairs = [
    [[3, 3], [11, 3]],
    [[2, 5], [12, 5]],
    [[3, 8], [11, 8]],
  ];

  for (const pair of wingPairs) {
    const shouldUse = Math.random() < 0.82;
    if (!shouldUse) continue;
    for (const [col, row] of pair) {
      builder.place(medium, col, row);
    }
  }
}

function generateOuterCover(builder: MapBuilder): void {
  const { small, medium } = builder.config.obstacles;
  const outerGroups = [
    { medium: [4, 1], small: [[1, 4], [5, 2]] },
    { medium: [10, 1], small: [[14, 4], [10, 2]] },
    { medium: [4, 10], small: [[1, 7], [5, 9]] },
    { medium: [10, 10], small: [[14, 7], [10, 9]] },
  ] as const;

  for (const group of outerGroups) {
    if (Math.random() < 0.9) {
      builder.place(medium, group.medium[0], group.medium[1]);
    }
    for (const [col, row] of group.small) {
      if (Math.random() < 0.65) {
        builder.place(small, col, row);
      }
    }
  }
}

function generateRandomDetails(builder: MapBuilder): void {
  const { small } = builder.config.obstacles;
  const detailCandidates = shuffle([
    [4, 3], [6, 2], [9, 2], [11, 4],
    [1, 5], [5, 5], [10, 6], [14, 6],
    [4, 8], [6, 9], [9, 9], [11, 8],
    [7, 1], [8, 10], [2, 7], [13, 4],
  ]);
  const count = 5 + Math.floor(Math.random() * 4);

  let placed = 0;
  for (const [col, row] of detailCandidates) {
    if (placed >= count) break;
    if (builder.place(small, col, row)) {
      placed++;
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function canPlace(
  occupied: Set<string>,
  col: number,
  row: number,
  gridW: number,
  gridH: number
): boolean {
  if (col < 0 || row < 0 || col + gridW > COLS || row + gridH > ROWS) {
    return false;
  }
  if (isNearSpawn(col * O, row * O, gridW, gridH)) {
    return false;
  }
  for (let dc = 0; dc < gridW; dc++) {
    for (let dr = 0; dr < gridH; dr++) {
      if (occupied.has(`${col + dc},${row + dr}`)) {
        return false;
      }
    }
  }
  return true;
}

function markOccupied(
  occupied: Set<string>,
  col: number,
  row: number,
  gridW: number,
  gridH: number
): void {
  for (let dc = 0; dc < gridW; dc++) {
    for (let dr = 0; dr < gridH; dr++) {
      occupied.add(`${col + dc},${row + dr}`);
    }
  }
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

// 检查是否靠近出生点；按障碍物中心点计算，保证初始移动空间。
function isNearSpawn(x: number, y: number, gridW = 1, gridH = 1): boolean {
  for (const spawn of SPAWN_POINTS) {
    const dx = x + (gridW * O) / 2 - spawn.x;
    const dy = y + (gridH * O) / 2 - spawn.y;
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
