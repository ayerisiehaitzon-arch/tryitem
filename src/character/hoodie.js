// 卫衣的配件：放下来搭在背上的帽子、领口垂下的两根抽绳、肚子上的袋鼠兜。
// 都从身体（静止姿势）的躯干表面长出来：躯干控制点是一张 圈 × 列 的网格（T0 … T11，每圈 20 列；j = 0 正前方、5 左侧、10 背后、15 右侧），
// 在这张网格上双线性插值出表面上的点、法线、骨骼权重，再沿法线往外推（让过卫衣本身的厚度）。
// 返回一个网格：position / normal / uv / index，外加 skinIndex / skinWeight（和身体同一套骨头）。

import { JOINTS, skinWeights, top4 } from './rig.js';

const NJ = JOINTS.length;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// 躯干表面：surf(r, j) → { p, n, w }（r 是圈，可以是小数；j 是列，小数，绕一周 0 … 20）
function torsoSurface(topo, cage, cageN, W) {
  const T = topo.T, NC = T[0].length;
  // 胳膊洞那几个空位：用同一圈左右的邻点补
  const idx = T.map((ring) => ring.map((v, j) => {
    if (v >= 0) return [v];
    let a = (j + NC - 1) % NC, b = (j + 1) % NC;
    while (ring[a] < 0) a = (a + NC - 1) % NC;
    while (ring[b] < 0) b = (b + 1) % NC;
    return [ring[a], ring[b]];
  }));
  const vec = (src, vs) => { const o = [0, 0, 0]; for (const v of vs) for (let k = 0; k < 3; k++) o[k] += src[v * 3 + k] / vs.length; return o; };
  const wts = (vs) => {
    const o = new Float32Array(NJ);
    for (const v of vs) for (let k = 0; k < 3; k++) { const w = W.w[v * 3 + k]; if (w) o[W.idx[v * 3 + k]] += w / vs.length; }
    return o;
  };
  const P = idx.map((ring) => ring.map((vs) => vec(cage, vs)));
  const N = idx.map((ring) => ring.map((vs) => vec(cageN, vs)));
  const Wt = idx.map((ring) => ring.map(wts)); // 12 × 20 个点，各 17 个权重
  // 权重只在要落点的时候才插（ringBelow 往下量距离时只要位置）
  return (r, j, withW = true) => {
    const r0 = Math.max(0, Math.min(T.length - 2, Math.floor(r))), tr = Math.min(1, Math.max(0, r - r0));
    const jj = ((j % NC) + NC) % NC, j0 = Math.floor(jj), tj = jj - j0, j1 = (j0 + 1) % NC;
    const bil = (A, k) => lerp(lerp(A[r0][j0][k], A[r0][j1][k], tj), lerp(A[r0 + 1][j0][k], A[r0 + 1][j1][k], tj), tr);
    const p = [bil(P, 0), bil(P, 1), bil(P, 2)];
    if (!withW) return { p };
    const n = [bil(N, 0), bil(N, 1), bil(N, 2)];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= l; n[1] /= l; n[2] /= l;
    const w = new Float32Array(NJ);
    for (let k = 0; k < NJ; k++) w[k] = bil(Wt, k);
    return { p, n, w };
  };
}

// 网格累加器：四边形网格 + 每个点的骨骼权重（稠密 17 列）
function mesher() {
  const P = [], UV = [], Wd = [], I = [];
  return {
    P, UV, Wd, I,
    vert(p, uv, w) { P.push(p); UV.push(uv); Wd.push(w); return P.length - 1; },
    grid(rows, cols, closedCols = false) {
      // rows × cols 个点已经按行连续加进来了（从 base 开始）
      const base = P.length - rows * cols;
      const cc = closedCols ? cols : cols - 1;
      for (let a = 0; a < rows - 1; a++) for (let b = 0; b < cc; b++) {
        const b1 = (b + 1) % cols;
        const v00 = base + a * cols + b, v01 = base + a * cols + b1, v10 = base + (a + 1) * cols + b, v11 = base + (a + 1) * cols + b1;
        I.push(v00, v10, v11, v00, v11, v01);
      }
    },
  };
}

