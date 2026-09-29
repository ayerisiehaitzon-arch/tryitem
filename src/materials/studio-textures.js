// 画室的程序化贴图：画室图集（画架上的油画、调色板、颜料管标签、抹布、纯色格子）和溅满颜料的木地板。
import { perlin, fbm, mulberry } from './noise.js';
import { STUDIO_ATLAS } from './atlas.js';
import { text, textWidth } from './gym-textures.js';
import { planks } from './interior-textures.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const fract = (x) => x - Math.floor(x);

function alloc(S) {
  return {
    color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S),
    metal: new Float32Array(S * S),
  };
}
function put(out, i, c, h, r, m = 0) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h; out.rough[i] = r; out.metal[i] = m;
}

// SDF 填充器：贴图上从 (bx, by) 起 pw × ph 像素的一块，对应 W × H 米（y 向下）；每个盖到的像素回调 paint(o, a, style)
function filler(S, bx, by, pw, ph, W, H, paint) {
  const sx = pw / W, sy = ph / H, px = 1 / Math.min(sx, sy);
  return (sdf, bb, style) => {
    for (let j = Math.max(0, Math.floor((bb[1] - px) * sy)); j <= Math.min(ph - 1, Math.ceil((bb[3] + px) * sy)); j++) {
      for (let i = Math.max(0, Math.floor((bb[0] - px) * sx)); i <= Math.min(pw - 1, Math.ceil((bb[2] + px) * sx)); i++) {
        const a = clamp01(0.5 - sdf((i + 0.5) / sx, (j + 0.5) / sy) / px);
        if (a > 0) paint((by + j) * S + (bx + i), a, style);
      }
    }
  };
}

