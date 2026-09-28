import { profile, circle, rect, shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { revolve } from '../decor/revolve.js';
import { curveAt } from '../decor/profiles.js';
import { teaCurve } from './profiles.js';
import { teaUV, teaSwatch, TEA_ATLAS } from '../materials/atlas.js';

// 茶具和博古架上的摆件：每个函数把一件东西建在 place（xf）指定的位置上，原点在它的底面中心。
// 车削的器身都走 revolve（设计曲线在 profiles.js，贴图按同一条曲线画）；壶嘴、壶把、提梁是扫掠；
// 其余小零件指向茶具图集里的纯色格子。
export function sw(part, name) {
  const uv = teaSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
const bez2 = (a, b, c, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [0, 1, 2].map((j) => u * u * a[j] + 2 * u * t * b[j] + t * t * c[j]);
});
const scaled = (pts, s) => pts.map(([r, y, o]) => (o ? [r * s, y * s, o] : [r * s, y * s]));
const at = (place, pts) => pts.map((p) => place.apply(p));

// —— 紫砂壶（西施）：壶身、压盖、珠钮、短嘴、耳形把 ——
export function teapot(k, name, place, { segs = null } = {}) {
  const q = (...v) => k.q(...v);
  const n = segs ?? q(16, 12, 8);
  revolve(k, { name: `${name}Body`, mat: 'tea', cv: teaCurve('teapot'), segs: n, tol: q(0.0005, 0.001, 0.002), uv: (u, v) => teaUV('zisha', u, v), xf: place });
  sw(k.lathe({
    name: `${name}Lid`, mat: 'tea', segs: k.lod < 2 ? n : 6,
    profile: profile([[0.0262, 0.0], [0.0262, 0.002, { r: 0.001, segs: 1 }], [0.021, 0.0065, { smooth: true }], [0.011, 0.0092, { smooth: true }],
      [0.0068, 0.0102, { c: 1 }], [0.0074, 0.0142, { smooth: true }], [0.0048, 0.0182, { smooth: true }], [0, 0.0192]]),
    xf: place.mul(xf({ pos: [0, 0.0605, 0] })),
  }), 'zisha');
  if (k.lod < 2) {
    // 壶嘴：从壶腹往外往上，越来越细
    sw(k.sweep({
      name: `${name}Spout`, mat: 'tea', shape: circle(0.0085, q(10, 6)), caps: [false, true], up: [0, 1, 0],
      path: at(place, bez2([0.038, 0.022, 0], [0.068, 0.024, 0], [0.079, 0.052, 0], q(6, 4))), scale: (t) => 1 - 0.5 * t,
    }), 'zisha');
    // 壶把：耳形，两头插进壶身
    sw(k.sweep({
      name: `${name}Handle`, mat: 'tea', shape: circle(0.0045, q(6, 5)), caps: [false, false], up: [0, 0, 1],
      path: at(place, roundedPath([[-0.042, 0.047, 0], [-0.075, 0.05, 0], [-0.08, 0.018, 0], [-0.043, 0.014, 0]], 0.018, q(4, 2))),
    }), 'zisha');
  }
}

// —— 品茗杯：哥窑开片，杯里一汪茶汤 ——
export function cup(k, name, place, { tea = true } = {}) {
  const q = (...v) => k.q(...v);
  revolve(k, { name, mat: 'tea', cv: teaCurve('cup'), segs: q(12, 8, 6), tol: q(0.0008, 0.0015, 0.003), uv: (u, v) => teaUV('celadon', u, v), xf: place });
  if (tea && k.lod < 2) {
    sw(k.lathe({ name: `${name}Tea`, mat: 'tea', segs: q(12, 8), profile: profile([[0.0246, 0.0], [0, 0.0]]), xf: place.mul(xf({ pos: [0, 0.0215, 0] })) }), 'tea');
  }
}

// —— 盖碗（白瓷）：茶托、碗（品茗杯的曲线放大）、碗盖（微微错开一点）——
export function gaiwan(k, name, place) {
  const q = (...v) => k.q(...v);
  const S = 1.35, sm = { smooth: true };
  sw(k.lathe({
    name: `${name}Saucer`, mat: 'tea', segs: q(12, 10, 6),
    profile: profile([[0.034, 0.0], [0.036, 0.0025, sm], [0.049, 0.006, sm], [0.056, 0.0095, { r: 0.0012, segs: 1 }], [0.052, 0.0102], [0.038, 0.0064, sm], [0.0, 0.0062]]),
    xf: place,
  }), 'porcelain');
  revolve(k, { name: `${name}Bowl`, mat: 'tea', cv: teaCurve('cup'), segs: q(10, 8, 6), tol: q(0.001, 0.002, 0.004), scale: S, uv: () => teaSwatch('porcelain'), xf: place.mul(xf({ pos: [0, 0.0062, 0] })) });
  sw(k.lathe({
    name: `${name}Lid`, mat: 'tea', segs: q(10, 8, 5),
    profile: profile([[0.037, 0.0], [0.0405, 0.003, { r: 0.001, segs: 1 }], [0.034, 0.009, sm], [0.022, 0.0135, sm], [0.0105, 0.0152], [0.0105, 0.0205, sm], [0.0075, 0.0228, sm], [0, 0.023]]),
    xf: place.mul(xf({ pos: [0.002, 0.0062 + 0.0315 * S, 0], rot: [0, 0, 0.07] })),
  }), 'porcelain');
}

// —— 公道杯：玻璃，口沿往外捏出一个小嘴；里面半杯茶汤 ——
export function pitcher(k, name, place) {
  const q = (...v) => k.q(...v);
  const part = revolve(k, { name, mat: 'glass', cv: teaCurve('pitcher'), segs: q(16, 12, 8), tol: q(0.0008, 0.0014, 0.003), uv: () => [0, 0] });
  // 捏嘴：+x 方向、口沿附近往外拉
  part.deform((p) => {
    const a = Math.atan2(p[2], p[0]), w = Math.exp(-((a / 0.32) ** 2)) * Math.max(0, Math.min(1, (p[1] - 0.07) / 0.015));
    return [p[0] + 0.007 * w, p[1] + 0.002 * w, p[2]];
  });
  part.transform(place);
  if (k.lod < 2) sw(k.lathe({ name: `${name}Tea`, mat: 'tea', segs: q(16, 10), profile: profile([[0.0342, 0.0], [0, 0.0]]), xf: place.mul(xf({ pos: [0, 0.042, 0] })) }), 'tea');
}

// —— 铁壶（平丸，满身霰点）+ 电陶炉 ——
export function kettle(k, name, place) {
  const q = (...v) => k.q(...v);
  // 电陶炉：黑色的圆墩，顶上一块黑晶面板
  sw(k.lathe({
    name: `${name}Stove`, mat: 'tea', segs: q(20, 12, 10),
    profile: profile([[0.094, 0.0], [0.097, 0.004, { r: 0.003, segs: 1 }], [0.097, 0.052, { r: q(0.01, 0.006, 0), segs: q(2, 1, 1) }], [0.088, 0.062]]),
    xf: place,
  }), 'black');
  sw(k.lathe({ name: `${name}Glass`, mat: 'tea', segs: q(20, 12, 10), profile: profile([[0.089, 0.0], [0.089, 0.003, { r: 0.002, segs: 1 }], [0, 0.003]]), xf: place.mul(xf({ pos: [0, 0.06, 0] })) }), 'glassBlack');
  const P = place.mul(xf({ pos: [0, 0.063, 0] }));
  revolve(k, { name: `${name}Body`, mat: 'tea', cv: teaCurve('kettle'), segs: q(22, 14, 10), tol: q(0.0006, 0.0012, 0.003), uv: (u, v) => teaUV('iron', u, v), xf: P });
  sw(k.lathe({
    name: `${name}Lid`, mat: 'tea', segs: q(16, 12, 8),
    profile: profile([[0.0455, 0.0], [0.0455, 0.003, { r: 0.0015, segs: 1 }], [0.039, 0.009, { smooth: true }], [0.024, 0.0135, { smooth: true }],
      [0.011, 0.015, { c: 1 }], [0.0115, 0.02, { smooth: true }], [0.0085, 0.0255, { smooth: true }], [0, 0.0268]]),
    xf: P.mul(xf({ pos: [0, 0.1305, 0] })),
  }), 'iron');
  if (k.lod < 2) {
    sw(k.sweep({
      name: `${name}Spout`, mat: 'tea', shape: circle(0.0105, q(10, 6)), caps: [false, true], up: [0, 1, 0],
      path: at(P, bez2([0.07, 0.06, 0], [0.105, 0.07, 0], [0.118, 0.1, 0], q(6, 4))), scale: (t) => 1 - 0.45 * t,
    }), 'iron');
  }
  // 提梁：两边肩上各一个耳，一道铁条拱过壶盖；梁顶缠一段藤
  for (const s of [-1, 1]) sw(k.box({ name: `${name}Ear${s > 0 ? 'F' : 'B'}`, mat: 'tea', size: [0.012, 0.016, 0.01], r: 0.003, segs: q(1, 0), xf: P.mul(xf({ pos: [0, 0.117, s * 0.056] })) }), 'iron');
  const arch = [];
  const na = q(12, 8, 5);
  for (let i = 0; i <= na; i++) {
    const a = Math.PI * (i / na);
    arch.push([0, 0.12 + 0.11 * Math.sin(a), 0.058 * Math.cos(a)]);
  }
  sw(k.sweep({ name: `${name}Bail`, mat: 'tea', shape: circle(0.0042, q(6, 5, 4)), caps: [true, true], up: [1, 0, 0], path: at(P, arch) }), 'iron');
  if (k.lod < 2) {
    const wrap = arch.filter((p) => p[1] > 0.12 + 0.11 * 0.86);
    sw(k.sweep({ name: `${name}Rattan`, mat: 'tea', shape: circle(0.0068, q(8, 6)), caps: [true, true], up: [1, 0, 0], path: at(P, wrap) }), 'bamboo');
  }
}

// —— 乌金石茶盘：一圈抛光的石框，里面低 7mm 的盘面刻着出水槽 ——
export function tray(k, name, place) {
  const q = (...v) => k.q(...v);
  const { w: TW, h: TH } = TEA_ATLAS.tray, rim = 0.03, H = 0.035;
  const W = TW + 2 * rim, D = TH + 2 * rim;
  const loop = [[0, -D / 2 + rim / 2], [W / 2 - rim / 2, -D / 2 + rim / 2], [W / 2 - rim / 2, D / 2 - rim / 2], [-W / 2 + rim / 2, D / 2 - rim / 2], [-W / 2 + rim / 2, -D / 2 + rim / 2], [0, -D / 2 + rim / 2]];
  sw(k.sweep({
    name: `${name}Rim`, mat: 'tea', shape: rect(rim, H, { corners: [0, 0, q(0.006, 0.004, 0), q(0.006, 0.004, 0)], segs: q(2, 1, 1) }), closed: true, caps: [false, false], up: [0, 1, 0],
    path: at(place, roundedPath(loop.map(([x, z]) => [x, H / 2, z]), 0.022, q(3, 2, 1)).slice(0, -1)),
  }), 'slate');
  const field = k.box({ name: `${name}Field`, mat: 'tea', size: [TW + 0.004, H - 0.007, TH + 0.004], segs: 0, omit: ['ny', 'px', 'nx', 'pz', 'nz'], xf: xf({ pos: [0, (H - 0.007) / 2, 0] }) });
  field.T = field.P.map((p) => teaUV('tray', (p[0] + TW / 2) / TW, (p[2] + TH / 2) / TH));
  field.transform(place);
}

// —— 将军罐（青花）：罐身按图集里的纹饰带贴；罐盖满蓝。scale 缩放整只罐子（茶叶罐 0.85，博古架上的 2）——
export function jar(k, name, place, scale = 1) {
  const q = (...v) => k.q(...v);
  const n = q(scale > 1.5 ? 18 : 16, 12, 8);
  revolve(k, { name: `${name}Body`, mat: 'tea', cv: teaCurve('jar'), segs: n, tol: q(0.0008, 0.0015, 0.003) / Math.sqrt(scale), scale, uv: (u, v) => teaUV('qinghua', u, v), xf: place });
  const lid = k.lathe({
    name: `${name}Lid`, mat: 'tea', segs: n,
    profile: profile(scaled([[0.0262, 0.0], [0.0282, 0.004, { smooth: true }], [0.0272, 0.012, { smooth: true }], [0.02, 0.021, { smooth: true }], [0.009, 0.027, { smooth: true }], [0, 0.0285]], scale)),
    xf: place.mul(xf({ pos: [0, 0.1285 * scale, 0] })),
  });
  lid.T = lid.P.map(() => teaUV('qinghua', 0.5, 0.995));
}

// —— 梅瓶（哥窑开片）——
export function meiping(k, name, place, scale = 1) {
  const q = (...v) => k.q(...v);
  revolve(k, { name, mat: 'tea', cv: teaCurve('meiping'), segs: q(16, 12, 8), tol: q(0.001, 0.0018, 0.003) / scale, scale, uv: (u, v) => teaUV('celadon', u, v), xf: place });
}

// —— 香炉（鬲式）：矮圆的铜炉，三只短足、口沿上两只立耳，炉里一层香灰 ——
export function burner(k, name, place) {
  const q = (...v) => k.q(...v);
  const lift = 0.018;
  const P = place.mul(xf({ pos: [0, lift, 0] }));
  revolve(k, { name: `${name}Body`, mat: 'tea', cv: teaCurve('burner'), segs: q(14, 10, 8), tol: q(0.0009, 0.0015, 0.003), uv: () => teaSwatch('bronze'), xf: P });
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 6;
    sw(k.lathe({
      name: `${name}Leg${i}`, mat: 'tea', segs: q(8, 6, 3),
      profile: profile([[0.004, 0.0], [0.0065, 0.004, { smooth: true }], [0.008, lift + 0.006]]),
      xf: place.mul(xf({ pos: [0.03 * Math.cos(a), 0, 0.03 * Math.sin(a)] })),
    }), 'bronze');
  }
  if (k.lod < 2) for (const s of [-1, 1]) {
    sw(k.sweep({
      name: `${name}Ear${s > 0 ? 'R' : 'L'}`, mat: 'tea', shape: rect(0.004, 0.006), caps: [true, true], up: [1, 0, 0],
      path: at(P, roundedPath([[s * 0.049, 0.058, -0.009], [s * 0.049, 0.078, -0.009], [s * 0.049, 0.078, 0.009], [s * 0.049, 0.058, 0.009]], 0.006, q(2, 1))),
    }), 'bronze');
  }
  if (k.lod < 2) sw(k.lathe({ name: `${name}Ash`, mat: 'tea', segs: q(14, 8), profile: profile([[0.0485, 0.0], [0.03, 0.003, { smooth: true }], [0, 0.004]]), xf: P.mul(xf({ pos: [0, 0.05, 0] })) }), 'ash');
}

