// 摆件用的程序化贴图：书的调色板图集、陶瓷釉面图集、植物图集（叶 / 树皮 / 盆土）、手工羊毛地毯、流苏
import { perlin, fbm, worley, mulberry } from './noise.js';
import { BOOK_ATLAS, FOLIAGE_ATLAS, CERAMIC_ATLAS } from './atlas.js';
import { vessel, curveAt } from '../decor/profiles.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const fract = (x) => x - Math.floor(x);

function alloc(S, { metal = false, alpha = false } = {}) {
  return {
    color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S),
    metal: metal ? new Float32Array(S * S) : null, alpha: alpha ? new Float32Array(S * S) : null,
  };
}
function put(o, i, c, h, r, m = 0, a = 1) {
  o.color[i * 3] = c[0]; o.color[i * 3 + 1] = c[1]; o.color[i * 3 + 2] = c[2];
  o.height[i] = h; o.rough[i] = r;
  if (o.metal) o.metal[i] = m;
  if (o.alpha) o.alpha[i] = a;
}

// ——————————————————— 书：调色板图集 ———————————————————
// 每个书脊格子：布面底色 + 烫金线 / 深色底带 / 纸标签 / 浅色印刷线 + 一行行“字”。
//   · 烫金是真金属（metalness = 1），在灯下会闪；
//   · “字”是一个个小字块：有字距、词间空格、少数字母更高 —— 远看就是书名，不会像条形码；
//   · 图案用 3×3 超采样算覆盖率，细线和小字边缘干净。
const hash1 = (seed, i) => mulberry(seed * 7919 + i * 104729 + 1)();

