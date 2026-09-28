import { profile, circle, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { trinketUV } from '../materials/atlas.js';
import { squash } from '../kids/toys.js';

// 梳妆台、首饰岛台上的小东西：全部用首饰调色板（trinkets 材质）—— 金、玫瑰金、银、钢、珍珠、宝石、
// 香水、口红、瓷瓶和花，每个部件整个涂成一种颜色；香水瓶身是透明玻璃（glass 材质），瓶里的香水是调色板里的实心块。

// 把部件整个涂成调色板里的一种颜色
export function tint(part, name) {
  const uv = trinketUV(name);
  part.T = part.T.map(() => uv);
  return part;
}

const s = { smooth: true };

// —— 香水瓶 ——
// kind：'square' 方瓶（厚玻璃，金色方盖）、'round' 扁圆瓶（金色高帽）、'slim' 细长圆瓶（黑色盖）
// 局部坐标：原点在瓶底中心
export function perfume(k, { name, kind, liquid, fill = 0.72, place }) {
  const q = (...v) => k.q(...v);
  if (kind === 'square') {
    const w = 0.056, d = 0.034, h = 0.074;
    k.extrude({
      name, mat: 'glass', shape: rect(w, d, { r: 0.005, segs: 1 }), depth: h, axis: 'y', caps: [false, true],
      bevel: [0, q(0.003, 0)], xf: place,
    });
    tint(k.box({ name: `${name}Liquid`, mat: 'trinkets', size: [w - 0.012, h * fill, d - 0.012], segs: 0, omit: ['ny'], xf: place.mul(xf({ pos: [0, 0.005 + (h * fill) / 2, 0] })) }), liquid);
    tint(k.lathe({ name: `${name}Neck`, mat: 'trinkets', segs: q(8, 6), profile: profile([[0.009, 0], [0.009, 0.008]]), xf: place.mul(xf({ pos: [0, h, 0] })) }), 'gold');
    tint(k.box({ name: `${name}Cap`, mat: 'trinkets', size: [0.03, 0.024, 0.024], r: q(0.003, 0), segs: q(1, 0), omit: ['ny'], xf: place.mul(xf({ pos: [0, h + 0.008 + 0.012, 0] })) }), 'gold');
    return h + 0.032;
  }
  if (kind === 'round') {
    const R = 0.036, h = 0.064;
    const pr = [[0.022, 0], [R, h * 0.3, s], [R * 0.98, h * 0.55, s], [0.024, h * 0.92, s], [0.011, h]];
    k.lathe({ name, mat: 'glass', segs: q(14, 10, 8), profile: profile(pr), xf: place });
    tint(k.lathe({
      name: `${name}Liquid`, mat: 'trinkets', segs: q(12, 8, 6),
      profile: profile([[0.017, 0.004], [R - 0.005, h * 0.3, s], [R - 0.006, h * fill * 0.8, s], [0, h * fill * 0.8]]), xf: place,
    }), liquid);
    tint(k.lathe({
      name: `${name}Cap`, mat: 'trinkets', segs: q(10, 8, 6),
      profile: profile([[0.012, 0], [0.012, 0.036, { r: 0.002, segs: 1 }], [0, 0.036]]), xf: place.mul(xf({ pos: [0, h - 0.002, 0] })),
    }), 'gold');
    return h + 0.034;
  }
  // slim
  const R = 0.017, h = 0.1;
  k.lathe({ name, mat: 'glass', segs: q(12, 8, 6), profile: profile([[R, 0], [R, h - 0.006, { r: 0.004, segs: 1 }], [0.008, h]]), xf: place });
  tint(k.lathe({ name: `${name}Liquid`, mat: 'trinkets', segs: q(10, 8, 6), profile: profile([[R - 0.003, 0.004], [R - 0.003, h * fill], [0, h * fill]]), xf: place }), liquid);
  tint(k.lathe({
    name: `${name}Cap`, mat: 'trinkets', segs: q(12, 8, 6),
    profile: profile([[R + 0.0005, 0], [R + 0.0005, 0.032, { r: 0.003, segs: 1 }], [0, 0.032]]), xf: place.mul(xf({ pos: [0, h - 0.004, 0] })),
  }), 'onyx');
  return h + 0.028;
}

// —— 托盘：椭圆的金色浅盘（车削一个圆盘再沿 z 压扁）——
export function tray(k, { name, r = 0.15, ratio = 0.66, rim = 0.016, swatch = 'gold', place }) {
  const q = (...v) => k.q(...v);
  const part = k.lathe({
    name, mat: 'trinkets', segs: q(16, 12, 8),
    profile: profile([[r - 0.006, 0], [r, rim - 0.003, s], [r - 0.002, rim, { r: 0.0015, segs: 1 }], [r - 0.008, 0.004, s], [0, 0.004]]),
  });
  squash(part, ratio);
  tint(part, swatch);
  part.transform(place);
}

// —— 瓷的细颈小花瓶，插一枝花（花苞是一个压扁的球，两片叶子是压扁的纺锤）——
export function budVase(k, { name, place }) {
  const q = (...v) => k.q(...v);
  const h = 0.13;
  tint(k.lathe({
    name, mat: 'trinkets', segs: q(12, 8, 6),
    profile: profile([[0.024, 0], [0.034, 0.03, s], [0.03, 0.07, s], [0.009, 0.108, s], [0.0085, h - 0.006, s], [0.012, h, { r: 0.002, segs: 1 }], [0.006, h - 0.004]]),
    xf: place,
  }), 'porcelain');
  if (k.lod >= 2) return;
  const top = [0.028, h + 0.15, 0.012];
  tint(k.sweep({
    name: `${name}Stem`, mat: 'trinkets', shape: circle(0.0022, 3), caps: [false, false],
    path: [[0, h - 0.03, 0], [0.005, h + 0.05, 0.004], [0.017, h + 0.11, 0.01], top].map((p) => place.apply(p)),
  }), 'leaf');
  // 花：一个扁一点的球，下面一圈托着的花萼
  const bloom = k.lathe({
    name: `${name}Bloom`, mat: 'trinkets', segs: q(10, 7),
    profile: profile([[0, -0.002], [0.022, 0.01, s], [0.026, 0.026, s], [0.016, 0.042, s], [0, 0.044]]),
  });
  tint(bloom, 'petal');
  bloom.transform(place.mul(xf({ pos: top, rot: [0.2, 0, -0.25] })));
  for (const [i, y, a] of [[0, 0.08, 0.9], [1, 0.11, -2.3]]) {
    const leaf = k.lathe({
      name: `${name}Leaf${i}`, mat: 'trinkets', segs: q(6, 5),
      profile: profile([[0, 0], [0.012, 0.02, s], [0.009, 0.045, s], [0, 0.06]]),
    });
    squash(leaf, 0.18);
    tint(leaf, 'leaf');
    leaf.transform(place.mul(xf({ pos: [0.01, h + y - 0.06, 0.004], rot: [0, a, 0] }).mul(xf({ rot: [0, 0, -0.9] }))));
  }
}

// —— 口红：金色管身 + 红色膏体（立着，打开的），盖子横躺在旁边 ——
export function lipstick(k, { name, place }) {
  const q = (...v) => k.q(...v);
  tint(k.lathe({ name, mat: 'trinkets', segs: q(10, 7, 5), profile: profile([[0.0095, 0], [0.0095, 0.046, { r: 0.001, segs: 1 }], [0.0072, 0.047]]), xf: place }), 'gold');
  if (k.lod >= 2) return;
  tint(k.lathe({
    name: `${name}Bullet`, mat: 'trinkets', segs: q(8, 6),
    profile: profile([[0.0068, 0], [0.0068, 0.012, s], [0.004, 0.019, s], [0, 0.02]]), xf: place.mul(xf({ pos: [0, 0.047, 0] })),
  }), 'lipstick');
  tint(k.lathe({
    name: `${name}Cap`, mat: 'trinkets', segs: q(10, 7),
    profile: profile([[0.0098, 0], [0.0098, 0.036, { r: 0.0015, segs: 1 }], [0, 0.036]]),
    xf: place.mul(xf({ pos: [0.03, 0.0098, 0.01], rot: [Math.PI / 2, 0.6, 0] })),
  }), 'gold');
}

// —— 粉饼盒：玫瑰金的扁圆盒 ——
export function compact(k, { name, place }) {
  const q = (...v) => k.q(...v);
  tint(k.lathe({
    name, mat: 'trinkets', segs: q(16, 10, 8),
    profile: profile([[0.033, 0], [0.036, 0.006, s], [0.034, 0.012, s], [0, 0.0125]]), xf: place,
  }), 'roseGold');
}

// —— 戒指：一圈金属环（车削一个小圆截面）+ 一颗宝石（八面体一样的车削，平滑法线下像切面宝石）——
// 局部坐标：原点在戒指中心，环立在 xy 平面里（插在戒指卷的缝里，只露出上半圈）
// arc：只做上面这么大角度的一段（插在戒指卷里的戒指，下半圈看不见）
export function ring(k, { name, metal = 'gold', stone = null, R = 0.0095, t = 0.0018, arc = 2 * Math.PI, place }) {
  const q = (...v) => k.q(...v);
  if (k.lod >= 2) return;
  const full = arc >= 2 * Math.PI - 1e-6;
  const n = full ? q(12, 8) : q(7, 5);
  const band = k.sweep({ name, mat: 'trinkets', shape: circle(t, 3), closed: full, caps: [false, false], up: [0, 0, 1],
    path: Array.from({ length: full ? n : n + 1 }, (_, i) => { const a = full ? (2 * Math.PI * i) / n : -arc / 2 + (arc * i) / n; return [R * Math.sin(a), R * Math.cos(a), 0]; }) });
  tint(band, metal);
  band.transform(place);
  if (stone && k.lod < 2) {
    const g = k.lathe({ name: `${name}Stone`, mat: 'trinkets', segs: q(6, 5), profile: profile([[0, 0], [0.0042, 0.0028], [0.0026, 0.0048], [0, 0.005]]) });
    tint(g, stone);
    g.transform(place.mul(xf({ pos: [0, R + t * 0.6, 0] })));
  }
}

// —— 珍珠项链：一串珍珠沿一条闭合的曲线摆着（每颗是一个低面数的小球，平滑法线）——
export function pearls(k, { name, path, r = 0.0045, place }) {
  const q = (...v) => k.q(...v);
  // 沿路径等距放珠子
  const L = [];
  let tot = 0;
  for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; const l = Math.hypot(b[0] - a[0], b[2] - a[2]); L.push(l); tot += l; }
  const n = Math.floor(tot / (2 * r + 0.0006));
  // 每颗珍珠是一个八面体一样的小车削（6 瓣 × 2 段）：9mm 的珠子，平滑法线下看不出棱
  const seg = q(5, 4), prof = profile([[0, -r], [r, 0, s], [0, r]]);
  let i = 0, acc = 0;
  for (let j = 0; j < n; j++) {
    const target = (j * tot) / n;
    while (acc + L[i] < target) { acc += L[i]; i++; }
    const a = path[i], b = path[(i + 1) % path.length], t = (target - acc) / L[i];
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + r, a[2] + (b[2] - a[2]) * t];
    tint(k.lathe({ name: `${name}${j}`, mat: 'trinkets', segs: seg, profile: prof, xf: place.mul(xf({ pos: p })) }), 'pearl');
  }
  return n;
}

