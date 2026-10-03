// 网格减面（构建时用）：二次误差度量（Garland–Heckbert）的“半边折叠”——每次把一个顶点并到相邻的一个顶点上，只删点、不挪点、不加点，
// 留下来的都是原来的顶点，代理的贴合数据（三个基础顶点、权重、偏移）原样能用，UV 也是原来的。
//   不动的点：网格边界上的（鞋口、带子的边，轮廓不变）、非流形边上的、三片以上 UV 交汇的；
//   UV 接缝上的点只能顺着接缝并到接缝上的下一个点（两边的 UV 各自跟着换），而且接缝在两边的 UV 里都得差不多是直的；
//   折完以后有三角形翻面（3D 里法线转过 60° 以上，或者 UV 里翻过来）、退化，或者会变成非流形（两点的公共邻点不止那条边对着的两个）的，这一步不折。
//   g：parseObj / parseThreeJson 的结果（v、vt、faces: [{ v, t }]），原地改成三角形的 faces；target：要留下的三角形数
export function decimate(g, target) {
  const V = g.v, UV = g.vt, F = [], T = [];
  for (const f of g.faces) {
    if (!f.t) throw new Error('decimate: 面没有 UV');
    for (let k = 1; k + 1 < f.v.length; k++) { F.push(f.v[0], f.v[k], f.v[k + 1]); T.push(f.t[0], f.t[k], f.t[k + 1]); }
  }
  const nt = F.length / 3, nv = V.length / 3, alive = new Uint8Array(nt).fill(1);
  const vf = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vf[F[t * 3 + k]].add(t);
  const at = (t, v) => (F[t * 3] === v ? 0 : F[t * 3 + 1] === v ? 1 : 2);
  const tOf = (t, v) => T[t * 3 + at(t, v)];
  // 锁住的点：边界、非流形、三片以上 UV 交汇；接缝上的点（两片 UV）记下来
  const locked = new Uint8Array(nv), seam = new Uint8Array(nv), ec = new Map(), key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const e = key(F[t * 3 + k], F[t * 3 + (k + 1) % 3]); ec.set(e, (ec.get(e) ?? 0) + 1); }
  for (const [e, n] of ec) if (n !== 2) { locked[Math.floor(e / 4194304)] = 1; locked[e % 4194304] = 1; }
  const uvSet = (v) => new Set([...vf[v]].map((t) => tOf(t, v)));
  for (let v = 0; v < nv; v++) { const n = uvSet(v).size; if (n > 2) locked[v] = 1; else if (n === 2) seam[v] = 1; }
  // 二次误差：每个点 = 周围三角形所在平面的距离平方和（按面积加权），对称 4×4 存 10 个数
  const Q = new Float64Array(nv * 10);
  const P = (v) => [V[v * 3], V[v * 3 + 1], V[v * 3 + 2]];
  const normal = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]; return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx]; };
  const uvArea = (a, b, c) => (UV[b * 2] - UV[a * 2]) * (UV[c * 2 + 1] - UV[a * 2 + 1]) - (UV[c * 2] - UV[a * 2]) * (UV[b * 2 + 1] - UV[a * 2 + 1]);
  for (let t = 0; t < nt; t++) {
    const a = P(F[t * 3]), n = normal(a, P(F[t * 3 + 1]), P(F[t * 3 + 2])), l = Math.hypot(...n);
    if (l < 1e-20) continue;
    const [x, y, z] = n.map((c) => c / l), d = -(x * a[0] + y * a[1] + z * a[2]), w = l / 2;
    const q = [x * x, x * y, x * z, x * d, y * y, y * z, y * d, z * z, z * d, d * d];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 10; i++) Q[F[t * 3 + k] * 10 + i] += q[i] * w;
  }
  const err = (v, u) => {
    const [x, y, z] = P(u), o = v * 10, p = u * 10, q = (i) => Q[o + i] + Q[p + i];
    return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9);
  };
  const nbrs = (v) => { const s = new Set(); for (const t of vf[v]) for (let k = 0; k < 3; k++) s.add(F[t * 3 + k]); s.delete(v); return s; };
  // v 并到 u 时，v 的每个 UV 换成 u 的哪个 UV（从两点共享的三角形里读）；做不到的返回 null
  const uvMap = (v, u, shared) => {
    const m = new Map();
    for (const t of shared) { const a = tOf(t, v), b = tOf(t, u); if (m.has(a) && m.get(a) !== b) return null; m.set(a, b); }
    for (const t of vf[v]) if (!m.has(tOf(t, v))) return null;
    return m;
  };
  // 接缝上的点：只能顺着接缝走（这条边两侧的三角形里 v 的 UV 不一样），v 在接缝上的另一个邻点 w、v、u 在两边的 UV 里都差不多共线
  const seamOk = (v, u, shared) => {
    if (shared.length !== 2 || tOf(shared[0], v) === tOf(shared[1], v)) return false;
    const other = [...nbrs(v)].filter((w) => {
      if (w === u) return false;
      const sh = [...vf[v]].filter((t) => vf[w].has(t));
      return sh.length === 2 && tOf(sh[0], v) !== tOf(sh[1], v);
    });
    if (other.length !== 1) return false;
    const w = other[0];
    for (const t of [...vf[v]].filter((x) => vf[w].has(x))) {
      // 这一侧的 UV：w、v、u 各自在这一侧的坐标（u 的取 v、u 共享、且和这个三角形在同一侧的那个）
      const tv = tOf(t, v), tw = tOf(t, w), su = shared.find((x) => tOf(x, v) === tv);
      if (su === undefined) return false;
      const tu = tOf(su, u), len = Math.hypot(UV[tu * 2] - UV[tw * 2], UV[tu * 2 + 1] - UV[tw * 2 + 1]);
      if (Math.abs(uvArea(tw, tv, tu)) > 0.05 * len * len) return false;
    }
    return true;
  };
  // 小顶堆：[代价, v, u, v 的版本, u 的版本]
  const heap = [], ver = new Uint32Array(nv);
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top;
  };
  const offer = (v) => { if (!locked[v]) for (const u of nbrs(v)) push([err(v, u), v, u, ver[v], ver[u]]); };
  for (let v = 0; v < nv; v++) if (vf[v].size) offer(v);
  let left = nt;
  while (left > target && heap.length) {
    const [, v, u, sv, su] = pop();
    if (sv !== ver[v] || su !== ver[u] || !vf[v].size || locked[v]) continue;
    const shared = [...vf[v]].filter((t) => vf[u].has(t));
    if (!shared.length) continue;
    // 流形：v、u 的公共邻点只能是共享三角形里对着这条边的点
    const opp = new Set(shared.map((t) => F[t * 3 + ((at(t, v) + 1) % 3)] === u ? F[t * 3 + ((at(t, v) + 2) % 3)] : F[t * 3 + ((at(t, v) + 1) % 3)]));
    const nu = nbrs(u);
    if ([...nbrs(v)].some((w) => w !== u && nu.has(w) && !opp.has(w))) continue;
    if (seam[v] && !seamOk(v, u, shared)) continue;
    const m = uvMap(v, u, shared);
    if (!m) continue;
    // 翻面、退化（3D 和 UV 里都看）
    let ok = true;
    for (const t of vf[v]) {
      if (shared.includes(t)) continue;
      const tri = [0, 1, 2].map((k) => F[t * 3 + k]), n0 = normal(...tri.map(P)), n1 = normal(...tri.map((x) => P(x === v ? u : x)));
      const l0 = Math.hypot(...n0), l1 = Math.hypot(...n1);
      if (l1 < l0 * 0.02 || n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.5 * l0 * l1) { ok = false; break; }
      const tt = [0, 1, 2].map((k) => T[t * 3 + k]), k = at(t, v), a0 = uvArea(...tt);
      tt[k] = m.get(tt[k]);
      const a1 = uvArea(...tt);
      if (a0 * a1 <= 0 || Math.abs(a1) < Math.abs(a0) * 0.02) { ok = false; break; }
    }
    if (!ok) continue;
    for (const t of [...vf[v]]) {
      if (shared.includes(t)) { alive[t] = 0; left--; for (let k = 0; k < 3; k++) vf[F[t * 3 + k]].delete(t); continue; }
      const k = at(t, v);
      F[t * 3 + k] = u; T[t * 3 + k] = m.get(T[t * 3 + k]);
      vf[u].add(t);
    }
    vf[v].clear();
    for (let i = 0; i < 10; i++) Q[u * 10 + i] += Q[v * 10 + i];
    ver[u]++;
    offer(u);
    for (const w of nbrs(u)) if (!locked[w]) push([err(w, u), w, u, ver[w], ver[u]]);
  }
  g.faces = [];
  for (let t = 0; t < nt; t++) if (alive[t]) g.faces.push({ v: [F[t * 3], F[t * 3 + 1], F[t * 3 + 2]], t: [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]] });
  g.decimated = true;
  return g;
}
