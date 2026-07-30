import { createCanvas } from "canvas";
import { writeFileSync } from "fs";
import { join } from "path";

const OUT = "/Users/luohengxu/aiTank/tank-battle-assets-2.0";

function save(canvas: ReturnType<typeof createCanvas>, path: string): void {
  writeFileSync(path, canvas.toBuffer("image/png"));
}

// Pixel drawing helper
function px(ctx: any, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ========= TANKS (64x64, Stardew Valley style) =========
function drawTank(color: string, shadowColor: string, highlightColor: string): void {
  const c = createCanvas(64, 64);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Body shadow (bottom)
  px(ctx, 14, 52, 36, 4, "rgba(0,0,0,0.2)");

  // Tracks (treads) - detailed
  px(ctx, 10, 20, 6, 28, "#3a3a3a");
  px(ctx, 48, 20, 6, 28, "#3a3a3a");
  // Track segments
  for (let i = 0; i < 7; i++) {
    px(ctx, 10, 22 + i * 4, 6, 2, "#555");
    px(ctx, 48, 22 + i * 4, 6, 2, "#555");
  }
  // Track highlights
  px(ctx, 10, 20, 6, 1, "#666");
  px(ctx, 48, 20, 6, 1, "#666");

  // Main body - rounded rectangle effect with pixel steps
  const bx = 16, by = 18, bw = 32, bh = 32;
  // Body shadow
  px(ctx, bx + 2, by + bh - 4, bw - 4, 4, shadowColor);
  // Body main
  px(ctx, bx, by, bw, bh, color);
  // Body highlight (top)
  px(ctx, bx, by, bw, 3, highlightColor);
  px(ctx, bx, by, 2, bh, highlightColor);
  // Body corners (pixel rounding)
  px(ctx, bx, by, 1, 1, shadowColor);
  px(ctx, bx + bw - 1, by, 1, 1, shadowColor);
  px(ctx, bx, by + bh - 1, 1, 1, shadowColor);
  px(ctx, bx + bw - 1, by + bh - 1, 1, 1, shadowColor);
  // Body details - rivets
  px(ctx, bx + 3, by + 3, 2, 2, shadowColor);
  px(ctx, bx + bw - 5, by + 3, 2, 2, shadowColor);
  px(ctx, bx + 3, by + bh - 5, 2, 2, shadowColor);
  px(ctx, bx + bw - 5, by + bh - 5, 2, 2, shadowColor);
  // Body stripe
  px(ctx, bx + 4, by + bh / 2 - 1, bw - 8, 1, shadowColor);

  // Turret base (circle approximation)
  const tx = 32, ty = 30, tr = 9;
  for (let dy = -tr; dy <= tr; dy++) {
    for (let dx = -tr; dx <= tr; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= tr) {
        const isHighlight = dy < -tr * 0.4 && dx < tr * 0.3;
        const isShadow = dy > tr * 0.5;
        const c = isHighlight ? highlightColor : isShadow ? shadowColor : color;
        px(ctx, tx + dx, ty + dy, 1, 1, c);
      }
    }
  }
  // Turret center detail
  px(ctx, tx - 1, ty - 1, 2, 2, shadowColor);

  // Cannon barrel (pointing up)
  px(ctx, 31, 8, 2, 16, "#212121");
  px(ctx, 30, 8, 1, 16, "#2a2a2a");
  px(ctx, 33, 8, 1, 16, "#1a1a1a");
  // Barrel tip
  px(ctx, 30, 6, 4, 3, "#1a1a1a");
  px(ctx, 30, 6, 4, 1, "#333");

  save(c, join(OUT, "tanks", `tank_${color === "#E53935" ? "red" : color === "#1E88E5" ? "blue" : color === "#43A047" ? "green" : "yellow"}.png`));
}

