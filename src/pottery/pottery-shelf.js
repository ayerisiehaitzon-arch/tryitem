import { xf } from '../core/vec.js';
import { potteryUV } from '../materials/atlas.js';
import { sw, turned, pot, mugHandle, mapUV } from './parts.js';

// 作品架：靠墙的橡木层架（四根方柱、五层搁板、背后两道横档），从下往上：
// 最下面一层两袋泥和一摞石膏托板；第二层两块晾坯板上晾着灰色的生坯（碗、马克杯、筒杯）；
// 第三层粉白的素烧坯（摞起来的碗、罐、杯子）；最上面两层是上了釉的成品：
// 青瓷碗、天目茶盏、松石绿茶盏、志野筒杯、钴蓝和燕麦马克杯、青瓷筒杯；铜红和青瓷的长颈瓶、天目罐、燕麦罐、
// 靠在背后横档上的两只盘子、一摞套在一起的碗、一只哑光白的马克杯。
// 原点在墙根（z = 0 是墙面）、架子宽度的中点，正面朝 +z。
const W = 1.3, D = 0.4, H = 1.86, POST = 0.045, T = 0.022;
const LEVELS = [0.1, 0.48, 0.86, 1.24, 1.62];

export default {
  id: 'pottery_shelf',
  name: '作品架',
  nameEn: 'Pottery Shelf with Greenware, Bisque and Glazed Ware',
  category: 'pottery',
  planes: ['floor', 'wall'],
  aoDensity: 150,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.45, density: 80 },
    wall: { margin: 0.12, maxDist: 0.3, density: 60, strength: 0.6 },
  },
  view: { el: 12, az: 22 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 架子：四根方柱、五层搁板、背后两道横档 ——
    for (const [i, [sx, sz]] of [[0, [-1, 0]], [1, [1, 0]], [2, [-1, 1]], [3, [1, 1]]]) {
      k.box({ name: `post${i}`, mat: 'oak', size: [POST, H, POST], r: 0.004, segs: q(1, 1, 0), grain: 'y', omit: ['ny'], xf: xf({ pos: [sx * (W / 2 - POST / 2), H / 2, 0.012 + POST / 2 + sz * (D - POST - 0.012)] }) });
    }
    LEVELS.forEach((y, i) => {
      k.box({ name: `board${i}`, mat: 'oak', size: [W - 0.004, T, D - 0.01], r: 0.003, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [0, y + T / 2, 0.012 + (D - 0.01) / 2] }) });
    });
    for (const [i, y] of [[0, 1.02], [1, 1.78]]) k.box({ name: `rail${i}`, mat: 'oak', size: [W - 2 * POST, 0.05, 0.02], r: 0.003, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [0, y, 0.022] }) });
    const top = (i) => LEVELS[i] + T;
    const zc = 0.012 + D / 2;

    // —— 第 0 层：两袋泥（塑料袋包着的软方块，正面贴图集里的袋子和标签）、一摞石膏托板 ——
    for (const [i, x, a] of [[0, -0.4, 0.06], [1, -0.07, -0.08]]) {
      const cy = top(0) + 0.075, cz = zc + 0.02;
      const b = k.box({ name: `clayBag${i}`, mat: 'pottery', size: [0.3, 0.15, 0.24], r: 0.03, segs: q(2, 1, 1), div: [q(3, 2, 1), 1, 1], puff: { top: 0.012, side: 0.01 } });
      mapUV(b, (p, n) => (n[2] > 0.7 ? potteryUV('clayBag', 0.5 + p[0] / 0.3, 0.5 - p[1] / 0.15) : potteryUV('clayBag', 0.06, 0.25 + 0.3 * Math.abs(n[1]))));
      b.transform(xf({ pos: [x, cy, cz], rot: [0, a, 0] }));
    }
    for (let i = 0; i < 4; i++) turned(k, `bat${i}`, [[0, 0], [0.126, 0], [0.13, 0.004], [0.13, 0.012], [0.126, 0.016], [0, 0.016]], 'plaster', { segs: q(20, 14, 8), place: xf({ pos: [0.36 + 0.004 * (i % 2), top(0) + 0.016 * i, zc + 0.01 - 0.003 * i] }) });

    // —— 第 1 层：两块晾坯板，上面一排生坯 ——
    for (const [i, x] of [[0, -0.31], [1, 0.31]]) k.box({ name: `wareBoard${i}`, mat: 'oak', size: [0.6, 0.012, 0.3], r: 0.002, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [x, top(1) + 0.006, zc] }) });
    {
      const y = top(1) + 0.012;
      const green = (shape) => ({ shape, state: 'green' });
      pot(k, 'green0', green('bowl'), { place: xf({ pos: [-0.5, y, zc - 0.03] }) });
      pot(k, 'green1', green('mug'), { place: xf({ pos: [-0.33, y, zc + 0.04], rot: [0, 0.3, 0] }) });
      mugHandle(k, 'green1Handle', green('mug'), { place: xf({ pos: [-0.33, y, zc + 0.04], rot: [0, 0.3, 0] }) });
      pot(k, 'green2', green('mug'), { place: xf({ pos: [-0.18, y, zc - 0.05], rot: [0, 2.4, 0] }) });
      mugHandle(k, 'green2Handle', green('mug'), { place: xf({ pos: [-0.18, y, zc - 0.05], rot: [0, 2.4, 0] }) });
      pot(k, 'green3', green('yunomi'), { place: xf({ pos: [0.1, y, zc + 0.05] }) });
      pot(k, 'green4', green('yunomi'), { place: xf({ pos: [0.2, y, zc - 0.04] }) });
      pot(k, 'green5', green('teaBowl'), { place: xf({ pos: [0.36, y, zc + 0.04] }) });
      pot(k, 'green6', green('bowl'), { place: xf({ pos: [0.52, y, zc - 0.02] }) });
    }

    // —— 第 2 层：素烧坯（两只碗摞在一起、罐、杯子、盘子）——
    {
      const y = top(2), bis = (shape) => ({ shape, state: 'bisque' });
      pot(k, 'bisque0', bis('bowl'), { place: xf({ pos: [-0.46, y, zc] }) });
      pot(k, 'bisque1', bis('bowl'), { place: xf({ pos: [-0.46, y + 0.02, zc] }), s: 0.93 });
      pot(k, 'bisque2', bis('jar'), { place: xf({ pos: [-0.2, y, zc - 0.02] }) });
      pot(k, 'bisque3', bis('yunomi'), { place: xf({ pos: [0.02, y, zc + 0.06] }) });
      pot(k, 'bisque4', bis('mug'), { place: xf({ pos: [0.15, y, zc - 0.04], rot: [0, -0.6, 0] }) });
      mugHandle(k, 'bisque4Handle', bis('mug'), { place: xf({ pos: [0.15, y, zc - 0.04], rot: [0, -0.6, 0] }) });
      pot(k, 'bisque5', bis('plate'), { place: xf({ pos: [0.44, y, zc] }) });
      pot(k, 'bisque6', bis('plate'), { place: xf({ pos: [0.44, y + 0.012, zc] }), s: 0.98 });
    }

    // —— 第 3 层：上釉的碗、茶盏、筒杯、马克杯 ——
    {
      const y = top(3);
      pot(k, 'bowlCeladon', 'bowlCeladon', { place: xf({ pos: [-0.49, y, zc] }) });
      pot(k, 'teaBowlTenmoku', 'teaBowlTenmoku', { place: xf({ pos: [-0.31, y, zc + 0.05] }) });
      pot(k, 'yunomiShino', 'yunomiShino', { place: xf({ pos: [-0.16, y, zc - 0.04] }) });
      pot(k, 'mugCobalt', 'mugCobalt', { place: xf({ pos: [-0.02, y, zc + 0.05], rot: [0, 0.4, 0] }) });
      mugHandle(k, 'mugCobaltHandle', 'mugCobalt', { place: xf({ pos: [-0.02, y, zc + 0.05], rot: [0, 0.4, 0] }) });
      pot(k, 'teaBowlTurquoise', 'teaBowlTurquoise', { place: xf({ pos: [0.14, y, zc - 0.03] }) });
      pot(k, 'mugOatmeal', 'mugOatmeal', { place: xf({ pos: [0.3, y, zc + 0.04], rot: [0, -0.5, 0] }) });
      mugHandle(k, 'mugOatmealHandle', 'mugOatmeal', { place: xf({ pos: [0.3, y, zc + 0.04], rot: [0, -0.5, 0] }) });
      pot(k, 'yunomiCeladon', 'yunomiCeladon', { place: xf({ pos: [0.47, y, zc - 0.02] }) });
    }

    // —— 第 4 层：长颈瓶、罐、靠在横档上的盘子、一摞套在一起的碗、白马克杯 ——
    {
      const y = top(4);
      pot(k, 'vaseCopper', 'vaseCopper', { place: xf({ pos: [-0.5, y, zc] }) });
      pot(k, 'jarTenmoku', 'jarTenmoku', { place: xf({ pos: [-0.3, y, zc + 0.02] }) });
      // 两只盘子立着，靠在背后的横档上（往后仰 12°）
      pot(k, 'plateCobalt', 'plateCobalt', { place: xf({ pos: [-0.08, y + 0.13, 0.036], rot: [Math.PI / 2 - 0.21, 0, 0] }) });
      pot(k, 'plateShino', 'plateShino', { place: xf({ pos: [0.2, y + 0.13, 0.036], rot: [Math.PI / 2 - 0.21, 0, 0] }) });
      pot(k, 'bowlTurquoise', 'bowlTurquoise', { place: xf({ pos: [-0.09, y, zc + 0.1] }) });
      pot(k, 'bowlTenmoku', 'bowlTenmoku', { place: xf({ pos: [-0.09, y + 0.013, zc + 0.1] }), s: 0.9 });
      pot(k, 'mugWhite', 'mugWhite', { place: xf({ pos: [0.2, y, zc + 0.11], rot: [0, 0.9, 0] }) });
      mugHandle(k, 'mugWhiteHandle', 'mugWhite', { place: xf({ pos: [0.2, y, zc + 0.11], rot: [0, 0.9, 0] }) });
      pot(k, 'jarOatmeal', 'jarOatmeal', { place: xf({ pos: [0.38, y, zc + 0.03] }), s: 0.85 });
      pot(k, 'vaseCeladon', 'vaseCeladon', { place: xf({ pos: [0.53, y, zc - 0.01] }), s: 0.85 });
    }
  },
};
