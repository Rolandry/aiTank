import { GAME_CONFIG, POWERUP_CONFIG } from "../types/protocol";
import type {
  WorldSnapshot,
  PlayerSnapshot,
  BulletSnapshot,
  PowerupSnapshot,
} from "../types/protocol";
import { getAsset, FALLBACK_COLORS } from "./assets";
import { ExplosionManager } from "./explosion";

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
  readonly explosions = new ExplosionManager();

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

  render(snapshot: WorldSnapshot): void {
    this.clear(snapshot.mapTheme);
    this.renderObstacles(snapshot.obstacles);
    this.renderPowerups(snapshot.powerups ?? []);
    this.renderTanks(snapshot.players);
    this.renderBullets(snapshot.bullets);
    this.explosions.render(this.ctx);
    this.renderHUD(snapshot);
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
    const pulse = 0.85 + Math.sin(Date.now() / 220) * 0.15;

    for (const powerup of powerups) {
      const config = POWERUP_CONFIG[powerup.type];
      const radius = (powerup.size / 2) * pulse;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(powerup.x, powerup.y, radius + 4, 0, Math.PI * 2);
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(powerup.x, powerup.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = config?.color ?? "#ffffff";
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      this.ctx.stroke();

      this.ctx.font = "bold 12px Arial";
      this.ctx.fillStyle = "#1b1b1b";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(config?.label.slice(0, 1) ?? "?", powerup.x, powerup.y);
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
