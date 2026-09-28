import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundLeg } from '../furniture/parts.js';
import { PLY_T } from '../materials/library.js';
import { DRAWING } from '../materials/atlas.js';
import { outline, plyPanel, plyBent } from './ply.js';
import { paint } from './toys.js';

// 小书桌 + 小椅子：桦木胶合板
//   · 两块侧板下面挖一个拱门（拱脚和底边之间是凹圆角）：板边的 13 层单板顺着拱绕上去又绕下来；
//   · 桌面后沿装一卷画纸：两个墓碑形的小支架夹一根木轴，纸从纸卷底下拉出来平铺在桌上，
//     快到前沿的那一头自己卷起来一点（从卷上撕下来的纸都会这样）；纸上是一幅蜡笔画（贴图）；
//   · 右后角一只蓝色笔筒插着七支蜡笔，画纸上还躺着两支；
//   · 小椅子：胶合板座面，靠背是一条弯曲胶合板（上下两条边都露出层纹），四条锥形圆腿。
// 原点在桌子正中（地面上），孩子坐在 +z 一侧。
const T = PLY_T;
const DW = 0.8, DD = 0.5, YT = 0.56;       // 桌面宽、深、上表面高
const XS = DW / 2 - 0.06;                  // 侧板中心
const ZS = DD / 2 - 0.02;                  // 侧板半深
const ARCH = { a: 0.13, h0: 0.12 };        // 拱：半宽、拱脚高
const ZR = -0.19, RR = 0.034;              // 纸卷轴的 z、纸卷半径
const YR = YT + RR + 0.003;                // 纸卷轴高：纸卷底离桌面 3mm
const XB = DW / 2 - 0.035;                 // 纸卷支架中心
const ROLL = DRAWING.w + 0.02;             // 纸卷长

