import type { WebSocket } from "ws";
import type { PowerupType } from "./protocol";

export type Direction = "up" | "down" | "left" | "right";
export type RoomStatus = "waiting" | "countdown" | "playing" | "finished";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface ServerPlayer {
  playerId: string;
  nickname: string;
  color: string;
  socket: WebSocket;
  x: number;
  y: number;
  direction: Direction;
  hp: number;
  alive: boolean;
  hitCount: number;
  kills: number; // 总击杀数（后台累计，排行榜依据）
  streakKills: number; // 当前连杀数（死亡清零，头顶星星显示）
  respawnAt: number | null; // 复活时间戳（死亡时设置，null 表示无需复活）
  lastShootTime: number;
  activeBullets: number;
  input: InputState;
  lastInputSeq: number;
  connected: boolean;
  sessionToken: string; // 断线重连凭证，与连接解耦
  disconnectedAt: number | null; // 断线时间戳，null 表示在线
  effects: Map<PowerupType, number>; // 效果 → 到期时间戳
  shield: number;
  lastDashTime: number;
}

export interface ServerBullet {
  bulletId: string;
  ownerId: string;
  x: number;
  y: number;
  direction: Direction;
  size: number;
  damage: number;
  pierce: boolean;
  bouncesLeft: number;
}

export interface ServerPowerup {
  powerupId: string;
  type: PowerupType;
  x: number;
  y: number;
}

// 每个 WS 连接的上下文（playerId 一连接一个，直接复用为玩家 ID）
export interface ClientContext {
  playerId: string;
  roomId: string | null;
  isSpectator: boolean;
}
