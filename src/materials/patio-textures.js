// 阳台图集的程序化贴图：青瓷鼓凳、陶土花盆、橄榄叶（正 / 背）、橄榄树皮、盆土；
// 以及柚木户外椅用的绳子（三股拧成的绳，可平铺）。
import { perlin, worley, mulberry } from './noise.js';
import { PATIO_ATLAS } from './atlas.js';
import { curveAt } from '../decor/profiles.js';
import { patioCurve } from '../balcony/profiles.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const fract = (x) => x - Math.floor(x);
const wrapD = (d) => d - Math.round(d);

function alloc(S) {
  return { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
}
function put(o, i, c, h, r) {
  o.color[i * 3] = c[0]; o.color[i * 3 + 1] = c[1]; o.color[i * 3 + 2] = c[2];
  o.height[i] = h; o.rough[i] = r;
}
// 不要求周期的 fBm
function fbm2(n, x, y, oct = 3) {
  let s = 0, a = 1, t = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f, 4096, 4096); t += a; a *= 0.5; f *= 2; }
  return s / t;
}

// —— 青瓷鼓凳：上下两排鼓钉、腰上四个镂空的钱纹、满身开片 ——
function stool(out, S, rect, k) {
  const cv = patioCurve('stool'), L = cv.length;
  const X0 = Math.round(rect[0] / k), Y0 = Math.round(rect[1] / k), X1 = Math.round(rect[2] / k), Y1 = Math.round(rect[3] / k);
  const m = PATIO_ATLAS.margin / k, W = X1 - X0 - 2 * m, H = Y1 - Y0 - 2 * m;
  const nV = perlin(601), nC = perlin(602), crk = worley(603);
  const rmax = 0.201, CRK = Math.round(2 * Math.PI * rmax * 70); // 开片：约 1.4cm 一片，绕一圈整数片
  const STUDS = 36, studR = 0.0046, studRows = [0.061, 0.409];
  const COIN = { y: 0.235, R: 0.034, sq: 0.011, bridge: 0.0022 };
  for (let py = Y0; py < Y1; py++) {
    const c = curveAt(cv, (py + 0.5 - Y0 - m) / H);
    const y = c.y, top = c.n[1] > 0.7, circ = 2 * Math.PI * Math.max(c.r, 1e-3);
    for (let px = X0; px < X1; px++) {
      let u = (px + 0.5 - X0 - m) / W;
      u -= Math.floor(u);
      const xm = u * circ; // 绕圈方向的米
      const vary = fbm2(nV, u * 6, c.s * 9, 3);
      // 釉厚：凹处积釉（深、更绿），凸棱釉薄（发白）
      const thin = sstep(20, 120, c.k), thick = sstep(8, 60, -c.k);
      let col = rgb([150, 178, 156]).map((q) => q * (1 + vary * 0.05));
      col = mix3(col, rgb([116, 150, 126]), thick * 0.6);
      col = mix3(col, rgb([196, 210, 190]), thin * 0.55);
      let h = vary * 0.1, rough = 0.14 + vary * 0.03;
      // 鼓钉：半球形的小凸点，顶上釉薄发白
      if (!top) for (const ry of studRows) {
        const du = wrapD(u * STUDS) / STUDS * circ, dy = y - ry, d = Math.hypot(du, dy);
        if (d < studR * 1.8) {
          const b = d < studR ? Math.sqrt(1 - (d / studR) ** 2) : 0;
          const ring = (1 - sstep(studR, studR * 1.8, d)) * (1 - b); // 钉脚一圈积釉
          col = mix3(col, rgb([198, 212, 192]), b * 0.7);
          col = mix3(col, rgb([108, 142, 118]), ring * 0.5);
          h += b * 2.2 - ring * 0.3;
        }
      }
      // 钱纹镂空：圆孔里留一块方钱、四根斜撑；孔边一圈积釉
      let hole = 0;
      if (!top) {
        const cu = Math.round(u * 4 - 0.5) + 0.5, dxm = wrapD((u * 4 - cu) / 4) * circ, dym = y - COIN.y;
        const d = Math.hypot(dxm, dym);
        if (d < COIN.R + 0.006) {
          const inSq = Math.max(Math.abs(dxm), Math.abs(dym)) < COIN.sq;
          const diag = Math.min(Math.abs(dxm - dym), Math.abs(dxm + dym)) / Math.SQRT2 < COIN.bridge;
          const open = d < COIN.R && !inSq && !diag ? 1 : 0;
          const rim = 1 - sstep(0, 0.005, Math.abs(d - COIN.R));
          hole = open;
          col = mix3(col, rgb([104, 138, 114]), rim * 0.6 * (1 - open));
          h += rim * 0.8;
        }
      }
      // 开片：Voronoi 边上的细线，釉下的冰裂纹
      const f = crk(u * CRK, c.s * 70, CRK, 4096);
      const crack = 1 - sstep(0.02, 0.06, f.f2 - f.f1);
      col = col.map((q) => q * (1 - crack * 0.09));
      // 底足一圈露胎
      const foot = 1 - sstep(0.004, 0.007, y);
      col = mix3(col, rgb([176, 146, 114]).map((q) => q * (1 + fbm2(nC, u * 60, c.s * 60, 2) * 0.1)), foot * (top ? 0 : 1));
      rough = mix(rough, 0.85, foot * (top ? 0 : 1));
      if (hole) { col = rgb([24, 28, 26]); h = -3; rough = 1; }
      put(out, py * S + px, col, h, rough);
    }
  }
}

