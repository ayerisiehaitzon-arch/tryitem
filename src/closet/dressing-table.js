import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundLeg, knob } from '../furniture/parts.js';
import { perfume, tray, budVase, lipstick, compact } from './trinkets.js';

// 梳妆台：胡桃木桌（三个抽屉、黄铜小圆钮，四条外撇锥腿套黄铜脚套）+ 墙上一面“好莱坞”化妆镜 + 一只圈绒圆凳。
//   · 镜子：胡桃木宽框、里面一圈黄铜细线，框上一圈磨砂球泡（左右各 4 颗、顶上 3 颗，黄铜灯座）；
//     灯泡照亮镜子周围的墙：烘一张墙面上的光斑贴图（被镜框挡住的地方是暗的，光从镜框外沿漫出来）；
//   · 圆凳：圈绒坐垫、黄铜细腿、腿之间一圈黄铜细环；一半塞在桌面底下；
//   · 桌面上：金色椭圆托盘上三瓶香水（方瓶琥珀色、扁圆瓶粉色、细长瓶琥珀色——瓶身是透明玻璃，看得见里面的香水），
//     一只插着一枝花的瓷瓶，一支打开的口红、一个玫瑰金粉饼盒。
// 原点在墙根、宽度中点（z = 0 是墙面，y = 0 是地面）
const W = 1.1, D = 0.46, H = 0.76, TOP = 0.026, Z0 = 0.015;
const APRON = 0.11;
const MIR = { w: 0.6, h: 0.8, y0: 1.04, frame: 0.075, depth: 0.036 };
const BULB_R = 0.026;

// 镜框上灯泡的位置（球心）：左右两根竖框各 4 颗，顶框 3 颗
export const VANITY_BULBS = (() => {
  const out = [];
  const xs = MIR.w / 2 + MIR.frame / 2, z = MIR.depth + 0.012 + BULB_R;
  for (let i = 0; i < 4; i++) {
    const y = MIR.y0 + 0.08 + (i * (MIR.h - 0.12)) / 3;
    out.push([-xs, y, z], [xs, y, z]);
  }
  for (const x of [-0.2, 0, 0.2]) out.push([x, MIR.y0 + MIR.h + MIR.frame / 2, z]);
  return out;
})();

