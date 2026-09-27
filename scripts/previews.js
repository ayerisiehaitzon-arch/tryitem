// 生成 README 用的预览图：node scripts/previews.js
//   docs/previews/overview.jpg   全部家具一览
//   docs/previews/room.jpg       全屋陈列
//   docs/previews/normals.jpg    同一个沙发：平滑法线 / 平直着色 / 线框
//   docs/previews/ao.jpg         扶手椅：有 / 无烘焙 AO
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
const ids = manifest.items.map((i) => i.id);

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

const room = await shoot({ items: ['room'], views: ['&el=30&az=24'], size: [1600, 900], outDir: tmp, name: () => 'room.png' });
await sharp(room[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'room.jpg'));
console.log('→ docs/previews/room.jpg');

let n = 0;
const seq = (prefix) => () => `${prefix}_${n++}.png`;
const normals = await shoot({ items: ['sofa'], views: ['close', '&dist=0.55&el=24&flat=1', '&dist=0.55&el=24&wire=1'], size: [800, 600], outDir: tmp, name: seq('n') });
await grid(normals, 3, [600, 450], path.join(out, 'normals.jpg'));

const ao = await shoot({ items: ['armchair'], views: ['close', '&dist=0.55&el=24&ao=0'], size: [800, 600], outDir: tmp, name: seq('a') });
await grid(ao, 2, [600, 450], path.join(out, 'ao.jpg'));

await fs.rm(tmp, { recursive: true, force: true });
