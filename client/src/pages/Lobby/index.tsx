import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { gameSocket, ConnectionState } from "../../network/socket";
import { clearSession } from "../../network/session";
import { useSocketMessage } from "../../hooks/useSocketMessage";
import type {
  PlayerInfo,
  GameMode,
  MapThemeChoice,
} from "../../types/protocol";
import { MAP_THEME_LABEL } from "../../types/protocol";
import styles from "./index.module.css";

export default function Lobby() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { playerId, nickname } = location.state || {};

  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hostId, setHostId] = useState("");
  const [canStart, setCanStart] = useState(false);
  const [mode, setMode] = useState<GameMode>("deathmatch");
  const [mapTheme, setMapTheme] = useState<MapThemeChoice>("random");
  const [connectionState, setConnectionState] = useState(
    gameSocket.getState()
  );

  useSocketMessage("lobby_update", (msg) => {
    setPlayers(msg.players);
    setHostId(msg.hostId);
    setCanStart(msg.canStart);
    setMode(msg.mode);
    setMapTheme(msg.mapTheme);
  });

  useSocketMessage("countdown", () => {
    navigate(`/game/${roomId}`, { state: { playerId, nickname } });
  });

  useEffect(() => {
    return gameSocket.onStateChange((state) => {
      setConnectionState(state);
    });
  }, []);

  const handleStart = () => {
    gameSocket.send({ type: "start_game" });
  };

  const handleLeave = () => {
    // 主动退出必须清理凭证，否则会被误判为断线重连
    clearSession();
    gameSocket.send({ type: "leave_room" });
    gameSocket.disconnect();
    navigate("/");
  };

  const amIHost = playerId === hostId;
  const isReconnecting = connectionState === ConnectionState.RECONNECTING;

  return (
    <div className={styles.container}>
      {isReconnecting && (
        <div className={styles.reconnectBanner}>
          正在重新连接服务器...
        </div>
      )}

      <h2 className={styles.heading}>等待大厅</h2>
      <div className={styles.roomInfo}>
        <span>房间号: {roomId}</span>
        <span>
          模式: {mode === "classic" ? "经典（一条命）" : "无尽死斗"}
        </span>
        <span>
          地图: {mapTheme === "random" ? "随机" : MAP_THEME_LABEL[mapTheme]}
        </span>
        <span>
          人数: {players.length}/4
        </span>
      </div>
      <div className={styles.playerList}>
        {players.map((p) => (
          <div key={p.playerId} className={styles.player}>
            <span
              className={styles.colorDot}
              style={{ backgroundColor: p.color }}
            />
            <span>{p.nickname}</span>
            {p.isHost && <span className={styles.hostBadge}>房主</span>}
          </div>
        ))}
      </div>
      <div className={styles.buttons}>
        {amIHost && (
          <button
            onClick={handleStart}
            disabled={!canStart || isReconnecting}
            className={styles.startButton}
          >
            开始游戏
          </button>
        )}
        <button onClick={handleLeave} className={styles.leaveButton}>
          离开房间
        </button>
      </div>
      {!canStart && (
        <p className={styles.hint}>至少需要 2 人才能开始游戏</p>
      )}
    </div>
  );
}
