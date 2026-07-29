import { PLAYER_COLORS } from "../types/protocol";

const assets = new Map<string, HTMLImageElement>();
let loadPromise: Promise<void> | null = null;

function getAssetPaths(): Array<{ key: string; path: string }> {
  const paths: Array<{ key: string; path: string }> = [];

  // 坦克：每色1张（默认朝上），渲染时旋转
  for (const color of PLAYER_COLORS) {
    paths.push({
      key: `tank_${color}`,
      path: `/assets/tanks/tank_${color}.png`,
    });
  }

  // 障碍物（默认 + 4主题×3尺寸 = 12种）
  paths.push({ key: "wall", path: "/assets/obstacles/wall_brick.png" });
  paths.push({ key: "obstacle_grass_jungle_tree_1x1", path: "/assets/obstacles/obstacle_grass_jungle_tree_1x1.png" });
  paths.push({ key: "obstacle_grass_jungle_rock_2x1", path: "/assets/obstacles/obstacle_grass_jungle_rock_2x1.png" });
  paths.push({ key: "obstacle_grass_jungle_crate_2x2", path: "/assets/obstacles/obstacle_grass_jungle_crate_2x2.png" });
  paths.push({ key: "obstacle_desert_gobi_stone_1x1", path: "/assets/obstacles/obstacle_desert_gobi_stone_1x1.png" });
  paths.push({ key: "obstacle_desert_gobi_ruins_2x1", path: "/assets/obstacles/obstacle_desert_gobi_ruins_2x1.png" });
  paths.push({ key: "obstacle_desert_gobi_dune_2x2", path: "/assets/obstacles/obstacle_desert_gobi_dune_2x2.png" });
  paths.push({ key: "obstacle_snow_tundra_ice_1x1", path: "/assets/obstacles/obstacle_snow_tundra_ice_1x1.png" });
  paths.push({ key: "obstacle_snow_tundra_snowblock_2x1", path: "/assets/obstacles/obstacle_snow_tundra_snowblock_2x1.png" });
  paths.push({ key: "obstacle_snow_tundra_crate_2x2", path: "/assets/obstacles/obstacle_snow_tundra_crate_2x2.png" });
  paths.push({ key: "obstacle_city_ruins_steel_1x1", path: "/assets/obstacles/obstacle_city_ruins_steel_1x1.png" });
  paths.push({ key: "obstacle_city_ruins_wall_2x1", path: "/assets/obstacles/obstacle_city_ruins_wall_2x1.png" });
  paths.push({ key: "obstacle_city_ruins_barricade_2x2", path: "/assets/obstacles/obstacle_city_ruins_barricade_2x2.png" });

  // 子弹
  paths.push({ key: "bullet", path: "/assets/bullets/bullet.png" });

  // 爆炸帧（4个独立文件）
  for (let i = 1; i <= 4; i++) {
    const num = String(i).padStart(2, "0");
    paths.push({
      key: `explosion_${i}`,
      path: `/assets/effects/explosion_frame_${num}.png`,
    });
  }

  // 地图背景
  paths.push({
    key: "map_tile",
    path: "/assets/maps/map_grass_jungle_tile.png",
  });

  return paths;
}

export function loadAssets(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const paths = getAssetPaths();
    let completed = 0;

    for (const { key, path } of paths) {
      const img = new Image();
      img.onload = () => {
        assets.set(key, img);
        completed++;
        if (completed === paths.length) resolve();
      };
      img.onerror = () => {
        console.warn(`素材加载失败: ${path}，使用降级渲染`);
        completed++;
        if (completed === paths.length) resolve();
      };
      img.src = path;
    }
  });

  return loadPromise;
}

export function getAsset(key: string): HTMLImageElement | null {
  return assets.get(key) ?? null;
}

export const FALLBACK_COLORS: Record<string, string> = {
  red: "#E53935",
  blue: "#1E88E5",
  green: "#43A047",
  yellow: "#FDD835",
  wall: "#7f8c8d",
  bullet: "#FFEB3B",
  explosion: "#e67e22",
};
