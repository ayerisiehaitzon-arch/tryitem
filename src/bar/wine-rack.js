import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { BOTTLES, bottleIndex } from './bottles.js';
import { sw, bottle, wineGlass } from './parts.js';

// 酒架：靠墙立着的胡桃木格子柜，4 列 × 8 行的方格，横放着二十六瓶葡萄酒（红、白、香槟三种），瓶口朝外、
// 露出一截瓶颈和锡封，有几格空着；顶上立着一瓶红酒、两只红酒杯（一只倒了半杯）和一个拔出来的软木塞。
// 原点在墙根、宽度中点（z = 0 是墙面），往 +z 伸出来。
const COLS = 4, ROWS = 8, CELL = 0.105, T = 0.014, SIDE = 0.02, D = 0.3;
const W = COLS * CELL + (COLS - 1) * T + 2 * SIDE;      // 外宽
const Y0 = 0.08, GH = ROWS * CELL + (ROWS - 1) * T;    // 格子区的底和高
const TOPY = Y0 + GH + 0.03;                           // 顶板上表面
const EMPTY = new Set([2, 9, 15, 20, 27, 30]);         // 空着的格子（从左下往右上数）
const sm = { smooth: true };

export default {
  id: 'wine_rack',
  name: '酒架',
  nameEn: 'Walnut Wine Rack with Bottles',
  category: 'bar',
  planes: ['floor', 'wall'],
  aoDensity: 260,
  shadow: {
    floor: { margin: 0.12, maxDist: 0.4, density: 100 },
    wall: { margin: 0.1, maxDist: 0.3, density: 80, strength: 0.7 },
  },
  view: { el: 12, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const board = (name, size, pos, grain, omit = []) => k.box({ name, mat: 'walnut', size, r: 0.0015, segs: q(1, 1, 0), grain, omit, xf: xf({ pos }) });

    // —— 柜体：踢脚、两块侧板、底板、顶板、背板，中间一格格的竖隔板和横隔板（十字搭口）——
    board('plinth', [W - 0.04, Y0 - 0.02, D - 0.03], [0, (Y0 - 0.02) / 2, (D - 0.03) / 2], 'x', ['ny', 'nz']);
    const H = GH + 0.02;
    for (const s of [-1, 1]) board(`side${s > 0 ? 'R' : 'L'}`, [SIDE, TOPY - 0.03 - (Y0 - 0.02), D], [s * (W / 2 - SIDE / 2), (TOPY - 0.03 + Y0 - 0.02) / 2, D / 2], 'y', ['ny', 'nz']);
    board('bottom', [W - 2 * SIDE, 0.02, D], [0, Y0 - 0.01, D / 2], 'x', ['nz']);
    k.box({ name: 'top', mat: 'walnut', size: [W + 0.02, 0.03, D + 0.012], r: 0.004, segs: q(2, 1, 1), omit: ['nz'], grain: 'x', xf: xf({ pos: [0, TOPY - 0.015, (D + 0.012) / 2] }) });
    k.box({ name: 'back', mat: 'walnut', size: [W - 2 * SIDE, H, 0.006], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'], density: { pz: 0.5 }, xf: xf({ pos: [0, Y0 + GH / 2, 0.003] }) });
    const x0 = -W / 2 + SIDE;
    for (let c = 1; c < COLS; c++) board(`div${c}`, [T, GH, D - 0.006], [x0 + c * (CELL + T) - T / 2, Y0 + GH / 2, (D + 0.006) / 2], 'y', ['nz']);
    for (let r = 1; r < ROWS; r++) board(`shelf${r}`, [W - 2 * SIDE, T, D - 0.006], [0, Y0 + r * (CELL + T) - T / 2, (D + 0.006) / 2], 'x', ['nz']);

    // —— 瓶子：横躺，瓶底抵着背板，瓶口朝外；先绕瓶身随手转一下，再放倒 ——
    const rnd = k.rand('wines');
    const kinds = ['wineRed', 'wineRed', 'wineWhite', 'wineRed', 'brut', 'wineWhite'];
    for (let i = 0; i < ROWS * COLS; i++) {
      const id = kinds[Math.floor(rnd() * kinds.length)], spin = rnd() * 2 * Math.PI;
      if (EMPTY.has(i)) continue;
      const c = i % COLS, r = Math.floor(i / COLS);
      const rad = Math.max(...BOTTLES[bottleIndex(id)].pts.map((p) => p[0]));
      const x = x0 + c * (CELL + T) + CELL / 2, y = Y0 + r * (CELL + T) + rad;
      bottle(k, `w${i}`, id, { segs: q(10, 8, 5), lite: true, place: xf({ pos: [x, y, 0.012], rot: [Math.PI / 2, 0, spin] }) });
    }

    // —— 顶上：一瓶红酒、两只红酒杯（一只倒了半杯）、一个软木塞 ——
    bottle(k, 'topBottle', 'wineRed', { place: xf({ pos: [-0.12, TOPY, 0.14], rot: [0, 0.25, 0] }) });
    wineGlass(k, 'glassA', { fill: 0.114, liquid: 'wine', place: xf({ pos: [0.05, TOPY, 0.17], rot: [0, 0.6, 0] }) });
    wineGlass(k, 'glassB', { place: xf({ pos: [0.15, TOPY, 0.09], rot: [0, 2.1, 0] }) });
    if (k.lod < 2) sw(k.lathe({ name: 'cork', mat: 'bar', segs: q(10, 8, 6), profile: profile([[0, -0.022], [0.0115, -0.022], [0.012, -0.019, sm], [0.012, 0.019, sm], [0.0115, 0.022], [0, 0.022]]), xf: xf({ pos: [-0.03, TOPY + 0.012, 0.23], rot: [0, 0.7, Math.PI / 2] }) }), 'cork');
  },
};
