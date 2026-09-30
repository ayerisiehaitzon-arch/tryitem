import { circle, profile } from '../core/shape.js';
import { roundedPath } from '../core/path.js';
import { potterySwatch, wareUV } from '../materials/atlas.js';
import { SHAPES, WARES, arcTable, wareIndex, rimIndex } from './pots.js';
import { catmull as catmullPath } from '../gym2/parts.js';
export { mapUV, frame, aim, invert, ccw, catmull } from '../pets/parts.js';

// 陶艺室几件东西共用的小零件
// 部件整个指向陶艺室图集里的一个纯色格子
export function sw(part, name) {
  const uv = potterySwatch(name);
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
export function rod(k, name, a, b, r, swatch, { segs = null, caps = [true, true], mat = 'pottery' } = {}) {
  const d = sub(b, a), l = len(d);
  const up = Math.abs(d[1]) > 0.9 * l ? [1, 0, 0] : [0, 1, 0];
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(8, 6, 4)), path: [a, b], caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 一根弯管：折线的拐角倒成圆弧，圆截面
export function tube(k, name, pts, r, swatch, { bend = 0.04, n = null, segs = null, caps = [true, true], up = [0, 1, 0], mat = 'pottery' } = {}) {
  const path = roundedPath(pts, bend, n ?? k.q(4, 3, 1));
  const p = k.sweep({ name, mat, shape: circle(r, segs ?? k.q(9, 7, 4)), path, caps, up });
  return swatch ? sw(p, swatch) : p;
}
// 车削件（沿局部 y），可选摆放
export function turned(k, name, pts, swatch, { segs = null, place = null, mat = 'pottery' } = {}) {
  const p = k.lathe({ name, mat, segs: segs ?? k.q(16, 12, 8), profile: profile(pts) });
  if (swatch) sw(p, swatch);
  if (place) p.transform(place);
  return p;
}

// —— 陶器：按 pots.js 的器型车削（原点在圈足底下的中心）。
//    which 是上了釉的成品（WARES 里的 id，贴图集里那一格），或者 { shape, state: 'green' | 'bisque' | 'wet' }（生坯 / 素烧 / 湿泥，
//    用平铺的泥坯材质，车削自带的 UV 是米：u 绕一圈、v 沿轮廓 —— 拉坯的旋纹顺着器型走）。s 整体缩放
const RAW = { green: 'clay_green', bisque: 'clay_bisque', wet: 'clay_wet' };
export function pot(k, name, which, { place = null, s = 1, segs = null } = {}) {
  const glazed = typeof which === 'string', wi = glazed ? wareIndex(which) : -1;
  if (glazed && wi < 0) throw new Error(`没有这件成品: ${which}`);
  const shape = glazed ? WARES[wi].shape : which.shape;
  // 最远一级 LOD 隔一个去掉一个平滑的轮廓点（圈足、口沿这些转折点都留着）
  const src = SHAPES[shape].filter((q, i) => k.lod < 2 || !q[2] || i % 2 === 0);
  const pts = src.map(([r, y, o]) => (o ? [r * s, y * s, o] : [r * s, y * s]));
  const mat = glazed ? 'pottery' : RAW[which.state];
  // 盘子直径大、又常常立着看（轮廓就是一圈边），分段多一点
  const p = k.lathe({ name, mat, grain: 'around', segs: segs ?? (shape === 'plate' ? k.q(28, 18, 10) : k.q(16, 10, 6)), profile: profile(pts) });
  if (glazed) {
    const tab = arcTable(pts), rmax = Math.max(...pts.map((q) => q[0]));
    p.T = p.T.map(([a, t]) => wareUV(wi, a / (2 * Math.PI * rmax), t / tab.L));
  }
  return put(p, place);
}
// 马克杯的把手：沿一个 C 形扫一个扁椭圆截面（在局部 +x 那边）；上釉的贴到那一格外壁中段的釉色上
export function mugHandle(k, name, which, { place = null, s = 1 } = {}) {
  const glazed = typeof which === 'string', wi = glazed ? wareIndex(which) : -1;
  const R = 0.0425 * s, H = 0.095 * s;
  const path = [[R - 0.004 * s, H * 0.82, 0], [R + 0.018 * s, H * 0.84, 0], [R + 0.03 * s, H * 0.62, 0], [R + 0.026 * s, H * 0.36, 0], [R + 0.01 * s, H * 0.24, 0], [R - 0.004 * s, H * 0.22, 0]];
  const p = k.sweep({ name, mat: glazed ? 'pottery' : RAW[which.state], shape: circle(0.006 * s, k.q(8, 6, 4), { rx: 0.0045 * s, ry: 0.0075 * s }), path: catmullPath(path, k.q(3, 2, 1)), caps: [false, false], up: [0, 0, 1] });
  if (glazed) {
    const pts = SHAPES[WARES[wi].shape], tab = arcTable(pts), iR = rimIndex(pts);
    const uv = wareUV(wi, 0.5, (tab.s[iR] * 0.6) / tab.L);
    p.T = p.T.map(() => uv);
  }
  return put(p, place);
}
export { SHAPES, WARES };
