import { parentPort, workerData } from 'node:worker_threads';
import { intersect } from './bvh.js';

// 每个样本：位置 p、着色法线 n、几何法线 g。
// surface 模式：返回 AO（1 = 完全不遮挡）；shadow 模式：返回“未遮挡比例”。
const { bvh, jobs, opts, seed } = workerData;
const { samples, maxDist, floor } = opts;
const count = jobs.length / 9;
const out = new Float32Array(count);
const stack = new Int32Array(256);

// Hammersley 低差异序列 + 每个纹素随机旋转（Cranley-Patterson）
const H = [];
for (let i = 0; i < samples; i++) {
  let bits = i, r = 0, f = 0.5;
  while (bits) { if (bits & 1) r += f; bits >>= 1; f *= 0.5; }
  H.push([(i + 0.5) / samples, r]);
}
let s = (seed * 2654435761) >>> 0 || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };

for (let j = 0; j < count; j++) {
  const o = j * 9;
  const px = jobs[o], py = jobs[o + 1], pz = jobs[o + 2];
  const nx = jobs[o + 3], ny = jobs[o + 4], nz = jobs[o + 5];
  const gx = jobs[o + 6], gy = jobs[o + 7], gz = jobs[o + 8];
  // 切线基
  let tx, ty, tz;
  if (Math.abs(nx) < 0.9) { tx = 0; ty = nz; tz = -ny; } else { tx = -nz; ty = 0; tz = nx; }
  let l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  const ox = px + gx * 2e-4, oy = py + gy * 2e-4, oz = pz + gz * 2e-4;
  const r1 = rnd(), r2 = rnd();
  let occ = 0;
  for (let i = 0; i < samples; i++) {
    const u1 = (H[i][0] + r1) % 1, u2 = (H[i][1] + r2) % 1;
    const r = Math.sqrt(u1), phi = 2 * Math.PI * u2;
    const a = r * Math.cos(phi), b = r * Math.sin(phi), c = Math.sqrt(Math.max(0, 1 - u1));
    let dx = tx * a + bx * b + nx * c, dy = ty * a + by * b + ny * c, dz = tz * a + bz * b + nz * c;
    const dg = dx * gx + dy * gy + dz * gz;
    if (dg < 0) { dx -= 2 * dg * gx; dy -= 2 * dg * gy; dz -= 2 * dg * gz; }
    let t = intersect(bvh, ox, oy, oz, dx, dy, dz, maxDist, stack);
    if (floor && dy < -1e-6) {
      const tf = -oy / dy;
      if (tf > 0 && tf < t) t = tf;
    }
    if (t < maxDist) {
      const k = t / maxDist;
      occ += 1 - k * k;
    }
  }
  out[j] = 1 - occ / samples;
}
parentPort.postMessage(out, [out.buffer]);
