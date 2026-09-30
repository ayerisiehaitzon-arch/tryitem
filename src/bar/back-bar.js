import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { shakerFront } from '../kitchen/cabinetry.js';
import { sw, rod, bottle, rocksGlass, coupe, wineGlass, ROCKS } from './parts.js';

// 背吧柜：靠墙一整排。下面是墨绿色的 Shaker 门地柜（四扇门、黄铜竖拉手、黑色踢脚）和一块大理石台面；
// 台面上立着一个三格的胡桃木开放格架，背后整面银镜，每层搁板前沿底下一条暖白的灯带，两边格子的搁板上一根黄铜挡杆。
//   · 两边的格子摆满了酒：每边四层、十八瓶，十二种酒轮着摆，标签大致朝外、各自歪一点；
//   · 中间一格放杯子：台面上三瓶葡萄酒 / 香槟，前面一块黑色吧垫倒扣着六只古典杯；上面一层四只香槟碟、再上面四只红酒杯，
//     最上层五瓶威士忌、朗姆和梅斯卡尔。
// 原点在墙根、宽度中点（z = 0 是墙面），往 +z 伸出来。
const W = 1.1;                                          // 地柜半宽
const BASE = { y0: 0.1, y1: 0.87, z1: 0.46 };           // 柜体（踢脚以上）
const TOP = { y: 0.9, t: 0.03, z: 0.5 };                // 台面
const HUTCH = { x: 1.08, d: 0.26, t: 0.03, inner: 0.36, roof: 2.36, st: 0.025, levels: [0.9, 1.27, 1.63, 1.99] };
// 每层的酒（左、右两格，自下而上）
const SIDES = {
  L: [['gin', 'vodka', 'vermouth', 'bitter'], ['malt', 'bourbon', 'rum', 'mezcal', 'orange'], ['wineRed', 'wineWhite', 'gin', 'vodka', 'brut'], ['rum', 'malt', 'bitter', 'mezcal']],
  R: [['mezcal', 'rum', 'malt', 'orange'], ['vermouth', 'gin', 'bitter', 'vodka', 'bourbon'], ['brut', 'wineRed', 'malt', 'wineWhite', 'rum'], ['bourbon', 'orange', 'vermouth', 'gin']],
};
const sm = { smooth: true };

