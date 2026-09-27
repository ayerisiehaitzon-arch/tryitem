import { xf, smoothstep } from '../core/vec.js';
import { puffDeform } from '../prims/box.js';

// 双人床：橡木床架 + 软包床头 + 床垫 + 垂边被子 + 两个枕头
//   · 被子用“垂边”形变：两侧向下弯过床垫边缘，只需要沿 x 多几列顶点
//   · 枕头是鼓胀最大的圆角盒；全部底面省略
export default {
  id: 'bed',
  name: '双人床',
  nameEn: 'Fjord Double Bed',
  build(k) {
    const q = (...v) => k.q(...v);
    const W = 1.7, L = 2.12;
    const c = q(0.003, 0.003, 0), cs = q(1, 1, 0);
    const railY = 0.25, railH = 0.18;
    // 床架：两侧 + 床尾
    for (const s of [1, -1]) {
      k.box({
        name: `rail${s > 0 ? 'R' : 'L'}`, mat: 'oak', size: [0.05, railH, L - 0.08], r: c, segs: cs,
        grain: 'z', xf: xf({ pos: [s * (W / 2 - 0.025), railY, 0.02] }),
      });
    }
    k.box({ name: 'foot', mat: 'oak', size: [W, railH, 0.05], r: c, segs: cs, grain: 'x', xf: xf({ pos: [0, railY, L / 2 - 0.025] }) });
    // 腿（方）
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      k.box({
        name: `leg${i}`, mat: 'oak', size: [0.06, railY - railH / 2 + 0.01, 0.06], r: c, segs: cs, omit: ['py'], grain: 'y',
        xf: xf({ pos: [sx * (W / 2 - 0.03), (railY - railH / 2 + 0.01) / 2, sz * (L / 2 - 0.03)] }),
      });
    }
    // 软包床头
    const hbH = 0.72, hbT = 0.1, hbY = 0.3;
    k.box({
      name: 'headboard', mat: 'linen', size: [W + 0.04, hbH, hbT], r: q(0.045, 0.04, 0.03), segs: q(2, 1, 0),
      div: q([3, 2, 1], [1, 1, 1], [1, 1, 1]), puff: q({ sideZ: 0.022, top: 0.008 }, { sideZ: 0.014 }, null),
      xf: xf({ pos: [0, hbY + hbH / 2, -L / 2 + hbT / 2 - 0.02] }),
    });
    // 床垫
    const mH = 0.2, mTop = railY + railH / 2 + mH - 0.05;
    k.box({
      name: 'mattress', mat: 'linen_white', size: [W - 0.12, mH, L - 0.16], r: q(0.04, 0.035, 0.03), segs: q(2, 1, 0),
      omit: ['ny'], density: { py: 0.4 },
      xf: xf({ pos: [0, mTop - mH / 2, 0.03] }),
    });
    // 被子：比床垫宽，两侧垂下
    const dW = W - 0.02, dT = 0.07, dL = 1.45;
    const half = dW / 2;
    const drape = (p) => {
      const tx = smoothstep(half - 0.2, half + 0.02, Math.abs(p[0]));
      const tz = smoothstep(dL / 2 - 0.2, dL / 2 + 0.02, p[2]); // 只在床尾一端下垂
      const t = 1 - (1 - tx) * (1 - tz);
      const puff = 0.018 * (1 - (p[0] / half) ** 2) * Math.max(0, 1 - (p[2] / (dL / 2)) ** 2) * (p[1] > 0 ? 1 : 0.3);
      return [p[0] - Math.sign(p[0]) * tx * 0.025, p[1] - t * 0.13 + puff, p[2] - tz * 0.025];
    };
    const edgeNodes = q([-1, -0.9, -0.78, -0.4, 0, 0.4, 0.78, 0.9, 1], [-1, -0.82, 0, 0.82, 1], 1);
    k.box({
      name: 'duvet', mat: 'linen_white', size: [dW, dT, dL], r: q(0.03, 0.03, 0.025), segs: q(2, 1, 0),
      div: [edgeNodes, 1, q([-1, -0.5, 0, 0.5, 0.8, 0.9, 1], [-1, 0, 0.82, 1], 1)], omit: ['ny'], deform: drape,
      xf: xf({ pos: [0, mTop + dT / 2 - 0.006, L / 2 - dL / 2 - 0.05] }),
    });
    // 被子翻边
    const fold = puffDeform([dW / 2, 0.03, 0.14], { top: 0.012 });
    k.box({
      name: 'fold', mat: 'linen_white', size: [dW - 0.36, 0.05, 0.26], r: q(0.022, 0.02, 0.02), segs: q(2, 1, 0),
      div: q([2, 1, 1], [1, 1, 1], [1, 1, 1]), omit: ['ny'], deform: fold,
      xf: xf({ pos: [0, mTop + dT + 0.012, L / 2 - dL - 0.05 + 0.13] }),
    });
    // 枕头
    for (const s of [1, -1]) {
      k.box({
        name: `pillow${s > 0 ? 'R' : 'L'}`, mat: 'linen_white', size: [0.64, 0.15, 0.42], r: q(0.065, 0.06, 0.05), segs: q(3, 2, 0),
        div: q([2, 1, 2], [1, 1, 1], [1, 1, 1]), puff: q({ top: 0.035, bottom: 0.01, side: 0.012 }, { top: 0.025 }, null), omit: ['ny'],
        xf: xf({ pos: [s * 0.39, mTop + 0.075 + 0.02, -L / 2 + 0.34], rot: [-0.32, s * 0.03, 0] }),
      });
    }
  },
};
