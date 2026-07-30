import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { gameSocket, ConnectionState } from "../../network/socket";
import { saveSession, clearSession, getLeftSession } from "../../network/session";
import type { GameSession } from "../../network/session";
import type {
  RoomListItem,
  GameMode,
  MapThemeChoice,
} from "../../types/protocol";
import { MAP_THEME_CHOICES, MAP_THEME_LABEL } from "../../types/protocol";
import styles from "./index.module.css";

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<GameMode>("deathmatch");
  const [mapTheme, setMapTheme] = useState<MapThemeChoice>("random");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [leftSession, setLeftSession] = useState<GameSession | null>(null);
  const [rejoining, setRejoining] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRooms = useCallback(() => {
    if (gameSocket.isConnected()) {
      gameSocket.send({ type: "list_rooms" });
    }
  }, []);

  useEffect(() => {
    // 保留主动退出留下的待回归凭证（用于「返回上一局」），
    // 其余残留凭证清理掉，避免误触发自动重连。
    const left = getLeftSession();
    if (left) {
      setLeftSession(left);
      setNickname(left.nickname);
    } else {
      clearSession();
    }

    gameSocket.connect().then(() => {
      setConnected(true);
      fetchRooms();
    }).catch(() => {
      setError("无法连接到服务器");
    });

    const unsubRoomList = gameSocket.on("room_list", (msg) => {
      setRooms(msg.rooms);
    });

    const unsubState = gameSocket.onStateChange((state) => {
      if (state === ConnectionState.CONNECTED) {
        setConnected(true);
        fetchRooms();
      } else if (state === ConnectionState.DISCONNECTED) {
        setConnected(false);
      }
    });

    pollTimerRef.current = setInterval(fetchRooms, 2000);

    return () => {
      unsubRoomList();
      unsubState();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchRooms]);

  // 返回上一局：凭保留的 sessionToken 回归原房间。
  // 本局已结束时服务端返回 REJOIN_FAILED，此时清理凭证并收起横幅。
  const handleRejoin = async () => {
    if (!leftSession || rejoining) return;
    setRejoining(true);
    setError("");

    try {
      await gameSocket.connect();

      const unsubOk = gameSocket.on("rejoin_success", (msg) => {
        unsubOk();
        unsubErr();
        // 回归成功后凭证恢复为常规状态，重新启用自动重连
        saveSession({
          roomId: msg.roomId,
          playerId: msg.playerId,
          sessionToken: leftSession.sessionToken,
          nickname: leftSession.nickname,
        });
        navigate(`/game/${msg.roomId}`, {
          state: {
            playerId: msg.playerId,
            nickname: leftSession.nickname,
            isSpectator: msg.isSpectator,
          },
        });
      });

      const unsubErr = gameSocket.on("room_error", (msg) => {
        if (msg.code !== "REJOIN_FAILED") return;
        unsubOk();
        unsubErr();
        clearSession();
        setLeftSession(null);
        setRejoining(false);
        setError("上一局已结束，无法返回");
      });

      gameSocket.send({
        type: "rejoin_room",
        roomId: leftSession.roomId,
        sessionToken: leftSession.sessionToken,
      });
    } catch {
      setError("无法连接到服务器");
      setRejoining(false);
    }
  };

  const validate = (): boolean => {
    if (nickname.length < 1 || nickname.length > 12) {
      setError("昵称长度应为 1~12 个字符");
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setLoading(true);
    setError("");

    try {
      await gameSocket.connect();
      const unsub = gameSocket.on("room_created", (msg) => {
        unsub();
        // 保存重连凭证
        saveSession({
          roomId: msg.roomId,
          playerId: msg.playerId,
          sessionToken: msg.sessionToken,
          nickname,
        });
        navigate(`/lobby/${msg.roomId}`, {
          state: { playerId: msg.playerId, nickname, isHost: true },
        });
      });
      const unsubError = gameSocket.on("room_error", (msg) => {
        setError(msg.message);
        setLoading(false);
        unsubError();
      });
      gameSocket.send({ type: "create_room", nickname, mode, mapTheme });
    } catch {
      setError("无法连接到服务器");
      setLoading(false);
    }
  };

  const handleJoin = async (roomId: string) => {
    if (!validate()) return;
    setLoading(true);
    setError("");

    try {
      await gameSocket.connect();
      const unsub = gameSocket.on("room_joined", (msg) => {
        unsub();
        // 保存重连凭证（观战者 token 为空，内部会跳过）
        saveSession({
          roomId: msg.roomId,
          playerId: msg.playerId,
          sessionToken: msg.sessionToken,
          nickname,
        });
        if (msg.gameStatus === "waiting") {
          navigate(`/lobby/${msg.roomId}`, {
            state: { playerId: msg.playerId, nickname, isHost: msg.isHost },
          });
        } else {
          navigate(`/game/${msg.roomId}`, {
            state: { playerId: msg.playerId, nickname, isSpectator: true },
          });
        }
      });
      const unsubError = gameSocket.on("room_error", (msg) => {
        setError(msg.message);
        setLoading(false);
        unsubError();
      });
      gameSocket.send({ type: "join_room", nickname, roomId });
    } catch {
      setError("无法连接到服务器");
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>AI 坦克竞技场</h1>

      {/* 主动退出后的回归入口：席位保留至本局结束 */}
      {leftSession && (
        <div className={styles.rejoinBanner}>
          <span className={styles.rejoinText}>
            你还有一局未结束（房间 {leftSession.roomId}）
          </span>
          <button
            onClick={handleRejoin}
            disabled={rejoining}
            className={styles.rejoinButton}
          >
            {rejoining ? "返回中..." : "返回上一局"}
          </button>
        </div>
      )}
      <div className={styles.form}>
        <input
          type="text"
          placeholder="输入昵称（1~12 字符）"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          className={styles.input}
        />
        {error && <div className={styles.error}>{error}</div>}

        {/* 模式选择：仅影响新建房间 */}
        <div className={styles.modeGroup}>
          <button
            type="button"
            onClick={() => setMode("deathmatch")}
            className={`${styles.modeOption} ${
              mode === "deathmatch" ? styles.modeActive : ""
            }`}
          >
            <span className={styles.modeName}>无尽死斗</span>
            <span className={styles.modeDesc}>无限复活，限时比击杀</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("classic")}
            className={`${styles.modeOption} ${
              mode === "classic" ? styles.modeActive : ""
            }`}
          >
            <span className={styles.modeName}>经典</span>
            <span className={styles.modeDesc}>仅一条命，最后存活者胜</span>
          </button>
        </div>

        {/* 地图主题选择：random 交由服务端随机挑选 */}
        <div className={styles.themeGroup}>
          {MAP_THEME_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setMapTheme(choice)}
              className={`${styles.themeChip} ${
                mapTheme === choice ? styles.themeActive : ""
              }`}
            >
              {choice === "random" ? "随机地图" : MAP_THEME_LABEL[choice]}
            </button>
          ))}
        </div>

        <button
          onClick={handleCreate}
          disabled={loading || !connected}
          className={styles.createButton}
        >
          创建房间
        </button>
      </div>

      <div className={styles.roomListSection}>
        <h2 className={styles.sectionTitle}>
          可用房间 {connected ? "" : "（连接中...）"}
        </h2>
        {rooms.length === 0 ? (
          <div className={styles.emptyHint}>
            {connected ? "暂无可用房间，创建一个吧！" : "正在连接服务器..."}
          </div>
        ) : (
          <div className={styles.roomList}>
            {rooms.map((room) => (
              <div key={room.roomId} className={styles.roomCard}>
                <div className={styles.roomInfo}>
                  <span className={styles.roomHost}>
                    {room.hostNickname}的房间
                  </span>
                  <span className={styles.roomMeta}>
                    <span className={styles.roomMode}>
                      {room.mode === "classic" ? "经典" : "无尽死斗"}
                    </span>
                    <span className={styles.roomTheme}>
                      {room.mapTheme === "random"
                        ? "随机"
                        : MAP_THEME_LABEL[room.mapTheme]}
                    </span>
                    <span className={styles.roomCount}>
                      {room.playerCount}/{room.maxPlayers}
                    </span>
                  </span>
                </div>
                <button
                  onClick={() => handleJoin(room.roomId)}
                  disabled={loading || room.playerCount >= room.maxPlayers}
                  className={styles.joinButton}
                >
                  {room.playerCount >= room.maxPlayers ? "已满" : "加入"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