// ——————————————————————— 笔触 ———————————————————————
// 在一块工作画布（像素）上画一笔：中心、方向、长、宽、颜色。笔尾收细、露出干笔的飞白，笔毛一道道的纹路既压在颜色上，也堆在高度里；
// thick < 1 是稀释过的薄涂（盖不住画布的纹理），gloss 是这一笔干了以后的光泽（进粗糙度）
function makeCanvas(w, h) {
  return { w, h, col: new Float32Array(w * h * 3), hgt: new Float32Array(w * h), paint: new Float32Array(w * h) };
}
function stroke(B, nz, cx, cy, ang, len, wid, c, { alpha = 0.92, relief = 1, seed = 0, thick = 1, gloss = 1 } = {}) {
  const ca = Math.cos(ang), sa = Math.sin(ang), hl = len / 2, hw = wid / 2;
  const r = Math.ceil(hl + hw + 1);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(B.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(B.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const a = dx * ca + dy * sa, b = -dx * sa + dy * ca;
    const t = a / hl;
    const w = hw * (1 - 0.45 * Math.max(0, t) ** 3);
    const d = Math.hypot(Math.max(0, Math.abs(a) - hl), b) - w;
    const cov = clamp01(0.5 - d);
    if (cov <= 0) continue;
    const s = b / Math.max(w, 0.3);
    const bristle = 0.5 + 0.5 * nz(s * 5 + seed * 13.1, a * 0.06 + seed * 7.7);
    const dry = 1 - sstep(0.35, 1.08, t) * (0.5 + 0.5 * nz(s * 9 + seed, 3.3 + seed));
    const A = clamp01(cov * alpha * clamp01(0.55 + 0.75 * bristle) * dry);
    if (A <= 0) continue;
    const i = y * B.w + x;
    const k = 0.9 + 0.16 * bristle;
    for (let q = 0; q < 3; q++) B.col[i * 3 + q] = mix(B.col[i * 3 + q], c[q] * k, A);
    const ridge = (1 - s * s) * 0.45 + (bristle - 0.5) * 0.5;
    B.hgt[i] = mix(B.hgt[i], B.hgt[i] * 0.35 + 0.3 + ridge * relief, A * thick);
    B.paint[i] = Math.max(B.paint[i], A * gloss);
  }
}

// ——————————————————————— 画：普罗旺斯的薰衣草田 ———————————————————————
// (u, v) ∈ [0, 1]，v 向下。地平线 0.42；薰衣草一垄一垄汇向消失点
const VP = [0.56, 0.422];
function painting(w, h, seed) {
  const nA = perlin(seed), nB = perlin(seed + 1), nC = perlin(seed + 2), nD = perlin(seed + 3);
  const rnd = mulberry(seed + 9);
  const AR = w / h;   // 像素的宽高比（u 和 v 的尺度不同）
  const sky = (v) => (v < 0.25 ? mix3([0.2, 0.36, 0.66], [0.46, 0.63, 0.85], v / 0.25) : mix3([0.46, 0.63, 0.85], [0.94, 0.85, 0.7], clamp01((v - 0.25) / 0.17)));
  const clouds = [[0.28, 0.13, 0.17, 0.055], [0.72, 0.09, 0.2, 0.05], [0.55, 0.25, 0.13, 0.035], [0.12, 0.27, 0.1, 0.025]];
  const farTop = (u) => 0.386 + 0.012 * Math.sin(u * 9 + 1) + 0.007 * Math.sin(u * 23 + 2);
  const treeTop = (u) => 0.412 + 0.006 * nA(u * 60, 0.5);
  const rowK = (u, v) => ((u - VP[0]) * AR) / Math.max(1e-4, v - VP[1]) * 5.2;
  const house = { u0: 0.68, u1: 0.745, v0: 0.393, v1: 0.418 };
  const inTree = (u, v) => ((u - 0.24) / 0.075) ** 2 + ((v - 0.362) / 0.05) ** 2 + 0.35 * nB(u * 30, v * 30) < 1;
  const cypress = (u, v) => { const t = (v - 0.325) / 0.093; return t > 0 && t < 1 && Math.abs(u - 0.768) < 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7; };
  // 设计图：每个点的颜色 + 这里的笔触方向（null = 随手的点彩）+ 细节区（用细笔）
  const D = (u, v) => {
    let c, ang = 0.08 * Math.sin(v * 25 + 3 * nC(u * 4, v * 4)), det = false;
    if (v < 0.42) {
      c = sky(v);
      for (const [cu, cv, ru, rv] of clouds) {
        const e = Math.hypot((u - cu) / ru, (v - cv) / rv) - 0.35 * fbm(nD, u * 3, v * 5, 6, 10, 3);
        const dens = sstep(1.0, 0.55, e);
        if (dens > 0) {
          const cc = mix3([0.99, 0.97, 0.93], [0.6, 0.64, 0.78], clamp01((v - cv) / rv * 0.6 + 0.45));
          c = mix3(c, cc, dens);
          if (dens > 0.3) { ang = null; det = true; }
        }
      }
      const ft = farTop(u);
      if (v > ft) { c = mix3([0.52, 0.6, 0.68], [0.42, 0.5, 0.56], clamp01((v - ft) / 0.03)); ang = 0.05; }
      if (v > treeTop(u)) { c = mix3([0.32, 0.43, 0.3], [0.24, 0.33, 0.22], nA(u * 40, v * 40) * 0.5 + 0.5); ang = null; }
    } else if (v < 0.44) {
      c = v > treeTop(u) ? [0.27, 0.37, 0.25] : [0.45, 0.53, 0.58]; ang = null;
    } else if (v < 0.476) {
      c = mix3([0.9, 0.76, 0.4], [0.8, 0.6, 0.3], 0.5 + 0.5 * nA(u * 50, v * 80)); ang = 0.02;
    } else {
      // 薰衣草：垄上紫、垄间绿；远处的发灰发蓝（空气透视）
      const k = rowK(u, v), f = fract(k), depth = clamp01((v - 0.476) / 0.524);
      const onRow = Math.abs(f - 0.5) < 0.33;
      if (onRow) {
        const side = (f - 0.5) / 0.33;   // -1..1：垄的左右两坡
        const lav = mix3([0.7, 0.58, 0.86], [0.44, 0.32, 0.64], clamp01(side * 0.5 + 0.5));
        c = mix3([0.62, 0.58, 0.78], lav, 0.35 + 0.65 * depth);
      } else {
        c = mix3([0.45, 0.5, 0.34], [0.28, 0.32, 0.18], depth);
      }
      ang = Math.atan2((v - VP[1]) * h, (u - VP[0]) * w);
      det = depth > 0.3;
    }
    // 孤树、农舍、柏树
    if (inTree(u, v)) {
      const l = clamp01(((0.24 - u) * 1.2 + (0.362 - v) * 1.6) / 0.08 + 0.5);
      c = mix3([0.2, 0.33, 0.18], [0.5, 0.63, 0.3], l); ang = null; det = true;
    }
    if (u > 0.237 && u < 0.245 && v > 0.39 && v < 0.432) { c = [0.3, 0.22, 0.16]; ang = Math.PI / 2; det = true; }
    if (u > house.u0 && u < house.u1 && v > house.v0 && v < house.v1) {
      c = u > house.u0 + 0.045 ? [0.74, 0.6, 0.46] : [0.92, 0.82, 0.66]; ang = Math.PI / 2; det = true;
      const win = (u > 0.69 && u < 0.698 && v > 0.399 && v < 0.407) || (u > 0.708 && u < 0.716 && v > 0.399 && v < 0.407) || (u > 0.724 && u < 0.732 && v > 0.404 && v < 0.418);
      if (win) c = [0.28, 0.22, 0.2];
    }
    const roof = v > 0.379 && v <= house.v0 && u > house.u0 - 0.004 + (house.v0 - v) * 0.5 && u < house.u1 + 0.004 - (house.v0 - v) * 0.5;
    if (roof) { c = [0.74, 0.37, 0.24]; ang = 0.15; det = true; }
    if (cypress(u, v)) { c = mix3([0.14, 0.26, 0.15], [0.25, 0.38, 0.22], clamp01((0.768 - u) / 0.012 * 0.5 + 0.5)); ang = Math.PI / 2 + 0.1 * nA(v * 90, 1); det = true; }
    return { c, ang, det };
  };
  // 没画完的右下角：一道参差的斜边以内是厚涂，外面一圈稀释过的薄涂，再往外是只有铅笔线的裸画布
  const edge = (u, v) => (u - 0.72) * 0.9 + (v - 0.84) + 0.06 * fbm(nB, u, v, 5, 5, 3);
  const done = (u, v) => sstep(0.03, -0.03, edge(u, v));
  const wash = (u, v) => sstep(0.1, 0.04, edge(u, v) + 0.04 * nD(u * 9, v * 9));

  const B = makeCanvas(w, h);
  const nz = (x, y) => nC(x, y);
  // 底：画布（米白，粗纹）+ 薄薄一层底色
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h, i = y * w + x;
    const weave = 0.5 + 0.25 * Math.sin((x * 2 * Math.PI) / 3.2) + 0.25 * Math.sin((y * 2 * Math.PI) / 3.2);
    const cv = mix3([0.93, 0.9, 0.84], [0.86, 0.83, 0.77], weave * 0.5);
    const m = done(u, v);
    const { c } = D(u, v);
    const col = mix3(cv, mix3(c, [0.55, 0.45, 0.4], 0.12), m * 0.9);
    B.col[i * 3] = col[0]; B.col[i * 3 + 1] = col[1]; B.col[i * 3 + 2] = col[2];
    B.hgt[i] = weave * 0.12;
    B.paint[i] = m * 0.4;
  }
  // 薄涂：大笔、透明、几乎没有厚度，颜色冲淡一些（松节油调得很稀）
  let sid = 0;
  for (let gy = 0; gy < h; gy += 14) for (let gx = 0; gx < w; gx += 14) {
    const cx = gx + rnd() * 14, cy = gy + rnd() * 14, u = cx / w, v = cy / h;
    if (wash(u, v) < rnd() * 0.9 + 0.05 || done(u, v) > 0.97) continue;
    const { c, ang } = D(u, v);
    const a = ang === null ? rnd() * Math.PI : ang + (rnd() - 0.5) * 0.3;
    stroke(B, nz, cx, cy, a, mix(30, 52, rnd()), mix(10, 17, rnd()), mix3(c, [0.9, 0.87, 0.82], 0.3), { alpha: 0.42, relief: 0.05, thick: 0.15, gloss: 0.3, seed: sid++ % 97 });
  }
  // 三遍笔触：大笔铺色 → 中笔 → 细笔（只在细节区）
  const layers = [
    { step: 11, len: [24, 40], wid: [8, 13], alpha: 0.88, relief: 0.8, detOnly: false },
    { step: 6.5, len: [13, 24], wid: [5, 8], alpha: 0.9, relief: 1, detOnly: false },
    { step: 3.6, len: [6, 12], wid: [2.5, 4.5], alpha: 0.92, relief: 1.1, detOnly: true },
  ];
  for (const L of layers) {
    for (let gy = 0; gy < h; gy += L.step) for (let gx = 0; gx < w; gx += L.step) {
      const cx = gx + rnd() * L.step, cy = gy + rnd() * L.step;
      const u = cx / w, v = cy / h;
      const m = done(u, v);
      if (m < rnd() * 0.9 + 0.05) continue;
      const { c, ang, det } = D(u, v);
      if (L.detOnly && !det) continue;
      const jit = 1 + (rnd() - 0.5) * 0.14;
      const hue = [(rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05];
      const col = c.map((q, j) => clamp01(q * jit + hue[j]));
      const a = ang === null ? rnd() * Math.PI : ang + (rnd() - 0.5) * 0.35;
      const len = mix(L.len[0], L.len[1], rnd()) * (ang === null ? 0.6 : 1), wid = mix(L.wid[0], L.wid[1], rnd());
      stroke(B, nz, cx, cy, a, len, wid, col, { alpha: L.alpha, relief: L.relief, seed: sid++ % 97 });
    }
  }
  // 薰衣草的花穗：近处的垄上点一层亮紫的短点
  for (let i = 0; i < 1400; i++) {
    const u = rnd(), v = 0.5 + rnd() * 0.5;
    if (done(u, v) < 0.6) continue;
    const f = fract(rowK(u, v));
    if (Math.abs(f - 0.5) > 0.28) continue;
    const depth = clamp01((v - 0.476) / 0.524);
    stroke(B, nz, u * w, v * h, Math.PI / 2 + (rnd() - 0.5) * 0.6, 3 + 5 * depth, 2 + 2.5 * depth, mix3([0.78, 0.66, 0.92], [0.58, 0.44, 0.8], rnd()), { alpha: 0.9, relief: 1.3, seed: i % 97 });
  }
  // 裸画布上的铅笔起稿线：每一垄画一条边线（手画的，有一点抖），各自在不同的地方收笔
  const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h, i = y * w + x;
    const m = done(u, v);
    if (m > 0.6 || v < 0.5) continue;
    const k0 = rowK(u, v), row = Math.floor(k0 + 0.5);
    const k = k0 + 0.035 * nA(v * 16, row * 3.1);
    if (v > 0.8 + 0.2 * hash(row)) continue;
    const dk = Math.abs(k - row);
    // 线宽按像素：k 对 x 的导数
    const dkdx = Math.abs(rowK(u + 1 / w, v) - k0);
    const line = clamp01(1.2 - dk / (dkdx * 0.8 + 1e-6)) * (0.5 + 0.5 * nA(x * 0.25, y * 0.25));
    const a = line * (1 - m) * 0.6;
    for (let q = 0; q < 3; q++) B.col[i * 3 + q] = mix(B.col[i * 3 + q], 0.45, a);
  }
  return B;
}

