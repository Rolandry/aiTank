# 测试文档

## 目录结构

```
aiTank/
├── server/
│   └── test/
│       ├── unit/
│       │   ├── collision.test.ts    — 碰撞检测单元测试
│       │   ├── map.test.ts          — 障碍物生成单元测试
│       │   └── game.test.ts         — 游戏逻辑单元测试
│       ├── integration/
│       │   ├── room.test.ts         — 房间管理集成测试
│       │   └── server.test.ts       — WebSocket 服务端集成测试
│       └── stress/
│           └── stress.test.ts       — 压力测试
├── client/
│   └── test/
│       ├── unit/
│       │   ├── jitterBuffer.test.ts  — Jitter Buffer 单元测试
│       │   └── assets.test.ts        — 资源加载单元测试
│       └── integration/
│           └── jitter.test.ts        — 网络抖动集成测试
└── e2e/
    └── e2e/
        └── robustness.test.ts        — 鲁棒性 E2E 测试
```

## 运行方式

### 服务端测试（61 个）

```bash
cd server && npm test
```

### 客户端测试（13 个）

```bash
cd client && npm test
```

### E2E 测试（需安装 Playwright 浏览器）

```bash
cd e2e && npm test
```

### 运行单个测试文件

```bash
cd server && npx vitest run test/unit/collision.test.ts
cd client && npx vitest run test/unit/jitterBuffer.test.ts
```

### 监听模式（开发时自动重跑）

```bash
cd server && npm run test:watch
cd client && npm run test:watch
```

## 测试框架

- **Vitest** — 服务端和客户端单元/集成/压力测试
- **Playwright** — E2E 浏览器自动化测试

## 测试指标

### 服务端单元测试

#### collision.test.ts（17 个）

| 指标 | 测试内容 |
|------|---------|
| AABB 重叠检测 | 重叠 / 边界相切不算重叠 / 包含关系 / 完全分离 |
| 坦克碰撞盒 | 中心坐标 → 48×48 矩形转换正确 |
| 子弹碰撞盒 | 中心坐标 → 12×12 矩形转换正确 |
| 障碍物碰撞 | 命中 / 未命中 / 空列表 |
| 地图边界 | 地图内 / 左上越界 / 右下越界 / 刚好在边界 |
| 方向向量 | up/down/left/right 四方向向量正确 |

#### map.test.ts（11 个）

| 指标 | 测试内容 |
|------|---------|
| 主题随机性 | 返回有效主题 / 不连续重复同一主题 |
| 障碍物边界 | 不超出 1024×768 地图边界 |
| 障碍物重叠 | 所有障碍物网格不重叠 |
| 出生点安全 | 出生点 1 格半径内无障碍物 |
| 连通性 | 四出生点 BFS 互相可达 |
| 布局随机性 | 多次调用生成不同布局 |
| 主题覆盖 | 四个主题都能生成有效地图 |
| 验证函数 | 空列表不通过 / 有效地图通过 |

#### game.test.ts（12 个）

| 指标 | 测试内容 |
|------|---------|
| 输入序列 | 接受新序列号 / 丢弃重复 / 丢弃旧序号 |
| 输入状态 | 非游戏中忽略 / 死亡玩家忽略 |
| 射击冷却 | 正常射击 / 冷却内禁止 / 超过子弹上限禁止 / 死亡不能射击 |
| 游戏初始化 | start 初始化位置和属性 / stop 清除定时器 |
| 快照生成 | 包含正确字段 / 坐标精度（保留两位小数） |

### 服务端集成测试

#### room.test.ts（12 个）

| 指标 | 测试内容 |
|------|---------|
| 玩家管理 | 第一个玩家成为房主 / 按顺序分配颜色 |
| 离开房间 | 等待中离开 + 转移房主 / 所有人离开 → 销毁 |
| 游戏中断线 | 断线 → 淘汰 / 不销毁房间 |
| 大厅广播 | 发送正确的 lobby_update 消息 |
| 开始游戏 | 非房主不能开始 / 人数不足不能开始 |
| 房间管理器 | 创建唯一房间号 / 不存在的房间 → error / 满房 → error / listRooms 只返回 waiting |

#### server.test.ts（7 个）

| 指标 | 测试内容 |
|------|---------|
| 心跳 | ping → pong 带时间戳回传 |
| 房间列表 | list_rooms → room_list |
| 创建房间 | create_room → room_created（4 位房间号） |
| 错误处理 | 无效昵称 → room_error / 未知消息类型 → room_error |
| 加入房间 | 不存在的房间 → ROOM_NOT_FOUND |
| 完整流程 | create_room + join_room + lobby_update 验证人数 |

### 压力测试

#### stress.test.ts（2 个）

| 指标 | 测试内容 |
|------|---------|
| 并发连接 | 50 个客户端同时连接和创建房间，成功率 ≥90% |
| 高频输入 | 单房间 1000 次输入，处理时间 <2s 不崩溃 |

### 客户端单元测试

#### jitterBuffer.test.ts（6 个）

| 指标 | 测试内容 |
|------|---------|
| 空 buffer | 少于 2 个快照时 pop 返回 null |
| 插值 | push 2 个快照后 pop 返回插值结果 |
| 插值因子 | t 随时间增长（位置递增） |
| 新实体 | 新出现的玩家/子弹不插值（直接使用最新位置） |
| 清空 | clear 后 buffer 为空 |
| 子弹插值 | 子弹位置在前后快照之间正确插值 |

#### assets.test.ts（3 个）

| 指标 | 测试内容 |
|------|---------|
| Fallback 颜色 | 包含 red/blue/green/yellow 所有坦克颜色 |
| 加载成功 | 成功加载后 getAsset 返回图片对象 |
| 加载失败 | 失败时记录到 getFailedAssets 列表 |

### 网络抖动测试

#### jitter.test.ts（4 个）

| 指标 | 测试内容 |
|------|---------|
| 均匀到达 | 快照间隔均匀时输出位置平滑（最大帧间位移 <100） |
| 突发到达 | 一次来 3 个快照时仍能正常输出 |
| 无快照 | 长时间无快照时返回最后状态或 null |
| 单调性 | 输出位置单调递增不回退 |

### E2E 鲁棒性测试

#### robustness.test.ts

| 指标 | 测试内容 |
|------|---------|
| 无效输入 | 不输入昵称直接创建房间 → 显示错误提示 |
| 页面加载 | 页面能正常加载并显示标题 |

## 测试覆盖的鲁棒性类别

| 类别 | 覆盖测试 |
|------|---------|
| 无效输入 | 无效昵称、未知消息类型、输入字段校验、不存在的房间号 |
| 玩家断线 | 游戏中断线淘汰、房间清理、房主转移 |
| 资源加载失败 | 图片加载失败记录、fallback 颜色、降级渲染 |
| 服务端异常 | JSON 解析错误、消息分发 try/catch、未知消息返回错误 |
