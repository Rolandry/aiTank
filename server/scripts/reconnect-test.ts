// 断线重连与主动退出的端到端验证：连接真实服务端，模拟异常断线与主动退出。
import { WebSocket } from "ws";

const URL = process.env.WS_URL ?? "ws://127.0.0.1:8080/ws";
const results: string[] = [];
let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
  if (!passed) failures++;
  results.push(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

type Msg = { type: string; [key: string]: any };

// 每个客户端维护自己的消息队列，便于按类型等待
class Client {
  ws: WebSocket;
  received: Msg[] = [];

  constructor() {
    this.ws = new WebSocket(URL);
    this.ws.on("message", (raw) => {
      try {
        this.received.push(JSON.parse(raw.toString()));
      } catch {
        // 忽略非 JSON
      }
    });
  }

  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
  }

  send(msg: Msg): void {
    this.ws.send(JSON.stringify(msg));
  }

  async wait(type: string, timeoutMs = 3000): Promise<Msg | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.received.find((m) => m.type === type);
      if (found) return found;
      await sleep(30);
    }
    return null;
  }

  // 模拟异常断线：terminate 不发送关闭帧，等同拔网线
  kill(): void {
    this.ws.terminate();
  }

  close(): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  // ── 场景 1：对局中异常断线后重连，恢复原身份 ──
  const host = new Client();
  const guest = new Client();
  await host.open();
  await guest.open();

  host.send({ type: "create_room", nickname: "主机" });
  const created = await host.wait("room_created");
  check("创建房间下发 sessionToken", !!created?.sessionToken, created?.sessionToken ? "有" : "缺失");
  const roomId = created!.roomId as string;
  const hostToken = created!.sessionToken as string;
  const hostId = created!.playerId as string;

  guest.send({ type: "join_room", nickname: "访客", roomId });
  const joined = await guest.wait("room_joined");
  check("加入房间下发 sessionToken", !!joined?.sessionToken);
  const guestToken = joined!.sessionToken as string;
  const guestId = joined!.playerId as string;

  host.send({ type: "start_game" });
  const snapshot = await host.wait("world_snapshot", 8000);
  check("对局已开始", !!snapshot, snapshot ? `tick=${snapshot.tick}` : "无快照");

  // 记录断线前状态，用于比对恢复结果
  const before = (snapshot!.players as any[]).find((p) => p.playerId === guestId);
  check("断线前访客存活", before?.alive === true);

  guest.kill();
  await sleep(600);

  // 断线不判定淘汰：坦克留在场上，玩家仍存活
  const duringSnap = await host.wait("world_snapshot", 3000);
  const during = (duringSnap!.players as any[]).find((p) => p.playerId === guestId);
  check("断线不立即判定淘汰", during?.alive === true,
    `alive=${during?.alive}`);

  // 席位应保留：房间仍存在且能被重连找回
  const rejoined = new Client();
  await rejoined.open();
  rejoined.send({ type: "rejoin_room", roomId, sessionToken: guestToken });
  const success = await rejoined.wait("rejoin_success");
  check("断线后可重连", !!success, success ? "成功" : "失败");
  check("重连恢复原 playerId", success?.playerId === guestId,
    `${success?.playerId} vs ${guestId}`);
  check("重连后可继续游戏（非观战）", success?.isSpectator === false,
    `isSpectator=${success?.isSpectator}`);

  const hostNotice = await host.wait("player_reconnected");
  check("广播重连通知", hostNotice?.playerId === guestId);

  const afterSnap = await rejoined.wait("world_snapshot", 3000);
  check("重连后收到世界快照", !!afterSnap);

  // 重连后应能正常操作：发送移动指令使坦克位移
  const posBefore = (afterSnap!.players as any[]).find((p) => p.playerId === guestId);
  rejoined.send({ type: "player_input", seq: 1, up: false, down: true, left: false, right: false });
  await sleep(700);
  const moveSnap = rejoined.received.filter((m) => m.type === "world_snapshot").at(-1);
  const posAfter = (moveSnap?.players as any[])?.find((p) => p.playerId === guestId);
  const moved = posBefore && posAfter &&
    (posBefore.x !== posAfter.x || posBefore.y !== posAfter.y);
  check("重连后输入生效可移动", !!moved,
    `${posBefore?.x},${posBefore?.y} -> ${posAfter?.x},${posAfter?.y}`);

  // ── 场景 2：伪造凭证被拒绝 ──
  const faker = new Client();
  await faker.open();
  faker.send({ type: "rejoin_room", roomId, sessionToken: "forged-token-xxx" });
  const rejected = await faker.wait("room_error");
  check("伪造凭证被拒绝", rejected?.code === "REJOIN_FAILED", rejected?.code ?? "无响应");
  faker.close();

  // ── 场景 3：主动退出后凭证仍有效（席位保留至本局结束，支持手动回归）──
  // 注意：退出会判定淘汰作为代价，详见 leave-rejoin-test.ts
  rejoined.send({ type: "leave_room" });
  await sleep(400);
  const afterLeave = new Client();
  await afterLeave.open();
  afterLeave.send({ type: "rejoin_room", roomId, sessionToken: guestToken });
  const leaveOk = await afterLeave.wait("rejoin_success");
  check("主动退出后仍可回归本局", !!leaveOk,
    leaveOk ? "成功" : "失败");
  afterLeave.close();
  rejoined.close();

  // ── 场景 4：等待阶段主动退出触发房主转移 ──
  const a = new Client();
  const b = new Client();
  await a.open();
  await b.open();
  a.send({ type: "create_room", nickname: "房主A" });
  const roomA = await a.wait("room_created");
  const roomAId = roomA!.roomId as string;
  b.send({ type: "join_room", nickname: "玩家B", roomId: roomAId });
  await b.wait("room_joined");
  await sleep(300);

  a.send({ type: "leave_room" });
  await sleep(500);
  const lobby = b.received.filter((m) => m.type === "lobby_update").at(-1);
  check("房主退出后转移房主", lobby?.hostId === (await bPlayerId(b)),
    `hostId=${lobby?.hostId}`);

  a.close();
  b.close();
  host.close();
  guest.close();
}

async function bPlayerId(c: Client): Promise<string> {
  const joined = c.received.find((m) => m.type === "room_joined");
  return (joined?.playerId as string) ?? "";
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
