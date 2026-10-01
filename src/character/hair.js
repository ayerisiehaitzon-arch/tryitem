import { quadNormals } from './subdiv.js';

// 头发 = 一层“发壳”+ 若干缕发束，全在头部局部坐标里生成，最后整体变换到头上。
//
// 发壳：一张按（方位角 θ，从头顶往下的弧长 u）参数化的网格。每一列（固定 θ）是一条竖着的轮廓线：
//   · 头皮段：从头顶沿着头皮往下走到发际线，每个点 = 头皮上的点 + 法线 × 发量（发型给出发量随位置的分布：
//     头顶蓬、两鬓薄、分缝处凹一道），发际线附近发量收到 1~2mm，发壳自然地“长”进皮肤里；
//   · 垂下段（波波头、长发、刘海）：过了发际线继续往下垂到发型给的长度，一路避开脸、耳朵、脖子、肩膀和后背。
//   发际线是一条按方位角光滑变化的曲线（额头、鬓角、绕过耳朵、后颈），不受头部网格行列的限制，边缘是干净的弧线。
// 发束：在发壳表面上长出来的一缕缕（截面是扁椭圆，根粗梢细），给发型加上梳理的纹路和层次，长发的发梢也是一缕缕的。

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const D2R = Math.PI / 180;
const at = (f, p) => f(p[0], p[1], p[2]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function grad(f, p) {
  const h = 2e-4;
  return [
    (f(p[0] + h, p[1], p[2]) - f(p[0] - h, p[1], p[2])) / (2 * h),
    (f(p[0], p[1] + h, p[2]) - f(p[0], p[1] - h, p[2])) / (2 * h),
    (f(p[0], p[1], p[2] + h) - f(p[0], p[1], p[2] - h)) / (2 * h),
  ];
}

// 发际线：方位角（度，0 正前方，取绝对值）→ 仰角（度）。额头、鬓角、耳朵上方绕过去、耳后往下到后颈
const LINE = [[0, 33], [25, 32], [45, 27], [62, 16], [74, 6], [84, 4], [92, 22], [104, 25], [116, 18], [130, -2], [150, -26], [180, -34]];
function hairline(th, low = 0) {
  const a = Math.abs(wrap(th)) / D2R;
  for (let i = 1; i < LINE.length; i++) {
    if (a <= LINE[i][0]) {
      const [a0, p0] = LINE[i - 1], [a1, p1] = LINE[i];
      const t = sstep(0, 1, (a - a0) / (a1 - a0));
      return (lerp(p0, p1, t) - low) * D2R;
    }
  }
  return (LINE[LINE.length - 1][1] - low) * D2R;
}

// —— 发型 ——
//   vol(th, ph)  发量（米）       hang(th)  发际线以下垂多长（米；0 = 短发）     bottom(th)  垂到的最低高度（局部 y）
//   locks(ctx)   发束             low       发际线整体往下挪几度（寸头贴得低一点）
const top = (ph) => sstep(15 * D2R, 75 * D2R, ph);
export const HAIRSTYLES = {
  none: { label: '光头' },
  buzz: { label: '寸头', vol: () => 0.0024, low: 3, rows: 12 },
  crop: {
    label: '短碎发', low: 1,
    vol: (th, ph) => 0.003 + 0.011 * top(ph) + 0.006 * gauss(wrap(th), 0.5) * sstep(25 * D2R, 50 * D2R, ph) * (1 - top(ph) * 0.5),
    locks: (ctx) => scatter(ctx, { n: 46, seed: 11, phMin: 28, len: [0.035, 0.055], w: [0.022, 0.03], t: 0.007,
      flow: (th, ph) => (Math.cos(th) > 0.55 && ph < 62 * D2R ? 'fwd' : 'down') }),
  },
  side: {
    label: '侧分',
    vol: (th, ph) => 0.004 + 0.013 * top(ph) + 0.004 * (Math.sin(th) < 0 ? 1 : 0) * top(ph) - 0.007 * gauss(wrap(th - 24 * D2R), 0.07) * sstep(35 * D2R, 50 * D2R, ph),
    locks: (ctx) => partLocks(ctx, { n: 40, seed: 21, part: 24 * D2R, len: [0.08, 0.13] }),
  },
  back: {
    label: '背头',
    vol: (th, ph) => 0.004 + 0.012 * top(ph) + 0.008 * gauss(wrap(th), 0.6) * sstep(28 * D2R, 55 * D2R, ph) * (1 - sstep(60 * D2R, 85 * D2R, ph)),
    locks: (ctx) => scatter(ctx, { n: 36, seed: 31, phMin: 30, len: [0.11, 0.16], w: [0.024, 0.032], t: 0.006, flow: () => 'back' }),
  },
  bob: {
    label: '波波头',
    vol: (th, ph) => 0.006 + 0.01 * top(ph) - 0.005 * gauss(wrap(th), 0.06) * sstep(40 * D2R, 55 * D2R, ph),
    // 两侧和后面垂到下颌，正面是齐眉的刘海
    hang: (th) => (Math.abs(wrap(th)) < 0.62 ? 0.03 : 0.14),
    bottom: (th) => (Math.abs(wrap(th)) < 0.62 ? 0.032 : -0.088),
    swell: 0.014,
    locks: (ctx) => hemLocks(ctx, { n: 34, seed: 41, gap: 0.62 }),
  },
  long: {
    label: '长直发',
    vol: (th, ph) => 0.006 + 0.009 * top(ph) - 0.005 * gauss(wrap(th), 0.06) * sstep(40 * D2R, 55 * D2R, ph),
    hang: (th) => (Math.abs(wrap(th)) < 0.5 ? 0 : 0.4),
    bottom: (th) => lerp(-0.2, -0.33, sstep(0.9, 2.2, Math.abs(wrap(th)))),
    swell: 0.01,
    locks: (ctx) => hemLocks(ctx, { n: 44, seed: 51 }),
  },
  pony: {
    label: '马尾',
    vol: (th, ph) => 0.003 + 0.004 * top(ph),
    locks: (ctx) => ponytail(ctx, { seed: 61 }),
  },
  bun: {
    label: '丸子头',
    vol: (th, ph) => 0.003 + 0.004 * top(ph),
    locks: (ctx) => bun(ctx),
  },
};

// —— 头皮上的点（沿方位角 th、仰角 ph 的射线落到头上）——
const CENTER = [0, 0.012, -0.012];
function scalp(ctx, th, ph) {
  const d = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)];
  const f = (t) => ctx.sdf(CENTER[0] + d[0] * t, CENTER[1] + d[1] * t, CENTER[2] + d[2] * t);
  let t = 0.16;
  while (t > 0 && f(t) > 0) t -= 0.004;
  let a = t, b = t + 0.004;
  for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
  const p = [CENTER[0] + d[0] * b, CENTER[1] + d[1] * b, CENTER[2] + d[2] * b];
  return { p, n: norm(grad(ctx.sdf, p)) };
}

