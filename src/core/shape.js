// 2D 轮廓：由若干“线段”组成（闭合截面或开放的车削轮廓）。
//
// 每条线段自带两端的法线 na/nb。这是整个工具链“低面数也好看”的关键：
//   · 倒角 / 圆角线段两端的法线直接取相邻主面的法线（加权法线），
//     所以主面保持绝对平整，倒角那一小条负责把高光“圆”过去；
//   · 锐角处两侧线段法线不同 → 焊接时不会合并 → 硬边；
//   · smooth 顶点两侧法线相同 → 焊接后自动变成平滑过渡。
//
// 线段字段：a, b 端点；na, nb 法线；sa, sb 沿轮廓的弧长；group 分组（用于切分 UV 图块）。

const EPS = 1e-9;

function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function len2(a) { return Math.hypot(a[0], a[1]); }
function norm2(a) { const l = len2(a); return l > EPS ? [a[0] / l, a[1] / l] : [0, 0]; }
// 沿行进方向右手侧为外法线（CCW 闭合图形即向外）
function edgeNormal(a, b) { const d = norm2(sub2(b, a)); return [d[1], -d[0]]; }

/**
 * 通用轮廓构造。
 * pts: [[x, y, opts?], ...]，opts: { r: 圆角半径, segs: 圆角分段(1=倒角), smooth: 平滑顶点, brk: 强制分组断点 }
 */
export function shape(pts, { closed = true, r = 0, segs = 1, smooth = false } = {}) {
  const P = pts.map((q) => {
    const o = q[2] || {};
    return {
      p: [q[0], q[1]],
      r: o.r ?? r,
      segs: Math.max(1, o.segs ?? segs),
      smooth: o.smooth ?? smooth,
      brk: !!o.brk,
    };
  });
  const n = P.length;
  const edgeCount = closed ? n : n - 1;

  // 1) 每个顶点处的圆角
  const fil = P.map((v, i) => {
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    const res = { start: v.p, end: v.p, arc: null, nIn: null, nOut: null };
    const prev = hasPrev ? P[(i - 1 + n) % n].p : null;
    const next = hasNext ? P[(i + 1) % n].p : null;
    if (prev) res.nIn = edgeNormal(prev, v.p);
    if (next) res.nOut = edgeNormal(v.p, next);
    if (!prev || !next || v.r <= 0) return res;
    const dIn = norm2(sub2(v.p, prev));
    const dOut = norm2(sub2(next, v.p));
    const turn = dIn[0] * dOut[1] - dIn[1] * dOut[0];
    const cosPhi = -(dIn[0] * dOut[0] + dIn[1] * dOut[1]);
    const phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
    if (Math.abs(turn) < 1e-6 || phi < 1e-4) return res;
    let t = v.r / Math.tan(phi / 2);
    const maxT = 0.5 * Math.min(len2(sub2(v.p, prev)), len2(sub2(next, v.p)));
    let rr = v.r;
    if (t > maxT) { t = maxT; rr = t * Math.tan(phi / 2); }
    const T1 = [v.p[0] - dIn[0] * t, v.p[1] - dIn[1] * t];
    const T2 = [v.p[0] + dOut[0] * t, v.p[1] + dOut[1] * t];
    const convex = turn > 0;
    const C = convex
      ? [T1[0] - res.nIn[0] * rr, T1[1] - res.nIn[1] * rr]
      : [T1[0] + res.nIn[0] * rr, T1[1] + res.nIn[1] * rr];
    const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    let a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const pts2 = [];
    const nrm = [];
    for (let k = 0; k <= v.segs; k++) {
      const a = a1 + (da * k) / v.segs;
      const c = [Math.cos(a), Math.sin(a)];
      pts2.push([C[0] + c[0] * rr, C[1] + c[1] * rr]);
      nrm.push(convex ? c : [-c[0], -c[1]]);
    }
    // 两端点严格贴合切点，法线严格等于相邻边法线（加权法线）
    pts2[0] = T1; pts2[v.segs] = T2;
    nrm[0] = res.nIn; nrm[v.segs] = res.nOut;
    res.start = T1; res.end = T2;
    res.arc = { pts: pts2, nrm, length: Math.abs(da) * rr };
    // 圆角信息：内缩量超过圆角半径时，整段圆角塌缩到两条主边内缩后的交点
    res.corner = convex ? { P: v.p, R: rr, n1: res.nIn, n2: res.nOut } : null;
    return res;
  });

  // 2) 顶点处的法线（无圆角时）
  const vN = (i, side) => {
    const f = fil[i];
    const v = P[i];
    if (v.smooth && f.nIn && f.nOut) return norm2([f.nIn[0] + f.nOut[0], f.nIn[1] + f.nOut[1]]);
    return side === 'in' ? (f.nIn || f.nOut) : (f.nOut || f.nIn);
  };

  // 3) 输出线段
  const segsOut = [];
  let s = 0;
  let group = 0;
  const isCorner = (i) => {
    const v = P[i];
    return v.brk || v.r > 0 || !v.smooth;
  };
  for (let e = 0; e < edgeCount; e++) {
    const i = e;
    const j = (e + 1) % n;
    if (e > 0 && isCorner(i)) group++;
    const a = fil[i].end;
    const b = fil[j].start;
    const L = len2(sub2(b, a));
    const na = fil[i].arc ? fil[i].nOut : vN(i, 'out');
    const nb = fil[j].arc ? fil[j].nIn : vN(j, 'in');
    if (L > EPS) {
      segsOut.push({ a, b, na, nb, sa: s, sb: s + L, kind: 'edge', group, ka: fil[i].corner || null, kb: fil[j].corner || null });
      s += L;
    }
    // 目标顶点的圆角（闭合图形最后一条边之后的圆角属于顶点 0，已在开头的 fil[0] 中 —— 放到末尾输出）
    const arc = fil[j].arc;
    if (arc && (closed || j < n - 1)) {
      const step = arc.length / (arc.pts.length - 1);
      for (let k = 0; k < arc.pts.length - 1; k++) {
        segsOut.push({
          a: arc.pts[k], b: arc.pts[k + 1], na: arc.nrm[k], nb: arc.nrm[k + 1],
          sa: s + step * k, sb: s + step * (k + 1), kind: 'arc', group,
          ka: fil[j].corner || null, kb: fil[j].corner || null,
        });
      }
      s += arc.length;
    }
  }
  // 闭合图形：如果顶点 0 不是拐角（平滑曲线），首尾同组
  if (closed && !isCorner(0)) for (const sg of segsOut) if (sg.group === group) sg.group = 0;
  return { segs: segsOut, closed, length: s };
}

