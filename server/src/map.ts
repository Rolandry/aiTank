import { GAME_CONFIG } from "./protocol";
import type { ObstacleSnapshot } from "./protocol";
import type { Direction } from "./types";

const O = GAME_CONFIG.obstacleSize;
const COLS = Math.floor(GAME_CONFIG.mapWidth / O);
const ROWS = Math.floor(GAME_CONFIG.mapHeight / O);
const SPAWN_SAFE_RADIUS = 2.25 * O;

export interface SpawnPoint {
  x: number;
  y: number;
  direction: Direction;
}

export const SPAWN_POINTS: SpawnPoint[] = [
  { x: 88, y: 88, direction: "down" },
  { x: 936, y: 88, direction: "down" },
  { x: 88, y: 680, direction: "up" },
  { x: 936, y: 680, direction: "up" },
];

export type MapTheme = "grass_jungle" | "desert_gobi" | "snow_tundra" | "city_ruins";
type ObstacleKind = "small" | "medium" | "large";
type Rotation = 0 | 90;

interface ObstacleTypeConfig {
  name: string;
  gridW: number;
  gridH: number;
  destructible: boolean;
  maxHp: number;
}

interface ThemeConfig {
  name: string;
  background: string;
  obstacles: Record<ObstacleKind, ObstacleTypeConfig>;
}

interface TerrainPlacement {
  kind: ObstacleKind;
  col: number;
  row: number;
  rotation?: Rotation;
  destructible?: boolean;
}

interface TerrainBlueprint {
  name: string;
  placements: TerrainPlacement[];
  details: Array<[number, number]>;
}

const THEMES: Record<MapTheme, ThemeConfig> = {
  grass_jungle: {
    name: "草地丛林",
    background: "map_grass_jungle",
    obstacles: {
      small: { name: "grass_jungle_tree", gridW: 1, gridH: 1, destructible: true, maxHp: 1 },
      medium: { name: "grass_jungle_rock", gridW: 2, gridH: 1, destructible: false, maxHp: 3 },
      large: { name: "grass_jungle_crate", gridW: 2, gridH: 2, destructible: false, maxHp: 5 },
    },
  },
  desert_gobi: {
    name: "荒漠戈壁",
    background: "map_desert_gobi",
    obstacles: {
      small: { name: "desert_gobi_stone", gridW: 1, gridH: 1, destructible: true, maxHp: 1 },
      medium: { name: "desert_gobi_ruins", gridW: 2, gridH: 1, destructible: false, maxHp: 4 },
      large: { name: "desert_gobi_dune", gridW: 2, gridH: 2, destructible: false, maxHp: 6 },
    },
  },
  snow_tundra: {
    name: "雪地冰原",
    background: "map_snow_tundra",
    obstacles: {
      small: { name: "snow_tundra_ice", gridW: 1, gridH: 1, destructible: true, maxHp: 2 },
      medium: { name: "snow_tundra_snowblock", gridW: 2, gridH: 1, destructible: false, maxHp: 4 },
      large: { name: "snow_tundra_crate", gridW: 2, gridH: 2, destructible: false, maxHp: 5 },
    },
  },
  city_ruins: {
    name: "城市废墟",
    background: "map_city_ruins",
    obstacles: {
      small: { name: "city_ruins_steel", gridW: 1, gridH: 1, destructible: true, maxHp: 3 },
      medium: { name: "city_ruins_wall", gridW: 2, gridH: 1, destructible: false, maxHp: 5 },
      large: { name: "city_ruins_barricade", gridW: 2, gridH: 2, destructible: false, maxHp: 7 },
    },
  },
};

