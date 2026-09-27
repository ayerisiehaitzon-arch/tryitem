import { xf } from '../core/vec.js';
import { roundLeg } from './parts.js';

// 三人沙发：圈绒面料 + 胡桃木短腿
//   · 所有软体都是“圆角盒 + 鼓胀形变”：坐垫顶面拱起、侧面微凸，靠垫前后鼓
//   · 只有需要鼓起来的方向才加细分（坐垫 2×1×2，靠垫 2×2×1）
//   · 坐垫/扶手/靠背的底面贴在底座上，全部省略
export default {
  id: 'sofa',
  name: '三人沙发',
  nameEn: 'Cumulus 3-Seat Sofa',
  build(k) {
    const q = (...v) => k.q(...v);
    const W = 2.1, D = 0.9;
    const legH = 0.1, baseH = 0.22, baseTop = legH + baseH;
    const armW = 0.2;
    const inner = W - 2 * armW;
    const segs = q(2, 1, 0);
    const soft = q(3, 2, 0); // 大圆角软体：LOD0 用 3 段，轮廓更圆

    // 腿
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      roundLeg(k, {
        name: `leg${i}`, mat: 'walnut', r0: 0.013, r1: 0.019, h: legH + 0.01, segs: q(8, 6, 5),
        pos: [sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.09)],
      });
    }
    // 底座
    k.box({
      name: 'base', mat: 'boucle', size: [W, baseH, D], r: q(0.03, 0.03, 0.02), segs,
      density: { ny: 0.3 },
      xf: xf({ pos: [0, legH + baseH / 2, 0] }),
    });
    // 扶手
    const armH = 0.34;
    for (const s of [1, -1]) {
      k.box({
        name: `arm${s > 0 ? 'R' : 'L'}`, mat: 'boucle', size: [armW, armH, D], r: q(0.07, 0.06, 0.05), segs: soft,
        div: q([1, 1, 2], [1, 1, 1], [1, 1, 1]), puff: q({ top: 0.012, side: 0.006 }, { top: 0.01 }, null), omit: ['ny'],
        xf: xf({ pos: [s * (W / 2 - armW / 2), baseTop + armH / 2, 0] }),
      });
    }
    // 靠背
    const backH = 0.37, backD = 0.2;
    k.box({
      name: 'back', mat: 'boucle', size: [inner + 0.02, backH, backD], r: q(0.05, 0.05, 0.04), segs,
      omit: ['ny'],
      xf: xf({ pos: [0, baseTop + backH / 2, -D / 2 + backD / 2] }),
    });
    // 三个坐垫
    const cw = inner / 3 - 0.006, cH = 0.16, cD = D - backD - 0.02;
    for (let i = 0; i < 3; i++) {
      k.box({
        name: `seat${i}`, mat: 'boucle', size: [cw, cH, cD], r: q(0.055, 0.05, 0.04), segs: soft,
        div: q([2, 1, 2], [1, 1, 1], [1, 1, 1]), puff: q({ top: 0.022, side: 0.009 }, { top: 0.016 }, null), omit: ['ny'],
        xf: xf({ pos: [(i - 1) * (inner / 3), baseTop + cH / 2, D / 2 - cD / 2 - 0.005] }),
      });
    }
    // 三个靠垫：向后倾 12°，底边落在坐垫后缘
    const bh = 0.4, bd = 0.17, tilt = (12 * Math.PI) / 180;
    for (let i = 0; i < 3; i++) {
      const y = baseTop + cH + bh / 2 - 0.01;
      k.box({
        name: `pillow${i}`, mat: 'boucle', size: [cw, bh, bd], r: q(0.06, 0.055, 0.045), segs: soft,
        div: q([2, 2, 1], [1, 1, 1], [1, 1, 1]), puff: q({ top: 0.01, sideZ: 0.024, sideX: 0.006 }, { sideZ: 0.016 }, null),
        omit: ['ny'],
        xf: xf({ pos: [(i - 1) * (inner / 3), y, -D / 2 + backD + bd / 2 - 0.035 + Math.sin(tilt) * bh * 0.5], rot: [-tilt, 0, 0] }),
      });
    }
  },
};