export default {
  id: 'kids_desk',
  name: '小书桌',
  nameEn: 'Birch Art Desk & Chair',
  category: 'kids',
  aoDensity: 200,
  shadow: { margin: 0.16, maxDist: 0.45, density: 100 },
  view: { el: 22, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const cs = q(6, 4, 2);
    // —— 桌面 ——
    const r = { r: 0.05, segs: cs };
    plyPanel(k, {
      name: 'top', outline: outline([[-DW / 2, -DD / 2, r], [DW / 2, -DD / 2, r], [DW / 2, DD / 2, r], [-DW / 2, DD / 2, r]]),
      n: q(2, 1, 1), density: { back: 0.5 }, xf: xf({ pos: [0, YT - T / 2, 0], rot: [-Math.PI / 2, 0, 0] }),
    });
    // —— 侧板：拱门 ——（局部 x = 世界 z，局部 y = 世界 y）
    const { a, h0 } = ARCH;
    const na = q(12, 7, 4);
    const side = [[-ZS, 0, { r: 0.012, segs: q(3, 2, 1) }], [-a, 0, { r: 0.01, segs: q(3, 2, 1) }], [-a, h0, { smooth: true }]];
    for (let i = 1; i < na; i++) {
      const t = Math.PI - (Math.PI * i) / na;
      side.push([a * Math.cos(t), h0 + a * Math.sin(t), { smooth: true }]);
    }
    side.push([a, h0, { smooth: true }], [a, 0, { r: 0.01, segs: q(3, 2, 1) }], [ZS, 0, { r: 0.012, segs: q(3, 2, 1) }],
      [ZS, YT - T, { r: 0.003, segs: 1 }], [-ZS, YT - T, { r: 0.003, segs: 1 }]);
    const sideOutline = outline(side);
    for (const s of [-1, 1]) {
      plyPanel(k, {
        name: `side${s > 0 ? 'R' : 'L'}`, outline: sideOutline, grain: Math.PI / 2, n: q(2, 1, 1),
        edge: (p) => p[1] < YT - T - 0.002, xf: xf({ pos: [s * XS, 0, 0], rot: [0, -Math.PI / 2, 0] }),
      });
    }
    // 后面一条横板（拉住两块侧板）：只有下沿看得见
    const ry0 = YT - T - 0.09, sc = { r: 0.003, segs: 1 };
    plyPanel(k, {
      name: 'rail', outline: outline([[-XS + T / 2, ry0, sc], [XS - T / 2, ry0, sc], [XS - T / 2, YT - T, sc], [-XS + T / 2, YT - T, sc]]),
      n: q(2, 1, 1), edge: (p) => p[1] < ry0 + 0.004, xf: xf({ pos: [0, 0, -ZS + 0.03] }),
    });

    // —— 纸卷：两个墓碑形支架 + 木轴 + 纸卷 ——
    const bw = 0.045, bh = 0.1;
    const tomb = [[ZR - bw, YT, { r: 0.002, segs: 1 }], [ZR + bw, YT, { r: 0.002, segs: 1 }], [ZR + bw, YT + bh - bw, { smooth: true }]];
    const nt = q(8, 5, 3);
    for (let i = 1; i < nt; i++) {
      const t = (Math.PI * i) / nt;
      tomb.push([ZR + bw * Math.cos(t), YT + bh - bw + bw * Math.sin(t), { smooth: true }]);
    }
    tomb.push([ZR - bw, YT + bh - bw, { smooth: true }]);
    const tombOutline = outline(tomb);
    for (const s of [-1, 1]) {
      plyPanel(k, {
        name: `holder${s > 0 ? 'R' : 'L'}`, outline: tombOutline, grain: Math.PI / 2, n: q(2, 1, 1),
        edge: (p) => p[1] > YT + 0.003, xf: xf({ pos: [s * XB, 0, 0], rot: [0, -Math.PI / 2, 0] }),
      });
    }
    const alongX = (pos) => xf({ pos, rot: [0, 0, -Math.PI / 2] }); // 车削轴 y → 世界 x
    const s = { smooth: true };
    const L = 2 * XB + T + 0.024;
    k.lathe({
      name: 'axle', mat: 'birch', segs: q(8, 6, 5),
      profile: profile([[0, -L / 2 - 0.004], [0.011, -L / 2, s], [0.012, -L / 2 + 0.01, s], [0.008, -L / 2 + 0.016],
        [0.008, L / 2 - 0.016], [0.012, L / 2 - 0.01, s], [0.011, L / 2, s], [0, L / 2 + 0.004]], s),
      xf: alongX([0, YR, ZR]),
    });
    const roll = k.lathe({
      name: 'roll', mat: 'drawing', segs: q(16, 10, 6),
      profile: profile([[0.0125, -ROLL / 2], [RR, -ROLL / 2, { r: q(0.002, 0.0015, 0), segs: 1 }], [RR, ROLL / 2, { r: q(0.002, 0.0015, 0), segs: 1 }], [0.0125, ROLL / 2]]),
      xf: alongX([0, YR, ZR]),
    });
    roll.T = roll.T.map(() => DRAWING.blank);
    if (k.lod < 2) {
      // 纸卷两头的硬纸芯
      for (const e of [-1, 1]) {
        paint(k.lathe({
          name: `core${e > 0 ? 'R' : 'L'}`, mat: 'toys', segs: q(12, 8),
          profile: profile(e > 0 ? [[0.0125, ROLL / 2 - 0.004], [0.0125, ROLL / 2 + 0.002], [0.0085, ROLL / 2 + 0.002]]
            : [[0.0085, -ROLL / 2 - 0.002], [0.0125, -ROLL / 2 - 0.002], [0.0125, -ROLL / 2 + 0.004]]),
          xf: alongX([0, YR, ZR]),
        }), 'beech');
      }
    }
    sheet(k);

    // —— 笔筒 + 蜡笔 ——
    const cup = [0.335, YT, -0.09];
    paint(k.lathe({
      name: 'cup', mat: 'toys', segs: q(10, 8, 6),
      profile: profile([[0, 0], [0.029, 0, { r: 0.004, segs: 1 }], [0.031, 0.062, { r: 0.002, segs: 1 }], [0.0265, 0.062, { r: 0.002, segs: 1 }], [0.025, 0.008], [0, 0.008]]),
      xf: xf({ pos: cup }),
    }), 'blue');
    const colors = ['red', 'orange', 'yellow', 'green', 'teal', 'lilac', 'pink'];
    const rnd = k.rand('crayons');
    // 蜡笔：六棱柱 + 削尖的头；插在笔筒里的那几支，底面看不见，不做
    const crayon = (name, color, place, bottom = false) => paint(k.lathe({
      name, mat: 'toys', segs: q(6, 5, 4),
      profile: profile([...(bottom ? [[0, 0]] : []), [0.0045, 0], [0.0045, 0.075], [0, 0.0855]]),
      xf: place,
    }), color);
    colors.forEach((c, i) => {
      if (k.lod >= 2 && i % 2) return;
      const ang = (i / colors.length) * Math.PI * 2 + rnd() * 0.3, rr = i === 0 ? 0 : 0.012 + rnd() * 0.006;
      const tilt = 0.08 + rnd() * 0.12;
      crayon(`crayon${i}`, c, xf({
        pos: [cup[0] + Math.cos(ang) * rr, YT + 0.01, cup[2] + Math.sin(ang) * rr],
        rot: [Math.sin(ang) * tilt, 0, -Math.cos(ang) * tilt],
      }));
    });
    // 画纸上躺着两支
    if (k.lod < 2) {
      const lying = (pos, yaw) => xf({ pos, rot: [0, yaw, 0] }).mul(xf({ rot: [0, 0, Math.PI / 2] }));
      crayon('crayonA', 'blue', lying([0.12, YT + 0.0051, 0.12], 0.4), true);
      crayon('crayonB', 'red', lying([0.2, YT + 0.0051, 0.075], -0.3), true);
    }

    chair(k, xf({ pos: [0.04, 0, 0.36], rot: [0, Math.PI - 0.12, 0] }));
  },
};

