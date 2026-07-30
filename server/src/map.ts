import { GAME_CONFIG } from "./protocol";
import type { ObstacleSnapshot } from "./protocol";
import type { Direction } from "./types";

const O = GAME_CONFIG.obstacleSize;
const COLS = Math.floor(GAME_CONFIG.mapWidth / O);
const ROWS = Math.floor(GAME_CONFIG.mapHeight / O);
const TARGET_CELLS: CellPoint[] = [
  { col: 7, row: 5 }, { col: 8, row: 5 },
  { col: 7, row: 6 }, { col: 8, row: 6 },
];
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

type Cell = "open" | "wall" | "door";
type SemanticGrid = Cell[][];
type Rotation = 0 | 90;
type ObstacleKind = "small" | "medium" | "large";

interface CellPoint {
  col: number;
  row: number;
}

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

const SPAWN_CELLS: CellPoint[] = SPAWN_POINTS.map((spawn) => ({
  col: Math.floor(spawn.x / O),
  row: Math.floor(spawn.y / O),
}));

// 主题联合类型定义在协议层（双端唯一事实源），此处重新导出供服务端内部使用
export type { MapTheme } from "./protocol";
import type { MapTheme } from "./protocol";

interface ObstacleTypeConfig {
  name: string;
  maxHp: number;
}

interface ThemeConfig {
  obstacles: Record<ObstacleKind, ObstacleTypeConfig>;
  build: (grid: SemanticGrid, variant: number) => void;
}

interface ObstaclePlacement {
  kind: ObstacleKind;
  col: number;
  row: number;
  gridW: number;
  gridH: number;
  rotation: Rotation;
  destructible: boolean;
  hpMultiplier?: number; // 孤立墙格比门洞更耐打，避免地形过易拆解
}

const THEMES: Record<MapTheme, ThemeConfig> = {
  grass_jungle: {
    obstacles: {
      small: { name: "grass_jungle_tree", maxHp: 2 },
      medium: { name: "grass_jungle_rock", maxHp: 4 },
      large: { name: "grass_jungle_crate", maxHp: 6 },
    },
    build: buildGrassJungle,
  },
  desert_gobi: {
    obstacles: {
      small: { name: "desert_gobi_stone", maxHp: 2 },
      medium: { name: "desert_gobi_ruins", maxHp: 5 },
      large: { name: "desert_gobi_dune", maxHp: 7 },
    },
    build: buildDesertGobi,
  },
  snow_tundra: {
    obstacles: {
      small: { name: "snow_tundra_ice", maxHp: 3 },
      medium: { name: "snow_tundra_snowblock", maxHp: 5 },
      large: { name: "snow_tundra_crate", maxHp: 7 },
    },
    build: buildSnowTundra,
  },
  city_ruins: {
    obstacles: {
      small: { name: "city_ruins_steel", maxHp: 3 },
      medium: { name: "city_ruins_wall", maxHp: 6 },
      large: { name: "city_ruins_barricade", maxHp: 8 },
    },
    build: buildCityRuins,
  },
};

const THEMES_ORDER: MapTheme[] = ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"];
let lastTheme: MapTheme | null = null;

export interface MapData {
  theme: MapTheme;
  obstacles: ObstacleSnapshot[];
}

export interface MapMetrics {
  blockedRatio: number;
  wallChains: number;
  isolatedCells: number;
  destructibleDoors: number;
  longestSightLine: number;
  sightLineP95: number;
  deadEnds: number;
  redundantSpawnRoutes: boolean;
}

export interface MapValidationResult {
  valid: boolean;
  issues: string[];
  obstacleCount: number;
  destructibleCount: number;
  metrics: MapMetrics;
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
  let best: { obstacles: ObstacleSnapshot[]; issues: number } | null = null;

  for (let attempt = 0; attempt < 24; attempt++) {
    const variant = Math.floor(Math.random() * 8);
    let grid = createGrid();
    config.build(grid, variant);
    addPerimeterBreakers(grid, variant);
    protectSpawnAreas(grid);
    grid = transformGrid(grid, variant >= 4, variant % 2 === 1);
    protectSpawnAreas(grid);
    repairGrid(grid);

    const obstacles = gridToObstacles(grid, config);
    const result = validateGeneratedMap(obstacles);
    if (result.valid) {
      return { theme: selectedTheme, obstacles };
    }
    if (!best || result.issues.length < best.issues) {
      best = { obstacles, issues: result.issues.length };
    }
  }

