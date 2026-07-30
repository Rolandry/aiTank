// 地图主题选择验证：指定主题必须生效，随机落在合法集合内，非法值回退随机。
import { WebSocket } from "ws";
import { MAP_THEME_LABEL } from "../src/protocol";

const URL = process.env.WS_URL ?? "ws://127.0.0.1:8080/ws";
const THEMES = Object.keys(MAP_THEME_LABEL) as (keyof typeof MAP_THEME_LABEL)[];
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

// 用指定主题开一局，返回开局后的实际主题与等待阶段的展示值
async function openMatch(mapTheme?: string) {
  const a = new Client();
  const b = new Client();
  await a.open();
  await b.open();

  const req: any = { type: "create_room", nickname: "A" };
  if (mapTheme !== undefined) req.mapTheme = mapTheme;
  a.send(req);
  const created = await a.wait("room_created");
  const roomId = created.roomId as string;

  b.send({ type: "join_room", nickname: "B", roomId });
  await b.wait("room_joined");

  // 等待阶段的大厅展示值
  const waitingLobby = a.last("lobby_update");

  a.send({ type: "start_game" });
  const snap = await a.wait("world_snapshot", 10000);
  const actual = snap?.mapTheme as string | undefined;

  a.close();
  b.close();
  return { actual, waitingTheme: waitingLobby?.mapTheme as string | undefined };
}

async function main(): Promise<void> {
  // ── 四个主题逐一验证 ──
  for (const theme of THEMES) {
    const { actual, waitingTheme } = await openMatch(theme);
    check(`指定 ${theme} 生效`, actual === theme, `实际=${actual}`);
    check(`等待阶段展示 ${theme}`, waitingTheme === theme, `展示=${waitingTheme}`);
  }

  // ── 随机主题：落在合法集合内，等待阶段展示 random ──
  const rand = await openMatch("random");
  check("随机主题落在合法集合", THEMES.includes(rand.actual as never),
    `实际=${rand.actual}`);
  check("等待阶段展示 random", rand.waitingTheme === "random",
    `展示=${rand.waitingTheme}`);

  // ── 非法值回退为随机 ──
  const bad = await openMatch("not_a_theme");
  check("非法主题回退为随机", THEMES.includes(bad.actual as never),
    `实际=${bad.actual}`);
  check("非法值等待阶段展示 random", bad.waitingTheme === "random",
    `展示=${bad.waitingTheme}`);

  // ── 未指定主题（旧客户端）缺省随机 ──
  const legacy = await openMatch(undefined);
  check("未指定主题缺省随机", THEMES.includes(legacy.actual as never),
    `实际=${legacy.actual}`);
  check("缺省等待阶段展示 random", legacy.waitingTheme === "random",
    `展示=${legacy.waitingTheme}`);

  // ── 房间列表携带主题 ──
  const lister = new Client();
  await lister.open();
  lister.send({ type: "create_room", nickname: "L", mapTheme: "city_ruins" });
  await lister.wait("room_created");
  const probe = new Client();
  await probe.open();
  probe.send({ type: "list_rooms" });
  const list = await probe.wait("room_list");
  const target = (list?.rooms ?? []).find((r: any) => r.mapTheme === "city_ruins");
  check("房间列表携带主题", !!target, target ? "找到" : "未找到");
  lister.close();
  probe.close();
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
