import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { gameSocket } from "../../network/socket";
import styles from "./index.module.css";

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        navigate(`/lobby/${msg.roomId}`, {
          state: { playerId: msg.playerId, nickname, isHost: true },
        });
      });
      gameSocket.on("room_error", (msg) => {
        setError(msg.message);
        setLoading(false);
      });
      gameSocket.send({ type: "create_room", nickname });
    } catch {
      setError("无法连接到服务器");
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!validate()) return;
    if (!/^[A-Z0-9]{4}$/.test(roomId)) {
      setError("房间号应为 4 位大写字母或数字");
      return;
    }
    setLoading(true);
    setError("");

    try {
      await gameSocket.connect();
      const unsub = gameSocket.on("room_joined", (msg) => {
        unsub();
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
      gameSocket.on("room_error", (msg) => {
        setError(msg.message);
        setLoading(false);
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
      <div className={styles.form}>
        <input
          type="text"
          placeholder="输入昵称（1~12 字符）"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          className={styles.input}
        />
        <input
          type="text"
          placeholder="输入房间号（4 位）"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          maxLength={4}
          className={styles.input}
        />
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.buttons}>
          <button
            onClick={handleCreate}
            disabled={loading}
            className={styles.button}
          >
            创建房间
          </button>
          <button
            onClick={handleJoin}
            disabled={loading}
            className={styles.button}
          >
            加入房间
          </button>
        </div>
      </div>
    </div>
  );
}