export function books(S) {
  const A = BOOK_ATLAS, k = A.size / S;
  const out = alloc(S, { metal: true });
  const wn = perlin(4), fine = perlin(3);
  const gold = rgb([216, 178, 106]), ink = rgb([44, 40, 38]), paper = rgb([236, 229, 208]);
  // 每本书自己的排版（标题长短、行数、竖排位置），固定种子
  const lay = A.palette.map((P, i) => {
    const r = mulberry(100 + i);
    const lum = 0.3 * P.base[0] + 0.59 * P.base[1] + 0.11 * P.base[2];
    return {
      l1: 0.5 + 0.3 * r(), l2: 0.3 + 0.3 * r(), la: 0.3 + 0.25 * r(), two: r() < 0.55,
      vy: 0.1 + 0.08 * r(), vl: 0.3 + 0.22 * r(), seed: 1 + i * 17,
      // 浅色布面用深色印刷，深色布面用浅色印刷
      print: lum > 140 ? mix3(rgb(P.base), [0, 0, 0], 0.62) : mix3(rgb(P.base), [1, 1, 1], 0.62),
    };
  });
  // 一行字：n 个宽窄不一的字块 + 字距 + 偶尔的词间空格，少数字母更高（大写 / 升部）。
  // 字块位置按行预先算好（归一化到 0~1），逐像素只做查找。
  const lines = new Map();
  const glyphRow = (seed, n) => {
    const key = seed * 1000 + n;
    if (lines.has(key)) return lines.get(key);
    const r = mulberry(seed * 7919 + 13);
    const row = [];
    let x = 0;
    for (let j = 0; j < n; j++) {
      const w = 0.5 + 0.5 * r();
      const space = j > 0 && j < n - 1 && r() < 0.14;
      if (!space) row.push([x, x + w, r() < 0.22 ? 1.3 : 1]);
      x += (space ? 0.55 : w) + 0.24;
    }
    const total = x - 0.24;
    for (const g of row) { g[0] /= total; g[1] /= total; }
    lines.set(key, row);
    return row;
  };
  // s 沿行方向，t 是字高方向（基线在 t0，字向 t 减小的方向长）
  const glyphs = (s, t, s0, len, n, t0, th, seed) => {
    const f = (s - s0) / len;
    if (f < 0 || f > 1 || t > t0 || t < t0 - th * 1.3) return 0;
    for (const [a, b, tall] of glyphRow(seed, n)) if (f >= a && f <= b) return t >= t0 - th * tall ? 1 : 0;
    return 0;
  };
  // 横排（跨书脊，自动居中）与竖排（沿书脊）；pitch 是平均每个字占的长度
  const hline = (lx, ly, yc, len, th, pitch, seed) => glyphs(lx, ly, 0.5 - len / 2, len, Math.max(1, Math.round(len / pitch)), yc + th / 2, th, seed);
  const vline = (lx, ly, y0, len, tw, pitch, seed) => glyphs(ly, lx, y0, len, Math.max(1, Math.round(len / pitch)), 0.5 + tw / 2, tw, seed);
  const band = (v, c, w) => (Math.abs(v - c) < w / 2 ? 1 : 0);

  // 书脊上一个点的图案：g 烫金、i 墨色、p 纸标签、l 浅色印刷、d 深色底带（0 / 1）
  const marks = (style, L, lx, ly) => {
    const m = { g: 0, i: 0, p: 0, l: 0, d: 0 };
    const sym = Math.min(ly, 1 - ly); // 上下对称的装饰线
    if (style === 0) {
      m.g = band(sym, 0.05, 0.007) || band(sym, 0.064, 0.003)
        || hline(lx, ly, 0.15, L.l1, 0.016, 0.1, L.seed) || (L.two && hline(lx, ly, 0.185, L.l2, 0.016, 0.1, L.seed + 1))
        || hline(lx, ly, 0.26, L.la, 0.01, 0.075, L.seed + 2) || hline(lx, ly, 0.87, 0.26, 0.009, 0.08, L.seed + 3);
    } else if (style === 1) {
      m.d = ly > 0.8 ? 1 : 0;
      m.g = band(ly, 0.8, 0.005) || band(ly, 0.06, 0.004)
        || vline(lx, ly, L.vy, L.vl, 0.17, 0.02, L.seed) || hline(lx, ly, 0.88, L.la, 0.01, 0.08, L.seed + 2);
    } else if (style === 2) {
      const lab = Math.abs(lx - 0.5) < 0.37 && ly > 0.1 && ly < 0.27;
      const lab2 = Math.abs(lx - 0.5) < 0.3 && ly > 0.835 && ly < 0.9;
      m.p = lab || lab2 ? 1 : 0;
      if (lab) {
        const fx = Math.abs(lx - 0.5);
        m.i = (fx > 0.3 && fx < 0.335 && ly > 0.113 && ly < 0.257) || band(ly, 0.115, 0.005) || band(ly, 0.255, 0.005)
          || hline(lx, ly, 0.152, Math.min(L.l1, 0.5), 0.014, 0.09, L.seed) || (L.two && hline(lx, ly, 0.182, Math.min(L.l2, 0.45), 0.014, 0.09, L.seed + 1))
          || hline(lx, ly, 0.226, 0.3, 0.009, 0.07, L.seed + 2) ? 1 : 0;
      }
      if (lab2) m.i = hline(lx, ly, 0.867, 0.32, 0.012, 0.08, L.seed + 3);
    } else {
      m.l = band(sym, 0.05, 0.003) || band(sym, 0.062, 0.003) || band(sym, 0.074, 0.003)
        || vline(lx, ly, L.vy + 0.1, L.vl, 0.15, 0.02, L.seed) || hline(lx, ly, 0.85, L.la, 0.01, 0.08, L.seed + 2);
    }
    return m;
  };

  const SS = 3; // 超采样
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = (x + 0.5) * k, Y = (y + 0.5) * k;
    const i = y * S + x;
    const cloth = fine(X * 0.9, Y * 0.9) * 0.03 + wn(X * 0.08, Y * 0.08) * 0.03;
    if (Y < A.swatch.y0) {
      const c = Math.floor(X / A.spine.w);
      const P = A.palette[c], L = lay[c];
      const cov = { g: 0, i: 0, p: 0, l: 0, d: 0 };
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const lx = ((x + (sx + 0.5) / SS) * k - c * A.spine.w) / A.spine.w;
        const ly = ((y + (sy + 0.5) / SS) * k - A.spine.y0) / A.spine.h;
        const m = marks(P.style, L, lx, ly);
        for (const key in cov) cov[key] += m[key] / (SS * SS);
      }
      const lx = (X - c * A.spine.w) / A.spine.w;
      // 书脊两侧弯折处磨得略浅
      const wear = 1 + 0.07 * sstep(0.2, 0.04, Math.min(lx, 1 - lx));
      let col = rgb(P.base).map((v) => v * (1 + cloth) * wear);
      col = mix3(col, col.map((v) => v * 0.5), cov.d);
      col = mix3(col, paper, cov.p);
      col = mix3(col, L.print, cov.l);
      col = mix3(col, ink, cov.i);
      col = mix3(col, gold, cov.g);
      let rough = mix(0.8, 0.7, cov.p);
      rough = mix(rough, 0.55, cov.i);
      rough = mix(rough, 0.28, cov.g);
      const h = cloth * 3 + 0.25 * cov.p - 0.5 * cov.g - 0.3 * cov.l - 0.15 * cov.i;
      put(out, i, col, h, rough, cov.g);
    } else if (Y < A.pages.y0) {
      // 封面：一个纯色块整张拉伸到封面上，所以不要高频细节
      const idx = Math.min(15, Math.floor(X / A.swatch.w));
      const col = rgb(A.palette[idx].base).map((v) => v * (1 + wn(X * 0.08, Y * 0.08) * 0.03));
      put(out, i, col, 0, 0.8, 0);
    } else {
      // 书页侧边：每一行亮度略有不同 = 一页一页的纸
      const row = Math.floor(Y - A.pages.y0);
      const rn = mulberry(row * 7 + 1)();
      const b = 0.94 + 0.08 * rn + wn(X * 0.05, Y * 0.5) * 0.02;
      put(out, i, rgb([234, 227, 208]).map((v) => v * b), rn * 0.6, 0.85, 0);
    }
  }
  return out;
}

