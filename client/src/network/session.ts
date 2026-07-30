// 断线重连凭证：与 WebSocket 连接解耦，使重连后能恢复原玩家身份。
// 使用 sessionStorage 而非 localStorage，标签页关闭即失效，避免多标签页串号。

const STORAGE_KEY = "aitank_session";

export interface GameSession {
  roomId: string;
  playerId: string;
  sessionToken: string;
  nickname: string;
  // true 表示玩家主动退出：席位仍保留，但需从首页手动点「返回上一局」回归，
  // socket 不应对其自动重连，否则会绕过手动入口。
  left?: boolean;
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
      left: parsed.left === true,
    };
  } catch {
    return null;
  }
}

// 主动退出：保留凭证以便回归本局，但打上 left 标记停止自动重连
export function markLeft(): void {
  const session = loadSession();
  if (!session) return;
  saveSession({ ...session, left: true });
}

// 存在待回归的对局凭证时返回它，否则返回 null
export function getLeftSession(): GameSession | null {
  const session = loadSession();
  return session?.left ? session : null;
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略：清理失败不影响主流程
  }
}
