import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { Room, RoomManager } from "../../src/room";
import { GAME_CONFIG } from "../../src/protocol";

function createMockSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe("Room", () => {
  let room: Room;
  let onEmpty: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onEmpty = vi.fn();
    room = new Room("ABCD", onEmpty);
  });

  it("addPlayer 设置第一个玩家为房主", () => {
    const ws = createMockSocket();
    const player = room.addPlayer(ws, "p1", "Alice");
    expect(room.hostId).toBe("p1");
    expect(player.color).toBe("red");
    expect(room.players.size).toBe(1);
  });

  it("addPlayer 按顺序分配颜色", () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    room.addPlayer(ws1, "p1", "Alice");
    const p2 = room.addPlayer(ws2, "p2", "Bob");
    expect(p2.color).toBe("blue");
  });

  it("removePlayer 等待中离开 + 转移房主", () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    room.addPlayer(ws1, "p1", "Alice");
    room.addPlayer(ws2, "p2", "Bob");
    room.removePlayer("p1");
    expect(room.hostId).toBe("p2");
    expect(room.players.size).toBe(1);
  });

  it("removePlayer 所有人离开 → destroy", () => {
    const ws = createMockSocket();
    room.addPlayer(ws, "p1", "Alice");
    room.removePlayer("p1");
    expect(onEmpty).toHaveBeenCalled();
  });

  it("removePlayer 游戏中断线 → 淘汰", () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    room.addPlayer(ws1, "p1", "Alice");
    room.addPlayer(ws2, "p2", "Bob");
    room.status = "playing";
    room.removePlayer("p1");
    const p1 = room.players.get("p1");
    expect(p1?.connected).toBe(false);
    expect(p1?.alive).toBe(false);
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it("broadcastLobby 发送正确的大厅消息", () => {
    const ws = createMockSocket();
    room.addPlayer(ws, "p1", "Alice");
    room.broadcastLobby();
    expect(ws.send).toHaveBeenCalled();
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent.type).toBe("lobby_update");
    expect(sent.players).toHaveLength(1);
    expect(sent.hostId).toBe("p1");
    expect(sent.canStart).toBe(false);
  });

  it("startGame 非房主不能开始", () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    room.addPlayer(ws1, "p1", "Alice");
    room.addPlayer(ws2, "p2", "Bob");
    room.startGame("p2");
    expect(room.status).toBe("waiting");
  });

  it("startGame 人数不足不能开始", () => {
    const ws = createMockSocket();
    room.addPlayer(ws, "p1", "Alice");
    room.startGame("p1");
    expect(room.status).toBe("waiting");
  });
});

describe("RoomManager", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it("createRoom 返回唯一房间号", () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    const room1 = manager.createRoom(ws1, "p1", "Alice");
    const room2 = manager.createRoom(ws2, "p2", "Bob");
    expect(room1.roomId).not.toBe(room2.roomId);
  });

  it("joinRoom 不存在的房间 → error", () => {
    const ws = createMockSocket();
    const result = manager.joinRoom(ws, "p1", "Alice", "ZZZZ");
    expect(result).toBe("error");
  });

  it("joinRoom 满房 → error", () => {
    const sockets = Array.from({ length: GAME_CONFIG.maxPlayers }, () => createMockSocket());
    const room = manager.createRoom(sockets[0], "p0", "Host");
    for (let i = 1; i < GAME_CONFIG.maxPlayers; i++) {
      manager.joinRoom(sockets[i], `p${i}`, `Player${i}`, room.roomId);
    }
    const extraWs = createMockSocket();
    const result = manager.joinRoom(extraWs, "p99", "Extra", room.roomId);
    expect(result).toBe("error");
  });

  it("listRooms 只返回 waiting 状态的房间", () => {
    const ws = createMockSocket();
    manager.createRoom(ws, "p1", "Alice");
    const rooms = manager.listRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].status).toBe("waiting");
    expect(rooms[0].playerCount).toBe(1);
  });
});