// 每套蓝图借鉴成熟竞技地图的中心争夺、多路径和侧翼绕后原则，
// 再针对主题塑造不同的地形语言，而不是随机散点摆放。
const BLUEPRINTS: Record<MapTheme, TerrainBlueprint> = {
  grass_jungle: {
    name: "林地双湾",
    placements: [
      // 中央不闭合环：四向入口，环内形成争夺区。
      { kind: "large", col: 5, row: 4 },
      { kind: "large", col: 9, row: 4 },
      { kind: "large", col: 5, row: 7 },
      { kind: "large", col: 9, row: 7 },
      { kind: "medium", col: 7, row: 3 },
      { kind: "medium", col: 7, row: 8 },
      // 左右 L 形掩体湾，均保留上下两个出口。
      { kind: "medium", col: 2, row: 4 },
      { kind: "medium", col: 3, row: 5, rotation: 90 },
      { kind: "medium", col: 12, row: 4 },
      { kind: "medium", col: 12, row: 5, rotation: 90 },
      { kind: "medium", col: 2, row: 7 },
      { kind: "medium", col: 3, row: 6, rotation: 90 },
      { kind: "medium", col: 12, row: 7 },
      { kind: "medium", col: 12, row: 6, rotation: 90 },
      // 树木是可破坏封口，打掉后形成直达环内的捷径。
      { kind: "small", col: 7, row: 5 },
      { kind: "small", col: 8, row: 6 },
    ],
    details: [[5, 2], [10, 2], [5, 9], [10, 9], [1, 5], [14, 6]],
  },
  desert_gobi: {
    name: "戈壁岛链",
    placements: [
      // 大型沙丘形成错位岛链，保留斜向穿插路线。
      { kind: "large", col: 4, row: 3 },
      { kind: "large", col: 10, row: 3 },
      { kind: "large", col: 7, row: 5 },
      { kind: "large", col: 4, row: 7 },
      { kind: "large", col: 10, row: 7 },
      // 短墙连接岛链但不闭合，切割超长射线。
      { kind: "medium", col: 2, row: 5 },
      { kind: "medium", col: 12, row: 5 },
      { kind: "medium", col: 6, row: 3, rotation: 90 },
      { kind: "medium", col: 9, row: 7, rotation: 90 },
      { kind: "medium", col: 6, row: 9 },
      { kind: "medium", col: 8, row: 2 },
      // 中央左右两扇可破坏石门提供高风险直线捷径。
      { kind: "small", col: 6, row: 6 },
      { kind: "small", col: 9, row: 5 },
    ],
    details: [[3, 3], [12, 3], [3, 8], [12, 8], [7, 2], [8, 9], [1, 6], [14, 5]],
  },
  snow_tundra: {
    name: "冰墙缺口",
    placements: [
      // 两条横向冰墙通过错位缺口形成 S 形主通道。
      { kind: "medium", col: 3, row: 3 },
      { kind: "medium", col: 5, row: 3 },
      { kind: "medium", col: 9, row: 3 },
      { kind: "medium", col: 11, row: 3 },
      { kind: "medium", col: 3, row: 8 },
      { kind: "medium", col: 5, row: 8 },
      { kind: "medium", col: 9, row: 8 },
      { kind: "medium", col: 11, row: 8 },
      // 纵向短墙形成左右侧翼通道和中部交火区。
      { kind: "medium", col: 3, row: 5, rotation: 90 },
      { kind: "medium", col: 12, row: 5, rotation: 90 },
      { kind: "large", col: 6, row: 5 },
      { kind: "large", col: 9, row: 5 },
      // 冰块填在墙缺口中，可打穿但不影响外圈基础路线。
      { kind: "small", col: 7, row: 3 },
      { kind: "small", col: 8, row: 8 },
      { kind: "small", col: 5, row: 6 },
      { kind: "small", col: 10, row: 5 },
    ],
    details: [[2, 4], [13, 7], [5, 2], [10, 2], [5, 9], [10, 9]],
  },
  city_ruins: {
    name: "十字街区",
    placements: [
      // 四个街区围出十字主路与环形辅路。
      { kind: "large", col: 4, row: 3 },
      { kind: "large", col: 10, row: 3 },
      { kind: "large", col: 4, row: 7 },
      { kind: "large", col: 10, row: 7 },
      { kind: "medium", col: 3, row: 5, rotation: 90 },
      { kind: "medium", col: 12, row: 5, rotation: 90 },
      { kind: "medium", col: 6, row: 3 },
      { kind: "medium", col: 8, row: 3 },
      { kind: "medium", col: 6, row: 8 },
      { kind: "medium", col: 8, row: 8 },
      // 街角短墙制造近距离巷战位。
      { kind: "medium", col: 2, row: 7 },
      { kind: "medium", col: 12, row: 7 },
      { kind: "medium", col: 2, row: 4 },
      { kind: "medium", col: 12, row: 4 },
      // 钢制路障封住两条巷口，击毁后开放对角穿越。
      { kind: "small", col: 6, row: 5 },
      { kind: "small", col: 9, row: 6 },
      { kind: "small", col: 7, row: 7 },
      { kind: "small", col: 8, row: 4 },
    ],
    details: [[1, 5], [14, 6], [5, 2], [10, 2], [5, 9], [10, 9]],
  },
};

const THEMES_ORDER: MapTheme[] = ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"];
let lastTheme: MapTheme | null = null;

export interface MapData {
  theme: MapTheme;
  obstacles: ObstacleSnapshot[];
}

export interface MapValidationResult {
  valid: boolean;
  issues: string[];
  obstacleCount: number;
  destructibleCount: number;
}

