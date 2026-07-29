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

// 线性插值
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// 角度插值（处理 360 度环绕）
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

// 方向角度映射
const DIRECTION_ANGLE: Record<string, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};

export default function Game() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { playerId, nickname, isSpectator } = location.state || {};

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);

  // 双缓存快照用于插值
  const prevSnapshotRef = useRef<WorldSnapshot | null>(null);
  const currSnapshotRef = useRef<WorldSnapshot | null>(null);
  const snapshotTimeRef = useRef<number>(0);

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

  // 60fps 渲染循环（带插值）
  useEffect(() => {
    let animId: number;
    const loop = () => {
      if (
        rendererRef.current &&
        currSnapshotRef.current &&
        prevSnapshotRef.current
      ) {
        const elapsed = Date.now() - snapshotTimeRef.current;
        const tickInterval = 1000 / 20; // 20Hz = 50ms
        const t = Math.min(elapsed / tickInterval, 1);

        // 对玩家位置做插值
        const interpolatedPlayers = currSnapshotRef.current.players.map(
          (player) => {
            const prev = prevSnapshotRef.current?.players.find(
              (p) => p.playerId === player.playerId
            );
            if (!prev) return player;

            return {
              ...player,
              x: lerp(prev.x, player.x, t),
              y: lerp(prev.y, player.y, t),
            };
          }
        );

        // 对子弹位置做插值
        const interpolatedBullets = currSnapshotRef.current.bullets.map(
          (bullet) => {
            const prev = prevSnapshotRef.current?.bullets.find(
              (b) => b.bulletId === bullet.bulletId
            );
            if (!prev) return bullet;

            return {
              ...bullet,
              x: lerp(prev.x, bullet.x, t),
              y: lerp(prev.y, bullet.y, t),
            };
          }
        );

        rendererRef.current.render({
          ...currSnapshotRef.current,
          players: interpolatedPlayers,
          bullets: interpolatedBullets,
        });
      } else if (rendererRef.current && currSnapshotRef.current) {
        // 第一帧没有 prev，直接渲染
        rendererRef.current.render(currSnapshotRef.current);
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
    // 保存上一次快照
    prevSnapshotRef.current = currSnapshotRef.current;
    currSnapshotRef.current = msg;
    snapshotTimeRef.current = Date.now();

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
    const player = currSnapshotRef.current?.players.find(
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
