import { profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { workshopSwatch } from '../materials/atlas.js';

// 木工房几件东西共用的小工具
// 部件整个指向木工房图集里的一个纯色格子
export function sw(part, name) {
  const uv = workshopSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 按顶点位置（和法线）给 UV
export function mapUV(part, f) {
  part.T = part.P.map((p, i) => f(p, part.N[i]));
  return part;
}
export { ccw, catmull } from '../gym2/parts.js';
const sm = { smooth: true };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// 两点之间一根圆棒（扫掠）
export function rod(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'workshop' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}

// 一根刨花：一条薄带子，先平躺着一段（尾巴），再往上卷成一卷，越卷越紧；带子的宽度沿局部 z（卷的轴）。
//   R1 → R0 从外圈到里圈的半径，turns 圈数，tail 尾巴长（尾梢微微翘起来），w 带宽，pitch 每圈沿轴错开多少，wob 卷得不圆的程度。
//   局部原点在尾巴和卷的交点（贴地的那一点），y 向上，尾巴沿 -x 伸出去；place 摆到位
export function shaving(k, name, { R0, R1, turns, w, tail = 0, t = 0.0006, pitch = 0, wob = 0.08, n = null, place }) {
  const N = Math.max(4, Math.round((n ?? k.q(18, 11, 7)) * turns));
  const path = [];
  if (tail > 0) {
    const m = k.q(3, 2, 1);
    for (let i = 0; i < m; i++) { const f = i / m; path.push([-tail * (1 - f), 0.007 * (1 - f) ** 1.5, 0]); }
  }
  for (let i = 0; i <= N; i++) {
    const f = i / N, a = f * turns * 2 * Math.PI, r = (R1 + (R0 - R1) * f) * (1 + wob * f * Math.sin(3 * a + 1));
    path.push([r * Math.sin(a), R1 - r * Math.cos(a), pitch * f * turns]);
  }
  return sw(k.sweep({ name, mat: 'workshop', shape: rect(t, w), path, up: [0, 0, 1], xf: place }), 'shaving');
}

// 一支铅笔（六棱）：局部 +y 从笔尾到笔尖，place 摆到位
export function pencil(k, name, { L = 0.17, R = 0.0037, place, color = 'pencilYellow' }) {
  const q = (...v) => k.q(...v);
  const segs = 6, cone = 0.022;
  sw(k.lathe({ name: `${name}Body`, mat: 'workshop', segs, profile: profile([[0, 0], [R, 0.0003], [R, L - cone]]), xf: place }), color);
  sw(k.lathe({ name: `${name}Wood`, mat: 'workshop', segs, profile: profile([[R, L - cone], [0.0013, L - 0.004]]), xf: place }), 'pineEnd');
  if (k.lod < 2) sw(k.lathe({ name: `${name}Lead`, mat: 'workshop', segs: q(6, 4), profile: profile([[0.0013, L - 0.004], [0, L]]), xf: place }), 'graphite');
}

// 万向轮（工具柜用）：原点在轮子正上方的安装板底面，place 摆到位；r 轮半径，top 安装板离地
export function caster(k, name, { r = 0.04, w = 0.028, top = 0.105, place }) {
  const q = (...v) => k.q(...v);
  const off = 0.02, yh = top - 0.012;
  sw(k.box({ name: `${name}Plate`, mat: 'workshop', size: [0.07, 0.004, 0.06], r: q(0.003, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [0, top - 0.002, 0] })) }), 'zinc');
  sw(k.lathe({ name: `${name}Swivel`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0, yh - 0.004], [0.024, yh - 0.004, { r: 0.002, segs: 1 }], [0.024, yh + 0.004], [0.018, top - 0.004]]), xf: place }), 'zinc');
  for (const s of [-1, 1]) {
    sw(k.box({ name: `${name}Fork${s > 0 ? 'R' : 'L'}`, mat: 'workshop', size: [0.045, yh - r + 0.006, 0.003], r: q(0.001, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [off / 2, (yh + r) / 2, s * (w / 2 + 0.003)] })) }), 'zinc');
  }
  const axle = place.mul(xf({ pos: [off, r, 0], rot: [Math.PI / 2, 0, 0] }));
  sw(k.lathe({ name: `${name}Wheel`, mat: 'workshop', segs: q(16, 10, 6), profile: profile([[0.012, -w / 2], [r - 0.006, -w / 2, sm], [r, -w / 2 + 0.006, sm], [r, w / 2 - 0.006, sm], [r - 0.006, w / 2, sm], [0.012, w / 2]]), xf: axle }), 'rubber');
  sw(k.lathe({ name: `${name}Hub`, mat: 'workshop', segs: q(8, 6, 4), profile: profile([[0.012, -w / 2 - 0.004], [0.012, w / 2 + 0.004]]), xf: axle }), 'zinc');
}

// 带握孔的环形把手（手锯）：outer 外轮廓（2D 闭合折线，把手平面 x-y），hole = { c, rx, ry } 椭圆握孔，
// 厚 t（沿 z 居中），四周倒圆 r。从握孔中心沿 n 个方向打射线：握孔上的点到外轮廓上的点就是这一站截面的宽度，
// 每站一个圆角矩形截面，绕一圈放样（首尾相接，接缝在 a0 方向）
export function loopHandle(k, name, { mat, outer, hole, t, r, n, a0 = -Math.PI / 2, place = null }) {
  const [cx, cy] = hole.c, m = k.q(2, 1, 1);
  const hit = (dx, dy) => {
    let best = Infinity;
    for (let i = 0; i < outer.length; i++) {
      const [ax, ay] = outer[i], [bx, by] = outer[(i + 1) % outer.length];
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const s = ((ax - cx) * ey - (ay - cy) * ex) / den, u = ((ax - cx) * dy - (ay - cy) * dx) / den;
      if (s > 0 && u >= 0 && u <= 1) best = Math.min(best, s);
    }
    return best;
  };
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (2 * Math.PI * (i % n)) / n;
    const hx = hole.rx * Math.cos(a), hy = hole.ry * Math.sin(a), s0 = Math.hypot(hx, hy);
    const dx = hx / s0, dy = hy / s0, s1 = hit(dx, dy);
    const rr = Math.min(r, (s1 - s0) / 2 - 1e-4, t / 2 - 1e-4);
    // 圆角矩形截面：(s, z)，s 从握孔量到外轮廓
    const sec = [];
    const corners = [[s1 - rr, -t / 2 + rr, -Math.PI / 2], [s1 - rr, t / 2 - rr, 0], [s0 + rr, t / 2 - rr, Math.PI / 2], [s0 + rr, -t / 2 + rr, Math.PI]];
    for (const [ccx, ccz, b0] of corners) {
      for (let j = 0; j <= m; j++) {
        const b = b0 + (j / m) * (Math.PI / 2);
        sec.push([ccx + rr * Math.cos(b), ccz + rr * Math.sin(b)]);
      }
    }
    rings.push(sec.map(([s, z]) => [cx + dx * s, cy + dy * s, z]));
  }
  const p = k.loft({ name, mat, rings });
  if (place) p.transform(place);
  return p;
}