// ========= MAP TILES (32x32, detailed) =========
function drawTile(theme: string, baseColor: string, colors: string[], filename: string): void {
  const c = createCanvas(32, 32);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Base fill
  px(ctx, 0, 0, 32, 32, baseColor);

  // Deterministic noise pattern
  const seed = theme.length;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const hash = (x * 73856093 ^ y * 19349663 ^ seed * 83492791) & 0x7fffffff;
      const r = (hash % 1000) / 1000;
      if (r < 0.08) {
        px(ctx, x, y, 1, 1, colors[0]);
      } else if (r < 0.15) {
        px(ctx, x, y, 1, 1, colors[1]);
      } else if (r < 0.18) {
        px(ctx, x, y, 1, 1, colors[2]);
      }
    }
  }

  // Subtle border shading for depth
  px(ctx, 0, 0, 32, 1, colors[0] + "88");
  px(ctx, 0, 0, 1, 32, colors[0] + "88");

  save(c, join(OUT, "maps", filename));
}

// ========= FULL MAPS (512x384) =========
function drawFullMap(theme: string, _baseColor: string, _colors: string[], filename: string): void {
  const c = createCanvas(512, 384);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  if (theme === "grass_jungle") {
    drawGrassFullMap(ctx);
  } else if (theme === "desert_gobi") {
    drawDesertFullMap(ctx);
  } else if (theme === "snow_tundra") {
    drawSnowFullMap(ctx);
  } else if (theme === "city_ruins") {
    drawCityFullMap(ctx);
  }

  save(c, join(OUT, "full-maps", filename));
}

function hashNoise(x: number, y: number, seed: number): number {
  return ((x * 73856093 ^ y * 19349663 ^ seed * 83492791) & 0x7fffffff) % 1000 / 1000;
}

function drawGrassFullMap(ctx: any): void {
  const W = 512, H = 384;
  // Base grass gradient
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = hashNoise(x, y, 42);
      let c = "#5a9e3e";
      if (n < 0.15) c = "#6db852";
      else if (n < 0.25) c = "#4a8a32";
      else if (n < 0.30) c = "#7ac460";
      else if (n < 0.33) c = "#3d7828";
      px(ctx, x, y, 1, 1, c);
    }
  }
  // Grass blades (scattered small clusters)
  for (let i = 0; i < 300; i++) {
    const x = Math.floor(hashNoise(i, 1, 99) * W);
    const y = Math.floor(hashNoise(i, 2, 99) * H);
    px(ctx, x, y, 1, 2, "#7ac460");
    px(ctx, x + 1, y - 1, 1, 1, "#8ad470");
  }
  // Dirt patches
  for (let i = 0; i < 8; i++) {
    const cx = Math.floor(hashNoise(i, 3, 77) * W);
    const cy = Math.floor(hashNoise(i, 4, 77) * H);
    const r = 12 + Math.floor(hashNoise(i, 5, 77) * 20);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const px2 = cx + dx, py2 = cy + dy;
          if (px2 >= 0 && px2 < W && py2 >= 0 && py2 < H) {
            const n = hashNoise(px2, py2, 55);
            px(ctx, px2, py2, 1, 1, n < 0.5 ? "#9a7a4a" : "#8a6a3a");
          }
        }
      }
    }
  }
  // Small flowers
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hashNoise(i, 10, 33) * W);
    const y = Math.floor(hashNoise(i, 11, 33) * H);
    px(ctx, x, y, 1, 1, "#ffd700");
    px(ctx, x - 1, y, 1, 1, "#ffe070");
    px(ctx, x + 1, y, 1, 1, "#ffe070");
    px(ctx, x, y - 1, 1, 1, "#ffe070");
    px(ctx, x, y + 1, 1, 1, "#ffe070");
  }
}