export default {
  id: 'back_bar',
  name: '背吧柜',
  nameEn: 'Mirrored Back Bar with Bottles and Glassware',
  category: 'bar',
  planes: ['floor', 'wall'],
  aoDensity: 150,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.4, density: 80 },
    wall: { margin: 0.12, maxDist: 0.3, density: 60, strength: 0.7 },
  },
  view: { el: 10, az: 22 },
  build(k) {
    const q = (...v) => k.q(...v);
    const rnd = k.rand('bottles');

    // —— 地柜：踢脚、柜体、四扇门、黄铜竖拉手 ——
    sw(k.box({ name: 'plinth', mat: 'bar', size: [2 * W - 0.04, BASE.y0, BASE.z1 - 0.06], segs: 0, omit: ['ny', 'py', 'nz'], xf: xf({ pos: [0, BASE.y0 / 2, (BASE.z1 - 0.06) / 2] }) }), 'plinth');
    const ch = BASE.y1 - BASE.y0;
    k.box({ name: 'carcass', mat: 'paint_green', size: [2 * W, ch, BASE.z1 - 0.01], segs: 0, omit: ['nz', 'py', 'ny'], density: { pz: 0.3 }, xf: xf({ pos: [0, BASE.y0 + ch / 2, (BASE.z1 + 0.01) / 2] }) });
    const gap = 0.003, dw = (2 * W - 5 * gap) / 4, dy0 = BASE.y0 + 0.012, dy1 = BASE.y1 - 0.006;
    for (let i = 0; i < 4; i++) {
      const x0 = -W + gap + i * (dw + gap);
      shakerFront(k, { name: `door${i}`, mat: 'paint_green', x0, x1: x0 + dw, y0: dy0, y1: dy1, z: BASE.z1 });
      // 拉手在每对门相对的那条边上
      const xp = i % 2 === 0 ? x0 + dw - 0.035 : x0 + 0.035, zf = BASE.z1 + 0.02, yc = dy1 - 0.16;
      rod(k, `pull${i}`, [xp, yc - 0.075, zf + 0.026], [xp, yc + 0.075, zf + 0.026], 0.0055, 'brass', { segs: q(8, 6, 4) });
      if (k.lod < 2) for (const [j, dy] of [[0, -0.06], [1, 0.06]]) rod(k, `pull${i}Post${j}`, [xp, yc + dy, zf], [xp, yc + dy, zf + 0.026], 0.0035, 'brass', { segs: q(6, 5, 4), caps: [false, false] });
    }
    // 台面：3cm 大理石，前沿探出门板 2cm
    k.box({ name: 'top', mat: 'marble_slab', size: [2 * W + 0.04, TOP.t, TOP.z], r: 0.004, segs: q(2, 1, 1), omit: ['nz'], xf: xf({ pos: [0, TOP.y - TOP.t / 2, TOP.z / 2] }) });

    // —— 格架：两根边立板、两根中立板、每格三层搁板、顶板和一圈压顶线脚，背后整面银镜 ——
    const { x: HX, d: D, t: T, inner: XI, roof: RY, st: ST, levels: LV } = HUTCH;
    const H = RY - TOP.y;
    k.box({ name: 'mirror', mat: 'mirror', size: [2 * HX - 2 * T, H, 0.006], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos: [0, TOP.y + H / 2, 0.006] }) });
    const upright = (name, x) => k.box({ name, mat: 'walnut', size: [T, H, D], r: 0.002, segs: q(1, 1, 0), omit: ['ny', 'nz'], grain: 'y', xf: xf({ pos: [x, TOP.y + H / 2, D / 2] }) });
    upright('sideL', -HX + T / 2);
    upright('sideR', HX - T / 2);
    upright('midL', -XI);
    upright('midR', XI);
    k.box({ name: 'roof', mat: 'walnut', size: [2 * HX, 0.03, D], r: 0.002, segs: q(1, 1, 0), omit: ['nz'], xf: xf({ pos: [0, RY + 0.015, D / 2] }) });
    k.box({ name: 'crown', mat: 'walnut', size: [2 * HX + 0.05, 0.06, D + 0.03], r: 0.006, segs: q(2, 1, 1), omit: ['nz'], xf: xf({ pos: [0, RY + 0.06, (D + 0.03) / 2] }) });
    // 三格的左右边界（立板之间的净宽）
    const bays = [[-HX + T, -XI - T / 2], [-XI + T / 2, XI - T / 2], [XI + T / 2, HX - T]];
    bays.forEach(([x0, x1], b) => {
      const w = x1 - x0, xc = (x0 + x1) / 2;
      LV.slice(1).forEach((y, l) => {
        k.box({ name: `shelf${b}${l}`, mat: 'walnut', size: [w, ST, D - 0.012], r: 0.002, segs: q(1, 1, 0), omit: ['nz'], xf: xf({ pos: [xc, y - ST / 2, (D + 0.012) / 2] }) });
      });
      // 灯带：每层搁板（和顶板）前沿底下一条
      [...LV.slice(1).map((y) => y - ST), RY].forEach((y, l) => {
        sw(k.box({ name: `led${b}${l}`, mat: 'bar', size: [w - 0.02, 0.003, 0.012], segs: 0, omit: ['py'], xf: xf({ pos: [xc, y - 0.0015, D - 0.028] }) }), 'led');
      });
    });

    // —— 两边的酒：每层一排，间距按格宽均分，标签大致朝外 ——
    const z = 0.13;
    const row = (name, ids, x0, x1, y) => {
      const step = (x1 - x0) / ids.length;
      ids.forEach((id, i) => {
        const x = x0 + step * (i + 0.5) + (rnd() - 0.5) * 0.014;
        bottle(k, `${name}${i}`, id, { segs: q(12, 8, 5), lite: true, place: xf({ pos: [x, y, z + (rnd() - 0.5) * 0.03], rot: [0, (rnd() - 0.5) * 0.7, 0] }) });
      });
    };
    for (const [side, [x0, x1]] of [['L', bays[0]], ['R', bays[2]]]) {
      SIDES[side].forEach((ids, l) => row(`b${side}${l}_`, ids, x0 + 0.01, x1 - 0.01, LV[l]));
      // 挡杆：一根黄铜杆，两头各一根小立柱
      if (k.lod < 2) LV.slice(1).forEach((y, l) => {
        const zr = D - 0.03, yr = y + 0.04;
        rod(k, `rail${side}${l}`, [x0 + 0.004, yr, zr], [x1 - 0.004, yr, zr], 0.004, 'brass', { segs: q(8, 6, 4), caps: [false, false] });
        for (const [j, xp] of [[0, x0 + 0.03], [1, x1 - 0.03]]) rod(k, `rail${side}${l}Post${j}`, [xp, y, zr], [xp, yr, zr], 0.0035, 'brass', { segs: q(6, 5, 4), caps: [false, false] });
      });
    }

    // —— 中间一格：杯子 ——
    {
      const [x0, x1] = bays[1];
      row('bC0_', ['wineRed', 'brut', 'wineWhite'], x0 + 0.08, x1 - 0.08, LV[0]);
      row('bC3_', ['malt', 'bourbon', 'rum', 'mezcal', 'orange'], x0 + 0.01, x1 - 0.01, LV[3]);
      // 台面前面一块吧垫，倒扣着六只古典杯（杯子又小又透明，最远一级 LOD 不要了）
      sw(k.box({ name: 'mat', mat: 'bar', size: [0.34, 0.008, 0.2], r: 0.003, segs: q(1, 1, 0), omit: ['ny'], xf: xf({ pos: [0, TOP.y + 0.004, 0.37] }) }), 'black');
      if (k.lod > 1) return;
      [-0.1, 0, 0.1].forEach((x, i) => [0.32, 0.42].forEach((zz, j) => {
        rocksGlass(k, `rocks${i}${j}`, { segs: q(14, 10, 6), place: xf({ pos: [x + (j ? 0.004 : -0.003), TOP.y + 0.008 + ROCKS.h, zz], rot: [Math.PI, 0.3 * i + j, 0] }) });
      }));
      [-0.24, -0.08, 0.08, 0.24].forEach((x, i) => {
        coupe(k, `coupe${i}`, { segs: q(14, 10, 6), place: xf({ pos: [x, LV[1], z + 0.01], rot: [0, i, 0] }) });
        wineGlass(k, `wine${i}`, { place: xf({ pos: [x, LV[2], z + 0.01], rot: [0, 2 * i, 0] }) });
      });
    }
  },
};