// —— 发壳 ——
const COLS = 48;
function shell(ctx, style) {
  const rowsScalp = style.rows ?? 16;
  const hangOf = (th) => (style.hang ? style.hang(th) : 0);
  let hangMax = 0;
  for (let j = 0; j < COLS; j++) hangMax = Math.max(hangMax, hangOf((j / COLS) * Math.PI * 2));
  const rowsHang = hangMax > 0 ? Math.max(4, Math.round(hangMax / 0.016)) : 0;
  const R = rowsScalp + rowsHang;
  const P = [], UV = [], C = [];
  const low = style.low ?? 0;
  for (let j = 0; j <= COLS; j++) {
    const th = (j / COLS) * Math.PI * 2;
    const ph0 = hairline(th, low);
    const hang = hangOf(th);
    const col = [];
    // 头皮段：仰角从 89° 走到发际线；短发在靠近发际线时发量收得很薄
    for (let i = 0; i < rowsScalp; i++) {
      const t = i / (rowsScalp - 1);
      const ph = lerp(89 * D2R, ph0, t ** 0.85);
      const s = scalp(ctx, th, ph);
      const fade = hang > 0.005 ? 1 : lerp(1, 0.18, sstep(0.75, 1, t));
      const v = style.vol(th, ph) * fade;
      col.push({ p: add(s.p, mul(s.n, v)), ao: 0.55 + 0.45 * sstep(0, 0.012, v) });
    }
    // 垂下段：从发际线那一点开始往下，避开脸、耳朵、脖子、身体；不垂的列在原地重复（退化的面看不见）
    if (rowsHang) {
      const bottomY = style.bottom ? style.bottom(th) : -1;
      const p0 = col[col.length - 1].p;
      const start = p0[1];
      const total = Math.max(0, Math.min(hang, start - bottomY));
      // 水平方向：从头的竖轴指向发际线这一点
      const out = norm([p0[0], 0, p0[2] + 0.012]);
      const swell = style.swell ?? 0.01;
      for (let i = 1; i <= rowsHang; i++) {
        const t = i / rowsHang;
        const target = start - total * t;
        // 往下垂，中段略微鼓出来（发量），下摆往里收一点
        const bulge = swell * Math.sin(Math.PI * Math.min(1, t * 1.15)) - 0.004 * sstep(0.8, 1, t);
        let q = [p0[0] + out[0] * bulge, target, p0[2] + out[2] * bulge];
        if (total > 0) q = keepOut(ctx, q, 0.006 + 0.002 * t);
        col.push({ p: q, ao: lerp(0.8, 0.95, t) });
      }
    }
    col.forEach((c, i) => { P.push(c.p); UV.push([(j / COLS) * 6, i * 0.25]); C.push(c.ao); });
  }
  // 头顶：一圈扇形封口
  const n = (COLS + 1) * R;
  const topP = scalp(ctx, 0, 90 * D2R);
  P.push(add(topP.p, mul(topP.n, style.vol(0, 90 * D2R))));
  UV.push([0, 0]); C.push(1);
  const Q = [], T = [];
  for (let j = 0; j < COLS; j++) for (let i = 0; i < R - 1; i++) {
    const a = j * R + i, b = (j + 1) * R + i;
    Q.push(a, b, b + 1, a + 1);
  }
  for (let j = 0; j < COLS; j++) T.push(n, (j + 1) * R, j * R);
  return { P, UV, C, Q, T, R };
}

