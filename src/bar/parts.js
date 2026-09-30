import { circle, profile, shape, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { barSwatch, barUV, bottleUV } from '../materials/atlas.js';
import { BOTTLES, arcTable, bottleIndex } from './bottles.js';
import { aim, ccw } from '../pets/parts.js';
export { mapUV, frame, aim, invert, ccw, catmull } from '../pets/parts.js';

// 酒吧几件东西共用的小零件：酒瓶、玻璃杯（和杯里的酒）、柠檬 / 青柠、调酒工具
// 部件整个指向酒吧图集里的一个纯色格子
export function sw(part, name) {
  const uv = barSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const sm = { smooth: true };
// 一组部件整体摆放
export function put(parts, place) {
  if (place) for (const p of [].concat(parts)) p.transform(place);
  return parts;
}
// 四分之一椭圆上的平滑点：中心 (0, cy)，半径 (a, b)，角度 t0 → t1（0 是正下方，π/2 是最外边）
export const ellipsePts = (a, b, cy, t0, t1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = t0 + ((t1 - t0) * i) / n;
  return [a * Math.sin(t), cy - b * Math.cos(t), sm];
});

// 两点之间一根圆棒
export function rod(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'bar' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}

// 酒瓶：按 bottles.js 的外形车削（沿局部 y，原点在瓶底中心），整只瓶子贴图集里对应的一格 ——
// u 绕一圈（酒标在正面，朝 +z），v 沿轮廓从瓶盖顶到瓶底。s 整体缩放（小瓶的苦精）
// lite：远处的 LOD2 只留外形上的几个关键点（瓶底、瓶肩上下、瓶颈、瓶盖）—— 还是一整条环带，图块不变
export function bottle(k, name, id, { place = null, s = 1, segs = null, lite = false } = {}) {
  const i = bottleIndex(id);
  if (i < 0) throw new Error(`没有这种酒瓶: ${id}`);
  let src = BOTTLES[i].pts;
  if (lite && k.lod >= 2) { const n = src.length; src = [...new Set([0, 2, 3, 5, n - 3, n - 2, n - 1])].map((j) => src[j]); }
  const pts = src.map(([r, y]) => [r * s, y * s]);
  const tab = arcTable(pts), rmax = Math.max(...pts.map((p) => p[0]));
  const p = k.lathe({ name, mat: 'bar', grain: 'around', segs: segs ?? k.q(16, 12, 8), profile: profile(pts.map(([r, y]) => [r, y, sm])) });
  p.T = p.T.map(([a, t]) => bottleUV(i, a / (2 * Math.PI * rmax), 1 - t / tab.L));
  return put(p, place);
}
// 酒瓶的高度、最粗处的半径（摆架子用）
export const bottleHeight = (id, s = 1) => BOTTLES[bottleIndex(id)].pts.at(-1)[1] * s;
export const bottleRadius = (id, s = 1) => Math.max(...BOTTLES[bottleIndex(id)].pts.map((p) => p[0])) * s;

// —— 玻璃杯：闭合的车削轮廓（外壁往上、翻过杯口、内壁往下回到轴上），透明玻璃；杯里的酒是另一个车削件，
//    贴着内壁往里缩 0.5mm，顶上一个平的液面（不透明的纯色，隔着玻璃看）。玻璃用酒杯玻璃（比透明玻璃亮一点）——
// 古典杯（Negroni）：外径 8.5cm、高 9cm，厚底
export const ROCKS = { r: 0.0425, h: 0.09, inner: 0.0392, floor: 0.014 };
export function rocksGlass(k, name, { place = null, fill = null, liquid = null, segs = null } = {}) {
  const { r, h, inner: ri, floor: f } = ROCKS;
  const parts = [k.lathe({ name, mat: 'bar_glass', segs: segs ?? k.q(20, 14, 8), profile: profile([
    [0, 0], [r - 0.003, 0], [r - 0.001, 0.002, sm], [r, 0.006, sm], [r, h - 0.001, sm], [(r + ri) / 2, h, sm], [ri, h - 0.001, sm],
    [ri - 0.0006, f + 0.004, sm], [ri - 0.004, f, sm], [0, f],
  ]) })];
  if (fill) {
    const e = 0.0005;
    parts.push(sw(k.lathe({ name: `${name}Liquid`, mat: 'bar', segs: k.q(20, 14, 8), profile: profile([
      [0, f + e], [ri - 0.004, f + e, sm], [ri - 0.0006 - e, f + 0.004, sm], [ri - e, fill], [0, fill],
    ]) }), liquid));
  }
  return put(parts, place);
}
// 香槟碟（coupe）：圆脚、细柄、又宽又浅的碗；fill 是液面高度
export const COUPE = { rim: 0.05, top: 0.128, depth: 0.043, wall: 0.0015 };
export function coupe(k, name, { place = null, fill = null, liquid = null, segs = null } = {}) {
  const { rim, top, depth, wall } = COUPE;
  const n = k.q(6, 4, 2), t0 = Math.asin(0.0058 / rim);
  const ra = rim - wall, rb = depth - wall - 0.0008;
  const parts = [k.lathe({ name, mat: 'bar_glass', segs: segs ?? k.q(22, 16, 8), profile: profile([
    [0, 0], [0.036, 0], [0.0372, 0.0014, sm], [0.034, 0.003, sm], [0.012, 0.0065, sm], [0.0048, 0.013, sm],
    [0.0042, 0.03, sm], [0.0042, 0.074, sm], ...ellipsePts(rim, depth, top, t0, Math.PI / 2, n),
    ...ellipsePts(ra, rb, top, Math.PI / 2, 0, n),
  ]) })];
  if (fill) {
    const e = 0.0006, tf = Math.acos((top - fill) / (rb - e));
    parts.push(sw(k.lathe({ name: `${name}Liquid`, mat: 'bar', segs: k.q(22, 16, 8), profile: profile([
      ...ellipsePts(ra - e, rb - e, top, 0, tf, n).map(([x, y], i) => [x, y, i === n ? {} : sm]), [0, fill],
    ]) }), liquid));
  }
  return put(parts, place);
}

// 红酒杯：圆脚、细柄，郁金香形的杯肚（最宽处在下半截，往上收口）
export const WINE = { base: 0.088, belly: 0.043, by: 0.128, rim: 0.033, top: 0.205, wall: 0.0013 };
export function wineGlass(k, name, { place = null, segs = null, fill = null, liquid = null } = {}) {
  const { base, belly, by, rim, top, wall: w } = WINE, n = k.q(4, 3, 2);
  const t0 = Math.asin(0.0058 / belly);
  const lower = (a, b, i) => { const t = t0 + ((Math.PI / 2 - t0) * i) / n; return [a * Math.sin(t), by - b * Math.cos(t), sm]; };
  const upper = (a, dy, i) => { const u = i / n; return [a - (belly - rim) * u * u, by + dy * u, sm]; };
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) out.push(lower(belly, by - base, i));
  for (let i = 1; i <= n; i++) out.push(upper(belly, top - by, i));
  for (let i = n; i >= 1; i--) inn.push(upper(belly - w, top - by - 0.0006, i));
  for (let i = n; i >= 0; i--) inn.push(lower(belly - w, by - base - 1.6 * w, i));
  inn[inn.length - 1] = [0, inn[inn.length - 1][1]];
  const p = k.lathe({ name, mat: 'bar_glass', segs: segs ?? k.q(12, 10, 6), profile: profile([
    [0, 0], [0.034, 0], [0.0352, 0.0014, sm], [0.032, 0.003, sm], [0.011, 0.0065, sm], [0.0045, 0.013, sm],
    [0.0038, 0.03, sm], [0.0038, 0.076, sm], ...out, [(rim + rim - w) / 2 + 0.0002, top + 0.0004, sm], ...inn,
  ]) });
  if (!fill) return put(p, place);
  // 杯里的酒（液面在杯肚最宽处以下）：贴着杯肚下半截的内壁
  const e = 0.0005, a = belly - w - e, b = by - base - 1.6 * w - e, tf = Math.acos((by - fill) / b), m = k.q(5, 3, 2);
  const liq = sw(k.lathe({ name: `${name}Liquid`, mat: 'bar', segs: segs ?? k.q(12, 10, 6), profile: profile([
    ...Array.from({ length: m + 1 }, (_, i) => { const t = (tf * i) / m; return [a * Math.sin(t), by - b * Math.cos(t), i === m ? {} : sm]; }), [0, fill],
  ]) }), liquid);
  return put([p, liq], place);
}