export function randomTheme(): MapTheme {
  const candidates = lastTheme
    ? THEMES_ORDER.filter((theme) => theme !== lastTheme)
    : THEMES_ORDER;
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  lastTheme = selected;
  return selected;
}

export function generateMap(theme?: MapTheme): MapData {
  const selectedTheme = theme ?? randomTheme();
  const config = THEMES[selectedTheme];
  const blueprint = BLUEPRINTS[selectedTheme];

  // 镜像提供有限随机性，但保持竞技地图的结构可读性和公平性。
  for (let attempt = 0; attempt < 8; attempt++) {
    const builder = createMapBuilder(config);
    const mirrorX = Math.random() < 0.5;
    const mirrorY = Math.random() < 0.5;

    for (const placement of blueprint.placements) {
      builder.place(transformPlacement(placement, config, mirrorX, mirrorY));
    }
    addSymmetricDetails(builder, blueprint.details, mirrorX, mirrorY);

    if (validateGeneratedMap(builder.obstacles).valid) {
      return { theme: selectedTheme, obstacles: builder.obstacles };
    }
  }

  // 固定蓝图本身经过校验；仅在随机装饰异常时退回无装饰版本。
  const fallback = createMapBuilder(config);
  for (const placement of blueprint.placements) {
    fallback.place(placement);
  }
  return { theme: selectedTheme, obstacles: fallback.obstacles };
}

interface MapBuilder {
  config: ThemeConfig;
  obstacles: ObstacleSnapshot[];
  occupied: Set<string>;
  place: (placement: TerrainPlacement) => boolean;
}

function createMapBuilder(config: ThemeConfig): MapBuilder {
  let id = 0;
  const builder: MapBuilder = {
    config,
    obstacles: [],
    occupied: new Set<string>(),
    place: (placement) => {
      const template = config.obstacles[placement.kind];
      const rotation = placement.rotation ?? 0;
      const { gridW, gridH } = getRotatedSize(template, rotation);
      if (!canPlace(builder.occupied, placement.col, placement.row, gridW, gridH)) {
        return false;
      }

      markOccupied(builder.occupied, placement.col, placement.row, gridW, gridH);
      builder.obstacles.push(createObstacle(
        template,
        placement.col,
        placement.row,
        gridW,
        gridH,
        rotation,
        placement.destructible,
        id++
      ));
      return true;
    },
  };
  return builder;
}

function transformPlacement(
  placement: TerrainPlacement,
  config: ThemeConfig,
  mirrorX: boolean,
  mirrorY: boolean
): TerrainPlacement {
  const template = config.obstacles[placement.kind];
  const rotation = placement.rotation ?? 0;
  const { gridW, gridH } = getRotatedSize(template, rotation);
  return {
    ...placement,
    col: mirrorX ? COLS - placement.col - gridW : placement.col,
    row: mirrorY ? ROWS - placement.row - gridH : placement.row,
  };
}

function addSymmetricDetails(
  builder: MapBuilder,
  candidates: Array<[number, number]>,
  mirrorX: boolean,
  mirrorY: boolean
): void {
  const shuffled = shuffle([...candidates]);
  const count = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 3));
  for (const [col, row] of shuffled.slice(0, count)) {
    const transformed = transformPlacement(
      { kind: "small", col, row, destructible: true },
      builder.config,
      mirrorX,
      mirrorY
    );
    builder.place(transformed);
  }
}

function getRotatedSize(template: ObstacleTypeConfig, rotation: Rotation): { gridW: number; gridH: number } {
  return rotation === 90
    ? { gridW: template.gridH, gridH: template.gridW }
    : { gridW: template.gridW, gridH: template.gridH };
}

function canPlace(
  occupied: Set<string>,
  col: number,
  row: number,
  gridW: number,
  gridH: number
): boolean {
  if (col < 0 || row < 0 || col + gridW > COLS || row + gridH > ROWS) return false;
  if (isNearSpawn(col, row, gridW, gridH)) return false;

  for (let dc = 0; dc < gridW; dc++) {
    for (let dr = 0; dr < gridH; dr++) {
      if (occupied.has(`${col + dc},${row + dr}`)) return false;
    }
  }
  return true;
}

function markOccupied(occupied: Set<string>, col: number, row: number, gridW: number, gridH: number): void {
  for (let dc = 0; dc < gridW; dc++) {
    for (let dr = 0; dr < gridH; dr++) {
      occupied.add(`${col + dc},${row + dr}`);
    }
  }
}

