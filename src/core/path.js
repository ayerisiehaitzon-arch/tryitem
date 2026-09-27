import { add, sub, scale, norm, len, dot, cross, madd } from './vec.js';

// 3D 路径工具（给 sweep 用）

// 折线拐角倒圆：points 为 3D 点，radius 为圆角半径（可为数组逐点指定），segs 为每个圆角的分段
export function roundedPath(points, radius, segs = 4) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const P = points[i];
    const r = Array.isArray(radius) ? radius[i] : radius;
    const dIn = norm(sub(P, points[i - 1]));
    const dOut = norm(sub(points[i + 1], P));
    const cosT = Math.max(-1, Math.min(1, dot(dIn, dOut)));
    const turn = Math.acos(cosT); // 转角
    if (r <= 0 || turn < 1e-4) { out.push(P); continue; }
    const phi = Math.PI - turn; // 两边夹角
    let t = r / Math.tan(phi / 2);
    const maxT = 0.5 * Math.min(len(sub(P, points[i - 1])), len(sub(points[i + 1], P)));
    let rr = r;
    if (t > maxT) { t = maxT; rr = t * Math.tan(phi / 2); }
    const T1 = madd(P, dIn, -t);
    const T2 = madd(P, dOut, t);
    const bis = norm(sub(dOut, dIn));
    const C = madd(P, bis, rr / Math.sin(phi / 2));
    const v1 = sub(T1, C), v2 = sub(T2, C);
    const n = Math.max(1, segs);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * turn;
      // 在 v1、v2 张成的平面内做球面插值
      const s = Math.sin(turn);
      const w1 = Math.sin(turn - a) / s, w2 = Math.sin(a) / s;
      out.push(add(C, add(scale(v1, w1), scale(v2, w2))));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// 参数曲线采样 f(t) -> [x,y,z]
export function sampleCurve3(f, n, t0 = 0, t1 = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(f(t0 + ((t1 - t0) * i) / n));
  return out;
}

export const bezier3 = (p0, p1, p2, p3) => (t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
};

// 旋转最小化标架（双反射法，Wang et al. 2008）：沿路径不会无故扭转
export function rmFrames(pts, up = [0, 1, 0], closed = false) {
  const n = pts.length;
  const T = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 2] : null;
    const next = i < n - 1 ? pts[i + 1] : closed ? pts[1] : null;
    let t;
    if (prev && next) t = add(norm(sub(pts[i], prev)), norm(sub(next, pts[i])));
    else if (next) t = sub(next, pts[i]);
    else t = sub(pts[i], prev);
    T.push(norm(t));
  }
  let U0 = sub(up, scale(T[0], dot(up, T[0])));
  if (len(U0) < 1e-6) {
    const alt = Math.abs(T[0][0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    U0 = sub(alt, scale(T[0], dot(alt, T[0])));
  }
  const U = [norm(U0)];
  for (let i = 0; i < n - 1; i++) {
    const v1 = sub(pts[i + 1], pts[i]);
    const c1 = dot(v1, v1);
    if (c1 < 1e-14) { U.push(U[i]); continue; }
    const rL = sub(U[i], scale(v1, (2 / c1) * dot(v1, U[i])));
    const tL = sub(T[i], scale(v1, (2 / c1) * dot(v1, T[i])));
    const v2 = sub(T[i + 1], tL);
    const c2 = dot(v2, v2);
    const u = c2 < 1e-14 ? rL : sub(rL, scale(v2, (2 / c2) * dot(v2, rL)));
    U.push(norm(u));
  }
  // R = U × T，使 (R, U, T) 右手系
  const R = U.map((u, i) => norm(cross(u, T[i])));
  return { T, U, R };
}
