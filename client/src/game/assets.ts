import { PLAYER_COLORS } from "../types/protocol";

const assets = new Map<string, HTMLImageElement>();
let loadPromise: Promise<void> | null = null;

function getAssetPaths(): Array<{ key: string; path: string }> {
  const paths: Array<{ key: string; path: string }> = [];

  for (const color of PLAYER_COLORS) {
    for (const dir of ["up", "down", "left", "right"]) {
      paths.push({
        key: `tank_${color}_${dir}`,
        path: `/assets/tanks/tank_${color}_${dir}.png`,
      });
    }
  }

  paths.push({ key: "wall", path: "/assets/obstacles/wall_brick.png" });
  paths.push({ key: "bullet", path: "/assets/bullets/bullet.png" });
  paths.push({ key: "explosion", path: "/assets/effects/explosion_sheet.png" });

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
  red: "#e74c3c",
  blue: "#3498db",
  green: "#2ecc71",
  yellow: "#f1c40f",
  wall: "#7f8c8d",
  bullet: "#f39c12",
  explosion: "#e67e22",
};