// ——————————————————— 陶瓷釉面图集 ———————————————————
// 每个区域按对应器型的真实曲线来画（u 绕一圈，v 沿弧长，见 decor/profiles.js）：
//   · 物理坐标：x = u·2πr 是绕圈的真实距离，s 是弧长，y 是高度 —— 铁点是圆的，到了细颈也不会被压扁；
//   · 曲率 κ：凸棱（口沿、肩）釉层变薄、发色，凹处积釉变深；
//   · 高度：底部一圈露胎；白釉瓶是“蘸釉”，釉线下挂着几道流釉，釉的下沿有一圈厚厚的釉边；
//   · 拉坯留下的细密旋纹放在法线里，只在高光里若隐若现。
const wrapD = (d) => d - Math.round(d); // 绕圈方向的最短差（u 单位）

export function ceramics(S) {
  const A = CERAMIC_ATLAS, k = A.size / S;
  const out = alloc(S);
  const n1 = perlin(101), n2 = perlin(102), n3 = perlin(103);
  const white = (px, py) => mulberry(px * 7349 + py * 1277 + 3)(); // 像素级白噪声（胎土砂点）
  const CLAY = {
    bottle: rgb([184, 144, 108]), moon: rgb([188, 164, 134]), bud: rgb([192, 160, 126]), planter: rgb([160, 132, 106]),
  };

  for (const [name, rect] of Object.entries(A.regions)) {
    const cv = vessel(name), L = cv.length;
    const X0 = Math.round(rect[0] / k), Y0 = Math.round(rect[1] / k), X1 = Math.round(rect[2] / k), Y1 = Math.round(rect[3] / k);
    const m = A.margin / k, W = X1 - X0 - 2 * m, H = Y1 - Y0 - 2 * m, RW = X1 - X0;
    const rows = [];
    for (let py = Y0; py < Y1; py++) rows.push(curveAt(cv, (py + 0.5 - Y0 - m) / H));
    const rmax = Math.max(...Object.values(cv.zones).map((z) => z.rmax));

    // —— 斑点（白釉的铁点 / 石墨釉的浅色点）：按真实面积均匀撒，画成物理上的圆 ——
    const spk = new Float32Array(RW * (Y1 - Y0)), halo = new Float32Array(RW * (Y1 - Y0));
    const dots = { bottle: 5200, planter: 2600, moon: 260, bud: 0 }[name];
    if (dots) {
      const r = mulberry(500 + name.length * 31);
      let area = 0;
      for (const row of rows) area += 2 * Math.PI * row.r * (L / H);
      const N = Math.round(dots * area);
      for (let i = 0; i < N; i++) {
        let v, c;
        do { v = r(); c = curveAt(cv, v); } while (r() > c.r / rmax);
        const u = r();
        const q = r();
        const rho = name === 'bottle' ? 0.00022 + 0.0007 * q ** 3 + (q > 0.985 ? 0.0006 : 0) : 0.0002 + 0.0005 * q ** 2;
        const cy = Y0 + m + v * H, cxs = [X0 + m + u * W, X0 + m + (u + 1) * W, X0 + m + (u - 1) * W];
        const circ = 2 * Math.PI * Math.max(c.r, 1e-4);
        const ry = (rho * 2.8) / L * H + 2, rx = (rho * 2.8) / circ * W + 2;
        for (const cx of cxs) {
          if (cx + rx < X0 || cx - rx > X1) continue;
          for (let py = Math.max(Y0, Math.floor(cy - ry)); py < Math.min(Y1, Math.ceil(cy + ry)); py++) {
            const row = rows[py - Y0], rc = 2 * Math.PI * Math.max(row.r, 1e-4);
            const psz = Math.max(rc / W, L / H);
            for (let px = Math.max(X0, Math.floor(cx - rx)); px < Math.min(X1, Math.ceil(cx + rx)); px++) {
              const dx = ((px + 0.5 - cx) / W) * rc, dy = ((py + 0.5 - cy) / H) * L;
              const d = Math.hypot(dx, dy);
              const j = (py - Y0) * RW + (px - X0);
              spk[j] = Math.max(spk[j], clamp01((rho - d) / psz + 0.5));
              halo[j] = Math.max(halo[j], (1 - sstep(rho, rho * 2.8, d)) * 0.5);
            }
          }
        }
      }
    }

    // —— 流釉：白釉瓶的蘸釉线 + 几道垂下来的釉泪 ——
    const drips = [[0.08, 0.016, 0.007], [0.36, 0.03, 0.009], [0.61, 0.011, 0.006], [0.83, 0.021, 0.008]];
    const dipLine = (u, r) => {
      let y = 0.088 + 0.004 * Math.sin(2 * Math.PI * (u + 0.1)) + 0.003 * n1(u * 5, 0.5, 5, 4096);
      let ext = 0;
      for (const [ud, len, w] of drips) {
        const dx = wrapD(u - ud) * 2 * Math.PI * r;
        const t = 1 - (dx / w) ** 2;
        ext = Math.max(ext, t > 0 ? len * Math.sqrt(t) : 0, 0.25 * len * Math.exp(-((dx / (1.8 * w)) ** 2)));
      }
      return y - ext;
    };

    for (let py = Y0; py < Y1; py++) {
      const c = rows[py - Y0];
      const s = c.s, y = c.y, kap = c.k, inner = c.zone !== 'out';
      for (let px = X0; px < X1; px++) {
        let u = (px + 0.5 - X0 - m) / W;
        u -= Math.floor(u);
        const j = (py - Y0) * RW + (px - X0);
        const grain = white(px, py) - 0.5;
        // 拉坯旋纹：沿高度的细密起伏，腹部明显、口沿和底足附近减弱
        const rings = Math.sin((2 * Math.PI * s) / 0.0068 + 1.3 * n2(u * 4, s * 30, 4, 4096))
          * (0.55 + 0.45 * n3(u * 3, s * 22, 3, 4096)) * (inner ? 0.3 : 1);
        // 内壁越深越暗（光进不去），AO 之外再压一点
        const deep = inner ? sstep(0, 0.06, s - cv.zones.in.s0 - 0.012) : 0;
        // 釉的下沿（露胎线）
        let edge, glazed;
        if (name === 'bottle') edge = dipLine(u, c.r);
        else edge = { moon: 0.011, bud: 0.0085, planter: 0.0075 }[name] + 0.0012 * n1(u * 7, 3.5, 7, 4096);
        glazed = inner || y > edge;
        const above = y - edge; // 釉线以上的距离（米）
        const roll = glazed && !inner ? 1 - sstep(0.0005, 0.0032, above) : 0; // 釉边的积釉
        const vary = n2(u * 6, s * 8, 6, 4096); // 低频的釉色起伏
        let col, h, rough;
        if (!glazed) {
          // 露胎：烤色的炻器胎 + 砂点 + 火色
          const fire = sstep(-0.3, 0.6, n3(u * 5, s * 12, 5, 4096));
          col = mix3(CLAY[name], mix3(CLAY[name], [0.72, 0.46, 0.3], 0.35), fire).map((q) => q * (1 + grain * 0.14));
          const near = 1 - sstep(0, 0.004, -above); // 紧挨釉线的胎被釉“烧”深一点
          col = col.map((q) => q * (1 - 0.12 * near));
          h = rings * 0.35 + grain * 0.5;
          rough = 0.84;
        } else if (name === 'bottle') {
          // 白色蘸釉：暖白底色 + 铁点（带淡褐色晕），凸棱处釉薄透出胎色
          col = rgb([236, 231, 219]).map((q) => q * (1 + vary * 0.015));
          col = mix3(col, rgb([204, 174, 138]), sstep(60, 320, kap) * 0.45);
          col = mix3(col, rgb([246, 243, 234]), roll * 0.6);
          col = mix3(col, rgb([176, 146, 114]), halo[j] * 0.45);
          col = mix3(col, rgb([88, 62, 44]), spk[j] * 0.9);
          h = rings * 0.035 + roll * 1.2 - spk[j] * 0.3 + vary * 0.06;
          rough = 0.3 + spk[j] * 0.2 + sstep(60, 320, kap) * 0.12;
        } else if (name === 'moon') {
          // 深青窑变釉：釉厚处深、釉薄处发浅；釉往下流，下半部更厚，底部一圈积釉；只有口沿的尖棱上釉薄到透出褐色
          const flow = n1(u * 11, s * 16, 11, 4096) * 0.6 + n3(u * 23, s * 5, 23, 4096) * 0.4; // 竖向的流纹
          let thick = 0.6 + 0.3 * (1 - clamp01(y / 0.2)) + 0.35 * sstep(6, 40, -kap) + flow * 0.14 + roll * 0.5;
          if (inner) thick = 0.75;
          col = mix3(rgb([36, 88, 92]), rgb([66, 128, 122]), clamp01(0.45 + flow * 0.5 - (thick - 0.7) * 0.8));
          col = mix3(col, rgb([20, 54, 60]), clamp01(thick - 0.85) * 1.4);
          col = mix3(col, rgb([112, 84, 58]), sstep(90, 320, kap) * 0.7);
          col = mix3(col, rgb([60, 44, 34]), spk[j] * 0.8);
          h = rings * 0.03 + roll * 1.0 + flow * 0.05;
          rough = 0.1 + sstep(90, 320, kap) * 0.08;
        } else if (name === 'bud') {
          // 天目釉：近黑的深褐，肩部往下有细密的“兔毫”纹，口沿和肩棱釉薄处发出锈金色
          const hare = sstep(0.45, 0.85, n3(u * 150, s * 30, 150, 4096) + 0.3 * n1(u * 47, s * 70, 47, 4096));
          const up = sstep(0.07, 0.15, y);
          const brk = sstep(60, 220, kap);
          col = rgb([34, 22, 18]).map((q) => q * (1 + vary * 0.08));
          col = mix3(col, rgb([104, 62, 36]), hare * up * 0.45);
          col = mix3(col, rgb([150, 90, 44]), brk * 0.7);
          col = mix3(col, rgb([16, 10, 8]), roll * 0.7);
          if (inner) col = mix3(rgb([34, 22, 18]), rgb([150, 90, 44]), brk * 0.7);
          h = rings * 0.035 + roll * 1.1 + hare * 0.03;
          rough = 0.09 + brk * 0.06;
        } else {
          // 石墨色哑光釉：炭灰底 + 浅色斑点，口沿釉薄处发灰褐
          col = rgb([60, 60, 62]).map((q) => q * (1 + vary * 0.05));
          col = mix3(col, rgb([128, 116, 102]), sstep(60, 300, kap) * 0.5);
          col = mix3(col, rgb([96, 92, 88]), halo[j] * 0.25);
          col = mix3(col, rgb([168, 162, 152]), spk[j] * 0.85);
          h = rings * 0.06 + roll * 0.8 + spk[j] * 0.2 + vary * 0.06;
          rough = 0.46 + spk[j] * 0.1;
        }
        if (deep) col = col.map((q) => q * (1 - 0.55 * deep));
        put(out, py * S + px, col, h, rough);
      }
    }
  }
  return out;
}

