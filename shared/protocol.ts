// ── 客户端 → 服务端 ──

// 地图主题：唯一事实源，服务端 map.ts 从此处导入
export type MapTheme =
  | "grass_jungle"
  | "desert_gobi"
  | "snow_tundra"
  | "city_ruins";

// 创建房间时的主题偏好：random 不是主题值，仅表示交由服务端随机挑选
export type MapThemeChoice = MapTheme | "random";

export const MAP_THEME_LABEL: Record<MapTheme, string> = {
  grass_jungle: "草木丛林",
  desert_gobi: "荒漠戈壁",
  snow_tundra: "雪原冻土",
  city_ruins: "城市废墟",
};

// 合法的主题选择项（含随机），用于客户端渲染与服务端校验
export const MAP_THEME_CHOICES: MapThemeChoice[] = [
  "random",
  "grass_jungle",
  "desert_gobi",
  "snow_tundra",
  "city_ruins",
];

// 游戏模式：deathmatch 无尽死斗（无限复活、按时间结束）；classic 经典（一条命、最后存活者获胜）
export type GameMode = "deathmatch" | "classic";

export type CreateRoomRequest = {
  type: "create_room";
  nickname: string;
  mode?: GameMode; // 缺省为 deathmatch，保持旧客户端兼容
  mapTheme?: MapThemeChoice; // 缺省为 random
};

export type JoinRoomRequest = {
  type: "join_room";
  nickname: string;
  roomId: string;
};

export type LeaveRoomRequest = {
  type: "leave_room";
};