// 画纸：沿 z 的截面曲线（纸卷底下 → 落到桌面 → 平铺 → 前端卷起来），横向是纸宽；
// UV：u 横跨纸宽，v = 截面弧长 / 纸长（和贴图的 DRAWING.h 对应）
function sheet(k) {
  const q = (...v) => k.q(...v);
  const y0 = YT + 0.0006;
  const prof = [[ZR - 0.012, YR - RR - 0.0006], [ZR + 0.02, y0 + 0.0012], [ZR + 0.05, y0]];
  const zc = 0.17, rc = 0.017, nc = q(6, 4, 2);
  // 平铺段中间加几个点（贴图映射是逐顶点线性的，长段不加点也没问题；这里只是给 AO 图块一点分辨率）
  for (let i = 1; i <= q(3, 1, 0); i++) prof.push([ZR + 0.05 + ((zc - ZR - 0.05) * i) / (q(3, 1, 0) + 1), y0]);
  prof.push([zc, y0]);
  for (let i = 1; i <= nc; i++) {
    const t = (i / nc) * 2.4;
    prof.push([zc + rc * Math.sin(t), y0 + rc * (1 - Math.cos(t))]);
  }
  const S = [0];
  for (let i = 1; i < prof.length; i++) S.push(S[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const len = S[S.length - 1];
  const W = DRAWING.w, nx = q(3, 2, 1);
  const part = k.part('drawing', 'sheet');
  const ch = k.chart('sheet', W, len, { density: 0.7 });
  const rows = prof.map(([z, y], i) => {
    // 法线：截面切线转 90°（朝上的一面）
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)];
    const tz = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tz, ty);
    const n = [0, tz / l, -ty / l];
    const v = S[i] / DRAWING.h;
    return Array.from({ length: nx + 1 }, (_, j) => {
      const x = -W / 2 + (W * j) / nx;
      return part.v([x, y, z], n, [j / nx, v], ch, [j / nx, S[i] / len]);
    });
  });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < nx; j++) part.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
}

// 小椅子（座高 31cm）：原点在椅子正中地面上，面朝 +z
function chair(k, place) {
  const q = (...v) => k.q(...v);
  const YS = 0.31, SW = 0.3, SD = 0.29;
  const fr = { r: 0.045, segs: q(5, 3, 2) }, br = { r: 0.02, segs: q(3, 2, 1) };
  plyPanel(k, {
    name: 'seat', outline: outline([[-SW / 2, -SD / 2, fr], [SW / 2, -SD / 2, fr], [SW / 2, SD / 2, br], [-SW / 2, SD / 2, br]]),
    n: q(2, 1, 1), density: { back: 0.5 }, xf: place.mul(xf({ pos: [0, YS - T / 2, 0], rot: [-Math.PI / 2, 0, 0] })),
  });
  // 腿：前腿到座面底，后腿一直伸上去托住靠背
  const lx = SW / 2 - 0.035, lz = SD / 2 - 0.035;
  for (const [i, sx, sz, h] of [[0, -1, 1, YS - T + 0.004], [1, 1, 1, YS - T + 0.004], [2, 1, -1, 0.535], [3, -1, -1, 0.535]]) {
    roundLeg(k, { name: `chairLeg${i}`, mat: 'birch', r0: 0.0105, r1: 0.0135, h, segs: q(8, 6, 5), pos: [sx * lx, 0, sz * lz] }).transform(place);
  }
  // 靠背：一段弯曲胶合板（半径 0.34m 的弧，凹面朝座位），高 9cm，贴在后腿前面
  // 靠背背面（路径）在两条后腿处正好碰到后腿的前表面 zb；弧的正中比那里再往后 R - √(R² - lx²)
  const R = 0.34, half = Math.asin(0.15 / R), na = q(6, 4, 2);
  const zb = -lz + 0.0135;
  const zc = zb - (R - Math.sqrt(R * R - lx * lx));
  const pts = [];
  for (let i = 0; i <= na; i++) {
    const t = half - (2 * half * i) / na; // 从 +x 走到 -x：弧心在路径左边
    // 局部 y = -椅子 z（放倒成水平以后）
    pts.push([R * Math.sin(t), -(zc + R - R * Math.cos(t))]);
  }
  plyBent(k, {
    name: 'back', path: pts, closed: false, D: 0.09, n: q(2, 1, 1), back: true,
    xf: place.mul(xf({ pos: [0, 0.44, 0], rot: [-Math.PI / 2, 0, 0] })),
  });
}
