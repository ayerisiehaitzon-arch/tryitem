// 儿童房的程序化贴图：胶合板的边、玩具调色板、格纹布（被套）、画纸上的蜡笔画。
import { perlin, fbm, mulberry } from './noise.js';
import { TOY_ATLAS } from './atlas.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];

function alloc(S) {
  return { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
}
function put(out, i, c, h, r) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h;
  out.rough[i] = r;
}

// ——————————————————————— 胶合板的边 ———————————————————————
// v 方向正好是一块板的厚度（0 = 背面，1 = 正面），u 沿着板边。
//   · 13 层单板，每层厚薄略有不同，层与层的分界沿板边微微起伏；
//   · 顺纹层（纤维沿板边）颜色浅、有顺着 u 的细纹；横纹层露出的是端面：颜色深一点、满是细小的导管孔，也更粗糙；
//   · 层间一条很细的深色胶线，比木头硬，打磨后略微凸出一点。
export function plyEdge(S, P) {
  const nW = perlin(P.seed), nS = perlin(P.seed + 1), nP = perlin(P.seed + 2), nT = perlin(P.seed + 3);
  const rnd = mulberry(P.seed + 7);
  const N = P.plies;
  const th = Array.from({ length: N }, () => 1 + (rnd() - 0.5) * 0.24);
  const tot = th.reduce((a, b) => a + b, 0);
  const edges = [0];
  for (const t of th) edges.push(edges[edges.length - 1] + t / tot);
  // 最外两层是面板的贴皮（顺纹）；往里横纹、顺纹交替
  const plies = th.map((_, i) => ({ cross: i % 2 === 1, tone: 1 + (rnd() - 0.5) * P.plyTone }));
  const long = rgb(P.long), cross = rgb(P.cross), glue = rgb(P.glue);
  const out = alloc(S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      // 分界线的起伏（外表面 v = 0 / 1 处不动）
      const wv = v + fbm(nW, u, v, 5, 3, 3) * P.wave * sstep(0, 0.08, v) * sstep(0, 0.08, 1 - v);
      let k = 0;
      while (k < N - 1 && wv >= edges[k + 1]) k++;
      const L = plies[k];
      const f = (wv - edges[k]) / (edges[k + 1] - edges[k]);
      // 到最近一条内部胶线的距离（v 单位）
      const dIn = k > 0 ? (wv - edges[k]) : Infinity, dOut = k < N - 1 ? (edges[k + 1] - wv) : Infinity;
      const gl = 1 - sstep(P.glueW * 0.5, P.glueW * 1.4, Math.min(dIn, dOut));
      const tone = 1 + fbm(nT, u, v, 3, 2, 3) * 0.05;
      let c, h, r;
      if (L.cross) {
        // 端面：一片细密的孔点
        const pores = sstep(0.1, 0.55, fbm(nP, u, v, 160, 240, 2));
        c = cross.map((m) => m * L.tone * tone * (1 - pores * 0.12));
        h = -0.35 - pores * 0.25;
        r = 0.66 + pores * 0.06;
      } else {
        // 顺纹：沿 u 拉长的细纹
        const streak = fbm(nS, u, v, 6, 220, 3);
        c = long.map((m) => m * L.tone * tone * (1 + streak * 0.07));
        h = streak * 0.15;
        r = 0.52 - streak * 0.03;
      }
      // 靠近分界处颜色微微过渡（单板边缘被胶浸过一点）
      c = mix3(c, c.map((m) => m * 0.9), (1 - sstep(0, 0.2, Math.min(f, 1 - f))) * 0.5);
      c = mix3(c, glue, gl * 0.85);
      put(out, y * S + x, c, h + gl * 0.3, mix(r, 0.44, gl));
    }
  }
  return out;
}

