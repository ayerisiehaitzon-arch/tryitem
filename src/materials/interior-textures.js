// 建筑构件和新家具用的程序化贴图：墙面乳胶漆、人字拼 / 宽板地板、水磨石、藤编。
//
// 地板是“可拼接模块”：模块 2m 见方，贴图的周期必须能整除 2m，相邻模块才能无缝接上
// （人字拼 1m、宽板 2m、水磨石 1m）。板子在贴图里是一块块“真实的板”：
// 先算出每个像素落在哪块板上、板内坐标是多少，再在板内坐标里画木纹 ——
// 所以每块板有自己的纹理走向、色差和年轮，板缝是按物理宽度画的倒角槽。
import { perlin, worley, mulberry } from './noise.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const rgb = (r, g, b) => [r / 255, g / 255, b / 255];
const fract = (x) => x - Math.floor(x);
const mod = (a, n) => ((a % n) + n) % n;

function alloc(S) {
  return { color: new Float32Array(S * S * 3), height: new Float32Array(S * S), rough: new Float32Array(S * S) };
}
function put(out, i, c, h, r) {
  out.color[i * 3] = c[0]; out.color[i * 3 + 1] = c[1]; out.color[i * 3 + 2] = c[2];
  out.height[i] = h;
  out.rough[i] = r;
}
// 不要求周期的 fBm（板内坐标用；perlin 本身的周期 4096 远大于用到的范围）
function fbm2(n, x, y, oct = 3, gain = 0.5) {
  let s = 0, a = 1, t = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f); t += a; a *= gain; f *= 2; }
  return s / t;
}

// ——————————————————————— 板内木纹 ———————————————————————
// 和家具的木纹（textures.js 的 wood）同一套画法，但坐标是板内的物理尺寸（米）：
//   a 沿纹理方向，b 横跨板宽。每块板有自己的年轮密度、相位、弦切“山纹”或径切直纹、色差。
function woodNoise(seed) {
  return { warp: perlin(seed), fib: perlin(seed + 11), pore: perlin(seed + 23), col: perlin(seed + 37) };
}
function plankParams(rnd, P, width) {
  return {
    ox: rnd() * 40, oy: rnd() * 40,
    rings: (width / P.ringSpacing) * (0.75 + 0.5 * rnd()), // 横跨整块板的年轮数
    phase: rnd() * 10,
    arch: rnd() < P.archChance ? 0.25 + 0.5 * rnd() : 0,
    archC: 0.2 + 0.6 * rnd(),
    archLen: P.archLen * (0.7 + 0.6 * rnd()),
    archPhase: rnd(),
    tint: 1 + (rnd() - 0.5) * P.plankTint,
    warm: (rnd() - 0.5) * P.plankWarm,
  };
}
function grain(a, b, width, pl, N, P) {
  const A = a + pl.ox, B = b + pl.oy;
  const w = b / width;
  const warp = (N.warp(A * 2.2, B * 18) * 0.7 + N.warp(A * 6.6, B * 54) * 0.3) * P.warp;
  let r;
  if (pl.arch > 0) {
    const d = w - pl.archC;
    const lift = pl.arch * (0.55 + 0.45 * Math.sin(2 * Math.PI * (a / pl.archLen + pl.archPhase)));
    r = Math.sqrt(d * d * 4 + lift * lift) * pl.rings + warp + pl.phase;
  } else {
    r = w * pl.rings + warp + pl.phase;
  }
  const t = fract(r);
  const late = sstep(0.55, 0.88, t) * (1 - sstep(0.9, 1.0, t));
  const fib = fbm2(N.fib, A * 6.7, B * 780, 3);
  const pn = N.pore(A * 100, B * 1780);
  const pore = sstep(0.25, 0.65, pn) * (1 - 0.7 * sstep(0.2, 0.5, t)) * P.pores;
  const cv = fbm2(N.col, A * 1.6, B * 1.6, 3);
  let c = mix3(P.early, P.late, late * P.lateMix);
  c = mix3(c, P.pore, pore * 0.55);
  const k = pl.tint * (1 + cv * P.colorVar + fib * P.fiberVar);
  c = [c[0] * k * (1 + pl.warm), c[1] * k, c[2] * k * (1 - pl.warm)];
  return { c, h: -pore * 1.0 - late * 0.25 + fib * 0.35, rough: P.rough + pore * 0.12 - late * 0.04 + fib * 0.03 };
}
// 板缝：四周一圈倒角槽（V 形），槽里略暗
function seam(a, b, len, width, P) {
  const d = Math.min(a, len - a, b, width - b);
  return 1 - sstep(0, P.groove, d);
}

