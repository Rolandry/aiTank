---
name: pixel-topdown-game-assets
description: This skill should be used when generating or updating 2D top-down pixel-art game assets such as unit sprites, tile-based terrain, obstacles, projectiles, effect frames and UI badges, and the user says things like "generate game art", "make pixel sprites", "生成美术素材", "做一套贴图", "补一个障碍物素材", "替换素材". It provides a tile-grid-anchored spec system, generation prompt templates, a naming convention, and an executable verification method that checks pixel dimensions, transparency, and code-reference consistency. Use it especially when assets must align to a collision grid, when a set must stay visually consistent across variants, or when replacing an existing asset set in place.
version: 2.0.0
---

# Pixel Top-Down Game Assets

2D 俯视角像素素材的成套生成与替换方法。

核心主张：**素材规格由碰撞网格反推，而非先画好再适配**。尺寸对不上网格的素材，游戏里必然出现视觉与判定不一致。

## 适用场景

适用：

- 2D 正俯视角游戏的成套素材生成（单位、地形、障碍、弹药、特效、UI 徽章）
- 已有素材集的同名替换或增补
- 需要多个变体保持视觉一致（如同款单位的多色版本）

不适用：

- 3D 模型、斜 45° 或第一人称视角
- 写实高精度风格
- 单张插画（无需成套一致性约束）

## 输入

调用前需明确以下参数，未指定则用缺省值：

| 参数 | 缺省 | 说明 |
|---|---|---|
| 瓦片基准尺寸 | 32px | 所有素材尺寸的最小单位 |
| 网格规模 | 16×12 格 | 决定完整地图尺寸 |
| 单位尺寸 | 2×2 格 | 单位精灵占几格 |
| 风格 | 像素风 | 边缘锐利、无渐变 |
| 变体配色 | 红蓝绿黄 | 变体数量与主色 |
| 主题数量 | 4 | 地形主题及其配色 |

若这是**替换既有素材集**，还需明确：目标目录、命名是否变化、是否有新增类别。

AI Tank 2.0 的目录约定：

- 上游素材与原始 Skill：`tank-battle-assets-1.0/`
- 客户端运行素材：`client/public/assets/`
- 可加载沉淀 Skill：`.codeflicker/skills/pixel-topdown-game-assets/`

更新上游美术 Skill 时，必须同步 `references/asset-spec-reference.md`，并确保两份规格正文一致。

## 输出

产出物分三部分：

1. **素材文件**：PNG，透明背景，尺寸为瓦片整数倍
2. **命名清单**：遵循 `<类别>_<主题>_<名称>_<格数>.png` 约定
3. **规格记录**：每个素材的像素尺寸与用途，便于消费方核对

目录结构：

```
assets/
├── units/        <单位>_<变体>.png
├── terrain/      tile_<主题>.png、fullmap_<主题>_<列>x<行>.png
├── obstacles/    obstacle_<主题>_<名称>_<格数>.png
├── projectiles/  <弹药名>.png
├── effects/      <特效名>_frame_NN.png
└── badges/       <徽章名>_<变体>.png
```

## 操作步骤

### 步骤 1：确认输入参数

按「输入」表逐项确认。**替换场景要额外确认同名文件是否内容已变**——同名不代表同内容，需全量覆盖而非按文件名跳过。

### 步骤 2：由网格反推尺寸

先算出各类素材的像素尺寸，再开始生成：

```
1×1 格 = 瓦片尺寸              （如 32×32）
2×1 格 = 瓦片×2 × 瓦片         （如 64×32）
2×2 格 = 瓦片×2 × 瓦片×2       （如 64×64）
完整地图 = 列数×瓦片 × 行数×瓦片 （如 512×384）
```

单位尺寸通常等于其占格数，但**碰撞盒可小于视觉尺寸**（如炮管伸出部分不参与碰撞），需在规格记录中注明。

### 步骤 3：先做基准件，再派生变体

变体一致性靠派生而非重画：

1. 制作 1 个基准件，确认造型
2. **仅替换主色**生成其余变体，其他部件（轮廓、细节、附件）完全一致
3. 核验各变体的尺寸、轮廓、附件位置完全相同

这是变体不走形的唯一可靠做法。重新画每个变体必然出现细节漂移。

### 步骤 4：生成地形与障碍

地形提供两种形态：

- **单格瓦片**：可平铺，适合程序化拼接
- **完整整图**：整张背景，避免平铺接缝与重复感

障碍物按格数分档（小/中/大），每档对应固定像素尺寸，严格对齐网格。

配色遵循**地面浅、障碍深**的对比原则，保证单位与障碍在视觉上可分离。

### 步骤 5：生成特效序列帧

多帧特效必须**中心点对齐画布中心**，否则播放时会跳动。各帧尺寸统一，靠内容大小体现动画进程而非改变画布尺寸。

### 步骤 6：验证与交付

执行「验证方法」全部检查项，通过后按命名规范交付。

## 约束

以下为硬性约束，违反会导致游戏内表现异常：

