// AO 烘焙：把环境光遮蔽烘焙进每件家具独有的 UV1 图集；
// 再烘焙一张贴地的软阴影（接触阴影贴花）。
//
// 流程：UV1 空间保守光栅化 → 每个纹素算出世界坐标/法线 → worker 并行发射余弦分布射线
//      → 距离衰减的遮蔽 → 按图块做掩码模糊 → 向外膨胀填充 padding（防止 mip 接缝）
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { buildBVH, intersect } from './bvh.js';
import { MATERIALS } from '../materials/library.js';

const WORKER = new URL('./ao-worker.js', import.meta.url);

// 遮挡体：透明裁剪（alphaMode MASK）的面片不算 —— 流苏这种“一张卡片上画的细线”
// 如果当成实心面去挡光，会在地毯边和地面上压出一整条黑影
function gatherTris(lod) {
  const prims = lod.prims.filter((pr) => MATERIALS[pr.mat]?.alphaMode !== 'MASK');
  let n = 0;
  for (const pr of prims) n += pr.index.length / 3;
  const tris = new Float32Array(n * 9);
  let o = 0;
  for (const pr of prims) {
    const P = pr.position, I = pr.index;
    for (let i = 0; i < I.length; i++) {
      const v = I[i] * 3;
      tris[o++] = P[v]; tris[o++] = P[v + 1]; tris[o++] = P[v + 2];
    }
  }
  return tris;
}

// 在 worker 池里跑射线。jobs: Float32Array，每个样本 9 个数（位置、着色法线、几何法线）
async function trace(bvh, jobs, opts) {
  const count = jobs.length / 9;
  const nw = Math.max(1, Math.min(os.cpus().length, 8, Math.ceil(count / 2000)));
  const out = new Float32Array(count);
  const per = Math.ceil(count / nw);
  await Promise.all(Array.from({ length: nw }, (_, w) => new Promise((resolve, reject) => {
    const a = w * per, b = Math.min(count, a + per);
    if (a >= b) return resolve();
    const worker = new Worker(WORKER, {
      workerData: { bvh, jobs: jobs.slice(a * 9, b * 9), opts, seed: a },
    });
    worker.once('message', (res) => { out.set(res, a); worker.terminate(); resolve(); });
    worker.once('error', reject);
  })));
  return out;
}

