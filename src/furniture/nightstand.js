import { xf } from '../core/vec.js';
import { roundLeg, knob } from './parts.js';

// 床头柜：胡桃木柜体 + 两个抽屉 + 黄铜把手 + 外撇锥腿（中古风）
//   · 抽屉面板是略微凸出的圆边盒子，面板之间留 4mm 缝 —— 缝里的 AO 就是“抽屉”
//   · 把手是 8 段车削体，LOD2 直接去掉
export default {
  id: 'nightstand',
  name: '床头柜',
  nameEn: 'Nordic Nightstand',
  build(k) {
    const q = (...v) => k.q(...v);
    const W = 0.5, D = 0.4, H = 0.56, legH = 0.17;
    const bodyH = H - legH;
    // 柜体
    k.box({
      name: 'body', mat: 'walnut', size: [W, bodyH, D], r: q(0.006, 0.006, 0), segs: q(1, 1, 0),
      density: { ny: 0.3 },
      xf: xf({ pos: [0, legH + bodyH / 2, 0] }),
    });
    // 抽屉面板
    const gap = 0.004, margin = 0.018;
    const fh = (bodyH - 2 * margin - gap) / 2;
    for (let i = 0; i < 2; i++) {
      const y = legH + margin + fh / 2 + i * (fh + gap);
      k.box({
        name: `drawer${i}`, mat: 'walnut', size: [W - 2 * margin, fh, 0.02], r: q(0.004, 0.003, 0), segs: q(1, 1, 0),
        omit: ['nz'], grain: 'x',
        xf: xf({ pos: [0, y, D / 2] }),
      });
      if (k.lod < 2) {
        knob(k, { name: `knob${i}`, mat: 'brass', d: 0.026, h: 0.024, segs: q(10, 6), pos: [0, y, D / 2 + 0.01], rot: [Math.PI / 2, 0, 0] });
      }
    }
    // 腿：向外撇 6°
    const tilt = (6 * Math.PI) / 180;
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      const th = Math.atan2(sx, sz);
      roundLeg(k, {
        name: `leg${i}`, mat: 'walnut', r0: 0.011, r1: 0.017, h: legH / Math.cos(tilt) + 0.01, segs: q(8, 6, 5),
        pos: [sx * (W / 2 - 0.05) + sx * 0.012, 0, sz * (D / 2 - 0.05) + sz * 0.012],
        rot: [-tilt, th, 0],
      });
    }
  },
};
