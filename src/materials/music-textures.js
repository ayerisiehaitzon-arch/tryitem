// 琴房的程序化贴图：钢琴图集（俯视的音板 / 铸铁板 / 琴弦 / 弦轴 / 制音器、一个八度的琴键、纯色格子）和乐谱（四页）。
import { perlin, mulberry } from './noise.js';
import { PIANO_ATLAS, SCORE } from './atlas.js';
import { painter, sdRoundRect, sdSeg } from './laundry-textures.js';
import { text } from './gym-textures.js';
import { GRAND, KEYS, BLACK_IN_OCTAVE, HARP, STRINGS, grandOutline, offsetLine, noteStrings, stringDir, noteXAt } from '../music/outline.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
// 周期 T 的余弦在一个像素（宽 w）上的平均：细到接近像素的条纹不闪、不出摩尔纹
const cosAA = (x, T, w) => { const a = (Math.PI * w) / T; return Math.cos((2 * Math.PI * x) / T) * (a < 1e-4 ? 1 : Math.sin(a) / a); };

function alloc(S, extra = []) {
  const o = { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
  for (const k of extra) o[k] = new Float32Array(S * S);
  return o;
}
function put(out, i, c, h, r, m = 0) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h;
  out.rough[i] = r;
  if (out.metal) out.metal[i] = m;
}
// 把一层画上去：覆盖率 a 混进颜色、高度、粗糙度、金属度（null 的通道不动）
function blend(out, k, a, { color = null, height = null, rough = null, metal = null }) {
  if (color) for (let c = 0; c < 3; c++) out.color[k * 3 + c] = mix(out.color[k * 3 + c], color[c], a);
  if (height !== null) out.height[k] = mix(out.height[k], height, a);
  if (rough !== null) out.rough[k] = mix(out.rough[k], rough, a);
  if (metal !== null && out.metal) out.metal[k] = mix(out.metal[k], metal, a);
}

// —— 欧氏距离变换（Felzenszwalb & Huttenlocher）：每个像素到最近的目标像素的距离（米；hx、hy 是一个像素的宽、高）——
function dt1(f, n, h, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  const inter = (q, p) => ((f[q] + (q * h) ** 2) - (f[p] + (p * h) ** 2)) / (2 * h * (q - p));
  for (let q = 1; q < n; q++) {
    let s = inter(q, v[k]);
    while (s <= z[k]) { k--; s = inter(q, v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q * h) k++;
    const dq = (q - v[k]) * h;
    d[q] = dq * dq + f[v[k]];
  }
}
function edt(target, W, H, hx, hy) {
  const f = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) f[i] = target[i] ? 0 : 1e20;
  const n = Math.max(W, H);
  const g = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) g[y] = f[y * W + x];
    dt1(g, H, hy, d, v, z);
    for (let y = 0; y < H; y++) f[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) g[x] = f[y * W + x];
    dt1(g, W, hx, d, v, z);
    for (let x = 0; x < W; x++) f[y * W + x] = Math.sqrt(d[x]);
  }
  return f;
}
// 有符号距离（里面为负）：两次距离变换，边界在相邻像素中心的中间
function sdfOf(mask, W, H, hx, hy) {
  const dOut = edt(mask, W, H, hx, hy);
  const inv = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) inv[i] = mask[i] ? 0 : 1;
  const dIn = edt(inv, W, H, hx, hy);
  const half = 0.25 * (hx + hy);
  const sd = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) sd[i] = mask[i] ? -(dIn[i] - half) : dOut[i] - half;
  return sd;
}
// 形态学开运算（先腐蚀 r 再膨胀 r）：开口的凸角倒成半径 r 的圆角
function roundOpen(mask, W, H, hx, hy, r) {
  const inv = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) inv[i] = mask[i] ? 0 : 1;
  const dIn = edt(inv, W, H, hx, hy);
  const core = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) core[i] = mask[i] && dIn[i] > r ? 1 : 0;
  const dCore = edt(core, W, H, hx, hy);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = dCore[i] <= r ? 1 : 0;
  return out;
}

// —— 纯色格子 ——
function swatches(out, S, A, k) {
  const [x0, y0, x1, y1] = A.regions.swatch.map((v) => Math.round(v * k));
  const rows = Math.ceil(A.swatches.length / A.cols);
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / rows;
  A.swatches.forEach((s, i) => {
    const c = rgb(s.c);
    const cx = x0 + Math.round((i % A.cols) * w), cy = y0 + Math.round(Math.floor(i / A.cols) * h);
    for (let y = cy; y < cy + Math.round(h); y++) for (let x = cx; x < cx + Math.round(w); x++) put(out, y * S + x, c, 0, s.rough, s.metal ?? 0);
  });
}

// ——————————————————————— 音板 / 铸铁板 / 琴弦 ———————————————————————
// 俯视的一整块，从后往前一层层画：
//   · 音板：云杉，斜着的细密年轮，几块拼板深浅略有不同；只在铁板的开口里、铁板和琴壳之间的缝里露出来，
//     挨着铁板边的地方压暗（铁板比音板高出几厘米）；
//   · 音板上的琴码（枫木，顶上一道石墨）和码钉 —— 同样只在开口里看得见；
//   · 铸铁板：金色金属漆，前面一整条压着弦轴，后面几根撑梁把中间分成四个开口（圆角），边上一圈压暗的倒角；
//     撑梁后面一块实心的地方铸着凸起的“TRYITEM”；几颗镀镍的大螺栓把铁板固定在琴壳上；
//   · 弦轴三排错开，每根一圈绕着的弦；高音区一道压弦条，低音区一颗颗铜弦枕；
//   · 琴弦：低音缠铜弦（两头各露出一小段钢芯）斜着压在中音区上面，其余钢弦笔直往后；
//     弦下面一道淡淡的影子（在铁板上窄、在更深的音板上宽而淡）；挂弦钉前面一条酒红色的止音呢；
//   · 制音器：一排黑色漆面的木块（低音区顺着斜弦的方向），几何上是一个盒子，顶面按位置投影到这里。
const HOLES = {
  gap: 0.008,      // 铁板和琴壳内沿之间的缝
  flange: 0.075,   // 铁板边框宽（从琴壳内沿算）
  zo: -0.43,       // 开口的前沿
  r: 0.035,        // 开口的圆角
  strut: 0.024,    // 撑梁半宽
  // 撑梁：[z = zo 处的 x, z = -1.3 处的 x]
  struts: [[-0.47, -0.42], [-0.12, -0.02], [0.2, 0.33]],
  back3: -0.86,    // 第三个开口的后沿（再往后一块实心，铸字）
};
const BOLTS = [[-0.655, -0.62], [-0.655, -1.12], [-0.43, -1.5], [0.02, -1.22], [0.4, -0.86], [0.63, -0.5], [-0.3, -0.4], [0.05, -0.4], [0.4, -0.4]];

