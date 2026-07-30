import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { RoomManager } from "./room";
import type { ClientMessage, ServerMessage, MapThemeChoice } from "./protocol";
import { MAP_THEME_CHOICES } from "./protocol";
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
      console.warn("[ws] 收到无效 JSON，已忽略");
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
      // 异常断线：对局中保留席位与凭证，允许本局结束前重连
      manager.getRoom(ctx.roomId)?.removePlayer(ctx.playerId, false);
    }
    contexts.delete(ws);
    console.log(`[ws] 连接关闭: ${ctx.playerId}`);
  });

  ws.on("error", (err) => {
    console.error(`[ws] 连接错误: ${ctx.playerId}`, err.message);
    ws.close();
  });
});

function handleMessage(
  ws: WebSocket,
  ctx: ClientContext,
  msg: ClientMessage
): void {
  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong", timestamp: msg.timestamp, serverTime: Date.now() });
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
      const mode = msg.mode === "classic" ? "classic" : "deathmatch";
      // 非法主题值回退为随机，避免客户端传错导致开局失败
      const themeChoice = MAP_THEME_CHOICES.includes(msg.mapTheme as never)
        ? (msg.mapTheme as MapThemeChoice)
        : "random";
      const room = manager.createRoom(
        ws,
        ctx.playerId,
        msg.nickname,
        mode,
        themeChoice
      );
      ctx.roomId = room.roomId;
      send(ws, {
        type: "room_created",
        roomId: room.roomId,
        playerId: ctx.playerId,
        isHost: true,
        sessionToken: room.players.get(ctx.playerId)?.sessionToken ?? "",
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
        // 主动退出：作废凭证，不保留席位
        manager.getRoom(ctx.roomId)?.removePlayer(ctx.playerId, true);
        ctx.roomId = null;
        ctx.isSpectator = false;
      }
      return;
    }

    case "rejoin_room": {
      const roomId = typeof msg.roomId === "string" ? msg.roomId.toUpperCase() : "";
      const token = typeof msg.sessionToken === "string" ? msg.sessionToken : "";
      const room = roomId && token ? manager.getRoom(roomId) : undefined;
      const player = room?.rejoinPlayer(ws, token) ?? null;

      if (!room || !player) {
        send(ws, {
          type: "room_error",
          code: "REJOIN_FAILED",
          message: "重连失败，房间或会话已失效",
        });
        return;
      }

      // 沙用原 playerId，舍弃本次连接新生成的临时 ID
      ctx.playerId = player.playerId;
      ctx.roomId = room.roomId;
      // 无尽死斗：始终以参战身份恢复，死亡会自动复活。
      // 经典模式：一条命，已死亡者只能观战。
      const asSpectator = room.mode === "classic" && !player.alive;
      ctx.isSpectator = asSpectator;

      send(ws, {
        type: "rejoin_success",
        roomId: room.roomId,
        playerId: player.playerId,
        isHost: player.playerId === room.hostId,
        isSpectator: asSpectator,
        players: room.getPlayerList(),
        gameStatus: room.status,
      });
      room.broadcast({
        type: "player_reconnected",
        playerId: player.playerId,
        nickname: player.nickname,
      });
      if (room.game) send(ws, room.game.buildSnapshot());
      else room.broadcastLobby();
      return;
    }

    case "start_game": {
      if (!ctx.roomId) return;
      manager.getRoom(ctx.roomId)?.startGame(ctx.playerId);
      return;
    }

    case "player_input": {
      if (!ctx.roomId || ctx.isSpectator) return;
      if (typeof msg.up !== "boolean" || typeof msg.down !== "boolean" ||
          typeof msg.left !== "boolean" || typeof msg.right !== "boolean") {
        console.warn(`[player_input] 无效输入字段: ${ctx.playerId}`);
        return;
      }
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

    case "dash": {
      if (!ctx.roomId || ctx.isSpectator) return;
      const room = manager.getRoom(ctx.roomId);
      const player = room?.players.get(ctx.playerId);
      if (room?.game && player) room.game.handleDash(player);
      return;
    }

    default: {
      console.warn(`[ws] 未知消息类型: ${(msg as { type: string }).type}`);
      send(ws, {
        type: "room_error",
        code: "SERVER_ERROR",
        message: "未知消息类型",
      });
      return;
    }
  }
}

console.log(`[aitank-server] WebSocket listening on ws://0.0.0.0:${PORT}/ws`);
