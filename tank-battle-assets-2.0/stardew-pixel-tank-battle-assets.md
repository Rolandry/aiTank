# Skill: stardew-pixel-tank-battle-assets

## 技能概述

### 功能说明
生成**星露谷物语风格**的精致像素美术资源，用于 2D 正俯视角坦克对战游戏。所有素材尺寸、种类、命名与现有项目完全一致，可直接替换使用。

### 风格定义
- **参考游戏**：星露谷物语（Stardew Valley）
- **核心特征**：
  - 像素精度但笔触丰富，每个像素都有意义
  - 柔和的色阶过渡，2-3 层明暗
  - 物体有立体投影感（顶部高光 + 底部阴影）
  - 地面纹理自然不重复，有细节碎片
  - 色彩饱和度适中，不刺眼，带泥土质感和环境光

### 适用场景
- 用 AI 图像生成工具（ChatGPT/DALL-E/Midjourney 等）逐张生成
- 每张图独立生成，保证风格一致的关键是提示词统一

---

## 生成指令模板

对每张素材，将下方提示词复制到 AI 图像生成工具，替换 `[参数]` 部分即可。

### 通用风格前缀（所有素材提示词必须包含）

```
Stardew Valley style pixel art, top-down 90 degree view, [尺寸]px, transparent background, crisp pixel edges, soft 2-3 tone shading, warm and natural color palette, game sprite asset
```

---

## 坦克（4 张，64×64px）

### 通用坦克提示词
```
Stardew Valley style pixel art tank sprite, top-down 90 degree view, cannon pointing up, 64x64px, transparent background,
detailed tank body with rounded corners, visible treads with segment lines, circular turret with rivets,
barrel has gradient from dark to light, body color [COLOR], dark gray treads #3a3a3a, black barrel #212121,
soft top highlight and bottom shadow for 3D depth, 2-3 tone shading on body, crisp pixel edges, game sprite
```

### 四色变体参数

| 文件名 | 车身色 | 高光色 | 阴影色 |
|--------|--------|--------|--------|
| tank_red.png | #E53935 红色 | #EF5350 亮红 | #8D1917 深红 |
| tank_blue.png | #1E88E5 蓝色 | #42A5F5 亮蓝 | #0D47A1 深蓝 |
| tank_green.png | #43A047 绿色 | #66BB6A 亮绿 | #1B5E20 深绿 |
| tank_yellow.png | #FDD835 黄色 | #FFF176 亮黄 | #F57F17 深橙黄 |

**关键要求**：4 张坦克的造型、炮管长度、履带纹理、炮塔大小**完全一致**，仅车身主色不同。

---

## 地图瓦片（4 张，32×32px）

### 通用瓦片提示词
```
Stardew Valley style pixel art ground tile, top-down view, 32x32px, seamless tileable texture,
[THEME_DESC], natural organic texture with scattered small details, not flat solid color,
soft color variation 2-3 tones, no harsh edges, game map tile, no transparency (opaque)
```

### 四主题参数

| 文件名 | 主题 | 基色 | 细节色 | 提示词补充 |
|--------|------|------|--------|-----------|
| map_grass_jungle_tile.png | 草地丛林 | #5a9e3e | #6db852 #4a8a32 #7ac460 | lush grass with small blades, tiny pebbles, occasional dirt specks |
| map_desert_gobi_tile.png | 荒漠戈壁 | #e8c878 | #f0d088 #d4b46e #c2a050 | dry sand with ripple texture, scattered grains, small rocks |
| map_snow_tundra_tile.png | 雪地冰原 | #d8e8f0 | #e8f0f8 #c8d8e8 #b8c8d8 | pale blue-white snow (NOT pure white), slight blue tint, frost crystals |
| map_city_ruins_tile.png | 城市废墟 | #4a4a52 | #52525a #42424a #5a5a62 | cracked asphalt road surface, faded road markings, gravel texture |

---

## 完整地图（4 张，512×384px）

### 通用地图提示词
```
Stardew Valley style pixel art full map background, top-down 90 degree view, 512x384px, no transparency,
[THEME_DESC] themed battlefield map, 16x12 tile grid area, organic natural distribution of terrain details,
no obstacles or units, just the ground background, high detail pixel art, warm atmospheric lighting
```

### 四主题参数

