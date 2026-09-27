// 生成 README 用的预览图：node scripts/previews.js
//   docs/previews/overview.jpg        全部家具一览
//   docs/previews/furniture-detail.jpg 家具特写：衣柜门板对花、黄铜脚套、书桌信件抽屉、办公椅盾形靠背
//   docs/previews/furniture-new.jpg   新家具：藤编餐边柜、绗缝丝绒床尾凳、C 型边几
//   docs/previews/decor.jpg           全部摆件一览
//   docs/previews/decor-detail.jpg    摆件特写：书脊、釉面、叶片、流苏
//   docs/previews/lighting.jpg        全部灯具一览
//   docs/previews/lighting-detail.jpg 灯具特写：台灯开灯 / 关灯、纸灯笼、壁灯
//   docs/previews/architecture.jpg    墙地门窗一览
//   docs/previews/architecture-detail.jpg 墙地门窗特写：人字拼、门执手与合页、护墙板线条、钢窗与窗台
//   docs/previews/kitchen.jpg         厨房三件：橱柜、吊柜、岛台
//   docs/previews/kitchen-detail.jpg  厨房特写：陶瓷水槽与鹅颈龙头、手工釉面砖和灯带光斑、钟形烟机罩、岛台凸条板
//   docs/previews/kitchen-room.jpg    全屋陈列里的厨房
//   docs/previews/bathroom.jpg        浴室三件：浴室柜、马桶、淋浴间
//   docs/previews/bathroom-detail.jpg 浴室特写：台上盆与入墙龙头、马桶盖、淋浴间的釉面砖和混水阀、六角马赛克
//   docs/previews/bathroom-room.jpg   全屋陈列里的浴室
//   docs/previews/room.jpg            全屋陈列（墙地门窗拼出来的“剖开的公寓”）
//   docs/previews/living.jpg          客厅
//   docs/previews/bedroom.jpg         卧室：护墙板墙上的一对壁灯
//   docs/previews/dining.jpg          书房与餐厅
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
const ids = byCat('furniture'), decorIds = byCat('decor'), lampIds = byCat('lighting'), archIds = byCat('architecture'), kitchenIds = byCat('kitchen'), bathIds = byCat('bathroom');

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

// 家具特写：衣柜门板对花 + 抽屉木纹连贯、床头柜黄铜脚套、书桌信件抽屉、办公椅盾形靠背与外壳
const fd = [];
fd.push(...await shoot({ items: ['wardrobe'], views: ['&dist=0.5&el=6&az=20'], size: [800, 600], outDir: tmp, name: () => 'f0.png' }));
fd.push(...await shoot({ items: ['nightstand'], views: ['&target=0.12:0.16:0.1&dist=0.45&el=8&az=30'], size: [800, 600], outDir: tmp, name: () => 'f1.png' }));
fd.push(...await shoot({ items: ['desk'], views: ['&target=-0.3:0.72:-0.05&dist=0.4&el=18&az=25'], size: [800, 600], outDir: tmp, name: () => 'f2.png' }));
fd.push(...await shoot({ items: ['office_chair'], views: ['&target=0:0.8:-0.15&dist=0.4&el=30&az=50'], size: [800, 600], outDir: tmp, name: () => 'f3.png' }));
await grid(fd, 2, [600, 450], path.join(out, 'furniture-detail.jpg'));

