import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { barPull } from '../furniture/parts.js';
import { garment, trousers, foldedStack, shoePair, handbag, hatBox, linenBox } from './garments.js';

// 开放衣柜：步入式衣帽间的一整面墙，胡桃木柜体，三个开间 ——
//   · 左：长衣区，黄铜挂杆上挂着两件大衣（驼色、炭灰）和三条长裙（黑色绉纱短袖裙、橄榄绿亚麻衬衫裙、香槟色真丝吊带裙）；
//     下面一层鞋架放一双黑色乐福鞋，柜底一双干邑色短靴；
//   · 中：两个抽屉（黄铜拉手）、三层层板：两摞叠好的毛衣（麻花、罗纹、麻灰）、一只干邑色手提包、叠好的牛仔裤；
//   · 右：双层挂衣，上层六件衬衫（白、浅蓝、条纹、格子……），下层四条裤子搭在衣架横杆上；柜底一双帆布鞋；
//   · 顶上一层帽架：条纹帽盒、亚麻收纳盒；每个开间帽架板下面一条 LED 灯带照着衣服。
// 衣服都是“有形状的布”：挂着的衣服是一圈圈截面放样出来的（肩斜、袖子、袖口、衬衫下摆两侧高、裙摆放宽、竖向的褶），
// 全部共用一张面料图集 —— 柜子本身（胡桃木、黄铜、灯带）加上所有的衣服、鞋、包、盒子，一共 4 个材质。
// 原点在墙根、宽度中点（z = 0 是墙面，y = 0 是地面）
const W = 2.2, H = 2.3, D = 0.56, T = 0.022, BACK = 0.012, PLINTH = 0.08;
const BAYS = [0.862, 0.48, 0.77];
const BASE = PLINTH + T; // 柜底板面
const SHELF = 2.0; // 帽架板面
const RAIL = { hi: 1.93, lo: 0.98 };
const ZC = (BACK + D) / 2; // 挂杆在进深方向的位置
const RAIL_R = 0.0095;

// 每个开间的内侧 x 范围
const bays = (() => {
  let x = -W / 2 + T;
  return BAYS.map((b) => { const r = [x, x + b]; x += b + T; return r; });
})();

