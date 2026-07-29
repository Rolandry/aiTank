import { GAME_CONFIG } from "../types/protocol";

interface TrackMark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

interface BulletTrail {
  bulletId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  startTime: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  angle: number;
}

interface AmbientLight {
  intensity: number;
  startTime: number;
  x: number;
  y: number;
  radius: number;
}

const TRACK_LIFETIME = 1500;
const BULLET_TRAIL_LIFETIME = 200;
const PARTICLE_GRAVITY = 200;

export class EffectsSystem {
  private trackMarks: TrackMark[] = [];
  private bulletTrails: Map<string, BulletTrail> = new Map();
  private particles: Particle[] = [];
  private weatherParticles: WeatherParticle[] = [];
  private ambientLights: AmbientLight[] = [];
  private currentTheme = "grass_jungle";
  private shakeTime = 0;
  private shakeIntensity = 0;
  private hitStopUntil = 0;

  setTheme(theme: string): void {
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      this.initWeather(theme);
    }
  }

  // 履带轨迹
  addTrackMark(x: number, y: number, angle: number): void {
    this.trackMarks.push({ x, y, angle, startTime: Date.now() });
    if (this.trackMarks.length > 60) this.trackMarks.shift();
  }

  // 子弹拖尾
  updateBulletTrail(bulletId: string, x: number, y: number): void {
    const prev = this.bulletTrails.get(bulletId);
    this.bulletTrails.set(bulletId, {
      bulletId,
      x,
      y,
      prevX: prev?.x ?? x,
      prevY: prev?.y ?? y,
      startTime: Date.now(),
    });
  }

  removeBulletTrail(bulletId: string): void {
    this.bulletTrails.delete(bulletId);
  }

  // 粒子飞溅
  spawnParticles(x: number, y: number, count: number, color: string, speed = 150): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = speed * (0.3 + Math.random() * 0.7);
      const life = 300 + Math.random() * 400;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color,
        gravity: PARTICLE_GRAVITY,
      });
    }
    if (this.particles.length > 300) this.particles.splice(0, this.particles.length - 300);
  }

  // 屏幕震动
  triggerShake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Date.now() + duration;
  }

  // 命中卡帧
  triggerHitStop(duration: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, Date.now() + duration);
  }

  isHitStopped(): boolean {
    return Date.now() < this.hitStopUntil;
  }

  // 环境光
  triggerAmbientLight(x: number, y: number, radius: number, duration: number): void {
    this.ambientLights.push({
      intensity: 1,
      startTime: Date.now(),
      x,
      y,
      radius,
    });
    const target = Date.now() + duration;
    this.ambientLights[this.ambientLights.length - 1].startTime = target - duration;
  }

  // 获取震动偏移
  getShakeOffset(): { x: number; y: number } {
    if (Date.now() > this.shakeTime) {
      this.shakeIntensity = 0;
      return { x: 0, y: 0 };
    }
    const remaining = this.shakeTime - Date.now();
    const decay = Math.max(0, remaining / 200);
    const intensity = this.shakeIntensity * decay;
    return {
      x: (Math.random() - 0.5) * intensity * 2,
      y: (Math.random() - 0.5) * intensity * 2,
    };
  }

  private initWeather(theme: string): void {
    this.weatherParticles = [];
    let count = 0;
    let type = "leaf";

    switch (theme) {
      case "snow_tundra":
        count = 80;
        type = "snow";
        break;
      case "desert_gobi":
        count = 60;
        type = "sand";
        break;
      case "grass_jungle":
        count = 40;
        type = "leaf";
        break;
      case "city_ruins":
        count = 35;
        type = "ember";
        break;
    }

    for (let i = 0; i < count; i++) {
      this.weatherParticles.push(this.createWeatherParticle(type));
    }
  }

  private createWeatherParticle(type: string): WeatherParticle {
    const x = Math.random() * GAME_CONFIG.mapWidth;
    const y = Math.random() * GAME_CONFIG.mapHeight;

    switch (type) {
      case "snow":
        return {
          x, y,
          vx: (Math.random() - 0.5) * 30,
          vy: 45 + Math.random() * 55,
          size: 2 + Math.random() * 3,
          alpha: 0.6 + Math.random() * 0.3,
          angle: Math.random() * Math.PI * 2,
        };
      case "sand":
        return {
          x, y: Math.random() * GAME_CONFIG.mapHeight,
          vx: 120 + Math.random() * 150,
          vy: (Math.random() - 0.5) * 25,
          size: 1 + Math.random() * 2,
          alpha: 0.3 + Math.random() * 0.3,
          angle: 0,
        };
      case "leaf":
        return {
          x, y: Math.random() * GAME_CONFIG.mapHeight,
          vx: (Math.random() - 0.5) * 50,
          vy: 30 + Math.random() * 40,
          size: 4 + Math.random() * 5,
          alpha: 0.5 + Math.random() * 0.3,
          angle: Math.random() * Math.PI * 2,
        };
      case "ember":
        return {
          x, y: GAME_CONFIG.mapHeight + Math.random() * 50,
          vx: (Math.random() - 0.5) * 18,
          vy: -30 - Math.random() * 50,
          size: 1 + Math.random() * 2,
          alpha: 0.5 + Math.random() * 0.3,
          angle: 0,
        };
      default:
        return { x, y, vx: 0, vy: 0, size: 2, alpha: 0.5, angle: 0 };
    }
  }

  // 渲染履带轨迹
  renderTrackMarks(ctx: CanvasRenderingContext2D): void {
    const now = Date.now();
    this.trackMarks = this.trackMarks.filter((mark) => {
      const elapsed = now - mark.startTime;
      if (elapsed >= TRACK_LIFETIME) return false;
      const alpha = (1 - elapsed / TRACK_LIFETIME) * 0.25;
      ctx.save();
      ctx.translate(mark.x, mark.y);
      ctx.rotate(mark.angle);
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fillRect(-12, -2, 24, 4);
      ctx.fillRect(-12, 16, 24, 4);
      ctx.restore();
      return true;
    });
  }

  // 渲染子弹拖尾
  renderBulletTrails(ctx: CanvasRenderingContext2D, bullets: Array<{ bulletId: string; x: number; y: number }>): void {
    const now = Date.now();
    const activeIds = new Set(bullets.map((b) => b.bulletId));

    for (const [id, trail] of this.bulletTrails) {
      if (!activeIds.has(id)) {
        this.bulletTrails.delete(id);
        continue;
      }
      const elapsed = now - trail.startTime;
      if (elapsed >= BULLET_TRAIL_LIFETIME) continue;

      const alpha = (1 - elapsed / BULLET_TRAIL_LIFETIME) * 0.7;
      const grad = ctx.createLinearGradient(trail.prevX, trail.prevY, trail.x, trail.y);
      grad.addColorStop(0, `rgba(255, 235, 59, 0)`);
      grad.addColorStop(1, `rgba(255, 235, 59, ${alpha})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(trail.prevX, trail.prevY);
      ctx.lineTo(trail.x, trail.y);
      ctx.stroke();
    }
  }

  // 渲染粒子
  renderParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.life -= dt * 1000;
      if (p.life <= 0) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      return true;
    });
    ctx.globalAlpha = 1;
  }

  // 渲染天气粒子
  renderWeather(ctx: CanvasRenderingContext2D, dt: number): void {
    const now = Date.now();
    for (const wp of this.weatherParticles) {
      wp.x += wp.vx * dt;
      wp.y += wp.vy * dt;
      wp.angle += dt * 2;

      if (wp.y > GAME_CONFIG.mapHeight + 20) {
        wp.y = -10;
        wp.x = Math.random() * GAME_CONFIG.mapWidth;
      }
      if (wp.y < -20) {
        wp.y = GAME_CONFIG.mapHeight + 10;
        wp.x = Math.random() * GAME_CONFIG.mapWidth;
      }
      if (wp.x > GAME_CONFIG.mapWidth + 20) wp.x = -10;
      if (wp.x < -20) wp.x = GAME_CONFIG.mapWidth + 10;

      ctx.save();
      ctx.globalAlpha = wp.alpha;

      if (this.currentTheme === "snow_tundra") {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, wp.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.currentTheme === "desert_gobi") {
        ctx.fillStyle = "#e8c887";
        ctx.fillRect(wp.x, wp.y, wp.size, 1);
      } else if (this.currentTheme === "grass_jungle") {
        ctx.translate(wp.x, wp.y);
        ctx.rotate(wp.angle);
        ctx.fillStyle = Math.random() > 0.5 ? "#4a7c2e" : "#8bbc5e";
        ctx.fillRect(-wp.size / 2, -wp.size / 2, wp.size, wp.size);
      } else if (this.currentTheme === "city_ruins") {
        ctx.fillStyle = "#ff6b35";
        ctx.shadowColor = "#ff6b35";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, wp.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // 渲染环境光
  renderAmbientLights(ctx: CanvasRenderingContext2D): void {
    const now = Date.now();
    this.ambientLights = this.ambientLights.filter((light) => {
      const elapsed = now - light.startTime;
      if (elapsed > 400) return false;
      const alpha = Math.max(0, 1 - elapsed / 400);
      const grad = ctx.createRadialGradient(
        light.x, light.y, 0,
        light.x, light.y, light.radius
      );
      grad.addColorStop(0, `rgba(255, 200, 100, ${alpha * 0.4})`);
      grad.addColorStop(1, "rgba(255, 200, 100, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
      return true;
    });
  }

  // 渲染阴影
  renderShadows(ctx: CanvasRenderingContext2D, tanks: Array<{ x: number; y: number; size: number }>): void {
    for (const tank of tanks) {
      const size = tank.size ?? GAME_CONFIG.tankSize;
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.beginPath();
      ctx.ellipse(tank.x + 3, tank.y + 4, size / 2, size / 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clear(): void {
    this.trackMarks = [];
    this.bulletTrails.clear();
    this.particles = [];
    this.ambientLights = [];
  }
}
