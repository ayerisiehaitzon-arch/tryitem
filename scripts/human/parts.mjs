// 衣服的配色（构建时）：把一套衣服分成“部位”（上衣 / 下装……），每个部位找出主色，算一张权重图：
// 哪些像素是这块布的主色（换颜色时跟着变），哪些是条纹、滚边、商标、纽扣、明线（保持原样）。
//
//   1. UV 岛：共享渲染顶点的三角形连在一起，一个岛就是一片裁片（前片、后片、袖子、裤腿……）
//   2. 每片按它在身上的高度分上衣 / 下装（大片看自己的中位高度；小片——口袋盖、纽扣——跟着 3D 里离它最近的大片）
//   3. 部位的主色 = 这个部位所有像素颜色的中位数（线性空间）
//   4. 权重 = 色度接近主色（rg 色度距离）× 亮度在主色的 0.3 ~ 3 倍之间（褶皱的明暗跟着变，白衬衫、黑纽扣不变；
//      牛仔布放宽，洗白的地方也跟着变）
// 网页里换颜色：新颜色 × (像素亮度 / 主色亮度)，按权重和原色混。

import { pushPull, blur } from './texfx.mjs';

const lin = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const LUT = Float32Array.from({ length: 256 }, (_, i) => lin(i / 255));

// 渲染网格的 UV 岛：返回每个三角形属于哪个岛
export function islands(r) {
  const par = r.map.map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < r.idx.length; t += 3) { const a = find(r.idx[t]); par[find(r.idx[t + 1])] = a; par[find(r.idx[t + 2])] = a; }
  const ids = new Map(), triIsl = new Int32Array(r.idx.length / 3);
  for (let t = 0; t < r.idx.length; t += 3) { const root = find(r.idx[t]); if (!ids.has(root)) ids.set(root, ids.size); triIsl[t / 3] = ids.get(root); }
  return { count: ids.size, triIsl };
}

// 每个岛归哪一类（0 上衣、1 下装）：pos 是代理顶点的静止位置（米）
export function classify(r, pos, isl, { split = 0.1 } = {}) {
  const n = isl.count, ys = Array.from({ length: n }, () => []), area = new Float64Array(n), pts = Array.from({ length: n }, () => []);
  for (let t = 0; t < r.idx.length; t += 3) {
    const k = isl.triIsl[t / 3];
    const P = [0, 1, 2].map((j) => r.map[r.idx[t + j]]);
    const a = [0, 1, 2].map((q) => pos[P[1] * 3 + q] - pos[P[0] * 3 + q]), b = [0, 1, 2].map((q) => pos[P[2] * 3 + q] - pos[P[0] * 3 + q]);
    area[k] += 0.5 * Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    for (const v of P) { ys[k].push(pos[v * 3 + 1]); pts[k].push(v); }
  }
  const total = area.reduce((s, x) => s + x, 0);
  const cls = new Int8Array(n).fill(-1);
  const big = [];
  for (let k = 0; k < n; k++) {
    if (area[k] < total * 0.01) continue;
    const s = ys[k].sort((p, q) => p - q);
    cls[k] = s[s.length >> 1] > split ? 0 : 1;
    big.push(k);
  }
  // 小片：跟着 3D 里离它最近的大片
  for (let k = 0; k < n; k++) {
    if (cls[k] >= 0) continue;
    let best = Infinity, bc = 0;
    const mine = [...new Set(pts[k])];
    for (const j of big) {
      const theirs = [...new Set(pts[j])];
      for (const v of mine) for (let w = 0; w < theirs.length; w += 3) {
        const u = theirs[w], d = (pos[v * 3] - pos[u * 3]) ** 2 + (pos[v * 3 + 1] - pos[u * 3 + 1]) ** 2 + (pos[v * 3 + 2] - pos[u * 3 + 2]) ** 2;
        if (d < best) { best = d; bc = cls[j]; }
      }
    }
    cls[k] = bc;
  }
  return cls;
}

