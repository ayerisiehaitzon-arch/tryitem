// 茶室的程序化贴图：原木大板（桌面 / 自然边 / 端面）、茶具图集（铁壶、茶盘、青花、茶饼、线装书、紫砂、开片、湘妃竹、纯色格子）、
// 蒲团（盘成一圈圈的蒲草辫）。
import { perlin, worley, mulberry, fbm } from './noise.js';
import { SLAB_ATLAS, TEA_ATLAS, STRAW } from './atlas.js';
import { painter, sdPoly, sdSeg } from './laundry-textures.js';
import { text } from './gym-textures.js';
import { curveAt } from '../decor/profiles.js';
import { SLAB, SLAB_BOX, slabFront, slabBack, edgeLength, CRACK, KEYS, KEY_SIZE } from '../tea/slab.js';
import { teaCurve } from '../tea/profiles.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const fract = (x) => x - Math.floor(x);
const wrapD = (d) => d - Math.round(d);
const TAU = Math.PI * 2;
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// 周期性的 Voronoi：返回到最近那条细胞边的真实距离 e（先找最近的点，再量到它和每个邻居之间那条中垂线的距离）。
// 比 F2 − F1 均匀：三个细胞交汇、两个点挨得很近的地方，F2 − F1 会低估距离，裂纹鼓成一个黑色的楔子
function voronoiEdge(seed) {
  const jit = (cx, cy, px, py) => {
    const X = ((cx % px) + px) % px, Y = ((cy % py) + py) % py;
    return [hash(X + seed * 0.37, Y), hash(Y + seed * 0.71, X + 17.3)];
  };
  return (x, y, px, py) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let md = 9, mx = 0, my = 0, cx0 = 0, cy0 = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const [jx, jy] = jit(xi + dx, yi + dy, px, py);
      const fx = xi + dx + jx - x, fy = yi + dy + jy - y, d = fx * fx + fy * fy;
      if (d < md) { md = d; mx = fx; my = fy; cx0 = xi + dx; cy0 = yi + dy; }
    }
    let e = 9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const cx = cx0 + dx, cy = cy0 + dy;
      if (cx === cx0 && cy === cy0) continue;
      const [jx, jy] = jit(cx, cy, px, py);
      const gx = cx + jx - x, gy = cy + jy - y, lx = gx - mx, ly = gy - my, l = Math.hypot(lx, ly);
      if (l < 1e-6) continue;
      e = Math.min(e, ((mx + gx) * 0.5 * lx + (my + gy) * 0.5 * ly) / l);
    }
    const [ix] = jit(cx0 + 101, cy0 + 57, 1e9, 1e9);
    return { e, id: ix };
  };
}

function alloc(S, extra = []) {
  const o = { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
  for (const k of extra) o[k] = new Float32Array(S * S);
  return o;
}
function put(out, i, c, h, r, m = 0) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h; out.rough[i] = r;
  if (out.metal) out.metal[i] = m;
}
// 一块区域逐像素作画：f(u, v, du, dv) → [颜色, 高度, 粗糙度, 金属度]；u、v ∈ [0, 1] 是去掉边距后的区域坐标
// （边距里的像素按超出 [0, 1] 的 u、v 接着算），du、dv 是一个像素在 u、v 上的宽度
function region(out, S, box, marginPx, f) {
  const [x0, y0, x1, y1] = box, W = x1 - x0 - 2 * marginPx, H = y1 - y0 - 2 * marginPx;
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5 - y0 - marginPx) / H;
    for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - x0 - marginPx) / W;
      const [c, h, r, m] = f(u, v, 1 / W, 1 / H);
      put(out, y * S + x, c, h, r, m ?? 0);
    }
  }
}
// 区域上的 SDF 作画器：W × H 是区域代表的物理尺寸（米），y 向下
const regionPainter = (out, S, box, marginPx, W, H) => painter(out, S, [box[0] + marginPx, box[1] + marginPx, box[2] - marginPx, box[3] - marginPx], W, H);
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

// ——————————————————————— 原木大板 ———————————————————————
// 一块黑胡桃大板：
//   · 年轮：树心沿板长走，板面锯在树心上方 h 处，h 从树根那头（1cm）往另一头慢慢变大 —— 同一圈年轮在板面上的两条线
//     往前越收越拢，收拢的地方合成一个尖拱（山纹），一层套一层，尖都朝着树梢那头；几路噪声把年轮扭得不那么规整；
//   · 自然边往里 1~4cm 是白色的边材，和深巧克力色的心材之间一道不规整的过渡；心材里一缕缕偏紫灰的色带、顺纹的导管孔；
//   · 一个小树结，年轮绕着它弯；树根那头顺着纹理裂开一道，灌了黑色环氧树脂，两枚枫木蝴蝶榫横跨裂缝；
//   · 端面看得见年轮的弧（和板面上的年轮是同一个场），几道从树心放射出去的细裂；自然边的侧面是边材，
//     顺着树干方向的一道道起伏，缝里残留着几块树皮。
const SL = {
  early: rgb([110, 74, 53]), late: rgb([62, 41, 30]), purple: rgb([90, 70, 72]), caramel: rgb([138, 96, 62]),
  sap: rgb([214, 186, 142]), sapLate: rgb([192, 160, 114]), bark: rgb([74, 54, 40]),
  epoxy: rgb([20, 18, 16]), maple: rgb([226, 208, 172]), mapleLate: rgb([204, 182, 144]), knot: rgb([50, 33, 24]),
};
const RING = 0.0046;
const zc = (t) => 0.012 + 0.02 * Math.sin(TAU * (0.35 * t + 0.2));
const hc = (t) => 0.01 + 0.06 * t ** 1.2 + 0.012 * Math.sin(TAU * (1.6 * t + 0.3));
const KNOT = { x: 0.22, z: 0.13, r: 0.014 };