function drawDesertFullMap(ctx: any): void {
  const W = 512, H = 384;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = hashNoise(x, y, 17);
      let c = "#e8c878";
      if (n < 0.12) c = "#f0d088";
      else if (n < 0.22) c = "#d4b46e";
      else if (n < 0.28) c = "#c2a050";
      else if (n < 0.31) c = "#f8e0a0";
      px(ctx, x, y, 1, 1, c);
    }
  }
  // Sand ripples (wavy lines)
  for (let y = 20; y < H; y += 24) {
    for (let x = 0; x < W; x++) {
      const wave = Math.sin(x / 30) * 3 + hashNoise(x, y, 5) * 4 - 2;
      px(ctx, x, Math.floor(y + wave), 1, 1, "#d4a850");
    }
  }
  // Sand dunes (large soft circles)
  for (let i = 0; i < 5; i++) {
    const cx = Math.floor(hashNoise(i, 20, 88) * W);
    const cy = Math.floor(hashNoise(i, 21, 88) * H);
    const r = 30 + Math.floor(hashNoise(i, 22, 88) * 40);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r) {
          const px2 = cx + dx, py2 = cy + dy;
          if (px2 >= 0 && px2 < W && py2 >= 0 && py2 < H) {
            if (dist < r * 0.6) px(ctx, px2, py2, 1, 1, "#f0d090");
            else px(ctx, px2, py2, 1, 1, "#e0c070");
          }
        }
      }
    }
  }
  // Small rocks scattered
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(hashNoise(i, 30, 44) * W);
    const y = Math.floor(hashNoise(i, 31, 44) * H);
    px(ctx, x, y, 2, 2, "#a89060");
    px(ctx, x + 1, y, 1, 1, "#c0a878");
  }
}

function drawSnowFullMap(ctx: any): void {
  const W = 512, H = 384;
  // Pale blue-white base, NOT pure white
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = hashNoise(x, y, 73);
      let c = "#d8e8f0";
      if (n < 0.10) c = "#e8f0f8";
      else if (n < 0.20) c = "#c8d8e8";
      else if (n < 0.28) c = "#b8c8d8";
      else if (n < 0.33) c = "#e0eef5";
      px(ctx, x, y, 1, 1, c);
    }
  }
  // Ice patches (reflective blue)
  for (let i = 0; i < 12; i++) {
    const cx = Math.floor(hashNoise(i, 40, 12) * W);
    const cy = Math.floor(hashNoise(i, 41, 12) * H);
    const r = 15 + Math.floor(hashNoise(i, 42, 12) * 25);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const px2 = cx + dx, py2 = cy + dy;
          if (px2 >= 0 && px2 < W && py2 >= 0 && py2 < H) {
            px(ctx, px2, py2, 1, 1, "#a0c8e0");
          }
        }
      }
    }
    // Ice shine
    px(ctx, cx - r / 3, cy - r / 3, 4, 2, "#e0f0ff");
  }
  // Snow drifts (white piles)
  for (let i = 0; i < 25; i++) {
    const cx = Math.floor(hashNoise(i, 50, 66) * W);
    const cy = Math.floor(hashNoise(i, 51, 66) * H);
    const r = 5 + Math.floor(hashNoise(i, 52, 66) * 10);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const px2 = cx + dx, py2 = cy + dy;
          if (px2 >= 0 && px2 < W && py2 >= 0 && py2 < H) {
            px(ctx, px2, py2, 1, 1, "#f8fbff");
          }
        }
      }
    }
  }
  // Cracks in ice
  for (let i = 0; i < 8; i++) {
    let x = Math.floor(hashNoise(i, 60, 28) * W);
    let y = Math.floor(hashNoise(i, 61, 28) * H);
    for (let s = 0; s < 20; s++) {
      x += Math.floor(hashNoise(i, s, 28) * 3) - 1;
      y += 1;
      if (x >= 0 && x < W && y >= 0 && y < H) {
        px(ctx, x, y, 1, 1, "#98b8d0");
      }
    }
  }
}