export function studioAtlas(S, P) {
  const A = STUDIO_ATLAS, k = S / A.size;
  const out = alloc(S);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const rnd = mulberry(P.seed + 4);
  const nW = perlin(P.seed + 5), nR = perlin(P.seed + 6);

  // —— 纯色格子 ——
  {
    const [x0, y0, x1, y1] = box('swatch');
    const rows = Math.ceil(A.swatches.length / A.cols);
    const w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
    A.swatches.forEach((s, i) => {
      const c = rgb(s.c);
      const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
      for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, c, 0, s.rough, s.metal ?? 0);
    });
  }

  // —— 油画 ——
  {
    const [x0, y0, x1, y1] = box('painting'), w = x1 - x0, h = y1 - y0;
    const B = painting(w, h, P.seed + 10);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = (y0 + y) * S + (x0 + x);
      const pm = B.paint[i];
      put(out, o, [B.col[i * 3], B.col[i * 3 + 1], B.col[i * 3 + 2]], B.hgt[i], mix(0.78, 0.32, clamp01(pm)), 0);
    }
  }

  // —— 画布背面：没上底料的亚麻（偏黄褐、有粗节），中间一个蓝灰色的厂家印章，下面几行铅笔字（画名、作者、年份）——
  {
    const [x0, y0, x1, y1] = box('back'), w = x1 - x0, h = y1 - y0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const weave = 0.5 + 0.25 * Math.sin(x * 2.4) + 0.25 * Math.sin(y * 2.4);
      const slub = 0.5 * nW(x * 0.02, y * 0.5) + 0.5 * nW(x * 0.5 + 40, y * 0.02);
      const c = mix3([0.78, 0.68, 0.52], [0.62, 0.52, 0.38], clamp01(weave * 0.45 + slub * 0.5 + 0.1));
      put(out, (y0 + y) * S + (x0 + x), c, weave * 0.35 + slub * 0.2, 0.88, 0);
    }
    const W = A.painting.w, H = A.painting.h;
    // 印章的油墨：盖得不匀，有的地方断了
    const ink = filler(S, x0, y0, w, h, W, H, (o, a, st) => {
      const px = o % S, py = Math.floor(o / S);
      const k = a * st.alpha * clamp01(0.55 + 0.9 * nR(px * 0.08, py * 0.08));
      for (let q = 0; q < 3; q++) out.color[o * 3 + q] = mix(out.color[o * 3 + q], st.color[q], k);
    });
    const blue = { color: [0.24, 0.3, 0.46], alpha: 0.9 };
    const sx = W / 2, sy = 0.25;
    const frame = (x, y) => Math.abs(Math.max(Math.abs(x - sx) - 0.1, Math.abs(y - sy) - 0.05)) - 0.0012;
    ink(frame, [sx - 0.105, sy - 0.055, sx + 0.105, sy + 0.055], blue);
    text(ink, 'TRYITEM', sx, sy - 0.036, 0.018, { align: 'center', stroke: 0.16, ...blue });
    text(ink, 'FINE ART LINEN', sx, sy - 0.006, 0.011, { align: 'center', stroke: 0.15, ...blue });
    text(ink, '60 X 80 CM', sx, sy + 0.016, 0.011, { align: 'center', stroke: 0.15, ...blue });
    // 铅笔字：石墨，比亚麻亮一点点、有一点光泽
    const pencil = filler(S, x0, y0, w, h, W, H, (o, a) => {
      for (let q = 0; q < 3; q++) out.color[o * 3 + q] = mix(out.color[o * 3 + q], 0.36, a * 0.8);
      out.rough[o] = mix(out.rough[o], 0.5, a);
    });
    text(pencil, 'LAVANDES', 0.1, 0.6, 0.024, { stroke: 0.09 });
    text(pencil, 'L. MOREAU  2026', 0.1, 0.64, 0.016, { stroke: 0.1 });
  }

  // —— 调色板：浅色的木头、边上一圈颜料堆、中间调过色的抹痕 ——
  {
    const [x0, y0, x1, y1] = box('palette'), w = x1 - x0, h = y1 - y0;
    const B = makeCanvas(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h, i = y * w + x;
      const g = fbm(nW, u * 0.6, v * 6, 3, 30, 4);
      const c = mix3([0.8, 0.66, 0.47], [0.66, 0.5, 0.33], clamp01(0.5 + g * 1.4 + 0.25 * Math.sin(v * 90 + g * 8)));
      B.col[i * 3] = c[0]; B.col[i * 3 + 1] = c[1]; B.col[i * 3 + 2] = c[2];
      B.hgt[i] = 0.2 + g * 0.1;
    }
    const nz = (a, b) => nR(a, b);
    const pxm = w / A.palette.w;   // 像素 / 米
    // 调色的抹痕（紫、灰蓝、橄榄绿、奶黄）：调色刀来回刮几下，同一个方向上一片压一片
    const smears = [[[0.46, 0.34, 0.66], 0.42, 0.55, 0.4], [[0.5, 0.58, 0.72], 0.6, 0.66, -0.3], [[0.46, 0.5, 0.3], 0.3, 0.72, 0.9], [[0.95, 0.88, 0.66], 0.62, 0.42, 0.1], [[0.68, 0.56, 0.84], 0.46, 0.4, -0.6]];
    smears.forEach(([c, u, v, dir], i) => {
      for (let s = 0; s < 4; s++) {
        const a = dir + (rnd() - 0.5) * 0.35, off = (s - 1.5) * 0.007 * pxm;
        stroke(B, nz, u * w - Math.sin(a) * off + (rnd() - 0.5) * 0.01 * pxm, v * h + Math.cos(a) * off + (rnd() - 0.5) * 0.01 * pxm, a, (0.045 + 0.03 * rnd()) * pxm, (0.016 + 0.008 * rnd()) * pxm,
          c.map((q) => clamp01(q * (0.9 + 0.2 * rnd()))), { alpha: 0.8, relief: 0.35, seed: i * 7 + s });
      }
    });
    // 颜料堆：沿着调色板上沿和右沿排一圈
    const dabs = A.tubes.map((t) => rgb(t.c)).concat([[0.62, 0.5, 0.8]]);
    dabs.forEach((c, i) => {
      const a = -2.4 + (i / (dabs.length - 1)) * 2.3;
      const cu = 0.54 + 0.36 * Math.cos(a), cv = 0.56 + 0.38 * Math.sin(a);
      const R = (0.012 + 0.006 * rnd()) * pxm;
      const cx = cu * w, cy = cv * h;
      for (let y = Math.max(0, Math.floor(cy - 2 * R)); y < Math.min(h, cy + 2 * R); y++) for (let x = Math.max(0, Math.floor(cx - 2 * R)); x < Math.min(w, cx + 2 * R); x++) {
        const dx = (x + 0.5 - cx) / R, dy = (y + 0.5 - cy) / R;
        const ang = Math.atan2(dy, dx);
        const rr = 1 + 0.22 * nR(Math.cos(ang) * 2 + i * 5, Math.sin(ang) * 2);
        const d = Math.hypot(dx, dy) / rr;
        if (d > 1.02) continue;
        const cov = clamp01((1.02 - d) * R);
        const dome = Math.sqrt(Math.max(0, 1 - d * d));
        const swirl = 0.5 + 0.5 * Math.sin(ang * 3 + d * 9 + i);
        const j = y * w + x;
        const col = mix3(c, c.map((q) => Math.min(1, q * 1.25 + 0.06)), swirl * 0.35 * dome);
        for (let q = 0; q < 3; q++) B.col[j * 3 + q] = mix(B.col[j * 3 + q], col[q], cov);
        B.hgt[j] = mix(B.hgt[j], 0.3 + dome * 0.7 + swirl * 0.15, cov);
        B.paint[j] = Math.max(B.paint[j], cov);
      }
    });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      put(out, (y0 + y) * S + (x0 + x), [B.col[i * 3], B.col[i * 3 + 1], B.col[i * 3 + 2]], B.hgt[i], mix(0.5, 0.22, clamp01(B.paint[i])), 0);
    }
  }

  // —— 颜料管的标签：u 沿管身（管肩 → 封口）、v 绕管一圈（v = 0.5 是朝上的正面）；
  //    靠管肩一圈颜色带（上面印牌子），后面白底印颜色名，字沿着管身横排 ——
  {
    const [x0, y0, x1, y1] = box('labels');
    const { cols, rows } = A.labels, cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
    const LW = 0.085, LH = 0.0785;   // 管身长、周长（米）
    A.tubes.forEach((t, n) => {
      const bx = x0 + Math.round((n % cols) * cw), by = y0 + Math.round(Math.floor(n / cols) * ch);
      const c = rgb(t.c);
      const W = Math.round(cw), H = Math.round(ch);
      for (let y = by; y < by + H; y++) for (let x = bx; x < bx + W; x++) {
        const u = (x + 0.5 - bx) / W;
        let col = [0.95, 0.94, 0.91];
        if (u > 0.1 && u < 0.42) col = c;
        if (Math.abs(u - 0.1) < 0.008 || Math.abs(u - 0.42) < 0.008) col = [0.2, 0.2, 0.22];
        put(out, y * S + x, col, 0, 0.45, 0);
      }
      const fill = filler(S, bx, by, W, H, LW, LH, (o, a, style) => {
        for (let q = 0; q < 3; q++) out.color[o * 3 + q] = mix(out.color[o * 3 + q], style.color[q], a);
      });
      const dark = [0.16, 0.16, 0.18];
      const onBand = n === 0 || n === 1 ? [0.2, 0.2, 0.22] : [0.97, 0.96, 0.93];
      text(fill, 'TRYITEM', 0.26 * LW, 0.5 * LH - 0.0021, 0.0042, { align: 'center', stroke: 0.16, color: onBand });
      const th = 0.0036, tw = textWidth(t.name, th), sc = Math.min(1, 0.044 / tw);
      text(fill, t.name, 0.69 * LW, 0.5 * LH - (th * sc) / 2, th * sc, { align: 'center', stroke: 0.15, color: dark });
      text(fill, 'OIL COLOUR', 0.69 * LW, 0.5 * LH + 0.0045, 0.0022, { align: 'center', stroke: 0.14, color: dark });
      text(fill, '37 ML', 0.69 * LW, 0.5 * LH - 0.0068, 0.0022, { align: 'center', stroke: 0.14, color: dark });
    });
  }

  // —— 抹布：米白的棉布，上面一块块擦上去的颜料 ——
  {
    const [x0, y0, x1, y1] = box('rag'), w = x1 - x0, h = y1 - y0;
    const blobs = Array.from({ length: 9 }, (_, i) => ({ u: rnd(), v: rnd(), r: 0.08 + 0.12 * rnd(), c: rgb(A.tubes[[5, 4, 2, 6, 7, 5, 1, 3, 4][i]].c), a: 0.35 + 0.4 * rnd(), s: rnd() * 3 }));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      const weave = 0.5 + 0.25 * Math.sin(x * 2.1) + 0.25 * Math.sin(y * 2.1);
      let c = mix3([0.92, 0.9, 0.85], [0.84, 0.82, 0.76], weave * 0.4);
      for (const b of blobs) {
        let du = u - b.u, dv = v - b.v;
        du -= Math.round(du); dv -= Math.round(dv);
        const d = Math.hypot(du * (1 + 0.6 * Math.sin(b.s)), dv) / b.r + 0.4 * fbm(nR, u, v, 6, 6, 3);
        c = mix3(c, b.c, clamp01(1 - d) ** 0.7 * b.a);
      }
      put(out, (y0 + y) * S + (x0 + x), c, weave * 0.3, 0.85, 0);
    }
  }
  return out;
}

