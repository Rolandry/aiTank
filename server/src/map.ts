import { GAME_CONFIG } from "./protocol";
import type { ObstacleSnapshot } from "./protocol";
import type { Direction } from "./types";

const O = GAME_CONFIG.obstacleSize; // 64

// 网格坐标 [列, 行]，每格 64x64；地图 1024x768 = 16 列 x 12 行
// 布局：中央十字 + 四角各一组分散障碍（对应文档 1 第 5 节示意图）
const OBSTACLE_CELLS: ReadonlyArray<readonly [number, number]> = [
  // 中央十字：竖条 2x6 + 横条 6x2
  [7, 3], [8, 3],
  [7, 4], [8, 4],
  [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
  [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
  [7, 7], [8, 7],
  [7, 8], [8, 8],
  // 四角分散障碍（与出生点保持安全距离）
  [3, 2], [5, 2],
  [10, 2], [12, 2],
  [3, 9], [5, 9],
  [10, 9], [12, 9],
];

export const OBSTACLES: ObstacleSnapshot[] = OBSTACLE_CELLS.map(
  ([col, row], i) => ({
    obstacleId: `obs_${i}`,
    x: col * O, // 左上角坐标（与客户端渲染一致）
    y: row * O,
    width: O,
    height: O,
  })
);

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
