import { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { gameSocket } from "../../network/socket";
import { useSocketMessage } from "../../hooks/useSocketMessage";
import type { PlayerInfo } from "../../types/protocol";
import styles from "./index.module.css";

export default function Lobby() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { playerId, nickname } = location.state || {};

  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [hostId, setHostId] = useState("");
  const [canStart, setCanStart] = useState(false);

  useSocketMessage("lobby_update", (msg) => {
    setPlayers(msg.players);
    setHostId(msg.hostId);
    setCanStart(msg.canStart);
  });

  useSocketMessage("countdown", () => {
    navigate(`/game/${roomId}`, { state: { playerId, nickname } });
  });

  const handleStart = () => {
    gameSocket.send({ type: "start_game" });
  };

  const handleLeave = () => {
    gameSocket.send({ type: "leave_room" });
    gameSocket.disconnect();
    navigate("/");
  };

  const amIHost = playerId === hostId;

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>等待大厅</h2>
      <div className={styles.roomInfo}>
        <span>房间号: {roomId}</span>
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
            disabled={!canStart}
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
