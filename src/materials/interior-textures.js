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
};
