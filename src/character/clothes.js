import { buildPlan, subdivide, quadNormals, subdivideCorners, fitLimit } from './subdiv.js';

// 衣服：直接取身体控制网格上被它盖住的那些面（T 恤 = 躯干 T1 … T11 + 两只袖子的头三圈），
// 每个点沿身体的法线往外推一个“松量”，再按衣服自己的拓扑细分 —— 体型滑杆怎么拉，衣服都贴着身体走，
// 腋下、裆部这些难缝的地方天然就是对的（拓扑和身体一模一样）。
//   · 推出去之后做几遍拉普拉斯平滑（只许往外，不许陷进身体）：衣服不会钻进乳沟、脊柱沟、两腿之间
//   · 每个开口（下摆、袖口、领口、裤脚）往里折一圈，看得出布的厚度
//   · 被盖住的身体面（不挨着衣服边的）直接不画，免得皮肤从布里透出来
//   · 布纹 UV 按身体的环 / 列展开，袖子、裤腿的缝在内侧，躯干的缝在背后正中

// 每件衣服：slot（上衣 / 下装 / 鞋）、选哪些面、松量（米，可以随位置变化）、开口折边
export const GARMENTS = {
  tee: {
    label: 'T恤', slot: 'top', layer: 2,
    select: (t) => (t.part === 'torso' && t.r >= 1) || (t.part === 'arm' && t.r <= 2),
    ease: (q) => 0.0065 + 0.007 * q.hem + 0.004 * q.sleeveEnd,
    fold: 0.007, rough: 0.82, sheen: 0.4,
  },
  longtee: {
    label: '长袖T恤', slot: 'top', layer: 2,
    select: (t) => (t.part === 'torso' && t.r >= 1) || (t.part === 'arm' && t.r <= 8),
    ease: (q) => 0.0065 + 0.007 * q.hem + 0.002 * q.sleeveEnd,
    fold: 0.007, rough: 0.82, sheen: 0.4,
  },
  tank: {
    label: '背心', slot: 'top', layer: 2,
    select: (t) => (t.part === 'torso' && t.r >= 1 && t.r <= 9) || (t.part === 'torso' && t.r === 10 && strap(t.j)),
    ease: (q) => 0.005 + 0.006 * q.hem,
    fold: 0.005, rough: 0.8, sheen: 0.3,
  },
  hoodie: {
    label: '卫衣', slot: 'top', layer: 3,
    select: (t) => (t.part === 'torso' && t.r >= 0) || (t.part === 'arm' && t.r <= 8) || (t.part === 'neck' && t.r <= 0),
    ease: (q) => 0.014 + 0.004 * q.hem + 0.002 * q.sleeveEnd,
    fold: 0.012, rough: 0.9, sheen: 0.6, rib: true,
  },
  jeans: {
    label: '牛仔裤', slot: 'bottom', layer: 1, long: true,
    select: (t) => (t.part === 'torso' && t.r <= 2) || (t.part === 'leg' && t.r <= 9),
    ease: (q) => 0.0045 + 0.005 * q.legEnd + 0.001 * q.waist,
    fold: 0.008, rough: 0.85, sheen: 0.15,
  },
  chinos: {
    label: '休闲裤', slot: 'bottom', layer: 1, long: true,
    select: (t) => (t.part === 'torso' && t.r <= 2) || (t.part === 'leg' && t.r <= 9),
    ease: (q) => 0.0065 + 0.007 * q.legEnd + 0.001 * q.waist,
    fold: 0.008, rough: 0.8, sheen: 0.25,
  },
  shorts: {
    label: '短裤', slot: 'bottom', layer: 1,
    select: (t) => (t.part === 'torso' && t.r <= 2) || (t.part === 'leg' && t.r <= 2),
    ease: (q) => 0.006 + 0.012 * q.legEnd,
    fold: 0.008, rough: 0.8, sheen: 0.25,
  },
  skirt: {
    label: '半身裙', slot: 'bottom', layer: 1, loft: { len: 0.6, flare: 0.16 },
    fold: 0.008, rough: 0.8, sheen: 0.3,
  },
  mini: {
    label: '短裙', slot: 'bottom', layer: 1, loft: { len: 0.3, flare: 0.22 },
    fold: 0.007, rough: 0.8, sheen: 0.3,
  },
  sneakers: {
    label: '运动鞋', slot: 'shoes', layer: 1, sole: 0.026,
    select: (t) => t.part === 'foot' || (t.part === 'leg' && t.r >= 9),
    ease: (q) => 0.0055 + 0.0015 * q.legEnd,
    fold: 0.006, rough: 0.6, sheen: 0,
  },
  boots: {
    label: '短靴', slot: 'shoes', layer: 1, sole: 0.03, heel: 0.012,
    select: (t) => t.part === 'foot' || (t.part === 'leg' && t.r >= 7),
    // 穿长裤的时候裤腿罩在靴筒外面：脚踝以上的靴筒收进裤腿里
    ease: (q, ctx) => (ctx?.long && !q.foot ? 0.0032 + 0.0007 * Math.max(0, q.ring - 7) : 0.006 + 0.004 * q.legEnd),
    fold: 0.006, rough: 0.5, sheen: 0,
  },
};

