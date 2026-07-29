#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"
CLIENT_PORT="3000"
SERVER_PORT="8080"
OPEN_BROWSER="${OPEN_BROWSER:-1}"
SERVER_PID=""
CLIENT_PID=""

info() {
  printf '\033[36m[AI Tank]\033[0m %s\n' "$1"
}

error() {
  printf '\033[31m[AI Tank]\033[0m %s\n' "$1" >&2
}

cleanup() {
  trap - EXIT INT TERM
  info "正在停止游戏服务..."
  [[ -n "$CLIENT_PID" ]] && kill "$CLIENT_PID" 2>/dev/null || true
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  wait "$CLIENT_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "未找到 $1，请先安装 Node.js 18 或更高版本：https://nodejs.org/"
    exit 1
  fi
}

check_port() {
  local port="$1"
  local service="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    error "$service 端口 $port 已被占用。"
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
    error "请停止占用进程，或指定其他端口后重试。"
    exit 1
  fi
}

install_dependencies() {
  local directory="$1"
  local name="$2"
  if [[ ! -d "$directory/node_modules" ]]; then
    info "首次启动，正在安装${name}依赖..."
    if [[ -f "$directory/package-lock.json" ]]; then
      npm --prefix "$directory" ci
    else
      npm --prefix "$directory" install
    fi
  fi
}

wait_for_client() {
  local attempts=40
  while (( attempts > 0 )); do
    if curl --silent --fail "http://127.0.0.1:$CLIENT_PORT" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$CLIENT_PID" 2>/dev/null; then
      return 1
    fi
    attempts=$((attempts - 1))
    sleep 0.25
  done
  return 1
}

require_command node
require_command npm
require_command curl
require_command lsof

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 18 )); then
  error "当前 Node.js 版本为 $(node --version)，请升级到 18 或更高版本。"
  exit 1
fi

check_port "$SERVER_PORT" "服务端"
check_port "$CLIENT_PORT" "客户端"
install_dependencies "$SERVER_DIR" "服务端"
install_dependencies "$CLIENT_DIR" "客户端"

trap cleanup EXIT INT TERM

info "正在启动服务端：http://0.0.0.0:$SERVER_PORT"
(
  cd "$SERVER_DIR"
  npm start
) &
SERVER_PID=$!

info "正在启动客户端：http://0.0.0.0:$CLIENT_PORT"
(
  cd "$CLIENT_DIR"
  npm run dev -- --host 0.0.0.0 --port "$CLIENT_PORT"
) &
CLIENT_PID=$!

if ! wait_for_client; then
  error "客户端启动失败，请查看上方日志。"
  exit 1
fi

LOCAL_URL="http://localhost:$CLIENT_PORT"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

printf '\n'
info "游戏已启动"
printf '  本机访问：%s\n' "$LOCAL_URL"
if [[ -n "$LAN_IP" ]]; then
  printf '  局域网访问：http://%s:%s\n' "$LAN_IP" "$CLIENT_PORT"
fi
printf '  按 Ctrl+C 停止客户端和服务端。\n\n'

if [[ "$OPEN_BROWSER" == "1" ]] && command -v open >/dev/null 2>&1; then
  open "$LOCAL_URL"
fi

# macOS 自带 Bash 版本不支持 wait -n，因此轮询两个子进程。
while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$CLIENT_PID" 2>/dev/null; do
  sleep 1
done

error "客户端或服务端已意外退出。"
exit 1
