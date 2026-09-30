import { circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { potteryUV } from '../materials/atlas.js';
import { sw, rod, turned, pot, mapUV, aim, catmull } from './parts.js';

// 揉泥台：靠墙一张结实的橡木台子（四条粗腿、下面一层搁板），台面包着一张沾满泥印的帆布。
// 台面上：左边一大团正在揉的湿泥，中间一块刚从袋子里拿出来、用割泥线切成两半的泥，前面丢着割泥线（两头木把手）；
// 右边一个手转台（铸铁底座、铝转盘）上倒扣着一只半干的碗等着修坯，后面一小桶泥浆插着刷子；
// 左前方一根擀泥的木擀杖、左后方一块擀好的泥板，一块黄海绵；右后角立着一根钢杆，一根割泥的钢丝从杆顶斜拉到台子前沿。
// 下面搁板上两袋泥和一只水桶。原点在墙根（z = 0 是墙面）、台子宽度的中点，正面朝 +z。
const sm = { smooth: true };
const W = 1.2, D = 0.7, TOP = 0.82, SLAB = 0.055;

export default {
  id: 'wedging_table',
  name: '揉泥台',
  nameEn: 'Canvas Wedging Table',
  category: 'pottery',
  planes: ['floor', 'wall'],
  aoDensity: 190,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.5, density: 80 },
    wall: { margin: 0.12, maxDist: 0.3, density: 60, strength: 0.6 },
  },
  view: { el: 26, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 台子：帆布包着的厚台面（顶面贴帆布，四边是帆布包过去的边）、四条腿、前后两道横档、下面的搁板 ——
    {
      const top = k.box({ name: 'top', mat: 'pottery', size: [W, SLAB, D], r: 0.008, segs: q(2, 1, 1) });
      mapUV(top, (p, n) => (n[1] > 0.7 ? potteryUV('canvas', 0.5 + p[0] / W, 0.5 + p[2] / D) : potteryUV('canvas', 0.5 + (p[0] / W) * 0.98, 0.5 + (p[2] / D) * 0.98)));
      top.transform(xf({ pos: [0, TOP - SLAB / 2, D / 2] }));
      for (const [i, [sx, sz]] of [[0, [-1, -1]], [1, [1, -1]], [2, [-1, 1]], [3, [1, 1]]]) {
        k.box({ name: `leg${i}`, mat: 'oak', size: [0.08, TOP - SLAB, 0.08], r: 0.005, segs: q(1, 1, 0), grain: 'y', omit: ['ny'], xf: xf({ pos: [sx * (W / 2 - 0.06), (TOP - SLAB) / 2, D / 2 + sz * (D / 2 - 0.06)] }) });
      }
      k.box({ name: 'shelf', mat: 'oak', size: [W - 0.1, 0.025, D - 0.1], r: 0.003, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [0, 0.2, D / 2] }) });
      for (const s of [-1, 1]) k.box({ name: `apron${s > 0 ? 'F' : 'B'}`, mat: 'oak', size: [W - 0.2, 0.08, 0.025], r: 0.003, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [0, TOP - SLAB - 0.04, D / 2 + s * (D / 2 - 0.06)] }) });
    }
    // —— 正在揉的一大团湿泥（压扁的圆鼓鼓的一团，微微歪着）——
    k.box({ name: 'wedgeLump', mat: 'clay_wet', size: [0.27, 0.12, 0.2], r: 0.055, segs: q(3, 2, 1), div: [q(2, 1, 1), 1, q(2, 1, 1)], puff: { top: 0.03, side: 0.02 }, xf: xf({ pos: [-0.3, TOP + 0.058, 0.33], rot: [0, 0.35, 0.04] }) });
    // —— 切成两半的泥块、割泥线（两头木把手，钢丝软软地搭在台面上）——
    for (const [i, x, a] of [[0, -0.03, 0.05], [1, 0.1, -0.12]]) {
      k.box({ name: `clayHalf${i}`, mat: 'clay_green', size: [0.12, 0.14, 0.2], r: 0.012, segs: q(2, 1, 1), xf: xf({ pos: [x, TOP + 0.07, 0.26], rot: [0, a, 0] }) });
    }
    {
      const a = [-0.12, TOP + 0.012, 0.55], b = [0.14, TOP + 0.012, 0.6];
      for (const [i, p] of [[0, a], [1, b]]) turned(k, `toggle${i}`, [[0, -0.03], [0.009, -0.03, sm], [0.011, 0, sm], [0.009, 0.03, sm], [0, 0.03]], 'toolWood', { segs: q(10, 8, 6), place: aim([0, 0, 1], [0, 1, 0], p) });
      const wire = catmull([a, [-0.05, TOP + 0.002, 0.5], [0.04, TOP + 0.002, 0.53], [0.08, TOP + 0.002, 0.63], b], q(4, 3, 2));
      if (k.lod < 2) sw(k.sweep({ name: 'cutWire', mat: 'pottery', shape: circle(0.0012, 4), path: wire, caps: [false, false], up: [0, 1, 0] }), 'wire');
    }
    // —— 手转台：铸铁底座、铝转盘（顶面贴同心刻线），上面倒扣一只半干的碗 ——
    {
      const c = [0.36, TOP, 0.42];
      turned(k, 'bandBase', [[0, 0], [0.085, 0], [0.088, 0.006, sm], [0.07, 0.02, sm], [0.03, 0.03, sm], [0.022, 0.06], [0, 0.061]], 'black', { segs: q(20, 14, 8), place: xf({ pos: c }) });
      const plate = k.lathe({ name: 'bandTop', mat: 'pottery', segs: q(28, 18, 10), profile: profile([[0.02, 0.058], [0.118, 0.058], [0.12, 0.062, sm], [0.12, 0.072, sm], [0.116, 0.075], [0, 0.075]]) });
      mapUV(plate, (p, n) => (n[1] > 0.95 && p[1] > 0.074 ? potteryUV('turntable', 0.5 + p[0] / 0.36, 0.5 + p[2] / 0.36) : potteryUV('turntable', 0.5 + (p[0] / 0.36) * 0.95, 0.5 + (p[2] / 0.36) * 0.95)));
      plate.transform(xf({ pos: c }));
      // 倒扣的碗：绕 x 翻过来，口沿搭在转盘上
      pot(k, 'trimBowl', { shape: 'bowl', state: 'green' }, { place: xf({ pos: [c[0], TOP + 0.075 + 0.0718, c[2]], rot: [Math.PI, 0, 0] }) });
    }
    // —— 一小桶泥浆，插着一把刷子 ——
    {
      const c = [0.44, TOP, 0.13];
      turned(k, 'slipBucket', [[0, 0], [0.07, 0], [0.072, 0.004, sm], [0.082, 0.12, sm], [0.086, 0.126], [0.081, 0.129], [0.076, 0.122, sm], [0.066, 0.01, sm], [0, 0.008]], 'bucket', { segs: q(20, 14, 8), place: xf({ pos: c }) });
      turned(k, 'slip', [[0.078, 0.09], [0.04, 0.092, sm], [0, 0.093]], 'slip', { segs: q(20, 14, 8), place: xf({ pos: c }) });
      const b0 = [c[0] - 0.02, TOP + 0.07, c[2] + 0.01], b1 = [c[0] + 0.05, TOP + 0.24, c[2] + 0.06];
      rod(k, 'brushHandle', b0, b1, 0.007, 'toolWood', { segs: q(8, 6, 4) });
      sw(k.box({ name: 'brushHead', mat: 'pottery', size: [0.03, 0.05, 0.012], r: 0.004, segs: q(1, 1, 0), xf: aim([b0[0] - b1[0], b0[1] - b1[1], b0[2] - b1[2]], [1, 0, 0], [b0[0] - 0.008, b0[1] - 0.025, b0[2] - 0.003]) }), 'slip');
    }
    // —— 擀杖（中间一截粗的滚筒、两头细把手）、擀好的泥板、黄海绵 ——
    turned(k, 'rollingPin', [[0, -0.23], [0.012, -0.23, sm], [0.014, -0.18, sm], [0.018, -0.155], [0.03, -0.15], [0.03, 0.15], [0.018, 0.155], [0.014, 0.18, sm], [0.012, 0.23, sm], [0, 0.23]], 'toolWood', { segs: q(14, 10, 6), place: xf({ pos: [-0.2, TOP + 0.03, 0.6], rot: [0, 0.08, Math.PI / 2] }) });
    k.box({ name: 'slab', mat: 'clay_green', size: [0.3, 0.01, 0.22], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [-0.36, TOP + 0.005, 0.1], rot: [0, -0.1, 0] }) });
    sw(k.box({ name: 'sponge', mat: 'pottery', size: [0.07, 0.03, 0.05], r: 0.012, segs: q(2, 1, 1), puff: { top: 0.004, side: 0.003 }, xf: xf({ pos: [0.18, TOP + 0.015, 0.62], rot: [0, 0.5, 0] }) }), 'sponge');
    // —— 右后角的割泥钢丝：一根钢杆，钢丝从杆顶斜拉到台子前沿 ——
    {
      const p0 = [W / 2 - 0.05, TOP, 0.05], p1 = [W / 2 - 0.05, TOP + 0.36, 0.05], p2 = [W / 2 - 0.05, TOP + 0.005, D - 0.02];
      rod(k, 'wirePost', p0, p1, 0.011, 'steel', { segs: q(8, 6, 4) });
      if (k.lod < 2) rod(k, 'wedgeWire', [p1[0], p1[1] - 0.01, p1[2] + 0.01], p2, 0.0015, 'wire', { segs: 4, caps: [false, false] });
      turned(k, 'wireAnchor', [[0, 0], [0.012, 0], [0.012, 0.01], [0, 0.011]], 'steel', { segs: q(8, 6, 4), place: xf({ pos: [p2[0], TOP, p2[2]] }) });
    }
    // —— 下面搁板上两袋泥（正面贴袋子和标签）、一只水桶 ——
    {
      const y = 0.2 + 0.0125;
      for (const [i, x, a] of [[0, -0.36, 0.05], [1, -0.04, -0.1]]) {
        const b = k.box({ name: `clayBag${i}`, mat: 'pottery', size: [0.3, 0.15, 0.24], r: 0.03, segs: q(2, 1, 1), div: [q(3, 2, 1), 1, 1], puff: { top: 0.012, side: 0.01 } });
        mapUV(b, (p, n) => (n[2] > 0.7 ? potteryUV('clayBag', 0.5 + p[0] / 0.3, 0.5 - p[1] / 0.15) : potteryUV('clayBag', 0.06, 0.25 + 0.3 * Math.abs(n[1]))));
        b.transform(xf({ pos: [x, y + 0.075, D / 2 + 0.05], rot: [0, a, 0] }));
      }
      turned(k, 'bucket', [[0, 0], [0.1, 0], [0.102, 0.004, sm], [0.12, 0.22, sm], [0.126, 0.228], [0.121, 0.232], [0.115, 0.224, sm], [0.096, 0.012, sm], [0, 0.01]], 'bucket', { segs: q(20, 14, 8), place: xf({ pos: [0.36, y, D / 2 + 0.02] }) });
    }
  },
};