// 把每个三角形的部位号画进 W×H 的格子（-1 = 没有布）
function rasterParts(r, triPart, W, H) {
  const out = new Int8Array(W * H).fill(-1);
  for (let t = 0; t < r.idx.length; t += 3) {
    const P = [0, 1, 2].map((k) => [r.uv[r.idx[t + k] * 2] * W, (1 - r.uv[r.idx[t + k] * 2 + 1]) * H]);
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
      if (w0 >= -0.01 && w1 >= -0.01 && w0 + w1 <= 1.01) out[y * W + x] = triPart[t / 3];
    }
  }
  return out;
}

// rgba：处理过的漫反射贴图（W×H，sRGB 的 Uint8）；triPart：每个三角形的部位号；
// tol / qmax：每个部位的色度容差、最亮能到主色的几倍（牛仔布洗白的地方更亮、更灰，要放宽）
// 返回 { mask: RGB Uint8（R、G、B = 部位 0、1、2 的权重）, dom: 每个部位的主色（线性） }
export function partMask(rgba, W, H, r, triPart, nParts, { tol = [], qmax = [], out = 1024 } = {}) {
  const part = rasterParts(r, triPart, W, H);
  // 主色：每个部位像素的中位数（线性）
  const dom = [];
  for (let p = 0; p < nParts; p++) {
    const ch = [[], [], []];
    for (let i = 0; i < W * H; i += 3) if (part[i] === p) for (let c = 0; c < 3; c++) ch[c].push(LUT[rgba[i * 4 + c]]);
    dom.push(ch.map((v) => { v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0.5; }));
  }
  const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const chroma = (c) => { const s = c[0] + c[1] + c[2] + 1e-5; return [c[0] / s, c[1] / s]; };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // 按输出分辨率算（先在原分辨率算，再盒式缩小）
  const k = W / out, img = new Float32Array(out * out * 3), wt = new Float32Array(out * out);
  for (let p = 0; p < nParts; p++) {
    const Ld = Math.max(1e-4, luma(dom[p])), cd = chroma(dom[p]), T = tol[p] ?? 0.07, Q = qmax[p] ?? 3.3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (part[i] !== p) continue;
      const c = [LUT[rgba[i * 4]], LUT[rgba[i * 4 + 1]], LUT[rgba[i * 4 + 2]]], L = luma(c), q = L / Ld, cc = chroma(c);
      // 很暗的像素色度不稳，容差放宽
      const tt = T * (1 + 1.5 * sm(0.5, 0.05, L / Math.max(Ld, 0.02)));
      const w = sm(tt * 1.7, tt, Math.hypot(cc[0] - cd[0], cc[1] - cd[1])) * sm(0.22, 0.4, q) * (1 - sm(Q * 0.73, Q, q));
      const o = Math.floor(y / k) * out + Math.floor(x / k);
      img[o * 3 + p] += w / (k * k);
    }
  }
  // 有布的地方权重为准，外面往外填（贴图缩小时岛边不会被 0 拉低），再轻轻模糊一下
  for (let i = 0; i < out * out; i++) {
    const x = Math.floor((i % out) * k), y = Math.floor(Math.floor(i / out) * k);
    wt[i] = part[y * W + x] >= 0 ? 1 : 0;
  }
  pushPull(img, wt, out, out, 3);
  const ch = [0, 1, 2].map((c) => { const a = new Float32Array(out * out); for (let i = 0; i < out * out; i++) a[i] = img[i * 3 + c]; return blur(a, out, out, 0.7); });
  // 32 级就够（无损 WebP 小一半）
  const mask = new Uint8Array(out * out * 3);
  for (let i = 0; i < out * out; i++) for (let c = 0; c < 3; c++) mask[i * 3 + c] = Math.min(255, Math.round(Math.min(1, Math.max(0, ch[c][i])) * 32) * 8);
  return { mask, dom: dom.map((d) => d.map((x) => +x.toFixed(5))) };
}