// ——————————————————— 植物图集 ———————————————————
export function foliage(S) {
  const out = alloc(S);
  const R = FOLIAGE_ATLAS.regions, k = FOLIAGE_ATLAS.size / S;
  const n = perlin(91), n2 = perlin(92), w = worley(93);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = (x + 0.5) * k, Y = (y + 0.5) * k;
    const i = y * S + x;
    const inR = (r) => X >= r[0] && X < r[2] && Y >= r[1] && Y < r[3];
    const loc = (r) => [(X - r[0]) / (r[2] - r[0]), (Y - r[1]) / (r[3] - r[1])];
    if (inR(R.fig)) {
      // 琴叶榕：深绿、有光泽，浅色主脉 + 向叶尖弯的侧脉
      const [lu, lv] = loc(R.fig);
      const t = 1 - lv, a = Math.abs(lu - 0.5) * 2;
      const noise = n(lu * 20, lv * 20) * 0.04 + n2(lu * 80, lv * 80) * 0.02;
      let col = mix3(rgb([34, 62, 32]), rgb([60, 96, 48]), clamp01(0.75 - a * 0.6 + noise * 3));
      const wm = 0.045 * (1 - 0.75 * t);
      const mid = 1 - sstep(wm * 0.5, wm, a);
      const f = t - (0.5 * a + 0.22 * a * a);
      const N = 9;
      const fr = fract(f * N + 0.35);
      const dist = Math.min(fr, 1 - fr) / N;
      const vein = a > wm && a < 0.96 ? 1 - sstep(0.002, 0.006 * (1 - 0.5 * a), dist) : 0;
      col = mix3(col, rgb([118, 148, 80]), vein * 0.55);
      col = mix3(col, rgb([176, 184, 116]), mid);
      col = mix3(col, rgb([88, 104, 52]), sstep(0.93, 1, a) * 0.5);
      put(out, i, col.map((q) => q * (1 + noise)), mid * 0.6 - vein * 0.4 + noise, 0.36 + vein * 0.12 + mid * 0.15);
    } else if (inR(R.snake)) {
      // 虎尾兰：深绿底 + 浅灰绿波浪横纹 + 金边
      const [lu, lv] = loc(R.snake);
      const t = 1 - lv, a = Math.abs(lu - 0.5) * 2;
      const g = t * 30 + 0.28 * Math.sin(lu * 9 + t * 34) + 0.2 * n(lu * 8, t * 40);
      const band = sstep(0.5, 0.72, fract(g)) * (1 - sstep(0.82, 0.97, fract(g)));
      let col = mix3(rgb([34, 60, 38]), rgb([112, 134, 102]), band * 0.75);
      col = mix3(col, rgb([150, 162, 118]), (1 - sstep(0.02, 0.1, t)) * 0.6);
      const margin = sstep(0.82, 0.9, a);
      col = mix3(col, rgb([188, 172, 80]), margin);
      put(out, i, col.map((q) => q * (1 + n2(lu * 60, lv * 60) * 0.03)), band * 0.3 + margin * 0.2, 0.42 + band * 0.08);
    } else if (inR(R.bark)) {
      const [lu, lv] = loc(R.bark);
      const ridge = Math.abs(Math.sin(lu * Math.PI * 2 * 7 + n(lu * 6, lv * 3) * 2.2));
      const fis = 1 - sstep(0.08, 0.3, ridge);
      let col = rgb([104, 86, 66]).map((q) => q * (1 + n2(lu * 30, lv * 12) * 0.08));
      col = mix3(col, rgb([58, 46, 38]), fis * 0.8);
      put(out, i, col, -fis + n2(lu * 40, lv * 40) * 0.2, 0.88);
    } else {
      // 盆土：颗粒 + 少量珍珠岩白点 + 树皮碎屑
      const [lu, lv] = loc(R.soil);
      const c = w(lu * 90, lv * 90, 90, 90);
      const grain = 1 - sstep(0.2, 0.55, c.f1);
      let col = rgb([54, 41, 32]).map((q) => q * (0.8 + 0.4 * c.id));
      if (c.id > 0.93) col = mix3(col, rgb([214, 212, 204]), grain);
      else if (c.id < 0.06) col = mix3(col, rgb([120, 76, 46]), grain * 0.8);
      put(out, i, col, grain, 0.95);
    }
  }
  return out;
}