// —— 陶土花盆：橙红的陶，底部和卷边下面泛白碱，贴地一圈颜色发深（潮）——
function pot(out, S, rect, k) {
  const cv = patioCurve('pot');
  const X0 = Math.round(rect[0] / k), Y0 = Math.round(rect[1] / k), X1 = Math.round(rect[2] / k), Y1 = Math.round(rect[3] / k);
  const m = PATIO_ATLAS.margin / k, W = X1 - X0 - 2 * m, H = Y1 - Y0 - 2 * m;
  const nB = perlin(611), nV = perlin(612), nG = perlin(613);
  const grain = (px, py) => mulberry(px * 7919 + py * 131 + 5)() - 0.5;
  for (let py = Y0; py < Y1; py++) {
    const c = curveAt(cv, (py + 0.5 - Y0 - m) / H);
    const y = c.y, inner = c.zone === 'in';
    for (let px = X0; px < X1; px++) {
      let u = (px + 0.5 - X0 - m) / W;
      u -= Math.floor(u);
      const vary = fbm2(nV, u * 7, c.s * 10, 3);
      let col = rgb([184, 106, 68]).map((q) => q * (1 + vary * 0.07 + grain(px, py) * 0.08));
      // 拉坯旋纹（法线里）
      const rings = Math.sin((2 * Math.PI * c.s) / 0.009 + 1.2 * fbm2(nG, u * 5, c.s * 20, 2));
      // 泛碱：盆底和卷边下沿最重，一片片的
      const zoneB = Math.max(1 - sstep(0.01, 0.07, y), (1 - sstep(0.0, 0.01, Math.abs(y - 0.347))) * 0.9);
      const bloom = sstep(0.15, 0.5, fbm2(nB, u * 9, c.s * 14, 4) * 0.8 + zoneB * 0.55 - 0.05) * (inner ? 0 : 1);
      col = mix3(col, rgb([214, 196, 176]), bloom * 0.4);
      // 贴地一圈发深（潮）
      col = col.map((q) => q * (1 - 0.18 * (1 - sstep(0, 0.03, y)) * (inner ? 0 : 1)));
      // 卷边颜色略浅、磨得旧一点
      const lip = sstep(0.345, 0.36, y) * (inner ? 0 : 1);
      col = mix3(col, rgb([196, 124, 86]), lip * 0.25);
      if (inner) col = col.map((q) => q * 0.72);
      put(out, py * S + px, col, rings * 0.15 + grain(px, py) * 0.3 + bloom * 0.2, 0.86 + bloom * 0.08);
    }
  }
}

// —— 橄榄叶：细长的披针形叶，正面深灰绿有光泽，背面银灰哑光；中间一道浅色主脉 ——
function leafRegion(out, S, rect, k, P) {
  const n = perlin(P.seed), n2 = perlin(P.seed + 1);
  const X0 = Math.round(rect[0] / k), Y0 = Math.round(rect[1] / k), X1 = Math.round(rect[2] / k), Y1 = Math.round(rect[3] / k);
  for (let py = Y0; py < Y1; py++) for (let px = X0; px < X1; px++) {
    const lu = (px + 0.5 - X0) / (X1 - X0), lv = (py + 0.5 - Y0) / (Y1 - Y0);
    const a = Math.abs(lu - 0.5) * 2, t = 1 - lv;
    const noise = fbm2(n, lu * 8, lv * 30, 3) * P.noise + fbm2(n2, lu * 40, lv * 160, 2) * P.fine;
    let col = mix3(P.center, P.edge, a ** 1.5).map((q) => q * (1 + noise));
    const mid = 1 - sstep(0.03, 0.07 + 0.04 * (1 - t), a);
    col = mix3(col, P.vein, mid * P.veinMix);
    col = mix3(col, P.tip, (1 - sstep(0, 0.12, t)) * 0.4);
    put(out, py * S + px, col, mid * 0.5 + noise * 2, P.rough + mid * 0.05);
  }
}