// 背心的肩带：肩膀上、脖子和胳膊洞之间的两列（左右各一条）
function strap(j) {
  return j === 3 || j === 6 || j === 13 || j === 16 || j === 4 || j === 15;
}

// —— 拓扑：选面、找开口、加折边、建细分计划、展开 UV ——
export function buildGarment(body, id, specIn = null) {
  const spec = specIn ?? GARMENTS[id];
  if (spec.loft) return buildLoft(body, id, spec);
  const { topo } = body;
  const sel = [];
  topo.faces.forEach((f, fi) => { if (spec.select(topo.ftag[fi])) sel.push(fi); });
  const map = new Map(), verts = [];
  const local = (v) => { if (!map.has(v)) { map.set(v, verts.length); verts.push(v); } return map.get(v); };
  const faces = sel.map((fi) => topo.faces[fi].map(local));
  const nBase = verts.length;
  // 开口：只用了一次的边，串成一圈圈
  const edgeCount = new Map();
  const ek = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  faces.forEach((f) => f.forEach((a, i) => { const k = ek(a, f[(i + 1) % 4]); edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }));
  const next = new Map(); // 边界上的有向边（沿面的绕向）
  faces.forEach((f) => f.forEach((a, i) => { const b = f[(i + 1) % 4]; if (edgeCount.get(ek(a, b)) === 1) next.set(a, b); }));
  const onBoundary = new Uint8Array(nBase);
  for (const a of next.keys()) onBoundary[a] = 1;
  const loops = [];
  const seen = new Set();
  for (const a of next.keys()) {
    if (seen.has(a)) continue;
    const loop = [];
    let v = a;
    while (!seen.has(v)) { seen.add(v); loop.push(v); v = next.get(v); if (v === undefined) break; }
    loops.push(loop);
  }
  // 折边：每圈开口往里多加一圈点（位置在求值时算）
  const foldOf = new Int32Array(nBase).fill(-1);
  let n = nBase;
  const allFaces = faces.map((f) => [...f]);
  for (const loop of loops) {
    for (const v of loop) foldOf[v] = n++;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      // 边界边 a→b 在原来的面里是这个方向，折边的面要反过来接上
      allFaces.push([b, a, foldOf[a], foldOf[b]]);
    }
  }
  const plan = buildPlan(allFaces, n, body.levels);
  // 邻接（平滑用）
  const nb = Array.from({ length: nBase }, () => new Set());
  for (const f of faces) for (let i = 0; i < 4; i++) { const a = f[i], b = f[(i + 1) % 4]; nb[a].add(b); nb[b].add(a); }
  // 每个点的“位置特征”：在下摆、袖口、裤脚附近，在腰上……（给松量函数用）
  const q = verts.map((v) => quality(topo, v));
  // 被盖住的身体面：四个角都不在开口上
  const hide = new Set();
  sel.forEach((fi, i) => { if (faces[i].every((v) => !onBoundary[v])) hide.add(fi); });
  // UV：每个面四个角，按身体的列 / 环展开（米）
  const corner = allFaces.map((f, i) => (i < sel.length ? faceUV(topo.ftag[sel[i]]) : foldUV()));
  const cuv = subdivideCorners(allFaces, corner, body.levels);
  const render = renderMesh(plan.faces, cuv);
  const loopsMeta = loops.map((loop) => ({ loop, kind: loopKind(topo, verts, loop) }));
  return { id, spec, sel, verts, nBase, n, faces, allFaces, loops: loopsMeta, foldOf, plan, nb, q, hide, render, onBoundary };
}

