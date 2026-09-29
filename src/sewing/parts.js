import { circle, profile, shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { sewSwatch, threadUV } from '../materials/atlas.js';
import { ccw } from '../pets/parts.js';
export { mapUV, frame, aim, invert, ccw, catmull } from '../pets/parts.js';

// 缝纫间几件东西共用的小零件
// 部件整个指向缝纫间图集里的一个纯色格子
export function sw(part, name) {
  const uv = sewSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// 两点之间一根圆棒
export function rod(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'sewing' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}

// 大头针：针尖在 tip，沿 dir 露出 L，末端一颗彩色的圆珠
const PIN_HEADS = ['pinRed', 'pinYellow', 'pinBlue', 'pinWhite', 'pinGreen'];
export function pin(k, name, tip, dir, L, i) {
  const l = len(dir), d = dir.map((v) => v / l), head = tip.map((v, j) => v + d[j] * L);
  rod(k, `${name}Shaft`, tip, head, 0.0004, 'steel', { segs: 3, caps: [false, false] });
  if (k.lod < 2) {
    const r = 0.0022, sm = { smooth: true };
    sw(k.lathe({ name: `${name}Head`, mat: 'sewing', segs: k.q(6, 5), profile: profile([[0, -r], [r, 0, sm], [0, r]]), xf: xf({ pos: head.map((v, j) => v + d[j] * r * 0.6) }) }), PIN_HEADS[i % PIN_HEADS.length]);
  }
}

// 一个线轴（原点在底面中心，沿局部 y）：中间绕满线（图集里第 color 种线，u 绕一圈、v 沿高度），上下两片白色的挡边；
// 顶上那片挡边的端面贴着线的颜色（线轴头上的色标），插在架子上从正面看过去是一个个彩色的圆
export function spool(k, name, { color, r = 0.013, h = 0.05, flange = 0.003, place }) {
  const segs = k.q(10, 7, 5);
  const fr = r + 0.0016;
  const label = (p) => { const y = h; for (let i = 0; i < p.P.length; i++) if (p.N[i][1] > 0.9 && Math.abs(p.P[i][1] - y) < 1e-6) p.T[i] = threadUV(color, 0.5, 0.5); return p; };
  const body = k.lathe({ name: `${name}Thread`, mat: 'sewing', grain: 'around', segs, profile: profile([[r, flange], [r, h - flange]]) });
  body.T = body.T.map(([a, s]) => threadUV(color, a / (2 * Math.PI * r), s / (h - 2 * flange)));
  const parts = [body];
  if (k.lod < 2) {
    for (const [tag, y0] of [['A', 0], ['B', h - flange]]) {
      const f = sw(k.lathe({ name: `${name}Flange${tag}`, mat: 'sewing', segs, profile: profile([[0.0035, y0], [fr, y0], [fr, y0 + flange], [0.0035, y0 + flange]]) }), 'spoolWhite');
      parts.push(tag === 'B' ? label(f) : f);
    }
  } else {
    // 最远一级 LOD：挡边只留顶上那一圈端面（沿用 LOD0 里挡边的第一个图块）
    parts.push(label(sw(k.lathe({ name: `${name}FlangeB`, mat: 'sewing', segs, profile: profile([[fr, h], [0.0035, h]]) }), 'spoolWhite')));
  }
  if (place) for (const p of parts) p.transform(place);
  return parts;
}

// 剪刀（平放，原点在转轴下面的桌面上，刀尖朝 +x）：两片刀身交叉、张开一点，手柄是沿椭圆扫一圈的圈；s 是整体缩放
export function scissors(k, name, { s = 1, handle = 'handleOrange', place }) {
  const q = (...v) => k.q(...v);
  const blade = [[0, -0.0055], [0.07, -0.004], [0.125, -0.0005], [0.126, 0.0012], [0.07, 0.004], [0, 0.0055], [-0.012, 0.004], [-0.012, -0.004]].map(([x, y]) => [x * s, y * s]);
  const parts = [];
  [[-1, 0.09], [1, -0.09]].forEach(([side, ang], i) => {
    const turn = xf({ rot: [0, ang, 0] });
    parts.push(sw(k.extrude({ name: `${name}Blade${i}`, mat: 'sewing', shape: shape(ccw(blade)), depth: 0.0018 * s, axis: 'y', xf: xf({ pos: [0, (0.0012 + i * 0.002) * s, 0], rot: [0, ang, 0] }) }), 'steel'));
    const m = q(12, 8, 6), y = (0.004 + i * 0.002) * s;
    const ring = Array.from({ length: m }, (_, j) => { const a = (2 * Math.PI * j) / m; return [(-0.034 + 0.02 * Math.cos(a)) * s, y, (side * 0.012 + 0.011 * Math.sin(a)) * s]; });
    parts.push(sw(k.sweep({ name: `${name}Handle${i}`, mat: 'sewing', shape: circle(1, q(6, 4, 4), { rx: 0.0045 * s, ry: 0.0035 * s }), path: ring, closed: true, caps: [false, false], up: [0, 1, 0] }), handle).transform(turn));
    parts.push(sw(k.sweep({ name: `${name}Neck${i}`, mat: 'sewing', shape: circle(0.003 * s, q(6, 4, 4)), path: [[-0.012 * s, y + 0.0005 * s, 0], [-0.016 * s, y + 0.0005 * s, side * 0.004 * s]], up: [0, 1, 0] }), handle).transform(turn));
  });
  parts.push(sw(k.lathe({ name: `${name}Screw`, mat: 'sewing', segs: q(8, 6, 4), profile: profile([[0.0032 * s, 0], [0.0032 * s, 0.006 * s, { smooth: true }], [0, 0.0068 * s]]) }), 'chrome'));
  if (place) for (const p of parts) p.transform(place);
  return parts;
}