function drawCityFullMap(ctx: any): void {
  const W = 512, H = 384;
  const tileSize = 64;
  // Asphalt base
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = hashNoise(x, y, 91);
      let c = "#4a4a52";
      if (n < 0.10) c = "#52525a";
      else if (n < 0.20) c = "#42424a";
      else if (n < 0.25) c = "#5a5a62";
      else if (n < 0.28) c = "#3a3a42";
      px(ctx, x, y, 1, 1, c);
    }
  }
  // Road markings (dashed yellow center lines)
  for (let row = 0; row < 3; row++) {
    const ry = row * 128 + 64;
    for (let x = 0; x < W; x += 32) {
      px(ctx, x, ry - 1, 20, 2, "#d4a040");
    }
  }
  for (let col = 0; col < 4; col++) {
    const cx = col * 128 + 64;
    for (let y = 0; y < H; y += 32) {
      px(ctx, cx - 1, y, 2, 20, "#d4a040");
    }
  }
  // Road edge lines (white)
  for (let row = 0; row < 3; row++) {
    const ry = row * 128 + 64;
    px(ctx, 0, ry - 22, W, 1, "#aaa");
    px(ctx, 0, ry + 22, W, 1, "#aaa");
  }
  // Cracks and potholes
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(hashNoise(i, 70, 55) * W);
    const y = Math.floor(hashNoise(i, 71, 55) * H);
    const len = 2 + Math.floor(hashNoise(i, 72, 55) * 6);
    const dir = hashNoise(i, 73, 55) > 0.5;
    for (let s = 0; s < len; s++) {
      px(ctx, x + (dir ? s : 0), y + (dir ? 0 : s), 1, 1, "#2a2a30");
    }
  }
  // Potholes
  for (let i = 0; i < 15; i++) {
    const cx = Math.floor(hashNoise(i, 80, 99) * W);
    const cy = Math.floor(hashNoise(i, 81, 99) * H);
    const r = 3 + Math.floor(hashNoise(i, 82, 99) * 5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const px2 = cx + dx, py2 = cy + dy;
          if (px2 >= 0 && px2 < W && py2 >= 0 && py2 < H) {
            px(ctx, px2, py2, 1, 1, "#2a2a30");
          }
        }
      }
    }
  }
  // Scattered debris
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hashNoise(i, 90, 11) * W);
    const y = Math.floor(hashNoise(i, 91, 11) * H);
    px(ctx, x, y, 2, 1, "#6a6a72");
    px(ctx, x + 1, y, 1, 1, "#5a5a62");
  }
}

