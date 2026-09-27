import { rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundLeg, knob } from './parts.js';

// 书桌：橡木 1200 × 600 × 750
//   · 桌面沿用餐桌的做法：上沿圆边 + 下沿“刀口”斜面（侧面只剩 12mm 厚）
//   · 外撇圆锥腿藏进牵条框的四角；前牵条中间嵌一个铅笔抽屉，面板凸出 3mm、黄铜小把手
//   · 桌面后沿一排小书架（两侧板 + 隔板 + 薄背板），格子里的深度全靠烘焙 AO
//   · 藏在别的部件里的面一律不生成（侧牵条两端、书架侧板底面……）
export default {
  id: 'desk',
  name: '书桌',
  nameEn: 'Atelier Writing Desk',
  build(k) {
    const q = (...v) => k.q(...v);
    const W = 1.2, D = 0.6, H = 0.75, T = 0.024;
    const topY = H - T;
    const c = q(0.002, 0.002, 0), cs = q(1, 1, 0);

    // 桌面
    k.extrude({
      name: 'top', mat: 'oak', axis: 'y',
      shape: rect(W, D, { r: q(0.02, 0.02, 0), segs: q(3, 2, 1) }),
      depth: T,
      bevel: [q({ w: 0.022, h: 0.01, flat: true }, { w: 0.022, h: 0.01, flat: true }, 0), q(0.003, 0.003, 0)],
      bsegs: q(2, 1, 1), density: { cap0: 0.5 },
      xf: xf({ pos: [0, topY, 0] }),
    });

    // 牵条框：前后通长（端头露在外面，要封口），左右夹在中间（两端藏起来）
    const aH = 0.075, aT = 0.02;
    const fx = 0.56, fz = 0.26; // 牵条框外沿
    const apron = rect(aT, aH, { corners: [c, c, 0, 0] });
    for (const s of [1, -1]) {
      k.extrude({
        name: `apronX${s > 0 ? 'F' : 'B'}`, mat: 'oak', axis: 'x', center: true,
        shape: apron, depth: 2 * fx, bevel: q(0.002, 0, 0), grain: 'len',
        density: { cap0: 0.3, cap1: 0.3 },
        xf: xf({ pos: [0, topY - aH / 2, s * (fz - aT / 2)] }),
      });
      k.extrude({
        name: `apronZ${s > 0 ? 'R' : 'L'}`, mat: 'oak', axis: 'z', center: true,
        shape: apron, depth: 2 * (fz - aT), caps: [false, false], grain: 'len',
        xf: xf({ pos: [s * (fx - aT / 2), topY - aH / 2, 0] }),
      });
    }

    // 铅笔抽屉：面板嵌在前牵条里，凸出 3mm
    const dt = 0.012, dz = fz - 0.009 + dt / 2;
    k.box({
      name: 'drawer', mat: 'oak', size: [0.44, 0.052, dt], r: c, segs: cs, omit: ['nz'], grain: 'x',
      xf: xf({ pos: [0, topY - aH / 2, dz] }),
    });
    if (k.lod < 2) {
      knob(k, { name: 'knob', mat: 'brass', d: 0.022, h: 0.02, segs: q(10, 6), pos: [0, topY - aH / 2, dz + dt / 2], rot: [Math.PI / 2, 0, 0] });
    }

    // 腿：顶端藏在牵条框四角，向外撇 6°
    const tilt = (6 * Math.PI) / 180;
    const L = topY / Math.cos(tilt) + 0.01;
    const d = (L * Math.sin(tilt)) / Math.SQRT2;
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      roundLeg(k, {
        name: `leg${i}`, mat: 'oak', r0: 0.013, r1: 0.02, h: L, segs: q(8, 6, 5),
        pos: [sx * (fx - 0.06 + d), 0, sz * (fz - 0.06 + d)],
        rot: [-tilt, Math.atan2(sx, sz), 0],
      });
    }

    // 桌面后沿的小书架
    const sh = 0.16, sd = 0.18, st = 0.018;
    const sz0 = -D / 2 + sd / 2;
    for (const s of [1, -1]) {
      k.box({
        name: `riserSide${s > 0 ? 'R' : 'L'}`, mat: 'oak', size: [st, sh, sd], r: c, segs: cs, omit: ['ny'], grain: 'y',
        xf: xf({ pos: [s * (W / 2 - 0.04 - st / 2), H + sh / 2, sz0] }),
      });
    }
    k.box({
      name: 'riserDivider', mat: 'oak', size: [st, sh, sd - 0.01], r: c, segs: cs, omit: ['ny', 'py'], grain: 'y',
      xf: xf({ pos: [-0.18, H + sh / 2, sz0 - 0.005] }),
    });
    k.box({
      name: 'riserShelf', mat: 'oak', size: [W - 0.08, st, sd], r: c, segs: q(1, 0, 0), grain: 'x',
      xf: xf({ pos: [0, H + sh + st / 2, sz0] }),
    });
    k.box({
      name: 'riserBack', mat: 'oak', size: [W - 0.08 - 2 * st, sh, 0.008], segs: 0, omit: ['px', 'nx', 'py', 'ny'], grain: 'x',
      xf: xf({ pos: [0, H + sh / 2, -D / 2 + 0.004] }),
    });
  },
};