// ——————————————————————— 人字拼 ———————————————————————
// 板 L × W（L = kW），45° 铺贴，箭头沿贴图 u 方向。转回“板轴对齐”的坐标系后，
// 横板 H 和竖板 V 各自排成一条条阶梯；两个格矢量是 (1,1)W 和 (-k,k)W。
// 贴图周期 P = √2·kW：平移一个周期正好是格矢量，所以同一个“键”的板在每个周期里完全一样 —— 可平铺。
function locateHerringbone(x, y, k) {
  const Y = Math.floor(y);
  const mH = Math.ceil((Y - x) / (2 * k));
  if (2 * mH * k < Y - x + k) {
    const j = Y - mH * k;
    return { o: 0, along: x - (j - mH * k), across: y - Y, key: mod(j, k) };
  }
  const X = Math.floor(x);
  const mV = Math.floor((y - X + 2 * k - 1) / (2 * k));
  const j = X - k + mV * k;
  return { o: 1, along: y - (j + 1 - k + mV * k), across: x - X, key: mod(j, k) };
}

export function herringbone(S, P) {
  const period = P.period, k = P.k;
  const W = period / (k * Math.SQRT2), L = k * W;
  const N = woodNoise(P.seed);
  const rnd = mulberry(P.seed + 5);
  const planks = [0, 1].map(() => Array.from({ length: k }, () => plankParams(rnd, P, W)));
  const out = alloc(S);
  for (let py = 0; py < S; py++) {
    const yp = ((py + 0.5) / S) * period;
    for (let px = 0; px < S; px++) {
      const xp = ((px + 0.5) / S) * period;
      const p = locateHerringbone((xp + yp) / Math.SQRT2 / W, (yp - xp) / Math.SQRT2 / W, k);
      const pl = planks[p.o][p.key];
      const a = p.along * W, b = p.across * W;
      const g = grain(a, b, W, pl, N, P);
      const sm = seam(a, b, L, W, P);
      const c = g.c.map((v) => v * (1 - P.seamDark * sm));
      put(out, py * S + px, c, g.h * P.grainRelief - sm, g.rough + sm * 0.08);
    }
  }
  return out;
}

// ——————————————————————— 宽板（错缝直铺）———————————————————————
// 贴图 = 2m × 2m，rows 行板；每行 1~2 条端缝，位置随机（按周期取模，所以端缝跨过贴图边缘也连得上）。
export function planks(S, P) {
  const period = P.period, rows = P.rows, W = period / rows;
  const N = woodNoise(P.seed);
  const rnd = mulberry(P.seed + 5);
  const rowDef = Array.from({ length: rows }, () => {
    const off = rnd() * period;
    const cuts = rnd() < P.twoPieceChance ? [0, (0.36 + 0.28 * rnd()) * period] : [0];
    const js = cuts.map((c) => mod(c + off, period)).sort((a, b) => a - b);
    return { js, planks: js.map(() => plankParams(rnd, P, W)) };
  });
  const out = alloc(S);
  for (let py = 0; py < S; py++) {
    const y = ((py + 0.5) / S) * period;
    const r = Math.min(rows - 1, Math.floor(y / W));
    const b = y - r * W;
    const { js, planks: pls } = rowDef[r];
    for (let px = 0; px < S; px++) {
      const x = ((px + 0.5) / S) * period;
      // 找到 x 所在的那一段（端缝之间），段起点按周期回绕
      let idx = js.length - 1;
      for (let i = 0; i < js.length; i++) if (x >= js[i]) idx = i;
      const start = js[idx], end = idx + 1 < js.length ? js[idx + 1] : js[0] + period;
      const a = mod(x - start, period), len = mod(end - start - 1e-9, period) + 1e-9;
      const g = grain(a, b, W, pls[idx], N, P);
      const sm = seam(a, b, len, W, P);
      const c = g.c.map((v) => v * (1 - P.seamDark * sm));
      put(out, py * S + px, c, g.h * P.grainRelief - sm, g.rough + sm * 0.08);
    }
  }
  return out;
}

