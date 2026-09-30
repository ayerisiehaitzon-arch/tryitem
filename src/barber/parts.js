import { circle, profile } from '../core/shape.js';
import { roundedPath } from '../core/path.js';
import { barberSwatch, barberBottleUV } from '../materials/atlas.js';
import { BARBER_BOTTLES, arcTable, barberBottleIndex } from './bottles.js';
export { mapUV, frame, aim, invert, ccw, catmull } from '../pets/parts.js';
export { rotAbout } from '../machine/parts.js';

// 理发店几件东西共用的小零件
// 部件整个指向理发店图集里的一个纯色格子
export function sw(part, name) {
  const uv = barberSwatch(name);
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
export function rod(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'barber' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 一根弯管：折线的拐角倒成圆弧（半径 bend，每个弯 n 段），圆截面
export function tube(k, name, pts, r, swatch, { bend = 0.04, n = null, segs = null, caps = [true, true], up = [0, 1, 0], mat = 'barber' } = {}) {
  const path = roundedPath(pts, bend, n ?? k.q(4, 3, 1));
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(9, 7, 4)), path, caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 车削件（沿局部 y），可选摆放
export function turned(k, name, pts, swatch, { segs = null, place = null, mat = 'barber' } = {}) {
  const p = k.lathe({ name, mat, segs: segs ?? k.q(16, 12, 8), profile: profile(pts) });
  if (swatch) sw(p, swatch);
  if (place) p.transform(place);
  return p;
}
// 球头手柄（黑色胶木）：原点在杆根，沿局部 y
export function ballKnob(k, name, { r = 0.012, stem = 0.03, place = null, swatch = 'black' } = {}) {
  const pts = [[0, 0], [r * 0.35, 0], [r * 0.35, stem - r * 0.8, sm], [r * 0.6, stem - r * 0.6, sm], [r, stem + r * 0.2, sm], [r * 0.7, stem + r * 0.9, sm], [0, stem + r]];
  return turned(k, name, pts, swatch, { segs: k.q(12, 8, 6), place });
}

// 瓶子 / 罐子：按 bottles.js 的外形车削（沿局部 y，原点在瓶底中心），整只瓶子贴图集里对应的一格
export function bottle(k, name, id, { place = null, s = 1, segs = null } = {}) {
  const i = barberBottleIndex(id);
  if (i < 0) throw new Error(`没有这种瓶子: ${id}`);
  const pts = BARBER_BOTTLES[i].pts.map(([r, y]) => [r * s, y * s]);
  const tab = arcTable(pts), rmax = Math.max(...pts.map((p) => p[0]));
  const p = k.lathe({ name, mat: 'barber', grain: 'around', segs: segs ?? k.q(16, 12, 8), profile: profile(pts.map(([r, y]) => [r, y, sm])) });
  p.T = p.T.map(([a, t]) => barberBottleUV(i, a / (2 * Math.PI * rmax), 1 - t / tab.L));
  return put(p, place);
}
export const bottleHeight = (id, s = 1) => BARBER_BOTTLES[barberBottleIndex(id)].pts.at(-1)[1] * s;
export const bottleRadius = (id, s = 1) => Math.max(...BARBER_BOTTLES[barberBottleIndex(id)].pts.map((p) => p[0])) * s;

// 皮面上的车线：法线轴 n 的正面，沿 across 轴在 seams 处压进去 depth、别处鼓起 puff；四边的权重是 0（棱和圆角不动）
export function tuft(h, { n, across, seams, depth, w, puff }) {
  const o = [0, 1, 2].filter((i) => i !== n);
  return (p) => {
    const t = Math.max(0, p[n] / h[n]), wgt = t * t;
    let s = 0;
    for (const c of seams) s += Math.exp(-(((p[across] - c) / w) ** 2));
    const edge = o.reduce((a, i) => a * Math.max(0, 1 - (p[i] / h[i]) ** 2), 1);
    const q = [...p];
    q[n] += wgt * edge * (puff - depth * Math.min(1, s));
    return q;
  };
}
// 平面区域的节点（盒子 div 用的 [-1, 1] 相对位置）：均匀 n 段，每道车线两边再各加两圈 —— 车线才压得出一道窄沟，
// 不会因为顶点太稀变成一片起伏的褶子。iv 是平面区域的半宽（半尺寸减圆角）
export function seamNodes(iv, seams, n, w, lite = false) {
  const t = [];
  for (let i = 0; i <= n; i++) t.push(-1 + (2 * i) / n);
  for (const c of seams) for (const o of lite ? [-1, 0, 1] : [-1.8, -0.9, 0, 0.9, 1.8]) t.push((c + o * w) / iv);
  const out = [];
  for (const v of t.filter((v) => v >= -1 && v <= 1).sort((a, b) => a - b)) if (!out.length || v - out.at(-1) > 0.02) out.push(v);
  out[0] = -1; out[out.length - 1] = 1;
  return out;
}