// 一个点：推到头（加余量）、耳朵、身体的外面
function keepOut(ctx, q, margin) {
  for (let k = 0; k < 4; k++) {
    for (const f of [ctx.sdf, ctx.ears, ctx.body]) {
      if (!f) continue;
      const e = at(f, q) - margin;
      if (e < 0) q = sub(q, mul(norm(grad(f, q)), e));
    }
  }
  return q;
}

// —— 发束 ——
// 贴着发壳长：每一步在（方位角、仰角）上走一小步，点落在发壳表面再往外一点
function growLock(ctx, style, c) {
  const m = c.seg ?? 9;
  let th = c.th, ph = c.ph;
  const pts = [];
  for (let i = 0; i <= m; i++) {
    const s = i / m;
    const sp = scalp(ctx, th, ph);
    let p = add(sp.p, mul(sp.n, style.vol(th, ph) + c.t * (0.15 + 0.25 * s)));
    if (ph < hairline(th, style.low ?? 0)) p = keepOut(ctx, p, 0.004 + c.t * 0.5);
    pts.push(p);
    const d = c.step(th, ph, s);
    th += d[0]; ph += d[1];
  }
  return pts;
}

const K = 6;
function lockMesh(ctx, c, pts, out) {
  const n = pts.length;
  const base = out.P.length;
  let Nprev = null;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const T = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    let N = norm(grad(ctx.sdf, pts[i]));
    if (Nprev) N = norm(add(mul(N, 0.5), mul(Nprev, 0.5)));
    N = norm(sub(N, mul(T, dot(N, T))));
    Nprev = N;
    const B = cross(T, N);
    const w = c.w * 0.5 * (1 - 0.85 * s ** 1.8) * (i === 0 ? 0.6 : 1);
    const t = c.t * 0.5 * (1 - 0.55 * s) * (i === 0 ? 0.4 : 1);
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2;
      // 截面：上面鼓、下面平（贴着发壳）
      const sa = Math.sin(a);
      const q = add(add(pts[i], mul(B, Math.cos(a) * w)), mul(N, sa > 0 ? sa * t : sa * t * 0.35));
      out.P.push(q);
      out.UV.push([k / K, s * c.len * 8]);
      out.C.push((0.78 + 0.22 * sstep(0, 0.4, s)) * c.tone * (sa > 0 ? 1 : 0.8));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < K; k++) {
    const a = base + i * K + k, b = base + i * K + ((k + 1) % K);
    out.Q.push(a, b, b + K, a + K);
  }
}