// —— 开片大盘（立着摆）：圈足、斜腹、折沿，正反两面都按俯视位置铺开片 ——
export function plate(k, name, place, R = 0.14) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const part = k.lathe({
    name, mat: 'tea', segs: q(18, 14, 8),
    profile: profile([
      [0, 0.004], [R * 0.42, 0.004], [R * 0.44, 0.0], [R * 0.46, 0.007, { r: 0.0015, segs: 1 }], [R * 0.5, 0.006], [R * 0.9, 0.019, sm], [R, 0.025, { r: q(0.0025, 0.002, 0), segs: 1 }],
      [R * 0.97, 0.0275], [R * 0.86, 0.0235, sm], [R * 0.62, 0.0125, sm], [0, 0.011],
    ]),
  });
  part.T = part.P.map((p) => teaUV('celadon', 0.5 + p[0] / (2.2 * R), 0.5 + p[2] / (2.2 * R)));
  part.transform(place);
}

// —— 壶承：紫砂的圆盘，紫砂壶坐在上面 ——
export function potRest(k, name, place, R = 0.07) {
  const q = (...v) => k.q(...v);
  sw(k.lathe({
    name, mat: 'tea', segs: q(16, 12, 6),
    profile: profile([[R - 0.004, 0.0], [R, 0.004, { smooth: true }], [R + 0.002, 0.011, { r: 0.0015, segs: 1 }], [R - 0.005, 0.012], [R - 0.007, 0.006], [0, 0.006]]),
    xf: place,
  }), 'zisha');
}

