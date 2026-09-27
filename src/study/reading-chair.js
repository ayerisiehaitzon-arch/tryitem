import { circle } from '../core/shape.js';
import { xf, smoothstep, clamp } from '../core/vec.js';
import { puffDeform } from '../prims/box.js';
import { roundLeg } from '../furniture/parts.js';
import { ccwShape } from '../kitchen/cabinetry.js';

// 阅读椅：铁锈红丝绒翼背椅 + 同款脚凳
//   · 两侧的“扶手 + 翼”是同一块：侧视轮廓（扶手前端一个大圆卷、扶手顶一路往后、翼的前沿向上弯到椅背顶）
//     沿 x 挤出 12cm，两面四周是 3cm 的大圆角 —— 软包的厚度感全在这圈圆角上；
//   · 翼越往上越薄、越往外张：挤出以后再做一次形变（法线跟着雅可比变换，明暗是连续的），
//     椅背跟着一起变宽，翼和椅背之间不会裂开；
//   · 椅背是五道竖条绗缝（和床尾凳同一个做法）：条子中间鼓、缝线往里拉，腰部再往前拱一点；
//   · 坐垫、脚凳顶面都是鼓起来的圆角盒，顶沿一圈嵌条（welt）：嵌条的路径过同一个鼓胀形变，贴着鼓起的面走；
//   · 胡桃木锥腿套黄铜脚套，后腿往后撇。
const SEAT = { y0: 0.17, deck: 0.37, top: 0.49 };
const SIDE = { xi: 0.29, t: 0.12 }; // 侧片内侧 x、厚度
const BACK = { tilt: (9 * Math.PI) / 180, z: -0.285, h: 0.7, t: 0.15, n: 5 };
const OTTO = { z: 0.86, w: 0.58, d: 0.44, y0: 0.12, top: 0.43 };
const FLARE = 0.035; // 翼顶往外张

// 翼往外张、往上变薄（世界坐标形变）：侧片以内侧面为基准变薄（内侧面不动，外侧面往里收），
// 再整体往外张 FLARE；椅背按比例一起变宽 —— 翼的内侧面和椅背的两边始终贴在一起
const flareSide = (p) => {
  const s = smoothstep(0.62, 1.06, p[1]), sg = Math.sign(p[0]), xi = sg * SIDE.xi;
  return [xi + (p[0] - xi) * (1 - 0.3 * s) + sg * FLARE * s, p[1], p[2]];
};
const flareBack = (p) => [p[0] * (1 + (FLARE / SIDE.xi) * smoothstep(0.62, 1.06, p[1])), p[1], p[2]];

// 圆角盒顶沿的一圈嵌条路径：在圆角的 45° 处绕一圈（局部坐标，先过鼓胀形变，再摆到位）
function weltPath(h, r, n, fn, place) {
  const ix = h[0] - r, iz = h[2] - r, c = Math.SQRT1_2;
  const y = h[1] - r + r * c;
  const pts = [];
  // 四个角依次是前右、后右、后左、前左；每个角的圆弧从上一条边的法线方向转到下一条边的
  for (const [cx, cz, a0] of [[ix, iz, Math.PI / 2], [ix, -iz, 0], [-ix, -iz, -Math.PI / 2], [-ix, iz, Math.PI]]) {
    for (let i = 0; i <= n; i++) {
      const a = a0 - (i / n) * (Math.PI / 2);
      pts.push([cx + r * c * Math.cos(a), y, cz + r * c * Math.sin(a)]);
    }
  }
  return pts.map((p) => place.apply(fn(p)));
}

