import { atlasUV } from './pack.js';

// 把一个 LOD 的所有部件合并成“每种材质一个图元”，并：
//   · UV0：米 → 贴图重复单位，按部件名给确定性的随机偏移（相同的腿木纹不雷同）
//   · UV1：图块坐标 → AO 图集坐标
//   · 焊接完全相同的顶点、剔除退化三角形
export function finalizeItem(k, { layout, tileOf }) {
  const byMat = new Map();
  for (const part of k.parts) {
    if (!byMat.has(part.mat)) byMat.set(part.mat, []);
    byMat.get(part.mat).push(part);
  }
  const prims = [];
  let tris = 0, verts = 0;
  for (const [mat, parts] of byMat) {
    const tile = tileOf(mat);
    const P = [], N = [], T0 = [], T1 = [], I = [];
    const keyMap = new Map();
    for (const part of parts) {
      const rnd = k.rand(part.name);
      const off = [rnd(), rnd()];
      const remap = new Array(part.P.length);
      for (let i = 0; i < part.P.length; i++) {
        const p = part.P[i], n = part.N[i];
        const t = [part.T[i][0] / tile[0] + off[0], part.T[i][1] / tile[1] + off[1]];
        const ch = k.charts[part.C[i]];
        const rect = layout.rects[ch.id];
        if (!rect) throw new Error(`图块 ${ch.id} 不在图集里`);
        const t1 = atlasUV(rect, part.U[i][0], part.U[i][1], layout.size);
        const key = [
          Math.round(p[0] * 1e5), Math.round(p[1] * 1e5), Math.round(p[2] * 1e5),
          Math.round(n[0] * 1e3), Math.round(n[1] * 1e3), Math.round(n[2] * 1e3),
          Math.round(t[0] * 1e4), Math.round(t[1] * 1e4),
          Math.round(t1[0] * 1e5), Math.round(t1[1] * 1e5),
        ].join(',');
        let idx = keyMap.get(key);
        if (idx === undefined) {
          idx = P.length / 3;
          keyMap.set(key, idx);
          P.push(p[0], p[1], p[2]);
          N.push(n[0], n[1], n[2]);
          T0.push(t[0], t[1]);
          T1.push(t1[0], t1[1]);
        }
        remap[i] = idx;
      }
      for (let i = 0; i < part.I.length; i += 3) {
        const a = remap[part.I[i]], b = remap[part.I[i + 1]], c = remap[part.I[i + 2]];
        if (a === b || b === c || a === c) continue;
        const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
        const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
        const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * cx + cy * cy + cz * cz < 1e-16) continue;
        I.push(a, b, c);
      }
    }
    const nv = P.length / 3;
    prims.push({
      mat,
      position: new Float32Array(P),
      normal: new Float32Array(N),
      uv0: new Float32Array(T0),
      uv1: new Float32Array(T1),
      index: nv < 65536 ? new Uint16Array(I) : new Uint32Array(I),
    });
    tris += I.length / 3;
    verts += nv;
  }
  // 包围盒
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const pr of prims) for (let i = 0; i < pr.position.length; i += 3)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pr.position[i + a]);
      max[a] = Math.max(max[a], pr.position[i + a]);
    }
  return { prims, tris, verts, bounds: { min, max } };
}
