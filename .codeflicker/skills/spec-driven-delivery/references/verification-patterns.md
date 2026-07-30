# 验证模式参考

## 回归脚本骨架

任何语言均可，关键是产出机器可判读的结论。以 TypeScript 为例：

```typescript
const results: string[] = [];
let failures = 0;

function check(name: string, passed: boolean, detail = ""): void {
  if (!passed) failures++;
  results.push(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function main(): Promise<void> {
  // 各场景断言
}

main()
  .then(() => {
    console.log(results.join("\n"));
    console.log(
      failures === 0 ? `\nALL PASS (${results.length} checks)` : `\nFAILED ${failures}`
    );
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("测试异常:", err);
    console.log(results.join("\n")); // 异常时也输出已完成部分，便于定位中断位置
    process.exit(1);
  });
```

三个设计要点：

1. **`detail` 带上实际观测值**。`FAIL 状态正确` 无法定位问题，`FAIL 状态正确 (实际=pending 期望=active)` 可以。
2. **异常时输出已有结果**。中途崩溃要能看出跑到哪一步。
3. **退出码区分成败**。便于 `grep -E "ALL PASS|FAILED"` 快速汇总，也便于串入流水线。

## 选择验证层级

| 层级 | 适用场景 | 代价 |
|---|---|---|
| 真实协议交互 | 端到端行为、状态机流转 | 需启动服务，较慢 |
| 直接驱动核心对象 | 内部状态、时间推进 | 需绕过初始化流程 |
| 纯函数调用 | 算法、数据转换 | 覆盖面窄 |

优先真实交互。只有当需要观察对象内部字段、或需要操纵时间时，才降到直接驱动。

## 四类场景的构造技巧

### 正向场景

覆盖需求描述的主路径。注意断言要落到**可观测的外部表现**，而非内部实现细节。

### 差异场景

同一操作在不同配置下的表现差异，是双模式/多主题类需求的核心。用循环遍历配置，同一套断言逻辑分支判断：

```typescript
for (const mode of ["modeA", "modeB"] as const) {
  const ctx = await setup(mode);
  act(ctx);
  if (mode === "modeA") {
    check(`[${mode}] 预期行为 A`, ...);
  } else {
    check(`[${mode}] 预期行为 B`, ...);
  }
}
```

断言名带上配置前缀，失败时一眼看出是哪个分支。

### 边界场景

必测的四种：

- **时限到期**：需要推进时间。可临时替换时间函数，注意用完恢复
  ```typescript
  const orig = Date.now;
  const base = orig();
  (Date as any).now = () => base + 4000;
  step(); // 触发到期逻辑
  (Date as any).now = orig; // 必须恢复，否则污染后续用例
  ```
- **集合为空 / 仅一元素**：容易触发「取第一个」类逻辑的空指针
- **目标已销毁**：对已结束/已删除的对象操作，应拒绝而非崩溃
- **重复触发**：同一操作连续两次，第二次应幂等或明确拒绝

### 恶意场景

凡是有凭证、权限、限制的地方都要测：

- 伪造凭证 → 应拒绝
- 越权访问他人资源 → 应拒绝
- 绕过限制的路径 → 应拒绝
- 已失效凭证复用 → 应拒绝

这类断言检查的是「拒绝」，注意确认拒绝原因码正确，而非仅确认「没成功」。

## 常见陷阱

### 时间未真实推进

同步循环里连续调用步进函数，两次调用间隔接近 0，依赖时间差的逻辑（移动、冷却、衰减）不会生效。需在两次之间引入真实等待，或显式传入模拟时间差。

### 初始化为零导致首次触发异常

时间戳字段初始化为 `0` 而非当前时间，会导致首个周期立刻判定「已超时」。表现为「一启动就触发」的怪异行为。

### 异步事件未等待

发出请求后立即断言，事件可能还没到。用轮询等待特定事件类型，带超时上限：

```typescript
async function wait(type: string, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = received.find((x) => x.type === type);
    if (found) return found;
    await sleep(30);
  }
  return null; // 超时返回 null，让断言失败而非永久挂起
}
```

### 用例间状态污染

共享单例、全局计数器、被替换的内置函数，都会让用例顺序影响结果。每个用例独立构造上下文，替换过的全局函数务必恢复。

### 断言了实现而非行为

断言内部私有字段会让重构频繁误报。优先断言外部可观测的输出。确需检查内部状态时，在注释中说明原因。

## 覆盖率自检

用映射校验代替目测。例如校验「配置项是否都被实际使用」：

```typescript
const DECLARED = new Set([...]);  // 声明的配置
const OBSERVED = new Set<string>();
for (let i = 0; i < 80; i++) {    // 多次采样，覆盖随机性
  for (const item of generate()) OBSERVED.add(item.type);
}
console.log("缺实现:", [...OBSERVED].filter((t) => !DECLARED.has(t)));
console.log("声明未用:", [...DECLARED].filter((t) => !OBSERVED.has(t)));
```

两个方向都要查：缺实现会导致降级，声明未用说明存在死配置或生成逻辑有盲区。