export function slab(S, P) {
  const A = SLAB_ATLAS, k = S / A.size, m = Math.round(2 * k);
  const out = alloc(S);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nW = perlin(P.seed), nS = perlin(P.seed + 1), nP = perlin(P.seed + 2), nC = perlin(P.seed + 3), nB = perlin(P.seed + 4), nK = perlin(P.seed + 5);
  const { L, T } = SLAB;
  const tOf = (x) => clamp01((x + L / 2) / L);
  // 年轮序号（板面上一点 x, z，深度 d：0 是板面，往下为正）
  const ringAt = (x, z, d = 0) => {
    const t = tOf(x), dz = z - zc(t), dy = hc(t) - d;
    let R = Math.hypot(dz, dy);
    R *= 1 + 0.04 * Math.sin(3 * Math.atan2(dz, dy) + 2 * t);
    // 纹理的走向：大尺度上蜿蜒，小尺度上抖动
    R += 0.012 * nW(x * 1.1, z * 2.2 + d * 2.2) + 0.004 * nW(x * 3 + 3, z * 10 + d * 10) + 0.0012 * nW(x * 11 + 7, z * 40 + d * 40);
    const dk = Math.hypot(x - KNOT.x, (z - KNOT.z) * 1.3);
    R += 0.01 * Math.exp(-((dk / 0.045) ** 2));
    // 年轮宽窄不一：按半径慢慢变，再加上一年年的快慢（保持单调：导数远小于 1/RING）
    return R / RING + 1.6 * nW(R * 25 + 3, 0.5) + 0.45 * nW(R * 110 + 11, 2.5);
  };
  const lateOf = (p) => sstep(0.45, 0.75, p) * (1 - sstep(0.85, 1, p));
  // 白边宽度（前后两条边各自起伏）
  const sapW = (t, side) => (side > 0
    ? 0.02 + 0.012 * (0.5 + 0.5 * Math.sin(TAU * (2.3 * t + 0.1))) + 0.006 * nS(t * 9, 1.5)
    : 0.018 + 0.01 * (0.5 + 0.5 * Math.sin(TAU * (1.7 * t + 0.6))) + 0.006 * nS(t * 9, 7.5));
  const heartColor = (x, z, ri, contrast) => {
    // 胡桃是半环孔材，年轮线不重；每一年的晚材深浅不一
    const late = lateOf(fract(ri)) * contrast * (0.22 + 0.4 * hash(Math.floor(ri), 3.7));
    let c = mix3(SL.early, SL.late, late);
    // 一段段深浅不同的生长期（沿着年轮的宽带）：焦糖色的亮带、偏紫灰的色带
    c = mix3(c, SL.caramel, sstep(0.1, 0.6, nC(ri * 0.11, x * 0.6 + 9)) * 0.4);
    c = mix3(c, SL.purple, sstep(0.05, 0.45, nC(x * 1.2 + 4, ri * 0.09 + z * 4)) * 0.4);
    // 矿物线：顺着年轮的细黑线，断断续续
    const ms = Math.exp(-((nC(x * 0.9 + 31, ri * 0.23) / 0.05) ** 2)) * sstep(-0.1, 0.4, nC(x * 2 + 5, z * 3));
    c = mul(c, 1 - 0.28 * ms);
    return mul(c, 1 + 0.05 * nC(x * 3, z * 3) + 0.06 * nC(ri * 0.03, x * 0.3 + 2));
  };

  // —— 板面 ——
  {
    const B = SLAB_BOX, bx = box('top');
    const key = KEYS.map(({ x, z, a }) => {
      const { l, w, waist } = KEY_SIZE, ca = Math.cos(a), sa = Math.sin(a);
      const loc = [[-l / 2, -w / 2], [0, -waist / 2], [l / 2, -w / 2], [l / 2, w / 2], [0, waist / 2], [-l / 2, w / 2]];
      return { x, z, ca, sa, poly: loc.map(([p, q]) => [x + p * ca - q * sa, z + p * sa + q * ca]) };
    });
    region(out, S, bx, m, (u, v, du, dv) => {
      const x = B.x0 + u * (B.x1 - B.x0), z = B.z0 + v * (B.z1 - B.z0);
      const px = du * (B.x1 - B.x0), pz = dv * (B.z1 - B.z0);
      const t = tOf(x);
      const dF = slabFront(t) - z, dB = z - slabBack(t);
      // 年轮和它在这个像素上变化得有多快（太密就压低对比，不出摩尔纹）
      const ri = ringAt(x, z);
      const g = Math.hypot(ringAt(x + px, z) - ri, ringAt(x, z + pz) - ri);
      const contrast = clamp01(1.4 - g * 2.4);
      let c = heartColor(x, z, ri, contrast);
      // 边材
      const jag = 0.003 * nS(x * 60, z * 60);
      const sap = Math.max(sstep(sapW(t, 1) + 0.004, sapW(t, 1) - 0.004, dF + jag), sstep(sapW(t, -1) + 0.004, sapW(t, -1) - 0.004, dB + jag));
      const sapC = mix3(SL.sap, SL.sapLate, lateOf(fract(ri)) * contrast * 0.4);
      c = mix3(c, mul(sapC, 1 + 0.05 * nC(x * 5, z * 5)), sap);
      // 心边材之间一道深一点的过渡
      const bnd = Math.min(Math.abs(dF + jag - sapW(t, 1)), Math.abs(dB + jag - sapW(t, -1)));
      c = mul(c, 1 - 0.18 * Math.exp(-((bnd / 0.003) ** 2)));
      // 导管孔：顺纹的短暗线
      const pore = sstep(0.38, 0.72, nP(x * 70, z * 1100)) * (1 - 0.5 * sap);
      c = mul(c, 1 - 0.22 * pore);
      let h = -pore * 0.6, rough = mix(0.4, 0.48, sap) + pore * 0.08;
      // 树结
      const dk = Math.hypot(x - KNOT.x, (z - KNOT.z) * 1.3);
      if (dk < KNOT.r * 1.6) {
        // 树结：自己的一圈圈年轮（中间浅、外圈深），一道深色的边，一条从中心裂开的细缝
        const inK = sstep(KNOT.r + px, KNOT.r - px, dk);
        const kr = 0.5 + 0.5 * Math.cos((dk / 0.0021) * TAU + 1.5 * nC(x * 400, z * 400));
        const kc = mix3(rgb([108, 70, 46]), SL.knot, 0.3 + 0.5 * kr + 0.2 * sstep(0.3 * KNOT.r, KNOT.r, dk));
        c = mix3(c, kc, inK);
        const ring = Math.exp(-(((dk - KNOT.r) / 0.0012) ** 2));
        c = mul(c, 1 - 0.45 * ring);
        const ang = Math.atan2(z - KNOT.z, x - KNOT.x);
        const chk = Math.exp(-(((wrapD((ang - 0.9) / TAU) * TAU * dk) / 0.0004) ** 2)) * inK * sstep(0.002, 0.004, dk);
        c = mul(c, 1 - 0.6 * chk);
        h -= ring * 0.8 + chk * 0.6;
      }
      // 裂缝（灌了黑色环氧）
      if (x < CRACK.x1 + 0.01) {
        const f = clamp01((x - CRACK.x0) / (CRACK.x1 - CRACK.x0));
        const zcr = CRACK.z + 0.002 * Math.sin(x * 23) + 0.0012 * nS(x * 150, 3.5);
        const w = 0.005 * (1 - f ** 1.3) + 0.0004;
        const cov = clamp01((w / 2 - Math.abs(z - zcr)) / pz + 0.5);
        if (cov > 0) { c = mix3(c, SL.epoxy, cov); rough = mix(rough, 0.1, cov); }
      }
      // 蝴蝶榫：枫木，纹理顺着榫身，四周一道胶线
      for (const kk of key) {
        const d = sdPoly(x, z, kk.poly);
        if (d > 0.002) continue;
        const along = (x - kk.x) * kk.ca + (z - kk.z) * kk.sa, across = -(x - kk.x) * kk.sa + (z - kk.z) * kk.ca;
        const gr = lateOf(fract(across / 0.0022 + 0.3 * nC(along * 30, across * 5)));
        const mc = mul(mix3(SL.maple, SL.mapleLate, gr * 0.6), 1 + 0.03 * nC(along * 8, across * 8));
        const cov = clamp01(0.5 - d / px);
        c = mix3(c, mc, cov);
        const glue = Math.exp(-((d / 0.0005) ** 2));
        c = mul(c, 1 - 0.5 * glue);
        rough = mix(rough, 0.45, cov);
        h -= glue * 0.5;
      }
      // 板子外面（给边上的 mip 和磨圆的一圈用）：树皮
      const inside = Math.min(dF, dB);
      if (inside < 0) c = mix3(c, SL.bark, sstep(0, 0.003, -inside));
      return [c, h, rough];
    });
  }

  // —— 两条自然边的侧面 ——
  for (const [name, side] of [['edgeF', 1], ['edgeB', -1]]) {
    const len = edgeLength(side);
    region(out, S, box(name), m, (u, v) => {
      const s = u * len, d = v * T;
      const ridge = nB(s * 3 + side * 40, d * 150) * 0.6 + nB(s * 9 + side * 40, d * 400) * 0.4;
      const fiber = nB(s * 60 + side * 9, d * 2400);
      // 剥了树皮、磨过的形成层：比板面的边材深一些、偏灰的褐色，顺着树干一缕缕深浅
      const streak = nB(s * 1.5 + side * 20, d * 45);
      let c = mul(mix3(rgb([176, 138, 96]), rgb([150, 116, 84]), sstep(-0.2, 0.5, streak)), 0.84 + 0.16 * ridge + 0.05 * fiber);
      // 缝里残留的几小块树皮（顺着树干方向拉长，只在起伏的凹处）
      const bk = sstep(0.42, 0.5, nK(s * 9 + side * 13, d * 30) * 0.7 + nK(s * 30, d * 60) * 0.3 - ridge * 0.3);
      const fiss = 0.5 + 0.5 * Math.sin(d * 900 + 8 * nK(s * 20, d * 60));
      const barkC = mul(SL.bark, 0.8 + 0.3 * fiss);
      c = mix3(c, barkC, bk);
      // 顶上那一圈和桌面的边材颜色接上
      c = mix3(SL.sap, c, sstep(0.0, 0.006, d));
      return [c, 0.5 + 0.5 * ridge - bk * 0.3, mix(0.58, 0.86, bk)];
    });
  }

  // —— 两头的端面：年轮的弧、放射状的细裂 ——
  for (const [name, t] of [['endL', 0], ['endR', 1]]) {
    const zb = slabBack(t), zf = slabFront(t), x = -L / 2 + L * t;
    region(out, S, box(name), m, (u, v, du, dv) => {
      const z = zb + u * (zf - zb), d = v * T;
      const ri = ringAt(x, z, d);
      const g = Math.hypot(ringAt(x, z + du * (zf - zb), d) - ri, ringAt(x, z, d + dv * T) - ri);
      const contrast = clamp01(1.4 - g * 2.4);
      const late = lateOf(fract(ri)) * contrast;
      let c = mul(mix3(rgb([102, 70, 50]), rgb([58, 38, 28]), late), 1 + 0.05 * nC(z * 20, d * 20));
      const sap = Math.max(sstep(sapW(t, 1) + 0.004, sapW(t, 1) - 0.004, zf - z), sstep(sapW(t, -1) + 0.004, sapW(t, -1) - 0.004, z - zb));
      c = mix3(c, mix3(rgb([192, 162, 120]), rgb([170, 140, 100]), late), sap);
      // 放射状的细裂：从树心往外
      const a = Math.atan2(d - hc(t), z - zc(t)), R = Math.hypot(d - hc(t), z - zc(t));
      let chk = 0;
      for (const a0 of [0.4, 1.9, 2.8, -1.2]) chk = Math.max(chk, Math.exp(-(((wrapD((a - a0) / TAU) * TAU) * R / 0.0006) ** 2)) * sstep(0.06, 0.02, R));
      c = mul(c, 1 - 0.6 * chk);
      return [c, -chk * 0.8 + late * 0.2, 0.55];
    });
  }
  return out;
}