// ——————————————————————— 玩具调色板 ———————————————————————
// 4 × 4 个纯色格子（每格 32px）：上面 12 格是木玩具上的水性漆、本色木头、深色，最下一行是布（哑光）。
// 部件的 UV 全部指向格子正中的同一点 —— 整个部件就是一种颜色；很多颜色的小玩具共用一个材质、一次 draw call。
export function toys(S) {
  const A = TOY_ATLAS, cell = S / A.cols;
  const out = alloc(S);
  A.swatches.forEach((sw, i) => {
    const cx = (i % A.cols) * cell, cy = Math.floor(i / A.cols) * cell;
    const c = rgb(sw.c);
    for (let y = cy; y < cy + cell; y++) for (let x = cx; x < cx + cell; x++) put(out, y * S + x, c, 0, sw.rough);
  });
  return out;
}

// ——————————————————————— 格纹布（色织格子，平纹）———————————————————————
// 经纱、纬纱都是“色纱 / 白纱”各 stripe 根交替：两根都是色纱的地方是深色格，一色一白是中间色，两根白纱是白格。
// 中间色不是调出来的：近看是一根蓝一根白交织，远看才混成浅蓝 —— 和真的色织格子布一样。
export function gingham(S, P) {
  const T = P.threads;
  const n = perlin(P.seed), nc = perlin(P.seed + 3);
  const rnd = mulberry(P.seed + 9);
  const tone = Array.from({ length: T * 2 }, () => (rnd() - 0.5) * P.threadTone);
  const col = rgb(P.color), white = rgb(P.white);
  const dyed = (i) => Math.floor(i / P.stripe) % 2 === 0;
  const out = alloc(S);
  const prof = (a, thick) => {
    const d = (a - 0.5) / (0.5 * thick);
    return d * d >= 1 ? 0 : Math.sqrt(1 - d * d);
  };
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    const fy = v * T, j = Math.floor(fy), ay = fy - j;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const fx = u * T, i = Math.floor(fx), ax = fx - i;
      const slW = 1 + P.slub * n(v * 8, i * 7.31, 8, 4096);
      const slF = 1 + P.slub * n(u * 8, j * 5.17 + 1000, 8, 4096);
      const upW = 0.5 + 0.5 * Math.sin(Math.PI * (fy + i));
      const upF = 0.5 + 0.5 * Math.sin(Math.PI * (fx + j + 1));
      const hw = prof(ax, 0.9 * slW) * (0.45 + 0.55 * upW);
      const hf = prof(ay, 0.9 * slF) * (0.45 + 0.55 * upF);
      const warpTop = hw >= hf;
      const h = Math.max(hw, hf);
      const base = (warpTop ? dyed(i) : dyed(j)) ? col : white;
      const t = warpTop ? tone[i] : tone[T + j];
      const mott = fbm(nc, u, v, 3, 3, 3) * P.mottle;
      const cav = 0.8 + 0.2 * Math.min(1, h * 1.2);
      const b = (1 + t + mott) * cav;
      put(out, y * S + x, base.map((m) => m * b), h, mix(0.95, 0.82, h));
    }
  }
  return out;
}