function harp(out, S, b, P) {
  const m = Math.round((2 * S) / PIANO_ATLAS.size);
  const W = b[2] - b[0], H = b[3] - b[1];
  const hx = (HARP.x1 - HARP.x0) / (W - 2 * m), hz = (HARP.z0 - HARP.z1) / (H - 2 * m), hp = (hx + hz) / 2;
  const X = (i) => HARP.x0 + (i + 0.5 - m) * hx, Z = (j) => HARP.z0 - (j + 0.5 - m) * hz;
  const K = (i, j) => (b[1] + j) * S + b[0] + i;
  const N = W * H;
  const nA = perlin(P.seed), nB = perlin(P.seed + 1), nC = perlin(P.seed + 2);
  const rnd = mulberry(P.seed + 3);

  // 扫描线填多边形（世界坐标的闭合折线）
  const fillPoly = (poly) => {
    const mask = new Uint8Array(N);
    for (let j = 0; j < H; j++) {
      const z = Z(j), xs = [];
      for (let a = 0; a < poly.length; a++) {
        const p = poly[a], q = poly[(a + 1) % poly.length];
        if ((p[1] > z) !== (q[1] > z)) xs.push(p[0] + ((z - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
      }
      xs.sort((a, c) => a - c);
      for (let s = 0; s + 1 < xs.length; s += 2) {
        const i0 = Math.max(0, Math.ceil((xs[s] - HARP.x0) / hx + m - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[s + 1] - HARP.x0) / hx + m - 0.5));
        for (let i = i0; i <= i1; i++) mask[j * W + i] = 1;
      }
    }
    return mask;
  };
  // 线段：世界坐标，宽 w；fn(k, 覆盖率, 网格下标, 到中线的距离)
  const seg = (a, c, w, fn) => {
    const r = w / 2 + 2 * hp;
    const i0 = Math.max(0, Math.floor((Math.min(a[0], c[0]) - r - HARP.x0) / hx + m)), i1 = Math.min(W - 1, Math.ceil((Math.max(a[0], c[0]) + r - HARP.x0) / hx + m));
    const j0 = Math.max(0, Math.floor((HARP.z0 - Math.max(a[1], c[1]) - r) / hz + m)), j1 = Math.min(H - 1, Math.ceil((HARP.z0 - Math.min(a[1], c[1]) + r) / hz + m));
    const dx = c[0] - a[0], dz = c[1] - a[1], L2 = dx * dx + dz * dz + 1e-12;
    for (let j = j0; j <= j1; j++) {
      const z = Z(j);
      for (let i = i0; i <= i1; i++) {
        const x = X(i);
        const t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / L2);
        const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
        const cov = clamp01(0.5 - (d - w / 2) / hp);
        if (cov > 0) fn(K(i, j), cov, j * W + i, d);
      }
    }
  };
  const disc = (c, r, fn) => seg(c, c, 2 * r, fn);
  const polyline = (pts, w, fn) => { for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1], w, fn); };

  // —— 轮廓和几块区域 ——
  const outer = grandOutline({ tail: 96, bent: 160 });
  const inner = offsetLine(outer, GRAND.t);
  const hitch = offsetLine(outer, GRAND.t + STRINGS.hitch);
  const deck = fillPoly(inner);
  const sdDeck = sdfOf(deck, W, H, hx, hz);
  const flange = fillPoly(offsetLine(outer, GRAND.t + HOLES.flange));
  const strutX = (s, z) => s[0] + ((s[1] - s[0]) * (HOLES.zo - z)) / (HOLES.zo + 1.3);
  const holeRaw = new Uint8Array(N);
  for (let j = 0; j < H; j++) {
    const z = Z(j);
    if (z > HOLES.zo) continue;
    const xs = HOLES.struts.map((s) => strutX(s, z));
    for (let i = 0; i < W; i++) {
      const q = j * W + i;
      if (!flange[q]) continue;
      const x = X(i);
      let slot = 0;
      while (slot < xs.length && x > xs[slot] - HOLES.strut) slot++;
      // 落在撑梁上
      if (slot > 0 && x < xs[slot - 1] + HOLES.strut) continue;
      if (slot === 2 && z < HOLES.back3) continue;
      holeRaw[q] = 1;
    }
  }
  const hole = roundOpen(holeRaw, W, H, hx, hz, HOLES.r);
  const plate = new Uint8Array(N);
  for (let q = 0; q < N; q++) plate[q] = deck[q] && sdDeck[q] < -HOLES.gap && !hole[q] ? 1 : 0;
  const sdPlate = sdfOf(plate, W, H, hx, hz);
  const plateCov = new Float32Array(N);
  for (let q = 0; q < N; q++) plateCov[q] = clamp01(0.5 - sdPlate[q] / hp);

  // —— 底色：音板（云杉）/ 铁板（金漆）/ 琴壳外面（黑）——
  const gold = rgb([204, 156, 74]), spruce = rgb([230, 208, 164]), late = rgb([204, 170, 120]);
  // 年轮方向：从左前往右后斜着走
  const gu = [0.5, -0.866];
  for (let j = 0; j < H; j++) {
    const z = Z(j);
    for (let i = 0; i < W; i++) {
      const x = X(i), q = j * W + i, k = K(i, j);
      if (sdDeck[q] > 1.5 * hp) { put(out, k, rgb([10, 10, 11]), 0, 0.3); continue; }
      // 音板：年轮（和走向垂直的坐标 s 上的细条纹，按像素宽度平均）+ 几块拼板的深浅
      const s = x * -gu[1] + z * gu[0], along = x * gu[0] + z * gu[1];
      const wob = 0.0012 * nA(along * 3, s * 40);
      const ring = 0.5 + 0.5 * cosAA(s + wob, 0.0024, hp);
      const board = Math.floor(s / 0.095);
      const tone = 1 + ((((board * 7919) % 13) / 13) - 0.5) * 0.07;
      let sb = mul(mix3(spruce, late, ring * 0.45 + 0.12 * nB(s * 30, along * 4)), tone);
      // 挨着铁板、琴壳的地方压暗（音板在铁板底下几厘米）
      const dp = Math.max(0, sdPlate[q]), dr = Math.max(0, -sdDeck[q]);
      sb = mul(sb, (1 - 0.55 * Math.exp(-dp / 0.012)) * (1 - 0.5 * Math.exp(-dr / 0.006)));
      put(out, k, sb, 0, 0.55);
      // 铁板：金色金属漆，铸件表面细细的起伏；边上 3mm 的倒角压暗
      const cov = plateCov[q];
      if (cov > 0) {
        const e = clamp01(-sdPlate[q] / 0.003);
        const mot = 1 + 0.035 * nC(x * 6, z * 6) + 0.02 * nA(x * 90, z * 90);
        const pc = mul(gold, mot * (0.62 + 0.38 * e));
        blend(out, k, cov, { color: pc, height: 0.45 + 0.2 * e, rough: 0.4, metal: 1 });
      }
    }
  }
  const onBoard = (fn) => (k, a, q, d) => { const v = a * (1 - plateCov[q]); if (v > 0) fn(k, v, q, d); };

  // —— 琴弦：先算好每根弦的两端 ——
  // 后端：从弦轴沿弦的方向往后，和挂弦钉那条线的第一个交点
  const hitAt = (p, d) => {
    let best = Infinity;
    for (let i = 0; i + 1 < hitch.length; i++) {
      const a = hitch[i], c = hitch[i + 1];
      const ex = c[0] - a[0], ez = c[1] - a[1];
      const den = d[0] * ez - d[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - p[0]) * ez - (a[1] - p[1]) * ex) / den;
      const u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
      if (t > 0.05 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return [p[0] + d[0] * best, p[1] + d[1] * best];
  };
  const strings = [];
  let g = 0;
  for (let n = 1; n <= 88; n++) {
    const s = noteStrings(n), d = stringDir(n);
    for (let c = 0; c < s.count; c++) {
      const off = s.count === 1 ? 0 : s.count === 2 ? (c - 0.5) * 2 * s.spread : (c - 1) * s.spread;
      const z0 = STRINGS.rows[g % 3];
      // 同一个键的几根弦平行：弦轴在不同的排，x 顺着弦的方向补回来
      const x0 = s.x + off + (d[0] / -d[1]) * (STRINGS.rows[1] - z0);
      const a = [x0, z0];
      strings.push({ n, a, b: hitAt(a, d), d, w: s.d, kind: s.kind, tone: 1 + (rnd() - 0.5) * 0.08 });
      g++;
    }
  }
  const pointAlong = (st, dist) => [st.b[0] - st.d[0] * dist, st.b[1] - st.d[1] * dist];

  // —— 音板上的琴码：长码（中高音）、低音码，各距挂弦钉十来厘米 ——
  const bridgeStyle = { color: rgb([186, 136, 84]), height: 0.18, rough: 0.5, metal: 0 };
  const longBridge = strings.filter((s) => s.n > 20 && s.n % 4 === 0).map((s) => pointAlong(s, 0.125));
  const bassBridge = strings.filter((s) => s.n <= 20 && s.n % 3 === 1).map((s) => pointAlong(s, 0.11));
  for (const br of [longBridge, bassBridge]) {
    polyline(br, 0.026, onBoard((k, a) => blend(out, k, a, bridgeStyle)));
    polyline(br, 0.007, onBoard((k, a) => blend(out, k, a * 0.8, { color: rgb([66, 60, 56]), rough: 0.6 })));
  }
  for (const st of strings) {
    const p = pointAlong(st, st.n <= 20 ? 0.11 : 0.125);
    for (const s of [-1, 1]) disc([p[0] + s * 0.004, p[1] + s * 0.003], 0.0011, onBoard((k, a) => blend(out, k, a, { color: rgb([210, 210, 214]), height: 0.3, rough: 0.3, metal: 1 })));
  }

  // —— 铁板上的东西：铸字、螺栓、压弦条、弦枕 ——
  const { fill } = painter(out, S, [b[0] + m, b[1] + m, b[2] - m, b[3] - m], HARP.x1 - HARP.x0, HARP.z0 - HARP.z1);
  // painter 的坐标：(x - x0, z0 - z)
  const F = (sdf, bb, style) => fill((px, py) => sdf(px + HARP.x0, HARP.z0 - py), [bb[0] - HARP.x0, HARP.z0 - bb[3], bb[2] - HARP.x0, HARP.z0 - bb[1]], style);
  {
    // 凸起的字：先往右下错一点画一道影子，再画亮面。字头朝着尾部 —— 坐在琴键前往里看，字是正的：
    // 这时 +x 在右手边、尾部在“上”，而贴图的 v 是朝尾部往下走的，所以整行字上下翻过来画（左右不翻）
    const cast = { color: rgb([246, 222, 160]), height: 0.85, rough: 0.28, metal: 1 };
    const shadow = { color: rgb([120, 86, 36]), height: 0.5 };
    const tx = (HOLES.struts[1][0] + HOLES.struts[2][0]) / 2 + 0.03, tz = -0.95;
    const cx = tx - HARP.x0, cy = HARP.z0 - tz;
    const rot = (sdf, bb, st) => fill((x, y) => sdf(x, 2 * cy - y), [bb[0], 2 * cy - bb[3], bb[2], 2 * cy - bb[1]], st);
    const put2 = (str, y, h, stroke) => {
      text(rot, str, cx + 0.0015, cy + y + 0.0015, h, { align: 'center', stroke, ...shadow });
      text(rot, str, cx, cy + y, h, { align: 'center', stroke, ...cast });
    };
    put2('TRYITEM', -0.018, 0.036, 0.2);
    put2('MODEL 160', 0.03, 0.014, 0.18);
  }
  for (const [bx, bz] of BOLTS) {
    F((x, z) => Math.hypot(x - bx, z - bz) - 0.011, [bx - 0.013, bz - 0.013, bx + 0.013, bz + 0.013], { color: rgb([120, 100, 64]), height: 0.5, rough: 0.5, metal: 1 });
    F((x, z) => Math.hypot(x - bx, z - bz) - 0.0085, [bx - 0.01, bz - 0.01, bx + 0.01, bz + 0.01], { color: rgb([204, 202, 196]), height: 1, rough: 0.28, metal: 1 });
    F((x, z) => Math.hypot(x - bx - 0.002, z - bz - 0.002) - 0.004, [bx - 0.004, bz - 0.004, bx + 0.008, bz + 0.008], { color: rgb([236, 236, 234]), rough: 0.18 });
  }
  const [c0, c1] = STRINGS.capo, xc0 = noteXAt(29, 0) - 0.012;
  F((x, z) => sdRoundRect(x, z, (xc0 + 0.675) / 2, (c0 + c1) / 2, (0.675 - xc0) / 2, (c0 - c1) / 2, 0.004), [xc0, c1, 0.675, c0], { color: mul(gold, 0.95), height: 0.9, rough: 0.34, metal: 1 });
  F((x, z) => sdRoundRect(x, z, (xc0 + 0.675) / 2, c0 - 0.003, (0.675 - xc0) / 2 - 0.003, 0.0015, 0.0015), [xc0, c0 - 0.006, 0.675, c0], { color: rgb([246, 222, 160]), height: 1 });
  for (let n = 1; n <= 28; n++) {
    const zc = (c0 + c1) / 2, xa = noteXAt(n, zc);
    F((x, z) => sdRoundRect(x, z, xa, zc, 0.0042, 0.0063, 0.0016), [xa - 0.005, zc - 0.007, xa + 0.005, zc + 0.007], { color: rgb([92, 70, 40]), height: 0.8 });
    F((x, z) => sdRoundRect(x, z, xa, zc, 0.0034, 0.0055, 0.0012), [xa - 0.004, zc - 0.006, xa + 0.004, zc + 0.006], { color: rgb([240, 224, 180]), height: 1, rough: 0.22, metal: 1 });
  }
  // 挂弦钉前面的止音呢（酒红色，编在弦之间）：顺着琴壳，从尾部最靠左的那根弦一直到最高音那根
  {
    const line = offsetLine(outer, GRAND.t + STRINGS.hitch + 0.016);
    const near = (p) => line.reduce((bi, q, i) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(line[bi][0] - p[0], line[bi][1] - p[1]) ? i : bi), 0);
    const ids = strings.map((st) => near(st.b));
    const felt = line.slice(Math.max(0, Math.min(...ids) - 2), Math.max(...ids) + 3);
    polyline(felt, 0.013, (k, a) => blend(out, k, a, { color: rgb([118, 34, 44]), height: 0.7, rough: 0.95, metal: 0 }));
  }

  // —— 弦轴：一圈绕着的弦 + 亮的轴头 ——
  for (const st of strings) {
    const [px, pz] = st.a;
    disc([px, pz], 0.0046, (k, a) => blend(out, k, a, { color: rgb([118, 118, 124]), height: 1, rough: 0.3, metal: 1 }));
    disc([px, pz], 0.0033, (k, a, q, d) => blend(out, k, a, { color: mul(rgb([226, 228, 232]), 1 - 0.25 * (d / 0.0033)), height: 1.2, rough: 0.18, metal: 1 }));
    disc([px, pz], 0.0007, (k, a) => blend(out, k, a, { color: rgb([70, 70, 76]) }));
  }

  // —— 琴弦的影子，再是琴弦 ——
  for (const st of strings) {
    seg(st.a, st.b, st.w * 2 + 0.0012, (k, a, q) => {
      const pc = plateCov[q];
      blend(out, k, a * (0.16 * pc + 0.1 * (1 - pc)), { color: [0, 0, 0] });
    });
  }
  for (const st of strings) {
    const steel = { color: mul(rgb([204, 206, 212]), st.tone), height: 1.25, rough: 0.2, metal: 1 };
    if (st.kind === 'steel') {
      seg(st.a, st.b, st.w, (k, a, q, d) => blend(out, k, a, { ...steel, color: mul(steel.color, 1 - 0.3 * clamp01(d / (st.w / 2 + 1e-5))) }));
      continue;
    }
    // 缠弦：细钢芯一通到底，中间一大段缠着铜丝（两头各露 3cm 钢芯）
    seg(st.a, st.b, st.w * 0.35, (k, a) => blend(out, k, a, steel));
    const L = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]);
    const p0 = [st.a[0] + (st.d[0] * 0.03), st.a[1] + (st.d[1] * 0.03)], p1 = pointAlong(st, 0.03);
    if (L > 0.1) {
      const cu = mul(rgb([198, 128, 80]), st.tone);
      seg(p0, p1, st.w, (k, a, q, d) => blend(out, k, a, { color: mul(cu, 1 - 0.35 * clamp01(d / (st.w / 2))), height: 1.35, rough: 0.3, metal: 1 }));
    }
  }
  // 挂弦钉
  for (const st of strings) disc(st.b, 0.0021, (k, a) => blend(out, k, a, { color: rgb([214, 214, 218]), height: 1.3, rough: 0.25, metal: 1 }));

  // —— 制音器：黑色漆面木块，低音区顺着斜弦（平行四边形）——
  {
    const [zA, zB] = STRINGS.damper, zc = (zA + zB) / 2, hl = (zA - zB) / 2;
    for (let n = 1; n <= STRINGS.dampers; n++) {
      const d = stringDir(n), xc = noteXAt(n, zc);
      const hw = n <= 20 ? 0.0043 : 0.0066;
      // 前后两条边是水平的；两侧的边顺着弦（低音区是斜的）：到弦中线的垂直距离
      const sd = (x, z) => {
        const rx = x - xc, rz = z - zc;
        return Math.max(Math.abs(rz) - hl, Math.abs(rx * -d[1] + rz * d[0]) - hw);
      };
      F((x, z) => sd(x, z) - 0.0008, [xc - 0.03, zB - 0.004, xc + 0.03, zA + 0.004], { color: rgb([8, 8, 8]), height: 1.3 });
      F(sd, [xc - 0.03, zB - 0.004, xc + 0.03, zA + 0.004], { color: rgb([30, 28, 28]), height: 1.6, rough: 0.32, metal: 0 });
      F((x, z) => sd(x, z) + 0.0016, [xc - 0.03, zB - 0.004, xc + 0.03, zA + 0.004], { color: rgb([44, 42, 42]), height: 1.7 });
    }
  }
}