// 圆肚子的威士忌醒酒瓶：厚底、圆鼓鼓的瓶身、细颈，瓶口上一个玻璃球塞子；fill 是酒的高度（威士忌色）
export function decanter(k, name, { place = null, fill = null } = {}) {
  const segs = k.q(18, 12, 8);
  const parts = [k.lathe({ name, mat: 'bar_glass', segs, profile: profile([
    [0, 0], [0.045, 0], [0.05, 0.003, sm], [0.062, 0.02, sm], [0.07, 0.05, sm], [0.07, 0.085, sm], [0.062, 0.115, sm], [0.045, 0.138, sm],
    [0.024, 0.152, sm], [0.019, 0.165, sm], [0.019, 0.185, sm], [0.023, 0.19, sm], [0.0205, 0.1935, sm],
    [0.016, 0.185, sm], [0.016, 0.166, sm], [0.021, 0.152, sm], [0.042, 0.136, sm], [0.059, 0.113, sm], [0.066, 0.085, sm], [0.066, 0.05, sm],
    [0.058, 0.022, sm], [0.045, 0.011, sm], [0, 0.009],
  ]) })];
  parts.push(k.lathe({ name: `${name}Stopper`, mat: 'bar_glass', segs: k.q(12, 8, 6), profile: profile([
    [0, 0.168], [0.0152, 0.168], [0.0155, 0.19, sm], [0.024, 0.193], [0.024, 0.198], ...ellipsePts(0.03, 0.03, 0.226, 0.6, Math.PI, k.q(6, 4, 3)),
  ]) }));
  if (fill) parts.push(sw(k.lathe({ name: `${name}Liquid`, mat: 'bar', segs, profile: profile([[0, 0.0095], [0.045, 0.0115, sm], [0.0575, 0.0225, sm], [0.0655, 0.05, sm], [0.0657, fill], [0, fill]]) }), 'whisky'));
  return put(parts, place);
}
// 不锈钢冰桶：往上微微张开，卷边口，两边各一个吊环；里面冰到 ice 的高度（一层冰面 + 几块露头的冰）
export const BUCKET = { r0: 0.078, r1: 0.096, h: 0.2, ice: 0.168 };
export function iceBucket(k, name, { place = null } = {}) {
  const { r0, r1, h, ice } = BUCKET, segs = k.q(22, 16, 10);
  const parts = [sw(k.lathe({ name, mat: 'bar', segs, profile: profile([
    [0, 0], [r0, 0], [r0 + 0.002, 0.003, sm], [r1, h - 0.006, sm], [r1 + 0.003, h - 0.003, sm], [r1 + 0.002, h, sm], [r1 - 0.002, h + 0.001, sm],
    [r1 - 0.004, h - 0.004, sm], [r1 - 0.004 - (r1 - r0) * ((h - ice) / h) - 0.001, ice - 0.008],
  ]) }), 'steel')];
  parts.push(sw(k.lathe({ name: `${name}Ice`, mat: 'bar', segs, profile: profile([[r1 - 0.004 - (r1 - r0) * ((h - ice) / h), ice], [0, ice]]) }), 'ice'));
  // 吊环：桶壁上一颗小圆钮，挂着一个圆环（环面贴着桶壁）
  for (const [j, sx] of [[0, -1], [1, 1]]) {
    const x = sx * (r0 + (r1 - r0) * 0.8 + 0.004), y = h * 0.8;
    parts.push(sw(k.lathe({ name: `${name}Boss${j}`, mat: 'bar', segs: k.q(8, 6, 4), profile: profile([[0.008, -0.004], [0.008, 0, sm], [0.007, 0.004, sm], [0, 0.006]]), xf: xf({ pos: [x, y, 0], rot: [0, 0, -sx * Math.PI / 2] }) }), 'steel'));
    const n = k.q(12, 8, 6), ring = Array.from({ length: n }, (_, i) => { const t = (2 * Math.PI * i) / n; return [x + sx * 0.008, y - 0.02 + 0.02 * Math.cos(t), 0.02 * Math.sin(t)]; });
    parts.push(sw(k.sweep({ name: `${name}Ring${j}`, mat: 'bar', shape: circle(0.0028, k.q(6, 4, 4)), path: ring, closed: true, caps: [false, false], up: [1, 0, 0] }), 'steel'));
  }
  return put(parts, place);
}

