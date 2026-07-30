import type { ClientMessage, ServerMessage } from "../types/protocol";
import { loadSession } from "./session";

export enum ConnectionState {
  IDLE = "idle",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  DISCONNECTED = "disconnected",
}

type MessageHandler = (msg: ServerMessage) => void;
type StateChangeHandler = (state: ConnectionState) => void;
type LatencyHandler = (latency: number) => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private state: ConnectionState = ConnectionState.IDLE;
  private inputSeq = 0;

  // 重连
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // 心跳
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval = 2000;
  private heartbeatTimeout = 5000;

  // 事件
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private globalHandlers: Set<MessageHandler> = new Set();
  private stateHandlers: Set<StateChangeHandler> = new Set();
  private latencyHandlers: Set<LatencyHandler> = new Set();

  // 延迟
  private latency = 0;
  private lastPingTime = 0;

  // 消息队列
  private pendingMessages: ClientMessage[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === ConnectionState.CONNECTED) {
        resolve();
        return;
      }

      this.setState(ConnectionState.CONNECTING);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.setState(ConnectionState.CONNECTED);
        const isReconnect = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        this.lastPingTime = Date.now();
        this.ws!.send(JSON.stringify({ type: "ping", timestamp: this.lastPingTime }));
        this.startHeartbeat();
        // 重连成功后先请求恢复身份，再发送积压消息，
        // 否则积压的对局指令会因服务端尚未绑定房间而被丢弃。
        if (isReconnect) this.tryRejoin();
        this.flushPending();
        resolve();
      };

      this.ws.onerror = () => {
        if (this.state === ConnectionState.CONNECTING) {
          reject(new Error("连接失败"));
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        if (this.state !== ConnectionState.DISCONNECTED) {
          this.handleReconnect();
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  disconnect(): void {
    this.setState(ConnectionState.DISCONNECTED);
    this.stopReconnect();
    this.stopHeartbeat();
    this.ws?.close(1000, "client disconnect");
    this.ws = null;
  }

  send(msg: ClientMessage): boolean {
    if (
      this.state !== ConnectionState.CONNECTED ||
      this.ws?.readyState !== WebSocket.OPEN
    ) {
      this.pendingMessages.push(msg);
      return false;
    }
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  sendInput(input: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  }): void {
    this.inputSeq++;
    this.send({ type: "player_input", seq: this.inputSeq, ...input });
  }

  on<T extends ServerMessage["type"]>(
    type: T,
    handler: (msg: Extract<ServerMessage, { type: T }>) => void
  ): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler as MessageHandler);
    return () => {
      this.messageHandlers.get(type)?.delete(handler as MessageHandler);
    };
  }

  onMessage(handler: MessageHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  getLatency(): number {
    return this.latency;
  }

  onLatencyChange(handler: LatencyHandler): () => void {
    this.latencyHandlers.add(handler);
    return () => {
      this.latencyHandlers.delete(handler);
    };
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState(ConnectionState.DISCONNECTED);
      return;
    }
    this.setState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, this.reconnectInterval);
  }

  // 重连成功后凭本地凭证请求恢复原玩家身份。
  // 失败由服务端返回 REJOIN_FAILED，页面层负责清理凭证并回退首页。
  private tryRejoin(): void {
    const session = loadSession();
    if (!session || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "rejoin_room",
        roomId: session.roomId,
        sessionToken: session.sessionToken,
      })
    );
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
        this.ws.send(JSON.stringify({ type: "ping", timestamp: this.lastPingTime }));
        this.heartbeatTimeoutTimer = setTimeout(() => {
          this.ws?.close(4000, "heartbeat timeout");
        }, this.heartbeatTimeout);
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.heartbeatTimeoutTimer) clearTimeout(this.heartbeatTimeoutTimer);
  }

  private flushPending(): void {
    const msgs = [...this.pendingMessages];
    this.pendingMessages = [];
    msgs.forEach((msg) => this.send(msg));
  }

  private handleMessage(data: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === "pong") {
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
      }
      if (msg.timestamp && this.lastPingTime) {
        this.latency = Date.now() - this.lastPingTime;
        this.latencyHandlers.forEach((h) => h(this.latency));
      }
      return;
    }

    const handlers = this.messageHandlers.get(msg.type);
    handlers?.forEach((h) => h(msg));
    this.globalHandlers.forEach((h) => h(msg));
  }

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.stateHandlers.forEach((h) => h(state));
    }
  }
}

// 动态获取 WebSocket 地址：使用当前页面的 hostname，支持局域网访问
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsHost = window.location.hostname;
const wsUrl = `${wsProtocol}//${wsHost}:8080/ws`;

export const gameSocket = new GameSocket(wsUrl);
