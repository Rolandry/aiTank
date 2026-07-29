import { useEffect, useRef, useState } from "react";
import { gameSocket } from "../network/socket";

export function PerfMonitor() {
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [snapshotRate, setSnapshotRate] = useState(0);
  const [renderMs, setRenderMs] = useState(0);

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const snapshotCountRef = useRef(0);
  const lastSnapshotTimeRef = useRef(performance.now());
  const renderStartRef = useRef(0);

  useEffect(() => {
    const unsubLatency = gameSocket.onLatencyChange((lat) => {
      setLatency(Math.round(lat));
    });

    let rafId: number;
    const loop = (time: number) => {
      if (renderStartRef.current > 0) {
        const renderTime = time - renderStartRef.current;
        setRenderMs(Math.round(renderTime * 10) / 10);
      }
      renderStartRef.current = time;

      frameCountRef.current++;
      const elapsed = time - lastFpsTimeRef.current;
      if (elapsed >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed));
        frameCountRef.current = 0;
        lastFpsTimeRef.current = time;

        const snapElapsed = time - lastSnapshotTimeRef.current;
        if (snapElapsed > 0) {
          setSnapshotRate(Math.round((snapshotCountRef.current * 1000) / snapElapsed));
          snapshotCountRef.current = 0;
          lastSnapshotTimeRef.current = time;
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const unsubSnapshot = gameSocket.on("world_snapshot", () => {
      snapshotCountRef.current++;
    });

    return () => {
      cancelAnimationFrame(rafId);
      unsubLatency();
      unsubSnapshot();
    };
  }, []);

  const fpsColor = fps >= 50 ? "#2ecc71" : fps >= 30 ? "#f39c12" : "#e74c3c";
  const latColor = latency <= 50 ? "#2ecc71" : latency <= 100 ? "#f39c12" : "#e74c3c";

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        left: 16,
        background: "rgba(0, 0, 0, 0.7)",
        color: "#fff",
        fontSize: 12,
        fontFamily: "monospace",
        padding: "8px 12px",
        borderRadius: 6,
        zIndex: 15,
        lineHeight: 1.6,
        pointerEvents: "none",
        minWidth: 120,
      }}
    >
      <div style={{ color: fpsColor }}>FPS: {fps}</div>
      <div style={{ color: latColor }}>延迟: {latency}ms</div>
      <div style={{ color: "#aaa" }}>快照: {snapshotRate}/s</div>
      <div style={{ color: "#aaa" }}>渲染: {renderMs}ms</div>
    </div>
  );
}