| 文件名 | 主题 | 提示词补充 |
|--------|------|-----------|
| fullmap_grass_jungle_16x12.png | 草地丛林 | grass field with dirt patches, scattered flowers (yellow/white), small grass blade clusters, natural variation between green tones, a few bare dirt areas with pebbles |
| fullmap_desert_gobi_16x12.png | 荒漠戈壁 | sand dunes with wind ripples, scattered rocks and pebbles, sand color variation from light to dark, subtle shadow from dune shapes |
| fullmap_snow_tundra_16x12.png | 雪地冰原 | pale blue snow field (not pure white), ice patches with reflective sheen, snow drifts, visible cracks in ice, scattered frost, blue-white color tones |
| fullmap_city_ruins_16x12.png | 城市废墟 | cracked asphalt road with faded yellow dashed center lines and white edge lines, potholes, scattered debris and gravel, tire marks, urban decay texture |

**关键要求**：
- 地图是浅色调（地面）以提升可读性
- 不要画障碍物或坦克，只画地面
- 城市废墟要有明显的道路标线和破损感
- 雪地必须是淡蓝色调，不能纯白

---

## 障碍物（12 张，4 主题 × 3 尺寸）

### 通用障碍物提示词
```
Stardew Valley style pixel art [OBSTACLE_NAME], top-down 90 degree view, [WIDTH]x[HEIGHT]px,
transparent background, [OBSTACLE_DESC], dark color tones contrasting with light ground,
soft top highlight, bottom shadow for 3D depth, detailed texture, crisp pixel edges, game obstacle sprite
```

### 12 种障碍物参数

| 文件名 | 尺寸 | 主题 | 物体 | 提示词描述 |
|--------|------|------|------|-----------|
| obstacle_grass_jungle_tree_1x1.png | 32×32 | 草地 | 树木 | small dark green tree with brown trunk, layered leafy canopy with highlights, bushy and organic |
| obstacle_grass_jungle_rock_2x1.png | 64×32 | 草地 | 岩石 | dark gray rock formation, cracked surface with moss patches, rough texture, 2-3 tone gray shading |
| obstacle_grass_jungle_crate_2x2.png | 64×64 | 草地 | 木箱 | dark brown wooden crate with iron corner brackets, visible wood grain, nail details, weathered |
| obstacle_desert_gobi_stone_1x1.png | 32×32 | 沙漠 | 石块 | dark sandstone rock, weathered surface, warm brown tones, cracked edges |
| obstacle_desert_gobi_ruins_2x1.png | 64×32 | 沙漠 | 废墟 | crumbling dark stone wall ruins, broken bricks, sand-covered base, aged and weathered |
| obstacle_desert_gobi_dune_2x2.png | 64×64 | 沙漠 | 沙堆 | large sand dune with wind-carved ripples, golden brown gradient, soft shadow on one side |
| obstacle_snow_tundra_ice_1x1.png | 32×32 | 雪地 | 冰堆 | dark blue ice block, shiny reflective surface, visible cracks, frost edges, translucent blue tones |
| obstacle_snow_tundra_snowblock_2x1.png | 64×32 | 雪地 | 雪块 | compacted snow block, light blue-gray tones, smooth surface with sparkles, slightly rounded edges |
| obstacle_snow_tundra_crate_2x2.png | 64×64 | 雪地 | 木箱 | frozen wooden crate covered in frost, blue-tinted wood, ice crystals on top, dark metal corners |
| obstacle_city_ruins_steel_1x1.png | 32×32 | 城市 | 钢板 | dark steel metal plate, rivets in corners, brushed metal texture, scratches and rust spots |
| obstacle_city_ruins_wall_2x1.png | 64×32 | 城市 | 砖墙 | dark brick wall with mortar lines, broken top edge, some bricks missing, urban decay |
| obstacle_city_ruins_barricade_2x2.png | 64×64 | 城市 | 路障 | metal barricade with rust and damage, concrete base, orange-yellow hazard stripes, debris around base |

**关键要求**：
- 障碍物必须是**深色调**，与浅色地图形成强烈对比
- 每个障碍物有明显的立体感（顶部亮、底部暗）
- 透明背景

---

## 子弹（1 张，12×12px）

### 提示词
```
Stardew Valley style pixel art bullet projectile, top-down view, 12x12px, transparent background,
round glowing yellow-white orb with orange-red rim light, small bright core,
soft outer glow, simple but readable at small size, game projectile sprite
```

**配色**：核心 `#FFFFFF`，发光 `#FFEB3B`，边缘 `#FF5722`

---

## 爆炸特效（4 帧，64×64px/帧）

### 通用提示词
```
Stardew Valley style pixel art explosion frame, top-down view, 64x64px, transparent background,
[FRAME_DESC], centered on canvas, warm orange-yellow-white color scheme, game VFX sprite
```

