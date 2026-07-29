import { GAME_CONFIG, POWERUP_CONFIG } from "./protocol";
import type {
  PlayerInput,
  PlayerSnapshot,
  PowerupSnapshot,
  PowerupType,
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
  ServerPowerup,
} from "./types";

// 文档 1 第 6 节：客户端 GAME_CONFIG 未包含速度，由服务端权威定义
const TANK_SPEED = 180; // px/s
const BULLET_SPEED = 420; // px/s
const POWERUP_TYPES = Object.keys(POWERUP_CONFIG) as PowerupType[];
// 恢复类权重较低，避免回血主导对局
const POWERUP_WEIGHT: Record<PowerupType, number> = {
  shrink: 3, speed: 3, shield: 3, swift_dash: 2,
  heal: 2,
  rapid: 3, bigshot: 3, spread: 2, pierce: 2, ricochet: 2, power_shot: 2,
};
const RESPAWN_DELAY_MS = 3000; // 击杀赛模式：被淘汰后 3 秒复活

export class GameWorld {
  private bullets = new Map<string, ServerBullet>();
  private powerups = new Map<string, ServerPowerup>();
  private bulletSeq = 0;
  private powerupSeq = 0;
  // 以创建时间为基准，避免未调用 start() 时首个 tick 立即刷球
  private lastPowerupSpawn = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  // 以创建时间为基准，保证首个 tick 的 dt 正确而不是被裁剪为 0
  private lastTickTime = Date.now();
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
      p.kills = 0;
      p.respawnAt = null;
      p.activeBullets = 0;
      p.lastShootTime = 0;
      p.lastInputSeq = 0;
      p.input = { up: false, down: false, left: false, right: false };
      p.effects.clear();
      p.shield = 0;
      p.lastDashTime = 0;
    });
    this.bullets.clear();
    this.powerups.clear();
    this.startTime = Date.now();
    this.lastTickTime = this.startTime;
    this.lastPowerupSpawn = this.startTime;
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

  // ── 技能效果查询 ──

  private hasEffect(player: ServerPlayer, type: PowerupType): boolean {
    const expiry = player.effects.get(type);
    return expiry !== undefined && expiry > Date.now();
  }

  private tankSize(player: ServerPlayer): number {
    // 基准尺寸已缩小，缩小比例相应放宽，避免坦克过小失真
    return this.hasEffect(player, "shrink")
      ? Math.round(GAME_CONFIG.tankSize * 0.75)
      : GAME_CONFIG.tankSize;
  }

  private tankSpeed(player: ServerPlayer): number {
    return this.hasEffect(player, "speed") ? TANK_SPEED * 1.6 : TANK_SPEED;
  }

  private dashCells(player: ServerPlayer): number {
    return this.hasEffect(player, "swift_dash") ? 4 : GAME_CONFIG.dashCells;
  }

  private dashCooldown(player: ServerPlayer): number {
    return this.hasEffect(player, "swift_dash") ? 6000 : GAME_CONFIG.dashCooldownMs;
  }

  handleShoot(player: ServerPlayer): void {
    if (this.room.status !== "playing" || !player.alive) return;
    const now = Date.now();
    const rapid = this.hasEffect(player, "rapid");
    const cooldown = rapid
      ? GAME_CONFIG.shootCooldownMs / 2
      : GAME_CONFIG.shootCooldownMs;
    const maxBullets = rapid
      ? GAME_CONFIG.maxBulletsPerPlayer + 3
      : GAME_CONFIG.maxBulletsPerPlayer;

    if (now - player.lastShootTime < cooldown) return;
    if (player.activeBullets >= maxBullets) return;
    player.lastShootTime = now;

    // spread 沿三个方向发射：正前方加左右两侧
    const directions: Direction[] = this.hasEffect(player, "spread")
      ? [player.direction, ...this.sideDirections(player.direction)]
      : [player.direction];

    for (const direction of directions) {
      if (player.activeBullets >= maxBullets) break;
      this.spawnBullet(player, direction);
    }
  }

  private sideDirections(direction: Direction): Direction[] {
    return direction === "up" || direction === "down"
      ? ["left", "right"]
      : ["up", "down"];
  }

  private spawnBullet(player: ServerPlayer, direction: Direction): void {
    const size = this.hasEffect(player, "bigshot")
      ? GAME_CONFIG.bulletSize * 2
      : GAME_CONFIG.bulletSize;
    const v = DIRECTION_VECTOR[direction];
    const offset = this.tankSize(player) / 2 + size / 2;
    const id = `b_${this.bulletSeq++}`;

    player.activeBullets++;
    this.bullets.set(id, {
      bulletId: id,
      ownerId: player.playerId,
      x: player.x + v.dx * offset,
      y: player.y + v.dy * offset,
      direction,
      size,
      damage: this.hasEffect(player, "power_shot") ? 2 : 1,
      pierce: this.hasEffect(player, "pierce"),
      bouncesLeft: this.hasEffect(player, "ricochet") ? 2 : 0,
    });
  }

  // 冲刺：沿朝向逐格试探，遇障碍/边界则停在最后合法位置
  handleDash(player: ServerPlayer): void {
    if (this.room.status !== "playing" || !player.alive) return;
    const now = Date.now();
    if (now - player.lastDashTime < this.dashCooldown(player)) return;

    const v = DIRECTION_VECTOR[player.direction];
    const step = GAME_CONFIG.obstacleSize;
    const fromX = player.x;
    const fromY = player.y;
    let targetX = player.x;
    let targetY = player.y;

    for (let cell = 1; cell <= this.dashCells(player); cell++) {
      const nextX = fromX + v.dx * step * cell;
      const nextY = fromY + v.dy * step * cell;
      if (!this.canPlaceTank(player, nextX, nextY)) break;
      targetX = nextX;
      targetY = nextY;
    }

    if (targetX === fromX && targetY === fromY) return;

    player.lastDashTime = now;
    player.x = targetX;
    player.y = targetY;
    this.room.broadcast({
      type: "dash",
      playerId: player.playerId,
      fromX,
      fromY,
      toX: targetX,
      toY: targetY,
    });
  }

  // 拾取后立即结算：恢复类直接生效，其余写入效果表
  private applyPowerup(player: ServerPlayer, powerup: ServerPowerup): void {
    const config = POWERUP_CONFIG[powerup.type];

    if (powerup.type === "heal") {
      player.hp = Math.min(GAME_CONFIG.maxHp, player.hp + 1);
    } else {
      // 重复拾取刷新持续时间
      player.effects.set(powerup.type, Date.now() + config.durationMs);
      if (powerup.type === "shield") player.shield = 1;
    }

    this.room.broadcast({
      type: "powerup_collected",
      powerupId: powerup.powerupId,
      playerId: player.playerId,
      powerupType: powerup.type,
      category: config.category,
      x: powerup.x,
      y: powerup.y,
    });
  }

  private updatePowerups(now: number): void {
    for (const powerup of [...this.powerups.values()]) {
      const ballRect = {
        x: powerup.x - GAME_CONFIG.powerupSize / 2,
        y: powerup.y - GAME_CONFIG.powerupSize / 2,
        width: GAME_CONFIG.powerupSize,
        height: GAME_CONFIG.powerupSize,
      };
      for (const player of this.room.players.values()) {
        if (!player.alive || !player.connected) continue;
        if (!aabbOverlap(ballRect, tankRect(player.x, player.y, this.tankSize(player)))) continue;
        this.powerups.delete(powerup.powerupId);
        this.applyPowerup(player, powerup);
        break;
      }
    }

    if (now - this.lastPowerupSpawn < GAME_CONFIG.powerupSpawnIntervalMs) return;
    this.lastPowerupSpawn = now;
    if (this.powerups.size >= GAME_CONFIG.maxPowerups) return;
    this.spawnPowerup();
  }

  private spawnPowerup(): void {
    const position = this.findPowerupPosition();
    if (!position) return;

    const id = `p_${this.powerupSeq++}`;
    const powerup: ServerPowerup = {
      powerupId: id,
      type: this.pickPowerupType(),
      x: position.x,
      y: position.y,
    };
    this.powerups.set(id, powerup);
    this.room.broadcast({
      type: "powerup_spawned",
      powerup: this.toPowerupSnapshot(powerup),
    });
  }

  private pickPowerupType(): PowerupType {
    const total = POWERUP_TYPES.reduce((sum, type) => sum + POWERUP_WEIGHT[type], 0);
    let roll = Math.random() * total;
    for (const type of POWERUP_TYPES) {
      roll -= POWERUP_WEIGHT[type];
      if (roll <= 0) return type;
    }
    return "heal";
  }

  // 只在空地生成：避开障碍物、出生缓冲区和已有技能球
  private findPowerupPosition(): { x: number; y: number } | null {
    const cell = GAME_CONFIG.obstacleSize;
    const cols = Math.floor(GAME_CONFIG.mapWidth / cell);
    const rows = Math.floor(GAME_CONFIG.mapHeight / cell);

    for (let attempt = 0; attempt < 80; attempt++) {
      const col = Math.floor(Math.random() * cols);
      const row = Math.floor(Math.random() * rows);
      const x = col * cell + cell / 2;
      const y = row * cell + cell / 2;
      const rect = {
        x: x - GAME_CONFIG.powerupSize / 2,
        y: y - GAME_CONFIG.powerupSize / 2,
        width: GAME_CONFIG.powerupSize,
        height: GAME_CONFIG.powerupSize,
      };

      if (!insideMap(rect)) continue;
      if (hitsObstacle(rect, this.room.obstacles)) continue;
      if (SPAWN_POINTS.some((s) => Math.hypot(s.x - x, s.y - y) < cell * 2)) continue;
      if ([...this.powerups.values()].some((p) => Math.hypot(p.x - x, p.y - y) < cell)) continue;
      return { x, y };
    }
    return null;
  }

  private expireEffects(now: number): void {
    for (const player of this.room.players.values()) {
      for (const [type, expiry] of [...player.effects]) {
        if (expiry > now) continue;
        player.effects.delete(type);
        if (type === "shield") player.shield = 0;
      }
    }
  }

  private toPowerupSnapshot(powerup: ServerPowerup): PowerupSnapshot {
    return {
      powerupId: powerup.powerupId,
      type: powerup.type,
      category: POWERUP_CONFIG[powerup.type].category,
      x: powerup.x,
      y: powerup.y,
      size: GAME_CONFIG.powerupSize,
    };
  }

  private step(): void {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.1);
    this.lastTickTime = now;
    this.tick++;

    this.expireEffects(now);
    this.moveTanks(dt);
    this.moveBullets(dt);
    this.updatePowerups(now);
    this.processRespawns(now);
    this.checkGameEnd(now);

    if (this.room.status === "playing") {
      this.room.broadcast(this.buildSnapshot(now));
    }
  }

  private moveTanks(dt: number): void {
    for (const p of this.room.players.values()) {
      if (!p.alive || !p.connected) continue;
      const dir = this.resolveDirection(p.input);
      if (!dir) continue;
      p.direction = dir;
      const dist = this.tankSpeed(p) * dt;
      const v = DIRECTION_VECTOR[dir];
      // 分轴移动：允许沿障碍物/边界滑动
      const nx = p.x + v.dx * dist;
      if (this.canPlaceTank(p, nx, p.y)) p.x = nx;
      const ny = p.y + v.dy * dist;
      if (this.canPlaceTank(p, p.x, ny)) p.y = ny;
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

  private canPlaceTank(player: ServerPlayer, cx: number, cy: number): boolean {
    const rect = tankRect(cx, cy, this.tankSize(player));
    if (!insideMap(rect)) return false;
    return !hitsObstacle(rect, this.room.obstacles);
  }

  private moveBullets(dt: number): void {
    const dist = BULLET_SPEED * dt;
    const toRemove: string[] = [];

    for (const b of this.bullets.values()) {
      const v = DIRECTION_VECTOR[b.direction];
      b.x += v.dx * dist;
      b.y += v.dy * dist;
      const rect = bulletRect(b.x, b.y, b.size);

      if (!insideMap(rect)) {
        // ricochet：撞到地图边界时按轴翻转方向
        if (b.bouncesLeft > 0 && this.bounceBullet(b, dist)) continue;
        toRemove.push(b.bulletId);
        continue;
      }
      if (hitsObstacle(rect, this.room.obstacles)) {
        const hitObstacle = this.findHitObstacle(rect, this.room.obstacles);
        if (hitObstacle) {
          const destroyed = this.handleBulletHitObstacle(b, hitObstacle);
          // pierce：击穿可破坏障碍物后继续飞行
          if (b.pierce && destroyed) continue;
          if (!destroyed && b.bouncesLeft > 0 && this.bounceBullet(b, dist)) continue;
        }
        toRemove.push(b.bulletId);
        continue;
      }
      for (const p of this.room.players.values()) {
        if (!p.alive || p.playerId === b.ownerId) continue;
        if (aabbOverlap(rect, tankRect(p.x, p.y, this.tankSize(p)))) {
          toRemove.push(b.bulletId);
          this.applyHit(p, b);
          break;
        }
      }
    }

    for (const id of toRemove) this.removeBullet(id);
  }

  // 反弹：翻转方向并退回一步，避免卡在障碍物内部
  private bounceBullet(bullet: ServerBullet, dist: number): boolean {
    const opposite: Record<Direction, Direction> = {
      up: "down", down: "up", left: "right", right: "left",
    };
    const v = DIRECTION_VECTOR[bullet.direction];
    bullet.x -= v.dx * dist;
    bullet.y -= v.dy * dist;
    bullet.direction = opposite[bullet.direction];
    bullet.bouncesLeft--;

    const rect = bulletRect(bullet.x, bullet.y, bullet.size);
    return insideMap(rect) && !hitsObstacle(rect, this.room.obstacles);
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

  // 返回障碍物是否被摧毁，供 pierce 判定是否继续飞行
  private handleBulletHitObstacle(
    bullet: ServerBullet,
    obstacle: (typeof this.room.obstacles)[0]
  ): boolean {
    if (!obstacle.destructible) {
      // 不可破坏：子弹消失，障碍物无损
      return false;
    }

    // 可破坏：按子弹伤害扣血
    obstacle.hp = Math.max(0, (obstacle.hp ?? 1) - bullet.damage);

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
      return true;
    }

    // 受伤：广播受伤事件
    this.room.broadcast({
      type: "obstacle_hit",
      obstacleId: obstacle.obstacleId,
      newHp: obstacle.hp,
    });
    return false;
  }

  private removeBullet(id: string): void {
    const b = this.bullets.get(id);
    if (!b) return;
    this.bullets.delete(id);
    const owner = this.room.players.get(b.ownerId);
    if (owner) owner.activeBullets = Math.max(0, owner.activeBullets - 1);
  }

  private applyHit(target: ServerPlayer, bullet: ServerBullet): void {
    const owner = this.room.players.get(bullet.ownerId);
    if (owner) owner.hitCount++;

    // 护盾优先抵挡一次伤害，不扣血
    if (target.shield > 0) {
      target.shield = 0;
      target.effects.delete("shield");
      this.room.broadcast({
        type: "player_hit",
        targetId: target.playerId,
        newHp: target.hp,
        bulletId: bullet.bulletId,
      });
      return;
    }

    target.hp = Math.max(0, target.hp - bullet.damage);
    this.room.broadcast({
      type: "player_hit",
      targetId: target.playerId,
      newHp: target.hp,
      bulletId: bullet.bulletId,
    });
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      if (owner) owner.kills++;
      // 击杀赛模式：3 秒后在随机出生点复活（断线玩家由 connected=false 跳过）
      target.respawnAt = Date.now() + RESPAWN_DELAY_MS;
      this.room.broadcast({
        type: "player_eliminated",
        playerId: target.playerId,
        killerId: owner?.playerId ?? null,
      });
    }
  }

  // 到期的死亡玩家在随机出生点复活（优先不被存活坦克占用的点）
  private processRespawns(now: number): void {
    for (const p of this.room.players.values()) {
      if (p.alive || !p.connected || p.respawnAt === null) continue;
      if (now < p.respawnAt) continue;
      const spawn = this.pickRespawnPoint();
      p.x = spawn.x;
      p.y = spawn.y;
      p.direction = spawn.direction;
      p.hp = GAME_CONFIG.maxHp;
      p.alive = true;
      p.respawnAt = null;
      p.lastShootTime = 0;
      p.activeBullets = 0;
      p.input = { up: false, down: false, left: false, right: false };
      this.room.broadcast({
        type: "player_respawn",
        playerId: p.playerId,
        x: p.x,
        y: p.y,
      });
    }
  }

  private pickRespawnPoint(): { x: number; y: number; direction: Direction } {
    const alive = [...this.room.players.values()].filter((p) => p.alive);
    const free = SPAWN_POINTS.filter(
      (s) =>
        !alive.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < GAME_CONFIG.tankSize)
    );
    const pool = free.length > 0 ? free : SPAWN_POINTS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 击杀赛模式：唯一结束条件是时间耗尽，结算击杀排行榜
  private checkGameEnd(now: number): void {
    const players = [...this.room.players.values()];

    // 全部断线：本局无胜者，直接结束
    if (players.length > 0 && !players.some((p) => p.connected)) {
      this.room.endGame(null, null, true, "all_disconnected", []);
      return;
    }

    if (this.remainingMs(now) > 0) return;

    const leaderboard = [...players]
      .sort((a, b) => b.kills - a.kills || b.hitCount - a.hitCount)
      .map((p) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        color: p.color,
        kills: p.kills,
        hitCount: p.hitCount,
      }));
    const top = leaderboard[0];
    const tied = leaderboard.filter(
      (e) => e.kills === top.kills && e.hitCount === top.hitCount
    );
    if (tied.length === 1) {
      this.room.endGame(top.playerId, top.nickname, false, "timeout", leaderboard);
    } else {
      this.room.endGame(null, null, true, "timeout", leaderboard);
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
        size: this.tankSize(p),
        shield: p.shield,
        effects: [...p.effects]
          .filter(([, expiry]) => expiry > now)
          .map(([type, expiry]) => ({ type, remainingMs: expiry - now })),
        dashCooldownMs: Math.max(
          0,
          p.lastDashTime + this.dashCooldown(p) - now
        ),
        kills: p.kills,
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
        bulletId: b.bulletId,
        ownerId: b.ownerId,
        x: Math.round(b.x * 100) / 100,
        y: Math.round(b.y * 100) / 100,
        direction: b.direction,
        size: b.size,
        damage: b.damage,
      })),
      obstacles: this.room.obstacles,
      powerups: [...this.powerups.values()].map((p) => this.toPowerupSnapshot(p)),
      winnerId: this.room.winnerId,
      isDraw: this.room.isDraw,
      mapTheme: this.room.mapTheme,
    };
  }
}
