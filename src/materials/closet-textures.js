// 衣帽间的程序化贴图：衣物图集（16 种面料）、面料的细节法线（一小块可平铺的平纹）、首饰调色板。
import { perlin } from './noise.js';
import { CLOTHES_ATLAS, TRINKET_ATLAS } from './atlas.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

function alloc(S) {
  return { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
}
function put(out, i, c, r) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.rough[i] = r;
}

// 几个倍频叠加的噪声（格子不需要平铺，坐标直接用 米 × 频率）
const fb = (n, x, y, oct = 3) => {
  let s = 0, a = 1, t = 0;
  for (let o = 0; o < oct; o++) { s += a * n(x * 2 ** o + o * 17.3, y * 2 ** o + o * 31.7); t += a; a *= 0.5; }
  return s / t;
};
// 周期 T 的余弦在一个像素（宽 w）上的平均：cos × sinc —— 罗纹这种接近像素尺度的起伏不闪、不出摩尔纹
const cosAA = (x, T, w) => { const a = (Math.PI * w) / T; return Math.cos((2 * Math.PI * x) / T) * (a < 1e-4 ? 1 : Math.sin(a) / a); };
// 一维条纹的覆盖率：周期 period 里 [a, b) 是色条，按像素宽 w 求平均（盒式滤波）
function band(x, a, b, period, w) {
  const F = (t) => { const n = Math.floor(t / period), r = t - n * period; return n * (b - a) + Math.min(Math.max(r - a, 0), b - a); };
  return (F(x + w / 2) - F(x - w / 2)) / w;
}

// 格子呢的色纱排列（sett）：[颜色, 宽 mm]，到头镜像回来（对称的 sett，和真的格子呢一样）
const TARTAN = { navy: [34, 46, 84], black: [20, 22, 26], green: [36, 82, 60], red: [178, 40, 42] };
const SETT = [['navy', 10], ['black', 2], ['navy', 2], ['black', 2], ['navy', 2], ['black', 10], ['green', 10], ['red', 1.6], ['green', 10], ['black', 10]];
const SETT_LEN = SETT.reduce((s, [, w]) => s + w, 0) / 1000;
function settColor(x) {
  const T = 2 * SETT_LEN;
  let t = ((x % T) + T) % T;
  if (t > SETT_LEN) t = T - t; // 镜像
  let acc = 0;
  for (const [c, w] of SETT) { acc += w / 1000; if (t < acc) return rgb(TARTAN[c]); }
  return rgb(TARTAN[SETT[SETT.length - 1][0]]);
}
const settAA = (x, w) => {
  let c = [0, 0, 0];
  for (let s = 0; s < 4; s++) c = c.map((m, i) => m + settColor(x + ((s + 0.5) / 4 - 0.5) * w)[i] / 4);
  return c;
};

// 麻花针：一列一列的麻花（两股交叉，永远是同一股压在上面 —— 绳子一样拧着往上走），
// 麻花两边各一条反针的凹槽，列与列之间一条扭针的细罗纹。返回 0~1 的“高度”（颜色里用来压暗凹处）
function cableHeight(u, v) {
  const Wp = 0.046, L = 0.042, cw = 0.0125, sw = 0.0068;
  const vp = ((v % Wp) + Wp) % Wp - Wp / 2; // 列中心为 0
  const av = Math.abs(vp);
  if (av < cw + 0.002) {
    const ph = u / L;
    const c = Math.cos(Math.PI * ph), s = Math.sin(Math.PI * ph);
    const vA = (cw / 2) * c, vB = -(cw / 2) * c;
    const bump = (d) => { const x = d / sw; return x >= 1 ? 0 : Math.sqrt(1 - x * x); };
    let hA = bump(Math.abs(vp - vA)), hB = bump(Math.abs(vp - vB));
    // 交叉处：往 +v 走的那一股在上面，另一股被压下去
    const cross = 1 - Math.abs(c);
    if (s < 0) hB *= 1 - 0.55 * cross; else hA *= 1 - 0.55 * cross;
    return 0.25 + 0.75 * Math.max(hA, hB);
  }
  if (av < Wp / 2 - 0.004) return 0.2; // 反针凹槽
  const r = 1 - Math.abs(av - (Wp / 2 - 0.002)) / 0.002; // 扭针细罗纹
  return 0.3 + 0.4 * clamp01(r);
}

