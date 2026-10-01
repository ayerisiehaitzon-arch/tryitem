// Catmull-Clark 细分。拓扑在角色的一生里不变（滑杆只改顶点位置），
// 所以把“怎么细分”预先算成一份计划（每一层的面点、边点、顶点点各引用哪些顶点、权重多少），
// 之后每次改参数只需要按计划做几次加权求和 —— 一个 1500 个控制点的人体细分两次大约 1~2ms，
// 拖滑杆、眨眼、呼吸都能逐帧重算。
//
//   faces    多边形列表（顶点下标，外侧逆时针）；四边形以外的面在第一层细分后也都变成四边形
//   corners  可选：保持不动的边界顶点（嘴缝的两个嘴角：上下唇的边界线在这里交汇，不能被磨圆）
//
// 边界规则：边界边的边点是中点，边界顶点按三次 B 样条（1/8, 6/8, 1/8）沿边界走 —— 开口（眼眶、嘴缝）
// 和衣服的下摆、袖口都是光滑的曲线。

export function buildPlan(faces, nVerts, levels = 2, { corners = null } = {}) {
  const plan = { nIn: nVerts, levels: [] };
  let F = faces.map((f) => Array.from(f));
  let n = nVerts;
  let cornerSet = corners ? new Set(corners) : new Set();
  for (let l = 0; l < levels; l++) {
    const lv = refine(F, n, cornerSet);
    plan.levels.push(lv);
    F = lv.faces;
    n = lv.nOut;
    // 角点在下一层还是角点（顶点点的下标不变）
  }
  plan.nOut = n;
  plan.faces = F;
  // 四边形 → 三角形（固定对角线：细分后的面已经很平）
  const tri = new Uint32Array(F.length * 6);
  let t = 0;
  for (const f of F) {
    tri[t++] = f[0]; tri[t++] = f[1]; tri[t++] = f[2];
    tri[t++] = f[0]; tri[t++] = f[2]; tri[t++] = f[3];
  }
  plan.tris = tri;
  plan.quads = Int32Array.from(F.flat());
  plan.limit = limitStencil(faces, nVerts, plan.levels[0]);
  return plan;
}

// 极限位置的模板：Catmull-Clark 曲面上“控制点 v 对应的那个点”=
//   内部点（价 n，全是四边形）：(n²·v + 4·Σ 相邻点 + Σ 对角点) / (n(n + 5))
//   边界点：(前 + 4·v + 后) / 6；角点：v 本身
function limitStencil(faces, nV, lv0) {
  const diag = Array.from({ length: nV }, () => []);
  for (const f of faces) {
    if (f.length !== 4) continue;
    for (let i = 0; i < 4; i++) diag[f[i]].push(f[(i + 2) % 4]);
  }
  const start = new Int32Array(nV + 1), idx = [], w = [], self = new Float32Array(nV);
  for (let v = 0; v < nV; v++) {
    start[v] = idx.length;
    const t = lv0.vType[v];
    if (t === 2 || t === 3) { self[v] = 1; continue; }
    if (t === 1) { self[v] = 4 / 6; idx.push(lv0.vA[v], lv0.vB[v]); w.push(1 / 6, 1 / 6); continue; }
    const n = lv0.nCnt[v], den = n * (n + 5);
    self[v] = (n * n) / den;
    for (let i = lv0.nStart[v]; i < lv0.nStart[v] + n; i++) { idx.push(lv0.nIdx[i]); w.push(4 / den); }
    for (const d of diag[v]) { idx.push(d); w.push(1 / den); }
  }
  start[nV] = idx.length;
  return { start, idx: Int32Array.from(idx), w: Float32Array.from(w), self };
}