// ——————————————————————— 水磨石 ———————————————————————
// 水泥基底 + 三种尺度的石子（Worley 格子收缩一圈 = 棱角分明的碎石），磨光后几乎是平的；
// 贴图边缘是一条 3mm 的黄铜分隔条（金属度贴图），1m 一格。
export function terrazzo(S, P) {
  const layers = P.layers.map((L, i) => ({ ...L, w: worley(P.seed + i * 7) }));
  const nM = perlin(P.seed + 50), nS = perlin(P.seed + 51), nC = perlin(P.seed + 52);
  const pits = worley(P.seed + 60);
  const out = alloc(S);
  out.metal = new Float32Array(S * S);
  const px1 = 1 / S; // 一个像素（贴图单位）
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const mott = fbm2(nM, u * 6, v * 6, 3);
      let c = P.matrix.map((m) => m * (1 + mott * 0.03 + nS(u * 700, v * 700, 700, 700) * 0.035));
      let h = 0, rough = P.roughMatrix;
      for (const L of layers) {
        const f = L.w(u * L.C, v * L.C, L.C, L.C);
        if (fract(f.id * 7.31) > L.fill) continue;
        // f2 - f1 ≈ 到格子边界距离的两倍（格子单位），收缩 gap 以后就是一粒碎石
        const e = (f.f2 - f.f1) * 0.5 - L.gap;
        const aa = px1 * L.C;
        const inside = sstep(-aa, aa, e);
        if (inside <= 0) continue;
        let pi = 0, acc = 0;
        while (pi < P.palette.length - 1 && f.id > (acc += P.palette[pi].p)) pi++;
        const chip = P.palette[pi].c;
        const vein = fbm2(nC, u * L.C * 3 + f.id * 50, v * L.C * 3, 2);
        const cc = chip.map((m) => m * (1 + vein * 0.06 + (fract(f.id * 13.7) - 0.5) * 0.08));
        c = mix3(c, cc, inside);
        h = mix(h, 0.3, inside);
        rough = mix(rough, P.roughChip, inside);
      }
      // 基底里零星的小气孔
      const pt = pits(u * 260, v * 260, 260, 260);
      if (fract(pt.id * 3.3) < 0.18) {
        const d = 1 - sstep(0.06, 0.12, pt.f1);
        c = c.map((m) => m * (1 - 0.35 * d));
        h -= d * 0.5;
      }
      // 黄铜分隔条：贴图四周各半条，相邻模块拼起来是一条完整的铜条
      const dEdge = Math.min(u, 1 - u, v, 1 - v) * P.period;
      const strip = 1 - sstep(P.strip / 2 - 0.0005, P.strip / 2 + 0.0005, dEdge);
      c = mix3(c, P.brass, strip);
      const i = y * S + x;
      put(out, i, c, h - strip * 0.2, mix(rough, 0.3, strip));
      out.metal[i] = strip;
    }
  }
  return out;
}

// ——————————————————————— 墙面乳胶漆 ———————————————————————
// 滚筒留下的细密“橘皮”颗粒 + 极淡的云状色差。贴图接近白色，墙色靠 baseColorFactor 染。
export function plaster(S, P) {
  const n1 = perlin(P.seed), n2 = perlin(P.seed + 1), n3 = perlin(P.seed + 2);
  const out = alloc(S);
  const F = P.stipple;
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      let st = 0, a = 1, t = 0;
      for (let o = 0, f = F; o < 3; o++, f *= 2) { st += a * n1(u * f, v * f, f, f); t += a; a *= 0.5; }
      st /= t;
      const fine = n2(u * F * 6, v * F * 6, F * 6, F * 6);
      const cloud = (n3(u * 3, v * 3, 3, 3) * 0.7 + n3(u * 7 + 11, v * 7, 7, 7) * 0.3);
      const k = 1 + cloud * P.cloud + st * 0.006;
      put(out, y * S + x, P.color.map((m) => m * k), st * 0.8 + fine * 0.2, 0.9 - st * 0.03);
    }
  }
  return out;
}

