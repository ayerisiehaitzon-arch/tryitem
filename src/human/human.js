// 人体：MakeHuman（CC0）的基础网格 + 形变目标 + 代理（头发、衣服、眉毛……）+ 骨骼权重，数据由 scripts/human/build.mjs 生成。
// 这里只做纯数组运算（不依赖 three.js）：按参数算出身体顶点、把代理贴到身体上、算关节位置、合成蒙皮权重。

// —— 读数据：bin 是 gzip 压缩的（有的服务器会自动解压，看前两个字节判断）——
async function fetchBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new DecompressionStream('gzip');
    return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
  }
  return buf.buffer;
}
const TYPES = { Float32: Float32Array, Uint16: Uint16Array, Uint32: Uint32Array, Int16: Int16Array, Uint8: Uint8Array };
const view = (buf, ref) => (ref ? new TYPES[ref.t](buf, ref.off, ref.n) : null);

export async function loadHuman(base) {
  const meta = await (await fetch(`${base}human.json`)).json();
  const buf = await fetchBin(`${base}human.bin`);
  const V = (r) => view(buf, r);
  const H = {
    base, meta, nv: meta.nv,
    pos0: V(meta.base),
    body: { map: V(meta.body.map), uv: V(meta.body.uv), index: V(meta.body.index) },
    targets: meta.targets.map((t) => ({ ...t, i: t.i ? V(t.i) : null, d: V(t.d) })),
    rig: { ...meta.rig, jverts: V(meta.rig.joints.verts), joff: V(meta.rig.joints.off), skinIndex: V(meta.rig.skinIndex), skinWeight: V(meta.rig.skinWeight) },
    proxies: Object.fromEntries(meta.proxies.map((p) => [p.id, p])),
    tq: meta.tq,
  };
  H.modifier = Object.fromEntries(meta.modifiers.map((m) => [m.id, m]));
  H.exprIndex = Object.fromEntries(meta.expr.map((e) => [e.id, e.t]));
  return H;
}

// —— 宏参数 → 各宏目标的权重（MakeHuman 的规则：每个目标名里的几个词各对应一个因子，相乘） ——
//   gender 0 女 … 1 男；age 0.5 = 25 岁 … 1 = 90 岁；muscle / weight / height / proportions / cup / firmness 0 … 1，0.5 是中间
export function macroFactors(m) {
  const tri = (x, lo, mid, hi) => {
    const a = Math.max(0, x * 2 - 1), b = Math.max(0, 1 - x * 2);
    return { [hi]: a, [lo]: b, [mid]: 1 - a - b };
  };
  const old = Math.max(0, Math.min(1, m.age * 2 - 1));
  const race = { african: m.african ?? 1 / 3, asian: m.asian ?? 1 / 3, caucasian: m.caucasian ?? 1 / 3 };
  const rs = race.african + race.asian + race.caucasian || 1;
  return {
    male: m.gender, female: 1 - m.gender,
    young: 1 - old, old,
    african: race.african / rs, asian: race.asian / rs, caucasian: race.caucasian / rs,
    ...tri(m.muscle, 'minmuscle', 'averagemuscle', 'maxmuscle'),
    ...tri(m.weight, 'minweight', 'averageweight', 'maxweight'),
    ...tri(m.height, 'minheight', 'averageheight', 'maxheight'),
    ...tri(m.proportions, 'uncommonproportions', 'regularproportions', 'idealproportions'),
    ...tri(m.cup ?? 0.5, 'mincup', 'averagecup', 'maxcup'),
    ...tri(m.firmness ?? 0.5, 'minfirmness', 'averagefirmness', 'maxfirmness'),
  };
}

// 全部目标的权重：宏（按因子相乘）+ 普通滑杆（-1…1：负的用 lo 目标，正的用 hi 目标）+ 表情单元（不在这里，表情走显卡变形）
export function targetWeights(H, macro, mods = {}) {
  const f = macroFactors(macro);
  const w = new Float32Array(H.targets.length);
  H.targets.forEach((t, i) => { if (t.f) w[i] = t.f.reduce((p, k) => p * (f[k] ?? 0), 1); });
  for (const [id, v] of Object.entries(mods)) {
    const m = H.modifier[id];
    if (!m || !v) continue;
    if (m.lo !== undefined) { if (v < 0) w[m.lo] += -v; else w[m.hi] += v; }
    else w[m.hi] += Math.max(0, v);
  }
  return w;
}

// 基础网格的顶点（米）：静止 + Σ 权重 × 目标
export function shape(H, weights, out = new Float32Array(H.nv * 3)) {
  out.set(H.pos0);
  const q = H.tq;
  H.targets.forEach((t, k) => {
    const w = weights[k];
    if (!w || Math.abs(w) < 1e-4) return;
    const s = w * q, d = t.d;
    if (!t.i) { for (let j = 0; j < d.length; j++) out[j] += d[j] * s; return; }
    const idx = t.i;
    for (let j = 0; j < idx.length; j++) { const o = idx[j] * 3; out[o] += d[j * 3] * s; out[o + 1] += d[j * 3 + 1] * s; out[o + 2] += d[j * 3 + 2] * s; }
  });
  return out;
}