// ——————————————————————— 蒲团 ———————————————————————
// 三股蒲草编成的辫子，一圈圈往外盘：顶面是一条阿基米德螺线（每圈往外一个辫子宽），侧面是一排排横着的辫子。
// 辫子的花纹：股与股斜着交叉，顺着辫子一个接一个的“人”字；每一股中间鼓、两头压进去，辫子横截面是圆的；
// 每一股的颜色略有不同（有的偏青），股缝和辫缝里深一些。
function braid(sAlong, a, id, B, nF) {
  const q = sAlong / B + Math.abs(a) * 1.3;
  const strand = Math.floor(q), f = q - strand;
  const lens = Math.sin(Math.PI * f);
  const round = Math.sqrt(Math.max(0, 1 - (2 * a) ** 2));
  const hv = hash(strand * 1.37 + (a > 0 ? 17 : 0), id * 3.1);
  let c = mix3(rgb([204, 174, 116]), rgb([176, 164, 112]), sstep(0.7, 0.95, hv));
  c = mul(c, (0.86 + 0.24 * hv) * (0.55 + 0.45 * lens) * (0.45 + 0.55 * round));
  // 草叶的细纤维：顺着每一股的方向
  const fib = nF(sAlong * 420 + Math.abs(a) * 60, a * 30 + id * 7.7);
  c = mul(c, 1 + 0.06 * fib);
  const h = round * (0.5 + 0.5 * lens) + fib * 0.05;
  return [c, h, 0.8 - 0.1 * lens];
}