// —— 常用截面 ——

// 以原点为中心的矩形；r / segs 为四个竖直角的倒角/圆角，corners 可单独指定 [左下, 右下, 右上, 左上]
export function rect(w, h, { r = 0, segs = 1, corners = null } = {}) {
  const x = w / 2, y = h / 2;
  const c = corners || [r, r, r, r];
  return shape([
    [-x, -y, { r: c[0], segs }],
    [x, -y, { r: c[1], segs }],
    [x, y, { r: c[2], segs }],
    [-x, y, { r: c[3], segs }],
  ]);
}

export function circle(radius, n, { phase = 0, rx = null, ry = null } = {}) {
  const pts = [];
  const ax = rx ?? radius, ay = ry ?? radius;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * ax, Math.sin(a) * ay, { smooth: true }]);
  }
  const sh = shape(pts, { smooth: true });
  // 圆的法线用解析值（椭圆时按梯度方向）
  for (const sg of sh.segs) {
    sg.na = norm2([sg.a[0] / (ax * ax), sg.a[1] / (ay * ay)]);
    sg.nb = norm2([sg.b[0] / (ax * ax), sg.b[1] / (ay * ay)]);
  }
  return sh;
}

// 开放轮廓（车削用）：点序自下而上沿外表面走，外法线在行进方向右侧
export function profile(pts, opts = {}) {
  return shape(pts, { ...opts, closed: false });
}

// 对一条曲线函数 f(t) -> [x, y] 采样成平滑点列，端点可附带选项
export function sampleCurve(f, n, { t0 = 0, t1 = 1, first = {}, last = {} } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const p = f(t);
    const o = i === 0 ? { smooth: true, ...first } : i === n ? { smooth: true, ...last } : { smooth: true };
    pts.push([p[0], p[1], o]);
  }
  return pts;
}

// 二次 / 三次贝塞尔
export const bez2 = (p0, p1, p2) => (t) => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};
export const bez3 = (p0, p1, p2, p3) => (t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};

