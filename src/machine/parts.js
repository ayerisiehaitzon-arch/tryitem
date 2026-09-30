import { circle, profile } from '../core/shape.js';
import { Xform, xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { mechSwatch, mechUV } from '../materials/atlas.js';
export { mapUV, frame, aim, invert, ccw, catmull } from '../pets/parts.js';

// 机械车间几件东西共用的小零件
// 部件整个指向机械图集里的一个纯色格子
export function sw(part, name) {
  const uv = mechSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 一组部件整体摆放
export function put(parts, place) {
  if (place) for (const p of [].concat(parts)) p.transform(place);
  return parts;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const sm = { smooth: true };

// 两点之间一根圆棒
export function rod(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'mech' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 一根弯管：折线的拐角倒成圆弧（半径 bend，每个弯 n 段），圆截面
export function tube(k, name, pts, r, swatch, { bend = 0.04, n = null, segs = null, caps = [true, true], up = [0, 1, 0], mat = 'mech' } = {}) {
  const path = roundedPath(pts, bend, n ?? k.q(4, 3, 1));
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(9, 7, 4)), path, caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 绕任意轴（过点 p、方向 axis）转 angle 弧度的刚体变换（罗德里格斯公式）
export function rotAbout(axis, angle, p = [0, 0, 0]) {
  const l = len(axis), [x, y, z] = axis.map((v) => v / l), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const m = [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
  const X = new Xform(m, [0, 0, 0]);
  const rp = X.applyDir(p);
  X.t = [p[0] - rp[0], p[1] - rp[1], p[2] - rp[2]];
  return X;
}
// 车削件（沿局部 y），可选摆放
export function turned(k, name, pts, swatch, { segs = null, place = null, mat = 'mech' } = {}) {
  const p = k.lathe({ name, mat, segs: segs ?? k.q(16, 12, 8), profile: profile(pts) });
  if (swatch) sw(p, swatch);
  if (place) p.transform(place);
  return p;
}
// 球头手柄（黑色胶木）：原点在杆根，沿局部 y
export function ballKnob(k, name, { r = 0.012, stem = 0.03, place = null, swatch = 'bakelite' } = {}) {
  const pts = [[0, 0], [r * 0.35, 0], [r * 0.35, stem - r * 0.8, sm], [r * 0.6, stem - r * 0.6, sm], [r, stem + r * 0.2, sm], [r * 0.7, stem + r * 0.9, sm], [0, stem + r]];
  return turned(k, name, pts, swatch, { segs: k.q(12, 8, 6), place });
}

// 手轮（沿局部 y，轮面朝 +y）：镀铬的圆环轮缘、轮毂、三根辐条，轮缘上一根能转的摇把（黑色胶木把手）。
// 原点在轮毂背面的中心；r 是轮缘中心线的半径
export function handwheel(k, name, { r = 0.06, rim = null, place = null, crank = true, spokes = 3 } = {}) {
  const q = (...v) => k.q(...v), rr = rim ?? r * 0.1, parts = [];
  const n = q(8, 6, 4), ring = Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [r + rr * Math.cos(a), 0.02 + rr * Math.sin(a), sm]; });
  // 轮缘：一个小圆绕轴车一圈（闭合轮廓），从最里面那点开始
  parts.push(sw(k.lathe({ name: `${name}Rim`, mat: 'mech', segs: q(20, 14, 8), profile: profile([...ring.slice(n / 2), ...ring.slice(0, n / 2 + 1)].map(([x, y]) => [x, y, sm])) }), 'chrome'));
  parts.push(turned(k, `${name}Hub`, [[0, 0], [r * 0.24, 0], [r * 0.26, 0.004, sm], [r * 0.22, 0.034, sm], [r * 0.12, 0.04], [0, 0.041]], 'chrome', { segs: q(12, 8, 6) }));
  for (let i = 0; i < spokes; i++) {
    const a = (2 * Math.PI * i) / spokes + 0.3;
    parts.push(rod(k, `${name}Spoke${i}`, [r * 0.2 * Math.cos(a), 0.018, r * 0.2 * Math.sin(a)], [(r - rr * 0.6) * Math.cos(a), 0.02, (r - rr * 0.6) * Math.sin(a)], rr * 0.55, 'chrome', { segs: q(6, 5, 4), caps: [false, false] }));
  }
  if (crank && k.lod < 2) {
    const a = 0.3 + Math.PI / 3;
    parts.push(ballKnob(k, `${name}Crank`, { r: rr * 1.5, stem: rr * 5, place: xf({ pos: [r * Math.cos(a), 0.02 + rr, r * Math.sin(a)] }) }));
  }
  return put(parts, place);
}
// 刻度环（沿局部 y 的一段圆柱，u 绕一圈、v 沿宽度贴图集里的 100 格刻度）
export function collar(k, name, { r = 0.028, w = 0.012, place = null } = {}) {
  const p = k.lathe({ name, mat: 'mech', grain: 'around', segs: k.q(20, 14, 8), profile: profile([[r, 0], [r, w]]) });
  p.T = p.T.map(([a, s]) => mechUV('collar', a / (2 * Math.PI * r), s / w));
  return put(p, place);
}
