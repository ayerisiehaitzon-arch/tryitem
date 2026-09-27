import { xf, norm, cross, madd } from '../core/vec.js';
import { rmFrames, bezier3 } from '../core/path.js';
import { foliageUV } from '../materials/atlas.js';
import { vessel3d } from './vases.js';

// 绿植：叶片、树干、盆土都在同一张“植物图集”里（一个材质、一次绘制），花盆用陶瓷图集。
// 叶片不用透明贴图抠形状，而是用几何轮廓：没有 alpha 测试的锯齿和过度绘制，边缘在任何距离都干净。

// 分段线性插值 [[t, w], ...]
const interp = (pts, t) => {
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, w0] = pts[i - 1], [t1, w1] = pts[i];
      return w0 + ((w1 - w0) * (t - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
};

/**
 * 一片叶子。局部坐标：叶基在原点，叶片沿 +z 伸出，+y 是叶面朝向。
 *   · 每一“行”只有 3 个点：左缘、主脉、右缘。叶片沿主脉折成 V 形（fold），沿长度下垂（droop）、扭转（twist）；
 *   · 法线：主脉处取叶面法线，叶缘处再往里多倾一倍折角 —— 3 个点也能有“叶片微微卷起”的圆润明暗；
 *   · 叶缘可以上下起伏（wave），不加一个顶点；
 *   · UV：u 按“当前行的宽度”归一化（叶缘永远落在贴图的叶缘上），v 从叶尖（0）到叶柄（1）。
 */
export function leaf(k, { name, region, L, W, outline, rows, fold = 0.25, droop = 0.3, twist = 0, wave = 0, phase = 0, place, density = 0.8 }) {
  const part = k.part('foliage', name);
  const ch = k.chart(name, 2 * W, L, { density });
  const pitch = (t) => -droop * t * t; // 主脉切线的俯仰角
  const midAt = (t) => {
    // 沿主脉积分出位置（和 LOD 无关，所以各级 LOD 的叶子形状一致）
    const n = 24;
    let y = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const a = pitch(((i + 0.5) / n) * t);
      y += Math.sin(a) * (L * t) / n;
      z += Math.cos(a) * (L * t) / n;
    }
    return [0, y, z];
  };
  const tf = Math.tan(fold), c2 = Math.cos(2 * fold), s2 = Math.sin(2 * fold);
  const ids = rows.map((t) => {
    const a = pitch(t), m = midAt(t);
    const T = [0, Math.sin(a), Math.cos(a)];
    const N0 = [0, Math.cos(a), -Math.sin(a)], X0 = [1, 0, 0];
    const psi = twist * t, cp = Math.cos(psi), sp = Math.sin(psi);
    const X = [X0[0] * cp + N0[0] * sp, X0[1] * cp + N0[1] * sp, X0[2] * cp + N0[2] * sp];
    const N = norm(cross(T, X)); // 与 X、T 正交的叶面法线
    const w = W * interp(outline, t);
    const lift = w * tf;
    const wv = (ph) => wave * W * Math.sin(2 * Math.PI * 2.3 * t + ph) * (w / W);
    const P = (side) => madd(madd(m, X, side * w), N, lift + wv(phase + side * 1.7));
    const nrm = (side) => norm([N[0] * c2 - side * X[0] * s2, N[1] * c2 - side * X[1] * s2, N[2] * c2 - side * X[2] * s2]);
    return [-1, 0, 1].map((side) => {
      const u = (side + 1) / 2;
      return part.v(side === 0 ? m : P(side), side === 0 ? N : nrm(side), foliageUV(region, u, 1 - t), ch, [u, t]);
    });
  });
  for (let i = 0; i + 1 < ids.length; i++) {
    const A = ids[i], B = ids[i + 1];
    part.quad(A[0], A[1], B[1], B[0]);
    part.quad(A[1], A[2], B[2], B[1]);
  }
  if (place) part.transform(place);
  return part;
}