// ——————————————————— 手工羊毛地毯（Beni Ourain 风格）———————————————————
// 整幅图案：u → 地毯长边 2.0m，v → 短边 1.4m。奶白羊毛 + 手工感的深色菱格线 + 长毛绒起伏
export function rug(S) {
  const out = alloc(S);
  const L = 2.0, Wd = 1.4;
  const nw = perlin(101), nt = perlin(102), nb = perlin(103), pile = perlin(104), w = worley(105);
  const a = 0.25, b = 0.35; // 菱形：宽 0.5m、高 0.7m
  const field = (X, Z, s) => X / a + s * Z / b + 0.16 * nw(X * 2.2, Z * 2.2 + s * 7) + 0.05 * nw(X * 9, Z * 9 + s * 3);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S, Z = v * Wd;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, X = u * L;
      const e = 0.002;
      let line = 0;
      for (const s of [1, -1]) {
        const d = field(X, Z, s);
        const gx = (field(X + e, Z, s) - d) / e, gz = (field(X, Z + e, s) - d) / e;
        const fr = fract(d + 0.5);
        const dist = Math.min(fr, 1 - fr) / Math.hypot(gx, gz); // 到线的距离（米）
        const thick = 0.011 * (0.75 + 0.5 * (nt(X * 4, Z * 4) * 0.5 + 0.5));
        const gap = sstep(-0.64, -0.61, nb(X * 2.5 + s * 11, Z * 2.5)); // 偶尔断线，但断口干脆
        line = Math.max(line, (1 - sstep(thick * 0.7, thick, dist)) * gap);
      }
      const c = w(X * 160, Z * 160, 4096, 4096);
      const tuft = 1 - sstep(0, 0.7, c.f1);
      const p = pile(X * 60, Z * 60) * 0.5 + tuft * 0.5;
      const abrash = fbm(nb, u, v, 2, 6, 3) * 0.035;
      let col = rgb([232, 224, 208]).map((q) => q * (1 + abrash));
      col = mix3(col, rgb([60, 50, 44]), line * 0.92);
      const edge = sstep(0.018, 0.012, Math.min(Z, Wd - Z));
      col = mix3(col, rgb([210, 200, 182]), edge * (1 - line));
      col = col.map((q) => q * (0.9 + 0.12 * p));
      put(out, y * S + x, col, p + line * 0.2, 0.95);
    }
  }
  return out;
}