export default {
  id: 'dressing_table',
  name: '梳妆台',
  nameEn: 'Walnut Vanity with Hollywood Mirror',
  category: 'closet',
  planes: ['floor', 'wall'],
  aoDensity: 150,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.45, density: 80 },
    wall: { margin: 0.12, maxDist: 0.3, density: 60, strength: 0.6 },
  },
  // 灯泡照在镜子周围的墙上（三条线光源：左右两列、顶上一排）
  glow: {
    plane: 'wall',
    lights: (() => {
      const b = VANITY_BULBS, L = b.filter((p) => p[0] < -0.1 && p[1] < MIR.y0 + MIR.h), R = b.filter((p) => p[0] > 0.1 && p[1] < MIR.y0 + MIR.h), T = b.filter((p) => p[1] > MIR.y0 + MIR.h);
      return [
        { a: L[0], b: L[L.length - 1], power: 4 }, { a: R[0], b: R[R.length - 1], power: 4 }, { a: T[0], b: T[T.length - 1], power: 3 },
      ];
    })(),
    rect: { u0: -0.78, u1: 0.78, v0: MIR.y0 - 0.3, v1: MIR.y0 + MIR.h + MIR.frame + 0.34 },
    fade: [0.2, 0.2, 0.16, 0.2],
    density: 80, samples: 132, strength: 0.62, gamma: 0.9,
  },
  view: { el: 10, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const zc = Z0 + D / 2;
    // —— 桌面：四周小圆边 ——
    k.box({
      name: 'top', mat: 'walnut', size: [W, TOP, D], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), grain: 'x',
      omit: ['nz'], density: { ny: 0.3 },
      xf: xf({ pos: [0, H - TOP / 2, zc] }),
    });
    // —— 抽屉层：箱体（侧面、背面看得见一点）+ 三个抽屉面板（凸出 4mm）+ 黄铜小圆钮 ——
    const ay = H - TOP - APRON / 2, aw = W - 0.05, ad = D - 0.04;
    k.box({
      name: 'apron', mat: 'walnut', size: [aw, APRON, ad], r: q(0.002, 0), segs: q(1, 0), grain: 'x',
      omit: ['py', 'nz'], density: { ny: 0.4 },
      xf: xf({ pos: [0, ay, Z0 + 0.01 + ad / 2] }),
    });
    const fz = Z0 + 0.01 + ad + 0.009;
    const widths = [0.29, 0.43, 0.29], gap = 0.004;
    let x = -(widths.reduce((a, b) => a + b, 0) + gap * 2) / 2;
    widths.forEach((w, i) => {
      const cx = x + w / 2;
      k.box({
        name: `drawer${i}`, mat: 'walnut', size: [w, APRON - 0.014, 0.02], r: q(0.002, 0.0015, 0), segs: q(1, 1, 0), grain: 'x',
        omit: ['nz'], xf: xf({ pos: [cx, ay, fz - 0.01] }),
      });
      if (k.lod < 2) knob(k, { name: `knob${i}`, mat: 'brass', d: 0.022, h: 0.02, segs: q(7, 5), pos: [cx, ay, fz], rot: [Math.PI / 2, 0, 0] });
      x += w + gap;
    });
    // —— 四条外撇锥腿（黄铜脚套）——
    const legH = H - TOP - APRON, tilt = (5 * Math.PI) / 180;
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      roundLeg(k, {
        name: `leg${i}`, mat: 'walnut', r0: 0.012, r1: 0.02, h: legH / Math.cos(tilt) + 0.01, segs: q(8, 6, 5), sabot: { mat: 'brass', h: 0.04 },
        pos: [sx * (aw / 2 - 0.035) + sx * 0.02, 0, zc + sz * (ad / 2 - 0.035) + sz * 0.02],
        rot: [-tilt, Math.atan2(sx, sz), 0],
      });
    }

    // —— 镜子：胡桃木宽框 + 黄铜内线 + 银镜 ——
    const { w: mw, h: mh, y0, frame: f, depth: fd } = MIR;
    const cy = y0 + mh / 2;
    for (const s of [-1, 1]) {
      k.box({
        name: `stile${s > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [f, mh + 2 * f, fd], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), grain: 'y',
        omit: ['nz'], xf: xf({ pos: [s * (mw / 2 + f / 2), cy, fd / 2] }),
      });
      k.box({
        name: `rail${s > 0 ? 'T' : 'B'}`, mat: 'walnut', size: [mw, f, fd - 0.004], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), grain: 'x',
        omit: ['nz', 'px', 'nx'], xf: xf({ pos: [0, cy + s * (mh / 2 + f / 2), (fd - 0.004) / 2] }),
      });
    }
    k.box({
      name: 'mirror', mat: 'mirror', size: [mw, mh, 0.004], segs: 0,
      omit: ['nz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos: [0, cy, fd - 0.014] }),
    });
    if (k.lod < 2) {
      const e = 0.003;
      k.sweep({
        name: 'bead', mat: 'brass', shape: circle(0.004, q(5, 4)), closed: true, caps: [false, false], up: [0, 0, 1],
        path: [[-mw / 2 + e, y0 + e, fd - 0.01], [mw / 2 - e, y0 + e, fd - 0.01], [mw / 2 - e, y0 + mh - e, fd - 0.01], [-mw / 2 + e, y0 + mh - e, fd - 0.01]],
      });
    }
    // 球泡：黄铜灯座（贴在镜框正面）+ 磨砂球
    VANITY_BULBS.forEach((p, i) => {
      const place = xf({ pos: [p[0], p[1], fd], rot: [Math.PI / 2, 0, 0] });
      if (k.lod < 2) {
        k.lathe({
          name: `socket${i}`, mat: 'brass', segs: q(7, 5),
          profile: profile([[0.016, 0], [0.011, 0.005], [0.011, 0.013]]), xf: place,
        });
      }
      // 球泡自发光、明暗是平的，看得出来的只有轮廓：圆周分段多一点、沿轮廓只分两段
      k.lathe({
        name: `bulb${i}`, mat: 'bulb', segs: q(12, 8, 6),
        profile: profile([[0.008, 0.012], [BULB_R, 0.012 + BULB_R, { smooth: true }], [0, 0.012 + BULB_R * 2]]),
        xf: place,
      });
    });

    // —— 圆凳：圈绒坐垫 + 黄铜细腿 + 一圈黄铜细环 ——
    const stool = xf({ pos: [0.06, 0, Z0 + D + 0.12], rot: [0, 0.3, 0] });
    const SH = 0.46, R = 0.19;
    k.lathe({
      name: 'seat', mat: 'boucle', segs: q(16, 12, 8),
      profile: profile([
        [0, SH - 0.075], [R - 0.012, SH - 0.075, { r: q(0.012, 0.008, 0), segs: q(2, 1, 1) }], [R, SH - 0.035, { r: q(0.02, 0.012, 0), segs: q(2, 1, 1) }],
        [R * 0.6, SH - 0.002, { smooth: true }], [0, SH],
      ]),
      xf: stool,
    });
    k.lathe({ name: 'pan', mat: 'brass', segs: q(16, 12, 8), profile: profile([[R - 0.03, SH - 0.09], [R - 0.022, SH - 0.078]]), xf: stool });
    const lt = (7 * Math.PI) / 180, lh = SH - 0.085;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const rb = R - 0.05 + lh * Math.tan(lt);
      roundLeg(k, {
        name: `stoolLeg${i}`, mat: 'brass', r0: 0.0065, r1: 0.009, h: lh / Math.cos(lt), segs: q(7, 5, 4),
        pos: stool.apply([Math.sin(a) * rb, 0, Math.cos(a) * rb]), rot: [-lt, a + 0.3, 0],
      });
    }
    if (k.lod < 2) {
      const yr = 0.16, rr = R - 0.05 + (lh - yr) * Math.tan(lt);
      const n = q(14, 10);
      k.sweep({
        name: 'stoolRing', mat: 'brass', shape: circle(0.004, 4), closed: true, caps: [false, false],
        path: Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return stool.apply([Math.sin(a) * rr, yr, Math.cos(a) * rr]); }),
      });
    }

    // —— 桌面上的东西 ——
    const ty = H;
    tray(k, { name: 'tray', r: 0.15, ratio: 0.64, place: xf({ pos: [-0.3, ty, zc - 0.02], rot: [0, 0.08, 0] }) });
    const tp = (x, z, rot = 0) => xf({ pos: [-0.3 + x, ty + 0.004, zc - 0.02 + z], rot: [0, rot, 0] });
    perfume(k, { name: 'perfumeA', kind: 'square', liquid: 'amber', place: tp(-0.055, -0.012, 0.25) });
    perfume(k, { name: 'perfumeB', kind: 'round', liquid: 'rose', place: tp(0.035, 0.022, 0) });
    perfume(k, { name: 'perfumeC', kind: 'slim', liquid: 'amber', fill: 0.5, place: tp(0.095, -0.028, 0) });
    budVase(k, { name: 'vase', place: xf({ pos: [0.38, ty, zc - 0.07], rot: [0, 2.2, 0] }) });
    lipstick(k, { name: 'lipstick', place: xf({ pos: [0.08, ty, zc + 0.1], rot: [0, 0.4, 0] }) });
    compact(k, { name: 'compact', place: xf({ pos: [0.2, ty, zc + 0.08] }) });
  },
};