// ========= OBSTACLES =========
function drawObstacle(type: string, theme: string, w: number, h: number, filename: string): void {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Shadow
  px(ctx, 4, h - 4, w - 8, 4, "rgba(0,0,0,0.2)");

  const themeColors: Record<string, string[]> = {
    grass_jungle: ["#1a3a0e", "#2a5a1e", "#0a2a06"],
    desert_gobi: ["#7a5a30", "#8a6a3a", "#5a3a10"],
    snow_tundra: ["#5a7a90", "#7090a8", "#3a5a70"],
    city_ruins: ["#2a2a32", "#3a3a42", "#1a1a22"],
  };
  const tc = themeColors[theme] || themeColors.grass_jungle;

  if (type.includes("tree")) {
    // Tree: dark trunk + dark green canopy
    px(ctx, w / 2 - 3, h - 12, 6, 10, "#3a2a1a");
    px(ctx, w / 2 - 4, h - 14, 8, 2, "#2a1a0a");
    // Canopy - dark layered circles
    drawPixelCircle(ctx, w / 2, h / 2 - 2, Math.min(w, h) / 3, "#1a3a0e");
    drawPixelCircle(ctx, w / 2 - 3, h / 2 - 4, Math.min(w, h) / 4, "#2a5a1e");
    drawPixelCircle(ctx, w / 2 + 2, h / 2 - 3, Math.min(w, h) / 5, "#3a6a2e");
    // Highlights (small)
    px(ctx, w / 2 - 4, h / 2 - 6, 2, 2, "#4a7a3e");
  } else if (type.includes("rock") || type.includes("stone")) {
    drawPixelCircle(ctx, w / 2, h / 2, Math.min(w, h) / 2.5, tc[0]);
    drawPixelCircle(ctx, w / 2 - 2, h / 2 - 2, Math.min(w, h) / 3.5, tc[1]);
    px(ctx, w / 2 - 3, h / 2 - 3, 3, 2, tc[1] + "aa");
    // Dark cracks
    px(ctx, w / 2, h / 2 + 2, 1, 4, tc[2]);
    px(ctx, w / 2 - 3, h / 2 + 1, 2, 1, tc[2]);
  } else if (type.includes("crate") || type.includes("barricade")) {
    // Dark wooden crate
    px(ctx, 2, 2, w - 4, h - 4, "#5a3a10");
    px(ctx, 2, 2, w - 4, 3, "#6a4a20");
    px(ctx, 2, h - 5, w - 4, 2, "#3a2a00");
    // Planks
    px(ctx, 2, h / 3, w - 4, 1, "#4a3010");
    px(ctx, 2, 2 * h / 3, w - 4, 1, "#4a3010");
    // Metal corners
    px(ctx, 2, 2, 4, 4, "#888");
    px(ctx, w - 6, 2, 4, 4, "#888");
    px(ctx, 2, h - 6, 4, 4, "#666");
    px(ctx, w - 6, h - 6, 4, 4, "#666");
    // Nails
    px(ctx, 4, 4, 1, 1, "#222");
    px(ctx, w - 5, 4, 1, 1, "#222");
    px(ctx, 4, h - 5, 1, 1, "#222");
    px(ctx, w - 5, h - 5, 1, 1, "#222");
  } else if (type.includes("wall") || type.includes("ruins")) {
    // Dark brick wall
    px(ctx, 2, 2, w - 4, h - 4, "#3a2a1a");
    const brickH = 8;
    for (let y = 2; y < h - 2; y += brickH) {
      const offset = ((y / brickH) % 2) * (w / 4);
      for (let x = 2 - offset; x < w - 2; x += w / 3) {
        px(ctx, Math.max(2, x), y, 1, brickH - 1, "#1a0a00");
      }
      px(ctx, 2, y, w - 4, 1, "#1a0a00");
    }
    px(ctx, 2, 2, w - 4, 2, "#4a3a2a");
  } else if (type.includes("dune")) {
    // Dark sand dune
    drawPixelCircle(ctx, w / 2, h * 0.7, w / 2.2, "#8a6a3a");
    drawPixelCircle(ctx, w / 2 - 4, h * 0.65, w / 2.8, "#9a7a4a");
    drawPixelCircle(ctx, w / 2 + 3, h * 0.6, w / 3.5, "#aa8a5a");
    // Dark wind ripples
    px(ctx, 8, h - 8, w - 16, 1, "#7a5a20");
    px(ctx, 12, h - 4, w - 24, 1, "#7a5a20");
  } else if (type.includes("ice")) {
    // Dark ice
    drawPixelCircle(ctx, w / 2, h / 2, Math.min(w, h) / 2.5, "#5a7a90");
    drawPixelCircle(ctx, w / 2 - 2, h / 2 - 2, Math.min(w, h) / 3.5, "#7090a8");
    // Ice shine
    px(ctx, w / 2 - 4, h / 2 - 4, 3, 2, "#a0c0d0");
    px(ctx, w / 2 + 3, h / 2 + 2, 2, 1, "#a0c0d0");
    // Dark cracks
    px(ctx, w / 2, h / 2 - 3, 1, 5, "#3a5a70");
  } else if (type.includes("snowblock")) {
    // Dark snow block
    px(ctx, 2, 2, w - 4, h - 4, "#a0b8c8");
    px(ctx, 2, 2, w - 4, 3, "#b0c8d8");
    px(ctx, 2, h - 5, w - 4, 2, "#7090a0");
    // Dark edges
    px(ctx, 8, 6, 1, 1, "#8090a0");
    px(ctx, w - 10, 10, 1, 1, "#8090a0");
    px(ctx, w / 2, h - 10, 1, 1, "#608090");
  } else if (type.includes("steel")) {
    // Dark steel plate
    px(ctx, 2, 2, w - 4, h - 4, "#3a3a42");
    px(ctx, 2, 2, w - 4, 2, "#4a4a52");
    px(ctx, 2, h - 4, w - 4, 2, "#2a2a32");
    // Bolts
    px(ctx, 5, 5, 2, 2, "#666");
    px(ctx, w - 7, 5, 2, 2, "#666");
    px(ctx, 5, h - 7, 2, 2, "#555");
    px(ctx, w - 7, h - 7, 2, 2, "#555");
    // Dark rivet line
    px(ctx, w / 2 - 1, 4, 2, h - 8, "#2a2a32");
  } else {
    // Generic fallback
    px(ctx, 2, 2, w - 4, h - 4, tc[0]);
    px(ctx, 2, 2, w - 4, 2, tc[1]);
  }

  save(c, join(OUT, "obstacles", filename));
}

function drawPixelCircle(ctx: any, cx: number, cy: number, r: number, color: string): void {
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy <= r * r) {
        px(ctx, Math.floor(cx + dx), Math.floor(cy + dy), 1, 1, color);
      }
    }
  }
}

