import { generateMap, validateGeneratedMap, mapToAscii, type MapTheme } from "../src/map";

const THEMES: MapTheme[] = ["grass_jungle", "desert_gobi", "snow_tundra", "city_ruins"];
const SAMPLES = Number(process.env.SAMPLES ?? 100);
const lines: string[] = [];
let failed = 0;

for (const theme of THEMES) {
  const issueCounter = new Map<string, number>();
  let blockedMin = 1;
  let blockedMax = 0;
  let chainMin = Infinity;
  let p95Max = 0;
  let deadMax = 0;
  let objMin = Infinity;
  let objMax = 0;
  let doorMin = Infinity;
  let doorMax = 0;
  const variants = new Set<string>();
  // 素材一致性：同一 type 不得同时存在可破坏与不可破坏实例
  const typeBehavior = new Map<string, Set<boolean>>();
  let sizeMismatch = 0;

  for (let index = 0; index < SAMPLES; index++) {
    const map = generateMap(theme);
    const result = validateGeneratedMap(map.obstacles);
    if (!result.valid) {
      failed++;
      for (const issue of result.issues) {
        issueCounter.set(issue, (issueCounter.get(issue) ?? 0) + 1);
      }
    }
    const metrics = result.metrics;
    blockedMin = Math.min(blockedMin, metrics.blockedRatio);
    blockedMax = Math.max(blockedMax, metrics.blockedRatio);
    chainMin = Math.min(chainMin, metrics.wallChains);
    p95Max = Math.max(p95Max, metrics.sightLineP95);
    deadMax = Math.max(deadMax, metrics.deadEnds);
    objMin = Math.min(objMin, result.obstacleCount);
    objMax = Math.max(objMax, result.obstacleCount);
    doorMin = Math.min(doorMin, result.destructibleCount);
    doorMax = Math.max(doorMax, result.destructibleCount);
    variants.add(mapToAscii(map.obstacles));

    for (const obstacle of map.obstacles) {
      if (!typeBehavior.has(obstacle.type)) typeBehavior.set(obstacle.type, new Set());
      typeBehavior.get(obstacle.type)!.add(obstacle.destructible);

      // 1×1 必须可破坏；更大规格必须不可破坏
      const isSingleCell = obstacle.width === 64 && obstacle.height === 64;
      if (isSingleCell !== obstacle.destructible) sizeMismatch++;
    }
  }

  const inconsistent = [...typeBehavior.entries()].filter(([, set]) => set.size > 1);

  lines.push(
    `${theme}: blocked=${(blockedMin * 100).toFixed(1)}%-${(blockedMax * 100).toFixed(1)}% ` +
      `chains>=${chainMin} sightP95<=${p95Max} deadEnds<=${deadMax} ` +
      `objects=${objMin}-${objMax} doors=${doorMin}-${doorMax} variants=${variants.size}`
  );
  for (const [issue, count] of issueCounter) {
    lines.push(`  ISSUE x${count}: ${issue}`);
  }
  if (inconsistent.length > 0) {
    failed++;
    for (const [type] of inconsistent) {
      lines.push(`  ISSUE: 类型 ${type} 同时存在可破坏与不可破坏实例`);
    }
  }
  if (sizeMismatch > 0) {
    failed++;
    lines.push(`  ISSUE: ${sizeMismatch} 个障碍的可破坏性与规格不匹配`);
  }
  lines.push(
    `  素材一致性: 类型数=${typeBehavior.size} 冲突=${inconsistent.length} 规格不匹配=${sizeMismatch}`
  );
  lines.push(mapToAscii(generateMap(theme).obstacles));
}

lines.push(failed === 0 ? `PASS ${THEMES.length * SAMPLES}/${THEMES.length * SAMPLES}` : `FAIL ${failed}`);
console.log(lines.join("\n"));
process.exit(failed === 0 ? 0 : 1);
