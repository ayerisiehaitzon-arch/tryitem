// 车削器物（花瓶、花盆）的“设计轮廓”。几何构建和釉面贴图共用这一份数据：
//   · 轮廓是拐角 + 向心 Catmull-Rom 样条（不会打结、不会过冲），先高精度采样，得到真实弧长、法线、曲率；
//   · 每个 LOD 再按转角自适应取点，法线取曲线的真实法线 —— 低 LOD 的剪影变粗，明暗依然圆润；
//   · 贴图的 v 就是高精度弧长 / 总长，各级 LOD 的贴图完全对齐；
//   · 贴图生成器按同一条曲线知道每一行像素对应的高度、半径、凹凸（曲率），
//     釉在凸棱处变薄发色、在凹处积釉变深、底足露胎……都能画在正确的位置上。
//
// knots: [[r, y, opts?], ...]，自下而上沿外表面走，翻过口沿再沿内壁往下（外法线在行进方向右侧）。
// opts: { c: 1 } 拐角（法线在此断开）；{ zone: 'in' } 从这个点起换一个 AO 图块（外壁 / 内壁）

const ALPHA = 0.5; // 向心参数化

function crPoint(P0, P1, P2, P3, u) {
  const d = (a, b) => Math.max(1e-9, Math.hypot(b[0] - a[0], b[1] - a[1]) ** ALPHA);
  const t0 = 0, t1 = t0 + d(P0, P1), t2 = t1 + d(P1, P2), t3 = t2 + d(P2, P3);
  const t = t1 + (t2 - t1) * u;
  const L = (A, B, ta, tb) => [((tb - t) * A[0] + (t - ta) * B[0]) / (tb - ta), ((tb - t) * A[1] + (t - ta) * B[1]) / (tb - ta)];
  const A1 = L(P0, P1, t0, t1), A2 = L(P1, P2, t1, t2), A3 = L(P2, P3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

export function curve(knots, res = 48) {
  const K = knots.map(([r, y, o = {}]) => ({ p: [r, y], c: !!o.c, zone: o.zone ?? null }));
  // 按拐角切成若干条光滑段
  const spans = [];
  let a = 0;
  for (let i = 1; i < K.length; i++) if (K[i].c || i === K.length - 1) { spans.push([a, i]); a = i; }
  const runs = [];
  let zone = K[0].zone ?? 'out';
  let s = 0;
  for (const [i0, i1] of spans) {
    const P = K.slice(i0, i1 + 1).map((k) => k.p);
    const m = P.length - 1;
    const at = (i) => (i < 0 ? [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]] : i > m ? [2 * P[m][0] - P[m - 1][0], 2 * P[m][1] - P[m - 1][1]] : P[i]);
    const pts = [];
    for (let i = 0; i < m; i++) {
      const zi = K[i0 + i].zone;
      for (let q = 0; q < res; q++) {
        const p = q === 0 ? P[i] : crPoint(at(i - 1), at(i), at(i + 1), at(i + 2), q / res);
        pts.push({ p, knot: q === 0 ? i0 + i : null, zoneStart: q === 0 && i > 0 && zi ? zi : null });
      }
    }
    pts.push({ p: P[m], knot: i1, zoneStart: null });
    // 弧长、切线、法线、曲率（只在这条光滑段内差分）
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) s += Math.hypot(pts[i].p[0] - pts[i - 1].p[0], pts[i].p[1] - pts[i - 1].p[1]);
      pts[i].s = s;
    }
    for (let i = 0; i < pts.length; i++) {
      const A = pts[Math.max(0, i - 1)].p, B = pts[Math.min(pts.length - 1, i + 1)].p;
      const l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      pts[i].t = [(B[0] - A[0]) / l, (B[1] - A[1]) / l];
      pts[i].n = [pts[i].t[1], -pts[i].t[0]];
      pts[i].th = Math.atan2(pts[i].t[1], pts[i].t[0]);
    }
    for (let i = 0; i < pts.length; i++) {
      const A = pts[Math.max(0, i - 1)], B = pts[Math.min(pts.length - 1, i + 1)];
      let d = B.th - A.th;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      pts[i].k = d / Math.max(1e-9, B.s - A.s); // >0 凸，<0 凹
    }
    // 分区（外壁 / 内壁……）；拐角处开始的新分区直接从这条光滑段的第一个点算起
    if (K[i0].zone && i0 > 0) zone = K[i0].zone;
    for (const q of pts) {
      q.prevZone = zone;
      if (q.zoneStart) zone = q.zoneStart;
      q.zone = zone;
    }
    runs.push(pts);
  }
  const length = s;
  const zones = {};
  const grow = (name, q) => {
    const z = (zones[name] ??= { s0: q.s, s1: q.s, rmax: 0 });
    z.s0 = Math.min(z.s0, q.s); z.s1 = Math.max(z.s1, q.s); z.rmax = Math.max(z.rmax, q.p[0]);
  };
  for (const run of runs) for (const q of run) {
    grow(q.zone, q);
    if (q.zoneStart) grow(q.prevZone, q); // 边界上的环同时属于两个分区
  }
  const flat = runs.flat();
  const height = Math.max(...flat.map((q) => q.p[1]));
  return { runs, flat, length, zones, height };
}