export function straw(S, P) {
  const A = STRAW, k = S / A.size, m = Math.round(2 * k);
  const out = alloc(S);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const nF = perlin(P.seed), nD = perlin(P.seed + 1);
  const p = A.pitch, R0 = A.R + 0.005;
  // 顶面：螺线上的位置 → 第几圈、横跨辫子的位置、沿辫子的弧长
  region(out, S, box('top'), m, (u, v) => {
    const x = -R0 + 2 * R0 * u, z = -R0 + 2 * R0 * v;
    const r = Math.hypot(x, z), th = Math.atan2(z, x);
    const cc = r / p - th / TAU;
    const n = Math.round(cc), a = cc - n;
    const psi = Math.max(0, th + TAU * n);
    const sAlong = (p * psi * psi) / (4 * Math.PI);
    let [c, h, rough] = braid(sAlong, a, n, A.braid, nF);
    // 中心起头的地方：一个扎紧的结
    const knot = sstep(1.3 * p, 0.6 * p, r);
    c = mix3(c, mul(rgb([150, 120, 78]), 0.8 + 0.2 * nD(x * 900, z * 900)), knot * 0.7);
    c = mul(c, 1 + 0.04 * nD(x * 6, z * 6));
    return [c, h, rough];
  });
  // 侧面：一排排横着的辫子；绕一圈正好整数个花纹（接缝看不出来）
  {
    const circ = TAU * A.R, Bs = circ / Math.round(circ / A.braid), H = 0.15;
    region(out, S, box('side'), m, (u, v) => {
      const w = (v * H) / p, n = Math.floor(w), a = w - n - 0.5;
      const [c, h, rough] = braid(fract(u) * circ, a, n + 100, Bs, nF);
      return [mul(c, 1 + 0.04 * nD(u * 12, v * 3)), h, rough];
    });
  }
  return out;
}

