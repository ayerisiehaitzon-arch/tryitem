// 木工房的程序化贴图：木工房图集（洞洞板和画上去的工具轮廓、锯木架上的木板、水平尺、角尺、工具柜铭牌、手锯、电钻侧面、
// 一堆螺丝、纯色格子）、木工桌的山毛榉拼板、水泥地面。
import { perlin, fbm, mulberry, worley } from './noise.js';
import { WORKSHOP_ATLAS } from './atlas.js';
import { sdRoundRect, sdSeg, sdPoly } from './laundry-textures.js';
import { text, textWidth } from './gym-textures.js';
import { planks } from './interior-textures.js';
import { PEG, SAW, silhouettes, DRILL } from '../workshop/layout.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const fract = (x) => x - Math.floor(x);
const hash2 = (x, y, s) => fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453);

function alloc(S) {
  return { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S), metal: new Float32Array(S * S) };
}
function put(out, i, c, h, r, m = 0) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h; out.rough[i] = r; out.metal[i] = m;
}
// 区域逐像素：f(x, y) 的 (x, y) 是区域里的物理坐标（左上原点、y 向下）
function region(out, S, box, W, H, f) {
  const [x0, y0, x1, y1] = box, sx = (x1 - x0) / W, sy = (y1 - y0) / H;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const [c, h, r, m] = f((i + 0.5 - x0) / sx, (j + 0.5 - y0) / sy);
    put(out, j * S + i, c, h, r, m ?? 0);
  }
}
// SDF 画笔（物理坐标，左上原点、y 向下）
function gp(out, S, box, W, H) {
  const [bx0, by0, bx1, by1] = box;
  const sx = (bx1 - bx0) / W, sy = (by1 - by0) / H, px = 1 / Math.min(sx, sy);
  return (sdf, bb, { color = null, rough = null, height = null, metal = null, alpha = 1 } = {}) => {
    const i0 = Math.max(bx0, Math.floor(bx0 + (bb[0] - px) * sx)), i1 = Math.min(bx1 - 1, Math.ceil(bx0 + (bb[2] + px) * sx));
    const j0 = Math.max(by0, Math.floor(by0 + (bb[1] - px) * sy)), j1 = Math.min(by1 - 1, Math.ceil(by0 + (bb[3] + px) * sy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = clamp01(0.5 - sdf((i + 0.5 - bx0) / sx, (j + 0.5 - by0) / sy) / px) * alpha;
      if (a <= 0) continue;
      const k = j * S + i;
      if (color) for (let q = 0; q < 3; q++) out.color[k * 3 + q] = mix(out.color[k * 3 + q], color[q], a);
      if (rough !== null) out.rough[k] = mix(out.rough[k], rough, a);
      if (height !== null) out.height[k] = mix(out.height[k], height, a);
      if (metal !== null) out.metal[k] = mix(out.metal[k], metal, a);
    }
  };
}
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

export function workshopAtlas(S, P) {
  const A = WORKSHOP_ATLAS, k = S / A.size;
  const out = alloc(S);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nA = perlin(P.seed + 1), nB = perlin(P.seed + 2), nC = perlin(P.seed + 3), nD = perlin(P.seed + 4);
  const rnd = mulberry(P.seed + 5);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box('swatch');
    const rows = Math.ceil(A.swatches.length / A.cols);
    const w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, rgb(s.c), 0, s.rough, s.metal ?? 0);
    });
  }

  // —— 洞洞板：灰蓝色的漆，白色画出每件工具的轮廓（剪影），再打上一格一格的孔 ——
  {
    const b = box('pegboard'), W = PEG.w, H = PEG.h;
    region(out, S, b, W, H, (x, y) => {
      const n = 0.5 + 0.5 * fbm(nA, x / W, y / H, 12, 9, 4);
      return [mix3([0.3, 0.38, 0.44], [0.36, 0.45, 0.51], n), n * 0.1, 0.55];
    });
    const fill = gp(out, S, b, W, H);
    // 剪影：board 坐标 y 向上 → 区域坐标 y 向下
    const white = { color: [0.9, 0.9, 0.87], rough: 0.45, height: 0.15 };
    for (const s of silhouettes()) {
      const g = 0.003;   // 外扩
      if (s.t === 'rr') {
        const cx = (s.x0 + s.x1) / 2, cy = H - (s.y0 + s.y1) / 2, hw = (s.x1 - s.x0) / 2 + g, hh = (s.y1 - s.y0) / 2 + g;
        fill((x, y) => sdRoundRect(x, y, cx, cy, hw, hh, Math.min(s.r + g, hw, hh)), [cx - hw, cy - hh, cx + hw, cy + hh], white);
      } else if (s.t === 'c') {
        fill((x, y) => sdCircle(x, y, s.x, H - s.y, s.r), [s.x - s.r, H - s.y - s.r, s.x + s.r, H - s.y + s.r], white);
      } else if (s.t === 'poly') {
        const pts = s.pts.map(([x, y]) => [x, H - y]);
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        fill((x, y) => sdPoly(x, y, pts) - g, [Math.min(...xs) - g, Math.min(...ys) - g, Math.max(...xs) + g, Math.max(...ys) + g], white);
      } else if (s.t === 'seg') {
        const a = [s.a[0], H - s.a[1]], c = [s.b[0], H - s.b[1]];
        fill((x, y) => sdSeg(x, y, a, c, s.w + 2 * g), [Math.min(a[0], c[0]) - s.w - g, Math.min(a[1], c[1]) - s.w - g, Math.max(a[0], c[0]) + s.w + g, Math.max(a[1], c[1]) + s.w + g], white);
      }
    }
    // 孔：1 英寸一格，孔边的漆往孔里圆过去（压暗一圈）
    const n = Math.round(W / PEG.pitch), m = Math.round(H / PEG.pitch);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const cx = PEG.pitch * (i + 0.5), cy = H - PEG.pitch * (j + 0.5), r = PEG.holeR;
      fill((x, y) => sdCircle(x, y, cx, cy, r + 0.0012), [cx - r - 0.002, cy - r - 0.002, cx + r + 0.002, cy + r + 0.002], { color: [0.12, 0.13, 0.14], alpha: 0.35 });
      fill((x, y) => sdCircle(x, y, cx, cy, r), [cx - r - 0.001, cy - r - 0.001, cx + r + 0.001, cy + r + 0.001], { color: [0.035, 0.035, 0.04], rough: 0.95, height: -1 });
    }
  }

  // —— 锯木架上的木板（松木）：从上到下四条 —— 顶面、正面、背面、底面。顶面、底面的 v 从背边（0）量到前边（w），
  //    正面、背面的 v 从上沿量到下沿。弦切板：树心在板底下一点，年轮是一圈圈同心的圆柱，顶面切出一道道“山纹”，侧面是直纹。
  //    铅笔线（顶面、正面各一道），保留的那边写着尺寸、废料那边打个叉；锯口从背边锯进来（锯把手朝前上方、斜 45°）：
  //    顶面 13cm，底面少一个板厚，背面整个厚度一道
  {
    const b = box('plank'), Pk = A.plank, W = Pk.len, H = 2 * (Pk.w + Pk.t);
    const band = [0, Pk.w, Pk.w + Pk.t, Pk.w + 2 * Pk.t];
    // 树心：离背边 c、在顶面下 D（沿板长慢慢起伏 → 山纹的拱）
    const pith = (x) => [0.085 + 0.01 * nA(x * 0.8, 3.3), 0.05 + 0.024 * (0.5 + 0.5 * Math.sin(x * 3.1 + 0.9)) + 0.014 * nB(x * 1.3, 1.7) + 0.006 * x];
    // 节子：[x, 离背边, 半径]（顶面）；底面另外两个
    const knotsTop = [[0.46, 0.16, 0.014], [1.98, 0.07, 0.011], [2.26, 0.19, 0.008]], knotsBot = [[0.9, 0.12, 0.012], [1.4, 0.05, 0.009]];
    region(out, S, b, W, H, (x, y) => {
      let face = 0, zz = y, dep = 0;
      if (y >= band[3]) { face = 3; zz = y - band[3]; dep = Pk.t; }
      else if (y >= band[2]) { face = 2; zz = 0; dep = y - band[2]; }
      else if (y >= band[1]) { face = 1; zz = Pk.w; dep = y - band[1]; }
      const [c, D] = pith(x);
      let r = Math.hypot(zz - c, D + dep);
      const knots = face === 0 ? knotsTop : face === 3 ? knotsBot : [];
      let kn = 0;
      for (const [kx, kz, kr] of knots) {
        const d = Math.hypot((x - kx) * 0.7, zz - kz);
        r += 0.004 * Math.exp(-((d / (kr * 2.5)) ** 2));
        kn = Math.max(kn, sstep(1.25, 0.8, d / kr));
      }
      r += 0.0016 * nC(x * 2.4, r * 90) + 0.0005 * nD(x * 11, r * 400);
      const ring = fract(r / 0.0058);
      const late = sstep(0.6, 0.88, ring) * (1 - sstep(0.94, 1, ring));
      let col = mix3([0.9, 0.79, 0.6], [0.74, 0.5, 0.27], late * 0.85);
      col = mul(col, 0.95 + 0.06 * nC(x * 5, zz * 60 + dep * 60 + face * 7) + 0.03 * nA(x * 90, r * 900));
      for (const [kx, kz, kr] of knots) {
        const d = Math.hypot((x - kx) * 0.85, zz - kz) / kr;
        if (d < 1.4) col = mix3(col, mix3([0.36, 0.2, 0.1], [0.58, 0.36, 0.18], 0.5 + 0.5 * Math.sin(d * 11)), sstep(1.3, 0.85, d));
      }
      if (face === 1 || face === 2) col = mul(col, 0.94);
      return [col, late * 0.3 - kn * 0.2 + nD(x * 60, r * 400) * 0.08, 0.72 - late * 0.05];
    });
    const fill = gp(out, S, b, W, H);
    const lead = { color: [0.3, 0.3, 0.32], rough: 0.45 };
    const kx = Pk.cut + 0.0014, dark = { color: [0.07, 0.05, 0.035], rough: 0.95, height: -1 };
    // 铅笔线：顶面整个宽度，正面接着往下画
    fill((x, y) => sdSeg(x, y, [Pk.cut, 0.003], [Pk.cut, band[2] - 0.002], 0.0009), [Pk.cut - 0.003, 0, Pk.cut + 0.003, band[2]], lead);
    // 尺寸（保留那边，靠前边）和下面一道短线；废料那边打叉
    text(fill, '1620', Pk.cut - 0.012, Pk.w - 0.052, 0.017, { align: 'right', stroke: 0.12, ...lead });
    fill((x, y) => sdSeg(x, y, [Pk.cut - 0.1, Pk.w - 0.029], [Pk.cut - 0.004, Pk.w - 0.029], 0.0008), [Pk.cut - 0.11, Pk.w - 0.035, Pk.cut, Pk.w - 0.022], lead);
    for (const [a, c] of [[[Pk.cut + 0.03, Pk.w - 0.085], [Pk.cut + 0.07, Pk.w - 0.045]], [[Pk.cut + 0.07, Pk.w - 0.085], [Pk.cut + 0.03, Pk.w - 0.045]]]) {
      fill((x, y) => sdSeg(x, y, a, c, 0.0013), [Pk.cut + 0.02, Pk.w - 0.095, Pk.cut + 0.08, Pk.w - 0.035], lead);
    }
    // 锯口：顶面从背边往前 13cm；背面整个厚度；底面短一个板厚。两边一圈浅浅的毛边
    const kerf = (y0, y1) => {
      fill((x, y) => sdSeg(x, y, [kx, y0], [kx, y1], 0.0045), [kx - 0.005, y0 - 0.003, kx + 0.005, y1 + 0.003], { color: [0.55, 0.42, 0.27], alpha: 0.35 });
      fill((x, y) => sdSeg(x, y, [kx, y0], [kx, y1], 0.0019), [kx - 0.004, y0 - 0.003, kx + 0.004, y1 + 0.003], dark);
    };
    kerf(-0.003, Pk.kerf);
    kerf(band[2] - 0.003, band[3] + 0.003);
    kerf(band[3] - 0.003, band[3] + Pk.kerf - Pk.t);
    // 锯末：顶面锯口两边一片细碎的浅色，越靠锯口越密
    for (let i = 0; i < 320; i++) {
      const t = rnd(), side = rnd() < 0.5 ? -1 : 1;
      const cx = kx + side * (0.002 + 0.028 * rnd() ** 2.2), cy = Pk.kerf * (0.15 + 0.9 * t) + (rnd() - 0.5) * 0.012, r = 0.0005 + 0.0013 * rnd();
      fill((x, y) => sdCircle(x, y, cx, cy, r), [cx - r - 0.001, cy - r - 0.001, cx + r + 0.001, cy + r + 0.001], { color: [0.96, 0.87, 0.7], height: 0.4, rough: 0.95, alpha: 0.85 });
    }
  }

  // —— 水平尺：黄色喷塑的铝型材，上沿一排刻度，正中和两头三个水泡（绿色的液体、一个气泡）——
  {
    const b = box('level'), { w: W, h: H } = A.level;
    region(out, S, b, W, H, (x, y) => {
      const n = nA(x * 400, y * 60) * 0.5 + 0.5;
      return [mul([0.95, 0.72, 0.1], 0.94 + 0.06 * n), 0, 0.4];
    });
    const fill = gp(out, S, b, W, H);
    const ink = { color: [0.08, 0.08, 0.09], rough: 0.5 };
    for (let mm = 5; mm <= W * 1000 - 5; mm += 5) {
      const x = mm / 1000, L = mm % 50 === 0 ? 0.008 : mm % 10 === 0 ? 0.0055 : 0.0035;
      fill((px, py) => sdSeg(px, py, [x, 0.0015], [x, 0.0015 + L], 0.00045), [x - 0.001, 0, x + 0.001, 0.012], ink);
    }
    text(fill, 'TRYITEM', 0.07, 0.022, 0.011, { stroke: 0.2, ...ink });
    text(fill, 'PRO LEVEL', 0.3, 0.025, 0.007, { stroke: 0.18, ...ink });
    // 水泡窗：黑框、黄绿色的液体、一个亮的气泡
    for (const [cx, vw] of [[W / 2, 0.05], [0.03, 0.014], [W - 0.03, 0.014]]) {
      const cy = 0.027, vh = 0.011;
      fill((x, y) => sdRoundRect(x, y, cx, cy, vw / 2 + 0.002, vh / 2 + 0.002, vh / 2 + 0.002), [cx - vw, cy - vh, cx + vw, cy + vh], { color: [0.05, 0.05, 0.05], height: -0.3 });
      fill((x, y) => sdRoundRect(x, y, cx, cy, vw / 2, vh / 2, vh / 2), [cx - vw, cy - vh, cx + vw, cy + vh], { color: [0.55, 0.85, 0.2], rough: 0.08, height: 0.4 });
      fill((x, y) => sdRoundRect(x, y, cx, cy - 0.001, Math.min(vw / 2 - 0.002, 0.007), vh / 2 - 0.002, vh / 2 - 0.002), [cx - 0.01, cy - vh, cx + 0.01, cy + vh], { color: [0.92, 0.98, 0.8], rough: 0.05 });
      if (vw > 0.03) for (const s of [-1, 1]) fill((x, y) => sdSeg(x, y, [cx + s * 0.009, cy - vh / 2], [cx + s * 0.009, cy + vh / 2], 0.0004), [cx - 0.012, cy - vh, cx + 0.012, cy + vh], ink);
    }
  }

  // —— 角尺的尺身：磨亮的钢，刻着毫米刻度，每 5cm 一个数 ——
  {
    const b = box('square'), { w: W, h: H } = A.square;
    region(out, S, b, W, H, (x, y) => {
      const br = nB(x * 2000, y * 30) * 0.5 + 0.5;
      return [mul([0.82, 0.83, 0.85], 0.92 + 0.1 * br), 0, 0.2, 1];
    });
    const fill = gp(out, S, b, W, H);
    const ink = { color: [0.1, 0.1, 0.11], rough: 0.5, metal: 0 };
    for (let mm = 1; mm < W * 1000; mm++) {
      const x = mm / 1000, L = mm % 10 === 0 ? 0.007 : mm % 5 === 0 ? 0.005 : 0.003;
      fill((px, py) => sdSeg(px, py, [x, 0.0006], [x, 0.0006 + L], 0.00022), [x - 0.0006, 0, x + 0.0006, 0.009], ink);
    }
    for (let cm = 5; cm < W * 100; cm += 5) text(fill, String(cm), cm / 100, 0.0095, 0.0045, { align: 'center', stroke: 0.16, ...ink });
    text(fill, 'TRYITEM', W - 0.07, 0.019, 0.006, { stroke: 0.18, ...ink });
  }

  // —— 工具柜铭牌：拉丝银底、黑字 ——
  {
    const b = box('badge'), { w: W, h: H } = A.badge;
    region(out, S, b, W, H, (x, y) => {
      const br = nC(x * 3000, y * 40) * 0.5 + 0.5;
      return [mul([0.82, 0.82, 0.84], 0.9 + 0.12 * br), 0, 0.28, 1];
    });
    const fill = gp(out, S, b, W, H);
    fill((x, y) => Math.abs(sdRoundRect(x, y, W / 2, H / 2, W / 2 - 0.004, H / 2 - 0.004, 0.006)) - 0.0012, [0, 0, W, H], { color: [0.08, 0.08, 0.09], metal: 0, rough: 0.5 });
    text(fill, 'TRYITEM', W / 2, 0.012, 0.03, { align: 'center', stroke: 0.22, color: [0.62, 0.08, 0.06], metal: 0, rough: 0.4 });
    text(fill, 'TOOL CO.', W / 2, 0.049, 0.011, { align: 'center', stroke: 0.2, color: [0.08, 0.08, 0.09], metal: 0, rough: 0.5 });
  }

  // —— 手锯的锯身：亮钢，顺着锯身的拉丝，齿那一溜暗一点，锯根附近蚀刻的牌子 ——
  {
    const b = box('saw'), { w: W, h: H } = A.saw;
    region(out, S, b, W, H, (x, y) => {
      const yb = H - y;   // 离齿线的高度
      const br = nD(x * 30, y * 1500) * 0.5 + 0.5;
      const teeth = sstep(0.008, 0.005, yb);
      const zig = teeth * (0.5 + 0.5 * Math.sign(Math.sin((x / 0.004) * Math.PI)) * (1 - yb / 0.006));
      const col = mul([0.8, 0.81, 0.83], 0.95 + 0.1 * br - 0.25 * teeth - 0.15 * zig);
      return [col, -teeth * 0.3, 0.4 + 0.2 * teeth, 0.55];
    });
    const fill = gp(out, S, b, W, H);
    const etch = { color: [0.3, 0.31, 0.34], rough: 0.62 };
    fill((x, y) => Math.abs(sdRoundRect(x, y, 0.33, 0.052, 0.058, 0.022, 0.004)) - 0.0006, [0.26, 0.02, 0.4, 0.08], etch);
    text(fill, 'TRYITEM', 0.33, 0.04, 0.012, { align: 'center', stroke: 0.2, ...etch });
    text(fill, 'HARDPOINT', 0.33, 0.059, 0.006, { align: 'center', stroke: 0.18, ...etch });
  }

  // —— 电钻的侧面：黄色的壳，黑色包胶的握把、后盖、散热槽，牌子和 18V，电池黑色、顶上一道黄 ——
  {
    const b = box('drill'), F = DRILL.frame, W = F.size, H = F.size;
    const toImg = ([x, y]) => [x - F.x0, H - (y - F.y0)];
    region(out, S, b, W, H, (x, y) => {
      const n = nA(x * 300, y * 300) * 0.5 + 0.5;
      return [mul([0.93, 0.7, 0.08], 0.95 + 0.05 * n), 0, 0.35];
    });
    const fill = gp(out, S, b, W, H);
    const black = { color: [0.06, 0.06, 0.065], rough: 0.6, height: 0.3 };
    const poly = (pts, style) => {
      const P2 = pts.map(toImg), xs = P2.map((p) => p[0]), ys = P2.map((p) => p[1]);
      fill((x, y) => sdPoly(x, y, P2), [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], style);
    };
    poly(DRILL.grip, black);
    poly([[-0.01, 0.15], [0.03, 0.14], [0.03, 0.222], [-0.01, 0.21]], black);                  // 后盖
    poly([[0.138, 0.14], [0.17, 0.14], [0.17, 0.222], [0.138, 0.222]], { color: [0.2, 0.2, 0.21], rough: 0.5 });   // 齿轮箱
    for (let i = 0; i < 4; i++) {
      const x = 0.037 + i * 0.008;
      fill((px, py) => sdSeg(px, py, toImg([x, 0.168]), toImg([x, 0.2]), 0.0018), [x - F.x0 - 0.004, H - 0.2 + F.y0 - 0.004, x - F.x0 + 0.004, H - 0.168 + F.y0 + 0.004], { color: [0.03, 0.03, 0.03], height: -0.6 });
    }
    const [tx, ty] = toImg([0.072, 0.206]);
    text(fill, 'TRYITEM', tx, ty, 0.012, { stroke: 0.22, color: [0.06, 0.06, 0.065] });
    const [vx, vy] = toImg([0.08, 0.182]);
    fill((x, y) => sdRoundRect(x, y, vx + 0.014, vy + 0.006, 0.016, 0.0065, 0.002), [vx - 0.004, vy - 0.002, vx + 0.032, vy + 0.014], { color: [0.06, 0.06, 0.065] });
    text(fill, '18V', vx + 0.014, vy + 0.002, 0.008, { align: 'center', stroke: 0.2, color: [0.97, 0.8, 0.2] });
    // 电池
    const B = DRILL.battery;
    poly([[B.x0, 0], [B.x1, 0], [B.x1, B.y1], [B.x0, B.y1]], { color: [0.07, 0.07, 0.075], rough: 0.5 });
    poly([[B.x0, B.y1 - 0.008], [B.x1, B.y1 - 0.008], [B.x1, B.y1], [B.x0, B.y1]], { color: [0.93, 0.7, 0.08], rough: 0.35 });
    const [bx, by] = toImg([0.06, 0.036]);
    text(fill, '18V', bx, by, 0.012, { align: 'center', stroke: 0.2, color: [0.93, 0.7, 0.08] });
  }

  // —— 一堆螺丝（螺丝罐里）：各种方向的短螺丝和钉子，头是圆的；周期平铺（绕罐子一圈接得上）——
  {
    const b = box('screws'), W = 0.1, H = 0.1;
    region(out, S, b, W, H, () => [[0.08, 0.075, 0.07], -0.5, 0.6, 0]);
    const fill = gp(out, S, b, W, H);
    for (let i = 0; i < 420; i++) {
      const cx = rnd() * W, cy = rnd() * H, a = rnd() * Math.PI, L = 0.008 + 0.014 * rnd(), r = 0.0012 + 0.0008 * rnd();
      const tone = 0.55 + 0.4 * rnd(), brassy = rnd() < 0.2;
      const col = brassy ? mul([0.85, 0.7, 0.4], tone) : mul([0.8, 0.81, 0.84], tone);
      for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
        const x = cx + ox, y = cy + oy;
        if (x < -0.02 || x > W + 0.02 || y < -0.02 || y > H + 0.02) continue;
        const p0 = [x - Math.cos(a) * L / 2, y - Math.sin(a) * L / 2], p1 = [x + Math.cos(a) * L / 2, y + Math.sin(a) * L / 2];
        fill((px, py) => sdSeg(px, py, p0, p1, 2 * r), [x - L, y - L, x + L, y + L], { color: col, metal: 1, rough: 0.35, height: 0.5 });
        fill((px, py) => sdCircle(px, py, p1[0], p1[1], r * 1.9), [p1[0] - 0.005, p1[1] - 0.005, p1[0] + 0.005, p1[1] + 0.005], { color: mul(col, 1.05), metal: 1, rough: 0.3, height: 0.7 });
      }
    }
  }
  return out;
}