  // 所有变体都未完全达标时返回问题最少的候选，保证可玩性优先于风格。
  return { theme: selectedTheme, obstacles: best!.obstacles };
}

// 结构修复：蓝图组合后可能出现封闭口袋、死角或出生点单一路线，
// 这里统一按可玩性优先修复，避免依赖手工微调每个坐标。
function repairGrid(grid: SemanticGrid): void {
  connectRegions(grid);
  ensureSpawnRedundancy(grid);
  removeDeadEnds(grid);
  breakLongSightLines(grid);
  connectRegions(grid);
}

// 修复走廊后可能重新出现贯穿行列，这里逐行逐列插入交错掩体；
// 每次插入都验证连通性和死角，确保只减少视线不破坏路线。
function breakLongSightLines(grid: SemanticGrid): void {
  const maxRun = 9;

  for (let row = 0; row < ROWS; row++) {
    for (const col of candidateCols(row)) {
      if (longestRunInRow(grid, row) <= maxRun) break;
      tryInsertCover(grid, col, row);
    }
  }
  for (let col = 0; col < COLS; col++) {
    for (const row of candidateRows(col)) {
      if (longestRunInCol(grid, col) <= maxRun) break;
      tryInsertCover(grid, col, row);
    }
  }
}

function candidateCols(row: number): number[] {
  const base = row % 2 === 0 ? [5, 10, 3, 12, 7] : [10, 5, 12, 3, 8];
  return base;
}

function candidateRows(col: number): number[] {
  const base = col % 2 === 0 ? [4, 7, 2, 9, 5] : [7, 4, 9, 2, 6];
  return base;
}

function tryInsertCover(grid: SemanticGrid, col: number, row: number): void {
  if (grid[row]?.[col] !== "open") return;
  if (isSpawnBuffer(col, row)) return;

  grid[row][col] = "wall";
  const blocked = gridToBlocked(grid);
  const reachable = floodFill(blocked, SPAWN_CELLS[0]);
  const spawnsOk = SPAWN_CELLS.every((spawn) => reachable[spawn.row][spawn.col]);
  const centerOk = TARGET_CELLS.some(({ col: c, row: r }) => !blocked[r][c] && reachable[r][c]);
  const noOrphan = !findOrphanCell(blocked, reachable);
  const noDeadEnd = countDeadEnds(blocked) === 0;

  if (!spawnsOk || !centerOk || !noOrphan || !noDeadEnd) grid[row][col] = "open";
}

function isSpawnBuffer(col: number, row: number): boolean {
  return SPAWN_CELLS.some((spawn) => Math.abs(spawn.col - col) <= 1 && Math.abs(spawn.row - row) <= 1);
}

function longestRunInRow(grid: SemanticGrid, row: number): number {
  let longest = 0;
  let run = 0;
  for (let col = 0; col <= COLS; col++) {
    if (col < COLS && grid[row][col] === "open") run++;
    else {
      longest = Math.max(longest, run);
      run = 0;
    }
  }
  return longest;
}

function longestRunInCol(grid: SemanticGrid, col: number): number {
  let longest = 0;
  let run = 0;
  for (let row = 0; row <= ROWS; row++) {
    if (row < ROWS && grid[row][col] === "open") run++;
    else {
      longest = Math.max(longest, run);
      run = 0;
    }
  }
  return longest;
}

function connectRegions(grid: SemanticGrid): void {
  for (let round = 0; round < 24; round++) {
    const blocked = gridToBlocked(grid);
    const main = floodFill(blocked, SPAWN_CELLS[0]);
    const orphan = findOrphanCell(blocked, main);
    if (!orphan) return;

    // 打通与主区域相邻的墙格，把孤立口袋接回路线网络。
    const bridge = findBridgeCell(grid, main, orphan);
    if (!bridge) {
      fillRegion(grid, blocked, orphan);
      continue;
    }
    clear(grid, bridge.col, bridge.row);
  }
}

function findOrphanCell(blocked: boolean[][], main: boolean[][]): CellPoint | null {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (!blocked[row][col] && !main[row][col]) return { col, row };
    }
  }
  return null;
}

