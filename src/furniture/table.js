import { rect } from '../core/shape.js';
import { xf } from '../core/vec.js';

// 北欧橡木餐桌 1600 × 850 × 740
//   · 桌面：平面圆角 R10，上沿 3mm 圆边，下沿 30mm“刀口”斜面 —— 侧面看只剩 9mm 厚，显得轻薄
//   · 方锥腿：44 → 30mm，四条竖棱 3mm 倒角
//   · 牵条：只倒看得见的两条下棱，藏在桌面下和腿里的面全部不生成
export default {
  id: 'dining_table',
  name: '餐桌',
  nameEn: 'Oslo Dining Table',
  build(k) {
    const W = 1.6, D = 0.85, H = 0.74, T = 0.026;
    const q = (...v) => k.q(...v);

    k.extrude({
      name: 'top', mat: 'oak', axis: 'y',
      shape: rect(W, D, { r: q(0.01, 0.01, 0), segs: q(3, 2, 1) }),
      depth: T,
      bevel: [q({ w: 0.03, h: 0.014, flat: true }, { w: 0.03, h: 0.014, flat: true }, 0), q(0.003, 0.003, 0)],
      bsegs: q(2, 1, 1),
      density: { cap0: 0.6 },
      xf: xf({ pos: [0, H - T, 0] }),
    });

    const legW = 0.044, inset = 0.07;
    const lx = W / 2 - inset - legW / 2, lz = D / 2 - inset - legW / 2;
    const legH = H - T;
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      k.extrude({
        name: `leg${i}`, mat: 'oak', axis: 'y',
        shape: rect(legW, legW, { r: q(0.003, 0.003, 0) }),
        depth: legH, taper: 0.68,
        caps: [true, false],
        bevel: [q(0.002, 0, 0), 0],
        density: { cap0: 0.2 },
        xf: xf({ pos: [sx * lx, 0, sz * lz] }),
      });
    }

    // 牵条（apron）
    const aH = 0.07, aT = 0.02, setback = 0.01;
    const shape = rect(aT, aH, { corners: [q(0.002, 0.002, 0), q(0.002, 0.002, 0), 0, 0] });
    const az = lz + legW / 2 - setback - aT / 2;
    const ax = lx + legW / 2 - setback - aT / 2;
    const lenX = 2 * lx, lenZ = 2 * lz;
    for (const s of [1, -1]) {
      k.extrude({
        name: `apronX${s > 0 ? 'p' : 'n'}`, mat: 'oak', axis: 'x', center: true,
        shape, depth: lenX, caps: [false, false], grain: 'len',
        xf: xf({ pos: [0, legH - aH / 2, s * az] }),
      });
      k.extrude({
        name: `apronZ${s > 0 ? 'p' : 'n'}`, mat: 'oak', axis: 'z', center: true,
        shape, depth: lenZ, caps: [false, false], grain: 'len',
        xf: xf({ pos: [s * ax, legH - aH / 2, 0] }),
      });
    }
  },
};
