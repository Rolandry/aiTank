// 两模式复活差异的内部逻辑验证（不经网络，直接驱动 GameWorld）
import { Room } from "../src/room";

const fakeSock: any = { readyState: 1, send: () => {}, on: () => {}, close: () => {} };
let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
  if (!passed) failures++;
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function run(): Promise<void> {
for (const mode of ["deathmatch", "classic"] as const) {
  const room = new Room(`R-${mode}`, () => {}, mode);
  room.addPlayer(fakeSock, "p1", "A");
  room.addPlayer(fakeSock, "p2", "B");
  room.startGame("p1");
  // 开局有倒计时，等待世界创建
  for (let i = 0; i < 100 && !room.game; i++) await sleep(100);
  if (!room.game) {
    check(`[${mode}] 对局启动`, false, "game 未创建");
    continue;
  }

  const g: any = room.game;
  const p2: any = room.players.get("p2");

  // 直接击杀 p2
  p2.hp = 1;
  g.applyHit(p2, { ownerId: "p1", damage: 1, bulletId: "b1" });

  check(`[${mode}] 击杀后进入死亡`, p2.alive === false);
  if (mode === "deathmatch") {
    check(`[${mode}] 安排了复活`, p2.respawnAt !== null);
  } else {
    check(`[${mode}] 不安排复活`, p2.respawnAt === null,
      `respawnAt=${p2.respawnAt}`);
  }

  // 时间推进 4 秒（超过 3 秒复活延迟）后观察
  const orig = Date.now;
  const base = orig();
  (Date as any).now = () => base + 4000;
  g.step(0.016);
  (Date as any).now = orig;

  if (mode === "deathmatch") {
    check(`[${mode}] 4 秒后已复活`, p2.alive === true, `alive=${p2.alive}`);
    check(`[${mode}] 对局继续`, room.status === "playing", `status=${room.status}`);
  } else {
    check(`[${mode}] 4 秒后仍淘汰`, p2.alive === false, `alive=${p2.alive}`);
    check(`[${mode}] 仅剩一人对局结束`, room.status === "finished",
      `status=${room.status}`);
    check(`[${mode}] 存活者为胜者`, room.winnerId === "p1", `winner=${room.winnerId}`);
  }
}
}

run().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\nFAILED ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
});
