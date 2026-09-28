import { triangulate } from '../core/shape.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * 放样：一串闭合的截面环（点数相同、起点对齐），自下而上逐环连成一个管状曲面 ——
 * 马桶的底座和盆这种“每一层都是不同形状”的造型（车削只能做圆，挤出只能做直筒）。
 *
 *   rings   [[p0, p1, …], …] 3D 点，从下到上；每个环的第 0 点是接缝，放在看不见的一侧（贴墙那边）
 *   caps    [底, 顶] 是否封口（截面环是水平的平面多边形，按耳切法三角化）
 *   density { side, cap0, cap1 } AO 纹素密度倍率
 *   orient  可选 (i, j) → 方向：第 i 环第 j 点的“外侧”大致朝哪。又薄又带褶的截面（挂着的衣服）用环中心判断会翻错，
 *           这时由调用者直接告诉哪边是外面
 *
 * 法线：环向、纵向各取中心差分再叉乘，整个曲面是平滑的（低面数也不显棱）；
 * 朝向环中心的法线翻过来，所以不用关心环的绕向。侧面一个 AO 图块：u 沿环（弧长归一化），v 沿纵向。
 */
export function loft(k, { name, mat, rings, caps = [false, false], density = {}, orient = null }) {
  const part = k.part(mat, name);
  const n = rings[0].length, m = rings.length;
  const centroid = (ring) => ring.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]);
  const C = rings.map(centroid);
  // 每个环的累计弧长（u）和每一列的累计长度（v）
  const U = rings.map((ring) => {
    const s = [0];
    for (let j = 1; j <= n; j++) s.push(s[j - 1] + len(sub(ring[j % n], ring[j - 1])));
    return s;
  });
  const colLen = [0];
  for (let i = 1; i < m; i++) {
    let d = 0;
    for (let j = 0; j < n; j++) d += len(sub(rings[i][j], rings[i - 1][j])) / n;
    colLen.push(colLen[i - 1] + d);
  }
  const H = colLen[m - 1];
  const W = Math.max(...U.map((s) => s[n]));
  const ch = k.chart(`${name}:w`, W, H, { density: density.side ?? 1 });
  const ids = [];
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j <= n; j++) {
      const jj = j % n;
      const P = rings[i][jj];
      const Tu = sub(rings[i][(jj + 1) % n], rings[i][(jj - 1 + n) % n]);
      const Tv = sub(rings[Math.min(m - 1, i + 1)][jj], rings[Math.max(0, i - 1)][jj]);
      let N = cross(Tu, Tv);
      if (dot(N, orient ? orient(i, jj) : sub(P, C[i])) < 0) N = [-N[0], -N[1], -N[2]];
      const u = U[i][j] / U[i][n], v = colLen[i] / H;
      row.push(part.v(P, N, [U[i][j], colLen[i]], ch, [u, v]));
    }
    ids.push(row);
  }
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) part.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]);
  // 封口：水平的环，法线朝下（底）或朝上（顶）
  for (const [end, i] of [[0, 0], [1, m - 1]]) {
    if (!caps[end]) continue;
    const ring = rings[i];
    const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const cc = k.chart(`${name}:c${end}`, x1 - x0, z1 - z0, { density: density[`cap${end}`] ?? 1 });
    const nrm = [0, end ? 1 : -1, 0];
    const vs = ring.map((p) => part.v(p, nrm, [p[0], p[2]], cc, [(p[0] - x0) / (x1 - x0), (p[2] - z0) / (z1 - z0)]));
    for (const [a, b, c] of triangulate(ring.map((p) => [p[0], p[2]]))) part.tri(vs[a], vs[b], vs[c]);
  }
  return part;
}
