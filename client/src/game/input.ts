import { gameSocket } from "../network/socket";

type KeyState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

const keyState: KeyState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

let isEnabled = false;

const KEY_MAP: Record<string, keyof KeyState | "shoot" | "dash"> = {
  w: "up",
  W: "up",
  ArrowUp: "up",
  s: "down",
  S: "down",
  ArrowDown: "down",
  a: "left",
  A: "left",
  ArrowLeft: "left",
  d: "right",
  D: "right",
  ArrowRight: "right",
  " ": "shoot",
  Shift: "dash",
};

export function initInput(): void {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
}

export function destroyInput(): void {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
}

export function enableInput(): void {
  isEnabled = true;
}

export function disableInput(): void {
  isEnabled = false;
  keyState.up = false;
  keyState.down = false;
  keyState.left = false;
  keyState.right = false;
}

function handleKeyDown(e: KeyboardEvent): void {
  if (!isEnabled) return;
  const key = KEY_MAP[e.key];
  if (!key) return;

  e.preventDefault();

  if (key === "shoot") {
    gameSocket.send({ type: "shoot" });
    return;
  }

  if (key === "dash") {
    // 长按 Shift 会连续触发 keydown，服务端冷却会忽略多余请求
    if (!e.repeat) gameSocket.send({ type: "dash" });
    return;
  }

  if (!keyState[key]) {
    keyState[key] = true;
    sendInput();
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  if (!isEnabled) return;
  const key = KEY_MAP[e.key];
  if (!key || key === "shoot" || key === "dash") return;

  e.preventDefault();
  keyState[key] = false;
  sendInput();
}

function sendInput(): void {
  gameSocket.sendInput({ ...keyState });
}
