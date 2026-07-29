import { GAME_CONFIG } from "./protocol";
import { OBSTACLES } from "./map";
import type { Direction } from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function aabbOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

const T = GAME_CONFIG.tankSize; // 48
const B = GAME_CONFIG.bulletSize; // 12

// 玩家/子弹快照的 x,y 是中心坐标，换算为 AABB
export function tankRect(cx: number, cy: number): Rect {
  return { x: cx - T / 2, y: cy - T / 2, width: T, height: T };
}

export function bulletRect(cx: number, cy: number): Rect {
  return { x: cx - B / 2, y: cy - B / 2, width: B, height: B };
}

export function hitsObstacle(rect: Rect): boolean {
  return OBSTACLES.some((o) => aabbOverlap(rect, o));
}

export function insideMap(rect: Rect): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= GAME_CONFIG.mapWidth &&
    rect.y + rect.height <= GAME_CONFIG.mapHeight
  );
}

export const DIRECTION_VECTOR: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
