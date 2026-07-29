import { GAME_CONFIG, POWERUP_CONFIG } from "../src/protocol";
import type { ObstacleSnapshot, PowerupType } from "../src/protocol";
import { GameWorld } from "../src/game";
import { generateMap } from "../src/map";
import type { ServerPlayer } from "../src/types";

const results: string[] = [];
let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
  if (!passed) failures++;
  results.push(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

function createPlayer(playerId: string, x: number, y: number): ServerPlayer {
  return {
    playerId,
    nickname: playerId,
    color: "red",
    socket: {} as never,
    x,
    y,
    direction: "right",
    hp: GAME_CONFIG.maxHp,
    alive: true,
    hitCount: 0,
    lastShootTime: 0,
    activeBullets: 0,
    input: { up: false, down: false, left: false, right: false },
    lastInputSeq: 0,
    connected: true,
    effects: new Map(),
    shield: 0,
    lastDashTime: 0,
  };
}

// 用最小房间替身隔离 WebSocket，仅保留技能逻辑所需状态
function createHarness(obstacles: ObstacleSnapshot[]) {
  const players = new Map<string, ServerPlayer>();
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const room = {
    roomId: "TEST",
    status: "playing" as const,
    players,
    obstacles,
    mapTheme: "grass_jungle" as const,
    winnerId: null,
    isDraw: false,
    broadcast: (msg: { type: string }) => events.push(msg as never),
    endGame: () => {},
  };
  const world = new GameWorld(room as never);
  return { world, room, players, events };
}

function tick(world: GameWorld): void {
  (world as unknown as { step: () => void }).step();
}

// step() 依赖真实时间差计算 dt，同步循环会得到 dt≈0，因此需要阻塞等待
function advance(world: GameWorld, ticks: number, stepMs = 20): void {
  for (let i = 0; i < ticks; i++) {
    const until = Date.now() + stepMs;
    while (Date.now() < until) {
      // 忙等：保证下一个 tick 的 dt 与真实运行接近
    }
    tick(world);
  }
}

function grantEffect(player: ServerPlayer, type: PowerupType): void {
  player.effects.set(type, Date.now() + POWERUP_CONFIG[type].durationMs);
}

// 1. 冲刺：空地前进 3 格
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 200, 400);
  players.set(player.playerId, player);
  world.handleDash(player);
  check("冲刺在空地前进 3 格", player.x === 200 + 3 * GAME_CONFIG.obstacleSize, `x=${player.x}`);
}

// 2. 冲刺：遇障碍物提前停止且不穿墙
{
  const wall: ObstacleSnapshot = {
    obstacleId: "w1", x: 320, y: 384, width: 64, height: 64,
    type: "grass_jungle_rock", destructible: false,
  };
  const { world, players } = createHarness([wall]);
  const player = createPlayer("p1", 200, 416);
  players.set(player.playerId, player);
  world.handleDash(player);
  check("冲刺遇障碍物提前停止", player.x < 320, `x=${player.x}`);
}

// 3. 冲刺冷却：立即二次冲刺无效
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 200, 400);
  players.set(player.playerId, player);
  world.handleDash(player);
  const afterFirst = player.x;
  world.handleDash(player);
  check("冷却期间重复冲刺无效", player.x === afterFirst, `x=${player.x}`);
}

// 4. swift_dash：距离提升到 4 格
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 100, 400);
  grantEffect(player, "swift_dash");
  players.set(player.playerId, player);
  world.handleDash(player);
  check("swift_dash 冲刺 4 格", player.x === 100 + 4 * GAME_CONFIG.obstacleSize, `x=${player.x}`);
}

// 5. shrink：碰撞尺寸同步缩小
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 200, 400);
  players.set(player.playerId, player);
  const normal = world.buildSnapshot().players[0].size;
  grantEffect(player, "shrink");
  const shrunk = world.buildSnapshot().players[0].size;
  check("shrink 缩小碰撞尺寸", shrunk < normal, `${normal} -> ${shrunk}`);
}

// 6. bigshot + power_shot：子弹尺寸与伤害提升
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 200, 400);
  grantEffect(player, "bigshot");
  grantEffect(player, "power_shot");
  players.set(player.playerId, player);
  world.handleShoot(player);
  const bullet = world.buildSnapshot().bullets[0];
  check("bigshot 放大子弹", bullet.size > GAME_CONFIG.bulletSize, `size=${bullet.size}`);
  check("power_shot 伤害为 2", bullet.damage === 2, `damage=${bullet.damage}`);
}

// 7. spread：一次发射三发
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 500, 400);
  grantEffect(player, "spread");
  players.set(player.playerId, player);
  world.handleShoot(player);
  check("spread 发射 3 发", world.buildSnapshot().bullets.length === 3);
}

// 8. rapid：冷却减半允许更快连射
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 500, 400);
  grantEffect(player, "rapid");
  players.set(player.playerId, player);
  world.handleShoot(player);
  player.lastShootTime = Date.now() - (GAME_CONFIG.shootCooldownMs / 2 + 10);
  world.handleShoot(player);
  check("rapid 支持更快连射", world.buildSnapshot().bullets.length === 2);
}

// 9. 护盾：抵挡一次伤害后消失
{
  const { world, players } = createHarness([]);
  const shooter = createPlayer("p1", 300, 400);
  const target = createPlayer("p2", 360, 400);
  target.shield = 1;
  grantEffect(target, "shield");
  players.set(shooter.playerId, shooter);
  players.set(target.playerId, target);

  world.handleShoot(shooter);
  advance(world, 12);
  check("护盾抵挡一次伤害", target.hp === GAME_CONFIG.maxHp && target.shield === 0,
    `hp=${target.hp} shield=${target.shield}`);
}

