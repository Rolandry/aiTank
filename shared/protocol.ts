// ── 客户端 → 服务端 ──

export type CreateRoomRequest = {
  type: "create_room";
  nickname: string;
};

export type JoinRoomRequest = {
  type: "join_room";
  nickname: string;
  roomId: string;
};

export type LeaveRoomRequest = {
  type: "leave_room";
};

export type StartGameRequest = {
  type: "start_game";
};

export type PlayerInput = {
  type: "player_input";
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type ShootRequest = {
  type: "shoot";
};

export type PingRequest = {
  type: "ping";
  timestamp?: number;
};

export type ListRoomsRequest = {
  type: "list_rooms";
};

export type ClientMessage =
  | CreateRoomRequest
  | JoinRoomRequest
  | LeaveRoomRequest
  | StartGameRequest
  | PlayerInput
  | ShootRequest
  | PingRequest
  | ListRoomsRequest;

// ── 服务端 → 客户端 ──

export type PlayerInfo = {
  playerId: string;
  nickname: string;
  color: string;
  isHost: boolean;
};

export type RoomCreatedResponse = {
  type: "room_created";
  roomId: string;
  playerId: string;
  isHost: true;
};

export type RoomJoinedResponse = {
  type: "room_joined";
  roomId: string;
  playerId: string;
  isHost: boolean;
  players: PlayerInfo[];
  gameStatus: "waiting" | "playing";
};

export type RoomErrorResponse = {
  type: "room_error";
  code: "ROOM_NOT_FOUND" | "ROOM_FULL" | "GAME_ALREADY_STARTED" | "SERVER_ERROR";
  message: string;
};

export type LobbyUpdate = {
  type: "lobby_update";
  players: PlayerInfo[];
  hostId: string;
  canStart: boolean;
};

export type CountdownEvent = {
  type: "countdown";
  seconds: number;
};

export type PlayerSnapshot = {
  playerId: string;
  nickname: string;
  color: string;
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
  hp: number;
  alive: boolean;
  hitCount: number;
};

export type BulletSnapshot = {
  bulletId: string;
  ownerId: string;
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
};

export type ObstacleSnapshot = {
  obstacleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string; // 障碍物类型：grass_jungle_tree / desert_gobi_stone 等
  destructible: boolean; // 是否可破坏
  hp?: number; // 当前生命值（可破坏障碍物）
  maxHp?: number; // 最大生命值（可破坏障碍物）
};

export type WorldSnapshot = {
  type: "world_snapshot";
  tick: number;
  roomId: string;
  status: "waiting" | "countdown" | "playing" | "finished";
  remainingTimeMs: number;
  players: PlayerSnapshot[];
  bullets: BulletSnapshot[];
  obstacles: ObstacleSnapshot[];
  winnerId: string | null;
  isDraw: boolean;
  mapTheme?: string; // 地图主题：grass_jungle / desert_gobi / snow_tundra / city_ruins
};

export type PlayerHitEvent = {
  type: "player_hit";
  targetId: string;
  newHp: number;
  bulletId: string;
};

export type PlayerEliminatedEvent = {
  type: "player_eliminated";
  playerId: string;
};

export type GameOverEvent = {
  type: "game_over";
  winnerId: string | null;
  winnerNickname: string | null;
  isDraw: boolean;
  reason: "last_alive" | "timeout" | "all_disconnected";
};

// 障碍物被破坏事件
export type ObstacleDestroyedEvent = {
  type: "obstacle_destroyed";
  obstacleId: string;
  x: number;
  y: number;
};

// 障碍物受伤事件
export type ObstacleHitEvent = {
  type: "obstacle_hit";
  obstacleId: string;
  newHp: number;
};

export type PongResponse = {
  type: "pong";
  timestamp?: number;
  serverTime?: number;
};

export type RoomListItem = {
  roomId: string;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  status: "waiting" | "countdown" | "playing" | "finished";
};

export type RoomListResponse = {
  type: "room_list";
  rooms: RoomListItem[];
};

export type ServerMessage =
  | RoomCreatedResponse
  | RoomJoinedResponse
  | RoomErrorResponse
  | LobbyUpdate
  | CountdownEvent
  | WorldSnapshot
  | PlayerHitEvent
  | PlayerEliminatedEvent
  | GameOverEvent
  | ObstacleDestroyedEvent
  | ObstacleHitEvent
  | PongResponse
  | RoomListResponse;

// ── 游戏常量 ──

export const GAME_CONFIG = {
  mapWidth: 1024,
  mapHeight: 768,
  tankSize: 48,
  tankAssetSize: 64,
  bulletSize: 12,
  bulletAssetSize: 16,
  obstacleSize: 64,
  maxHp: 3,
  shootCooldownMs: 500,
  maxBulletsPerPlayer: 3,
  tickRate: 60,
  gameDurationSeconds: 120,
  minPlayers: 2,
  maxPlayers: 4,
  hitFlashDurationMs: 200,
  explosionFrameCount: 4,
  explosionFrameDurationMs: 100,
} as const;

export const PLAYER_COLORS = ["red", "blue", "green", "yellow"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];