function findBridgeCell(grid: SemanticGrid, main: boolean[][], orphan: CellPoint): CellPoint | null {
  const blocked = gridToBlocked(grid);
  const region = floodFill(blocked, orphan);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] === "open") continue;
      const touchesMain = DIRECTIONS.some(([dc, dr]) => main[row + dr]?.[col + dc]);
      const touchesRegion = DIRECTIONS.some(([dc, dr]) => region[row + dr]?.[col + dc]);
      if (touchesMain && touchesRegion) return { col, row };
    }
  }
  return null;
}

function fillRegion(grid: SemanticGrid, blocked: boolean[][], start: CellPoint): void {
  const region = floodFill(blocked, start);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (region[row][col]) setCell(grid, col, row, "wall");
    }
  }
}

function ensureSpawnRedundancy(grid: SemanticGrid): void {
  for (const spawn of SPAWN_CELLS) {
    const horizontal = spawn.col < COLS / 2 ? 1 : -1;
    const vertical = spawn.row < ROWS / 2 ? 1 : -1;
    // 横向与纵向各开一条走廊，使两个首步方向都能独立通向中央。
    carveCorridor(grid, spawn, horizontal, 0, 4);
    carveCorridor(grid, spawn, 0, vertical, 4);
  }
}

function carveCorridor(
  grid: SemanticGrid,
  start: CellPoint,
  stepCol: number,
  stepRow: number,
  length: number
): void {
  for (let step = 1; step <= length; step++) {
    const col = start.col + stepCol * step;
    const row = start.row + stepRow * step;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    clear(grid, col, row);
  }
}

function removeDeadEnds(grid: SemanticGrid): void {
  for (let round = 0; round < 6; round++) {
    const blocked = gridToBlocked(grid);
    let repaired = false;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (blocked[row][col]) continue;
        if (openNeighbors(blocked, { col, row }).length > 1) continue;

        // 死角至少再开一个方向，避免出现无战术价值的封闭凹槽。
        for (const [dc, dr] of DIRECTIONS) {
          const nextCol = col + dc;
          const nextRow = row + dr;
          if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS) continue;
          if (grid[nextRow][nextCol] === "open") continue;
          clear(grid, nextCol, nextRow);
          repaired = true;
          break;
        }
      }
    }
    if (!repaired) return;
  }
}

function gridToBlocked(grid: SemanticGrid): boolean[][] {
  return grid.map((row) => row.map((cell) => cell !== "open"));
}

// 外圈若完全空旷会形成横贯全图的射线，因此在四条边交错插入掩体，
// 同时保持每个角落既有横向也有纵向的离场通道。
function addPerimeterBreakers(grid: SemanticGrid, variant: number): void {
  const offset = variant % 2;
  const top = 0;
  const bottom = ROWS - 1;
  const left = 0;
  const right = COLS - 1;

  for (const col of [4 + offset, 7, 11 - offset]) {
    setCell(grid, col, top, "wall");
    setCell(grid, col + 1, bottom, "wall");
  }
  for (const row of [4 + offset, 7 - offset]) {
    setCell(grid, left, row, "wall");
    setCell(grid, right, row + 1, "wall");
  }

  // 第二圈交错掩体切断紧贴边界的长通道。
  door(grid, 5 + offset, 2);
  door(grid, 10 - offset, 9);
  setCell(grid, 2, 6 - offset, "wall");
  setCell(grid, COLS - 3, 5 + offset, "wall");
}

function createGrid(): SemanticGrid {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => "open" as Cell));
}

function buildGrassJungle(grid: SemanticGrid, variant: number): void {
  const shift = variant % 3 === 0 ? 1 : 0;

  // 中央断续环与四向门洞。
  wallH(grid, 4, 3, 4);
  wallH(grid, 9, 3, 4);
  wallH(grid, 4, 8, 4);
  wallH(grid, 9, 8, 4);
  wallV(grid, 4, 4, 4);
  wallV(grid, 11, 4, 4);
  door(grid, 7 + shift, 3);
  door(grid, 8 - shift, 8);

  // 两侧曲折林墙形成掩体湾和外侧绕行路。
  wallH(grid, 1, 4, 3);
  wallV(grid, 3, 5, 3);
  wallH(grid, 1, 7, 3);
  wallH(grid, 12, 4, 3);
  wallV(grid, 12, 5, 3);
  wallH(grid, 12, 7, 3);

  // 上下错位墙打断贯穿视线，并引导进入环路。
  wallH(grid, 4, 1, 3);
  wallH(grid, 9, 1, 3);
  wallH(grid, 4, 10, 3);
  wallH(grid, 9, 10, 3);
  wallV(grid, 7, 1, 2);
  wallV(grid, 8, 9, 2);
  door(grid, 3, 6);
  door(grid, 12, 5);
}