// ——————————————————————— 藤编（维也纳藤编）———————————————————————
// 竖向、横向各一对藤条，两个方向的斜藤从格子之间穿过，剩下的是八角形的孔。
// 孔直接画成柜子里的暗色（孔只有几毫米，视差可以忽略）—— 不用透明裁剪，没有过度绘制。
export function cane(S, P) {
  const C = P.cells;
  const nS = perlin(P.seed), nF = perlin(P.seed + 1);
  const out = alloc(S);
  const aa = (C / S) * 0.9; // 一个像素（格子单位）
  const cover = (d, w) => 1 - sstep(w - aa, w + aa, d);
  const prof = (d, w) => Math.sqrt(Math.max(0, 1 - (d / w) ** 2));
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S, gy = v * C;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, gx = u * C;
      const fx = fract(gx), fy = fract(gy);
      // 四组藤条到中心线的距离（格子单位）
      const dV = Math.min(fx, 1 - fx), dH = Math.min(fy, 1 - fy);
      const s1 = gx - gy - 0.5, s2 = gx + gy - 0.5;
      const d1 = Math.abs(s1 - Math.round(s1)) / Math.SQRT2, d2 = Math.abs(s2 - Math.round(s2)) / Math.SQRT2;
      // 叠放次序：斜藤在最上，其次横藤、竖藤；竖 / 横各是并排的两根（中间一道细缝，各自圆拱）
      const pairGap = (d, w) => cover(d, w) * (1 - 0.6 * (1 - sstep(0.006, 0.03, d)));
      const pairProf = (d, w) => prof(d - w / 2, w / 2);
      const strands = [
        { cov: cover(d1, P.diag), h: 1.0 * prof(d1, P.diag), id: Math.round(s1) * 3 + 1, along: gx + gy },
        { cov: cover(d2, P.diag), h: 0.95 * prof(d2, P.diag), id: Math.round(s2) * 3 + 2, along: gx - gy },
        { cov: pairGap(dH, P.pair), h: 0.7 * pairProf(dH, P.pair), id: Math.round(gy) * 3, along: gx },
        { cov: pairGap(dV, P.pair), h: 0.6 * pairProf(dV, P.pair), id: Math.round(gx) * 3 + 7, along: gy },
      ];
      let c = P.hole, h = -0.6, rough = 0.9, left = 1;
      let col = [0, 0, 0], hh = 0, rr = 0;
      for (const s of strands) {
        const w = s.cov * left;
        if (w <= 0) continue;
        const tone = 1 + nS(s.id * 0.37, s.along * 0.8, 4096, 4096) * P.tone + nF(s.along * 20, s.id * 1.3, 4096, 4096) * 0.05;
        const sc = P.strand.map((m) => m * tone * (0.8 + 0.2 * s.h));
        col = col.map((m, i) => m + sc[i] * w);
        hh += (0.2 + s.h * 0.5) * w;
        rr += (0.42 - s.h * 0.1) * w;
        left -= w;
      }
      c = c.map((m, i) => col[i] + m * left);
      h = hh + h * left;
      rough = rr + rough * left;
      put(out, y * S + x, c, h, rough);
    }
  }
  return out;
}

