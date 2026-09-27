import { Xform } from '../core/vec.js';
import { insetPoints, triangulate } from '../core/shape.js';

// 规范空间：截面在 XY 平面，沿 +Z 从 0 挤出到 depth。axis 决定挤出方向映射到哪个轴。
export const AXIS = {
  z: new Xform(),
  y: new Xform([1, 0, 0, 0, 0, 1, 0, -1, 0]), // 截面 X→X，截面 Y→-Z，挤出→+Y
  x: new Xform([0, 0, 1, 0, 1, 0, -1, 0, 0]), // 截面 X→-Z，截面 Y→Y，挤出→+X
};

/**
 * 带倒角的挤出体 —— 桌面、腿、横档、层板、抽屉面板等绝大多数硬质部件都用它。
 *
 *   shape    闭合截面（竖直棱的倒角/圆角在截面里定义）
 *   depth    挤出长度
 *   bevel    两端封口的倒角：数字 r，或 { w: 内收宽度, h: 高度, flat: 平面着色 }，
 *            或 [起始端, 末端]。默认用加权法线（倒角当圆角着色）；
 *            大而明显的斜面（如桌面下沿的“刀口”）用 flat: true 保持平整。
 *   bsegs    封口倒角分段（1 = 倒角，2+ = 圆角/椭圆角）
 *   caps     [起始端, 末端] 是否生成封口（被遮挡的面直接不要，省面数）
 *   taper    末端截面缩放（锥形腿）
 *   axis     'x' | 'y' | 'z'
 *   center   是否沿挤出方向居中
 *   grain    木纹方向：'len' 沿挤出方向，'across' 沿截面周长，'auto' 自动
 *   capAngle 封口面上 UV0 的旋转（弧度）
 *   density  { side, cap0, cap1 } AO 图集纹素密度倍率（看不见的面可以给低一点）
 *   xf       摆放变换
 */
