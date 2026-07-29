import { GAME_CONFIG } from "../types/protocol";
import { getAsset, FALLBACK_COLORS } from "./assets";

type Explosion = {
  x: number;
  y: number;
  startTime: number;
};

export class ExplosionManager {
  private explosions: Explosion[] = [];

  add(x: number, y: number): void {
    this.explosions.push({ x, y, startTime: Date.now() });
  }

  render(ctx: CanvasRenderingContext2D): void {
    const now = Date.now();
    const frameDuration = GAME_CONFIG.explosionFrameDurationMs;
    const totalFrames = GAME_CONFIG.explosionFrameCount;

    this.explosions = this.explosions.filter((exp) => {
      const elapsed = now - exp.startTime;
      const frame = Math.floor(elapsed / frameDuration);

      if (frame >= totalFrames) return false;

      // 加载对应帧的独立图片
      const img = getAsset(`explosion_${frame + 1}`);

      if (img) {
        ctx.drawImage(img, exp.x - 32, exp.y - 32, 64, 64);
      } else {
        // 降级：橙色圆形扩大
        const radius = 10 + frame * 8;
        ctx.fillStyle = FALLBACK_COLORS.explosion;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      return true;
    });
  }

  clear(): void {
    this.explosions = [];
  }
}
