import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { RoomManager } from "./room";
import type { ClientMessage, ServerMessage } from "./protocol";
import type { ClientContext } from "./types";

const PORT = 8080;
const manager = new RoomManager();
const contexts = new Map<WebSocket, ClientContext>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function validNickname(n: unknown): n is string {
  return typeof n === "string" && n.length >= 1 && n.length <= 12;
}

const wss = new WebSocketServer({ host: "0.0.0.0", port: PORT, path: "/ws" });

wss.on("connection", (ws) => {
  const ctx: ClientContext = {
    playerId: randomUUID(),
    roomId: null,
    isSpectator: false,
  };
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
    } catch (err) {
      console.error("[handleMessage]", err);
      send(ws, {
        type: "room_error",
        code: "SERVER_ERROR",
        message: "服务器错误，请重试",
      });
    }
  });

  ws.on("close", () => {
    if (ctx.roomId) {
      manager.getRoom(ctx.roomId)?.removePlayer(ctx.playerId);
    }
    contexts.delete(ws);
  });

  ws.on("error", () => ws.close());
});

function handleMessage(
  ws: WebSocket,
  ctx: ClientContext,
  msg: ClientMessage
): void {
  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong" });
      return;

    case "list_rooms": {
      send(ws, { type: "room_list", rooms: manager.listRooms() });
      return;
    }

    case "create_room": {
      if (ctx.roomId) return;
      if (!validNickname(msg.nickname)) {
        send(ws, {
          type: "room_error",
          code: "SERVER_ERROR",
          message: "昵称长度应为 1~12 个字符",
        });
        return;
      }
      const room = manager.createRoom(ws, ctx.playerId, msg.nickname);
      ctx.roomId = room.roomId;
      send(ws, {
        type: "room_created",
        roomId: room.roomId,
        playerId: ctx.playerId,
        isHost: true,
      });
      // 先发 room_created 再广播大厅状态，保证创建者不丢 lobby_update
      room.broadcastLobby();
      return;
    }

    case "join_room": {
      if (ctx.roomId) return;
      if (!validNickname(msg.nickname)) {
        send(ws, {
          type: "room_error",
          code: "SERVER_ERROR",
          message: "昵称长度应为 1~12 个字符",
        });
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

    case "start_game": {
      if (!ctx.roomId) return;
      manager.getRoom(ctx.roomId)?.startGame(ctx.playerId);
      return;
    }

    case "player_input": {
      if (!ctx.roomId || ctx.isSpectator) return;
      const room = manager.getRoom(ctx.roomId);
      const player = room?.players.get(ctx.playerId);
      if (room?.game && player) room.game.handleInput(player, msg);
      return;
    }

    case "shoot": {
      if (!ctx.roomId || ctx.isSpectator) return;
      const room = manager.getRoom(ctx.roomId);
      const player = room?.players.get(ctx.playerId);
      if (room?.game && player) room.game.handleShoot(player);
      return;
    }
  }
}

console.log(`[aitank-server] WebSocket listening on ws://0.0.0.0:${PORT}/ws`);