// ——————————————————————— 画纸上的蜡笔画 ———————————————————————
// 贴图 = 从纸卷上拉出来的一整张纸（u 横跨纸宽 P.w 米，v 沿纸长 P.h 米：v = 0 在纸卷那头）。
// 画只画在平铺在桌上的那一段（P.area = [v0, v1]），纸卷那头、卷起来的那头都是白纸。
// 蜡笔的笔触：沿折线的一条带子，边缘有一点毛；蜡只挂在纸纹凸起的地方（高频噪声），压力沿笔画时轻时重；
// 大块的涂色是来回的斜向排线。孩子画的线都是抖的：折线点加一点垂直于笔画方向的噪声。
export function drawing(S, P) {
  const nG = perlin(P.seed), nP = perlin(P.seed + 1), nJ = perlin(P.seed + 2), nH = perlin(P.seed + 3);
  const W = P.w, H = P.h, px = W / S, py = H / S;
  const color = new Float32Array(S * S * 3).fill(0);
  const cov = new Float32Array(S * S);
  const paper = rgb(P.paper);
  for (let i = 0; i < S * S; i++) { color[i * 3] = paper[0]; color[i * 3 + 1] = paper[1]; color[i * 3 + 2] = paper[2]; }
  // 纸纹（米 → 高频噪声），同时是纸的高度
  const tooth = (x, y) => fbm(nG, x / W, y / H, Math.round(W / 0.0022), Math.round(H / 0.0022), 2);
  const [va, vb] = P.area;
  // 画的坐标：(x, y) 米，y 从画的上沿（靠纸卷的一头）往下
  const Y0 = va * H;
  const lay = (mask, box, c, pressure = 1) => {
    const col = rgb(c);
    const i0 = Math.max(0, Math.floor(box[0] / px)), i1 = Math.min(S - 1, Math.ceil(box[2] / px));
    const j0 = Math.max(0, Math.floor((box[1] + Y0) / py)), j1 = Math.min(S - 1, Math.ceil((box[3] + Y0) / py));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * px, y = (j + 0.5) * py - Y0;
      const m = mask(x, y);
      if (m <= 0) continue;
      // 蜡挂在纸纹凸起处；压力沿画面缓慢变化
      const g = sstep(-0.35, 0.25, tooth(x, y + Y0) + (pressure - 1) * 0.4 + fbm(nP, x / W, y / H, 7, 7, 2) * 0.25);
      const a = clamp01(m * g * 0.95);
      const k = j * S + i;
      for (let ch = 0; ch < 3; ch++) color[k * 3 + ch] = mix(color[k * 3 + ch], col[ch], a);
      cov[k] = Math.max(cov[k], a);
    }
  };
  // 抖动的折线：点之间插值，加垂直噪声
  const wobble = (pts, amp, seed) => {
    const out = [];
    for (let s = 0; s < pts.length - 1; s++) {
      const [a, b] = [pts[s], pts[s + 1]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 0.006));
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (let i = 0; i < n; i++) {
        const t = i / n, d = nJ(seed + (s * n + i) * 0.13, seed * 0.7, 4096, 4096) * amp;
        out.push([a[0] + (b[0] - a[0]) * t + nx * d, a[1] + (b[1] - a[1]) * t + ny * d]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const segDist = (x, y, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy + 1e-12));
    return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
  };
  const stroke = (pts0, w, c, { amp = 0.0012, seed = 1, pressure = 1 } = {}) => {
    const pts = wobble(pts0, amp, seed);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const box = [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w];
    lay((x, y) => {
      let d = Infinity;
      for (let s = 0; s < pts.length - 1; s++) d = Math.min(d, segDist(x, y, pts[s], pts[s + 1]));
      return 1 - sstep(w * 0.3, w * 0.5, d);
    }, box, c, pressure);
  };
  const circlePts = (cx, cy, r, n = 24, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  // 涂色：区域 inside(x, y) 里斜着来回排线（线宽 w，间距 gap）
  const fill = (inside, box, c, { angle = 0.9, gap = 0.0042, w = 0.0034, pressure = 0.9 } = {}) => {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    lay((x, y) => {
      if (!inside(x, y)) return 0;
      const t = (x * ca + y * sa) / gap + fbm(nH, x / W, y / H, 9, 9, 2) * 1.2;
      const f = t - Math.floor(t);
      return 1 - sstep(w / gap * 0.35, w / gap * 0.6, Math.abs(f - 0.5) * 2 * 0.5);
    }, box, c, pressure);
  };
  P.draw({ stroke, fill, circlePts });
  const out = alloc(S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const k = j * S + i;
    const t = tooth((i + 0.5) * px, (j + 0.5) * py);
    const c = [color[k * 3], color[k * 3 + 1], color[k * 3 + 2]].map((m) => m * (1 + t * 0.02));
    put(out, k, c, t * 0.4 + cov[k] * 0.35, mix(0.9, 0.55, cov[k]));
  }
  return out;
}