export default {
  id: 'reading_chair',
  name: '阅读椅',
  nameEn: 'Velvet Wingback & Ottoman',
  category: 'study',
  aoDensity: 150,
  shadow: { margin: 0.2, maxDist: 0.6, density: 70 },
  view: { el: 14, az: 38 },
  build(k) {
    const q = (...v) => k.q(...v);
    const soft = q(2, 2, 1);
    // —— 侧片（扶手 + 翼）：侧视轮廓，世界 (z, y) → 截面 (-z, y)（沿 x 挤出时截面 X → -Z）——
    const big = { r: q(0.065, 0.06, 0.05), segs: q(4, 3, 2) };
    const outline = [
      [0.415, SEAT.y0, { r: 0.01, segs: 1 }],
      [0.43, 0.64, big], // 扶手前端的圆卷
      [0.03, 0.652, { r: q(0.09, 0.08, 0.07), segs: q(4, 3, 2) }], // 扶手顶转进翼的前沿（凹）
      [-0.09, 0.9, { smooth: true }],
      [-0.2, 1.035, { r: q(0.08, 0.07, 0.05), segs: q(3, 2, 1) }],
      [-0.455, 1.045, { r: q(0.03, 0.025, 0), segs: q(2, 1, 1) }],
      [-0.4, SEAT.y0, { r: 0.01, segs: 1 }],
    ];
    const sideShape = ccwShape(outline.map(([z, y, o]) => [-z, y, o]));
    for (const s of [-1, 1]) {
      const part = k.extrude({
        name: `side${s > 0 ? 'R' : 'L'}`, mat: 'velvet_rust', axis: 'x', shape: sideShape, depth: SIDE.t,
        bevel: q(0.03, 0.028, 0.02), bsegs: soft, density: { side: 1, cap0: 0.8, cap1: 0.8 },
        xf: xf({ pos: [s > 0 ? SIDE.xi : -SIDE.xi - SIDE.t, 0, 0] }),
      });
      if (k.lod < 2) part.deform(flareSide);
    }
    // —— 座框（前面是一块软包的裙边，顶面被坐垫盖住）——
    k.box({
      name: 'deck', mat: 'velvet_rust', size: [2 * SIDE.xi + 0.01, SEAT.deck - SEAT.y0, 0.7], r: q(0.03, 0.025, 0.02), segs: q(2, 1, 1),
      div: q([2, 1, 1], 1, 1), puff: q({ sideZ: 0.008 }, null, null), omit: ['ny', 'py'], density: { nz: 0.3 },
      xf: xf({ pos: [0, (SEAT.y0 + SEAT.deck) / 2, 0.065] }),
    });
    // —— 坐垫 + 嵌条 ——
    const cs = [2 * SIDE.xi - 0.012, SEAT.top - SEAT.deck, 0.62];
    const ch = cs.map((v) => v / 2);
    const cr = q(0.04, 0.035, 0.03);
    const cushionPuff = puffDeform(ch, { top: 0.02, side: 0.008 });
    const cPlace = xf({ pos: [0, SEAT.deck + ch[1], 0.11] });
    k.box({
      name: 'cushion', mat: 'velvet_rust', size: cs, r: cr, segs: soft,
      div: q([3, 1, 3], [2, 1, 2], 1), deform: k.lod < 2 ? cushionPuff : null, omit: ['ny'],
      xf: cPlace,
    });
    if (k.lod === 0) {
      k.sweep({
        name: 'welt', mat: 'velvet_rust', shape: circle(0.0045, 4), closed: true, caps: [false, false], up: [0, 1, 0], maxChart: 1.2,
        path: weltPath(ch, cr, 3, cushionPuff, cPlace),
      });
    }
    // —— 椅背：五道竖条绗缝，腰部往前拱 ——
    const bs = [2 * SIDE.xi + 0.004, BACK.h, BACK.t];
    const bh = bs.map((v) => v / 2);
    const br = q(0.045, 0.04, 0.03);
    const inner = bh[0] - br, cw = (2 * inner) / BACK.n;
    const channels = (p) => {
      const [x, y, z] = p;
      const front = smoothstep(-0.2 * bh[2], bh[2], z); // 只有正面（+z，朝坐垫）有绗缝
      const u = (x + inner) / cw - Math.floor((x + inner) / cw);
      const sArc = Math.sqrt(Math.sin(Math.PI * clamp(u, 0, 1)));
      const edge = clamp((inner - Math.abs(x)) / (cw * 0.25), 0, 1);
      const crease = (1 - sArc) * edge;
      const vy = clamp(y / (bh[1] - br), -1, 1);
      const fadeY = 1 - vy ** 8; // 上下两头的圆角处缝线淡出
      const lumbar = 0.028 * Math.exp(-(((y + 0.12) / 0.16) ** 2)); // 腰靠
      const dome = 0.012 * (1 - vy * vy);
      return [x, y, z + front * (dome + lumbar + 0.016 * sArc * fadeY - 0.026 * crease * fadeY)];
    };
    const per = q(2, 1);
    const xs = [];
    for (let i = 0; i <= BACK.n * per; i++) xs.push(-1 + (2 * i) / (BACK.n * per));
    const back = k.box({
      name: 'back', mat: 'velvet_rust', size: bs, r: br, segs: soft,
      div: q([xs, [-1, -0.55, -0.1, 0.45, 1], 1], [xs, [-1, -0.2, 1], 1], 1),
      deform: k.lod < 2 ? channels : null, omit: ['ny'],
      xf: xf({ pos: [0, SEAT.deck, BACK.z], rot: [-BACK.tilt, 0, 0] }).mul(xf({ pos: [0, bh[1], 0] })),
    });
    if (k.lod < 2) back.deform(flareBack);
    // —— 腿：前腿直、后腿往后撇 ——
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      const rake = sz < 0 ? (10 * Math.PI) / 180 : 0;
      roundLeg(k, {
        name: `leg${i}`, mat: 'walnut', r0: 0.014, r1: 0.021, h: (SEAT.y0 + 0.01) / Math.cos(rake), segs: q(8, 6, 5),
        sabot: { mat: 'brass', h: 0.028 },
        pos: [sx * (SIDE.xi + 0.055), 0, sz > 0 ? 0.35 : -0.33],
        rot: [rake, 0, 0],
      });
    }
    // —— 脚凳 ——
    const os = [OTTO.w, OTTO.top - OTTO.y0, OTTO.d];
    const oh = os.map((v) => v / 2);
    const or = q(0.04, 0.035, 0.03);
    const oPuff = puffDeform(oh, { top: 0.018, side: 0.008 });
    const oPlace = xf({ pos: [0, OTTO.y0 + oh[1], OTTO.z] });
    k.box({
      name: 'ottoman', mat: 'velvet_rust', size: os, r: or, segs: soft,
      div: q([3, 1, 3], [2, 1, 2], 1), deform: k.lod < 2 ? oPuff : null, omit: ['ny'],
      xf: oPlace,
    });
    if (k.lod === 0) {
      k.sweep({
        name: 'oWelt', mat: 'velvet_rust', shape: circle(0.0045, 4), closed: true, caps: [false, false], up: [0, 1, 0], maxChart: 1.2,
        path: weltPath(oh, or, 3, oPuff, oPlace),
      });
    }
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      roundLeg(k, {
        name: `oleg${i}`, mat: 'walnut', r0: 0.012, r1: 0.018, h: OTTO.y0 + 0.01, segs: q(8, 6, 5),
        sabot: { mat: 'brass', h: 0.024 },
        pos: [sx * (OTTO.w / 2 - 0.06), 0, OTTO.z + sz * (OTTO.d / 2 - 0.06)],
      });
    }
  },
};