// —— 柠檬 / 青柠 ——
// 整个的：沿局部 y 的椭球，两头各一个小尖（柠檬尖一点），原点在果子中心；果皮贴图集里的果皮（u 绕一圈、v 沿轮廓）
export function citrus(k, name, kind, { place = null } = {}) {
  const lemon = kind === 'lemon';
  const a = lemon ? 0.036 : 0.03, b = lemon ? 0.027 : 0.0265, nub = lemon ? 0.005 : 0.0022;
  const n = k.q(10, 7, 3), c = 0.22;
  const pts = [[0, -a - nub], [0.0045, -a - nub * 0.3, sm]];
  for (let i = 0; i <= n; i++) { const t = c + ((Math.PI - 2 * c) * i) / n; pts.push([b * Math.sin(t), -a * Math.cos(t), sm]); }
  pts.push([0.0045, a + nub * 0.3, sm], [0, a + nub]);
  const tab = arcTable(pts);
  const p = k.lathe({ name, mat: 'bar', grain: 'around', segs: k.q(14, 10, 6), profile: profile(pts) });
  p.T = p.T.map(([u, t]) => barUV(`${kind}Peel`, u / (2 * Math.PI * b), t / tab.L));
  return put(p, place);
}
// 切开的半个：圆的一面朝下，切面朝上（切面贴图集里的横切面：一瓣瓣果肉、白瓤、一圈皮），原点在底下
export function citrusHalf(k, name, kind, { place = null, R = 0.027 } = {}) {
  const n = k.q(6, 4, 3);
  const pts = [[0, 0]];
  for (let i = 1; i <= n; i++) { const t = (Math.PI / 2) * (i / n); pts.push([R * Math.sin(t), R * (1 - Math.cos(t)), sm]); }
  pts[n] = [R, R];
  pts.push([0, R]);
  const p = k.lathe({ name, mat: 'bar', grain: 'around', segs: k.q(16, 12, 8), profile: profile(pts) });
  const Lp = (Math.PI / 2) * R;
  p.T = p.T.map((t, i) => (p.N[i][1] > 0.99 && p.P[i][1] > R - 1e-6
    ? barUV(`${kind}Cut`, 0.5 + t[0] / (2 * R), 0.5 + t[1] / (2 * R))
    : barUV(`${kind}Peel`, t[0] / (2 * Math.PI * R), Math.min(1, t[1] / Lp))));
  return put(p, place);
}
// 一片切好的圆片：两面是横切面、一圈是皮，原点在底面中心
export function citrusWheel(k, name, kind, { place = null, R = 0.026, t = 0.005 } = {}) {
  const p = k.lathe({ name, mat: 'bar', grain: 'around', segs: k.q(16, 12, 8), profile: profile([[0, 0], [R, 0], [R, t], [0, t]]) });
  p.T = p.T.map((uv, i) => (Math.abs(p.N[i][1]) > 0.99
    ? barUV(`${kind}Cut`, 0.5 + uv[0] / (2 * R), 0.5 + uv[1] / (2 * R))
    : barUV(`${kind}Peel`, uv[0] / (2 * Math.PI * R), 0.5)));
  return put(p, place);
}