// 散落在头上、按一个流向梳的发束（短碎发、背头）
function scatter(ctx, o) {
  const r = rng(o.seed);
  const out = [];
  for (let i = 0; i < o.n; i++) {
    const th = (r() * 2 - 1) * Math.PI;
    const lo = Math.max(hairline(th) / D2R, o.phMin) + 6;
    const ph = lerp(lo, 84, Math.sqrt(r())) * D2R;
    const len = lerp(o.len[0], o.len[1], r());
    const kind = o.flow(th, ph);
    const da = (r() - 0.5) * 0.25;
    const ds = len / 8 / 0.1;
    out.push({ th, ph, len, w: lerp(o.w[0], o.w[1], r()), t: o.t, tone: 0.9 + 0.2 * r(), seg: 8,
      // 往前梳：仰角减小（朝额头）；往后梳：方位角朝后脑勺、仰角减小；其余往下
      step: (t) => {
        if (kind === 'fwd') return [da * ds, -0.5 * ds];
        if (kind === 'back') return [-Math.sign(wrap(t)) * 0.05 * ds + da * ds, (Math.cos(t) > 0 ? -0.35 : -0.55) * ds];
        return [da * ds, -0.6 * ds];
      } });
  }
  return out;
}

// 分缝两边各自往外梳（大部分梳到分缝的另一边）
function partLocks(ctx, o) {
  const r = rng(o.seed);
  const out = [];
  for (let i = 0; i < o.n; i++) {
    const side = r() < 0.62 ? -1 : 1;
    const th = o.part + side * (0.04 + r() * 0.3) + (r() - 0.5) * 0.1;
    const ph = lerp(42, 82, r()) * D2R;
    const len = lerp(o.len[0], o.len[1], r());
    const ds = len / 9 / 0.1;
    out.push({ th, ph, len, w: lerp(0.024, 0.032, r()), t: 0.0065, tone: 0.9 + 0.2 * r(), seg: 9,
      step: () => [side * 0.22 * ds, -0.42 * ds] });
  }
  return out;
}

// 垂下来的头发的发梢：贴着发壳的垂下段往下，超出下摆一点
function hemLocks(ctx, o) {
  const r = rng(o.seed);
  const out = [];
  for (let i = 0; i < o.n; i++) {
    const th = (i / o.n) * Math.PI * 2 + (r() - 0.5) * 0.12;
    if (Math.abs(wrap(th)) < (o.gap ?? 0.5)) continue;
    out.push({ th, len: 0.6, w: lerp(0.04, 0.055, r()), t: 0.005, tone: 0.9 + 0.2 * r(), hangLock: true, extra: lerp(0.008, 0.03, r()) });
  }
  return out;
}