// ——————————————————— 流苏（带透明度，alphaMode = MASK）———————————————————
// ——————————————————— 羊毛绒面（可平铺细节法线，0.25m 见方）———————————————————
// 一簇簇打结的羊毛：Worley 胞元 = 一个线头簇，簇中间鼓、簇之间有缝；再叠加细纤维和大块起伏
export function woolPile(S) {
  const h = new Float32Array(S * S);
  const w = worley(121), n = perlin(122), n2 = perlin(123);
  const C = 20; // 0.25m 里 20 簇 → 每簇约 1.2cm（长毛地毯的毛是一绺一绺的）
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const wu = u + n(u * 6, v * 6, 6, 6) * 0.01, wv = v + n(u * 6 + 3, v * 6, 6, 6) * 0.01; // 簇不排成网格
      const c = w(wu * C, wv * C, C, C);
      const dome = 1 - sstep(0, 0.8, c.f1);
      const seam = sstep(0, 0.22, c.f2 - c.f1);
      const fiber = n2(u * 260, v * 260, 260, 260) * 0.08 + n2(u * 110 + 7, v * 110, 110, 110) * 0.1;
      h[y * S + x] = (0.55 + 0.45 * c.id) * dome * seam + fiber + n(u * 5, v * 5, 5, 5) * 0.15;
    }
  }
  return h;
}