// ——————————————————————— 木工桌的山毛榉拼板 ———————————————————————
// 一条条 4cm 宽的山毛榉拼起来（周期 2m，50 条），胶缝很细、几乎看不出槽；每条的颜色、纹理各不一样
export function benchtop(S, P) {
  return planks(S, {
    seed: P.seed, period: 2, rows: 50, twoPieceChance: 0.3, ringSpacing: 0.004, archChance: 0.2, archLen: 0.8,
    warp: 1.4, pores: 0.4, lateMix: 0.5, colorVar: 0.1, fiberVar: 0.05, plankTint: 0.26, plankWarm: 0.1,
    early: rgb([226, 184, 142]), late: rgb([198, 146, 104]), pore: rgb([168, 120, 84]), rough: 0.5,
    groove: 0.0003, seamDark: 0.18, grainRelief: 0.2,
  });
}

// ——————————————————————— 水泥地面 ———————————————————————
// 封闭剂处理过的水泥：大片的深浅、抹光机留下的一段段淡淡的弧形痕、细碎的骨料点和小气孔、几块很淡的水渍、零星的锯末；
// 周期 2m，贴图四边各半道 6mm 的切缝（模块拼起来是一道完整的缝）
export function concrete(S, P) {
  const out = alloc(S);
  const n = perlin(P.seed), m = perlin(P.seed + 1), w = worley(P.seed + 2), rnd = mulberry(P.seed + 3);
  const stains = Array.from({ length: 3 }, () => ({ x: rnd(), y: rnd(), r: 0.04 + 0.05 * rnd(), a: 0.04 + 0.05 * rnd() }));
  const swirls = Array.from({ length: 46 }, () => ({ x: rnd(), y: rnd(), r: 0.05 + 0.1 * rnd(), a0: rnd() * Math.PI * 2, span: 0.5 + 1.1 * rnd(), k: 0.5 + 0.5 * rnd() }));
  const period = 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const cloud = fbm(n, u, v, 3, 3, 5);
    let lum = 0.56 + 0.07 * cloud;
    // 抹光痕：一段段宽而淡的弧（只在圆周附近算角度）
    for (const s of swirls) {
      let du = u - s.x, dv = v - s.y; du -= Math.round(du); dv -= Math.round(dv);
      const e = Math.abs(Math.hypot(du, dv) - s.r);
      if (e > 0.03) continue;
      let ang = Math.atan2(dv, du) - s.a0; ang -= 2 * Math.PI * Math.round(ang / (2 * Math.PI));
      lum += 0.011 * s.k * Math.exp(-((e / 0.011) ** 2)) * sstep(s.span, s.span * 0.4, Math.abs(ang));
    }
    const cell = w(u * 180, v * 180, 180, 180);
    const pit = fract(cell.id * 5.3) < 0.2 ? sstep(0.14, 0.05, cell.f1) : 0;
    const grit = (hash2(x, y, P.seed) - 0.5) * 0.04 + 0.02 * m(u * 400, v * 400, 400, 400);
    lum += grit - 0.18 * pit;
    let col = [lum, lum * 0.985, lum * 0.96], oil = 0;
    // 油渍：边缘被噪声扭得不规则，中间深、往外淡
    for (const s of stains) {
      let du = u - s.x, dv = v - s.y; du -= Math.round(du); dv -= Math.round(dv);
      const d = Math.hypot(du, dv) / s.r;
      if (d > 2.2) continue;
      const dd = d + 0.55 * fbm(m, u, v, 24, 24, 3) + 0.25 * fbm(n, u + 0.37, v, 60, 60, 2);
      const o = s.a * sstep(1.2, 0.2, dd);
      col = mul(col, 1 - o);
      oil = Math.max(oil, o);
    }
    if (hash2(x + 3, y + 7, P.seed) > 0.9993) col = mix3(col, [0.86, 0.74, 0.54], 0.8);
    // 切缝
    const edge = Math.min(u, 1 - u, v, 1 - v) * period;
    const joint = sstep(0.0034, 0.0024, edge);
    col = mul(col, 1 - 0.55 * joint);
    put(out, y * S + x, col, cloud * 0.2 + grit * 2 - pit * 0.6 - joint * 1.2, 0.5 + 0.12 * cloud + 0.3 * pit + 0.2 * joint - 0.8 * oil, 0);
  }
  return out;
}