function buildDesertGobi(grid: SemanticGrid, variant: number): void {
  const upperGap = variant % 2 === 0 ? 7 : 8;
  const lowerGap = upperGap === 7 ? 8 : 7;

  // 三道错位岩脊塑造宽主路和 S 形穿越线。
  wallH(grid, 2, 3, 5);
  wallH(grid, 9, 3, 5);
  wallH(grid, 3, 8, 5);
  wallH(grid, 10, 8, 4);
  wallH(grid, 5, 5, 3);
  wallH(grid, 9, 6, 3);
  wallV(grid, 5, 4, 3);
  wallV(grid, 10, 5, 3);

  // 岩堡负责近战绕柱，外缘仍保留双向通道。
  wallRect(grid, 2, 5, 2, 2);
  wallRect(grid, 12, 5, 2, 2);
  wallV(grid, 3, 1, 2);
  wallV(grid, 12, 9, 2);
  wallH(grid, 6, 1, 4);
  wallH(grid, 6, 10, 4);

  door(grid, upperGap, 3);
  door(grid, lowerGap, 8);
  door(grid, 8, 5);
  door(grid, 7, 6);
}

function buildSnowTundra(grid: SemanticGrid, variant: number): void {
  const gateA = variant % 2 === 0 ? 6 : 9;
  const gateB = gateA === 6 ? 9 : 6;

  // 交替缺口的长冰墙构成明确 S 形主通道；缺口留在中部，避免被出生走廊打穿。
  wallH(grid, 3, 3, 11);
  clear(grid, gateA, 3);
  wallH(grid, 2, 8, 11);
  clear(grid, gateB, 8);

  // 纵向骨架把地图分成中央交火室与两侧窄道。
  wallV(grid, 3, 4, 4);
  wallV(grid, 12, 4, 4);
  wallV(grid, 6, 5, 3);
  wallV(grid, 9, 4, 3);
  wallH(grid, 4, 5, 2);
  wallH(grid, 10, 6, 2);

  // 上下两条错位短墙切断纵向长视野。
  wallH(grid, 4, 1, 2);
  wallH(grid, 10, 1, 2);
  wallH(grid, 5, 10, 2);
  wallH(grid, 9, 10, 2);
  wallV(grid, 7, 1, 2);
  wallV(grid, 8, 9, 2);

  door(grid, gateA, 3);
  door(grid, gateB, 8);
  door(grid, 6, 6);
  door(grid, 9, 5);
}

function buildCityRuins(grid: SemanticGrid, variant: number): void {
  const offset = variant % 2;

  // 四个 L 形街区围出十字路口和环形辅路。
  wallRect(grid, 3, 2, 4, 2);
  clear(grid, 6, 3);
  wallRect(grid, 9, 2, 4, 2);
  clear(grid, 9, 3);
  wallRect(grid, 3, 8, 4, 2);
  clear(grid, 6, 8);
  wallRect(grid, 9, 8, 4, 2);
  clear(grid, 9, 8);

  wallV(grid, 3, 4, 3);
  wallV(grid, 12, 5, 3);
  wallV(grid, 5, 4, 2);
  wallV(grid, 10, 6, 2);
  wallH(grid, 1, 5, 3);
  wallH(grid, 12, 6, 3);
  wallH(grid, 5, 7, 3);
  wallH(grid, 8, 4, 3);

  // 可破坏路障开放对角捷径，不影响十字主路。
  door(grid, 6 + offset, 4);
  door(grid, 9 - offset, 7);
  door(grid, 5, 6);
  door(grid, 10, 5);
}

function wallH(grid: SemanticGrid, col: number, row: number, length: number): void {
  for (let dc = 0; dc < length; dc++) setCell(grid, col + dc, row, "wall");
}

function wallV(grid: SemanticGrid, col: number, row: number, length: number): void {
  for (let dr = 0; dr < length; dr++) setCell(grid, col, row + dr, "wall");
}

