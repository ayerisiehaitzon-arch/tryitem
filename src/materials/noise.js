// 可平铺（周期性）噪声：梯度噪声、fBm、Worley。所有函数在 [0, period) 上首尾相接，
// 生成的贴图可以无缝重复。

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a, n) => ((a % n) + n) % n;

// 整数哈希（任意周期都能用，不受 256 置换表限制）
function ihash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function perlin(seed = 1) {
  const gx = new Float32Array(256), gy = new Float32Array(256);
  const r = mulberry(seed);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  // 周期 px, py（正整数）
  return (x, y, px = 4096, py = 4096) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = mod(xi, px), x1 = mod(xi + 1, px), y0 = mod(yi, py), y1 = mod(yi + 1, py);
    const h00 = ihash(x0, y0, seed) & 255, h10 = ihash(x1, y0, seed) & 255;
    const h01 = ihash(x0, y1, seed) & 255, h11 = ihash(x1, y1, seed) & 255;
    const d00 = gx[h00] * xf + gy[h00] * yf;
    const d10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const d01 = gx[h01] * xf + gy[h01] * (yf - 1);
    const d11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = fade(xf), v = fade(yf);
    const a = d00 + (d10 - d00) * u, b = d01 + (d11 - d01) * u;
    return (a + (b - a) * v) * 1.41;
  };
}

// fBm：u, v ∈ [0,1)，fx, fy 为基础频率（整数 → 可平铺）
export function fbm(noise, u, v, fx, fy, oct = 5, gain = 0.5, lac = 2) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    const px = Math.round(fx * f), py = Math.round(fy * f);
    s += a * noise(u * px, v * py, px, py);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

// 周期 Worley：返回 {f1, f2, id}，距离以格子为单位
export function worley(seed = 1) {
  const r = mulberry(seed);
  const N = 4096;
  const jx = new Float32Array(N), jy = new Float32Array(N), jid = new Float32Array(N);
  for (let i = 0; i < N; i++) { jx[i] = r(); jy[i] = r(); jid[i] = r(); }
  return (x, y, px, py) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const h = ihash(mod(cx, px), mod(cy, py), seed) & (N - 1);
      const fx = cx + jx[h] - x, fy = cy + jy[h] - y;
      const d = Math.sqrt(fx * fx + fy * fy);
      if (d < f1) { f2 = f1; f1 = d; id = jid[h]; } else if (d < f2) f2 = d;
    }
    return { f1, f2, id };
  };
}

// 一维可平铺噪声（给纱线粗细、木板差异用）
export function noise1(noise, t, period, row = 0) {
  return noise(t, row + 0.5, period, 256);
}
