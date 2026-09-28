import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { barPull } from '../furniture/parts.js';
import { handbag } from './garments.js';
import { ring, pearls, watch, bangle, earrings, tint } from './trinkets.js';

// 首饰岛台：衣帽间正中的一座胡桃木岛台，两个长边都是抽屉（上排三个浅抽屉、下排三个深抽屉，黄铜拉手），
// 踢脚往里收 4cm（像浮在地上）；顶上是一个玻璃盖的展示格：墨绿丝绒衬底，胡桃木细隔板分成六格 ——
//   戒指卷（一排丝绒卷，六只戒指插在缝里：祖母绿、钻石、蓝宝石、红宝石、素圈）、两只表（各戴在一个丝绒表枕上）、
//   耳环（珍珠耳钉、钻石耳钉、一对祖母绿水滴）和一条挂着蓝宝石吊坠的金链子、三只叠放的手镯、一串珍珠项链；
//   最后一格空着 —— 玻璃上放着一只干邑色的手提包，正好压在它上面。玻璃不挡烘焙的 AO，丝绒格子里的阴影是真的。
// 原点在岛台底面中心（y = 0 是地面），长边沿 x
const L = 1.3, D = 0.62, H = 0.92, PLINTH = 0.08;
const CASE = { y0: 0.8, rim: 0.05 }; // 展示格：从 0.8 到台面，四周一圈 5cm 宽的胡桃木框
const VEL = 0.832; // 丝绒底面的高度
const GLASS = 0.908;