// 每种面料一个画法：(u, v) 是格子里的位置（米，u 沿经向），px 是一个像素多少米，N 是几路噪声。返回 { c: sRGB 0~1, r: 粗糙度 }
const FABRICS = {
  // 白色牛津纺：纱线粗细不匀，顺经向有细长的条影；远看是一层极淡的雪花
  oxford: (u, v, px, N) => {
    const streak = N.a(v * 700, u * 12) * 0.55 + N.b(v * 1900, u * 30) * 0.45;
    const k = 1 + streak * 0.018 + fb(N.c, u * 5, v * 5) * 0.02;
    return { c: mul(rgb([238, 238, 235]), k), r: 0.86 };
  },
  // 浅蓝牛津纺：蓝色经纱 × 白色纬纱，混出来的浅蓝带着雪花点
  oxfordBlue: (u, v, px, N) => {
    const streak = N.a(v * 700, u * 12) * 0.55 + N.b(v * 1900, u * 30) * 0.45;
    const fleck = N.d(u * 900, v * 900);
    const c = mix3(rgb([150, 178, 212]), rgb([236, 238, 240]), 0.32 + fleck * 0.12);
    return { c: mul(c, 1 + streak * 0.035 + fb(N.c, u * 5, v * 5) * 0.025), r: 0.86 };
  },
  // 蓝白条纹：一个周期正好 4 个像素（约 13.6mm，蓝条 5mm）—— 周期不是整像素的话，条纹会一深一浅地“拍”
  stripe: (u, v, px, N) => {
    const s = band(v, 0, px * 1.47, px * 4, px);
    const streak = N.a(v * 700, u * 12) * 0.5 + N.b(v * 1900, u * 30) * 0.5;
    const c = mix3(rgb([240, 240, 238]), rgb([74, 108, 170]), s);
    return { c: mul(c, 1 + streak * 0.025 + fb(N.c, u * 5, v * 5) * 0.02), r: 0.84 };
  },
  // 格子法兰绒：深蓝 / 墨绿 / 黑，一道细红线；经纬两个方向的色纱各占一半。起绒的面料有一层柔和的斑驳
  plaid: (u, v, px, N) => {
    const a = settAA(v, px), b = settAA(u, px);
    const c = mix3(a, b, 0.5);
    return { c: mul(c, 1 + fb(N.c, u * 40, v * 40) * 0.06 + N.d(u * 700, v * 700) * 0.04), r: 0.94 };
  },
  // 驼色羊毛大衣呢：缩绒的面，大片的深浅 + 细小的毛点
  camel: (u, v, px, N) => {
    const k = 1 + fb(N.a, u * 4, v * 4) * 0.05 + fb(N.b, u * 60, v * 60) * 0.03 + N.d(u * 800, v * 800) * 0.03;
    return { c: mul(rgb([184, 142, 98]), k), r: 0.95 };
  },
  // 炭灰法兰绒：麻灰色 —— 深色的底上夹着浅色的纤维点
  charcoal: (u, v, px, N) => {
    const fleck = Math.max(0, N.d(u * 1100, v * 1100) - 0.35);
    const k = 1 + fb(N.a, u * 4, v * 4) * 0.04 + fleck * 0.35 + N.b(u * 500, v * 500) * 0.03;
    return { c: mul(rgb([70, 72, 77]), k), r: 0.95 };
  },
  // 黑色绉纱：细小的颗粒起伏
  crepe: (u, v, px, N) => {
    const k = 1 + N.a(u * 500, v * 500) * 0.05 + fb(N.b, u * 6, v * 6) * 0.03;
    return { c: mul(rgb([34, 34, 38]), k), r: 0.8 };
  },
  // 香槟色真丝缎：顺经向很长的光泽条影，粗糙度低
  silk: (u, v, px, N) => {
    const lus = N.a(v * 110, u * 3) * 0.6 + N.b(v * 330, u * 6) * 0.4;
    return { c: mul(rgb([226, 204, 174]), 1 + lus * 0.05), r: 0.34 + lus * 0.04 };
  },
  // 靛蓝牛仔布：经纱是靛蓝、每根深浅不同（竖向的长条影），还有竹节
  denim: (u, v, px, N) => {
    const streak = N.a(v * 900, u * 8) * 0.6 + N.b(v * 260, u * 4) * 0.4;
    const slub = Math.max(0, N.c(v * 300, u * 25) - 0.3);
    const k = 1 + streak * 0.13 + slub * 0.25 + fb(N.d, u * 5, v * 5) * 0.05;
    return { c: mul(rgb([46, 64, 102]), k), r: 0.9 };
  },
  // 橄榄绿亚麻：经纬两个方向都有竹节
  olive: (u, v, px, N) => {
    const k = 1 + N.a(v * 420, u * 15) * 0.05 + N.b(u * 420, v * 15) * 0.045 + fb(N.c, u * 5, v * 5) * 0.03;
    return { c: mul(rgb([118, 120, 80]), k), r: 0.9 };
  },
  // 酒红罗纹针织：2 × 2 罗纹，8mm 一个周期
  knitRib: (u, v, px, N) => {
    const rib = 0.5 + 0.5 * cosAA(v, 0.008, px);
    const k = (0.8 + 0.2 * rib) * (1 + N.a(u * 400, v * 400) * 0.04 + fb(N.b, u * 8, v * 8) * 0.03);
    return { c: mul(rgb([128, 36, 50]), k), r: 0.95 };
  },
  // 麻灰平针：深浅纤维混纺，满是细小的点
  knitGrey: (u, v, px, N) => {
    const f = N.a(u * 1500, v * 1500), lf = Math.max(0, N.b(u * 900, v * 1400) - 0.45);
    const k = 1 + f * 0.09 + lf * 0.3 + fb(N.c, u * 8, v * 8) * 0.03;
    return { c: mul(rgb([150, 150, 152]), k), r: 0.95 };
  },
  // 奶白麻花针：凹处压暗（颜色里画出起伏，法线是通用的细织纹）
  knitCable: (u, v, px, N) => {
    let h = 0;
    for (let s = 0; s < 4; s++) h += cableHeight(u + ((s % 2) - 0.5) * px * 0.5, v + ((s >> 1) - 0.5) * px * 0.5) / 4;
    const k = (0.7 + 0.3 * h) * (1 + N.a(u * 500, v * 500) * 0.04);
    return { c: mul(rgb([234, 224, 204]), k), r: 0.95 };
  },
  // 燕麦色亚麻（收纳盒）
  linen: (u, v, px, N) => {
    const k = 1 + N.a(v * 420, u * 15) * 0.05 + N.b(u * 420, v * 15) * 0.045 + fb(N.c, u * 5, v * 5) * 0.03;
    return { c: mul(rgb([210, 196, 172]), k), r: 0.9 };
  },
  // 干邑色植鞣皮：大片的包浆深浅、细小的毛孔
  leather: (u, v, px, N) => {
    const pat = fb(N.a, u * 9, v * 9);
    const k = 1 + pat * 0.1 + N.b(u * 700, v * 700) * 0.03;
    return { c: mul(rgb([146, 86, 48]), k), r: 0.44 - pat * 0.06 };
  },
  // 黑色光面皮
  leatherBlack: (u, v, px, N) => {
    const pat = fb(N.a, u * 9, v * 9);
    const k = 1 + pat * 0.08 + N.b(u * 700, v * 700) * 0.03;
    return { c: mul(rgb([34, 31, 30]), k), r: 0.36 - pat * 0.05 };
  },
};