// u 沿地毯短边平铺（一格 0.2m），v 从地毯边缘（0）到须尖（1）
export function fringe(S) {
  // 一格 16 束流苏：每束根部是一个打结的小疙瘩，往外散成 6 股，股与股之间有缝，
  // 每束的长短、朝向、散开程度都不一样；透明度只在股线上为 1（alpha 裁剪）
  const out = alloc(S, { alpha: true });
  const r = mulberry(111);
  const T = 16;
  const tassels = Array.from({ length: T }, () => ({
    len: 0.8 + 0.18 * r(), lean: (r() - 0.5) * 0.35, fan: 0.12 + 0.1 * r(), shade: 0.9 + 0.12 * r(),
    strands: Array.from({ length: 6 }, () => ({ off: (r() - 0.5) * 0.12, len: 0.86 + 0.14 * r(), wig: r() * 6.28 })),
  }));
  const n = perlin(112);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      let on = 0, h = 0, shade = 1;
      // 这一格和相邻两格的流苏都可能伸到这里（有倾斜）
      for (let d = -1; d <= 1 && !on; d++) {
        const ti = ((Math.floor(u * T) + d) % T + T) % T;
        const tz = tassels[ti];
        const cx = (Math.floor(u * T) + d + 0.5) / T + (tz.lean * Math.max(0, v - 0.14)) / T;
        const tu = (u - cx) * T; // 以这束为中心、以一束宽为单位
        if (v < 0.15) {
          // 结：椭圆形的小疙瘩，挨着地毯边
          const k = (tu / 0.42) ** 2 + ((v - 0.075) / 0.085) ** 2;
          if (k < 1) { on = 1; h = 1 - k; shade = tz.shade * (0.85 + 0.15 * (1 - k)); }
          continue;
        }
        const t = (v - 0.15) / 0.85; // 结以下 0→1
        tz.strands.forEach((sd, si) => {
          if (on || t > tz.len * sd.len) return;
          const sx = (si - 2.5) * (0.1 + tz.fan * t) + sd.off + 0.03 * Math.sin(t * 9 + sd.wig) + n(ti * 3 + si, v * 6) * 0.03;
          const w = 0.065 * (1 - 0.3 * t);
          if (Math.abs(tu - sx) < w) { on = 1; h = 1 - Math.abs(tu - sx) / w; shade = tz.shade * (0.9 + 0.1 * Math.cos(si * 2.1)); }
        });
      }
      const col = rgb([228, 219, 199]).map((q) => q * shade * (0.92 + 0.08 * (1 - v)));
      put(out, y * S + x, col, h * 0.6, 0.95, 0, on);
    }
  }
  return out;
}