### 4 帧参数

| 文件名 | 提示词描述 |
|--------|-----------|
| explosion_frame_01.png | small bright white flash, 16px diameter center point, tight glow, impact moment |
| explosion_frame_02.png | expanding orange-yellow burst, 32px diameter, white core fading to orange edge, debris particles starting |
| explosion_frame_03.png | wide spread 48px, orange fading to gray smoke, scattered debris, fading intensity |
| explosion_frame_04.png | dispersing gray smoke 60px, almost transparent, final fade-out, no bright core |

**关键要求**：所有帧中心点与画布中心严格对齐。

---

## 击杀标记（4 张，20×20px）

### 通用提示词
```
Stardew Valley style pixel art star badge, top-down view, 20x20px, transparent background,
5-pointed star shape with [COLOR] fill, dark border outline, small white highlight on upper-left,
no background plate or square frame, just the star shape, clean and readable at small size
```

### 四色参数

| 文件名 | 主色 | 边框色 |
|--------|------|--------|
| kill_marker_red.png | #E53935 | #8D1917 |
| kill_marker_blue.png | #1E88E5 | #155A9C |
| kill_marker_green.png | #43A047 | #2D6A2F |
| kill_marker_yellow.png | #FDD835 | #C8A823 |

**关键要求**：只画星星，不要方形底座。星星带描边和左上高光。

---

## 使用方法

1. 按上面每个素材的提示词，逐张复制到 AI 图像生成工具（ChatGPT/DALL-E/Midjourney）
2. 生成后检查尺寸是否匹配（可用图片编辑工具裁剪）
3. 将透明背景的 PNG 按文件名保存到对应目录
4. 用质量检查清单核验

## 质量检查清单

### 坦克
- [ ] 4 张坦克造型、炮管、履带完全一致，仅颜色不同
- [ ] 64×64px，透明背景
- [ ] 正俯视，炮管朝上
- [ ] 星露谷风格明暗层次

### 地图
- [ ] 瓦片 32×32px 可无缝拼接
- [ ] 完整地图 512×384px
- [ ] 雪地是淡蓝色不是纯白
- [ ] 城市有道路标线和破损感
- [ ] 地面浅色调，与障碍物对比明显

### 障碍物
- [ ] 深色调，与浅色地图形成强对比
- [ ] 尺寸精确（32×32 / 64×32 / 64×64）
- [ ] 透明背景
- [ ] 有立体明暗

### 特效
- [ ] 爆炸 4 帧中心对齐
- [ ] 击杀标记只有星星无方形底座
- [ ] 子弹 12×12px 有发光效果

## 目录结构与命名

```
tank-battle-assets/
├── tanks/
│   ├── tank_red.png
│   ├── tank_blue.png
│   ├── tank_green.png
│   └── tank_yellow.png
├── maps/
│   ├── map_grass_jungle_tile.png
│   ├── map_desert_gobi_tile.png
│   ├── map_snow_tundra_tile.png
│   └── map_city_ruins_tile.png
├── full-maps/
│   ├── fullmap_grass_jungle_16x12.png
│   ├── fullmap_desert_gobi_16x12.png
│   ├── fullmap_snow_tundra_16x12.png
│   └── fullmap_city_ruins_16x12.png
├── obstacles/
│   ├── obstacle_grass_jungle_tree_1x1.png
│   ├── obstacle_grass_jungle_rock_2x1.png
│   ├── obstacle_grass_jungle_crate_2x2.png
│   ├── obstacle_desert_gobi_stone_1x1.png
│   ├── obstacle_desert_gobi_ruins_2x1.png
│   ├── obstacle_desert_gobi_dune_2x2.png
│   ├── obstacle_snow_tundra_ice_1x1.png
│   ├── obstacle_snow_tundra_snowblock_2x1.png
│   ├── obstacle_snow_tundra_crate_2x2.png
│   ├── obstacle_city_ruins_steel_1x1.png
│   ├── obstacle_city_ruins_wall_2x1.png
│   └── obstacle_city_ruins_barricade_2x2.png
├── bullets/
│   └── bullet_default.png
├── effects/
│   ├── explosion_frame_01.png
│   ├── explosion_frame_02.png
│   ├── explosion_frame_03.png
│   └── explosion_frame_04.png
└── kills/
    ├── kill_marker_red.png
    ├── kill_marker_blue.png
    ├── kill_marker_green.png
    └── kill_marker_yellow.png
```
