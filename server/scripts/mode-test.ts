// 双游戏模式验证：deathmatch 无限复活按时结算，classic 一条命最后存活者胜。
import { WebSocket } from "ws";

const URL = process.env.WS_URL ?? "ws://127.0.0.1:8080/ws";
const results: string[] = [];
let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
  if (!passed) failures++;
  results.push(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class Client {
  ws: WebSocket;
  rx: any[] = [];

  constructor() {
    this.ws = new WebSocket(URL);
    this.ws.on("message", (d) => {
      try {
        this.rx.push(JSON.parse(d.toString()));
      } catch {
        // 忽略非 JSON
      }
    });
  }

  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.once("open", () => res());
      this.ws.once("error", rej);
    });
  }

  send(m: any): void {
    this.ws.send(JSON.stringify(m));
  }

  async wait(type: string, ms = 5000): Promise<any> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = this.rx.find((x) => x.type === type);
      if (found) return found;
      await sleep(30);
    }
    return null;
  }

  last(type: string): any {
    return this.rx.filter((x) => x.type === type).at(-1);
  }

  close(): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

// 建立一局对战并返回双方句柄
async function startMatch(mode: "deathmatch" | "classic") {
  const a = new Client();
  const b = new Client();
  await a.open();
  await b.open();

  a.send({ type: "create_room", nickname: "A", mode });
  const created = await a.wait("room_created");
  const roomId = created.roomId as string;

  b.send({ type: "join_room", nickname: "B", roomId });
  const joined = await b.wait("room_joined");

  a.send({ type: "start_game" });
  await a.wait("world_snapshot", 8000);
  return { a, b, roomId, aId: created.playerId as string, bId: joined.playerId as string };
}

async function main(): Promise<void> {
  // ── 模式配置正确下发 ──
  const dm = await startMatch("deathmatch");
  const dmSnap = dm.a.last("world_snapshot");
  check("死斗模式快照携带 mode", dmSnap?.mode === "deathmatch", `mode=${dmSnap?.mode}`);
  const dmLobby = dm.b.last("lobby_update");
  check("大厅广播携带 mode", dmLobby?.mode === "deathmatch", `mode=${dmLobby?.mode}`);
  dm.a.close();
  dm.b.close();

  const cl = await startMatch("classic");
  const clSnap = cl.a.last("world_snapshot");
  check("经典模式快照携带 mode", clSnap?.mode === "classic", `mode=${clSnap?.mode}`);

  // ── 经典模式：断线不复活，仅剩一人立即结束 ──
  // 用异常断线模拟一方退出战斗：断线坦克静止但仍存活，
  // 因此改用主动退出触发淘汰，验证「仅剩一人 -> 结束」。
  cl.b.send({ type: "leave_room" });
  const over = await cl.a.wait("game_over", 6000);
  check("经典模式仅剩一人即结束", !!over, over ? `reason=${over.reason}` : "未结束");
  check("结束原因为 last_alive", over?.reason === "last_alive", over?.reason ?? "无");
  check("存活者获胜", over?.winnerId === cl.aId, `winner=${over?.winnerId}`);
  check("排行榜含存活标记", typeof over?.leaderboard?.[0]?.alive === "boolean");
  // 存活者应排在已淘汰者之前
  const board = over?.leaderboard ?? [];
  check("存活优先排序", board[0]?.playerId === cl.aId, `top=${board[0]?.playerId}`);
  cl.a.close();
  cl.b.close();

  // ── 死斗模式：一方退出不结束对局（仍按时间计） ──
  const dm2 = await startMatch("deathmatch");
  dm2.b.send({ type: "leave_room" });
  await sleep(1200);
  const dmOver = dm2.a.last("game_over");
  // 死斗模式下唯一结束条件是时间耗尽；但仅剩一名连接玩家时
  // 若全部其他玩家离开，房间仍可继续计时，不应因人数立即结束
  check("死斗模式不因人数立即结束", !dmOver, dmOver ? `reason=${dmOver.reason}` : "未结束");
  dm2.a.close();
  dm2.b.close();

  // ── 缺省模式兼容旧客户端 ──
  const legacy = new Client();
  await legacy.open();
  legacy.send({ type: "create_room", nickname: "L" });
  const legacyRoom = await legacy.wait("room_created");
  const legacyLobby = await legacy.wait("lobby_update");
  check("未指定模式时缺省为死斗", legacyLobby?.mode === "deathmatch",
    `mode=${legacyLobby?.mode}`);
  check("缺省模式房间创建成功", !!legacyRoom?.roomId);
  legacy.close();
}

main()
  .then(() => {
    console.log(results.join("\n"));
    console.log(failures === 0 ? `\nALL PASS (${results.length} checks)` : `\nFAILED ${failures}`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("测试异常:", err);
    console.log(results.join("\n"));
    process.exit(1);
  });