export async function bakeAO(lod, layout, { samples = 160, maxDist = 0.32, floor = true, power = 1.0, blur = 1 } = {}) {
  const S = layout.size;
  const bvh = buildBVH(gatherTris(lod));
  // 每个纹素属于哪个图块（图块矩形含 padding，互不重叠）
  const chartId = new Int32Array(S * S).fill(-1);
  const rects = Object.values(layout.rects);
  rects.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) chartId[y * S + x] = i;
  });

  // —— 保守光栅化 ——
  const best = new Float32Array(S * S).fill(Infinity); // 纹素中心到三角形的距离（像素）
  const pos = new Float32Array(S * S * 3), nrm = new Float32Array(S * S * 3), gn = new Float32Array(S * S * 3);
  for (const pr of lod.prims) {
    const P = pr.position, N = pr.normal, T = pr.uv1, I = pr.index;
    for (let t = 0; t < I.length; t += 3) {
      const ia = I[t], ib = I[t + 1], ic = I[t + 2];
      const ax = T[ia * 2] * S, ay = T[ia * 2 + 1] * S;
      const bx = T[ib * 2] * S, by = T[ib * 2 + 1] * S;
      const cx = T[ic * 2] * S, cy = T[ic * 2 + 1] * S;
      // 几何法线
      const e1 = [P[ib * 3] - P[ia * 3], P[ib * 3 + 1] - P[ia * 3 + 1], P[ib * 3 + 2] - P[ia * 3 + 2]];
      const e2 = [P[ic * 3] - P[ia * 3], P[ic * 3 + 1] - P[ia * 3 + 1], P[ic * 3 + 2] - P[ia * 3 + 2]];
      let g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const gl = Math.hypot(g[0], g[1], g[2]);
      if (gl < 1e-14) continue;
      g = [g[0] / gl, g[1] / gl, g[2] / gl];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx) + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy) + 1));
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const degenerate = Math.abs(area) < 1e-10;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let u, v, w, d;
        if (!degenerate) {
          w = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / area;
          v = ((px - ax) * (cy - ay) - (py - ay) * (cx - ax)) / area;
          u = 1 - v - w;
          if (u >= 0 && v >= 0 && w >= 0) d = 0;
        }
        if (d === undefined) {
          // 最近点（保守光栅化：离三角形 0.75 像素以内的纹素也写入）
          const c = closestOnTri(px, py, ax, ay, bx, by, cx, cy);
          d = c.d;
          if (d > 0.75) continue;
          u = c.u; v = c.v; w = c.w;
        }
        const idx = y * S + x;
        if (d >= best[idx]) continue;
        best[idx] = d;
        for (let k = 0; k < 3; k++) {
          pos[idx * 3 + k] = u * P[ia * 3 + k] + v * P[ib * 3 + k] + w * P[ic * 3 + k];
          nrm[idx * 3 + k] = u * N[ia * 3 + k] + v * N[ib * 3 + k] + w * N[ic * 3 + k];
          gn[idx * 3 + k] = g[k];
        }
      }
    }
  }
  const texels = [];
  for (let i = 0; i < S * S; i++) if (best[i] < Infinity) texels.push(i);
  const jobs = new Float32Array(texels.length * 9);
  texels.forEach((idx, j) => {
    let nx = nrm[idx * 3], ny = nrm[idx * 3 + 1], nz = nrm[idx * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    jobs.set([pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2], nx / l, ny / l, nz / l, gn[idx * 3], gn[idx * 3 + 1], gn[idx * 3 + 2]], j * 9);
  });
  const ao = await trace(bvh, jobs, { samples, maxDist, floor, mode: 'surface' });

  // —— 写入图像、按图块掩码模糊、膨胀 ——
  let img = new Float32Array(S * S).fill(-1);
  texels.forEach((idx, j) => { img[idx] = Math.pow(ao[j], power); });
  for (let b = 0; b < blur; b++) img = maskedBlur(img, chartId, S);
  img = dilate(img, chartId, S, Math.max(4, layout.pad * 2));
  const px = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) px[i] = Math.round(255 * Math.max(0, Math.min(1, img[i] < 0 ? 1 : img[i])));
  const data = await sharp(Buffer.from(px), { raw: { width: S, height: S, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
  return { data, mime: 'image/png', size: S };
}

// 贴地软阴影：物体投影范围外扩一圈，纹素向上半球发射射线
export async function bakeShadow(lod, { samples = 256, maxDist = 1.2, margin = null, density = 90, strength = 0.9, gamma = 0.9 } = {}) {
  const { min, max } = lod.bounds;
  const size = Math.max(max[0] - min[0], max[2] - min[2]);
  const m = margin ?? Math.max(0.18, 0.22 * size);
  const x0 = min[0] - m, x1 = max[0] + m, z0 = min[2] - m, z1 = max[2] + m;
  const pot = (v) => Math.min(256, Math.max(32, 2 ** Math.round(Math.log2(v))));
  const W = pot((x1 - x0) * density), H = pot((z1 - z0) * density);
  const bvh = buildBVH(gatherTris(lod));
  const jobs = new Float32Array(W * H * 9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const wx = x0 + ((x + 0.5) / W) * (x1 - x0), wz = z0 + ((y + 0.5) / H) * (z1 - z0);
    jobs.set([wx, 0.0005, wz, 0, 1, 0, 0, 1, 0], i * 9);
  }
  const occ = await trace(bvh, jobs, { samples, maxDist, floor: false, mode: 'shadow' });
  const rgba = new Uint8Array(W * H * 4);
  const stack = new Int32Array(256);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    // 边缘淡出，保证贴花边界完全透明
    const ex = Math.min(x + 0.5, W - x - 0.5) / (W * 0.12), ey = Math.min(y + 0.5, H - y - 0.5) / (H * 0.12);
    const fade = smooth(Math.min(1, ex)) * smooth(Math.min(1, ey));
    // 物体自己贴地盖住的地方（正上方 4cm 内就是它的底面，比如地毯）根本看不见地面，贴花在这里完全透明；
    // 否则远看时贴花会借着 polygonOffset 从薄薄的物体底下“透”上来
    const covered = intersect(bvh, jobs[i * 9], 0.0005, jobs[i * 9 + 2], 1e-9, 1, 1e-9, 0.04, stack) < 0.04;
    const a = covered ? 0 : strength * Math.pow(1 - occ[i], gamma) * fade;
    rgba[i * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
  }
  const data = await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { rect: { x0, x1, z0, z1 }, img: { data, mime: 'image/png' }, size: [W, H] };
}

const smooth = (t) => t * t * (3 - 2 * t);

function closestOnTri(px, py, ax, ay, bx, by, cx, cy) {
  // 分别到三条边的最近点，取最近者，返回重心坐标
  let bestD = Infinity, res = null;
  const edges = [[ax, ay, bx, by, 0, 1], [bx, by, cx, cy, 1, 2], [cx, cy, ax, ay, 2, 0]];
  for (const [x0, y0, x1, y1, i, j] of edges) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = dx * dx + dy * dy;
    let t = L > 0 ? ((px - x0) * dx + (py - y0) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + dx * t, qy = y0 + dy * t;
    const d = Math.hypot(px - qx, py - qy);
    if (d < bestD) {
      bestD = d;
      const bc = [0, 0, 0];
      bc[i] = 1 - t; bc[j] = t;
      res = { d, u: bc[0], v: bc[1], w: bc[2] };
    }
  }
  return res;
}

function maskedBlur(img, chartId, S) {
  const out = new Float32Array(img.length);
  const K = [1, 2, 1];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (img[i] < 0) { out[i] = -1; continue; }
    let s = 0, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
      const j = yy * S + xx;
      if (img[j] < 0 || chartId[j] !== chartId[i]) continue;
      const k = K[dx + 1] * K[dy + 1];
      s += img[j] * k; w += k;
    }
    out[i] = s / w;
  }
  return out;
}

function dilate(img, chartId, S, iters) {
  let cur = img;
  for (let it = 0; it < iters; it++) {
    const next = new Float32Array(cur);
    let changed = false;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (cur[i] >= 0) continue;
      let s = 0, w = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
        const j = yy * S + xx;
        if (cur[j] < 0) continue;
        if (chartId[i] >= 0 && chartId[j] !== chartId[i]) continue;
        s += cur[j]; w++;
      }
      if (w) { next[i] = s / w; changed = true; }
    }
    cur = next;
    if (!changed) break;
  }
  return cur;
}