1. **尺寸必须是瓦片整数倍**。非整数倍会导致视觉与碰撞判定错位。
2. **背景纯透明**。不可有白底或半透明杂边。
3. **视角严格正俯视**。不可有透视变形或倾斜。
4. **变体仅主色不同**。其余像素必须完全一致。
5. **序列帧中心对齐**。画布尺寸统一。
6. **像素风需关闭插值**。消费方渲染时须禁用图像平滑，否则边缘发虚。
7. **替换时全量覆盖同名文件**。不可因文件名相同而跳过。
8. **新增素材必须同步消费方引用**。素材存在但代码未引用等于没做。
9. **AI Tank 2.0 必须双目录同步**。`tank-battle-assets-1.0/` 是上游素材事实源，`client/public/assets/` 是运行时副本；更新后还要同步沉淀 Skill 的规格参考。

## 验证方法

**目测不构成验证。** 执行以下可脚本化的检查：

### 检查 1：像素尺寸符合网格

```bash
for f in assets/obstacles/*_1x1.png; do
  size=$(file -b "$f" | grep -oE '[0-9]+ x [0-9]+')
  [ "$size" = "32 x 32" ] && echo "OK   $f" || echo "FAIL $f ($size)"
done
```

对每个格数档位重复，确认无一例外。

### 检查 2：透明背景

```bash
# PNG 需为带 alpha 通道的色彩类型（RGBA / 灰度+alpha / 调色板+tRNS）
file -b asset.png | grep -qE "RGBA|colormap" && echo "OK 含透明通道" || echo "FAIL 无透明通道"
```

### 检查 3：代码引用与文件一一对应

双向校验，两个方向都要查：

```bash
# 方向 1：代码引用的路径是否都存在
for p in $(grep -oE '/assets/[a-z-]+/[a-zA-Z0-9_]+\.png' <source-file> | sort -u); do
  [ -f "public$p" ] && echo "OK   $p" || echo "MISS $p"
done

# 方向 2：素材是否都被引用（未引用说明是死资源或漏了消费方）
```

方向 2 常被忽略，但它能发现「素材已交付却从未显示」这类问题——降级渲染逻辑会掩盖它。

### 检查 4：运行时可访问

启动服务后逐个请求，确认返回 200：

```bash
for f in $(find assets -name "*.png"); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:<port>/$f")
  [ "$code" = "200" ] || echo "FAIL $code $f"
done
echo "全部可访问"
```

### 检查 5：配置项覆盖率

若素材由配置枚举驱动，校验声明与实际使用是否一致：

```
声明但从未使用 → 死配置，或生成逻辑存在盲区
使用但未声明   → 会触发降级渲染
```

两个方向都要报告。

## 使用示例

### 示例 1：为新项目生成整套素材

**用户**：帮我生成一套俯视角坦克对战的美术素材，4 个主题。

**执行**：

1. 确认输入 —— 瓦片 32px、网格 16×12、单位 2×2 格、4 色变体、像素风

2. 反推尺寸：
   ```
   单位     64×64
   障碍小   32×32   中 64×32   大 64×64
   整图     512×384
   ```

3. 先做 1 辆基准坦克确认造型，再仅换主色派生其余 3 色

4. 生成 4 主题的地面瓦片与整图，每主题配 3 档障碍物

5. 生成 12×12 弹药、4 帧爆炸序列、4 色击杀徽章

6. 验证：
   ```
   OK   units/tank_red.png                    64 x 64
   OK   obstacles/obstacle_a_tree_1x1.png     32 x 32
   OK   terrain/fullmap_a_16x12.png          512 x 384
   OK   全部含透明通道
   OK   33 个素材经 HTTP 确认可访问
   ```

7. 交付素材 + 命名清单 + 规格记录

### 示例 2：替换既有素材集（同名不同内容）

**用户**：我们更新了素材，同名的也换了，全部更新一遍。

**执行**：

1. **先比对映射关系**，不要假设目录结构一致：
   ```
   OK   obstacles/xxx.png  <-  obstacles/xxx.png
   OK   terrain/fullmap_a.png  <-  full-maps/fullmap_a.png   ← 目录名不同
   MISS projectiles/bullet.png                                ← 已更名
   ```

2. 按映射全量覆盖，**不因同名而跳过**

3. 处理差异项：更名的素材需同步改代码引用；新增目录需确认消费方是否已实现

4. 用 git 确认真实变更范围：
   ```
   M obstacles/xxx.png    Bin 231 -> 259 bytes   ← 同名但内容已变
   A badges/               ← 新增
   ```

5. 验证：尺寸、透明度、引用对应、HTTP 可访问全部通过

6. 报告哪些真变了、哪些同名同内容无 diff，避免 reviewer 困惑

## 支持文件

- **`references/asset-spec-reference.md`** — 与 `tank-battle-assets-1.0/坦克大战美术skill.md` 同步的 2.0 完整规格：各类素材的造型规则、标准配色码、生成提示词模板、质量检查清单、命名规范
