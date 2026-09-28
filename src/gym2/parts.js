import { gym2Swatch } from '../materials/atlas.js';

// 健身房二几件器材共用的小工具
// 部件整个指向图集里的一个纯色格子
export function sw(part, name) {
  const uv = gym2Swatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 按顶点位置（和法线）给 UV
export function mapUV(part, f) {
  part.T = part.P.map((p, i) => f(p, part.N[i]));
  return part;
}
// 把截面点列（[x, y, opts?]）整理成逆时针（外法线朝外）
export function ccw(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a < 0 ? [...pts].reverse() : pts;
}
// 穿过一串 3D 点的平滑曲线（均匀 Catmull-Rom，两端外插），每段 n 份
export function catmull(P, n) {
  const out = [];
  const ext = (a, b) => a.map((v, j) => 2 * v - b[j]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = i > 0 ? P[i - 1] : ext(P[0], P[1]), p1 = P[i], p2 = P[i + 1];
    const p3 = i + 2 < P.length ? P[i + 2] : ext(P[i + 1], P[i]);
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
// 折线上按弧长截取 [s0, s1] 一段（两端插值）
export function subPath(pts, s0, s1) {
  const S = [0];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(...pts[i].map((v, j) => v - pts[i - 1][j])));
  const at = (s) => {
    let i = 1;
    while (i < pts.length - 1 && S[i] < s) i++;
    const t = (s - S[i - 1]) / (S[i] - S[i - 1] || 1);
    return pts[i - 1].map((v, j) => v + (pts[i][j] - v) * t);
  };
  const out = [at(s0)];
  for (let i = 0; i < pts.length; i++) if (S[i] > s0 + 1e-4 && S[i] < s1 - 1e-4) out.push(pts[i]);
  out.push(at(s1));
  return out;
}
export const pathLength = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(...p.map((v, j) => v - pts[i - 1][j])) : 0), 0);
// 两个圆（截面坐标）的凸包：皮带罩、曲柄这种“两头圆”的轮廓
export function hull2([c1, r1, n1], [c2, r2, n2]) {
  const pts = [];
  for (const [c, r, n] of [[c1, r1, n1], [c2, r2, n2]]) {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map(([x, y]) => [x, y, { smooth: true }]);
}
// 绕 x 轴转多少，能把 +y 转到 (0, dy, dz) 方向
export const tiltX = (dy, dz) => Math.atan2(dz, dy);
