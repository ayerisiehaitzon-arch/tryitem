// 构建全部家具：node scripts/build.js [id ...] [--no-ao] [--no-tex] [--fast]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FURNITURE } from '../src/furniture/index.js';
import { buildGeometry, assembleDoc } from '../src/pipeline.js';
import { writeGLB } from '../src/export/gltf.js';

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
  let ao = null, shadow = null;
  if (bake) {
    ao = await bake.bakeAO(geo.lods[0], geo.layout, { samples: fast ? 48 : 160, ...(def.ao || {}) });
    shadow = await bake.bakeShadow(geo.lods[0], { samples: fast ? 64 : 256, ...(def.shadow || {}) });
  }
  const { doc, stats } = assembleDoc(def, geo, { textures, ao, shadow });
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