// 10. heal：不超过血量上限
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 300, 400);
  player.hp = 1;
  players.set(player.playerId, player);
  const apply = (world as unknown as {
    applyPowerup: (p: ServerPlayer, ball: { powerupId: string; type: PowerupType; x: number; y: number }) => void;
  }).applyPowerup.bind(world);

  apply(player, { powerupId: "b1", type: "heal", x: 0, y: 0 });
  const healed = player.hp;
  player.hp = GAME_CONFIG.maxHp;
  apply(player, { powerupId: "b2", type: "heal", x: 0, y: 0 });
  check("heal 回复血量", healed === 2, `hp=${healed}`);
  check("heal 不超过上限", player.hp === GAME_CONFIG.maxHp, `hp=${player.hp}`);
}

// 11. 效果到期自动清理
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", 300, 400);
  player.effects.set("speed", Date.now() - 1);
  player.effects.set("shield", Date.now() - 1);
  player.shield = 1;
  players.set(player.playerId, player);
  tick(world);
  check("过期效果被清理", player.effects.size === 0, `size=${player.effects.size}`);
  check("护盾随效果过期归零", player.shield === 0, `shield=${player.shield}`);
}

// 12. ghost：可穿越可破坏障碍物但不能穿墙
{
  const soft: ObstacleSnapshot = {
    obstacleId: "s1", x: 320, y: 384, width: 64, height: 64,
    type: "grass_jungle_tree", destructible: true, hp: 2, maxHp: 2,
  };
  const hard: ObstacleSnapshot = {
    obstacleId: "h1", x: 320, y: 384, width: 64, height: 64,
    type: "grass_jungle_rock", destructible: false,
  };

  const soften = createHarness([soft]);
  const ghost = createPlayer("p1", 300, 416);
  grantEffect(ghost, "ghost");
  soften.players.set(ghost.playerId, ghost);
  soften.world.handleDash(ghost);
  check("ghost 穿越可破坏障碍", ghost.x > 320, `x=${ghost.x}`);

  const solid = createHarness([hard]);
  const blocked = createPlayer("p2", 300, 416);
  grantEffect(blocked, "ghost");
  solid.players.set(blocked.playerId, blocked);
  solid.world.handleDash(blocked);
  check("ghost 无法穿越实墙", blocked.x < 320, `x=${blocked.x}`);
}

// 13. pierce：击穿可破坏障碍后继续飞行
{
  const soft: ObstacleSnapshot = {
    obstacleId: "s1", x: 384, y: 384, width: 64, height: 64,
    type: "grass_jungle_tree", destructible: true, hp: 1, maxHp: 1,
  };
  const { world, players, room } = createHarness([soft]);
  const player = createPlayer("p1", 300, 416);
  grantEffect(player, "pierce");
  grantEffect(player, "power_shot");
  players.set(player.playerId, player);
  world.handleShoot(player);
  advance(world, 12);
  check("pierce 摧毁障碍物", room.obstacles.length === 0);
  check("pierce 子弹继续存在", world.buildSnapshot().bullets.length >= 1);
}

// 14. ricochet：碰壁反弹而非消失
{
  const { world, players } = createHarness([]);
  const player = createPlayer("p1", GAME_CONFIG.mapWidth - 80, 400);
  grantEffect(player, "ricochet");
  players.set(player.playerId, player);
  world.handleShoot(player);
  advance(world, 12);
  const bullet = world.buildSnapshot().bullets[0];
  check("ricochet 子弹碰壁后存活", bullet !== undefined, bullet ? `dir=${bullet.direction}` : "removed");
  if (bullet) check("ricochet 反弹后反向飞行", bullet.direction === "left", `dir=${bullet.direction}`);
}

// 15. 技能球生成位置合法
{
  const map = generateMap("desert_gobi");
  const { world, players, room } = createHarness(map.obstacles);
  players.set("p1", createPlayer("p1", 88, 88));
  const spawn = (world as unknown as { spawnPowerup: () => void }).spawnPowerup.bind(world);

  let overlapped = 0;
  for (let i = 0; i < 40; i++) {
    (world as unknown as { powerups: Map<string, unknown> }).powerups.clear();
    spawn();
    for (const ball of world.buildSnapshot().powerups) {
      const rect = {
        x: ball.x - ball.size / 2, y: ball.y - ball.size / 2,
        width: ball.size, height: ball.size,
      };
      const hit = room.obstacles.some(
        (o) => rect.x < o.x + o.width && rect.x + rect.width > o.x &&
          rect.y < o.y + o.height && rect.y + rect.height > o.y
      );
      if (hit) overlapped++;
    }
  }
  check("技能球不与障碍物重叠", overlapped === 0, `overlap=${overlapped}`);
}

// 16. 技能球拾取生效并移除
{
  const { world, players, events } = createHarness([]);
  const player = createPlayer("p1", 300, 400);
  players.set(player.playerId, player);
  const powerups = (world as unknown as {
    powerups: Map<string, { powerupId: string; type: PowerupType; x: number; y: number }>;
  }).powerups;
  powerups.set("b1", { powerupId: "b1", type: "speed", x: 300, y: 400 });

  tick(world);
  check("拾取后移除技能球", powerups.size === 0);
  check("拾取后效果生效", player.effects.has("speed"));
  check("广播拾取事件", events.some((e) => e.type === "powerup_collected"));
}

console.log(results.join("\n"));
console.log(failures === 0 ? `\nALL PASS (${results.length} checks)` : `\nFAILED ${failures}`);
process.exit(failures === 0 ? 0 : 1);