// 一个目标展开成稠密的增量（米），表情单元做显卡变形用
export function denseTarget(H, k) {
  const t = H.targets[k], out = new Float32Array(H.nv * 3), q = H.tq;
  if (!t.i) { for (let j = 0; j < t.d.length; j++) out[j] = t.d[j] * q; return out; }
  for (let j = 0; j < t.i.length; j++) { const o = t.i[j] * 3; out[o] = t.d[j * 3] * q; out[o + 1] = t.d[j * 3 + 1] * q; out[o + 2] = t.d[j * 3 + 2] * q; }
  return out;
}

// 关节位置：每个关节 = 几个顶点的平均
export function joints(H, P) {
  const n = H.rig.joints.names.length, J = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) {
    const a = H.rig.joff[j], b = H.rig.joff[j + 1];
    let x = 0, y = 0, z = 0;
    for (let k = a; k < b; k++) { const v = H.rig.jverts[k] * 3; x += P[v]; y += P[v + 1]; z += P[v + 2]; }
    const c = b - a;
    J[j * 3] = x / c; J[j * 3 + 1] = y / c; J[j * 3 + 2] = z / c;
  }
  return J;
}

// —— 代理 ——
export async function loadProxy(H, id) {
  const p = H.proxies[id];
  if (!p) throw new Error('没有这个代理：' + id);
  if (p.data) return p;
  const buf = await fetchBin(H.base + p.file);
  const V = (r) => view(buf, r);
  p.data = { map: V(p.map), uv: V(p.uv), index: V(p.index), ref: V(p.ref), w: V(p.w), off: V(p.off), del: V(p.del) };
  return p;
}
// 代理顶点 = 三个基础顶点的加权和 + 偏移（按身体尺寸缩放：参考两个基础顶点之间的距离）
export function fitProxy(p, P, out = new Float32Array(p.nv * 3)) {
  const { ref, w, off } = p.data;
  const M = [0, 1, 2].map((a) => { const s = p.scale[a]; return s ? Math.abs(P[s[0] * 3 + a] - P[s[1] * 3 + a]) / s[2] : 1; });
  for (let i = 0; i < p.nv; i++) {
    const r0 = ref[i * 3] * 3, r1 = ref[i * 3 + 1] * 3, r2 = ref[i * 3 + 2] * 3, w0 = w[i * 3], w1 = w[i * 3 + 1], w2 = w[i * 3 + 2];
    for (let a = 0; a < 3; a++) out[i * 3 + a] = P[r0 + a] * w0 + P[r1 + a] * w1 + P[r2 + a] * w2 + M[a] * off[i * 3 + a];
  }
  return out;
}
// 代理顶点的蒙皮权重：三个参考顶点的权重按贴合权重混合，取最大的 4 个
export function proxySkin(H, p) {
  const { ref, w } = p.data, si = H.rig.skinIndex, sw = H.rig.skinWeight;
  const outI = new Uint16Array(p.nv * 4), outW = new Float32Array(p.nv * 4);
  const acc = new Map();
  for (let i = 0; i < p.nv; i++) {
    acc.clear();
    for (let k = 0; k < 3; k++) {
      const v = ref[i * 3 + k], wk = w[i * 3 + k];
      if (!wk) continue;
      for (let j = 0; j < 4; j++) { const b = si[v * 4 + j], x = (sw[v * 4 + j] / 255) * wk; if (x) acc.set(b, (acc.get(b) ?? 0) + x); }
    }
    const top = [...acc.entries()].filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([b, x], j) => { outI[i * 4 + j] = b; outW[i * 4 + j] = x / sum; });
    if (!top.length) outW[i * 4] = 1;
  }
  return { skinIndex: outI, skinWeight: outW };
}

// 法线：按“原始顶点”累加（UV 接缝两边拆开的渲染点共用一个），再展开到渲染点
export function renderNormals(P, map, index, nOrig, out = new Float32Array(map.length * 3)) {
  const acc = new Float32Array(nOrig * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = map[index[t]] * 3, b = map[index[t + 1]] * 3, c = map[index[t + 2]] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    acc[a] += nx; acc[a + 1] += ny; acc[a + 2] += nz; acc[b] += nx; acc[b + 1] += ny; acc[b + 2] += nz; acc[c] += nx; acc[c + 1] += ny; acc[c + 2] += nz;
  }
  for (let r = 0; r < map.length; r++) {
    const o = map[r] * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
    out[r * 3] = acc[o] / l; out[r * 3 + 1] = acc[o + 1] / l; out[r * 3 + 2] = acc[o + 2] / l;
  }
  return out;
}
// 原始顶点 → 渲染点
export function expand(P, map, out = new Float32Array(map.length * 3)) {
  for (let r = 0; r < map.length; r++) { const o = map[r] * 3; out[r * 3] = P[o]; out[r * 3 + 1] = P[o + 1]; out[r * 3 + 2] = P[o + 2]; }
  return out;
}