export default {
  id: 'jewelry_island',
  name: '首饰岛台',
  nameEn: 'Walnut Jewelry Island',
  category: 'closet',
  aoDensity: 150,
  shadow: { margin: 0.2, maxDist: 0.5, density: 70 },
  view: { el: 30, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const c = q(0.003, 0.002, 0), cs = q(1, 1, 0);
    // —— 踢脚（往里收）+ 柜体 ——
    k.box({
      name: 'plinth', mat: 'walnut', size: [L - 0.08, PLINTH, D - 0.08], segs: 0, grain: 'x',
      omit: ['ny', 'py'], density: { px: 0.5, nx: 0.5, pz: 0.5, nz: 0.5 }, xf: xf({ pos: [0, PLINTH / 2, 0] }),
    });
    const bh = CASE.y0 - PLINTH;
    k.box({
      name: 'body', mat: 'walnut', size: [L, bh, D], r: c, segs: cs, grain: 'x',
      // 两个长边被抽屉面板盖住，只在缝里露出来：AO 给低密度
      omit: ['py'], density: { ny: 0.3, pz: 0.15, nz: 0.15 }, xf: xf({ pos: [0, PLINTH + bh / 2, 0] }),
    });
    // —— 抽屉：两个长边各两排、每排三个；面板凸出 16mm，缝里的 AO 自然变暗 ——
    const cols = 3, gap = 0.004, m = 0.018;
    const fw = (L - 2 * m - (cols - 1) * gap) / cols;
    const rows = [{ h: bh - 2 * m - gap - 0.2 }, { h: 0.2 }]; // 从下往上：下排深、上排浅
    for (const sz of [1, -1]) {
      let y = PLINTH + m;
      rows.forEach((r, ri) => {
        for (let ci = 0; ci < cols; ci++) {
          const cx = -L / 2 + m + fw / 2 + ci * (fw + gap);
          const cy = y + r.h / 2;
          const id = `${sz > 0 ? 'F' : 'B'}${ri}${ci}`;
          k.box({
            name: `drawer${id}`, mat: 'walnut', size: [fw, r.h, 0.02], r: q(0.002, 0), segs: q(1, 0), grain: 'x',
            omit: [sz > 0 ? 'nz' : 'pz'], xf: xf({ pos: [cx, cy, sz * (D / 2 + 0.006)] }),
          });
          if (k.lod < 2) {
            // 深抽屉的拉手靠上；后面一排的拉手先在 +z 面上做好，再绕 y 转 180° 到 -z 面
            const py = ri === 1 ? cy : y + r.h - 0.06;
            const pull = barPull(k, { name: `pull${id}`, mat: 'brass', len: 0.14, depth: 0.024, r: 0.0045, segs: q(4, 3), csegs: 1, pos: [sz * cx, py, D / 2 + 0.016], axis: 'x' });
            if (sz < 0) pull.transform(xf({ rot: [0, Math.PI, 0] }));
          }
        }
        y += r.h + gap;
      });
    }

    // —— 展示格：胡桃木框 + 丝绒底 + 隔板 + 玻璃盖 ——
    const ch = H - CASE.y0, rim = CASE.rim;
    for (const s of [-1, 1]) {
      k.box({
        name: `caseLong${s > 0 ? 'F' : 'B'}`, mat: 'walnut', size: [L, ch, rim], r: q(0.004, 0.003, 0), segs: cs, grain: 'x',
        density: { ny: 0.2 }, xf: xf({ pos: [0, CASE.y0 + ch / 2, s * (D / 2 - rim / 2)] }),
      });
      k.box({
        name: `caseEnd${s > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [rim, ch, D - 2 * rim], r: q(0.004, 0.003, 0), segs: cs, grain: 'z',
        omit: ['pz', 'nz'], density: { ny: 0.2 }, xf: xf({ pos: [s * (L / 2 - rim / 2), CASE.y0 + ch / 2, 0] }),
      });
    }
    const iw = L - 2 * rim, id = D - 2 * rim;
    k.box({
      name: 'velvet', mat: 'velvet', size: [iw, VEL - CASE.y0, id], segs: 0,
      omit: ['ny', 'px', 'nx', 'pz', 'nz'], xf: xf({ pos: [0, (VEL + CASE.y0) / 2, 0] }),
    });
    // 隔板：沿长边一道、横着两道 → 3 × 2 六格
    const dh = 0.05, dt = 0.008;
    k.box({
      name: 'divLong', mat: 'walnut', size: [iw, dh, dt], r: q(0.002, 0), segs: q(1, 0), grain: 'x', omit: ['ny', 'px', 'nx'],
      xf: xf({ pos: [0, VEL + dh / 2, 0] }),
    });
    const cellW = iw / 3;
    for (const s of [-1, 1]) {
      k.box({
        name: `div${s > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [dt, dh, id], r: q(0.002, 0), segs: q(1, 0), grain: 'z', omit: ['ny', 'pz', 'nz'],
        xf: xf({ pos: [(s * cellW) / 2, VEL + dh / 2, 0] }),
      });
    }
    // 玻璃盖：嵌在框的止口里（比框顶低 1.2cm）
    k.box({
      // 玻璃不压 AO（aoStrength 0）：它的图块只是占位，密度给到最低
      name: 'glass', mat: 'glass', size: [iw + 0.012, 0.008, id + 0.012], segs: 0, omit: ['ny'],
      density: { py: 0.05, px: 0.05, nx: 0.05, pz: 0.05, nz: 0.05 },
      xf: xf({ pos: [0, GLASS + 0.004, 0] }),
    });

    // —— 格子里的首饰 ——（格子中心）
    const cellAt = (col, row) => [(col - 1) * cellW, VEL, row * (id / 4)];
    const cw = cellW - dt, cd = id / 2 - dt;
    // 1. 戒指卷：一排丝绒卷（沿 x），戒指插在卷与卷之间的缝里
    {
      const [x0, y0, z0] = cellAt(0, 1);
      const nr = 7, rr = 0.0125, len = cw - 0.03;
      const pitch = (cd - 0.03) / nr;
      for (let i = 0; i < nr; i++) {
        const z = z0 - (cd - 0.03) / 2 + pitch * (i + 0.5);
        k.sweep({
          name: `roll${i}`, mat: 'velvet', shape: circle(rr, q(8, 6, 4)), caps: [true, true],
          path: [[x0 - len / 2, y0 + rr, z], [x0 + len / 2, y0 + rr, z]],
        });
      }
      const rings = [
        { metal: 'gold', stone: 'emerald' }, { metal: 'silver', stone: 'diamond' }, { metal: 'gold', stone: null },
        { metal: 'roseGold', stone: 'diamond' }, { metal: 'gold', stone: 'sapphire' }, { metal: 'gold', stone: 'ruby' },
      ];
      rings.forEach((r, i) => {
        const slot = [1, 2, 3, 4, 5, 2][i], xs = [-0.07, 0.03, -0.04, 0.06, -0.01, 0.1][i];
        const z = z0 - (cd - 0.03) / 2 + pitch * slot;
        ring(k, { name: `ring${i}`, ...r, arc: 1.25 * Math.PI, place: xf({ pos: [x0 + xs, y0 + 2 * rr - 0.002, z] }) });
      });
    }
    // 2. 两只表，各戴在一个丝绒表枕上（表枕是一段横放的圆柱，两头圆）
    {
      const [x0, y0, z0] = cellAt(1, 1);
      [[-0.075, 'steel', 'dialNavy', 'steel'], [0.07, 'gold', 'dial', 'strap']].forEach(([dx, cs2, dial, strap], i) => {
        const place = xf({ pos: [x0 + dx, y0, z0 + 0.005], rot: [0, (i - 0.5) * 0.12, 0] });
        k.lathe({
          name: `pillow${i}`, mat: 'velvet', segs: q(10, 8, 6),
          profile: profile([[0, 0], [0.024, 0.006, { smooth: true }], [0.025, 0.045, { smooth: true }], [0.024, 0.084, { smooth: true }], [0, 0.09]]),
          xf: place.mul(xf({ pos: [-0.045, 0.025, 0], rot: [0, 0, -Math.PI / 2] })),
        });
        watch(k, { name: `watch${i}`, caseSwatch: cs2, dial, strap, dia: 0.05, place });
      });
    }
    // 3. 耳环 + 金链子（链子摆成一个水滴形的圈，蓝宝石吊坠坠在尖上）
    {
      const [x0, y0, z0] = cellAt(2, 1);
      earrings(k, { name: 'studPearl', kind: 'stud', swatch: 'pearl', place: xf({ pos: [x0 - 0.14, y0, z0 - 0.045] }) });
      earrings(k, { name: 'studDiamond', kind: 'stud', swatch: 'diamond', gap: 0.018, place: xf({ pos: [x0 - 0.14, y0, z0 + 0.035] }) });
      earrings(k, { name: 'dropEmerald', kind: 'drop', swatch: 'emerald', gap: 0.03, place: xf({ pos: [x0 - 0.055, y0, z0 + 0.02] }) });
      const cx = x0 + 0.085, n = q(24, 12), pts = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        const tip = Math.exp(-(((a - Math.PI) / 0.45) ** 2)); // 尖在 -z 那头
        pts.push([cx + Math.sin(a) * 0.045 * (1 - 0.8 * tip), y0 + 0.0013, z0 + 0.005 + Math.cos(a) * 0.07 - tip * 0.012]);
      }
      if (k.lod < 2) tint(k.sweep({ name: 'chain', mat: 'trinkets', shape: circle(0.0012, 3), closed: true, caps: [false, false], path: pts }), 'gold');
      const g = k.lathe({ name: 'pendant', mat: 'trinkets', segs: q(6, 5, 4), profile: profile([[0, 0], [0.007, 0.004], [0.004, 0.0075], [0, 0.008]]) });
      tint(g, 'sapphire');
      g.transform(xf({ pos: [cx, y0, z0 + 0.005 - 0.07 - 0.02] }));
    }
    // 4. 三只叠放的手镯 + 一只躺着的红宝石戒指
    {
      const [x0, y0, z0] = cellAt(0, -1);
      bangle(k, { name: 'bangle0', swatch: 'gold', R: 0.036, place: xf({ pos: [x0 - 0.03, y0, z0 + 0.005] }) });
      bangle(k, { name: 'bangle1', swatch: 'roseGold', R: 0.034, t: 0.003, place: xf({ pos: [x0 + 0.005, y0 + 0.0066, z0 - 0.004], rot: [0.06, 0, 0.05] }) });
      bangle(k, { name: 'bangle2', swatch: 'silver', R: 0.035, t: 0.0025, place: xf({ pos: [x0 + 0.075, y0, z0 - 0.01] }) });
      ring(k, { name: 'looseRing', metal: 'gold', stone: 'ruby', place: xf({ pos: [x0 + 0.14, y0 + 0.0018, z0 + 0.05], rot: [Math.PI / 2, 0.3, 0] }) });
    }
    // 5. 珍珠项链：摆成一个有点歪的椭圆，搭扣那头往里收一点
    {
      const [x0, y0, z0] = cellAt(1, -1);
      const n = 18, path = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        const pinch = 1 - 0.22 * Math.exp(-(((a - Math.PI) / 0.5) ** 2));
        path.push([x0 + Math.sin(a) * 0.088 * pinch, y0, z0 + Math.cos(a) * 0.056 + Math.sin(2 * a) * 0.007]);
      }
      if (k.lod < 2) pearls(k, { name: 'pearl', path, r: 0.005, place: xf() });
    }
    // 6. 最后一格空着：手提包放在这一格上方的玻璃上

    // —— 台面上的手提包（干邑色植鞣皮）——
    handbag(k, { name: 'bag', mat: 'leather', size: [0.3, 0.21, 0.12], place: xf({ pos: [0.4, GLASS + 0.008, -0.12], rot: [0, -0.35, 0] }) });
  },
};
