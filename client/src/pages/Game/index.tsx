import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { gameSocket, ConnectionState } from "../../network/socket";
import { GameRenderer } from "../../game/renderer";
import {
  initInput,
  destroyInput,
  enableInput,
  disableInput,
} from "../../game/input";
import { useSocketMessage } from "../../hooks/useSocketMessage";
import type { WorldSnapshot, GameOverEvent } from "../../types/protocol";
import styles from "./index.module.css";

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { playerId, nickname, isSpectator } = location.state || {};

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const snapshotRef = useRef<WorldSnapshot | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameState, setGameState] = useState<string>("waiting");
  const [gameOver, setGameOver] = useState<GameOverEvent | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [myAlive, setMyAlive] = useState(true);

  // 初始化渲染器和输入
  useEffect(() => {
    if (canvasRef.current) {
      rendererRef.current = new GameRenderer(canvasRef.current);
      rendererRef.current.setMyPlayerId(playerId);
    }
    initInput();
    return () => {
      destroyInput();
      disableInput();
    };
  }, [playerId]);

  // 60fps 渲染循环（独立于快照频率）
  useEffect(() => {
    let animId: number;
    const loop = () => {
      if (rendererRef.current && snapshotRef.current) {
        rendererRef.current.render(snapshotRef.current);
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 倒计时
  useSocketMessage("countdown", (msg) => {
    setCountdown(msg.seconds);
    setGameState("countdown");
    if (msg.seconds <= 0) {
      setCountdown(null);
      setGameState("playing");
      if (!isSpectator) enableInput();
    }
  });

  // 世界快照
  useSocketMessage("world_snapshot", (msg) => {
    snapshotRef.current = msg;
    setGameState(msg.status);

    const me = msg.players.find((p) => p.playerId === playerId);
    if (me) setMyAlive(me.alive);

    if (msg.status === "playing" && !isSpectator) {
      enableInput();
    }
    if (msg.status === "finished") {
      disableInput();
    }
  });

  // 命中闪红
  useSocketMessage("player_hit", (msg) => {
    rendererRef.current?.flashPlayer(msg.targetId);
  });

  // 淘汰爆炸
  useSocketMessage("player_eliminated", (msg) => {
    const player = snapshotRef.current?.players.find(
      (p) => p.playerId === msg.playerId
    );
    if (player) {
      rendererRef.current?.explosions.add(player.x, player.y);
    }
    if (msg.playerId === playerId) {
      setMyAlive(false);
      disableInput();
    }
  });

  // 游戏结束
  useSocketMessage("game_over", (msg) => {
    setGameOver(msg);
    setGameState("finished");
    disableInput();
  });

  // 断线检测
  useEffect(() => {
    return gameSocket.onStateChange((state) => {
      if (state === ConnectionState.DISCONNECTED) {
        setDisconnected(true);
        disableInput();
      }
    });
  }, []);

  const handleBackToHome = useCallback(() => {
    gameSocket.send({ type: "leave_room" });
    gameSocket.disconnect();
    navigate("/");
  }, [navigate]);

  return (
    <div className={styles.container}>
      {/* 倒计时 */}
      {countdown !== null && countdown > 0 && (
        <div className={styles.countdown}>
          <span>{countdown}</span>
        </div>
      )}

      {/* 游戏画面 */}
      <canvas ref={canvasRef} className={styles.canvas} />

      {/* 观战标识 */}
      {isSpectator && <div className={styles.badge}>观战模式</div>}

      {/* 被淘汰提示 */}
      {!isSpectator && !myAlive && gameState === "playing" && (
        <div className={styles.eliminatedOverlay}>
          <p>你已被淘汰</p>
          <p>观战中...</p>
        </div>
      )}

      {/* 游戏结束 */}
      {gameOver && (
        <div className={styles.gameOverOverlay}>
          <h2>
            {gameOver.isDraw
              ? "平局！"
              : `${gameOver.winnerNickname} 获胜！`}
          </h2>
          {gameOver.winnerId === playerId && <p>你获胜了</p>}
          {gameOver.winnerId !== playerId && !isSpectator && (
            <p>你被淘汰了</p>
          )}
          <button onClick={handleBackToHome} className={styles.backButton}>
            返回首页
          </button>
        </div>
      )}

      {/* 断线提示 */}
      {disconnected && (
        <div className={styles.disconnectedOverlay}>
          <h2>与服务器连接断开</h2>
          <button onClick={handleBackToHome} className={styles.backButton}>
            返回首页
          </button>
        </div>
      )}
    </div>
  );
}