function createObstacle(
  template: ObstacleTypeConfig,
  col: number,
  row: number,
  gridW: number,
  gridH: number,
  rotation: Rotation,
  destructibleOverride: boolean | undefined,
  id: number
): ObstacleSnapshot {
  const destructible = destructibleOverride ?? template.destructible;
  return {
    obstacleId: `obs_${id}`,
    x: col * O,
    y: row * O,
    width: gridW * O,
    height: gridH * O,
    rotation,
    type: template.name,
    destructible,
    hp: destructible ? template.maxHp : undefined,
    maxHp: destructible ? template.maxHp : undefined,
  };
}

function isNearSpawn(col: number, row: number, gridW: number, gridH: number): boolean {
  const centerX = (col + gridW / 2) * O;
  const centerY = (row + gridH / 2) * O;
  return SPAWN_POINTS.some((spawn) => {
    const dx = centerX - spawn.x;
    const dy = centerY - spawn.y;
    return dx * dx + dy * dy < SPAWN_SAFE_RADIUS * SPAWN_SAFE_RADIUS;
  });
}

export function validateGeneratedMap(obstacles: ObstacleSnapshot[]): MapValidationResult {
  const issues: string[] = [];
  const occupied = new Set<string>();

  for (const obstacle of obstacles) {
    const col = Math.floor(obstacle.x / O);
    const row = Math.floor(obstacle.y / O);
    const gridW = Math.ceil(obstacle.width / O);
    const gridH = Math.ceil(obstacle.height / O);

    if (col < 0 || row < 0 || col + gridW > COLS || row + gridH > ROWS) {
      issues.push(`障碍物 ${obstacle.obstacleId} 越界`);
      continue;
    }
    for (let dc = 0; dc < gridW; dc++) {
      for (let dr = 0; dr < gridH; dr++) {
        const key = `${col + dc},${row + dr}`;
        if (occupied.has(key)) issues.push(`网格 ${key} 存在障碍物重叠`);
        occupied.add(key);
      }
    }
  }

  if (!checkConnectivity(obstacles)) issues.push("出生点之间不存在基础连通路线");
  if (!hasTwoSpawnExits(obstacles)) issues.push("至少一个出生点不足两个独立离场方向");
  if (obstacles.length < 12) issues.push("地形结构障碍物数量不足");

  return {
    valid: issues.length === 0,
    issues,
    obstacleCount: obstacles.length,
    destructibleCount: obstacles.filter((obstacle) => obstacle.destructible).length,
  };
}

function buildBlockedGrid(obstacles: ObstacleSnapshot[]): boolean[][] {
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
  for (const obstacle of obstacles) {
    const startCol = Math.floor(obstacle.x / O);
    const startRow = Math.floor(obstacle.y / O);
    const gridW = Math.ceil(obstacle.width / O);
    const gridH = Math.ceil(obstacle.height / O);
    for (let dc = 0; dc < gridW; dc++) {
      for (let dr = 0; dr < gridH; dr++) {
        const col = startCol + dc;
        const row = startRow + dr;
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) grid[row][col] = true;
      }
    }
  }
  return grid;
}

function hasTwoSpawnExits(obstacles: ObstacleSnapshot[]): boolean {
  const blocked = buildBlockedGrid(obstacles);
  const directions: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return SPAWN_POINTS.every((spawn) => {
    const col = Math.floor(spawn.x / O);
    const row = Math.floor(spawn.y / O);
    const openDirections = directions.filter(([dc, dr]) => {
      const nextCol = col + dc;
      const nextRow = row + dr;
      return nextCol >= 0 && nextCol < COLS && nextRow >= 0 && nextRow < ROWS && !blocked[nextRow][nextCol];
    });
    return openDirections.length >= 2;
  });
}

function checkConnectivity(obstacles: ObstacleSnapshot[]): boolean {
  const blocked = buildBlockedGrid(obstacles);
  const spawnCells = SPAWN_POINTS.map((spawn) => ({
    col: Math.floor(spawn.x / O),
    row: Math.floor(spawn.y / O),
  }));
  const visited = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
  const queue: Array<[number, number]> = [[spawnCells[0].col, spawnCells[0].row]];
  visited[spawnCells[0].row][spawnCells[0].col] = true;

  for (let index = 0; index < queue.length; index++) {
    const [col, row] = queue[index];
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (
        nextCol >= 0 && nextCol < COLS && nextRow >= 0 && nextRow < ROWS &&
        !visited[nextRow][nextCol] && !blocked[nextRow][nextCol]
      ) {
        visited[nextRow][nextCol] = true;
        queue.push([nextCol, nextRow]);
      }
    }
  }

  return spawnCells.every(({ col, row }) => visited[row][col]);
}

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}