// ——————————————————————— 茶具图集 ———————————————————————
export function teaAtlas(S, P) {
  const A = TEA_ATLAS, k = S / A.size, m = Math.round(2 * k);
  const out = alloc(S, ['metal']);
  const box = (name) => A.regions[name].map((v) => Math.round(v * k));
  const n1 = perlin(P.seed), n2 = perlin(P.seed + 1), n3 = perlin(P.seed + 2), n4 = perlin(P.seed + 3);
  swatches(out, S, A, k);

  // —— 铁壶：一排排的霰点，每一圈的个数按那一圈的周长算；壶身铸铁、带一点锈色的斑驳 ——
  {
    const cv = teaCurve('kettle'), L = cv.length;
    const sAtY = (y) => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (curveAt(cv, mid).y < y) lo = mid; else hi = mid; } return lo * L; };
    const s0 = sAtY(0.02), s1 = sAtY(0.108), ds = 0.0078, rb = 0.0027;
    region(out, S, box('iron'), m, (u, v) => {
      const c0 = curveAt(cv, v), circ = TAU * Math.max(c0.r, 1e-3);
      const pat = sstep(0.1, 0.45, n1(u * 8, v * 6)) * 0.4;
      let c = mix3(rgb([44, 41, 39]), rgb([80, 58, 44]), pat);
      c = mul(c, 1 + 0.08 * n2(u * 90, v * 60));
      let h = 0.2 * n2(u * 90, v * 60), rough = 0.58, metal = 0.35;
      if (c0.s > s0 - ds && c0.s < s1 + ds) {
        const j = Math.round((c0.s - s0) / ds);
        if (j >= 0 && j <= Math.round((s1 - s0) / ds)) {
          const sj = s0 + j * ds, rj = curveAt(cv, sj / L).r, nj = Math.max(8, Math.round((TAU * rj) / ds));
          const du = wrapD(u * nj - (j % 2) * 0.5) * (circ / nj), dy = c0.s - sj, d = Math.hypot(du, dy);
          if (d < rb * 1.4) {
            const b = d < rb ? Math.sqrt(1 - (d / rb) ** 2) : 0;
            c = mix3(c, rgb([70, 66, 62]), b * b * 0.8);
            c = mul(c, 1 - 0.3 * (1 - b) * sstep(rb * 1.4, rb, d));
            h += b * 1.5; rough -= b * 0.15;
          }
        }
      }
      return [c, h, rough, metal];
    });
  }

  // —— 茶盘：乌金石，抛光的盘面上一道道出水槽（刻出来的槽底发灰、哑光），一头一个出水孔 ——
  {
    const { w: TW, h: TH } = A.tray;
    region(out, S, box('tray'), m, (u, v, du) => {
      const x = u * TW, z = v * TH, px = du * TW;
      let c = mul(rgb([30, 31, 33]), 1 + 0.06 * n3(x * 14, z * 14));
      const speck = sstep(0.62, 0.7, n3(x * 900, z * 900));
      c = mix3(c, rgb([120, 120, 118]), speck * 0.35);
      let h = 1, rough = 0.2;
      const inField = x > 0.018 && x < TW - 0.045 && z > 0.016 && z < TH - 0.016;
      if (inField) {
        const g = (x + 0.003 * Math.sin(z * 22)) / 0.012;
        const dg = Math.abs(wrapD(g)) * 0.012;
        const cov = clamp01((0.0021 - dg) / px + 0.5);
        c = mix3(c, rgb([58, 58, 60]), cov);
        h -= cov * 0.8; rough = mix(rough, 0.55, cov);
      }
      // 出水孔
      const dh = Math.hypot(x - (TW - 0.024), z - TH / 2);
      const hole = clamp01((0.0075 - dh) / px + 0.5), lip = Math.exp(-(((dh - 0.0085) / 0.0012) ** 2));
      c = mix3(c, rgb([6, 6, 7]), hole);
      c = mix3(c, rgb([64, 64, 66]), lip * 0.6);
      h -= hole;
      return [c, h, rough];
    });
  }

  // —— 青花将军罐：肩上一圈如意云头、腹部缠枝莲、足上一圈仰莲瓣，带与带之间双弦线 ——
  {
    const cv = teaCurve('jar');
    const bx = box('qinghua');
    const cobalt = rgb([30, 52, 124]), wash = rgb([98, 132, 192]), dark = rgb([18, 28, 80]), white = rgb([236, 237, 232]);
    const circ = TAU * 0.05; // 纹饰按腹部的周长排（绕一圈整数个）
    region(out, S, bx, m, (u, v, du) => {
      const c0 = curveAt(cv, v), y = c0.y;
      const x = fract(u) * circ, px = du * circ * 1.2;
      let blue = 0, fillA = 0;
      const line = (d, w) => clamp01((w / 2 - Math.abs(d)) / px + 0.5);
      // 弦线
      for (const yl of [0.022, 0.0245, 0.0895, 0.092, 0.1135]) blue = Math.max(blue, line(y - yl, 0.0009));
      // 口沿一圈满蓝
      if (y > 0.117) blue = Math.max(blue, 0.9);
      // 足上：仰莲瓣（12 瓣）
      if (y > 0.004 && y < 0.021) {
        const cell = circ / 12, lx = wrapD(x / cell) * cell, ly = y - 0.004;
        const hArch = 0.0125 + 0.003 * Math.cos((lx / cell) * Math.PI);
        const sd = Math.max(Math.abs(lx) - cell * 0.42, ly - hArch);
        blue = Math.max(blue, line(sd, 0.0009));
        if (sd < 0) fillA = Math.max(fillA, 0.35 * sstep(0, 0.004, -sd));
      }
      // 腹部：缠枝莲 —— 一条绕三个波的藤、波峰波谷各一朵莲、藤两侧的叶子
      if (y > 0.026 && y < 0.088) {
        const lam = circ / 3, ph = (x / lam) * TAU;
        const vy = 0.057 + 0.017 * Math.sin(ph);
        const slope = 0.017 * Math.cos(ph) * (TAU / lam);
        blue = Math.max(blue, line((y - vy) / Math.sqrt(1 + slope * slope), 0.0011));
        for (let q = 0; q < 6; q++) {
          const fx = ((q + 0.25) * lam) / 2, fy = 0.057 + 0.017 * Math.sin(((fx / lam) * TAU));
          const dx = wrapD((x - fx) / circ) * circ, dy = y - fy, r = Math.hypot(dx, dy);
          if (r < 0.013) {
            const a = Math.atan2(dy, dx), petal = 0.0085 + 0.0022 * Math.cos(5 * a);
            blue = Math.max(blue, line(r - petal, 0.0008), line(r - 0.0032, 0.0007));
            if (r < petal) fillA = Math.max(fillA, 0.5 * sstep(petal, petal * 0.5, r));
            if (r < 0.0026) fillA = Math.max(fillA, 0.9);
          }
        }
        for (let q = 0; q < 18; q++) {
          const lx0 = ((q + 0.62) * lam) / 6, ly0 = 0.057 + 0.017 * Math.sin((lx0 / lam) * TAU);
          const side = q % 2 ? 1 : -1, dx = wrapD((x - lx0) / circ) * circ, dy = y - ly0 - side * 0.0045;
          const a = side * 0.9, ca = Math.cos(a), sa = Math.sin(a);
          const lu = dx * ca + dy * sa, lv = -dx * sa + dy * ca;
          const leaf = Math.hypot(lu / 0.0062, lv / 0.0023) - 1;
          if (leaf < 0.3) { fillA = Math.max(fillA, 0.75 * clamp01(-leaf * 3)); blue = Math.max(blue, line(leaf * 0.0023, 0.0006)); }
        }
      }
      // 肩：如意云头（8 个，尖朝下）
      if (y > 0.093 && y < 0.113) {
        const cell = circ / 8, lx = wrapD(x / cell) * cell, ly = y - 0.093;
        const lobe = Math.min(Math.hypot(lx - 0.0055, ly - 0.012) - 0.0048, Math.hypot(lx + 0.0055, ly - 0.012) - 0.0048);
        const tip = Math.max(Math.abs(lx) * 1.2 + (0.0115 - ly) * 0.9 - 0.006, -ly + 0.002);
        const sd = Math.min(lobe, tip);
        blue = Math.max(blue, line(sd, 0.0009));
        if (sd < 0) fillA = Math.max(fillA, 0.55);
      }
      // 青花的发色：蓝里带深色的“铁锈斑”（堆积处），淡描的地方是水一样的淡蓝
      const heap = sstep(0.55, 0.8, n4(u * 80, v * 30));
      let c = mix3(white, wash, fillA * (0.8 + 0.2 * n4(u * 40, v * 20)));
      c = mix3(c, mix3(cobalt, dark, heap * 0.7), blue * 0.95);
      c = mul(c, 1 + 0.015 * n3(u * 30, v * 30));
      return [c, 0, 0.1];
    });
  }

  // —— 普洱茶饼：棉纸包着（透出一点压紧的茶叶），红色的双圈里写着 PU ERH，一方红印；边上的纸往背面收出一道道褶 ——
  {
    const bx = box('cake'), R = A.cake.r + 0.002;
    const leaves = worley(P.seed + 7);
    region(out, S, bx, m, (u, v) => {
      const x = (u - 0.5) * 2 * R, z = (v - 0.5) * 2 * R, r = Math.hypot(x, z);
      const lf = leaves(x * 90 + 50, z * 60 + 50, 4096, 4096);
      const tea = sstep(0.05, 0.25, lf.f2 - lf.f1) * 0.5 + lf.id * 0.5;
      let c = mix3(rgb([236, 230, 212]), rgb([150, 118, 84]), 0.1 + 0.1 * tea);
      c = mul(c, 1 + 0.04 * n1(x * 400, z * 120));
      const pleat = sstep(0.08, 0.1, r) * (0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 36 + 3 * n2(r * 50, 1)));
      c = mul(c, 1 - 0.12 * pleat);
      return [c, pleat * 0.6 + tea * 0.2, 0.86];
    });
    const { fill } = regionPainter(out, S, bx, m, 2 * R, 2 * R);
    const red = { color: rgb([176, 40, 36]), rough: 0.6 }, green = { color: rgb([40, 84, 58]), rough: 0.6 };
    fill((px, py) => Math.abs(Math.hypot(px - R, py - R) - 0.047) - 0.0012, [R - 0.05, R - 0.05, R + 0.05, R + 0.05], red);
    fill((px, py) => Math.abs(Math.hypot(px - R, py - R) - 0.042) - 0.0006, [R - 0.045, R - 0.045, R + 0.045, R + 0.045], red);
    text(fill, 'PU ERH', R, R - 0.012, 0.014, { align: 'center', stroke: 0.16, ...green });
    text(fill, 'YUNNAN', R, R + 0.009, 0.0065, { align: 'center', stroke: 0.16, ...green });
    fill((px, py) => Math.max(Math.abs(px - R - 0.03) - 0.008, Math.abs(py - R - 0.052) - 0.008), [R + 0.02, R + 0.042, R + 0.04, R + 0.062], red);
    fill((px, py) => Math.max(Math.abs(px - R - 0.03) - 0.005, Math.abs(py - R - 0.052) - 0.0008), [R + 0.024, R + 0.05, R + 0.036, R + 0.054], { color: rgb([236, 230, 212]) });
  }

  // —— 线装书的封面：靛蓝纸，左上一条题签（竖写的“字”是几笔随手的墨线），右边四眼线装 ——
  {
    const bx = box('book'), { w: BW, h: BH } = A.book;
    region(out, S, bx, m, (u, v) => {
      const x = u * BW, y = v * BH;
      const edge = Math.min(x, BW - x, y, BH - y);
      let c = mul(rgb([42, 56, 92]), 1 + 0.07 * n1(x * 300, y * 80) + 0.04 * n2(x * 20, y * 20));
      c = mix3(c, rgb([70, 84, 112]), sstep(0.004, 0, edge) * 0.5);
      return [c, 0.1 * n1(x * 300, y * 80), 0.82];
    });
    const { fill } = regionPainter(out, S, bx, m, BW, BH);
    const label = { color: rgb([226, 220, 200]), rough: 0.8 }, ink = { color: rgb([26, 24, 22]), rough: 0.7 };
    fill((px, py) => Math.max(Math.abs(px - 0.026) - 0.011, Math.abs(py - 0.075) - 0.06), [0.012, 0.012, 0.04, 0.14], label);
    fill((px, py) => Math.abs(Math.max(Math.abs(px - 0.026) - 0.0095, Math.abs(py - 0.075) - 0.0585)) - 0.0003, [0.012, 0.012, 0.04, 0.14], { color: rgb([150, 60, 50]) });
    const rnd = mulberry(P.seed + 11);
    for (let ch = 0; ch < 4; ch++) {
      const cy = 0.03 + ch * 0.026;
      for (let s = 0; s < 4 + Math.floor(rnd() * 3); s++) {
        const a = [0.026 + (rnd() - 0.5) * 0.012, cy + (rnd() - 0.5) * 0.014];
        const horiz = rnd() < 0.5, l = 0.004 + rnd() * 0.006;
        const b = horiz ? [a[0] + l, a[1] + (rnd() - 0.5) * 0.002] : [a[0] + (rnd() - 0.5) * 0.003, a[1] + l];
        fill((px, py) => sdSeg(px, py, a, b, 0.0011), [Math.min(a[0], b[0]) - 0.002, Math.min(a[1], b[1]) - 0.002, Math.max(a[0], b[0]) + 0.002, Math.max(a[1], b[1]) + 0.002], ink);
      }
    }
    const thread = { color: rgb([228, 224, 212]), rough: 0.7, height: 0.8 };
    const holes = [0.022, 0.086, 0.159, 0.223];
    for (const hy of holes) fill((px, py) => sdSeg(px, py, [0.153, hy], [BW + 0.002, hy], 0.0013), [0.15, hy - 0.002, BW, hy + 0.002], thread);
    fill((px, py) => sdSeg(px, py, [0.153, holes[0]], [0.153, holes[3]], 0.0013), [0.15, 0.02, 0.156, 0.226], thread);
    for (const hy of holes) fill((px, py) => Math.hypot(px - 0.153, py - hy) - 0.0011, [0.15, hy - 0.002, 0.156, hy + 0.002], { color: rgb([20, 24, 40]) });
  }

  // —— 紫砂：紫红的泥，满身细细的砂粒（浅的、深的），肚子上盘出来的光泽更亮 ——
  {
    const cv = teaCurve('teapot');
    const grains = worley(P.seed + 5), grains2 = worley(P.seed + 6);
    region(out, S, box('zisha'), m, (u, v) => {
      const c0 = curveAt(cv, v);
      const uu = fract(u);
      const g1 = grains(uu * 240, v * 60, 240, 60), g2 = grains2(uu * 380, v * 95, 380, 95);
      const lite = g1.id < 0.08 ? sstep(0.3, 0.15, g1.f1) : 0, darkg = g2.id < 0.07 ? sstep(0.3, 0.15, g2.f1) : 0;
      let c = mul(rgb([122, 70, 55]), 1 + 0.05 * n1(uu * 16, v * 8));
      c = mix3(c, rgb([158, 104, 80]), lite * 0.7);
      c = mix3(c, rgb([84, 44, 34]), darkg * 0.7);
      const belly = sstep(0.035, 0.047, c0.r);
      return [c, (lite - darkg) * 0.3, mix(0.55, 0.36, belly)];
    });
  }

  // —— 哥窑开片：灰青的釉，大块的“铁线”（深）套着细密的“金丝”（浅褐）——
  {
    const big = voronoiEdge(P.seed + 8), small = voronoiEdge(P.seed + 9);
    region(out, S, box('celadon'), m, (u, v) => {
      const uu = fract(u);
      const b = big(uu * 12, v * 7, 12, 7), s = small(uu * 34, v * 20, 34, 20);
      // 铁线粗细沿着裂纹慢慢变
      const w = 0.75 + 0.5 * (0.5 + 0.5 * n2(uu * 40, v * 24));
      const iron = 1 - sstep(0.008 * w, 0.018 * w, b.e), gold = 1 - sstep(0.016, 0.036, s.e);
      let c = mul(rgb([160, 168, 150]), 1 + 0.04 * n2(uu * 10, v * 6) + (b.id - 0.5) * 0.03);
      c = mix3(c, rgb([168, 140, 92]), gold * 0.55);
      c = mix3(c, rgb([58, 54, 48]), iron * 0.85);
      return [c, 0, 0.2 + 0.06 * n2(uu * 20, v * 12)];
    });
  }

  // —— 湘妃竹：蜜色的竹竿，顺着竿的细纤维，两道竹节（凸起的一圈），满身紫褐色的泪斑 ——
  {
    const spots = worley(P.seed + 10), Lb = A.bamboo.len;
    region(out, S, box('bamboo'), m, (u, v) => {
      const s = u * Lb, vv = fract(v);
      const fib = n3(s * 30, vv * 400);
      let c = mul(rgb([196, 164, 104]), 1 + 0.06 * fib);
      const sp = spots(s * 60, vv * 14, 4096, 14);
      const blot = sp.id < 0.35 ? sstep(0.55, 0.3, sp.f1 * (1 + 0.4 * n4(s * 90, vv * 20))) : 0;
      const halo = sp.id < 0.35 ? sstep(0.8, 0.5, sp.f1) * (1 - blot) : 0;
      c = mix3(c, rgb([176, 138, 86]), halo * 0.5);
      c = mix3(c, rgb([104, 58, 46]), blot * 0.85);
      let h = fib * 0.1;
      for (const sn of [0.05, 0.18]) {
        const dn = Math.abs(s - sn);
        h += Math.exp(-((dn / 0.003) ** 2));
        c = mul(c, 1 - 0.35 * Math.exp(-((dn / 0.0008) ** 2)));
      }
      return [c, h, 0.45];
    });
  }
  return out;
}

