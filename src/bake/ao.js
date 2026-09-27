// AO 烘焙：把环境光遮蔽烘焙进每件家具独有的 UV1 图集；
// 再烘焙贴在安装面上的两张贴花：软阴影（接触阴影）和灯具的光斑（从灯泡位置算直射光）。
//
// 流程：UV1 空间保守光栅化 → 每个纹素算出世界坐标/法线 → worker 并行发射余弦分布射线
//      → 距离衰减的遮蔽 → 按图块做掩码模糊 → 向外膨胀填充 padding（防止 mip 接缝）
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { buildBVH, intersect, lastFront } from './bvh.js';
import { MATERIALS } from '../materials/library.js';
import { MOUNTS, onPlane } from '../core/mount.js';

const WORKER = new URL('./ao-worker.js', import.meta.url);

// 遮挡体：透明裁剪（alphaMode MASK）的面片不算 —— 流苏这种“一张卡片上画的细线”
// 如果当成实心面去挡光，会在地毯边和地面上压出一整条黑影
function gatherTris(lod, keep = () => true) {
  const prims = lod.prims.filter((pr) => MATERIALS[pr.mat]?.alphaMode !== 'MASK' && keep(pr.mat));
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

// plane：安装面的法线（地面 [0,1,0]、墙面 [0,0,1]、天花板 [0,-1,0]），null 表示不算安装面的遮挡
export async function bakeAO(lod, layout, { samples = 160, maxDist = 0.32, plane = [0, 1, 0], power = 1.0, blur = 1 } = {}) {
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
  const ao = await trace(bvh, jobs, { samples, maxDist, plane, mode: 'surface' });

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

// 安装面上的软阴影：物体投影范围外扩一圈，纹素向物体一侧的半球发射射线
const pot = (v) => Math.min(256, Math.max(32, 2 ** Math.round(Math.log2(v))));

export async function bakeShadow(lod, { plane = 'floor', samples = 256, maxDist = 1.2, margin = null, density = 90, strength = 0.9, gamma = 0.9, fade: fadeW = 0.12 } = {}) {
  const M = MOUNTS[plane];
  const { min, max } = lod.bounds;
  const size = Math.max(max[M.u] - min[M.u], max[M.v] - min[M.v]);
  const m = margin ?? Math.max(0.18, 0.22 * size);
  const u0 = min[M.u] - m, u1 = max[M.u] + m, v0 = min[M.v] - m, v1 = max[M.v] + m;
  const W = pot((u1 - u0) * density), H = pot((v1 - v0) * density);
  const bvh = buildBVH(gatherTris(lod));
  const jobs = new Float32Array(W * H * 9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = onPlane(M, u0 + ((x + 0.5) / W) * (u1 - u0), v0 + ((y + 0.5) / H) * (v1 - v0), 0.0005);
    jobs.set([...p, ...M.n, ...M.n], (y * W + x) * 9);
  }
  const occ = await trace(bvh, jobs, { samples, maxDist, plane: null, mode: 'shadow' });
  const rgba = new Uint8Array(W * H * 4);
  const stack = new Int32Array(256);
  const [nx, ny, nz] = M.n.map((c) => c || 1e-9);
  // 物体自己贴着安装面盖住的地方（法线方向 4cm 内是它的“里面”，比如地毯）根本看不见，贴花在这里完全透明，
  // 否则远看时贴花会借着 polygonOffset 从薄薄的物体底下“透”上来。只认背面命中：
  // 花瓶、灯座那种外翻的圈足，底下是朝下的正面，那一圈依然是最暗的接触阴影。
  // 掩码再向里收 2 个纹素：物体边缘那一圈纹素保留阴影，不会在轮廓外露出一圈锯齿状的亮缝
  const cov = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    cov[i] = intersect(bvh, jobs[i * 9], jobs[i * 9 + 1], jobs[i * 9 + 2], nx, ny, nz, 0.04, stack) < 0.04 && !lastFront ? 1 : 0;
  }
  const covered = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || !cov[yy * W + xx]) return false;
    }
    return true;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    // 边缘淡出，保证贴花边界完全透明
    const ex = Math.min(x + 0.5, W - x - 0.5) / (W * fadeW), ey = Math.min(y + 0.5, H - y - 0.5) / (H * fadeW);
    const fade = smooth(Math.min(1, ex)) * smooth(Math.min(1, ey));
    const a = covered(x, y) ? 0 : strength * Math.pow(1 - occ[i], gamma) * fade;
    rgba[i * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
  }
  const data = await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { plane, rect: { u0, u1, v0, v1 }, img: { data, mime: 'image/png' }, size: [W, H] };
}