export default {
  id: 'open_wardrobe',
  name: '开放衣柜',
  nameEn: 'Open Walnut Wardrobe',
  category: 'closet',
  planes: ['floor', 'wall'],
  aoDensity: 90,
  shadow: {
    floor: { margin: 0.18, maxDist: 0.5, density: 60 },
    wall: { margin: 0.12, maxDist: 0.35, density: 50, strength: 0.6 },
  },
  view: { el: 8, az: 18 },
  build(k) {
    const q = (...v) => k.q(...v);
    const c = q(0.002, 0.0015, 0), cs = q(1, 1, 0);
    const ci = q(0.002, 0, 0), csi = q(1, 0, 0); // 柜里面的层板、抽屉：中距离就看不出倒角了
    const inH = H - T - BASE; // 柜内净高
    const zIn = BACK + (D - BACK) / 2, dIn = D - BACK;

    // —— 柜体 ——
    for (const s of [-1, 1]) {
      k.box({
        name: `side${s > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [T, H - T, D], r: c, segs: cs, grain: 'y',
        omit: ['ny', 'nz'], density: { [s > 0 ? 'nx' : 'px']: 0.6 },
        xf: xf({ pos: [s * (W / 2 - T / 2), (H - T) / 2, D / 2] }),
      });
    }
    k.box({
      name: 'top', mat: 'walnut', size: [W, T, D], r: q(0.003, 0.002, 0), segs: cs, grain: 'x',
      omit: ['nz'], density: { py: 0.3 },
      xf: xf({ pos: [0, H - T / 2, D / 2] }),
    });
    k.box({
      name: 'bottom', mat: 'walnut', size: [W - 2 * T, T, dIn], r: c, segs: cs, grain: 'x',
      omit: ['ny', 'nz', 'px', 'nx'], xf: xf({ pos: [0, PLINTH + T / 2, zIn] }),
    });
    k.box({
      name: 'plinth', mat: 'walnut', size: [W - 2 * T, PLINTH, 0.018], segs: 0, grain: 'x',
      omit: ['ny', 'nz', 'py', 'px', 'nx'], density: { pz: 0.4 }, xf: xf({ pos: [0, PLINTH / 2, D - 0.04 - 0.009] }),
    });
    k.box({
      name: 'back', mat: 'walnut', size: [W - 2 * T, inH, BACK], segs: 0, grain: 'y',
      omit: ['ny', 'nz', 'py', 'px', 'nx'], xf: xf({ pos: [0, BASE + inH / 2, BACK / 2] }),
    });
    for (let i = 0; i < 2; i++) {
      k.box({
        name: `divider${i}`, mat: 'walnut', size: [T, inH, dIn], r: c, segs: cs, grain: 'y',
        omit: ['py', 'ny', 'nz'], xf: xf({ pos: [bays[i][1] + T / 2, BASE + inH / 2, zIn] }),
      });
    }
    // 帽架板 + 板下的 LED 灯带；帽架以上是放盒子的一层
    bays.forEach(([xa, xb], i) => {
      k.box({
        name: `hatShelf${i}`, mat: 'walnut', size: [xb - xa, T, dIn], r: ci, segs: csi, grain: 'x',
        omit: ['nz', 'px', 'nx'], xf: xf({ pos: [(xa + xb) / 2, SHELF - T / 2, zIn] }),
      });
      k.box({
        name: `led${i}`, mat: 'led', size: [xb - xa - 0.04, 0.005, 0.012], segs: 0,
        omit: ['py', 'px', 'nx'], xf: xf({ pos: [(xa + xb) / 2, SHELF - T - 0.0025, D - 0.034] }),
      });
    });

    // —— 挂杆：黄铜管 + 两头的法兰座 ——
    const rail = (name, [xa, xb], y) => {
      k.sweep({
        name, mat: 'brass', shape: circle(RAIL_R, q(10, 8, 6)), caps: [false, false],
        path: [[xa + 0.004, y, ZC], [xb - 0.004, y, ZC]],
      });
      if (k.lod < 2) {
        for (const [s, x] of [[1, xa], [-1, xb]]) {
          k.lathe({
            name: `${name}Flange${s > 0 ? 'L' : 'R'}`, mat: 'brass', segs: q(8, 6),
            profile: profile([[0.02, 0], [0.02, 0.004], [RAIL_R + 0.0005, 0.012]]),
            xf: xf({ pos: [x, y, ZC], rot: [0, 0, -s * Math.PI / 2] }),
          });
        }
      }
    };
    rail('railL', bays[0], RAIL.hi);
    rail('railR', bays[2], RAIL.hi);
    rail('railLow', bays[2], RAIL.lo);

    // 一排挂着的东西：从开间左边开始，按厚度依次排开（相邻两件之间留一点缝，互相转一点角度）
    const row = (list, [xa], y, make) => {
      let x = xa + 0.03;
      list.forEach((g, i) => {
        const rnd = k.rand(`${g.name}Place`);
        x += g.th / 2;
        make(g, xf({ pos: [x, y, ZC + (rnd() - 0.5) * 0.02], rot: [0, (rnd() - 0.5) * 0.04, 0] }), i);
        x += g.th / 2 + g.gap;
      });
    };

    // —— 左：长衣区 ——
    const coat = { W: 0.46, L: 1.02, t: 0.044, chest: 0.1, flare: 0.06, sleeve: { to: 0.6, t: 0.03, w: 0.16 }, collar: 'coat', folds: [3, 0.008] };
    row([
      { name: 'coatCamel', cell: 'camel', ...coat, th: 0.09, gap: 0.004 },
      { name: 'coatCharcoal', cell: 'charcoal', ...coat, L: 0.96, th: 0.09, gap: 0.008 },
      { name: 'dressBlack', cell: 'crepe', W: 0.38, L: 1.06, t: 0.026, chest: 0.06, waist: 0.1, flare: 0.36, sleeve: { to: 0.2, t: 0.018, w: 0.13 }, folds: [4, 0.012], neck: true, th: 0.07, gap: 0.006 },
      { name: 'dressOlive', cell: 'olive', W: 0.4, L: 1.1, t: 0.028, chest: 0.06, waist: 0.08, flare: 0.44, sleeve: { to: 0.24, t: 0.02, w: 0.14 }, collar: 'shirt', folds: [4, 0.013], th: 0.075, gap: 0.006 },
      { name: 'dressSilk', cell: 'silk', W: 0.34, L: 1.13, top: 0.13, t: 0.018, chest: 0.04, waist: 0.08, flare: 0.42, straps: true, folds: [2.5, 0.012], face: 1, th: 0.06, gap: 0 },
    ], bays[0], RAIL.hi, (g, place) => garment(k, g, place));

    // —— 右上：衬衫 ——
    const shirt = { W: 0.47, L: 0.76, t: 0.022, shirttail: 0.05, sleeve: { to: 0.6, t: 0.026, w: 0.15 }, collar: 'shirt', folds: [3, 0.004], th: 0.056, gap: 0.006 };
    row(['oxford', 'oxfordBlue', 'stripe', 'plaid', 'oxford', 'denim'].map((cell, i) => ({ name: `shirt${i}`, cell, ...shirt, face: i === 5 ? 1 : 0 })),
      bays[2], RAIL.hi, (g, place) => garment(k, g, place));
    // —— 右下：裤子（搭在衣架横杆上）——
    row(['charcoal', 'denim', 'crepe', 'olive'].map((cell, i) => ({ name: `trousers${i}`, cell, th: 0.07, gap: 0.012 })),
      bays[2], RAIL.lo, (g, place, i) => trousers(k, { name: g.name, cell: g.cell, front: 0.46 + 0.02 * (i % 2), back: 0.43, w: 0.24 + 0.01 * i }, place));

    // —— 中：抽屉 + 层板 ——
    const [ma, mb] = bays[1], mx = (ma + mb) / 2, mw = mb - ma;
    const dh = 0.198;
    for (let i = 0; i < 2; i++) {
      const cy = BASE + 0.002 + dh / 2 + i * (dh + 0.004);
      k.box({
        name: `drawer${i}`, mat: 'walnut', size: [mw - 0.006, dh, 0.02], r: ci, segs: csi, grain: 'x',
        omit: ['nz'], xf: xf({ pos: [mx, cy, D - 0.012] }),
      });
      if (k.lod < 2) barPull(k, { name: `pull${i}`, mat: 'brass', len: 0.16, depth: 0.026, r: 0.005, segs: q(6, 5), csegs: q(2, 1), pos: [mx, cy, D - 0.002], axis: 'x' });
    }
    const shelves = [BASE + 2 * dh + 0.01 + T, 0.86, 1.2, 1.54];
    shelves.forEach((y, i) => {
      k.box({
        name: `shelf${i}`, mat: 'walnut', size: [mw, T, dIn], r: ci, segs: csi, grain: 'x',
        omit: ['nz', 'px', 'nx'], xf: xf({ pos: [mx, y - T / 2, zIn] }),
      });
    });
    const zf = D - 0.19; // 层板上东西的中心（靠前放）
    foldedStack(k, { name: 'knitsA', w: 0.3, d: 0.3, place: xf({ pos: [mx, shelves[0], zf] }), items: [
      { cell: 'knitCable', h: 0.07 }, { cell: 'knitGrey', h: 0.055 }, { cell: 'knitRib', h: 0.06 },
    ] });
    foldedStack(k, { name: 'knitsB', w: 0.3, d: 0.3, place: xf({ pos: [mx, shelves[1], zf], rot: [0, 0.03, 0] }), items: [
      { cell: 'knitRib', h: 0.06 }, { cell: 'knitGrey', h: 0.055 }, { cell: 'knitCable', h: 0.068 }, { cell: 'knitGrey', h: 0.052 },
    ] });
    handbag(k, { name: 'bag', cell: 'leather', size: [0.28, 0.2, 0.11], place: xf({ pos: [mx, shelves[2], zf - 0.02], rot: [0, -0.12, 0] }) });
    foldedStack(k, { name: 'jeans', w: 0.34, d: 0.28, place: xf({ pos: [mx, shelves[3], zf] }), items: [
      { cell: 'denim', h: 0.045 }, { cell: 'denim', h: 0.043 }, { cell: 'olive', h: 0.04 },
    ] });

    // —— 左：鞋架 + 鞋 ——
    const [la, lb] = bays[0];
    const shoeY = 0.32;
    k.box({
      name: 'shoeShelf', mat: 'walnut', size: [lb - la, T, dIn], r: ci, segs: csi, grain: 'x',
      omit: ['nz', 'px', 'nx'], xf: xf({ pos: [(la + lb) / 2, shoeY - T / 2, zIn] }),
    });
    shoePair(k, { name: 'loafers', kind: 'loafer', cell: 'leatherBlack', lining: 'leather', sole: { h: 0.01, cell: 'leather' }, L: 0.27, Wd: 0.092, H: 0.064, at: [la + 0.2, shoeY, zIn + 0.05], yaw: 0.06 });
    shoePair(k, { name: 'boots', kind: 'boot', cell: 'leather', lining: 'leatherBlack', sole: { h: 0.012, cell: 'leatherBlack' }, L: 0.26, Wd: 0.09, H: 0.07, at: [la + 0.5, BASE, zIn + 0.06], yaw: -0.05, spread: 0.11 });
    // —— 右：柜底一双帆布鞋 ——
    shoePair(k, { name: 'sneakers', kind: 'sneaker', cell: 'linen', lining: 'oxford', sole: { h: 0.022, cell: 'oxford' }, L: 0.27, Wd: 0.095, H: 0.06, at: [bays[2][0] + 0.52, BASE, zIn + 0.07], yaw: 0.08 });

    // —— 帽架上面：帽盒、收纳盒 ——
    hatBox(k, { name: 'hatBox', r: 0.16, h: 0.2, place: xf({ pos: [la + 0.2, SHELF, zIn + 0.02], rot: [0, 0.5, 0] }) });
    linenBox(k, { name: 'boxA', size: [0.38, 0.2, 0.34], place: xf({ pos: [la + 0.6, SHELF, zIn + 0.03] }) });
    linenBox(k, { name: 'boxB', size: [0.4, 0.18, 0.34], place: xf({ pos: [mx, SHELF, zIn + 0.03] }) });
    linenBox(k, { name: 'boxC', size: [0.34, 0.2, 0.34], place: xf({ pos: [bays[2][0] + 0.2, SHELF, zIn + 0.03], rot: [0, 0.02, 0] }) });
    foldedStack(k, { name: 'blankets', w: 0.32, d: 0.34, place: xf({ pos: [bays[2][0] + 0.57, SHELF, zIn + 0.02] }), items: [
      { cell: 'knitCable', h: 0.08 }, { cell: 'plaid', h: 0.07 },
    ] });
  },
};
