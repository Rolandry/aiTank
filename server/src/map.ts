import { GAME_CONFIG } from "./protocol";
import type { ObstacleSnapshot } from "./protocol";
import type { Direction } from "./types";

const O = GAME_CONFIG.obstacleSize; // 64

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

const OBSTACLE_TYPES = ["crate", "rock", "tree"] as const;
const MIN_OBSTACLES = 8;
const MAX_EXTRA_OBSTACLES = 4; // 数量 = 8 + [0,4) → 8~11 个
const SPAWN_SAFE_RADIUS = 2 * O; // 出生点安全区半径（2 格）

// 每局开局时随机生成障碍物布局：
// 64 网格对齐、互不重叠、避开出生点安全区、随机类型（crate/rock/tree）
export function generateRandomObstacles(): ObstacleSnapshot[] {
  const cols = Math.floor(GAME_CONFIG.mapWidth / O); // 16
  const rows = Math.floor(GAME_CONFIG.mapHeight / O); // 12

  const candidates: Array<readonly [number, number]> = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!isNearSpawn(c, r)) candidates.push([c, r]);
    }
  }

  // Fisher-Yates 洗牌后取前 N 个，天然保证格子不重叠
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const count = MIN_OBSTACLES + Math.floor(Math.random() * MAX_EXTRA_OBSTACLES);
  return candidates.slice(0, count).map(([col, row], i) => ({
    obstacleId: `obs_${i}`,
    x: col * O, // 左上角坐标（与客户端渲染一致）
    y: row * O,
    width: O,
    height: O,
    type: OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)],
  }));
}

// 格子（64x64）与任一出生点的最近距离是否小于安全半径
function isNearSpawn(col: number, row: number): boolean {
  const x = col * O;
  const y = row * O;
  return SPAWN_POINTS.some((s) => {
    const nx = Math.max(x, Math.min(s.x, x + O));
    const ny = Math.max(y, Math.min(s.y, y + O));
    const dx = s.x - nx;
    const dy = s.y - ny;
    return dx * dx + dy * dy < SPAWN_SAFE_RADIUS * SPAWN_SAFE_RADIUS;
  });
}
