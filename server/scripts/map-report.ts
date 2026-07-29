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
  }

  lines.push(
    `${theme}: blocked=${(blockedMin * 100).toFixed(1)}%-${(blockedMax * 100).toFixed(1)}% ` +
      `chains>=${chainMin} sightP95<=${p95Max} deadEnds<=${deadMax} ` +
      `objects=${objMin}-${objMax} doors=${doorMin}-${doorMax} variants=${variants.size}`
  );
  for (const [issue, count] of issueCounter) {
    lines.push(`  ISSUE x${count}: ${issue}`);
  }
  lines.push(mapToAscii(generateMap(theme).obstacles));
}

lines.push(failed === 0 ? `PASS ${THEMES.length * SAMPLES}/${THEMES.length * SAMPLES}` : `FAIL ${failed}`);
console.log(lines.join("\n"));
process.exit(failed === 0 ? 0 : 1);