// ——————————————————————— 琴键：一个八度 ———————————————————————
// 顶面：七个象牙白的白键（键与键之间 1mm 的缝、缝边一点点圆角、前沿一道细的暗线），加上画上去的五个黑键；
// 前脸：同样的七个键的正面，上沿亮一点、下沿暗一点
function keys(out, S, bo, bf, P) {
  const m = Math.round((2 * S) / PIANO_ATLAS.size);
  const w = KEYS.w, OW = 7 * w, len = KEYS.front - KEYS.back, fh = 0.022;
  const n = perlin(P.seed + 10);
  const ivory = rgb([242, 239, 230]);
  // 到最近的键缝的距离（周期 w）
  const gapDist = (X) => { const r = ((X % w) + w) % w; return Math.min(r, w - r); };
  // 顶面：u 横跨八度，v = 0 在区域下沿（琴键前沿）
  for (let y = bo[1]; y < bo[3]; y++) for (let x = bo[0]; x < bo[2]; x++) {
    const u = (x + 0.5 - bo[0] - m) / (bo[2] - bo[0] - 2 * m), v = (bo[3] - (y + 0.5)) / (bo[3] - bo[1] - m);
    const Xm = u * OW, Ym = v * len, px = OW / (bo[2] - bo[0] - 2 * m);
    const key = Math.floor((((Xm % OW) + OW) % OW) / w);
    const tone = 1 + 0.012 * Math.sin(key * 2.3 + 1) + 0.006 * n(Xm * 400, Ym * 60);
    const dg = gapDist(Xm);
    const gap = clamp01(0.5 - (dg - 0.0005) / px);
    const edge = sstep(0.0005, 0.0013, dg) * sstep(0, 0.0007, Ym);
    let c = mul(ivory, tone * (0.86 + 0.14 * edge));
    c = mix3(c, rgb([46, 42, 40]), gap);
    put(out, y * S + x, c, 0.4 + 0.6 * edge * (1 - gap), 0.22 + 0.2 * gap);
    // 画上去的黑键（LOD2 用）：从琴键后端往前 95mm
    const Xo = ((Xm % OW) + OW) % OW;
    for (const bc of BLACK_IN_OCTAVE) {
      const db = Math.abs(Xo - bc) - KEYS.blackW / 2;
      const a = clamp01(0.5 - db / px) * clamp01(0.5 - (len - KEYS.blackLen - Ym) / px);
      if (a > 0) blend(out, y * S + x, a, { color: rgb([22, 21, 21]), height: 1, rough: 0.3 });
    }
  }
  // 前脸：u 横跨八度，v = 0 在区域上沿（键顶的前沿）
  for (let y = bf[1]; y < bf[3]; y++) for (let x = bf[0]; x < bf[2]; x++) {
    const u = (x + 0.5 - bf[0] - m) / (bf[2] - bf[0] - 2 * m), v = (y + 0.5 - bf[1]) / (bf[3] - bf[1] - m);
    const Xm = u * OW, Yf = v * fh, px = OW / (bf[2] - bf[0] - 2 * m);
    const dg = gapDist(Xm);
    const gap = clamp01(0.5 - (dg - 0.0005) / px);
    const shade = (1 - 0.1 * sstep(0.014, fh, Yf)) * (1 + 0.04 * (1 - sstep(0, 0.0012, Yf)));
    const c = mix3(mul(rgb([236, 233, 224]), shade), rgb([40, 38, 36]), gap);
    put(out, y * S + x, c, 0.5 * (1 - gap), 0.24 + 0.2 * gap);
  }
}

