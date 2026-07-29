# 坦克大战美术资产映射表

> 基准瓦片：32×32px | 地图网格：64×64格 | 所有尺寸单位：格（1格=32px）

## 坦克 / tanks/

| 文件名 | 像素尺寸 | 网格尺寸 | 配色 |
|--------|---------|---------|------|
| tank_red.png | 64×64 | 2×2 | #E53935 赤焰 |
| tank_blue.png | 64×64 | 2×2 | #1E88E5 苍蓝 |
| tank_green.png | 64×64 | 2×2 | #43A047 翠影 |
| tank_yellow.png | 64×64 | 2×2 | #FDD835 曜金 |

## 地面瓦片 / maps/

| 文件名 | 像素尺寸 | 网格尺寸 | 主题 |
|--------|---------|---------|------|
| map_grass_jungle_tile.png | 32×32 | 1×1 | 草地丛林 |
| map_desert_gobi_tile.png | 32×32 | 1×1 | 荒漠戈壁 |
| map_snow_tundra_tile.png | 32×32 | 1×1 | 雪地冰原 |
| map_city_ruins_tile.png | 32×32 | 1×1 | 城市废墟 |

## 障碍物 / obstacles/

| 文件名 | 像素尺寸 | 网格尺寸 | 主题 | 类型 |
|--------|---------|---------|------|------|
| obstacle_grass_jungle_tree_1x1.png | 32×32 | 1×1 | 草地丛林 | 树木 |
| obstacle_grass_jungle_rock_2x1.png | 64×32 | 2×1 | 草地丛林 | 岩石 |
| obstacle_grass_jungle_crate_2x2.png | 64×64 | 2×2 | 草地丛林 | 木箱 |
| obstacle_desert_gobi_stone_1x1.png | 32×32 | 1×1 | 荒漠戈壁 | 石块 |
| obstacle_desert_gobi_ruins_2x1.png | 64×32 | 2×1 | 荒漠戈壁 | 废墟 |
| obstacle_desert_gobi_dune_2x2.png | 64×64 | 2×2 | 荒漠戈壁 | 沙堆 |
| obstacle_snow_tundra_ice_1x1.png | 32×32 | 1×1 | 雪地冰原 | 冰堆 |
| obstacle_snow_tundra_snowblock_2x1.png | 64×32 | 2×1 | 雪地冰原 | 雪块 |
| obstacle_snow_tundra_crate_2x2.png | 64×64 | 2×2 | 雪地冰原 | 木箱 |
| obstacle_city_ruins_steel_1x1.png | 32×32 | 1×1 | 城市废墟 | 钢板 |
| obstacle_city_ruins_wall_2x1.png | 64×32 | 2×1 | 城市废墟 | 砖墙 |
| obstacle_city_ruins_barricade_2x2.png | 64×64 | 2×2 | 城市废墟 | 路障 |

## 子弹 / bullets/

| 文件名 | 像素尺寸 | 网格尺寸 | 配色 |
|--------|---------|---------|------|
| bullet_default.png | 12×12 | 0.375×0.375 | #FFFFFF+#FFEB3B |

## 特效 / effects/

| 文件名 | 像素尺寸 | 网格尺寸 | 帧序 | 内容 |
|--------|---------|---------|------|------|
| explosion_frame_01.png | 64×64 | 2×2 | 帧1 | 命中闪光 Ø16px |
| explosion_frame_02.png | 64×64 | 2×2 | 帧2 | 中心爆发 Ø32px |
| explosion_frame_03.png | 64×64 | 2×2 | 帧3 | 扩散烟雾 Ø48px |
| explosion_frame_04.png | 64×64 | 2×2 | 帧4 | 消散淡化 Ø60px |

## 击杀标记 / kills/

| 文件名 | 像素尺寸 | 网格尺寸 | 配色 | 说明 |
|--------|---------|---------|------|------|
| kill_marker_red.png | 20×20 | 0.625×0.625 | #E53935 赤焰 | 击败红色坦克标记 |
| kill_marker_blue.png | 20×20 | 0.625×0.625 | #1E88E5 苍蓝 | 击败蓝色坦克标记 |
| kill_marker_green.png | 20×20 | 0.625×0.625 | #43A047 翠影 | 击败绿色坦克标记 |
| kill_marker_yellow.png | 20×20 | 0.625×0.625 | #FDD835 曜金 | 击败黄色坦克标记 |

## 尺寸速查

| 网格尺寸 | 像素尺寸 | 用途 |
|---------|---------|------|
| 1×1 | 32×32 | 地面瓦片、小型障碍物 |
| 2×1 | 64×32 | 中型障碍物（横向） |
| 2×2 | 64×64 | 坦克、大型障碍物、爆炸特效 |
| 0.625×0.625 | 20×20 | 击杀标记 |
| 0.375×0.375 | 12×12 | 子弹 |

## 碰撞盒参考

- **坦克**：车身矩形区域（不含炮管超出部分），2×2格
- **障碍物**：占满完整瓦片格子,碰撞检测按网格坐标判定
- **子弹**：碰撞半径约 0.35 格（12px / 32px ≈ 0.375）
- **爆炸特效**：不参与碰撞,仅视觉反馈,画布中心对齐
- **击杀标记**：不参与碰撞,仅UI显示,建议显示在坦克正上方4-8px处