// —— 普洱茶饼：扁圆的饼，正面按位置投影到图集里的棉纸（印着 PU ERH 的红圈）——
export function teaCake(k, name, place) {
  const q = (...v) => k.q(...v);
  const R = TEA_ATLAS.cake.r + 0.002, segs = q(16, 10, 6);
  revolve(k, {
    name, mat: 'tea', cv: teaCurve('cake'), segs, tol: q(0.001, 0.002, 0.004), xf: place,
    uv: (u, v) => {
      // 这一环的半径（按弧长在曲线上取），再按俯视位置投影
      const r = curveAt(teaCurve('cake'), v).r;
      const a = Math.PI + 2 * Math.PI * u;
      return teaUV('cake', 0.5 + (r * Math.sin(a)) / (2 * R), 0.5 + (r * Math.cos(a)) / (2 * R));
    },
  });
}

// —— 线装书一摞：每本一个薄盒子，封面投影到图集里的书皮，书口是纸色，书脊一侧靛蓝 ——
export function books(k, name, place, count = 3) {
  const q = (...v) => k.q(...v);
  const { w: BW, h: BH } = TEA_ATLAS.book, T = 0.013;
  const r = k.rand(name);
  for (let i = 0; i < count; i++) {
    const part = k.box({ name: `${name}${i}`, mat: 'tea', size: [BW, T, BH], r: q(0.0015, 0), segs: q(1, 0), omit: ['ny'] });
    const paper = teaSwatch('paper'), indigo = teaSwatch('indigo');
    part.T = part.P.map((p, j) => {
      const n = part.N[j];
      if (n[1] > 0.7) return teaUV('book', (p[0] + BW / 2) / BW, (p[2] + BH / 2) / BH);
      return n[0] > 0.7 ? indigo : paper;
    });
    part.transform(place.mul(xf({ pos: [(r() - 0.5) * 0.012, T / 2 + i * T, (r() - 0.5) * 0.012], rot: [0, (r() - 0.5) * 0.12, 0] })));
  }
}