// —— 调酒工具 ——
// 三段式雪克壶（壶身、滤盖、小帽，不锈钢），原点在底面中心
export function shaker(k, name, { place = null } = {}) {
  const p = sw(k.lathe({ name, mat: 'bar', segs: k.q(20, 14, 8), profile: profile([
    [0, 0], [0.039, 0], [0.041, 0.004, sm], [0.0445, 0.118, sm], [0.0455, 0.121], [0.0462, 0.124, sm], [0.0462, 0.132],
    [0.044, 0.14, sm], [0.03, 0.168, sm], [0.019, 0.182, sm], [0.0185, 0.186], [0.0205, 0.187], [0.0205, 0.203, sm], [0.017, 0.209, sm], [0, 0.211],
  ]) }), 'steel');
  return put(p, place);
}
// 日式双头量酒器：两个锥形杯背靠背，大杯朝下立着，小杯的杯口朝上
export function jigger(k, name, { place = null } = {}) {
  const p = sw(k.lathe({ name, mat: 'bar', segs: k.q(16, 12, 6), profile: profile([
    [0, 0], [0.0235, 0], [0.0235, 0.002], [0.0115, 0.043], [0.0124, 0.046, sm], [0.0115, 0.049], [0.0215, 0.098], [0.0205, 0.099],
    [0.0098, 0.058, sm], [0, 0.056],
  ]) }), 'steel');
  return put(p, place);
}
// 吧勺：长 30cm，下头一个小勺、上头一颗水滴形的配重，中间的杆拧成麻花（方截面沿杆转六圈，低 LOD 不拧）。
// 原点在勺头，勺杆沿 dir 伸出去
export function barSpoon(k, name, { base, dir, up = [0, 1, 0] }) {
  const L = 0.3, y0 = 0.026, y1 = 0.284, place = aim(dir, up, base);
  const parts = [];
  const bowl = sw(k.lathe({ name: `${name}Bowl`, mat: 'bar', segs: k.q(10, 8, 6), profile: profile(ellipsePts(0.0085, 0.013, 0.013, 0, Math.PI, k.q(6, 4, 3)).map(([x, y], i, a) => [x, y, i === 0 || i === a.length - 1 ? {} : sm])) }), 'steel');
  bowl.deform(([x, y, z]) => [x, y, z * 0.35]);
  parts.push(bowl);
  const n = k.q(40, 16, 4), turns = k.q(6, 0, 0), path = Array.from({ length: n + 1 }, (_, i) => [0, y0 + ((y1 - y0) * i) / n, 0]);
  const shaft = sw(k.sweep({ name: `${name}Shaft`, mat: 'bar', shape: rect(0.0036, 0.0036, { r: 0.0008, segs: 1 }), path, up: [1, 0, 0], caps: [false, false] }), 'steel');
  if (turns) shaft.deform(([x, y, z]) => { const t = ((y - y0) / (y1 - y0)) * turns * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t); return [x * c - z * s, y, x * s + z * c]; });
  parts.push(shaft);
  parts.push(rod(k, `${name}Neck`, [0, y0 - 0.002, 0], [0, y0 + 0.004, 0], 0.0018, 'steel', { segs: 6, caps: [false, false] }));
  parts.push(sw(k.lathe({ name: `${name}Drop`, mat: 'bar', segs: k.q(10, 8, 6), profile: profile([[0, y1 - 0.001], [0.004, y1 + 0.004, sm], [0.006, y1 + 0.009, sm], [0.004, L - 0.001, sm], [0, L]]) }), 'steel'));
  return put(parts, place);
}
// 软木杯垫
export function coaster(k, name, { place = null, r = 0.05 } = {}) {
  return put(sw(k.lathe({ name, mat: 'bar', segs: k.q(20, 14, 8), profile: profile([[0, 0], [r - 0.002, 0], [r, 0.002, sm], [r - 0.002, 0.004], [0, 0.004]]) }), 'cork'), place);
}
// 冰块：倒圆角的方块（半透明的冰做成不透明的浅蓝白，靠低粗糙度的高光）
export function iceCube(k, name, { place = null, s = 0.048 } = {}) {
  return put(sw(k.box({ name, mat: 'bar', size: [s, s * 0.92, s], r: s * 0.12, segs: k.q(2, 1, 1) }), 'ice'), place);
}
// 一小片拧过的橙皮：椭圆的薄片沿长边弯成一道弧
export function peel(k, name, { place = null } = {}) {
  const m = k.q(16, 10, 6);
  const pts = ccw(Array.from({ length: m }, (_, i) => { const a = (2 * Math.PI * i) / m; return [0.022 * Math.cos(a), 0.009 * Math.sin(a), sm]; }));
  const p = sw(k.extrude({ name, mat: 'bar', shape: shape(pts), depth: 0.0016, axis: 'y' }), 'orangePeel');
  p.deform(([x, y, z]) => { const t = x / 0.03; return [x, y + 0.012 * (1 - Math.cos(t * 1.4)) + 0.004 * t, z + 0.003 * Math.sin(t * 2)]; });
  return put(p, place);
}