export const INTERIOR = {
  herringbone: (S) => herringbone(S, {
    seed: 301, period: 1, k: 7, ringSpacing: 0.0055, archChance: 0.3, archLen: 0.9,
    warp: 2.0, pores: 1, lateMix: 0.6, colorVar: 0.05, fiberVar: 0.035, plankTint: 0.12, plankWarm: 0.04,
    early: rgb(198, 170, 134), late: rgb(148, 116, 82), pore: rgb(122, 92, 62), rough: 0.5,
    groove: 0.0014, seamDark: 0.42, grainRelief: 0.28,
  }),
  planks: (S) => planks(S, {
    seed: 311, period: 2, rows: 10, twoPieceChance: 0.55, ringSpacing: 0.006, archChance: 0.6, archLen: 1.1,
    warp: 2.2, pores: 1, lateMix: 0.9, colorVar: 0.07, fiberVar: 0.06, plankTint: 0.14, plankWarm: 0.05,
    early: rgb(148, 116, 86), late: rgb(94, 68, 47), pore: rgb(76, 54, 38), rough: 0.55,
    groove: 0.0016, seamDark: 0.45, grainRelief: 0.3,
  }),
  terrazzo: (S) => terrazzo(S, {
    seed: 321, period: 1, strip: 0.003,
    matrix: rgb(229, 223, 212), brass: rgb(214, 176, 112), roughMatrix: 0.26, roughChip: 0.14,
    layers: [
      { C: 150, fill: 0.5, gap: 0.12 },
      { C: 55, fill: 0.42, gap: 0.1 },
      { C: 18, fill: 0.3, gap: 0.08 },
    ],
    // 以米白、暖灰为主，少量炭黑、赭红和灰绿点缀
    palette: [
      { p: 0.44, c: rgb(245, 241, 233) }, { p: 0.24, c: rgb(184, 178, 168) }, { p: 0.1, c: rgb(78, 77, 78) },
      { p: 0.13, c: rgb(182, 118, 88) }, { p: 0.09, c: rgb(146, 156, 138) },
    ],
  }),
  plaster: (S) => plaster(S, { seed: 331, stipple: 96, cloud: 0.012, color: rgb(242, 240, 236) }),
  cane: (S) => cane(S, {
    // 孔是正八边形：竖横藤对的内缘、斜藤的内缘到孔心都是 0.25 格
    seed: 341, cells: 8, pair: 0.25, diag: 0.104, tone: 0.08,
    strand: rgb(224, 192, 138), hole: rgb(58, 42, 28),
  }),
  zellige: (S) => zellige(S, {
    seed: 351, period: 0.5, tiles: 5, joint: 0.0022, bevel: 0.0028, depth: 1.4, wobble: 0.001,
    wave: 0.8, waveFreq: 38, tilt: 0.05, tone: 0.05, pool: 0.07, cloud: 0.03, hue: 0.035, edgeLight: 0.04, rimDark: 0.05,
    chipChance: 0.14, chipR: 0.005, roughGlaze: 0.08, pinholes: 0.0025,
    // 三窑釉色：暖白为主，少量冷白和奶油色（色相差得很小，主要是深浅）
    batches: [
      { p: 0.45, c: rgb(242, 240, 234) }, { p: 0.33, c: rgb(236, 237, 235) }, { p: 0.22, c: rgb(241, 236, 226) },
    ],
    grout: rgb(208, 204, 194), body: rgb(204, 162, 134),
  }),
  hexMosaic: (S) => hexMosaic(S, {
    seed: 361, period: 1, cols: 21, rows: 24, joint: 0.0018, bevel: 0.0012, depth: 1,
    tone: 0.06, cloud: 0.03, rough: 0.34, accent: 0.03,
    white: rgb(240, 239, 235), veinColor: rgb(150, 152, 156), grout: rgb(204, 202, 196),
    accentColor: rgb(58, 84, 72), accentVein: rgb(150, 172, 160),
  }),
};