// —— 供石（灵璧石）：一块瘦高、疙疙瘩瘩的黑石头，立在随形的红木座上 ——
export function rock(k, name, place) {
  const q = (...v) => k.q(...v);
  const H = 0.2, base = 0.026;
  // 形变：几路不同方向的正弦叠在一起，外加往一边歪、上细下粗
  const bump = (x, y, z) => 0.012 * Math.sin(31 * x + 17 * y + 3) * Math.sin(23 * z - 19 * y + 1) + 0.008 * Math.sin(57 * y + 41 * x) * Math.cos(47 * z + 9)
    + 0.004 * Math.sin(97 * x + 83 * y - 71 * z);
  const part = k.box({ name: `${name}Stone`, mat: 'tea', size: [0.11, H, 0.075], r: q(0.03, 0.03, 0.025), segs: q(2, 2, 1), div: q([3, 5, 2], [2, 3, 1], 1) });
  part.deform((p) => {
    const t = (p[1] + H / 2) / H;
    const taper = 1.05 - 0.45 * t;
    const nx = p[0] * taper, nz = p[2] * taper;
    const len = Math.hypot(nx, p[1] * 0.5, nz) || 1;
    const b = bump(p[0], p[1], p[2]);
    return [nx + (nx / len) * b + 0.02 * t * t, p[1] + H / 2 + base - 0.004 + (p[1] / len) * b * 0.4, nz + (nz / len) * b];
  });
  sw(part, 'rock');
  part.transform(place);
  // 随形座：底座的俯视轮廓是一圈起伏的圆
  const pts = [];
  const n = q(16, 10, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const r = 0.068 + 0.008 * Math.sin(3 * a + 1) + 0.005 * Math.sin(5 * a);
    pts.push([r * Math.cos(a) * 1.1, r * Math.sin(a) * 0.8, { smooth: true }]);
  }
  k.extrude({ name: `${name}Stand`, mat: 'rosewood', shape: shape(pts), depth: base, axis: 'y', bevel: [0, q(0.006, 0.004, 0)], bsegs: q(2, 1, 1), caps: [false, true], xf: place });
}

