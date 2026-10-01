// 贴图处理（构建时用，纯数组运算）：
//   uvCoverage  UV 三角形盖住了哪些像素
//   pushPull    没盖住的像素用附近盖住的颜色填上（金字塔下采样再逐级插回来），贴图缩小、mipmap 的时候 UV 接缝不会漏进背景色
//   removeLogo  去掉衣服上的标志：从旁边干净的布上搬一块过来，再把边上的明暗差平滑地补进去（简化的无缝克隆）
//   flowMap     头发的流向：用结构张量（亮度梯度的外积再模糊）求每个像素发丝的走向

// —— 可分离的高斯模糊（原地，单通道 Float32Array）——
export function blur(a, W, H, sigma) {
  if (sigma <= 0) return a;
  const r = Math.ceil(sigma * 3), k = new Float32Array(r * 2 + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); acc += a[row + xx] * k[i + r]; }
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); acc += tmp[yy * W + x] * k[i + r]; }
      a[y * W + x] = acc;
    }
  }
  return a;
}

// —— UV 覆盖：把每个三角形画进 W×H 的格子（v 朝上，所以行号 = (1 - v) * H），再往外扩 grow 个像素 ——
export function uvCoverage(uv, index, W, H, grow = 2) {
  const m = new Uint8Array(W * H);
  for (let t = 0; t < index.length; t += 3) {
    const P = [0, 1, 2].map((k) => [uv[index[t + k] * 2] * W, (1 - uv[index[t + k] * 2 + 1]) * H]);
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) m[y * W + x] = 1;
    }
  }
  for (let g = 0; g < grow; g++) {
    const n = m.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (m[y * W + x]) continue;
      if ((x > 0 && m[y * W + x - 1]) || (x < W - 1 && m[y * W + x + 1]) || (y > 0 && m[(y - 1) * W + x]) || (y < H - 1 && m[(y + 1) * W + x])) n[y * W + x] = 1;
    }
    m.set(n);
  }
  return m;
}

// —— push-pull：weight = 0 的地方由更粗一级插值上来。chans 个通道的 Float32Array，weight 0~1 ——
export function pushPull(img, weight, W, H, chans) {
  if (W <= 1 && H <= 1) return img;
  const w2 = Math.max(1, W >> 1), h2 = Math.max(1, H >> 1);
  const ci = new Float32Array(w2 * h2 * chans), cw = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    let ws = 0;
    const acc = new Float32Array(chans);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = Math.min(W - 1, x * 2 + dx), yy = Math.min(H - 1, y * 2 + dy), i = yy * W + xx, w = weight[i];
      ws += w;
      for (let c = 0; c < chans; c++) acc[c] += img[i * chans + c] * w;
    }
    const o = y * w2 + x;
    cw[o] = Math.min(1, ws);
    for (let c = 0; c < chans; c++) ci[o * chans + c] = ws > 0 ? acc[c] / ws : 0;
  }
  pushPull(ci, cw, w2, h2, chans);
  // 插回来：本级没权重的地方用上一级（双线性）补
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, w = weight[i];
    if (w >= 1) continue;
    const fx = Math.min(w2 - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(h2 - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w2 - 1, x0 + 1), y1 = Math.min(h2 - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    for (let c = 0; c < chans; c++) {
      const v = (ci[(y0 * w2 + x0) * chans + c] * (1 - ax) + ci[(y0 * w2 + x1) * chans + c] * ax) * (1 - ay)
        + (ci[(y1 * w2 + x0) * chans + c] * (1 - ax) + ci[(y1 * w2 + x1) * chans + c] * ax) * ay;
      img[i * chans + c] = img[i * chans + c] * w + v * (1 - w);
    }
  }
  return img;
}

// —— 盖住的地方保留原色，没盖住的地方往外填（RGBA Uint8，alpha 不动）——
export function edgePad(rgba, W, H, mask) {
  const img = new Float32Array(W * H * 3), wt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { wt[i] = mask[i] ? 1 : 0; for (let c = 0; c < 3; c++) img[i * 3 + c] = rgba[i * 4 + c]; }
  pushPull(img, wt, W, H, 3);
  for (let i = 0; i < W * H; i++) if (!mask[i]) for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(Math.min(255, Math.max(0, img[i * 3 + c])));
  return rgba;
}