// ——————————————————————— 手工釉面砖（Zellige）———————————————————————
// 10cm 见方的摩洛哥手工砖，贴图 50cm 见方 = 5 × 5 块。每块砖是“一块真的砖”：
//   · 砖的四边各自随机内缩：手工砖尺寸不齐，砖缝宽窄不匀；
//   · 釉色分几窑（暖白 / 冷白 / 奶油），每块砖再有自己的深浅；釉面起伏（积釉处颜色更深、更亮），
//     整块砖还略微歪一点 —— 反光一块一块跳，这是 zellige 最迷人的地方；
//   · 砖边圆起来落进缝里；少数砖崩了一个角，露出陶胎。
// 高度单位是毫米：法线强度 = 高度范围 / 像素尺寸，斜率就是真实的
export function zellige(S, P) {
  const N = P.tiles, T = P.period / N; // 每块砖的边长（米）
  const rnd = mulberry(P.seed);
  const nG = perlin(P.seed + 1), nC = perlin(P.seed + 2), nF = perlin(P.seed + 3), pins = worley(P.seed + 4);
  const tiles = Array.from({ length: N * N }, () => {
    let r = rnd(), batch = 0;
    while (batch < P.batches.length - 1 && r > P.batches[batch].p) r -= P.batches[batch++].p;
    return {
      inset: [0, 1, 2, 3].map(() => P.joint * (0.3 + 0.4 * rnd())), // 左 右 下 上
      glaze: P.batches[batch].c,
      tone: 1 + (rnd() - 0.5) * P.tone,
      ox: rnd() * 60, oy: rnd() * 60,
      tilt: [(rnd() - 0.5) * P.tilt, (rnd() - 0.5) * P.tilt],
      chip: rnd() < P.chipChance ? Math.floor(rnd() * 4) : -1,
      chipR: P.chipR * (0.6 + 0.8 * rnd()),
    };
  });
  const out = alloc(S);
  const px = P.period / S; // 一个像素（米）
  for (let py = 0; py < S; py++) {
    const y = ((py + 0.5) / S) * P.period;
    const j = Math.min(N - 1, Math.floor(y / T)), ly = y - j * T;
    for (let pxi = 0; pxi < S; pxi++) {
      const x = ((pxi + 0.5) / S) * P.period;
      const i = Math.min(N - 1, Math.floor(x / T)), lx = x - i * T;
      const t = tiles[j * N + i];
      const [eL, eR, eB, eT] = t.inset;
      // 手工切的砖边不是直线：每条边沿着边长方向有 ±0.4mm 的起伏
      const wob = (a, b) => fbm2(nF, a * 70 + t.ox, b + t.oy, 2) * P.wobble;
      const d = Math.min(lx - eL + wob(ly, 1), T - eR - lx + wob(ly, 2), ly - eB + wob(lx, 3), T - eT - ly + wob(lx, 4)); // 到砖边的距离（米），缝里为负
      const inside = sstep(-px, px, d);
      // 砖边：圆起来落进缝里（圆角半径 bevel）
      const e = clamp01(d / P.bevel);
      const edge = Math.sqrt(1 - (1 - e) * (1 - e));
      // 釉面起伏（毫米）+ 整块砖的倾斜
      const cx = lx - T / 2, cy = ly - T / 2;
      const wave = fbm2(nG, (lx + t.ox) * P.waveFreq, (ly + t.oy) * P.waveFreq, 3) * P.wave;
      const tilt = (t.tilt[0] * cx + t.tilt[1] * cy) * 1000; // 米 → 毫米
      let h = (edge - 1) * P.depth + (wave + tilt) * edge;
      // 积釉：低处釉层厚，颜色更深；釉在砖边堆起一圈（离边 2~8mm 略深），最边上一线釉薄、透出一点亮
      const pool = -wave / P.wave;
      const cloud = fbm2(nC, (lx + t.ox) * 18, (ly + t.oy) * 18, 3);
      const rim = sstep(0.0005, 0.003, d) * (1 - sstep(0.004, 0.011, d));
      const k = t.tone * (1 + pool * P.pool + cloud * P.cloud + (1 - edge) * P.edgeLight - rim * P.rimDark);
      let c = t.glaze.map((m) => m * k);
      // 釉色带一点冷暖漂移（同一块砖里也不是一个颜色）
      c = [c[0] * (1 + cloud * P.hue), c[1], c[2] * (1 - cloud * P.hue)];
      let rough = P.roughGlaze * (1 + 0.5 * fbm2(nF, lx * 90 + t.ox, ly * 90 + t.oy, 2)) + (1 - edge) * 0.05;
      // 釉面针孔：零星的小坑，坑里发暗
      const pin = pins(lx * 350 + t.ox, ly * 350 + t.oy, 4096, 4096);
      if (fract(pin.id * 5.7) < P.pinholes) {
        const m = 1 - sstep(0.12, 0.3, pin.f1);
        c = c.map((v) => v * (1 - 0.18 * m));
        h -= m * 0.25;
      }
      // 崩角：离某个角 chipR 以内露出陶胎
      if (t.chip >= 0) {
        const kx = t.chip & 1 ? T - eR : eL, ky = t.chip & 2 ? T - eT : eB;
        const dc = Math.hypot(lx - kx, ly - ky) + fbm2(nF, lx * 400, ly * 400, 2) * 0.0008;
        const m = 1 - sstep(t.chipR - px, t.chipR + px, dc);
        c = mix3(c, P.body, m);
        h -= m * 0.5;
        rough = mix(rough, 0.8, m);
      }
      // 砖缝：填缝剂比砖面低 depth
      const grout = P.grout.map((m) => m * (1 + fbm2(nF, x * 300, y * 300, 2) * 0.04));
      c = mix3(grout, c, inside);
      h = mix(-P.depth, h, inside);
      rough = mix(0.92, rough, inside);
      put(out, py * S + pxi, c, h, rough);
    }
  }
  return out;
}

