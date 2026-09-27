import { circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';

// C 型边几：黑色钢管双 C 架 + 圆形橡木台面。底下的横管贴地，可以推进沙发底下，台面悬在坐垫上方。
//   · 两根 C 形钢管各是一条扫掠路径（两个 4cm 圆角弯），前端封口；地上、台面下各一根横撑；
//   · 台面用圆形截面挤出（不是车削）：顶面的木纹是直的，像一块真正的拼板，而不是一圈圈同心圆；
//     上沿一道圆角倒边，下沿不倒（看不见）
const TOP = { r: 0.21, t: 0.022, y: 0.56 };
const TUBE = 0.0085; // 钢管半径
const SPAN = 0.13; // 两根 C 管到中线的距离

export default {
  id: 'side_table',
  name: '边几',
  nameEn: 'C Side Table',
  aoDensity: 160,
  shadow: { margin: 0.12 },
  build(k) {
    const q = (...v) => k.q(...v);
    // 台面
    k.extrude({
      name: 'top', mat: 'oak', axis: 'y', shape: circle(TOP.r, q(28, 20, 12)), depth: TOP.t,
      bevel: [0, q(0.005, 0.004, 0)], bsegs: q(2, 1, 1), grain: 'across', density: { cap0: 0.4 },
      xf: xf({ pos: [0, TOP.y - TOP.t, 0] }),
    });
    // 两根 C 管：台面下前伸 → 后面立柱 → 地上前伸
    const yTop = TOP.y - TOP.t - TUBE, yLow = TUBE + 0.002;
    const zF = 0.15, zB = -0.19, zFloor = 0.2;
    for (const s of [-1, 1]) {
      const x = s * SPAN;
      k.sweep({
        name: `c${s > 0 ? 'R' : 'L'}`, mat: 'steel', shape: circle(TUBE, q(7, 6, 5)), up: [1, 0, 0], caps: [true, true],
        path: roundedPath([[x, yTop, zF], [x, yTop, zB], [x, yLow, zB], [x, yLow, zFloor]], 0.045, q(3, 2, 1)),
      });
    }
    // 横撑：台面下前端一根、地上前端一根、立柱中部一根
    const bar = (name, y, z) => k.sweep({
      name, mat: 'steel', shape: circle(TUBE * 0.85, q(7, 5, 4)), up: [0, 1, 0], caps: [false, false],
      path: [[-SPAN, y, z], [SPAN, y, z]],
    });
    bar('barTop', yTop, zF - 0.03);
    bar('barLow', yLow, zFloor - 0.03);
    if (k.lod < 2) bar('barMid', TOP.y * 0.45, zB);
  },
};