// ——————————————————————— 衣物图集 ———————————————————————
export function clothes(S, P) {
  const A = CLOTHES_ATLAS, cell = S / A.cols, m = (A.margin * S) / A.size, inner = cell - 2 * m;
  const N = { a: perlin(P.seed), b: perlin(P.seed + 1), c: perlin(P.seed + 2), d: perlin(P.seed + 3) };
  const out = alloc(S);
  A.cells.forEach((cl, i) => {
    const paint = FABRICS[cl.name];
    const x0 = (i % A.cols) * cell, y0 = Math.floor(i / A.cols) * cell;
    const px = cl.P / inner;
    // 格子边上的 margin 里接着往外画（双线性过滤、mipmap 取到边上时颜色是连续的）
    for (let y = y0; y < y0 + cell; y++) {
      const v = ((y + 0.5 - y0 - m) / inner - 0.5) * cl.P;
      for (let x = x0; x < x0 + cell; x++) {
        const u = ((x + 0.5 - x0 - m) / inner - 0.5) * cl.P;
        const { c, r } = paint(u, v, px, N);
        put(out, y * S + x, c, r);
      }
    }
  });
  return out;
}

// ——————————————————————— 面料的细节法线 ———————————————————————
// 一小块可平铺的平纹（32 根经纱 × 32 根纬纱，一上一下交织）。衣物材质把它在图集上重复 128 次：
// 衬衫格子里一块约 2.7cm（一根纱 0.85mm），大衣 4cm，毛衣 1.4cm —— 远看被 mipmap 平均掉，近看是布
export function weave(S) {
  const T = 32;
  const n = perlin(521);
  const h = new Float32Array(S * S);
  const prof = (a) => { const d = (a - 0.5) / 0.46; return d * d >= 1 ? 0 : Math.sqrt(1 - d * d); };
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S, fy = v * T, j = Math.floor(fy), ay = fy - j;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, fx = u * T, i = Math.floor(fx), ax = fx - i;
      const upW = 0.5 + 0.5 * Math.sin(Math.PI * (fy + i));
      const upF = 0.5 + 0.5 * Math.sin(Math.PI * (fx + j + 1));
      const hw = prof(ax) * (0.45 + 0.55 * upW), hf = prof(ay) * (0.45 + 0.55 * upF);
      h[y * S + x] = Math.max(hw, hf) + n(u * 8, v * 8, 8, 8) * 0.06;
    }
  }
  return h;
}

// ——————————————————————— 首饰调色板 ———————————————————————
// 8 × 8 个 16px 的纯色格子：颜色、粗糙度、金属度（金、玫瑰金、银、钢是 1）。没用到的格子填中灰
export function trinkets(S) {
  const A = TRINKET_ATLAS, cell = S / A.cols;
  const out = alloc(S);
  out.metal = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) put(out, i, [0.5, 0.5, 0.5], 0.5);
  A.swatches.forEach((sw, i) => {
    const cx = (i % A.cols) * cell, cy = Math.floor(i / A.cols) * cell;
    const c = rgb(sw.c);
    for (let y = cy; y < cy + cell; y++) for (let x = cx; x < cx + cell; x++) {
      put(out, y * S + x, c, sw.rough);
      out.metal[y * S + x] = sw.metal ?? 0;
    }
  });
  return out;
}
