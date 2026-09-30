import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { mechUV } from '../materials/atlas.js';
import { sw, rod, turned, mapUV, frame, ccw } from './parts.js';

// 立柱砂轮机：圆铸铁底座、一根立柱、顶上一块托板，托板上一台双头砂轮机 —— 左边一片灰色的粗砂轮、右边一片白色的细砂轮，
// 各有一个 C 形的防护罩（前上方开口）、一块托刀板、一块挡火花的钢片和一片透明的护目挡板；
// 电机正面一块铭牌，底座前面一个开关（绿开红停）；立柱上挂着一只蘸水冷却的小水杯。
// 原点在底座正下方的地面，正面（托刀板那边）朝 +z。
const AX = { y: 0.93 }, WX = 0.14, WR = 0.075, WW = 0.025;
const OPEN = [(-30 * Math.PI) / 180, (70 * Math.PI) / 180];   // 防护罩前面开口的角度（从 +z 往上量）
const sm = { smooth: true };

export default {
  id: 'bench_grinder',
  name: '砂轮机',
  nameEn: 'Pedestal Bench Grinder',
  category: 'machine',
  aoDensity: 280,
  shadow: { margin: 0.12, maxDist: 0.6, density: 120 },
  view: { el: 12, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const HT = 'hammertone';
    // —— 立柱：圆底座、立柱、托板、水杯 ——
    turned(k, 'base', [[0, 0], [0.19, 0], [0.19, 0.02], [0.17, 0.03, sm], [0.08, 0.045, sm], [0.055, 0.06], [0, 0.061]], null, { segs: q(24, 16, 10), mat: HT });
    turned(k, 'column', [[0.045, 0.06], [0.045, 0.8]], null, { segs: q(16, 12, 8), mat: HT });
    k.box({ name: 'plate', mat: HT, size: [0.28, 0.014, 0.22], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [0, 0.807, 0] }) });
    sw(turned(k, 'pot', [[0, 0], [0.045, 0], [0.048, 0.01, sm], [0.05, 0.1], [0.046, 0.1], [0.044, 0.012, sm], [0, 0.008]], null, { segs: q(16, 12, 8), place: xf({ pos: [0, 0.46, 0.11] }) }), 'steel');
    sw(k.box({ name: 'potClamp', mat: 'mech', size: [0.03, 0.03, 0.03], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [0, 0.54, 0.058] }) }), 'steel');

    // —— 砂轮机：底座、电机（沿 x）、轴 ——
    k.box({ name: 'motorBase', mat: HT, size: [0.16, 0.03, 0.14], r: 0.008, segs: q(2, 1, 1), xf: xf({ pos: [0, 0.829, 0] }) });
    k.box({ name: 'motorNeck', mat: HT, size: [0.1, 0.04, 0.08], r: 0.008, segs: q(2, 1, 1), xf: xf({ pos: [0, 0.86, 0] }) });
    turned(k, 'motor', [[0.03, -0.11], [0.06, -0.108, sm], [0.072, -0.095, sm], [0.075, -0.07, sm], [0.075, 0.07, sm], [0.072, 0.095, sm], [0.06, 0.108, sm], [0.03, 0.11]], null, { segs: q(20, 14, 10), mat: HT, place: xf({ pos: [0, AX.y, 0], rot: [0, 0, -Math.PI / 2] }) });
    rod(k, 'shaft', [-WX - 0.03, AX.y, 0], [WX + 0.03, AX.y, 0], 0.008, 'bright', { segs: q(8, 6, 4) });
    // 电机正面的铭牌、底座前面的开关
    const plate = (name, region, w, h, pos) => {
      const b = k.box({ name, mat: 'mech', size: [w, h, 0.002], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos }) });
      return mapUV(b, (p) => mechUV(region, (p[0] - pos[0]) / w + 0.5, 0.5 - (p[1] - pos[1]) / h));
    };
    plate('maker', 'maker', 0.08, 0.04, [0, AX.y, 0.0755]);
    plate('switchPlate', 'switches', 0.07, 0.035, [0, 0.829, 0.0715]);
    for (const [i, dx, c] of [[0, -0.0175, 'green'], [1, 0.0175, 'knobRed']]) {
      turned(k, `button${i}`, [[0, 0], [0.007, 0], [0.007, 0.006, sm], [0.005, 0.009, sm], [0, 0.01]], c, { segs: q(10, 8, 6), place: xf({ pos: [dx, 0.8255, 0.0725], rot: [Math.PI / 2, 0, 0] }) });
    }

    // —— 两片砂轮和它们的防护罩、托刀板、挡火花片、护目挡板 ——
    for (const [s, region] of [[-1, 'wheelGray'], [1, 'wheelWhite']]) {
      const tag = s > 0 ? 'R' : 'L', x = s * WX;
      const wheel = k.lathe({ name: `wheel${tag}`, mat: 'mech', segs: q(28, 18, 10), profile: profile([[0.009, -WW / 2], [WR, -WW / 2], [WR, WW / 2], [0.009, WW / 2]]) });
      // 端面：朝 -y（局部）的那一面左右镜像，两片砂轮的外侧端面从外面看纸标都是正的（砂轮会转，字的方向无所谓，但不能是反字）
      wheel.T = wheel.T.map((t, i) => (Math.abs(wheel.N[i][1]) > 0.9 ? mechUV(region, 0.5 + Math.sign(wheel.N[i][1]) * t[0] / 0.2, 0.5 + t[1] / 0.2) : mechUV(region, 0.08, 0.08)));
      wheel.transform(xf({ pos: [x, AX.y, 0], rot: [0, 0, -Math.PI / 2] }));
      turned(k, `flange${tag}`, [[0.009, 0], [0.026, 0], [0.026, 0.004], [0.012, 0.008], [0.009, 0.014], [0, 0.015]], 'bright', { segs: q(12, 8, 6), place: xf({ pos: [x + s * WW / 2, AX.y, 0], rot: [0, 0, -s * Math.PI / 2] }) });
      // 防护罩：C 形的外圈（环形扇区沿 x 挤出）+ 外侧一块扇形盖板；开口在前上方
      const n = q(16, 10, 6), [a0, a1] = [OPEN[1], OPEN[0] + 2 * Math.PI];
      const arc = (r) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [-r * Math.cos(a), r * Math.sin(a)]; });
      const outer = arc(0.093), inner = arc(0.086).reverse();
      const band = [...outer.map(([X, Yy]) => [X, Yy, sm]), ...inner.map(([X, Yy]) => [X, Yy, sm])];
      band[0][2] = {}; band[n][2] = {}; band[n + 1][2] = {}; band[band.length - 1][2] = {};
      k.extrude({ name: `guard${tag}`, mat: HT, shape: shape(ccw(band)), depth: 0.05, axis: 'x', xf: xf({ pos: [x - 0.025, AX.y, 0] }) });
      const sector = [[0, 0, {}], ...outer.map(([X, Yy], i) => [X, Yy, i === 0 || i === n ? {} : sm])];
      k.extrude({ name: `guardCap${tag}`, mat: HT, shape: shape(ccw(sector)), depth: 0.005, axis: 'x', xf: xf({ pos: [s > 0 ? x + 0.025 : x - 0.03, AX.y, 0] }) });
      // 托刀板：砂轮前面、略低于轴心，一块立着的支架连到防护罩底下
      sw(k.box({ name: `rest${tag}`, mat: 'mech', size: [0.045, 0.006, 0.04], r: 0.0015, segs: q(1, 1, 0), xf: xf({ pos: [x, AX.y - 0.012, WR + 0.026] }) }), 'steel');
      sw(k.box({ name: `restArm${tag}`, mat: 'mech', size: [0.02, 0.07, 0.005], r: 0.0015, segs: q(1, 1, 0), xf: xf({ pos: [x, AX.y - 0.05, WR + 0.044], rot: [0.35, 0, 0] }) }), 'steel');
      // 挡火花片（开口上沿）和护目挡板
      const top = [0.093 * Math.cos(OPEN[1]), 0.093 * Math.sin(OPEN[1])];
      sw(k.box({ name: `spark${tag}`, mat: 'mech', size: [0.048, 0.004, 0.03], r: 0.0015, segs: q(1, 1, 0), xf: xf({ pos: [x, AX.y + top[1] - 0.004, top[0] + 0.01], rot: [0.5, 0, 0] }) }), 'steel');
      if (k.lod < 2) {
        rod(k, `shieldArm${tag}`, [x + s * 0.028, AX.y + 0.07, -0.01], [x + s * 0.028, AX.y + 0.105, 0.06], 0.004, 'steel', { segs: q(6, 5, 4) });
        k.box({ name: `shield${tag}`, mat: 'bar_glass', size: [0.075, 0.06, 0.003], r: 0.0015, segs: q(1, 1, 0), xf: xf({ pos: [x, AX.y + 0.11, 0.085], rot: [-0.6, 0, 0] }) });
      }
    }
  },
};