// —— 手表：表壳（车削的扁圆柱）+ 表盘 + 表带绕在一个小枕头上（扫掠一圈扁带）——
// 局部坐标：原点在枕头底面中心；枕头沿 x 横放（长 len、直径 dia）
export function watch(k, { name, caseSwatch = 'steel', dial = 'dial', strap = 'strap', dia = 0.05, len = 0.09, place }) {
  const q = (...v) => k.q(...v);
  const cy = dia / 2; // 枕头中心高
  const rs = cy + 0.0015; // 表带贴着枕头
  // 表带：绕枕头一圈（yz 平面里的一个圆），最上面是表壳
  const n = q(10, 8);
  const strapP = k.lod >= 2 ? null : k.sweep({
    name: `${name}Strap`, mat: 'trinkets', shape: rect(0.003, 0.02), closed: true, caps: [false, false], up: [1, 0, 0],
    path: Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [0, cy + rs * Math.cos(a), rs * Math.sin(a)]; }),
  });
  if (strapP) { tint(strapP, strap); strapP.transform(place); }
  // 表壳：略微朝前倾，贴在枕头最上面
  const cp = place.mul(xf({ pos: [0, cy + rs + 0.001, 0.004], rot: [0.12, 0, 0] }));
  tint(k.lathe({
    name: `${name}Case`, mat: 'trinkets', segs: q(12, 9, 6),
    profile: profile([[0.017, 0], [0.019, 0.004, s], [0.0175, 0.009], [0.0155, 0.0095]]), xf: cp,
  }), caseSwatch);
  tint(k.lathe({ name: `${name}Dial`, mat: 'trinkets', segs: q(12, 9, 6), profile: profile([[0.0155, 0.008], [0, 0.008]]), xf: cp }), dial);
  if (k.lod < 2) {
    // 指针：两根细长的小条
    for (const [i, a, l] of [[0, 0.5, 0.011], [1, 2.3, 0.008]]) {
      tint(k.box({
        name: `${name}Hand${i}`, mat: 'trinkets', size: [0.0012, 0.0006, l], segs: 0, omit: ['ny'],
        xf: cp.mul(xf({ pos: [(Math.sin(a) * l) / 2, 0.0085, (Math.cos(a) * l) / 2], rot: [0, a, 0] })),
      }), 'onyx');
    }
    tint(k.lathe({ name: `${name}Crown`, mat: 'trinkets', segs: 6, profile: profile([[0.0022, 0], [0.0022, 0.004], [0, 0.004]]), xf: cp.mul(xf({ pos: [0.0185, 0.0045, 0], rot: [0, 0, -Math.PI / 2] })) }), caseSwatch);
  }
  void len;
}