// —— 茶道筒（湘妃竹）：一截竹筒，插着茶则、茶针、茶夹、茶匙 ——
export function toolHolder(k, name, place) {
  const q = (...v) => k.q(...v);
  const H = 0.11, R = 0.024, L = TEA_ATLAS.bamboo.len;
  const part = k.lathe({
    name: `${name}Tube`, mat: 'tea', segs: q(14, 10, 6),
    profile: profile([[R - 0.0005, 0.0], [R, 0.003, { smooth: true }], [R, H, { r: 0.001, segs: 1 }], [R - 0.003, H], [R - 0.003, H - 0.01]]),
  });
  part.T = part.P.map((p) => teaUV('bamboo', Math.min(0.95, 0.04 + p[1] / L), (Math.atan2(p[2], p[0]) / (2 * Math.PI) + 1) % 1));
  part.transform(place);
  if (k.lod < 2) {
    const tools = [
      { x: -0.008, z: 0.006, len: 0.17, w: 0.008, t: 0.003, lean: [0.06, 0.1] },   // 茶则（扁长）
      { x: 0.009, z: -0.005, len: 0.16, w: 0.003, t: 0.003, lean: [-0.09, 0.05] }, // 茶针
      { x: 0.004, z: 0.011, len: 0.165, w: 0.006, t: 0.0025, lean: [0.03, -0.12] }, // 茶夹
      { x: -0.01, z: -0.009, len: 0.155, w: 0.005, t: 0.0025, lean: [-0.05, -0.08] }, // 茶匙
    ];
    tools.forEach((tl, i) => {
      sw(k.box({
        name: `${name}Tool${i}`, mat: 'tea', size: [tl.w, tl.len, tl.t], segs: 0,
        xf: place.mul(xf({ pos: [tl.x, 0.012 + tl.len / 2, tl.z], rot: [tl.lean[1] * 0.6, 0, tl.lean[0] * 0.6] })),
      }), 'bamboo');
    });
  }
}
