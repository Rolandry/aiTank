import { GAME_CONFIG } from "../types/protocol";
import type {
  WorldSnapshot,
  PlayerSnapshot,
  BulletSnapshot,
} from "../types/protocol";
import { getAsset, FALLBACK_COLORS } from "./assets";
import { ExplosionManager } from "./explosion";

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
    this.clear();
    this.renderObstacles(snapshot.obstacles);
    this.renderTanks(snapshot.players);
    this.renderBullets(snapshot.bullets);
    this.explosions.render(this.ctx);
    this.renderHUD(snapshot);
  }

  private clear(): void {
    this.ctx.fillStyle = "#2c3e50";
    this.ctx.fillRect(0, 0, GAME_CONFIG.mapWidth, GAME_CONFIG.mapHeight);
  }

  private renderObstacles(obstacles: WorldSnapshot["obstacles"]): void {
    const img = getAsset("wall");
    for (const obs of obstacles) {
      if (img) {
        this.ctx.drawImage(img, obs.x, obs.y, obs.width, obs.height);
      } else {
        this.ctx.fillStyle = FALLBACK_COLORS.wall;
        this.ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      }
    }
  }

  private renderTanks(players: PlayerSnapshot[]): void {
    for (const player of players) {
      if (!player.alive) continue;

      const isMe = player.playerId === this.myPlayerId;
      const img = getAsset(`tank_${player.color}_${player.direction}`);
      const size = GAME_CONFIG.tankSize;
      const x = player.x - size / 2;
      const y = player.y - size / 2;

      if (img) {
        this.ctx.drawImage(img, x, y, size, size);
      } else {
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

      // 本地玩家白色描边
      if (isMe) {
        this.ctx.strokeStyle = "#fff";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
      }

      this.renderPlayerInfo(player, x, y);
    }
  }

  private renderPlayerInfo(
    player: PlayerSnapshot,
    x: number,
    y: number
  ): void {
    const size = GAME_CONFIG.tankSize;

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
  }

  private renderBullets(bullets: BulletSnapshot[]): void {
    const img = getAsset("bullet");
    const size = GAME_CONFIG.bulletSize;

    for (const bullet of bullets) {
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
  }
}