const nf = [];
nf.push(...await shoot({ items: ['sideboard'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'n0.png' }));
nf.push(...await shoot({ items: ['bench'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'n1.png' }));
nf.push(...await shoot({ items: ['side_table'], views: ['hero'], size: [800, 600], outDir: tmp, name: () => 'n2.png' }));
await grid(nf, 3, [480, 360], path.join(out, 'furniture-new.jpg'));

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

const arch = await shoot({ items: archIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `a_${id}.png` });
await grid(arch, 4, [360, 270], path.join(out, 'architecture.jpg'));

// 墙地门窗特写：人字拼的板缝与木纹、门执手和合页、护墙板线条和腰线、钢窗与大理石窗台
const ad = [];
ad.push(...await shoot({ items: ['floor_herringbone'], views: ['&target=0:0:0.3&dist=0.35&el=24&az=20'], size: [800, 600], outDir: tmp, name: () => 'b0.png' }));
ad.push(...await shoot({ items: ['wall_door'], views: ['&target=0.22:1:0.06&dist=0.2&el=10&az=30'], size: [800, 600], outDir: tmp, name: () => 'b1.png' }));
ad.push(...await shoot({ items: ['wall_wainscot'], views: ['&target=-0.5:0.9:0.06&dist=0.28&el=10&az=30'], size: [800, 600], outDir: tmp, name: () => 'b2.png' }));
ad.push(...await shoot({ items: ['wall_window'], views: ['&target=0.1:1.2:0.05&dist=0.3&el=14&az=30'], size: [800, 600], outDir: tmp, name: () => 'b3.png' }));
await grid(ad, 2, [600, 450], path.join(out, 'architecture-detail.jpg'));

const kitchen = await shoot({ items: kitchenIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `k_${id}.png` });
await grid(kitchen, 3, [480, 360], path.join(out, 'kitchen.jpg'));

// 厨房特写：水槽与龙头、墙砖与灯带光斑（在全屋里拍：吊柜装在台面上方）、烟机罩、岛台凸条板
const kd = [];
kd.push(...await shoot({ items: ['kitchen_base'], views: ['&target=-0.15:0.95:0&dist=0.26&el=26&az=24'], size: [800, 600], outDir: tmp, name: () => 'c0.png' }));
kd.push(...await shoot({ items: ['room'], views: ['&target=-9.2:1.2:-1.95&dist=0.07&el=4&az=16'], size: [800, 600], outDir: tmp, name: () => 'c1.png' }));
kd.push(...await shoot({ items: ['kitchen_wall'], views: ['&target=0.62:1.74:0.2&dist=0.46&el=10&az=-28'], size: [800, 600], outDir: tmp, name: () => 'c2.png' }));
kd.push(...await shoot({ items: ['kitchen_island'], views: ['&target=0.45:0.62:0.3&dist=0.42&el=16&az=38'], size: [800, 600], outDir: tmp, name: () => 'c3.png' }));
await grid(kd, 2, [600, 450], path.join(out, 'kitchen-detail.jpg'));

const kroom = await shoot({ items: ['room'], views: ['&target=-8.3:0.9:-0.7&dist=0.24&el=22&az=24'], size: [1600, 900], outDir: tmp, name: () => 'kitchen-room.png' });
await sharp(kroom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'kitchen-room.jpg'));
console.log('→ docs/previews/kitchen-room.jpg');

const bath = await shoot({ items: bathIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `w_${id}.png` });
await grid(bath, 3, [480, 360], path.join(out, 'bathroom.jpg'));

// 浴室特写：台上盆与入墙龙头、马桶盖和合页、淋浴间的釉面砖和恒温混水阀、六角马赛克
const bd = [];
bd.push(...await shoot({ items: ['vanity'], views: ['&target=0:0.95:0.25&dist=0.42&el=24&az=26'], size: [800, 600], outDir: tmp, name: () => 'e0.png' }));
bd.push(...await shoot({ items: ['toilet'], views: ['&target=0:0.45:0.3&dist=0.55&el=22&az=40'], size: [800, 600], outDir: tmp, name: () => 'e1.png' }));
bd.push(...await shoot({ items: ['shower'], views: ['&target=0:1.25:0.2&dist=0.36&el=8&az=24'], size: [800, 600], outDir: tmp, name: () => 'e2.png' }));
bd.push(...await shoot({ items: ['floor_hex'], views: ['&target=0:0:0.3&dist=0.3&el=30&az=20'], size: [800, 600], outDir: tmp, name: () => 'e3.png' }));
await grid(bd, 2, [600, 450], path.join(out, 'bathroom-detail.jpg'));

const broom = await shoot({ items: ['room'], views: ['&target=8.1:0.95:-0.9&dist=0.26&el=18&az=20'], size: [1600, 900], outDir: tmp, name: () => 'bathroom-room.png' });
await sharp(broom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'bathroom-room.jpg'));
console.log('→ docs/previews/bathroom-room.jpg');

const room = await shoot({ items: ['room'], views: ['&el=32&az=24&dist=0.9'], size: [1600, 900], outDir: tmp, name: () => 'room.png' });
await sharp(room[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'room.jpg'));
console.log('→ docs/previews/room.jpg');

const living = await shoot({ items: ['room'], views: ['&target=0.4:0.5:-0.9&dist=0.3&el=20&az=14'], size: [1600, 900], outDir: tmp, name: () => 'living.png' });
await sharp(living[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'living.jpg'));
console.log('→ docs/previews/living.jpg');

const bedroom = await shoot({ items: ['room'], views: ['&target=3.6:0.95:-1.0&dist=0.3&el=14&az=8'], size: [1600, 900], outDir: tmp, name: () => 'bedroom.png' });
await sharp(bedroom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'bedroom.jpg'));
console.log('→ docs/previews/bedroom.jpg');

const dining = await shoot({ items: ['room'], views: ['&target=-4.2:0.7:-0.3&dist=0.32&el=22&az=32'], size: [1600, 900], outDir: tmp, name: () => 'dining.png' });
await sharp(dining[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'dining.jpg'));
console.log('→ docs/previews/dining.jpg');

let n = 0;
const seq = (prefix) => () => `${prefix}_${n++}.png`;
const normals = await shoot({ items: ['sofa'], views: ['close', '&dist=0.55&el=24&flat=1', '&dist=0.55&el=24&wire=1'], size: [800, 600], outDir: tmp, name: seq('n') });
await grid(normals, 3, [600, 450], path.join(out, 'normals.jpg'));

const ao = await shoot({ items: ['armchair'], views: ['close', '&dist=0.55&el=24&ao=0'], size: [800, 600], outDir: tmp, name: seq('a') });
await grid(ao, 2, [600, 450], path.join(out, 'ao.jpg'));

await fs.rm(tmp, { recursive: true, force: true });