// ——————————————————————— 六角马赛克（大理石）———————————————————————
// 尖顶六边形，对边约 4.8cm；贴图 1m 见方 = 21 列 × 24 行（周期整除 2m 模块，横向比正六边形窄 1%，看不出来）。
// 周期取 1m 而不是更小：深绿色的点缀砖是随机撒的，周期太短远看就成了一排排规则的点阵。
// 每个像素找最近的格点 —— 六边形格子的 Voronoi 单元就是六边形；到单元边界的距离 =
// 到各个相邻格点连线中垂线的距离取最小（(|p-c|² - |p-c₁|²) / 2|c-c₁|），砖缝和砖边的圆角都按这个距离画。
// 每块砖是一小块白色大理石：自己的底色深浅、一两道灰色细纹；少数砖是深绿色大理石的点缀。
export function hexMosaic(S, P) {
  const { cols, rows, period } = P; // rows 必须是偶数：奇数行错开半格，两行一个周期
  const w = period / cols, rh = period / rows;
  const rnd = mulberry(P.seed);
  const nV = perlin(P.seed + 1), nC = perlin(P.seed + 2), nF = perlin(P.seed + 3);
  const tiles = Array.from({ length: cols * rows }, () => {
    const accent = rnd() < P.accent;
    return {
      accent,
      tone: 1 + (rnd() - 0.5) * P.tone,
      warm: (rnd() - 0.5) * 0.02,
      ox: rnd() * 80, oy: rnd() * 80, rot: rnd() * Math.PI,
      vein: accent ? 0.5 + 0.5 * rnd() : rnd() < 0.55 ? 0.3 + 0.7 * rnd() : 0.08 * rnd(),
      rough: P.rough * (0.85 + 0.3 * rnd()),
    };
  });
  const out = alloc(S);
  const px = period / S;
  const cand = [];
  for (let py = 0; py < S; py++) {
    const y = ((py + 0.5) / S) * period;
    const j0 = Math.floor(y / rh - 0.5);
    for (let pxi = 0; pxi < S; pxi++) {
      const x = ((pxi + 0.5) / S) * period;
      // 候选格点：附近三行，每行附近三个
      cand.length = 0;
      let b = -1, bd = Infinity;
      for (let dj = -1; dj <= 2; dj++) {
        const j = j0 + dj, off = mod(j, 2) * (w / 2), cy = (j + 0.5) * rh;
        const i0 = Math.floor((x - off) / w);
        for (let di = -1; di <= 1; di++) {
          const cx = (i0 + di + 0.5) * w + off;
          const d2 = (x - cx) ** 2 + (y - cy) ** 2;
          cand.push([cx, cy, d2, i0 + di, j]);
          if (d2 < bd) { bd = d2; b = cand.length - 1; }
        }
      }
      const [cx, cy, , ci, cj] = cand[b];
      let e = Infinity;
      for (let k = 0; k < cand.length; k++) {
        if (k === b) continue;
        const c = cand[k], L = Math.hypot(c[0] - cx, c[1] - cy);
        e = Math.min(e, (c[2] - bd) / (2 * L));
      }
      e -= P.joint / 2; // 到砖边的距离（米），缝里为负
      const t = tiles[mod(cj, rows) * cols + mod(ci, cols)];
      const inside = sstep(-px, px, e);
      const edge = Math.sqrt(1 - (1 - clamp01(e / P.bevel)) ** 2);
      // 砖内坐标（每块砖旋转、平移到石材的不同位置）
      const lx = x - cx, ly = y - cy, cr = Math.cos(t.rot), sr = Math.sin(t.rot);
      const ux = (lx * cr - ly * sr) + t.ox, uy = (lx * sr + ly * cr) + t.oy;
      // 纹路：沿一个方向拉长的噪声等值线（石材的纹路有走向），两个倍频就够，不会碎成一圈圈
      const n = fbm2(nV, ux * 11, uy * 30, 2);
      const vein = Math.exp(-((n / 0.045) ** 2)) * t.vein;
      const cloud = fbm2(nC, ux * 9, uy * 9, 3);
      const base = t.accent ? P.accentColor : P.white;
      const vc = t.accent ? P.accentVein : P.veinColor;
      let c = mix3(base.map((m) => m * t.tone * (1 + cloud * P.cloud)), vc, vein * 0.6);
      c = [c[0] * (1 + t.warm), c[1], c[2] * (1 - t.warm)];
      let h = (edge - 1) * P.depth - vein * 0.05 + fbm2(nF, x * 400, y * 400, 2) * 0.02;
      let rough = t.rough + vein * 0.05;
      const grout = P.grout.map((m) => m * (1 + fbm2(nF, x * 300, y * 300, 2) * 0.05));
      c = mix3(grout, c, inside);
      h = mix(-P.depth, h, inside);
      rough = mix(0.9, rough, inside);
      put(out, py * S + pxi, c, h, rough);
    }
  }
  return out;
}
