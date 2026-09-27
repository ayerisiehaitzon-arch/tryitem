import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { curve, sampleCurve } from '../decor/profiles.js';
import { revolve } from '../decor/revolve.js';

// 台灯：牛血红釉陶瓷灯座 + 黄铜配件 + 百褶亚麻灯罩
//   · 灯座是一条设计曲线（和花瓶同一套车削工具）：按剪影误差取点、法线取曲线真实法线，高光一路圆过去；
//   · 百褶灯罩是真正的折线截面：每一褶两个平面，折痕处法线断开 —— 灯光下一明一暗，上下边缘是锯齿，
//     两圈顶点就够（每个褶面都是平面），LOD2 退化成光滑锥面；
//   · 灯罩上下开口、灯泡、支架都在，从上往下看得见灯罩里的“蜘蛛架”和灯头；
//   · 桌面上的光斑是烘焙的：灯泡当作小球光源，灯座挡出一圈影子，灯罩按 30% 透光算。

const BASE = curve([
  [0.052, 0.0, { c: 1 }], [0.056, 0.004], [0.061, 0.013], [0.078, 0.04], [0.093, 0.078],
  [0.1, 0.118], [0.097, 0.152], [0.084, 0.188], [0.062, 0.216], [0.042, 0.234],
  [0.031, 0.249], [0.027, 0.261], [0.0285, 0.27], [0.026, 0.276, { c: 1 }], [0.011, 0.276],
]);

const SHADE = { yb: 0.36, yt: 0.6, rb: 0.18, rt: 0.13 };
// 灯架：从灯头两侧的托架拱起，绕过灯泡，在灯罩顶部合拢（左右对称的一条样条）
const HARP_HALF = [[-0.012, 0.338], [-0.032, 0.362], [-0.062, 0.405], [-0.08, 0.462], [-0.077, 0.522], [-0.054, 0.572], [-0.021, 0.597]];
const HARP = curve([...HARP_HALF, [0, SHADE.yt], ...HARP_HALF.slice().reverse().map(([x, y]) => [-x, y])]);
export const TABLE_LAMP_BULB = [0, 0.432, 0];

// 百褶灯罩：n 个褶，每褶外折痕在 θ、内折痕在 θ + π/n，褶深和半径成正比（所有折痕都指向锥顶，所以每个褶面都是平面）
function pleatedShade(k, { name, mat, n, depth }) {
  const part = k.part(mat, name);
  const { yb, yt, rb, rt } = SHADE;
  const slant = Math.hypot(rb - rt, yt - yb);
  const ch = k.chart(name, 2 * Math.PI * rb, slant, { density: 0.8 });
  const crease = (j) => {
    const outer = j % 2 === 0;
    const a = Math.PI + (Math.PI * j) / n; // 接缝在背面
    const f = outer ? 1 : 1 - depth;
    return [0, 1].map((e) => {
      const y = e ? yt : yb, r = (e ? rt : rb) * f;
      return { p: [r * Math.sin(a), y, r * Math.cos(a)], s: a * (e ? rt : rb), e };
    });
  };
  for (let j = 0; j < 2 * n; j++) {
    const A = crease(j), B = crease(j + 1);
    // 平面褶面的法线（朝外）
    const e1 = B[0].p.map((x, i) => x - A[0].p[i]), e2 = A[1].p.map((x, i) => x - A[0].p[i]);
    let nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const mid = [(A[0].p[0] + B[0].p[0]) / 2, 0, (A[0].p[2] + B[0].p[2]) / 2];
    if (nn[0] * mid[0] + nn[2] * mid[2] < 0) nn = nn.map((c) => -c);
    const u = (q, jj) => [jj / (2 * n), q.e];
    const t = (q) => [q.s, q.e * slant];
    // 没有褶（depth = 0，远处的 LOD）时用光滑的锥面法线
    const smoothN = (q) => { const r = Math.hypot(q.p[0], q.p[2]); return [(q.p[0] / r) * (yt - yb), rb - rt, (q.p[2] / r) * (yt - yb)]; };
    const v = (q, jj) => part.v(q.p, depth ? nn : smoothN(q), t(q), ch, u(q, jj));
    part.quad(v(A[0], j), v(B[0], j + 1), v(B[1], j + 1), v(A[1], j));
  }
  return part;
}