// 马尾：发圈 + 垂下的一束
function ponytail(ctx, o) {
  const tie = scalp(ctx, Math.PI, 20 * D2R);
  const out = [];
  out.tie = { at: tie.p, n: tie.n, r: 0.013 };
  const r = rng(o.seed);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    out.push({ free: true, root: add(add(tie.p, mul(tie.n, 0.012)), [Math.cos(a) * 0.006, Math.sin(a) * 0.006, 0]), len: lerp(0.18, 0.24, r()), w: 0.03, t: 0.012, tone: 0.92 + 0.14 * r(), seg: 12,
      dir: (s) => norm([Math.cos(a) * 0.12, -0.35 - 1.2 * s, -0.75 + 0.6 * s]) });
  }
  return out;
}

// 丸子头：头顶偏后一个发髻（几圈绕起来的粗发束）
function bun(ctx) {
  const t = scalp(ctx, Math.PI, 66 * D2R);
  const out = [];
  out.bun = { at: add(t.p, mul(t.n, 0.026)), r: 0.03 };
  return out;
}

// —— 对外 ——
export function buildHair(body, id) {
  const style = HAIRSTYLES[id];
  if (!style || !style.vol) return null;
  return { id, style, topo: body.topo };
}

export function evalHair(h, target, targetN, head, L) {
  const { O, g, sdf, F } = head;
  const style = h.style;
  const ctx = { sdf, ears: earsSDF(F), body: bodySDF(L, O, g, h.topo && target ? stackSDF(h.topo, target, O, g) : null) };
  const sh = shell(ctx, style);
  const out = { P: [...sh.P], UV: [...sh.UV], C: [...sh.C], Q: [...sh.Q], T: [...sh.T] };
  const locks = style.locks ? style.locks(ctx) : [];
  for (const c of locks) {
    if (c.hangLock) lockMesh(ctx, c, hangLockPath(sh, c), out);
    else if (c.free) lockMesh(ctx, c, freePath(ctx, c), out);
    else lockMesh(ctx, c, growLock(ctx, style, c), out);
  }
  if (locks.tie) ring(locks.tie, out);
  if (locks.bun) bunMesh(locks.bun, out);
  return toMesh(out, O, g);
}