// 轮廓内缩（倒角顶面用）。沿“着色法线”偏移：
//   平滑/加权顶点 → 沿其法线偏移 d；锐角顶点 → 斜接（miter）偏移，保持两边平行。
// 返回与线段一一对应的新端点 [a', b']。
export function insetPoints(sh, d) {
  const out = [];
  const segs = sh.segs;
  const n = segs.length;
  for (let i = 0; i < n; i++) {
    const sg = segs[i];
    const prev = sh.closed ? segs[(i - 1 + n) % n] : i > 0 ? segs[i - 1] : null;
    const next = sh.closed ? segs[(i + 1) % n] : i < n - 1 ? segs[i + 1] : null;
    out.push([offsetAt(sg.a, sg.na, prev ? prev.nb : null, d, sg.ka), offsetAt(sg.b, sg.nb, next ? next.na : null, d, sg.kb)]);
  }
  return out;
}

function offsetAt(p, n, nOther, d, corner) {
  if (corner && d > corner.R - 1e-9) {
    const { P, n1, n2 } = corner;
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    return [P[0] - ((n1[0] + n2[0]) / k) * d, P[1] - ((n1[1] + n2[1]) / k) * d];
  }
  if (!nOther || Math.abs(n[0] - nOther[0]) + Math.abs(n[1] - nOther[1]) < 1e-6) {
    return [p[0] - n[0] * d, p[1] - n[1] * d];
  }
  // 锐角：miter = (n1 + n2) / (1 + n1·n2)
  const k = 1 + n[0] * nOther[0] + n[1] * nOther[1];
  if (k < 1e-3) return [p[0] - n[0] * d, p[1] - n[1] * d];
  return [p[0] - ((n[0] + nOther[0]) / k) * d, p[1] - ((n[1] + nOther[1]) / k) * d];
}

// 2D 多边形三角化（耳切法，优先切出最“饱满”的耳朵，避免细长三角形——
// 细长三角形会浪费 GPU 的 2x2 像素块着色效率）。
// 返回指向 poly 下标的三角形，统一为 2D 逆时针（正面积）绕序。
export function triangulate(poly) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const idx = [];
  for (let i = 0; i < poly.length; i++) {
    if (!idx.length || d(poly[i], poly[idx[idx.length - 1]]) > 1e-7) idx.push(i);
  }
  while (idx.length > 1 && d(poly[idx[0]], poly[idx[idx.length - 1]]) <= 1e-7) idx.pop();
  if (idx.length < 3) return [];
  const V = idx.slice();
  if (signedArea(V.map((i) => poly[i])) < 0) V.reverse();
  const tris = [];
  let guard = 0;
  while (V.length > 3 && guard++ < 10000) {
    let best = -1, bestQ = -Infinity;
    for (let i = 0; i < V.length; i++) {
      const ia = V[(i - 1 + V.length) % V.length], ib = V[i], ic = V[(i + 1) % V.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cr <= 1e-14) continue; // 凹顶点或共线
      let inside = false;
      for (let j = 0; j < V.length && !inside; j++) {
        const pj = V[j];
        if (pj === ia || pj === ib || pj === ic) continue;
        if (pointInTri(poly[pj], a, b, c)) inside = true;
      }
      if (inside) continue;
      const q = triQuality(a, b, c);
      if (q > bestQ) { bestQ = q; best = i; }
    }
    if (best < 0) {
      // 只剩共线点：去掉面积最小的顶点
      best = 0;
    }
    const i = best;
    const ia = V[(i - 1 + V.length) % V.length], ib = V[i], ic = V[(i + 1) % V.length];
    const a = poly[ia], b = poly[ib], c = poly[ic];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cr > 1e-14) tris.push([ia, ib, ic]);
    V.splice(i, 1);
  }
  if (V.length === 3) {
    const [a, b, c] = V.map((i) => poly[i]);
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cr > 1e-14) tris.push([V[0], V[1], V[2]]);
  }
  return tris;
}

function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a / 2;
}
function pointInTri(p, a, b, c) {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
  const pos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
  return !(neg && pos);
}
// 三角形质量：面积 / 最长边² （越大越接近正三角形）
function triQuality(a, b, c) {
  const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const l = Math.max(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2,
    (b[0] - c[0]) ** 2 + (b[1] - c[1]) ** 2,
    (c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2,
  );
  return ar / (l + 1e-18);
}
