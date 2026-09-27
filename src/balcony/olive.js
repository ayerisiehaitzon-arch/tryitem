import { norm, cross, madd, add, sub, scale, dot } from '../core/vec.js';
import { rmFrames, bezier3 } from '../core/path.js';
import { revolve } from '../decor/revolve.js';
import { patioUV } from '../materials/atlas.js';
import { patioCurve, POT_SOIL } from './profiles.js';

// 橄榄树（陶土花盆）：阳台的主角
//   · 花盆、鼓凳同一张“阳台图集”：花盆沿设计曲线车削，贴图按同一条曲线画卷边、泛碱、贴地发深的一圈；
//   · 一根扭着长上去的主干，分出五根主枝，每根主枝再分三根小枝、每根小枝再分一根短梢 —— 结构是写死的（加一点确定性的随机），
//     所以各级 LOD 长得一模一样，只是越远叶子越少、越大；
//   · 叶子是几何的：每片只有 2 个三角形（叶基、左右叶缘、叶尖围成的菱形，主脉就是两个三角形的公共边），
//     法线在叶缘往外倾 —— 平的叶片也有“沿主脉折起来”的明暗；七成用正面（深灰绿、有光泽）、
//     三成用背面（银灰）的贴图，橄榄树那种银绿相间；
//   · 叶子对生，一节一对，大致在一个平面里往两侧展开（各节在这个平面上下错开 30° 左右）；
//     同一根小枝上的叶子共用一个 AO 图块（每片占一列），
//     不然 550 片叶子就是 550 个图块。
const TRUNK = { r0: 0.034, r1: 0.019, top: [0.012, 0.9, -0.004] };
const BRANCHES = [ // [方位角°, 仰角°, 长, 起点在主干上的位置]
  [18, 30, 0.48, 1], [140, 26, 0.46, 1], [255, 36, 0.44, 1], [330, 16, 0.42, 0.78], [80, 52, 0.36, 0.9],
];
const TWIG_AT = [0.3, 0.55, 0.8];
const LEAF = { L: 0.085, W: 0.0095, gap: 0.026 };

// 渐细的枝：沿点列的圆管（旋转最小化标架，不会扭），树皮贴图沿枝干
function tube(k, { name, pts, r0, r1, segs }) {
  const part = k.part('patio', name);
  const F = rmFrames(pts, [0, 0, 1]);
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(...[0, 1, 2].map((a) => pts[i][a] - pts[i - 1][a])));
  const Lt = S[S.length - 1];
  const ch = k.chart(name, 2 * Math.PI * r0, Lt, { density: 0.6 });
  const rings = pts.map((p, i) => {
    const t = S[i] / Lt, r = r0 + (r1 - r0) * t;
    const row = [];
    for (let j = 0; j <= segs; j++) {
      const a = (2 * Math.PI * j) / segs;
      const d = [0, 1, 2].map((q) => F.R[i][q] * Math.cos(a) + F.U[i][q] * Math.sin(a));
      row.push(part.v(madd(p, d, r), d, patioUV('bark', j / segs, 1 - t), ch, [j / segs, t]));
    }
    return row;
  });
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < segs; j++) {
    part.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]);
  }
  return part;
}

// 一片叶：叶基、左右叶缘（在 42% 叶长处）、叶尖 —— 2 个三角形，主脉是公共边。
// d 叶的方向，n 叶面朝向（和 d 垂直）；叶缘往上翘一点（fold），法线往外倾两倍的角度
function leaf(part, ch, col, ncol, { base, d, n, L, W, region, fold = 0.28, droop = 0.12 }) {
  const s = norm(cross(d, n)); // 叶面上横着的方向
  const lift = W * Math.tan(fold);
  const tip = madd(madd(base, d, L), n, -droop * L);
  const mid = madd(base, d, 0.42 * L);
  const c2 = Math.cos(2 * fold), s2 = Math.sin(2 * fold);
  const edgeN = (side) => norm([n[0] * c2 - side * s[0] * s2, n[1] * c2 - side * s[1] * s2, n[2] * c2 - side * s[2] * s2]);
  const U = (u, t) => [(col + u) / ncol, t];
  const v0 = part.v(base, n, patioUV(region, 0.5, 1), ch, U(0.5, 0));
  const vL = part.v(madd(madd(mid, s, -W), n, lift), edgeN(-1), patioUV(region, 0, 0.58), ch, U(0, 0.42));
  const vR = part.v(madd(madd(mid, s, W), n, lift), edgeN(1), patioUV(region, 1, 0.58), ch, U(1, 0.42));
  const vT = part.v(tip, n, patioUV(region, 0.5, 0), ch, U(0.5, 1));
  part.tri(v0, vL, vT); part.tri(v0, vT, vR);
}

// 绕单位轴 a 旋转向量 v（罗德里格斯公式）
function rotate(v, a, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(scale(v, c), scale(cross(a, v), s)), scale(a, dot(a, v) * (1 - c)));
}
const dirOf = (az, el) => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
};
// 一根略向上弯的枝：起点 p、方向 d、长 len；返回贝塞尔曲线
function limb(p, d, len, rise = 0.18) {
  const e = add(p, scale(d, len));
  return bezier3(p, madd(p, d, len * 0.35), add(madd(p, d, len * 0.7), [0, rise * len * 0.5, 0]), add(e, [0, rise * len * 0.4, 0]));
}
const sample = (f, n) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const tangent = (f, t) => norm(sub(f(Math.min(1, t + 0.01)), f(Math.max(0, t - 0.01))));