// —— 去标志 ——
// box：[x0, y0, x1, y1]（像素）里和“布的颜色”差得多的像素当作标志（再往外扩 grow 个像素）；
// 从偏移 (dx, dy) 的地方搬布过来，边界上原图和搬来的布的差值平滑地扩散进去，明暗、褶皱就接上了
export function removeLogo(rgba, W, H, { box, from, tol = 38, grow = 5 }) {
  const [x0, y0, x1, y1] = box, [dx, dy] = from;
  const bw = x1 - x0, bh = y1 - y0;
  // 布的颜色：框里所有像素的中位数（标志只占一部分）
  const med = [0, 1, 2].map((c) => { const v = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(rgba[(y * W + x) * 4 + c]); v.sort((a, b) => a - b); return v[v.length >> 1]; });
  let m = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = ((y + y0) * W + x + x0) * 4;
    const d = Math.hypot(rgba[i] - med[0], rgba[i + 1] - med[1], rgba[i + 2] - med[2]);
    if (d > tol) m[y * bw + x] = 1;
  }
  for (let g = 0; g < grow; g++) {
    const n = m.slice();
    for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) if (!m[y * bw + x] && (m[y * bw + x - 1] || m[y * bw + x + 1] || m[(y - 1) * bw + x] || m[(y + 1) * bw + x])) n[y * bw + x] = 1;
    m = n;
  }
  // 差值：标志外（框内）= 原图 - 搬来的布；标志里未知，用 push-pull 从外面扩散进去
  const diff = new Float32Array(bw * bh * 3), wt = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const o = y * bw + x;
    if (m[o]) continue;
    const i = ((y + y0) * W + x + x0) * 4, j = ((y + y0 + dy) * W + x + x0 + dx) * 4;
    for (let c = 0; c < 3; c++) diff[o * 3 + c] = rgba[i + c] - rgba[j + c];
    wt[o] = 1;
  }
  pushPull(diff, wt, bw, bh, 3);
  // 标志的边缘羽化一点（离标志外缘近的地方原图和补丁按比例混）
  let removed = 0;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const o = y * bw + x;
    if (!m[o]) continue;
    const i = ((y + y0) * W + x + x0) * 4, j = ((y + y0 + dy) * W + x + x0 + dx) * 4;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(Math.min(255, Math.max(0, rgba[j + c] + diff[o * 3 + c])));
    removed++;
  }
  return removed;
}

// —— 头发流向图 ——
// 结构张量 J = G * (∇L ∇Lᵀ)（按 alpha 加权），主梯度方向 φ = ½·atan2(2Jxy, Jxx − Jyy)，发丝方向和它垂直。
// 输出 RGB：R、G = ½ + ½·c·(cos 2θ, sin 2θ)（θ 是 UV 空间里发丝的方向，v 朝上；用二倍角存，双线性插值不会把相反方向抵消），
// c 是一致性（发丝清楚的地方接近 1，卷发、背景接近 0）；B = alpha
export function flowMap(rgba, W, H, { sigma = 4, wide = 14 } = {}) {
  const L = new Float32Array(W * H), A = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { L[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255; A[i] = rgba[i * 4 + 3] / 255; }
  blur(L, W, H, 0.8);
  const jxx = new Float32Array(W * H), jxy = new Float32Array(W * H), jyy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    // Sobel
    const gx = (L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1]) - (L[i - W - 1] + 2 * L[i - 1] + L[i + W - 1]);
    const gy = (L[i + W - 1] + 2 * L[i + W] + L[i + W + 1]) - (L[i - W - 1] + 2 * L[i - W] + L[i - W + 1]);
    const a = A[i];
    jxx[i] = gx * gx * a; jxy[i] = gx * gy * a; jyy[i] = gy * gy * a;
  }
  const big = [jxx.slice(), jxy.slice(), jyy.slice()];
  for (const t of [jxx, jxy, jyy]) blur(t, W, H, sigma);
  for (const t of big) blur(t, W, H, wide);
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    // 小尺度不够确定的地方（发丝边缘、背景）退到大尺度的方向
    let xx = jxx[i], xy = jxy[i], yy = jyy[i];
    const tr = xx + yy, trB = big[0][i] + big[2][i];
    let coh = tr > 1e-6 ? Math.hypot(xx - yy, 2 * xy) / tr : 0;
    const cohB = trB > 1e-6 ? Math.hypot(big[0][i] - big[2][i], 2 * big[1][i]) / trB : 0;
    if (coh < cohB * 0.8) { xx = big[0][i]; xy = big[1][i]; yy = big[2][i]; coh = cohB * 0.9; }
    const n = Math.hypot(xx - yy, 2 * xy) || 1;
    const c2 = (xx - yy) / n, s2 = (2 * xy) / n; // (cos 2φ, sin 2φ)，φ 是像素坐标（y 朝下）里梯度的方向
    // 发丝方向 θ = φ + 90°，换到 UV（v 朝上）：θuv = −θ → (cos 2θuv, sin 2θuv) = (−cos 2φ, sin 2φ)
    const k = Math.min(1, coh * 1.4);
    out[i * 3] = Math.round(127.5 + 127.5 * k * -c2);
    out[i * 3 + 1] = Math.round(127.5 + 127.5 * k * s2);
    out[i * 3 + 2] = rgba[i * 4 + 3];
  }
  return out;
}