// 发梢：取发壳上最近的那一列，从中间往下，到下摆再多垂一点
function hangLockPath(sh, c) {
  const j = Math.round((((c.th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * COLS) % COLS;
  const col = sh.P.slice(j * sh.R, j * sh.R + sh.R);
  // 从头顶往下三分之一处开始，沿发壳外侧往下，过了下摆再多垂一点（长短不齐）
  const start = Math.floor(sh.R * 0.3);
  const pts = col.slice(start).map((p) => add(p, mul(norm([p[0], 0, p[2] + 0.012]), 0.0025)));
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const d = norm(sub(last, prev));
  pts.push(add(last, mul(d, c.extra)));
  // 太密的点稀疏一下（每段 1~2cm）
  return pts.filter((p, i) => i === 0 || i === pts.length - 1 || i % 2 === 0);
}
function freePath(ctx, c) {
  const pts = [c.root];
  let p = c.root;
  for (let i = 1; i <= c.seg; i++) {
    const s = i / c.seg;
    p = add(p, mul(c.dir(s), c.len / c.seg));
    p = keepOut(ctx, p, 0.008);
    pts.push(p);
  }
  return pts;
}
function ring({ at: c, n, r }, out) {
  const u = norm(cross(n, [0, 1, 0])), v = cross(n, u);
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push(add(add(c, mul(n, 0.006)), add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r))));
  }
  tube(pts, 0.0045, out, 0.35);
}
function bunMesh({ at: c, r }, out) {
  const rr = rng(77);
  for (let k = 0; k < 7; k++) {
    const tilt = (rr() - 0.5) * 1.1, rot = rr() * Math.PI * 2, rad = r * (0.45 + 0.5 * rr());
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rot;
      pts.push(add(c, [Math.cos(a) * rad, Math.sin(a) * rad * Math.sin(tilt) * 0.8, Math.sin(a) * rad * Math.cos(tilt)]));
    }
    tube(pts, 0.013, out, 0.95 + 0.1 * rr());
  }
}
function tube(pts, r, out, tone) {
  const base = out.P.length, n = pts.length;
  for (let i = 0; i < n; i++) {
    const T = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    const N = norm(cross(T, Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const B = cross(T, N);
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2;
      out.P.push(add(pts[i], add(mul(N, Math.cos(a) * r), mul(B, Math.sin(a) * r))));
      out.UV.push([k / K, i / (n - 1)]);
      out.C.push(tone);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < K; k++) {
    const a = base + i * K + k, b = base + i * K + ((k + 1) % K);
    out.Q.push(a, b, b + K, a + K);
  }
}

// 局部坐标 → 世界；四边形和头顶的三角形一起出索引
function toMesh(out, O, g) {
  const n = out.P.length;
  const P = new Float32Array(n * 3), UV = new Float32Array(n * 2), Cc = new Float32Array(n * 3);
  out.P.forEach((p, i) => { P[i * 3] = O[0] + p[0] * g; P[i * 3 + 1] = O[1] + p[1] * g; P[i * 3 + 2] = O[2] + p[2] * g; });
  out.UV.forEach((t, i) => { UV[i * 2] = t[0]; UV[i * 2 + 1] = t[1]; });
  out.C.forEach((c, i) => { Cc[i * 3] = c; Cc[i * 3 + 1] = c; Cc[i * 3 + 2] = c; });
  const Q = Int32Array.from(out.Q);
  const N = quadNormals(Q, P);
  const T = out.T;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
  const idx = new Uint32Array((Q.length / 4) * 6 + T.length);
  let k = 0;
  for (let q = 0; q < Q.length; q += 4) {
    idx[k++] = Q[q]; idx[k++] = Q[q + 1]; idx[k++] = Q[q + 2];
    idx[k++] = Q[q]; idx[k++] = Q[q + 2]; idx[k++] = Q[q + 3];
  }
  for (let t = 0; t < T.length; t++) idx[k++] = T[t];
  return { position: P, normal: N, uv: UV, color: Cc, index: idx };
}

// 耳朵（头部 SDF 里没有耳朵，长头发要从外面绕过去）
function earsSDF(F) {
  const s = F.ear.size;
  return (x, y, z) => {
    const ax = Math.abs(x) - 0.074, ay = y + 0.006, az = z + 0.012;
    const rx = 0.016 * s, ry = 0.033 * s, rz = 0.022 * s;
    const k0 = Math.hypot(ax / rx, ay / ry, az / rz);
    const k1 = Math.hypot(ax / (rx * rx), ay / (ry * ry), az / (rz * rz));
    return (k0 * (k0 - 1)) / (k1 || 1);
  };
}

// 头部局部坐标里的“身体”：脖子（胶囊）+ 上半身（椭球）+ 两个肩膀（胶囊）
function bodySDF(L, O, g, stack = null) {
  const loc = (y) => (y - O[1]) / g;
  const sw = L.shoulderW / g, cd = L.chestD / g, bd = L.backD / g, nr = L.neckR / g;
  const yN = loc(L.notch), yC = loc(L.notch - 0.14);
  const cap = (p, a, b, r) => {
    const ba = sub(b, a), pa = sub(p, a);
    const h = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
    return Math.hypot(...sub(pa, mul(ba, h))) - r;
  };
  return (x, y, z) => {
    const p = [x, y, z];
    let d;
    if (stack) d = stack(x, y, z);
    else {
      // 没有躯干截面时的近似：脖子一根胶囊、上身一个椭球（中心在锁骨窝下 14cm，上背到脖子根都还是厚的）
      d = cap(p, [0, yN - 0.02, -0.02 / g], [0, yN + 0.12, -0.02 / g], nr * 1.02);
      const ex = sw * 0.92, ey = 0.26 / g, ez = ((cd + bd) / 2) * 1.06, zc = (cd - bd) / 2;
      const k0 = Math.hypot(x / ex, (y - yC) / ey, (z - zc) / ez), k1 = Math.hypot(x / (ex * ex), (y - yC) / (ey * ey), (z - zc) / (ez * ez));
      d = Math.min(d, (k0 * (k0 - 1)) / (k1 || 1));
    }
    for (const s of [1, -1]) d = Math.min(d, cap(p, [s * 0.05 / g, yN + 0.01, -0.02 / g], [s * (sw - 0.03 / g), yN - 0.02, -0.01 / g], 0.048 / g));
    return d - 0.012 / g; // 衣服的厚度：头发搭在衣服外面
  };
}

// 按真实的躯干、脖子截面算的上身 SDF（头部局部坐标）：腰到脖子的每一圈控制点是一个多边形（胳膊洞那几个空位用左右邻点补上），
// 查询点所在的高度上，把上下两圈按高度插值成一个多边形，算水平面上的有符号距离；最上、最下两圈之外再加上竖直方向的距离
function stackSDF(topo, target, O, g) {
  const loc = (v) => [(target[v * 3] - O[0]) / g, (target[v * 3 + 1] - O[1]) / g, (target[v * 3 + 2] - O[2]) / g];
  const rings = [...topo.T.slice(3), ...topo.N].map((ring) => {
    const pts = ring.map((v) => (v >= 0 ? loc(v) : null));
    const n = pts.length;
    for (let k = 0; k < n; k++) {
      if (pts[k]) continue;
      let a = (k + n - 1) % n, b = (k + 1) % n;
      while (!pts[a]) a = (a + n - 1) % n;
      while (!pts[b]) b = (b + 1) % n;
      pts[k] = [(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2, (pts[a][2] + pts[b][2]) / 2];
    }
    return { y: pts.reduce((s2, q) => s2 + q[1], 0) / n, x: pts.map((q) => q[0]), z: pts.map((q) => q[2]) };
  }).sort((a, b) => a.y - b.y);
  const R = rings.length, n = rings[0].x.length;
  const px = new Float64Array(n), pz = new Float64Array(n);
  return (x, y, z) => {
    let i = 0;
    while (i < R - 2 && rings[i + 1].y < y) i++;
    const A = rings[i], B = rings[i + 1];
    const t = Math.min(1, Math.max(0, (y - A.y) / (B.y - A.y)));
    for (let k = 0; k < n; k++) { px[k] = A.x[k] + (B.x[k] - A.x[k]) * t; pz[k] = A.z[k] + (B.z[k] - A.z[k]) * t; }
    let dm = Infinity, inside = false;
    for (let k = 0, m = n - 1; k < n; m = k++) {
      const ax = px[m], az = pz[m], bx = px[k], bz = pz[k];
      const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
      const h = Math.min(1, Math.max(0, (wx * ex + wz * ez) / (ex * ex + ez * ez || 1)));
      const dx = wx - ex * h, dz = wz - ez * h, dd = dx * dx + dz * dz;
      if (dd < dm) dm = dd;
      if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    }
    let d = inside ? -Math.sqrt(dm) : Math.sqrt(dm);
    const below = rings[0].y - y, above = y - rings[R - 1].y;
    if (below > 0) d = d > 0 ? Math.hypot(d, below) : Math.max(d, below);
    if (above > 0) d = d > 0 ? Math.hypot(d, above) : Math.max(d, above);
    return d;
  };
}
