import { shape, triangulate } from '../core/shape.js';
import { PLY_T } from '../materials/library.js';

// 桦木胶合板的板件：一块板 = 两张面（桦木贴皮）+ 一圈边带（露出一层层的单板）。
//
// 局部坐标：板面在 XY 平面，厚度沿 z（z ∈ [-T/2, T/2]），摆放用 xf。
//   · 边带是一条开放截面沿板的轮廓闭合扫掠：两条 1/4 圆（2mm 的圆边）夹着一段平边。
//     截面每一点的 v 不按弧长，而按它在板厚方向上的位置（z + T/2）给 —— 单板是一层层平的，
//     圆边上的那几层就被斜着切开、变宽，和真的胶合板一样；ply 贴图的 v 正好一个板厚（18mm，13 层）；
//   · 两张面是轮廓往里缩 r（缩到边带圆角的起点）再三角化。缩进量用和扫掠完全相同的算法算
//     （拐点处的斜接放大也一样），面和边带严丝合缝。
const EPS = 1e-12;
const n2 = (a) => { const l = Math.hypot(a[0], a[1]); return l > EPS ? [a[0] / l, a[1] / l] : [0, 0]; };

// 圆角多边形 → 点列（逆时针）。pts 同 shape()：[x, y, { r, segs }]
export function outline(pts) {
  return shape(pts).segs.map((sg) => sg.a);
}

// 圆边截面：从正面（y = +T/2，往里 r 处）绕过板边走到背面；法线用圆弧的解析法线
function edgeProfile(T, r, n) {
  const pts = [];
  const arc = (cy, a0, a1) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push({ p: [r + r * Math.cos(a), cy + r * Math.sin(a)], n: [Math.cos(a), Math.sin(a)] });
    }
  };
  arc(T / 2 - r, Math.PI / 2, Math.PI);
  arc(-T / 2 + r, Math.PI, (3 * Math.PI) / 2);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    if (Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]) < EPS) continue;
    segs.push({ a: A.p, b: B.p, na: A.n, nb: B.n, sa: A.p[1] + T / 2, sb: B.p[1] + T / 2, group: 0 });
  }
  return { segs, closed: false, length: T };
}

// 闭合点列里满足 pred 的连续一段（可以跨过首尾）
function run(P, pred) {
  const n = P.length;
  const on = P.map(pred);
  const i0 = on.findIndex((v, i) => v && !on[(i - 1 + n) % n]);
  if (i0 < 0) throw new Error('板边：找不到要做的那一段');
  const out = [];
  for (let i = i0; on[i % n] && out.length < n; i++) out.push(P[i % n]);
  return out;
}

// 和 sweep 一样的标架与斜接：闭合平面折线在第 i 点往里缩 d 以后的位置
function insetLoop(P, d) {
  const n = P.length;
  return P.map((p, i) => {
    const a = n2([p[0] - P[(i - 1 + n) % n][0], p[1] - P[(i - 1 + n) % n][1]]);
    const b = n2([P[(i + 1) % n][0] - p[0], P[(i + 1) % n][1] - p[1]]);
    const t = n2([a[0] + b[0], a[1] + b[1]]);
    const R = [-t[1], t[0]]; // z × T：逆时针轮廓的内侧
    const c = a[0] * b[0] + a[1] * b[1];
    const k = c > 0.99999 ? 0 : 1 / Math.sqrt((1 + c) / 2) - 1;
    return [p[0] + R[0] * d * (1 + k), p[1] + R[1] * d * (1 + k)];
  });
}

/**
 * 一块胶合板。
 *   outline  板面轮廓点列（逆时针，圆角已经展开成点，见 outline()）
 *   faces    [正面 +z, 背面 -z] 是否生成（贴墙、被压住的面不要）
 *   edge     是否生成边带；给一个函数 (p) => bool 就只做轮廓上满足它的那一段（开放的扫掠，两头不封口）
 *   grain    贴皮木纹方向（弧度，0 = 沿 x）
 *   r / n    板边圆角半径 / 每条 1/4 圆的分段
 */
export function plyPanel(k, { name, outline: P, T = PLY_T, r = 0.002, n = 2, faces = [true, true], edge = true, grain = 0, xf = null, density = {}, maxChart = 0.9 }) {
  const parts = [];
  if (edge) {
    // edge = (p) => bool：只做轮廓上满足条件的那一段（插进别的板里、压在桌面下的边不做）
    const open = typeof edge === 'function';
    const path = open ? run(P, edge) : P;
    parts.push(k.sweep({
      name: `${name}Edge`, mat: 'ply', shape: edgeProfile(T, r, n), closed: !open, caps: [false, false],
      up: [0, 0, 1], path: path.map(([x, y]) => [x, y, 0]), density: { side: density.edge ?? 1 }, maxChart,
    }));
  }
  const inner = insetLoop(P, r);
  const xs = inner.map((p) => p[0]), ys = inner.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cg = Math.cos(grain), sg = Math.sin(grain);
  const tris = triangulate(inner);
  [1, -1].forEach((s, fi) => {
    if (!faces[fi]) return;
    const part = k.part('birch', `${name}${s > 0 ? 'F' : 'B'}`);
    const ch = k.chart(`${name}:f${fi}`, x1 - x0, y1 - y0, { density: density[fi ? 'back' : 'front'] ?? 1 });
    const ids = inner.map(([x, y]) => part.v([x, y, (s * T) / 2], [0, 0, s], [x * cg + y * sg, -x * sg + y * cg], ch,
      [(s > 0 ? x - x0 : x1 - x) / (x1 - x0), (y - y0) / (y1 - y0)]));
    for (const [a, b, c] of tris) part.tri(ids[a], ids[b], ids[c]);
    parts.push(part);
  });
  if (xf) parts.forEach((p) => p.transform(xf));
  return parts;
}

