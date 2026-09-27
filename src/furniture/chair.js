import { shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { circle } from '../core/shape.js';
import { roundLeg, rod, arcBand } from './parts.js';

// 餐椅：橡木框架 + 亚麻坐垫
//   · 后腿是一根带弯折的扫掠圆杆（座面以上向后倾），弯折处圆角过渡
//   · 弧形靠背板：平面弧带挤出，上下 45° 倒角，两端包住后腿
//   · 梯形座板：前宽后窄，下沿做刀口斜面，看起来更薄更轻
//   · 坐垫：圆角盒 + 鼓胀形变，底面省略（贴在座板上看不见）
export default {
  id: 'dining_chair',
  name: '餐椅',
  nameEn: 'Oslo Dining Chair',
  build(k) {
    const q = (...v) => k.q(...v);
    const legSegs = q(8, 7, 5);
    const lx = 0.2;
    const seatY = 0.41, seatT = 0.026;

    // 前腿
    for (const s of [1, -1]) {
      roundLeg(k, { name: `fleg${s > 0 ? 'R' : 'L'}`, mat: 'oak', r0: 0.0125, r1: 0.0175, h: seatY, segs: legSegs, pos: [s * lx, 0, 0.19] });
    }
    // 后腿：地面 → 座面（略前倾）→ 顶端（后倾），弯折处倒圆
    for (const s of [1, -1]) {
      const path = roundedPath([[s * lx, 0, -0.235], [s * lx, seatY + 0.02, -0.2], [s * lx, 0.8, -0.262]], q(0.12, 0.12, 0), q(2, 2, 1));
      k.sweep({
        name: `rleg${s > 0 ? 'R' : 'L'}`, mat: 'oak',
        shape: circle(0.016, legSegs, { rx: 0.015, ry: 0.017 }),
        path, caps: [true, true], up: [0, 0, 1],
      });
    }

    // 座板（梯形，前宽 0.47，后宽 0.42，深 0.43）
    const fw = 0.235, bw = 0.21, d = 0.215, cr = q(0.035, 0.035, 0), cs = q(2, 2, 1);
    const seat = shape([
      [-fw, -d, { r: cr, segs: cs }],
      [fw, -d, { r: cr, segs: cs }],
      [bw, d, { r: cr, segs: cs }],
      [-bw, d, { r: cr, segs: cs }],
    ]);
    k.extrude({
      name: 'seat', mat: 'oak', axis: 'y', shape: seat, depth: seatT,
      bevel: [q({ w: 0.014, h: 0.01, flat: true }, { w: 0.014, h: 0.01, flat: true }, 0), q(0.003, 0.003, 0)],
      bsegs: 1, density: { cap0: 0.5 },
      xf: xf({ pos: [0, seatY, 0.0] }),
    });

    // 坐垫
    k.box({
      name: 'cushion', mat: 'linen', size: [0.41, 0.045, 0.38],
      r: q(0.02, 0.02, 0.015), segs: q(2, 1, 0), div: q([2, 1, 2], [1, 1, 1], [1, 1, 1]),
      puff: q({ top: 0.012, side: 0.004 }, { top: 0.008 }, null), omit: ['ny'],
      xf: xf({ pos: [0, seatY + seatT + 0.0225, 0.012] }),
    });

    // 弧形靠背：弧线经过两条后腿中心，中间向后拱 35mm
    const s0 = 0.035, c0 = 0.2;
    const R = (c0 * c0 + s0 * s0) / (2 * s0);
    const zBack = -0.243; // 靠背高度处后腿中心的 z
    const zc = zBack - s0 + R; // 圆心 z
    const a = Math.asin(0.228 / R);
    k.extrude({
      name: 'back', mat: 'oak', axis: 'y',
      shape: arcBand(R, 0.02, a, q(6, 4, 3), { cx: 0, cy: -zc, er: q(0.004, 0.004, 0), esegs: q(2, 1, 0) }),
      depth: 0.085, bevel: q(0.004, 0.003, 0), bsegs: 1,
      xf: xf({ pos: [0, 0.665, 0] }),
    });

    // 横撑（H 形）
    if (k.lod < 2) {
      const ry = 0.15, rr = 0.0085, rs = q(6, 5);
      for (const s of [1, -1]) {
        rod(k, { name: `stretch${s > 0 ? 'R' : 'L'}`, mat: 'oak', a: [s * lx, ry, 0.19], b: [s * lx, ry, -0.222], r: rr, segs: rs });
      }
      rod(k, { name: 'stretchX', mat: 'oak', a: [-lx, ry, -0.01], b: [lx, ry, -0.01], r: rr, segs: rs });
    }
  },
};
