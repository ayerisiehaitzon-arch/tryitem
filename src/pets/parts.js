import { circle } from '../core/shape.js';
import { Xform, norm, cross } from '../core/vec.js';
import { petSwatch } from '../materials/atlas.js';

// 宠物房几件东西共用的小工具
// 部件整个指向宠物房图集里的一个纯色格子
export function sw(part, name) {
  const uv = petSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 按顶点位置（和法线）给 UV
export function mapUV(part, f) {
  part.T = part.P.map((p, i) => f(p, part.N[i]));
  return part;
}
export { ccw, catmull } from '../gym2/parts.js';
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// 两点之间一根圆棒
export function rod(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'pet' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 用三根基向量（局部 x、y、z 在世界里的方向）和原点搭一个变换
export const frame = (ax, ay, az, t) => new Xform([ax[0], ay[0], az[0], ax[1], ay[1], az[1], ax[2], ay[2], az[2]], [...t]);
// 局部 y 朝 fwd、局部 x 尽量朝 up 的正交标架
export function aim(fwd, up, t) {
  const y = norm(fwd), z = norm(cross(up, y)), x = cross(y, z);
  return frame(x, y, z, t);
}
// 把一个部件翻过来：法线取反、三角形绕序反过来（从里面看的内衬）
export function invert(part) {
  part.N = part.N.map((n) => [-n[0], -n[1], -n[2]]);
  for (let i = 0; i < part.I.length; i += 3) { const t = part.I[i + 1]; part.I[i + 1] = part.I[i + 2]; part.I[i + 2] = t; }
  return part;
}

// 开一个圆孔的平板：板在 x-y 平面、厚 t（z 从 -t/2 到 t/2），w × h 的外框，圆孔圆心 c、半径 r。
// 正反两面各是一圈放样（圆孔上的 n 个点连到外框上同一方向的点），孔壁是一圈短圆筒；板的四个窄边不做（嵌在别的东西里）
export function plateWithHole(k, name, { mat, w, h, t, c, r, n, place }) {
  const [cx, cy] = c;
  const edge = (a) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    const sx = dx > 1e-9 ? (w / 2 - cx) / dx : dx < -1e-9 ? (-w / 2 - cx) / dx : Infinity;
    const sy = dy > 1e-9 ? (h / 2 - cy) / dy : dy < -1e-9 ? (-h / 2 - cy) / dy : Infinity;
    const s = Math.min(sx, sy);
    return [cx + dx * s, cy + dy * s];
  };
  // 外框的四个角要落在采样点上，不然角会被切掉：按角度把四个角插进去
  const angs = Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n);
  for (const [x, y] of [[w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]]) angs.push((Math.atan2(y - cy, x - cx) + 2 * Math.PI) % (2 * Math.PI));
  angs.sort((a, b) => a - b);
  const hole = (z) => angs.map((a) => [cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
  const outer = (z) => angs.map((a) => [...edge(a), z]);
  const parts = [];
  for (const [s, tag] of [[1, 'F'], [-1, 'B']]) {
    const z = (s * t) / 2;
    parts.push(k.loft({ name: `${name}${tag}`, mat, rings: [hole(z), outer(z)], orient: () => [0, 0, s] }));
  }
  parts.push(k.loft({ name: `${name}Hole`, mat, rings: [hole(t / 2), hole(-t / 2)], orient: (i, j) => [cx - hole(0)[j][0], cy - hole(0)[j][1], 0] }));
  if (place) for (const p of parts) p.transform(place);
  return parts;
}