function wallRect(grid: SemanticGrid, col: number, row: number, width: number, height: number): void {
  for (let dr = 0; dr < height; dr++) wallH(grid, col, row + dr, width);
}

function door(grid: SemanticGrid, col: number, row: number): void {
  setCell(grid, col, row, "door");
}

function clear(grid: SemanticGrid, col: number, row: number): void {
  setCell(grid, col, row, "open");
}

function setCell(grid: SemanticGrid, col: number, row: number, cell: Cell): void {
  if (col >= 0 && col < COLS && row >= 0 && row < ROWS) grid[row][col] = cell;
}

function protectSpawnAreas(grid: SemanticGrid): void {
  for (const spawn of SPAWN_CELLS) {
    // 3×3 缓冲区保证出生后能沿两个方向离场。
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) clear(grid, spawn.col + dc, spawn.row + dr);
    }
  }
}

function transformGrid(source: SemanticGrid, mirrorX: boolean, mirrorY: boolean): SemanticGrid {
  if (!mirrorX && !mirrorY) return source;
  const result = createGrid();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const targetCol = mirrorX ? COLS - 1 - col : col;
      const targetRow = mirrorY ? ROWS - 1 - row : row;
      result[targetRow][targetCol] = source[row][col];
    }
  }
  return result;
}

// 可破坏性与素材一一对应：1×1 恒可破坏，2×1 与 2×2 恒不可破坏。
// 玩家因此可以仅凭外观判断能否击毁，不依赖额外标记。
function gridToObstacles(grid: SemanticGrid, config: ThemeConfig): ObstacleSnapshot[] {
  const placements: ObstaclePlacement[] = [];
  const used = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));

  // 门洞：单格可破坏，作为捷径入口。
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] === "door") {
        placements.push({ kind: "small", col, row, gridW: 1, gridH: 1, rotation: 0, destructible: true });
        used[row][col] = true;
      }
    }
  }

  // 结构墙体：优先打包 2×2，再打包横向与纵向 2×1。
  for (let row = 0; row < ROWS - 1; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      if (canPack(grid, used, col, row, 2, 2)) {
        placements.push({ kind: "large", col, row, gridW: 2, gridH: 2, rotation: 0, destructible: false });
        markUsed(used, col, row, 2, 2);
      }
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      if (canPack(grid, used, col, row, 2, 1)) {
        placements.push({ kind: "medium", col, row, gridW: 2, gridH: 1, rotation: 0, destructible: false });
        markUsed(used, col, row, 2, 1);
      }
    }
  }
  for (let row = 0; row < ROWS - 1; row++) {
    for (let col = 0; col < COLS; col++) {
      if (canPack(grid, used, col, row, 1, 2)) {
        placements.push({ kind: "medium", col, row, gridW: 1, gridH: 2, rotation: 90, destructible: false });
        markUsed(used, col, row, 1, 2);
      }
    }
  }

  // 剩余孤立墙格无法并入结构墙体，统一转为可破坏门，
  // 避免出现「外观相同但不可破坏」的 1×1 障碍；
  // 但血量翻倍，使其明显比蓝图门洞更难拆除。
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (grid[row][col] === "wall" && !used[row][col]) {
        placements.push({
          kind: "small", col, row, gridW: 1, gridH: 1,
          rotation: 0, destructible: true, hpMultiplier: 2,
        });
        used[row][col] = true;
      }
    }
  }

  return placements.map((placement, index) => createObstacle(placement, config, index));
}

function canPack(
  grid: SemanticGrid,
  used: boolean[][],
  col: number,
  row: number,
  width: number,
  height: number
): boolean {
  for (let dr = 0; dr < height; dr++) {
    for (let dc = 0; dc < width; dc++) {
      if (grid[row + dr]?.[col + dc] !== "wall" || used[row + dr][col + dc]) return false;
    }
  }
  return true;
}

function markUsed(used: boolean[][], col: number, row: number, width: number, height: number): void {
  for (let dr = 0; dr < height; dr++) {
    for (let dc = 0; dc < width; dc++) used[row + dr][col + dc] = true;
  }
}

function createObstacle(
  placement: ObstaclePlacement,
  config: ThemeConfig,
  index: number
): ObstacleSnapshot {
  const template = config.obstacles[placement.kind];
  const maxHp = template.maxHp * (placement.hpMultiplier ?? 1);
  return {
    obstacleId: `obs_${index}`,
    x: placement.col * O,
    y: placement.row * O,
    width: placement.gridW * O,
    height: placement.gridH * O,
    rotation: placement.rotation,
    type: template.name,
    destructible: placement.destructible,
    hp: placement.destructible ? maxHp : undefined,
    maxHp: placement.destructible ? maxHp : undefined,
  };
}

