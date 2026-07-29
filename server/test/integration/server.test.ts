import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { RoomManager } from "../../src/room";
import { randomUUID } from "node:crypto";
import type { ClientMessage, ServerMessage } from "../../src/protocol";
import type { ClientContext } from "../../src/types";

const PORT = 9876;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

let wss: WebSocketServer;
const manager = new RoomManager();
const contexts = new Map<WebSocket, ClientContext>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function validNickname(n: unknown): n is string {
  return typeof n === "string" && n.length >= 1 && n.length <= 12;
}

function handleMessage(ws: WebSocket, ctx: ClientContext, msg: ClientMessage): void {
  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong", timestamp: msg.timestamp, serverTime: Date.now() });
      return;
    case "list_rooms":
      send(ws, { type: "room_list", rooms: manager.listRooms() });
      return;
    case "create_room": {
      if (ctx.roomId) return;
      if (!validNickname(msg.nickname)) {
        send(ws, { type: "room_error", code: "SERVER_ERROR", message: "昵称长度应为 1~12 个字符" });
        return;
      }
      const room = manager.createRoom(ws, ctx.playerId, msg.nickname);
      ctx.roomId = room.roomId;
      send(ws, { type: "room_created", roomId: room.roomId, playerId: ctx.playerId, isHost: true });
      room.broadcastLobby();
      return;
    }
    case "join_room": {
      if (ctx.roomId) return;
      if (!validNickname(msg.nickname)) {
        send(ws, { type: "room_error", code: "SERVER_ERROR", message: "昵称长度应为 1~12 个字符" });
        return;
      }
      const roomId = String(msg.roomId ?? "").toUpperCase();
      const result = manager.joinRoom(ws, ctx.playerId, msg.nickname, roomId);
      if (result !== "error") {
        ctx.roomId = roomId;
        ctx.isSpectator = result === "spectator";
      }
      return;
    }
    case "leave_room": {
      if (ctx.roomId) {
        manager.getRoom(ctx.roomId)?.removePlayer(ctx.playerId);
        ctx.roomId = null;
        ctx.isSpectator = false;
      }
      return;
    }
    default: {
      send(ws, { type: "room_error", code: "SERVER_ERROR", message: "未知消息类型" });
      return;
    }
  }
}

beforeAll(async () => {
  wss = new WebSocketServer({ host: "127.0.0.1", port: PORT, path: "/ws" });
  wss.on("connection", (ws) => {
    const ctx: ClientContext = { playerId: randomUUID(), roomId: null, isSpectator: false };
    contexts.set(ws, ctx);
    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        handleMessage(ws, ctx, msg);
      } catch {
        send(ws, { type: "room_error", code: "SERVER_ERROR", message: "服务器错误" });
      }
    });
    ws.on("close", () => {
      if (ctx.roomId) manager.getRoom(ctx.roomId)?.removePlayer(ctx.playerId);
      contexts.delete(ws);
    });
  });
  await new Promise<void>((resolve) => wss.on("listening", () => resolve()));
});

afterAll(() => {
  wss?.close();
});

function connectClient(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => resolve(ws));
  });
}

function sendMessage(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws: WebSocket, type: string, timeout = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${type} 超时`)), timeout);
    const handler = (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === type) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(msg);
        }
      } catch {}
    };
    ws.on("message", handler);
  });
}

describe("服务端 WebSocket 集成测试", () => {
  it("ping → pong 带时间戳", async () => {
    const ws = await connectClient();
    const ts = Date.now();
    sendMessage(ws, { type: "ping", timestamp: ts });
    const pong = await waitForMessage(ws, "pong");
    expect(pong.timestamp).toBe(ts);
    expect(pong.serverTime).toBeDefined();
    ws.close();
  });

  it("list_rooms → room_list", async () => {
    const ws = await connectClient();
    sendMessage(ws, { type: "list_rooms" });
    const msg = await waitForMessage(ws, "room_list");
    expect(msg.rooms).toBeInstanceOf(Array);
    ws.close();
  });

  it("create_room → room_created", async () => {
    const ws = await connectClient();
    sendMessage(ws, { type: "create_room", nickname: "Tester" });
    const msg = await waitForMessage(ws, "room_created");
    expect(msg.roomId).toHaveLength(4);
    expect(msg.playerId).toBeDefined();
    expect(msg.isHost).toBe(true);
    ws.close();
  });

  it("无效昵称 → room_error", async () => {
    const ws = await connectClient();
    sendMessage(ws, { type: "create_room", nickname: "" });
    const msg = await waitForMessage(ws, "room_error");
    expect(msg.code).toBe("SERVER_ERROR");
    expect(msg.message).toContain("昵称");
    ws.close();
  });

  it("未知消息类型 → room_error", async () => {
    const ws = await connectClient();
    sendMessage(ws, { type: "unknown_type" });
    const msg = await waitForMessage(ws, "room_error");
    expect(msg.message).toContain("未知");
    ws.close();
  });

  it("join_room 不存在的房间 → room_error", async () => {
    const ws = await connectClient();
    sendMessage(ws, { type: "join_room", nickname: "Tester", roomId: "ZZZZ" });
    const msg = await waitForMessage(ws, "room_error");
    expect(msg.code).toBe("ROOM_NOT_FOUND");
    ws.close();
  });

  it("create_room + join_room 完整流程", async () => {
    const ws1 = await connectClient();
    sendMessage(ws1, { type: "create_room", nickname: "Host" });
    const created = await waitForMessage(ws1, "room_created");

    const ws2 = await connectClient();
    const lobbyPromise = waitForMessage(ws2, "lobby_update");
    sendMessage(ws2, { type: "join_room", nickname: "Guest", roomId: created.roomId });
    const joined = await waitForMessage(ws2, "room_joined");
    expect(joined.roomId).toBe(created.roomId);
    expect(joined.gameStatus).toBe("waiting");

    const lobby = await lobbyPromise;
    expect(lobby.players).toHaveLength(2);

    ws1.close();
    ws2.close();
  });
});