// ========= BULLET (12x12) =========
function drawBullet(): void {
  const c = createCanvas(12, 12);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  // Glow
  drawPixelCircle(ctx, 6, 6, 5, "#FFEB3B33");
  drawPixelCircle(ctx, 6, 6, 4, "#FFEB3B66");
  // Core
  drawPixelCircle(ctx, 6, 6, 3, "#FFFFFF");
  drawPixelCircle(ctx, 6, 6, 2, "#FFF9C4");
  // Highlight
  px(ctx, 5, 5, 2, 1, "#FFFFFF");
  // Outline
  drawPixelCircle(ctx, 6, 6, 4, "#FF5722");
  // Re-draw inner
  drawPixelCircle(ctx, 6, 6, 3, "#FFFFFF");
  drawPixelCircle(ctx, 6, 6, 2, "#FFF9C4");
  px(ctx, 5, 5, 2, 1, "#FFFFFF");

  save(c, join(OUT, "bullets", "bullet_default.png"));
}

// ========= EXPLOSION FRAMES (64x64) =========
function drawExplosion(): void {
  const frames = [
    { r: 4, colors: ["#FFFFFF"], glow: 6 },
    { r: 10, colors: ["#FFFFFF", "#FFD700", "#FF8C00"], glow: 14 },
    { r: 18, colors: ["#FF8C00", "#FF6347", "#888888"], glow: 22 },
    { r: 26, colors: ["#888888", "#666666", "#444444"], glow: 0 },
  ];

  for (let i = 0; i < 4; i++) {
    const f = frames[i];
    const c = createCanvas(64, 64);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // Glow
    if (f.glow > 0) {
      drawPixelCircle(ctx, 32, 32, f.glow, "#FFD70033");
    }

    // Main explosion
    drawPixelCircle(ctx, 32, 32, f.r, f.colors[0]);
    if (f.colors.length > 1) {
      drawPixelCircle(ctx, 30, 30, f.r * 0.7, f.colors[1]);
    }
    if (f.colors.length > 2) {
      drawPixelCircle(ctx, 28, 28, f.r * 0.4, f.colors[2]);
    }

    // Center bright spot
    if (i < 2) {
      drawPixelCircle(ctx, 32, 32, 3, "#FFFFFF");
    }

    // Debris particles for frame 2-3
    if (i === 1 || i === 2) {
      const debris = [[20, 18], [44, 20], [18, 44], [46, 46], [12, 32], [52, 32]];
      for (const [dx, dy] of debris) {
        drawPixelCircle(ctx, dx, dy, 2, f.colors[1]);
      }
    }

    save(c, join(OUT, "effects", `explosion_frame_${String(i + 1).padStart(2, "0")}.png`));
  }
}

// ========= KILL MARKERS (20x20, star only, no plate) =========
function drawKillMarker(color: string, borderColor: string, filename: string): void {
  const c = createCanvas(20, 20);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const sx = 10, sy = 10;
  // Draw 5-pointed star using filled polygon
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 - Math.PI / 2;
    const r = i % 2 === 0 ? 8 : 3.5;
    points.push([
      Math.round(sx + Math.cos(angle) * r),
      Math.round(sy + Math.sin(angle) * r),
    ]);
  }

  // Fill the star by scanning pixels inside bounding box
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if (pointInPolygon(x, y, points)) {
        px(ctx, x, y, 1, 1, color);
      }
    }
  }
  // Border/outline - draw star slightly bigger in dark color behind
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if (pointInPolygon(x, y, points) && isEdge(x, y, points)) {
        px(ctx, x, y, 1, 1, borderColor);
      }
    }
  }
  // Re-fill inner (non-edge)
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if (pointInPolygon(x, y, points) && !isEdge(x, y, points)) {
        px(ctx, x, y, 1, 1, color);
      }
    }
  }
  // Highlight
  px(ctx, 8, 7, 2, 1, "rgba(255,255,255,0.6)");

  save(c, join(OUT, "kills", filename));
}

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isEdge(x: number, y: number, poly: Array<[number, number]>): boolean {
  if (!pointInPolygon(x, y, poly)) return false;
  return !pointInPolygon(x - 1, y, poly) || !pointInPolygon(x + 1, y, poly) ||
         !pointInPolygon(x, y - 1, poly) || !pointInPolygon(x, y + 1, poly);
}

