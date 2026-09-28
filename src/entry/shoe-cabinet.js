import { shape, rect, profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundLeg } from '../furniture/parts.js';
import { vessel3d } from '../decor/vases.js';

// 鞋柜：26cm 深的翻斗鞋柜，白橡木 + 洞石台面
//   · 两个翻斗门：门板上沿正中挖一个半圆拉手（门板本身就是这个轮廓的挤出，四周 1.5mm 倒角）；
//     两块门板的木纹是从同一块板上裁下来的（同一个 uvKey，各自按位置平移）—— 木纹从下门一直走到上门；
//   · 门板背后 4cm 是柜体里面的一面板：拉手的半圆缺口、两门之间 3mm 的缝里看进去都是它，烘焙 AO 压得很暗；
//   · 洞石台面比柜体探出 2cm，前角小圆角；四条锥形橡木腿；
//   · 台面上：一只黄铜钥匙碟，一只天目釉小花瓶（和花瓶组里的是同一个器型）插三枝干罂粟果。
// 原点在墙根、宽度中点（z = 0 是墙面，y = 0 是地面），贴着地面和墙两个面。
const W = 0.9, D = 0.26, LEG = 0.14, TOP = 0.86, SLAB = 0.03;
const FRONT = { t: 0.02, gap: 0.003, notch: 0.035 };

// 门板轮廓：矩形，上沿正中一个半圆缺口（逆时针；缺口是一段顺时针走的半圆）
function frontShape(k, w, h, r) {
  const q = (...v) => k.q(...v);
  const n = q(8, 5, 3);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [r, h / 2]];
  for (let i = 1; i < n; i++) {
    const a = -(Math.PI * i) / n;
    pts.push([r * Math.cos(a), h / 2 + r * Math.sin(a), { smooth: true }]);
  }
  pts.push([-r, h / 2], [-w / 2, h / 2]);
  return shape(pts);
}

export default {
  id: 'shoe_cabinet',
  name: '鞋柜',
  nameEn: 'Oak Tilt-out Shoe Cabinet',
  category: 'entry',
  planes: ['floor', 'wall'],
  aoDensity: 200,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.4, density: 90 },
    wall: { margin: 0.12, maxDist: 0.3, density: 70, strength: 0.7 },
  },
  view: { el: 14, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const zc = D - FRONT.t; // 柜体正面（门板背面）
    const body = TOP - LEG;
    // 柜体：两侧、底面看得见；正面被门板盖住、背面贴墙、顶面压着台面
    k.box({
      name: 'carcass', mat: 'oak', size: [W, body, zc], r: q(0.002, 0.0015, 0), segs: q(1, 1, 0), grain: 'y',
      omit: ['pz', 'nz', 'py'], density: { ny: 0.4 },
      xf: xf({ pos: [0, LEG + body / 2, zc / 2] }),
    });
    // 门板背后 4cm 的柜内板（拉手缺口、门缝里看得见）
    k.box({
      name: 'pocket', mat: 'oak', size: [W - 0.03, body - 0.02, 0.004], segs: 0, grain: 'x',
      omit: ['px', 'nx', 'py', 'ny', 'nz'], density: { pz: 0.3 },
      xf: xf({ pos: [0, LEG + body / 2, zc - 0.04] }),
    });
    // 两个翻斗门：同一块板上裁下来的木纹
    const fh = (body - FRONT.gap) / 2;
    for (let i = 0; i < 2; i++) {
      const cy = LEG + fh / 2 + i * (fh + FRONT.gap);
      const f = k.extrude({
        name: `front${i}`, mat: 'oak', axis: 'z', shape: frontShape(k, W, fh, FRONT.notch), depth: FRONT.t,
        caps: [false, true], bevel: [0, q(0.0015, 0.0015, 0)], bsegs: 1, density: { side: 0.6 },
        xf: xf({ pos: [0, cy, zc] }),
      });
      f.uvKey = 'fronts';
      f.uvShift = [0, cy];
    }
    // 洞石台面：前面两个角小圆角，上沿 2mm 倒角
    k.extrude({
      name: 'slab', mat: 'travertine', axis: 'y', depth: SLAB,
      shape: rect(W + 0.02, D + 0.02, { corners: [q(0.008, 0.006, 0), q(0.008, 0.006, 0), 0, 0], segs: q(2, 1, 1) }),
      caps: [true, true], bevel: [0, q(0.002, 0.002, 0)], bsegs: 1, density: { cap0: 0.3 },
      xf: xf({ pos: [0, TOP, (D + 0.02) / 2] }),
    });
    // 腿
    for (const [i, sx, z] of [[0, 1, D - 0.06], [1, -1, D - 0.06], [2, -1, 0.05], [3, 1, 0.05]]) {
      roundLeg(k, {
        name: `leg${i}`, mat: 'oak', r0: 0.011, r1: 0.016, h: LEG + 0.01, segs: q(8, 6, 5),
        pos: [sx * (W / 2 - 0.05), 0, z],
      });
    }
    // —— 台面上的小东西 ——
    const y0 = TOP + SLAB;
    if (k.lod < 2) {
      k.lathe({
        name: 'dish', mat: 'brass', segs: q(12, 8),
        profile: profile([
          [0.03, 0], [0.055, 0.008, { smooth: true }], [0.068, 0.018], [0.064, 0.018], [0.05, 0.009, { smooth: true }], [0, 0.005],
        ]),
        xf: xf({ pos: [0.22, y0, 0.15] }),
      });
    }
    vessel3d(k, { name: 'vase', shape: 'bud', segs: [10, 8, 6], pos: [-0.27, y0, 0.14], rot: 0.4, tol: [0.0015, 0.003, 0.007] });
    // 干罂粟果：三根细茎从瓶口伸出来，顶上一个带“冠”的小蒴果
    if (k.lod < 2) {
      const mouth = [-0.27, y0 + 0.158, 0.14];
      const stems = [[-0.035, 0.34, 0.02], [0.05, 0.3, -0.03], [0.012, 0.4, 0.035]];
      stems.forEach(([dx, h, dz], i) => {
        const top = [mouth[0] + dx, mouth[1] + h, mouth[2] + dz];
        const mid = [mouth[0] + dx * 0.35, mouth[1] + h * 0.55, mouth[2] + dz * 0.4];
        k.sweep({
          name: `stem${i}`, mat: 'oak', shape: circle(0.0016, 4), caps: [false, false], up: [1, 0, 0],
          path: [[mouth[0], mouth[1] - 0.06, mouth[2]], mid, top],
        });
        k.lathe({
          name: `pod${i}`, mat: 'oak', segs: q(7, 5),
          profile: profile([
            [0.002, 0], [0.01, 0.009, { smooth: true }], [0.009, 0.02, { smooth: true }], [0.012, 0.022], [0, 0.0255],
          ]),
          xf: xf({ pos: top, rot: [dz * 0.8, 0, -dx * 0.8] }),
        });
      });
    }
  },
};