// 树干：沿贝塞尔曲线的渐细圆管（旋转最小化标架，不会扭），树皮贴图沿干身
export function trunk(k, { name, curve, n, r0, r1, segs }) {
  const part = k.part('foliage', name);
  const pts = Array.from({ length: n + 1 }, (_, i) => curve(i / n));
  const F = rmFrames(pts, [0, 0, 1]);
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(...[0, 1, 2].map((a) => pts[i][a] - pts[i - 1][a])));
  const Lt = S[S.length - 1];
  const ch = k.chart(name, 2 * Math.PI * r0, Lt, { density: 0.7 });
  const rings = pts.map((p, i) => {
    const t = S[i] / Lt, r = r0 + (r1 - r0) * t;
    const row = [];
    for (let j = 0; j <= segs; j++) {
      const a = (2 * Math.PI * j) / segs;
      const d = [0, 1, 2].map((q) => F.R[i][q] * Math.cos(a) + F.U[i][q] * Math.sin(a));
      row.push(part.v(madd(p, d, r), d, foliageUV('bark', j / segs, 1 - t), ch, [j / segs, t]));
    }
    return row;
  });
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < segs; j++) {
    part.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]);
  }
  return part;
}

// 盆土：中间微微隆起的圆盘，和花盆同样的分段与起始角（土的边缘正好藏进盆壁里）
export function soil(k, { name, r, y, segs, mound = 0.01 }) {
  const part = k.part('foliage', name);
  const ch = k.chart(name, 2 * r, 2 * r, { density: 0.6 });
  const c = part.v([0, y + mound, 0], [0, 1, 0], foliageUV('soil', 0.5, 0.5), ch, [0.5, 0.5]);
  const ring = [];
  for (let j = 0; j <= segs; j++) {
    const a = Math.PI + (2 * Math.PI * j) / segs, x = r * Math.sin(a), z = r * Math.cos(a);
    const u = 0.5 + x / (2 * r), v = 0.5 + z / (2 * r);
    ring.push(part.v([x, y, z], norm([Math.sin(a) * mound / r, 1, Math.cos(a) * mound / r]), foliageUV('soil', u, v), ch, [u, v]));
  }
  for (let j = 0; j < segs; j++) part.tri(c, ring[j], ring[j + 1]);
  return part;
}

// 花盆（陶瓷图集的“花盆”区域）+ 盆土；返回土面高度
function potWithSoil(k, { scale, segs }) {
  vessel3d(k, { name: 'pot', shape: 'planter', segs, scale });
  const y = 0.235 * scale;
  soil(k, { name: 'soil', r: 0.1322 * scale, y, segs: k.q(...segs), mound: 0.012 * scale });
  return y;
}

// —— 琴叶榕：单干柱形，叶片沿干身螺旋（黄金角）排列，下部叶大而下垂，顶部新叶小而直立 ——
const FIG = [[0, 0.03], [0.08, 0.04], [0.16, 0.26], [0.3, 0.52], [0.44, 0.63], [0.56, 0.64], [0.7, 0.86], [0.82, 0.98], [0.91, 0.84], [0.97, 0.5], [1, 0]];