// ——————————————————————— 溅满颜料的木地板 ———————————————————————
// 浅色的旧松木宽板（和宽板地板同一个生成器，换一套颜色），上面是一滴滴、一摊摊干掉的颜料（周期 2m，模块拼起来接得上）
export function studioFloor(S, P) {
  const out = planks(S, {
    seed: P.seed, period: 2, rows: 10, twoPieceChance: 0.5, ringSpacing: 0.007, archChance: 0.5, archLen: 1.0,
    warp: 2.4, pores: 0.6, lateMix: 0.7, colorVar: 0.06, fiberVar: 0.05, plankTint: 0.1, plankWarm: 0.04,
    early: rgb([222, 198, 160]), late: rgb([186, 152, 110]), pore: rgb([158, 124, 88]), rough: 0.62,
    groove: 0.0016, seamDark: 0.4, grainRelief: 0.25,
  });
  const rnd = mulberry(P.seed + 77), n = perlin(P.seed + 78);
  const period = 2, pxm = S / period;
  const colors = STUDIO_ATLAS.tubes.map((t) => rgb(t.c)).concat([[0.62, 0.5, 0.8], [0.62, 0.5, 0.8], [0.95, 0.94, 0.9]]);
  const dot = (cx, cy, r, c, a = 1, wob = 0.25, seed = 0) => {
    const R = r * pxm, X = cx * pxm, Y = cy * pxm;
    for (let y = Math.floor(Y - 1.6 * R - 1); y <= Math.ceil(Y + 1.6 * R + 1); y++) for (let x = Math.floor(X - 1.6 * R - 1); x <= Math.ceil(X + 1.6 * R + 1); x++) {
      const dx = x + 0.5 - X, dy = y + 0.5 - Y, ang = Math.atan2(dy, dx);
      const rr = R * (1 + wob * n(Math.cos(ang) * 1.5 + seed, Math.sin(ang) * 1.5 + seed * 0.7));
      const cov = clamp01(rr - Math.hypot(dx, dy) + 0.5) * a;
      if (cov <= 0) continue;
      const xi = ((x % S) + S) % S, yi = ((y % S) + S) % S, i = yi * S + xi;
      for (let q = 0; q < 3; q++) out.color[i * 3 + q] = mix(out.color[i * 3 + q], c[q], cov);
      out.height[i] = mix(out.height[i], 0.35, cov);
      out.rough[i] = mix(out.rough[i], 0.32, cov);
    }
  };
  for (let g = 0; g < 160; g++) {
    const cx = rnd() * period, cy = rnd() * period, c = colors[Math.floor(rnd() * colors.length)];
    const r0 = 0.003 + 0.014 * rnd() ** 2;
    dot(cx, cy, r0, c, 1, 0.3, g);
    // 甩出去的小点：朝一个方向散开
    const dir = rnd() * Math.PI * 2, nd = Math.floor(3 + rnd() * 12);
    for (let i = 0; i < nd; i++) {
      const d = r0 * (1.5 + 4 * rnd()), a = dir + (rnd() - 0.5) * 0.9;
      dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r0 * (0.08 + 0.3 * rnd()), c, 1, 0.2, g + i);
    }
    // 偶尔一道拖出来的长滴
    if (rnd() < 0.25) {
      const L = 0.02 + 0.05 * rnd();
      for (let s = 0; s < 14; s++) dot(cx + Math.cos(dir) * (r0 + (L * s) / 14), cy + Math.sin(dir) * (r0 + (L * s) / 14), r0 * 0.35 * (1 - s / 16), c, 1, 0.1, g);
    }
  }
  // 满地的细小飞沫（甩笔、弹笔毛溅出来的）
  for (let g = 0; g < 700; g++) dot(rnd() * period, rnd() * period, 0.0006 + 0.0014 * rnd(), colors[Math.floor(rnd() * colors.length)], 1, 0.15, 300 + g);
  // 几摊稀掉的大片（半透明，几团叠在一起，边缘不规则）：只用浅一点的颜色，黑的稀释了会像脏印子
  const light = [1, 2, 5, 8, 10].map((i) => colors[i]);
  for (let g = 0; g < 6; g++) {
    const cx = rnd() * period, cy = rnd() * period, c = light[Math.floor(rnd() * light.length)], r = 0.02 + 0.025 * rnd();
    for (let j = 0; j < 3; j++) dot(cx + (rnd() - 0.5) * r * 1.4, cy + (rnd() - 0.5) * r * 1.4, r * (0.6 + 0.4 * rnd()), c, 0.3, 0.35, 200 + g * 3 + j);
  }
  return out;
}