// 反求控制点：让细分曲面的极限正好经过目标位置（鼻尖、唇峰、下巴这些小的形体不被磨平）。
// 迭代 C ← C + ω·(T − 极限(C))；mask（可选，0 … 1）控制每个点拟合到什么程度
export function fitLimit(plan, target, { iters = 14, omega = 1.0, mask = null } = {}) {
  const { start, idx, w, self } = plan.limit;
  const n = self.length;
  const C = Float32Array.from(target);
  const Lc = new Float32Array(n * 3);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < n; v++) {
      let x = C[v * 3] * self[v], y = C[v * 3 + 1] * self[v], z = C[v * 3 + 2] * self[v];
      for (let i = start[v]; i < start[v + 1]; i++) {
        const u = idx[i] * 3, ww = w[i];
        x += C[u] * ww; y += C[u + 1] * ww; z += C[u + 2] * ww;
      }
      Lc[v * 3] = x; Lc[v * 3 + 1] = y; Lc[v * 3 + 2] = z;
    }
    for (let v = 0; v < n; v++) {
      const k = omega * (mask ? mask[v] : 1);
      if (!k) continue;
      for (let a = 0; a < 3; a++) C[v * 3 + a] += k * (target[v * 3 + a] - Lc[v * 3 + a]);
    }
  }
  return C;
}

function refine(F, nV, cornerSet) {
  const nF = F.length;
  // —— 边 ——
  const edgeId = new Map();
  const ea = [], eb = [], ef0 = [], ef1 = [];
  const faceEdges = [];
  for (let fi = 0; fi < nF; fi++) {
    const f = F[fi];
    const fe = [];
    for (let j = 0; j < f.length; j++) {
      const a = f[j], b = f[(j + 1) % f.length];
      const key = a < b ? a * nV + b : b * nV + a;
      let id = edgeId.get(key);
      if (id === undefined) {
        id = ea.length;
        edgeId.set(key, id);
        ea.push(a); eb.push(b); ef0.push(fi); ef1.push(-1);
      } else {
        if (ef1[id] !== -1) throw new Error(`非流形边 ${a}-${b}`);
        ef1[id] = fi;
      }
      fe.push(id);
    }
    faceEdges.push(fe);
  }
  const nE = ea.length;
  // —— 顶点的邻接 ——
  const vEdges = Array.from({ length: nV }, () => []);
  const vFaces = Array.from({ length: nV }, () => []);
  for (let e = 0; e < nE; e++) { vEdges[ea[e]].push(e); vEdges[eb[e]].push(e); }
  for (let fi = 0; fi < nF; fi++) for (const v of F[fi]) vFaces[v].push(fi);

  const offF = nV, offE = nV + nF, nOut = nV + nF + nE;
  // 面点：CSR
  const fStart = new Int32Array(nF + 1);
  for (let fi = 0; fi < nF; fi++) fStart[fi + 1] = fStart[fi] + F[fi].length;
  const fIdx = new Int32Array(fStart[nF]);
  for (let fi = 0; fi < nF; fi++) fIdx.set(F[fi], fStart[fi]);
  // 边点
  const EA = Int32Array.from(ea), EB = Int32Array.from(eb);
  const EF0 = new Int32Array(nE), EF1 = new Int32Array(nE);
  for (let e = 0; e < nE; e++) {
    const boundary = ef1[e] === -1;
    EF0[e] = boundary ? -1 : offF + ef0[e];
    EF1[e] = boundary ? -1 : offF + ef1[e];
  }
  // 顶点点：0 内部 1 边界 2 角点（不动）3 孤立（不在任何面上，原样复制）
  const vType = new Uint8Array(nV);
  const vA = new Int32Array(nV), vB = new Int32Array(nV); // 边界顶点的前后邻居
  const nStart = new Int32Array(nV + 1);
  let total = 0;
  for (let v = 0; v < nV; v++) {
    nStart[v] = total;
    if (!vEdges[v].length) { vType[v] = 3; continue; }
    const bEdges = vEdges[v].filter((e) => ef1[e] === -1);
    if (cornerSet.has(v)) vType[v] = 2;
    else if (bEdges.length === 2) {
      vType[v] = 1;
      vA[v] = ea[bEdges[0]] === v ? eb[bEdges[0]] : ea[bEdges[0]];
      vB[v] = ea[bEdges[1]] === v ? eb[bEdges[1]] : ea[bEdges[1]];
    } else if (bEdges.length) vType[v] = 2;
    else total += vEdges[v].length + vFaces[v].length;
  }
  nStart[nV] = total;
  const nIdx = new Int32Array(total);
  const nCnt = new Int32Array(nV); // 内部顶点的价（valence）
  for (let v = 0; v < nV; v++) {
    if (vType[v] !== 0) continue;
    let p = nStart[v];
    for (const e of vEdges[v]) nIdx[p++] = ea[e] === v ? eb[e] : ea[e];
    for (const fi of vFaces[v]) nIdx[p++] = offF + fi;
    nCnt[v] = vEdges[v].length;
  }
  // 下一层的面
  const out = [];
  for (let fi = 0; fi < nF; fi++) {
    const f = F[fi], fe = faceEdges[fi], m = f.length;
    for (let j = 0; j < m; j++) out.push([f[j], offE + fe[j], offF + fi, offE + fe[(j + m - 1) % m]]);
  }
  return { nIn: nV, nOut, nF, nE, fStart, fIdx, EA, EB, EF0, EF1, vType, vA, vB, nStart, nIdx, nCnt, faces: out };
}