// ========= RUN ALL =========
console.log("Generating Stardew Valley style assets...");

// Tanks
drawTank("#E53935", "#8D1917", "#EF5350");
drawTank("#1E88E5", "#0D47A1", "#42A5F5");
drawTank("#43A047", "#1B5E20", "#66BB6A");
drawTank("#FDD835", "#F57F17", "#FFF176");
console.log("✓ Tanks");

// Map tiles
drawTile("grass_jungle", "#81C784", ["#A5D6A7", "#C8E6C9", "#66BB6A"], "map_grass_jungle_tile.png");
drawTile("desert_gobi", "#F4D68E", ["#FFF3CD", "#E8C878", "#D4B46E"], "map_desert_gobi_tile.png");
drawTile("snow_tundra", "#FFFFFF", ["#FAFAFA", "#F1F8E9", "#E8F5E9"], "map_snow_tundra_tile.png");
drawTile("city_ruins", "#B0BEC5", ["#CFD8DC", "#90A4AE", "#78909C"], "map_city_ruins_tile.png");
console.log("✓ Map tiles");

// Full maps
drawFullMap("grass_jungle", "#81C784", ["#A5D6A7", "#C8E6C9", "#66BB6A"], "fullmap_grass_jungle_16x12.png");
drawFullMap("desert_gobi", "#F4D68E", ["#FFF3CD", "#E8C878", "#D4B46E"], "fullmap_desert_gobi_16x12.png");
drawFullMap("snow_tundra", "#FFFFFF", ["#FAFAFA", "#F1F8E9", "#E8F5E9"], "fullmap_snow_tundra_16x12.png");
drawFullMap("city_ruins", "#B0BEC5", ["#CFD8DC", "#90A4AE", "#78909C"], "fullmap_city_ruins_16x12.png");
console.log("✓ Full maps");

// Obstacles (12 files, 4 themes x 3 sizes)
drawObstacle("tree", "grass_jungle", 32, 32, "obstacle_grass_jungle_tree_1x1.png");
drawObstacle("rock", "grass_jungle", 64, 32, "obstacle_grass_jungle_rock_2x1.png");
drawObstacle("crate", "grass_jungle", 64, 64, "obstacle_grass_jungle_crate_2x2.png");
drawObstacle("stone", "desert_gobi", 32, 32, "obstacle_desert_gobi_stone_1x1.png");
drawObstacle("ruins", "desert_gobi", 64, 32, "obstacle_desert_gobi_ruins_2x1.png");
drawObstacle("dune", "desert_gobi", 64, 64, "obstacle_desert_gobi_dune_2x2.png");
drawObstacle("ice", "snow_tundra", 32, 32, "obstacle_snow_tundra_ice_1x1.png");
drawObstacle("snowblock", "snow_tundra", 64, 32, "obstacle_snow_tundra_snowblock_2x1.png");
drawObstacle("crate", "snow_tundra", 64, 64, "obstacle_snow_tundra_crate_2x2.png");
drawObstacle("steel", "city_ruins", 32, 32, "obstacle_city_ruins_steel_1x1.png");
drawObstacle("wall", "city_ruins", 64, 32, "obstacle_city_ruins_wall_2x1.png");
drawObstacle("barricade", "city_ruins", 64, 64, "obstacle_city_ruins_barricade_2x2.png");
console.log("✓ Obstacles");

// Bullet
drawBullet();
console.log("✓ Bullet");

// Explosion
drawExplosion();
console.log("✓ Explosion frames");

// Kill markers
drawKillMarker("#E53935", "#8D1917", "kill_marker_red.png");
drawKillMarker("#1E88E5", "#155A9C", "kill_marker_blue.png");
drawKillMarker("#43A047", "#2D6A2F", "kill_marker_green.png");
drawKillMarker("#FDD835", "#C8A823", "kill_marker_yellow.png");
console.log("✓ Kill markers");

console.log("Done! All assets saved to tank-battle-assets-2.0/");
