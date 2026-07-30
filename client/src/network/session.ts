// 断线重连凭证：与 WebSocket 连接解耦，使重连后能恢复原玩家身份。
// 使用 sessionStorage 而非 localStorage，标签页关闭即失效，避免多标签页串号。

const STORAGE_KEY = "aitank_session";

export interface GameSession {
  roomId: string;
  playerId: string;
  sessionToken: string;
  nickname: string;
}

export function saveSession(session: GameSession): void {
  // 观战者没有席位，服务端下发空 token，无需保存
  if (!session.sessionToken) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // 隐私模式下 sessionStorage 可能不可用，此时降级为不支持重连
  }
}

export function loadSession(): GameSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameSession>;
    if (!parsed.roomId || !parsed.playerId || !parsed.sessionToken) return null;
    return {
      roomId: parsed.roomId,
      playerId: parsed.playerId,
      sessionToken: parsed.sessionToken,
      nickname: parsed.nickname ?? "",
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略：清理失败不影响主流程
  }
}
