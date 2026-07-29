import { GAME_CONFIG } from "./protocol";
import type { ObstacleSnapshot } from "./protocol";
import type { Direction } from "./types";

const O = GAME_CONFIG.obstacleSize; // 64
const COLS = Math.floor(GAME_CONFIG.mapWidth / O); // 16
const ROWS = Math.floor(GAME_CONFIG.mapHeight / O); // 12
const HALF_COLS = COLS / 2; // 8
const HALF_ROWS = ROWS / 2; // 6

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

type ObstacleSize = "1x1" | "2x1" | "2x2";

interface ObstacleTemplate {
  type: string;
  assetKey: string;
  size: ObstacleSize;
  gridW: number;
  gridH: number;
}

const OBSTACLE_TEMPLATES: ObstacleTemplate[] = [
  { type: "grass_jungle_tree", assetKey: "obstacle_grass_jungle_tree_1x1", size: "1x1", gridW: 1, gridH: 1 },
  { type: "grass_jungle_rock", assetKey: "obstacle_grass_jungle_rock_2x1", size: "2x1", gridW: 2, gridH: 1 },
  { type: "grass_jungle_crate", assetKey: "obstacle_grass_jungle_crate_2x2", size: "2x2", gridW: 2, gridH: 2 },
  { type: "desert_gobi_stone", assetKey: "obstacle_desert_gobi_stone_1x1", size: "1x1", gridW: 1, gridH: 1 },
  { type: "desert_gobi_ruins", assetKey: "obstacle_desert_gobi_ruins_2x1", size: "2x1", gridW: 2, gridH: 1 },
  { type: "desert_gobi_dune", assetKey: "obstacle_desert_gobi_dune_2x2", size: "2x2", gridW: 2, gridH: 2 },
  { type: "snow_tundra_ice", assetKey: "obstacle_snow_tundra_ice_1x1", size: "1x1", gridW: 1, gridH: 1 },
  { type: "snow_tundra_snowblock", assetKey: "obstacle_snow_tundra_snowblock_2x1", size: "2x1", gridW: 2, gridH: 1 },
  { type: "snow_tundra_crate", assetKey: "obstacle_snow_tundra_crate_2x2", size: "2x2", gridW: 2, gridH: 2 },
  { type: "city_ruins_steel", assetKey: "obstacle_city_ruins_steel_1x1", size: "1x1", gridW: 1, gridH: 1 },
  { type: "city_ruins_wall", assetKey: "obstacle_city_ruins_wall_2x1", size: "2x1", gridW: 2, gridH: 1 },
  { type: "city_ruins_barricade", assetKey: "obstacle_city_ruins_barricade_2x2", size: "2x2", gridW: 2, gridH: 2 },
];

const MIN_OBSTACLES = 7; // 每象限最少 7 个 → 全图 28 个
const MAX_OBSTACLES = 10; // 每象限最多 10 个 → 全图 40 个
const SPAWN_SAFE_RADIUS = 2 * O;
const MAX_RETRIES = 40;

interface PlacedObstacle {
  col: number;
  row: number;
  template: ObstacleTemplate;
}

// 对称镜像生成：在左上 1/4 区域随机生成不同尺寸障碍物，镜像到其余三个象限，保证连通性
export function generateRandomObstacles(): ObstacleSnapshot[] {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const quadrant = generateQuadrant();
    const obstacles = mirrorQuadrant(quadrant);
    if (checkConnectivity(obstacles)) {
      return obstacles;
    }
  }
  return [];
}

function generateQuadrant(): PlacedObstacle[] {
  const placed: PlacedObstacle[] = [];
  const occupied = new Set<string>();

  const count = MIN_OBSTACLES + Math.floor(Math.random() * (MAX_OBSTACLES - MIN_OBSTACLES + 1));

  let attempts = 0;
  while (placed.length < count && attempts < count * 5) {
    attempts++;
    const template = OBSTACLE_TEMPLATES[Math.floor(Math.random() * OBSTACLE_TEMPLATES.length)];

    // 在左上象限内随机选位置，确保整个障碍物能放进象限
    const maxCol = HALF_COLS - template.gridW;
    const maxRow = HALF_ROWS - template.gridH;
    if (maxCol < 0 || maxRow < 0) continue;

    const col = Math.floor(Math.random() * (maxCol + 1));
    const row = Math.floor(Math.random() * (maxRow + 1));

    // 检查是否与已放置的重叠
    let overlap = false;
    for (let dc = 0; dc < template.gridW; dc++) {
      for (let dr = 0; dr < template.gridH; dr++) {
        if (occupied.has(`${col + dc},${row + dr}`)) {
          overlap = true;
          break;
        }
      }
      if (overlap) break;
    }
    if (overlap) continue;

    // 检查是否在出生点安全区
    if (isNearSpawnInQuadrant(col, row, template.gridW, template.gridH)) continue;

    // 放置
    for (let dc = 0; dc < template.gridW; dc++) {
      for (let dr = 0; dr < template.gridH; dr++) {
        occupied.add(`${col + dc},${row + dr}`);
      }
    }
    placed.push({ col, row, template });
  }

  return placed;
}

function mirrorQuadrant(quadrant: PlacedObstacle[]): ObstacleSnapshot[] {
  const obstacles: ObstacleSnapshot[] = [];
  let id = 0;

  for (const { col, row, template } of quadrant) {
    const w = template.gridW * O;
    const h = template.gridH * O;

    const mirrors: Array<[number, number]> = [
      [col, row],
      [COLS - template.gridW - col, row],
      [col, ROWS - template.gridH - row],
      [COLS - template.gridW - col, ROWS - template.gridH - row],
    ];

    for (const [mc, mr] of mirrors) {
      obstacles.push({
        obstacleId: `obs_${id++}`,
        x: mc * O,
        y: mr * O,
        width: w,
        height: h,
        type: template.type,
      });
    }
  }

  return obstacles;
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

// 检查障碍物是否靠近左上象限的出生点
function isNearSpawnInQuadrant(col: number, row: number, gridW: number, gridH: number): boolean {
  const obsX = col * O;
  const obsY = row * O;
  const obsW = gridW * O;
  const obsH = gridH * O;
  const s = SPAWN_POINTS[0]; // 左上出生点
  const nx = Math.max(obsX, Math.min(s.x, obsX + obsW));
  const ny = Math.max(obsY, Math.min(s.y, obsY + obsH));
  const dx = s.x - nx;
  const dy = s.y - ny;
  return dx * dx + dy * dy < SPAWN_SAFE_RADIUS * SPAWN_SAFE_RADIUS;
}
