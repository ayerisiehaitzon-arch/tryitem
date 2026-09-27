// 构建全部家具：node scripts/build.js [id ...] [--no-ao] [--no-tex] [--fast]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FURNITURE } from '../src/furniture/index.js';
import { buildGeometry, assembleDoc } from '../src/pipeline.js';
import { writeGLB } from '../src/export/gltf.js';
import { MOUNTS } from '../src/core/mount.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'models');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const only = args.filter((a) => !a.startsWith('--'));

const useAO = !flags.has('--no-ao');
const useTex = !flags.has('--no-tex');
const fast = flags.has('--fast');

await fs.mkdir(outDir, { recursive: true });

let textures = null;
if (useTex) {
  const { buildTextures } = await import('../src/materials/textures.js');
  const t0 = Date.now();
  textures = await buildTextures({ scale: fast ? 0.5 : 1, cacheDir: path.join(root, '.cache', 'tex') });
  console.log(`贴图生成完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
let bake = null;
if (useAO) bake = await import('../src/bake/ao.js');

const manifest = [];
for (const def of FURNITURE) {
  if (only.length && !only.includes(def.id)) continue;
  const t0 = Date.now();
  const geo = buildGeometry(def);
  let ao = null, shadow = null, glow = null;
  if (bake) {
    // 安装面（地面 / 墙面 / 天花板）既是 AO 的遮挡面，也是阴影、光斑贴花所在的平面。
    // planes：靠墙落地的东西（马桶、浴室柜、淋浴间）贴着两个面 —— 两个面都挡 AO，各烘一张接触阴影
    const plane = def.mount ?? 'floor';
    const planes = def.planes ?? [plane];
    // ao: false —— 不需要 AO 的构件（地板这种一整块平面）不烘焙，也不带 AO 贴图
    if (def.ao !== false) ao = await bake.bakeAO(geo.lods[0], geo.layout, { samples: fast ? 48 : 160, plane: planes.map((p) => MOUNTS[p].n), ...(def.ao || {}) });
    if (def.shadow !== false) {
      // shadow 可以按面分开给参数：{ floor: {...}, wall: {...} }（某个面给 false 就不烘）
      const perPlane = def.shadow && planes.some((p) => p in def.shadow);
      shadow = [];
      for (const p of planes) {
        const opt = perPlane ? def.shadow[p] : def.shadow;
        if (opt === false) continue;
        shadow.push(await bake.bakeShadow(geo.lods[0], { plane: p, samples: fast ? 64 : 256, ...(opt || {}) }));
      }
    }
    if (def.glow) glow = await bake.bakeGlow(geo.lods[0], { plane, samples: fast ? 16 : 64, ...def.glow });
  }
  const { doc, stats } = assembleDoc(def, geo, { textures, ao, shadow, glow });
  const file = path.join(outDir, `${def.id}.glb`);
  await writeGLB(doc, file);
  const bytes = (await fs.stat(file)).size;
  stats.fileKB = Math.round(bytes / 1024);
  manifest.push(stats);
  const l = stats.lods;
  console.log(
    `${def.id.padEnd(12)} LOD0 ${String(l[0].tris).padStart(5)}△  LOD1 ${String(l[1].tris).padStart(5)}△  LOD2 ${String(l[2].tris).padStart(5)}△  ` +
    `DC ${l[0].drawCalls}  AO ${stats.aoAtlas}px@${stats.aoDensity}px/m  ${stats.fileKB}KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

// 合并已有清单（只构建部分家具时保留其它条目）
const mfPath = path.join(outDir, 'manifest.json');
let old = [];
try { old = JSON.parse(await fs.readFile(mfPath, 'utf8')).items || []; } catch {}
const order = FURNITURE.map((d) => d.id);
const merged = order
  .map((id) => manifest.find((m) => m.id === id) || old.find((m) => m.id === id))
  .filter(Boolean);
await fs.writeFile(mfPath, JSON.stringify({ generated: new Date().toISOString(), items: merged }, null, 2));
console.log(`\n写入 ${merged.length} 件 → models/`);
