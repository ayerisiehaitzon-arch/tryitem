import { rect } from '../core/shape.js';
import { xf } from '../core/vec.js';

// 阳台栏杆：2m 一个模块（和墙、地板同一个网格），首尾相接就是一整排
//   · 原点在模块中点的地面上，栏杆沿 x 走（x ∈ [-1, 1]），高 1.05m；
//   · 黑色粉末喷涂钢：上下两根扁钢横档 + 18 根 14mm 方钢立杆（间距 11cm，小孩钻不过去）；
//     两头各是半根立柱（2cm）—— 两个模块拼在一起正好是一根 4cm 的柱；
//   · 扶手是柚木：圆角矩形截面沿 x 挤出，两头各缩 0.5mm（和隔壁模块的扶手之间留一道发丝缝）。
const L = 2, H = 1.05;
const HAND = { w: 0.066, t: 0.04 };
const BAR = 0.014, N = 18, GAP = 0.0005;

export const railing = {
  id: 'railing',
  name: '阳台栏杆',
  nameEn: 'Steel & Teak Balcony Railing',
  category: 'architecture',
  aoDensity: 90,
  shadow: { margin: 0.18, maxDist: 0.5, density: 60, strength: 0.6 },
  view: { el: 14, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const top = H - HAND.t;
    // 扶手
    k.extrude({
      name: 'handrail', mat: 'teak', shape: rect(HAND.w, HAND.t, { r: q(0.012, 0.01, 0.006), segs: q(2, 1, 1) }),
      depth: L - 2 * GAP, axis: 'x', density: { cap0: 0.2, cap1: 0.2 },
      xf: xf({ pos: [-L / 2 + GAP, top + HAND.t / 2, 0] }),
    });
    // 上下扁钢横档（两头顶在半根立柱上）
    const rail = (name, y, h) => k.box({
      name, mat: 'steel', size: [L - 0.04, h, 0.04], segs: 0, omit: ['px', 'nx'], grain: 'x',
      xf: xf({ pos: [0, y, 0] }),
    });
    rail('railTop', top - 0.005, 0.01);
    rail('railLow', 0.095, 0.01);
    // 半根立柱
    for (const s of [-1, 1]) {
      k.box({
        name: `post${s > 0 ? 'R' : 'L'}`, mat: 'steel', size: [0.02, top, 0.04], segs: 0, omit: ['ny', 'py', s > 0 ? 'px' : 'nx'],
        xf: xf({ pos: [s * (L / 2 - 0.01), top / 2, 0] }),
      });
    }
    // 立杆：两头插进上下横档（端面不生成）；LOD2 隔一根留一根
    const span = L - 0.04 - 0.11;
    for (let i = 0; i < N; i++) {
      if (k.lod === 2 && i % 2) continue;
      const x = -span / 2 + (span * i) / (N - 1);
      k.box({
        name: `bar${i}`, mat: 'steel', size: [BAR, top - 0.11, BAR], segs: 0, omit: ['py', 'ny'], density: { px: 0.4, nx: 0.4, pz: 0.4, nz: 0.4 },
        xf: xf({ pos: [x, 0.1 + (top - 0.11) / 2, 0] }),
      });
    }
  },
};
