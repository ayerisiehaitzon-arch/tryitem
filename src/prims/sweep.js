import { rmFrames } from '../core/path.js';
import { triangulate } from '../core/shape.js';

/**
 * 截面沿 3D 路径扫掠 —— 弯管钢架、弧形靠背、灯臂、脚踏圈……
 *
 *   shape   截面（闭合或开放），截面 x → 标架 R，y → 标架 U
 *   path    3D 点列（已按 LOD 采样好）
 *   closed  路径首尾相接（圆环）
 *   caps    [起点, 终点] 是否封口
 *   up      初始标架的参考“上”方向
 *   grain   'len' 纹理 u 沿路径 / 'across' 沿截面
 *   scale   可选 f(t∈[0,1]) → 截面缩放
 */
export function sweep(k, o) {
  const {
    name, mat, shape: sh, path, closed = false, caps = [true, true], up = [0, 1, 0],
    grain = 'len', density = {}, xf = null, maxChart = 0.9, scale = null,
  } = o;
  const part = k.part(mat, name);
  const pts = closed ? [...path, path[0]] : path;
  const F = rmFrames(pts, up, closed);
  const n = pts.length;
  const S = [0];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const Ltot = S[n - 1];
  const sc = (i) => (scale ? scale(S[i] / Ltot) : 1);
  const at = (i, x, y) => {
    const s = sc(i);
    return [
      pts[i][0] + F.R[i][0] * x * s + F.U[i][0] * y * s,
      pts[i][1] + F.R[i][1] * x * s + F.U[i][1] * y * s,
      pts[i][2] + F.R[i][2] * x * s + F.U[i][2] * y * s,
    ];
  };
  const nrm = (i, n2) => [
    F.R[i][0] * n2[0] + F.U[i][0] * n2[1],
    F.R[i][1] * n2[0] + F.U[i][1] * n2[1],
    F.R[i][2] * n2[0] + F.U[i][2] * n2[1],
  ];

  const K = k.pieces(`${name}:w`, Ltot, maxChart);
  const P = sh.length;
  for (let p = 0; p < K; p++) {
    // 找到这一片覆盖的路径点区间
    let i0 = 0, i1 = n - 1;
    const sA = (p * Ltot) / K, sB = ((p + 1) * Ltot) / K;
    for (let i = 0; i < n; i++) if (S[i] <= sA + 1e-9) i0 = i;
    for (let i = n - 1; i >= 0; i--) if (S[i] >= sB - 1e-9) i1 = i;
    if (p === K - 1) i1 = n - 1;
    if (i1 <= i0) continue;
    const ch = k.chart(`${name}:w.${p}`, P, S[i1] - S[i0], { density: density.side ?? 1 });
    for (const sg of sh.segs) {
      let prevA = -1, prevB = -1;
      for (let i = i0; i <= i1; i++) {
        const cu = (s2) => [s2 / P, (S[i] - S[i0]) / (S[i1] - S[i0])];
        const tA = grain === 'len' ? [S[i], sg.sa] : [sg.sa, S[i]];
        const tB = grain === 'len' ? [S[i], sg.sb] : [sg.sb, S[i]];
        const a = part.v(at(i, sg.a[0], sg.a[1]), nrm(i, sg.na), tA, ch, cu(sg.sa));
        const b = part.v(at(i, sg.b[0], sg.b[1]), nrm(i, sg.nb), tB, ch, cu(sg.sb));
        if (prevA >= 0) part.quad(prevA, prevB, b, a);
        prevA = a; prevB = b;
      }
    }
  }

  // 封口
  if (!closed && sh.closed) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sg of sh.segs) {
      minX = Math.min(minX, sg.a[0]); maxX = Math.max(maxX, sg.a[0]);
      minY = Math.min(minY, sg.a[1]); maxY = Math.max(maxY, sg.a[1]);
    }
    const poly = sh.segs.map((sg) => sg.a);
    const tris = triangulate(poly);
    for (const end of [0, 1]) {
      if (!caps[end]) continue;
      const i = end ? n - 1 : 0;
      const ch = k.chart(`${name}:c${end}`, maxX - minX, maxY - minY, { density: density.cap ?? 0.5 });
      const dir = end ? F.T[i] : F.T[i].map((v) => -v);
      const ids = poly.map(([x, y]) => part.v(at(i, x, y), dir, [x, y], ch,
        [(x - minX) / (maxX - minX + 1e-9), (y - minY) / (maxY - minY + 1e-9)]));
      for (const [a, b, c] of tris) part.tri(ids[a], ids[b], ids[c]);
    }
  }
  if (xf) part.transform(xf);
  return part;
}