// 一个身体点的位置特征（0 … 1）
function quality(topo, v) {
  const q = { hem: 0, sleeveEnd: 0, legEnd: 0, waist: 0, low: 0, ring: -1, foot: 0 };
  const T = topo.T;
  if (T[1].includes(v)) q.hem = 1; else if (T[2].includes(v)) q.hem = 0.35;
  if (T[0].includes(v) || T[1].includes(v)) q.waist = 1;
  // 上衣和下装重叠的那几圈（T0 … T4）：上衣要盖在裤子外面
  for (let r = 0; r <= 4; r++) if (T[r].includes(v)) q.low = r <= 3 ? 1 : 0.5;
  for (const a of topo.arms) {
    const i = a.A.findIndex((r) => r.includes(v));
    if (i >= 0) q.sleeveEnd = Math.max(0, (i - 1) / 8);
  }
  for (const l of topo.legs) {
    const i = l.L.findIndex((r) => r.includes(v));
    if (i >= 0) { q.legEnd = Math.max(0, (i - 3) / 7); q.ring = i; }
    if (l.F.some((r) => r.includes(v))) { q.legEnd = 1; if (i < 0) q.foot = 1; }
    if (i < 0 && l.toe.some((r) => r.includes(v))) q.foot = 1;
  }
  return q;
}

function loopKind(topo, verts, loop) {
  const v = verts[loop[0]];
  if (topo.T[topo.T.length - 1].includes(v) || topo.N.some((r) => r.includes(v))) return 'neck';
  return 'hem';
}

// 身体面的 UV：躯干按列（缝在背后 j = 10），胳膊按圈（缝在腋下 k = 6），腿按圈（缝在内侧）
function faceUV(t) {
  const i = t.j ?? 0, r = t.r ?? 0;
  if (t.part === 'torso' || t.part === 'neck') {
    const u0 = i < 10 ? i + 10 : i - 10;
    const du = 0.046, dv = t.part === 'neck' ? 0.03 : 0.055, v0 = t.part === 'neck' ? 12 + (t.r + 1) : r;
    return [[u0 * du, v0 * dv], [(u0 + 1) * du, v0 * dv], [(u0 + 1) * du, (v0 + 1) * dv], [u0 * du, (v0 + 1) * dv]];
  }
  if (t.part === 'arm' || t.part === 'leg' || t.part === 'foot') {
    const n = t.n ?? 10;
    const seam = t.part === 'arm' ? 6 : 11;
    const u0 = (i - seam + n) % n;
    const du = t.part === 'arm' ? 0.03 : 0.04, dv = t.part === 'arm' ? 0.034 : 0.07;
    return [[u0 * du, r * dv], [(u0 + 1) * du, r * dv], [(u0 + 1) * du, (r + 1) * dv], [u0 * du, (r + 1) * dv]];
  }
  // 脚尖的网格
  const gi = t.gi ?? 0, gj = t.gj ?? 0;
  return [[gi * 0.03, gj * 0.03], [(gi + 1) * 0.03, gj * 0.03], [(gi + 1) * 0.03, (gj + 1) * 0.03], [gi * 0.03, (gj + 1) * 0.03]];
}
function foldUV() {
  return [[0, 0], [0.04, 0], [0.04, 0.008], [0, 0.008]];
}

// 细分后的四边形 + 每角 UV → 可以直接画的网格（UV 不同的角拆成不同的顶点）
function renderMesh(F, cuv) {
  const key = new Map();
  const pos = [], uv = [];
  const idx = new Uint32Array(F.length * 6);
  const vid = (fi, c) => {
    const p = F[fi][c], u = cuv[fi * 8 + c * 2], v = cuv[fi * 8 + c * 2 + 1];
    const k = `${p},${Math.round(u * 1e4)},${Math.round(v * 1e4)}`;
    let i = key.get(k);
    if (i === undefined) { i = pos.length; key.set(k, i); pos.push(p); uv.push(u, v); }
    return i;
  };
  let t = 0;
  F.forEach((f, fi) => {
    const a = vid(fi, 0), b = vid(fi, 1), c = vid(fi, 2), d = vid(fi, 3);
    idx[t++] = a; idx[t++] = b; idx[t++] = c; idx[t++] = a; idx[t++] = c; idx[t++] = d;
  });
  return { pos: Int32Array.from(pos), uv: new Float32Array(uv), index: idx };
}