// 按计划细分顶点属性。src：nIn × stride 的 Float32Array（位置 3 个分量，也可以把颜色拼在后面一起细分）
export function subdivide(plan, src, stride = 3) {
  let cur = src;
  for (const lv of plan.levels) cur = step(lv, cur, stride);
  return cur;
}

function step(lv, src, S) {
  const { nIn, nF, nE, fStart, fIdx, EA, EB, EF0, EF1, vType, vA, vB, nStart, nIdx, nCnt } = lv;
  const dst = new Float32Array(lv.nOut * S);
  const offF = nIn, offE = nIn + nF;
  // 面点
  for (let f = 0; f < nF; f++) {
    const a = fStart[f], b = fStart[f + 1], w = 1 / (b - a), o = (offF + f) * S;
    for (let i = a; i < b; i++) {
      const s = fIdx[i] * S;
      for (let k = 0; k < S; k++) dst[o + k] += src[s + k] * w;
    }
  }
  // 边点
  for (let e = 0; e < nE; e++) {
    const o = (offE + e) * S, a = EA[e] * S, b = EB[e] * S;
    if (EF0[e] < 0) {
      for (let k = 0; k < S; k++) dst[o + k] = (src[a + k] + src[b + k]) * 0.5;
    } else {
      const f0 = EF0[e] * S, f1 = EF1[e] * S;
      for (let k = 0; k < S; k++) dst[o + k] = (src[a + k] + src[b + k] + dst[f0 + k] + dst[f1 + k]) * 0.25;
    }
  }
  // 顶点点
  for (let v = 0; v < nIn; v++) {
    const o = v * S, t = vType[v];
    if (t === 2 || t === 3) { for (let k = 0; k < S; k++) dst[o + k] = src[o + k]; continue; }
    if (t === 1) {
      const a = vA[v] * S, b = vB[v] * S;
      for (let k = 0; k < S; k++) dst[o + k] = (6 * src[o + k] + src[a + k] + src[b + k]) * 0.125;
      continue;
    }
    const n = nCnt[v], w0 = (n - 2) / n, w1 = 1 / (n * n);
    const s0 = nStart[v], s1 = s0 + n, s2 = nStart[v + 1];
    for (let k = 0; k < S; k++) {
      let acc = src[o + k] * w0;
      for (let i = s0; i < s1; i++) acc += src[nIdx[i] * S + k] * w1;
      for (let i = s1; i < s2; i++) acc += dst[nIdx[i] * S + k] * w1;
      dst[o + k] = acc;
    }
  }
  return dst;
}

// 面上逐角的属性（衣服的布纹 UV）：双线性细分 —— 面点取各角平均、边点取两端平均、顶点不动。
// cornerUV[fi] = [[u,v], …]（与 faces[fi] 的顶点一一对应）。返回最终每个四边形四个角的 UV（Float32Array，8 个数一面）
export function subdivideCorners(faces, cornerUV, levels) {
  let F = faces.map((f, i) => cornerUV[i]);
  for (let l = 0; l < levels; l++) {
    const next = [];
    for (const c of F) {
      const m = c.length;
      const ctr = [0, 0];
      for (const p of c) { ctr[0] += p[0] / m; ctr[1] += p[1] / m; }
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (let j = 0; j < m; j++) next.push([c[j], mid(c[j], c[(j + 1) % m]), ctr, mid(c[(j + m - 1) % m], c[j])]);
    }
    F = next;
  }
  const out = new Float32Array(F.length * 8);
  F.forEach((c, i) => c.forEach((p, j) => { out[i * 8 + j * 2] = p[0]; out[i * 8 + j * 2 + 1] = p[1]; }));
  return out;
}