export function validateGeneratedMap(obstacles: ObstacleSnapshot[]): MapValidationResult {
  const issues: string[] = [];
  const blocked = buildBlockedGrid(obstacles);
  const occupied = new Set<string>();

  for (const obstacle of obstacles) {
    const col = Math.floor(obstacle.x / O);
    const row = Math.floor(obstacle.y / O);
    const width = Math.ceil(obstacle.width / O);
    const height = Math.ceil(obstacle.height / O);
    if (col < 0 || row < 0 || col + width > COLS || row + height > ROWS) {
      issues.push(`障碍物 ${obstacle.obstacleId} 越界`);
      continue;
    }
    for (let dr = 0; dr < height; dr++) {
      for (let dc = 0; dc < width; dc++) {
        const key = `${col + dc},${row + dr}`;
        if (occupied.has(key)) issues.push(`网格 ${key} 存在障碍物重叠`);
        occupied.add(key);
      }
    }
  }

  const metrics = calculateMetrics(blocked, obstacles);
  if (!allSpawnsConnected(blocked)) issues.push("出生点之间不存在基础连通路线");
  if (!hasTwoSpawnExits(blocked)) issues.push("至少一个出生点不足两个离场方向");
  if (!metrics.redundantSpawnRoutes) issues.push("至少一个出生点到中央不足两条首段不同路线");
  if (metrics.blockedRatio < 0.25 || metrics.blockedRatio > 0.4) {
    issues.push(`阻塞率 ${(metrics.blockedRatio * 100).toFixed(1)}% 超出 25%~40%`);
  }
  if (metrics.wallChains < 4) issues.push(`连续墙链仅 ${metrics.wallChains} 条`);
  if (metrics.sightLineP95 > 9) issues.push(`视线 P95 为 ${metrics.sightLineP95} 格，开放区过大`);
  if (metrics.longestSightLine >= COLS) issues.push("存在横贯全图的无遮挡视线");
  if (metrics.deadEnds > 6) issues.push(`无效死角过多：${metrics.deadEnds}`);

  return {
    valid: issues.length === 0,
    issues,
    obstacleCount: obstacles.length,
    destructibleCount: obstacles.filter((obstacle) => obstacle.destructible).length,
    metrics,
  };
}

function calculateMetrics(blocked: boolean[][], obstacles: ObstacleSnapshot[]): MapMetrics {
  const blockedCells = blocked.flat().filter(Boolean).length;
  const sightLines = collectSightLines(blocked).sort((a, b) => a - b);
  return {
    blockedRatio: blockedCells / (COLS * ROWS),
    wallChains: countWallChains(blocked),
    isolatedCells: countIsolatedCells(blocked),
    destructibleDoors: obstacles.filter((obstacle) => obstacle.destructible).length,
    longestSightLine: sightLines.at(-1) ?? 0,
    sightLineP95: sightLines[Math.floor((sightLines.length - 1) * 0.95)] ?? 0,
    deadEnds: countDeadEnds(blocked),
    redundantSpawnRoutes: hasRedundantSpawnRoutes(blocked),
  };
}

function buildBlockedGrid(obstacles: ObstacleSnapshot[]): boolean[][] {
  const blocked = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
  for (const obstacle of obstacles) {
    const col = Math.floor(obstacle.x / O);
    const row = Math.floor(obstacle.y / O);
    const width = Math.ceil(obstacle.width / O);
    const height = Math.ceil(obstacle.height / O);
    for (let dr = 0; dr < height; dr++) {
      for (let dc = 0; dc < width; dc++) {
        if (blocked[row + dr]?.[col + dc] !== undefined) blocked[row + dr][col + dc] = true;
      }
    }
  }
  return blocked;
}

function allSpawnsConnected(blocked: boolean[][]): boolean {
  const reachable = floodFill(blocked, SPAWN_CELLS[0]);
  return SPAWN_CELLS.every(({ col, row }) => reachable[row][col]);
}

function hasTwoSpawnExits(blocked: boolean[][]): boolean {
  return SPAWN_CELLS.every((spawn) => openNeighbors(blocked, spawn).length >= 2);
}