// ——————————————————————— 方砖地面 ———————————————————————
// 青灰色的方砖（金砖）：一张贴图 = 一整块 2m 地板模块（5 × 5 块 40cm 的砖）。每块砖的深浅、冷暖各不相同，
// 砖面上一层云雾似的深浅（烧制时的火色）、细小的气孔；擦过蜡，砖面有一层柔和的光泽，走得多的地方更亮一些；
// 砖边磨圆一点，砖缝是深灰的灰浆；有几块砖的角上磕掉一小块。所有噪声都按 2m 周期，模块之间严丝合缝。
export function fangzhuan(S, P) {
  const N = P.tiles, T = P.period / N, px = P.period / S;
  const n = perlin(P.seed), n2 = perlin(P.seed + 1), wp = worley(P.seed + 2);
  const rnd = mulberry(P.seed + 3);
  const tiles = Array.from({ length: N * N }, () => ({
    tone: 1 + (rnd() - 0.5) * 0.07, warm: rnd() - 0.5,
    chip: rnd() < 0.3 ? { c: Math.floor(rnd() * 4), r: 0.006 + rnd() * 0.01 } : null,
  }));
  const base = rgb(P.base), warm = rgb(P.warm), cool = rgb(P.cool), mortar = rgb(P.mortar);
  const G = Math.round(P.period / 0.004);
  const out = alloc(S);
  for (let y = 0; y < S; y++) {
    const wy = (y + 0.5) * px;
    const j = Math.min(N - 1, Math.floor(wy / T)), ty = wy - j * T;
    for (let x = 0; x < S; x++) {
      const wx = (x + 0.5) * px;
      const i = Math.min(N - 1, Math.floor(wx / T)), tx = wx - i * T;
      const u = wx / P.period, v = wy / P.period;
      const tl = tiles[j * N + i];
      // 火色：大块的云雾 + 小一点的斑驳
      const cloud = fbm(n, u, v, 4, 4, 4), mott = fbm(n2, u, v, 24, 24, 3);
      let c = mix3(base, tl.warm > 0 ? warm : cool, Math.abs(tl.warm) * 0.55);
      c = mul(c, tl.tone * (1 + 0.09 * cloud + 0.03 * mott));
      // 走得多的地方（砖中间）蜡磨得更亮
      const cxT = tx / T - 0.5, cyT = ty / T - 0.5, center = 1 - Math.min(1, Math.hypot(cxT, cyT) * 1.6);
      let rough = 0.46 - 0.1 * center - 0.05 * cloud;
      c = mul(c, 1 + 0.03 * center);
      // 气孔
      const g = wp(u * G, v * G, G, G);
      let h = 0.5 + 0.08 * mott;
      if (g.id < 0.1) {
        const a = 1 - sstep(0.1, 0.24, g.f1);
        c = mul(c, 1 - 0.28 * a);
        h -= a * 0.5;
        rough += a * 0.2;
      }
      // 磕掉的角
      if (tl.chip) {
        const k = tl.chip.c, ex = k & 1 ? T - tx : tx, ey = k & 2 ? T - ty : ty;
        const d = ex + ey - tl.chip.r * (1 + 0.3 * n(wx * 400, wy * 400));
        if (d < 0) { const a = sstep(0, -0.002, d); c = mix3(c, mul(base, 0.72), a); h -= a * 0.8; rough = mix(rough, 0.85, a); }
      }
      // 砖边磨圆、砖缝
      const e = Math.min(tx, T - tx, ty, T - ty);
      const joint = 1 - sstep(P.joint / 2 - px * 0.5, P.joint / 2 + px * 0.5, e);
      const edge = 1 - sstep(P.joint / 2, P.joint / 2 + P.bevel, e);
      c = mix3(mul(c, 1 - edge * 0.14), mul(mortar, 1 + 0.08 * mott), joint);
      put(out, y * S + x, c, h - edge * 0.7 - joint * 0.9, mix(Math.min(0.95, rough + edge * 0.1), 0.9, joint));
    }
  }
  return out;
}
