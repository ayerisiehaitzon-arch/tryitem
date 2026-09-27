// 极简 BVH（中位数切分）+ 最近交点查询。全部使用 TypedArray，便于在 worker 间传递。

export function buildBVH(tris /* Float32Array, 9 floats per tri */) {
  const n = tris.length / 9;
  const cent = new Float32Array(n * 3);
  const bmin = new Float32Array(n * 3), bmax = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const v0 = tris[i * 9 + a], v1 = tris[i * 9 + 3 + a], v2 = tris[i * 9 + 6 + a];
      bmin[i * 3 + a] = Math.min(v0, v1, v2);
      bmax[i * 3 + a] = Math.max(v0, v1, v2);
      cent[i * 3 + a] = (v0 + v1 + v2) / 3;
    }
  }
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const nodes = []; // {min, max, left, right, start, count}
  const LEAF = 4;
  function build(start, end) {
    const node = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], left: -1, right: -1, start, count: 0 };
    const cmin = [Infinity, Infinity, Infinity], cmax = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const t = order[i];
      for (let a = 0; a < 3; a++) {
        node.min[a] = Math.min(node.min[a], bmin[t * 3 + a]);
        node.max[a] = Math.max(node.max[a], bmax[t * 3 + a]);
        cmin[a] = Math.min(cmin[a], cent[t * 3 + a]);
        cmax[a] = Math.max(cmax[a], cent[t * 3 + a]);
      }
    }
    const idx = nodes.length;
    nodes.push(node);
    if (end - start <= LEAF) { node.count = end - start; return idx; }
    let axis = 0;
    for (let a = 1; a < 3; a++) if (cmax[a] - cmin[a] > cmax[axis] - cmin[axis]) axis = a;
    const sub = Array.from(order.subarray(start, end));
    sub.sort((p, q) => cent[p * 3 + axis] - cent[q * 3 + axis]);
    order.set(sub, start);
    const mid = (start + end) >> 1;
    node.left = build(start, mid);
    node.right = build(mid, end);
    return idx;
  }
  build(0, n);
  const bounds = new Float32Array(nodes.length * 6);
  const meta = new Int32Array(nodes.length * 3); // left/right or start,count
  nodes.forEach((nd, i) => {
    bounds.set(nd.min, i * 6);
    bounds.set(nd.max, i * 6 + 3);
    if (nd.count > 0) { meta[i * 3] = nd.start; meta[i * 3 + 1] = nd.count; meta[i * 3 + 2] = 1; }
    else { meta[i * 3] = nd.left; meta[i * 3 + 1] = nd.right; meta[i * 3 + 2] = 0; }
  });
  // 按叶子顺序重排三角形，预计算 v0, e1, e2
  const pre = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const t = order[i];
    for (let a = 0; a < 3; a++) {
      const v0 = tris[t * 9 + a];
      pre[i * 9 + a] = v0;
      pre[i * 9 + 3 + a] = tris[t * 9 + 3 + a] - v0;
      pre[i * 9 + 6 + a] = tris[t * 9 + 6 + a] - v0;
    }
  }
  return { bounds, meta, tris: pre };
}

// 最近一次 intersect 命中的是不是三角形正面（射线迎着法线打上去）。背面命中 = 射线是从物体“里面”打出去的
export let lastFront = true;

// 最近交点距离（未命中返回 tMax）。stack 由调用方提供以避免分配。
export function intersect(bvh, ox, oy, oz, dx, dy, dz, tMax, stack) {
  const { bounds, meta, tris } = bvh;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  let best = tMax;
  let sp = 0;
  stack[sp++] = 0;
  while (sp > 0) {
    const ni = stack[--sp];
    const b = ni * 6;
    let t0 = (bounds[b] - ox) * ix, t1 = (bounds[b + 3] - ox) * ix;
    let tmin = t0 < t1 ? t0 : t1, tmax = t0 < t1 ? t1 : t0;
    t0 = (bounds[b + 1] - oy) * iy; t1 = (bounds[b + 4] - oy) * iy;
    tmin = Math.max(tmin, t0 < t1 ? t0 : t1); tmax = Math.min(tmax, t0 < t1 ? t1 : t0);
    t0 = (bounds[b + 2] - oz) * iz; t1 = (bounds[b + 5] - oz) * iz;
    tmin = Math.max(tmin, t0 < t1 ? t0 : t1); tmax = Math.min(tmax, t0 < t1 ? t1 : t0);
    if (tmax < Math.max(tmin, 0) || tmin > best) continue;
    const m = ni * 3;
    if (meta[m + 2] === 1) {
      const s = meta[m], c = meta[m + 1];
      for (let i = s; i < s + c; i++) {
        const o = i * 9;
        const e1x = tris[o + 3], e1y = tris[o + 4], e1z = tris[o + 5];
        const e2x = tris[o + 6], e2y = tris[o + 7], e2z = tris[o + 8];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-12 && det < 1e-12) continue;
        const inv = 1 / det;
        const tx = ox - tris[o], ty = oy - tris[o + 1], tz = oz - tris[o + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > 1e-5 && t < best) { best = t; lastFront = det > 0; }
      }
    } else {
      stack[sp++] = meta[m];
      stack[sp++] = meta[m + 1];
    }
  }
  return best;
}