// ——————————————————————— 锯末 ———————————————————————
// 周期 0.25m：浅色的底子上撒满一两毫米的碎屑（深浅不一的小椭圆，微微鼓起），平铺时接得上
export function sawdust(S, P) {
  const out = alloc(S), W = 0.25, n = perlin(P.seed), rnd = mulberry(P.seed + 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S, c = fbm(n, u, v, 6, 6, 4);
    put(out, y * S + x, mul([0.8, 0.68, 0.5], 0.92 + 0.12 * c), 0.2 * c, 0.95);
  }
  const fill = gp(out, S, [0, 0, S, S], W, W);
  for (let i = 0; i < 9000; i++) {
    const cx = rnd() * W, cy = rnd() * W, a = rnd() * Math.PI, L = 0.0008 + 0.0022 * rnd(), w = 0.0004 + 0.0007 * rnd();
    const tone = 0.78 + 0.34 * rnd(), col = mul(rnd() < 0.15 ? [0.72, 0.56, 0.36] : [0.9, 0.79, 0.6], tone);
    for (const ox of [-W, 0, W]) for (const oy of [-W, 0, W]) {
      const x = cx + ox, y = cy + oy;
      if (x < -0.004 || x > W + 0.004 || y < -0.004 || y > W + 0.004) continue;
      const p0 = [x - (Math.cos(a) * L) / 2, y - (Math.sin(a) * L) / 2], p1 = [x + (Math.cos(a) * L) / 2, y + (Math.sin(a) * L) / 2];
      fill((px, py) => sdSeg(px, py, p0, p1, w), [x - L, y - L, x + L, y + L], { color: col, height: 0.3 + 0.5 * rnd(), rough: 0.95 });
    }
  }
  return out;
}