// 断线重连：凭 sessionToken 恢复原玩家身份
export type RejoinRoomRequest = {
  type: "rejoin_room";
  roomId: string;
  sessionToken: string;
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

export type DashRequest = {
  type: "dash";
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
  | RejoinRoomRequest
  | StartGameRequest
  | PlayerInput
  | ShootRequest
  | DashRequest
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
  sessionToken: string; // 用于断线重连的会话凭证
};

export type RoomJoinedResponse = {
  type: "room_joined";
  roomId: string;
  playerId: string;
  isHost: boolean;
  players: PlayerInfo[];
  gameStatus: "waiting" | "playing";
  sessionToken: string; // 用于断线重连的会话凭证
};

// 重连成功：isSpectator 为 true 表示已淘汰，以观战身份恢复
export type RejoinSuccessResponse = {
  type: "rejoin_success";
  roomId: string;
  playerId: string;
  isHost: boolean;
  isSpectator: boolean;
  players: PlayerInfo[];
  gameStatus: "waiting" | "countdown" | "playing" | "finished";
};

// 其他玩家重连通知
export type PlayerReconnectedEvent = {
  type: "player_reconnected";
  playerId: string;
  nickname: string;
};

export type RoomErrorResponse = {
  type: "room_error";
  code:
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "GAME_ALREADY_STARTED"
    | "SERVER_ERROR"
    | "REJOIN_FAILED";
  message: string;
};

export type LobbyUpdate = {
  type: "lobby_update";
  players: PlayerInfo[];
  hostId: string;
  canStart: boolean;
  mode: GameMode;
  mapTheme: MapThemeChoice;
};

export type CountdownEvent = {
  type: "countdown";
  seconds: number;
};

// 技能球分类与具体效果
export type PowerupCategory = "status" | "recovery" | "offense";

export type PowerupType =
  | "shrink"
  | "speed"
  | "shield"
  | "swift_dash"
  | "heal"
  | "rapid"
  | "bigshot"
  | "spread"
  | "pierce"
  | "ricochet"
  | "power_shot";

export type PowerupSnapshot = {
  powerupId: string;
  type: PowerupType;
  category: PowerupCategory;
  x: number;
  y: number;
  size: number;
};

// 玩家身上生效中的效果及剩余时间
export type ActiveEffect = {
  type: PowerupType;
  remainingMs: number;
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
  size: number; // 当前碰撞尺寸，受 shrink 影响
  shield: number; // 剩余护盾点数
  effects: ActiveEffect[];
  dashCooldownMs: number; // 冲刺剩余冷却
  kills: number; // 总击杀数（排行榜依据）
  streakKills: number; // 当前连杀数（头顶星星显示）
};

export type BulletSnapshot = {
  bulletId: string;
  ownerId: string;
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
  size: number; // 当前子弹尺寸，受 bigshot 影响
  damage: number; // 命中伤害，受 power_shot 影响
};

export type ObstacleSnapshot = {
  obstacleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: 0 | 90; // 素材朝向；90 表示纵向墙段
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
  powerups: PowerupSnapshot[];
  winnerId: string | null;
  isDraw: boolean;
  mapTheme?: MapTheme; // 地图主题，开局后必定为具体主题
  mode: GameMode; // 游戏模式，决定复活与结束规则
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
  killerId: string | null; // 击杀者（断线淘汰时为 null）
};

// 复活事件（击杀赛模式：被淘汰 3 秒后在随机出生点复活）
export type PlayerRespawnEvent = {
  type: "player_respawn";
  playerId: string;
  x: number;
  y: number;
};

// 击杀排行榜条目（按 kills 降序、hitCount 次之）
export type LeaderboardEntry = {
  playerId: string;
  nickname: string;
  color: string;
  kills: number;
  hitCount: number;
  alive: boolean; // 经典模式下存活优先于已淘汰
};

export type GameOverEvent = {
  type: "game_over";
  winnerId: string | null; // 击杀第一（并列第一时为 null）
  winnerNickname: string | null;
  isDraw: boolean;
  reason: "last_alive" | "timeout" | "all_disconnected";
  leaderboard: LeaderboardEntry[];
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

// 技能球生成事件
export type PowerupSpawnedEvent = {
  type: "powerup_spawned";
  powerup: PowerupSnapshot;
};

// 技能球拾取事件
export type PowerupCollectedEvent = {
  type: "powerup_collected";
  powerupId: string;
  playerId: string;
  powerupType: PowerupType;
  category: PowerupCategory;
  x: number;
  y: number;
};

// 冲刺事件（供客户端播放特效）
export type DashEvent = {
  type: "dash";
  playerId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
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
  mode: GameMode;
  mapTheme: MapThemeChoice; // 开局前为房主选择（可能是 random），开局后为实际主题
};

export type RoomListResponse = {
  type: "room_list";
  rooms: RoomListItem[];
};

export type ServerMessage =
  | RoomCreatedResponse
  | RoomJoinedResponse
  | RoomErrorResponse
  | RejoinSuccessResponse
  | PlayerReconnectedEvent
  | LobbyUpdate
  | CountdownEvent
  | WorldSnapshot
  | PlayerHitEvent
  | PlayerEliminatedEvent
  | PlayerRespawnEvent
  | GameOverEvent
  | ObstacleDestroyedEvent
  | ObstacleHitEvent
  | PowerupSpawnedEvent
  | PowerupCollectedEvent
  | DashEvent
  | PongResponse
  | RoomListResponse;

// ── 游戏常量 ──

export const GAME_CONFIG = {
  mapWidth: 1024,
  mapHeight: 768,
  tankSize: 38, // 原 48 的 80%，便于进入 1 格宽窄道
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
  // 技能机制
  dashCells: 3, // 冲刺格数
  dashCooldownMs: 20000,
  powerupSize: 32,
  powerupSpawnIntervalMs: 7000,
  maxPowerups: 6,
  obstacleDropChance: 0.2, // 摧毁可破坏障碍物的掉落概率
  killDropChance: 1, // 击杀必掉
} as const;

// 技能球配置：持续时间为 0 表示立即结算
export const POWERUP_CONFIG: Record<
  PowerupType,
  { category: PowerupCategory; durationMs: number; label: string; color: string }
> = {
  shrink: { category: "status", durationMs: 12000, label: "缩小", color: "#7fd1ff" },
  speed: { category: "status", durationMs: 10000, label: "加速", color: "#8affc1" },
  shield: { category: "status", durationMs: 15000, label: "护盾", color: "#c9b6ff" },
  swift_dash: { category: "status", durationMs: 15000, label: "疾冲", color: "#9fe8ff" },
  heal: { category: "recovery", durationMs: 0, label: "治疗", color: "#ff8f9c" },
  rapid: { category: "offense", durationMs: 10000, label: "连射", color: "#ffd166" },
  bigshot: { category: "offense", durationMs: 10000, label: "巨弹", color: "#ffb347" },
  spread: { category: "offense", durationMs: 10000, label: "散射", color: "#ffa07a" },
  pierce: { category: "offense", durationMs: 10000, label: "穿透", color: "#ff9f45" },
  ricochet: { category: "offense", durationMs: 10000, label: "反弹", color: "#ffc93c" },
  power_shot: { category: "offense", durationMs: 8000, label: "强袭", color: "#ff7b54" },
};

export const PLAYER_COLORS = ["red", "blue", "green", "yellow"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];