// 每个 LOD 的取点：贪心折线简化 —— 弦到曲线的偏差不超过 tol（剪影误差，和圆周分段的误差同一量级），
// 相邻两点法线夹角不超过 maxAngle（保证明暗插值平顺）。拐角和分区边界处同一位置出两个环（法线 / 图块不同）。
export function sampleCurve(cv, { tol = 0.001, maxAngle = 0.6, maxLen = 0.08 } = {}) {
  const out = [];
  const emit = (q, zone = q.zone) => out.push({ p: q.p, n: q.n, s: q.s, v: q.s / cv.length, zone });
  const dev = (run, i, j) => {
    const A = run[i].p, B = run[j].p;
    const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1e-12;
    let m = 0;
    for (let q = i + 1; q < j; q++) m = Math.max(m, Math.abs((run[q].p[0] - A[0]) * dy - (run[q].p[1] - A[1]) * dx) / l);
    return m;
  };
  const turn = (a, b) => { let d = Math.abs(a.th - b.th); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
  for (const run of cv.runs) {
    emit(run[0]);
    let i = 0;
    while (i < run.length - 1) {
      let j = i + 1;
      // 尽量往前走，直到下一个点会超差，或者碰到分区边界
      while (j < run.length - 1 && !run[j].zoneStart) {
        const c = j + 1;
        if (dev(run, i, c) > tol || turn(run[i], run[c]) > maxAngle || run[c].s - run[i].s > maxLen) break;
        j = c;
      }
      const q = run[j];
      if (q.zoneStart) emit(q, q.prevZone); // 分区边界：旧图块收尾
      emit(q);
      i = j;
    }
  }
  return out;
}

// 按归一化弧长查询曲线（贴图生成器用）
export function curveAt(cv, v) {
  const s = Math.min(1, Math.max(0, v)) * cv.length, F = cv.flat;
  let lo = 0, hi = F.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].s <= s) lo = mid; else hi = mid; }
  const A = F[lo], B = F[hi];
  const t = B.s > A.s ? (s - A.s) / (B.s - A.s) : 0;
  return {
    r: A.p[0] + (B.p[0] - A.p[0]) * t, y: A.p[1] + (B.p[1] - A.p[1]) * t,
    n: [A.n[0] + (B.n[0] - A.n[0]) * t, A.n[1] + (B.n[1] - A.n[1]) * t],
    k: A.k + (B.k - A.k) * t, zone: t < 0.5 ? A.zone : B.zone, s,
  };
}

// —— 器型 ——（单位：米）
export const VESSELS = {
  // 细颈瓶：饱满的腹部收成细长颈，口沿微微外撇
  bottle: [
    [0.0400, 0.0000, { c: 1 }], [0.0438, 0.0040], [0.0490, 0.0160], [0.0590, 0.0450], [0.0680, 0.0900],
    [0.0718, 0.1300], [0.0690, 0.1680], [0.0590, 0.2000], [0.0420, 0.2280], [0.0270, 0.2520],
    [0.0200, 0.2720], [0.0182, 0.2920], [0.0190, 0.3080], [0.0215, 0.3180], [0.0228, 0.3225],
    [0.0200, 0.3255, { zone: 'in' }], [0.0168, 0.3225], [0.0156, 0.3140], [0.0150, 0.3000],
    [0.0148, 0.2700, { c: 1 }], [0.0000, 0.2700],
  ],
  // 圆罐（月亮瓶）：接近球形的腹部，短颈
  moon: [
    [0.0580, 0.0000, { c: 1 }], [0.0625, 0.0040], [0.0700, 0.0120], [0.0860, 0.0300], [0.1010, 0.0600],
    [0.1090, 0.0920], [0.1100, 0.1080], [0.1060, 0.1320], [0.0940, 0.1580], [0.0740, 0.1810],
    [0.0520, 0.1970], [0.0410, 0.2030], [0.0372, 0.2080], [0.0368, 0.2140], [0.0385, 0.2195],
    [0.0360, 0.2225, { zone: 'in' }], [0.0328, 0.2200], [0.0318, 0.2120],
    [0.0318, 0.1200, { c: 1 }], [0.0000, 0.1200],
  ],
  // 小花瓶：直筒身、圆肩、小口带一圈唇
  bud: [
    [0.0365, 0.0000, { c: 1 }], [0.0398, 0.0030], [0.0412, 0.0100], [0.0418, 0.0400], [0.0414, 0.0800],
    [0.0400, 0.1120], [0.0372, 0.1340], [0.0320, 0.1460], [0.0240, 0.1515], [0.0170, 0.1535],
    [0.0138, 0.1555], [0.0132, 0.1595], [0.0118, 0.1612, { zone: 'in' }], [0.0100, 0.1595],
    [0.0094, 0.1540], [0.0094, 0.1300, { c: 1 }], [0.0000, 0.1300],
  ],
  // 花盆（参考尺寸，按植物缩放）：微收的盆身 + 一圈圆润的厚口沿，内壁只做到土面以下
  planter: [
    [0.1080, 0.0000, { c: 1 }], [0.1125, 0.0060], [0.1155, 0.0200], [0.1270, 0.1200], [0.1380, 0.2150],
    [0.1420, 0.2400], [0.1470, 0.2465], [0.1478, 0.2545], [0.1452, 0.2598],
    [0.1400, 0.2612, { zone: 'in' }], [0.1350, 0.2590], [0.1330, 0.2530], [0.1320, 0.2400], [0.1300, 0.2120],
  ],
};

const cache = new Map();
export function vessel(name) {
  if (!cache.has(name)) cache.set(name, curve(VESSELS[name]));
  return cache.get(name);
}
