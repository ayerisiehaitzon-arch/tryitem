import { rect, shape } from '../core/shape.js';
import { xf } from '../core/vec.js';

// 休闲扶手椅：胡桃木框架 + 植鞣皮坐垫 / 靠垫
//   · 宽扶手板：平面上前端大圆角，上沿圆边
//   · 方锥腿只倒四条竖棱；横档只倒看得见的下棱
//   · 靠背两根斜立柱 + 顶横梁，皮靠垫斜靠其上
// 扶手板平面：前端两个大圆角（4 段），后端小倒角（1 段）
function shapeArm(q) {
  const w = 0.0375, l = 0.39;
  const big = { r: q(0.035, 0.03, 0.02), segs: q(4, 3, 1) };
  const small = { r: q(0.01, 0.01, 0), segs: 1 };
  // shape 空间 y → 世界 -z：y 负的一端是前端
  return shape([[-w, -l, big], [w, -l, big], [w, l, small], [-w, l, small]]);
}

export default {
  id: 'armchair',
  name: '皮扶手椅',
  nameEn: 'Hygge Lounge Chair',
  build(k) {
    const q = (...v) => k.q(...v);
    const W = 0.74, D = 0.8;
    const sx = W / 2 - 0.03; // 侧框中心
    const seatY = 0.36, armY = 0.56;
    const chamf = q(0.003, 0.003, 0);

    for (const s of [1, -1]) {
      const side = s > 0 ? 'R' : 'L';
      // 前腿（到扶手底）
      k.extrude({
        name: `fleg${side}`, mat: 'walnut', axis: 'y', shape: rect(0.042, 0.042, { r: chamf }),
        depth: armY, taper: 0.75, caps: [true, false], bevel: [q(0.002, 0, 0), 0],
        density: { cap0: 0.2 },
        xf: xf({ pos: [s * sx, 0, D / 2 - 0.07] }),
      });
      // 后腿（到扶手底）
      k.extrude({
        name: `rleg${side}`, mat: 'walnut', axis: 'y', shape: rect(0.042, 0.042, { r: chamf }),
        depth: armY, taper: 0.75, caps: [true, false], bevel: [q(0.002, 0, 0), 0],
        density: { cap0: 0.2 },
        xf: xf({ pos: [s * sx, 0, -D / 2 + 0.12] }),
      });
      // 扶手板：前端大圆角
      k.extrude({
        name: `arm${side}`, mat: 'walnut', axis: 'y',
        shape: shapeArm(q),
        depth: 0.026, bevel: [q(0.003, 0.003, 0), q(0.005, 0.004, 0)], bsegs: 1,
        xf: xf({ pos: [s * sx, armY, -0.01] }),
      });
      // 侧横档（座面下）
      const zf = D / 2 - 0.07, zb = -D / 2 + 0.12;
      k.extrude({
        name: `srail${side}`, mat: 'walnut', axis: 'z', center: true,
        shape: rect(0.024, 0.06, { corners: [chamf, chamf, 0, 0] }), depth: zf - zb, caps: [false, false], grain: 'len',
        xf: xf({ pos: [s * sx, seatY - 0.075, (zf + zb) / 2] }),
      });
    }
    // 前后横档
    for (const [nm, z] of [['frail', D / 2 - 0.07], ['brail', -D / 2 + 0.12]]) {
      k.extrude({
        name: nm, mat: 'walnut', axis: 'x', center: true,
        shape: rect(0.024, 0.06, { corners: [chamf, chamf, 0, 0] }), depth: 2 * sx, caps: [false, false], grain: 'len',
        xf: xf({ pos: [0, seatY - 0.075, z] }),
      });
    }
    // 靠背立柱（后倾 16°）+ 顶横梁
    const tilt = (16 * Math.PI) / 180;
    const postH = 0.46;
    const px = sx - 0.05;
    const base = [0, armY - 0.2, -D / 2 + 0.1];
    for (const s of [1, -1]) {
      k.extrude({
        name: `post${s > 0 ? 'R' : 'L'}`, mat: 'walnut', axis: 'y', shape: rect(0.03, 0.036, { r: chamf }),
        depth: postH, caps: [false, true], bevel: [0, q(0.004, 0.003, 0)],
        xf: xf({ pos: [s * px, base[1], base[2]], rot: [-tilt, 0, 0] }),
      });
    }
    const topY = base[1] + Math.cos(tilt) * (postH - 0.03), topZ = base[2] - Math.sin(tilt) * (postH - 0.03);
    k.extrude({
      name: 'toprail', mat: 'walnut', axis: 'x', center: true,
      shape: rect(0.03, 0.05, { r: q(0.006, 0.005, 0), segs: q(2, 1, 0) }), depth: 2 * px + 0.04,
      bevel: q(0.004, 0.003, 0), grain: 'len',
      xf: xf({ pos: [0, topY, topZ], rot: [-tilt, 0, 0] }),
    });

    // 皮坐垫
    const cw = 2 * sx - 0.05;
    k.box({
      name: 'seat', mat: 'leather', size: [cw, 0.11, 0.6], r: q(0.035, 0.03, 0.025), segs: q(3, 2, 0),
      div: q([2, 1, 2], [1, 1, 1], [1, 1, 1]), puff: q({ top: 0.016, side: 0.006 }, { top: 0.012 }, null), omit: ['ny'],
      xf: xf({ pos: [0, seatY + 0.055 - 0.02, 0.04] }),
    });
    // 座面承托板（被坐垫盖住，只露边）
    k.box({
      name: 'deck', mat: 'walnut', size: [2 * sx, 0.018, D - 0.19], r: 0.002, segs: q(1, 1, 0), omit: ['py'],
      density: { ny: 0.3 },
      xf: xf({ pos: [0, seatY - 0.036, -0.025] }),
    });
    // 皮靠垫：斜靠在立柱上
    const bh = 0.44, bt = 0.1;
    k.box({
      name: 'backcushion', mat: 'leather', size: [cw - 0.02, bh, bt], r: q(0.035, 0.03, 0.025), segs: q(3, 2, 0),
      div: q([2, 2, 1], [1, 1, 1], [1, 1, 1]), puff: q({ sideZ: 0.018, top: 0.006 }, { sideZ: 0.012 }, null),
      xf: xf({ pos: [0, seatY + 0.06 + Math.cos(tilt) * bh / 2, -D / 2 + 0.2 - Math.sin(tilt) * bh / 2 + 0.01], rot: [-tilt, 0, 0] }),
    });
  },
};