export function extrude(k, o) {
  const {
    name, mat, shape: sh, depth,
    bevel = 0, bsegs = 1, caps = [true, true], taper = 1,
    axis = 'z', center = false, grain = 'auto', capAngle = 0,
    density = {}, xf = null, maxChart = 0.9,
  } = o;
  const part = k.part(mat, name);
  const spec = (b) => (typeof b === 'number' ? { w: b, h: b, flat: false } : { w: b.w, h: b.h ?? b.w, flat: !!b.flat });
  const [bv0, bv1] = (Array.isArray(bevel) ? bevel : [bevel, bevel]).map(spec);
  const B = [caps[0] && bv0.w > 0 ? bv0 : { w: 0, h: 0 }, caps[1] && bv1.w > 0 ? bv1 : { w: 0, h: 0 }];
  const z0 = B[0].h, z1 = depth - B[1].h;
  const sig = (z) => 1 + ((taper - 1) * z) / depth;
  const dsig = (taper - 1) / depth;
  const g = grain === 'auto' ? (depth >= 0.5 * sh.length ? 'len' : 'across') : grain;

  // 截面包围盒（封口图块用）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const sg of sh.segs) for (const p of [sg.a, sg.b]) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const W = maxX - minX, H = maxY - minY;
  const ca = Math.cos(capAngle), sa = Math.sin(capAngle);
  const capUV0 = (x, y) => [x * ca - y * sa, x * sa + y * ca];

  // 锥形侧面的真实法线：(n2d, -σ'(p·n2d))
  const sideN = (p, n2) => [n2[0], n2[1], -dsig * (p[0] * n2[0] + p[1] * n2[1])];

  // —— 侧面 ——
  const groups = new Map();
  for (const sg of sh.segs) {
    if (!groups.has(sg.group)) groups.set(sg.group, []);
    groups.get(sg.group).push(sg);
  }
  for (const [gi, list] of groups) {
    const s0 = list[0].sa;
    const L = list[list.length - 1].sb - s0;
    const K = k.pieces(`${name}:s${gi}`, L * Math.max(1, taper), maxChart);
    // 每段属于哪一片
    const pieceOf = list.map((sg) => Math.min(K - 1, Math.floor((((sg.sa + sg.sb) / 2 - s0) / L) * K)));
    for (let pi = 0; pi < K; pi++) {
      const mine = list.filter((_, i) => pieceOf[i] === pi);
      if (!mine.length) continue;
      const ps0 = mine[0].sa, ps1 = mine[mine.length - 1].sb;
      const ch = k.chart(`${name}:s${gi}.${pi}`, (ps1 - ps0) * Math.max(1, taper), depth, { density: density.side ?? 1 });
      for (const sg of mine) {
        const vtx = (p2, n2, s, z) => {
          const sc = sig(z);
          const pos = [p2[0] * sc, p2[1] * sc, z];
          const t = g === 'len' ? [z, s] : [s, z];
          return part.v(pos, sideN(p2, n2), t, ch, [(s - ps0) / (ps1 - ps0), z / depth]);
        };
        const a0 = vtx(sg.a, sg.na, sg.sa, z0);
        const b0v = vtx(sg.b, sg.nb, sg.sb, z0);
        const b1v = vtx(sg.b, sg.nb, sg.sb, z1);
        const a1 = vtx(sg.a, sg.na, sg.sa, z1);
        part.quad(a0, b0v, b1v, a1);
      }
    }
  }

  // —— 封口 + 倒角环 ——
  const capChart = (end) => k.chart(`${name}:c${end}`, W * (end ? taper : 1), H * (end ? taper : 1), {
    density: (end ? density.cap1 : density.cap0) ?? 1,
  });
  for (const end of [0, 1]) {
    if (!caps[end]) continue;
    const bv = B[end];
    const dirZ = end ? 1 : -1;
    const ch = capChart(end);
    const cuv = (x, y, sc) => {
      const u = (x / sc - minX) / W, v = (y / sc - minY) / H;
      return [end ? u : 1 - u, v];
    };
    const n = bv.w > 0 ? (bv.flat ? 1 : Math.max(1, bsegs)) : 0;
    const levels = [];
    for (let i = 0; i <= n; i++) {
      const phi = n ? (i / n) * (Math.PI / 2) : Math.PI / 2;
      const d = bv.w * (1 - Math.cos(phi));
      const z = end ? z1 + bv.h * Math.sin(phi) : z0 - bv.h * Math.sin(phi);
      levels.push({ phi, z, pts: d > 0 ? insetPoints(sh, d) : sh.segs.map((sg) => [sg.a, sg.b]) });
    }
    // 倒角环：椭圆弧的法线 ∝ (h·cosφ, w·sinφ)；flat 时整条斜面用同一个法线
    for (let i = 0; i < n; i++) {
      const A = levels[i], Bl = levels[i + 1];
      const vtx = (p2, n2, lev) => {
        const sc = sig(lev.z);
        const x = p2[0] * sc, y = p2[1] * sc;
        const sn = sideN(p2, n2);
        const phi = bv.flat ? Math.PI / 4 : lev.phi;
        const c = bv.h * Math.cos(phi), s = bv.w * Math.sin(phi);
        const nrm = [sn[0] * c, sn[1] * c, sn[2] * c + dirZ * s];
        return part.v([x, y, lev.z], nrm, capUV0(x, y), ch, cuv(x, y, sc));
      };
      sh.segs.forEach((sg, si) => {
        const a0 = vtx(A.pts[si][0], sg.na, A), b0v = vtx(A.pts[si][1], sg.nb, A);
        const b1v = vtx(Bl.pts[si][1], sg.nb, Bl), a1 = vtx(Bl.pts[si][0], sg.na, Bl);
        part.quad(a0, b0v, b1v, a1);
      });
    }
    // 封口面
    const top = levels[n];
    const sc = sig(top.z);
    const poly = top.pts.map((pp) => [pp[0][0] * sc, pp[0][1] * sc]);
    if (!sh.closed) continue;
    const tris = triangulate(poly);
    const ids = poly.map(([x, y]) => part.v([x, y, top.z], [0, 0, dirZ], capUV0(x, y), ch, cuv(x, y, sc)));
    for (const [a, b, c] of tris) part.tri(ids[a], ids[b], ids[c]);
  }

  // —— 变换到目标位置 ——
  let X = AXIS[axis];
  if (center) X = X.mul(new Xform(undefined, [0, 0, -depth / 2]));
  if (xf) X = xf.mul(X);
  part.transform(X);
  return part;
}