function hasRedundantSpawnRoutes(blocked: boolean[][]): boolean {
  return SPAWN_CELLS.every((spawn) => {
    const validFirstSteps = openNeighbors(blocked, spawn).filter((firstStep) => {
      const testGrid = blocked.map((row) => [...row]);
      // 禁止从出生格转向其他首步，验证该首步自身是否能到中央。
      for (const neighbor of openNeighbors(blocked, spawn)) {
        if (neighbor.col !== firstStep.col || neighbor.row !== firstStep.row) {
          testGrid[neighbor.row][neighbor.col] = true;
        }
      }
      const reachable = floodFill(testGrid, firstStep);
      return TARGET_CELLS.some(({ col, row }) => !testGrid[row][col] && reachable[row][col]);
    });
    return validFirstSteps.length >= 2;
  });
}

function floodFill(blocked: boolean[][], start: CellPoint): boolean[][] {
  const visited = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
  if (blocked[start.row]?.[start.col]) return visited;
  const queue: CellPoint[] = [start];
  visited[start.row][start.col] = true;
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const next of openNeighbors(blocked, current)) {
      if (!visited[next.row][next.col]) {
        visited[next.row][next.col] = true;
        queue.push(next);
      }
    }
  }
  return visited;
}

function openNeighbors(blocked: boolean[][], point: CellPoint): CellPoint[] {
  const result: CellPoint[] = [];
  for (const [dc, dr] of DIRECTIONS) {
    const col = point.col + dc;
    const row = point.row + dr;
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS && !blocked[row][col]) {
      result.push({ col, row });
    }
  }
  return result;
}

function countWallChains(blocked: boolean[][]): number {
  let chains = 0;
  for (let row = 0; row < ROWS; row++) {
    let run = 0;
    for (let col = 0; col <= COLS; col++) {
      if (col < COLS && blocked[row][col]) run++;
      else {
        if (run >= 3) chains++;
        run = 0;
      }
    }
  }
  for (let col = 0; col < COLS; col++) {
    let run = 0;
    for (let row = 0; row <= ROWS; row++) {
      if (row < ROWS && blocked[row][col]) run++;
      else {
        if (run >= 3) chains++;
        run = 0;
      }
    }
  }
  return chains;
}

function countIsolatedCells(blocked: boolean[][]): number {
  let count = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (blocked[row][col] && DIRECTIONS.every(([dc, dr]) => !blocked[row + dr]?.[col + dc])) count++;
    }
  }
  return count;
}

function countDeadEnds(blocked: boolean[][]): number {
  let count = 0;
  for (let row = 1; row < ROWS - 1; row++) {
    for (let col = 1; col < COLS - 1; col++) {
      if (!blocked[row][col] && openNeighbors(blocked, { col, row }).length <= 1) count++;
    }
  }
  return count;
}

function collectSightLines(blocked: boolean[][]): number[] {
  const lengths: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    let run = 0;
    for (let col = 0; col <= COLS; col++) {
      if (col < COLS && !blocked[row][col]) run++;
      else {
        if (run > 0) lengths.push(run);
        run = 0;
      }
    }
  }
  for (let col = 0; col < COLS; col++) {
    let run = 0;
    for (let row = 0; row <= ROWS; row++) {
      if (row < ROWS && !blocked[row][col]) run++;
      else {
        if (run > 0) lengths.push(run);
        run = 0;
      }
    }
  }
  return lengths;
}

export function mapToAscii(obstacles: ObstacleSnapshot[]): string {
  const chars = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => "·"));
  for (const obstacle of obstacles) {
    const col = Math.floor(obstacle.x / O);
    const row = Math.floor(obstacle.y / O);
    const width = Math.ceil(obstacle.width / O);
    const height = Math.ceil(obstacle.height / O);
    for (let dr = 0; dr < height; dr++) {
      for (let dc = 0; dc < width; dc++) chars[row + dr][col + dc] = obstacle.destructible ? "◇" : "■";
    }
  }
  for (const spawn of SPAWN_CELLS) chars[spawn.row][spawn.col] = "S";
  for (const target of TARGET_CELLS) {
    if (chars[target.row][target.col] === "·") chars[target.row][target.col] = "C";
  }
  return chars.map((row) => row.join(" ")).join("\n");
}
