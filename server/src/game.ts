import { GAME_CONFIG } from "./protocol";
import type {
  PlayerInput,
  PlayerSnapshot,
  WorldSnapshot,
} from "./protocol";
import { SPAWN_POINTS } from "./map";
import {
  aabbOverlap,
  bulletRect,
  tankRect,
  hitsObstacle,
  insideMap,
  DIRECTION_VECTOR,
} from "./collision";
import type { Room } from "./room";
import type {
  Direction,
  InputState,
  ServerBullet,
  ServerPlayer,
} from "./types";

// 文档 1 第 6 节：客户端 GAME_CONFIG 未包含速度，由服务端权威定义
const TANK_SPEED = 180; // px/s
const BULLET_SPEED = 420; // px/s

export class GameWorld {
  private bullets = new Map<string, ServerBullet>();
  private bulletSeq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickTime = 0;
  private tick = 0;
  private startTime = 0;

  constructor(private room: Room) {}

  start(): void {
    const players = [...this.room.players.values()];
    players.forEach((p, i) => {
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      p.x = spawn.x;
      p.y = spawn.y;
      p.direction = spawn.direction;
      p.hp = GAME_CONFIG.maxHp;
      p.alive = true;
      p.hitCount = 0;
      p.activeBullets = 0;
      p.lastShootTime = 0;
      p.lastInputSeq = 0;
      p.input = { up: false, down: false, left: false, right: false };
    });
    this.startTime = Date.now();
    this.lastTickTime = this.startTime;
    this.timer = setInterval(() => this.step(), 1000 / GAME_CONFIG.tickRate);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  handleInput(player: ServerPlayer, msg: PlayerInput): void {
    if (this.room.status !== "playing" || !player.alive) return;
    if (msg.seq <= player.lastInputSeq) return; // 丢弃乱序/重复输入
    player.lastInputSeq = msg.seq;
    player.input = {
      up: msg.up,
      down: msg.down,
      left: msg.left,
      right: msg.right,
    };
  }

  handleShoot(player: ServerPlayer): void {
    if (this.room.status !== "playing" || !player.alive) return;
    const now = Date.now();
    if (now - player.lastShootTime < GAME_CONFIG.shootCooldownMs) return;
    if (player.activeBullets >= GAME_CONFIG.maxBulletsPerPlayer) return;
    player.lastShootTime = now;
    player.activeBullets++;
    const v = DIRECTION_VECTOR[player.direction];
    const offset = GAME_CONFIG.tankSize / 2 + GAME_CONFIG.bulletSize / 2;
    const id = `b_${this.bulletSeq++}`;
    this.bullets.set(id, {
      bulletId: id,
      ownerId: player.playerId,
      x: player.x + v.dx * offset,
      y: player.y + v.dy * offset,
      direction: player.direction,
    });
  }

  private step(): void {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.1);
    this.lastTickTime = now;
    this.tick++;

    this.moveTanks(dt);
    this.moveBullets(dt);
    this.checkGameEnd(now);

    if (this.room.status === "playing") {
      this.room.broadcast(this.buildSnapshot(now));
    }
  }

  private moveTanks(dt: number): void {
    const dist = TANK_SPEED * dt;
    for (const p of this.room.players.values()) {
      if (!p.alive || !p.connected) continue;
      const dir = this.resolveDirection(p.input);
      if (!dir) continue;
      p.direction = dir;
      const v = DIRECTION_VECTOR[dir];
      // 分轴移动：允许沿障碍物/边界滑动
      const nx = p.x + v.dx * dist;
      if (this.canPlaceTank(nx, p.y)) p.x = nx;
      const ny = p.y + v.dy * dist;
      if (this.canPlaceTank(p.x, ny)) p.y = ny;
    }
  }

  private resolveDirection(input: InputState): Direction | null {
    // 协议只传布尔值，无法获知按键先后，采用固定优先级
    if (input.up) return "up";
    if (input.down) return "down";
    if (input.left) return "left";
    if (input.right) return "right";
    return null;
  }

  private canPlaceTank(cx: number, cy: number): boolean {
    const rect = tankRect(cx, cy);
    return insideMap(rect) && !hitsObstacle(rect, this.room.obstacles);
  }

  private moveBullets(dt: number): void {
    const dist = BULLET_SPEED * dt;
    const toRemove: string[] = [];

    for (const b of this.bullets.values()) {
      const v = DIRECTION_VECTOR[b.direction];
      b.x += v.dx * dist;
      b.y += v.dy * dist;
      const rect = bulletRect(b.x, b.y);

      if (!insideMap(rect)) {
        toRemove.push(b.bulletId);
        continue;
      }
      if (hitsObstacle(rect, this.room.obstacles)) {
        // 找到被击中的障碍物
        const hitObstacle = this.findHitObstacle(rect, this.room.obstacles);
        if (hitObstacle) {
          this.handleBulletHitObstacle(b, hitObstacle);
        }
        toRemove.push(b.bulletId);
        continue;
      }
      for (const p of this.room.players.values()) {
        if (!p.alive || p.playerId === b.ownerId) continue;
        if (aabbOverlap(rect, tankRect(p.x, p.y))) {
          toRemove.push(b.bulletId);
          this.applyHit(p, b);
          break;
        }
      }
    }

    for (const id of toRemove) this.removeBullet(id);
  }