// —— 求值：身体曲面上的点（拟合前的目标位置）+ 法线 → 衣服曲面上的点 → 反求衣服的控制网格 → 细分 ——
// 一定要从“曲面上的点”出发：拟合过的控制点在凹处会缩在曲面里面，从那儿往外推，衣服会被皮肤顶穿
export function evalGarment(g, cage, cageN, { lift = 0, fit = 10, ctx = null } = {}) {
  if (g.loft) return evalLoft(g, cage, cageN, { fit });
  const { verts, nBase, n, nb, q, spec, loops, foldOf } = g;
  const P = new Float32Array(n * 3);
  const base = new Float32Array(nBase * 3), N = new Float32Array(nBase * 3), minOff = new Float32Array(nBase);
  for (let i = 0; i < nBase; i++) {
    const v = verts[i];
    let off = spec.ease(q[i], ctx && { ...ctx, p: [cage[v * 3], cage[v * 3 + 1], cage[v * 3 + 2]] });
    if (spec.slot === 'top') off += 0.0065 * q[i].low; // 上衣下摆罩在裤腰外面
    minOff[i] = off * 0.7;
    for (let a = 0; a < 3; a++) {
      base[i * 3 + a] = cage[v * 3 + a];
      N[i * 3 + a] = cageN[v * 3 + a];
      P[i * 3 + a] = cage[v * 3 + a] + cageN[v * 3 + a] * off;
    }
  }
  // 鞋底：最低的一圈往下、往外推（鞋底的厚度），后跟再加一点
  if (spec.sole) {
    for (let i = 0; i < nBase; i++) {
      const y = base[i * 3 + 1];
      const k = Math.max(0, 1 - y / 0.035);
      P[i * 3 + 1] -= spec.sole * k * k * 0.9;
      P[i * 3] += N[i * 3] * 0.004 * k;
      P[i * 3 + 2] += N[i * 3 + 2] * 0.004 * k;
    }
  }
  // 平滑 + 只许往外：衣服绷在凹处上面（乳沟、脊柱沟、腰窝、两腿之间）
  const tmp = new Float32Array(nBase * 3);
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < nBase; i++) {
      if (g.onBoundary[i]) { for (let a = 0; a < 3; a++) tmp[i * 3 + a] = P[i * 3 + a]; continue; }
      let x = 0, y = 0, z = 0, c = 0;
      for (const j of nb[i]) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; c++; }
      tmp[i * 3] = P[i * 3] * 0.5 + (x / c) * 0.5;
      tmp[i * 3 + 1] = P[i * 3 + 1] * 0.5 + (y / c) * 0.5;
      tmp[i * 3 + 2] = P[i * 3 + 2] * 0.5 + (z / c) * 0.5;
    }
    for (let i = 0; i < nBase; i++) {
      const dx = tmp[i * 3] - base[i * 3], dy = tmp[i * 3 + 1] - base[i * 3 + 1], dz = tmp[i * 3 + 2] - base[i * 3 + 2];
      const d = dx * N[i * 3] + dy * N[i * 3 + 1] + dz * N[i * 3 + 2];
      const push = d < minOff[i] && !spec.sole ? minOff[i] - d : 0;
      for (let a = 0; a < 3; a++) P[i * 3 + a] = tmp[i * 3 + a] + N[i * 3 + a] * push;
    }
  }
  // 折边：开口的每个点往里（贴向身体）、往衣服里面折回去一点
  for (const { loop } of loops) {
    for (const i of loop) {
      // “往衣服里”的方向：内侧邻点的平均方向
      let tx = 0, ty = 0, tz = 0, c = 0;
      for (const j of nb[i]) {
        if (g.onBoundary[j]) continue;
        tx += P[j * 3] - P[i * 3]; ty += P[j * 3 + 1] - P[i * 3 + 1]; tz += P[j * 3 + 2] - P[i * 3 + 2]; c++;
      }
      const l = Math.hypot(tx, ty, tz) || 1;
      const f = foldOf[i];
      const th = spec.fold;
      P[f * 3] = P[i * 3] - N[i * 3] * th * 0.55 + (tx / l) * th;
      P[f * 3 + 1] = P[i * 3 + 1] - N[i * 3 + 1] * th * 0.55 + (ty / l) * th;
      P[f * 3 + 2] = P[i * 3 + 2] - N[i * 3 + 2] * th * 0.55 + (tz / l) * th;
    }
  }
  if (lift) for (let i = 0; i < n; i++) P[i * 3 + 1] += lift;
  const C = fit ? fitLimit(g.plan, P, { iters: fit, omega: 0.8 }) : P;
  const fine = subdivide(g.plan, C, 3);
  const fn = quadNormals(g.plan.quads, fine);
  const R = g.render;
  const m = R.pos.length;
  const pos = new Float32Array(m * 3), nrm = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const s = R.pos[i] * 3;
    pos[i * 3] = fine[s]; pos[i * 3 + 1] = fine[s + 1]; pos[i * 3 + 2] = fine[s + 2];
    nrm[i * 3] = fn[s]; nrm[i * 3 + 1] = fn[s + 1]; nrm[i * 3 + 2] = fn[s + 2];
  }
  return { position: pos, normal: nrm, uv: R.uv, index: R.index };
}