// 灯具的光斑：把灯泡当作一个小球光源，算它照在安装面（桌面 / 墙面 / 地面）上的直射光。
//   · 不透光的部件（灯座、金属臂）挡住光，留下影子；灯罩这类半透明材质按 transmit 打折（亚麻约 0.3）；
//   · 发光体本身（灯泡、乳白玻璃）不挡光；
//   · 贴花只覆盖光源附近 radius 的范围，边缘淡出 —— 放在小床头柜上也不会伸出桌边。
// 结果是一张只有 alpha 的贴图，颜色由材质给（暖白），预览器里用加法混合叠在表面上。
export async function bakeGlow(lod, { plane = 'floor', light, lightRadius = 0.02, radius = 0.3, center = null, transmit = {}, density = 200, samples = 64, strength = 0.7, gamma = 0.8 } = {}) {
  const M = MOUNTS[plane];
  const cu = center ? center[0] : light[M.u], cv = center ? center[1] : light[M.v];
  const u0 = cu - radius, u1 = cu + radius, v0 = cv - radius, v1 = cv + radius;
  const W = pot(2 * radius * density), H = W;
  const tOf = (mat) => (MATERIALS[mat]?.emissive && transmit[mat] === undefined ? 1 : transmit[mat] ?? 0);
  const opaque = buildBVH(gatherTris(lod, (mat) => tOf(mat) === 0));
  const layers = [...new Set(lod.prims.map((pr) => tOf(pr.mat)).filter((t) => t > 0 && t < 1))]
    .map((t) => ({ t, bvh: buildBVH(gatherTris(lod, (mat) => tOf(mat) === t)) }));
  const stack = new Int32Array(256);
  const [nx, ny, nz] = M.n.map((c) => c || 1e-9);
  // 光源上的采样点（球内均匀，固定序列 → 每次构建结果一致）
  const pts = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  while (pts.length < samples) {
    const q = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
    if (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] <= 1) pts.push(q.map((c, k) => light[k] + c * lightRadius));
  }
  const E = new Float32Array(W * H);
  let peak = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const p = onPlane(M, u0 + ((x + 0.5) / W) * (u1 - u0), v0 + ((y + 0.5) / H) * (v1 - v0), 0.0005);
    // 正上方（沿法线）是不透光的部件 → 这里在灯座底下或它的正下方，一律算暗（灯座是空心的，不能让光从里面漏下来）
    if (intersect(opaque, p[0], p[1], p[2], nx, ny, nz, 10, stack) < 10) { E[i] = -1; continue; }
    let e = 0;
    for (const L of pts) {
      let dx = L[0] - p[0], dy = L[1] - p[1], dz = L[2] - p[2];
      const d = Math.hypot(dx, dy, dz);
      dx /= d; dy /= d; dz /= d;
      const cos = dx * M.n[0] + dy * M.n[1] + dz * M.n[2];
      if (cos <= 0) continue;
      if (intersect(opaque, p[0], p[1], p[2], dx || 1e-9, dy || 1e-9, dz || 1e-9, d, stack) < d) continue;
      let vis = 1;
      for (const g of layers) if (intersect(g.bvh, p[0], p[1], p[2], dx || 1e-9, dy || 1e-9, dz || 1e-9, d, stack) < d) vis *= g.t;
      e += (cos * vis) / (d * d);
    }
    E[i] = e / pts.length;
    peak = Math.max(peak, E[i]);
  }
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const du = (x + 0.5) / W - 0.5, dv = (y + 0.5) / H - 0.5;
    const fade = smooth(Math.min(1, Math.max(0, (0.5 - Math.hypot(du, dv)) / 0.16)));
    const a = E[i] < 0 ? 0 : strength * Math.pow(E[i] / (peak || 1), gamma) * fade;
    rgba.set([255, 255, 255, Math.round(255 * Math.max(0, Math.min(1, a)))], i * 4);
  }
  const data = await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { plane, rect: { u0, u1, v0, v1 }, img: { data, mime: 'image/png' }, size: [W, H] };
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
