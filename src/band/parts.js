import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { bandSwatch, discUV } from '../materials/atlas.js';

// 排练室几件乐器共用的小工具
// 部件整个指向排练室图集里的一个纯色格子
export function sw(part, name) {
  const uv = bandSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 按顶点位置（和法线）给 UV
export function mapUV(part, f) {
  part.T = part.P.map((p, i) => f(p, part.N[i]));
  return part;
}
const sm = { smooth: true };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// 两点之间一根圆管（扫掠）
export function tube(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'band' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 一段沿任意折线的圆管
export function pipe(k, name, path, r, swatch, { segs = null, caps = [true, true], up = [0, 1, 0], closed = false } = {}) {
  return sw(k.sweep({ name, mat: 'band', shape: circle(r, segs ?? k.q(8, 6, 4)), path, caps: closed ? [false, false] : caps, closed, up }), swatch);
}

// 三脚架：中心 c（地面上），三条腿从 hubY 高处的卡箍斜着落到半径 spread 的地面上（橡胶脚），
// braceY 给了的话每条腿中段一根撑杆连到下面的卡箍；a0 是第一条腿的方向
export function tripod(k, name, { c, hubY, spread, a0 = 0, legR = 0.0062, braceY = null, swatch = 'chrome' }) {
  const q = (...v) => k.q(...v);
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i * 2 * Math.PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
    const foot = [c[0] + spread * ca, 0.014, c[2] + spread * sa];
    const hub = [c[0] + 0.02 * ca, hubY, c[2] + 0.02 * sa];
    tube(k, `${name}Leg${i}`, hub, foot, legR, swatch, { caps: [true, false] });
    if (k.lod < 2) {
      sw(k.lathe({ name: `${name}Foot${i}`, mat: 'band', segs: q(8, 6), profile: profile([[legR + 0.0035, 0.0], [legR + 0.0035, 0.026, sm], [legR, 0.03], [0, 0.031]]), xf: xf({ pos: foot, rot: tiltTo(sub(hub, foot)) }).mul(xf({ pos: [0, -0.012, 0] })) }), 'rubber');
    }
    if (braceY !== null && k.lod < 2) {
      const m = lerp3(hub, foot, 0.45);
      tube(k, `${name}Brace${i}`, [c[0] + 0.016 * ca, braceY, c[2] + 0.016 * sa], m, 0.0038, swatch);
    }
  }
  sw(k.lathe({ name: `${name}Hub`, mat: 'band', segs: q(10, 8, 6), profile: profile([[0.02, hubY - 0.022], [0.024, hubY - 0.018, sm], [0.024, hubY + 0.012, sm], [0.016, hubY + 0.018]]), xf: xf({ pos: [c[0], 0, c[2]] }) }), 'blackHw');
  if (braceY !== null && k.lod < 2) {
    sw(k.lathe({ name: `${name}Collar`, mat: 'band', segs: q(10, 8), profile: profile([[0.019, braceY - 0.012], [0.019, braceY + 0.012]]), xf: xf({ pos: [c[0], 0, c[2]] }) }), 'blackHw');
  }
}
// 把 +y 转到方向 d 的欧拉角（先绕 x、再绕 z：R = Rz·Rx）
export function tiltTo(d) {
  const l = len(d), x = d[0] / l, y = d[1] / l, z = d[2] / l;
  // Rx(ax) 把 +y 转到 (0, cos ax, sin ax)，再 Rz(az) 转到 (-sin az cos ax, cos az cos ax, sin ax)
  const ax = Math.asin(Math.max(-1, Math.min(1, z)));
  const az = Math.atan2(-x, y);
  return [ax, 0, az];
}

// 翼形螺丝（黑色）：轴沿局部 +y，pos 处是螺丝根
export function wingNut(k, name, place) {
  const q = (...v) => k.q(...v);
  sw(k.lathe({ name: `${name}Hub`, mat: 'band', segs: q(8, 6, 4), profile: profile([[0.0035, 0], [0.0035, 0.004], [0.0075, 0.005], [0.0075, 0.013, { r: 0.002, segs: 1 }], [0, 0.0135]]), xf: place }), 'blackHw');
  if (k.lod < 2) sw(k.box({ name: `${name}Wing`, mat: 'band', size: [0.03, 0.009, 0.003], r: q(0.0012, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [0, 0.009, 0] })) }), 'blackHw');
}

