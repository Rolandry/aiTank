import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { gameSocket, ConnectionState } from "../../network/socket";
import type { RoomListItem } from "../../types/protocol";
import styles from "./index.module.css";

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [connected, setConnected] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRooms = useCallback(() => {
    if (gameSocket.isConnected()) {
      gameSocket.send({ type: "list_rooms" });
    }
  }, []);

  useEffect(() => {
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
      const unsubError = gameSocket.on("room_error", (msg) => {
        setError(msg.message);
        setLoading(false);
        unsubError();
      });
      gameSocket.send({ type: "create_room", nickname });
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
                  <span className={styles.roomCount}>
                    {room.playerCount}/{room.maxPlayers}
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