// 身体控制网格的顶点法线（面积加权）
export function cageNormals(faces, cage) {
  return quadNormals(faces, cage);
}

// 身体要画的三角形：去掉被衣服盖住的面（每个控制面细分两次后是 16 个四边形、32 个三角形，连续存放）
export function bodyIndex(body, hidden) {
  const tris = body.plan.tris, per = 6 * 4 ** body.levels;
  if (!hidden || !hidden.size) return tris;
  const out = new Uint32Array(tris.length - hidden.size * per);
  let t = 0;
  const nf = body.topo.faces.length;
  for (let fi = 0; fi < nf; fi++) {
    if (hidden.has(fi)) continue;
    out.set(tris.subarray(fi * per, fi * per + per), t);
    t += per;
  }
  return out;
}


// —— 裙子：不贴着腿走，从腰上一圈一圈往下“放样”——
// 上面四圈就是身体的腰（T3）、胯（T2）、臀（T1）、裆（T0）往外推一点；再往下每一圈在这个高度上把两条腿的截面
// 都罩住（每个方向取两条腿最远的那一点，再留出余量），越往下越往外张（A 字），最后在下摆往里折一圈
const SKIRT_TOP = [3, 2, 1, 0];
function buildLoft(body, id, spec) {
  const { topo } = body;
  const NCc = topo.T[0].length;
  const ringsBelow = 7;
  const R = SKIRT_TOP.length + ringsBelow;
  const idx = (r, j) => r * NCc + (j % NCc);
  const faces = [];
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < NCc; j++) faces.push([idx(r, j), idx(r, j + 1), idx(r + 1, j + 1), idx(r + 1, j)]);
  // 下摆折边、腰头折边
  const nMain = R * NCc;
  const hem = (j) => nMain + j, top = (j) => nMain + NCc + j;
  for (let j = 0; j < NCc; j++) {
    faces.push([idx(R - 1, j), idx(R - 1, j + 1), hem((j + 1) % NCc), hem(j)]);
    faces.push([top(j), top((j + 1) % NCc), idx(0, j + 1), idx(0, j)]);
  }
  const n = nMain + 2 * NCc;
  const plan = buildPlan(faces, n, body.levels);
  const corner = faces.map((f, i) => {
    const r = Math.floor(i / NCc), j = i % NCc;
    const u0 = j < 10 ? j + 10 : j - 10;
    return i < (R - 1) * NCc ? [[u0 * 0.06, r * 0.08], [(u0 + 1) * 0.06, r * 0.08], [(u0 + 1) * 0.06, (r + 1) * 0.08], [u0 * 0.06, (r + 1) * 0.08]] : [[0, 0], [0.04, 0], [0.04, 0.01], [0, 0.01]];
  });
  const render = renderMesh(plan.faces, subdivideCorners(faces, corner, body.levels));
  // 裙子盖住的身体：腰到裆这几圈躯干（腿要露出来）
  const hide = new Set();
  topo.faces.forEach((f, fi) => { const t = topo.ftag[fi]; if (t.part === 'torso' && t.r <= 2) hide.add(fi); });
  return { id, spec, loft: true, R, NC: NCc, n, nMain, faces, plan, render, hide, ringsBelow, T: topo.T, legRings: topo.legs.map((l) => l.L.slice(1)) };
}
function evalLoft(g, cage, cageN, { fit = 8 } = {}) {
  const { spec, R, NC: NCc, n, nMain, ringsBelow } = g;
  const T = g.T, legRings = g.legRings;
  const P = new Float32Array(n * 3);
  const at = (v) => [cage[v * 3], cage[v * 3 + 1], cage[v * 3 + 2]];
  const nrm = (v) => [cageN[v * 3], cageN[v * 3 + 1], cageN[v * 3 + 2]];
  const set = (i, p) => { P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; };
  // 上面四圈：身体往外推（腰头贴、臀部松一点）
  const ease = [0.005, 0.007, 0.01, 0.014];
  let cx = 0, cz = 0;
  SKIRT_TOP.forEach((tr, r) => {
    for (let j = 0; j < NCc; j++) {
      const v = T[tr][j];
      const p = at(v), nn = nrm(v);
      set(r * NCc + j, [p[0] + nn[0] * ease[r], p[1] + nn[1] * ease[r], p[2] + nn[2] * ease[r]]);
      if (r === 2) { cx += p[0] / NCc; cz += p[2] / NCc; }
    }
  });
  // 裆以下：每圈罩住两条腿
  const y0 = (() => { let y = 0; for (let j = 0; j < NCc; j++) y += P[(3 * NCc + j) * 3 + 1]; return y / NCc; })();
  const legPts = [];
  for (const rings of legRings) for (const ring of rings) for (const v of ring) legPts.push(at(v));
  const len = spec.loft.len;
  let prev = null;
  for (let k = 1; k <= ringsBelow; k++) {
    const t = k / ringsBelow;
    const y = y0 - len * t;
    const near = legPts.filter((p) => Math.abs(p[1] - y) < 0.05);
    const ring = [];
    for (let j = 0; j < NCc; j++) {
      const th = (j * Math.PI * 2) / NCc;
      const d = [Math.sin(th), 0, Math.cos(th)];
      let r = 0.05;
      for (const p of near) r = Math.max(r, (p[0] - cx) * d[0] + (p[2] - cz) * d[2]);
      // 上一圈的半径（A 字只许往外张）
      const top = prev ? prev[j] : Math.hypot(P[(3 * NCc + j) * 3] - cx, P[(3 * NCc + j) * 3 + 2] - cz);
      r = Math.max(r + 0.018, top + spec.loft.flare * (len / ringsBelow));
      ring.push(r);
      set((3 + k) * NCc + j, [cx + d[0] * r, y, cz + d[2] * r]);
    }
    prev = ring;
  }
  // 折边：下摆往里、往上折，腰头往里、往下折
  for (let j = 0; j < NCc; j++) {
    const b = (R - 1) * NCc + j;
    const th = (j * Math.PI * 2) / NCc;
    set(nMain + j, [P[b * 3] - Math.sin(th) * spec.fold * 0.6, P[b * 3 + 1] + spec.fold, P[b * 3 + 2] - Math.cos(th) * spec.fold * 0.6]);
    const w = j;
    const v = T[3][j], nn = nrm(v);
    set(nMain + NCc + j, [P[w * 3] - nn[0] * 0.004, P[w * 3 + 1] - 0.012, P[w * 3 + 2] - nn[2] * 0.004]);
  }
  const C = fit ? fitLimit(g.plan, P, { iters: fit, omega: 0.8 }) : P;
  const fine = subdivide(g.plan, C, 3);
  const fn = quadNormals(g.plan.quads, fine);
  const Rm = g.render;
  const m = Rm.pos.length;
  const pos = new Float32Array(m * 3), nr = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const s = Rm.pos[i] * 3;
    pos[i * 3] = fine[s]; pos[i * 3 + 1] = fine[s + 1]; pos[i * 3 + 2] = fine[s + 2];
    nr[i * 3] = fn[s]; nr[i * 3 + 1] = fn[s + 1]; nr[i * 3 + 2] = fn[s + 2];
  }
  return { position: pos, normal: nr, uv: Rm.uv, index: Rm.index };
}