export default {
  id: 'table_lamp',
  name: '台灯',
  nameEn: 'Pleated Table Lamp',
  category: 'lighting',
  aoDensity: 200,
  // 放在桌面上：阴影贴花收小；光斑半径 30cm（床头柜、书桌都放得下）
  shadow: { margin: 0.06, maxDist: 0.2, density: 200 },
  // 光源半径取 8cm：真正发光的是整个灯罩下口，不是一个点 —— 灯座的影子边缘因此是软的
  glow: { light: TABLE_LAMP_BULB, lightRadius: 0.08, radius: 0.3, transmit: { shade_pleat: 0.3 }, gamma: 1.1 },
  build(k) {
    const q = (...v) => k.q(...v);
    // 灯座
    revolve(k, {
      name: 'base', mat: 'oxblood', cv: BASE, segs: q(22, 14, 9), tol: q(0.0012, 0.0025, 0.006), maxAngle: q(0.9, 1.3, 1.7),
      uv: (u, v) => [u, v],
    });
    // 黄铜盖 + 灯杆 + 灯头
    k.lathe({
      name: 'cap', mat: 'brass', segs: q(14, 10, 8),
      profile: profile([
        [0.029, 0.2755], [0.031, 0.279, { smooth: true }], [0.028, 0.2835, { smooth: true }], [0.007, 0.2865],
      ]),
    });
    k.lathe({ name: 'pipe', mat: 'brass', segs: q(6, 6, 5), profile: profile([[0.0062, 0.285], [0.0062, 0.334]]) });
    k.lathe({
      name: 'socket', mat: 'brass', segs: q(10, 8, 6),
      profile: profile([
        [0.0062, 0.333], [0.017, 0.337, { r: q(0.003, 0.002, 0), segs: 1 }], [0.016, 0.378], [0.012, 0.382],
      ]),
    });
    // 灯泡（A19 形状，发光材质）
    k.lathe({
      name: 'bulb', mat: 'bulb', segs: q(12, 8, 6),
      profile: profile([[0.011, 0.381], [0.03, 0.418, { smooth: true }], [0.028, 0.452, { smooth: true }], [0, 0.472]], { smooth: true }),
    });
    // 灯罩
    pleatedShade(k, { name: 'shade', mat: 'shade_pleat', n: q(36, 24, 7), depth: q(0.035, 0.035, 0) });
    // 灯架（harp）：从灯头两侧拱到灯罩顶，再加灯罩顶上的“蜘蛛架”和顶珠
    if (k.lod === 0) {
      const arch = sampleCurve(HARP, { tol: 0.0012, maxAngle: 0.5 }).map((r) => [r.p[0], r.p[1], 0]);
      k.sweep({ name: 'harp', mat: 'brass', shape: circle(0.0022, 4), path: arch, caps: [false, false], up: [0, 0, 1] });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        k.sweep({
          name: `spider${i}`, mat: 'brass', shape: circle(0.0016, 4), caps: [false, false], up: [0, 1, 0],
          path: [[0, SHADE.yt - 0.001, 0], [Math.sin(a) * (SHADE.rt - 0.004), SHADE.yt - 0.003, Math.cos(a) * (SHADE.rt - 0.004)]],
        });
      }
    }
    if (k.lod < 2) {
      k.lathe({
        name: 'finial', mat: 'brass', segs: q(10, 6),
        profile: profile([[0.004, SHADE.yt - 0.002], [0.009, SHADE.yt + 0.006, { smooth: true }], [0.008, SHADE.yt + 0.016, { smooth: true }], [0, SHADE.yt + 0.022]], { smooth: true }),
      });
    }
  },
};