// —— 手镯：一只躺平的金属圆环 ——
export function bangle(k, { name, swatch = 'gold', R = 0.034, t = 0.0035, place }) {
  const q = (...v) => k.q(...v);
  if (k.lod >= 2) return;
  const n = q(14, 10);
  tint(k.sweep({
    name, mat: 'trinkets', shape: circle(t, q(4, 3)), closed: true, caps: [false, false], up: [0, 1, 0],
    path: Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [R * Math.sin(a), t, R * Math.cos(a)]; }),
  }), swatch).transform(place);
}

// —— 耳环：一对耳钉（小球）/ 一对吊坠（金色细钩 + 宝石水滴）——
export function earrings(k, { name, kind = 'stud', swatch = 'pearl', metal = 'gold', gap = 0.022, place }) {
  const q = (...v) => k.q(...v);
  if (k.lod >= 2) return;
  for (const e of [-1, 1]) {
    const at = place.mul(xf({ pos: [(e * gap) / 2, 0, 0] }));
    if (kind === 'stud') {
      tint(k.lathe({ name: `${name}${e > 0 ? 'R' : 'L'}`, mat: 'trinkets', segs: q(6, 4), profile: profile([[0, 0], [0.004, 0.003, s], [0.0035, 0.0055, s], [0, 0.007]]), xf: at }), swatch);
    } else {
      // 躺着的吊坠：一个水滴形的宝石 + 一小段金色弯钩
      const drop = k.lathe({ name: `${name}${e > 0 ? 'R' : 'L'}`, mat: 'trinkets', segs: q(6, 4), profile: profile([[0, 0], [0.005, 0.005, s], [0.003, 0.011, s], [0, 0.014]]) });
      squash(drop, 0.6);
      tint(drop, swatch);
      drop.transform(at.mul(xf({ pos: [0, 0.003, 0], rot: [-Math.PI / 2, 0, 0] })));
      if (k.lod < 2) {
        tint(k.sweep({
          name: `${name}${e > 0 ? 'R' : 'L'}Hook`, mat: 'trinkets', shape: circle(0.0006, 3), caps: [false, false], up: [0, 1, 0],
          path: roundedPath([[0, 0.003, -0.014], [0, 0.004, -0.024], [0, 0.0035, -0.03]], 0.004, 2).map((p) => at.apply(p)),
        }), metal);
      }
    }
  }
}
