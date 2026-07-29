import { describe, it, expect } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { RoomManager } from "../../src/room";
import { GAME_CONFIG } from "../../src/protocol";
import { randomUUID } from "node:crypto";
import type { ClientContext } from "../../src/types";

const PORT = 9877;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

let wss: WebSocketServer;
const manager = new RoomManager();
const contexts = new Map<WebSocket, ClientContext>();

beforeAll(async () => {
  wss = new WebSocketServer({ host: "127.0.0.1", port: PORT, path: "/ws" });
  wss.on("connection", (ws) => {
    const ctx: ClientContext = { playerId: randomUUID(), roomId: null, isSpectator: false };
    contexts.set(ws, ctx);
    ws.on("message", (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === "create_room") {
        const room = manager.createRoom(ws, ctx.playerId, msg.nickname);
        ctx.roomId = room.roomId;
        ws.send(JSON.stringify({ type: "room_created", roomId: room.roomId, playerId: ctx.playerId, isHost: true }));
      }
      if (msg.type === "player_input" && ctx.roomId) {
        const room = manager.getRoom(ctx.roomId);
        const player = room?.players.get(ctx.playerId);
        if (room?.game && player) room.game.handleInput(player, msg);
      }
    });
    ws.on("close", () => {
      if (ctx.roomId) manager.getRoom(ctx.roomId)?.removePlayer(ctx.playerId);
      contexts.delete(ws);
    });
  });
  await new Promise<void>((resolve) => wss.on("listening", () => resolve()));
});

afterAll(() => wss?.close());

import { beforeAll, afterAll } from "vitest";

describe("压力测试", () => {
  it("50 个客户端同时连接和创建房间", async () => {
    const clientCount = 50;
    const clients: WebSocket[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < clientCount; i++) {
      const ws = new WebSocket(WS_URL);
      clients.push(ws);
      promises.push(new Promise((resolve, reject) => {
        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "create_room", nickname: `Bot${i}` }));
        });
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "room_created") resolve();
        });
        ws.on("error", reject);
        setTimeout(() => resolve(), 1000);
      }));
    }

    await Promise.all(promises);
    expect(clients).toHaveLength(clientCount);

    const rooms = manager.listRooms();
    expect(rooms.length).toBeGreaterThanOrEqual(clientCount * 0.9);

    clients.forEach((ws) => ws.close());
  });

  it("单房间高频输入不崩溃", async () => {
    const ws = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    const roomCreated = await new Promise<string>((resolve) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "room_created") resolve(msg.roomId);
      });
      ws.send(JSON.stringify({ type: "create_room", nickname: "StressBot" }));
    });

    const inputCount = 1000;
    const startTime = Date.now();
    for (let i = 0; i < inputCount; i++) {
      ws.send(JSON.stringify({
        type: "player_input",
        seq: i + 1,
        up: i % 2 === 0,
        down: false,
        left: false,
        right: false,
      }));
    }

    await new Promise((r) => setTimeout(r, 200));
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(2000);
    ws.close();
  });
});