// 细分后的法线：每个四边形用两条对角线的叉积（相当于面积加权），累加到四个顶点上
export function quadNormals(faces, pos, stride = 3, out = null) {
  const n = pos.length / stride;
  const N = out ?? new Float32Array(n * 3);
  N.fill(0);
  // faces 可以是 [[a,b,c,d], …]，也可以是展平的 Int32Array（快很多）
  const Q = faces instanceof Int32Array ? faces : Int32Array.from(faces.flat());
  for (let q = 0; q < Q.length; q += 4) {
    const A = Q[q], B = Q[q + 1], Cc = Q[q + 2], D = Q[q + 3];
    const a = A * stride, b = B * stride, c = Cc * stride, d = D * stride;
    const ux = pos[c] - pos[a], uy = pos[c + 1] - pos[a + 1], uz = pos[c + 2] - pos[a + 2];
    const vx = pos[d] - pos[b], vy = pos[d + 1] - pos[b + 1], vz = pos[d + 2] - pos[b + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    N[A * 3] += nx; N[A * 3 + 1] += ny; N[A * 3 + 2] += nz;
    N[B * 3] += nx; N[B * 3 + 1] += ny; N[B * 3 + 2] += nz;
    N[Cc * 3] += nx; N[Cc * 3 + 1] += ny; N[Cc * 3 + 2] += nz;
    N[D * 3] += nx; N[D * 3 + 1] += ny; N[D * 3 + 2] += nz;
  }
  for (let i = 0; i < n; i++) {
    const x = N[i * 3], y = N[i * 3 + 1], z = N[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
  }
  return N;
}

// 让一组多边形的绕序一致（相邻面在公共边上方向相反），再按有向体积把整体翻成朝外。
// 开口的网格（衣服）没有体积可算：传 outward(fi) 判断某个面是不是朝外
export function orientFaces(faces, nVerts, { outward = null } = {}) {
  const edgeFaces = new Map();
  faces.forEach((f, fi) => {
    for (let j = 0; j < f.length; j++) {
      const a = f[j], b = f[(j + 1) % f.length];
      const key = a < b ? a * nVerts + b : b * nVerts + a;
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(fi);
    }
  });
  const dirOf = (f, a, b) => {
    for (let j = 0; j < f.length; j++) if (f[j] === a && f[(j + 1) % f.length] === b) return 1;
    return -1;
  };
  const seen = new Uint8Array(faces.length);
  const comps = [];
  for (let s = 0; s < faces.length; s++) {
    if (seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    for (let q = 0; q < comp.length; q++) {
      const fi = comp[q], f = faces[fi];
      for (let j = 0; j < f.length; j++) {
        const a = f[j], b = f[(j + 1) % f.length];
        const key = a < b ? a * nVerts + b : b * nVerts + a;
        for (const g of edgeFaces.get(key)) {
          if (g === fi || seen[g]) continue;
          // 相邻面在这条边上应当是 b→a
          if (dirOf(faces[g], a, b) === 1) faces[g].reverse();
          seen[g] = 1;
          comp.push(g);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

export function signedVolume(faces, pos) {
  let vol = 0;
  for (const f of faces) {
    const p0 = f[0] * 3;
    for (let j = 1; j + 1 < f.length; j++) {
      const p1 = f[j] * 3, p2 = f[j + 1] * 3;
      const ax = pos[p0], ay = pos[p0 + 1], az = pos[p0 + 2];
      const bx = pos[p1], by = pos[p1 + 1], bz = pos[p1 + 2];
      const cx = pos[p2], cy = pos[p2 + 1], cz = pos[p2 + 2];
      vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
  }
  return vol / 6;
}
