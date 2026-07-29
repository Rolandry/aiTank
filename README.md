# AI 坦克竞技场

在线多人坦克对战小游戏，2~4 人自由混战，最后存活者获胜。

## 技术栈

| 模块 | 技术 |
|------|------|
| 客户端 | React 18 + TypeScript + Vite + Canvas 2D |
| 服务端 | Node.js + TypeScript + WebSocket (ws) |
| 通信 | WebSocket + JSON |

## 项目结构

```
aiTank/
├── shared/                  # 共享协议类型（客户端和服务端共用）
│   └── protocol.ts
├── client/                  # 客户端
│   ├── src/
│   │   ├── pages/           # 页面（首页/大厅/游戏）
│   │   ├── game/            # 游戏核心（渲染/输入/素材/爆炸）
│   │   ├── network/         # WebSocket 通信
│   │   ├── hooks/           # React Hooks
│   │   └── types/           # 协议类型（re-export shared）
│   └── public/assets/       # 美术素材
├── server/                  # 服务端
│   └── src/
│       ├── index.ts         # 入口（WebSocket 服务）
│       ├── room.ts          # 房间管理
│       ├── game.ts          # 游戏世界状态机
│       ├── collision.ts     # 碰撞检测
│       └── map.ts           # 地图定义
└── tank-battle-assets/      # 原始美术素材
```

---

## 局域网联机指南

### 主机（你）需要做什么

#### 1. 启动服务端

```bash
cd aiTank/server
npm install
npm start
```

服务端启动后显示：
```
[aitank-server] WebSocket listening on ws://0.0.0.0:8080/ws
```

#### 2. 启动客户端

```bash
cd aiTank/client
npm install
npm run dev
```

客户端启动后显示：
```
  VITE v5.4.21  ready in 133 ms
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://<你的IP>:3000/
```

#### 3. 查看本机局域网 IP

```bash
# macOS
ipconfig getifaddr en0

# Windows
ipconfig
```

#### 4. 把局域网地址告诉其他玩家

```
http://<你的IP>:3000
```

#### 5. 自己也开始游戏

打开 `http://localhost:3000`，输入昵称，创建房间。

---

### 其他玩家需要做什么

#### 前提条件

- 和主机在同一局域网（同一 WiFi）
- 有一台电脑（Windows/Mac 均可）
- 有现代浏览器（Chrome/Firefox/Safari/Edge）

#### 不需要安装任何东西

- 不需要 Node.js
- 不需要 Git
- 不需要任何开发工具
- 只需要浏览器

#### 操作步骤

**第 1 步：打开浏览器**

在浏览器地址栏输入主机提供的地址：

```
http://<主机IP>:3000
```

**第 2 步：输入昵称**

在首页输入自己的昵称（1~12 个字符）

**第 3 步：加入房间**

| 情况 | 操作 |
|------|------|
| 主机已创建房间 | 输入 4 位房间号，点击"加入房间" |
| 主机还没创建 | 等主机先创建，或自己创建一个新房间 |

**第 4 步：开始游戏**

- 等房主点击"开始游戏"
- 倒计时 3 秒后开始

---

## 游戏操作

| 操作 | 按键 |
|------|------|
| 向上移动 | W 或 ↑ |
| 向下移动 | S 或 ↓ |
| 向左移动 | A 或 ← |
| 向右移动 | D 或 → |
| 射击 | Space |

## 游戏规则

| 项目 | 规则 |
|------|------|
| 人数 | 2~4 人 |
| 生命 | 每人 3 点 |
| 伤害 | 每次命中扣 1 点 |
| 射击冷却 | 500 毫秒 |
| 子弹上限 | 每人最多 3 颗在场 |
| 胜利条件 | 最后存活者 |
| 超时判定 | 120 秒，先比 HP，再比命中次数，相同则平局 |

---

## 常见问题

### 其他玩家打不开页面

| 检查项 | 操作 |
|--------|------|
| 是否同一 WiFi | 确认和主机连接同一网络 |
| 能否 ping 通 | `ping <主机IP>` |
| 主机服务是否启动 | 确认服务端和客户端都在运行 |

### Chrome 报 ERR_ADDRESS_UNREACHABLE，但 Safari 正常 / ping 通 / 防火墙已关

这是 **Chrome 本地状态问题**，与网络和主机无关（可用终端验证：`curl --noproxy '*' http://<主机IP>:3000` 返回 200 即证明网络层正常）。按顺序尝试：

1. **Cmd+Q 完全退出 Chrome 再重开**（是退出应用，不是关窗口）
2. 清除网络内部缓存：
   - 打开 `chrome://net-internals/#sockets` → 点 **Flush socket pools**
   - 打开 `chrome://net-internals/#dns` → 点 **Clear host cache**
3. **关闭安全 DNS**：`chrome://settings/security` → "使用安全 DNS" 关闭
4. **无痕窗口**打开地址测试：若无痕正常，说明是某个扩展在拦截（`chrome://extensions` 停用代理/VPN/安全类扩展）
5. 打开 `chrome://policy` 检查是否有企业下发的代理策略
6. 最后手段：`chrome://settings/reset` 重置浏览器设置

### 提示"无法连接到服务器"

| 检查项 | 操作 |
|--------|------|
| 服务端是否启动 | 确认 `npm start` 在运行 |
| 端口是否被占用 | `lsof -i :8080` |

### 提示"房间不存在"

- 确认房间号输入正确（4 位大写字母+数字）
- 确认主机已创建房间

### 提示"房间人数已满"

- 一个房间最多 4 人
- 让主机创建新房间

---

## 开发命令

### 客户端

```bash
cd client
npm install        # 安装依赖
npm run dev        # 开发模式（端口 3000）
npm run build      # 构建
npm run preview    # 预览构建产物
```

### 服务端

```bash
cd server
npm install        # 安装依赖
npm start          # 启动（端口 8080）
npm run dev        # 开发模式（自动重启）
npm run typecheck  # 类型检查
```