export function pianoAtlas(S, P) {
  const A = PIANO_ATLAS, k = S / A.size;
  const out = alloc(S, ['metal']);
  const box = (r) => r.map((v) => Math.round(v * k));
  swatches(out, S, A, k);
  harp(out, S, box(A.regions.harp), P);
  keys(out, S, box(A.regions.octave), box(A.regions.keyfront), P);
  return out;
}

// ——————————————————————— 乐谱 ———————————————————————
// 四页（2 × 2 格）：钢琴谱两页（大谱表：高音 + 低音谱表，左边一个花括号）、小提琴分谱两页（单行谱表）。
// 音符是随机的，但按记谱的规矩画：符头是斜的椭圆，符干在符头右边朝上 / 左边朝下，八分音符连成符杠，
// 超出谱表的音加短的加线；每行开头有谱号和调号（两个降号），第一行还有拍号；标题、速度、页码用细线字体。
// 坐标：米，页面左上角为原点，y 向下；谱表上的音高用“线间距”（sp）为单位、从最下面一条线往上数（0 ~ 4 是五条线）
const SP = 0.0022;
const INK = { color: rgb([34, 31, 28]), height: 1, rough: 0.7 };
const PAPER = rgb([246, 242, 232]);

// 高音谱号：一笔画下来（里圈绕着第二线的 G，外圈，往上到顶上的小圈，一竖穿过谱表，底下一个钩）
const G_CLEF = [
  [0.95, 1.45], [0.72, 1.75], [0.32, 1.66], [0.1, 1.2], [0.22, 0.66], [0.68, 0.34], [1.2, 0.48], [1.48, 1.0], [1.42, 1.62],
  [1.02, 2.22], [0.55, 2.86], [0.34, 3.6], [0.48, 4.4], [0.78, 4.95], [0.98, 4.62], [0.98, 4.0], [0.74, 3.2], [0.62, 2.0],
  [0.7, 0.4], [0.76, -0.6], [0.56, -1.02], [0.24, -0.92],
];
// 低音谱号：第四线上起笔的一个圆点，往右上绕一个弯再往左下收尖；右边两个点夹着第四线
const F_CLEF = [[0.3, 3.0], [0.42, 3.56], [0.92, 3.8], [1.42, 3.52], [1.58, 2.9], [1.32, 2.1], [0.82, 1.4], [0.2, 0.86]];

