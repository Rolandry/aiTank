import type { WebSocket } from "ws";

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
  lastShootTime: number;
  activeBullets: number;
  input: InputState;
  lastInputSeq: number;
  connected: boolean;
}

export interface ServerBullet {
  bulletId: string;
  ownerId: string;
  x: number;
  y: number;
  direction: Direction;
}

// 每个 WS 连接的上下文（playerId 一连接一个，直接复用为玩家 ID）
export interface ClientContext {
  playerId: string;
  roomId: string | null;
  isSpectator: boolean;
}
