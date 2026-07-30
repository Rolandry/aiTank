import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { GAME_CONFIG, PLAYER_COLORS } from "./protocol";
import type {
  GameMode,
  MapThemeChoice,
  LeaderboardEntry,
  LobbyUpdate,
  ObstacleSnapshot,
  PlayerInfo,
  RoomListItem,
  ServerMessage,
} from "./protocol";
import { generateMap, type MapTheme } from "./map";
import { GameWorld, RESPAWN_DELAY_MS } from "./game";
import type { RoomStatus, ServerPlayer } from "./types";

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export class Room {
  readonly players = new Map<string, ServerPlayer>(); // 插入序 = 加入序
  private spectators = new Map<string, WebSocket>();
  status: RoomStatus = "waiting";
  hostId = "";
  game: GameWorld | null = null;
  winnerId: string | null = null;
  isDraw = false;
  obstacles: ObstacleSnapshot[] = []; // 开局时随机生成
  mapTheme: MapTheme = "grass_jungle"; // 地图主题
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public readonly roomId: string,
    private onEmpty: () => void,
    public readonly mode: GameMode = "deathmatch",
    public readonly themeChoice: MapThemeChoice = "random"
  ) {}

  addPlayer(
    socket: WebSocket,
    playerId: string,
    nickname: string
  ): ServerPlayer {
    const player: ServerPlayer = {
      playerId,
      nickname,
      color: PLAYER_COLORS[this.players.size % PLAYER_COLORS.length],
      socket,
      x: 0,
      y: 0,
      direction: "up",
      hp: GAME_CONFIG.maxHp,
      alive: true,
      hitCount: 0,
      kills: 0,
      respawnAt: null,
      lastShootTime: 0,
      activeBullets: 0,
      input: { up: false, down: false, left: false, right: false },
      lastInputSeq: 0,
      connected: true,
      sessionToken: randomUUID(),
      disconnectedAt: null,
      effects: new Map(),
      shield: 0,
      lastDashTime: 0,
    };
    this.players.set(playerId, player);
    if (!this.hostId) this.hostId = playerId;
    // 注意：不在此处广播 lobby_update。
    // 调用方必须先把 room_created/room_joined 发给当前连接，
    // 再调 broadcastLobby()，否则客户端还在首页，会丢弃大厅消息。
    return player;
  }

  addSpectator(socket: WebSocket, playerId: string): void {
    this.spectators.set(playerId, socket);
    // 立即下发当前世界快照，观战者马上能看到战场
    if (this.game) send(socket, this.game.buildSnapshot());
  }

  hasSpectator(playerId: string): boolean {
    return this.spectators.has(playerId);
  }

  // 断线重连：校验凭证后把旧 socket 替换为新连接，沿用原 playerId 与战绩。
  // 席位保留至本局结束，重连后玩家直接恢复控制继续对局。
  rejoinPlayer(socket: WebSocket, sessionToken: string): ServerPlayer | null {
    const player = [...this.players.values()].find(
      (p) => p.sessionToken === sessionToken
    );
    if (!player) return null;

    player.socket = socket;
    player.connected = true;
    player.disconnectedAt = null;
    // 重连后不继承旧输入，避免断线前的按键持续生效
    player.input = { up: false, down: false, left: false, right: false };
    player.lastInputSeq = 0;

    // 兜底：无尽死斗下若死亡但没有复活计划（例如旧逻辑遗留），补上复活时间，
    // 否则玩家会永久卡在死亡状态无法继续对局。
    // 经典模式一条命，死亡即淘汰，不做补偿。
    if (
      this.status === "playing" &&
      this.mode === "deathmatch" &&
      !player.alive &&
      player.respawnAt === null
    ) {
      player.respawnAt = Date.now() + RESPAWN_DELAY_MS;
    }
    return player;
  }

  // 主动离开与断线共用，必须幂等。
  // intentional=true 表示玩家主动退出，不保留席位；
  // intentional=false 表示异常断线，对局中保留席位直到本局结束以支持重连。
  removePlayer(playerId: string, intentional = true): void {
    if (this.spectators.delete(playerId)) {
      this.checkEmpty();
      return;
    }
    const player = this.players.get(playerId);
    if (!player) return;

    if (this.status === "waiting" || this.status === "countdown") {
      this.players.delete(playerId);
      if (this.hostId === playerId) {
        // 房主转移给最早加入的剩余玩家
        this.hostId = this.players.keys().next().value ?? "";
      }
      if (this.players.size === 0) {
        this.destroy();
        return;
      }
      this.broadcastLobby();
    } else {
      // playing / finished：仅标记离线，坦克留在场上但停止响应输入。
      // 不判定淘汰，玩家重连后可直接恢复控制继续对局。
      player.connected = false;
      player.disconnectedAt = Date.now();
      // 断线后不继承旧输入，避免坦克持续移动
      player.input = { up: false, down: false, left: false, right: false };
      if (intentional) {
        // 主动退出：作废凭证并判定淘汰，席位不再保留
        player.sessionToken = "";
        if (this.status === "playing" && player.alive) {
          player.alive = false;
          player.respawnAt = null;
          this.broadcast({ type: "player_eliminated", playerId, killerId: null });
        }
      }
      this.checkEmpty();
    }
  }

  startGame(byPlayerId: string): void {
    if (this.status !== "waiting") return;
    if (byPlayerId !== this.hostId) return;
    if (this.players.size < GAME_CONFIG.minPlayers) return;
    this.startCountdown();
  }

  private startCountdown(): void {
    this.status = "countdown";
    let seconds = 3;
    const step = () => {
      if (this.status !== "countdown") return;
      if (seconds > 0) {
        this.broadcast({ type: "countdown", seconds });
        seconds--;
        this.countdownTimer = setTimeout(step, 1000);
      } else {
        this.countdownTimer = null;
        this.beginPlay();
      }
    };
    step();
  }

  private beginPlay(): void {
    this.status = "playing";
    // random 时不传参，交给 generateMap 内部的 randomTheme（会避免连续重复同一主题）
    const mapData = generateMap(
      this.themeChoice === "random" ? undefined : this.themeChoice
    );
    this.mapTheme = mapData.theme;
    this.obstacles = mapData.obstacles;
    this.game = new GameWorld(this);
    this.game.start();
    this.broadcast({ type: "countdown", seconds: 0 });
    this.broadcast(this.game.buildSnapshot());
  }

  endGame(
    winnerId: string | null,
    winnerNickname: string | null,
    isDraw: boolean,
    reason: "last_alive" | "timeout" | "all_disconnected",
    leaderboard: LeaderboardEntry[]
  ): void {
    if (this.status === "finished") return;
    this.status = "finished";
    this.winnerId = winnerId;
    this.isDraw = isDraw;
    this.game?.stop();
    if (this.game) this.broadcast(this.game.buildSnapshot());
    this.broadcast({
      type: "game_over",
      winnerId,
      winnerNickname,
      isDraw,
      reason,
      leaderboard,
    });
  }

  broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.connected && p.socket.readyState === WebSocket.OPEN) {
        p.socket.send(data);
      }
    }
    for (const ws of this.spectators.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  getPlayerList(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      color: p.color,
      isHost: p.playerId === this.hostId,
    }));
  }

  broadcastLobby(): void {
    const msg: LobbyUpdate = {
      type: "lobby_update",
      players: this.getPlayerList(),
      hostId: this.hostId,
      canStart:
        this.status === "waiting" &&
        this.players.size >= GAME_CONFIG.minPlayers,
      mode: this.mode,
      // 开局后展示实际主题，等待阶段展示房主的选择（可能是 random）
      mapTheme: this.status === "waiting" ? this.themeChoice : this.mapTheme,
    };
    this.broadcast(msg);
  }

  private checkEmpty(): void {
    const anyConnected =
      [...this.players.values()].some((p) => p.connected) ||
      this.spectators.size > 0;
    if (this.players.size === 0 || !anyConnected) this.destroy();
  }

  private destroy(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.game?.stop();
    this.onEmpty();
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(
    socket: WebSocket,
    playerId: string,
    nickname: string,
    mode: GameMode = "deathmatch",
    themeChoice: MapThemeChoice = "random"
  ): Room {
    const roomId = this.generateRoomId();
    const room = new Room(
      roomId,
      () => this.rooms.delete(roomId),
      mode,
      themeChoice
    );
    this.rooms.set(roomId, room);
    room.addPlayer(socket, playerId, nickname);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  listRooms(): RoomListItem[] {
    return [...this.rooms.values()]
      .filter((r) => r.status === "waiting")
      .map((r) => ({
        roomId: r.roomId,
        hostNickname: r.players.get(r.hostId)?.nickname ?? "未知",
        playerCount: r.players.size,
        maxPlayers: GAME_CONFIG.maxPlayers,
        status: r.status,
        mode: r.mode,
        mapTheme: r.status === "waiting" ? r.themeChoice : r.mapTheme,
      }));
  }

  // 返回值表示加入结果，供入口层绑定连接上下文
  joinRoom(
    socket: WebSocket,
    playerId: string,
    nickname: string,
    roomId: string
  ): "player" | "spectator" | "error" {
    const room = this.rooms.get(roomId);
    if (!room) {
      send(socket, {
        type: "room_error",
        code: "ROOM_NOT_FOUND",
        message: "房间不存在",
      });
      return "error";
    }

    // 已结束：MVP 不支持原房间重开
    if (room.status === "finished") {
      send(socket, {
        type: "room_error",
        code: "GAME_ALREADY_STARTED",
        message: "本局已结束，请创建新房间",
      });
      return "error";
    }

    // 倒计时/游戏中：作为观战者加入
    if (room.status !== "waiting") {
      room.addSpectator(socket, playerId);
      send(socket, {
        type: "room_joined",
        roomId,
        playerId,
        isHost: false,
        players: [],
        gameStatus: "playing",
        sessionToken: "", // 观战者无席位，不支持重连恢复
      });
      return "spectator";
    }

    // 等待中但已满
    if (room.players.size >= GAME_CONFIG.maxPlayers) {
      send(socket, {
        type: "room_error",
        code: "ROOM_FULL",
        message: "房间人数已满",
      });
      return "error";
    }

    const player = room.addPlayer(socket, playerId, nickname);
    send(socket, {
      type: "room_joined",
      roomId,
      playerId,
      isHost: player.playerId === room.hostId,
      players: room.getPlayerList(),
      gameStatus: "waiting",
      sessionToken: player.sessionToken,
    });
    // 先发 room_joined 再广播大厅状态，保证新加入者不丢 lobby_update
    room.broadcastLobby();
    return "player";
  }

  private generateRoomId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let attempt = 0; attempt < 100; attempt++) {
      let id = "";
      for (let i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!this.rooms.has(id)) return id;
    }
    throw new Error("无法分配房间号");
  }
}
