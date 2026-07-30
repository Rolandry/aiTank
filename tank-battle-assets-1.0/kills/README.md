# 击杀标记资产说明

## 📋 概述

击杀标记用于在坦克大战游戏中标识每辆坦克的击杀成就。当一辆坦克击败对手后，会在其头顶显示对应颜色的击杀徽章。

## 🎮 游戏规则

- **开局状态**：所有坦克头顶无标记
- **击杀逻辑**：当A坦克击败B坦克时，A坦克头顶会显示B坦克颜色的击杀标记
- **示例**：红色坦克击败蓝色坦克 → 红色坦克头顶显示蓝色标记

## 📐 规格参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 尺寸 | 20×20px | 约为坦克尺寸的 1/3 |
| 网格尺寸 | 0.625×0.625格 | 基于32px瓦片单位 |
| 显示位置 | 坦克正上方 4-8px | 不遮挡坦克主体 |
| 碰撞 | 无碰撞 | 仅作UI显示元素 |
| 背景 | 纯透明 | 符合像素风格规范 |

## 🎨 资产清单

### SVG源文件（矢量格式，可编辑）
- `kill_marker_red.svg` - 红色击杀标记
- `kill_marker_blue.svg` - 蓝色击杀标记  
- `kill_marker_green.svg` - 绿色击杀标记
- `kill_marker_yellow.svg` - 黄色击杀标记

### PNG图像（游戏导入用）
- `kill_marker_red.png` - 红色击杀标记
- `kill_marker_blue.png` - 蓝色击杀标记
- `kill_marker_green.png` - 绿色击杀标记
- `kill_marker_yellow.png` - 黄色击杀标记

### 示例文件
- `kill_marker_usage_example.svg` - 使用示意图

## 🎨 配色方案

| 标记颜色 | 主色值 | 边框色值 | 对应坦克 |
|---------|--------|---------|---------|
| 红色 | `#E53935` | `#8D1917` | 红色坦克 |
| 蓝色 | `#1E88E5` | `#155A9C` | 蓝色坦克 |
| 绿色 | `#43A047` | `#2D6A2F` | 绿色坦克 |
| 黄色 | `#FDD835` | `#C8A823` | 黄色坦克 |

## 💻 引擎集成建议

### 显示位置计算
```
标记X坐标 = 坦克中心X - 10px（标记宽度的一半）
标记Y坐标 = 坦克顶部Y - 24px（留出4-8px间距）
```

### 堆叠显示（多个击杀）
如果一个坦克击败了多个对手，建议：
- **横向排列**：从中心向两侧展开
- **间距**：标记间距4px
- **最多显示**：建议最多显示3-5个标记，超出后用数字标识

示例（击败3个对手）：
```
    🔵 🟢 🟡  ← 标记
       🔴     ← 坦克
```

### 动画效果（可选）
- **出现动画**：从小到大缩放（0.5x → 1x，持续0.2秒）
- **位置动画**：从坦克中心向上浮现
- **闪烁效果**：新获得标记可短暂闪烁1-2次

## 📂 文件结构

```
kills/
├── kill_marker_red.svg         # 红色标记源文件
├── kill_marker_red.png         # 红色标记PNG
├── kill_marker_blue.svg        # 蓝色标记源文件
├── kill_marker_blue.png        # 蓝色标记PNG
├── kill_marker_green.svg       # 绿色标记源文件
├── kill_marker_green.png       # 绿色标记PNG
├── kill_marker_yellow.svg      # 黄色标记源文件
├── kill_marker_yellow.png      # 黄色标记PNG
├── kill_marker_usage_example.svg  # 使用示意图
└── README.md                   # 本说明文档
```

## 🔧 修改与定制

如需修改标记样式：
1. 编辑对应的 `.svg` 源文件
2. 使用 `rsvg-convert` 或 `qlmanage` 重新生成PNG
3. 保持20×20px尺寸不变
4. 确保透明背景

重新生成命令（macOS）：
```bash
cd kills/
rsvg-convert -w 20 -h 20 kill_marker_red.svg -o kill_marker_red.png
```

## 📖 相关文档

- `../asset-map.md` - 完整资产映射表
- `../../.codeflicker/skills/pixel-topdown-game-assets/` - 美术素材生成 skill（含规范总览）