// —— 橄榄树皮：灰褐、深裂、沿着扭转的方向，零星几点地衣 ——
function bark(out, S, rect, k) {
  const n = perlin(621), n2 = perlin(622), lic = worley(623);
  const X0 = Math.round(rect[0] / k), Y0 = Math.round(rect[1] / k), X1 = Math.round(rect[2] / k), Y1 = Math.round(rect[3] / k);
  for (let py = Y0; py < Y1; py++) for (let px = X0; px < X1; px++) {
    const lu = (px + 0.5 - X0) / (X1 - X0), lv = (py + 0.5 - Y0) / (Y1 - Y0);
    // 扭转：深裂沿对角方向（绕一圈 9 道），裂与裂之间是一块块被横裂切开的树皮
    const ph = lu * 9 + lv * 1.6 + 0.6 * n(lu * 9, lv * 5, 9, 4096);
    const ridge = Math.abs(Math.sin(Math.PI * ph));
    const cross = Math.abs(Math.sin(Math.PI * (lv * 26 + 0.8 * n2(lu * 9, lv * 13, 9, 4096) + Math.floor(ph) * 0.37)));
    const fis = Math.max(1 - sstep(0.12, 0.45, ridge), (1 - sstep(0.03, 0.12, cross)) * 0.7);
    const plate = n2(lu * 27, lv * 16, 27, 4096);
    let col = rgb([116, 108, 96]).map((q) => q * (1 + plate * 0.14));
    col = mix3(col, rgb([50, 44, 38]), fis * 0.85);
    const L = lic(lu * 24, lv * 30, 24, 4096);
    const spot = fract(L.id * 7.7) < 0.12 ? 1 - sstep(0.18, 0.4, L.f1) : 0;
    col = mix3(col, rgb([150, 158, 128]), spot * 0.55 * (1 - fis));
    put(out, py * S + px, col, -fis * 1.2 + plate * 0.3 + spot * 0.2, 0.9);
  }
}

// —— 盆土：碎树皮覆盖（大小、颜色不一的木片）——
function soil(out, S, rect, k) {
  const w = worley(631), w2 = worley(632), n = perlin(633);
  const X0 = Math.round(rect[0] / k), Y0 = Math.round(rect[1] / k), X1 = Math.round(rect[2] / k), Y1 = Math.round(rect[3] / k);
  for (let py = Y0; py < Y1; py++) for (let px = X0; px < X1; px++) {
    const lu = (px + 0.5 - X0) / (X1 - X0), lv = (py + 0.5 - Y0) / (Y1 - Y0);
    const a = w(lu * 26, lv * 18, 26, 18), b = w2(lu * 60, lv * 44, 60, 44);
    const chip = sstep(0.04, 0.12, a.f2 - a.f1), fine = sstep(0.05, 0.14, b.f2 - b.f1);
    let col = mix3(rgb([44, 32, 24]), rgb([118, 80, 52]).map((q) => q * (0.7 + 0.6 * a.id)), chip);
    col = mix3(col, rgb([70, 52, 38]), (1 - chip) * fine * 0.5);
    put(out, py * S + px, col.map((q) => q * (1 + n(lu * 40, lv * 40, 40, 40) * 0.1)), chip * 1 + fine * 0.3, 0.95);
  }
}

export function patio(S) {
  const A = PATIO_ATLAS, k = A.size / S, R = A.regions;
  const out = alloc(S);
  stool(out, S, R.stool, k);
  pot(out, S, R.pot, k);
  leafRegion(out, S, R.leafA, k, {
    seed: 641, center: rgb([80, 94, 64]), edge: rgb([62, 74, 50]), vein: rgb([150, 152, 118]), tip: rgb([96, 102, 70]),
    veinMix: 0.55, noise: 0.05, fine: 0.03, rough: 0.42,
  });
  leafRegion(out, S, R.leafB, k, {
    seed: 651, center: rgb([164, 172, 150]), edge: rgb([140, 150, 128]), vein: rgb([186, 188, 164]), tip: rgb([150, 154, 130]),
    veinMix: 0.5, noise: 0.04, fine: 0.06, rough: 0.72,
  });
  bark(out, S, R.bark, k);
  soil(out, S, R.soil, k);
  // 右下角空着的格子：填成树皮色（不会被采样到，只是让 mip 不串色）
  const X0 = Math.round(768 / k), Y0 = Math.round(768 / k);
  for (let py = Y0; py < S; py++) for (let px = X0; px < S; px++) put(out, py * S + px, rgb([96, 86, 74]), 0, 0.9);
  return out;
}

// —— 绳子：三股拧成的绳（可平铺；u 沿绳子一个捻距，v 绕绳子一圈）——
export function rope(S, P) {
  const n = perlin(P.seed);
  const out = alloc(S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = (px + 0.5) / S, v = (py + 0.5) / S;
    // 三股：沿 v 排三条，沿 u 走一个捻距转一圈 —— 斜纹
    const f = fract(v * 3 + u);
    const ply = Math.sin(Math.PI * f); // 每股的圆拱
    const fiber = n(u * 8 + v * 24, (v * 3 + u) * 40, 8, 4096) * 0.5 + n(u * 32, v * 96, 32, 96) * 0.5;
    const k = (0.72 + 0.28 * ply) * (1 + fiber * 0.08);
    put(out, py * S + px, P.color.map((q) => q * k), ply + fiber * 0.15, 0.9 - ply * 0.05);
  }
  return out;
}
