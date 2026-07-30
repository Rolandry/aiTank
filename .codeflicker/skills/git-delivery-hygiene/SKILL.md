---
name: git-delivery-hygiene
description: This skill should be used when committing, syncing, or pushing code, and the user says things like "commit this", "push to git", "提交改动", "推到远端", "同步一下", "和远端同步了吗". It provides pre-commit noise screening, commit granularity judgment, structured commit messages with a verification section, and safe rebase-based syncing. Use it especially when deciding whether to split commits, when the working tree contains editor-generated formatting noise, when a rebase hits conflicts, or when local and remote have diverged.
version: 1.0.0
---

# Git Delivery Hygiene

提交与同步的工程纪律：**入库前先筛噪音，提交信息带验证证据，同步用变基保持线性**。

核心主张：提交历史是给未来的人看的。让每个提交能独立编译、能解释自己为什么存在、能被追溯到验证依据。

## 何时使用

用户要求提交、推送、同步远端，或你完成一组改动准备入库时。

## 阶段 1：提交前筛查

### 先看清改动范围

```bash
git status --short
git status -sb | head -2   # 分支与远端差异
```

### 识别并剔除噪音

以下改动**不应入库**，即使它们出现在工作区：

| 噪音类型 | 特征 | 处置 |
|---|---|---|
| 编辑器格式化 | 表格对齐、引号统一、行尾空白，无内容变化 | `git checkout --` 丢弃 |
| 内容已过期 | 文档描述的功能已被移除 | 丢弃，或单独修正内容 |
| 调试残留 | 临时日志、`TODO`、断点 | 删除后再提交 |
| 无关文件 | 本地配置、临时脚本、构建产物 | 从暂存区移除或加忽略 |

判断格式化噪音的方法：看 `git diff` 是否只有空白与标点变化。若某文件全部改动都属此类，直接丢弃。

一个易忽略的信号：**格式化改动往往顺带保留了过期内容**。编辑器只对齐表格，不会发现表里有一行描述的功能上周已删除。因此发现纯格式改动时，顺手检查内容是否也过期了。

### 检查调试残留

```bash
git diff --cached | grep -nE "^\+.*(console\.log|print\(|TODO|FIXME|debugger)"
```

注意区分：测试脚本中的输出语句是正常的，业务代码中的调试输出不是。

## 阶段 2：判断提交粒度

### 决策准则

拆分的唯一硬标准：**每个提交必须能独立编译通过**。

按此推导：

- 多个特性改动了**不同文件** → 拆分
- 多个特性改动了**同一文件的同一处**（如共同扩展了某个函数签名） → **合并**

第二种情况若强行按文件拆分，会产生「函数签名已改但调用方未跟进」的中间提交，无法编译。这类历史比大提交更难用——`git bisect` 会在这些提交上失败。

合并时，在提交信息中**分段说明各特性**，保留可读性。

### 常见误判

- 「一个提交只做一件事」是目标而非教条。当契约层改动被多个特性共享时，物理上无法拆分。
- 测试脚本应与被测代码同提交，而非单独提交。否则中间状态下测试指向不存在的行为。

## 阶段 3：撰写提交信息

### 结构

```
<type>: <一句话概述>

<特性分段标题>
- 要点，说明改了什么和为什么
- 反直觉的决定要写明它防的是什么问题

<另一个特性分段标题>
- ...

修复
- 顺手修掉的既有缺陷，单列一段以便追溯

验证
- 新增测试及其覆盖范围
- 既有回归的通过情况
```

### 类型前缀

| 前缀 | 用途 |
|---|---|
| `feat` | 新增能力 |
| `fix` | 缺陷修复 |
| `refactor` | 行为不变的结构调整 |
| `chore` | 资源同步、依赖更新、工具配置 |
| `test` | 仅测试改动 |
| `docs` | 仅文档改动 |

### 三条要求

1. **写原因而非仅写现象**。「断线不再立即判定淘汰：坦克静止留场但仍可被击中」比「修改断线逻辑」有用得多。

2. **验证段落必填**。列出新增测试的覆盖范围与既有回归结果。这让 reviewer 知道改动被验证到什么程度，也让未来的人知道该跑哪些测试。

3. **顺手修的缺陷单列一段**。它与主需求无关，混在特性描述里会丢失可追溯性。

### 多行提交信息的写法

```bash
git commit -q -F - <<'EOF'
feat: 概述

分段标题
- 要点

验证
- 测试情况
EOF
```

使用 `<<'EOF'`（引号包裹）避免 shell 展开反引号与变量。

## 阶段 4：同步远端

### 推送前必先拉取

```bash
git fetch -q
git status -sb | head -2
```

读取输出：

| 输出 | 含义 | 动作 |
|---|---|---|
| `## main...origin/main` | 已同步 | 无需操作 |
| `[ahead N]` | 本地有新提交 | 直接推送 |
| `[behind N]` | 远端有新提交 | 快进合并 |
| `[ahead N, behind M]` | 双向分叉 | 变基 |

### 分叉时优先变基

```bash
# 先看远端改了什么，评估冲突风险
git log --oneline HEAD..origin/main
git diff --name-only HEAD...origin/main

git rebase origin/main
```

变基优于合并的原因是保持线性历史，便于二分定位。

若文件无重叠，变基通常无冲突。有重叠时逐个解决，**注意区分两种情况**：

- 双方在同一位置新增了不同分支逻辑 → 通常两者都要保留，注意顺序（如兜底分支必须在最后）
- 双方修改了同一行 → 需判断语义，不可机械选择一边

### 变基后必须重新验证

变基把本地改动重放到了新基线上，此前的验证结果已失效。至少重跑类型检查与构建。

### 推送

```bash
git push origin <branch>
git status -sb | head -2   # 确认已同步
```

避免使用 `--force`。若确实需要，先确认无人基于该分支工作。

## 阶段 5：交付确认

回答「同步了吗」时，依据 `git status -sb` 的实际输出，而非记忆。同时确认工作区干净——有未提交改动就不算真正同步完成。

## 反模式

1. 把编辑器格式化噪音一起提交
2. 提交信息只写「修改了 xxx」，不写原因
3. 提交信息缺少验证段落
4. 为了「一个提交一件事」而产生无法编译的中间提交
5. 未拉取就推送，或分叉时直接合并制造无意义的 merge 提交
6. 变基后不重新验证就推送
7. 声称已同步但未实际查看 git 状态

## 支持文件

- **`references/commit-examples.md`** — 各类型提交信息完整范例
- **`references/sync-troubleshooting.md`** — 变基冲突、误提交、历史修正的处理步骤
