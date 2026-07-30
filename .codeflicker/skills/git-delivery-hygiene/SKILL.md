---
name: git-delivery-hygiene
description: This skill should be used when committing, syncing, or pushing code, and the user says things like "commit this", "push to git", "提交改动", "推到远端", "同步一下", "和远端同步了吗". It provides pre-commit noise screening, commit granularity judgment, structured commit messages with a verification section, and safe rebase-based syncing. Use it especially when deciding whether to split commits, when the working tree contains editor-generated formatting noise, when a rebase hits conflicts, or when local and remote have diverged.
version: 1.1.0
---

# Git Delivery Hygiene

提交与同步的工程纪律：**入库前先筛噪音，提交信息带验证证据，同步用变基保持线性**。

核心主张：提交历史是给未来的人看的。让每个提交能独立编译、能解释自己为什么存在、能追溯到验证依据。

## 适用场景

适用：

- 完成一组改动准备入库
- 用户要求提交、推送、同步远端
- 需要判断提交拆分粒度
- 本地与远端分叉需要处理

不适用：初始化仓库、配置凭证、分支策略设计——这些属于仓库治理，不在本 skill 范围。

## 输入

执行前需获取以下事实，**不可依赖记忆**：

| 输入 | 获取方式 |
|---|---|
| 工作区改动清单 | `git status --short` |
| 与远端的差异 | `git fetch -q && git status -sb` |
| 改动具体内容 | `git diff` / `git diff --cached` |
| 本次改动的验证结果 | 来自实际执行的测试输出 |

## 输出

1. **干净的暂存区**：已剔除噪音与调试残留
2. **结构化提交**：含类型前缀、分段说明、验证段落
3. **同步状态**：与远端一致，工作区干净
4. **状态报告**：基于 `git status -sb` 实际输出，而非推测

## 操作步骤

### 步骤 1：筛查噪音

先看清范围：

```bash
git status --short
git status -sb | head -2
```

以下改动**不应入库**：

| 噪音类型 | 特征 | 处置 |
|---|---|---|
| 编辑器格式化 | 表格对齐、引号统一、行尾空白，无内容变化 | `git checkout --` 丢弃 |
| 内容已过期 | 文档描述的功能已被移除 | 丢弃，或单独修正内容 |
| 调试残留 | 临时日志、`TODO`、断点 | 删除后再提交 |
| 无关文件 | 本地配置、临时脚本、构建产物 | 移出暂存区或加忽略 |

判断格式化噪音：看 `git diff` 是否只有空白与标点变化。

一条易忽略的经验：**格式化改动往往顺带保留了过期内容**。编辑器只对齐表格，不会发现表里某行描述的功能上周已删。因此发现纯格式改动时，顺手检查内容是否也过期。

### 步骤 2：判断提交粒度

拆分的唯一硬标准：**每个提交必须能独立编译通过**。

由此推导：

- 多个特性改动了**不同文件** → 拆分
- 多个特性改动了**同一文件的同一处**（如共同扩展某函数签名） → **合并**

第二种情况若强行按文件拆，会产生「签名已改但调用方未跟进」的中间提交，无法编译，`git bisect` 会在这些提交上失败。合并时在提交信息中**分段说明各特性**。

两条常见误判：

- 「一个提交只做一件事」是目标而非教条。契约层被多特性共享时物理上无法拆。
- 测试脚本应与被测代码同提交。否则中间状态下测试指向不存在的行为。

### 步骤 3：撰写提交信息

```
<type>: <一句话概述>

<特性分段标题>
- 要点，说明改了什么和为什么
- 反直觉的决定要写明它防的是什么问题

修复
- 顺手修掉的既有缺陷，单列以便追溯

验证
- 新增测试及其覆盖范围
- 既有回归的通过情况
```

类型前缀：`feat` 新增能力、`fix` 缺陷修复、`refactor` 行为不变的结构调整、`chore` 资源与配置、`test` 仅测试、`docs` 仅文档。

多行写法（引号包裹避免 shell 展开）：

```bash
git commit -q -F - <<'EOF'
feat: 概述

分段标题
- 要点

验证
- 测试情况
EOF
```

### 步骤 4：同步远端

```bash
git fetch -q
git status -sb | head -2
```

按输出决策：

| 输出 | 含义 | 动作 |
|---|---|---|
| `## main...origin/main` | 已同步 | 无需操作 |
| `[ahead N]` | 本地有新提交 | 直接推送 |
| `[behind N]` | 远端有新提交 | 快进合并 |
| `[ahead N, behind M]` | 双向分叉 | 变基 |

分叉时先评估冲突风险，再变基：

```bash
git log --oneline HEAD..origin/main        # 远端改了什么
git diff --name-only HEAD...origin/main    # 涉及哪些文件
git rebase origin/main
```

变基优于合并，因为保持线性历史便于二分定位。

### 步骤 5：变基后重新验证

变基把本地改动重放到新基线，此前验证结果已失效。至少重跑类型检查与构建。