// ——————————————————————— 镲片 ———————————————————————
// 截面：碗（中间鼓起）+ 弓面（往边上慢慢下垂）；上表面从边往里走、下表面从里往外走（法线各朝外），中间一个轴孔。
// 按俯视平面贴镲片的贴图（车纹、锤痕、印字）。局部 +y 朝上，原点在碗根的平面上
export function cymbal(k, name, { R, bellR, bellH, drop, place, flip = false }) {
  const q = (...v) => k.q(...v);
  // 上表面分得细（车纹、碗的轮廓都在上面），下表面粗一些
  const rh = 0.0065, n = q(8, 6, 4), m = q(4, 3, 2);
  const top = (r) => (r < bellR ? bellH * Math.sqrt(Math.max(0, 1 - (r / bellR) ** 2)) ** 0.8 : -drop * ((r - bellR) / (R - bellR)) ** 1.4);
  const th = (r) => 0.0032 - 0.0022 * Math.min(1, r / R);
  const rad = (N) => Array.from({ length: N + 1 }, (_, i) => rh + (R - rh) * (1 - (1 - i / N) ** 1.3));
  const bottom = rad(m).map((r) => [r, top(r) - th(r), sm]);
  const topPts = rad(n).reverse().map((r) => [r, top(r), sm]);
  bottom[0][2] = {}; topPts[topPts.length - 1][2] = {};
  const pts = [...bottom, [R + 0.0006, top(R) - th(R) / 2, sm], ...topPts];
  const p = k.lathe({ name, mat: 'band', segs: q(28, 18, 12), profile: profile(pts) });
  mapUV(p, (v) => discUV('cymbal', v[0] / R, -v[2] / R));
  if (flip) p.transform(xf({ rot: [Math.PI, 0, 0] }));
  p.transform(place);
  return p;
}

// ——————————————————————— 鼓 ———————————————————————
// 鼓皮：一张圆盘加一圈往下包的边（dir = +1 朝 +y 的上皮，-1 朝 -y 的下皮），按俯视平面贴涂层鼓皮
export function drumHead(k, name, { R, y, dir, place, region = 'batter' }) {
  const q = (...v) => k.q(...v);
  let pts = [[R + 0.0015, y - dir * 0.009], [R + 0.0015, y - dir * 0.001, sm], [R - 0.003, y, sm], [0, y]];
  if (dir < 0) pts = [...pts].reverse().map(([r, yy, o]) => [r, 2 * y - yy, o ?? {}]);
  const p = k.lathe({ name, mat: 'band', segs: q(28, 20, 12), profile: profile(pts) });
  mapUV(p, (v) => discUV(region, Math.max(-1, Math.min(1, v[0] / R)), Math.max(-1, Math.min(1, -v[2] / R))));
  p.transform(place);
  return p;
}
// 三折边的镀铬鼓圈（dir = +1 是上面那只：高出鼓皮、往里卷；-1 是下面那只，上下镜像）
export function hoop(k, name, { R, y, dir, place }) {
  const q = (...v) => k.q(...v);
  let pts = [
    [R + 0.0025, y - 0.006], [R + 0.013, y - 0.0048], [R + 0.005, y - 0.003],
    [R + 0.005, y + 0.008, sm], [R + 0.0015, y + 0.0105, sm], [R - 0.001, y + 0.006],
  ];
  if (dir < 0) pts = pts.map(([r, yy, o]) => [r, 2 * y - yy, o]).reverse();
  return sw(k.lathe({ name, mat: 'band', segs: q(24, 16, 10), profile: profile(pts), xf: place }), 'chrome');
}
// 鼓耳：一根竖着的镀铬管（两个小座子钉在鼓身上），两头各一根调音螺杆穿过鼓圈的翻边；n 只均布
export function lugs(k, name, { R, D, n, place, a0 = 0 }) {
  const q = (...v) => k.q(...v);
  if (k.lod === 2) return;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + 0.5) * 2 * Math.PI) / n, ca = Math.cos(a), sa = Math.sin(a);
    const at = (r, y) => [r * ca, y, -r * sa];
    const y0 = 0.02, y1 = D - 0.02, rl = R + 0.009;
    sw(k.lathe({ name: `${name}${i}`, mat: 'band', segs: q(8, 6), profile: profile([[0, y0 - 0.002], [0.0042, y0 + 0.002, sm], [0.0042, y1 - 0.002, sm], [0, y1 + 0.002]]), xf: place.mul(xf({ pos: at(rl, 0) })) }), 'chrome');
    for (const [yy, s] of [[y0 + 0.012, 0], [y1 - 0.012, 1]]) {
      sw(k.box({ name: `${name}${i}Mount${s}`, mat: 'band', size: [0.011, 0.012, 0.008], segs: 0, omit: ['nx'], xf: place.mul(xf({ pos: at(R + 0.004, yy), rot: [0, a, 0] })) }), 'chrome');
    }
    if (k.lod === 0) {
      // 调音螺杆：从鼓圈翻边穿下来，顶上一个方头
      for (const [ya, yb, s] of [[D - 0.002, y1 + 0.002, 1], [0.002, y0 - 0.002, -1]]) {
        sw(k.lathe({ name: `${name}${i}Rod${s > 0 ? 'T' : 'B'}`, mat: 'band', segs: 5, profile: profile([[0.0024, Math.min(ya, yb)], [0.0024, Math.max(ya, yb)]]), xf: place.mul(xf({ pos: at(rl, 0) })) }), 'chrome');
        sw(k.box({ name: `${name}${i}Head${s > 0 ? 'T' : 'B'}`, mat: 'band', size: [0.0065, 0.006, 0.0065], segs: 0, xf: place.mul(xf({ pos: at(rl, ya + s * 0.002), rot: [0, a, 0] })) }), 'chrome');
      }
    }
  }
}
