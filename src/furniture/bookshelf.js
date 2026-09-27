import { xf } from '../core/vec.js';

// 书架：白色烤漆框架 + 橡木层板
//   · 全部是倒角盒子（44 三角形）；层板两端插进侧板，端面直接省略
//   · 背板 + 层板之间的烘焙 AO 让“格子”有深度，不需要任何额外几何
export default {
  id: 'bookshelf',
  name: '书架',
  nameEn: 'Grid Bookshelf',
  build(k) {
    const q = (...v) => k.q(...v);
    const W = 0.9, D = 0.32, H = 1.8, T = 0.02;
    const c = q(0.002, 0.002, 0), cs = q(1, 1, 0);
    // 侧板
    for (const s of [1, -1]) {
      k.box({
        name: `side${s > 0 ? 'R' : 'L'}`, mat: 'paint', size: [T, H, D], r: c, segs: cs,
        density: { ny: 0.2 },
        xf: xf({ pos: [s * (W / 2 - T / 2), H / 2, 0] }),
      });
    }
    // 顶板
    k.box({ name: 'top', mat: 'paint', size: [W - 2 * T, T, D], r: c, segs: q(1, 0, 0), omit: ['px', 'nx'], xf: xf({ pos: [0, H - T / 2, 0] }) });
    // 踢脚
    k.box({ name: 'kick', mat: 'paint', size: [W - 2 * T, 0.07, T], r: c, segs: q(1, 0, 0), omit: ['px', 'nx', 'ny'], xf: xf({ pos: [0, 0.035, D / 2 - T / 2 - 0.015] }) });
    // 背板（薄板，不倒角）
    k.box({ name: 'backpanel', mat: 'paint', size: [W - 2 * T, H - 0.07 - T, 0.008], segs: 0, omit: ['px', 'nx', 'py', 'ny'], xf: xf({ pos: [0, (H - T + 0.07) / 2, -D / 2 + 0.004] }) });
    // 层板（橡木）
    const ys = [0.07 + T / 2, 0.44, 0.8, 1.14, 1.46];
    ys.forEach((y, i) => {
      k.box({
        name: `shelf${i}`, mat: 'oak', size: [W - 2 * T, i === 0 ? T : 0.022, D - 0.012], r: c, segs: q(1, 0, 0),
        omit: ['px', 'nx'], grain: 'x', density: { ny: i === 0 ? 0.2 : 0.6 },
        xf: xf({ pos: [0, y, 0.002] }),
      });
    });
  },
};