export default {
  id: 'olive_tree',
  name: '橄榄树',
  nameEn: 'Potted Olive Tree',
  category: 'balcony',
  aoDensity: 110,
  shadow: { margin: 0.3, maxDist: 1.4, density: 50, strength: 0.75 },
  view: { el: 12, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 花盆 + 盆土 ——
    revolve(k, {
      name: 'pot', mat: 'patio', cv: patioCurve('pot'),
      segs: q(22, 16, 10), tol: q(0.003, 0.005, 0.009), maxAngle: q(0.6, 0.9, 1.3),
      uv: (u, v) => patioUV('pot', u, v), density: { in: 0.4 },
    });
    {
      const part = k.part('patio', 'soil'), segs = q(24, 16, 10), r = POT_SOIL.r + 0.004, y = POT_SOIL.y;
      const ch = k.chart('soil', 2 * r, 2 * r, { density: 0.5 });
      const c = part.v([0, y + 0.012, 0], [0, 1, 0], patioUV('soil', 0.5, 0.5), ch, [0.5, 0.5]);
      const ring = [];
      for (let j = 0; j <= segs; j++) {
        const a = Math.PI + (2 * Math.PI * j) / segs, x = r * Math.sin(a), z = r * Math.cos(a);
        ring.push(part.v([x, y, z], [0, 1, 0], patioUV('soil', 0.5 + x / (2 * r), 0.5 + z / (2 * r)), ch, [0.5 + x / (2 * r), 0.5 + z / (2 * r)]));
      }
      for (let j = 0; j < segs; j++) part.tri(c, ring[j], ring[j + 1]);
    }
    // —— 主干：扭着长上去 ——
    const trunk = bezier3([0, POT_SOIL.y - 0.02, 0], [0.05, 0.62, -0.03], [-0.045, 0.82, 0.035], TRUNK.top);
    tube(k, { name: 'trunk', pts: sample(trunk, q(10, 6, 4)), r0: TRUNK.r0, r1: TRUNK.r1, segs: q(9, 6, 5) });
    // —— 主枝、小枝、叶 ——
    const rnd = k.rand('olive');
    const leafy = (name, f, t0, t1) => {
      // 一段枝上的叶：一节一对；LOD1 隔一节、LOD2 隔两节，叶子相应放大
      const len = Math.hypot(...sub(f(1), f(0))) * (t1 - t0);
      const nodes = Math.max(2, Math.round(len / LEAF.gap));
      const keep = q(1, 2, 3), grow = q(1, 1.3, 1.65);
      const ch = k.chart(name, nodes * 2 * 2 * LEAF.W, LEAF.L, { density: 0.6 });
      const part = k.part('patio_leaf', name);
      const r = k.rand(name);
      for (let i = 0; i < nodes; i++) {
        const t = t0 + ((t1 - t0) * (i + 0.5)) / nodes;
        const p = f(t), T = tangent(f, t);
        // 叶子大致在一个平面里往两侧展开（橄榄枝是“一片片”的），相邻两节只错开 ±30°
        const ref = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const side0 = norm(cross(T, ref));
        const side = rotate(side0, T, (i % 2 ? 0.5 : -0.5) + (r() - 0.5) * 0.4);
        for (const sgn of [-1, 1]) {
          const a = (1.05 - 0.45 * (i / nodes)) * (0.8 + 0.4 * r()); // 张开 60° 左右，越靠枝梢越贴着枝往前
          const d = norm(add(add(scale(T, Math.cos(a)), scale(side, sgn * Math.sin(a))), [0, 0.18, 0]));
          const up = norm(sub([0, 1, 0], scale(d, d[1])));
          const n = rotate(up, d, (r() - 0.5) * 1.2);
          const Ls = LEAF.L * (0.8 + 0.4 * r()), region = r() < 0.7 ? 'leafA' : 'leafB';
          if (i % keep) continue;
          leaf(part, ch, i * 2 + (sgn > 0 ? 1 : 0), nodes * 2, { base: p, d, n, L: Ls * grow, W: LEAF.W * grow, region });
        }
      }
    };
    BRANCHES.forEach(([az, el, len, at], bi) => {
      const p0 = trunk(at);
      const d = dirOf(az + (rnd() - 0.5) * 16, el + (rnd() - 0.5) * 8);
      const f = limb(p0, d, len);
      tube(k, { name: `branch${bi}`, pts: sample(f, q(6, 4, 3)), r0: 0.016, r1: 0.006, segs: q(6, 5, 4) });
      leafy(`leavesB${bi}`, f, 0.55, 1);
      TWIG_AT.forEach((t, ti) => {
        const p = f(t), T = tangent(f, t);
        const turn = (ti % 2 ? 1 : -1) * (0.7 + rnd() * 0.45);
        const td = norm(add(rotate(T, [0, 1, 0], turn), [0, -0.15 + rnd() * 0.4, 0])); // 有的往上、有的下垂
        const tf = limb(p, td, 0.24 + rnd() * 0.12, 0.15);
        if (k.lod < 2) tube(k, { name: `twig${bi}${ti}`, pts: sample(tf, q(3, 2)), r0: 0.0055, r1: 0.002, segs: 3 });
        leafy(`leaves${bi}${ti}`, tf, 0.12, 1);
        // 小枝中段再分出一根短梢（太细，只长叶子、不建枝）
        const sp = tf(0.5), sd = norm(add(rotate(tangent(tf, 0.5), [0, 1, 0], -turn * 0.8), [0, 0.2, 0]));
        leafy(`spur${bi}${ti}`, limb(sp, sd, 0.1 + rnd() * 0.05, 0.3), 0.05, 1);
      });
    });
  },
};
