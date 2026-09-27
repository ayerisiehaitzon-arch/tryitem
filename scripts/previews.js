// 生成 README 用的预览图：node scripts/previews.js
//   docs/previews/overview.jpg        全部家具一览
//   docs/previews/decor.jpg           全部摆件一览
//   docs/previews/decor-detail.jpg    摆件特写：书脊、釉面、叶片、流苏
//   docs/previews/lighting.jpg        全部灯具一览
//   docs/previews/lighting-detail.jpg 灯具特写：台灯开灯 / 关灯、纸灯笼、壁灯
//   docs/previews/room.jpg            全屋陈列
//   docs/previews/living.jpg          客厅一角
//   docs/previews/bedroom.jpg         卧室：展示墙上的一对壁灯
//   docs/previews/normals.jpg         同一个沙发：平滑法线 / 平直着色 / 线框
//   docs/previews/ao.jpg              扶手椅：有 / 无烘焙 AO
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { shoot } from './shots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'previews');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tryitem-'));
await fs.mkdir(out, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'models', 'manifest.json'), 'utf8'));
const byCat = (c) => manifest.items.filter((i) => (i.category ?? 'furniture') === c).map((i) => i.id);
const ids = byCat('furniture'), decorIds = byCat('decor'), lampIds = byCat('lighting');

async function grid(files, cols, cell, dest) {
  const rows = Math.ceil(files.length / cols);
  const comp = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(f).resize(cell[0], cell[1]).toBuffer(),
    left: (i % cols) * cell[0], top: Math.floor(i / cols) * cell[1],
  })));
  await sharp({ create: { width: cols * cell[0], height: rows * cell[1], channels: 3, background: '#e3e2dd' } })
    .composite(comp).jpeg({ quality: 84, mozjpeg: true }).toFile(dest);
  console.log('→', path.relative(root, dest));
}

const heroes = await shoot({ items: ids, views: ['hero'], size: [800, 600], outDir: tmp });
await grid(heroes, 5, [400, 300], path.join(out, 'overview.jpg'));

const decor = await shoot({ items: decorIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `d_${id}.png` });
await grid(decor, 3, [480, 360], path.join(out, 'decor.jpg'));

// 特写：书脊的烫金与书名、手工釉面、琴叶榕叶脉、地毯流苏
const detail = await shoot({
  items: ['books'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'x0.png',
});
detail.push(...await shoot({ items: ['vases'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'x1.png' }));
detail.push(...await shoot({ items: ['fiddle_fig'], views: ['&target=0.05:1.05:0&dist=0.3&el=20&az=30'], size: [800, 600], outDir: tmp, name: () => 'x2.png' }));
detail.push(...await shoot({ items: ['rug'], views: ['&target=0.95:0:0.3&dist=0.18&el=35&az=70'], size: [800, 600], outDir: tmp, name: () => 'x3.png' }));
await grid(detail, 2, [600, 450], path.join(out, 'decor-detail.jpg'));

const lamps = await shoot({ items: lampIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `l_${id}.png` });
await grid(lamps, 4, [360, 270], path.join(out, 'lighting.jpg'));

// 灯具特写：台灯开灯 / 关灯（光斑、百褶），纸灯笼，墙上的壁灯
const lit = [];
lit.push(...await shoot({ items: ['table_lamp'], views: ['&dist=0.62&el=20'], size: [800, 600], outDir: tmp, name: () => 'y0.png' }));
lit.push(...await shoot({ items: ['table_lamp'], views: ['&dist=0.62&el=20&lights=0'], size: [800, 600], outDir: tmp, name: () => 'y1.png' }));
lit.push(...await shoot({ items: ['pendant_lantern'], views: ['&target=0:1.75:0&dist=0.5&el=12&az=30'], size: [800, 600], outDir: tmp, name: () => 'y2.png' }));
lit.push(...await shoot({ items: ['wall_lamp'], views: ['&dist=0.75&el=12&az=28'], size: [800, 600], outDir: tmp, name: () => 'y3.png' }));
await grid(lit, 2, [600, 450], path.join(out, 'lighting-detail.jpg'));

const room = await shoot({ items: ['room'], views: ['&el=30&az=24&dist=0.84'], size: [1600, 900], outDir: tmp, name: () => 'room.png' });
await sharp(room[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'room.jpg'));
console.log('→ docs/previews/room.jpg');

const living = await shoot({ items: ['room'], views: ['&target=-0.4:0.3:-0.7&dist=0.36&el=24&az=18'], size: [1600, 900], outDir: tmp, name: () => 'living.png' });
await sharp(living[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'living.jpg'));
console.log('→ docs/previews/living.jpg');

const bedroom = await shoot({ items: ['room'], views: ['&target=2.4:1:-0.9&dist=0.3&el=16&az=12'], size: [1600, 900], outDir: tmp, name: () => 'bedroom.png' });
await sharp(bedroom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'bedroom.jpg'));
console.log('→ docs/previews/bedroom.jpg');

let n = 0;
const seq = (prefix) => () => `${prefix}_${n++}.png`;
const normals = await shoot({ items: ['sofa'], views: ['close', '&dist=0.55&el=24&flat=1', '&dist=0.55&el=24&wire=1'], size: [800, 600], outDir: tmp, name: seq('n') });
await grid(normals, 3, [600, 450], path.join(out, 'normals.jpg'));

const ao = await shoot({ items: ['armchair'], views: ['close', '&dist=0.55&el=24&ao=0'], size: [800, 600], outDir: tmp, name: seq('a') });
await grid(ao, 2, [600, 450], path.join(out, 'ao.jpg'));

await fs.rm(tmp, { recursive: true, force: true });
