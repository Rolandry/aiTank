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
import { audioManager } from "../../game/audio";
import { getFailedAssets, FALLBACK_COLORS } from "../../game/assets";
import { JitterBuffer } from "../../game/jitterBuffer";
import { PerfMonitor } from "../../components/PerfMonitor";
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

  // Jitter buffer 吸收网络抖动
  const jitterBufferRef = useRef<JitterBuffer>(new JitterBuffer());
  const latestSnapshotRef = useRef<WorldSnapshot | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameState, setGameState] = useState<string>("waiting");
  const [gameOver, setGameOver] = useState<GameOverEvent | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [myAlive, setMyAlive] = useState(true);
  const [muted, setMuted] = useState(false);
  const [assetWarning, setAssetWarning] = useState(false);

  const myPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const prevBulletIdsRef = useRef<Set<string>>(new Set());

  // 初始化渲染器和输入
  useEffect(() => {
    if (canvasRef.current) {
      rendererRef.current = new GameRenderer(canvasRef.current);
      rendererRef.current.setMyPlayerId(playerId);
    }
    audioManager.setMyPlayerId(playerId);
    audioManager.init().then(() => {
      audioManager.startBgm();
    });
    const failed = getFailedAssets();
    if (failed.length > 0) {
      setAssetWarning(true);
      console.warn(`[资源加载] ${failed.length} 个素材加载失败，将使用降级渲染`, failed);
    }
    initInput();
    return () => {
      destroyInput();
      disableInput();
      audioManager.stopBgm();
    };
  }, [playerId]);

  // 60fps 渲染循环（从 jitter buffer 取插值快照）
  useEffect(() => {
    let animId: number;
    const loop = () => {
      const interpolated = jitterBufferRef.current.pop();
      if (rendererRef.current && interpolated) {
        rendererRef.current.render(interpolated);
      } else if (rendererRef.current && latestSnapshotRef.current) {
        rendererRef.current.render(latestSnapshotRef.current);
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
    if (msg.seconds > 0) {
      audioManager.play("coin", 0.6);
    }
    if (msg.seconds <= 0) {
      setCountdown(null);
      setGameState("playing");
      if (!isSpectator) enableInput();
      audioManager.play("coin", 1);
    }
  });

  // 世界快照
  useSocketMessage("world_snapshot", (msg) => {
    latestSnapshotRef.current = msg;
    jitterBufferRef.current.push(msg, Date.now());

    setGameState(msg.status);

    const me = msg.players.find((p) => p.playerId === playerId);
    if (me) {
      setMyAlive(me.alive);
      myPosRef.current = { x: me.x, y: me.y };
    }

    const currBulletIds = new Set(msg.bullets.map((b) => b.bulletId));
    for (const bullet of msg.bullets) {
      if (!prevBulletIdsRef.current.has(bullet.bulletId) && bullet.ownerId === playerId) {
        audioManager.play("shoot", 1);
      }
    }
    prevBulletIdsRef.current = currBulletIds;

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
    const target = latestSnapshotRef.current?.players.find(
      (p) => p.playerId === msg.targetId
    );
    if (target) {
      const isMyHit = msg.targetId === playerId;
      audioManager.playWithDistance(
        "hit",
        target.x,
        target.y,
        myPosRef.current.x,
        myPosRef.current.y,
        isMyHit ? 1 : 0.7
      );
      // 粒子飞溅
      rendererRef.current?.effects.spawnParticles(target.x, target.y, 12, "#ff6b35", 180);
      // 屏幕震动（自己被命中震得更猛）
      if (isMyHit) {
        rendererRef.current?.effects.triggerShake(8, 200);
        rendererRef.current?.effects.triggerHitStop(60);
      } else {
        rendererRef.current?.effects.triggerShake(3, 100);
      }
    } else {
      audioManager.play("hit", 0.5);
    }
  });

  // 淘汰爆炸
  useSocketMessage("player_eliminated", (msg) => {
    const player = latestSnapshotRef.current?.players.find(
      (p) => p.playerId === msg.playerId
    );
    if (player) {
      rendererRef.current?.explosions.add(player.x, player.y);
      const isMe = msg.playerId === playerId;
      audioManager.playWithDistance(
        "explosion",
        player.x,
        player.y,
        myPosRef.current.x,
        myPosRef.current.y,
        isMe ? 1 : 0.8
      );
      // 大量粒子飞溅
      rendererRef.current?.effects.spawnParticles(player.x, player.y, 30, "#ff4500", 250);
      rendererRef.current?.effects.spawnParticles(player.x, player.y, 15, "#ffaa00", 200);
      // 屏幕震动
      rendererRef.current?.effects.triggerShake(isMe ? 15 : 8, 300);
      // 命中卡帧
      rendererRef.current?.effects.triggerHitStop(100);
      // 环境光闪
      rendererRef.current?.effects.triggerAmbientLight(player.x, player.y, 200, 400);
    }
    if (msg.playerId === playerId) {
      setMyAlive(false);
    }
    audioManager.play("coin", 0.4);
  });

  // 复活（击杀赛模式：3 秒后在随机出生点复活）
  useSocketMessage("player_respawn", (msg) => {
    if (msg.playerId === playerId) {
      setMyAlive(true);
      if (!isSpectator) enableInput();
    }
  });

  // 游戏结束
  useSocketMessage("game_over", (msg) => {
    setGameOver(msg);
    setGameState("finished");
    disableInput();
    audioManager.stopBgm();
    audioManager.play("game_over", 0.8);
  });

  // 障碍物被破坏
  useSocketMessage("obstacle_destroyed", (msg) => {
    rendererRef.current?.explosions.add(msg.x, msg.y);
    audioManager.playWithDistance(
      "explosion",
      msg.x,
      msg.y,
      myPosRef.current.x,
      myPosRef.current.y,
      0.5
    );
  });

  // 障碍物受伤
  useSocketMessage("obstacle_hit", (msg) => {
    audioManager.play("hit", 0.3);
  });

  // 技能球拾取：播放距离衰减音效并在拾取点显示特效
  useSocketMessage("powerup_collected", (msg) => {
    rendererRef.current?.explosions.add(msg.x, msg.y);
    audioManager.playWithDistance(
      "hit",
      msg.x,
      msg.y,
      myPosRef.current.x,
      myPosRef.current.y,
      0.4
    );
  });

  // 冲刺：播放音效 + 视觉拖尾
  useSocketMessage("dash", (msg) => {
    audioManager.playWithDistance(
      "shoot",
      msg.toX,
      msg.toY,
      myPosRef.current.x,
      myPosRef.current.y,
      0.3
    );
    const player = latestSnapshotRef.current?.players.find(
      (p) => p.playerId === msg.playerId
    );
    const color = player
      ? FALLBACK_COLORS[player.color] ?? "#fff"
      : "#fff";
    rendererRef.current?.addDashEffect(msg.fromX, msg.fromY, msg.toX, msg.toY, color);
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
    audioManager.stopBgm();
    navigate("/");
  }, [navigate]);

  const toggleMute = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    audioManager.setMuted(newMuted);
  }, [muted]);

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

      {/* 静音按钮 */}
      <button className={styles.muteButton} onClick={toggleMute}>
        {muted ? "🔇" : "🔊"}
      </button>

      {/* 性能监控 */}
      <PerfMonitor />

      {/* 资源加载警告 */}
      {assetWarning && (
        <div className={styles.assetWarning}>
          部分素材加载失败，已切换降级渲染
        </div>
      )}

      {/* 观战标识 */}
      {isSpectator && <div className={styles.badge}>观战模式</div>}

      {/* 被淘汰提示（击杀赛模式：3 秒后复活） */}
      {!isSpectator && !myAlive && gameState === "playing" && (
        <div className={styles.eliminatedOverlay}>
          <p>你被击杀了</p>
          <p>3 秒后复活...</p>
        </div>
      )}

      {/* 游戏结束：击杀排行榜 */}
      {gameOver && (
        <div className={styles.gameOverOverlay}>
          <h2>
            {gameOver.isDraw
              ? "平局！"
              : `${gameOver.winnerNickname} 荣登榜首！`}
          </h2>
          {gameOver.leaderboard && gameOver.leaderboard.length > 0 && (
            <div className={styles.leaderboard}>
              {gameOver.leaderboard.map((entry, i) => (
                <div
                  key={entry.playerId}
                  className={`${styles.leaderboardRow} ${
                    entry.playerId === playerId ? styles.leaderboardRowMe : ""
                  }`}
                >
                  <span className={styles.leaderboardRank}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                  </span>
                  <span
                    className={styles.leaderboardColorDot}
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className={styles.leaderboardName}>
                    {entry.nickname}
                    {entry.playerId === playerId ? "（我）" : ""}
                  </span>
                  <span className={styles.leaderboardKills}>
                    {entry.kills} 杀
                  </span>
                </div>
              ))}
            </div>
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