// 弯曲胶合板：一整块板沿着一条平面路径弯过去（柜体的上、下、左、右一圈，或者桌子的桌面连两条腿）。
//   path 在 XY 平面（逆时针：板的内侧在路径左边），板从 z = 0 伸到 z = D；path 是板的外表面。
//   · 外表面、内表面：一条线段截面沿路径扫掠，桦木贴皮，木纹顺着弯的方向；
//   · 正面（z = D）的边带：两条 1/4 圆夹一段平边，v 按板厚方向的位置给 —— 单板一层层顺着弯绕过去；
//   · back: 背面（z = 0）也做边带（不贴墙、看得见的时候）。
export function plyBent(k, { name, path, closed = true, D, T = PLY_T, r = 0.002, n = 2, back = false, xf = null, density = {}, maxChart = 0.9 }) {
  const z0 = back ? r : 0;
  const line = (x, nx) => ({ segs: [{ a: [x, z0], b: [x, D - r], na: [nx, 0], nb: [nx, 0], sa: z0, sb: D - r, group: 0 }], closed: false, length: D - r - z0 });
  // 正面的边带：截面 x 从外表面（0）到内表面（T）；v = x
  const band = (zc, dir) => {
    const pts = [];
    const arc = (cx, a0, a1) => {
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push({ p: [cx + r * Math.cos(a), zc + dir * r * Math.sin(a)], n: [Math.cos(a), dir * Math.sin(a)] });
      }
    };
    arc(r, Math.PI, Math.PI / 2);
    arc(T - r, Math.PI / 2, 0);
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1];
      if (Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]) < EPS) continue;
      segs.push({ a: A.p, b: B.p, na: A.n, nb: B.n, sa: A.p[0], sb: B.p[0], group: 0 });
    }
    return { segs, closed: false, length: T };
  };
  const P3 = path.map(([x, y]) => [x, y, 0]);
  const common = { closed, caps: [false, false], up: [0, 0, 1], path: P3, maxChart };
  const parts = [
    k.sweep({ ...common, name: `${name}Out`, mat: 'birch', shape: line(0, -1), density: { side: density.out ?? 1 } }),
    k.sweep({ ...common, name: `${name}In`, mat: 'birch', shape: line(T, 1), density: { side: density.in ?? 1 } }),
    k.sweep({ ...common, name: `${name}Edge`, mat: 'ply', shape: band(D - r, 1), density: { side: density.edge ?? 1 } }),
  ];
  if (back) parts.push(k.sweep({ ...common, name: `${name}Back`, mat: 'ply', shape: band(r, -1), density: { side: density.edge ?? 1 } }));
  // 不闭合的弯板（椅子靠背）两头要封口：端面就是板的截面（外表面 → 正面圆边 → 内表面 → 背面），
  // 也是胶合板的端头 —— u 沿 z、v 沿板厚，层纹在端面上是一条条竖线
  if (!closed) {
    const sec = [[0, z0]];
    for (const sg of band(D - r, 1).segs) sec.push(sg.a);
    sec.push([T, D - r], [T, z0]);
    if (back) for (const sg of band(r, -1).segs.slice().reverse()) sec.push(sg.b);
    const tris = triangulate(sec);
    const end = k.part('ply', `${name}Ends`);
    [0, P3.length - 1].forEach((i, e) => {
      const j = e ? i - 1 : i + 1;
      const t = n2([P3[i][0] - P3[j][0], P3[i][1] - P3[j][1]]); // 朝外（离开板）的方向
      const R = e ? [-t[1], t[0]] : [t[1], -t[0]];                 // 往板内侧（和扫掠的 R 一致）
      const ch = k.chart(`${name}:e${e}`, T, D, { density: density.edge ?? 1 });
      const ids = sec.map(([x, z]) => end.v([P3[i][0] + R[0] * x, P3[i][1] + R[1] * x, z], [t[0], t[1], 0], [z, x], ch, [x / T, z / D]));
      for (const [a, b, c] of tris) end.tri(ids[a], ids[b], ids[c]);
    });
    parts.push(end);
  }
  if (xf) parts.forEach((p) => p.transform(xf));
  return parts;
}

// 把一个部件翻过来（法线取反、绕序反过来）：盒子的内壁
export function flipPart(part) {
  part.N = part.N.map((n) => [-n[0], -n[1], -n[2]]);
  for (let i = 0; i < part.I.length; i += 3) {
    const t = part.I[i + 1];
    part.I[i + 1] = part.I[i + 2];
    part.I[i + 2] = t;
  }
  return part;
}
