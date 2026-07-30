// 主动退出后回归本局验证：
// 退出即判定淘汰（防止用退出规避伤害），但席位与凭证保留至本局结束；
// 死斗模式回归后复活参战，经典模式回归后仅能观战。
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

  async wait(type: string, ms = 8000): Promise<any> {
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

// 开一局三人对战：主动退出后房间仍需 2 人以上，否则经典模式会立即结束
async function startMatch(mode: "deathmatch" | "classic") {
  const a = new Client();
  const b = new Client();
  const c = new Client();
  await a.open();
  await b.open();
  await c.open();

  a.send({ type: "create_room", nickname: "A", mode });
  const created = await a.wait("room_created");
  const roomId = created.roomId as string;

  b.send({ type: "join_room", nickname: "B", roomId });
  const bJoin = await b.wait("room_joined");
  c.send({ type: "join_room", nickname: "C", roomId });
  await c.wait("room_joined");

  a.send({ type: "start_game" });
  await a.wait("world_snapshot", 10000);

  return {
    a,
    b,
    c,
    roomId,
    bToken: bJoin.sessionToken as string,
    bId: bJoin.playerId as string,
  };
}

async function main(): Promise<void> {
  // ── 死斗模式：退出即淘汰，回归后复活参战 ──
  const dm = await startMatch("deathmatch");

  dm.b.send({ type: "leave_room" });
  await sleep(500);

  const elimEvent = dm.a.rx.find(
    (m) => m.type === "player_eliminated" && m.playerId === dm.bId
  );
  check("死斗：主动退出即判定淘汰", !!elimEvent, elimEvent ? "已淘汰" : "未淘汰");

  // 凭证不作废，可回归
  const dmBack = new Client();
  await dmBack.open();
  dmBack.send({ type: "rejoin_room", roomId: dm.roomId, sessionToken: dm.bToken });
  const dmOk = await dmBack.wait("rejoin_success");
  check("死斗：退出后可回归", !!dmOk, dmOk ? "成功" : "失败");
  check("死斗：回归为参战身份", dmOk?.isSpectator === false,
    `isSpectator=${dmOk?.isSpectator}`);
  check("死斗：回归保持原 playerId", dmOk?.playerId === dm.bId);

  // 等待复活（3 秒）后应重新存活
  await sleep(4000);
  const dmSnap = dmBack.last("world_snapshot");
  const dmMe = dmSnap?.players?.find((p: any) => p.playerId === dm.bId);
  check("死斗：回归后完成复活", dmMe?.alive === true, `alive=${dmMe?.alive}`);

  // 回归后应能正常操作
  const posBefore = { x: dmMe?.x, y: dmMe?.y };
  dmBack.send({ type: "player_input", seq: 1, up: false, down: true, left: false, right: false });
  await sleep(700);
  const moveSnap = dmBack.last("world_snapshot");
  const posAfter = moveSnap?.players?.find((p: any) => p.playerId === dm.bId);
  check("死斗：回归后输入生效",
    posBefore.x !== posAfter?.x || posBefore.y !== posAfter?.y,
    `${posBefore.x},${posBefore.y} -> ${posAfter?.x},${posAfter?.y}`);

  dm.a.close();
  dm.c.close();
  dmBack.close();

  // ── 经典模式：退出即淘汰且不复活，回归后仅能观战 ──
  const cl = await startMatch("classic");

  cl.b.send({ type: "leave_room" });
  await sleep(500);

  const clBack = new Client();
  await clBack.open();
  clBack.send({ type: "rejoin_room", roomId: cl.roomId, sessionToken: cl.bToken });
  const clOk = await clBack.wait("rejoin_success");
  check("经典：退出后可回归", !!clOk, clOk ? "成功" : "失败");
  check("经典：回归为观战身份", clOk?.isSpectator === true,
    `isSpectator=${clOk?.isSpectator}`);

  // 等待超过复活延迟，确认不复活
  await sleep(4000);
  const clSnap = clBack.last("world_snapshot");
  const clMe = clSnap?.players?.find((p: any) => p.playerId === cl.bId);
  check("经典：回归后仍为淘汰状态", clMe?.alive === false, `alive=${clMe?.alive}`);

  cl.a.close();
  cl.c.close();
  clBack.close();

  // ── 本局结束后凭证失效 ──
  const fin = await startMatch("classic");
  fin.b.send({ type: "leave_room" });
  await sleep(300);
  // 再让 C 退出，仅剩 A 一人，经典模式立即结束
  fin.c.send({ type: "leave_room" });
  const over = await fin.a.wait("game_over", 6000);
  check("对局已结束", !!over, over ? `reason=${over.reason}` : "未结束");

  await sleep(500);
  const late = new Client();
  await late.open();
  late.send({ type: "rejoin_room", roomId: fin.roomId, sessionToken: fin.bToken });
  const lateErr = await late.wait("room_error", 4000);
  const lateOk = late.rx.find((m) => m.type === "rejoin_success");
  // 对局结束后房间可能已销毁，回归应失败（返回错误或无响应，但不应成功）
  check("结束后无法回归", !lateOk,
    lateErr ? `code=${lateErr.code}` : lateOk ? "仍成功" : "无响应");

  fin.a.close();
  late.close();
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
