import { GAME_CONFIG } from "./protocol";
import type { ObstacleSnapshot } from "./protocol";
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

// 玩家/子弹快照的 x,y 是中心坐标，换算为 AABB。
// 尺寸可变：shrink 缩小坦克、bigshot 放大子弹时判定同步变化。
export function tankRect(cx: number, cy: number, size: number = T): Rect {
  return { x: cx - size / 2, y: cy - size / 2, width: size, height: size };
}

export function bulletRect(cx: number, cy: number, size: number = B): Rect {
  return { x: cx - size / 2, y: cy - size / 2, width: size, height: size };
}

export function hitsObstacle(rect: Rect, obstacles: ObstacleSnapshot[]): boolean {
  return obstacles.some((o) => aabbOverlap(rect, o));
}

// ghost 效果下只阻挡不可破坏墙体，可穿越可破坏障碍物。
export function hitsSolidObstacle(rect: Rect, obstacles: ObstacleSnapshot[]): boolean {
  return obstacles.some((o) => !o.destructible && aabbOverlap(rect, o));
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
