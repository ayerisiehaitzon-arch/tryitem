// 头发的自遮挡（构建时烘焙，每个顶点一个 0~1 的数）：
// 把头发片按贴图的 alpha 加权“撒”进一个 5mm 的体素格子，当成一团半透明的云；头和身体也撒进去（不透光）。
// 每个顶点朝外（背对头的中心）的半球打 24 条射线，一步步累积光学厚度 τ，透过率 e^(−τ) 的平均值就是它能“看到”多少天空。
// 里层的发片被外层挡住，就暗下来，头发才有体积感。发型贴合到不同体型上只是整体缩放，烘焙一次就够。

// 可重复的伪随机数（构建结果要逐字节一样）
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// pos：代理顶点（米，nv×3）；index / map / uv：渲染网格（index 指向渲染顶点，map 把渲染顶点映到代理顶点）；
// alphaAt(u, v) → 0~1；body：{ pos, index }（身体三角形，米）；center：头的中心
export function hairAO({ pos, index, map, uv, alphaAt, body, center, voxel = 0.005, reach = 0.12, rays = 24, density = 1.15 }) {
  const nv = pos.length / 3;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i * 3 + a]); hi[a] = Math.max(hi[a], pos[i * 3 + a]); }
  lo = lo.map((x) => x - reach - voxel * 2); hi = hi.map((x) => x + reach + voxel * 2);
  const N = lo.map((l, a) => Math.ceil((hi[a] - l) / voxel) + 1);
  const grid = new Float32Array(N[0] * N[1] * N[2]);
  const at = (x, y, z) => (z * N[1] + y) * N[0] + x;
  // 三线性地撒一个样本
  const splat = (px, py, pz, w) => {
    const fx = (px - lo[0]) / voxel, fy = (py - lo[1]) / voxel, fz = (pz - lo[2]) / voxel;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    if (x0 < 0 || y0 < 0 || z0 < 0 || x0 >= N[0] - 1 || y0 >= N[1] - 1 || z0 >= N[2] - 1) return;
    const ax = fx - x0, ay = fy - y0, az = fz - z0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
      grid[at(x0 + dx, y0 + dy, z0 + dz)] += w * (dx ? ax : 1 - ax) * (dy ? ay : 1 - ay) * (dz ? az : 1 - az);
    }
  };
  const rand = rng(1234567);
  // 一个三角形按面积撒样本：每个样本带 alpha × 面积 / 体素截面积（一片完全不透明的发片穿过一个体素，τ 正好加 1）
  const spray = (p0, p1, p2, alpha, opacity) => {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const area = 0.5 * Math.hypot(cx, cy, cz);
    if (area < 1e-10) return;
    const n = Math.max(1, Math.ceil(area / (voxel * voxel * 0.25)));
    for (let s = 0; s < n; s++) {
      let r1 = rand(), r2 = rand();
      if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      const a = alpha(r1, r2);
      if (a <= 0.01) continue;
      splat(p0[0] + e1[0] * r1 + e2[0] * r2, p0[1] + e1[1] * r1 + e2[1] * r2, p0[2] + e1[2] * r1 + e2[2] * r2, (a * opacity * area) / n / (voxel * voxel));
    }
  };
  const P = (i) => [pos[map[i] * 3], pos[map[i] * 3 + 1], pos[map[i] * 3 + 2]];
  for (let t = 0; t < index.length; t += 3) {
    const i0 = index[t], i1 = index[t + 1], i2 = index[t + 2];
    spray(P(i0), P(i1), P(i2), (r1, r2) => {
      const u = uv[i0 * 2] + (uv[i1 * 2] - uv[i0 * 2]) * r1 + (uv[i2 * 2] - uv[i0 * 2]) * r2;
      const v = uv[i0 * 2 + 1] + (uv[i1 * 2 + 1] - uv[i0 * 2 + 1]) * r1 + (uv[i2 * 2 + 1] - uv[i0 * 2 + 1]) * r2;
      return alphaAt(u, v);
    }, 1);
  }
  // 身体：只撒在格子范围里的三角形，不透光
  const B = (i) => [body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]];
  for (let t = 0; t < body.index.length; t += 3) {
    const p0 = B(body.index[t]), p1 = B(body.index[t + 1]), p2 = B(body.index[t + 2]);
    if ([p0, p1, p2].every((p) => p.some((x, a) => x < lo[a] || x > hi[a]))) continue;
    spray(p0, p1, p2, () => 1, 4);
  }
  // 顶点法线（按面积加权），朝外：背对头的中心
  const nrm = new Float32Array(nv * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = map[index[t]], b = map[index[t + 1]], c = map[index[t + 2]];
    const e1 = [0, 1, 2].map((k) => pos[b * 3 + k] - pos[a * 3 + k]), e2 = [0, 1, 2].map((k) => pos[c * 3 + k] - pos[a * 3 + k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nrm[v * 3 + k] += n[k];
  }
  // 半球上均匀分布的方向（斐波那契螺旋，按余弦加权）
  const dirs = [];
  for (let k = 0; k < rays; k++) {
    const r = Math.sqrt((k + 0.5) / rays), phi = k * 2.399963229728653;
    dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r)]);
  }
  const sample = (px, py, pz) => {
    const fx = (px - lo[0]) / voxel, fy = (py - lo[1]) / voxel, fz = (pz - lo[2]) / voxel;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    if (x0 < 0 || y0 < 0 || z0 < 0 || x0 >= N[0] - 1 || y0 >= N[1] - 1 || z0 >= N[2] - 1) return 0;
    const ax = fx - x0, ay = fy - y0, az = fz - z0;
    let s = 0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
      s += grid[at(x0 + dx, y0 + dy, z0 + dz)] * (dx ? ax : 1 - ax) * (dy ? ay : 1 - ay) * (dz ? az : 1 - az);
    }
    return s;
  };
  const step = voxel * 0.5, steps = Math.ceil(reach / step);
  const ao = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    let n = [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]];
    let l = Math.hypot(...n);
    const out = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
    if (l < 1e-12) { n = out; l = Math.hypot(...n) || 1; }
    n = n.map((x) => x / l);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = n.map((x) => -x);
    // 以 n 为 z 轴的正交基
    const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let tx = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
    const tl = Math.hypot(...tx); tx = tx.map((x) => x / tl);
    const ty = [n[1] * tx[2] - n[2] * tx[1], n[2] * tx[0] - n[0] * tx[2], n[0] * tx[1] - n[1] * tx[0]];
    let vis = 0;
    for (const d of dirs) {
      const w = [0, 1, 2].map((k) => tx[k] * d[0] + ty[k] * d[1] + n[k] * d[2]);
      // 从自己那一片外面一点开始走，不算自己
      let x = p[0] + n[0] * voxel * 1.5, y = p[1] + n[1] * voxel * 1.5, z = p[2] + n[2] * voxel * 1.5, tau = 0;
      for (let s = 0; s < steps && tau < 6; s++) { x += w[0] * step; y += w[1] * step; z += w[2] * step; tau += sample(x, y, z) * (step / voxel); }
      vis += Math.exp(-density * tau);
    }
    ao[i] = vis / rays;
  }
  // 归一化：最外层（第 95 百分位）算 1
  const sorted = Array.from(ao).sort((a, b) => a - b), ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
  const out8 = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) out8[i] = Math.round(Math.min(1, ao[i] / ref) * 255);
  return out8;
}
