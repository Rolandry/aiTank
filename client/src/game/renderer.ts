import { GAME_CONFIG, POWERUP_CONFIG } from "../types/protocol";
import type {
  WorldSnapshot,
  PlayerSnapshot,
  BulletSnapshot,
  PowerupSnapshot,
} from "../types/protocol";
import { getAsset, FALLBACK_COLORS } from "./assets";
import { ExplosionManager } from "./explosion";
import { EffectsSystem } from "./effects";

// 方向 → 旋转角度（弧度）
const DIRECTION_ANGLE: Record<string, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};

const MAP_THEME_ASSETS: Record<string, string> = {
  grass_jungle: "map_grass_jungle",
  desert_gobi: "map_desert_gobi",
  snow_tundra: "map_snow_tundra",
  city_ruins: "map_city_ruins",
};

const MAP_THEME_FALLBACKS: Record<string, string> = {
  grass_jungle: "#476b37",
  desert_gobi: "#b9945f",
  snow_tundra: "#d6e8ef",
  city_ruins: "#5f6468",
};

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private myPlayerId: string | null = null;
  private hitFlashMap = new Map<string, number>();
  private dashEffects: Array<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startTime: number;
    color: string;
  }> = [];
  readonly explosions = new ExplosionManager();
  readonly effects = new EffectsSystem();
  private lastFrameTime = 0;
  private prevTankPositions = new Map<string, { x: number; y: number; angle: number }>();

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    canvas.width = GAME_CONFIG.mapWidth;
    canvas.height = GAME_CONFIG.mapHeight;
  }

  setMyPlayerId(id: string): void {
    this.myPlayerId = id;
  }

  flashPlayer(playerId: string): void {
    this.hitFlashMap.set(playerId, Date.now());
  }

  addDashEffect(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
    this.dashEffects.push({
      fromX,
      fromY,
      toX,
      toY,
      startTime: Date.now(),
      color,
    });
  }

  render(snapshot: WorldSnapshot): void {
    const now = Date.now();
    const dt = this.lastFrameTime ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 0.016;
    this.lastFrameTime = now;

    this.effects.setTheme(snapshot.mapTheme ?? "grass_jungle");

    // 命中卡帧：跳过整个渲染（保持上一帧画面）
    if (this.effects.isHitStopped()) {
      return;
    }

    // 屏幕震动偏移
    const shake = this.effects.getShakeOffset();

    this.ctx.save();
    this.ctx.translate(shake.x, shake.y);

    this.clear(snapshot.mapTheme);

    // 履带轨迹（在地面层）
    this.effects.renderTrackMarks(this.ctx);

    // 阴影
    this.effects.renderShadows(this.ctx, snapshot.players.filter(p => p.alive).map(p => ({
      x: p.x, y: p.y, size: p.size ?? GAME_CONFIG.tankSize,
    })));

    this.renderObstacles(snapshot.obstacles);
    this.renderPowerups(snapshot.powerups ?? []);
    this.renderDashEffects(snapshot);

    // 更新履带轨迹（检测移动的坦克）
    this.updateTankTracks(snapshot.players);

    // 子弹拖尾
    this.effects.renderBulletTrails(this.ctx, snapshot.bullets);
    snapshot.bullets.forEach(b => this.effects.updateBulletTrail(b.bulletId, b.x, b.y));

    this.renderTanks(snapshot.players);
    this.renderBullets(snapshot.bullets);
    this.explosions.render(this.ctx);
    this.effects.renderParticles(this.ctx, dt);

    // 环境光（爆炸闪光）
    this.effects.renderAmbientLights(this.ctx);

    // 天气粒子（最上层）
    this.effects.renderWeather(this.ctx, dt);

    this.renderHUD(snapshot);
    this.ctx.restore();
  }

  private updateTankTracks(players: PlayerSnapshot[]): void {
    for (const player of players) {
      if (!player.alive) continue;
      const size = player.size ?? GAME_CONFIG.tankSize;
      const angle = DIRECTION_ANGLE[player.direction] ?? 0;
      const prev = this.prevTankPositions.get(player.playerId);
      if (prev) {
        const dist = Math.hypot(player.x - prev.x, player.y - prev.y);
        if (dist > 4) {
          this.effects.addTrackMark(player.x, player.y, angle);
        }
      }
      this.prevTankPositions.set(player.playerId, { x: player.x, y: player.y, angle });
    }
  }

  private clear(mapTheme = "grass_jungle"): void {
    const assetKey = MAP_THEME_ASSETS[mapTheme] ?? MAP_THEME_ASSETS.grass_jungle;
    const tile = getAsset(assetKey);
    if (tile) {
      const tileSize = 64;
      for (let x = 0; x < GAME_CONFIG.mapWidth; x += tileSize) {
        for (let y = 0; y < GAME_CONFIG.mapHeight; y += tileSize) {
          this.ctx.drawImage(tile, x, y, tileSize, tileSize);
        }
      }
    } else {
      this.ctx.fillStyle = MAP_THEME_FALLBACKS[mapTheme] ?? MAP_THEME_FALLBACKS.grass_jungle;
      this.ctx.fillRect(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
    }
  }

  private renderDashEffects(snapshot: WorldSnapshot): void {
    const now = Date.now();
    const DASH_DURATION = 300;

    this.dashEffects = this.dashEffects.filter((dash) => {
      const elapsed = now - dash.startTime;
      if (elapsed >= DASH_DURATION) return false;

      const t = elapsed / DASH_DURATION;
      const size = GAME_CONFIG.tankSize;

      // 残影拖尾：从 from 到 to 的渐变线
      const alpha = (1 - t) * 0.6;
      this.ctx.strokeStyle = dash.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.lineWidth = size * 0.4;
      this.ctx.lineCap = "round";
      this.ctx.beginPath();
      this.ctx.moveTo(dash.fromX, dash.fromY);
      this.ctx.lineTo(dash.toX, dash.toY);
      this.ctx.stroke();

      // 起点残影方块
      this.ctx.globalAlpha = alpha * 0.5;
      this.ctx.fillStyle = dash.color;
      this.ctx.fillRect(dash.fromX - size / 2, dash.fromY - size / 2, size, size);

      // 终点闪光
      if (t < 0.3) {
        const flashAlpha = (1 - t / 0.3) * 0.8;
        this.ctx.globalAlpha = flashAlpha;
        this.ctx.strokeStyle = "#fff";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(dash.toX - size / 2 - 3, dash.toY - size / 2 - 3, size + 6, size + 6);
      }

      this.ctx.globalAlpha = 1;
      return true;
    });
  }

  private renderObstacles(obstacles: WorldSnapshot["obstacles"]): void {
    // 障碍物类型 → 素材映射
    const OBSTACLE_ASSETS: Record<string, string> = {
      grass_jungle_tree: "obstacle_grass_jungle_tree_1x1",
      grass_jungle_rock: "obstacle_grass_jungle_rock_2x1",
      grass_jungle_crate: "obstacle_grass_jungle_crate_2x2",
      desert_gobi_stone: "obstacle_desert_gobi_stone_1x1",
      desert_gobi_ruins: "obstacle_desert_gobi_ruins_2x1",
      desert_gobi_dune: "obstacle_desert_gobi_dune_2x2",
      snow_tundra_ice: "obstacle_snow_tundra_ice_1x1",
      snow_tundra_snowblock: "obstacle_snow_tundra_snowblock_2x1",
      snow_tundra_crate: "obstacle_snow_tundra_crate_2x2",
      city_ruins_steel: "obstacle_city_ruins_steel_1x1",
      city_ruins_wall: "obstacle_city_ruins_wall_2x1",
      city_ruins_barricade: "obstacle_city_ruins_barricade_2x2",
    };

    // 障碍物类型 → 降级颜色
    const OBSTACLE_COLORS: Record<string, string> = {
      grass_jungle_tree: "#228B22",
      grass_jungle_rock: "#808080",
      grass_jungle_crate: "#8B4513",
      desert_gobi_stone: "#a0826d",
      desert_gobi_ruins: "#c2a170",
      desert_gobi_dune: "#deb887",
      snow_tundra_ice: "#b0e0e6",
      snow_tundra_snowblock: "#f0f8ff",
      snow_tundra_crate: "#4682b4",
      city_ruins_steel: "#71797e",
      city_ruins_wall: "#8b7355",
      city_ruins_barricade: "#5f5f5f",
    };

    for (const obs of obstacles) {
      const type = obs.type || "grass_jungle_tree";
      const assetKey = OBSTACLE_ASSETS[type];
      const img = getAsset(assetKey);

      if (img) {
        if (obs.rotation === 90) {
          this.ctx.save();
          this.ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);
          this.ctx.rotate(Math.PI / 2);
          this.ctx.drawImage(img, -obs.height / 2, -obs.width / 2, obs.height, obs.width);
          this.ctx.restore();
        } else {
          this.ctx.drawImage(img, obs.x, obs.y, obs.width, obs.height);
        }
      } else {
        // 降级：不同类型用不同颜色
        this.ctx.fillStyle = OBSTACLE_COLORS[type] || FALLBACK_COLORS.wall;
        this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      }

      // 可破坏障碍物显示血条
      if (obs.destructible && obs.hp !== undefined && obs.maxHp !== undefined) {
        this.renderObstacleHp(obs.x, obs.y, obs.width, obs.hp, obs.maxHp);
      }

      // 可破坏障碍物添加视觉标记（白色边框）
      if (obs.destructible) {
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      }
    }
  }

  private renderObstacleHp(
    x: number,
    y: number,
    width: number,
    hp: number,
    maxHp: number
  ): void {
    const barWidth = width;
    const barHeight = 3;
    const hpPercent = hp / maxHp;

    // 背景
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(x, y - 6, barWidth, barHeight);

    // 血条
    this.ctx.fillStyle = hpPercent > 0.5 ? "#2ecc71" : "#e74c3c";
    this.ctx.fillRect(x, y - 6, barWidth * hpPercent, barHeight);
  }

  // 技能球：脉动光环 + 分类颜色 + 效果首字
  private renderPowerups(powerups: PowerupSnapshot[]): void {
    const now = Date.now();

    for (const powerup of powerups) {
      const config = POWERUP_CONFIG[powerup.type];
      const color = config?.color ?? "#ffffff";
      const label = config?.label ?? "?";
      const baseRadius = powerup.size / 2;
      const pulse = 0.88 + Math.sin(now / 250 + powerup.x * 0.01) * 0.12;
      const radius = baseRadius * pulse;
      const float = Math.sin(now / 400 + powerup.y * 0.01) * 2;
      const cy = powerup.y + float;

      this.ctx.save();

      // 外发光
      const glowGrad = this.ctx.createRadialGradient(
        powerup.x, cy, 0,
        powerup.x, cy, radius * 2.5
      );
      glowGrad.addColorStop(0, color + "66");
      glowGrad.addColorStop(0.5, color + "22");
      glowGrad.addColorStop(1, "transparent");
      this.ctx.fillStyle = glowGrad;
      this.ctx.fillRect(
        powerup.x - radius * 2.5, cy - radius * 2.5,
        radius * 5, radius * 5
      );

      // 阴影
      this.ctx.beginPath();
      this.ctx.ellipse(powerup.x, powerup.y + baseRadius * 0.7, baseRadius * 0.7, baseRadius * 0.25, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      this.ctx.fill();

      // 旋转光环
      this.ctx.translate(powerup.x, cy);
      this.ctx.rotate(now / 800);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, radius + 5, 0, Math.PI * 1.4);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = 0.6;
      this.ctx.stroke();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = 1;

      // 主体球体（径向渐变）
      this.ctx.beginPath();
      this.ctx.arc(powerup.x, cy, radius, 0, Math.PI * 2);
      const ballGrad = this.ctx.createRadialGradient(
        powerup.x - radius * 0.3, cy - radius * 0.3, 0,
        powerup.x, cy, radius
      );
      ballGrad.addColorStop(0, "#ffffff");
      ballGrad.addColorStop(0.3, color);
      ballGrad.addColorStop(1, color);
      this.ctx.fillStyle = ballGrad;
      this.ctx.fill();

      // 高光
      this.ctx.beginPath();
      this.ctx.arc(powerup.x - radius * 0.25, cy - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      this.ctx.fill();

      // 白色描边
      this.ctx.beginPath();
      this.ctx.arc(powerup.x, cy, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // 标签文字（球体色加深做底，白色做面）
      this.ctx.font = "bold 13px Arial";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      // 底层：球体色加深
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      this.ctx.fillText(label.slice(0, 1), powerup.x, cy + 1);
      // 面层：纯白
      this.ctx.fillStyle = "#fff";
      this.ctx.fillText(label.slice(0, 1), powerup.x, cy);

      this.ctx.restore();
      this.ctx.textBaseline = "alphabetic";
    }
  }

  private renderTanks(players: PlayerSnapshot[]): void {
    for (const player of players) {
      if (!player.alive) continue;

      const isMe = player.playerId === this.myPlayerId;
      // 尺寸由服务端下发，shrink 时与碰撞体积一致
      const size = player.size ?? GAME_CONFIG.tankSize;
      const x = player.x - size / 2;
      const y = player.y - size / 2;

      const img = getAsset(`tank_${player.color}`);
      const angle = DIRECTION_ANGLE[player.direction] ?? 0;

      if (img) {
        // 旋转绘制坦克（素材默认朝上）
        this.ctx.save();
        this.ctx.translate(player.x, player.y);
        this.ctx.rotate(angle);
        this.ctx.drawImage(img, -size / 2, -size / 2, size, size);
        this.ctx.restore();
      } else {
        // 降级：有色矩形
        this.ctx.fillStyle = FALLBACK_COLORS[player.color] ?? "#999";
        this.ctx.fillRect(x, y, size, size);
      }

      // 命中闪红
      const flashTime = this.hitFlashMap.get(player.playerId);
      if (
        flashTime &&
        Date.now() - flashTime < GAME_CONFIG.hitFlashDurationMs
      ) {
        this.ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
        this.ctx.fillRect(x, y, size, size);
      }

      // 护盾环
      if (player.shield > 0) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, size / 2 + 6, 0, Math.PI * 2);
        this.ctx.strokeStyle = "rgba(201, 182, 255, 0.9)";
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        this.ctx.restore();
      }

      // 本地玩家白色描边
      if (isMe) {
        this.ctx.strokeStyle = "#fff";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
      }

      this.renderPlayerInfo(player, x, y, size);
      this.renderKillMarkers(player, x, y);
    }
  }

  // 击杀标记：坦克上方按 kills 数量渲染一排与自身颜色匹配的图标
  private renderKillMarkers(
    player: PlayerSnapshot,
    x: number,
    y: number
  ): void {
    if (!player.kills || player.kills <= 0) return;

    const size = GAME_CONFIG.tankSize;
    const iconSize = 12;
    const gap = 2;
    const maxIcons = 8;
    const shown = Math.min(player.kills, maxIcons);
    const rowWidth = shown * (iconSize + gap) - gap;
    const startX = x + size / 2 - rowWidth / 2;
    const iconY = y - 32 - iconSize; // 昵称再上方

    const img = getAsset(`kill_marker_${player.color}`);
    for (let i = 0; i < shown; i++) {
      const ix = startX + i * (iconSize + gap);
      if (img) {
        this.ctx.drawImage(img, ix, iconY, iconSize, iconSize);
      } else {
        // 降级：与坦克同色的实心圆点
        this.ctx.fillStyle = FALLBACK_COLORS[player.color] ?? "#fff";
        this.ctx.beginPath();
        this.ctx.arc(
          ix + iconSize / 2,
          iconY + iconSize / 2,
          iconSize / 2,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }
    }

    // 超过 maxIcons 时用 ×N 表示
    if (player.kills > maxIcons) {
      this.ctx.font = "bold 11px Arial";
      this.ctx.fillStyle = "#fff";
      this.ctx.textAlign = "left";
      this.ctx.fillText(
        `×${player.kills}`,
        startX + rowWidth + 4,
        iconY + iconSize
      );
    }
  }

  private renderPlayerInfo(
    player: PlayerSnapshot,
    x: number,
    y: number,
    size: number
  ): void {
    // 昵称
    this.ctx.font = "12px Arial";
    this.ctx.fillStyle = "#fff";
    this.ctx.textAlign = "center";
    this.ctx.fillText(player.nickname, x + size / 2, y - 18);

    // 血条背景
    const barWidth = size;
    const barHeight = 4;
    const hpPercent = player.hp / GAME_CONFIG.maxHp;

    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(x, y - 12, barWidth, barHeight);

    // 血条
    this.ctx.fillStyle =
      hpPercent > 0.5 ? "#2ecc71" : hpPercent > 0.25 ? "#f39c12" : "#e74c3c";
    this.ctx.fillRect(x, y - 12, barWidth * hpPercent, barHeight);

    // 生效中的效果小点
    const effects = player.effects ?? [];
    effects.forEach((effect, index) => {
      const config = POWERUP_CONFIG[effect.type];
      this.ctx.fillStyle = config?.color ?? "#fff";
      this.ctx.beginPath();
      this.ctx.arc(x + 4 + index * 8, y - 24, 3, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  private renderBullets(bullets: BulletSnapshot[]): void {
    const img = getAsset("bullet");

    for (const bullet of bullets) {
      // 尺寸由服务端下发，bigshot 时与碰撞体积一致
      const size = bullet.size ?? GAME_CONFIG.bulletSize;
      const x = bullet.x - size / 2;
      const y = bullet.y - size / 2;

      if (img) {
        this.ctx.drawImage(img, x, y, size, size);
      } else {
        this.ctx.fillStyle = FALLBACK_COLORS.bullet;
        this.ctx.beginPath();
        this.ctx.arc(bullet.x, bullet.y, size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // 强袭弹附加光晕
      if (bullet.damage > 1) {
        this.ctx.strokeStyle = "rgba(255, 123, 84, 0.9)";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(bullet.x, bullet.y, size / 2 + 3, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  private renderHUD(snapshot: WorldSnapshot): void {
    // 剩余时间
    const seconds = Math.ceil(snapshot.remainingTimeMs / 1000);
    this.ctx.font = "bold 24px Arial";
    this.ctx.fillStyle = "#fff";
    this.ctx.textAlign = "center";
    this.ctx.fillText(`${seconds}s`, GAME_CONFIG.mapWidth / 2, 30);

    // 房间号
    this.ctx.font = "14px Arial";
    this.ctx.textAlign = "right";
    this.ctx.fillText(
      `房间: ${snapshot.roomId}`,
      GAME_CONFIG.mapWidth - 10,
      25
    );

    this.renderSkillHUD(snapshot);
  }

  // 左下角：冲刺冷却与自身生效效果
  private renderSkillHUD(snapshot: WorldSnapshot): void {
    const me = snapshot.players.find((p) => p.playerId === this.myPlayerId);
    if (!me) return;

    const baseY = GAME_CONFIG.mapHeight - 16;
    const cooldown = me.dashCooldownMs ?? 0;

    this.ctx.font = "bold 14px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = cooldown > 0 ? "#9aa0a6" : "#8affc1";
    this.ctx.fillText(
      cooldown > 0
        ? `冲刺（Shift）${(cooldown / 1000).toFixed(1)}s`
        : "冲刺（Shift）就绪",
      12,
      baseY
    );

    const effects = me.effects ?? [];
    effects.forEach((effect, index) => {
      const config = POWERUP_CONFIG[effect.type];
      this.ctx.fillStyle = config?.color ?? "#fff";
      this.ctx.font = "12px Arial";
      this.ctx.fillText(
        `${config?.label ?? effect.type} ${Math.ceil(effect.remainingMs / 1000)}s`,
        12 + index * 78,
        baseY - 20
      );
    });
  }
}