function scorePage(fill, page, rand) {
  const W = 0.23, ML = 0.02, MR = 0.018;
  const line = (a, b, w, st = INK) => fill((x, y) => sdSeg(x, y, a, b, w), [Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w], st);
  const dot = (c, r, st = INK) => fill((x, y) => Math.hypot(x - c[0], y - c[1]) - r, [c[0] - r, c[1] - r, c[0] + r, c[1] + r], st);
  const poly = (pts, w) => { for (let i = 0; i + 1 < pts.length; i++) line(pts[i], pts[i + 1], typeof w === 'function' ? w(i / (pts.length - 2)) : w); };
  // 斜的椭圆符头（hollow：空心的二分音符）
  const head = (cx, cy, hollow = false) => {
    const a = -0.35, ca = Math.cos(a), sa = Math.sin(a);
    const ell = (rx, ry) => (x, y) => {
      const dx = x - cx, dy = y - cy, u = dx * ca - dy * sa, v = dx * sa + dy * ca;
      return (Math.hypot(u / rx, v / ry) - 1) * Math.min(rx, ry);
    };
    const r = 0.7 * SP;
    fill(ell(0.62 * SP, 0.44 * SP), [cx - r, cy - r, cx + r, cy + r], INK);
    if (hollow) fill(ell(0.42 * SP, 0.18 * SP), [cx - r, cy - r, cx + r, cy + r], { color: PAPER, height: 0, rough: 0.8 });
  };
  const flat = (x, y) => {
    line([x, y - 2 * SP], [x, y + 0.4 * SP], 0.12 * SP);
    poly([[x, y + 0.4 * SP], [x + 0.55 * SP, y - 0.1 * SP], [x + 0.48 * SP, y - 0.5 * SP], [x, y - 0.25 * SP]], 0.13 * SP);
  };

  // 一行谱表：五条线；返回把“音高（sp，最下面一条线 = 0）”换算成 y 的函数
  const staff = (x0, x1, yTop) => {
    for (let i = 0; i < 5; i++) line([x0, yTop + i * SP], [x1, yTop + i * SP], 0.00026);
    return (p) => yTop + (4 - p) * SP;
  };
  const clef = (kind, x, Y) => {
    if (kind === 'G') {
      poly(G_CLEF.map(([a, b]) => [x + a * SP, Y(b)]), (t) => (0.16 + 0.1 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * SP);
      dot([x + 0.3 * SP, Y(-0.7)], 0.28 * SP);
    } else {
      poly(F_CLEF.map(([a, b]) => [x + a * SP, Y(b)]), (t) => (0.34 - 0.24 * t) * SP);
      dot([x + 0.36 * SP, Y(3.0)], 0.3 * SP);
      dot([x + 2.0 * SP, Y(3.5)], 0.15 * SP);
      dot([x + 2.0 * SP, Y(2.5)], 0.15 * SP);
    }
  };
  // 加线：超出谱表的音
  const ledgers = (x, p, Y) => {
    for (let q = -1; q >= p - 0.01; q--) line([x - 0.95 * SP, Y(q)], [x + 0.95 * SP, Y(q)], 0.14 * SP);
    for (let q = 5; q <= p + 0.01; q++) line([x - 0.95 * SP, Y(q)], [x + 0.95 * SP, Y(q)], 0.14 * SP);
  };
  // 一个音（或一个和弦）：返回符干末端，给符杠用
  const note = (x, ps, Y, { hollow = false, stem = true, up = null, len = 3.3, dotted = false } = {}) => {
    const mid = ps.reduce((s, p) => s + p, 0) / ps.length;
    const dir = up ?? mid < 2;
    for (const p of ps) { ledgers(x, p, Y); head(x, Y(p), hollow); }
    if (dotted) dot([x + 1.1 * SP, Y(Math.round(ps[0] * 2) % 2 === 0 ? ps[0] + 0.5 : ps[0])], 0.17 * SP);
    if (!stem) return null;
    const sx = dir ? x + 0.56 * SP : x - 0.56 * SP;
    const pFar = dir ? Math.max(...ps) + len : Math.min(...ps) - len, pNear = dir ? Math.min(...ps) : Math.max(...ps);
    line([sx, Y(pNear)], [sx, Y(pFar)], 0.12 * SP);
    return { x: sx, y: Y(pFar), up: dir };
  };
  const beam = (ends, n = 1) => {
    if (ends.length < 2) return;
    const a = ends[0], b = ends[ends.length - 1];
    const slope = Math.max(-0.12, Math.min(0.12, (b.y - a.y) / (b.x - a.x)));
    const yAt = (x) => a.y + slope * (x - a.x);
    // 符干接到符杠上
    for (const e of ends) line([e.x, e.y], [e.x, yAt(e.x)], 0.12 * SP);
    for (let k = 0; k < n; k++) {
      const off = (a.up ? 1 : -1) * k * 0.75 * SP, t = 0.24 * SP;
      const P = [[a.x, yAt(a.x) + off - t], [b.x, yAt(b.x) + off - t], [b.x, yAt(b.x) + off + t], [a.x, yAt(a.x) + off + t]];
      fill((x, y) => { let d = -Infinity; for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; const nx = q[1] - p[1], ny = p[0] - q[0], l = Math.hypot(nx, ny); d = Math.max(d, ((x - p[0]) * nx + (y - p[1]) * ny) / l); } return d; },
        [a.x - SP, Math.min(yAt(a.x), yAt(b.x)) - SP, b.x + SP, Math.max(yAt(a.x), yAt(b.x)) + SP], INK);
    }
  };
  const slur = (a, b, lift) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - lift * 4 * t * (1 - t)]); }
    poly(pts, (t) => (0.07 + 0.1 * Math.sin(Math.PI * t)) * SP);
  };
  const hairpin = (x0, x1, y, open) => {
    const h = 0.55 * SP;
    line([open ? x0 : x1, y], [open ? x1 : x0, y - h], 0.1 * SP);
    line([open ? x0 : x1, y], [open ? x1 : x0, y + h], 0.1 * SP);
  };
  const keySig = (x, Y, kind) => {
    const ps = kind === 'G' ? [2, 3.5] : [1, 2.5];
    ps.forEach((p, i) => flat(x + i * 0.95 * SP, Y(p)));
    return x + 2 * 0.95 * SP + 0.5 * SP;
  };
  const timeSig = (x, Y, top, bot) => {
    text(fill, top, x, Y(4), 2 * SP, { stroke: 0.2, ...INK });
    text(fill, bot, x, Y(2), 2 * SP, { stroke: 0.2, ...INK });
    return x + 2.4 * SP;
  };
  const barline = (x, yA, yB, w = 0.13 * SP) => line([x, yA], [x, yB], w);
  const finalBar = (x, yA, yB) => { barline(x - 0.8 * SP, yA, yB); fill((px, py) => Math.max(Math.abs(px - x + 0.2 * SP) - 0.22 * SP, Math.max(yA - py, py - yB)), [x - 0.5 * SP, yA, x + 0.1 * SP, yB], INK); };
  const x0 = ML, x1 = W - MR;

  // —— 钢琴谱：大谱表，四分之三拍 ——
  if (page < 2) {
    let y = 0.03, bar = 1;
    if (page === 0) {
      text(fill, 'NOCTURNE', W / 2, 0.016, 0.0068, { align: 'center', stroke: 0.14, ...INK });
      text(fill, 'LENTO', x0, 0.038, 0.0026, { stroke: 0.16, ...INK });
      text(fill, 'TRYITEM', x1, 0.031, 0.0022, { align: 'right', stroke: 0.16, ...INK });
      y = 0.05;
    } else {
      text(fill, '2', x1, 0.012, 0.0028, { align: 'right', stroke: 0.16, ...INK });
      bar = 17;
    }
    const systems = page === 0 ? 5 : 6;
    for (let s = 0; s < systems; s++) {
      const yT = y, yB = y + 4 * SP + 0.011;
      const T = staff(x0, x1, yT), B = staff(x0, x1, yB);
      // 花括号 + 左边一道竖线把两行连起来
      barline(x0, yT, yB + 4 * SP, 0.14 * SP);
      {
        const top = yT, bot = yB + 4 * SP, midY = (top + bot) / 2, bx = x0 - 0.9 * SP;
        const curve = (sgn) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([bx + 0.55 * SP * Math.sin(Math.PI * t) - 0.5 * SP * (t > 0.85 ? (t - 0.85) / 0.15 : 0), midY + sgn * (bot - midY) * (1 - t)]); } return pts; };
        poly(curve(-1), (t) => (0.1 + 0.3 * Math.sin(Math.PI * t)) * SP);
        poly(curve(1), (t) => (0.1 + 0.3 * Math.sin(Math.PI * t)) * SP);
      }
      if (s > 0 || page > 0) text(fill, String(bar), x0, yT - 1.9 * SP, 1.3 * SP, { stroke: 0.16, ...INK });
      clef('G', x0 + 0.5 * SP, T);
      clef('F', x0 + 0.5 * SP, B);
      let xs = keySig(x0 + 3.2 * SP, T, 'G');
      keySig(x0 + 3.2 * SP, B, 'F');
      if (s === 0 && page === 0) { const xt = timeSig(xs, T, '3', '4'); timeSig(xs, B, '3', '4'); xs = xt; }
      const bars = 4, bw = (x1 - xs - SP) / bars;
      let pr = 2 + rand() * 2;
      for (let bi = 0; bi < bars; bi++) {
        const bx0 = xs + SP + bi * bw;
        // 右手：旋律
        const pat = rand();
        const step = () => { pr = Math.max(-1, Math.min(6, pr + (Math.round((rand() - 0.5) * 5) * 0.5))); return pr; };
        const chord = (p) => (rand() < 0.3 ? [p, p - 1] : [p]);
        if (pat < 0.3) {
          note(bx0 + 0.16 * bw, chord(step()), T, { hollow: true });
          note(bx0 + 0.72 * bw, chord(step()), T);
        } else if (pat < 0.55) {
          for (let k = 0; k < 3; k++) note(bx0 + (0.16 + 0.3 * k) * bw, chord(step()), T);
        } else if (pat < 0.72) {
          note(bx0 + 0.3 * bw, chord(step()), T, { hollow: true, dotted: true });
        } else {
          note(bx0 + 0.14 * bw, chord(step()), T);
          const p1 = step(), p2 = step(), up = (p1 + p2) / 2 < 2;
          const e = [note(bx0 + 0.42 * bw, [p1], T, { up }), note(bx0 + 0.58 * bw, [p2], T, { up })];
          beam(e);
          note(bx0 + 0.82 * bw, chord(step()), T);
        }
        // 左手：每拍两个八分音符的分解和弦，三个一组连符杠
        const root = -0.5 + Math.floor(rand() * 4) * 0.5;
        for (let g = 0; g < 2; g++) {
          const ps = [root, root + 2, root + 3.5].map((p, k) => (g && k === 2 ? p - 0.5 : p));
          const ends = ps.map((p, k) => note(bx0 + (0.12 + g * 0.45 + k * 0.14) * bw, [p], B, { up: true, len: 3 }));
          beam(ends);
        }
        if (rand() < 0.35) slur([bx0 + 0.14 * bw, T(Math.max(5, pr + 1.5))], [bx0 + 0.86 * bw, T(Math.max(5, pr + 1.5))], 0.9 * SP);
        const last = s === systems - 1 && bi === bars - 1 && page === 1;
        if (last) finalBar(bx0 + bw, yT, yB + 4 * SP);
        else barline(bx0 + bw, yT, yB + 4 * SP);
        bar++;
      }
      y = yB + 4 * SP + 0.017;
    }
    return;
  }

  // —— 小提琴分谱：单行谱表，四四拍 ——
  let y = 0.028, bar = 1;
  if (page === 2) {
    text(fill, 'SONATA', W / 2, 0.014, 0.0068, { align: 'center', stroke: 0.14, ...INK });
    text(fill, 'VIOLIN', x0, 0.017, 0.003, { stroke: 0.16, ...INK });
    text(fill, 'ALLEGRO', x0, 0.036, 0.0026, { stroke: 0.16, ...INK });
    y = 0.047;
  } else {
    text(fill, '2', x1, 0.012, 0.0028, { align: 'right', stroke: 0.16, ...INK });
    bar = 34;
  }
  const lines = page === 2 ? 11 : 12;
  let pr = 3;
  for (let s = 0; s < lines; s++) {
    const T = staff(x0, x1, y);
    if (s > 0 || page > 2) text(fill, String(bar), x0, y - 1.9 * SP, 1.3 * SP, { stroke: 0.16, ...INK });
    clef('G', x0 + 0.5 * SP, T);
    let xs = keySig(x0 + 3.2 * SP, T, 'G');
    if (s === 0 && page === 2) xs = timeSig(xs, T, '4', '4');
    const bars = 3 + (rand() < 0.5 ? 1 : 0), bw = (x1 - xs - SP) / bars;
    for (let bi = 0; bi < bars; bi++) {
      const bx0 = xs + SP + bi * bw;
      const step = (r = 5) => { pr = Math.max(-2.5, Math.min(7.5, pr + Math.round((rand() - 0.5) * r) * 0.5)); return pr; };
      // 一小节四拍：每拍随机一个四分音符，或者两个 / 四个八分音符连起来（常带一条连线）
      let beat = 0;
      while (beat < 4) {
        const bx = bx0 + (0.08 + beat * 0.23) * bw, r = rand();
        if (r < 0.28 && beat < 3) {
          note(bx + 0.02 * bw, [step()], T, { hollow: true });
          beat += 2;
        } else if (r < 0.55) {
          note(bx + 0.05 * bw, [step()], T);
          beat += 1;
        } else {
          const n4 = r < 0.8 ? 2 : 4;
          const ps = Array.from({ length: n4 }, () => step(3));
          const up = ps.reduce((a, p) => a + p, 0) / n4 < 2;
          const ends = ps.map((p, k) => note(bx + (0.02 + k * (n4 === 4 ? 0.055 : 0.11)) * bw, [p], T, { up }));
          beam(ends, n4 === 4 ? 2 : 1);
          if (rand() < 0.5) {
            const hs = ps.map((p) => T(p));
            const yy = up ? Math.max(...hs) + 1.2 * SP : Math.min(...hs) - 1.2 * SP;
            slur([bx, yy], [bx + (n4 === 4 ? 0.19 : 0.14) * bw, yy], (up ? -0.7 : 0.7) * SP);
          }
          beat += 1;
        }
      }
      if (rand() < 0.2) hairpin(bx0 + 0.15 * bw, bx0 + 0.85 * bw, T(-3.4), rand() < 0.5);
      const last = s === lines - 1 && bi === bars - 1 && page === 3;
      if (last) finalBar(bx0 + bw, T(4), T(0));
      else barline(bx0 + bw, T(4), T(0));
      bar++;
    }
    y += 4 * SP + 0.0125;
  }
}

export function score(S, P) {
  const A = SCORE, out = alloc(S);
  const c = S / 2, m = Math.round((2 * S) / A.size);
  const nF = perlin(P.seed), nM = perlin(P.seed + 1);
  // 纸：细细的纤维、极淡的斑驳
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const f = 1 + 0.012 * nF(u * 700, v * 180) + 0.01 * nM(u * 12, v * 12);
    put(out, y * S + x, mul(PAPER, f), 0, 0.8);
  }
  for (let page = 0; page < 4; page++) {
    const x0 = (page % 2) * c, y0 = Math.floor(page / 2) * c;
    const { fill } = painter(out, S, [x0 + m, y0 + m, x0 + c - m, y0 + c - m], A.W, A.H);
    scorePage(fill, page, mulberry(P.seed + 10 + page));
  }
  return out;
}
