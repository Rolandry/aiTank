# 同步问题处理

## 判断当前状态

```bash
git fetch -q
git status -sb | head -2
git log --oneline HEAD..origin/main    # 远端多出的提交
git log --oneline origin/main..HEAD    # 本地多出的提交
```

先评估冲突风险，再动手：

```bash
git diff --name-only HEAD...origin/main   # 双方改动的文件
```

若与本地改动的文件无交集，变基基本无冲突。

---

## 变基冲突处理

```bash
git rebase origin/main
# 冲突时
git status              # 看哪些文件冲突
# 编辑解决后
git add <files>
git rebase --continue
```

放弃变基：`git rebase --abort`（回到变基前状态，安全）。

### 两类冲突的区别

**双方各自新增了分支逻辑**：通常两者都保留，关键是顺序。

```typescript
switch (msg.type) {
  case "existingCase": ...
  case "myNewCase": ...      // 本地新增
  default: ...               // 远端新增的兜底，必须在最后
}
```

兜底分支放错位置会吞掉后续所有分支。

**双方修改了同一行**：必须理解语义后选择，不可机械取一边。若无法判断，查看双方提交信息了解各自意图。

### 变基后必须重新验证

变基是把本地提交重放到新基线，此前的验证结果已失效。至少：

```bash
<type-check>
<build>
```

若远端改动涉及本地改动的相邻区域，还应重跑相关回归。

---

## 误提交的处理

### 尚未推送

```bash
# 撤销最后一次提交，改动回到工作区
git reset --soft HEAD~1

# 仅修改提交信息
git commit --amend

# 补充漏掉的文件
git add <file>
git commit --amend --no-edit
```

### 已推送

避免改写已推送的历史。改用新提交修正：

```bash
git revert <commit>   # 生成反向提交
```

若确实必须改写（如误提交了密钥），先确认无人基于该分支工作，再 `git push --force-with-lease`。`--force-with-lease` 比 `--force` 安全，它会在远端有他人新提交时拒绝推送。

---

## 误丢弃改动的挽回

`git checkout -- <file>` 丢弃的未暂存改动**无法恢复**。因此丢弃前务必确认该文件的改动确实全是噪音：

```bash
git diff <file>   # 逐行确认
```

若改动曾被 `git add` 暂存过，可尝试从对象库找回：

```bash
git fsck --lost-found
```

---

## 工作区不干净时需要同步

```bash
git stash push -m "描述"
git rebase origin/main
git stash pop
```

`git stash pop` 可能冲突，处理方式同变基冲突。

若 stash 内容与远端改动大面积重叠，考虑先提交本地改动再变基，避免在 stash 状态下解冲突（此时无法用 `--abort` 回滚）。

---

## 常见误判

### 「已同步」但工作区有改动

`git status -sb` 显示 `## main...origin/main` 只说明**提交历史**一致，不代表工作区干净。回答同步问题时两者都要确认。

### 提交历史一致但内容不同

极少见，通常是本地文件被外部修改但未察觉。`git status --short` 会显示。

### fetch 后状态未更新

`git status -sb` 依赖本地的远端引用。若未先 `git fetch`，显示的是上次 fetch 时的状态。判断同步状态前必须先 fetch。

---

## 提交前自检清单

```bash
git status --short                    # 改动范围
git diff --cached --stat              # 暂存内容概览
git diff --cached | grep -nE "^\+.*(console\.log|TODO|FIXME|debugger)"
```

三个问题：

1. 暂存的文件是否都属于本次改动？
2. 是否混入了格式化噪音？
3. 是否有调试残留？（测试脚本中的输出语句属正常）