### 步骤 6：推送并确认

```bash
git push origin <branch>
git status -sb | head -2
git status --short
```

回答「同步了吗」必须依据实际输出。提交历史一致但工作区有改动，不算同步完成。

## 约束

1. **禁止提交编辑器格式化噪音**
2. **禁止产生无法独立编译的中间提交**
3. **提交信息必须含验证段落**
4. **提交信息必须写原因，不可只写现象**
5. **顺手修的缺陷必须单列一段**
6. **未 fetch 不可判断同步状态**
7. **变基后未重新验证不可推送**
8. **避免 `--force`**；必须时用 `--force-with-lease`
9. **`git checkout --` 丢弃前必须逐行确认**（未暂存改动不可恢复）

## 验证方法

### 提交前自检

```bash
git status --short                    # 改动范围是否都属本次
git diff --cached --stat              # 暂存内容概览
git diff --cached | grep -nE "^\+.*(console\.log|print\(|TODO|FIXME|debugger)"
```

第三条注意区分：测试脚本中的输出语句正常，业务代码中的调试输出不正常。

### 提交后确认

```bash
git log --oneline -1     # 提交已生成
git status --short       # 工作区干净（无输出）
```

### 同步后确认

```bash
git status -sb | head -2
```

期望 `## <branch>...origin/<branch>`，无 `ahead`/`behind` 标记。

### 忽略规则变更的双向验证

调整 `.gitignore` 后必须两个方向都验证：

```bash
# 方向 1：目标是否已放行
git check-ignore -q <target-path> && echo "FAIL 仍被忽略" || echo "OK 已放行"

# 方向 2：其余内容是否仍被忽略（造一个探针）
mkdir -p <dir>/probe && touch <dir>/probe/x
git check-ignore -q <dir>/probe/x && echo "OK 仍忽略" || echo "FAIL 未忽略"
rm -rf <dir>/probe
```

## 使用示例

### 示例 1：多特性合并提交

**场景**：三个特性完成，但都扩展了同一个创建接口的参数列表。

**判断** —— 按文件拆分会产生「参数已加但调用方未跟进」的中间提交，无法编译。故合并，分段说明。

```bash
git status --short   # 确认 17 个文件均属本次
git diff --cached | grep -nE "^\+.*console\.log"   # 仅测试脚本命中，正常

git commit -q -F - <<'EOF'
feat: 状态恢复、双模式与分类选择

状态恢复
- 引入与连接解耦的会话凭证，重连时自动恢复身份
- 中断不再立即判定失败：资源保留至本轮结束
- 主动退出与意外中断区别对待，避免被误判

双模式
- modeA 无限重试按时限结算；modeB 单次机会最后存活者胜
- modeB 超时判定为存活优先，其次得分

分类选择
- 分类枚举下沉到契约层作为唯一事实源
- 非法值回退缺省而非报错

验证
- 新增 recovery-test(14)、mode-test(11)、category-test(15)
- 既有回归 A(29)、B(100/100) 通过
EOF
```

提交信息中说明了「为什么合并」的依据体现在分段结构上，reviewer 能看出这是三个特性而非一团混乱。

### 示例 2：推送前遇到分叉

**场景**：提交完成后准备推送。

```bash
git fetch -q
git status -sb | head -2
# ## main...origin/main [ahead 1, behind 1]
```

**先评估风险**：

```bash
git log --oneline HEAD..origin/main
# f123bff feat: 渲染层改用整图素材

git diff --name-only HEAD...origin/main
# client/src/game/assets.ts
# client/src/game/renderer.ts
```

与本地改动文件无交集，变基应无冲突：

```bash
git rebase origin/main
# Successfully rebased and updated refs/heads/main
```

**变基后重新验证**（此前结果已失效）：

```bash
<type-check>   # 通过
<build>        # 通过
```

推送并确认：

```bash
git push origin main
git status -sb | head -2
# ## main...origin/main      ← 无 ahead/behind，已同步
```

### 示例 3：剔除格式化噪音

**场景**：编辑器自动改动了一个文档文件。

```bash
git diff --stat README.md
# README.md | 26 +++++++++-------------

git diff README.md | head -20
```

看到改动全是**全角空格对齐表格**，无内容变化。同时发现表里保留了一个上周已删除的功能条目——说明这份内容本身已过期。

**处置**：丢弃格式化改动，内容过期问题单独处理，不混入本次提交。

```bash
git diff README.md > /tmp/backup.patch   # 丢弃前留份备份
git checkout -- README.md
git status --short   # 确认已清理
```

丢弃前先备份，因为未暂存改动一旦丢弃无法通过 git 恢复。

## 支持文件

- **`references/commit-examples.md`** — 六类提交信息完整范例（单特性、多特性合并、含修复、资源同步、缺陷修复、重构）
- **`references/sync-troubleshooting.md`** — 变基冲突分类处理、误提交撤销、误丢弃挽回、常见状态误判