export const fiddleFig = {
  id: 'fiddle_fig',
  name: '琴叶榕',
  nameEn: 'Fiddle-leaf Fig',
  category: 'decor',
  // 接触阴影只收近地的遮挡：高处树冠对地面的“天光遮挡”会铺成一大片方形的灰
  shadow: { maxDist: 0.6 },
  build(k) {
    const q = (...v) => k.q(...v);
    const soilY = potWithSoil(k, { scale: 1, segs: [26, 18, 12] });
    const stem = bezier3([0, soilY - 0.03, 0], [0.035, 0.62, 0.025], [-0.045, 1.05, -0.012], [0.012, 1.56, 0.004]);
    trunk(k, { name: 'trunk', curve: stem, n: q(8, 5, 3), r0: 0.014, r1: 0.005, segs: q(7, 5, 4) });
    const rows = q([0, 0.08, 0.16, 0.3, 0.44, 0.7, 0.82, 0.91, 0.97, 1], [0, 0.16, 0.44, 0.82, 0.96, 1], [0, 0.7, 1]);
    const r = k.rand('leaves');
    const N = 28;
    for (let i = 0; i < N; i++) {
      const h = i / (N - 1); // 0 最下，1 顶端
      const t = 0.24 + 0.76 * h ** 0.8;
      const young = Math.max(0, (h - 0.84) / 0.16);
      const L = (0.4 - 0.05 * h - 0.17 * young) * (0.9 + 0.2 * r());
      const W = L * (0.33 + 0.04 * r());
      const az = i * 2.39996 + (r() - 0.5) * 0.5;
      const el = 0.2 + 0.6 * h ** 1.4 + 0.55 * young + (r() - 0.5) * 0.2;
      const droop = (1.05 - 0.6 * h - 0.3 * young) * (0.85 + 0.3 * r());
      const roll = (r() - 0.5) * 0.4;
      const fold = 0.2 + 0.1 * r() + 0.3 * young;
      const p = stem(t);
      const base = [p[0] + Math.sin(az) * 0.008, p[1], p[2] + Math.cos(az) * 0.008];
      leaf(k, {
        name: `leaf${i}`, region: 'fig', L, W, outline: FIG, rows, fold, droop, wave: 0.018, phase: r() * 6.28,
        place: xf({ pos: base, rot: [-el, az, 0] }).mul(xf({ rot: [0, 0, roll] })),
      });
    }
  },
};

// —— 虎尾兰（金边）：一丛直立的剑形叶，叶片带 V 形槽、向外微弯、各自扭转 ——
const SNAKE = [[0, 0.5], [0.12, 0.82], [0.3, 1], [0.6, 0.96], [0.8, 0.8], [0.92, 0.48], [1, 0]];

export const snakePlant = {
  id: 'snake_plant',
  name: '虎尾兰',
  nameEn: 'Snake Plant',
  category: 'decor',
  shadow: { maxDist: 0.32 },
  build(k) {
    const q = (...v) => k.q(...v);
    const S = 0.72;
    const soilY = potWithSoil(k, { scale: S, segs: [22, 16, 10] });
    const rows = q([0, 0.12, 0.3, 0.5, 0.7, 0.85, 0.94, 1], [0, 0.3, 0.7, 0.92, 1], [0, 0.6, 1]);
    // [x, z, 高度, 朝向, 外倾, 扭转, 半宽]
    const blades = [
      [0.004, -0.006, 0.66, 0.3, 0.05, 0.5, 0.03], [-0.016, 0.01, 0.58, 2.4, 0.12, -0.6, 0.032],
      [0.02, 0.016, 0.62, 1.2, 0.1, 0.8, 0.028], [-0.006, -0.03, 0.54, 3.5, 0.14, 0.4, 0.034],
      [0.03, -0.018, 0.5, -0.9, 0.18, -0.7, 0.031], [-0.034, -0.008, 0.46, 4.4, 0.22, 0.9, 0.029],
      [0.012, 0.038, 0.44, 0.9, 0.24, -0.5, 0.033], [-0.03, 0.034, 0.4, 2.0, 0.28, 0.6, 0.03],
      [0.042, 0.012, 0.36, 1.6, 0.32, -0.9, 0.027], [-0.012, -0.046, 0.34, 3.1, 0.34, 0.7, 0.03],
    ];
    blades.forEach(([x, z, L, az, lean, twist, W], i) => {
      leaf(k, {
        name: `blade${i}`, region: 'snake', L, W, outline: SNAKE, rows, fold: 0.32, droop: 0.12 + lean * 0.6, twist,
        place: xf({ pos: [x, soilY - 0.012, z], rot: [-(Math.PI / 2 - lean), az, 0] }),
      });
    });
  },
};