  private findHitObstacle(
    rect: { x: number; y: number; width: number; height: number },
    obstacles: typeof this.room.obstacles
  ) {
    for (const obs of obstacles) {
      if (
        rect.x < obs.x + obs.width &&
        rect.x + rect.width > obs.x &&
        rect.y < obs.y + obs.height &&
        rect.y + rect.height > obs.y
      ) {
        return obs;
      }
    }
    return null;
  }

  private handleBulletHitObstacle(
    bullet: ServerBullet,
    obstacle: (typeof this.room.obstacles)[0]
  ): void {
    if (!obstacle.destructible) {
      // 不可破坏：子弹消失，障碍物无损
      return;
    }

    // 可破坏：扣血
    obstacle.hp = Math.max(0, (obstacle.hp ?? 1) - 1);

    if (obstacle.hp <= 0) {
      // 摧毁：从列表中移除并广播
      const index = this.room.obstacles.findIndex(
        (o) => o.obstacleId === obstacle.obstacleId
      );
      if (index !== -1) {
        this.room.obstacles.splice(index, 1);
      }
      this.room.broadcast({
        type: "obstacle_destroyed",
        obstacleId: obstacle.obstacleId,
        x: obstacle.x + obstacle.width / 2,
        y: obstacle.y + obstacle.height / 2,
      });
    } else {
      // 受伤：广播受伤事件
      this.room.broadcast({
        type: "obstacle_hit",
        obstacleId: obstacle.obstacleId,
        newHp: obstacle.hp,
      });
    }
  }

  private removeBullet(id: string): void {
    const b = this.bullets.get(id);
    if (!b) return;
    this.bullets.delete(id);
    const owner = this.room.players.get(b.ownerId);
    if (owner) owner.activeBullets = Math.max(0, owner.activeBullets - 1);
  }

  private applyHit(target: ServerPlayer, bullet: ServerBullet): void {
    target.hp = Math.max(0, target.hp - 1);
    const owner = this.room.players.get(bullet.ownerId);
    if (owner) owner.hitCount++;
    this.room.broadcast({
      type: "player_hit",
      targetId: target.playerId,
      newHp: target.hp,
      bulletId: bullet.bulletId,
    });
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      this.room.broadcast({
        type: "player_eliminated",
        playerId: target.playerId,
      });
    }
  }

  private checkGameEnd(now: number): void {
    const players = [...this.room.players.values()];
    const alive = players.filter((p) => p.alive);

    // 条件一：最后存活者（含断线淘汰）
    if (alive.length <= 1) {
      const winner = alive[0] ?? null;
      const anyConnected = players.some((p) => p.connected);
      this.room.endGame(
        winner?.playerId ?? null,
        winner?.nickname ?? null,
        winner === null, // 无存活者（同归于尽/全部断线）记平局
        anyConnected ? "last_alive" : "all_disconnected"
      );
      return;
    }

    // 条件二：120 秒超时 → 比 HP → 比命中数 → 平局
    const remaining = this.remainingMs(now);
    if (remaining <= 0) {
      const sorted = [...alive].sort(
        (a, b) => b.hp - a.hp || b.hitCount - a.hitCount
      );
      const top = sorted[0];
      const tied = sorted.filter(
        (p) => p.hp === top.hp && p.hitCount === top.hitCount
      );
      if (tied.length === 1) {
        this.room.endGame(top.playerId, top.nickname, false, "timeout");
      } else {
        this.room.endGame(null, null, true, "timeout");
      }
    }
  }

  private remainingMs(now: number): number {
    return Math.max(
      0,
      this.startTime + GAME_CONFIG.gameDurationSeconds * 1000 - now
    );
  }

  buildSnapshot(now = Date.now()): WorldSnapshot {
    const players: PlayerSnapshot[] = [...this.room.players.values()].map(
      (p) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        color: p.color,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        direction: p.direction,
        hp: p.hp,
        alive: p.alive,
        hitCount: p.hitCount,
      })
    );
    return {
      type: "world_snapshot",
      tick: this.tick,
      roomId: this.room.roomId,
      status: this.room.status,
      remainingTimeMs:
        this.room.status === "playing" ? this.remainingMs(now) : 0,
      players,
      bullets: [...this.bullets.values()].map((b) => ({
        ...b,
        x: Math.round(b.x * 100) / 100,
        y: Math.round(b.y * 100) / 100,
      })),
      obstacles: this.room.obstacles,
      winnerId: this.room.winnerId,
      isDraw: this.room.isDraw,
      mapTheme: this.room.mapTheme,
    };
  }
}
