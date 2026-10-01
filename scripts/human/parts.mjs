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

// 鞋：每个岛归哪一类（0 鞋面、1 鞋底、2 袜子）。按岛在静止姿势里的高度（相对整只鞋的最低点）：
// 鞋底整片贴着地（最高点离地不到 8cm），袜子是鞋口上面那一大片（中位高度离地 9cm 以上），其余（鞋面、鞋带、小标签）算鞋面
export function classifyShoe(r, pos, isl) {
  const n = isl.count, ys = Array.from({ length: n }, () => []), area = new Float64Array(n);
  let ymin = Infinity;
  for (let t = 0; t < r.idx.length; t += 3) {
    const k = isl.triIsl[t / 3];
    const P = [0, 1, 2].map((j) => r.map[r.idx[t + j]]);
    const a = [0, 1, 2].map((q) => pos[P[1] * 3 + q] - pos[P[0] * 3 + q]), b = [0, 1, 2].map((q) => pos[P[2] * 3 + q] - pos[P[0] * 3 + q]);
    area[k] += 0.5 * Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    for (const v of P) { ys[k].push(pos[v * 3 + 1]); ymin = Math.min(ymin, pos[v * 3 + 1]); }
  }
  const total = area.reduce((s, x) => s + x, 0);
  return Int8Array.from({ length: n }, (_, k) => {
    const s = ys[k].sort((p, q) => p - q), med = s[s.length >> 1] - ymin, top = s[s.length - 1] - ymin;
    return area[k] >= total * 0.05 && med > 0.09 ? 2 : top < 0.08 ? 1 : 0;
  });
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
// tol / qmax / qmin：每个部位的色度容差、最亮能到主色的几倍（牛仔布洗白的地方更亮、更灰，要放宽）、最暗到几倍
//   （默认 0.4，再暗的是黑纽扣、深色条纹；皮鞋的褶子很深，要放到 0.12，不然黑皮鞋换浅色时褶子里一道道黑）；
// pick：主色怎么取——'median'（默认，所有像素的中位数）、'coverage'（取“能让最多像素一起换色”的那个颜色）
//   或者直接给一个颜色 '#rrggbb'（从它出发，取跟它一起换色的像素的中位数。白球鞋鞋面的贴图里，鞋里子、鞋口的深色网布
//   占的地方比白色还大——虽然穿着看不见——中位数和覆盖面积都会挑中深灰，只能直接说“白的那块”）；
// exclude：[[部位, u0, v0, u1, v1], …] 贴图上这些框里（0~1，v 朝下）不换色
// 返回 { mask: RGB Uint8（R、G、B = 部位 0、1、2 的权重）, dom: 每个部位的主色（线性） }
export function partMask(rgba, W, H, r, triPart, nParts, { tol = [], qmax = [], qmin = [], pick = [], exclude = [], out = 1024 } = {}) {
  const part = rasterParts(r, triPart, W, H);
  const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const chroma = (c) => { const s = c[0] + c[1] + c[2] + 1e-5; return [c[0] / s, c[1] / s]; };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const px = (i) => [LUT[rgba[i * 4]], LUT[rgba[i * 4 + 1]], LUT[rgba[i * 4 + 2]]];
  // 一个像素跟着主色换色的权重：色度接近 × 亮度在主色的 q0 ~ Q 倍之间
  const weightFor = (d, T, Q, q0 = 0.4) => {
    const Ld = Math.max(1e-4, luma(d)), cd = chroma(d);
    return (c, L) => {
      const q = L / Ld, cc = chroma(c);
      // 很暗的像素色度不稳，容差放宽
      const tt = T * (1 + 1.5 * sm(0.5, 0.05, L / Math.max(Ld, 0.02)));
      return sm(tt * 1.7, tt, Math.hypot(cc[0] - cd[0], cc[1] - cd[1])) * sm(q0 * 0.55, q0, q) * (1 - sm(Q * 0.73, Q, q));
    };
  };
  const median = (ch) => ch.map((v) => { v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0.5; });
  const dom = [];
  for (let p = 0; p < nParts; p++) {
    const T = tol[p] ?? 0.07, Q = qmax[p] ?? 3.3, q0 = qmin[p] ?? 0.4;
    if (!pick[p] || pick[p] === 'median') {
      const ch = [[], [], []];
      for (let i = 0; i < W * H; i += 3) if (part[i] === p) for (let c = 0; c < 3; c++) ch[c].push(LUT[rgba[i * 4 + c]]);
      dom.push(median(ch));
      continue;
    }
    // 均匀取约 8000 个像素当样本，其中约 160 个当候选主色，挑覆盖（权重和）最大的（直接给了颜色就用它）；再取跟它一起换色的像素的中位数
    const idx = [];
    for (let i = 0; i < W * H; i++) if (part[i] === p) idx.push(i);
    const S = [];
    for (let j = 0; j < idx.length; j += Math.max(1, Math.floor(idx.length / 8000))) { const c = px(idx[j]); S.push([c, luma(c)]); }
    let best = typeof pick[p] === 'string' && pick[p][0] === '#' ? [1, 3, 5].map((o) => LUT[parseInt(pick[p].slice(o, o + 2), 16)]) : null, score = -1;
    if (!best) for (let j = 0; j < S.length; j += Math.max(1, Math.floor(S.length / 160))) {
      const f = weightFor(S[j][0], T, Q, q0);
      let sc = 0;
      for (const [c, L] of S) sc += f(c, L);
      if (sc > score) { score = sc; best = S[j][0]; }
    }
    const f = weightFor(best ?? [0.5, 0.5, 0.5], T, Q, q0), ch = [[], [], []];
    for (const [c, L] of S) if (f(c, L) > 0.5) for (let q = 0; q < 3; q++) ch[q].push(c[q]);
    dom.push(median(ch));
  }
  // 按输出分辨率算（先在原分辨率算，再盒式缩小）
  const k = W / out, img = new Float32Array(out * out * 3), wt = new Float32Array(out * out);
  for (let p = 0; p < nParts; p++) {
    const f = weightFor(dom[p], tol[p] ?? 0.07, qmax[p] ?? 3.3, qmin[p] ?? 0.4), boxes = exclude.filter((e) => e[0] === p);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (part[i] !== p) continue;
      if (boxes.some(([, u0, v0, u1, v1]) => x >= u0 * W && x < u1 * W && y >= v0 * H && y < v1 * H)) continue;
      const c = px(i), w = f(c, luma(c));
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