// 法线：按三角形面积加权平均
function normals(P, I) {
  const N = new Float32Array(P.length * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = P[I[t]], b = P[I[t + 1]], c = P[I[t + 2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [I[t], I[t + 1], I[t + 2]]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
  }
  for (let i = 0; i < P.length; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
  return N;
}

// 沿着躯干表面某一列往下量 dist 米，返回那一点的圈号（小数）
function ringBelow(surf, r0, j, dist) {
  let r = r0, left = dist;
  while (left > 0 && r > 0.05) {
    const a = surf(r, j, false).p, rn = Math.max(0, r - 0.25), b = surf(rn, j, false).p;
    const seg = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (seg >= left) return r - 0.25 * (left / seg);
    left -= seg; r = rn;
  }
  return r;
}

export function hoodieExtras(topo, cage, cageN, W) {
  W ??= skinWeights(topo);
  const surf = torsoSurface(topo, cage, cageN, W);
  const m = mesher();
  const EASE = 0.017; // 卫衣在背上推出去的松量 + 一点余量
  const R11 = topo.T.length - 1;

  // —— 帽子：一个两层的布袋，上沿缝在领口后半圈，往下搭在背上；中间垂得最深（约 19cm），两侧收成领口边上的一圈卷边 ——
  // 截面：外层从领口往下鼓出去、到下沿翻过来、内层贴着卫衣回到领口，围成一圈
  const K = 25, M = 9; // 沿领口 K 个截面，每层 M 个点
  for (let a = 0; a < K; a++) {
    const u = (a / (K - 1)) * 2 - 1; // −1 … 1（右前 … 背后 … 左前）
    const c = Math.cos((u * Math.PI) / 2);
    const j = 10 - 7.6 * u;
    const depth = 0.035 + 0.155 * c * c, thick = 0.006 + 0.026 * c * c ** 0.5;
    const rTop = R11 + 0.15;
    const loop = [];
    for (let i = 0; i < M; i++) { // 外层：领口 → 下沿
      const w = i / (M - 1);
      const r = ringBelow(surf, rTop, j, depth * w);
      const s = surf(r, j);
      const bulge = Math.sin(Math.PI * Math.min(1, w * 1.08)) ** 0.7;
      loop.push({ p: s.p.map((x, k) => x + s.n[k] * (EASE + thick * bulge + 0.004 * (1 - w))), w: s.w, uv: [u * 0.25, w * depth] });
    }
    for (let i = M - 2; i >= 1; i--) { // 内层：下沿 → 领口
      const w = i / (M - 1);
      const r = ringBelow(surf, rTop, j, depth * w * 0.97);
      const s = surf(r, j);
      loop.push({ p: s.p.map((x, k) => x + s.n[k] * (EASE + 0.002)), w: s.w, uv: [u * 0.25, 0.3 + w * depth] });
    }
    for (const q of loop) m.vert(q.p, q.uv, q.w);
  }
  m.grid(K, 2 * M - 2, true);

  // —— 抽绳：领口正前方两侧各一根，沿胸口垂下来，末端一截金属扣头（粗一点） ——
  for (const side of [1, -1]) {
    const j0 = side * 0.75, L = 0.19, S = 14, RN = 6;
    const pts = [];
    for (let i = 0; i <= S; i++) {
      const d = (i / S) * L;
      const r = ringBelow(surf, R11 - 0.05, j0 - side * 0.25 * (i / S), d);
      const s = surf(r, j0 - side * 0.25 * (i / S));
      pts.push({ p: s.p.map((x, k) => x + s.n[k] * (EASE + 0.002)), n: s.n, w: s.w, tip: d > L - 0.026 });
    }
    for (let i = 0; i <= S; i++) {
      const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(S, i + 1)].p;
      const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], tl = Math.hypot(...t) || 1;
      const T = t.map((x) => x / tl), n = pts[i].n;
      const bx = [T[1] * n[2] - T[2] * n[1], T[2] * n[0] - T[0] * n[2], T[0] * n[1] - T[1] * n[0]];
      const rad = pts[i].tip ? 0.0042 : 0.0029;
      for (let k = 0; k < RN; k++) {
        const ang = (k / RN) * TAU, cs = Math.cos(ang) * rad, sn = Math.sin(ang) * rad;
        m.vert(pts[i].p.map((x, q) => x + n[q] * cs + bx[q] * sn), [k / RN * 0.02, i / S * L], pts[i].w);
      }
    }
    m.grid(S + 1, RN, true);
  }

  // —— 袋鼠兜：肚子上一块梯形的布，比卫衣高出 4mm，四边收回到卫衣上；上沿窄、下沿宽，两侧斜着开口 ——
  {
    const GU = 13, GV = 7;
    const rBot = 2.2, rTopP = 4.6;
    for (let b = 0; b < GV; b++) {
      const v = b / (GV - 1);
      const r = lerp(rBot, rTopP, v);
      const half = lerp(3.3, 2.3, v);
      for (let a = 0; a < GU; a++) {
        const u = (a / (GU - 1)) * 2 - 1;
        const s = surf(r, u * half);
        const edge = Math.min(smooth((1 - Math.abs(u)) / 0.12), smooth(v / 0.18), smooth((1 - v) / 0.1));
        // 卫衣在这一带推出去的松量（clothes.js：0.014，腰下几圈上衣还要多让 0.0065 罩住裤腰）
        const base = 0.014 + 0.0065 * smooth((4.5 - r) / 1.5) + 0.002;
        m.vert(s.p.map((x, k) => x + s.n[k] * (base - 0.003 + 0.0065 * edge)), [u * half * 0.046, r * 0.055], s.w);
      }
    }
    m.grid(GV, GU, false);
  }

  const n = m.P.length;
  const position = new Float32Array(n * 3), uv = new Float32Array(n * 2), D = new Float32Array(n * NJ);
  m.P.forEach((p, i) => position.set(p, i * 3));
  m.UV.forEach((t, i) => uv.set(t, i * 2));
  m.Wd.forEach((w, i) => D.set(w, i * NJ));
  const index = new Uint32Array(m.I);
  return { position, normal: normals(m.P, m.I), uv, index, ...top4(D) };
}
